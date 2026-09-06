#!/usr/bin/env node
// The release rehearsal: every proof a Quick Charts release needs, run in order from a clean
// checkout, with nothing published. It writes a dossier a person signs, not a version anyone can
// install.
//
//   node scripts/release-rehearsal.mjs           the whole rehearsal, browser suite included
//   node scripts/release-rehearsal.mjs --fast    the same with `pnpm gate --fast`; the dossier
//                                                reads PARTIAL, never PASS
//   node scripts/release-rehearsal.mjs --only=a,b   just these stages, for repairing one; PARTIAL
//
// Stages, in order, stopping at the first failure:
//
//   checkout      the working tree is clean and the commit is recorded
//   install       `pnpm install --frozen-lockfile`
//   gate          `node scripts/gate.mjs`: candidate build, typecheck, tests, the package, i18n,
//                 plan-index, dead-code, retired-surface, supply-chain and docs checks, then the
//                 browser suite (the port it boots on must be free first)
//   pack          the deterministic pack, re-run on its own, compared file for file and by tar
//                 stream hash with the committed pin
//   clean-room    `node clean-room/run.mjs`: the TypeScript, JavaScript and Vite consumers and
//                 the conformance host install the packed candidate
//   supply-chain  `pnpm check:supply-chain` over the tree, the packed list and the history
//   notices       the committed THIRD-PARTY-NOTICES.md equals its rendering
//   npm-pack      `npm pack --dry-run` lists the same paths the candidate manifest names
//   install-test  a scratch project outside this repository installs the tarball with npm and
//                 scripts disabled, then proves the export map, the stylesheet, the drawings and
//                 REST subpaths, an import with no window or document, the shipped declarations
//                 with skipLibCheck off, the installed dependency closure, and that a bundler
//                 drops the widget from a build that imports one helper
//
// Every stage's output goes to `packages/chart/.release/<version>/logs/`, the artifact and its
// manifest to `artifact/`, a SHA-256 of every dossier file to `hashes.json`, and the verdict per
// gate to `SUMMARY.md`. The folder is git-ignored and rewritten on every run.
//
// What it refuses: it exits 2 before doing anything when the environment or an npmrc carries a
// registry credential, because a rehearsal that could publish is not a rehearsal. It runs no
// `npm publish`, no `git push`, and no registry write; the only registry reads are the peer
// dependency the clean room and the scratch project install.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const chartDir = join(repo, 'packages', 'chart')

/** The browser suite boots Vite here; a second listener on it makes the suite fail for a reason
 *  that has nothing to do with the code. */
export const E2E_PORT = 5199

/** The public subpaths of the artifact. The install test holds the installed manifest to exactly
 *  these keys. */
export const PUBLIC_ENTRIES = ['.', './drawings', './adapters/rest', './styles.css']

/** The gates only the owner closes. The summary lists each one as `owner`, never as a pass. */
export const OWNER_GATES = [
  'License text applied to the artifact after counsel review',
  'Repository visibility of quick-charts',
  'Registry ownership of the quickcharts name, with two-factor authentication on every publishing account',
  'Website address of the chart manual',
  'Publication: the explicit instruction to publish the first version',
]

// ── credentials ──────────────────────────────────────────────────────────────────────────────────

/** Environment keys that carry a registry credential. The npm config keys are matched by suffix,
 *  so a scoped `npm_config_//host/:_authtoken` is caught like the bare `NPM_TOKEN`. */
