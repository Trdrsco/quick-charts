import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { snapToBar } from '../../../src/internal/drawings/core/magnet'

// Pixel mapping for the tests: price 100 → y 0, one point per pixel, y grows downward.
const priceToY = (price: number) => 100 - price

const BAR = { time: 1_700_000_000 as Time, open: 60, high: 80, low: 40, close: 70 }

describe('snapToBar — nearest OHLC in pixel space', () => {
  it('strong magnet always takes the nearest value', () => {
    expect(snapToBar(BAR, priceToY(79), priceToY, 'strong')).toBe(80) // 1px from high
    expect(snapToBar(BAR, priceToY(64), priceToY, 'strong')).toBe(60) // open is 4px, close 6px
    expect(snapToBar(BAR, priceToY(0), priceToY, 'strong')).toBe(40) // far below → low
  })

  it('weak magnet only pulls within its radius', () => {
    expect(snapToBar(BAR, priceToY(75), priceToY, 'weak')).toBe(80) // 5px from the high → pulls
    expect(snapToBar(BAR, priceToY(20), priceToY, 'weak')).toBeNull() // 20px below the low → free
  })

  it('weak magnet boundary is the documented radius', () => {
    // A flat bar isolates one value: 14px away still pulls, 15px is free.
    const flat = { ...BAR, open: 80, low: 80, close: 80 }
    expect(snapToBar(flat, priceToY(80) + 14, priceToY, 'weak')).toBe(80)
    expect(snapToBar(flat, priceToY(80) + 15, priceToY, 'weak')).toBeNull()
  })

  it('ties resolve to the first-scanned value and unpaintable prices are skipped', () => {
    const partial = (p: number) => (p === 80 ? null : priceToY(p))
    expect(snapToBar(BAR, priceToY(79), partial, 'strong')).toBe(70) // high unpaintable → next nearest
  })
})
