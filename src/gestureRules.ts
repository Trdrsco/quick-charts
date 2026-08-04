// The trade-line gesture DECISIONS, pure — tradeLines.ts applies them at its pointer and
// reconcile boundaries. They are extracted because they carry the money-safety rules of the whole
// gesture surface, and the DOM loop around them cannot run outside a real browser (the control
// overlay needs a 2d canvas): the rules test here; the loop stays a thin applier.

/** How far (px) a press may wander before release and still count as a tap. */
export const CLICK_SLOP = 4

export type TapVerdict = 'commit' | 'strayed' | 'missed' | 'scope_changed'

/** Whether releasing a pressed control (✕, ⇄, a leg's ✕) commits its action. Commit needs ALL of:
 *  the pointer stayed within CLICK_SLOP of the press (a tap, not an abandoned drag), the release
 *  still rests on the SAME control (`onSameControl` — lazy, so a strayed release never pays for a
 *  hit test), and the (scope, symbol) selection is still the one captured at press. Only the
 *  selection change is worth surfacing (the tap was real; its target changed underneath) — the
 *  caller maps 'scope_changed' to its message and drops the rest silently. */
export function tapReleaseVerdict(a: {
  downX: number
  downY: number
  upX: number
  upY: number
  onSameControl: () => boolean
  /** Omitted for pre-money controls (a draft's ✕): nothing brokered, nothing to guard. The
   *  current side may be null (deselected mid-gesture) — that IS a selection change. */
  scopes?: { captured: { scope: string; symbol: string }; current: { scope: string | null; symbol: string | null } }
}): TapVerdict {
  if (Math.abs(a.upX - a.downX) > CLICK_SLOP || Math.abs(a.upY - a.downY) > CLICK_SLOP) return 'strayed'
  if (!a.onSameControl()) return 'missed'
  if (a.scopes && (a.scopes.captured.scope !== a.scopes.current.scope || a.scopes.captured.symbol !== a.scopes.current.symbol)) return 'scope_changed'
  return 'commit'
}

/** The optimistic hold for a level whose move was SENT but not yet echoed by the broker's own
 *  snapshot — without it the line visibly snaps back and forward again on release, because the
 *  post-mutation re-read can still carry pre-mutation state. `shown` resolves each reported price:
 *  the held value until the report AGREES (within tol; plans send snapped prices, so half a tick)
 *  or the hold expires — expiry means a lost answer can never pin a lie past its window. `clear`
 *  is the reject rule: a REFUSED mutation stops being shown immediately, everywhere. */
export function createPendingHolds(now: () => number = Date.now) {
  const holds = new Map<string, { price: number; until: number }>()
  return {
    hold(key: string, price: number, ms: number): void {
      holds.set(key, { price, until: now() + ms })
    },
    shown(key: string, reported: number, tol: number): number {
      const pending = holds.get(key)
      if (!pending) return reported
      if (Math.abs(reported - pending.price) <= tol || now() > pending.until) {
        holds.delete(key)
        return reported
      }
      return pending.price
    },
    clear(): void {
      holds.clear()
    },
  }
}

export type PendingHolds = ReturnType<typeof createPendingHolds>
