// The chart as a canvas under the finger, for a host that asks for it: a one-finger drag moves the
// price as freely as the time, and nothing re-frames while the viewer pans, flicks or pinches.
//
// The renderer frames the main price scale to the bars on screen, and while it does, a drag moves
// the time alone and the price jumps to each new window. It decides once, at a drag's first move,
// whether the drag moves the price, and it never does while framing. So a one-finger drag anywhere
// on the plot releases the main price scale's framing just before the renderer makes that decision,
// and the price follows the finger from then on. Two fingers landing release it as well, so a pinch
// zooms the time about the fingers and leaves the price where it stands. A double-tap on the price
// scale, a new market or timeframe, and the return to the live edge frame the bars again.
//
// The renderer hears each move of a one-finger drag from a listener on the document, after this one,
// so the move at which it starts the drag reaches this module first.
import type { IChartApi } from 'lightweight-charts'
import { scalingOpen, scrollOpen, RENDERER_DRAG_START_PX, RENDERER_LONG_TAP_MS } from '../pointerInput'

export interface FreePanDeps {
  chart: IChartApi
  /** The box the finger lands on: the renderer's own. */
  target: HTMLElement
  /** Whether the main price scale frames itself now. */
  framing(): boolean
  /** Release the framing. */
  release(): void
}

export function attachFreePan(deps: FreePanDeps): { destroy(): void } {
  /** Where and when the finger landed, while its drag has not yet started. */
  let landed: { x: number; y: number; at: number } | null = null

  /** Whether a point stands on the plot: past the left price scale, short of the right one, and
   *  above the time scale, on any pane. A drag on a scale is the renderer's own axis drag. */
  const onPlot = (clientX: number, clientY: number): boolean => {
    const box = deps.chart.chartElement().getBoundingClientRect()
    const left = box.left + deps.chart.priceScale('left').width()
    const right = left + deps.chart.timeScale().width()
    return clientX >= left && clientX <= right && clientY >= box.top && clientY <= box.bottom - deps.chart.timeScale().height()
  }
  const release = (): void => {
    if (deps.framing()) deps.release()
  }

  const onStart = (event: TouchEvent): void => {
    landed = null
    if (event.touches.length === 2) {
      // A pinch is about to move the zoom; released now, the price stays where it stands while it does.
      if (scalingOpen(deps.chart.options().handleScale)) release()
      return
    }
    const touch = event.touches[0]
    if (event.touches.length !== 1 || !touch || !onPlot(touch.clientX, touch.clientY)) return
    landed = { x: touch.clientX, y: touch.clientY, at: performance.now() }
  }
  const onMove = (event: TouchEvent): void => {
    if (landed === null) return
    const touch = event.touches[0]
    if (event.touches.length !== 1 || !touch) {
      landed = null
      return
    }
    // Short of the renderer's own threshold, it has not started the drag either.
    if (Math.abs(touch.clientX - landed.x) + Math.abs(touch.clientY - landed.y) < RENDERER_DRAG_START_PX) return
    const started = landed
    landed = null
    // A finger that rested first is the renderer's hold, which scrubs the crosshair and pans nothing;
    // a lock is a drawing holding the pointer.
    if (performance.now() - started.at >= RENDERER_LONG_TAP_MS) return
    if (scrollOpen(deps.chart.options().handleScroll)) release()
  }
  const onEnd = (): void => {
    landed = null
  }

  deps.target.addEventListener('touchstart', onStart, { passive: true })
  deps.target.addEventListener('touchmove', onMove, { passive: true })
  deps.target.addEventListener('touchend', onEnd, { passive: true })
  deps.target.addEventListener('touchcancel', onEnd, { passive: true })
  return {
    destroy() {
      landed = null
      deps.target.removeEventListener('touchstart', onStart)
      deps.target.removeEventListener('touchmove', onMove)
      deps.target.removeEventListener('touchend', onEnd)
      deps.target.removeEventListener('touchcancel', onEnd)
    },
  }
}
