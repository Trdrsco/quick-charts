// The shared readers for the Quick Charts boundary fixtures. Three sources of truth, each read the
// way a consumer would meet it:
//
//   - the SOURCE: every file under packages/chart/src, through Vite's own glob (this package is
//     browser-typed; no node:fs), keyed by root-relative path;
//   - the PACKED FILE LIST: what `npm pack --dry-run --json` says a registry would receive, so a
//     fixture reads the manifest's `files` semantics the way npm applies them rather than the way
//     we remember them. The text of each packed file arrives through the same Vite globs, and a
//     packed file with no reader is a failure, never a silent gap;
//   - the DEPENDENCY CLOSURE: package.json's direct edges, and the lockfile's importer graph walked
//     across workspace links and registry snapshots, so a private organ reached through another
//     organ still shows up in what the tarball would drag in.
//
// Paths are root-relative with forward slashes on every platform, so an offender reads the same in
// a Windows and a CI log.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Every chart source, keyed by root-relative path. */
export const CHART_SOURCES = import.meta.glob('/packages/chart/src/**/*.ts', { query: '?raw', import: 'default', eager: true })

/** Every chart test and fixture, keyed by root-relative path. The boundary folder itself is in the
 *  map (the glob is honest); a sweep that must not read its own patterns excludes it by name. */
export const CHART_FIXTURES = import.meta.glob('/packages/chart/test/**/*.ts', { query: '?raw', import: 'default', eager: true })

