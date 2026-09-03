// The register of transient overlays: every popover, flyout and menu a drawing surface opens is
// tracked against the box it lives in, so the box's own teardown (a dialog closing, the plane
// disposing) closes whatever is still open and takes its document listeners down with it. An
// overlay that outlived its box would keep an Escape and a press listener on the document for the
// life of the page, which no runtime assertion notices.

const open = new WeakMap<HTMLElement, Set<() => void>>()

/** Track an overlay's closer against its box. Returns the untrack, which the closer runs. */
export function trackOverlay(box: HTMLElement, close: () => void): () => void {
  let set = open.get(box)
  if (!set) {
    set = new Set()
    open.set(box, set)
  }
  set.add(close)
  return () => {
    set!.delete(close)
  }
}

/** Close every overlay still open in a box. Each closer untracks itself, so the set drains. */
export function closeOverlays(box: HTMLElement): void {
  const set = open.get(box)
  if (!set) return
  for (const close of [...set]) close()
}

/** How many overlays a box holds open, for the fixtures that prove teardown. */
export function openOverlays(box: HTMLElement): number {
  return open.get(box)?.size ?? 0
}
