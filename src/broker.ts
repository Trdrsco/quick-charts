// The chart-trading contract — the broker seam of @trdrs/chart, the exact analog of the datafeed
// seam: the package owns the TYPES and the pure DECISION layer; a host supplies the data (it pushes
// account snapshots into the attachment) and the ACTIONS (a ChartBroker implementation), and injects
// its own price-validation POLICY. Nothing in this file (or tradeLines.ts) imports an engine, an
// HTTP client, or app code — a third party wires their backend by implementing ChartBroker alone.
//
// Money-deciding logic lives HERE, pure, so it unit-tests without a chart, a feed, or a broker: the
// gesture layer only turns pointer coordinates into a price and a resolved hit, then asks these
// functions WHAT to do. A host's policy is the same gate its server runs, so the chart drag and the
// backend can never disagree on a valid price.

/** What a live trade line represents. A stop-limit order renders as TWO lines, one per price — the
 *  reference behavior (docs/chart-trading-corpus/stop-limit-order-lines.md): `stop_limit` is the
 *  TRIGGER line (it carries the order's ✕ — cancelling cancels the whole order), `stop_limit_limit`
 *  is its conversion-limit line (no second ✕ — one order cancels once). Each line drags its OWN
 *  price; the un-dragged price rides along unchanged in the same atomic replace. */
export type LineKind = 'position' | 'stop' | 'limit' | 'stop_limit' | 'stop_limit_limit'

/** An open position, as the broker layer needs it. `unrealizedPnl` is the BROKER's own number or
 *  null — the package renders null as no suffix, never a locally-computed fake. */
export interface BrokerPosition {
  instrument: string
  /** Signed: long > 0, short < 0. */
  qty: number
  avgPrice: number | null
  unrealizedPnl: number | null
}

/** A working order, as the broker layer needs it. A stop draws at triggerPrice, a limit at
 *  limitPrice; a stop_limit uses BOTH (trigger line + conversion-limit line). */
export interface BrokerOrder {
  brokerOrderId: string
  instrument: string
  side: 'buy' | 'sell'
  qty: number
  orderType: string
  triggerPrice: number | null
  limitPrice: number | null
  /** Only 'working' rows draw/act; anything else is ignored. */
  status: string
}

/** The account state the HOST pushes into the attachment (it owns the transport — stream, poll,
 *  whatever). The package never fetches. */
export interface BrokerSnapshot {
  positions: readonly BrokerPosition[]
  orders: readonly BrokerOrder[]
}

/** The context a price validation runs in. `ref` is the band anchor (the level's current price, or
 *  the position anchor for a protective stop); `protectiveSide`/`mark` are present only on the
 *  protective-stop path. */
export interface PriceValidationCtx {
  tick: number
  ref: number
  protectiveSide?: 'long' | 'short'
  mark?: number
}

/** The host's price gate — run over every repriced level BEFORE an action fires (and again on an
 *  Undo restore). Return [] for valid, else human-readable errors (the first is shown). Supply the
 *  SAME rules your backend enforces; omitted ⇒ only tick-snapping applies (the package never
 *  invents a band of its own). */
export type PricePolicy = (price: number, ctx: PriceValidationCtx) => string[]

/** The ACTIONS a host's backend exposes — the whole write surface of chart trading. Every method
 *  returns a Promise; a rejection's message is surfaced verbatim through onError. `intentKey` is an
 *  idempotency HINT: stable across retries of one gesture, different once the intent changes (the
 *  price is part of it) — map it to your backend's dedup key, or ignore it. */
