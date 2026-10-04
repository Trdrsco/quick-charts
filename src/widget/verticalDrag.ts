// A finger's drag that moves the price as well as the time, for a host that asks for it. The renderer
// decides once, at a drag's first move, whether the drag moves the price, and it never does while the
// price scale frames itself. So a one-finger drag on the main pane's plot that sets off mostly
// vertically releases the frame just before the renderer makes that decision, and the price follows
// the finger from then on. A drag that sets off sideways leaves the frame alone, so a pan into
// history keeps the bars framed. The renderer's own double-tap on the price scale gives the frame
// back.
//
// The renderer hears each move of a one-finger drag from a listener on the document, after this one,
// so the move at which it starts the drag reaches this module first.
import type { IChartApi } from 'lightweight-charts'
import { dragMeansPrice, scrollOpen, RENDERER_DRAG_START_PX, RENDERER_LONG_TAP_MS } from '../pointerInput'

export interface VerticalDragDeps {
  chart: IChartApi
  /** The box the finger lands on: the renderer's own. */
  target: HTMLElement
  /** Whether the main pane's price axis frames itself now. */
  framing(): boolean
  /** Release the frame, through the chart's own price-axis policy, so a saved chart, a reset and the
   *  axis agree on what happened. */
  release(): void
}

export function attachVerticalDrag(deps: VerticalDragDeps): { destroy(): void } {
  /** Where and when the finger landed, while the drag is still to be judged. */
  let landed: { x: number; y: number; at: number } | null = null

  /** Whether a point stands on the main pane's plot: past the left price scale, short of the right
   *  one, and above the panes below it. A drag on a scale is the renderer's own axis drag. */
  const onMainPlot = (clientX: number, clientY: number): boolean => {
    const box = deps.chart.chartElement().getBoundingClientRect()
    const left = box.left + deps.chart.priceScale('left').width()
    const right = left + deps.chart.timeScale().width()
    const height = deps.chart.panes()[0]?.getHeight() ?? 0
    return clientX >= left && clientX <= right && clientY >= box.top && clientY <= box.top + height
  }

  const onStart = (event: TouchEvent): void => {
    landed = null
    const touch = event.touches[0]
    if (event.touches.length !== 1 || !touch || !deps.framing() || !onMainPlot(touch.clientX, touch.clientY)) return
    landed = { x: touch.clientX, y: touch.clientY, at: performance.now() }
  }
  const onMove = (event: TouchEvent): void => {
    if (landed === null) return
    const touch = event.touches[0]
    if (event.touches.length !== 1 || !touch) {
      landed = null
      return
    }
    const dx = touch.clientX - landed.x
    const dy = touch.clientY - landed.y
    // Short of the renderer's own threshold, it has not started the drag either.
    if (Math.abs(dx) + Math.abs(dy) < RENDERER_DRAG_START_PX) return
    const judged = landed
    landed = null
    // A finger that rested first is the renderer's hold, which scrubs the crosshair and pans nothing;
    // a lock is a drawing holding the pointer; and a frame already released has nothing to give.
    if (performance.now() - judged.at >= RENDERER_LONG_TAP_MS) return
    if (!scrollOpen(deps.chart.options().handleScroll) || !deps.framing()) return
    if (dragMeansPrice(dx, dy)) deps.release()
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
