import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { barsInRange, linearRegression, volumeProfile } from '../../../src/internal/drawings/core/bars'
import type { SourceBar } from '../../../src/internal/drawings/core/bars'

const bar = (t: number, close: number, volume?: number, spread = 1): SourceBar => ({
  time: t as Time,
  open: close,
  high: close + spread,
  low: close - spread,
  close,
  volume,
})

describe('barsInRange', () => {
  const bars = [bar(100, 1), bar(200, 2), bar(300, 3), bar(400, 4)]

  it('is inclusive and anchor-order agnostic', () => {
    expect(barsInRange(bars, 200 as Time, 300 as Time).map((b) => Number(b.time))).toEqual([200, 300])
    expect(barsInRange(bars, 300 as Time, 200 as Time).map((b) => Number(b.time))).toEqual([200, 300])
  })

  it('empty outside the data', () => {
    expect(barsInRange(bars, 500 as Time, 900 as Time)).toEqual([])
  })
})

describe('linearRegression', () => {
  it('recovers an exact linear series with zero sigma', () => {
    const bars = [bar(1, 10), bar(2, 12), bar(3, 14), bar(4, 16)]
    const fit = linearRegression(bars)!
    expect(fit.slope).toBeCloseTo(2)
    expect(fit.intercept).toBeCloseTo(10)
    expect(fit.sigma).toBeCloseTo(0)
  })

  it('measures residual spread on a noisy series', () => {
    const bars = [bar(1, 10), bar(2, 14), bar(3, 10), bar(4, 14)]
    const fit = linearRegression(bars)!
    expect(fit.sigma).toBeGreaterThan(1)
  })

  it('needs at least two bars', () => {
    expect(linearRegression([bar(1, 10)])).toBeNull()
  })
})

describe('volumeProfile', () => {
  it('null without volume data', () => {
    expect(volumeProfile([bar(1, 10), bar(2, 12)], 10)).toBeNull()
  })

  it('conserves total volume across the bins', () => {
    const bars = [bar(1, 10, 100, 2), bar(2, 14, 300, 2), bar(3, 12, 50, 2)]
    const bins = volumeProfile(bars, 8)!
    const total = bins.reduce((s, b) => s + b.volume, 0)
    expect(total).toBeCloseTo(450)
  })

  it('the highest-volume bin lies inside the busiest bar span', () => {
    // Volume concentrates in the bar spanning 13–15; its uniform spread can tie adjacent bins,
    // so the point of control must land somewhere WITHIN that span.
    const bars = [bar(1, 10, 10, 1), bar(2, 14, 500, 1), bar(3, 18, 10, 1)]
    const bins = volumeProfile(bars, 9)!
    const poc = bins.reduce((best, b) => (b.volume > best.volume ? b : best), bins[0])
    expect(poc.priceHigh).toBeGreaterThan(13)
    expect(poc.priceLow).toBeLessThan(15)
  })

  it('bins span exactly the range low to high', () => {
    const bars = [bar(1, 10, 100, 2), bar(2, 20, 100, 2)]
    const bins = volumeProfile(bars, 4)!
    expect(bins[0].priceLow).toBeCloseTo(8)
    expect(bins[bins.length - 1].priceHigh).toBeCloseTo(22)
  })
})