export interface ChartBroker {
  /** Reprice a working order IN PLACE (atomic on the backend — never client cancel+place). MUST
   *  reject (throw) when the backend reports anything but a live amend/replace. For a stop_limit,
   *  `price` is the TRIGGER and `stopLimitPrice` the conversion limit — BOTH are always sent (one
   *  changed by the drag, the other passed through as last reported), one atomic modify. */
  moveOrder(args: {
    brokerOrderId: string
    instrument: string
    side: 'buy' | 'sell'
    qty: number
    orderType: 'stop' | 'limit' | 'stop_limit'
    price: number
    stopLimitPrice?: number
    /** The order's attached PRE-ARM bracket as the host knows it (legs that arm when the entry
     *  fills). A backend whose reprice is a cancel+re-place MUST recreate these legs — without them
     *  the re-placed entry silently loses its protection. Absent = the order carries no bracket. */
    currentBracket?: { stopLoss?: number; takeProfit?: number }
    /** The order's CURRENT resting prices (pre-move), for backends that must restore the original
     *  shape when the re-place is rejected. */
    current?: { price: number; stopLimitPrice?: number }
    /** Contract tick — for backends that express bracket legs as tick offsets. */
    tick?: number
    intentKey: string
  }): Promise<void>
  /** Set/replace the position's protective exits as ONE unit. The pair is the primitive because the
   *  two levels are cancel-linked siblings at the venue — set independently, a survivor outlives its
   *  position as an OPENING order. Three-state per level: a number sets it, `null` removes it, and
   *  OMITTING it leaves the resting leg untouched. */
  setExits(args: { instrument: string; takeProfit?: number | null; stopLoss?: number | null; intentKey: string }): Promise<void>
  /** Close the position at market. */
  flatten(instrument: string): Promise<void>
  /** Cancel one working order. */
  cancelOrder(brokerOrderId: string): Promise<void>
  /** OPTIONAL: flip the position in ONE backend operation (clear the instrument's working orders,
   *  then a qty×2 opposite market order). Omitted ⇒ the ⇄ affordance never renders. Resolve with
   *  how many orders were cleared (for the toast). */
  reversePosition?(args: { instrument: string; intentKey: string }): Promise<{ cancelledOrders: number }>
  /** OPTIONAL: set/edit/remove the TP/SL bracket attached to an UNFILLED entry order. The legs are
   *  PRE-ARM — OCO-pending at the backend, arming only when the entry fills — so they are not
   *  working orders yet and cannot be moved through setExits. A leg field PRESENT states that leg's
   *  END STATE (a price sets it, null removes it); an ABSENT field leaves the leg as it currently
   *  rests, which the adapter resolves from `currentBracket` (the order's full bracket as the host
   *  knows it — cancel+re-place backends need it to carry the untouched leg through). Omitted ⇒
   *  resting entry lines draw no bracket handles. */
  setOrderBracket?(args: {
    brokerOrderId: string
    instrument: string
    side: 'buy' | 'sell'
    qty: number
    orderType: 'stop' | 'limit' | 'stop_limit'
    /** The entry's resting price — a limit's level, a stop's trigger (stop_limit: the TRIGGER). */
    price: number
    stopLimitPrice?: number
    tick: number
    stopLoss?: number | null
    takeProfit?: number | null
    currentBracket?: { stopLoss?: number; takeProfit?: number }
    intentKey: string
  }): Promise<void>
}

// ── Pure helpers ────────────────────────────────────────────────────────────────

/** Snap a raw price to the instrument tick. Identity when the tick is unknown (≤ 0) — callers that
 *  REQUIRE a tick check for it first; this never invents alignment. */
export const snapPrice = (n: number, tick: number): number => (tick > 0 ? Math.round(n / tick) * tick : n)

/** Decimal places implied by a tick (0.25 → 2, 0.0001 → 4); falls back to 2 when the tick is unknown. */
export function decimalsOfTick(tick?: number): number {
  if (tick == null || !Number.isFinite(tick) || tick <= 0) return 2
  const s = tick.toString()
  const sci = s.match(/e-(\d+)$/i)
  if (sci) return Number(sci[1]) + (s.split('e')[0].split('.')[1]?.length ?? 0)
  const dot = s.indexOf('.')
  return dot < 0 ? 0 : s.length - dot - 1
}

/** Render a price at the tick's own precision for a toast/label. */
export function fmtPrice(n: number, tick?: number): string {
  return Number.isFinite(n) ? n.toFixed(decimalsOfTick(tick)) : ''
}

/** True when a drop is a genuine MOVE rather than a tap: after snapping to the tick, the price
 *  actually changed. A sub-tick wiggle snaps back to the same tick and is treated as a click (no
 *  order). With no tick, a tiny epsilon guards a pure-pixel tap. */
