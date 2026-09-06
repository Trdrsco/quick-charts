import { describe, expect, it } from 'vitest'
import type { Candle, IndicatorBar } from '../../../src/internal/indicators/index'
import {
  toCandles,
  sma,
  ema,
  rsi,
  macd,
  bollinger,
  stochastic,
  atr,
  supertrend,
  obv,
  vwap,
  vwapAnchorBucket,
  hasRealVolume,
  adx,
  stochRsi,
  williamsR,
  mfi,
  psar,
  rmaArr,
  maArr,
  shiftArr,
  keltner,
} from '../../../src/internal/indicators/index'

const BASE = 1_700_000_000

// Build candles from a close series; derive a sane OHLC envelope, constant volume, one-minute bars.
function candles(closeSeries: number[], vol = 100): Candle[] {
  return closeSeries.map((c, i) => {
    const open = i === 0 ? c : closeSeries[i - 1]!
    return { time: BASE + i * 60, open, high: Math.max(open, c) + 1, low: Math.min(open, c) - 1, close: c, volume: vol }
  })
}

// A long, varied, deterministic series (trend + oscillation): enough bars to clear every lookback.
const SERIES = Array.from({ length: 80 }, (_, i) => 100 + 10 * Math.sin(i / 5) + i * 0.1)
const BARS = candles(SERIES)

const finite = (xs: number[]) => xs.filter(Number.isFinite)

describe('indicator math: alignment and lookback', () => {
  it('every series is aligned 1:1 to the input bars', () => {
    expect(sma(BARS).length).toBe(BARS.length)
    expect(ema(BARS).length).toBe(BARS.length)
    expect(rsi(BARS).length).toBe(BARS.length)
    expect(atr(BARS).length).toBe(BARS.length)
    const m = macd(BARS)
    expect(m.macd.length).toBe(BARS.length)
    expect(m.signal.length).toBe(BARS.length)
    expect(m.histogram.length).toBe(BARS.length)
  })

  it('SMA matches a hand-computed window', () => {
    const out = sma(candles([1, 2, 3, 4, 5, 6]), 3)
    expect(out[0]).toBeNaN()
    expect(out[1]).toBeNaN()
    expect(out[2]).toBeCloseTo(2) // (1+2+3)/3
    expect(out[3]).toBeCloseTo(3)
    expect(out[5]).toBeCloseTo(5)
  })

  it('EMA seeds with an SMA at period-1, then recurses', () => {
    const out = ema(candles([1, 2, 3, 4, 5, 6]), 3)
    expect(out[1]).toBeNaN()
    expect(out[2]).toBeCloseTo(2) // seed = (1+2+3)/3
    expect(out[3]).toBeCloseTo(3) // 4*0.5 + 2*0.5
    expect(out[5]).toBeCloseTo(5)
  })

  it('shiftArr moves a series right for a positive offset and left for a negative one, NaN where nothing lands', () => {
    expect(shiftArr([1, 2, 3, 4], 1)).toEqual([NaN, 1, 2, 3])
    expect(shiftArr([1, 2, 3, 4], -1)).toEqual([2, 3, 4, NaN])
    expect(shiftArr([1, 2, 3, 4], 0)).toEqual([1, 2, 3, 4])
  })

  it('maArr selects the primitive by family', () => {
    const src = [1, 2, 3, 4, 5, 6]
    expect(maArr(src, 3, 'sma')[5]).toBeCloseTo(5)
    expect(maArr(src, 3, 'ema')[5]).toBeCloseTo(5)
    expect(maArr(src, 3, 'rma')[5]).toBeCloseTo(4.296296, 5)
    expect(maArr(src, 3, 'wma')[5]).toBeCloseTo((4 * 1 + 5 * 2 + 6 * 3) / 6)
  })
})

