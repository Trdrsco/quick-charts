// The supply-chain gate for the one public artifact: `pnpm check:supply-chain`, run by `pnpm gate`
// and the CI `check` job.
//
// Quick Charts leaves this repository as a public package and, later, as a public repository whose
// history is public too. This script proves that nothing private rides along, in every place a
// stranger would read:
//
//   tree      every text file in the repository (source, fixtures, scripts, guest, the clean-room
//             consumer examples, docs and policy files), skipping installed
//             trees and reading the built dist; a source map is judged by the paths it names
//   packed    every file `npm pack --dry-run` would put in the tarball, read from disk, so the
//             artifact is judged as the registry would receive it
//   history   every line ever ADDED to this repository on the current branch, read from
//             `git log -p`, because a public repository ships its history and a secret that was
//             deleted is still published
//
// What it hunts (RULES):
//
//   secret         tenant keys, live API keys, bearer tokens, private-key blocks, forge and cloud
//                  tokens, and dotenv-shaped `NAME_KEY=value` assignments
//   pii            e-mail addresses outside the documentation example domains, and user home
//                  directories (a source map or a log line that names the machine it was built on)
//   private-host   trdrs domains, Fly hostnames, private DNS suffixes, and the local engine port
//   proprietary    a private workspace package named in what a consumer receives: the packed
//                  files, the package documents, and the manifest's installable dependency blocks.
//                  The package SOURCE may import the two internal seams the build inlines; the
//                  built files may not name them, and the boundary fixtures prove the bundle.
//
// Exclusions are exact files with a reason (EXCLUSIONS), never a directory or a glob; each is
// checked to exist, and a listed file that no longer exists is a configuration error (exit 2) so
// an exclusion cannot outlive its subject. An exclusion silences the same path in history too,
// because a fixture that names the shapes it hunts named them in every revision. A historical
// path that no longer exists is excluded through HISTORY_EXCLUSIONS, by commit and path, with the
// same reason discipline.
//
// Output: `supply-chain OK: ...` and exit 0; otherwise one `file:line: [rule] what: text` per hit
// and exit 1. The offending TEXT is printed only up to the match, then the match itself, then
// nothing: a hit on a credential must not print the credential.
import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const PACKAGE = '.'

/** What a stranger must never find. `where` narrows a rule to the files a consumer receives
 *  (`shipped`) and `history: false` keeps it out of the history walk; every other rule reads
 *  everything. */
