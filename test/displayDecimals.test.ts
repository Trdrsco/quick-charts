// How many decimals a price is SHOWN with — which is not always the decimals its tick trades on.
//
// Owner call 2026-08-27, from a phone: BTC/USDT ticks at 0.00001, so tick precision was writing
// every price on the ticket and every label on the chart as 111234.56789. "Only make it go two
// decimals out."
//
// Two flat would be a bug, though, and a quiet one — it is right for the instrument in front of you
// and wrong for the next one. So the rule caps SIGNIFICANT figures rather than decimals, and this
// file is the pin: the cases below are the ones a flat cap would have broken.
import { describe, expect, it } from 'vitest'
import { decimalsOfTick, displayDecimals, fmtPrice } from '@trdrs/broker'

describe('the precision a price is read at', () => {
  it('cuts a six-figure coin down to two, which is the whole point', () => {
    // BTC/USDT: tick 0.00001, price six figures. Eleven digits in, six out.
    expect(displayDecimals(0.00001, 111234.56789)).toBe(2)
    expect(fmtPrice(111234.56789, 0.00001)).toBe('111234.57')
  })

  it('leaves a pair that LIVES in its decimals alone', () => {
    // EURUSD at 1.0850 — a flat two-decimal cap reads 1.09 and erases the instrument.
    expect(displayDecimals(0.00001, 1.08503)).toBe(5)
    expect(fmtPrice(1.08503, 0.00001)).toBe('1.08503')
  })

  it('exempts anything under 1 outright — a sub-dollar coin IS its decimals', () => {
    expect(displayDecimals(0.00000001, 0.00004321)).toBe(8)
    expect(fmtPrice(0.00004321, 0.00000001)).toBe('0.00004321')
  })

  it('never invents precision the tick does not resolve', () => {
    // ES ticks at 0.25 and reads at 2dp; the cap must not push it to 5 just because it is four
    // figures. The floor is a floor, not a target.
    expect(displayDecimals(0.25, 5000.25)).toBe(2)
    expect(displayDecimals(1, 42000)).toBe(0)
    expect(displayDecimals(0.01, 12.3456)).toBe(2)
  })

  it('keeps a mid-priced fine-tick instrument readable without flattening it', () => {
    // A $12 coin on a 0.0001 grid: four decimals survive, because four is what six figures leaves.
    expect(displayDecimals(0.0001, 12.3456)).toBe(4)
  })

  it('falls back to the tick when there is no market to measure against', () => {
    // A cap needs a magnitude. Pre-quote (0), unknown (null) and nonsense all defer rather than guess.
    expect(displayDecimals(0.00001, 0)).toBe(decimalsOfTick(0.00001))
    expect(displayDecimals(0.00001, null)).toBe(5)
    expect(displayDecimals(undefined, 111234)).toBe(2)
    expect(displayDecimals(0.00001, Number.NaN)).toBe(5)
  })

  it('reads a negative reference by its magnitude, not its sign', () => {
    expect(displayDecimals(0.00001, -111234.56789)).toBe(2)
  })
})
