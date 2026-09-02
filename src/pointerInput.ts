// GENERIC pointer and touch rules for the chart surface — the decisions a chart makes about a
// finger or a mouse before any product behavior reads the result. They live in the package because
// they belong to the chart at every width: a chart embedded in someone else's application gets the
// same drag lock as ours, with no host code.
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

// Pinch and axis-scale dragging are the renderer's own gestures: the chart enables them and gets out
// of the way. What this package owns about them is exactly the lock above — an in-chart drag
// suspends pinch and axis scaling for its duration and hands both back.
