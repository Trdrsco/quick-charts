// The text-on-surface pairings the chrome introduces, measured under WCAG 2.2 in both built-in
// modes. The palette's own contrast rules cover ink over `chrome.surface`; the chrome also sets ink
// over the raised control fill (the symbol pill, the composer footer), over the overlay surface
// (every menu and dialog), the inverse ink over the emphasis fill (a primary action, a chosen row),
// the ink cut from the emphasis fill (a chosen day, time or starting point), the muted ink over the
// quiet fill (a calendar's weekday band), the surface ink over the primary fill (a checked tile, a
// selected class chip), the highlight ink of a search match, and the negative ink of an error notice
// over the overlay surface. Each is held to 4.5 to 1 for text.
import { describe, expect, it } from 'vitest'
import { contrastOf } from '../../src/theme/color'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { THEME_MODES, type ThemeRoleId } from '../../src/theme/schema'

const PAIRS: readonly { ink: ThemeRoleId; over: ThemeRoleId; where: string }[] = [
  { ink: 'text.primary', over: 'chrome.surfaceRaised', where: 'the symbol pill and the composer footer' },
  { ink: 'text.secondary', over: 'chrome.surfaceRaised', where: 'secondary ink on a raised control' },
  { ink: 'text.primary', over: 'overlay.surface', where: 'menu and dialog rows' },
  { ink: 'text.secondary', over: 'overlay.surface', where: 'menu hints and dialog descriptions' },
  { ink: 'text.muted', over: 'overlay.surface', where: 'menu headings and status footers' },
  { ink: 'text.inverse', over: 'control.on', where: 'a primary action, a chosen row and a held mode' },
  { ink: 'control.onInk', over: 'control.on', where: 'a chosen day, time or starting point' },
  { ink: 'text.muted', over: 'control.neutral', where: 'a calendar\'s weekday band' },
  { ink: 'overlay.surface', over: 'text.primary', where: 'a checked arrangement tile and a selected class chip' },
  { ink: 'status.negative', over: 'overlay.surface', where: 'an error notice' },
  { ink: 'text.highlight', over: 'overlay.surface', where: 'a search match highlight' },
  { ink: 'text.inverse', over: 'status.negative', where: 'the delete confirmation button' },
]

describe('the chrome pairings reach WCAG 2.2 AA', () => {
  for (const mode of THEME_MODES) {
    for (const pair of PAIRS) {
      it(`${mode}: ${pair.ink} over ${pair.over} (${pair.where})`, () => {
        const theme = BUILT_IN_THEMES[mode]
        const ratio = contrastOf(theme[pair.ink], theme[pair.over])
        expect(ratio).not.toBeNull()
        expect(Number(ratio!.toFixed(2))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})
