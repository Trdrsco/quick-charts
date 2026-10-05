// Export-map delivery and SSR-safe import of every entrypoint: CSP-safe static stylesheet use, no
// runtime style injection, no remote assets. The published export map names seven entries; every one
// has to be a file the tarball carries, and all six JavaScript entries have to load in a plain Node
// process with no window and no document, because a server-rendered host imports the package long
// before any chart mounts. The format, glyphs and symbols entries go further: nothing reachable from one may
// name a window, a document or a DOM type at all, so a host with no DOM imports them as they are. The
// dist blocks are vacuous until a build has run, like the other packed fixtures.
import { execFileSync } from 'node:child_process'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import manifest from '../../package.json'
import { CHART_DIR, packedFileList, packedText } from './scan'

type ExportEntry = string | { types?: string; import?: string }
const published = manifest.publishConfig.exports as Record<string, ExportEntry>
const workspace = manifest.exports as Record<string, string>

/** The file an export condition points at, relative to the package root. */
const target = (entry: ExportEntry, condition: 'import' | 'types'): string | null => (typeof entry === 'string' ? entry : (entry[condition] ?? null))

const built = packedText('dist/index.js') !== null

describe('the export map', () => {
  it('names the same seven entries in the workspace map and the published map', () => {
    expect(Object.keys(workspace).sort()).toEqual(['.', './adapters/rest', './drawings', './format', './glyphs', './styles.css', './symbols'])
    expect(Object.keys(published).sort()).toEqual(['.', './adapters/rest', './drawings', './format', './glyphs', './styles.css', './symbols'])
  })

  it('points every published entry at a dist file, with declarations beside each JavaScript entry', () => {
    expect(target(published['.']!, 'import')).toBe('./dist/index.js')
    expect(target(published['.']!, 'types')).toBe('./dist/index.d.ts')
    expect(target(published['./drawings']!, 'import')).toBe('./dist/drawings.js')
    expect(target(published['./drawings']!, 'types')).toBe('./dist/drawings.d.ts')
    expect(target(published['./adapters/rest']!, 'import')).toBe('./dist/adapters/rest.js')
    expect(target(published['./adapters/rest']!, 'types')).toBe('./dist/adapters/rest.d.ts')
    expect(target(published['./format']!, 'import')).toBe('./dist/format.js')
    expect(target(published['./format']!, 'types')).toBe('./dist/format.d.ts')
    expect(target(published['./glyphs']!, 'import')).toBe('./dist/glyphs.js')
    expect(target(published['./glyphs']!, 'types')).toBe('./dist/glyphs.d.ts')
    expect(target(published['./symbols']!, 'import')).toBe('./dist/symbols.js')
    expect(target(published['./symbols']!, 'types')).toBe('./dist/symbols.d.ts')
    expect(published['./styles.css']).toBe('./dist/quickcharts.css')
  })

  it('packs every file the published map points at', () => {
    if (!built) return
    const packed = packedFileList()
    for (const [name, entry] of Object.entries(published)) {
      for (const condition of ['import', 'types'] as const) {
        const file = target(entry, condition)
        if (file) expect(packed, `${name} ${condition}`).toContain(file.replace(/^\.\//, ''))
      }
    }
  })
})

describe('SSR-safe import', () => {
  /** Load one built entry in a fresh Node process with no DOM at all, and answer what it exported. */
  function importInNode(file: string, symbol: string): string {
    const script = `import(${JSON.stringify(new URL(file, `file:///${CHART_DIR.replace(/\\/g, '/')}/`).href)}).then((m) => { process.stdout.write(typeof m[${JSON.stringify(symbol)}]) })`
    return execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 30_000 })
  }

  it('the root entry loads without a window or a document, and its constructor is a function', () => {
    if (!built) return
    expect(importInNode('dist/index.js', 'createChart')).toBe('function')
  })

  it('the drawings entry loads the same way, and its catalog is an object', () => {
    if (!built) return
    expect(importInNode('dist/drawings.js', 'drawingTools')).toBe('object')
  })

  it('the REST adapter entry loads the same way, and its constructor is a function', () => {
    // A server-rendered host imports it beside the root; constructing one is not a request, so the
    // import has to be as inert here as everything else.
    if (!built) return
    expect(importInNode('dist/adapters/rest.js', 'createRestSaveLoadAdapter')).toBe('function')
  })

  it('the format entry loads the same way, and its formatter factory is a function', () => {
    if (!built) return
    expect(importInNode('dist/format.js', 'createPriceFormatter')).toBe('function')
  })

  it('the glyphs entry loads the same way, and its emoji list is an object', () => {
    if (!built) return
    expect(importInNode('dist/glyphs.js', 'EMOJI_CATEGORIES')).toBe('object')
  })

  it('the symbols entry loads the same way, and its naming rule is a function', () => {
    if (!built) return
    expect(importInNode('dist/symbols.js', 'symbolNames')).toBe('function')
  })

  it('no entry touches the document at import time', () => {
    if (!built) return
    // Module-level code that reads `document` or `window` is what breaks a server import; a reference
    // inside a function body is fine and is what the mount does.
    for (const file of ['dist/index.js', 'dist/drawings.js', 'dist/adapters/rest.js', 'dist/format.js', 'dist/glyphs.js', 'dist/symbols.js']) {
      const text = packedText(file)!
      const topLevel = text
        .split('\n')
        .filter((line) => /^(const|let|var)\s+\w+\s*=\s*(window|document)\b/.test(line))
      expect(topLevel, file).toEqual([])
    }
  })
})