export function isMeaningfulMove(finalPrice: number, originalPrice: number, tick?: number): boolean {
  if (typeof tick === 'number' && tick > 0) return snapPrice(finalPrice, tick) !== snapPrice(originalPrice, tick)
  return Math.abs(finalPrice - originalPrice) > 1e-9
}

// ── Hit-test priority (pure) ────────────────────────────────────────────────────
// The gesture layer builds one candidate per on-screen line within the grab radius (computing each
// line's y itself via the series); this decides which one a pointer at that y resolves to.
// Deterministic priority:
//   (1) a ✕ control on ANY line wins (close a position / cancel an order),
//   (1b) then the ⇄ control on a POSITION line (a separate painted button, so only positions ever
//        report it),
//   (2) otherwise prefer an ORDER line (stop/limit) to reprice,
//   (3) the position-average line is NEVER a reprice target — only its X flattens (a stray avg grab
//       must not become a market flatten),
// tie-broken by the nearest line.

export interface HitCandidate {
  key: string
  kind: LineKind
  /** |pointerY − lineY| in px. */
  dist: number
  /** The pointer landed on this line's painted ✕ (close/cancel) control. */
  isXZone: boolean
  /** The pointer landed on the painted ⇄ (reverse) control. Position lines only. */
  isRevZone?: boolean
}

export interface Hit {
  key: string
  kind: LineKind
  isXZone: boolean
  isRevZone: boolean
}

/** Resolve overlapping line candidates to a single deterministic hit (or null = do nothing, let the
 *  chart pan). */
export function pickHit(cands: HitCandidate[]): Hit | null {
  if (cands.length === 0) return null
  const nearest = (a: HitCandidate, b: HitCandidate) => (b.dist < a.dist ? b : a)
  const xs = cands.filter((c) => c.isXZone)
  if (xs.length) {
    const best = xs.reduce(nearest)
    return { key: best.key, kind: best.kind, isXZone: true, isRevZone: false }
  }
  const revs = cands.filter((c) => c.isRevZone && c.kind === 'position')
  if (revs.length) {
    const best = revs.reduce(nearest)
    return { key: best.key, kind: best.kind, isXZone: false, isRevZone: true }
  }
  const orders = cands.filter((c) => c.kind !== 'position')
  if (orders.length) {
    const best = orders.reduce(nearest)
    return { key: best.key, kind: best.kind, isXZone: false, isRevZone: false }
  }
  return null
}

// ── Drop → execution plan (pure) ────────────────────────────────────────────────

/** The resolved target a gesture acts on, re-resolved against the LIVE snapshot inside planBrokerDrop. */
export type DropTarget =
  | { type: 'reprice-stop'; brokerOrderId: string }
  | { type: 'reprice-limit'; brokerOrderId: string }
  /** One leg of a stop_limit's two lines — the drag moves THAT price; the other passes through. */
  | { type: 'reprice-stop-limit'; brokerOrderId: string; leg: 'trigger' | 'limit' }
  | { type: 'flatten'; instrument: string }
  | { type: 'cancel'; brokerOrderId: string }

export interface PlanCtx {
  /** The CURRENT account snapshot (re-resolved at drop time, not the snapshot at grab time). */
  snapshot: BrokerSnapshot
  /** A stable prefix for intent keys (the host's broker/account identity — a selection switch must
   *  never reuse the previous selection's keys). */
  scope: string
  /** Contract tick — REQUIRED to reprice (snap-before-validate). Undefined ⇒ reprice drops. */
  tick?: number
  /** Last trade price — pass ONLY when the feed is live; undefined ⇒ the protective-side check is
   *  skipped and the stop is banded against the position avg alone. */
  mark?: number
  /** The host's price gate. Omitted ⇒ snap-only. */
  policy?: PricePolicy
}

/** What the gesture layer should execute. `intentKey` is the idempotency hint handed to the broker
 *  (undefined ⇒ no claim: flatten/cancel). */