describe('MACD: the signal and histogram are finite once seeded, never poisoned by the warm-up', () => {
  const m = macd(BARS) // defaults fast 12 / slow 26 / signal 9: MACD finite from 25, signal/hist from 33

  it('signal line is not all-NaN', () => {
    expect(m.signal.some(Number.isFinite)).toBe(true)
    expect(m.histogram.some(Number.isFinite)).toBe(true)
  })

  it('MACD line is NaN through the warm-up and finite from index 25', () => {
    expect(m.macd.slice(0, 25).every(Number.isNaN)).toBe(true)
    expect(m.macd.slice(25).every(Number.isFinite)).toBe(true)
  })

  it('signal and histogram are NaN until the seed (index 33), finite after', () => {
    expect(m.signal.slice(0, 33).every(Number.isNaN)).toBe(true)
    expect(m.signal.slice(33).every(Number.isFinite)).toBe(true)
    expect(m.histogram.slice(33).every(Number.isFinite)).toBe(true)
  })

  it('histogram = macd - signal where both are finite', () => {
    for (let i = 33; i < BARS.length; i++) {
      expect(m.histogram[i]).toBeCloseTo(m.macd[i]! - m.signal[i]!)
    }
  })

  it('takes SMA families and a source: SMA oscillator averages over HL2 differ from the EMA/close default', () => {
    const smaMacd = macd(BARS, { oscMaType: 'sma', signalMaType: 'sma', source: 'hl2' })
    expect(smaMacd.macd.slice(0, 25).every(Number.isNaN)).toBe(true)
    expect(smaMacd.macd.slice(25).every(Number.isFinite)).toBe(true)
    expect(smaMacd.macd[40]).not.toBeCloseTo(m.macd[40]!)
    // A pure SMA MACD over the close reproduces the hand formula at one bar.
    const sm = macd(candles([1, 2, 3, 4, 5, 6, 7, 8]), { fast: 2, slow: 4, signal: 2, oscMaType: 'sma', signalMaType: 'sma' })
    expect(sm.macd[3]).toBeCloseTo((3 + 4) / 2 - (1 + 2 + 3 + 4) / 4)
    expect(sm.signal[4]).toBeCloseTo((sm.macd[3]! + sm.macd[4]!) / 2)
  })
})