const CREDENTIAL_ENV = /^(NPM_TOKEN|NODE_AUTH_TOKEN|NPM_AUTH_TOKEN|NPM_PASSWORD|NPM_OTP|npm_config_.*(_auth|_authtoken|password|otp)|VERDACCIO_.*(TOKEN|PASSWORD).*)$/i
/** An npmrc line that authenticates: `_authToken`, `_auth`, `_password` or `username` on any registry key. */
const CREDENTIAL_NPMRC = /^\s*[^#;]*?(:_authToken|:_auth|:_password|:username|^_auth|^_authToken)\s*=/i

/** Every credential the environment and the npmrc files carry, named without their values. */
export function credentialFindings(env, npmrcTexts) {
  const out = []
  for (const key of Object.keys(env).sort()) if (CREDENTIAL_ENV.test(key) && env[key] !== '') out.push(`environment variable ${key}`)
  for (const [file, text] of Object.entries(npmrcTexts)) {
    text.split(/\r?\n/).forEach((line, i) => {
      if (CREDENTIAL_NPMRC.test(line)) out.push(`${file}:${i + 1} sets a registry credential`)
    })
  }
  return out
}

/** The npmrc files npm reads for this checkout, as { path: text }, missing files omitted. */
function npmrcFiles(env) {
  const candidates = [env.NPM_CONFIG_USERCONFIG, join(homedir(), '.npmrc'), join(repo, '.npmrc'), join(chartDir, '.npmrc')].filter(Boolean)
  const out = {}
  for (const file of candidates) if (existsSync(file)) out[file] = readFileSync(file, 'utf8')
  return out
}

// ── comparisons ──────────────────────────────────────────────────────────────────────────────────

/** Two sorted path lists side by side: what only npm would pack, what only the candidate names. */
export function compareFileLists(npmFiles, manifestFiles) {
  const npm = new Set(npmFiles)
  const manifest = new Set(manifestFiles)
  return {
    onlyNpm: [...npm].filter((f) => !manifest.has(f)).sort(),
    onlyManifest: [...manifest].filter((f) => !npm.has(f)).sort(),
  }
}

/** The candidate manifest against the committed pin: files added, missing or changed, and the tar
 *  stream hash. */
export function comparePin(candidate, pin) {
  const drift = []
  for (const path of Object.keys(pin.files)) {
    if (!candidate.files[path]) drift.push(`missing ${path}`)
    else if (candidate.files[path].sha256 !== pin.files[path]) drift.push(`changed ${path}`)
  }
  for (const path of Object.keys(candidate.files)) if (!pin.files[path]) drift.push(`added ${path}`)
  if (candidate.tarball.tarSha256 !== pin.tarSha256) drift.push('tar stream hash differs')
  return drift
}

// ── the summary ──────────────────────────────────────────────────────────────────────────────────

/** The one page a person reads: verdict, candidate, gates, artifact hashes, owner gates. Paths are
 *  relative to the dossier folder so the page names no machine. */
export function renderSummary({ result, version, commit, branch, date, fast, stages, artifact, ownerGates }) {
  const lines = []
  lines.push('# Quick Charts release rehearsal', '')
  lines.push(`Result: **${result}**`, '')
  if (result === 'PARTIAL') lines.push(`${fast ? 'The gate ran without the browser suite (`--fast`)' : 'Only some stages ran (`--only`)'}. A partial rehearsal is not a release rehearsal.`, '')
  lines.push(`Candidate: \`quickcharts\` ${version}, commit \`${commit}\` on \`${branch}\`, ${date}.`, '')
  lines.push('Published: nothing. This rehearsal ran no publish, no registry write and no push.', '')
  lines.push('## Gates', '', '| Gate | Result | Duration | Log |', '|---|---|---|---|')
  for (const s of stages) {
    const duration = s.secs === null ? '' : `${s.secs}s`
    const log = s.log ? `\`${s.log}\`` : ''
    lines.push(`| ${s.id} | ${s.result} | ${duration} | ${log} |`)
  }
  lines.push('')
  if (artifact) {
    lines.push('## Artifact', '')
    lines.push(`- Tarball \`${artifact.name}\`, ${artifact.bytes} bytes, SHA-256 \`${artifact.sha256}\`.`)
    lines.push(`- Tar stream SHA-256 \`${artifact.tarSha256}\`; the committed pin ${artifact.pinMatches ? 'matches' : 'does not match'}.`)
    lines.push(`- ${artifact.files} files, each with its SHA-256 in \`artifact/manifest.json\`.`)
    if (artifact.npmPack) lines.push(`- \`npm pack --dry-run\` ${artifact.npmPack}.`)
    if (artifact.installTest) lines.push(`- Install test: ${artifact.installTest}.`)
    lines.push('')
  }
  lines.push('## Owner gates', '', 'These are not run by this script and are never marked passed here.', '', '| Gate | Status |', '|---|---|')
  for (const gate of ownerGates) lines.push(`| ${gate} | owner |`)
  lines.push('')
  lines.push(result === 'PARTIAL' ? 'Run the whole rehearsal before this page goes into a dossier.' : 'Every SHA-256 of every file in this folder is in `hashes.json`.')
  return `${lines.join('\n')}\n`
}

// ── running ──────────────────────────────────────────────────────────────────────────────────────

/** A directory's files as posix paths relative to it, sorted. */
export function walkFiles(dir, prefix = '', out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(abs).isDirectory()) walkFiles(abs, rel, out)
    else out.push(rel)
  }
  return out
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