export interface BrokerExec {
  drop: false
  method: 'setExits' | 'moveOrder' | 'flatten' | 'cancel'
  instrument: string
  /** `setExits` only — WHICH half of the protective pair this drop moves. Required on that method
   *  because the two legs share one call: sending a target's price as a stop would move the wrong
   *  level (and through the market). */
  exitLeg?: 'stop' | 'target'
  price?: number
  /** stop_limit only — the conversion limit, sent alongside `price` (the trigger) in one modify. */
  stopLimitPrice?: number
  brokerOrderId?: string
  side?: 'buy' | 'sell'
  qty?: number
  orderType?: 'stop' | 'limit' | 'stop_limit'
  intentKey?: string
  toast: string
  /** A protective stop's previous trigger to restore on Undo (null ⇒ no undo offered for this move). */
  undoPrevStop?: number | null
  /** A protective stop moved without a live price to verify its side against — surfaced as a note. */
  note?: string
}

export type BrokerPlan = { drop: true; reason: string } | BrokerExec

const drop = (reason: string): BrokerPlan => ({ drop: true, reason })
const noErrors: PricePolicy = () => []

export function planBrokerDrop(target: DropTarget, finalPrice: number, ctx: PlanCtx): BrokerPlan {
  const { snapshot, scope, tick, mark } = ctx
  const validate = ctx.policy ?? noErrors
  const positions = snapshot.positions
  const orders = snapshot.orders

  if (target.type === 'flatten') {
    const pos = positions.find((p) => p.instrument === target.instrument && p.qty !== 0)
    if (!pos) return drop('Position already closed')
    return { drop: false, method: 'flatten', instrument: pos.instrument, toast: 'Position closed' }
  }

  if (target.type === 'cancel') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working')
    if (!ord) return drop('Order no longer working')
    return { drop: false, method: 'cancel', instrument: ord.instrument, brokerOrderId: ord.brokerOrderId, toast: 'Order cancelled' }
  }

  // Reprice (stop or limit): require a known tick, then snap BEFORE validating + calling the broker.
  if (!(typeof tick === 'number' && tick > 0)) return drop('Tick size unknown, cannot reprice')
  const snapped = snapPrice(finalPrice, tick)

  if (target.type === 'reprice-limit') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'limit')
    if (!ord) return drop('Order no longer working')
    const cur = ord.limitPrice
    if (typeof cur !== 'number' || cur <= 0) return drop('No current limit price to band against')
    const errs = validate(snapped, { tick, ref: cur })
    if (errs.length) return drop(errs[0]!)
    // Classify AT DROP, exactly as the stop branch below does. A limit that CLOSES an open position is
    // the position's TARGET, and a target is half of a cancel-linked pair — venues express that as a
    // close-only flag or an OCO group, and both are properties of the ORDER, not of its price. Moving
    // it by cancel-and-re-place would hand back an ordinary opening order in its place, so a protective
    // target moves through the exits primitive, which re-places the pair and keeps the link. Ambiguous
    // books (a scale-in with more than one closing limit) can't say WHICH leg was grabbed, so they stay
    // on the plain reprice — the same rule, and the same limit, as the protective stop.
    const pos = positions.find((p) => p.instrument === ord.instrument && p.qty !== 0)
    const closesPosition = (o: BrokerOrder): boolean => !!pos && (pos.qty > 0 ? o.side === 'sell' : o.side === 'buy')
    const closingLimits = orders.filter((o) => o.orderType === 'limit' && o.instrument === ord.instrument && o.status === 'working' && closesPosition(o))
    if (closesPosition(ord) && closingLimits.length === 1) {
      return {
        drop: false,
        method: 'setExits',
        exitLeg: 'target',
        instrument: ord.instrument,
        price: snapped,
        intentKey: `target|${scope}|${ord.instrument}|${snapped}`,
        toast: `Target moved to ${fmtPrice(snapped, tick)}`,
      }
    }
    return {
      drop: false,
      method: 'moveOrder',
      instrument: ord.instrument,
      price: snapped,
      brokerOrderId: ord.brokerOrderId,
      side: ord.side,
      qty: ord.qty,
      orderType: 'limit',
      intentKey: `replace|${scope}|${ord.brokerOrderId}|${snapped}`,
      toast: `Order moved to ${fmtPrice(snapped, tick)}`,
    }
  }

  // reprice-stop-limit: one leg of the order's two lines. The dragged leg bands against ITS OWN
  // current price (the same convention as any order reprice); the other leg passes through exactly
  // as the broker last reported it. The reference validates no relation between the two prices
  // (docs/chart-trading-corpus/stop-limit-order-lines.md §3) — the venue is the authority there.
  if (target.type === 'reprice-stop-limit') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'stop_limit')
    if (!ord) return drop('Order no longer working')
    const trigger = ord.triggerPrice
    const limit = ord.limitPrice
    if (typeof trigger !== 'number' || trigger <= 0 || typeof limit !== 'number' || limit <= 0) return drop('Order prices unknown, cannot reprice')
    const cur = target.leg === 'trigger' ? trigger : limit
    const errs = validate(snapped, { tick, ref: cur })
    if (errs.length) return drop(errs[0]!)
    const nextTrigger = target.leg === 'trigger' ? snapped : trigger
    const nextLimit = target.leg === 'limit' ? snapped : limit
    return {
      drop: false,
      method: 'moveOrder',
      instrument: ord.instrument,
      price: nextTrigger,
      stopLimitPrice: nextLimit,
      brokerOrderId: ord.brokerOrderId,
      side: ord.side,
      qty: ord.qty,
      orderType: 'stop_limit',
      intentKey: `replace|${scope}|${ord.brokerOrderId}|${nextTrigger}|${nextLimit}`,
      toast: `${target.leg === 'trigger' ? 'Trigger' : 'Limit'} moved to ${fmtPrice(snapped, tick)}`,
    }
  }

  // reprice-stop: classify AT DROP. A protective stop (open position + exactly one working stop)
  // goes through setExits (the position-level protective pair); anything else (scale-in
  // with >1 stop, or no position) is a plain working-order reprice banded against its own trigger.
  const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'stop')
  if (!ord) return drop('Order no longer working')
  const pos = positions.find((p) => p.instrument === ord.instrument && p.qty !== 0)
  const workingStops = orders.filter((o) => o.orderType === 'stop' && o.instrument === ord.instrument && o.status === 'working')
  const protective = !!pos && workingStops.length === 1

  if (protective) {
    const avg = typeof pos!.avgPrice === 'number' && pos!.avgPrice > 0 ? pos!.avgPrice : null
    const anchor = avg ?? (typeof mark === 'number' && mark > 0 ? mark : null)
    if (anchor == null) return drop('No price to anchor the stop against')
    const errs = validate(snapped, {
      tick,
      ref: anchor,
      protectiveSide: pos!.qty > 0 ? 'long' : 'short',
      mark: typeof mark === 'number' && mark > 0 ? mark : undefined,
    })
    if (errs.length) return drop(errs[0]!)
    const prevStop = typeof ord.triggerPrice === 'number' && ord.triggerPrice > 0 ? ord.triggerPrice : null
    return {
      drop: false,
      method: 'setExits',
      exitLeg: 'stop',
      instrument: ord.instrument,
      price: snapped,
      intentKey: `stop|${scope}|${ord.instrument}|${snapped}`,
      toast: `Stop moved to ${fmtPrice(snapped, tick)}`,
      undoPrevStop: prevStop,
      note: typeof mark === 'number' && mark > 0 ? undefined : 'No live price, stop side unverified',
    }
  }

  // Non-protective stop reprice (scale-in / orphaned working stop): band vs its CURRENT trigger, no undo.
  const cur = ord.triggerPrice
  if (typeof cur !== 'number' || cur <= 0) return drop('No current stop price to band against')
  const errs = validate(snapped, { tick, ref: cur })
  if (errs.length) return drop(errs[0]!)
  return {
    drop: false,
    method: 'moveOrder',
    instrument: ord.instrument,
    price: snapped,
    brokerOrderId: ord.brokerOrderId,
    side: ord.side,
    qty: ord.qty,
    orderType: 'stop',
    intentKey: `replace|${scope}|${ord.brokerOrderId}|${snapped}`,
    toast: `Stop moved to ${fmtPrice(snapped, tick)}`,
    undoPrevStop: null,
  }
}

