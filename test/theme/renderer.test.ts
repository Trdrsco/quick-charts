// What the widget writes on its root, and what the canvas draws with. Both are pure projections of
// one resolved theme, which is what lets a mode switch land on the DOM and the canvas in one pass.
import { describe, expect, it } from 'vitest'
import { cssVarName, THEME_ROOT_ATTRIBUTE } from '../../src/theme/css-contract'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { canvasTheme, themeRootStyle } from '../../src/theme/renderer'
import { THEME_ROLES } from '../../src/theme/schema'

describe('the instance root style', () => {
  it('carries the scoped attribute for the mode and one declaration per role', () => {
    const style = themeRootStyle('light', BUILT_IN_THEMES.light)
    expect(style.attribute).toEqual({ name: THEME_ROOT_ATTRIBUTE, value: 'light' })
    expect(style.declarations.length).toBe(THEME_ROLES.length)
    expect(style.declarations.map((d) => d.property)).toEqual(THEME_ROLES.map((r) => cssVarName(r.id)).sort())
  })

  it('maps a role id to its private property name', () => {
    expect(cssVarName('text.primary')).toBe('--qc-text-primary')
    expect(cssVarName('scale.crosshairLabelBackground')).toBe('--qc-scale-crosshairLabelBackground')
  })

  it('gives two roots in different modes the same properties with different values', () => {
    const light = themeRootStyle('light', BUILT_IN_THEMES.light)
    const dark = themeRootStyle('dark', BUILT_IN_THEMES.dark)
    expect(light.attribute.value).not.toBe(dark.attribute.value)
    expect(light.declarations.map((d) => d.property)).toEqual(dark.declarations.map((d) => d.property))
    expect(light.declarations).not.toEqual(dark.declarations)
  })
})

describe('the canvas projection', () => {
  it('reads the plot, scale, session and series roles of the resolved theme', () => {
    const canvas = canvasTheme(BUILT_IN_THEMES.dark)
    expect(canvas.background).toBe(BUILT_IN_THEMES.dark['canvas.background'])
    expect(canvas.grid).toBe(BUILT_IN_THEMES.dark['scale.grid'])
    expect(canvas.axisText).toBe(BUILT_IN_THEMES.dark['scale.text'])
    expect(canvas.up).toBe(BUILT_IN_THEMES.dark['series.up'])
    expect(canvas.down).toBe(BUILT_IN_THEMES.dark['series.down'])
    expect(canvas.session.closed).toBe(BUILT_IN_THEMES.dark['scale.sessionClosed'])
  })

  it('hands the canvas a number for the size a stylesheet cannot reach', () => {
    expect(canvasTheme(BUILT_IN_THEMES.light).fontSize).toBe(13)
    expect(canvasTheme({ ...BUILT_IN_THEMES.light, 'text.fontSizeAxis': '15px' }).fontSize).toBe(15)
  })
})
