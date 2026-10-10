// The published icon inventory held to the glyphs the chart draws, both ways: every glyph of the
// chart's own interface is drawn under a published id, the product's mark alone staying private;
// every drawing tool, arrangement and chart style carries its registry id; and every id stands for
// something the chart draws. The last block pins the one path: no module of the package draws a
// glyph of its own except the resolver and the two drawings the resolver hands a surface back to.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHART_STYLES } from '../../src/widget/styles'
import { COMPARE_EMPTY_MARK, ICONS, MARK_ICONS, OPERATOR_GLYPHS, SEARCH_EMPTY_MARK, STYLE_ICONS, type Glyph } from '../../src/ui/controls/icons'
import { TOOL_ICONS } from '../../src/ui/drawings/toolIcons'
import { ARRANGEMENT_ICONS } from '../../src/ui/chrome/arrangementGlyphs'
import { CHART_ICON_IDS, MIRRORED_ICONS, arrangementGlyphOf, checkIcons, iconOf, toolGlyph, type ChartIconId, type ChartIcons } from '../../src/ui/icons/catalog'

/** Every glyph of the chart's own tables, by the name a reader finds it under. */
const TABLES: readonly [string, Glyph][] = [
  ...Object.entries(ICONS).map(([name, mark]): [string, Glyph] => [`ICONS.${name}`, mark]),
  ...Object.entries(STYLE_ICONS).map(([name, mark]): [string, Glyph] => [`STYLE_ICONS.${name}`, mark]),
  ...Object.entries(OPERATOR_GLYPHS).map(([name, mark]): [string, Glyph] => [`OPERATOR_GLYPHS.${name}`, mark]),
  ...Object.entries(MARK_ICONS).map(([name, mark]): [string, Glyph] => [`MARK_ICONS.${name}`, mark]),
  ['COMPARE_EMPTY_MARK', COMPARE_EMPTY_MARK],
  ['SEARCH_EMPTY_MARK', SEARCH_EMPTY_MARK],
]

describe('the published inventory', () => {
  it('publishes every glyph of the chart’s own interface, and keeps the product’s mark its own', () => {
    expect(TABLES.filter(([, mark]) => iconOf(mark) === undefined).map(([name]) => name)).toEqual(['ICONS.productMark'])
  })

  it('gives every drawing tool, arrangement and chart style the id its registry gives it', () => {
    for (const type of Object.keys(TOOL_ICONS)) expect(iconOf(toolGlyph(type)!), type).toBe(`tool.${type}`)
    for (const code of Object.keys(ARRANGEMENT_ICONS)) expect(iconOf(arrangementGlyphOf(code)!), code).toBe(`layout.${code}`)
    for (const style of CHART_STYLES) expect(iconOf(STYLE_ICONS[style]), style).toBe(`style.${style}`)
  })

  it('names each mark glyph for its shape under `mark.`, on the 21 grid of the ring it stands in', () => {
    expect(CHART_ICON_IDS.filter((id) => id.startsWith('mark.'))).toEqual(['mark.bolt', 'mark.flag', 'mark.star', 'mark.clock', 'mark.exclamation'])
    for (const [id, mark] of Object.entries(MARK_ICONS)) {
      expect(iconOf(mark), id).toBe(id)
      expect(mark.viewBox, id).toBe('0 0 21 21')
      expect(mark.body, id).toContain(mark.path.d)
    }
  })

  it('lists each id once, and every id stands for a glyph the chart draws', () => {
    expect(new Set(CHART_ICON_IDS).size).toBe(CHART_ICON_IDS.length)
    const drawn = new Set([
      ...TABLES.map(([, mark]) => iconOf(mark)),
      ...Object.keys(TOOL_ICONS).map((type) => iconOf(toolGlyph(type)!)),
      ...Object.keys(ARRANGEMENT_ICONS).map((code) => iconOf(arrangementGlyphOf(code)!)),
    ])
    expect(CHART_ICON_IDS.filter((id) => !drawn.has(id))).toEqual([])
  })

  it('mirrors only icons it publishes', () => {
    for (const id of MIRRORED_ICONS) expect(CHART_ICON_IDS).toContain(id)
  })
})