/** Run one command, streaming its output to the console and to a log file, and answer its exit
 *  status with the output (both streams) and the stdout alone. On Windows pnpm and npm are .cmd
 *  shims, so the shell is used there; every argument is a static, space-free string or a path
 *  quoted by `q`. */
function run(argv, { cwd, log, env }) {
  return new Promise((done) => {
    const chunks = []
    const out = []
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--max-old-space-size=8192', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    })
    const tap = (stream, target, own) =>
      stream.on('data', (chunk) => {
        chunks.push(chunk)
        own?.push(chunk)
        target.write(chunk)
      })
    tap(child.stdout, process.stdout, out)
    tap(child.stderr, process.stderr)
    child.on('error', (e) => {
      chunks.push(Buffer.from(`\n${e.message}\n`))
      writeFileSync(log, Buffer.concat(chunks))
      done({ status: null, output: Buffer.concat(chunks).toString('utf8'), stdout: Buffer.concat(out).toString('utf8') })
    })
    child.on('close', (status) => {
      writeFileSync(log, Buffer.concat(chunks))
      done({ status, output: Buffer.concat(chunks).toString('utf8'), stdout: Buffer.concat(out).toString('utf8') })
    })
  })
}

/** Resolve when nothing listens on the port, checking every fifteen seconds for up to the limit. */
async function waitForFreePort(port, limitMs, note) {
  const started = Date.now()
  for (;;) {
    const free = await new Promise((answer) => {
      const server = createServer()
      server.once('error', () => answer(false))
      server.listen(port, '127.0.0.1', () => server.close(() => answer(true)))
    })
    if (free) return true
    if (Date.now() - started > limitMs) return false
    note(`port ${port} is in use; waiting`)
    await new Promise((r) => setTimeout(r, 15_000))
  }
}

/** A path as one argument: quoted with forward slashes where the shell is in the way (Windows),
 *  verbatim where spawn hands it over untouched. */
const q = (path) => (process.platform === 'win32' ? `"${path.replace(/\\/g, '/')}"` : path)

// ── the install test ─────────────────────────────────────────────────────────────────────────────

/** The probe the scratch project runs: plain Node, no window, no document, the installed package
 *  reached only by its name, the candidate manifest and the entry list read from files copied
 *  beside it. It prints one JSON line of named checks. */
