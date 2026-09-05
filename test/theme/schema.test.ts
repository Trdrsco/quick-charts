// The schema is the theme system's only authority, so this fixture holds it to being complete and
// self-consistent: every role declared once, both built-in palettes covering exactly the declared
// roles, every contrast rule pointing at a role that exists, and every value valid for its kind.
//
// A role added without a value in both palettes fails here rather than rendering as `undefined` in
// a consumer's chart.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_THEMES, DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import { isThemeRoleId, THEME_MODES, THEME_ROLE_BY_ID, THEME_ROLE_IDS, THEME_ROLES } from '../../src/theme/schema'
import { validateCustomThemes } from '../../src/theme/validate'

const ids = THEME_ROLES.map((r) => r.id)

describe('the semantic role inventory', () => {
  it('declares every role exactly once', () => {
    expect(new Set(ids).size).toBe(ids.length)
    expect(THEME_ROLE_IDS).toEqual([...ids].sort())
    expect(Object.keys(THEME_ROLE_BY_ID).sort()).toEqual([...ids].sort())
  })

  it('names each role after the family it belongs to', () => {
    const wrong = THEME_ROLES.filter((r) => !r.id.startsWith(`${r.family}.`)).map((r) => r.id)
    expect(wrong).toEqual([])
  })

  it('describes every role in one published sentence, with no em dash', () => {
    const bad = THEME_ROLES.filter((r) => r.description.length < 12 || !r.description.endsWith('.') || r.description.includes('—')).map((r) => r.id)
    expect(bad).toEqual([])
  })

  it('points every contrast rule at roles that exist, at a WCAG 2.2 threshold', () => {
    for (const role of THEME_ROLES) {
      if (!('contrast' in role)) continue
      expect(role.contrast.length, `${role.id} declares at least one ground`).toBeGreaterThan(0)
      for (const rule of role.contrast) {
        expect(isThemeRoleId(rule.over), `${role.id} reads over ${rule.over}`).toBe(true)
        if ('on' in rule) expect(isThemeRoleId(rule.on), `${role.id} reads over ${rule.over} on ${rule.on}`).toBe(true)
        expect([3, 4.5], `${role.id} threshold`).toContain(rule.min)
      }
    }
  })

  it('recognizes its own ids and nothing else', () => {
    expect(isThemeRoleId('text.primary')).toBe(true)
    expect(isThemeRoleId('text.notARole')).toBe(false)
  })
})

describe('the built-in palettes', () => {
  it('covers every declared role in both modes, and declares nothing else', () => {
    for (const mode of THEME_MODES) {
      expect(Object.keys(BUILT_IN_THEMES[mode]).sort(), mode).toEqual([...ids].sort())
    }
    expect(BUILT_IN_THEMES.light).toBe(LIGHT_THEME)
    expect(BUILT_IN_THEMES.dark).toBe(DARK_THEME)
  })

  it('writes a value that is valid for the role kind, in both modes', () => {
    // The palettes are complete themes, so validating them as custom palettes exercises every kind.
    expect(validateCustomThemes({ light: LIGHT_THEME, dark: DARK_THEME })).toEqual([])
  })

  it('gives the two modes different grounds and inks', () => {
    expect(LIGHT_THEME['canvas.background']).not.toBe(DARK_THEME['canvas.background'])
    expect(LIGHT_THEME['chrome.surface']).not.toBe(DARK_THEME['chrome.surface'])
    expect(LIGHT_THEME['text.primary']).not.toBe(DARK_THEME['text.primary'])
  })

  it('shares the type roles across modes: canvas and DOM agree regardless of mode', () => {
    for (const role of THEME_ROLES.filter((r) => r.kind === 'length' || r.kind === 'font' || r.kind === 'duration')) {
      expect(LIGHT_THEME[role.id], role.id).toBe(DARK_THEME[role.id])
    }
  })
})
