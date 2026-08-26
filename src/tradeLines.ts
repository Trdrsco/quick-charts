// The trade-line renderer + gesture layer — chart trading's interactive surface, package-owned and
// framework-free (no React, no engine, no HTTP: the host pushes BrokerSnapshots in and a
// ChartBroker implementation carries the actions out). Draws the position average line (P&L suffix,
// ⇄ reverse and ✕ close hot-zones), working stop/limit lines (draggable to reprice, ✕ to cancel),
// and host-supplied PREVIEW lines (pre-money ghost levels whose gestures only ever call back to the
// host — the never-execute guarantee is structural: preview paths have no broker call in scope).
//
// Native price lines are the single source of truth (they reposition on pan/zoom/autoscale for
// free); one capture-phase pointer handler on the container turns a grab into a drag and a drop
// into a planned broker call. Everything money-deciding (snap, band, protective-side, classify)
// is the pure planBrokerDrop in broker.ts, gated by the HOST's injected price policy.
import type { IChartApi, IPriceLine, ISeriesApi } from 'lightweight-charts'
import { clickSlopFor, createPendingHolds, tapReleaseVerdict } from './gestureRules'
import {
  boundBracketPrice,
  boundStopPrice,
  dispatchPreviewDrop,
  fmtPrice,
  isMeaningfulMove,
  pickHit,
  planBrokerDrop,
  type BrokerExec,
  type BrokerOrder,
  type BrokerSnapshot,
  type ChartBroker,
  type DropTarget,
  type Hit,
  type HitCandidate,
  type LineKind,
  type PlanCtx,
  type PricePolicy,
} from './broker'
import { createChartI18n, type ChartI18n, type ChartTranslate } from './i18n'
import { TICKET_TYPE_KEY, ticketTypeOfLabel, type TicketOrderType } from './orderTicket'
import { DEFAULT_OVERRIDES, type ChartOverrides } from './overrides'
import {
  buildExitParts,
  buildOrderParts,
  buildPositionParts,
  buildDraftParts,
  drawParts,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  findPart,
  hitTestParts,
  layoutParts,
  withAlpha,
  drawAxisLabel,
  EXIT_ZONE_ALPHA,
  PILL_RIGHT_MARGIN,
  PART_H,
  TOUCH_SLOP_PX,
  type LayoutNode,
  type PartHit,
  type PartSpec,
} from './tradeLineParts'

// Broker instrument / charted ticker -> tradeable root: strip an exchange prefix, separators, a
// continuous-contract "1!" suffix, and a trailing month code. Micros stay DISTINCT (MES ≠ ES) so a
// micro's line never lands on a full-size chart.
/** A resting order's label: side plus type, in the same title case the ticket's own type tabs use.
 *  Capitalising it made a working order read as a warning rather than as one more control in the same
 *  interface — and the wire's `stop_limit` needs the underscore turned into a space either way.
 *
 *  The four types the widget knows are named from its own order-type vocabulary, so a line and the
 *  ticket that placed it agree; a type the wire grew beyond them is the venue's word, title-cased. */
function orderLabel(t: ChartTranslate, buy: boolean, orderType: string): string {
  const known = orderType in TICKET_TYPE_KEY ? (orderType as TicketOrderType) : null
  const type = known ? t(TICKET_TYPE_KEY[known]) : orderType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  return t(buy ? 'lines.orderBuy' : 'lines.orderSell', { type })
}

/** The draft chip's order-type text. A PreviewSet carries the CANONICAL English label (a host reads
 *  and writes it), so it is translated here, at the one place it is painted; wording a host invented
 *  is its own and passes through. */
function draftTypeText(t: ChartTranslate, label: string): string {
  const id = ticketTypeOfLabel(label)
  return id ? t(TICKET_TYPE_KEY[id]) : label
}

const MONTH_CODE = 'FGHJKMNQUVXZ'
export function normalizeRoot(raw: string | null | undefined): string | null {
  if (!raw) return null
  let s = String(raw).toUpperCase().trim()
  if (s.includes(':')) s = s.split(':').pop() ?? ''
  s = s.replace(/[._-]/g, '')
  s = s.replace(/\d+!$/, '')
  s = s.replace(new RegExp(`[${MONTH_CODE}]\\d{1,4}$`), '')
  return s || null
}

/** True when an instrument's normalized root COUNTS AS the charted symbol. A PAIR feed symbol
 *  ("BTC/USD") admits its BASE segment too: the ticket resolves a pair chart to its tradable
 *  product root (chart the spot feed, trade the root — trading-core's tvRoot), so rows and drafts
 *  keyed to the bare root ARE this chart's own trading and must draw here — the strict equality
 *  alone made every line invisible on a pair chart, which is the only symbol form a spot feed has. */
function matchesChartedRoot(instrument: string, symbol: string): boolean {
  const r = normalizeRoot(instrument)
  if (r == null) return false
  if (r === normalizeRoot(symbol)) return true
  const slash = symbol.indexOf('/')
  return slash > 0 && r === normalizeRoot(symbol.slice(0, slash))
}

// Ghost (PREVIEW) palette — translucent and large-dashed, so a level that has not been sent reads as
// provisional next to the solid lines of everything that has. Entry is a neutral amber; a planned stop
// is translucent red and a planned target translucent green. A level being DRAGGED is not a preview:
// it wears the resting exit's own colour and style, because it is about to become exactly that.

/** The position pill's P&L cell, honest per unit: money = the broker's OWN unrealizedPnl (null → no
 *  cell at all, never a locally-faked number); ticks/percent derive from the live mark vs avg entry
 *  and vanish without a live mark or a known tick. */
function positionPnlDisplay(
  p: { qty: number; avgPrice: number | null; unrealizedPnl: number | null },
  mode: 'money' | 'ticks' | 'percent',
  tick: number | undefined,
  mark: number | null,
  currency: string | null,
  t: ChartTranslate,
): { text: string | null; sign: 'profit' | 'loss' | null } {
  const signOf = (v: number | null): 'profit' | 'loss' | null => (v == null ? null : v < 0 ? 'loss' : 'profit')
  if (mode === 'money') return { text: formatPnlMoney(p.unrealizedPnl, currency), sign: signOf(p.unrealizedPnl) }
  if (mark == null || mark <= 0 || p.avgPrice == null || p.avgPrice <= 0) return { text: null, sign: null }
  const dir = p.qty > 0 ? 1 : -1
  if (mode === 'ticks') {
    if (!tick || tick <= 0) return { text: null, sign: null }
    const ticks = ((mark - p.avgPrice) * dir) / tick
    return { text: formatPnlTicks(ticks, t), sign: signOf(ticks) }
  }
  const pct = ((mark - p.avgPrice) / p.avgPrice) * 100 * dir
  return { text: formatPnlPercent(pct), sign: signOf(pct) }
}

/** What a resting exit would realise if it filled — the number a trader is deciding on when they set
 *  a target or a stop. It needs the contract's point value: without one there is no honest money
 *  figure, so the cell is OMITTED rather than showing a bare price difference dressed as currency. */
function potentialPnl(
  pos: { qty: number; avgPrice: number | null },
  level: number,
  qty: number,
  pointValue: number | undefined,
  currency: string | null,
): { text: string; sign: 'profit' | 'loss' } | null {
  if (pos.avgPrice == null || pos.avgPrice <= 0) return null
  if (!pointValue || !isFinite(pointValue) || pointValue <= 0) return null
  const dir = pos.qty > 0 ? 1 : -1
  const value = (level - pos.avgPrice) * dir * qty * pointValue
  const text = formatPnlMoney(value, currency)
  return text ? { text, sign: value < 0 ? 'loss' : 'profit' } : null
}

// Drag tuning. A grab registers within GRAB_PX of a line; every CONTROL (✕, ⇄, TP/SL) is hit-tested
// against its painted rect in the overlay part tree, never a band measured off the plot edge. A tap
// that strays too far isn't treated as a click — how far is the pointer's own allowance, and the
// rule lives in gestureRules.
const GRAB_PX = 6
// The same reach for a FINGER. Deliberately not the controls' TOUCH_SLOP_PX: a control's box grows
// into empty chart and costs nothing, but the line BODY competes with the pan, and every pixel of
// band here is a pixel where a one-finger drag reprices an order instead of scrolling the chart. A
// position with a target and a stop already puts three lines on the glass; at 22 they would blanket
// the middle of a phone screen. 14 is a 28px band — findable with a thumb, and still mostly chart.
const GRAB_TOUCH_PX = 14

/** Whether a press-and-release wandered too far to still be the tap it looked like, judged by the
 *  allowance the pressing pointer earns. Four call sites read it (send, order type, draft size,
 *  working-order size) and each used to spell the comparison out, which is four places for a
 *  finger's allowance to be forgotten. */
const strayedFromTap = (e: PointerEvent, down: { downX: number; downY: number }): boolean => {
  const slop = clickSlopFor(e.pointerType)
  return Math.abs(e.clientX - down.downX) > slop || Math.abs(e.clientY - down.downY) > slop
}

/** A host-drawn PREVIEW level (the decoration point): a pre-money ghost line whose drag/✕ gestures
 *  only ever reach the host's own callbacks. `kind` picks the ghost tint; `editable: false` draws
 *  but never drags (a grouped leg). */
export interface PreviewLine {
  id: string
  kind: 'entry' | 'sl' | 'tp' | 'leg'
  price: number
  label: string
  qty: number | string
  editable: boolean
}

/** The host's full preview set. `entryRef` is the band anchor a dragged preview level validates
 *  against (absent ⇒ snap only). */
export interface PreviewSet {
  instrument: string
  tick: number
  lines: readonly PreviewLine[]
  entryRef?: number | null
  /** The ticket's side — the draft control states which way the order goes. */
  side?: 'buy' | 'sell'
  /** The ticket's tab label ('Market' | 'Limit' | 'Stop Limit' | 'Stop'). It sits where a live line
   *  shows money, because a pending order has no P&L to report — what it has is a kind. */
  orderType?: string
  /** The ORDER quantity — a bare Market order has no lines, so the size cannot come from one. */
  qty?: number
  /** The quantity grid the host's editor should step by. */
  qtyStep?: number
}

export interface TradeLineHost {
  chart: IChartApi
  series: ISeriesApi<'Candlestick'>
  container: HTMLElement
}

export interface TradeLineOptions {
  /** The charted symbol — lines draw only for rows whose normalized root matches. */
  symbol: string
  /** The account state (host-pushed; the package never fetches). */
  snapshot: BrokerSnapshot
  /** The selection identity ('broker|account'), or null when no account is connected (lines are
   *  display-only). Doubles as the intent-key prefix so a selection switch never reuses keys. */
  scope: string | null
  /** Contract tick — reprice drags stay disabled until known (snap-before-validate). */
  tick?: number
  /** The account's served `capabilities.exits` — whether the backend can rest a cancel-linked
   *  protective pair. `false` hides the TP/SL handles; omitted defaults to supported. */
  exits?: boolean
  /** The account's currency, shown beside a money P&L. Omitted ⇒ the number renders bare rather
   *  than wearing a guessed currency. */
  currency?: string
  /** Contract point value (money per 1.0 of price per unit) — what turns an exit level into the
   *  amount it would realise. Omitted ⇒ exit lines show no P&L cell rather than a fabricated one. */
  pointValue?: number
  /** The live-trusted mark, or null (feed down / not live). Read at gesture/draw time. */
  mark?: () => number | null
  /** Trading lock — live actions disarm (display-only); PREVIEW gestures stay allowed (pre-money). */
  locked?: boolean
  /** The ChartOverrides trading.* section (colors, widths, visibility, P&L unit). Package defaults
   *  when omitted. */
  overrides?: ChartOverrides['trading']
  /** The host's price gate (see PricePolicy). Omitted ⇒ snap-only. */
  policy?: PricePolicy
  /** PRE-ARM TP/SL levels attached to UNFILLED entry orders, keyed by brokerOrderId. The backend
   *  holds these OCO-pending until the entry fills, so they are not working orders and only the
   *  HOST knows them — it pushes the map, the package draws them dashed in the leg colours (the
   *  draft language: a level that exists but does not rest yet). Editable/removable when the
   *  broker implements setOrderBracket. */
  orderBrackets?: Record<string, { stopLoss?: number; takeProfit?: number }>
  /** The ENTRY order types the backend can attach a bracket to (served capability — e.g. a venue
   *  that brackets a limit entry but not a stop entry). Absent = every type; an empty array = no
   *  bracket editing at all. Handles and pre-arm editability never render outside this set — the
   *  backend refuses fail-closed regardless, this keeps the chart from offering what it refuses. */
  orderBracketTypes?: readonly string[]
  /** Working-order ids whose lifecycle belongs to an engine-side manager (an ATM strategy). Bracket
   *  handles and quantity editing are suppressed on them — a second bracket or a cancel+re-place
   *  size change would fight the manager that owns the order. */
  managedOrderIds?: readonly string[]
  /** The QUANTITY chip on a WORKING ORDER line was tapped. The host opens its own editor (the same
   *  one the draft uses) and calls `commit` with the new size — commit routes through the same
   *  atomic replace a reprice drag uses (same prices, new quantity), so there is still exactly one
   *  order-mutating path. */
  onOrderQtyEdit?: (args: { qty: number; step: number; rect: { x: number; y: number; w: number; h: number }; commit: (qty: number) => void }) => void
  /** Host preview levels (pre-money). Omitted ⇒ no ghost lines. */
  preview?: PreviewSet | null
  /** A dragged preview line's new (snapped, banded) price. The ONLY thing a preview drag calls. */
  onPreviewEdit?: (id: string, price: number) => void
  /** The QUANTITY chip on the ticket's draft line was tapped. The package owns no editor — it reports
   *  where the chip is (viewport coords, for anchoring) and what it currently reads, and the new value
   *  comes back through the host's own draft relay. PRE-MONEY: nothing here reaches a broker. */
  onQtyEdit?: (args: { qty: number; step: number; rect: { x: number; y: number; w: number; h: number } }) => void
  /** The ORDER TYPE cell on the draft line was tapped — open the host's type menu at this viewport
   *  rect, told which type is current. PRE-MONEY: changing an unsent ticket's kind is not trading. */
  onOrderTypeEdit?: (args: { current: string; rect: { x: number; y: number; w: number; h: number } }) => void
  /** The SIDE chip on the ticket's draft line was tapped — send the composed ticket, now.
   *
   *  This is the one callback on the draft path that SPENDS MONEY, so it is deliberately its own
   *  channel and carries no order in it: the host submits through the ticket's existing path against
   *  the ticket's own state, and the chart never assembles a second order. Fires only with an account
   *  armed and trading unlocked. */
  onDraftSubmit?: () => void
  /** A preview line's ✕. The ONLY thing a preview ✕-tap calls. */
  onPreviewCancel?: (id: string) => void
  /** A confirmed action's feedback (with an optional Undo for a protective stop move). */
  onAction?: (text: string, undo?: () => void) => void
  /** A dropped / failed / informational message. */
  onError?: (msg: string) => void
  /** The widget's language for the pills' own words and the messages the gestures raise. Read when
   *  the layer attaches — the object itself carries later switches, and the lines repaint on each
   *  one. Omitted ⇒ English. Prices, sizes, symbols and the broker's own text are untouched. */
  strings?: ChartI18n
}