/** The chart's manifest and the documents npm packs beside it. */
const CHART_ROOT_FILES = import.meta.glob(['/packages/chart/*.md', '/packages/chart/LICENSE', '/packages/chart/package.json'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The built artifact, when a build has run. Source maps are left out on purpose: their
 *  `sourcesContent` is the source the source sweep already reads. The generated theme manifest is
 *  packed beside the bundle, so JSON is read here too; the generated stylesheet is not, because
 *  vitest does not process CSS and `packedText` reads it from disk instead. */
const CHART_DIST = import.meta.glob('/packages/chart/dist/**/*.{js,ts,json}', { query: '?raw', import: 'default', eager: true })

/** The first-party web app's sources, for the vocabulary that must stay out of the app as well as
 *  the package now that the app mounts the package composition and owns no chart tree of its own. */
export const APP_SOURCES = import.meta.glob('/apps/web/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

/** Every workspace package manifest, keyed by root-relative path. */
const WORKSPACE_MANIFESTS = import.meta.glob('/packages/*/package.json', { query: '?raw', import: 'default', eager: true })

const LOCKFILE = import.meta.glob('/pnpm-lock.yaml', { query: '?raw', import: 'default', eager: true })

export const CHART_ROOT = '/packages/chart'

/** This package's directory on disk, derived from the module URL so no node:path is needed. Decoded
 *  (a Windows "Joe D" path URL-encodes its space) and drive-letter-normalized. */
const boundaryDir = decodeURIComponent(new URL('.', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')
export const CHART_DIR = boundaryDir.replace(/\/test\/boundary\/?$/, '')

export interface Offender {
  file: string
  line: number
  text: string
}

/** Every line of `text` matching `pattern`, as file, line, and trimmed text. */
export function scanLines(file: string, text: string, pattern: RegExp): Offender[] {
  const out: Offender[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (pattern.test(line)) out.push({ file, line: i + 1, text: line.trim() })
  })
  return out
}

/** Every offending line across a file map. */
export function scanFiles(files: Record<string, string>, pattern: RegExp): Offender[] {
  return Object.entries(files).flatMap(([file, text]) => scanLines(file, text, pattern))
}

export const offenderText = (o: Offender): string => `${o.file}:${o.line}: ${o.text}`

// ── The packed file list ────────────────────────────────────────────────────────────────────────

/** The paths `npm pack` would put in the tarball, read from npm itself, sorted. */
export function packedFileList(): string[] {
  const json = execSync('npm pack --dry-run --json', { cwd: CHART_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const parsed = JSON.parse(json) as { files: { path: string }[] }[]
  const first = parsed[0]
  if (!first) throw new Error('npm pack --dry-run --json returned no package')
  return first.files.map((f) => f.path.replace(/\\/g, '/')).sort()
}

/** The text of one packed file, or null when nothing here can read it. A null is the caller's
 *  failure to report: a packed file the fixtures cannot read is a gap in the boundary. */
export function packedText(path: string): string | null {
  const key = `${CHART_ROOT}/${path}`
  const known = CHART_ROOT_FILES[key] ?? CHART_DIST[key]
  if (known !== undefined) return known
  // The generated stylesheet is packed as well. Vitest does not process CSS, so a `?raw` import of
  // one arrives empty; it is read from disk, where the packed list already proved it exists.
  if (path.endsWith('.css')) return readFileSync(`${CHART_DIR}/${path}`, 'utf8')
  return null
}

/** Whether a packed path is skipped by the text sweep on purpose. */
export const isSourceMap = (path: string): boolean => /\.map$/.test(path)

// ── Direct dependencies ─────────────────────────────────────────────────────────────────────────

interface Manifest {
  name: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

export function chartManifest(): Manifest {
  return JSON.parse(CHART_ROOT_FILES[`${CHART_ROOT}/package.json`]!) as Manifest
}

const names = (m: Record<string, string> | undefined): string[] => Object.keys(m ?? {}).sort()

/** The manifest's direct edges by kind, each sorted by name. */
export function directDependencies(): { dependencies: string[]; peerDependencies: string[]; devDependencies: string[]; optionalDependencies: string[] } {
  const m = chartManifest()
  return {
    dependencies: names(m.dependencies),
    peerDependencies: names(m.peerDependencies),
    devDependencies: names(m.devDependencies),
    optionalDependencies: names(m.optionalDependencies),
  }
}

// ── The lockfile closure ────────────────────────────────────────────────────────────────────────

type DepMap = Record<string, string>
interface Importer {
  dependencies: DepMap
  devDependencies: DepMap
  optionalDependencies: DepMap
}
interface Snapshot {
  dependencies: DepMap
  optionalDependencies: DepMap
}
interface Lockfile {
  importers: Map<string, Importer>
  /** Registry snapshots keyed the way importers reference them: `name@version(peers)`. */
  snapshots: Map<string, Snapshot>
}

const lockfileText = (): string => LOCKFILE['/pnpm-lock.yaml']!

const unquote = (s: string): string => s.replace(/^'(.*)'$/, '$1')

/** A minimal reader for pnpm-lock.yaml v9: the `importers:` and `snapshots:` sections, which are
 *  the two the closure walk needs. Indentation is the grammar (two spaces per level), so no YAML
 *  library enters this package's test surface. */
export function readLockfile(): Lockfile {
  const lines = lockfileText().split(/\r?\n/)
  const importers = new Map<string, Importer>()
  const snapshots = new Map<string, Snapshot>()

  let section: 'importers' | 'snapshots' | null = null
  let importer: Importer | null = null
  let snapshot: Snapshot | null = null
  let depKind: keyof Importer | null = null
  let depName: string | null = null

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (line === '') continue
    if (/^\S/.test(line)) {
      section = line === 'importers:' ? 'importers' : line === 'snapshots:' ? 'snapshots' : null
      importer = null
      snapshot = null
      depKind = null
      depName = null
      continue
    }
    if (section === 'importers') {
      const head = /^  ([^\s:][^:]*):$/.exec(line)
      if (head) {
        importer = { dependencies: {}, devDependencies: {}, optionalDependencies: {} }
        importers.set(unquote(head[1]!), importer)
        depKind = null
        continue
      }
      const kind = /^    (dependencies|devDependencies|optionalDependencies):$/.exec(line)
      if (kind) {
        depKind = kind[1] as keyof Importer
        continue
      }
      const name = /^      ([^\s:][^:]*):$/.exec(line)
      if (name) {
        depName = unquote(name[1]!)
        continue
      }
      const version = /^        version: (.+)$/.exec(line)
      if (version && importer && depKind && depName) importer[depKind][depName] = version[1]!
      continue
    }
    if (section === 'snapshots') {
      const head = /^  (\S.*?):( \{\})?$/.exec(line)
      if (head) {
        snapshot = { dependencies: {}, optionalDependencies: {} }
        snapshots.set(unquote(head[1]!), snapshot)
        depKind = null
        continue
      }
      const kind = /^    (dependencies|optionalDependencies):$/.exec(line)
      if (kind) {
        depKind = kind[1] as keyof Importer
        continue
      }
      const dep = /^      ([^\s:][^:]*): (.+)$/.exec(line)
      if (dep && snapshot && (depKind === 'dependencies' || depKind === 'optionalDependencies')) snapshot[depKind][unquote(dep[1]!)] = dep[2]!
    }
  }
  return { importers, snapshots }
}

/** A workspace package's name from its manifest, by importer path (`packages/broker`). */
function workspaceName(importerPath: string): string {
  const text = WORKSPACE_MANIFESTS[`/${importerPath}/package.json`]
  if (!text) throw new Error(`no manifest for workspace importer ${importerPath}`)
  return (JSON.parse(text) as Manifest).name
}

export interface ClosureEdge {
  /** `@trdrs/broker` for a workspace link, `fancy-canvas@2.1.0` for a registry package. */
  id: string
  /** The package that pulled it in. */
  via: string
  workspace: boolean
}

/** What the packed artifact would drag in: the `dependencies` and `optionalDependencies` closure
 *  of the importer, walked across `link:` edges into sibling importers and across registry
 *  snapshots. Dev and peer edges are not shipped and are not walked. Sorted by id. */
export function shippedClosure(importerPath: string, lock: Lockfile = readLockfile()): ClosureEdge[] {
  const seen = new Map<string, ClosureEdge>()
  const walkImporter = (path: string, via: string): void => {
    const imp = lock.importers.get(path)
    if (!imp) throw new Error(`no lockfile importer ${path}`)
    for (const [name, version] of Object.entries({ ...imp.dependencies, ...imp.optionalDependencies })) visit(name, version, via, path)
  }
  const visit = (name: string, version: string, via: string, fromPath: string): void => {
    if (version.startsWith('link:')) {
      const target = resolveLink(fromPath, version.slice('link:'.length))
      const id = workspaceName(target)
      if (seen.has(id)) return
      seen.set(id, { id, via, workspace: true })
      walkImporter(target, id)
      return
    }
    const id = `${name}@${version}`
    if (seen.has(id)) return
    seen.set(id, { id, via, workspace: false })
    const snap = lock.snapshots.get(id)
    if (!snap) throw new Error(`no lockfile snapshot ${id}`)
    for (const [n, v] of Object.entries({ ...snap.dependencies, ...snap.optionalDependencies })) visit(n, v, id, fromPath)
  }
  walkImporter(importerPath, importerPath)
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** `packages/chart` plus `../broker` is `packages/broker`. */
function resolveLink(fromPath: string, rel: string): string {
  const parts = fromPath.split('/')
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return parts.join('/')
}
