// The order-ticket CONTROLLER — the state owner the chart-native draft chrome always lacked by
// design (the trade-line layer renders the draft's qty/type/side controls but owns no draft state
// and no submit path). This module is that owner, DOM-free and framework-free: it composes ONE
// draft order, publishes it as the attachment's PreviewSet (ghost lines + the draft control), and
// submits through ChartBroker.placeOrder behind an optional confirm gate. Pre-money discipline is
// structural, as everywhere on the draft path: every edit only recomposes the preview; the ONLY
// call that can spend is submit(), and it refuses without an armed scope.
import { snapPrice, type ChartBroker, type PricePolicy } from './broker'
import type { PreviewLine, PreviewSet } from './tradeLines'

export type TicketOrderType = 'market' | 'limit' | 'stop' | 'stop_limit'

export interface TicketState {
  side: 'buy' | 'sell'
  qty: number
  orderType: TicketOrderType
  /** A limit's level, a stop's trigger (stop_limit: the TRIGGER). Null for market. */
  price: number | null
  /** The stop_limit conversion limit; null for every other type. */
  stopLimitPrice: number | null
}

/** What submit() sends — placeOrder's argument shape, echoed to the confirm gate verbatim so the
 *  approver sees exactly what will be placed. */
export interface TicketSubmit {
  instrument: string
  side: 'buy' | 'sell'
  qty: number
  orderType: TicketOrderType
  price?: number
  stopLimitPrice?: number
  tick?: number
  intentKey: string
}

export interface OrderTicketDeps {
  broker: ChartBroker
  instrument: () => string
  /** Contract tick, or null while unknown — opening prices snap to it when present. */
  tick: () => number | null
  /** The live-trusted mark, or null — the default level a fresh draft opens at. */
  mark: () => number | null
  /** The armed selection ('broker|account'), or null — submit refuses without one. */
  scope: () => string | null
  /** The account's trading lock (a risk lockout, an end-of-day close) — submit refuses while
   *  true. Edits stay allowed: composing a draft is not trading. */
  locked?: () => boolean
  /** The host's price gate — run over the composed entry before submit, same as a drag. */
  policy?: PricePolicy
  /** The confirm gate: shown the EXACT submit payload; resolve false to veto. Absent = no gate. */
  confirm?: (order: TicketSubmit) => Promise<boolean>
  /** The recomposed preview after every change (null = the ticket closed) — push it into the
   *  trade-line attachment. */
  onChange: (preview: PreviewSet | null, state: TicketState | null) => void
  onAction?: (text: string) => void
  onError?: (msg: string) => void
}

export interface OrderTicket {
  /** Open (or re-seed) the draft. Defaults: buy 1 limit at the snapped mark. */
  open(seed?: Partial<TicketState>): void
  close(): void
  state(): TicketState | null
  setSide(side: 'buy' | 'sell'): void
  setQty(qty: number): void
  setOrderType(orderType: TicketOrderType): void
  /** Reprice the entry (a preview drag lands here). For a stop_limit, `leg` says which line. */
  setPrice(price: number, leg?: 'trigger' | 'limit'): void
  /** Compose → policy-check → confirm gate → placeOrder. Resolves after the broker accepts;
   *  a veto or refusal resolves without placing (the error channel says why). */
  submit(): Promise<void>
  destroy(): void
}

const TYPE_LABEL: Record<TicketOrderType, string> = { market: 'Market', limit: 'Limit', stop: 'Stop', stop_limit: 'Stop Limit' }

