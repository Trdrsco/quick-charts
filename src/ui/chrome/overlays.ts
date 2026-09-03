// The open overlays, by the host element they mount into. A menu or a dialog binds document
// listeners and may run a timer for as long as it is up; a teardown that removed the host without
// closing them would leave those bound to a detached panel. Every overlay registers itself here
// on open and leaves on close, so a host's owner closes whatever is still open in one call.

export interface Closable {
  close(): void
}

const byHost = new WeakMap<Element, Set<Closable>>()

export function trackOverlay(host: Element, handle: Closable): void {
  let set = byHost.get(host)
  if (!set) {
    set = new Set()
    byHost.set(host, set)
  }
  set.add(handle)
}

export function untrackOverlay(host: Element, handle: Closable): void {
  byHost.get(host)?.delete(handle)
}

/** Close every overlay still open in a host. Each close unregisters itself, so the copy taken here
 *  is what keeps the loop honest. */
export function closeOverlays(host: Element): void {
  const set = byHost.get(host)
  if (!set) return
  for (const handle of [...set]) handle.close()
}

/** How many overlays a host still holds open. */
export function openOverlayCount(host: Element): number {
  return byHost.get(host)?.size ?? 0
}
