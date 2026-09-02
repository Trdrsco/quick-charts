// Advanced indicator math. Every function returns arrays aligned 1:1 to the input bars (NaN fills the
// lookback head so the chart's walker drops the warm-up cleanly). Volume-based functions (VWAP/OBV/
// MFI/VWMA) still compute on a feed that carries no volume; the definition layer gates them on
// hasRealVolume() so a zero-volume feed shows an honest "no volume" note instead of a flat series.

import type { Candle, AdxResult, BandsResult, SupertrendResult, StochResult } from './types'
import { smaArr, emaArr, rmaArr, wmaArr } from './primitives'
import { rsi, priceOf, type PriceSource } from './basic'

const closes = (d: readonly Candle[]): number[] => d.map((c) => c.close)
const sourced = (d: readonly Candle[], source: PriceSource): number[] => d.map((c) => priceOf(c, source))

/** True range series (TR[0] = high - low). */
export function trueRange(d: readonly Candle[]): number[] {
  const tr: number[] = new Array(d.length).fill(NaN)
  for (let i = 0; i < d.length; i++) {
    const c = d[i]!
    if (i === 0) {
      tr[i] = c.high - c.low
      continue
    }
    const pc = d[i - 1]!.close
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc))
  }
  return tr
}

/** Average True Range (Wilder). */
export function atr(d: readonly Candle[], period = 14): number[] {
  return rmaArr(trueRange(d), period)
}

/** ADX with directional indicators (+DI / -DI), Wilder-smoothed. `period` is the DI length;
 *  `adxSmoothing` (default = period) smooths DX into the ADX line: the two knobs the reference
 *  product exposes. */
export function adx(d: readonly Candle[], period = 14, adxSmoothing = period): AdxResult {
  const n = d.length
  const plusDM: number[] = new Array(n).fill(0)
  const minusDM: number[] = new Array(n).fill(0)
  const tr: number[] = new Array(n).fill(NaN)
  for (let i = 1; i < n; i++) {
    const c = d[i]!
    const p = d[i - 1]!
    const up = c.high - p.high
    const down = p.low - c.low
    plusDM[i] = up > down && up > 0 ? up : 0
    minusDM[i] = down > up && down > 0 ? down : 0
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
  }
  const trN = rmaArr(
    tr.map((v, i) => (i === 0 ? NaN : v)),
    period,
  )
  const plusN = rmaArr(
    plusDM.map((v, i) => (i === 0 ? NaN : v)),
    period,
  )
  const minusN = rmaArr(
    minusDM.map((v, i) => (i === 0 ? NaN : v)),
    period,
  )

  const plusDI: number[] = new Array(n).fill(NaN)
  const minusDI: number[] = new Array(n).fill(NaN)
  const dx: number[] = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(trN[i]) || trN[i] === 0) continue
    plusDI[i] = (100 * plusN[i]!) / trN[i]!
    minusDI[i] = (100 * minusN[i]!) / trN[i]!
    const sum = plusDI[i]! + minusDI[i]!
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plusDI[i]! - minusDI[i]!)) / sum
  }
  return { adx: rmaArr(dx, adxSmoothing), plusDI, minusDI }
}

/** Parabolic SAR (Wilder). Returns the stop-and-reverse dot price per bar. `start` is the initial
 *  acceleration factor (reset to on every flip), `step` the per-extreme increment, `max` the cap. */
export function psar(d: readonly Candle[], step = 0.02, max = 0.2, start = step): number[] {
  const n = d.length
  const sar: number[] = new Array(n).fill(NaN)
  if (n < 2) return sar
  let up = d[1]!.close >= d[0]!.close
  let af = start
  let ep = up ? d[0]!.high : d[0]!.low
  let cur = up ? d[0]!.low : d[0]!.high
  for (let i = 1; i < n; i++) {
    const c = d[i]!
    const p = d[i - 1]!
    const pp = i >= 2 ? d[i - 2]! : p
    cur = cur + af * (ep - cur)
    if (up) {
      cur = Math.min(cur, p.low, pp.low)
      if (c.high > ep) {
        ep = c.high
        af = Math.min(af + step, max)
      }
      if (c.low < cur) {
        up = false
        cur = ep
        ep = c.low
        af = start
      }
    } else {
      cur = Math.max(cur, p.high, pp.high)
      if (c.low < ep) {
        ep = c.low
        af = Math.min(af + step, max)
      }
      if (c.high > cur) {
        up = true
        cur = ep
        ep = c.high
        af = start
      }
    }
    sar[i] = cur
  }
  return sar
}

/** Supertrend: an ATR band that flips with trend. Returns the line plus up/down splits (each NaN
 *  while the other trend is active) so the chart can paint two colors, and the direction per bar. */
