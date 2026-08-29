// The trading primitives — the reference platform's imperative chart-trading surface
// (`createOrderLine` / `createPositionLine` / `createExecutionShape`) over the SAME renderers the
// broker-driven trade layer draws with: a host with its OWN trading logic draws lines and marks
// directly, without a TradingAdapter, and every gesture routes to the host's callbacks instead of
// a broker. A primitive is CHART-scoped, not symbol-scoped — it draws until the host removes it,
// across symbol switches (remove and redraw on symbol change when a line is symbol-bound).
//
// Buttons-only-when-callbacks, structurally: the handles synthesize a snapshot plus a per-row
// controls map from exactly which callbacks the host registered, so a ✕ / ⇄ with no handler
// behind it never renders and never hit-tests. The layer spends no money by construction — its
// "broker" is a dispatcher into host callbacks, and no other broker is in scope.
import type { BrokerAdapter, BrokerExecution, BrokerOrder, BrokerPosition, BrokerSnapshot } from '@trdrs/broker'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'
import { attachExecutionMarks, type ExecutionMarksHandle } from './executionMarks'
import type { ChartI18n } from './i18n'
import type { ChartOverrides } from './overrides'
import { attachTradeLines, type TradeLineAttachment, type TradeLineOptions } from './tradeLines'

export interface OrderLineOptions {
  side?: 'buy' | 'sell'
  /** The resting shape the line draws as (label + line style). Market/other types have no resting
   *  level and no line. */
  orderType?: 'stop' | 'limit'
  price?: number
  qty?: number
}

/** An imperative order line. Chainable setters; the line draws once its price is a real level
 *  (> 0). Controls follow the callbacks: ✕ with `onCancel`, drag-to-reprice with `onMove`, a
 *  tappable quantity chip with `onModify` — none registered ⇒ a display-only line. */
export interface OrderLineApi {
  setPrice(price: number): this
  getPrice(): number
  setQuantity(qty: number): this
  getQuantity(): number
  /** The line was dragged to a new price. The handle's own price is already updated when this
   *  fires; throw to refuse the move (the price reverts and the line snaps back). */
  onMove(cb: (price: number) => void): this
  /** The ✕ was tapped. The host owns the lifecycle — call `remove()` here to take the line down. */
  onCancel(cb: () => void): this
  /** The quantity chip was tapped — open your own editor and drive the handle's setters. */
  onModify(cb: () => void): this
  remove(): void
}

export interface PositionLineOptions {
  /** Signed: long > 0, short < 0. */
  qty?: number
  price?: number
}

/** An imperative position line at an average-entry level. Chainable setters; draws once its price
 *  is a real level and its quantity is non-zero. ✕ renders with `onClose`, ⇄ with `onReverse`. */
export interface PositionLineApi {
  setPrice(price: number): this
  getPrice(): number
  /** Signed: long > 0, short < 0; zero hides the line. */
  setQuantity(qty: number): this
  getQuantity(): number
  /** The money P&L the pill shows in money mode — the host backend's own number or null (the
   *  pill omits the cell rather than fabricating one). */
  setUnrealizedPnl(value: number | null): this
  onClose(cb: () => void): this
  onReverse(cb: () => void): this
  remove(): void
}

export interface ExecutionShapeOptions {
  direction?: 'buy' | 'sell'
  price?: number
  /** Fill time, epoch SECONDS — the mark anchors to the loaded bar containing it (a time outside
   *  the loaded window draws nothing rather than an arrow on the wrong bar). */
  timeSecs?: number
  qty?: number
}

/** An imperative execution mark — the same measured arrow-and-card rendering the account plane's
 *  fills use. Display-only (no buttons); the label and click card derive from the fill's facts. */
export interface ExecutionShapeApi {
  setPrice(price: number): this
  getPrice(): number
  setTime(timeSecs: number): this
  getTime(): number
  setDirection(direction: 'buy' | 'sell'): this
  getDirection(): 'buy' | 'sell'
  setQuantity(qty: number): this
  getQuantity(): number
  remove(): void
}

