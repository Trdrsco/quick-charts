// The register of open overlays, by the host they mount into. A menu, a popover or a dialog binds
// document listeners and may run a timer for as long as it is up; a teardown that removed the host
// without closing them would leave those bound to a detached panel. Every overlay registers here on
// open and leaves on close, so a host's owner closes whatever is still open in ONE call.
//
// There is one register because there is one host: the chrome surfaces and the drawing surfaces
// open their panels into the same element, so a second register would close half of what is up and
// leave the rest listening on a detached node.

/** Anything a host can close. */
export interface Closable {
  close(): void
}

const open = new WeakMap<Element, Set<() => void>>()

/** Track an overlay's closer against its host. Returns the untrack, which the closer runs. */
export function trackOverlay(host: Element, close: () => void): () => void {
  const set = open.get(host) ?? new Set<() => void>()
  open.set(host, set)
  set.add(close)
  return () => {
    set.delete(close)
  }
}

/** Close every overlay still open in a host. Each closer untracks itself, so the copy taken here is
 *  what keeps the loop honest. */
export function closeOverlays(host: Element): void {
  const set = open.get(host)
  if (!set) return
  for (const close of [...set]) close()
}

/** How many overlays a host holds open, for the fixtures that prove teardown. */
export function openOverlays(host: Element): number {
  return open.get(host)?.size ?? 0
}
