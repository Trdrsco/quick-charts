// Pinch zoom that follows the fingers. Two fingers set the bar spacing to the spacing the pinch began
// with, times how far apart they now stand over how far apart they began, and the point under their
// midpoint stays under it as the midpoint travels, so the chart moves exactly as the hand does.
//
// Each move is computed from where the pinch began and where the fingers are now, and written as ONE
// visible logical range, which moves the spacing and the scroll together. Nothing is read back from
// the renderer mid-gesture: a write reaches it only on its next frame, so a read-back answers with
// the frame before, and a correction computed from it would land the view off the fingers and pull
// it back on the next move, which is a flicker.
//
// The renderer's own pinch is off (the pointer lock writes it so). Its two-finger handling still
// runs underneath this: it holds the page's own zoom off and stands its one-finger pan down for the
// gesture, so the fingers move nothing but what this module moves.
import type { IChartApi } from 'lightweight-charts'
import { pinchRange, pinchStart, scalingOpen, type PinchStart } from '../pointerInput'

export interface PinchDeps {
  chart: IChartApi
  /** The box the fingers land on: the renderer's own. */
  target: HTMLElement
}

export function attachPinch(deps: PinchDeps): { destroy(): void } {
  const scale = () => deps.chart.timeScale()
  let pinch: PinchStart | null = null
  /** Whether one finger moved before the second landed. The renderer then keeps panning with that
   *  finger rather than pinching, and so does this: a pan and a pinch never run at once. */
  let panned = false

  /** The fingers' distance and their midpoint, in the time scale's own coordinates. */
  const read = (touches: TouchList): { distance: number; x: number } => {
    const a = touches[0]!
    const b = touches[1]!
    const left = deps.chart.chartElement().getBoundingClientRect().left + deps.chart.priceScale('left').width()
    return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2 - left }
  }

  const begin = (event: TouchEvent): void => {
    pinch = null
    if (event.touches.length === 1) panned = false
    if (event.touches.length !== 2 || panned || !scalingOpen(deps.chart.options().handleScale)) return
    const range = scale().getVisibleLogicalRange()
    if (range === null) return
    const { distance, x } = read(event.touches)
    pinch = pinchStart(range, scale().width(), x, distance)
  }
  const move = (event: TouchEvent): void => {
    if (event.touches.length === 1 && pinch === null) panned = true
    if (pinch === null || event.touches.length !== 2) return
    // A lock taken mid-pinch, by a drawing that caught a finger, ends the pinch where it stands.
    if (!scalingOpen(deps.chart.options().handleScale)) {
      pinch = null
      return
    }
    const { distance, x } = read(event.touches)
    const s = scale()
    const width = s.width()
    const options = s.options()
    // The renderer's greatest spacing is its own option when one is set, else half the plot.
    const plot = { width, minSpacing: options.minBarSpacing, maxSpacing: options.maxBarSpacing > 0 ? options.maxBarSpacing : width / 2 }
    s.setVisibleLogicalRange(pinchRange(pinch, x, distance, plot))
  }
  /** A finger lifting from three leaves two, which begins a fresh pinch from where they stand; one
   *  left behind starts over, free to pinch again once a second joins it. */
  const end = (event: TouchEvent): void => {
    if (event.touches.length === 1) panned = false
    if (event.touches.length === 2) begin(event)
    else pinch = null
  }

  deps.target.addEventListener('touchstart', begin, { passive: true })
  deps.target.addEventListener('touchmove', move, { passive: true })
  deps.target.addEventListener('touchend', end, { passive: true })
  deps.target.addEventListener('touchcancel', end, { passive: true })
  return {
    destroy() {
      pinch = null
      deps.target.removeEventListener('touchstart', begin)
      deps.target.removeEventListener('touchmove', move)
      deps.target.removeEventListener('touchend', end)
      deps.target.removeEventListener('touchcancel', end)
    },
  }
}
