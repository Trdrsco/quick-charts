// The stylesheet contract: scoping, drift, and the two-instance guarantee.
//
// The composed stylesheet is built here from the same two inputs the generator uses, so this
// fixture judges the real artifact without needing a build to have run. `vectors.json` is the
// committed record of what the generator emits for the built-in palettes; editing a palette without
// rerunning `pnpm --filter quickcharts build:theme` fails the drift block below.
import { describe, expect, it } from 'vitest'
import { composeStylesheet, cssVarName, selectorsOf, themeBlock, themeDeclarations, THEME_ROOT_ATTRIBUTE, themeRootSelector } from '../../src/theme/css-contract'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES } from '../../src/theme/schema'
import { authoredStylesheet } from './stylesheetSource'
import vectors from './vectors.json'

const structural = authoredStylesheet()
const blocks = THEME_MODES.map((mode) => ({ mode, theme: BUILT_IN_THEMES[mode] }))
const css = composeStylesheet({ blocks, structural })

describe('the scoped stylesheet', () => {
  it('scopes every rule to the widget root, so a host document keeps its own styling', () => {
    const selectors = selectorsOf(css)
    expect(selectors.length).toBeGreaterThan(20)
    expect(selectors.filter((s) => !s.startsWith(`[${THEME_ROOT_ATTRIBUTE}`))).toEqual([])
  })

  it('carries no global reset and no document-level selector', () => {
    const selectors = selectorsOf(css)
    expect(selectors.filter((s) => /^(\*|html|body|:root)\b/.test(s))).toEqual([])
    // A bare universal selector is a reset; a scoped descendant of the root is not.
    expect(selectors.filter((s) => s === '*')).toEqual([])
  })

  it('fetches nothing at runtime: no import, no remote asset, no font download', () => {
    expect(css).not.toMatch(/@import/)
    expect(css).not.toMatch(/@font-face/)
    expect(css).not.toMatch(/url\(/)
    expect(css).not.toMatch(/https?:/)
  })

  it('answers forced colors and reduced motion', () => {
    expect(css).toMatch(/@media \(forced-colors: active\)/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('declares one custom property per role in each mode block, and reads only those', () => {
    for (const mode of THEME_MODES) {
      const block = themeBlock(mode, BUILT_IN_THEMES[mode])
      expect(block.startsWith(themeRootSelector(mode))).toBe(true)
      for (const role of THEME_ROLES) expect(block, `${mode} ${role.id}`).toContain(`${cssVarName(role.id)}: `)
    }
    const declared = new Set(THEME_ROLES.map((r) => cssVarName(r.id)))
    const read = [...structural.matchAll(/var\((--qc-[A-Za-z-]+)\)/g)].map((m) => m[1]!)
    expect(read.length).toBeGreaterThan(10)
    expect([...new Set(read)].filter((v) => !declared.has(v))).toEqual([])
  })
})

describe('generated-artifact drift', () => {
  it('matches the committed vectors for both built-in palettes', () => {
    expect(vectors.rootAttribute).toBe(THEME_ROOT_ATTRIBUTE)
    for (const mode of THEME_MODES) {
      expect(vectors.modes[mode], `${mode}: rerun pnpm --filter quickcharts build:theme`).toEqual(themeDeclarations(BUILT_IN_THEMES[mode]))
    }
  })

  it('records one vector per role per mode', () => {
    for (const mode of THEME_MODES) expect(vectors.modes[mode].length).toBe(THEME_ROLES.length)
  })
})

describe('two instances in one document', () => {
  it('resolve different variables from the same stylesheet', () => {
    const light = themeDeclarations(BUILT_IN_THEMES.light)
    const dark = themeDeclarations(BUILT_IN_THEMES.dark)
    expect(light.map((d) => d.property)).toEqual(dark.map((d) => d.property))
    const differing = light.filter((d, i) => d.value !== dark[i]!.value)
    expect(differing.length).toBeGreaterThan(20)
    // Both blocks live in one file, selected by the attribute value each root carries.
    expect(css).toContain(themeRootSelector('light'))
    expect(css).toContain(themeRootSelector('dark'))
  })
})
