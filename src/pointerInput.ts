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
  /** lightweight-charts' wheel zoom, pinch and axis scaling. */
  handleScale: boolean
  /** The CSS touch-action the chart container wears; '' hands the browser its defaults back. */
  touchAction: string
}

/** The one lock every in-chart drag applies, and releases by asking for the other one. Stated once
 *  so a surface cannot half-restore the chart (the classic residue: navigation back, touch-action
 *  still 'none', and the chart no longer scrollable by finger). */
export function pointerLock(locked: boolean): PointerLockState {
  return locked
    ? { handleScroll: false, handleScale: false, touchAction: 'none' }
    : { handleScroll: true, handleScale: true, touchAction: '' }
}

/** How long a finger rests before the chart treats the press as a right-click. Measured against the
 *  platform hold that raises a level menu: long enough not to fire during a flick-scroll, short
 *  enough that a deliberate hold does not feel ignored. */
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

/** Whether an armed hold is abandoned before it fires: the finger travelled, lifted, or was joined
 *  by another. Drift is judged per axis, the way the press was measured. */
export function longPressCancels(a: { touches: number; fromX: number; fromY: number; x: number; y: number }): boolean {
  if (a.touches !== 1) return true
  return Math.abs(a.x - a.fromX) > LONG_PRESS_DRIFT_PX || Math.abs(a.y - a.fromY) > LONG_PRESS_DRIFT_PX
}

/** How far (px) a press may wander before release and still count as a tap. */
export const CLICK_SLOP = 4
/** The same allowance for a FINGER. A mouse releases within a pixel or two of where it pressed, so
 *  4 separates a click from an abandoned drag cleanly. A thumb does not: it lands on a soft contact
 *  patch, rolls slightly as it presses, and routinely reports 8 to 10px between down and up on a
 *  tap the person experienced as perfectly still. Judging that by the mouse's number drops real
 *  taps, and a dropped tap on a control reads as a control that ignored the press. */
export const CLICK_SLOP_TOUCH = 12

/** The tap allowance for the pointer in use. Absent reads as a mouse, the strict number. */
export function clickSlopFor(pointerType: string | undefined): number {
  return pointerType === 'touch' ? CLICK_SLOP_TOUCH : CLICK_SLOP
}

export type TapGeometryVerdict = 'tap' | 'strayed' | 'missed'

/** Whether releasing a pressed on-chart control still counts as a tap ON that control, by geometry
 *  alone: the pointer stayed within its allowance of the press (a tap, not an abandoned drag), and
 *  the release still rests on the SAME control. `onSameControl` is lazy, so a strayed release never
 *  pays for a hit test. What a surface then does with a clean tap is its own rule, layered on top. */
export function tapGeometryVerdict(a: {
  downX: number
  downY: number
  upX: number
  upY: number
  onSameControl: () => boolean
  /** The pointer that made the gesture; sets the wander allowance (see clickSlopFor). */
  pointerType?: string
}): TapGeometryVerdict {
  const slop = clickSlopFor(a.pointerType)
  if (Math.abs(a.upX - a.downX) > slop || Math.abs(a.upY - a.downY) > slop) return 'strayed'
  if (!a.onSameControl()) return 'missed'
  return 'tap'
}

// Pinch and axis-scale dragging are the renderer's own gestures: the chart enables them and gets out
// of the way. What this package owns about them is exactly the lock above — an in-chart drag
// suspends pinch and axis scaling for its duration and hands both back — and the rule that a second
// finger ends a one-finger gesture instead of being folded into it. Both are pinned in
// test/pointerInput.test.ts against these functions and the widget's own extension capabilities.
