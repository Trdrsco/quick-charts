// The packed artifact carries its internal seams (the
// drawing and indicator source modules are bundled into the one quickcharts artifact and are never
// installs of their own). Read from the built files themselves after `pnpm --filter quickcharts
// build`; without a build there is nothing packed to read and the checks pass vacuously, the same
// way the packed-declarations check does.
import { describe, expect, it } from 'vitest'
import { chartManifest, packedFileList, packedText } from './scan'

/** The three import forms a built file can carry: a static import or re-export with a `from`
 *  clause, a side-effect import, and a dynamic `import()`. */
const IMPORT_FORMS = [
  /^\s*(?:import|export)\b[^'"\n]*?\bfrom\s*['"]([^'"\n]+)['"]/gm,
  /^\s*import\s*['"]([^'"\n]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
]

/** Every bare module specifier a built file imports. */
function specifiers(text: string): string[] {
  const out = new Set<string>()
  for (const form of IMPORT_FORMS) for (const m of text.matchAll(form)) if (!m[1]!.startsWith('.')) out.add(m[1]!)
  return [...out].sort()
}

describe('the packed artifact bundles its internal seams', () => {
  const packed = packedFileList()
  const built = packed.filter((p) => /^dist\/.*\.(js|d\.ts)$/.test(p))

  it('reads every built file it packs', () => {
    for (const path of built) expect(packedText(path), path).not.toBeNull()
  })

  it('imports no @trdrs package from dist/index.js: the seams are inlined', () => {
    const js = packedText('dist/index.js')
    if (js === null) return // no build to read
    expect(specifiers(js).filter((s) => s.startsWith('@trdrs/'))).toEqual([])
    expect(js).not.toMatch(/@trdrs\//)
  })

  it('imports no @trdrs seam from dist/index.d.ts: the seam types are inlined', () => {
    const dts = packedText('dist/index.d.ts')
    if (dts === null) return
    expect(specifiers(dts).filter((s) => s.startsWith('@trdrs/'))).toEqual([])
    expect(dts).not.toMatch(/@trdrs\/chart-indicators|@trdrs\/chart-drawings/)
  })

  it('imports at runtime only what the manifest declares a consumer installs', () => {
    const js = packedText('dist/index.js')
    if (js === null) return
    const manifest = chartManifest()
    const installable = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})])
    for (const s of specifiers(js)) expect(installable.has(s), `dist/index.js imports ${s}, which the manifest does not give a consumer`).toBe(true)
  })
})

/** The shared chunks a built entry imports, as packed paths. */
const chunks = (text: string): string[] => [...text.matchAll(/from\s*['"]\.\/(chunk-[^'"]+)['"]/g)].map((m) => `dist/${m[1]!}`)

describe('the packed drawings subpath', () => {
  const packed = packedFileList()
  const manifest = chartManifest() as unknown as { exports?: Record<string, unknown>; publishConfig?: { exports?: Record<string, unknown> } }

  it('ships the files its export map points a consumer at', () => {
    // Both maps name dist/drawings.js and dist/drawings.d.ts, so `files` has to actually carry
    // them, or `import 'quickcharts/drawings'` resolves to nothing in an installed project.
    expect(Object.keys(manifest.exports ?? {})).toContain('./drawings')
    expect(Object.keys(manifest.publishConfig?.exports ?? {})).toContain('./drawings')
    if (packedText('dist/drawings.js') === null) return // no build to read
    expect(packed).toContain('dist/drawings.js')
    expect(packed).toContain('dist/drawings.d.ts')
  })

  it('imports nothing bare but the peer, and carries no @trdrs name', () => {
    const js = packedText('dist/drawings.js')
    const dts = packedText('dist/drawings.d.ts')
    if (js === null || dts === null) return
    // Empty is honest: the seam code the subpath re-exports sits in the shared chunk, and that is
    // where the peer import lands. What matters is that nothing else bare appears here.
    expect(specifiers(js).filter((s) => s !== 'lightweight-charts')).toEqual([])
    expect(js).not.toMatch(/@trdrs\//)
    expect(specifiers(dts).filter((s) => s.startsWith('@trdrs/'))).toEqual([])
  })

  it('SHARES the drawing seam with the root entry rather than duplicating it', () => {
    // `toolRegistry` is a module singleton. A consumer who restores a drawing through the subpath
    // while the widget renders it from the root has to reach the same instance, so both entries
    // import the seam from one shared chunk instead of each inlining a copy.
    const js = packedText('dist/drawings.js')
    const rootJs = packedText('dist/index.js')
    if (js === null || rootJs === null) return
    const shared = chunks(js).filter((c) => chunks(rootJs).includes(c))
    expect(chunks(js).length, 'the subpath reaches the seam through a chunk').toBeGreaterThan(0)
    expect(shared.length, 'a chunk both entries import').toBeGreaterThan(0)
    // The registry is CONSTRUCTED once, in one of those shared chunks, and neither entry carries a
    // second copy.
    for (const [name, text] of [
      ['dist/drawings.js', js],
      ['dist/index.js', rootJs],
    ] as const)
      expect(text.includes('new ToolRegistry('), `${name} inlines its own registry`).toBe(false)
    const holders = shared.filter((chunk) => /new ToolRegistry\(/.test(packedText(chunk) ?? ''))
    expect(holders.length, `the registry is built in exactly one shared chunk, found in ${JSON.stringify(holders)}`).toBe(1)
  })
})

describe('the packed REST adapter subpath', () => {
  const packed = packedFileList()

  it('ships the files its export map points a consumer at, and its schema beside them', () => {
    if (packedText('dist/adapters/rest.js') === null) return // no build to read
    expect(packed).toContain('dist/adapters/rest.js')
    expect(packed).toContain('dist/adapters/rest.d.ts')
    expect(packed).toContain('dist/rest-openapi.json')
  })

  it('imports nothing bare, and carries no @trdrs name', () => {
    const js = packedText('dist/adapters/rest.js')
    const dts = packedText('dist/adapters/rest.d.ts')
    if (js === null || dts === null) return
    expect(specifiers(js)).toEqual([])
    expect(js).not.toMatch(/@trdrs\//)
    expect(specifiers(dts).filter((s) => s.startsWith('@trdrs/'))).toEqual([])
  })

  it('is absent from the root entry and every chunk the root reaches', () => {
    // The adapter is optional because a consumer who never imports it ships none of it, and a
    // chart that never mounts it makes no request. That is only true while nothing the root reaches
    // pulls it in, so the built files say so rather than the intention.
    const rootJs = packedText('dist/index.js')
    if (rootJs === null) return
    const reachable = ['dist/index.js', ...chunks(rootJs)]
    for (const file of reachable) {
      const text = packedText(file)
      expect(text, file).not.toBeNull()
      expect(text!.includes('createRestSaveLoadAdapter'), `${file} carries the REST adapter`).toBe(false)
      expect(text!.includes('RestSaveLoadError'), `${file} carries the REST adapter`).toBe(false)
    }
  })

  it('carries the wire contract it implements, and none of the schema rendering', () => {
    // The OpenAPI document is a build artifact, not runtime behavior: a consumer who imports the
    // adapter downloads the transport, not the schema that describes it.
    const js = packedText('dist/adapters/rest.js')
    if (js === null) return
    expect(js).toMatch(/if-match/)
    expect(js.includes('openapi')).toBe(false)
    expect(js.includes('#/components/schemas/')).toBe(false)
  })
})