describe('bounded oscillators', () => {
  it('RSI is finite after warm-up and bounded 0..100', () => {
    const r = finite(rsi(BARS, 14))
    expect(r.length).toBeGreaterThan(0)
    for (const v of r) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('Stochastic %K and %D are bounded 0..100', () => {
    const s = stochastic(BARS)
    for (const v of finite(s.k)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    expect(finite(s.d).length).toBeGreaterThan(0)
  })
})

describe('bands and volatility', () => {
  it('Bollinger keeps upper >= middle >= lower', () => {
    const b = bollinger(BARS, 20, 2)
    for (let i = 0; i < BARS.length; i++) {
      if (!Number.isFinite(b.middle[i])) continue
      expect(b.upper[i]).toBeGreaterThanOrEqual(b.middle[i]!)
      expect(b.middle[i]).toBeGreaterThanOrEqual(b.lower[i]!)
    }
  })

  it('ATR is finite after warm-up and non-negative', () => {
    const a = finite(atr(BARS, 14))
    expect(a.length).toBeGreaterThan(0)
    for (const v of a) expect(v).toBeGreaterThanOrEqual(0)
  })

  it('Supertrend direction is only +1 or -1 once active', () => {
    for (const v of finite(supertrend(BARS).dir)) {
      expect(Math.abs(v)).toBe(1)
    }
  })

  it('Keltner widens by ATR in true-range mode and by the plain range in high-low mode', () => {
    // Bars that gap up 4 from the previous close with a 2.1 body-to-wick range: the true range
    // (5.1, through the gap) exceeds the plain range (2.1), so the two modes must differ.
    const gapped: Candle[] = []
    let open = 100
    for (let i = 0; i < 60; i++) {
      gapped.push({ time: BASE + i * 60, open, high: open + 1.1, low: open - 1, close: open + 0.1, volume: 100 })
      open = open + 0.1 + 4
    }
    const tr = keltner(gapped, 20, 10, 2, 'true-range')
    const hl = keltner(gapped, 20, 10, 2, 'high-low')
    expect(tr.middle).toEqual(hl.middle)
    const i = 40
    expect(hl.upper[i]! - hl.middle[i]!).toBeCloseTo(2 * 2.1)
    expect(tr.upper[i]! - tr.middle[i]!).toBeCloseTo(2 * 5.1, 0) // the first bar's TR is its plain range, so the RMA is still converging
  })
})

describe('volume-based', () => {
  it('hasRealVolume reflects the feed', () => {
    expect(hasRealVolume(BARS)).toBe(true)
    expect(hasRealVolume(candles(SERIES, 0))).toBe(false)
  })

  it('OBV starts at 0 and stays finite', () => {
    const o = obv(BARS)
    expect(o[0]).toBe(0)
    expect(o.every(Number.isFinite)).toBe(true)
  })

  it('VWAP is finite with real volume', () => {
    expect(finite(vwap(BARS)).length).toBe(BARS.length)
  })

  it('VWAP restarts at each anchor bucket and runs cumulatively with no anchor', () => {
    // Twelve hourly bars straddling a UTC midnight: the session VWAP restarts at bar 6.
    const midnight = 1_700_006_400 // 2023-11-15T00:00:00Z
    const bars: Candle[] = Array.from({ length: 12 }, (_, i) => ({
      time: midnight - 6 * 3600 + i * 3600,
      open: 10 + i,
      high: 11 + i,
      low: 9 + i,
      close: 10 + i,
      volume: 1,
    }))
    const session = vwap(bars, 'session')
    const none = vwap(bars, 'none')
    // At the first bar of the new day the session VWAP is that bar's own typical price.
    expect(session[6]).toBeCloseTo((11 + 6 + 9 + 6 + 10 + 6) / 3)
    // The unanchored run keeps averaging across midnight.
    expect(none[6]).toBeCloseTo(bars.slice(0, 7).reduce((s, b) => s + (b.high + b.low + b.close) / 3, 0) / 7)
    expect(session[0]).toBeCloseTo(none[0]!)
  })

  it('vwapAnchorBucket snaps weeks to Monday and months to the calendar', () => {
    const monday = 1_700_438_400 // 2023-11-20T00:00:00Z
    const sunday = monday - 1
    expect(vwapAnchorBucket(monday, 'week')).toBe(vwapAnchorBucket(sunday, 'week') + 1)
    expect(vwapAnchorBucket(monday, 'week')).toBe(vwapAnchorBucket(monday + 6 * 86_400, 'week'))
    const dec1 = 1_701_388_800 // 2023-12-01T00:00:00Z
    expect(vwapAnchorBucket(dec1, 'month')).toBe(vwapAnchorBucket(dec1 - 1, 'month') + 1)
    expect(vwapAnchorBucket(dec1, 'none')).toBe(vwapAnchorBucket(monday, 'none'))
  })

  it('toCandles maps chart bars to the Candle shape, time included', () => {
    const bars: IndicatorBar[] = [{ t: 1, o: 10, h: 12, l: 9, c: 11, v: 5 }]
    expect(toCandles(bars)[0]).toEqual({ time: 1, open: 10, high: 12, low: 9, close: 11, volume: 5 })
  })
})

describe('bounded ranges: adx / stochRsi / williams / mfi / psar', () => {
  it('ADX is bounded 0..100 after warm-up with finite +DI / -DI', () => {
    const a = adx(BARS, 14)
    expect(a.adx.length).toBe(BARS.length)
    const ad = finite(a.adx)
    expect(ad.length).toBeGreaterThan(0)
    for (const v of ad) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    for (const v of finite(a.plusDI)) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of finite(a.minusDI)) expect(v).toBeGreaterThanOrEqual(0)
    expect(finite(a.plusDI).length).toBeGreaterThan(0)
    expect(finite(a.minusDI).length).toBeGreaterThan(0)
  })

  it('Stochastic RSI %K and %D are bounded 0..100', () => {
    const s = stochRsi(BARS)
    expect(finite(s.k).length).toBeGreaterThan(0)
    for (const v of finite(s.k)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
    for (const v of finite(s.d)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('Williams %R is bounded -100..0', () => {
    const w = finite(williamsR(BARS, 14))
    expect(w.length).toBeGreaterThan(0)
    for (const v of w) {
      expect(v).toBeGreaterThanOrEqual(-100)
      expect(v).toBeLessThanOrEqual(0)
    }
  })

  it('MFI is bounded 0..100 with real volume', () => {
    const m = finite(mfi(BARS, 14))
    expect(m.length).toBeGreaterThan(0)
    for (const v of m) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  it('Parabolic SAR is NaN on the first bar and finite thereafter', () => {
    const p = psar(BARS)
    expect(p.length).toBe(BARS.length)
    expect(p[0]).toBeNaN()
    expect(p.slice(1).every(Number.isFinite)).toBe(true)
  })
})

describe('Wilder smoothing (RMA), hand-computed', () => {
  it('matches a hand-computed RMA window (period 3)', () => {
    // period 3 over [1..6]: seed = (1+2+3)/3 = 2 at index 2, then prev = (prev*2 + v)/3.
    const out = rmaArr([1, 2, 3, 4, 5, 6], 3)
    expect(out[0]).toBeNaN()
    expect(out[1]).toBeNaN()
    expect(out[2]).toBeCloseTo(2) // seed SMA
    expect(out[3]).toBeCloseTo(8 / 3) // (2*2 + 4)/3
    expect(out[4]).toBeCloseTo(((8 / 3) * 2 + 5) / 3)
    expect(out[5]).toBeCloseTo(4.296296, 5)
  })
})