/** Re-validate a protective stop restore (the timed Undo) against the THEN-CURRENT snapshot.
 *  Returns the snapped price to re-set, or an error string to no-op on (position gone / flipped /
 *  off-band). Mirrors the protective path's gate so an Undo can never push an invalid stop after
 *  the position changed. */
export function boundStopPrice(
  price: number,
  opts: { tick?: number; anchor: number | null; protectiveSide: 'long' | 'short'; mark?: number; policy?: PricePolicy },
): { price: number } | { error: string } {
  if (!(typeof opts.tick === 'number' && opts.tick > 0)) return { error: 'Tick size unknown' }
  if (opts.anchor == null) return { error: 'No anchor' }
  const snapped = snapPrice(price, opts.tick)
  const errs = (opts.policy ?? noErrors)(snapped, {
    tick: opts.tick,
    ref: opts.anchor,
    protectiveSide: opts.protectiveSide,
    mark: typeof opts.mark === 'number' && opts.mark > 0 ? opts.mark : undefined,
  })
  return errs.length ? { error: errs[0]! } : { price: snapped }
}

/** Bound a dragged bracket level to the side its kind requires: a stop PROTECTS (below a long,
 *  above a short), a target PROFITS (above a long, below a short). Snap first, then REJECT a level
 *  dropped on the wrong side — silently flipping it to the legal side would place an exit the
 *  trader never aimed at. */
