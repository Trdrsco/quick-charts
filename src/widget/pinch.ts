// Pinch zoom that follows the fingers. Two fingers set the bar spacing to the spacing the pinch began
// with, times how far apart they now stand over how far apart they began, and the bar under their
// midpoint stays under it as the midpoint travels, so the chart moves exactly as the hand does.
//
// The renderer's own pinch is off (the pointer lock writes it so). Its two-finger handling still
// runs underneath this: it holds the page's own zoom off and stands its one-finger pan down for the
// gesture, so the fingers move nothing but what this module moves.
import type { IChartApi, Logical } from 'lightweight-charts'
import { pinchSpacing, scalingOpen } from '../pointerInput'

export interface PinchDeps {
  chart: IChartApi
  /** The box the fingers land on: the renderer's own. */
  target: HTMLElement
}

export function attachPinch(deps: PinchDeps): { destroy(): void } {
  const scale = () => deps.chart.timeScale()
  /** The pinch under way: the fingers' distance and the spacing when it began, the bar that stood
   *  under their midpoint, and how far from that bar's centre the midpoint stood, in bars. The
   *  renderer answers a pixel with a whole bar, so the offset is what keeps the very point under
   *  the fingers there rather than snapping the nearest bar's centre to them. */
  let pinch: { distance: number; spacing: number; index: number; offset: number } | null = null
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
  /** The spacing the renderer is drawing at now, read off two neighbouring bars, so a clamp it
   *  applied is the spacing used. */
  const drawnSpacing = (index: number): number => {
    const a = scale().logicalToCoordinate(index as Logical)
    const b = scale().logicalToCoordinate((index + 1) as Logical)
    return a === null || b === null ? scale().options().barSpacing : b - a
  }

  const begin = (event: TouchEvent): void => {
    pinch = null
    if (event.touches.length === 1) panned = false
    if (event.touches.length !== 2 || panned || !scalingOpen(deps.chart.options().handleScale)) return
    const { distance, x } = read(event.touches)
    const index = scale().coordinateToLogical(x)
    const at = index === null ? null : scale().logicalToCoordinate(index)
    if (!(distance > 0) || index === null || at === null) return
    const spacing = drawnSpacing(index)
    pinch = { distance, spacing, index, offset: (x - at) / spacing }
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
    s.applyOptions({ barSpacing: pinchSpacing(pinch.spacing, pinch.distance, distance) })
    // The spacing grows about the right edge; slide the view so the pinched bar is back under the
    // fingers' midpoint wherever it has travelled. The scroll position counts bars of room right of
    // the newest bar, so moving the bars right by a pixel distance takes that many bars off it.
    const at = s.logicalToCoordinate(pinch.index as Logical)
    const spacing = drawnSpacing(pinch.index)
    if (at !== null && spacing > 0) s.scrollToPosition(s.scrollPosition() - (x - pinch.offset * spacing - at) / spacing, false)
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
