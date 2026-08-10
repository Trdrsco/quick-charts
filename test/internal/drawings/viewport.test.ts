import { describe, expect, it } from 'vitest'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { viewportOf } from '../src/core/drawing'

// The stub reproduces the library's contract exactly as MEASURED live, because the previous stub
// did not and certified a fallback production never executes:
//   - `timeToCoordinate` resolves only times present in the data as bars of the current grid.
//   - `logicalToCoordinate` is exact for INTEGER indices inside the data (even off-screen) and
//     answers 0 — the pane's left edge, not null — for EVERY fractional logical and for integers
//     outside the data. Verified against a 1,845-bar series: index 0 → -11448.34px, 1820.5 → 0.
//   - The visible logical range's endpoints are continuous scroll positions — ALWAYS fractional in
//     a real frame. A stub with integer endpoints hides the poisoning entirely.
//   - `options().barSpacing` equals the true px-per-bar slope to full precision.

const BAR = 60
const N = 100
const T0 = 1_700_000_000
const PX = 8
// Fractional on both ends, with the right edge past the data — the standard right-offset frame.
const VISIBLE = { from: 40.37, to: 104.62 }

function stubPair(times?: number[]): { chart: IChartApi; series: ISeriesApi<SeriesType> } {
  const ts0 = times ?? Array.from({ length: N }, (_, i) => T0 + i * BAR)
  const idx = new Map(ts0.map((t, i) => [t, i]))
  const xOfLogical = (l: number) => (l - VISIBLE.from) * PX
  const ts = {
    width: () => 400,
    getVisibleLogicalRange: () => VISIBLE,
    options: () => ({ barSpacing: PX }),
    timeToCoordinate: (t: Time) => (idx.has(t as number) ? xOfLogical(idx.get(t as number)!) : null),
    coordinateToLogical: (x: number) => VISIBLE.from + x / PX,
    logicalToCoordinate: (l: number) =>
      Number.isInteger(l) && l >= 0 && l <= ts0.length - 1 ? xOfLogical(l) : 0, // 0, NOT null — the measured pathology
    coordinateToTime: (x: number) => {
      const i = Math.round(VISIBLE.from + x / PX)
      return (ts0[i] ?? null) as Time | null
    },
  }
  const chart = { timeScale: () => ts, paneSize: () => ({ height: 300, width: 400 }) } as unknown as IChartApi
  const series = {
    data: () => ts0.map((t) => ({ time: t as Time, close: 1 })),
    priceToCoordinate: (p: number) => p,
    coordinateToPrice: (y: number) => y,
  } as unknown as ISeriesApi<SeriesType>
  return { chart, series }
}

const xOfLogical = (l: number) => (l - VISIBLE.from) * PX

describe('viewport time→x for anchors between bars of the current grid', () => {
  it('maps an in-data time through the library directly', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    expect(vp.xOf((T0 + 50 * BAR) as Time)).toBeCloseTo(xOfLogical(50), 6)
  })

  it('maps a time HALFWAY between two bars — a finer-grid anchor after a timeframe switch', () => {
    // The regression this suite exists for: an anchor placed on 30m sits at :30 past the hour on an
    // hourly chart, the library resolves neither the time nor the fractional logical, and the old
    // visible-range calibration was dead in every real frame — the drawing painted nothing.
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    expect(vp.xOf((T0 + 50 * BAR + BAR / 2) as Time)).toBeCloseTo(xOfLogical(50.5), 6)
  })

  it('places a between-bars time proportionally ACROSS a session gap, not at a phantom bar count', () => {
    // 1h bars with a 48h weekend gap after index 2. A time 12h into the gap lands a quarter of the
    // way between bars 2 and 3 — uniform-interval math would put it 12 whole bars to the right.
    const times = [T0, T0 + 3600, T0 + 7200, T0 + 7200 + 48 * 3600, T0 + 7200 + 49 * 3600]
    const { chart, series } = stubPair(times)
    const vp = viewportOf(chart, series)!
    expect(vp.logicalOf((T0 + 7200 + 12 * 3600) as Time)).toBeCloseTo(2 + 12 / 48, 6)
    expect(vp.logicalOf((T0 + 3600 + 1800) as Time)).toBeCloseTo(1.5, 6)
  })

  it('extrapolates an off-data time linearly instead of trusting the poisoned 0', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    const t = T0 + (N - 1 + 1000) * BAR + 1 // 1000 bars past the end, +1s so no direct resolve
    const x = vp.xOf(t as Time)
    expect(x).not.toBe(0)
    expect(x).toBeCloseTo(xOfLogical(99 + (1000 * BAR + 1) / BAR), 0)
  })

  it('gives two far anchors distinct xs, so a line cannot collapse vertical', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    const a = vp.xOf((T0 - 5000 * BAR + 1) as Time)
    const b = vp.xOf((T0 - 4000 * BAR + 1) as Time)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(Math.abs((b as number) - (a as number))).toBeCloseTo(1000 * PX, 0)
  })

  it('round-trips a between-bars time through logicalOf → timeOfLogical exactly', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    const t = T0 + 50 * BAR + 42
    expect(vp.timeOfLogical(vp.logicalOf(t as Time)!)).toBe(t)
  })

  it('answers a whitespace x with an extrapolated time, never the left-edge bar', () => {
    // timeAt in right-offset whitespace: coordinateToTime is null there, the logical is fractional,
    // and routing it through logicalToCoordinate would answer 0 → the LEFT edge bar's time. The
    // data-based inverse must extrapolate on the trailing interval instead.
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    const xPast = xOfLogical(N - 1 + 5.5) // 5.5 bars past the last bar
    expect(vp.timeAt(xPast)).toBeCloseTo(T0 + (N - 1 + 5.5) * BAR, 6)
  })

  it('declines when the series is empty', () => {
    const { chart, series } = stubPair()
    const empty = { ...series, data: () => [] } as unknown as ISeriesApi<SeriesType>
    const vp = viewportOf(chart, empty)!
    expect(vp.xOf((T0 + 12345 * BAR + 1) as Time)).toBeNull()
    expect(vp.timeOfLogical(5)).toBeNull()
  })
})