/** Each platform-neutral entry, the modules it may reach, and the file it builds to. */
const NEUTRAL = [
  { name: 'format', source: 'src/format.ts', reaches: ['src/format.ts', 'src/priceFormatter.ts', 'src/symbology.ts'], built: 'dist/format.js' },
  { name: 'glyphs', source: 'src/glyphs.ts', reaches: ['src/drawings/glyphs.ts', 'src/glyphs.ts'], built: 'dist/glyphs.js' },
  // The naming rule reads the search row and symbol shapes as types alone, so their modules are on the
  // walk and nothing of theirs is in the build.
  { name: 'symbols', source: 'src/symbols.ts', reaches: ['src/datafeed.ts', 'src/marks.ts', 'src/symbolLabel.ts', 'src/symbology.ts', 'src/symbols.ts'], built: 'dist/symbols.js' },
]

describe.each(NEUTRAL)('the $name entry is platform-neutral', ({ source, reaches, built: file }) => {
  it('reaches only its own modules, and typechecks with no DOM library', () => {
    // The compiler walks every module the entry reaches. Given the language library alone, a
    // `window`, a `document` or a DOM type anywhere on that walk is a compile error, so an empty
    // diagnostic list is the proof, and the walk itself names what the entry carries.
    const program = ts.createProgram([`${CHART_DIR}/${source}`], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts'],
      types: [],
      strict: true,
      noEmit: true,
    })
    const reached = program
      .getSourceFiles()
      .map((sourceFile) => sourceFile.fileName.replace(/\\/g, '/'))
      .filter((path) => !path.includes('/node_modules/'))
      .map((path) => path.slice(CHART_DIR.replace(/\\/g, '/').length + 1))
      .sort()
    expect(reached).toEqual(reaches)
    const problems = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
    expect(problems).toEqual([])
  })

  it('builds to files that never name a window, a document or a navigator', () => {
    if (!built) return
    // The entry and every chunk it imports, followed through the import statements esbuild writes.
    const seen = new Set<string>()
    const visit = (path: string): void => {
      if (seen.has(path)) return
      seen.add(path)
      const text = packedText(path)
      expect(text, path).not.toBeNull()
      for (const [, next] of text!.matchAll(/from\s+["']\.\/([^"']+)["']/g)) visit(`dist/${next}`)
    }
    visit(file)
    for (const path of seen) expect(packedText(path)!, path).not.toMatch(/\b(window|document|navigator|HTMLElement)\b/)
  })
})
