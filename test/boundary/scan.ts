// The shared readers for the Quick Charts boundary fixtures. Three sources of truth, each read the
// way a consumer would meet it:
//
//   - the SOURCE: every file under src, through Vite's own glob (this package is
//     browser-typed; no node:fs), keyed by repository-relative path;
//   - the PACKED FILE LIST: what `npm pack --dry-run --json` says a registry would receive, so a
//     fixture reads the manifest's `files` semantics the way npm applies them rather than the way
//     we remember them. The text of each packed file arrives through the same Vite globs, and a
//     packed file with no reader is a failure, never a silent gap;
//   - the DEPENDENCY EDGES: package.json's direct edges by kind, so what a reader's installer
//     would follow is read from the manifest rather than from memory.
//
// Paths are root-relative with forward slashes on every platform, so an offender reads the same in
// a Windows and a CI log.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** Every chart source, keyed by root-relative path. */
export const CHART_SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true })

/** Every chart test and fixture, keyed by root-relative path. The boundary folder itself is in the
 *  map (the glob is honest); a sweep that must not read its own patterns excludes it by name. */
export const CHART_FIXTURES = import.meta.glob('/test/**/*.ts', { query: '?raw', import: 'default', eager: true })

/** The chart's manifest and the documents npm packs beside it. */
const CHART_ROOT_FILES = import.meta.glob(['/*.md', '/LICENSE', '/NOTICE', '/package.json'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** The built artifact, when a build has run. Source maps are left out on purpose: their
 *  `sourcesContent` is the source the source sweep already reads. The generated theme manifest is
 *  packed beside the bundle, so JSON is read here too; the generated stylesheet is not, because
 *  vitest does not process CSS and `packedText` reads it from disk instead. */
const CHART_DIST = import.meta.glob('/dist/**/*.{js,ts,json}', { query: '?raw', import: 'default', eager: true })

/** The repository root, as the glob keys spell it. */
export const CHART_ROOT = ''

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
