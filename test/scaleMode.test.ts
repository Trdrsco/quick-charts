import { describe, expect, it } from 'vitest'
import { PriceScaleMode } from 'lightweight-charts'
import { coerceScaleMode, PRICE_SCALE_MODE, SCALE_MODE_OPTIONS, SCALE_MODES } from '../src/scaleMode'

describe('scale-mode vocabulary', () => {
  it('maps every mode onto the renderer enum — exhaustively, no orphans either way', () => {
    expect(Object.keys(PRICE_SCALE_MODE).sort()).toEqual([...SCALE_MODES].sort())
    expect(PRICE_SCALE_MODE.normal).toBe(PriceScaleMode.Normal)
    expect(PRICE_SCALE_MODE.log).toBe(PriceScaleMode.Logarithmic)
    expect(PRICE_SCALE_MODE.percent).toBe(PriceScaleMode.Percentage)
    expect(PRICE_SCALE_MODE.indexed).toBe(PriceScaleMode.IndexedTo100)
  })

  it('settings chips cover exactly the vocabulary, in render order', () => {
    expect(SCALE_MODE_OPTIONS.map((o) => o.id)).toEqual([...SCALE_MODES])
  })

  it('a value outside the vocabulary coerces to normal — never a crash or a wrong axis', () => {
    expect(coerceScaleMode('log')).toBe('log')
    expect(coerceScaleMode('banana')).toBe('normal')
    expect(coerceScaleMode(null)).toBe('normal')
    expect(coerceScaleMode(undefined)).toBe('normal')
  })
})
