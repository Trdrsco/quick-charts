// The packed artifact carries its internal seams (public-chart-library-boundary-plan.md: the
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
