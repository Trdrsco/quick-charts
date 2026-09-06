#!/usr/bin/env node
// The candidate pack: the one tarball the web app installs, the clean room installs, and a release
// rehearsal publishes, written by this package rather than by a package manager so that the same
// source builds the same bytes on every machine.
//
//   .candidate/quickcharts-<version>.tgz   the tarball, byte-identical across runs
//   .candidate/package/**                  the tarball's contents, extracted: what `link:` installs
//                                          resolve through the published export map
//   .candidate/manifest.json               the file list with a SHA-256 per file, the SHA-256 of the
//                                          uncompressed tar stream, and the SHA-256 of the tarball
//
// It runs from `pnpm --filter quickcharts pack:candidate`, and `postbuild` runs it as the last
// step of every build, so a build never leaves a candidate older than the dist it packs. The
// candidate carries exactly what `files` in package.json names: dist without the WebView guest,
// the four root documents, and the manifest with its `publishConfig` applied the way a publish
// applies it, so the export map a consumer resolves is the published one, not the workspace one.
//
// Determinism, and what each rule buys:
//   - one entry order: paths sorted by byte value, so a directory listing order never reaches the
//     archive;
//   - one modification time on every entry (the same 1985 constant npm's own pack uses), no owner,
//     no group, one mode, so a checkout's clock and account never reach the archive;
//   - one newline: every file is text, and a Windows checkout writes CRLF into the composed
//     stylesheet, the root documents and the sources a source map embeds; all of it is normalized
//     to LF here, so the Linux build and the Windows build of one commit pack the same bytes. A
//     checkout's line endings reach one place this pass cannot: esbuild names every shared and
//     dynamic chunk after a hash of the bytes it read, and that name is already written into the
//     entries importing it, so a CRLF checkout produced `ar-XYEYU6VD.js` where an LF checkout
//     produced `ar-FHCG6QP4.js`. scripts/lf-sources.mjs strips the carriage returns before the
//     bundler reads them, which leaves this pass only the files the bundler did not write;
//   - no machine path: a source map's `sources` are relative, and the pack refuses any file that
//     names this checkout's absolute path or a file URL;
//   - one gzip header: the operating-system byte is fixed, so the same tar stream gzips to the same
//     tarball on every platform that shares a deflate implementation. The tar stream itself is
//     pinned by hash in the manifest; the tarball hash is reported beside it and not pinned, since
//     deflate output may differ between zlib builds.
//
//   --out=<dir>   write everywhere but the package's own .candidate directory (the fixture builds
//                 twice into scratch directories and compares)
//   --pin         also write test/fixtures/candidate-manifest.json, the committed pin the package
//                 gate compares every later candidate against
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = join(pkgRoot, '..', '..')

const outArg = process.argv.find((a) => a.startsWith('--out='))
const out = outArg ? resolve(outArg.slice('--out='.length)) : join(pkgRoot, '.candidate')
const pin = process.argv.includes('--pin')

/** The pinned fixture the package gate reads. */
const PIN_PATH = 'test/fixtures/candidate-manifest.json'

/** Every entry's modification time: 1985-10-26T08:15:00Z, the constant npm's pack writes. */
const ENTRY_MTIME = Math.floor(Date.UTC(1985, 9, 26, 8, 15, 0) / 1000)

/** The four documents packed beside the manifest. */
const ROOT_DOCUMENTS = ['README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md']

/** The manifest fields a publish takes from `publishConfig` in place of the workspace value. */
const PUBLISH_OVERRIDES = ['bin', 'type', 'imports', 'main', 'module', 'exports', 'browser', 'esnext', 'es2015', 'unpkg', 'umd:main', 'typings', 'types', 'typesVersions', 'cpu', 'os']

// ── The file set ────────────────────────────────────────────────────────────────────────────────

/** Every file under `dir`, as package-relative posix paths, in byte order. */
function walk(dir, prefix, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(abs).isDirectory()) walk(abs, rel, out)
    else out.push(rel)
  }
  return out
}