export function createOrderTicket(deps: OrderTicketDeps): OrderTicket {
  let draft: TicketState | null = null
  /** Mints per composed intent: stable across RETRIES of the same order, fresh the moment any
   *  field of the order changes — the idempotency contract every money path here follows. */
  let intentSeq = 0
  let intentKey: string | null = null
  const remint = () => {
    intentSeq += 1
    intentKey = `ticket|${deps.scope() ?? 'unarmed'}|${deps.instrument()}|${intentSeq}`
  }

  const snapped = (n: number): number => {
    const tick = deps.tick()
    return tick && tick > 0 ? snapPrice(n, tick) : n
  }

  const compose = (): PreviewSet | null => {
    if (!draft) return null
    const lines: PreviewLine[] = []
    if (draft.orderType !== 'market' && draft.price != null) {
      lines.push({ id: 'ticket-entry', kind: 'entry', price: draft.price, label: TYPE_LABEL[draft.orderType], qty: draft.qty, editable: true })
    }
    if (draft.orderType === 'stop_limit' && draft.stopLimitPrice != null) {
      lines.push({ id: 'ticket-limit', kind: 'leg', price: draft.stopLimitPrice, label: 'Limit', qty: draft.qty, editable: true })
    }
    return {
      instrument: deps.instrument(),
      tick: deps.tick() ?? 0,
      lines,
      entryRef: deps.mark(),
      side: draft.side,
      orderType: TYPE_LABEL[draft.orderType],
      qty: draft.qty,
      qtyStep: 1,
    }
  }

  const publish = () => deps.onChange(compose(), draft ? { ...draft } : null)

  const mutate = (patch: Partial<TicketState>) => {
    if (!draft) return
    draft = { ...draft, ...patch }
    remint() // the order changed — a retry of the OLD intent must not place the NEW one
    publish()
  }

  return {
    open(seed) {
      const at = snapped(seed?.price ?? deps.mark() ?? 0)
      draft = {
        side: seed?.side ?? 'buy',
        qty: Math.max(1, Math.round(seed?.qty ?? 1)),
        orderType: seed?.orderType ?? 'limit',
        price: (seed?.orderType ?? 'limit') === 'market' ? null : at > 0 ? at : null,
        stopLimitPrice: seed?.orderType === 'stop_limit' ? (seed?.stopLimitPrice ?? (at > 0 ? at : null)) : null,
      }
      remint()
      publish()
    },
    close() {
      if (!draft) return
      draft = null
      publish()
    },
    state: () => (draft ? { ...draft } : null),
    setSide(side) {
      mutate({ side })
    },
    setQty(qty) {
      if (Number.isFinite(qty) && qty >= 1) mutate({ qty: Math.round(qty) })
    },
    setOrderType(orderType) {
      if (!draft) return
      const at = draft.price ?? snapped(deps.mark() ?? 0)
      mutate({
        orderType,
        price: orderType === 'market' ? null : at > 0 ? at : null,
        stopLimitPrice: orderType === 'stop_limit' ? (draft.stopLimitPrice ?? (at > 0 ? at : null)) : null,
      })
    },
    setPrice(price, leg = 'trigger') {
      if (!draft || draft.orderType === 'market' || !(price > 0)) return
      if (leg === 'limit' && draft.orderType === 'stop_limit') mutate({ stopLimitPrice: snapped(price) })
      else mutate({ price: snapped(price) })
    },
    async submit() {
      if (!draft || !intentKey) return
      const scope = deps.scope()
      if (!scope) {
        deps.onError?.('No account armed — connect an account to place orders.')
        return
      }
      if (deps.locked?.()) {
        deps.onError?.('Trading is locked for this account.')
        return
      }
      if (draft.orderType !== 'market' && draft.price == null) {
        deps.onError?.('The order needs a price.')
        return
      }
      // The same gate a drag runs: the host's rules, over the composed entry.
      if (draft.price != null && deps.policy) {
        const tick = deps.tick() ?? 0
        const errors = deps.policy(draft.price, { tick, ref: deps.mark() ?? draft.price })
        if (errors.length > 0) {
          deps.onError?.(errors[0]!)
          return
        }
      }
      const order: TicketSubmit = {
        instrument: deps.instrument(),
        side: draft.side,
        qty: draft.qty,
        orderType: draft.orderType,
        ...(draft.price != null ? { price: draft.price } : {}),
        ...(draft.stopLimitPrice != null ? { stopLimitPrice: draft.stopLimitPrice } : {}),
        ...(deps.tick() != null ? { tick: deps.tick()! } : {}),
        intentKey,
      }
      if (deps.confirm && !(await deps.confirm(order))) return // vetoed — the draft stays for editing
      if (!deps.broker.placeOrder) {
        deps.onError?.('This integration does not place orders.')
        return
      }
      try {
        await deps.broker.placeOrder(order)
      } catch (e) {
        deps.onError?.(e instanceof Error ? e.message : String(e)) // the broker's words, verbatim
        return // the draft stays — the trader edits and retries (same intent → same key)
      }
      deps.onAction?.(`${order.side === 'buy' ? 'Buy' : 'Sell'} ${order.qty} ${TYPE_LABEL[order.orderType]} placed`)
      draft = null
      publish()
    },
    destroy() {
      draft = null
      deps.onChange(null, null)
    },
  }
}