export function supertrend(d: readonly Candle[], period = 10, multiplier = 3): SupertrendResult {
  const n = d.length
  const atrSeries = atr(d, period)
  const trend: number[] = new Array(n).fill(NaN)
  const up: number[] = new Array(n).fill(NaN)
  const down: number[] = new Array(n).fill(NaN)
  const dir: number[] = new Array(n).fill(NaN)
  let finalUpper = NaN
  let finalLower = NaN
  let prevDir = 1
  for (let i = 0; i < n; i++) {
    const a = atrSeries[i]!
    if (!Number.isFinite(a)) continue
    const c = d[i]!
    const hl2 = (c.high + c.low) / 2
    const basicUpper = hl2 + multiplier * a
    const basicLower = hl2 - multiplier * a
    const prevClose = d[i - 1]?.close ?? c.close
    finalUpper =
      !Number.isFinite(finalUpper) || basicUpper < finalUpper || prevClose > finalUpper ? basicUpper : finalUpper
    finalLower =
      !Number.isFinite(finalLower) || basicLower > finalLower || prevClose < finalLower ? basicLower : finalLower

    let curDir = prevDir
    if (c.close > finalUpper) curDir = 1
    else if (c.close < finalLower) curDir = -1
    dir[i] = curDir
    const value = curDir === 1 ? finalLower : finalUpper
    trend[i] = value
    if (curDir === 1) up[i] = value
    else down[i] = value
    prevDir = curDir
  }
  return { trend, up, down, dir }
}

/** Donchian channel: rolling highest-high / lowest-low and their midline. */
export function donchian(d: readonly Candle[], period = 20): BandsResult {
  const n = d.length
  const upper: number[] = new Array(n).fill(NaN)
  const lower: number[] = new Array(n).fill(NaN)
  const middle: number[] = new Array(n).fill(NaN)
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (d[j]!.high > hi) hi = d[j]!.high
      if (d[j]!.low < lo) lo = d[j]!.low
    }
    upper[i] = hi
    lower[i] = lo
    middle[i] = (hi + lo) / 2
  }
  return { upper, middle, lower }
}

/** How a Keltner channel measures its width: Wilder's ATR, or an RMA of each bar's plain range. */
export type KeltnerBands = 'true-range' | 'high-low'

/** Keltner channel: EMA midline with bands scaled by the chosen range measure. */
export function keltner(d: readonly Candle[], period = 20, atrPeriod = 10, multiplier = 2, bands: KeltnerBands = 'true-range'): BandsResult {
  const middle = emaArr(closes(d), period)
  const width =
    bands === 'high-low'
      ? rmaArr(
          d.map((c) => c.high - c.low),
          atrPeriod,
        )
      : atr(d, atrPeriod)
  const upper: number[] = new Array(d.length).fill(NaN)
  const lower: number[] = new Array(d.length).fill(NaN)
  for (let i = 0; i < d.length; i++) {
    if (!Number.isFinite(middle[i]) || !Number.isFinite(width[i])) continue
    upper[i] = middle[i]! + multiplier * width[i]!
    lower[i] = middle[i]! - multiplier * width[i]!
  }
  return { upper, middle, lower }
}

/** Hull moving average: a fast, low-lag MA. */
export function hma(d: readonly Candle[], period = 16): number[] {
  const src = closes(d)
  const half = Math.max(1, Math.round(period / 2))
  const sqrtP = Math.max(1, Math.round(Math.sqrt(period)))
  const wmaHalf = wmaArr(src, half)
  const wmaFull = wmaArr(src, period)
  const diff = src.map((_, i) =>
    Number.isFinite(wmaHalf[i]) && Number.isFinite(wmaFull[i]) ? 2 * wmaHalf[i]! - wmaFull[i]! : NaN,
  )
  return wmaArr(diff, sqrtP)
}

/** Volume-weighted moving average (needs real volume). */
export function vwma(d: readonly Candle[], period = 20, source: PriceSource = 'close'): number[] {
  const out: number[] = new Array(d.length).fill(NaN)
  for (let i = period - 1; i < d.length; i++) {
    let pv = 0
    let vol = 0
    for (let j = i - period + 1; j <= i; j++) {
      pv += priceOf(d[j]!, source) * d[j]!.volume
      vol += d[j]!.volume
    }
    out[i] = vol > 0 ? pv / vol : NaN
  }
  return out
}

/** Commodity Channel Index over the chosen source (default HLC3, the typical price). */
export function cci(d: readonly Candle[], period = 20, source: PriceSource = 'hlc3'): number[] {
  const n = d.length
  const tp = sourced(d, source)
  const tpSma = smaArr(tp, period)
  const out: number[] = new Array(n).fill(NaN)
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(tpSma[i])) continue
    let dev = 0
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j]! - tpSma[i]!)
    const meanDev = dev / period
    out[i] = meanDev === 0 ? 0 : (tp[i]! - tpSma[i]!) / (0.015 * meanDev)
  }
  return out
}

/** Williams %R (-100 to 0). */
export function williamsR(d: readonly Candle[], period = 14): number[] {
  const out: number[] = new Array(d.length).fill(NaN)
  for (let i = period - 1; i < d.length; i++) {
    let hi = -Infinity
    let lo = Infinity
    for (let j = i - period + 1; j <= i; j++) {
      if (d[j]!.high > hi) hi = d[j]!.high
      if (d[j]!.low < lo) lo = d[j]!.low
    }
    const range = hi - lo
    out[i] = range === 0 ? -50 : (-100 * (hi - d[i]!.close)) / range
  }
  return out
}

