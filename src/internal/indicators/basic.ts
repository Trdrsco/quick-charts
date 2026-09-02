import type { Candle, MacdResult, BandsResult, StochResult } from './types'
import { maArr, smaArr, type MaType } from './primitives'

/** The selectable price fields. `hl2`=(H+L)/2, `hlc3`=(H+L+C)/3 (typical price), `ohlc4`=(O+H+L+C)/4.
 *  Kept in index order: a manifest's `source` enum input stores the index into this list. */
export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4'
export const PRICE_SOURCES: readonly PriceSource[] = ['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4']

/** One candle's value for a price source (default close). */
export function priceOf(c: Candle, source: PriceSource = 'close'): number {
  switch (source) {
    case 'open':
      return c.open
    case 'high':
      return c.high
    case 'low':
      return c.low
    case 'hl2':
      return (c.high + c.low) / 2
    case 'hlc3':
      return (c.high + c.low + c.close) / 3
    case 'ohlc4':
      return (c.open + c.high + c.low + c.close) / 4
    default:
      return c.close
  }
}
const series = (d: readonly Candle[], source: PriceSource): number[] => d.map((c) => priceOf(c, source))

/** Simple moving average of the chosen source (default close). */
export function sma(d: readonly Candle[], period = 20, source: PriceSource = 'close'): number[] {
  return smaArr(series(d, source), period)
}

/** Exponential moving average of the chosen source (default close). */
export function ema(d: readonly Candle[], period = 20, source: PriceSource = 'close'): number[] {
  return maArr(series(d, source), period, 'ema')
}

/** Relative Strength Index (Wilder's smoothing) over the chosen source (default close), 0..100, NaN
 *  lookback head. The one canonical RSI; Stochastic RSI builds on this. */
export function rsi(d: readonly Candle[], period = 14, source: PriceSource = 'close'): number[] {
  const n = d.length
  const out: number[] = new Array(n).fill(NaN)
  if (n < period + 1) return out
  const s = series(d, source)
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const ch = s[i]! - s[i - 1]!
    if (ch >= 0) gain += ch
    else loss -= ch
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < n; i++) {
    const ch = s[i]! - s[i - 1]!
    avgGain = (avgGain * (period - 1) + (ch > 0 ? ch : 0)) / period
    avgLoss = (avgLoss * (period - 1) + (ch < 0 ? -ch : 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

export interface MacdOptions {
  fast?: number
  slow?: number
  signal?: number
  source?: PriceSource
  /** The family of the two oscillator averages (default EMA). */
  oscMaType?: MaType
  /** The family of the signal line's average over the MACD line (default EMA). */
  signalMaType?: MaType
}

/** MACD line, signal (a moving average of the MACD line), and histogram.
 *
 *  The MACD line is only finite once BOTH averages are seeded, i.e. from index max(fast,slow)-1. The
 *  signal line averages that finite tail: the primitives skip the NaN head and seed on the first
 *  `signal` finite MACD values, so the signal and histogram are finite from
 *  max(fast,slow)-1 + signal-1 and never poisoned by the warm-up. */
export function macd(
  d: readonly Candle[],
  { fast = 12, slow = 26, signal = 9, source = 'close', oscMaType = 'ema', signalMaType = 'ema' }: MacdOptions = {},
): MacdResult {
  const src = series(d, source)
  const fastMa = maArr(src, fast, oscMaType)
  const slowMa = maArr(src, slow, oscMaType)
  const macdLine = src.map((_, i) => (Number.isFinite(fastMa[i]) && Number.isFinite(slowMa[i]) ? fastMa[i]! - slowMa[i]! : NaN))
  const signalLine = maArr(macdLine, signal, signalMaType)
  const histogram = macdLine.map((m, i) => (Number.isFinite(m) && Number.isFinite(signalLine[i]) ? m - signalLine[i]! : NaN))
  return { macd: macdLine, signal: signalLine, histogram }
}

/** Bollinger Bands: SMA midline with stdDev population standard-deviation bands either side. */
export function bollinger(d: readonly Candle[], period = 20, stdDev = 2): BandsResult {
  const middle = sma(d, period)
  const c = series(d, 'close')
  const upper: number[] = new Array(d.length).fill(NaN)
  const lower: number[] = new Array(d.length).fill(NaN)
  for (let i = period - 1; i < d.length; i++) {
    if (!Number.isFinite(middle[i])) continue
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) sumSq += (c[j]! - middle[i]!) ** 2
    const sd = Math.sqrt(sumSq / period)
    upper[i] = middle[i]! + stdDev * sd
    lower[i] = middle[i]! - stdDev * sd
  }
  return { upper, middle, lower }
}

/** Stochastic oscillator: %K = 100 * (close - lowestLow) / (highestHigh - lowestLow), slowed by
 *  SMA(smooth), with %D = SMA(%K, d). 0..100; a zero range yields the neutral 50. */
export function stochastic(d: readonly Candle[], kPeriod = 14, smooth = 3, dPeriod = 3): StochResult {
  const rawK: number[] = new Array(d.length).fill(NaN)
  for (let i = kPeriod - 1; i < d.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (d[j]!.high > hi) hi = d[j]!.high
      if (d[j]!.low < lo) lo = d[j]!.low
    }
    const range = hi - lo
    rawK[i] = range === 0 ? 50 : (100 * (d[i]!.close - lo)) / range
  }
  const k = smaArr(rawK, smooth)
  const dLine = smaArr(k, dPeriod)
  return { k, d: dLine }
}

/** Per-bar volume (the chart colors each bar by close against open, or against the previous close). */
export function volume(d: readonly Candle[]): number[] {
  return d.map((c) => c.volume)
}
