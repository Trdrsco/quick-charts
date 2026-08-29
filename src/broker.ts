// The chart's GESTURE side of trading — what remains chart-owned now that the contracts, the
// snapshots and the pure price math live in @trdrs/broker (the seam every trading surface
// consumes). This file turns pointer geometry into broker intents: hit-testing overlapping lines,
// planning a drop into ONE executable action against the LIVE snapshot, and bounding dragged
// levels. Money-deciding logic stays pure so it unit-tests without a chart, a feed, or a broker;
// the refusals it returns are the widget's own words, so each function takes the language
// optionally (`t`) and speaks English without one.
import {
  fmtPrice,
  snapPrice,
  type BrokerOrder,
  type BrokerSnapshot,
  type PricePolicy,
} from '@trdrs/broker'
import { englishChartStrings, type ChartTranslate } from './i18n'

/** What a live trade line represents. A stop-limit order renders as TWO lines, one per price — the
 *  reference behavior: `stop_limit` is the
 *  TRIGGER line (it carries the order's ✕ — cancelling cancels the whole order), `stop_limit_limit`
 *  is its conversion-limit line (no second ✕ — one order cancels once). Each line drags its OWN
 *  price; the un-dragged price rides along unchanged in the same atomic replace. */
export type LineKind = 'position' | 'stop' | 'limit' | 'stop_limit' | 'stop_limit_limit'

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
  /** The widget's language for the plan's own toast, note and refusal. Omitted ⇒ English. */
  t?: ChartTranslate
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
  const t = ctx.t ?? englishChartStrings()
  const validate = ctx.policy ?? noErrors
  const positions = snapshot.positions
  const orders = snapshot.orders

  if (target.type === 'flatten') {
    const pos = positions.find((p) => p.instrument === target.instrument && p.qty !== 0)
    if (!pos) return drop(t('broker.positionAlreadyClosed'))
    return { drop: false, method: 'flatten', instrument: pos.instrument, toast: t('broker.positionClosed') }
  }

  if (target.type === 'cancel') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working')
    if (!ord) return drop(t('broker.orderNotWorking'))
    return { drop: false, method: 'cancel', instrument: ord.instrument, brokerOrderId: ord.brokerOrderId, toast: t('broker.orderCancelled') }
  }

  // Reprice (stop or limit): require a known tick, then snap BEFORE validating + calling the broker.
  if (!(typeof tick === 'number' && tick > 0)) return drop(t('broker.tickUnknownReprice'))
  const snapped = snapPrice(finalPrice, tick)

  if (target.type === 'reprice-limit') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'limit')
    if (!ord) return drop(t('broker.orderNotWorking'))
    const cur = ord.limitPrice
    if (typeof cur !== 'number' || cur <= 0) return drop(t('broker.noLimitBand'))
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
        toast: t('broker.targetMoved', { price: fmtPrice(snapped, tick) }),
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
      toast: t('broker.orderMoved', { price: fmtPrice(snapped, tick) }),
    }
  }

  // reprice-stop-limit: one leg of the order's two lines. The dragged leg bands against ITS OWN
  // current price (the same convention as any order reprice); the other leg passes through exactly
  // as the broker last reported it. The reference validates no relation between the two prices —
  // the venue is the authority there.
  if (target.type === 'reprice-stop-limit') {
    const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'stop_limit')
    if (!ord) return drop(t('broker.orderNotWorking'))
    const trigger = ord.triggerPrice
    const limit = ord.limitPrice
    if (typeof trigger !== 'number' || trigger <= 0 || typeof limit !== 'number' || limit <= 0) return drop(t('broker.pricesUnknownReprice'))
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
      toast: t(target.leg === 'trigger' ? 'broker.triggerMoved' : 'broker.limitMoved', { price: fmtPrice(snapped, tick) }),
    }
  }

  // reprice-stop: classify AT DROP. A protective stop (open position + exactly one working stop)
  // goes through setExits (the position-level protective pair); anything else (scale-in
  // with >1 stop, or no position) is a plain working-order reprice banded against its own trigger.
  const ord = orders.find((o) => o.brokerOrderId === target.brokerOrderId && o.status === 'working' && o.orderType === 'stop')
  if (!ord) return drop(t('broker.orderNotWorking'))
  const pos = positions.find((p) => p.instrument === ord.instrument && p.qty !== 0)
  const workingStops = orders.filter((o) => o.orderType === 'stop' && o.instrument === ord.instrument && o.status === 'working')
  const protective = !!pos && workingStops.length === 1

  if (protective) {
    const avg = typeof pos!.avgPrice === 'number' && pos!.avgPrice > 0 ? pos!.avgPrice : null
    const anchor = avg ?? (typeof mark === 'number' && mark > 0 ? mark : null)
    if (anchor == null) return drop(t('broker.noStopAnchor'))
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
      toast: t('broker.stopMoved', { price: fmtPrice(snapped, tick) }),
      undoPrevStop: prevStop,
      note: typeof mark === 'number' && mark > 0 ? undefined : t('broker.stopSideUnverified'),
    }
  }

  // Non-protective stop reprice (scale-in / orphaned working stop): band vs its CURRENT trigger, no undo.
  const cur = ord.triggerPrice
  if (typeof cur !== 'number' || cur <= 0) return drop(t('broker.noStopBand'))
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
    toast: t('broker.stopMoved', { price: fmtPrice(snapped, tick) }),
    undoPrevStop: null,
  }
}

/** Re-validate a protective stop restore (the timed Undo) against the THEN-CURRENT snapshot.
 *  Returns the snapped price to re-set, or an error string to no-op on (position gone / flipped /
 *  off-band). Mirrors the protective path's gate so an Undo can never push an invalid stop after
 *  the position changed. */
export function boundStopPrice(
  price: number,
  opts: { tick?: number; anchor: number | null; protectiveSide: 'long' | 'short'; mark?: number; policy?: PricePolicy; t?: ChartTranslate },
): { price: number } | { error: string } {
  const t = opts.t ?? englishChartStrings()
  if (!(typeof opts.tick === 'number' && opts.tick > 0)) return { error: t('broker.tickUnknown') }
  if (opts.anchor == null) return { error: t('broker.noAnchor') }
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
  opts: { tick?: number; anchor: number | null; positionSide: 'long' | 'short'; kind: 'tp' | 'sl'; mark?: number; policy?: PricePolicy; t?: ChartTranslate },
): { price: number } | { error: string } {
  const t = opts.t ?? englishChartStrings()
  if (opts.kind === 'sl') {
    return boundStopPrice(price, { tick: opts.tick, anchor: opts.anchor, protectiveSide: opts.positionSide, mark: opts.mark, policy: opts.policy, t: opts.t })
  }
  if (!(typeof opts.tick === 'number' && opts.tick > 0)) return { error: t('broker.tickUnknown') }
  if (opts.anchor == null) return { error: t('broker.noAnchor') }
  const snapped = snapPrice(price, opts.tick)
  const above = opts.positionSide === 'long'
  if (above ? snapped <= opts.anchor : snapped >= opts.anchor) {
    return { error: t(above ? 'broker.takeProfitAbove' : 'broker.takeProfitBelow') }
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
