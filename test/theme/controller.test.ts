// The runtime contract a host writes against: mode selection, custom palettes, reset, validation
// diagnostics, and the subscription's unsubscribe.
//
// The behavior these fixtures pin is that a change is atomic and announced once. Every subscriber
// sees one complete theme, never a half-applied palette, and a call that resolves to the theme
// already in effect announces nothing.
import { describe, expect, it, vi } from 'vitest'
import { createThemeController } from '../../src/theme/controller'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { resolveSemanticTheme } from '../../src/theme/resolve'
import { validateCustomThemes } from '../../src/theme/validate'

describe('the theme controller', () => {
  it('starts dark, and starts in the mode a host names', () => {
    expect(createThemeController().mode()).toBe('dark')
    expect(createThemeController({ mode: 'light' }).mode()).toBe('light')
    expect(createThemeController({ mode: 'light' }).get()).toEqual(BUILT_IN_THEMES.light)
  })

  it('switches mode and publishes the complete new theme once', () => {
    const controller = createThemeController({ mode: 'light' })
    const heard = vi.fn()
    controller.onChange(heard)
    controller.setMode('dark')
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith(BUILT_IN_THEMES.dark, 'dark')
    expect(controller.mode()).toBe('dark')
  })

  it('says nothing when a call resolves to the theme already in effect', () => {
    const controller = createThemeController({ mode: 'dark' })
    const heard = vi.fn()
    controller.onChange(heard)
    controller.setMode('dark')
    controller.resetCustom()
    expect(heard).not.toHaveBeenCalled()
  })

  it('applies a partial custom palette over the built-in one, leaving unnamed roles alone', () => {
    const controller = createThemeController({ mode: 'dark' })
    const heard = vi.fn()
    controller.onChange(heard)
    controller.applyCustom({ dark: { 'state.accent': '#ff8800' } })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(controller.get()['state.accent']).toBe('#ff8800')
    expect(controller.get()['text.primary']).toBe(BUILT_IN_THEMES.dark['text.primary'])
  })

  it('holds a palette for the mode it names and applies it when that mode is selected', () => {
    const controller = createThemeController({ mode: 'dark' })
    controller.applyCustom({ light: { 'state.accent': '#00aa55' } })
    expect(controller.get()['state.accent']).toBe(BUILT_IN_THEMES.dark['state.accent'])
    controller.setMode('light')
    expect(controller.get()['state.accent']).toBe('#00aa55')
  })

  it('returns to the built-in palettes on reset, and announces that once', () => {
    const controller = createThemeController({ mode: 'light', custom: { light: { 'canvas.background': '#fffbe6' } } })
    expect(controller.get()['canvas.background']).toBe('#fffbe6')
    const heard = vi.fn()
    controller.onChange(heard)
    controller.resetCustom()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(controller.get()).toEqual(BUILT_IN_THEMES.light)
  })

  it('stops calling a listener that unsubscribed, and keeps the others', () => {
    const controller = createThemeController({ mode: 'light' })
    const first = vi.fn()
    const second = vi.fn()
    const stop = controller.onChange(first)
    controller.onChange(second)
    stop()
    controller.setMode('dark')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('reports a bad entry, keeps the built-in value, and still renders', () => {
    const controller = createThemeController({ mode: 'dark', custom: { dark: { 'state.accent': 'not-a-color' } } })
    expect(controller.get()['state.accent']).toBe(BUILT_IN_THEMES.dark['state.accent'])
    expect(controller.diagnostics()).toEqual([
      { mode: 'dark', role: 'state.accent', code: 'invalid-value', message: 'state.accent needs a CSS color in hex or rgb notation. It received not-a-color.' },
    ])
  })

  it('hands out a frozen theme, so a consumer cannot mutate the palette it was given', () => {
    const theme = createThemeController().get()
    expect(Object.isFrozen(theme)).toBe(true)
  })
})

describe('validation of a host palette', () => {
  it('accepts every notation a palette may use', () => {
    expect(
      validateCustomThemes({
        light: {
          'state.accent': '#08f',
          'state.hover': '#0088ff40',
          'overlay.scrim': 'rgba(0, 0, 0, 0.5)',
          'canvas.background': 'rgb(255 255 255 / 80%)',
          'chrome.radius': '0.25rem',
          'motion.durationBase': '0.2s',
          'overlay.shadow': 'none',
          'text.fontFamily': 'Inter, sans-serif',
        },
      }),
    ).toEqual([])
  })

  it('names a key that is not a role', () => {
    expect(validateCustomThemes({ dark: { 'text.headline': '#fff' } as never })).toEqual([
      { mode: 'dark', role: 'text.headline', code: 'unknown-role', message: 'text.headline is not a Quick Charts theme role.' },
    ])
  })

  it('holds a value to the kind of the role it is written for', () => {
    const diagnostics = validateCustomThemes({ light: { 'chrome.radius': '#ffffff', 'motion.durationFast': '4px', 'canvas.background': '12px' } })
    expect(diagnostics.map((d) => `${d.role}: ${d.code}`)).toEqual([
      'canvas.background: invalid-value',
      'chrome.radius: invalid-value',
      'motion.durationFast: invalid-value',
    ])
  })

  it('rejects an empty value rather than resolving to a blank declaration', () => {
    expect(validateCustomThemes({ dark: { 'text.fontFamily': '  ' } })).toEqual([
      { mode: 'dark', role: 'text.fontFamily', code: 'empty-value', message: 'text.fontFamily needs a non-empty string value.' },
    ])
  })

  it('treats no custom palette as nothing to report', () => {
    expect(validateCustomThemes(null)).toEqual([])
    expect(validateCustomThemes({})).toEqual([])
  })
})

describe('resolution', () => {
  it('is complete for every mode with no custom palette', () => {
    for (const mode of ['light', 'dark'] as const) {
      const resolution = resolveSemanticTheme(mode)
      expect(resolution.theme).toEqual(BUILT_IN_THEMES[mode])
      expect(resolution.diagnostics).toEqual([])
    }
  })

  it('drops a rejected entry without dropping the role it failed to replace', () => {
    const resolution = resolveSemanticTheme('light', { light: { 'canvas.background': 'nope', 'chrome.surface': '#fafafa' } })
    expect(resolution.theme['canvas.background']).toBe(BUILT_IN_THEMES.light['canvas.background'])
    expect(resolution.theme['chrome.surface']).toBe('#fafafa')
    expect(resolution.diagnostics.map((d) => d.role)).toEqual(['canvas.background'])
  })
})
