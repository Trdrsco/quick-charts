// The range presets, their availability against a symbol's history depth, the framing math, and
// the navigation step rules.
import { describe, expect, it } from 'vitest'
import { createChartI18n } from '../src/i18n'
import { frameRange, MIN_BAR_SPACING, RANGE_PRESETS, rangeAvailable, rangePresetTip, rangeSpanSeconds, SCROLL_STEP_BARS, scrolledPosition, ZOOM_FACTOR, zoomedBarSpacing } from '../src/ranges'
import { parseTimeframe } from '../src/timeframe'

const DAY = 86_400
const t = createChartI18n().t
// A Monday in July 2026, UTC noon.
const NOW = Date.UTC(2026, 6, 13, 12) / 1000

describe('the nine presets', () => {
  it('are nine, in bar order, each with a parsable interval and a catalog name', () => {
    expect(RANGE_PRESETS.map((r) => r.key)).toEqual(['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'])
    for (const r of RANGE_PRESETS) {
      expect(parseTimeframe(r.tf), r.key).not.toBeNull()
      expect(r.label.startsWith('range.'), r.key).toBe(true)
    }
    expect(RANGE_PRESETS.map((r) => r.tf)).toEqual(['1m', '5m', '30m', '1h', '2h', '1d', '1d', '1w', '1mo'])
  })

  it('measures a span back from now; the year to date counts from the UTC year start', () => {
    expect(rangeSpanSeconds(5 * DAY, NOW)).toBe(5 * DAY)
    expect(rangeSpanSeconds('ytd', NOW)).toBe(NOW - Date.UTC(2026, 0, 1) / 1000)
    expect(rangeSpanSeconds('all', NOW)).toBeNull()
  })

  it('writes the tooltip from the preset name and its interval', () => {
    expect(rangePresetTip(t, RANGE_PRESETS[0]!)).toBe('1 Day · 1 Minute bars')
    expect(rangePresetTip(t, RANGE_PRESETS[8]!)).toBe('All data · 1 Month bars')
  })
})

describe('rangeAvailable', () => {
  const by = (key: string) => RANGE_PRESETS.find((r) => r.key === key)!

  it('withholds a preset deeper than the history that exists; All always stays', () => {
    const listedLastYear = NOW - 400 * DAY
    expect(rangeAvailable(by('1Y'), listedLastYear, NOW)).toBe(true)
    expect(rangeAvailable(by('5Y'), listedLastYear, NOW)).toBe(false)
    expect(rangeAvailable(by('All'), listedLastYear, NOW)).toBe(true)
    expect(rangeAvailable(by('5Y'), NOW - 6 * 365 * DAY, NOW)).toBe(true)
  })

  it('offers the year to date only when the history reaches the year start', () => {
    expect(rangeAvailable(by('YTD'), Date.UTC(2025, 11, 31) / 1000, NOW)).toBe(true)
    expect(rangeAvailable(by('YTD'), Date.UTC(2026, 2, 1) / 1000, NOW)).toBe(false)
  })

  it('withholds nothing while the depth is unknown', () => {
    for (const r of RANGE_PRESETS) {
      expect(rangeAvailable(r, null, NOW)).toBe(true)
      expect(rangeAvailable(r, undefined, NOW)).toBe(true)
    }
  })
})

describe('framing a range on a pane', () => {
  const chart = () => {
    const calls: { from: number; to: number }[] = []
    return { calls, api: { timeScale: () => ({ setVisibleLogicalRange: (r: { from: number; to: number }) => void calls.push(r) }) } }
  }
  // A series carries a future-whitespace horizon past the last real bar; framing must anchor on the
  // last REAL candle or the window is mostly empty space.
  const series = (real: number, whitespace: number) => ({
    data: () => [...Array.from({ length: real }, () => ({ close: 1 })), ...Array.from({ length: whitespace }, () => ({}))],
  })

  it('anchors on the last real candle, never the whitespace horizon', () => {
    const c = chart()
    frameRange(c.api, series(100, 40), DAY, '1m', NOW) // one day of 1m bars
    expect(c.calls[0]!.to).toBe(103) // 99 (last real) + 4, not 139
  })

  it("reads the span in the pane's own interval", () => {
    const min = chart()
    frameRange(min.api, series(2000, 10), DAY, '1m', NOW)
    const hour = chart()
    frameRange(hour.api, series(2000, 10), DAY, '1h', NOW)
    // the same span is 1440 bars of 1m and 24 bars of 1h
    expect(min.calls[0]!.from).toBe(1999 + 1 - 1440)
    expect(hour.calls[0]!.from).toBe(1999 + 1 - 24)
  })

  it('never frames fewer than ten bars nor more than the series holds', () => {
    const few = chart()
    frameRange(few.api, series(2000, 0), 60, '1h', NOW)
    expect(few.calls[0]!.from).toBe(1999 + 1 - 10)
    const many = chart()
    frameRange(many.api, series(50, 0), 5 * 365 * DAY, '1d', NOW)
    expect(many.calls[0]!.from).toBe(0)
  })

  it('frames everything loaded for All, with the same right pad', () => {
    const c = chart()
    frameRange(c.api, series(300, 20), 'all', '1mo', NOW)
    expect(c.calls[0]).toEqual({ from: -1, to: 305 })
  })

  it('an empty series, or an unreadable interval, frames nothing rather than a bogus window', () => {
    const empty = chart()
    frameRange(empty.api, series(0, 30), DAY, '1m', NOW)
    expect(empty.calls).toHaveLength(0)
    const junk = chart()
    frameRange(junk.api, series(100, 0), DAY, 'junk', NOW)
    expect(junk.calls).toHaveLength(0)
  })
})

describe('the navigation steps', () => {
  it('zooms by the factor and never below the minimum spacing', () => {
    expect(ZOOM_FACTOR).toBe(1.25)
    expect(zoomedBarSpacing(8, 'in')).toBe(10)
    expect(zoomedBarSpacing(10, 'out')).toBe(8)
    expect(zoomedBarSpacing(0.5, 'out')).toBe(MIN_BAR_SPACING)
    expect(zoomedBarSpacing(0.55, 'out')).toBe(MIN_BAR_SPACING)
  })

  it('scrolls by ten bars either way', () => {
    expect(SCROLL_STEP_BARS).toBe(10)
    expect(scrolledPosition(3, 'right')).toBe(13)
    expect(scrolledPosition(3, 'left')).toBe(-7)
  })
})
