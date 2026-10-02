// The register of open overlays, by the host they mount into. A menu, a popover or a dialog binds
// document listeners and may run a timer for as long as it is up; a teardown that removed the host
// without closing them would leave those bound to a detached panel. Every overlay registers here on
// open and leaves on close, so a host's owner closes whatever is still open in ONE call.
//
// There is one register because there is one host: the chrome surfaces and the drawing surfaces
// open their panels into the same element, so a second register would close half of what is up and
// leave the rest listening on a detached node.
//
// An overlay may also register how it re-reads what it shows, for a change it cannot observe on its
// own: the host's access policy answering differently. The widget's owner refreshes every such
// overlay inside its own elements in one call, and an overlay that registered none is left as is.

/** Anything a host can close. One with an exit motion finishes at once when asked not to animate;
 *  one without ignores the request. */
export interface Closable {
  close(options?: { animate?: boolean }): void
}

const open = new WeakMap<Element, Set<() => void>>()

/** The overlays that re-read in place, with the host each mounts into. */
const refreshers = new Set<{ host: Element; close: () => void; refresh: () => void }>()

/** Track an overlay's closer against its host, and how it re-reads what it shows when it can.
 *  Returns the untrack, which the closer runs. */
export function trackOverlay(host: Element, close: () => void, refresh?: () => void): () => void {
  const set = open.get(host) ?? new Set<() => void>()
  open.set(host, set)
  set.add(close)
  const entry = refresh ? { host, close, refresh } : null
  if (entry) refreshers.add(entry)
  return () => {
    set.delete(close)
    if (entry) refreshers.delete(entry)
  }
}

/** Close every overlay still open in a host. Each closer untracks itself, so the copy taken here is
 *  what keeps the loop honest. */
export function closeOverlays(host: Element): void {
  const set = open.get(host)
  if (!set) return
  for (const close of [...set]) close()
}

/** Re-read every open overlay mounted inside one of these elements. A refresh may close its overlay
 *  and open a new one in its place, or close another (a parent taking its submenu along), so the
 *  loop walks a copy and skips an entry that is no longer open. */
export function refreshOverlays(within: readonly Element[]): void {
  for (const entry of [...refreshers]) {
    if (!refreshers.has(entry)) continue
    if (!within.some((root) => root.contains(entry.host))) continue
    entry.refresh()
  }
}

/** How many overlays a host holds open, for the fixtures that prove teardown. */
export function openOverlays(host: Element): number {
  return open.get(host)?.size ?? 0
}