interface OrderLineState {
  id: string
  side: 'buy' | 'sell'
  orderType: 'stop' | 'limit'
  price: number
  qty: number
  cbMove?: (price: number) => void
  cbCancel?: () => void
  cbModify?: () => void
}

interface PositionLineState {
  id: string
  qty: number
  price: number
  unrealizedPnl: number | null
  cbClose?: () => void
  cbReverse?: () => void
}

interface ExecutionState {
  id: string
  direction: 'buy' | 'sell'
  price: number
  timeSecs: number
  qty: number
}

/** The store behind the three factories: handle state, the synthesized snapshot + controls map the
 *  renderer draws from, and the dispatcher-"broker" that turns renderer verbs into host callbacks.
 *  Pure (no DOM) — the attachment composes it with the renderers. Exported for tests. */
export function createPrimitivesStore(notify: () => void) {
  let seq = 0
  const orders = new Map<string, OrderLineState>()
  const positions = new Map<string, PositionLineState>()
  const executions = new Map<string, ExecutionState>()

  const orderApi = (s: OrderLineState): OrderLineApi => {
    const live = () => orders.get(s.id) === s
    const api: OrderLineApi = {
      setPrice(price) {
        s.price = price
        if (live()) notify()
        return api
      },
      getPrice: () => s.price,
      setQuantity(qty) {
        s.qty = qty
        if (live()) notify()
        return api
      },
      getQuantity: () => s.qty,
      onMove(cb) {
        s.cbMove = cb
        if (live()) notify()
        return api
      },
      onCancel(cb) {
        s.cbCancel = cb
        if (live()) notify()
        return api
      },
      onModify(cb) {
        s.cbModify = cb
        if (live()) notify()
        return api
      },
      remove() {
        if (orders.delete(s.id)) notify()
      },
    }
    return api
  }

  const positionApi = (s: PositionLineState): PositionLineApi => {
    const live = () => positions.get(s.id) === s
    const api: PositionLineApi = {
      setPrice(price) {
        s.price = price
        if (live()) notify()
        return api
      },
      getPrice: () => s.price,
      setQuantity(qty) {
        s.qty = qty
        if (live()) notify()
        return api
      },
      getQuantity: () => s.qty,
      setUnrealizedPnl(value) {
        s.unrealizedPnl = value
        if (live()) notify()
        return api
      },
      onClose(cb) {
        s.cbClose = cb
        if (live()) notify()
        return api
      },
      onReverse(cb) {
        s.cbReverse = cb
        if (live()) notify()
        return api
      },
      remove() {
        if (positions.delete(s.id)) notify()
      },
    }
    return api
  }

  const executionApi = (s: ExecutionState): ExecutionShapeApi => {
    const live = () => executions.get(s.id) === s
    const api: ExecutionShapeApi = {
      setPrice(price) {
        s.price = price
        if (live()) notify()
        return api
      },
      getPrice: () => s.price,
      setTime(timeSecs) {
        s.timeSecs = timeSecs
        if (live()) notify()
        return api
      },
      getTime: () => s.timeSecs,
      setDirection(direction) {
        s.direction = direction
        if (live()) notify()
        return api
      },
      getDirection: () => s.direction,
      setQuantity(qty) {
        s.qty = qty
        if (live()) notify()
        return api
      },
      getQuantity: () => s.qty,
      remove() {
        if (executions.delete(s.id)) notify()
      },
    }
    return api
  }

  /** The dispatcher the renderer acts through: every verb finds the row's handle and fires the
   *  host's callback. A reprice commits to the handle FIRST, so the snapshot echoes the drop and
   *  the line holds where it landed; a callback that throws reverts it (and the message surfaces
   *  through onError like any refused broker call). */
  const broker: BrokerAdapter = {
    async moveOrder(args) {
      const s = orders.get(args.brokerOrderId)
      if (!s) return
      const prior = s.price
      s.price = args.price
      notify()
      try {
        s.cbMove?.(args.price)
      } catch (e) {
        s.price = prior
        notify()
        throw e
      }
    },
    async setExits() {
      // Unreachable by construction: the primitives attachment declares `exits: false` and an
      // empty bracket-type set, so no gesture routes here.
      throw new Error('setExits is not part of the primitives surface')
    },
    async flatten(instrument) {
      positions.get(instrument)?.cbClose?.()
    },
    async cancelOrder(brokerOrderId) {
      orders.get(brokerOrderId)?.cbCancel?.()
    },
    async reversePosition(args) {
      positions.get(args.instrument)?.cbReverse?.()
      return { cancelledOrders: 0 }
    },
  }

  return {
    createOrderLine(opts?: OrderLineOptions): OrderLineApi {
      const s: OrderLineState = {
        id: `prim-${++seq}`,
        side: opts?.side ?? 'buy',
        orderType: opts?.orderType ?? 'limit',
        price: opts?.price ?? 0,
        qty: opts?.qty ?? 1,
      }
      orders.set(s.id, s)
      notify()
      return orderApi(s)
    },
    createPositionLine(opts?: PositionLineOptions): PositionLineApi {
      const s: PositionLineState = { id: `prim-${++seq}`, qty: opts?.qty ?? 1, price: opts?.price ?? 0, unrealizedPnl: null }
      positions.set(s.id, s)
      notify()
      return positionApi(s)
    },
    createExecutionShape(opts?: ExecutionShapeOptions): ExecutionShapeApi {
      const s: ExecutionState = {
        id: `prim-${++seq}`,
        direction: opts?.direction ?? 'buy',
        price: opts?.price ?? 0,
        timeSecs: opts?.timeSecs ?? 0,
        qty: opts?.qty ?? 1,
      }
      executions.set(s.id, s)
      notify()
      return executionApi(s)
    },
    /** The rows the renderer draws — one working order per order line, one position per position
     *  line, each keyed by its handle id (the renderer keys positions by instrument, so the id IS
     *  the instrument). */
    snapshot(): BrokerSnapshot {
      const orderRows: BrokerOrder[] = [...orders.values()].map((s) => ({
        brokerOrderId: s.id,
        instrument: s.id,
        side: s.side,
        qty: s.qty,
        orderType: s.orderType,
        triggerPrice: s.orderType === 'stop' ? s.price : null,
        limitPrice: s.orderType === 'limit' ? s.price : null,
        status: 'working',
      }))
      const positionRows: BrokerPosition[] = [...positions.values()].map((s) => ({
        instrument: s.id,
        qty: s.qty,
        avgPrice: s.price > 0 ? s.price : null,
        unrealizedPnl: s.unrealizedPnl,
      }))
      return { positions: positionRows, orders: orderRows }
    },
    /** The buttons-only-when-callbacks law, as renderer data: each row's controls are exactly the
     *  callbacks its handle registered. */
    controls(): NonNullable<TradeLineOptions['controls']> {
      const o: Record<string, { cancel: boolean; move: boolean; modifyQty: boolean }> = {}
      for (const s of orders.values()) o[s.id] = { cancel: !!s.cbCancel, move: !!s.cbMove, modifyQty: !!s.cbModify }
      const p: Record<string, { close: boolean; reverse: boolean }> = {}
      for (const s of positions.values()) p[s.id] = { close: !!s.cbClose, reverse: !!s.cbReverse }
      return { orders: o, positions: p }
    },
    executions(): BrokerExecution[] {
      return [...executions.values()].map((s) => ({ id: s.id, side: s.direction, qty: s.qty, price: s.price, timeSecs: s.timeSecs }))
    },
    /** A quantity-chip tap on one of the store's order rows — fires that handle's onModify. */
    fireModify(brokerOrderId: string): void {
      orders.get(brokerOrderId)?.cbModify?.()
    },
    broker,
    hasLines: () => orders.size > 0 || positions.size > 0,
    hasShapes: () => executions.size > 0,
  }
}