/** The paths the tarball carries, sorted by byte value: dist without the guest, the documents, and
 *  the manifest. */
function candidatePaths() {
  const dist = walk(join(pkgRoot, 'dist'), 'dist').filter((p) => !p.startsWith('dist/guest/'))
  return [...dist, ...ROOT_DOCUMENTS, 'package.json'].sort(byteOrder)
}

const byteOrder = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// ── The content ─────────────────────────────────────────────────────────────────────────────────

const LF = (text) => text.replace(/\r\n/g, '\n')

/** The forms a checkout's own location could take inside a built file. */
const MACHINE_PATHS = [repoRoot, repoRoot.replace(/\\/g, '/'), 'file:///']

/** The text one packed file carries: normalized to LF, a source map with its embedded sources
 *  normalized the same way and its `sources` proven relative, the manifest rewritten for publish. */
function contentOf(path) {
  if (path === 'package.json') return publishedManifest()
  const raw = LF(readFileSync(join(pkgRoot, path), 'utf8'))
  if (!path.endsWith('.map')) return raw
  const map = JSON.parse(raw)
  for (const source of map.sources ?? []) {
    if (/^([A-Za-z]:|\/|file:)/.test(source)) throw new Error(`${path}: source map names an absolute source ${source}`)
  }
  if (map.sourcesContent) map.sourcesContent = map.sourcesContent.map((s) => (typeof s === 'string' ? LF(s) : s))
  return JSON.stringify(map)
}

/** The manifest as a publish writes it: `publishConfig` overrides applied and removed from the
 *  block, every `workspace:` specifier replaced by the sibling's version with the range it asked
 *  for, and nothing else changed. */
function publishedManifest() {
  const manifest = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
  const publishConfig = { ...(manifest.publishConfig ?? {}) }
  for (const key of PUBLISH_OVERRIDES) {
    if (key in publishConfig) {
      manifest[key] = publishConfig[key]
      delete publishConfig[key]
    }
  }
  if (Object.keys(publishConfig).length) manifest.publishConfig = publishConfig
  else delete manifest.publishConfig
  for (const block of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(manifest[block] ?? {})) {
      if (spec.startsWith('workspace:')) manifest[block][name] = workspaceVersion(name, spec.slice('workspace:'.length))
    }
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/** `workspace:^` on a sibling at 0.1.0 is `^0.1.0`; `workspace:*` is `0.1.0`; a range that names
 *  a version is kept as written. */
function workspaceVersion(name, range) {
  const packagesDir = join(repoRoot, 'packages')
  for (const dir of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const sibling = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (sibling.name !== name) continue
    if (range === '*' || range === '') return sibling.version
    if (range === '^' || range === '~') return `${range}${sibling.version}`
    return range
  }
  throw new Error(`no workspace package named ${name} for the ${range} specifier`)
}

// ── The archive ─────────────────────────────────────────────────────────────────────────────────

const BLOCK = 512
const RECORD = BLOCK * 20

/** One ustar header for a regular file: the fixed mode, no owner, the one modification time. */
function header(name, size) {
  const buf = Buffer.alloc(BLOCK)
  const [prefix, base] = splitName(name)
  buf.write(base, 0, 100, 'utf8')
  buf.write('0000644\0', 100, 8, 'ascii')
  buf.write('0000000\0', 108, 8, 'ascii')
  buf.write('0000000\0', 116, 8, 'ascii')
  buf.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  buf.write(`${ENTRY_MTIME.toString(8).padStart(11, '0')}\0`, 136, 12, 'ascii')
  buf.write('        ', 148, 8, 'ascii')
  buf.write('0', 156, 1, 'ascii')
  buf.write('ustar\0', 257, 6, 'ascii')
  buf.write('00', 263, 2, 'ascii')
  buf.write('0000000\0', 329, 8, 'ascii')
  buf.write('0000000\0', 337, 8, 'ascii')
  buf.write(prefix, 345, 155, 'utf8')
  let sum = 0
  for (const byte of buf) sum += byte
  buf.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return buf
}

/** A name over 100 bytes moves its leading directories into the ustar prefix field. */
function splitName(name) {
  if (Buffer.byteLength(name) <= 100) return ['', name]
  const parts = name.split('/')
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join('/')
    const base = parts.slice(i).join('/')
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(base) <= 100) return [prefix, base]
  }
  throw new Error(`${name} does not fit a ustar header`)
}