describe('the id type is the inventory', () => {
  it('takes every published id and refuses any other at compile time', () => {
    const published: ChartIconId[] = ['settings', 'flyout', 'style.candles', 'tool.trend_line', 'layout.2h', 'layout.4']
    // Each line below fails to compile if the type ever widens past the inventory again.
    // @ts-expect-error: no drawing tool of that type wears a miniature
    const tool: ChartIconId = 'tool.nope'
    // @ts-expect-error: no arrangement of that code
    const layout: ChartIconId = 'layout.99'
    // @ts-expect-error: a glyph's own name is not an icon id; its meaning is
    const glyph: ChartIconId = 'gear'
    // @ts-expect-error: an object of icons refuses the same keys
    const icons: ChartIcons = { 'tool.nope': () => document.createElementNS('http://www.w3.org/2000/svg', 'svg') }
    for (const id of published) expect(CHART_ICON_IDS).toContain(id)
    for (const id of [tool, layout, glyph]) expect(CHART_ICON_IDS).not.toContain(id)
    expect(Object.keys(icons)).toEqual(['tool.nope'])
  })
})

describe('a host’s drawings are read before anything mounts', () => {
  it('takes none, or an object of factories by published id', () => {
    expect(() => checkIcons(undefined)).not.toThrow()
    expect(() => checkIcons({})).not.toThrow()
    expect(() => checkIcons({ settings: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'), 'tool.trend_line': undefined })).not.toThrow()
  })

  it('refuses a shape that is not an object of factories', () => {
    expect(() => checkIcons(null)).toThrow(new TypeError('icons must be an object'))
    expect(() => checkIcons([])).toThrow(new TypeError('icons must be an object'))
    expect(() => checkIcons('settings')).toThrow(new TypeError('icons must be an object'))
    expect(() => checkIcons({ settings: '<svg/>' })).toThrow(new TypeError('icons.settings must be a function that draws the icon'))
  })

  it('refuses an id nothing draws, naming where the ids are listed', () => {
    expect(() => checkIcons({ gear: () => null })).toThrow(new TypeError('icons.gear is not an icon the chart draws; CHART_ICON_IDS lists every one'))
    expect(() => checkIcons({ 'tool.nope': () => null })).toThrow(new TypeError('icons.tool.nope is not an icon the chart draws; CHART_ICON_IDS lists every one'))
  })
})

describe('one path draws every glyph', () => {
  const src = fileURLToPath(new URL('../../src', import.meta.url))
  const modules: { path: string; text: string }[] = []
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.ts')) modules.push({ path: relative(src, full).replace(/\\/g, '/'), text: readFileSync(full, 'utf8') })
    }
  }
  walk(src)

  it('draws the chart’s own glyphs from the tables only inside the resolver', () => {
    const importers = modules
      .filter(({ text }) => [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)].some(([, names, from]) => /(^|\/)dom$/.test(from!) && /(^|[\s,])glyph(\s+as\s+\w+)?\s*(,|$)/.test(names!.trim())))
      .map(({ path }) => path)
    expect(importers).toEqual(['ui/icons/resolver.ts'])
  })

  it('writes svg markup only in the chart’s own drawings', () => {
    const writers = modules.filter(({ text }) => /<svg\s/.test(text)).map(({ path }) => path)
    // The glyph drawer and the resolver draw the tables; the layout setup draws an arrangement its
    // host has not drawn, after asking the resolver; and the catalog writes the published artwork as
    // markup a host draws outside the chart, never into it.
    expect(writers.sort()).toEqual(['ui/chrome/dom.ts', 'ui/chrome/layoutSetup.ts', 'ui/icons/catalog.ts', 'ui/icons/resolver.ts'])
  })
})