export interface ChartPrimitivesDeps {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  container: HTMLElement
  /** The chrome overlay the execution click-card mounts in (above the gesture surface). */
  chromeBox: HTMLElement
  /** The resolved trading look, read at attach and again on every `syncLook`. */
  overrides: () => ChartOverrides['trading']
  /** The mark for the position pill's percent/ticks P&L. Null when the feed is not live. */
  mark: () => number | null
  execColors: {
    buyColor: () => string
    sellColor: () => string
    textColor: () => string
    labels: () => boolean
    precision: () => number | null
  }
  strings: ChartI18n
  /** A refused move (a host callback that threw) or a failed dispatch, worded for the trader. */
  onError?: (msg: string) => void
}

export interface ChartPrimitivesHandle {
  createOrderLine(opts?: OrderLineOptions): OrderLineApi
  createPositionLine(opts?: PositionLineOptions): PositionLineApi
  createExecutionShape(opts?: ExecutionShapeOptions): ExecutionShapeApi
  /** The charted contract's tick — reprice drags snap to it and stay disabled until it is known. */
  setTick(tick: number | undefined): void
  /** Re-read the resolved look (after an applyOverrides). */
  syncLook(): void
  detach(): void
}

/** The primitives layer over one chart: renderers attach LAZILY — a widget that never creates a
 *  primitive pays nothing — and every handle keeps working across symbol switches (chart-scoped
 *  by contract). */
