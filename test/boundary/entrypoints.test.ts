// Export-map delivery and SSR-safe import of every entrypoint: CSP-safe static stylesheet use, no
// runtime style injection, no remote assets. The published export map names three entries; every one
// has to be a file the tarball carries, and both JavaScript entries have to load in a plain Node process
// with no window and no document, because a server-rendered host imports the package long before any
// chart mounts. The dist blocks are vacuous until a build has run, like the other packed fixtures.
import { execFileSync } from 'node:child_process'
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
  it('names the same three entries in the workspace map and the published map', () => {
    expect(Object.keys(workspace).sort()).toEqual(['.', './drawings', './styles.css'])
    expect(Object.keys(published).sort()).toEqual(['.', './drawings', './styles.css'])
  })

  it('points every published entry at a dist file, with declarations beside each JavaScript entry', () => {
    expect(target(published['.']!, 'import')).toBe('./dist/index.js')
    expect(target(published['.']!, 'types')).toBe('./dist/index.d.ts')
    expect(target(published['./drawings']!, 'import')).toBe('./dist/drawings.js')
    expect(target(published['./drawings']!, 'types')).toBe('./dist/drawings.d.ts')
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

  it('no entry touches the document at import time', () => {
    if (!built) return
    // Module-level code that reads `document` or `window` is what breaks a server import; a reference
    // inside a function body is fine and is what the mount does.
    for (const file of ['dist/index.js', 'dist/drawings.js']) {
      const text = packedText(file)!
      const topLevel = text
        .split('\n')
        .filter((line) => /^(const|let|var)\s+\w+\s*=\s*(window|document)\b/.test(line))
      expect(topLevel, file).toEqual([])
    }
  })
})
