// The morph between a style drawn from whole bars and one drawn from closes. Over half a second,
// easing in and out along a cosine, every bar's open, high and low slide into its close while the
// close style comes in through the closes, and the reverse when the bars come back: the bars and the
// line are two series for the length of the morph, and one when it ends. The bars are read every
// frame, so a bar that lands during the morph morphs with the rest. The ease and the fold are pure,
// so a test checks the shapes without a chart.
import type { ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import type { FeedBar } from '../datafeed'

/** How long a morph takes. */
export const STYLE_MORPH_MS = 500

/** The morph's progress at `t` of its length, easing in and out along a cosine. */
export function morphEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return (1 - Math.cos(Math.PI * clamped)) / 2
}

/** A bar folded `fold` of the way into its close: 0 is the bar itself, and 1 is a bar that is its
 *  close alone. */
export function foldBar(bar: FeedBar, fold: number): { time: UTCTimestamp; open: number; high: number; low: number; close: number } {
  const keep = 1 - Math.min(1, Math.max(0, fold))
  return {
    time: bar.t as UTCTimestamp,
    open: bar.c + (bar.o - bar.c) * keep,
    high: bar.c + (bar.h - bar.c) * keep,
    low: bar.c + (bar.l - bar.c) * keep,
    close: bar.c,
  }
}

export interface StyleMorphDeps {
  /** The series the bars are drawn in, folding or unfolding. */
  bars: ISeriesApi<SeriesType>
  /** Shows the close style's series at `alpha` of its strength. */
  fadeLine(alpha: number): void
  /** The bars as painted now. */
  shown(): readonly FeedBar[]
  /** `fold` takes the bars into their closes as the line comes in; `unfold` brings them back out
   *  as the line goes. */
  direction: 'fold' | 'unfold'
  /** Called once, as the morph ends, however it ends. */
  done(): void
  frame?: (tick: () => void) => number
  cancelFrame?: (handle: number) => void
  now?: () => number
}

export interface StyleMorph {
  /** Whether the morph still draws the bars series itself, every frame. */
  running(): boolean
  /** Ends the morph now, on its last frame. */
  finish(): void
}

export function startStyleMorph(deps: StyleMorphDeps): StyleMorph {
  const frame = deps.frame ?? ((tick: () => void) => requestAnimationFrame(tick))
  const cancel = deps.cancelFrame ?? ((handle: number) => cancelAnimationFrame(handle))
  const now = deps.now ?? (() => performance.now())
  const start = now()
  let handle: number | null = null
  let ended = false
  const draw = (t: number): void => {
    const p = morphEase(t)
    const fold = deps.direction === 'fold' ? p : 1 - p
    deps.bars.setData(deps.shown().map((bar) => foldBar(bar, fold)) as never)
    deps.fadeLine(fold)
  }
  const finish = (): void => {
    if (ended) return
    ended = true
    if (handle !== null) cancel(handle)
    handle = null
    draw(1)
    deps.done()
  }
  const tick = (): void => {
    handle = null
    if (ended) return
    const t = (now() - start) / STYLE_MORPH_MS
    if (t >= 1) {
      finish()
      return
    }
    draw(t)
    handle = frame(tick)
  }
  draw(0)
  handle = frame(tick)
  return { running: () => !ended, finish }
}
