// Range and navigation: where the chart is looking, and every verb that moves it.
//
// Two ranges, and they are not interchangeable. A TIME range is what the viewer sees in the
// market's own clock and is what two synchronized charts agree on; a LOGICAL range is measured in
// bar indices and is what paging and zooming reason about. A host that means one and gets the
// other draws a different picture, so both are public and neither is derived from the other here.
//
// Every verb refuses quietly on a chart with nothing to move: an empty chart has no range to set,
// and answering with a throw would make a menu row a hazard.
import type { IChartApi, UTCTimestamp } from 'lightweight-charts'

/** A visible window in the feed's unix seconds. */
export interface TimeRange {
  from: number
  to: number
}

/** A visible window in bar indices. Fractional, and it may run past either end of the data: the
 *  right margin is real space a chart can scroll into. */
export interface LogicalRange {
  from: number
  to: number
}

/** How far one zoom step moves, as a fraction of the visible span kept. */
const ZOOM_STEP = 0.2

/** The navigation surface one chart exposes. */
export interface RangeApi {
  visibleRange(): TimeRange | null
  setVisibleRange(range: TimeRange): void
  logicalRange(): LogicalRange | null
  setLogicalRange(range: LogicalRange): void
  /** Move the window by whole bars: negative goes back in time, positive forward. */
  scroll(bars: number): void
  /** Zoom about the window's center. A factor above 1 shows more bars, below 1 shows fewer. */
  zoom(factor: number): void
  /** Fit the loaded data. */
  reset(): void
  /** Return to the live edge, keeping the current span. */
  goLive(): void
  /** Center the window on a moment, keeping the current span. */
  centerOn(time: number): void
}

export interface RangeDeps {
  chart: IChartApi
  /** True once the chart is down; every verb refuses afterwards. */
  disposed(): boolean
  /** Runs a range write with the sync bus muted, so a mirrored pane cannot echo it back. */
  muted(write: () => void): void
}

export function createRangeApi(deps: RangeDeps): RangeApi {
  const scale = () => deps.chart.timeScale()

  const api: RangeApi = {
    visibleRange() {
      if (deps.disposed()) return null
      const range = scale().getVisibleRange()
      return range ? { from: range.from as number, to: range.to as number } : null
    },
    setVisibleRange(range) {
      if (deps.disposed()) return
      deps.muted(() => {
        try {
          scale().setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
        } catch {
          /* a window entirely outside the data is the scale's refusal to honor — stay put */
        }
      })
    },
    logicalRange() {
      if (deps.disposed()) return null
      const range = scale().getVisibleLogicalRange()
      return range ? { from: range.from as number, to: range.to as number } : null
    },
    setLogicalRange(range) {
      if (deps.disposed() || !(range.to > range.from)) return
      deps.muted(() => {
        try {
          scale().setVisibleLogicalRange({ from: range.from, to: range.to })
        } catch {
          /* likewise */
        }
      })
    },
    scroll(bars) {
      if (deps.disposed() || bars === 0) return
      const range = api.logicalRange()
      if (!range) return
      api.setLogicalRange({ from: range.from + bars, to: range.to + bars })
    },
    zoom(factor) {
      if (deps.disposed() || !(factor > 0) || factor === 1) return
      const range = api.logicalRange()
      if (!range) return
      const center = (range.from + range.to) / 2
      const half = ((range.to - range.from) / 2) * factor
      // One bar is the floor: a window narrower than a bar has nothing left to show.
      if (half < 0.5) return
      api.setLogicalRange({ from: center - half, to: center + half })
    },
    reset() {
      if (deps.disposed()) return
      deps.muted(() => scale().fitContent())
    },
    goLive() {
      if (deps.disposed()) return
      deps.muted(() => scale().scrollToRealTime())
    },
    centerOn(time) {
      if (deps.disposed()) return
      const current = api.visibleRange()
      if (!current) return
      const span = current.to - current.from
      api.setVisibleRange({ from: time - span / 2, to: time + span / 2 })
    },
  }
  return api
}

/** The zoom factors the two default commands use: one step out, one step in. */
export const ZOOM_OUT = 1 + ZOOM_STEP
export const ZOOM_IN = 1 - ZOOM_STEP
