// @vitest-environment happy-dom
// The neutral marks as the chart draws them: the color a mark wears in each mode.
import { describe, expect, it } from 'vitest'
import { DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
import { markColor, markersOf } from '../../src/widget/marks'
import type { BarMark, MarkColor, TimescaleMark } from '../../src/marks'

describe('a mark’s color', () => {
  it('resolves a theme role through the mode’s own palette', () => {
    expect(markColor('info', DARK_THEME, 'dark')).toBe(DARK_THEME['status.info'])
    expect(markColor('info', LIGHT_THEME, 'light')).toBe(LIGHT_THEME['status.info'])
    expect(markColor('up', DARK_THEME, 'dark')).toBe(DARK_THEME['series.up'])
  })

  it('wears the side of a pair the mode in effect names', () => {
    const pair: MarkColor = { light: '#7b1fa2', dark: '#ab47bc' }
    expect(markColor(pair, DARK_THEME, 'dark')).toBe('#ab47bc')
    expect(markColor(pair, LIGHT_THEME, 'light')).toBe('#7b1fa2')
    const bar: BarMark = { id: 'a', time: 60, color: pair }
    expect(markersOf([bar], DARK_THEME, 'dark')[0]!.color).toBe('#ab47bc')
    expect(markersOf([bar], LIGHT_THEME, 'light')[0]!.color).toBe('#7b1fa2')
  })

  it('refuses a single literal color, which paints in the neutral role in both modes', () => {
    // @ts-expect-error: one color for both modes is not a mark color
    const literal: TimescaleMark = { id: 'a', time: 60, color: '#ab47bc' }
    expect(markColor(literal.color, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
    expect(markColor(literal.color, LIGHT_THEME, 'light')).toBe(LIGHT_THEME['series.neutral'])
  })

  it('refuses a pair with a side it cannot paint, in both modes', () => {
    const broken = { light: 'var(--ink)', dark: '#ab47bc' }
    expect(markColor(broken, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
    expect(markColor(broken, LIGHT_THEME, 'light')).toBe(LIGHT_THEME['series.neutral'])
    // @ts-expect-error: a pair names both modes
    const half: MarkColor = { dark: '#ab47bc' }
    expect(markColor(half, DARK_THEME, 'dark')).toBe(DARK_THEME['series.neutral'])
  })
})