const PROBE = String.raw`
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
const entries = JSON.parse(readFileSync('entries.json', 'utf8'))
const checks = []
const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail })

check('no-dom', typeof globalThis.window === 'undefined' && typeof globalThis.document === 'undefined', 'the probe runs with no window and no document')

const installed = join(process.cwd(), 'node_modules', 'quickcharts')
const pkg = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
check('exports-keys', JSON.stringify(Object.keys(pkg.exports ?? {}).sort()) === JSON.stringify([...entries].sort()), 'the export map names exactly the public entries: ' + Object.keys(pkg.exports ?? {}).join(', '))
const targets = Object.values(pkg.exports ?? {}).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)))
check('exports-targets', targets.length > 0 && targets.every((t) => existsSync(join(installed, t))), 'every export target is an installed file: ' + targets.join(', '))
check('no-dependencies', !pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'the manifest lists no dependencies')
check('peer', JSON.stringify(Object.keys(pkg.peerDependencies ?? {})) === JSON.stringify(['lightweight-charts']), 'the one peer is lightweight-charts')
check('no-scripts', !pkg.scripts || !('postinstall' in pkg.scripts || 'preinstall' in pkg.scripts || 'install' in pkg.scripts), 'no install script')

const walk = (dir, prefix = '', out = []) => {
  for (const name of readdirSync(dir).sort()) {
    const rel = prefix ? prefix + '/' + name : name
    if (statSync(join(dir, name)).isDirectory()) walk(join(dir, name), rel, out)
    else out.push(rel)
  }
  return out
}
const files = walk(installed)
const expected = Object.keys(manifest.files).sort()
check('installed-files', JSON.stringify(files) === JSON.stringify(expected), files.length + ' installed files; the manifest names ' + expected.length)
const mismatched = expected.filter((f) => manifest.files[f] && existsSync(join(installed, f)) && createHash('sha256').update(readFileSync(join(installed, f))).digest('hex') !== manifest.files[f].sha256)
check('installed-hashes', mismatched.length === 0, mismatched.length ? 'differ from the manifest: ' + mismatched.join(', ') : 'every installed file hashes as the manifest says')

const root = await import('quickcharts')
check('root-entry', typeof root.createChart === 'function' && typeof root.createPriceFormatter === 'function', 'createChart and createPriceFormatter are functions')
const drawings = await import('quickcharts/drawings')
const toolCount = typeof drawings.drawingTools?.all === 'function' ? drawings.drawingTools.all().length : -1
check('drawings-entry', toolCount >= 90 && typeof drawings.parseDrawingsStore === 'function', 'the drawings catalog holds ' + toolCount + ' tools')
const rest = await import('quickcharts/adapters/rest')
check('rest-entry', typeof rest.createRestSaveLoadAdapter === 'function' && typeof rest.RestSaveLoadError === 'function', 'the REST adapter constructor and error class are exported')

let requestsAtConstruction = 0
const counting = rest.createRestSaveLoadAdapter({ baseUrl: 'https://saves.example.com/v1', request: async () => { requestsAtConstruction++; return { status: 200, text: async () => '{"items":[]}' } } })
check('rest-no-implicit-request', requestsAtConstruction === 0, 'constructing the adapter makes no request')
const listed = await counting.charts.list()
check('rest-list', Array.isArray(listed) && listed.length === 0 && requestsAtConstruction === 1, 'one request lists an empty collection')
const outage = rest.createRestSaveLoadAdapter({ baseUrl: 'https://saves.example.com/v1', request: async () => ({ status: 503, text: async () => '' }) })
const raised = await outage.charts.list().then(() => null, (e) => e)
check('rest-typed-error', raised instanceof rest.RestSaveLoadError && raised.status === 503, 'a 503 raises RestSaveLoadError with its status')

const cssUrl = import.meta.resolve('quickcharts/styles.css')
const cssPath = fileURLToPath(cssUrl)
const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : ''
check('stylesheet', cssPath.endsWith('quickcharts.css') && css.includes('.qc-chrome') && !/url\(\s*["']?https?:/.test(css) && !/@import/.test(css), 'styles.css resolves to the packed stylesheet with the chart chrome and no remote asset')

for (const deep of ['quickcharts/dist/index.js', 'quickcharts/src/index.ts', 'quickcharts/package.json']) {
  const code = await import(deep).then(() => 'resolved', (e) => e.code)
  check('sealed:' + deep, code === 'ERR_PACKAGE_PATH_NOT_EXPORTED', deep + ': ' + code)
}

process.stdout.write(JSON.stringify({ checks }) + '\n')
`

/** The bundling probe: two Vite library builds from the scratch project, the whole root entry and
 *  one helper from it, read for what the narrow one must not carry. */