export interface TradeLineAttachment {
  /** Apply changed inputs (snapshot, symbol, selection, lock, overrides, preview…) and redraw. A
   *  scope or symbol change cancels any in-flight gesture (the drop-time guard also re-checks). */
  update(patch: Partial<TradeLineOptions>): void
  /** Would a FINGER pressing here land on one of the lines' controls? A touch host asks before it
   *  spends the press on a gesture of its own (a press-and-hold that raises a menu, say) — a menu
   *  rising out of the send button you were aiming at takes the trade away from the tap that was
   *  about to make it. Answers in the finger's reach whatever pointer is in use, because the host
   *  asks on `touchstart`, before this layer has seen a pointer event at all. */
  controlAt(clientX: number, clientY: number): boolean
  detach(): void
}

interface LineEntry {
  line: IPriceLine
  kind: LineKind | 'preview' | 'obracket'
  price: number
  instrument: string
  brokerOrderId?: string
  previewId?: string
  /** An obracket line's leg — which half of the pre-arm pair this level is. */
  legKind?: 'tp' | 'sl'
  editable?: boolean
  /** The line colour, mirrored so the overlay can paint the axis label to match. */
  color?: string
  /** The overlay control tree for this line (absent ⇒ the line draws no controls). */
  spec?: PartSpec
}

interface DragState {
  key: string
  /** The grabbed line's kind — for a stop-limit it also says WHICH leg the drop reprices; the
   *  `obr_*` kinds move a PRE-ARM bracket level, whose drop routes to setOrderBracket. */
  kind: 'stop' | 'limit' | 'stop_limit' | 'stop_limit_limit' | 'obr_tp' | 'obr_sl'
  brokerOrderId: string
  instrument: string
  originalPrice: number
  lastValidPrice: number
  moved: boolean
  pointerId: number
  capturedScope: string
  capturedSymbol: string
}

interface PreviewDragState {
  key: string
  previewId: string
  originalPrice: number
  lastValidPrice: number
  moved: boolean
  pointerId: number
  capturedScope: string
  capturedSymbol: string
}

interface PendingX {
  key: string
  kind: LineKind
  action: 'close' | 'reverse'
  instrument: string
  brokerOrderId?: string
  pointerId: number
  downX: number
  downY: number
  capturedScope: string
  capturedSymbol: string
}

interface PendingPreviewX {
  key: string
  previewId: string
  pointerId: number
  downX: number
  downY: number
}

/** A TP/SL handle dragged off the position line, the ticket's draft line, or a resting ENTRY order
 *  line. The level does not exist until the drop, so the gesture carries a ghost line of its own
 *  rather than moving an existing one. */
interface BracketDragState {
  kind: 'tp' | 'sl'
  /** PRE-MONEY: the level belongs to the TICKET's draft, so the drop routes to onPreviewEdit and no
   *  broker call exists anywhere on that path — the never-execute guarantee stays structural. */
  preview: boolean
  /** Set when the handle lives on a RESTING ENTRY order line: the drop attaches a pre-arm leg to
   *  THIS order (setOrderBracket), anchored at the price the entry would fill. */
  order?: { brokerOrderId: string; instrument: string; side: 'buy' | 'sell'; qty: number; orderType: 'stop' | 'limit' | 'stop_limit'; price: number; stopLimitPrice?: number }
  instrument: string
  positionSide: 'long' | 'short'
  qty: number
  /** The average entry the level is validated against. */
  anchor: number
  lastValidPrice: number
  moved: boolean
  pointerId: number
  capturedScope: string
  capturedSymbol: string
  ghost: IPriceLine | null
}

/** A failed action's message: the broker's OWN words when it threw an Error (they reach the trader
 *  unedited), and the widget's own line when the rejection carried no message to show. */
const errMsg = (e: unknown, t: ChartTranslate): string => (e instanceof Error ? e.message : t('lines.actionFailed'))

