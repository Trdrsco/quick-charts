// GENERIC pointer and touch rules for the chart surface — the decisions a chart makes about a
// finger or a mouse before any product behavior reads the result. They live in the package because
// they belong to the chart at every width: a chart embedded in someone else's application gets the
// same press-and-hold, the same drift cancel and the same drag lock as ours, with no host code.
//
// Pure on purpose. The loops around them need a real browser (pointer capture, a canvas, a live
// price scale); the rules do not, so they are pinned here and the loops stay thin appliers.

/** What the chart's own navigation does while something else owns the pointer. Both flags AND the
 *  touch action move together: a finger dragging a level would otherwise scroll the page under it,
 *  and a second finger would pinch-zoom the chart out from beneath the gesture. */
export interface PointerLockState {
  /** lightweight-charts' pan. */
  handleScroll: boolean
  /** lightweight-charts' wheel zoom and axis scaling, moving together. The renderer's own pinch is
   *  off in either state: the chart drives the pinch itself, and reads this lock to know when. */
  handleScale: RendererScale
  /** The CSS touch-action the chart container wears; '' hands the browser its defaults back. */
  touchAction: string
}

/** The renderer's scale handling, flag by flag. */
export interface RendererScale {
  mouseWheel: boolean
  pinch: false
  axisPressedMouseMove: boolean
  axisDoubleClickReset: boolean
}

/** The one lock every in-chart drag applies, and releases by asking for the other one. Stated once
 *  so a surface cannot half-restore the chart (the classic residue: navigation back, touch-action
 *  still 'none', and the chart no longer scrollable by finger). */
export function pointerLock(locked: boolean): PointerLockState {
  const on = !locked
  return {
    handleScroll: on,
    handleScale: { mouseWheel: on, pinch: false, axisPressedMouseMove: on, axisDoubleClickReset: on },
    touchAction: locked ? 'none' : '',
  }
}

/** Whether the renderer's scale options leave scaling open to the viewer: false while a lock holds
 *  the pointer. The lock writes every scale flag together, so the wheel's flag answers for all. */
export function scalingOpen(handleScale: boolean | { mouseWheel?: boolean }): boolean {
  return typeof handleScale === 'boolean' ? handleScale : handleScale.mouseWheel !== false
}

/** The bar spacing a pinch asks for: the spacing it began with, times how far the fingers now stand
 *  apart over how far apart they began. Proportional, so the bars spread exactly as the fingers do;
 *  the renderer clamps the result to its own least and greatest spacing. */
export function pinchSpacing(startSpacing: number, startDistance: number, distance: number): number {
  if (!(startDistance > 0) || !(distance > 0)) return startSpacing
  return startSpacing * (distance / startDistance)
}

/** Where a pinch began: the bar spacing, the point under the fingers' midpoint as a fractional bar,
 *  and the fingers' distance. */
export interface PinchStart {
  spacing: number
  anchor: number
  distance: number
}

/** The plot a pinch spreads across: its width and the renderer's least and greatest bar spacing. */
export interface PinchPlot {
  width: number
  minSpacing: number
  maxSpacing: number
}

// The renderer's own mapping, which both rules below invert: a visible logical range from `from` to
// `to` draws `width / (to - from + 1)` pixels to a bar, and bar `i` at `width - (to - i + 0.5) *
// spacing - 1`. Every pinch frame is computed from where the pinch began and where the fingers are,
// and never from what the renderer reports back, because a write reaches it only on its next frame.

/** The pinch's start, read off the visible logical range and the midpoint `x` in plot pixels. */
export function pinchStart(range: { from: number; to: number }, width: number, x: number, distance: number): PinchStart | null {
  const count = range.to - range.from + 1
  if (!(count > 0) || !(width > 0) || !(distance > 0)) return null
  const spacing = width / count
  return { spacing, anchor: range.to + 0.5 - (width - 1 - x) / spacing, distance }
}

/** The visible logical range that puts the anchor under the fingers' midpoint `x` at the spacing the
 *  fingers ask for, clamped first to the renderer's own bounds so it draws exactly that spacing. One
 *  write moves the spacing and the scroll together. */
export function pinchRange(start: PinchStart, x: number, distance: number, plot: PinchPlot): { from: number; to: number } {
  const spacing = Math.min(plot.maxSpacing, Math.max(plot.minSpacing, pinchSpacing(start.spacing, start.distance, distance)))
  const to = start.anchor - 0.5 + (plot.width - 1 - x) / spacing
  return { from: to + 1 - plot.width / spacing, to }
}

/** How long a finger rests on a scale before the chart treats the press as a right-click. Measured
 *  against the platform hold that raises a context menu: long enough not to fire during a
 *  flick-scroll, short enough that a deliberate hold does not feel ignored. */
export const LONG_PRESS_MS = 450

/** How far that finger may travel first. A thumb rolls on its contact patch while it presses, so
 *  the allowance is well above a mouse's — under it, a real hold on a small screen never fires. */
export const LONG_PRESS_DRIFT_PX = 10

/** Whether a touch start begins a press-and-hold at all. One finger only (a second is a pinch,
 *  which is navigation), never while a drawing tool is armed (the press IS the drawing gesture),
 *  and never on a control the finger is about to tap. */
export function longPressArms(a: { touches: number; toolArmed: boolean; onControl?: boolean }): boolean {
  return a.touches === 1 && !a.toolArmed && a.onControl !== true
}

/** Whether a finger's hold at a point asks for the context menu: on a price scale or the time scale,
 *  outside the plot. On the plot a hold is the crosshair's: the renderer's tracking mode stands the
 *  crosshair at the finger and follows it until the next tap, so the finger reads values where it
 *  rests, the frequent job, and the scales are where it asks for the chart's options. `plot` is the
 *  plot area's left, right and bottom edges in the point's own coordinates. */
export function holdRaisesMenu(a: { x: number; y: number; plot: { left: number; right: number; bottom: number } }): boolean {
  return a.x < a.plot.left || a.x > a.plot.right || a.y > a.plot.bottom
}

/** Whether an armed hold is abandoned before it fires: the finger travelled, lifted, or was joined
 *  by another. Drift is judged per axis, the way the press was measured. */
export function longPressCancels(a: { touches: number; fromX: number; fromY: number; x: number; y: number }): boolean {
  if (a.touches !== 1) return true
  return Math.abs(a.x - a.fromX) > LONG_PRESS_DRIFT_PX || Math.abs(a.y - a.fromY) > LONG_PRESS_DRIFT_PX
}

// Axis-scale dragging is the renderer's own gesture: the chart enables it and gets out of the way.
// The pinch is the chart's: the renderer's pinch moves the bar spacing by about half the change in
// the fingers' distance, which reads as slow, so the chart drives it proportionally by the rule
// above. What else this package owns about them is the lock above (an in-chart drag suspends
// scaling, the chart's pinch included, for its duration and hands it back) and the rule that a
// second finger ends a one-finger gesture instead of being folded into it. Both are pinned in
// test/pointerInput.test.ts against these functions and the widget's own extension capabilities.
// How far a press may wander and still be a tap on a CONTROL is a rule of whoever draws the
// control (an extension's own), not the chart's.