export function attachChartPrimitives(deps: ChartPrimitivesDeps): ChartPrimitivesHandle {
  let lines: TradeLineAttachment | null = null
  let marks: ExecutionMarksHandle | null = null
  let tick: number | undefined
  let detached = false

  const push = () => {
    if (detached) return
    if (store.hasLines() && !lines) {
      lines = attachTradeLines({ chart: deps.chart, series: deps.series, container: deps.container }, store.broker, {
        // The sentinel symbol never matches a row; `allInstruments` is what draws them — stated
        // here so the pair reads as one decision.
        symbol: 'PRIMITIVES',
        allInstruments: true,
        snapshot: store.snapshot(),
        controls: store.controls(),
        scope: 'primitives|host',
        tick,
        // No protective-exit surface: exits and brackets are account-plane verbs, and the
        // primitives dispatcher has no host callback shape for them.
        exits: false,
        orderBracketTypes: [],
        mark: deps.mark,
        overrides: deps.overrides(),
        strings: deps.strings,
        onOrderQtyEdit: ({ brokerOrderId }) => store.fireModify(brokerOrderId),
        onError: (msg) => deps.onError?.(msg),
      })
    }
    lines?.update({ snapshot: store.snapshot(), controls: store.controls(), tick })
    if (store.hasShapes() && !marks) {
      marks = attachExecutionMarks(deps.chart, deps.series, deps.chromeBox, {
        buyColor: deps.execColors.buyColor,
        sellColor: deps.execColors.sellColor,
        textColor: deps.execColors.textColor,
        labels: deps.execColors.labels,
        precision: deps.execColors.precision,
        strings: deps.strings,
      })
    }
    marks?.set('live', store.executions())
  }

  const store = createPrimitivesStore(push)

  return {
    createOrderLine: (opts) => store.createOrderLine(opts),
    createPositionLine: (opts) => store.createPositionLine(opts),
    createExecutionShape: (opts) => store.createExecutionShape(opts),
    setTick(next) {
      tick = next
      lines?.update({ tick: next })
    },
    syncLook() {
      lines?.update({ overrides: deps.overrides() })
    },
    detach() {
      if (detached) return
      detached = true
      lines?.detach()
      lines = null
      marks?.destroy()
      marks = null
    },
  }
}