/** Rate of Change (percent) over the chosen source (default close). */
export function roc(d: readonly Candle[], period = 12, source: PriceSource = 'close'): number[] {
  const src = sourced(d, source)
  const out: number[] = new Array(d.length).fill(NaN)
  for (let i = period; i < d.length; i++) {
    const base = src[i - period]!
    out[i] = base === 0 ? 0 : (100 * (src[i]! - base)) / base
  }
  return out
}

/** Momentum (price difference over period) over the chosen source (default close). */
export function momentum(d: readonly Candle[], period = 10, source: PriceSource = 'close'): number[] {
  const src = sourced(d, source)
  const out: number[] = new Array(d.length).fill(NaN)
  for (let i = period; i < d.length; i++) out[i] = src[i]! - src[i - period]!
  return out
}

/** Stochastic RSI: the stochastic oscillator applied to the (Wilder) RSI series. */
export function stochRsi(
  d: readonly Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dSmooth = 3,
): StochResult {
  const rsiSeries = rsi(d, rsiPeriod)
  const n = d.length
  const stoch: number[] = new Array(n).fill(NaN)
  for (let i = rsiPeriod + stochPeriod - 1; i < n; i++) {
    let hi = -Infinity
    let lo = Infinity
    let ok = true
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      const r = rsiSeries[j]!
      if (!Number.isFinite(r)) {
        ok = false
        break
      }
      if (r > hi) hi = r
      if (r < lo) lo = r
    }
    if (!ok) continue
    const range = hi - lo
    stoch[i] = range === 0 ? 0 : (100 * (rsiSeries[i]! - lo)) / range
  }
  const k = smaArr(stoch, kSmooth)
  const dLine = smaArr(k, dSmooth)
  return { k, d: dLine }
}

/** Where a VWAP restarts its cumulative price-times-volume: never, or at each UTC day, ISO-style
 *  week (Monday), or calendar month boundary. The day is the platform's session model for a
 *  round-the-clock market; venue sessions refine it when per-symbol session data arrives. */
export type VwapAnchor = 'none' | 'session' | 'week' | 'month'
export const VWAP_ANCHORS: readonly VwapAnchor[] = ['session', 'week', 'month']

/** The anchor bucket a bar at `timeSecs` (epoch seconds, UTC) falls in; equal buckets share one VWAP run. */
export function vwapAnchorBucket(timeSecs: number, anchor: VwapAnchor): number {
  if (anchor === 'none') return 0
  if (anchor === 'month') {
    const date = new Date(timeSecs * 1000)
    return date.getUTCFullYear() * 12 + date.getUTCMonth()
  }
  const days = Math.floor(timeSecs / 86_400)
  // Days since the epoch snapped to Monday (the epoch was a Thursday, hence the +3).
  if (anchor === 'week') return Math.floor((days + 3) / 7)
  return days
}

/** Volume Weighted Average Price of the chosen source (default HLC3), cumulative within each
 *  anchor bucket and restarting at every bucket boundary. */
export function vwap(d: readonly Candle[], anchor: VwapAnchor = 'session', source: PriceSource = 'hlc3'): number[] {
  const out: number[] = new Array(d.length).fill(NaN)
  let bucket = NaN
  let cumPV = 0
  let cumVol = 0
  for (let i = 0; i < d.length; i++) {
    const c = d[i]!
    const b = vwapAnchorBucket(c.time, anchor)
    if (b !== bucket) {
      bucket = b
      cumPV = 0
      cumVol = 0
    }
    cumPV += priceOf(c, source) * c.volume
    cumVol += c.volume
    out[i] = cumVol > 0 ? cumPV / cumVol : NaN
  }
  return out
}

/** On-Balance Volume. */
export function obv(d: readonly Candle[]): number[] {
  const out: number[] = new Array(d.length).fill(NaN)
  if (!d.length) return out
  let running = 0
  out[0] = 0
  for (let i = 1; i < d.length; i++) {
    const c = d[i]!
    const p = d[i - 1]!
    if (c.close > p.close) running += c.volume
    else if (c.close < p.close) running -= c.volume
    out[i] = running
  }
  return out
}

/** Money Flow Index: a volume-weighted RSI (0 to 100). */
export function mfi(d: readonly Candle[], period = 14): number[] {
  const n = d.length
  const tp = d.map((c) => (c.high + c.low + c.close) / 3)
  const rmf = d.map((c, i) => tp[i]! * c.volume)
  const out: number[] = new Array(n).fill(NaN)
  for (let i = period; i < n; i++) {
    let pos = 0
    let neg = 0
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j]! > tp[j - 1]!) pos += rmf[j]!
      else if (tp[j]! < tp[j - 1]!) neg += rmf[j]!
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg)
  }
  return out
}

/** Does the loaded series carry real (non-zero) volume? A feed that reports v:0 makes every
 *  volume-based definition report an honest "no volume" state instead of a flat line. */
export function hasRealVolume(d: readonly Candle[]): boolean {
  return d.some((c) => Number.isFinite(c.volume) && c.volume > 0)
}