const BUNDLE = String.raw`
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const { build } = await import(pathToFileURL(readFileSync('vite-entry.txt', 'utf8').trim()).href)
const here = process.cwd()

async function bundle(name) {
  const outDir = join(here, 'bundle-out', name)
  await build({
    root: here,
    configFile: false,
    logLevel: 'error',
    build: { outDir, emptyOutDir: true, minify: false, cssCodeSplit: false, lib: { entry: join(here, name + '.ts'), formats: ['es'], fileName: name }, rollupOptions: { external: ['lightweight-charts'] } },
  })
  const files = readdirSync(outDir).sort()
  const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(outDir, f), 'utf8')).join('\n')
  return { files, js }
}

const full = await bundle('full')
const narrow = await bundle('narrow')
const checks = []
const check = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail })
check('full-bundles', full.js.includes('createChart') && /from\s*["']lightweight-charts["']/.test(full.js), 'the full build carries the widget and keeps the renderer a bare import (' + full.js.length + ' bytes)')
check('narrow-drops-widget', !narrow.js.includes('createChart') && !narrow.js.includes('qc-chrome'), 'a build importing one helper carries no widget (' + narrow.js.length + ' bytes)')
check('narrow-is-small', narrow.js.length < full.js.length / 5, 'the narrow build is under a fifth of the full build: ' + narrow.js.length + ' of ' + full.js.length + ' bytes')
check('narrow-executes', narrow.js.includes('tfToUdfResolution'), 'the helper survives')
process.stdout.write(JSON.stringify({ checks, bytes: { full: full.js.length, narrow: narrow.js.length } }) + '\n')
`

/** The scratch project: written outside the repository so upward module resolution can reach
 *  nothing of ours. Answers the checks, the npm tree and the bundle sizes, or throws. */
