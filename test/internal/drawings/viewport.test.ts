import { describe, expect, it } from 'vitest'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { viewportOf } from '../src/core/drawing'

// The library's `logicalToCoordinate` does not go null for an index far outside its addressable
// window — it returns 0, the pane's left edge (measured live: logical 14398 against a 956-row series
// came back 0). `xOf` used to trust that, which collapsed BOTH ends of any drawing anchored beyond
// loaded history onto x=0 and painted it as a vertical sliver at the edge. The viewport now calibrates
// a linear map from two in-range logicals — where the library is trustworthy — and extrapolates, so an
// off-history anchor gets its true off-screen x and the canvas clips the segment through the pane.
//
// The stub reproduces the library's contract exactly as observed: time→coordinate resolves only for
// times present in the data, logical→coordinate is linear inside the addressable window and returns 0
// outside it.

const BAR = 60
const N = 100
const T0 = 1_700_000_000

function stubPair(): { chart: IChartApi; series: ISeriesApi<SeriesType> } {
  const times = Array.from({ length: N }, (_, i) => T0 + i * BAR)
  const idx = new Map(times.map((t, i) => [t, i]))
  const pxPerBar = 8
  const addressable = { from: -50, to: N + 50 } // the window the real library resolves within
  const visible = { from: 40, to: 90 }
  const ts = {
    width: () => 400,
    getVisibleLogicalRange: () => visible,
    timeToCoordinate: (t: Time) => (idx.has(t as number) ? (idx.get(t as number)! - visible.from) * pxPerBar : null),
    coordinateToLogical: (x: number) => visible.from + x / pxPerBar,
    logicalToCoordinate: (l: number) =>
      l < addressable.from || l > addressable.to ? 0 : (l - visible.from) * pxPerBar, // 0, NOT null — the measured pathology
    coordinateToTime: (x: number) => {
      const i = Math.round(visible.from + x / pxPerBar)
      return (times[i] ?? null) as Time | null
    },
  }
  const chart = { timeScale: () => ts, paneSize: () => ({ height: 300, width: 400 }) } as unknown as IChartApi
  const series = {
    data: () => times.map((t) => ({ time: t as Time, close: 1 })),
    priceToCoordinate: (p: number) => p,
    coordinateToPrice: (y: number) => y,
  } as unknown as ISeriesApi<SeriesType>
  return { chart, series }
}

describe('viewport time→x beyond loaded history', () => {
  it('maps an in-data time through the library directly', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    expect(vp.xOf((T0 + 50 * BAR) as Time)).toBe((50 - 40) * 8)
  })

  it('extrapolates an off-data time linearly instead of trusting the clamped 0', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    // 1000 bars past the end: logical = 99 + 1000, far outside the addressable window, where the
    // library answers 0. The true x is (1099 - 40) * 8.
    const t = T0 + (N - 1 + 1000) * BAR + 1 // +1s so timeToCoordinate cannot resolve it directly
    const x = vp.xOf(t as Time)
    expect(x).not.toBe(0)
    expect(x).toBeCloseTo((99 + (1000 * BAR + 1) / BAR - 40) * 8, 0)
  })

  it('gives two far anchors distinct xs, so a line cannot collapse vertical', () => {
    const { chart, series } = stubPair()
    const vp = viewportOf(chart, series)!
    const a = vp.xOf((T0 - 5000 * BAR + 1) as Time)
    const b = vp.xOf((T0 - 4000 * BAR + 1) as Time)
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    expect(Math.abs((b as number) - (a as number))).toBeCloseTo(1000 * 8, 0)
  })

  it('still declines when the series has no interval to extrapolate with', () => {
    const { chart, series } = stubPair()
    const empty = { ...series, data: () => [] } as unknown as ISeriesApi<SeriesType>
    const vp = viewportOf(chart, empty)!
    expect(vp.xOf((T0 + 12345 * BAR + 1) as Time)).toBeNull()
  })
})