export function boundBracketPrice(
  price: number,
  opts: { tick?: number; anchor: number | null; positionSide: 'long' | 'short'; kind: 'tp' | 'sl'; mark?: number; policy?: PricePolicy },
): { price: number } | { error: string } {
  if (opts.kind === 'sl') {
    return boundStopPrice(price, { tick: opts.tick, anchor: opts.anchor, protectiveSide: opts.positionSide, mark: opts.mark, policy: opts.policy })
  }
  if (!(typeof opts.tick === 'number' && opts.tick > 0)) return { error: 'Tick size unknown' }
  if (opts.anchor == null) return { error: 'No anchor' }
  const snapped = snapPrice(price, opts.tick)
  const above = opts.positionSide === 'long'
  if (above ? snapped <= opts.anchor : snapped >= opts.anchor) {
    return { error: `Take profit must be ${above ? 'above' : 'below'} the entry` }
  }
  return { price: snapped }
}

// ── Preview (host-decorated) line drop (pure; NEVER reaches the broker) ─────────
// A dragged PREVIEW line is a plan, not an order. planPreviewDrop snaps it to the tick and
// band-checks it against the host's entry reference, then returns ONLY { id, snappedPrice }. It
// deliberately carries NO method / intentKey / brokerOrderId, so the result CANNOT be fed to the
// action executor — a preview drop can only be routed back to the host's own callback.

export interface PreviewDropCtx {
  /** Contract tick — REQUIRED (snap-before-band). Undefined/≤0 ⇒ the drop is rejected (snap back). */
  tick?: number
  /** The host's entry reference — the band anchor. Absent/≤0 ⇒ snap only. */
  entryRef?: number
  policy?: PricePolicy
}

export type PreviewDropResult = { drop: true } | { drop: false; id: string; snappedPrice: number }

export function planPreviewDrop(id: string, rawPrice: number, ctx: PreviewDropCtx): PreviewDropResult {
  const { tick, entryRef } = ctx
  if (!(typeof tick === 'number' && tick > 0)) return { drop: true }
  if (!Number.isFinite(rawPrice) || rawPrice <= 0) return { drop: true }
  const snapped = snapPrice(rawPrice, tick)
  if (typeof entryRef === 'number' && entryRef > 0 && (ctx.policy ?? noErrors)(snapped, { tick, ref: entryRef }).length) return { drop: true }
  return { drop: false, id, snappedPrice: snapped }
}

/** Dispatch a preview-line drop: plan it, and on a valid result hand the snapped price to `emit`
 *  (the host relay) — NEVER to the broker. Returns true when emitted (leave the line where
 *  dropped), false to snap it back. Pure + broker-free so the never-execute guarantee is
 *  structural and unit-testable. */
export function dispatchPreviewDrop(id: string, rawPrice: number, ctx: PreviewDropCtx, emit: (id: string, price: number) => void): boolean {
  const res = planPreviewDrop(id, rawPrice, ctx)
  if (res.drop) return false
  emit(res.id, res.snappedPrice)
  return true
}