async function installTest({ tarball, manifestPath, log, note }) {
  const scratch = mkdtempSync(join(tmpdir(), 'quickcharts-install-'))
  const chunks = []
  const say = (line) => {
    chunks.push(`${line}\n`)
    note(line)
  }
  const step = async (argv, { tolerate = false } = {}) => {
    say(`$ ${argv.join(' ')}`)
    const { status, output, stdout } = await run(argv, { cwd: scratch, log: join(scratch, 'step.log') })
    chunks.push(output)
    if (status !== 0 && !tolerate) throw new Error(`${argv[0]} exited ${status}`)
    return stdout
  }
  try {
    writeFileSync(join(scratch, 'package.json'), `${JSON.stringify({ name: 'quickcharts-install-test', private: true, type: 'module' }, null, 2)}\n`)
    // npm, not pnpm: a consumer has no workspace. Scripts stay off, so the install proves the
    // artifact needs none; the peer is the one registry read.
    const tarballName = tarball.split(/[\\/]/).pop()
    copyFileSync(tarball, join(scratch, tarballName))
    copyFileSync(manifestPath, join(scratch, 'manifest.json'))
    writeFileSync(join(scratch, 'entries.json'), JSON.stringify(PUBLIC_ENTRIES))
    await step(['npm', 'install', '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts', `./${tarballName}`, 'lightweight-charts@^5.0.0'])
    // `npm ls` exits non-zero on any tree problem; the tree is recorded either way and the probe
    // below is what judges the install.
    const tree = await step(['npm', 'ls', '--all', '--json'], { tolerate: true })

    writeFileSync(join(scratch, 'probe.mjs'), PROBE)
    const probeOut = await step(['node', 'probe.mjs'])
    const probe = JSON.parse(probeOut.trim().split('\n').pop())

    // The shipped declarations, with skipLibCheck off: a consumer's compiler reads them whole.
    writeFileSync(join(scratch, 'types.ts'), ["import { createChart, createPriceFormatter } from 'quickcharts'", "import { drawingTools } from 'quickcharts/drawings'", "import { createRestSaveLoadAdapter } from 'quickcharts/adapters/rest'", "import 'quickcharts/styles.css'", 'export const shape: [typeof createChart, typeof createPriceFormatter, typeof drawingTools, typeof createRestSaveLoadAdapter] = [createChart, createPriceFormatter, drawingTools, createRestSaveLoadAdapter]', ''].join('\n'))
    writeFileSync(join(scratch, 'tsconfig.json'), `${JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: false, lib: ['ES2022', 'DOM'] }, files: ['types.ts'] }, null, 2)}\n`)
    await step(['node', q(join(repo, 'node_modules', 'typescript', 'bin', 'tsc')), '-p', 'tsconfig.json'])

    // The bundler is the workspace's Vite; the artifact it bundles is the installed one.
    const viteDir = dirname(createRequire(join(repo, 'apps', 'web', 'package.json')).resolve('vite/package.json'))
    writeFileSync(join(scratch, 'full.ts'), "export * from 'quickcharts'\n")
    writeFileSync(join(scratch, 'narrow.ts'), "export { tfToUdfResolution } from 'quickcharts'\n")
    writeFileSync(join(scratch, 'vite-entry.txt'), join(viteDir, 'dist', 'node', 'index.js'))
    writeFileSync(join(scratch, 'bundle.mjs'), BUNDLE)
    const bundleOut = await step(['node', 'bundle.mjs'])
    const bundle = JSON.parse(bundleOut.trim().split('\n').pop())

    const checks = [...probe.checks, ...bundle.checks]
    for (const c of checks) say(`${c.ok ? 'ok  ' : 'FAIL'} ${c.id}: ${c.detail}`)
    // The tree names the scratch directory as the tarball's `resolved` location; the dossier keeps
    // the tarball's name and not the machine's path.
    const parsedTree = tree.trim() ? JSON.parse(tree, (key, value) => (key === 'resolved' && typeof value === 'string' && value.startsWith('file:') ? `file:${tarballName}` : value)) : {}
    return { checks, tree: parsedTree, bytes: bundle.bytes }
  } finally {
    writeFileSync(log, chunks.join(''))
    rmSync(scratch, { recursive: true, force: true })
  }
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)
  const fast = argv.includes('--fast')
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',')
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('\n  node scripts/release-rehearsal.mjs             the whole rehearsal\n  node scripts/release-rehearsal.mjs --fast      the gate without the browser suite; the dossier reads PARTIAL\n  node scripts/release-rehearsal.mjs --only=a,b  just these stages; the dossier reads PARTIAL\n')
    return 0
  }

  const found = credentialFindings(process.env, npmrcFiles(process.env))
  if (found.length) {
    console.error('release-rehearsal: refusing to run with a registry credential present:')
    for (const f of found) console.error(`  ${f}`)
    console.error('Unset it (or move the npmrc aside) and run again. A rehearsal publishes nothing and must not be able to.')
    return 2
  }

  const { version } = JSON.parse(readFileSync(join(chartDir, 'package.json'), 'utf8'))
  const dossier = join(chartDir, '.release', version)
  rmSync(dossier, { recursive: true, force: true })
  mkdirSync(join(dossier, 'logs'), { recursive: true })
  mkdirSync(join(dossier, 'artifact'), { recursive: true })

  const stages = []
  const note = (line) => process.stdout.write(`release-rehearsal: ${line}\n`)
  let failed = false
  const artifact = { name: null, bytes: null, sha256: null, tarSha256: null, pinMatches: false, files: null, npmPack: null, installTest: null }
  let commit = 'unknown'
  let branch = 'unknown'

  /** Run one stage: its body answers null on success or a one-line reason. */
  const stage = async (id, body) => {
    const index = String(stages.length + 1).padStart(2, '0')
    const logName = `logs/${index}-${id}.log`
    const log = join(dossier, ...logName.split('/'))
    if (failed || (only && !only.includes(id))) {
      stages.push({ id, result: failed ? 'not run' : 'skipped', secs: null, log: null })
      return
    }
    process.stdout.write(`\n\x1b[1m▸ ${id}\x1b[0m\n`)
    const started = Date.now()
    let reason
    try {
      reason = await body(log)
    } catch (e) {
      reason = e instanceof Error ? e.message : String(e)
    }
    if (!existsSync(log)) writeFileSync(log, reason ? `${reason}\n` : 'ok\n')
    const secs = Math.round((Date.now() - started) / 1000)
    stages.push({ id, result: reason ? `FAIL: ${reason}` : 'pass', secs, log: logName })
    if (reason) {
      failed = true
      process.stdout.write(`\x1b[31m✗ ${id}\x1b[0m ${reason}\n`)
    } else process.stdout.write(`\x1b[32m✓ ${id}\x1b[0m ${secs}s\n`)
  }

  const exec = async (argv, log, cwd = repo) => {
    const { status } = await run(argv, { cwd, log })
    return status === 0 ? null : `${argv.join(' ')} exited ${status}`
  }

  await stage('checkout', async (log) => {
    // Untracked files from `git status`; tracked changes from `git diff HEAD`, which compares
    // after line-ending normalization, so a generated file the build rewrote with LF on a CRLF
    // checkout is not a change while a real edit is.
    const scratchLog = join(dossier, 'logs', 'git.log')
    const status = await run(['git', 'status', '--porcelain', '--untracked-files=all'], { cwd: repo, log: scratchLog })
    const diff = await run(['git', 'diff', '--name-only', 'HEAD'], { cwd: repo, log: scratchLog })
    const head = await run(['git', 'rev-parse', 'HEAD', '--abbrev-ref', 'HEAD'], { cwd: repo, log: scratchLog })
    rmSync(scratchLog, { force: true })
    if (status.status !== 0 || diff.status !== 0 || head.status !== 0) return 'git could not read the checkout'
    ;[commit, branch] = head.stdout.trim().split(/\r?\n/)
    const untracked = status.stdout.split(/\r?\n/).filter((l) => l.startsWith('??')).map((l) => l.slice(3))
    const changed = diff.stdout.split(/\r?\n/).filter(Boolean)
    writeFileSync(log, `commit ${commit}\nbranch ${branch}\n${[...changed.map((f) => `changed ${f}`), ...untracked.map((f) => `untracked ${f}`)].join('\n') || 'working tree clean'}\n`)
    if (changed.length || untracked.length) return `the working tree is not clean (${changed.length} changed, ${untracked.length} untracked); a rehearsal runs from a committed state`
    return null
  })

  await stage('install', (log) => exec(['pnpm', 'install', '--frozen-lockfile'], log))

  await stage('gate', async (log) => {
    if (!fast) {
      const free = await waitForFreePort(E2E_PORT, 10 * 60_000, note)
      if (!free) return `port ${E2E_PORT} stayed in use for ten minutes; the browser suite cannot boot`
    }
    return exec(['node', 'scripts/gate.mjs', ...(fast ? ['--fast'] : [])], log)
  })

  await stage('pack', async (log) => {
    const reason = await exec(['pnpm', '--filter', 'quickcharts', 'pack:candidate'], log)
    if (reason) return reason
    const candidate = JSON.parse(readFileSync(join(chartDir, '.candidate', 'manifest.json'), 'utf8'))
    const pin = JSON.parse(readFileSync(join(chartDir, 'test', 'fixtures', 'candidate-manifest.json'), 'utf8'))
    const drift = comparePin(candidate, pin)
    artifact.name = candidate.tarball.name
    artifact.bytes = candidate.tarball.bytes
    artifact.sha256 = candidate.tarball.sha256
    artifact.tarSha256 = candidate.tarball.tarSha256
    artifact.files = Object.keys(candidate.files).length
    artifact.pinMatches = drift.length === 0
    copyFileSync(join(chartDir, '.candidate', candidate.tarball.name), join(dossier, 'artifact', candidate.tarball.name))
    copyFileSync(join(chartDir, '.candidate', 'manifest.json'), join(dossier, 'artifact', 'manifest.json'))
    if (drift.length) return `the candidate drifted from the pin: ${drift.slice(0, 5).join(', ')}${drift.length > 5 ? ` and ${drift.length - 5} more` : ''}`
    return null
  })

  await stage('clean-room', (log) => exec(['node', 'clean-room/run.mjs'], log))
  await stage('supply-chain', (log) => exec(['pnpm', 'check:supply-chain'], log))
  await stage('notices', (log) => exec(['node', 'scripts/build-third-party-notices.mjs', '--check'], log, chartDir))

  await stage('npm-pack', async (log) => {
    const { status, stdout } = await run(['npm', 'pack', '--dry-run', '--json'], { cwd: chartDir, log })
    if (status !== 0) return `npm pack --dry-run exited ${status}`
    const parsed = JSON.parse(stdout)
    const npmFiles = parsed[0].files.map((f) => f.path.replace(/\\/g, '/')).sort()
    const manifest = JSON.parse(readFileSync(join(dossier, 'artifact', 'manifest.json'), 'utf8'))
    const diff = compareFileLists(npmFiles, Object.keys(manifest.files))
    writeFileSync(join(dossier, 'artifact', 'npm-pack-dry-run.json'), `${JSON.stringify({ files: npmFiles, onlyNpm: diff.onlyNpm, onlyManifest: diff.onlyManifest }, null, 2)}\n`)
    if (diff.onlyNpm.length || diff.onlyManifest.length) return `npm would pack ${diff.onlyNpm.length} path(s) the candidate lacks and miss ${diff.onlyManifest.length} it has`
    artifact.npmPack = `lists the same ${npmFiles.length} paths`
    return null
  })

  await stage('install-test', async (log) => {
    const result = await installTest({ tarball: join(dossier, 'artifact', artifact.name), manifestPath: join(dossier, 'artifact', 'manifest.json'), log, note })
    writeFileSync(join(dossier, 'artifact', 'install-test.json'), `${JSON.stringify({ checks: result.checks, bytes: result.bytes }, null, 2)}\n`)
    writeFileSync(join(dossier, 'artifact', 'install-tree.json'), `${JSON.stringify(result.tree, null, 2)}\n`)
    const failing = result.checks.filter((c) => !c.ok)
    if (failing.length) return `${failing.length} check(s) failed: ${failing.map((c) => c.id).join(', ')}`
    artifact.installTest = `${result.checks.length} checks passed; a one-helper build is ${result.bytes.narrow} of ${result.bytes.full} bytes`
    return null
  })

  const result = failed ? 'FAIL' : fast || only ? 'PARTIAL' : 'PASS'
  const date = new Date().toISOString()
  writeFileSync(join(dossier, 'environment.json'), `${JSON.stringify({ date, commit, branch, version, fast, platform: process.platform, node: process.version, arch: process.arch }, null, 2)}\n`)
  writeFileSync(join(dossier, 'SUMMARY.md'), renderSummary({ result, version, commit, branch, date, fast, stages, artifact: artifact.name ? artifact : null, ownerGates: OWNER_GATES }))
  const hashes = {}
  for (const file of walkFiles(dossier)) if (file !== 'hashes.json') hashes[file] = sha256(readFileSync(join(dossier, ...file.split('/'))))
  writeFileSync(join(dossier, 'hashes.json'), `${JSON.stringify(hashes, null, 2)}\n`)

  console.log(`\n\x1b[1m── release rehearsal ──\x1b[0m`)
  for (const s of stages) console.log(`  ${s.result === 'pass' ? '\x1b[32m✓\x1b[0m' : s.result === 'not run' || s.result === 'skipped' ? '\x1b[2m·\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${s.id.padEnd(13)} ${s.secs === null ? s.result : `${s.secs}s`}`)
  console.log(`\n${result === 'PASS' ? '\x1b[32m' : result === 'PARTIAL' ? '\x1b[33m' : '\x1b[31m'}${result}\x1b[0m: dossier at ${posix.join('packages/chart/.release', version)}/SUMMARY.md. Nothing was published.`)
  return failed ? 1 : 0
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) process.exit(await main())
