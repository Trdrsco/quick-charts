import { MismatchDirection } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'

import type { Anchor, Point } from './types'

export type MagnetMode = 'off' | 'weak' | 'strong'

/** Weak magnet only pulls when the pointer is already this close (px) to an OHLC value. */
const WEAK_RADIUS = 14

export interface OhlcBar {
  time: Time
  open: number
  high: number
  low: number
  close: number
}

/**
 * The pure snap: nearest OHLC value of one bar, in pixel space. `weak` returns null when every
 * value is farther than the pull radius; `strong` always takes the nearest.
 */
export function snapToBar(
  bar: OhlcBar,
  pointerY: number,
  priceToY: (price: number) => number | null,
  mode: Exclude<MagnetMode, 'off'>,
): number | null {
  let best: number | null = null
  let bestDistance = Infinity
  for (const price of [bar.open, bar.high, bar.low, bar.close]) {
    const y = priceToY(price)
    if (y === null) continue
    const distance = Math.abs(y - pointerY)
    if (distance < bestDistance) {
      bestDistance = distance
      best = price
    }
  }
  if (best === null) return null
  if (mode === 'weak' && bestDistance > WEAK_RADIUS) return null
  return best
}

/**
 * Snap a pane point to the nearest bar's nearest OHLC value. Returns the snapped anchor (time
 * pinned to the bar, price to the chosen value), or null when nothing pulls — the caller then
 * uses the raw pointer anchor.
 */
export function magnetSnap(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  point: Point,
  mode: MagnetMode,
): Anchor | null {
  if (mode === 'off') return null
  let bar: OhlcBar | null = null
  try {
    const logical = chart.timeScale().coordinateToLogical(point.x)
    if (logical === null) return null
    const item = series.dataByIndex(Math.round(logical), MismatchDirection.NearestLeft)
    if (!item || !('open' in item)) return null
    bar = item as OhlcBar
  } catch {
    return null
  }
  const price = snapToBar(bar, point.y, (p) => series.priceToCoordinate(p), mode)
  if (price === null) return null
  return { time: bar.time, price }
}
