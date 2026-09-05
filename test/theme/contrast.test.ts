// Readability, computed rather than judged. Every role that declares contrast rules is measured
// against each ground it reads over, in both built-in modes, using the WCAG 2.2 ratio. A ground
// that is a translucent tint (the hover or selected fill) is flattened onto the surface the rule
// names before measuring, because that is the color the eye meets.
//
// Text roles are held to 4.5 to 1, the AA minimum for text under 18pt. Non-text indicators, such as
// the focus ring and the strong border, are held to 3 to 1 under WCAG 1.4.11. `text.disabled`
// declares no rule: WCAG exempts an inactive user interface component from a contrast minimum.
//
// A palette edit that drops a value below its threshold fails here with the measured ratio in the
// message, so the fix is a value rather than a waiver.
import { describe, expect, it } from 'vitest'
import { contrastOf } from '../../src/theme/color'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { THEME_MODES, THEME_ROLES, type SemanticTheme, type ThemeContrastRule } from '../../src/theme/schema'

const GATED = THEME_ROLES.filter((r): r is typeof r & { contrast: readonly ThemeContrastRule[] } => 'contrast' in r)

/** One role's value, read by id. The role ids in a contrast rule are plain strings, so the lookup
 *  is written once here rather than cast at every call. */
const value = (theme: SemanticTheme, id: string): string => (theme as Record<string, string>)[id]!

describe('WCAG 2.2 contrast in both built-in modes', () => {
  it('gates every role that carries a readability requirement', () => {
    expect(GATED.map((r) => r.id).sort()).toEqual([
      'chrome.borderStrong',
      'scale.crosshairLabelText',
      'scale.text',
      'state.accent',
      'state.focusRing',
      'status.info',
      'status.negative',
      'status.positive',
      'status.warning',
      'text.inverse',
      'text.link',
      'text.muted',
      'text.onCanvas',
      'text.primary',
      'text.secondary',
    ])
  })

  for (const mode of THEME_MODES) {
    for (const role of GATED) {
      for (const rule of role.contrast) {
        const ground = rule.on ? `${rule.over} on ${rule.on}` : rule.over
        it(`${mode}: ${role.id} over ${ground} reaches ${rule.min} to 1`, () => {
          const theme = BUILT_IN_THEMES[mode]
          const ratio = contrastOf(value(theme, role.id), value(theme, rule.over), rule.on ? value(theme, rule.on) : undefined)
          expect(ratio, `${role.id} or ${ground} is not a measurable color`).not.toBeNull()
          expect(Number(ratio!.toFixed(2))).toBeGreaterThanOrEqual(rule.min)
        })
      }
    }
  }

  it('measures a tinted ground as the eye meets it: flattened onto the surface it is drawn on', () => {
    // Half-opacity white over a dark surface is a mid grey; the same tint read against white is
    // nearly white, which is the wrong answer for a menu row.
    expect(contrastOf('#ffffff', 'rgba(255, 255, 255, 0.5)', '#000000')!).toBeCloseTo(contrastOf('#ffffff', '#808080')!, 1)
    expect(contrastOf('#ffffff', 'rgba(255, 255, 255, 0.5)')!).toBeCloseTo(1, 5)
    expect(contrastOf('#ffffff', '#000000', 'not-a-color')).toBeNull()
  })

  it('leaves an inactive control exempt, as WCAG 2.2 does', () => {
    const disabled = THEME_ROLES.find((r) => r.id === 'text.disabled')!
    expect('contrast' in disabled).toBe(false)
  })
})

describe('the contrast arithmetic itself', () => {
  it('agrees with the WCAG worked values at both ends of the range', () => {
    expect(contrastOf('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastOf('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    // Order does not matter: the ratio is defined on the lighter and darker of the pair.
    expect(contrastOf('#ffffff', '#000000')).toBeCloseTo(21, 5)
  })

  it('composites a translucent foreground onto its backdrop before measuring', () => {
    // Half-opacity black over white is the same measurement as the opaque mid grey it renders as.
    expect(contrastOf('rgba(0, 0, 0, 0.5)', '#ffffff')!).toBeCloseTo(contrastOf('#808080', '#ffffff')!, 1)
  })

  it('reports nothing for a value it cannot measure', () => {
    expect(contrastOf('rebeccapurple', '#ffffff')).toBeNull()
    expect(contrastOf('#ffffff', 'currentColor')).toBeNull()
  })
})
