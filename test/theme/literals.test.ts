// One place holds a color. `palettes.ts` is the only file in the theme source allowed to write a
// hex or rgb literal, and the authored stylesheet writes none at all: every value it paints comes
// from a generated custom property.
//
// This pin is scoped to the theme source and the stylesheet, which is the surface W2-C owns. The
// widget's DOM modules still carry theme-dependent literals; W3-A widens this sweep to the whole
// package when it moves them onto roles.
import { describe, expect, it } from 'vitest'
import { offenderText, scanFiles } from '../boundary/scan'
import { authoredStylesheet } from './stylesheetSource'

const THEME_SOURCES = import.meta.glob('/packages/chart/src/theme/**/*.ts', { query: '?raw', import: 'default', eager: true })
const STYLESHEET = '/packages/chart/src/styles/quickcharts.css'
const STYLE_SOURCES: Record<string, string> = { [STYLESHEET]: authoredStylesheet() }

/** A written color value, in either notation a palette may use. */
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(\s*[\d.]/

const PALETTES = '/packages/chart/src/theme/palettes.ts'

describe('the theme source holds its colors in one file', () => {
  it('reads the theme source and the stylesheet', () => {
    expect(Object.keys(THEME_SOURCES)).toContain(PALETTES)
    expect(Object.keys(THEME_SOURCES).length).toBeGreaterThan(5)
    expect(STYLE_SOURCES[STYLESHEET]!.length).toBeGreaterThan(1000)
  })

  it('writes no color literal outside the palettes', () => {
    const others = Object.fromEntries(Object.entries(THEME_SOURCES).filter(([file]) => file !== PALETTES))
    expect(scanFiles(others, COLOR_LITERAL).map(offenderText)).toEqual([])
  })

  it('writes every built-in color in the palettes, so the pin has something to protect', () => {
    expect(scanFiles({ [PALETTES]: THEME_SOURCES[PALETTES]! }, COLOR_LITERAL).length).toBeGreaterThan(40)
  })

  it('paints the stylesheet from custom properties alone', () => {
    expect(scanFiles(STYLE_SOURCES, COLOR_LITERAL).map(offenderText)).toEqual([])
  })
})