export const RULES = [
  { id: 'secret', what: 'a tenant key', re: /trdrs_sk_[A-Za-z0-9]/ },
  { id: 'secret', what: 'a live or test API key', re: /\b[sprk]k_(live|test)_[A-Za-z0-9]{8,}/ },
  { id: 'secret', what: 'a bearer token', re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/ },
  { id: 'secret', what: 'a private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'secret', what: 'a forge or cloud token', re: /\b(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{30,})\b/ },
  { id: 'secret', what: 'an environment value', re: /^\s*(export\s+)?[A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD)=["']?[^\s"']{6,}/ },
  { id: 'pii', what: 'an e-mail address', re: /[A-Za-z0-9._%+-]+@(?!example\.(com|org|net)\b)[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/ },
  { id: 'pii', what: 'a user home path', re: /\b[A-Za-z]:\\Users\\|\/Users\/[A-Za-z]|\/home\/[a-z]/ },
  { id: 'private-host', what: 'a trdrs domain', re: /\btrdrs\.co\b|\btrdrsco[\w-]*\.fly\.dev\b/ },
  { id: 'private-host', what: 'a Fly or private DNS host', re: /\b[a-z0-9-]+\.fly\.dev\b|\b[a-z0-9-]+\.internal\b(?=[:/\s'"`,)]|$)/ },
  { id: 'private-host', what: 'the local engine port', re: /localhost:8080|127\.0\.0\.1:8080/ },
  // Present only: which private packages the chart ONCE named is a fact of this monorepo's
  // history that the public repository's history import decides; what a consumer receives today
  // is what this rule judges. The manifest is read structurally (INSTALLABLE), never as text,
  // because its devDependencies name the two seams the build inlines.
  { id: 'proprietary', what: 'a private workspace package', re: /@trdrs\//, where: 'shipped', history: false },
]

/** Exact files whose text names the shapes above on purpose. One file, one rule, one reason. */
export const EXCLUSIONS = [
  ['test/boundary/noDefaultTrdrsUrl.test.ts', 'private-host', 'the fixture names the hosts it hunts'],
  ['test/boundary/noDefaultTrdrsUrl.test.ts', 'secret', 'the fixture names the credential shapes it hunts'],
  ['test/boundary/guestArtifact.test.ts', 'private-host', 'the fixture names the hosts it hunts'],
  ['test/boundary/guestArtifact.test.ts', 'secret', 'the fixture names the credential shapes it hunts'],
  ['clean-room/vite-consumer/build.mjs', 'private-host', 'the consumer names the hosts it forbids in the bundles it judges'],
  ['scripts/check-supply-chain.mjs', 'private-host', 'this file declares the hosts it hunts'],
  ['scripts/check-docs.mjs', 'private-host', 'the documentation gate declares the hosts it hunts'],
  ['scripts/test/check-supply-chain.test.ts', 'secret', 'the fixture seeds every credential shape this file hunts'],
  ['scripts/test/check-supply-chain.test.ts', 'pii', 'the fixture seeds the e-mail and home-path shapes this file hunts'],
  ['scripts/test/check-supply-chain.test.ts', 'private-host', 'the fixture seeds the host shapes this file hunts'],
  ['scripts/test/release-rehearsal.test.ts', 'secret', 'the fixture seeds the registry-credential shapes the rehearsal refuses to run with'],
  ['scripts/test/release-rehearsal.test.ts', 'pii', 'the fixture seeds the npmrc home paths the rehearsal reads'],
]

/** Historical paths that no longer exist: [commit, path, rule, reason]. Empty is the goal. */
export const HISTORY_EXCLUSIONS = [
]

/** Never walked: installed packages, tool caches and packed fixtures. */
// .candidate is the packed tarball extracted beside the package; the tarball itself is judged from its
// packed file list below, so the extraction would only repeat every finding. .release is the
// rehearsal dossier: logs of the gates above, written locally, never packed.
const SKIPPED_DIRS = new Set(['node_modules', '.git', '.turbo', '.artifacts', 'test-results', '.candidate', '.release'])
const TEXT_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|jsonc|yml|yaml|toml|html|css|md|txt|sh|svg|d\.ts)$|(^|\/)(LICENSE|NOTICE|Dockerfile)$|\/\.env\.(example|template|sample)$/
const SOURCE_MAP = /\.map$/

/** A source map is judged by the paths it names, not by its sourcesContent, which repeats the
 *  source the tree already reads: an absolute path in `sources` is the machine it was built on. */
function mapText(text) {
  try {
    const map = JSON.parse(text)
    return [map.sourceRoot ?? '', map.file ?? '', ...(map.sources ?? [])].join('\n')
  } catch {
    return text
  }
}

/** The package documents a consumer reads beside the bundle. */
const PACKAGE_DOC = /^[^/]+\.md$/
/** The manifest blocks a consumer's installer follows. */
const INSTALLABLE = ['dependencies', 'peerDependencies', 'optionalDependencies']

export class ConfigError extends Error {}

const toPosix = (p) => p.replace(/\\/g, '/')

export function walk(root, dir, out = []) {
  const abs = join(root, dir)
  if (!existsSync(abs)) return out
  for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = posix.join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIPPED_DIRS.has(e.name)) walk(root, rel, out)
    } else if (TEXT_FILE.test(rel) || SOURCE_MAP.test(rel)) out.push(rel)
  }
  return out
}

/** The paths `npm pack` would put in the tarball, as package-relative posix paths. */
export function packedFiles(root) {
  // One static string, so the Windows .cmd shim needs no argument quoting.
  const json = execSync('npm pack --dry-run --json', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parsed = JSON.parse(json)
  if (!parsed[0]) throw new Error('npm pack --dry-run --json returned no package')
  return parsed[0].files.map((f) => toPosix(f.path)).sort()
}

/** Every line ever added under the package on the current branch: [{ commit, file, line, text }].
 *  Read from `git log -p` in one pass; only `+` lines are judged, because a removed line was an
 *  added line in an earlier commit. */
export function historyLines(root, path = PACKAGE) {
  const log = execFileSync('git', ['log', '-p', '--no-color', '--format=commit %H', 'HEAD', '--', path], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const out = []
  let commit = null
  let file = null
  let line = 0
  for (const raw of log.split('\n')) {
    if (raw.startsWith('commit ')) {
      commit = raw.slice(7).trim()
      file = null
      continue
    }
    if (raw.startsWith('+++ ')) {
      file = raw.startsWith('+++ b/') ? raw.slice(6).trimEnd() : null
      continue
    }
    if (raw.startsWith('@@')) {
      const m = /\+(\d+)/.exec(raw)
      line = m ? Number(m[1]) - 1 : 0
      continue
    }
    if (!file || raw.startsWith('---') || raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('\\')) continue
    if (raw.startsWith('+')) {
      line++
      out.push({ commit, file, line, text: raw.slice(1) })
    } else if (raw.startsWith(' ')) line++
  }
  return out
}

/** A finding's text, cut at the match so a credential is named and never printed whole. */
const redact = (text, match) => {
  const at = text.indexOf(match[0])
  const head = text.slice(0, at).trimStart()
  const shown = match[0].length > 24 ? `${match[0].slice(0, 12)}...` : match[0]
  return `${head}${shown}`.slice(0, 160)
}

/** The rules that apply to `file`: `shipped` rules only where a consumer receives the file (and
 *  never to the manifest's text, which INSTALLABLE reads structurally), and in history only the
 *  rules that judge history. */
function rulesFor(file, shipped, inHistory = false) {
  return RULES.filter((r) => {
    if (inHistory && r.history === false) return false
    if (!r.where) return true
    if (file === 'package.json') return false
    return r.where === 'shipped' && (shipped || PACKAGE_DOC.test(file))
  })
}

/** The configuration proof. `options.git` false leaves out the probe that asks this repository
 *  whether an excluded historical path exists at its commit: a caller that injects a history has no
 *  such repository to ask, and every other rule still holds. */
export function validate(root, options = {}) {
  for (const [file, rule, reason] of EXCLUSIONS) {
    if (/[*?[\]{}]/.test(file)) throw new ConfigError(`EXCLUSIONS names a glob, ${file}; name one exact file (${reason})`)
    const abs = join(root, file)
    if (!existsSync(abs)) throw new ConfigError(`EXCLUSIONS names ${file}, which does not exist; delete the exclusion (${reason})`)
    if (statSync(abs).isDirectory()) throw new ConfigError(`EXCLUSIONS names a directory, ${file}; name one exact file (${reason})`)
    if (!RULES.some((r) => r.id === rule)) throw new ConfigError(`EXCLUSIONS names unknown rule ${rule} for ${file}`)
    if (!reason || !reason.trim()) throw new ConfigError(`EXCLUSIONS gives ${file} no reason`)
  }
  for (const [commit, file, rule, reason] of HISTORY_EXCLUSIONS) {
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new ConfigError(`HISTORY_EXCLUSIONS names ${commit}, which is not a full commit id (${file})`)
    if (!RULES.some((r) => r.id === rule)) throw new ConfigError(`HISTORY_EXCLUSIONS names unknown rule ${rule} for ${file}`)
    if (!reason || !reason.trim()) throw new ConfigError(`HISTORY_EXCLUSIONS gives ${commit}:${file} no reason`)
    if (options.git === false) continue
    try {
      execFileSync('git', ['cat-file', '-e', `${commit}:${file}`], { cwd: root, stdio: 'ignore' })
    } catch {
      throw new ConfigError(`HISTORY_EXCLUSIONS names ${file} at ${commit}, which git does not know`)
    }
  }
}

const excluded = (file, rule) => EXCLUSIONS.some(([f, r]) => f === file && r === rule)
const excludedInHistory = (commit, file, rule) => excluded(file, rule) || HISTORY_EXCLUSIONS.some(([c, f, r]) => c === commit && f === file && r === rule)

/**
 * The check. `options.packed` supplies the packed file list (defaults to npm's own answer) and
 * `options.history` the added history lines (defaults to git's); a test injects both.
 * Returns { files, packed, history, hits }, each hit { file, line, rule, what, text, commit? }.
 */
export function check(root, options = {}) {
  validate(root, { git: !options.history })
  const hits = []
  const seen = new Set()
  const report = (file, line, rule, what, text, commit) => {
    const key = `${commit ?? ''}|${file}|${line}|${rule.id}|${what}`
    if (seen.has(key)) return
    seen.add(key)
    hits.push({ file, line, rule: rule.id, what, text, ...(commit ? { commit } : {}) })
  }
  const judge = (file, raw, shipped, commit) => {
    const text = SOURCE_MAP.test(file) ? mapText(raw) : raw
    const rules = rulesFor(file, shipped)
    text.split(/\r?\n/).forEach((raw, i) => {
      for (const rule of rules) {
        if (commit ? excludedInHistory(commit, file, rule.id) : excluded(file, rule.id)) continue
        const m = rule.re.exec(raw)
        if (m) report(file, i + 1, rule, rule.what, redact(raw, m), commit)
      }
    })
  }

  // The working tree.
  const files = walk(root, PACKAGE)
  for (const file of files) judge(file, readFileSync(join(root, file), 'utf8'), file.startsWith('dist/'))

  // The manifest's installable blocks, structurally: a private package a consumer would install.
  const manifestPath = join(root, 'package.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const rule = RULES.find((r) => r.id === 'proprietary')
    for (const block of INSTALLABLE) {
      for (const name of Object.keys(manifest[block] ?? {})) {
        if (rule.re.test(`${name}/`)) report('package.json', 0, rule, `${block} names ${name}`, `${block}: ${name}`)
      }
    }
  }

  // The tarball, as the registry receives it.
  const packed = (options.packed ?? (() => packedFiles(root)))()
  for (const path of packed) {
    const file = path
    const abs = join(root, file)
    if (!existsSync(abs)) throw new Error(`npm packs ${path}, which is not on disk; run the package build first`)
    judge(file, readFileSync(abs, 'utf8'), true)
  }

  // The history.
  const history = (options.history ?? (() => historyLines(root)))()
  const byFile = new Map()
  for (const h of history) {
    const key = `${h.commit}\n${h.file}`
    if (!byFile.has(key)) byFile.set(key, [])
    byFile.get(key).push(h)
  }
  for (const [key, lines] of byFile) {
    const [commit, file] = key.split('\n')
    const rules = rulesFor(file, file.startsWith('dist/'), true)
    for (const { line, text } of lines) {
      for (const rule of rules) {
        if (excludedInHistory(commit, file, rule.id)) continue
        const m = rule.re.exec(text)
        if (m) report(file, line, rule, rule.what, redact(text, m), commit)
      }
    }
  }

  return { files: files.length, packed: packed.length, history: history.length, hits }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  let result
  try {
    result = check(root)
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error(`check-supply-chain: ${e.message}`)
      process.exit(2)
    }
    throw e
  }
  if (result.hits.length) {
    for (const h of result.hits) {
      const where = h.commit ? `${h.file}@${h.commit.slice(0, 10)}:${h.line}` : `${h.file}:${h.line}`
      console.error(`${where}: [${h.rule}] ${h.what}: ${h.text}`)
    }
    console.error(`\nsupply-chain check FAILED: ${result.hits.length} finding(s). Remove the value from the package, never from the check.`)
    process.exit(1)
  }
  console.log(
    `supply-chain OK: ${result.files} files in the tree, ${result.packed} packed files, ${result.history} lines added in history; ` +
      `${RULES.length} rules hold with ${EXCLUSIONS.length} exact-file exclusions and ${HISTORY_EXCLUSIONS.length} history exclusions.`,
  )
}