/** The tar stream: each entry as header plus content padded to a block, then two empty blocks,
 *  padded to a record. */
function tarStream(entries) {
  const chunks = []
  for (const { name, content } of entries) {
    chunks.push(header(`package/${name}`, content.length), content)
    const pad = (BLOCK - (content.length % BLOCK)) % BLOCK
    if (pad) chunks.push(Buffer.alloc(pad))
  }
  chunks.push(Buffer.alloc(BLOCK * 2))
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const pad = (RECORD - (total % RECORD)) % RECORD
  if (pad) chunks.push(Buffer.alloc(pad))
  return Buffer.concat(chunks)
}

/** The tarball: gzip at the highest level, the header's operating-system byte fixed to the value
 *  every platform can read as "Unix", its modification time already zero. */
function tarball(tar) {
  const gz = gzipSync(tar, { level: 9 })
  gz.writeUInt32LE(0, 4)
  gz[9] = 3
  return gz
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// ── The run ─────────────────────────────────────────────────────────────────────────────────────

/** The files the export map and the earlier build steps write; a dist missing any of them is
 *  either unbuilt or a build still in progress, and neither is a candidate. */
const BUILT = ['index.js', 'index.d.ts', 'drawings.js', 'drawings.d.ts', 'adapters/rest.js', 'adapters/rest.d.ts', 'quickcharts.css', 'theme-manifest.json', 'feature-manifest.json', 'rest-openapi.json']
const unbuilt = BUILT.filter((file) => !existsSync(join(pkgRoot, 'dist', ...file.split('/'))))
if (unbuilt.length) {
  console.error(`pack-candidate: dist is missing ${unbuilt.join(', ')}; run \`pnpm --filter quickcharts build\`, whose last step packs the candidate`)
  process.exit(1)
}

const paths = candidatePaths()
const entries = paths.map((name) => {
  const text = contentOf(name)
  for (const machine of MACHINE_PATHS) {
    if (text.includes(machine)) throw new Error(`${name} names this machine: ${machine}`)
  }
  return { name, content: Buffer.from(text, 'utf8') }
})

const { name: packageName, version } = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'))
const tar = tarStream(entries)
const tgz = tarball(tar)
const tarballName = `${packageName}-${version}.tgz`

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'package'), { recursive: true })
for (const { name, content } of entries) {
  const target = join(out, 'package', ...name.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}
writeFileSync(join(out, tarballName), tgz)

const manifest = {
  name: packageName,
  version,
  tarball: { name: tarballName, bytes: tgz.length, sha256: sha256(tgz), tarSha256: sha256(tar) },
  files: Object.fromEntries(entries.map(({ name, content }) => [name, { bytes: content.length, sha256: sha256(content) }])),
}
writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

if (pin) {
  const pinned = { tarSha256: manifest.tarball.tarSha256, files: Object.fromEntries(entries.map(({ name, content }) => [name, sha256(content)])) }
  const pinPath = join(pkgRoot, ...posix.normalize(PIN_PATH).split('/'))
  mkdirSync(dirname(pinPath), { recursive: true })
  writeFileSync(pinPath, `${JSON.stringify(pinned, null, 2)}\n`)
  console.log(`candidate: pinned ${PIN_PATH}`)
}

console.log(`candidate: ${entries.length} files, ${tgz.length} bytes, ${out.replace(pkgRoot, '.')}/${tarballName}`)
console.log(`  tar ${manifest.tarball.tarSha256.slice(0, 12)}  tgz ${manifest.tarball.sha256.slice(0, 12)}`)
