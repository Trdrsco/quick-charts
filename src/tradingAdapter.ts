// The trading-plane seam — the exact analog of ChartDatafeed for account data: a host (or the
// widget, when constructed with `trading`) consumes ONE adapter that carries the ACTIONS (a
// ChartBroker) and pushes the ACCOUNT STATE (full, consistent snapshots). Full-snapshot is the
// law, not a convenience: every push carries the account's complete positions + working orders as
// one atomic read, so there is no per-operation update to match, no timeout waiting for a matched
// id, and a row that disappears IS a closed/cancelled row. The package holds no trading state of
// its own — it only ever reflects the latest snapshot.
import type { BrokerSnapshot, ChartBroker, PricePolicy } from './broker'

/** One full account snapshot plus the account-level truths the trade surface renders with. Every
 *  optional field follows the honesty rule: absent = unknown, and the surface omits the readout
 *  (a bare P&L number, no guessed currency) rather than fabricating one. */
export interface AccountSnapshot extends BrokerSnapshot {
  /** The selection identity ('broker|account'), or null when no account is armed — lines render
   *  display-only and every money gesture stays disarmed. Doubles as the intent-key prefix so a
   *  selection switch never reuses idempotency keys. */
  scope: string | null
  /** The account's currency, shown beside money P&L. */
  currency?: string
  /** Contract point value (money per 1.0 of price per unit) — what turns an exit level into the
   *  amount it would realise. */
  pointValue?: number
  /** Trading lock (a risk lockout, an end-of-day close): live actions disarm, display stays. */
  locked?: boolean
  /** PRE-ARM TP/SL levels attached to UNFILLED entries, keyed by brokerOrderId — the backend
   *  holds these OCO-pending, so only the account plane knows them. */
  orderBrackets?: Record<string, { stopLoss?: number; takeProfit?: number }>
  /** Working-order ids whose lifecycle belongs to a backend-side manager (an ATM strategy) —
   *  bracket handles and size editing are suppressed on them. */
  managedOrderIds?: readonly string[]
}

/** Declare-only-truth capabilities, read once at mount (the DatafeedConfig pattern). Everything
 *  here is a truth PRESENCE cannot express — capability that IS a method (reverse, brackets,
 *  placing) is derived from the ChartBroker itself and never declared twice. */
export interface TradingCapabilities {
  /** Whether the backend can rest a cancel-linked protective pair. Absent = supported. */
  exits?: boolean
  /** The ENTRY order types a pre-arm bracket can attach to. Absent = every type; an empty array
   *  = no bracket editing at all. */
  orderBracketTypes?: readonly string[]
}

export interface TradingAdapterHandlers {
  /** A FULL account snapshot (the law above). Delivered on subscribe and on every change; a
   *  reconnecting transport re-syncs by simply pushing the latest snapshot again. */
  onSnapshot(snapshot: AccountSnapshot): void
  /** Transport status ('live' | 'reconnecting' | backend codes) — display-layer information. */
  onStatus?(status: string): void
}

/** The trading plane a chart host consumes: actions + pushed account state + the host's price
 *  rules. Implement it over any backend — or hand a chart the reference engine adapter. */
export interface TradingAdapter {
  broker: ChartBroker
  /** Subscribe to account snapshots. Returns the unsubscribe. The adapter owns the transport
   *  (stream, poll, replay session) and its reconnection. */
  subscribeAccount(handlers: TradingAdapterHandlers): () => void
  /** OPTIONAL capability declaration, read once at mount. Declare only what is true. */
  capabilities?(): Promise<TradingCapabilities>
  /** The SAME price rules the backend enforces — a drag the chart accepts must never be rejected
   *  server-side. Omitted ⇒ only tick-snapping applies. */
  policy?: PricePolicy
}
