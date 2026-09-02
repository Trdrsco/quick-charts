// Provenance. The built-in neutrals, panel ground, muted ink, panel radius, elevation shadow and
// type sizes are derived from the signed live reference corpus in
// `docs/corpus/advanced-charts-styles/`, which records how one mature chart product renders a
// complete UI in both modes. This fixture reads those recorded computed values and holds the
// palettes to them, so a palette edit that quietly abandons the evidence fails.
//
// Tolerance is stated per row and is zero for every derived row today: each of these values was
// taken from the measurement rather than approximated toward it.
//
// Divergence is also pinned. Where a measured value cannot meet the readability gate the role
// carries, the palette keeps a different value and the row below records both the measurement and
// the reason, so the departure stays a decision rather than a drift.
import { describe, expect, it } from 'vitest'
import { contrastOf, parseCssColor } from '../../src/theme/color'
import { DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import type { SemanticTheme } from '../../src/theme/schema'

const CAPTURES = import.meta.glob('/docs/corpus/advanced-charts-styles/*-computed-styles.json', { query: '?raw', import: 'default', eager: true })

interface Capture {
  styles: Record<string, Record<string, string> | null>
}

/** One recorded capture, by its file name. */
function capture(name: string): Capture {
  const text = CAPTURES[`/docs/corpus/advanced-charts-styles/${name}-computed-styles.json`]
  if (!text) throw new Error(`no corpus capture named ${name}`)
  return JSON.parse(text) as Capture
}

/** One recorded property of one recorded role. */
function measured(name: string, role: string, property: string): string {
  const styles = capture(name).styles[role]
  if (!styles) throw new Error(`${name} recorded no ${role}`)
  const value = styles[property]
  if (value === undefined) throw new Error(`${name} recorded no ${property} for ${role}`)
  return value
}

interface DerivedRow {
  role: keyof SemanticTheme
  theme: SemanticTheme
  capture: string
  from: string
  property: string
  /** Largest allowed per-channel difference for a color row. Zero means the value is the measurement. */
  maxChannelDelta: number
}

const DERIVED: DerivedRow[] = [
  { role: 'text.primary', theme: LIGHT_THEME, capture: 'light-base', from: 'body', property: 'color', maxChannelDelta: 0 },
  { role: 'text.primary', theme: DARK_THEME, capture: 'dark-base', from: 'body', property: 'color', maxChannelDelta: 0 },
  { role: 'chrome.surface', theme: LIGHT_THEME, capture: 'light-surfaces', from: 'dialogBackdrop', property: 'backgroundColor', maxChannelDelta: 0 },
  { role: 'chrome.surface', theme: DARK_THEME, capture: 'dark-surfaces', from: 'dialogBackdrop', property: 'backgroundColor', maxChannelDelta: 0 },
  { role: 'overlay.surface', theme: LIGHT_THEME, capture: 'light-surfaces', from: 'dialogBackdrop', property: 'backgroundColor', maxChannelDelta: 0 },
  { role: 'overlay.surface', theme: DARK_THEME, capture: 'dark-surfaces', from: 'dialogBackdrop', property: 'backgroundColor', maxChannelDelta: 0 },
  { role: 'text.muted', theme: DARK_THEME, capture: 'dark-surfaces', from: 'selected', property: 'color', maxChannelDelta: 0 },
  { role: 'status.positive', theme: DARK_THEME, capture: 'dark-surfaces', from: 'positiveValue', property: 'color', maxChannelDelta: 0 },
]

describe('palette provenance in the signed reference corpus', () => {
  for (const row of DERIVED) {
    const mode = row.theme === LIGHT_THEME ? 'light' : 'dark'
    it(`${mode}: ${row.role} is the ${row.capture} ${row.from} ${row.property}, within ${row.maxChannelDelta}`, () => {
      const recorded = parseCssColor(measured(row.capture, row.from, row.property))
      const ours = parseCssColor(row.theme[row.role])
      expect(recorded, 'the capture records a measurable color').not.toBeNull()
      expect(ours, 'the palette writes a measurable color').not.toBeNull()
      for (const channel of ['r', 'g', 'b'] as const) {
        expect(Math.abs(ours![channel] - recorded![channel]), `${row.role} ${channel}`).toBeLessThanOrEqual(row.maxChannelDelta)
      }
    })
  }

  it('takes the panel radius from the recorded dialog in both modes', () => {
    expect(measured('light-surfaces', 'dialogBackdrop', 'borderRadius')).toBe('6px')
    expect(measured('dark-surfaces', 'dialogBackdrop', 'borderRadius')).toBe('6px')
    expect(LIGHT_THEME['chrome.radiusLarge']).toBe('6px')
    expect(DARK_THEME['chrome.radiusLarge']).toBe('6px')
  })

  it('takes the elevation shadow geometry and alpha from the recorded dialog in each mode', () => {
    expect(measured('light-surfaces', 'dialogBackdrop', 'boxShadow')).toBe('rgba(0, 0, 0, 0.2) 0px 2px 4px 0px')
    expect(measured('dark-surfaces', 'dialogBackdrop', 'boxShadow')).toBe('rgba(0, 0, 0, 0.4) 0px 2px 4px 0px')
    expect(LIGHT_THEME['overlay.shadow']).toBe('0 2px 4px rgba(0, 0, 0, 0.2)')
    expect(DARK_THEME['overlay.shadow']).toBe('0 2px 4px rgba(0, 0, 0, 0.4)')
  })

  it('takes the two type sizes canvas and chrome must agree on from the recorded body and legend', () => {
    expect(measured('light-base', 'body', 'fontSize')).toBe('14px')
    expect(measured('light-base', 'legend', 'fontSize')).toBe('13px')
    expect(LIGHT_THEME['text.fontSizeTitle']).toBe('14px')
    expect(LIGHT_THEME['text.fontSizeAxis']).toBe('13px')
  })
})

describe('documented divergence from the corpus', () => {
  it('light status.positive departs from the measured value, which cannot meet the text gate', () => {
    const recorded = measured('dark-surfaces', 'positiveValue', 'color')
    expect(recorded).toBe('rgb(8, 153, 129)')
    // The same value the dark palette keeps reads at well under 4.5 to 1 on the light panel.
    expect(contrastOf(recorded, LIGHT_THEME['chrome.surface'])!).toBeLessThan(4.5)
    expect(LIGHT_THEME['status.positive']).not.toBe('#089981')
    expect(contrastOf(LIGHT_THEME['status.positive'], LIGHT_THEME['chrome.surface'])!).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the documented brand pair as the series defaults, which the corpus does not describe', () => {
    // The corpus records a positive VALUE ink, not a series color, so it does not displace the pair.
    expect(LIGHT_THEME['series.up']).toBe('#4c98fb')
    expect(LIGHT_THEME['series.down']).toBe('#f23645')
    expect(DARK_THEME['series.up']).toBe('#4c98fb')
    expect(DARK_THEME['series.down']).toBe('#f23645')
  })
})
