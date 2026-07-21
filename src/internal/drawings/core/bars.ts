import type { Time } from 'lightweight-charts'

/** One chart bar as the data-driven tools consume it (volume present when the host has it). */
export interface SourceBar {
  time: Time
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/** Host-injected bar feed. Called at paint time; implementations should be cheap/memoized. */
export type BarSource = () => readonly SourceBar[]

/** Bars whose time falls inside [from, to] (inclusive, either anchor order). */
export function barsInRange(bars: readonly SourceBar[], a: Time, b: Time): SourceBar[] {
  const from = Math.min(Number(a), Number(b))
  const to = Math.max(Number(a), Number(b))
  if (!Number.isFinite(from) || !Number.isFinite(to)) return []
  return bars.filter((bar) => {
    const t = Number(bar.time)
    return t >= from && t <= to
  })
}

/** Least-squares line over the bars' closes: y = intercept + slope·index, plus the residual σ. */
export function linearRegression(bars: readonly SourceBar[]): { slope: number; intercept: number; sigma: number } | null {
  const n = bars.length
  if (n < 2) return null
  let sumX = 0
  let sumY = 0
  let sumXY = 0
  let sumXX = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += bars[i].close
    sumXY += i * bars[i].close
    sumXX += i * i
  }
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null
  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  let variance = 0
  for (let i = 0; i < n; i++) {
    const residual = bars[i].close - (intercept + slope * i)
    variance += residual * residual
  }
  return { slope, intercept, sigma: Math.sqrt(variance / n) }
}

export interface VolumeBin {
  priceLow: number
  priceHigh: number
  volume: number
}

/**
 * Volume-by-price histogram: each bar's volume spreads uniformly over the bins its high–low
 * range covers. Null when the range has no volume data at all.
 */
export function volumeProfile(bars: readonly SourceBar[], rows: number): VolumeBin[] | null {
  const withVolume = bars.filter((b) => typeof b.volume === 'number' && b.volume > 0)
  if (!withVolume.length || rows < 1) return null
  let min = Infinity
  let max = -Infinity
  for (const bar of withVolume) {
    min = Math.min(min, bar.low)
    max = Math.max(max, bar.high)
  }
  if (!(max > min)) return null
  const height = (max - min) / rows
  const bins: VolumeBin[] = Array.from({ length: rows }, (_, i) => ({
    priceLow: min + i * height,
    priceHigh: min + (i + 1) * height,
    volume: 0,
  }))
  for (const bar of withVolume) {
    const lowBin = Math.max(0, Math.min(rows - 1, Math.floor((bar.low - min) / height)))
    const highBin = Math.max(0, Math.min(rows - 1, Math.floor((bar.high - min) / height)))
    const span = highBin - lowBin + 1
    const share = (bar.volume as number) / span
    for (let i = lowBin; i <= highBin; i++) bins[i].volume += share
  }
  return bins
}
