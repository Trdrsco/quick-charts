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
import { MIN_BAR_SPACING } from '../ranges'

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

/** The navigation surface one chart exposes. */
export interface RangeApi {
  visibleRange(): TimeRange | null
  setVisibleRange(range: TimeRange): void
  logicalRange(): LogicalRange | null
  setLogicalRange(range: LogicalRange): void
  /** Move the window by whole bars: negative goes back in time, positive forward. */
  scroll(bars: number): void
  /** Zoom about the window's center by widening or narrowing the bars. A factor above 1 shows more
   *  bars, below 1 shows fewer; the chart's own minimum bar spacing is the floor either way. */
  zoom(factor: number): void
  /** Fit the loaded data. */
  reset(): void
  /** Return to the live edge, keeping the current span: a glide that eases into place, moving the
   *  view sideways and never the zoom. */
  goLive(): void
  /** Package-private: whether the glide back to the live edge is under way. */
  gliding(): boolean
  /** Package-private: end the glide where it stands. Every other way of moving the view calls this
   *  first, so the glide never contends with a hand or with another verb. */
  stopGlide(): void
  /** Center the window on a moment, keeping the current span. */
  centerOn(time: number): void
  /** Package-private layout mirror. Never expose through ChartHandle. */
  mirrorVisibleRange(range: TimeRange): void
}

export interface RangeDeps {
  chart: IChartApi
  /** True once the chart is down; every verb refuses afterwards. */
  disposed(): boolean
  /** Runs a range write with the sync bus muted, so a mirrored pane cannot echo it back. */
  muted(write: () => void): void
  /** Marks a layout-mirrored time-range write. Its accepted renderer report is suppressed even
   * when the renderer delivers it after the setter returns. */
  mirrored(write: () => void): void
  /** Hears the glide back to the live edge begin and end, so what reads the view's place follows
   *  it. */
  onGlide?(): void
  /** Whether the viewer asked for reduced motion: the return to the live edge is then one step. */
  reducedMotion?(): boolean
}

/** The glide back to the live edge: how long it eases, and the reach it starts from. A view further
 *  back than `GLIDE_JUMP_WIDTHS` visible widths first steps to `GLIDE_FROM_WIDTHS` widths away, so
 *  the glide reads the same from any distance and pages no history on the way. */
export const GLIDE_MS = 520
const GLIDE_JUMP_WIDTHS = 2
const GLIDE_FROM_WIDTHS = 1.5

/** Quick at first and settling into place, the way a released scroll comes to rest. */
export const glideEase = (t: number): number => 1 - (1 - t) ** 3

interface RangeMirror {
  setVisibleRange(range: TimeRange): void
}

const mirrors = new WeakMap<object, RangeMirror>()

/** Package-private range mirror lookup. Layout coordination uses this instead of turning a mirror
 * back into a public navigation intent on the target chart. */
export const chartRangeMirror = (handle: object): RangeMirror | null => mirrors.get(handle) ?? null

export const registerChartRangeMirror = (handle: object, mirror: RangeMirror): (() => void) => {
  mirrors.set(handle, mirror)
  return () => mirrors.delete(handle)
}

/** The smallest renderer surface needed to hold a viewport across a timeline mutation. Kept
 * package-private: hosts move ranges through RangeApi; only chart-owned data painters rewrite the
 * renderer's logical index space. */
export interface TimelineContinuityTarget {
  getVisibleLogicalRange(): { from: number; to: number } | null
  timeToIndex(time: UTCTimestamp, findNearest: boolean): number | null
  setVisibleLogicalRange(range: { from: number; to: number }): void
}

export interface TimelineContinuity {
  readonly range: LogicalRange
  readonly anchorTime: number
  readonly anchorIndex: number
}

/** Capture the view at mutation time against a timestamp that will survive the repaint. A logical
 * range retains fractional endpoints and permitted off-data padding; the anchor's renderer index
 * lets restoration measure the effective shared timeline rather than guess from a page length. */
export function captureTimelineContinuity(target: TimelineContinuityTarget, anchorTimes: readonly number[]): TimelineContinuity | null {
  const range = target.getVisibleLogicalRange()
  if (!range) return null
  let fallback: { anchorTime: number; anchorIndex: number } | null = null
  for (const anchorTime of anchorTimes) {
    const anchorIndex = target.timeToIndex(anchorTime as UTCTimestamp, false)
    if (anchorIndex === null || !Number.isFinite(anchorIndex)) continue
    fallback = { anchorTime, anchorIndex }
    // Prefer a candle at or just inside the visible left edge. It survives an older-data paint and
    // measures every newly inserted timestamp before the part of the picture the viewer is using.
    if (anchorIndex >= range.from) return { range: { from: range.from, to: range.to }, anchorTime, anchorIndex }
  }
  return fallback ? { range: { from: range.from, to: range.to }, ...fallback } : null
}

