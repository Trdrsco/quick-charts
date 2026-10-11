// The Baseline style splits into a positive and a negative half around its base, and that base is a
// SCREEN position rather than a price: a percentage of the pane's height from its foot, half of it
// by default, the line the eye reads as "the middle of what is on screen". The library only understands a base priced in the series' own units, and its
// default is price 0, so an unattended baseline paints an entire window in one color, which is the one
// thing the style exists not to do. Deriving the level from the data instead (the window's first close,
// say) has the same fault under a trend.
//
// The price under that screen position moves with every scroll, zoom, autoscale, resize, replay step
// and incoming bar, and the library raises no price-scale event to hang the derivation on, so the level
// is re-derived on the frames the chart is already painting and written only once the held one has
// drifted half a pixel off its line. The write cannot chase its own tail: the derived price is by
// construction inside the visible range, so feeding it back through autoscale cannot widen it.
import type { ISeriesApi, SeriesType } from 'lightweight-charts'

/** The default screen split, as a percentage of pane height measured from the lower border. */
export const BASELINE_SCREEN_PERCENT = 50

/** Below half a pixel of drift the held level is already on its line, and rewriting it would be a
 *  write per frame forever. */
export const BASELINE_DRIFT_PX = 0.5

/** The y coordinate the split sits on in a pane of this height, at a percentage of it from the
 *  foot (clamped to the pane), or null for a pane with no height yet (a chart mounted into a
 *  container the layout has not measured). */
export function baselineSplitCoordinate(height: number, percent: number = BASELINE_SCREEN_PERCENT): number | null {
  if (!Number.isFinite(height) || height <= 0) return null
  const share = Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : BASELINE_SCREEN_PERCENT
  return height * (1 - share / 100)
}

/** One frame's reading of the pane: its height, where the level the series currently holds sits on
 *  screen (null when it holds none, or when the scale cannot place it), and the scale's own
 *  coordinate-to-price conversion. */
export interface BaselineReading {
  height: number
  /** Where the split stands, as a percentage of the height from the foot. Half when absent. */
  percent?: number
  heldCoordinate: number | null
  priceAt: (coordinate: number) => number | null
}

/** The whole decision, kept pure: the price to write, or null to leave the series alone. */
export function baselinePriceToWrite(reading: BaselineReading): number | null {
  const target = baselineSplitCoordinate(reading.height, reading.percent)
  if (target === null) return null
  const held = reading.heldCoordinate
  if (held !== null && Number.isFinite(held) && Math.abs(held - target) < BASELINE_DRIFT_PX) return null
  const price = reading.priceAt(target)
  return price === null || !Number.isFinite(price) ? null : price
}

/** What the follower needs of the chart: the main pane's height, and the frame clock it rides. */
export interface BaselineLevelDeps {
  paneHeight: () => number
  /** The base level setting: a percentage of the pane's height from its foot. Half when absent. */
  percent?: () => number
  frame?: (tick: () => void) => number
  cancel?: (handle: number) => void
}

export interface BaselineLevelApi {
  /** Follow this series, or nothing when the style is not baseline. Following stops the previous
   *  loop, so a style switch and a series replacement need no separate teardown. */
  follow(series: ISeriesApi<SeriesType> | null): void
  /** One derivation, outside the frame clock. */
  sync(): void
  destroy(): void
}

interface BaselineSeriesOptions {
  baseValue?: { type: string; price: number }
}

export function createBaselineLevel(deps: BaselineLevelDeps): BaselineLevelApi {
  const frame = deps.frame ?? ((tick: () => void) => requestAnimationFrame(tick))
  const cancel = deps.cancel ?? ((handle: number) => cancelAnimationFrame(handle))
  let followed: ISeriesApi<SeriesType> | null = null
  let handle: number | null = null
  let destroyed = false

  function stop(): void {
    if (handle !== null) cancel(handle)
    handle = null
  }

  function sync(): void {
    const series = followed
    if (destroyed || !series) return
    let height: number
    try {
      height = deps.paneHeight()
    } catch {
      return // the chart was torn down between frames
    }
    try {
      const held = (series.options() as BaselineSeriesOptions).baseValue
      const heldCoordinate = held && held.type === 'price' ? series.priceToCoordinate(held.price) : null
      const price = baselinePriceToWrite({
        height,
        percent: deps.percent?.(),
        heldCoordinate: heldCoordinate ?? null,
        priceAt: (coordinate) => series.coordinateToPrice(coordinate),
      })
      if (price === null) return
      series.applyOptions({ baseValue: { type: 'price', price } } as never)
    } catch {
      /* the series was swapped or removed mid-frame */
    }
  }

  function loop(): void {
    handle = frame(loop)
    sync()
  }

  return {
    follow(series) {
      stop()
      followed = destroyed ? null : series
      if (!followed) return
      sync()
      handle = frame(loop)
    },
    sync,
    destroy() {
      destroyed = true
      stop()
      followed = null
    },
  }
}
