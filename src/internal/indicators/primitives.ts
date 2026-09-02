// Pure array math shared by the indicators. Each returns an array aligned 1:1 to the input, with NaN
// filling the lookback head so the chart's walker can drop the warm-up cleanly.

/** Simple moving average; propagates NaN through the lookback head (and through any NaN in the window). */
export function smaArr(src: readonly number[], period: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN)
  for (let i = period - 1; i < src.length; i++) {
    let sum = 0
    let ok = true
    for (let j = i - period + 1; j <= i; j++) {
      if (!Number.isFinite(src[j])) {
        ok = false
        break
      }
      sum += src[j]!
    }
    out[i] = ok ? sum / period : NaN
  }
  return out
}

/** Exponential moving average, seeded with an SMA at the first index that has `period` finite values. */
export function emaArr(src: readonly number[], period: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN)
  const k = 2 / (period + 1)
  let seedSum = 0
  let seedCount = 0
  // Carry the last finite EMA in a local (mirrors rmaArr) rather than reading out[i-1]: a skipped interior NaN
  // leaves out[i-1] as NaN, which would otherwise poison the whole tail of the recursion.
  let prev = NaN
  for (let i = 0; i < src.length; i++) {
    const v = src[i]!
    if (!Number.isFinite(v)) continue
    if (!Number.isFinite(prev)) {
      seedSum += v
      seedCount += 1
      if (seedCount === period) {
        prev = seedSum / period
        out[i] = prev
      }
      continue
    }
    prev = v * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** Wilder's smoothing (RMA), the moving average ATR, ADX and RSI use internally. */
export function rmaArr(src: readonly number[], period: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN)
  let sum = 0
  let count = 0
  let prev = NaN
  for (let i = 0; i < src.length; i++) {
    const v = src[i]!
    if (!Number.isFinite(v)) continue
    if (!Number.isFinite(prev)) {
      sum += v
      count += 1
      if (count === period) {
        prev = sum / period
        out[i] = prev
      }
      continue
    }
    prev = (prev * (period - 1) + v) / period
    out[i] = prev
  }
  return out
}

/** Linearly weighted moving average (recent bars weighted heaviest). */
export function wmaArr(src: readonly number[], period: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN)
  const denom = (period * (period + 1)) / 2
  for (let i = period - 1; i < src.length; i++) {
    let sum = 0
    let ok = true
    for (let j = 0; j < period; j++) {
      const v = src[i - period + 1 + j]!
      if (!Number.isFinite(v)) {
        ok = false
        break
      }
      sum += v * (j + 1)
    }
    out[i] = ok ? sum / denom : NaN
  }
  return out
}

/** The moving-average families a manifest lets a trader pick for a smoothing or MACD line. */
export type MaType = 'sma' | 'ema' | 'rma' | 'wma'

/** One moving average of `src` by family; the primitives above, selected by name. */
export function maArr(src: readonly number[], period: number, type: MaType): number[] {
  switch (type) {
    case 'sma':
      return smaArr(src, period)
    case 'ema':
      return emaArr(src, period)
    case 'rma':
      return rmaArr(src, period)
    case 'wma':
      return wmaArr(src, period)
  }
}

/** Shift a series `offset` bars to the right (positive) or left (negative): the display-offset
 *  input, applied in data so every consumer (fills, values, legend) agrees. */
export function shiftArr(values: readonly number[], offset: number): number[] {
  if (!offset) return [...values]
  const out: number[] = new Array(values.length).fill(NaN)
  for (let i = 0; i < values.length; i++) {
    const j = i - offset
    if (j >= 0 && j < values.length) out[i] = values[j]!
  }
  return out
}
