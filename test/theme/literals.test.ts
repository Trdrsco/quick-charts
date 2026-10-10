// One place holds a theme color. `palettes.ts` is the only file in the package allowed to write a
// hex or rgb literal for a role, and the authored stylesheets write none: every value they paint
// comes from a generated custom property, or from a system color keyword under forced colors.
//
// The sweep is the whole package source. A DOM module that needs a visual gets a `.qc-*` recipe in
// a stylesheet, which resolves against the custom properties the theme generates, so there is no
// second place a color could live. The stylesheets are the structural file plus every component
// recipe file the generator concatenates after it; each is swept on its own so an offender is
// named by file.
//
// The documented exceptions are exceptions by kind rather than by oversight. The compare palette
// and the built-in indicator colors are a chart's own data colors, which a host overrides per
// instance and a mode does not re-resolve. The color control's swatches are the set of colors the
// chart OFFERS a viewer rather than any color it paints itself: the viewer's pick becomes a drawing
// or indicator property, the same ten hues and ten greys stand in both modes, and no role resolves
// them. Each exception is a named, exported palette in a file whose whole job is to state one.
import { describe, expect, it } from 'vitest'
import { offenderText, scanFiles } from '../boundary/scan'
import { authoredStylesheets } from './stylesheetSource'

const THEME_SOURCES = import.meta.glob('/src/**/*.ts', { query: '?raw', import: 'default', eager: true })
const STYLE_SOURCES: Record<string, string> = authoredStylesheets()

/** A written color value, in either notation a palette may use. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/

const PALETTES = '/src/theme/palettes.ts'

/** The documented series defaults: a chart's own data colors, which a host overrides per instance
 *  and a mode does not re-resolve. Each is a named, exported palette rather than a literal buried in
 *  a painter, which is what keeps the exemption honest. */
/** The drawing seam's per-tool default styles: a drawing carries its own colors, which a host
 *  overrides per drawing and a mode does not re-resolve, so they are defaults of the tool rather
 *  than roles of the theme. */
const DRAWING_DEFAULTS = '/src/internal/drawings/'

const SERIES_DEFAULTS = [
  '/src/compare.ts',
  '/src/builtInIndicators.ts',
  '/src/indicatorModel.ts',
  // The built-in indicators' named plot palette: the same kind of exported series default, in the
  // indicator seam rather than the chart.
  '/src/internal/indicators/palette.ts',
]

/** The color control's offered set: the grey ramp, the ten hue bases the shade rows mix from, and
 *  the value the custom editor opens on. These are the colors the chart offers a viewer to choose,
 *  not colors it paints on its own account, so no mode re-resolves them and no role owns them. */
const PICKER_PALETTE = '/src/ui/controls/color/palette.ts'

describe('the package holds its colors in one file', () => {
  it('reads the package source and every authored stylesheet', () => {
    expect(Object.keys(THEME_SOURCES)).toContain(PALETTES)
    expect(Object.keys(THEME_SOURCES).length).toBeGreaterThan(30)
    expect(Object.keys(STYLE_SOURCES)).toContain('/src/styles/quickcharts.css')
    // Every chrome surface keeps a recipe file, and each is judged here by name.
    for (const surface of ['chrome', 'menu', 'topbar', 'timeframe', 'search', 'indicators', 'layouts', 'settings', 'bottombar', 'status', 'replay', 'toasts']) {
      expect(Object.keys(STYLE_SOURCES)).toContain(`/src/styles/components/${surface}.css`)
    }
    expect(STYLE_SOURCES['/src/styles/quickcharts.css']!.length).toBeGreaterThan(1000)
  })

  it('writes no color literal outside the palettes and the documented series defaults', () => {
    const exempt = new Set([PALETTES, PICKER_PALETTE, ...SERIES_DEFAULTS])
    const others = Object.fromEntries(
      Object.entries(THEME_SOURCES).filter(([file]) => !exempt.has(file) && !file.startsWith(DRAWING_DEFAULTS)),
    )
    expect(scanFiles(others, COLOR_LITERAL).map(offenderText)).toEqual([])
  })

  it('writes every built-in color in the palettes, so the pin has something to protect', () => {
    expect(scanFiles({ [PALETTES]: THEME_SOURCES[PALETTES]! }, COLOR_LITERAL).length).toBeGreaterThan(40)
  })

  it('writes the picker palette in the picker palette, so that exemption is pinned too', () => {
    // Nine lines carry the offered set: the grey ramp, the ten bases, the six ramps under them,
    // and the custom editor's opening color. An offered color that drifted into a control module
    // would fail the sweep above instead.
    expect(scanFiles({ [PICKER_PALETTE]: THEME_SOURCES[PICKER_PALETTE]! }, COLOR_LITERAL).length).toBe(9)
  })

  it('paints every stylesheet from custom properties alone', () => {
    expect(scanFiles(STYLE_SOURCES, COLOR_LITERAL).map(offenderText)).toEqual([])
  })
})

/** A written duration, such as `150ms` or `.3s`. */
const DURATION_LITERAL = /(?<![\w.-])(?:\d+|\d*\.\d+)m?s\b/
/** A written timing function: a keyword, or a curve, step or piecewise function. `linear-gradient`
 *  is an image, not a timing function, so it does not count. */
const EASING_LITERAL = /\b(?:cubic-bezier|steps)\(|(?<![\w-])(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end)(?![\w-])/
/** A written scale factor, the size a surface grows from or shrinks to. A factor of one or minus one
 *  is the identity or a mirror, which is geometry rather than motion. */
const SCALE_LITERAL = /\bscale(?:X|Y|Z|3d)?\(\s*(?!-?1\s*[,)])-?[\d.]|(?<![\w-])scale:\s*(?!-?1\s*[;}])-?[\d.]/

/** A stylesheet with its comments blanked, line for line, so prose about motion is not motion and
 *  an offender keeps its line number. */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))

describe('the stylesheets hold every motion value as a role', () => {
  const styles = Object.fromEntries(Object.entries(STYLE_SOURCES).map(([file, text]) => [file, withoutComments(text)]))

  it('writes no duration literal: every duration reads a motion role, which reduced motion zeroes', () => {
    expect(scanFiles(styles, DURATION_LITERAL).map(offenderText)).toEqual([])
  })

  it('writes no timing function literal', () => {
    expect(scanFiles(styles, EASING_LITERAL).map(offenderText)).toEqual([])
  })

  it('writes no motion scale literal', () => {
    expect(scanFiles(styles, SCALE_LITERAL).map(offenderText)).toEqual([])
  })

  it('catches each kind of literal, so an empty answer means something', () => {
    const probe = { probe: 'a { transition: opacity 150ms ease-out, scale .2s cubic-bezier(0, 0, 1, 1); scale: 0.97; transform: scale(0.97) scaleX(-1); background: linear-gradient(red, blue) }' }
    expect(scanFiles(probe, DURATION_LITERAL)).toHaveLength(1)
    expect(scanFiles(probe, EASING_LITERAL)).toHaveLength(1)
    expect(scanFiles(probe, SCALE_LITERAL)).toHaveLength(1)
    expect(DURATION_LITERAL.test('var(--qc-motion-durationBase) var(--qc-motion-easingOut)')).toBe(false)
    expect(EASING_LITERAL.test('linear-gradient(to top, red, blue)')).toBe(false)
    expect(['150ms', '.2s', '1s'].every((value) => DURATION_LITERAL.test(`opacity ${value}`))).toBe(true)
    expect(['ease', 'ease-in-out', 'linear', 'steps(4)'].every((value) => EASING_LITERAL.test(`opacity 1ms ${value}`))).toBe(true)
  })
})