/** Restore the same screen window after the renderer has rebuilt its unified timeline. Returns
 * false when the anchor vanished or nothing shifted, leaving renderer bounds untouched. */
export function restoreTimelineContinuity(
  target: TimelineContinuityTarget,
  held: TimelineContinuity | null,
  beforeWrite?: (range: LogicalRange) => void,
): boolean {
  if (!held) return false
  const anchorIndex = target.timeToIndex(held.anchorTime as UTCTimestamp, false)
  if (anchorIndex === null || !Number.isFinite(anchorIndex)) return false
  const shift = anchorIndex - held.anchorIndex
  if (!Number.isFinite(shift) || shift === 0) return false
  const range = { from: held.range.from + shift, to: held.range.to + shift }
  beforeWrite?.(range)
  target.setVisibleLogicalRange(range)
  return true
}

export function createRangeApi(deps: RangeDeps): RangeApi {
  const scale = () => deps.chart.timeScale()
  /** The glide's pending frame, or null when no glide is under way. */
  let glide: number | null = null

  const api: RangeApi = {
    visibleRange() {
      if (deps.disposed()) return null
      const range = scale().getVisibleRange()
      return range ? { from: range.from as number, to: range.to as number } : null
    },
    setVisibleRange(range) {
      if (deps.disposed()) return
      try {
        scale().setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
      } catch {
        /* a window entirely outside the data is the scale's refusal to honor — stay put */
      }
    },
    logicalRange() {
      if (deps.disposed()) return null
      const range = scale().getVisibleLogicalRange()
      return range ? { from: range.from as number, to: range.to as number } : null
    },
    setLogicalRange(range) {
      if (deps.disposed() || !(range.to > range.from)) return
      try {
        scale().setVisibleLogicalRange({ from: range.from, to: range.to })
      } catch {
        /* likewise */
      }
    },
    scroll(bars) {
      if (deps.disposed() || bars === 0) return
      // ONE mechanism for every scroll: the scale's own position, moved by whole bars. The step
      // commands move by `SCROLL_STEP_BARS` of these, so a keyboard and a host call cannot end up
      // on two different arithmetics. It is NOT muted: moving the view is a real change, and a
      // layout mirroring this chart has to hear it exactly as it hears a drag.
      scale().scrollToPosition(scale().scrollPosition() + bars, false)
    },
    zoom(factor) {
      if (deps.disposed() || !(factor > 0) || factor === 1) return
      // Zoom is bar spacing, which is the same quantity the step commands move. A wider factor
      // shows more bars, so the spacing shrinks; the chart's own minimum is the floor.
      const spacing = scale().options().barSpacing
      scale().applyOptions({ barSpacing: Math.max(MIN_BAR_SPACING, spacing / factor) })
    },
    reset() {
      if (deps.disposed()) return
      scale().fitContent()
    },
    goLive() {
      if (deps.disposed()) return
      api.stopGlide()
      // The renderer's own return is a straight-line move over a fixed time, which reads as a blur
      // from far back. The glide drives the scroll position itself, one frame at a time on an
      // easing curve. Only the position moves: the bar spacing, which is the zoom, is never written.
      const s = scale()
      const target = s.options().rightOffset
      const range = s.getVisibleLogicalRange()
      const width = range ? range.to - range.from : 0
      let from = s.scrollPosition()
      const animate = typeof requestAnimationFrame === 'function' && !(deps.reducedMotion?.() ?? false)
      if (!animate || !(width > 0) || Math.abs(target - from) < 0.01) {
        s.scrollToPosition(target, false)
        return
      }
      if (Math.abs(target - from) > GLIDE_JUMP_WIDTHS * width) {
        from = target - Math.sign(target - from) * GLIDE_FROM_WIDTHS * width
        s.scrollToPosition(from, false)
      }
      const start = performance.now()
      const step = (now: number): void => {
        if (glide === null) return
        if (deps.disposed()) {
          api.stopGlide()
          return
        }
        const t = Math.min(1, Math.max(0, (now - start) / GLIDE_MS))
        s.scrollToPosition(from + (target - from) * glideEase(t), false)
        if (t >= 1) {
          api.stopGlide()
          return
        }
        glide = requestAnimationFrame(step)
      }
      glide = requestAnimationFrame(step)
      deps.onGlide?.()
    },
    gliding: () => glide !== null,
    stopGlide() {
      if (glide === null) return
      cancelAnimationFrame(glide)
      glide = null
      deps.onGlide?.()
    },
    centerOn(time) {
      if (deps.disposed()) return
      const current = api.visibleRange()
      if (!current) return
      const span = current.to - current.from
      api.setVisibleRange({ from: time - span / 2, to: time + span / 2 })
    },
    mirrorVisibleRange(range) {
      if (deps.disposed()) return
      try {
        deps.mirrored(() => scale().setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp }))
      } catch {
        /* a target pane without that time window stays put and emits no mirror */
      }
    },
  }
  return api
}