export function attachTradeLines(host: TradeLineHost, broker: ChartBroker, initial: TradeLineOptions): TradeLineAttachment {
  const { chart, series, container } = host
  let opts: TradeLineOptions = { ...initial }
  /** The widget's language. Held for the layer's life: it is a live object, so a switch arrives
   *  through it rather than through a new one, and every label is read from it at paint time. */
  const strings = initial.strings ?? createChartI18n()
  /** intentKey → the host's own idempotency lifecycle happens in the ChartBroker adapter; the
   *  package just forwards the key from the plan. */

  const lines = new Map<string, LineEntry>()
  /** Levels whose move has been SENT but is not yet reflected in the broker's own snapshot —
   *  holding the dropped price until the snapshot agrees (or the hold expires) removes the
   *  snap-back-and-forward round trip from view. The hold/agree/expire/reject semantics live in
   *  gestureRules' createPendingHolds. */
  const pendingMoves = createPendingHolds()
  const PENDING_MOVE_MS = 8000
  /** The same hold for a DRAFT level, whose round trip is a few React renders rather than a network
   *  call — so the window that bounds an unanswered drop is correspondingly short. */
  const PENDING_DRAFT_MS = 2000
  let dragging: DragState | null = null
  /** Whether the pointer working the chart right now is a FINGER. Read off each event rather than
   *  off a media query, because the device answers a query and the event answers the question: a
   *  phone driven by a trackpad and a laptop with a touchscreen both get the reach they earn, on
   *  the gesture, and a mouse never widens because a touchscreen exists somewhere on the machine. */
  let coarse = false
  const notePointer = (e: PointerEvent) => {
    coarse = e.pointerType === 'touch'
  }
  /** How far from a line's body a grab still registers, for whichever pointer is being used. */
  const grabPx = () => (coarse ? GRAB_TOUCH_PX : GRAB_PX)
  let previewDrag: PreviewDragState | null = null
  let pendingX: PendingX | null = null
  let pendingPreviewX: PendingPreviewX | null = null
  /** A tap in progress on a PRE-ARM bracket level's ✕ — removes that leg on release. */
  let pendingObrX: { key: string; brokerOrderId: string; legKind: 'tp' | 'sl'; pointerId: number; downX: number; downY: number; capturedScope: string; capturedSymbol: string } | null = null
  /** A tap in progress on a WORKING ORDER's quantity chip — opens the host's size editor on release. */
  let pendingOrderQty: { key: string; brokerOrderId: string; pointerId: number; downX: number; downY: number } | null = null
  /** A tap in progress on the draft's quantity chip — committed on release if it stayed a tap. */
  let pendingQty: { key: string; pointerId: number; downX: number; downY: number } | null = null
  /** A tap in progress on the draft's order-type cell — opens the menu on release. */
  let pendingOrderType: { key: string; pointerId: number; downX: number; downY: number } | null = null
  /** A tap in progress on the draft's side chip — SENDS on release if it stayed a tap. The press and
   *  the send are split for the same reason every other money control here splits them: a press that
   *  slides off the chip is a change of mind, and must not spend. */
  let pendingSubmit: { key: string; pointerId: number; downX: number; downY: number } | null = null
  let bracketDrag: BracketDragState | null = null
  let raf: number | null = null
  let latestClientY: number | null = null
  let detached = false

  const T = () => opts.overrides ?? DEFAULT_OVERRIDES.trading
  const markNow = (): number | null => {
    const m = opts.mark?.() ?? null
    return typeof m === 'number' && m > 0 ? m : null
  }
  const armed = () => !!opts.scope && !opts.locked
  const interactive = () => !!opts.scope

  const formatLinePrice = (price: number | null): string | null => {
    if (price == null || !isFinite(price)) return null
    const tk = opts.tick && opts.tick > 0 ? opts.tick : null
    const decimals = tk ? Math.max(0, Math.min(8, Math.ceil(-Math.log10(tk)))) : 2
    return price.toFixed(decimals)
  }

  // ── Control overlay ────────────────────────────────────────────────────────────
  // Controls are painted on our own canvas above the chart, and a control's hit box IS the rect it
  // was painted at. A native price-line title is text with no addressable geometry, so a control
  // drawn as a title glyph can only be tapped by guessing where the text landed — a guess that
  // silently drifts with the label's content.
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const overlay = document.createElement('canvas')
  overlay.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:3'
  container.appendChild(overlay)
  const octx = overlay.getContext('2d')
  const layouts = new Map<string, LayoutNode>()
  let hoveredPart: string | null = null
  let lastSig = ''

  const measureText = (text: string, font: string): number => {
    if (!octx) return text.length * 7
    octx.font = font
    return Math.ceil(octx.measureText(text).width)
  }

  /** The chart's OWN background. The pill paints on it so it reads as part of the chart rather than a
   *  dark patch stamped over it — and being opaque is also what stops the price line running through
   *  the text and the icons. Read live, so a theme switch cannot leave the pills behind. */
  const chartBackground = (): string => {
    const bg = chart.options().layout?.background as { color?: string; topColor?: string } | undefined
    return bg?.color ?? bg?.topColor ?? DEFAULT_OVERRIDES.appearance.background
  }

  const plotRightEdge = (): number => container.clientWidth - chart.priceScale('right').width()

  /** Recompute a resting exit's amount for a new level while it is being dragged. The number is a
   *  function of the LEVEL, so a pill that travels with the line but keeps a stale figure is worse
   *  than one that lagged — it looks authoritative and is wrong. No-op for anything that is not an
   *  exit of the open position. */
  const refreshExitSpec = (entry: LineEntry, price: number): void => {
    if (entry.kind !== 'stop' && entry.kind !== 'limit') return
    const pos = opts.snapshot.positions.find((p) => p && p.qty !== 0 && matchesChartedRoot(p.instrument, opts.symbol))
    const order = opts.snapshot.orders.find((o) => o && o.brokerOrderId === entry.brokerOrderId)
    if (!pos || !order) return
    if (pos.qty > 0 ? order.side !== 'sell' : order.side !== 'buy') return // an entry order, not an exit
    const pnl = potentialPnl(pos, price, Math.abs(order.qty), opts.pointValue, opts.currency ?? null)
    entry.spec = buildExitParts({
      surface: chartBackground(),
      kind: entry.kind === 'limit' ? 'tp' : 'sl',
      qty: order.qty,
      pnlText: pnl?.text ?? null,
      pnlSign: pnl?.sign ?? null,
      supportCancel: armed(),
      t: strings.t,
    })
  }

  /** Which side of the entry a leg occupies: a target sits in profit, a stop in loss, so the side
   *  follows the POSITION's direction and flips with it. */
  const legSitsAbove = (kind: 'tp' | 'sl', longPosition: boolean): boolean => (kind === 'tp') === longPosition

  /** The shaded exit zone — entry→cursor while a handle is being dragged, otherwise the whole side a
   *  HOVERED handle would occupy. Null when neither is in play. */
  const exitZone = (paneH: number): { color: string; top: number; height: number } | null => {
    const t = T()
    const colorOf = (kind: 'tp' | 'sl') => (kind === 'tp' ? t.tpColor : t.slColor)
    if (bracketDrag) {
      const anchorY = series.priceToCoordinate(bracketDrag.anchor)
      const levelY = series.priceToCoordinate(bracketDrag.lastValidPrice)
      if (anchorY == null || levelY == null) return null
      return { color: colorOf(bracketDrag.kind), top: Math.min(anchorY, levelY), height: Math.abs(levelY - anchorY) }
    }
    if (!hoveredPart) return null
    // The key can itself contain ':' (instruments are exchange-qualified), so split at the LAST one.
    const cut = hoveredPart.lastIndexOf(':')
    const id = hoveredPart.slice(cut + 1)
    if (id !== 'tp' && id !== 'sl') return null
    const entry = lines.get(hoveredPart.slice(0, cut))
    if (!entry) return null
    const anchorY = series.priceToCoordinate(entry.price)
    if (anchorY == null) return null
    // A handle hovered on a RESTING ENTRY line shades against the ORDER: the anchor is the entry's
    // own level and the direction follows the order's side, exactly as the drag it previews will.
    if (entry.kind === 'stop' || entry.kind === 'limit' || entry.kind === 'stop_limit') {
      const ord = opts.snapshot.orders.find((o) => o && o.brokerOrderId === entry.brokerOrderId && o.status === 'working')
      if (!ord) return null
      const above = legSitsAbove(id, ord.side === 'buy')
      return { color: colorOf(id), top: above ? 0 : anchorY, height: above ? anchorY : paneH - anchorY }
    }
    const pos = opts.snapshot.positions.find((p) => p && p.qty !== 0 && normalizeRoot(p.instrument) === normalizeRoot(entry.instrument))
    if (!pos) return null
    const above = legSitsAbove(id, pos.qty > 0)
    return { color: colorOf(id), top: above ? 0 : anchorY, height: above ? anchorY : paneH - anchorY }
  }

  const paintOverlay = () => {
    if (detached || !octx) return
    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    if (overlay.width !== Math.round(w * dpr) || overlay.height !== Math.round(h * dpr)) {
      overlay.width = Math.round(w * dpr)
      overlay.height = Math.round(h * dpr)
    }
    octx.setTransform(dpr, 0, 0, dpr, 0, 0)
    octx.clearRect(0, 0, w, h)
    layouts.clear()
    const rightEdge = plotRightEdge()

    // The zone an exit level closes into, in the leg's own colour. HOVERING a handle shades the whole
    // side of the entry that leg can occupy — that is the affordance, shown before any commitment.
    // DRAGGING narrows it to entry→cursor, so the shape itself reports where the level now sits. One
    // colour and one opacity across both: the drag is the same zone being resolved, not a new thing.
    const zone = exitZone(h)
    if (zone) {
      octx.save()
      octx.fillStyle = withAlpha(zone.color, EXIT_ZONE_ALPHA)
      octx.fillRect(0, zone.top, rightEdge, zone.height)
      octx.restore()
    }

    // A level being dragged carries the SAME readout it will have once placed — the quantity and what
    // it would realise — because that is the number the drop is being decided on. Without it the
    // gesture is a bare line and the trader is choosing a price with no idea what it is worth. No ✕:
    // there is nothing resting to cancel, and releasing outside is how the drag is abandoned.
    if (bracketDrag) {
      const dragY = series.priceToCoordinate(bracketDrag.lastValidPrice)
      if (dragY != null) {
        // The basis is the DRAG's own anchor and size, not a position lookup: a level dragged off the
        // ticket's draft has no position behind it yet, and for a live one the anchor already IS the
        // average entry. One basis serves both, and the draft stops being the case with no number.
        const pnl = potentialPnl(
          { qty: bracketDrag.positionSide === 'long' ? 1 : -1, avgPrice: bracketDrag.anchor },
          bracketDrag.lastValidPrice,
          bracketDrag.qty,
          opts.pointValue,
          opts.currency ?? null,
        )
        const legColor = bracketDrag.kind === 'tp' ? T().tpColor : T().slColor
        const spec = buildExitParts({
          surface: chartBackground(),
          kind: bracketDrag.kind,
          qty: bracketDrag.qty,
          pnlText: pnl?.text ?? null,
          pnlSign: pnl?.sign ?? null,
          supportCancel: false,
          t: strings.t,
        })
        drawParts(octx, layoutParts(spec, { rightEdge: rightEdge - PILL_RIGHT_MARGIN, centerY: dragY, measure: measureText }), null)
        drawAxisLabel(octx, {
          x: rightEdge,
          y: dragY,
          width: Math.max(0, w - rightEdge),
          color: legColor,
          surface: chartBackground(),
          text: fmtPrice(bracketDrag.lastValidPrice, opts.tick),
          outlined: bracketDrag.kind === 'sl',
        })
      }
    }
    for (const [key, entry] of lines) {
      if (!entry.spec) continue
      const y = series.priceToCoordinate(entry.price)
      if (y == null || y < PART_H / 2 || y > h - PART_H / 2) continue
      const node = layoutParts(entry.spec, { rightEdge: rightEdge - PILL_RIGHT_MARGIN, centerY: y, measure: measureText })
      layouts.set(key, node)
      const localHover = hoveredPart && hoveredPart.startsWith(`${key}:`) ? hoveredPart.slice(key.length + 1) : null
      drawParts(octx, node, localHover)

      // The axis label is ours to draw because a TRIGGER is outlined and lightweight-charts can only
      // fill. `axisLabelVisible` stays off for these lines so the two never double up.
      if (entry.color)
        drawAxisLabel(octx, {
          x: rightEdge,
          y,
          width: Math.max(0, w - rightEdge),
          color: entry.color,
          surface: chartBackground(),
          text: fmtPrice(entry.price, opts.tick),
          outlined: entry.kind === 'stop',
        })
    }
  }

  /** A cheap signature of everything that moves a control box. Panning, zooming and autoscaling all
   *  move a line without any snapshot change, and a stale box would accept taps where nothing is
   *  painted — the exact failure this overlay exists to remove. */
  const overlaySignature = (): string => {
    let s = `${container.clientWidth}x${container.clientHeight}|${plotRightEdge()}|${hoveredPart ?? ''}|${bracketDrag ? `${bracketDrag.kind}@${bracketDrag.lastValidPrice}` : ''}`
    for (const [key, entry] of lines) {
      if (!entry.spec) continue
      const y = series.priceToCoordinate(entry.price)
      s += `|${key}@${y == null ? 'x' : Math.round(y)}`
    }
    return s
  }

  const syncOverlay = () => {
    if (detached) {
      overlay.remove()
      return
    }
    const sig = overlaySignature()
    if (sig !== lastSig) {
      lastSig = sig
      paintOverlay()
    }
    requestAnimationFrame(syncOverlay)
  }
  requestAnimationFrame(syncOverlay)

  /** The control under the pointer, resolved against the painted rectangles — widened to a thumb
   *  when the pointer is one. */
  const partAt = (clientX: number, clientY: number, slopOverride?: number): { key: string; entry: LineEntry; hit: PartHit } | null => {
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    const slop = slopOverride ?? (coarse ? TOUCH_SLOP_PX : 0)
    let best: { key: string; entry: LineEntry; hit: PartHit } | null = null
    let bestDist = Infinity
    for (const [key, node] of layouts) {
      const hit = hitTestParts(node, x, y, slop)
      if (!hit) continue
      const entry = lines.get(key)
      if (!entry) continue
      // hitTestParts settles ties WITHIN one line's control tree; this settles them BETWEEN lines,
      // by the same rule and for the same reason. Two levels 20px apart on a phone both answer a
      // widened tap, and the one the finger is on should win rather than the one drawn last.
      const b = hit.node
      const dx = x < b.x ? b.x - x : x > b.x + b.w ? x - (b.x + b.w) : 0
      const dy = y < b.y ? b.y - y : y > b.y + b.h ? y - (b.y + b.h) : 0
      const d = slop === 0 ? 0 : dx * dx + dy * dy
      if (d <= bestDist) {
        bestDist = d
        best = { key, entry, hit }
      }
    }
    return best
  }

  const onHoverMove = (e: PointerEvent) => {
    notePointer(e)
    if (dragging || previewDrag || pendingX || pendingPreviewX) return
    const part = partAt(e.clientX, e.clientY)
    const id = part ? `${part.key}:${part.hit.id}` : null
    if (id !== hoveredPart) {
      hoveredPart = id
      paintOverlay()
    }
    const tip = part?.hit.tooltip ?? ''
    if (container.title !== tip) container.title = tip
    // The CURSOR is deliberately not set here. This listener is registered before the gesture layer's
    // pointermove, which owns the cursor and would overwrite anything set here on the very same event.
  }

  /** Roles that actually do something when pressed — the set that earns a pointer cursor. The qty chip
   *  and P&L cell are readouts and keep the chart's own cursor: offering a pressed affordance over
   *  something inert is a promise the line cannot keep. */
  const isControlRole = (role: PartHit['role']): boolean => role === 'reverse' || role === 'tp' || role === 'sl' || role === 'close' || role === 'submit'
  container.addEventListener('pointermove', onHoverMove)

  // ── Draw / reconcile BY IDENTITY (update/create/remove only what changed — a teardown-per-tick
  //    both flickers and would destroy the line the user is mid-drag holding) ──
  const draw = () => {
    if (detached) return
    const root = normalizeRoot(opts.symbol)
    const charted = (instrument: string) => matchesChartedRoot(instrument, opts.symbol)
    const t = T()
    interface Desired {
      price: number
      color: string
      lineWidth: 1 | 2 | 3
      lineStyle: number
      title: string
      kind: LineKind | 'preview' | 'obracket'
      instrument: string
      brokerOrderId?: string
      previewId?: string
      legKind?: 'tp' | 'sl'
      editable?: boolean
      spec?: PartSpec
    }
    const desired = new Map<string, Desired>()
    if (root) {
      const canReverse = typeof broker.reversePosition === 'function'
      for (const p of t.showPositions ? opts.snapshot.positions : []) {
        if (!p || p.qty === 0 || typeof p.avgPrice !== 'number' || !isFinite(p.avgPrice) || p.avgPrice <= 0) continue
        if (!charted(p.instrument)) continue
        const long = p.qty > 0
        const pnl = positionPnlDisplay(p, t.pnlMode, opts.tick, markNow(), opts.currency ?? null, strings.t)
        // A handle is an ADD affordance. Once that leg is resting it has its own line, with its own
        // price, P&L and ✕ — so the handle would offer to create a second one, and the line it belongs
        // to already says everything about it. The exit's own line is where it is edited from there.
        const restingExit = (type: 'limit' | 'stop') =>
          opts.snapshot.orders.some(
            (o) =>
              o &&
              o.status === 'working' &&
              o.orderType === type &&
              charted(o.instrument) &&
              (p.qty > 0 ? o.side === 'sell' : o.side === 'buy'),
          )
        const hasTp = restingExit('limit')
        const hasSl = restingExit('stop')
        // Identity, P&L and the controls all live in the overlay pill — the native line carries no
        // title, so nothing that looks like a button is painted anywhere it can't be tapped.
        desired.set(`pos:${p.instrument}`, {
          price: p.avgPrice,
          color: long ? t.buyColor : t.sellColor,
          lineWidth: t.lineWidth,
          lineStyle: 0,
          title: '',
          kind: 'position',
          instrument: p.instrument,
          spec: buildPositionParts({
            surface: chartBackground(),
            // The pill wears the LINE's colour, so a short reads red end to end.
            accent: long ? t.buyColor : t.sellColor,
            qty: p.qty,
            avgPrice: p.avgPrice,
            pnlText: pnl.text,
            pnlSign: pnl.sign,
            currency: opts.currency ?? '',
            supportReverse: armed() && canReverse,
            supportClose: armed(),
            // A handle renders only where the broker can act and the tick is known — a drag with no
            // tick cannot snap, so the control would take a gesture it must then refuse.
            supportTakeProfit: armed() && opts.exits !== false && !!opts.tick && !hasTp,
            supportStopLoss: armed() && opts.exits !== false && !!opts.tick && !hasSl,
            priceText: formatLinePrice(p.avgPrice),
            t: strings.t,
          }),
        })
      }
      for (const o of t.showOrders ? opts.snapshot.orders : []) {
        // A stop/limit draws ONE line at its resting level. A stop-limit draws TWO — trigger AND
        // conversion limit — the reference behavior; the second line is added after this entry.
        // market/trailing
        // rows draw nothing (no resting level to draw).
        if (!o || o.status !== 'working' || (o.orderType !== 'stop' && o.orderType !== 'limit' && o.orderType !== 'stop_limit')) continue
        const reported = o.orderType === 'limit' ? o.limitPrice : o.triggerPrice
        if (typeof reported !== 'number' || !isFinite(reported) || reported <= 0) continue
        if (!charted(o.instrument)) continue
        // Hold a just-dropped level where it was dropped until the broker's own snapshot echoes it.
        const price = heldPrice(`ord:${o.brokerOrderId}`, reported)
        const buy = o.side === 'buy'
        // An order that CLOSES the open position is a protective exit, not an entry: it sits on the
        // opposite side, and its type then says which leg it is (a limit takes profit, a stop caps
        // risk). Read that way it earns the leg's colour and shows the POTENTIAL result at the level
        // — the number the trader is deciding on — instead of restating an order type the line's
        // colour and side already convey.
        const held = opts.snapshot.positions.find((p) => p && p.qty !== 0 && charted(p.instrument))
        const closes = !!held && (held.qty > 0 ? !buy : buy)
        const exitKind: 'tp' | 'sl' | null = closes ? (o.orderType === 'limit' ? 'tp' : 'sl') : null
        const exitPnl = exitKind ? potentialPnl(held!, price, Math.abs(o.qty), opts.pointValue, opts.currency ?? null) : null
        const color = exitKind ? (exitKind === 'tp' ? t.tpColor : t.slColor) : buy ? t.buyColor : t.sellColor
        // A resting ENTRY (an order that would OPEN or add) is editable in two more ways: its
        // quantity chip opens the size editor, and TP/SL handles drag out PRE-ARM bracket levels
        // that arm when it fills. Neither renders on an order an engine-side manager owns (ATM),
        // and the handles need the backend's setOrderBracket + a known tick + the venue's blessing
        // for this entry shape (the host gates that via which orders it puts in orderBrackets'
        // world at all — the broker refuses fail-closed regardless).
        const managed = !!opts.managedOrderIds?.includes(o.brokerOrderId)
        const preArm = opts.orderBrackets?.[o.brokerOrderId]
        const entryEditable = !exitKind && !managed && armed()
        const canBracket =
          entryEditable &&
          typeof broker.setOrderBracket === 'function' &&
          !!opts.tick &&
          opts.tick > 0 &&
          (!opts.orderBracketTypes || opts.orderBracketTypes.includes(o.orderType))
        desired.set(`ord:${o.brokerOrderId}`, {
          price,
          color,
          lineWidth: t.lineWidth,
          lineStyle: exitKind ? 0 : o.orderType === 'limit' ? 1 : 2,
          title: '',
          kind: o.orderType,
          instrument: o.instrument,
          brokerOrderId: o.brokerOrderId,
          // Editability of the SIZE chip — true only for an unmanaged entry with the account armed,
          // so a tap on an exit line's (read-only) qty cell can never open the editor.
          editable: entryEditable,
          spec: exitKind
            ? buildExitParts({
                surface: chartBackground(),
                kind: exitKind,
                qty: o.qty,
                pnlText: exitPnl?.text ?? null,
                pnlSign: exitPnl?.sign ?? null,
                supportCancel: armed(),
                t: strings.t,
              })
            : buildOrderParts({
                surface: chartBackground(),
                qty: o.qty,
                label: orderLabel(strings.t, buy, o.orderType),
                color,
                supportCancel: armed(),
                supportModifyQty: entryEditable,
                supportTakeProfit: canBracket && !preArm?.takeProfit,
                supportStopLoss: canBracket && !preArm?.stopLoss,
                t: strings.t,
              }),
        })
        // The entry's PRE-ARM bracket levels — host-known legs that arm when this order fills.
        // Dashed in the leg colours (the draft language: real intent, nothing resting yet), each
        // with the exit pill it will earn once live: the qty, what the level would realise against
        // the entry's own fill price, and a ✕ that removes just that leg.
        if (!exitKind && preArm && !managed) {
          const fillPrice = o.orderType === 'stop' ? o.triggerPrice : o.limitPrice
          if (typeof fillPrice === 'number' && fillPrice > 0) {
            for (const legKind of ['tp', 'sl'] as const) {
              const legPrice = legKind === 'tp' ? preArm.takeProfit : preArm.stopLoss
              if (typeof legPrice !== 'number' || legPrice <= 0) continue
              const key = `obr:${o.brokerOrderId}:${legKind}`
              const heldLeg = heldPrice(key, legPrice)
              const legPnl = potentialPnl({ qty: buy ? 1 : -1, avgPrice: fillPrice }, heldLeg, Math.abs(o.qty), opts.pointValue, opts.currency ?? null)
              desired.set(key, {
                price: heldLeg,
                color: legKind === 'tp' ? t.tpColor : t.slColor,
                lineWidth: t.lineWidth,
                lineStyle: 3, // LargeDashed — arms on fill, nothing rests yet
                title: '',
                kind: 'obracket',
                instrument: o.instrument,
                brokerOrderId: o.brokerOrderId,
                legKind,
                editable: canBracket,
                spec: buildExitParts({
                  surface: chartBackground(),
                  kind: legKind,
                  qty: o.qty,
                  pnlText: legPnl?.text ?? null,
                  pnlSign: legPnl?.sign ?? null,
                  supportCancel: canBracket,
                  t: strings.t,
                }),
              })
            }
          }
        }
        // A stop-limit's SECOND line — the conversion limit, at its own price, dragging its own
        // leg. No ✕ here: one order cancels once, from the trigger line (the reference's model).
        if (o.orderType === 'stop_limit') {
          const lim = o.limitPrice
          if (typeof lim === 'number' && isFinite(lim) && lim > 0) {
            const limPrice = heldPrice(`ordlim:${o.brokerOrderId}`, lim)
            desired.set(`ordlim:${o.brokerOrderId}`, {
              price: limPrice,
              color: buy ? t.buyColor : t.sellColor,
              lineWidth: t.lineWidth,
              lineStyle: 1,
              title: '',
              kind: 'stop_limit_limit',
              instrument: o.instrument,
              brokerOrderId: o.brokerOrderId,
              spec: buildOrderParts({
                surface: chartBackground(),
                qty: o.qty,
                label: orderLabel(strings.t, buy, o.orderType),
                color: buy ? t.buyColor : t.sellColor,
                supportCancel: false,
                supportModifyQty: false,
                t: strings.t,
              }),
            })
          }
        }
      }

      // Host PREVIEW ghost lines — drawn whenever the preview's instrument matches the charted
      // root, REGARDLESS of armed/locked (planning is pre-money). `preview:` keys never collide
      // with the live pos:/ord: lines. Suppress a preview level that coincides (within half a
      // tick) with an already-drawn LIVE line — once a level becomes a live working order the
      // ghost would otherwise double it.
      const pv = opts.preview
      if (pv && charted(pv.instrument)) {
        const livePrices = [...desired.values()].map((d) => d.price)
        const tol = pv.tick > 0 ? pv.tick / 2 : 1e-9
        const long = pv.side !== 'sell'
        const sideAccent = long ? t.buyColor : t.sellColor
        const entryLine = pv.lines.find((l) => l.id === 'entry')
        // A MARKET order has no resting level, so the ticket sends no entry line — but the order still
        // has a side, a size and a type to state, so the control rides the live mark. Without it a
        // market ticket is the one order type with no presence on the chart at all.
        const anchor = entryLine && entryLine.price > 0 ? entryLine.price : markNow()
        const hasLeg = (id: 'tp' | 'sl') => pv.lines.some((l) => l.id === id && l.price > 0)
        const draftQty = pv.qty ?? entryLine?.qty ?? ''
        // EVERY resting type gets a draggable entry line, even before a price is typed: dragging it off
        // the mark IS how that price gets set, and the drop writes it into the ticket's own field. Only
        // a market order is excluded — it has no price to set, so its line only reports where it would
        // fill. A stop-limit drags its TRIGGER: that is the level this line is drawn at and the field
        // the panel writes back, so the gesture always means one unambiguous price (the conversion
        // limit is typed). Naming the resting types individually is what silently dropped stop-limit.
        const entryDraggable = pv.orderType !== 'Market'
        // The side chip's tooltip states the action, or the reason there isn't one — a money control
        // that silently ignores a press is worse than one that says why.
        // One message per order type rather than the type dropped into a sentence: a language that
        // inflects the noun needs the whole line to agree with it.
        const SUBMIT_KEY = {
          market: 'lines.submitMarket',
          limit: 'lines.submitLimit',
          stop: 'lines.submitStop',
          stop_limit: 'lines.submitStopLimit',
        } as const
        const draftType = ticketTypeOfLabel(pv.orderType)
        const submitTooltip = !interactive()
          ? strings.t('lines.selectAccount')
          : opts.locked
            ? strings.t('lines.locked')
            : draftType
              ? strings.t(SUBMIT_KEY[draftType])
              : // A type of the host's own naming: its word, as the tooltip has always said it.
                strings.t('lines.submitOrder', { type: String(pv.orderType).toLowerCase() })

        if (!entryLine && anchor != null && pv.orderType) {
          desired.set('preview:entry', {
            // Held after a drop, so a resting entry dragged off the mark stays where it was dropped
            // while the ticket takes the price — the mark it rides would otherwise pull it straight back.
            price: heldPrice('preview:entry', anchor),
            color: sideAccent,
            lineWidth: t.lineWidth,
            lineStyle: 3, // LargeDashed — nothing is resting yet
            title: '',
            kind: 'preview',
            instrument: pv.instrument,
            previewId: 'entry',
            editable: entryDraggable,
            spec: buildDraftParts({
              surface: chartBackground(),
              accent: sideAccent,
              sideLabel: strings.t(long ? 'lines.buy' : 'lines.sell'),
              qty: draftQty,
              orderType: draftTypeText(strings.t, pv.orderType),
              supportTakeProfit: !hasLeg('tp') && !!opts.tick,
              supportStopLoss: !hasLeg('sl') && !!opts.tick,
              supportCancel: true, // the ✕ stands the ticket down — the same gesture on every order type
              submitTooltip,
              t: strings.t,
            }),
          })
        }

        for (const ln of pv.lines) {
          if (typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0) continue
          if (livePrices.some((p) => Math.abs(p - ln.price) <= tol)) continue
          const isEntry = ln.kind === 'entry'
          const legKind = ln.kind === 'tp' ? 'tp' : 'sl'
          const color = isEntry ? sideAccent : legKind === 'tp' ? t.tpColor : t.slColor
          // A draft leg reports what it WOULD realise against the draft entry, exactly as a resting
          // exit reports it against the position — the number is the reason for choosing the level,
          // and it should not appear only after the order is live.
          const pnl =
            !isEntry && anchor != null
              ? potentialPnl({ qty: long ? 1 : -1, avgPrice: anchor }, ln.price, Math.abs(Number(ln.qty) || 0), opts.pointValue, opts.currency ?? null)
              : null
          desired.set(`preview:${ln.id}`, {
            // Held until the ticket's own re-derived draft carries the dropped price back — the hold
            // releases the moment the two agree, so the line never bounces through the round trip.
            price: heldPrice(`preview:${ln.id}`, ln.price),
            color,
            lineWidth: t.lineWidth,
            lineStyle: 3, // LargeDashed — nothing is resting yet
            title: '',
            kind: 'preview',
            instrument: pv.instrument,
            previewId: ln.id,
            editable: ln.editable,
            spec: isEntry
              ? buildDraftParts({
                  surface: chartBackground(),
                  accent: sideAccent,
                  sideLabel: strings.t(long ? 'lines.buy' : 'lines.sell'),
                  qty: ln.qty,
                  orderType: draftTypeText(strings.t, pv.orderType ?? ln.label),
                  supportTakeProfit: !hasLeg('tp') && !!opts.tick,
                  supportStopLoss: !hasLeg('sl') && !!opts.tick,
                  supportCancel: ln.editable,
                  submitTooltip,
                  t: strings.t,
                })
              : buildExitParts({
                  surface: chartBackground(),
                  kind: legKind,
                  qty: Number(ln.qty) || 0,
                  pnlText: pnl?.text ?? null,
                  pnlSign: pnl?.sign ?? null,
                  // A grouped leg draws but is not individually dismissable.
                  supportCancel: ln.editable,
                  t: strings.t,
                }),
          })
        }
      }
    }

    // Remove vanished lines — but never the one being dragged (freeze it until the gesture settles).
    for (const [key, entry] of lines) {
      if (desired.has(key) || dragging?.key === key || previewDrag?.key === key) continue
      try {
        series.removePriceLine(entry.line)
      } catch {
        /* the series may already be torn down */
      }
      lines.delete(key)
    }
    for (const [key, d] of desired) {
      if (dragging?.key === key || previewDrag?.key === key) continue
      const existing = lines.get(key)
      if (existing) {
        existing.line.applyOptions({ price: d.price, color: d.color, title: d.title, lineWidth: d.lineWidth as 1 | 2 | 3 })
        existing.price = d.price
        existing.kind = d.kind
        existing.instrument = d.instrument
        existing.brokerOrderId = d.brokerOrderId
        existing.previewId = d.previewId
        existing.legKind = d.legKind
        existing.editable = d.editable
        existing.spec = d.spec
        existing.color = d.color
      } else {
        const line = series.createPriceLine({ price: d.price, color: d.color, lineWidth: d.lineWidth as 1 | 2 | 3, lineStyle: d.lineStyle, axisLabelVisible: !d.spec, title: d.title })
        lines.set(key, { line, kind: d.kind, price: d.price, instrument: d.instrument, brokerOrderId: d.brokerOrderId, previewId: d.previewId, legKind: d.legKind, editable: d.editable, spec: d.spec, color: d.color })
      }
    }
    paintOverlay()
  }

  // ── Gesture layer ──────────────────────────────────────────────────────────────
  const cancelRaf = () => {
    if (raf != null) {
      cancelAnimationFrame(raf)
      raf = null
    }
  }
  const restoreChart = () => {
    chart.applyOptions({ handleScroll: true, handleScale: true })
    container.style.touchAction = ''
  }

  /** The price to DRAW for a level: the broker's own value once it agrees with a move we sent, and
   *  until then the value we sent. Agreement is measured to half a tick, since the plan sends the
   *  SNAPPED price and the venue echoes back the same grid. */
  const heldPrice = (key: string, reported: number): number =>
    pendingMoves.shown(key, reported, opts.tick && opts.tick > 0 ? opts.tick / 2 : 1e-9)

  const buildCtx = (scope: string): PlanCtx => ({
    snapshot: opts.snapshot,
    scope,
    tick: opts.tick && opts.tick > 0 ? opts.tick : undefined,
    mark: markNow() ?? undefined,
    policy: opts.policy,
    t: strings.t,
  })

  const hitTest = (clientX: number, clientY: number): { hit: Hit; entry: LineEntry } | null => {
    // A tap resolves against the CONTROL it landed on. Only when no control is under the pointer
    // does it fall through to the line body, where a grab means "reprice". Preview and pre-arm
    // bracket lines resolve through their own paths, never here.
    const part = partAt(clientX, clientY)
    if (part && part.entry.kind !== 'preview' && part.entry.kind !== 'obracket' && (part.hit.role === 'close' || part.hit.role === 'reverse')) {
      return {
        hit: {
          key: part.key,
          kind: part.entry.kind as LineKind,
          isXZone: part.hit.role === 'close',
          isRevZone: part.hit.role === 'reverse',
        },
        entry: part.entry,
      }
    }
    const rect = container.getBoundingClientRect()
    const y = clientY - rect.top
    const cands: HitCandidate[] = []
    for (const [key, entry] of lines) {
      if (entry.kind === 'preview' || entry.kind === 'obracket') continue
      const ly = series.priceToCoordinate(entry.price)
      if (ly == null || ly < 0 || ly > rect.height) continue
      const dist = Math.abs(y - ly)
      if (dist > grabPx()) continue
      cands.push({ key, kind: entry.kind, dist, isXZone: false, isRevZone: false })
    }
    const hit = pickHit(cands)
    if (!hit) return null
    const entry = lines.get(hit.key)
    return entry ? { hit, entry } : null
  }

  // Nearest PREVIEW line within the grab radius — editable or not (the caller decides the cursor +
  // whether to start a drag vs a cancel). `isXZone` marks a tap that landed on the level's own ✕
  // (which cancels, and works for non-editable leg groups too); elsewhere a drag reprices an editable one.
  const previewHitTest = (clientX: number, clientY: number): { key: string; entry: LineEntry; isXZone: boolean } | null => {
    const rect = container.getBoundingClientRect()
    const yy = clientY - rect.top
    // A preview's ✕ resolves against its PAINTED rect, exactly like a live line's — a ghost that
    // hit-tested differently from the thing it previews would teach the wrong gesture.
    const part = partAt(clientX, clientY)
    if (part && part.entry.kind === 'preview' && part.hit.role === 'close') {
      return { key: part.key, entry: part.entry, isXZone: true }
    }
    let best: { key: string; entry: LineEntry; dist: number } | null = null
    for (const [key, entry] of lines) {
      if (entry.kind !== 'preview') continue
      const ly = series.priceToCoordinate(entry.price)
      if (ly == null || ly < 0 || ly > rect.height) continue
      const dist = Math.abs(yy - ly)
      if (dist > grabPx()) continue
      if (!best || dist < best.dist) best = { key, entry, dist }
    }
    if (!best) return null
    return { key: best.key, entry: best.entry, isXZone: false }
  }

  /** The preview band anchor: a drawn entry line's price (a resting Limit/Stop plan), else the
   *  host-provided entryRef, else the LIVE mark read at drop time, else undefined (snap only). */
  const previewEntryRef = (): number | undefined => {
    const pv = opts.preview
    if (!pv) return undefined
    const entryLine = pv.lines.find((l) => l.id === 'entry')
    if (entryLine && entryLine.price > 0) return entryLine.price
    if (typeof pv.entryRef === 'number' && pv.entryRef > 0) return pv.entryRef
    return markNow() ?? undefined
  }

  const runTarget = (target: DropTarget, finalPrice: number, scope: string) => {
    const plan = planBrokerDrop(target, finalPrice, buildCtx(scope))
    if (plan.drop) {
      opts.onError?.(plan.reason)
      return
    }
    execPlan(plan, scope)
  }

  const execPlan = (plan: BrokerExec, scope: string) => {
    const symbolAtExec = opts.symbol
    // Undo for a protective stop move: restore the previous trigger, re-validated against the
    // THEN-current snapshot — no-ops if the selection changed or the position is gone / flipped /
    // now off-band.
    let undo: (() => void) | undefined
    if (plan.method === 'setExits' && typeof plan.undoPrevStop === 'number') {
      const prev = plan.undoPrevStop
      const inst = plan.instrument
      undo = () => {
        if (opts.scope !== scope || opts.symbol !== symbolAtExec) return
        const pos = opts.snapshot.positions.find((x) => x.instrument === inst && x.qty !== 0)
        if (!pos) return
        const mk = markNow() ?? undefined
        const anchor = typeof pos.avgPrice === 'number' && pos.avgPrice > 0 ? pos.avgPrice : (mk ?? null)
        const r = boundStopPrice(prev, { tick: opts.tick, anchor, protectiveSide: pos.qty > 0 ? 'long' : 'short', mark: mk, policy: opts.policy, t: strings.t })
        if ('error' in r) return
        void broker
          .setExits({ instrument: inst, stopLoss: r.price, intentKey: `stop|${scope}|${inst}|${r.price}` })
          .catch((err) => opts.onError?.(errMsg(err, strings.t)))
      }
    }
    const run = async (): Promise<void> => {
      if (plan.method === 'setExits') {
        // The leg the plan named, and ONLY that leg: the omitted one stays exactly as it rests (the
        // pair's three-state contract), so moving a target never disturbs the stop protecting the same
        // position — and a target is never sent as a stop, which would place it through the market.
        const level = plan.exitLeg === 'target' ? { takeProfit: plan.price! } : { stopLoss: plan.price! }
        await broker.setExits({ instrument: plan.instrument, ...level, intentKey: plan.intentKey! })
      } else if (plan.method === 'moveOrder') {
        // A bracketed entry's reprice/resize must CARRY its pre-arm legs: on a cancel+re-place
        // backend a bare re-place would silently shed them. The order's current (pre-move) prices
        // ride along so a rejected re-place can restore the original shape faithfully.
        const row = opts.snapshot.orders.find((o) => o && o.brokerOrderId === plan.brokerOrderId && o.status === 'working')
        const curPrice = row ? (row.orderType === 'limit' ? row.limitPrice : row.triggerPrice) : null
        await broker.moveOrder({
          brokerOrderId: plan.brokerOrderId!,
          instrument: plan.instrument,
          side: plan.side!,
          qty: plan.qty!,
          orderType: plan.orderType!,
          price: plan.price!,
          stopLimitPrice: plan.stopLimitPrice,
          currentBracket: opts.orderBrackets?.[plan.brokerOrderId!],
          current: typeof curPrice === 'number' && curPrice > 0 ? { price: curPrice, stopLimitPrice: row?.orderType === 'stop_limit' ? (row.limitPrice ?? undefined) : undefined } : undefined,
          tick: opts.tick && opts.tick > 0 ? opts.tick : undefined,
          intentKey: plan.intentKey!,
        })
      } else if (plan.method === 'flatten') {
        await broker.flatten(plan.instrument)
      } else {
        await broker.cancelOrder(plan.brokerOrderId!)
      }
    }
    void run()
      .then(() => {
        opts.onAction?.(plan.toast, undo)
        if (plan.note) opts.onError?.(plan.note)
      })
      .catch((err) => {
        // A REFUSED move must stop being shown immediately. The optimistic hold exists to cover the
        // round trip, not to outlive it — leaving it would keep a level on the chart at a price the
        // venue rejected, which is the one thing worse than the flicker it removes.
        pendingMoves.clear()
        paintOverlay()
        opts.onError?.(errMsg(err, strings.t))
      })
  }

  /** The setOrderBracket call context for one working entry order, prices per the seam's contract
   *  (price = a limit's level or a stop's TRIGGER; stopLimitPrice = the conversion limit). */
  const orderCtx = (o: BrokerOrder) => ({
    brokerOrderId: o.brokerOrderId,
    instrument: o.instrument,
    side: o.side,
    qty: Math.abs(o.qty),
    orderType: o.orderType as 'stop' | 'limit' | 'stop_limit',
    price: (o.orderType === 'limit' ? o.limitPrice : o.triggerPrice) ?? 0,
    stopLimitPrice: o.orderType === 'stop_limit' ? (o.limitPrice ?? undefined) : undefined,
  })

  /** The price a resting entry would FILL at — the anchor every pre-arm leg is validated against.
   *  A limit fills at its level, a stop at its trigger, a stop_limit at its conversion limit. */
  const entryFillPrice = (o: BrokerOrder): number | null => {
    const p = o.orderType === 'stop' ? o.triggerPrice : o.limitPrice
    return typeof p === 'number' && p > 0 ? p : null
  }

  /** Set/move/remove ONE pre-arm bracket leg on a resting entry. The other leg rides through
   *  currentBracket untouched; `holdKey` pins the dropped level until the host's map echoes it. */
  const execOrderBracket = (
    o: { brokerOrderId: string; instrument: string; side: 'buy' | 'sell'; qty: number; orderType: 'stop' | 'limit' | 'stop_limit'; price: number; stopLimitPrice?: number },
    legKind: 'tp' | 'sl',
    level: number | null,
    scope: string,
    toast: string,
    holdKey?: string,
  ): void => {
    if (typeof broker.setOrderBracket !== 'function' || !(opts.tick && opts.tick > 0) || !(o.price > 0)) return
    if (holdKey && level != null) pendingMoves.hold(holdKey, level, PENDING_MOVE_MS)
    void broker
      .setOrderBracket({
        ...o,
        tick: opts.tick,
        ...(legKind === 'tp' ? { takeProfit: level } : { stopLoss: level }),
        currentBracket: opts.orderBrackets?.[o.brokerOrderId],
        intentKey: `obracket|${scope}|${o.brokerOrderId}|${legKind}|${level ?? 'off'}`,
      })
      .then(() => opts.onAction?.(toast))
      .catch((err) => {
        // Same rule as a refused reprice: a rejected edit must stop being shown immediately.
        pendingMoves.clear()
        paintOverlay()
        opts.onError?.(errMsg(err, strings.t))
      })
  }

  // Nearest PRE-ARM bracket line within the grab radius (its ✕ resolves through partAt like every
  // painted control; this answers only the draggable BODY).
  const obracketHitTest = (_clientX: number, clientY: number): { key: string; entry: LineEntry } | null => {
    const rect = container.getBoundingClientRect()
    const yy = clientY - rect.top
    let best: { key: string; entry: LineEntry; dist: number } | null = null
    for (const [key, entry] of lines) {
      if (entry.kind !== 'obracket') continue
      const ly = series.priceToCoordinate(entry.price)
      if (ly == null || ly < 0 || ly > rect.height) continue
      const dist = Math.abs(yy - ly)
      if (dist > grabPx()) continue
      if (!best || dist < best.dist) best = { key, entry, dist }
    }
    return best ? { key: best.key, entry: best.entry } : null
  }

  const onPointerDown = (e: PointerEvent) => {
    // Ahead of every guard: the reach this gesture gets is decided by the pointer that opens it,
    // and every hit test below reads that decision.
    notePointer(e)
    if (e.button !== 0 || dragging || previewDrag || pendingX || pendingPreviewX || pendingQty || pendingSubmit || pendingOrderType || pendingObrX || pendingOrderQty) return
    if (!interactive()) return
    const capturedScope = opts.scope!
    const capturedSymbol = opts.symbol

    const handle = partAt(e.clientX, e.clientY)

    // The DRAFT's quantity chip is a control, not a readout: it opens the host's editor. Only the
    // draft's — a resting order's size is changed at the venue, which is a different action. It sits
    // ahead of the lock guard on purpose: sizing a ticket that has not been sent is not trading, and
    // the cursor promises the chip answers, so the tap has to answer too.
    if (handle && handle.hit.role === 'qty' && handle.entry.kind === 'preview' && handle.entry.previewId === 'entry') {
      e.preventDefault()
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        /* capture is best-effort */
      }
      pendingQty = { key: handle.key, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
      return
    }
    // The order-type cell, on the same pre-money footing as the quantity chip beside it: changing an
    // unsent ticket's kind is not trading, so it also answers while the account is risk-locked.
    if (handle && handle.hit.role === 'orderType' && handle.entry.kind === 'preview' && handle.entry.previewId === 'entry') {
      e.preventDefault()
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        /* capture is best-effort */
      }
      pendingOrderType = { key: handle.key, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
      return
    }

    // LIVE lines (position avg / working order) — only when trading isn't locked.
    if (!opts.locked) {
      // The draft's side chip SENDS the ticket. It sits under the lock guard with every other money
      // control — unlike the quantity chip above it, which only sizes something not yet sent.
      if (handle && handle.hit.role === 'submit' && handle.entry.kind === 'preview' && handle.entry.previewId === 'entry') {
        e.preventDefault()
        try {
          container.setPointerCapture(e.pointerId)
        } catch {
          /* capture is best-effort */
        }
        pendingSubmit = { key: handle.key, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
        return
      }
      // A TP/SL handle: the gesture IS the price entry, so a bare tap does nothing and only a drag
      // off the line commits a level.
      if (handle && (handle.hit.role === 'tp' || handle.hit.role === 'sl')) {
        // The handle on a RESTING ENTRY order line: the drop attaches a PRE-ARM leg to that order
        // (setOrderBracket), anchored at the price the entry would fill — the level is validated
        // against the ENTRY, never today's mark, because nothing exists until the fill.
        const onOrderLine = handle.entry.kind === 'stop' || handle.entry.kind === 'limit' || handle.entry.kind === 'stop_limit'
        if (onOrderLine && handle.entry.brokerOrderId) {
          const ord = opts.snapshot.orders.find((q) => q && q.brokerOrderId === handle.entry.brokerOrderId && q.status === 'working')
          const fill = ord ? entryFillPrice(ord) : null
          if (ord && fill != null && opts.tick && opts.tick > 0 && typeof broker.setOrderBracket === 'function') {
            e.preventDefault()
            try {
              container.setPointerCapture(e.pointerId)
            } catch {
              /* capture is best-effort */
            }
            chart.applyOptions({ handleScroll: false, handleScale: false })
            container.style.touchAction = 'none'
            const kind = handle.hit.role === 'tp' ? 'tp' : 'sl'
            bracketDrag = {
              kind,
              preview: false,
              order: orderCtx(ord),
              instrument: ord.instrument,
              positionSide: ord.side === 'buy' ? 'long' : 'short',
              qty: Math.abs(ord.qty),
              anchor: fill,
              lastValidPrice: fill,
              moved: false,
              pointerId: e.pointerId,
              capturedScope,
              capturedSymbol,
              ghost: series.createPriceLine({
                price: fill,
                color: kind === 'tp' ? T().tpColor : T().slColor,
                lineWidth: T().lineWidth,
                lineStyle: 2,
                axisLabelVisible: false,
                title: '',
              }),
            }
            return
          }
        }
        // The handle sits on either a LIVE position or the ticket's DRAFT. The draft variant is
        // pre-money — it is allowed while trading is locked, and its drop routes to the host's own
        // callback with no broker in scope.
        const onDraft = handle.entry.kind === 'preview'
        const pos = onDraft ? null : opts.snapshot.positions.find((q) => q && q.qty !== 0 && q.instrument === handle.entry.instrument)
        const draftLong = opts.preview?.side !== 'sell'
        const anchor = onDraft ? handle.entry.price : (pos?.avgPrice ?? 0)
        const usable = onDraft ? !!opts.preview : !!pos && typeof pos.avgPrice === 'number' && pos.avgPrice > 0
        if (usable && anchor > 0 && opts.tick && opts.tick > 0) {
          e.preventDefault()
          try {
            container.setPointerCapture(e.pointerId)
          } catch {
            /* capture is best-effort */
          }
          chart.applyOptions({ handleScroll: false, handleScale: false })
          container.style.touchAction = 'none'
          const kind = handle.hit.role === 'tp' ? 'tp' : 'sl'
          bracketDrag = {
            kind,
            preview: onDraft,
            instrument: onDraft ? (opts.preview?.instrument ?? handle.entry.instrument) : pos!.instrument,
            positionSide: onDraft ? (draftLong ? 'long' : 'short') : pos!.qty > 0 ? 'long' : 'short',
            qty: onDraft ? Math.abs(Number(opts.preview?.lines.find((l) => l.id === 'entry')?.qty) || 1) : Math.abs(pos!.qty),
            anchor,
            lastValidPrice: anchor,
            moved: false,
            pointerId: e.pointerId,
            capturedScope,
            capturedSymbol,
            // The level takes the LEG's colour and width, so it is unmistakably the target or the stop
            // being placed — but it is DASHED, because nothing rests at the venue yet. Solid is what a
            // live order earns; a level still under the cursor has not earned it. The axis label is
            // drawn by the overlay so it tracks the drag with the pill.
            ghost: series.createPriceLine({
              price: anchor,
              color: kind === 'tp' ? T().tpColor : T().slColor,
              lineWidth: T().lineWidth,
              lineStyle: 2,
              axisLabelVisible: false,
              title: '',
            }),
          }
          return
        }
      }
      // A PRE-ARM bracket level's ✕ — removes that leg from the entry's bracket on a clean tap.
      if (handle && handle.hit.role === 'close' && handle.entry.kind === 'obracket' && handle.entry.brokerOrderId && handle.entry.legKind) {
        e.preventDefault()
        try {
          container.setPointerCapture(e.pointerId)
        } catch {
          /* capture is best-effort */
        }
        pendingObrX = { key: handle.key, brokerOrderId: handle.entry.brokerOrderId, legKind: handle.entry.legKind, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY, capturedScope, capturedSymbol }
        return
      }
      // A WORKING ORDER's quantity chip — opens the host's size editor (the same editor the draft
      // uses); the committed size goes through the SAME atomic replace a reprice drag uses. Only
      // where the chip was drawn editable (an entry, unmanaged, armed).
      if (
        handle &&
        handle.hit.role === 'qty' &&
        (handle.entry.kind === 'stop' || handle.entry.kind === 'limit' || handle.entry.kind === 'stop_limit') &&
        handle.entry.brokerOrderId &&
        handle.entry.editable === true &&
        opts.onOrderQtyEdit
      ) {
        e.preventDefault()
        try {
          container.setPointerCapture(e.pointerId)
        } catch {
          /* capture is best-effort */
        }
        pendingOrderQty = { key: handle.key, brokerOrderId: handle.entry.brokerOrderId, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
        return
      }
      const res = hitTest(e.clientX, e.clientY)
      if (res) {
        const { hit, entry } = res
        if (hit.isXZone || hit.isRevZone) {
          // Close / cancel (✕) or reverse (⇄, position only) — a deliberate tap; commit on
          // pointerup if it stays a tap.
          e.preventDefault()
          try {
            container.setPointerCapture(e.pointerId)
          } catch {
            /* capture is best-effort */
          }
          pendingX = { key: hit.key, kind: hit.kind, action: hit.isRevZone ? 'reverse' : 'close', instrument: entry.instrument, brokerOrderId: entry.brokerOrderId, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY, capturedScope, capturedSymbol }
          return
        }
        // Reprice grab — order lines only (pickHit never returns a non-X position). Disabled until
        // the tick is known. A stop-limit's TWO lines each drag their own price — the grabbed line's
        // kind says which leg moved, so the ambiguity that once made stop_limit non-draggable is
        // structural, not guessed.
        if (hit.kind !== 'position' && entry.brokerOrderId && opts.tick && opts.tick > 0) {
          e.preventDefault()
          try {
            container.setPointerCapture(e.pointerId)
          } catch {
            /* capture is best-effort */
          }
          // FREEZE the chart — capture-phase alone is insufficient because LWC pans from its own
          // pointer stream.
          chart.applyOptions({ handleScroll: false, handleScale: false })
          container.style.touchAction = 'none'
          dragging = {
            key: hit.key,
            kind: hit.kind,
            brokerOrderId: entry.brokerOrderId,
            instrument: entry.instrument,
            originalPrice: entry.price,
            lastValidPrice: entry.price,
            moved: false,
            pointerId: e.pointerId,
            capturedScope,
            capturedSymbol,
          }
          return
        }
        // A non-grabbable live hit (position avg, or no tick yet) — fall through to try a
        // coincident preview grab.
      }
      // A PRE-ARM bracket level's BODY — drag to move that leg. Live lines resolved first above:
      // a real resting order under the pointer always outranks the ghost of a leg not yet armed.
      const obr = obracketHitTest(e.clientX, e.clientY)
      if (obr && obr.entry.editable && obr.entry.brokerOrderId && obr.entry.legKind && opts.tick && opts.tick > 0) {
        e.preventDefault()
        try {
          container.setPointerCapture(e.pointerId)
        } catch {
          /* capture is best-effort */
        }
        chart.applyOptions({ handleScroll: false, handleScale: false })
        container.style.touchAction = 'none'
        dragging = {
          key: obr.key,
          kind: obr.entry.legKind === 'tp' ? 'obr_tp' : 'obr_sl',
          brokerOrderId: obr.entry.brokerOrderId,
          instrument: obr.entry.instrument,
          originalPrice: obr.entry.price,
          lastValidPrice: obr.entry.price,
          moved: false,
          pointerId: e.pointerId,
          capturedScope,
          capturedSymbol,
        }
        return
      }
    }

    // PREVIEW line — allowed even while locked (pre-money planning). Nothing on this path reaches
    // the broker — an ✕ tap relays a structural cancel, a drag relays a price, both only to the host.
    const phit = previewHitTest(e.clientX, e.clientY)
    if (!phit || !phit.entry.previewId) return // no preview line near the pointer → let the chart pan
    if (phit.isXZone) {
      e.preventDefault()
      try {
        container.setPointerCapture(e.pointerId)
      } catch {
        /* capture is best-effort */
      }
      pendingPreviewX = { key: phit.key, previewId: phit.entry.previewId, pointerId: e.pointerId, downX: e.clientX, downY: e.clientY }
      return
    }
    if (!phit.entry.editable) return // a non-editable preview body (leg group) is not draggable → let the chart pan
    e.preventDefault()
    try {
      container.setPointerCapture(e.pointerId)
    } catch {
      /* capture is best-effort */
    }
    chart.applyOptions({ handleScroll: false, handleScale: false })
    container.style.touchAction = 'none'
    previewDrag = {
      key: phit.key,
      previewId: phit.entry.previewId,
      originalPrice: phit.entry.price,
      lastValidPrice: phit.entry.price,
      moved: false,
      pointerId: e.pointerId,
      capturedScope,
      capturedSymbol,
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (bracketDrag) {
      if (e.pointerId !== bracketDrag.pointerId) return
      latestClientY = e.clientY
      if (raf != null) return // coalesce: one applyOptions per frame
      raf = requestAnimationFrame(() => {
        raf = null
        const b = bracketDrag
        if (!b) return
        const rect = container.getBoundingClientRect()
        const price = series.coordinateToPrice((latestClientY ?? 0) - rect.top)
        if (price == null) return
        b.lastValidPrice = price
        b.moved = isMeaningfulMove(price, b.anchor, opts.tick)
        b.ghost?.applyOptions({ price }) // UNSNAPPED — follow the cursor; snap at drop
        // Repaint the zone in the SAME frame as the line. Leaving it to the overlay's own sync loop
        // costs a frame and the band visibly lags the cursor it is supposed to be reporting.
        paintOverlay()
      })
      return
    }
    const drag = dragging ?? previewDrag
    if (!drag) {
      if (pendingX || pendingPreviewX || pendingObrX || pendingOrderQty) return
      if (!interactive()) return
      // Live hover (only when not locked) wins; otherwise reflect a preview line: the ✕ band →
      // pointer (cancellable), an editable body → ns-resize, a non-editable body → not-allowed.
      // Overlay CONTROLS first, and they all take the same pointer: ⇄, TP, SL and ✕ are one family of
      // things you press, and giving the drag handles a different cursor made them read as a different
      // kind of control than the button beside them.
      const part = partAt(e.clientX, e.clientY)
      // The draft's quantity chip answers the pointer even while trading is LOCKED — editing a ticket
      // that has not been sent is not trading. Every other control needs the account armed.
      const draftQtyChip =
        !!part &&
        (part.hit.role === 'qty' || part.hit.role === 'orderType') &&
        part.entry.kind === 'preview' &&
        part.entry.previewId === 'entry'
      // A WORKING ORDER's quantity chip is a pressed control (it opens the size editor), so it takes
      // the pointer like every other button — without this it fell through to the line body's
      // ns-resize, promising a drag where a tap is the gesture. Only where the chip was drawn
      // editable (an entry, unmanaged, armed) — an exit pill's qty cell stays a readout.
      const orderQtyChip =
        !!part &&
        part.hit.role === 'qty' &&
        (part.entry.kind === 'stop' || part.entry.kind === 'limit' || part.entry.kind === 'stop_limit') &&
        part.entry.editable === true &&
        !!opts.onOrderQtyEdit &&
        !opts.locked
      if (draftQtyChip || orderQtyChip || (part && !opts.locked && isControlRole(part.hit.role))) {
        container.style.cursor = 'pointer'
        return
      }
      // A pre-arm bracket line's ✕ resolves through partAt above (isControlRole covers 'close');
      // its body earns the same drag cursor a live order line does when it can actually move.
      if (part && part.entry.kind === 'obracket' && part.hit.role === 'close' && !opts.locked) {
        container.style.cursor = 'pointer'
        return
      }
      const res = opts.locked ? null : hitTest(e.clientX, e.clientY)
      if (res) {
        container.style.cursor = res.hit.isXZone || res.hit.isRevZone ? 'pointer' : 'ns-resize'
        return
      }
      const obr = opts.locked ? null : obracketHitTest(e.clientX, e.clientY)
      if (obr) {
        container.style.cursor = obr.entry.editable ? 'ns-resize' : 'not-allowed'
        return
      }
      const phit = previewHitTest(e.clientX, e.clientY)
      container.style.cursor = phit ? (phit.isXZone ? 'pointer' : phit.entry.editable ? 'ns-resize' : 'not-allowed') : ''
      return
    }
    if (e.pointerId !== drag.pointerId) return
    latestClientY = e.clientY
    if (raf != null) return // coalesce: one applyOptions per frame
    raf = requestAnimationFrame(() => {
      raf = null
      const d = dragging ?? previewDrag
      if (!d) return
      const rect = container.getBoundingClientRect()
      const price = series.coordinateToPrice((latestClientY ?? 0) - rect.top)
      if (price == null) return
      d.lastValidPrice = price
      d.moved = isMeaningfulMove(price, d.originalPrice, opts.tick)
      const entry = lines.get(d.key)
      entry?.line.applyOptions({ price }) // UNSNAPPED — follow the cursor; snap at drop
      // The overlay positions a pill from its entry's price, so the entry has to move WITH the line or
      // the controls visibly detach from the level they belong to. Safe to mutate mid-gesture: the
      // reconcile loop skips a line that is being dragged, and re-reads it once the drag settles.
      if (entry) {
        entry.price = price
        refreshExitSpec(entry, price)
      }
      paintOverlay()
    })
  }

  const finishDrag = (e: PointerEvent): boolean => {
    const drag = dragging
    if (!drag || e.pointerId !== drag.pointerId) return false
    cancelRaf()
    try {
      container.releasePointerCapture(drag.pointerId)
    } catch {
      /* capture may already be released */
    }
    restoreChart()
    container.style.cursor = ''
    dragging = null
    const entry = lines.get(drag.key)
    const snapBack = () => {
      if (entry) entry.price = drag.originalPrice
      entry?.line.applyOptions({ price: drag.originalPrice })
      paintOverlay()
    }

    if (!drag.moved) {
      snapBack() // a tap, not a move → no order
      return true
    }
    if (opts.scope !== drag.capturedScope || opts.symbol !== drag.capturedSymbol) {
      snapBack()
      opts.onError?.(strings.t('lines.moveCancelled'))
      return true
    }
    // A PRE-ARM bracket leg's move: snap + reject the wrong side of the ENTRY's fill price (never
    // today's mark — nothing exists until the fill), then the leg's end state goes to the backend.
    if (drag.kind === 'obr_tp' || drag.kind === 'obr_sl') {
      const legKind = drag.kind === 'obr_tp' ? 'tp' : 'sl'
      const ord = opts.snapshot.orders.find((o) => o && o.brokerOrderId === drag.brokerOrderId && o.status === 'working')
      const fill = ord ? entryFillPrice(ord) : null
      if (!ord || fill == null) {
        snapBack()
        opts.onError?.(strings.t('broker.orderNotWorking'))
        return true
      }
      const bounded = boundBracketPrice(drag.lastValidPrice, {
        tick: opts.tick,
        anchor: fill,
        positionSide: ord.side === 'buy' ? 'long' : 'short',
        kind: legKind,
        policy: opts.policy,
        t: strings.t,
      })
      if ('error' in bounded) {
        snapBack()
        opts.onError?.(bounded.error)
        return true
      }
      if (entry) entry.price = bounded.price
      entry?.line.applyOptions({ price: bounded.price })
      paintOverlay()
      execOrderBracket(
        orderCtx(ord),
        legKind,
        bounded.price,
        drag.capturedScope,
        strings.t(legKind === 'tp' ? 'lines.takeProfitMoved' : 'lines.stopLossMoved', { price: fmtPrice(bounded.price, opts.tick) }),
        drag.key,
      )
      return true
    }
    const target: DropTarget =
      drag.kind === 'stop'
        ? { type: 'reprice-stop', brokerOrderId: drag.brokerOrderId }
        : drag.kind === 'stop_limit'
          ? { type: 'reprice-stop-limit', brokerOrderId: drag.brokerOrderId, leg: 'trigger' }
          : drag.kind === 'stop_limit_limit'
            ? { type: 'reprice-stop-limit', brokerOrderId: drag.brokerOrderId, leg: 'limit' }
            : { type: 'reprice-limit', brokerOrderId: drag.brokerOrderId }
    const plan = planBrokerDrop(target, drag.lastValidPrice, buildCtx(drag.capturedScope))
    if (plan.drop) {
      snapBack()
      opts.onError?.(plan.reason)
      return true
    }
    // Valid → execute, holding the line at the SNAPPED price the plan is sending. The snapshot is
    // reconciled against that exact value, so when the broker echoes it back the hold releases with
    // nothing to move. The line and its pill land on that price NOW rather than waiting for the next
    // reconcile: the drag left them on the unsnapped cursor price and `entry.price` on the original,
    // and any paint in between would show the drop bouncing back before it settles.
    // A stop-limit plan carries BOTH prices — the DRAGGED line holds at ITS leg's value (the limit
    // line pinned to plan.price would jump to the trigger).
    const heldAt = drag.kind === 'stop_limit_limit' ? plan.stopLimitPrice : plan.price
    if (heldAt != null) {
      pendingMoves.hold(drag.key, heldAt, PENDING_MOVE_MS)
      if (entry) entry.price = heldAt
      entry?.line.applyOptions({ price: heldAt })
      paintOverlay()
    }
    execPlan(plan, drag.capturedScope)
    return true
  }

  // PREVIEW drop — its OWN finish, structurally broker-free: it snaps + bands via
  // dispatchPreviewDrop and relays the new price to the host. There is NO broker call in scope
  // here, so a preview drag can never reach the backend.
  const finishPreviewDrag = (e: PointerEvent): boolean => {
    const drag = previewDrag
    if (!drag || e.pointerId !== drag.pointerId) return false
    cancelRaf()
    try {
      container.releasePointerCapture(drag.pointerId)
    } catch {
      /* capture may already be released */
    }
    restoreChart()
    container.style.cursor = ''
    previewDrag = null
    const entry = lines.get(drag.key)
    const snapBack = () => {
      if (entry) entry.price = drag.originalPrice
      entry?.line.applyOptions({ price: drag.originalPrice })
      paintOverlay()
    }

    if (!drag.moved) {
      snapBack()
      return true
    }
    if (opts.scope !== drag.capturedScope || opts.symbol !== drag.capturedSymbol) {
      snapBack()
      opts.onError?.(strings.t('lines.editCancelled'))
      return true
    }
    const ctx = { tick: opts.tick, entryRef: previewEntryRef(), policy: opts.policy }
    let landed: number | null = null
    const emitted = dispatchPreviewDrop(drag.previewId, drag.lastValidPrice, ctx, (id, price) => {
      landed = price
      opts.onPreviewEdit?.(id, price)
    })
    if (!emitted) {
      snapBack()
      opts.onError?.(strings.t('lines.outsideRange'))
      return true
    }
    // Land the line on the SNAPPED price and hold it there. The drag left it unsnapped under the
    // cursor and left `entry.price` at the original, so without this the very next reconcile — which
    // runs long before the host's re-derived draft comes back through React — repaints the line and
    // its pill at the OLD price, and the drop visibly bounces. Same hold the live path uses, with a
    // shorter fuse: what it waits on is a couple of renders, not a broker.
    if (landed != null) {
      if (entry) entry.price = landed
      entry?.line.applyOptions({ price: landed })
      pendingMoves.hold(drag.key, landed, PENDING_DRAFT_MS)
      paintOverlay()
    }
    return true
  }

  /** Settle a TP/SL handle drag: snap, reject a level dropped on the wrong side of the entry, then
   *  place it. A drag that never left the line commits nothing. */
  const finishBracket = (e: PointerEvent): boolean => {
    const b = bracketDrag
    if (!b || e.pointerId !== b.pointerId) return false
    cancelRaf()
    try {
      container.releasePointerCapture(b.pointerId)
    } catch {
      /* capture may already be released */
    }
    restoreChart()
    container.style.cursor = ''
    bracketDrag = null
    if (b.ghost) {
      try {
        series.removePriceLine(b.ghost)
      } catch {
        /* the series may already be torn down */
      }
    }
    if (!b.moved) return true
    if (opts.scope !== b.capturedScope || opts.symbol !== b.capturedSymbol) {
      opts.onError?.(strings.t('lines.bracketCancelled'))
      return true
    }
    const bounded = boundBracketPrice(b.lastValidPrice, {
      tick: opts.tick,
      anchor: b.anchor,
      positionSide: b.positionSide,
      kind: b.kind,
      // A pre-arm leg validates against the ENTRY's fill price alone — the mark-side check belongs
      // to protection on a LIVE position, and nothing here exists until the entry fills.
      mark: b.order ? undefined : (markNow() ?? undefined),
      policy: opts.policy,
      t: strings.t,
    })
    if ('error' in bounded) {
      opts.onError?.(bounded.error)
      return true
    }
    const price = bounded.price
    // PRE-MONEY: a level dragged off the TICKET's draft belongs to the ticket. It routes to the host's
    // own callback and returns — there is no broker call below this point on that path, so the
    // never-execute guarantee holds structurally rather than by inspection.
    if (b.preview) {
      opts.onPreviewEdit?.(b.kind, price)
      return true
    }
    // A handle dragged off a RESTING ENTRY line: the leg attaches to THAT order and arms on fill.
    if (b.order) {
      execOrderBracket(
        b.order,
        b.kind,
        price,
        b.capturedScope,
        strings.t(b.kind === 'tp' ? 'lines.takeProfitArms' : 'lines.stopLossArms', { price: fmtPrice(price, opts.tick) }),
        `obr:${b.order.brokerOrderId}:${b.kind}`,
      )
      return true
    }
    // An exit CLOSES the position, so its side is the opposite of the position's — one message per
    // leg and side, because a sentence that names both has to agree with both.
    const placedKey =
      b.kind === 'tp'
        ? b.positionSide === 'long'
          ? 'lines.takeProfitPlacedSell'
          : 'lines.takeProfitPlacedBuy'
        : b.positionSide === 'long'
          ? 'lines.stopLossPlacedSell'
          : 'lines.stopLossPlacedBuy'
    const intentKey = `${b.kind}|${b.capturedScope}|${b.instrument}|${price}`
    const call =
      b.kind === 'tp'
        ? broker.setExits({ instrument: b.instrument, takeProfit: price, intentKey })
        : broker.setExits({ instrument: b.instrument, stopLoss: price, intentKey })
    if (!call) {
      opts.onError?.(strings.t('lines.takeProfitUnsupported'))
      return true
    }
    void call
      .then(() => opts.onAction?.(strings.t(placedKey, { qty: b.qty, price: formatLinePrice(price) ?? String(price) })))
      .catch((err) => opts.onError?.(errMsg(err, strings.t)))
    return true
  }

  const onPointerUp = (e: PointerEvent) => {
    // The draft's side chip — the ONE money tap on a draft line. A tap commits against the LINE it
    // pressed, not the pixels: a market draft rides the live mark, so the chip can slide out from
    // under a perfectly still finger, and re-hit-testing the release would drop the send exactly when
    // the market is moving fastest. What still has to hold is that the pointer didn't wander off (a
    // change of mind) and that the line is still there (it reconciled away mid-press).
    const ps = pendingSubmit
    if (ps && e.pointerId === ps.pointerId) {
      pendingSubmit = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      if (strayedFromTap(e, ps)) return
      if (!lines.has(ps.key)) return
      if (opts.locked || !interactive()) return // the lock can land between the press and the release
      opts.onDraftSubmit?.()
      return
    }
    // The order-type cell. Resolved from the LINE like the quantity chip, since a market draft rides
    // the live mark and the cell is rarely on the pixel it was pressed on by the time the finger lifts.
    const pot = pendingOrderType
    if (pot && e.pointerId === pot.pointerId) {
      pendingOrderType = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      if (strayedFromTap(e, pot)) return
      const laid = layouts.get(pot.key)
      const cell = laid ? findPart(laid, 'orderType') : null
      if (!cell) return
      const box = container.getBoundingClientRect()
      opts.onOrderTypeEdit?.({
        current: String(opts.preview?.orderType ?? ''),
        rect: { x: box.left + cell.x, y: box.top + cell.y, w: cell.w, h: cell.h },
      })
      return
    }
    const pq = pendingQty
    if (pq && e.pointerId === pq.pointerId) {
      pendingQty = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      if (strayedFromTap(e, pq)) return
      // Resolved from the LINE, not from the pointer: a market draft rides the live mark, so by the
      // time the finger lifts the chip has often slid off the pixel it was pressed on — and the editor
      // has to open where the chip is NOW, not where it was.
      const laid = layouts.get(pq.key)
      const n = laid ? findPart(laid, 'qty') : null
      if (!n) return
      // Every part rect is CONTAINER-local (that is the space the overlay paints and hit-tests in);
      // the host hangs a viewport-positioned popover off it, so the container origin goes back on here
      // rather than the host having to know how the chart lays its canvas out.
      const box = container.getBoundingClientRect()
      opts.onQtyEdit?.({
        qty: Number(opts.preview?.qty ?? 0),
        step: Number(opts.preview?.qtyStep ?? 1),
        rect: { x: box.left + n.x, y: box.top + n.y, w: n.w, h: n.h },
      })
      return
    }
    // A PRE-ARM bracket level's ✕ — a clean tap removes that leg (the sibling rides through).
    const pox = pendingObrX
    if (pox && e.pointerId === pox.pointerId) {
      pendingObrX = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      // A leg's ✕ is money too: same tap-on-same-control-same-selection rule as the line's ✕/⇄.
      const verdict = tapReleaseVerdict({
        pointerType: e.pointerType,
        downX: pox.downX,
        downY: pox.downY,
        upX: e.clientX,
        upY: e.clientY,
        onSameControl: () => {
          const part = partAt(e.clientX, e.clientY)
          return !!part && part.key === pox.key && part.hit.role === 'close'
        },
        scopes: { captured: { scope: pox.capturedScope, symbol: pox.capturedSymbol }, current: { scope: opts.scope, symbol: opts.symbol } },
      })
      if (verdict !== 'commit') {
        if (verdict === 'scope_changed') opts.onError?.(strings.t('lines.actionCancelled'))
        return
      }
      const ord = opts.snapshot.orders.find((o) => o && o.brokerOrderId === pox.brokerOrderId && o.status === 'working')
      if (!ord) return
      execOrderBracket(orderCtx(ord), pox.legKind, null, pox.capturedScope, strings.t(pox.legKind === 'tp' ? 'lines.takeProfitRemoved' : 'lines.stopLossRemoved'))
      return
    }
    // A WORKING ORDER's quantity chip — resolved from the LINE (the chip may have slid under a
    // moving market), then the host's editor opens with a commit that runs the atomic replace.
    const poq = pendingOrderQty
    if (poq && e.pointerId === poq.pointerId) {
      pendingOrderQty = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      if (strayedFromTap(e, poq)) return
      const laid = layouts.get(poq.key)
      const cell = laid ? findPart(laid, 'qty') : null
      const ord = opts.snapshot.orders.find((o) => o && o.brokerOrderId === poq.brokerOrderId && o.status === 'working')
      if (!cell || !ord) return
      const scope = opts.scope
      if (!scope) return
      const qtyNow = Math.abs(ord.qty)
      // The stepper follows the size's own grid: whole sizes step by 1, a fractional (crypto) size
      // by its finest shown decimal. Typed values on any finer grid still commit — the venue is the
      // authority on the step, and it refuses an off-grid size typed either way.
      const decs = (String(qtyNow).split('.')[1] ?? '').length
      const step = decs > 0 ? Number((10 ** -decs).toFixed(decs)) : 1
      const box = container.getBoundingClientRect()
      opts.onOrderQtyEdit?.({
        qty: qtyNow,
        step,
        rect: { x: box.left + cell.x, y: box.top + cell.y, w: cell.w, h: cell.h },
        commit: (newQty) => {
          if (opts.scope !== scope || opts.locked) return
          const row = opts.snapshot.orders.find((o) => o && o.brokerOrderId === poq.brokerOrderId && o.status === 'working')
          if (!row || !Number.isFinite(newQty) || newQty <= 0 || newQty === Math.abs(row.qty)) return
          if (row.orderType !== 'limit' && row.orderType !== 'stop' && row.orderType !== 'stop_limit') return
          const price = row.orderType === 'limit' ? row.limitPrice : row.triggerPrice
          if (typeof price !== 'number' || price <= 0) return
          execPlan(
            {
              drop: false,
              method: 'moveOrder',
              instrument: row.instrument,
              price,
              stopLimitPrice: row.orderType === 'stop_limit' ? (row.limitPrice ?? undefined) : undefined,
              brokerOrderId: row.brokerOrderId,
              side: row.side,
              qty: newQty,
              orderType: row.orderType,
              intentKey: `resize|${scope}|${row.brokerOrderId}|${newQty}`,
              toast: strings.t('lines.qtySet', { qty: newQty }),
            },
            scope,
          )
        },
      })
      return
    }
    if (finishBracket(e)) return
    // A preview ✕ — handled first + in its OWN block. STRUCTURAL: on a clean tap it ONLY calls
    // onPreviewCancel(id); there is NO runTarget / execPlan / broker call anywhere on this path.
    const ppx = pendingPreviewX
    if (ppx && e.pointerId === ppx.pointerId) {
      pendingPreviewX = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      // Commits only as a TAP still resting on the same ✕ — dragged-off or reconciled-away is a no-op.
      const verdict = tapReleaseVerdict({
        pointerType: e.pointerType,
        downX: ppx.downX,
        downY: ppx.downY,
        upX: e.clientX,
        upY: e.clientY,
        onSameControl: () => {
          const res = previewHitTest(e.clientX, e.clientY)
          return !!res && res.key === ppx.key && res.isXZone
        },
      })
      if (verdict !== 'commit') return
      opts.onPreviewCancel?.(ppx.previewId)
      return
    }
    const px = pendingX
    if (px && e.pointerId === px.pointerId) {
      pendingX = null
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be released */
      }
      // Money commits only as a TAP still resting on the same ✕/⇄ under the SAME selection —
      // a mid-gesture scope/symbol switch surfaces, everything else drops silently.
      const verdict = tapReleaseVerdict({
        pointerType: e.pointerType,
        downX: px.downX,
        downY: px.downY,
        upX: e.clientX,
        upY: e.clientY,
        onSameControl: () => {
          const res = hitTest(e.clientX, e.clientY)
          return !!res && res.hit.key === px.key && (px.action === 'close' ? res.hit.isXZone : res.hit.isRevZone)
        },
        scopes: { captured: { scope: px.capturedScope, symbol: px.capturedSymbol }, current: { scope: opts.scope, symbol: opts.symbol } },
      })
      if (verdict !== 'commit') {
        if (verdict === 'scope_changed') opts.onError?.(strings.t('lines.actionCancelled'))
        return
      }
      if (px.action === 'reverse') {
        // ONE backend operation: the broker clears the instrument's working orders, then places
        // the flip order. A cancel failure on the backend aborts before the flip and lands here
        // as the error message.
        if (!broker.reversePosition) return
        void broker
          .reversePosition({ instrument: px.instrument, intentKey: `reverse|${px.capturedScope}|${px.instrument}` })
          .then((r) => {
            opts.onAction?.(
              r.cancelledOrders > 0
                ? strings.t('lines.positionReversedOrders', { count: r.cancelledOrders })
                : strings.t('lines.positionReversed'),
            )
          })
          .catch((err) => opts.onError?.(errMsg(err, strings.t)))
        return
      }
      const target: DropTarget = px.kind === 'position' ? { type: 'flatten', instrument: px.instrument } : { type: 'cancel', brokerOrderId: px.brokerOrderId! }
      runTarget(target, 0, px.capturedScope)
      return
    }
    // A preview drop is handled first and returns before the live finishDrag — they never overlap
    // (only one of previewDrag / dragging is ever set), but this makes the never-execute path explicit.
    if (finishPreviewDrag(e)) return
    finishDrag(e)
  }

  const cancelGesture = () => {
    cancelRaf()
    if (bracketDrag) {
      try {
        container.releasePointerCapture(bracketDrag.pointerId)
      } catch {
        /* best-effort */
      }
      if (bracketDrag.ghost) {
        try {
          series.removePriceLine(bracketDrag.ghost)
        } catch {
          /* the series may already be torn down */
        }
      }
      bracketDrag = null
    }
    const drag = dragging ?? previewDrag
    if (drag) {
      try {
        container.releasePointerCapture(drag.pointerId)
      } catch {
        /* best-effort */
      }
      const reverted = lines.get(drag.key)
      if (reverted) reverted.price = drag.originalPrice
      reverted?.line.applyOptions({ price: drag.originalPrice })
      paintOverlay()
      dragging = null
      previewDrag = null
    }
    pendingX = null
    pendingPreviewX = null
    pendingQty = null
    pendingSubmit = null
    pendingOrderType = null
    pendingObrX = null
    pendingOrderQty = null
    restoreChart()
    container.style.cursor = ''
  }

  const onPointerCancel = (e: PointerEvent) => {
    // A cancelled gesture commits nothing — snap back + restore the chart.
    if (pendingX?.pointerId === e.pointerId) {
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* best-effort */
      }
      pendingX = null
    }
    if (pendingPreviewX?.pointerId === e.pointerId) {
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* best-effort */
      }
      pendingPreviewX = null
    }
    // A pending chip tap has no ghost to unwind, but it MUST be released: pointerdown refuses to arm
    // anything while one is outstanding, so a cancelled tap left behind would deaden the whole surface.
    if (
      pendingQty?.pointerId === e.pointerId ||
      pendingSubmit?.pointerId === e.pointerId ||
      pendingOrderType?.pointerId === e.pointerId ||
      pendingObrX?.pointerId === e.pointerId ||
      pendingOrderQty?.pointerId === e.pointerId
    ) {
      try {
        container.releasePointerCapture(e.pointerId)
      } catch {
        /* best-effort */
      }
      pendingQty = null
      pendingSubmit = null
      pendingOrderType = null
      pendingObrX = null
      pendingOrderQty = null
    }
    const drag = dragging ?? previewDrag
    if (drag && e.pointerId === drag.pointerId) {
      cancelRaf()
      try {
        container.releasePointerCapture(drag.pointerId)
      } catch {
        /* best-effort */
      }
      restoreChart()
      container.style.cursor = ''
      const reverted = lines.get(drag.key)
      if (reverted) reverted.price = drag.originalPrice
      reverted?.line.applyOptions({ price: drag.originalPrice })
      paintOverlay()
      dragging = null
      previewDrag = null
    }
  }

  const onWindowBlur = () => {
    // Losing focus mid-drag (alt-tab) must always restore the chart and snap the line back.
    cancelGesture()
  }

  container.addEventListener('pointerdown', onPointerDown, true)
  container.addEventListener('pointermove', onPointerMove)
  container.addEventListener('pointerup', onPointerUp)
  container.addEventListener('pointercancel', onPointerCancel)
  window.addEventListener('blur', onWindowBlur)
  // A language switch rebuilds every pill: the specs hold resolved text, so a pill drawn before the
  // switch would keep its old words until the next snapshot arrived.
  const unsubscribeStrings = strings.onChange(() => draw())

  draw()

  return {
    update(patch) {
      const scopeChanged = 'scope' in patch && patch.scope !== opts.scope
      const symbolChanged = 'symbol' in patch && patch.symbol !== opts.symbol
      opts = { ...opts, ...patch }
      // A selection or symbol switch cancels any in-flight gesture (the captured-vs-current guard
      // at drop is the backstop; this is the eager teardown the React host used to do).
      if (scopeChanged || symbolChanged) cancelGesture()
      draw()
    },
    controlAt(clientX, clientY) {
      // Always the finger's reach, never the pointer's: the only caller is a touch host asking
      // whether a press belongs to a control before it spends that press on something else, and it
      // asks on `touchstart`, which can precede the pointerdown that would have set `coarse`.
      return partAt(clientX, clientY, TOUCH_SLOP_PX) != null
    },
    detach() {
      detached = true
      unsubscribeStrings()
      cancelGesture()
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerCancel)
      container.removeEventListener('pointermove', onHoverMove)
      window.removeEventListener('blur', onWindowBlur)
      container.title = ''
      overlay.remove()
      layouts.clear()
      for (const entry of lines.values()) {
        try {
          series.removePriceLine(entry.line)
        } catch {
          /* the series may already be torn down */
        }
      }
      lines.clear()
      pendingMoves.clear()
    },
  }
}
