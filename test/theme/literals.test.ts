// One place holds a color. `palettes.ts` is the only file in the package allowed to write a hex or
// rgb literal, and the authored stylesheet writes none: every value it paints comes from a
// generated custom property, or from a system color keyword under forced colors.
//
// The sweep is the whole package source. A DOM module that needs a visual gets a `.qc-*` recipe in
// the stylesheet, which resolves against the custom properties the theme generates, so there is no
// second place a color could live.
//
// The two documented SERIES defaults are the exception, and they are exceptions by kind rather than
// by oversight: the compare palette and the built-in study colors are a chart's own data colors,
// which a host overrides per instance and a mode does not re-resolve.
import { describe, expect, it } from 'vitest'
import { offenderText, scanFiles } from '../boundary/scan'
import { authoredStylesheet } from './stylesheetSource'

const THEME_SOURCES = import.meta.glob('/packages/chart/src/**/*.ts', { query: '?raw', import: 'default', eager: true })
const STYLESHEET = '/packages/chart/src/styles/quickcharts.css'
const STYLE_SOURCES: Record<string, string> = { [STYLESHEET]: authoredStylesheet() }

/** A written color value, in either notation a palette may use. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/

const PALETTES = '/packages/chart/src/theme/palettes.ts'

/** The documented series defaults: a chart's own data colors, which a host overrides per instance
 *  and a mode does not re-resolve. Each is a named, exported palette rather than a literal buried in
 *  a painter, which is what keeps the exemption honest. */
const SERIES_DEFAULTS = [
  '/packages/chart/src/compare.ts',
  '/packages/chart/src/overrides.ts',
  '/packages/chart/src/builtInIndicators.ts',
  '/packages/chart/src/indicatorModel.ts',
]

describe('the package holds its colors in one file', () => {
  it('reads the package source and the stylesheet', () => {
    expect(Object.keys(THEME_SOURCES)).toContain(PALETTES)
    expect(Object.keys(THEME_SOURCES).length).toBeGreaterThan(30)
    expect(STYLE_SOURCES[STYLESHEET]!.length).toBeGreaterThan(1000)
  })

  it('writes no color literal outside the palettes and the documented series defaults', () => {
    const exempt = new Set([PALETTES, ...SERIES_DEFAULTS])
    const others = Object.fromEntries(Object.entries(THEME_SOURCES).filter(([file]) => !exempt.has(file)))
    expect(scanFiles(others, COLOR_LITERAL).map(offenderText)).toEqual([])
  })

  it('writes every built-in color in the palettes, so the pin has something to protect', () => {
    expect(scanFiles({ [PALETTES]: THEME_SOURCES[PALETTES]! }, COLOR_LITERAL).length).toBeGreaterThan(40)
  })

  it('paints the stylesheet from custom properties alone', () => {
    expect(scanFiles(STYLE_SOURCES, COLOR_LITERAL).map(offenderText)).toEqual([])
  })
})
