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
import {
  boundStopPrice,
  dispatchPreviewDrop,
  isMeaningfulMove,
  pickHit,
  planBrokerDrop,
  type BrokerExec,
  type BrokerSnapshot,
  type ChartBroker,
  type DropTarget,
  type Hit,
  type HitCandidate,
  type LineKind,
  type PlanCtx,
  type PricePolicy,
} from './broker'
import { DEFAULT_OVERRIDES, type ChartOverrides } from './overrides'
import {
  buildOrderParts,
  buildPositionParts,
  drawParts,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  hitTestParts,
  layoutParts,
  PART_H,
  type LayoutNode,
  type PartHit,
  type PartSpec,
} from './tradeLineParts'

// Broker instrument / charted ticker -> tradeable root: strip an exchange prefix, separators, a
// continuous-contract "1!" suffix, and a trailing month code. Micros stay DISTINCT (MES ≠ ES) so a
// micro's line never lands on a full-size chart.
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

// Ghost (preview) palette — translucent + LargeDashed, visually distinct from the SOLID position /
// DASHED stop / DOTTED limit live lines. Entry is a neutral amber; a stop is translucent red, a
// target translucent green.
const PREVIEW_ENTRY = 'rgba(245, 158, 11, 0.9)'
const PREVIEW_SL = 'rgba(255, 82, 82, 0.55)'
const PREVIEW_TP = 'rgba(52, 210, 75, 0.6)'

/** The position pill's P&L cell, honest per unit: money = the broker's OWN unrealizedPnl (null → no
 *  cell at all, never a locally-faked number); ticks/percent derive from the live mark vs avg entry
 *  and vanish without a live mark or a known tick. */
function positionPnlDisplay(
  p: { qty: number; avgPrice: number | null; unrealizedPnl: number | null },
  mode: 'money' | 'ticks' | 'percent',
  tick: number | undefined,
  mark: number | null,
  currency: string | null,
): { text: string | null; sign: 'profit' | 'loss' | null } {
  const signOf = (v: number | null): 'profit' | 'loss' | null => (v == null ? null : v < 0 ? 'loss' : 'profit')
  if (mode === 'money') return { text: formatPnlMoney(p.unrealizedPnl, currency), sign: signOf(p.unrealizedPnl) }
  if (mark == null || mark <= 0 || p.avgPrice == null || p.avgPrice <= 0) return { text: null, sign: null }
  const dir = p.qty > 0 ? 1 : -1
  if (mode === 'ticks') {
    if (!tick || tick <= 0) return { text: null, sign: null }
    const t = ((mark - p.avgPrice) * dir) / tick
    return { text: formatPnlTicks(t), sign: signOf(t) }
  }
  const pct = ((mark - p.avgPrice) / p.avgPrice) * 100 * dir
  return { text: formatPnlPercent(pct), sign: signOf(pct) }
}

// Drag tuning. A grab registers within GRAB_PX of a line; the ✕ (close/cancel) hot-zone is the
// right band of the plot area (just left of the price axis), the ⇄ (reverse) band sits immediately
// left of it; a tap that strays more than CLICK_SLOP px isn't treated as a click.
const GRAB_PX = 6
const X_ZONE_W = 28
const CLICK_SLOP = 4

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
  /** The account's currency, shown beside a money P&L. Omitted ⇒ the number renders bare rather
   *  than wearing a guessed currency. */
  currency?: string
  /** The live-trusted mark, or null (feed down / not live). Read at gesture/draw time. */
  mark?: () => number | null
  /** Trading lock — live actions disarm (display-only); PREVIEW gestures stay allowed (pre-money). */
  locked?: boolean
  /** The ChartOverrides trading.* section (colors, widths, visibility, P&L unit). Package defaults
   *  when omitted. */
  overrides?: ChartOverrides['trading']
  /** The host's price gate (see PricePolicy). Omitted ⇒ snap-only. */
  policy?: PricePolicy
  /** Host preview levels (pre-money). Omitted ⇒ no ghost lines. */
  preview?: PreviewSet | null
  /** A dragged preview line's new (snapped, banded) price. The ONLY thing a preview drag calls. */
  onPreviewEdit?: (id: string, price: number) => void
  /** A preview line's ✕. The ONLY thing a preview ✕-tap calls. */
  onPreviewCancel?: (id: string) => void
  /** A confirmed action's feedback (with an optional Undo for a protective stop move). */
  onAction?: (text: string, undo?: () => void) => void
  /** A dropped / failed / informational message. */
  onError?: (msg: string) => void
}

export interface TradeLineAttachment {
  /** Apply changed inputs (snapshot, symbol, selection, lock, overrides, preview…) and redraw. A
   *  scope or symbol change cancels any in-flight gesture (the drop-time guard also re-checks). */
  update(patch: Partial<TradeLineOptions>): void
  detach(): void
}

interface LineEntry {
  line: IPriceLine
  kind: LineKind | 'preview'
  price: number
  instrument: string
  brokerOrderId?: string
  previewId?: string
  editable?: boolean
  /** The overlay control tree for this line (absent ⇒ the line draws no controls). */
  spec?: PartSpec
}

interface DragState {
  key: string
  kind: 'stop' | 'limit'
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

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : 'Chart action failed')

export function attachTradeLines(host: TradeLineHost, broker: ChartBroker, initial: TradeLineOptions): TradeLineAttachment {
  const { chart, series, container } = host
  let opts: TradeLineOptions = { ...initial }
  /** intentKey → the host's own idempotency lifecycle happens in the ChartBroker adapter; the
   *  package just forwards the key from the plan. */

  const lines = new Map<string, LineEntry>()
  let dragging: DragState | null = null
  let previewDrag: PreviewDragState | null = null
  let pendingX: PendingX | null = null
  let pendingPreviewX: PendingPreviewX | null = null
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

  const plotRightEdge = (): number => container.clientWidth - chart.priceScale('right').width()

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
    for (const [key, entry] of lines) {
      if (!entry.spec) continue
      const y = series.priceToCoordinate(entry.price)
      if (y == null || y < PART_H / 2 || y > h - PART_H / 2) continue
      const node = layoutParts(entry.spec, { rightEdge, centerY: y, measure: measureText })
      layouts.set(key, node)
      const localHover = hoveredPart && hoveredPart.startsWith(`${key}:`) ? hoveredPart.slice(key.length + 1) : null
      drawParts(octx, node, localHover)
    }
  }

  /** A cheap signature of everything that moves a control box. Panning, zooming and autoscaling all
   *  move a line without any snapshot change, and a stale box would accept taps where nothing is
   *  painted — the exact failure this overlay exists to remove. */
  const overlaySignature = (): string => {
    let s = `${container.clientWidth}x${container.clientHeight}|${plotRightEdge()}|${hoveredPart ?? ''}`
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

  /** The control under the pointer, resolved against the painted rectangles. */
  const partAt = (clientX: number, clientY: number): { key: string; entry: LineEntry; hit: PartHit } | null => {
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    let best: { key: string; entry: LineEntry; hit: PartHit } | null = null
    for (const [key, node] of layouts) {
      const hit = hitTestParts(node, x, y)
      if (!hit) continue
      const entry = lines.get(key)
      if (entry) best = { key, entry, hit }
    }
    return best
  }

  const onHoverMove = (e: PointerEvent) => {
    if (dragging || previewDrag || pendingX || pendingPreviewX) return
    const part = partAt(e.clientX, e.clientY)
    const id = part ? `${part.key}:${part.hit.id}` : null
    if (id !== hoveredPart) {
      hoveredPart = id
      paintOverlay()
    }
    const tip = part?.hit.tooltip ?? ''
    if (container.title !== tip) container.title = tip
  }
  container.addEventListener('pointermove', onHoverMove)

  // ── Draw / reconcile BY IDENTITY (update/create/remove only what changed — a teardown-per-tick
  //    both flickers and would destroy the line the user is mid-drag holding) ──
  const draw = () => {
    if (detached) return
    const root = normalizeRoot(opts.symbol)
    const t = T()
    interface Desired {
      price: number
      color: string
      lineWidth: 1 | 2 | 3
      lineStyle: number
      title: string
      kind: LineKind | 'preview'
      instrument: string
      brokerOrderId?: string
      previewId?: string
      editable?: boolean
      spec?: PartSpec
    }
    const desired = new Map<string, Desired>()
    if (root) {
      const canReverse = typeof broker.reversePosition === 'function'
      for (const p of t.showPositions ? opts.snapshot.positions : []) {
        if (!p || p.qty === 0 || typeof p.avgPrice !== 'number' || !isFinite(p.avgPrice) || p.avgPrice <= 0) continue
        if (normalizeRoot(p.instrument) !== root) continue
        const long = p.qty > 0
        const pnl = positionPnlDisplay(p, t.pnlMode, opts.tick, markNow(), opts.currency ?? null)
        // Identity, P&L and the controls all live in the overlay pill — the native line carries no
        // title, so nothing that looks like a button is painted anywhere it can't be tapped.
        desired.set(`pos:${p.instrument}`, {
          price: p.avgPrice,
          color: long ? t.buyColor : t.sellColor,
          lineWidth: t.positionLineWidth,
          lineStyle: 0,
          title: '',
          kind: 'position',
          instrument: p.instrument,
          spec: buildPositionParts({
            qty: p.qty,
            avgPrice: p.avgPrice,
            pnlText: pnl.text,
            pnlSign: pnl.sign,
            currency: opts.currency ?? '',
            supportReverse: armed() && canReverse,
            supportClose: armed(),
            // A bracket drag needs a broker action of its own; the TP/SL handles stay off until it
            // exists rather than painting controls that cannot fire.
            supportBrackets: false,
            priceText: formatLinePrice(p.avgPrice),
          }),
        })
      }
      for (const o of t.showOrders ? opts.snapshot.orders : []) {
        if (!o || o.status !== 'working' || (o.orderType !== 'stop' && o.orderType !== 'limit')) continue
        const price = o.orderType === 'stop' ? o.triggerPrice : o.limitPrice
        if (typeof price !== 'number' || !isFinite(price) || price <= 0) continue
        if (normalizeRoot(o.instrument) !== root) continue
        const buy = o.side === 'buy'
        desired.set(`ord:${o.brokerOrderId}`, {
          price,
          color: buy ? t.buyColor : t.sellColor,
          lineWidth: t.orderLineWidth,
          lineStyle: o.orderType === 'stop' ? 2 : 1,
          title: '',
          kind: o.orderType,
          instrument: o.instrument,
          brokerOrderId: o.brokerOrderId,
          spec: buildOrderParts({
            qty: o.qty,
            label: `${buy ? 'BUY' : 'SELL'} ${o.orderType.toUpperCase()}`,
            color: buy ? t.buyColor : t.sellColor,
            supportCancel: armed(),
            supportModifyQty: false,
          }),
        })
      }

      // Host PREVIEW ghost lines — drawn whenever the preview's instrument matches the charted
      // root, REGARDLESS of armed/locked (planning is pre-money). `preview:` keys never collide
      // with the live pos:/ord: lines. Suppress a preview level that coincides (within half a
      // tick) with an already-drawn LIVE line — once a level becomes a live working order the
      // ghost would otherwise double it.
      const pv = opts.preview
      if (pv && normalizeRoot(pv.instrument) === root) {
        const livePrices = [...desired.values()].map((d) => d.price)
        const tol = pv.tick > 0 ? pv.tick / 2 : 1e-9
        for (const ln of pv.lines) {
          if (typeof ln.price !== 'number' || !isFinite(ln.price) || ln.price <= 0) continue
          if (livePrices.some((p) => Math.abs(p - ln.price) <= tol)) continue
          desired.set(`preview:${ln.id}`, {
            price: ln.price,
            color: ln.kind === 'sl' ? PREVIEW_SL : ln.kind === 'tp' ? PREVIEW_TP : PREVIEW_ENTRY,
            lineWidth: 1,
            lineStyle: 3, // LargeDashed
            title: `${ln.label} ${ln.qty} · pending`,
            kind: 'preview',
            instrument: pv.instrument,
            previewId: ln.id,
            editable: ln.editable,
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
        existing.editable = d.editable
        existing.spec = d.spec
      } else {
        const line = series.createPriceLine({ price: d.price, color: d.color, lineWidth: d.lineWidth as 1 | 2 | 3, lineStyle: d.lineStyle, axisLabelVisible: true, title: d.title })
        lines.set(key, { line, kind: d.kind, price: d.price, instrument: d.instrument, brokerOrderId: d.brokerOrderId, previewId: d.previewId, editable: d.editable, spec: d.spec })
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

  const buildCtx = (scope: string): PlanCtx => ({
    snapshot: opts.snapshot,
    scope,
    tick: opts.tick && opts.tick > 0 ? opts.tick : undefined,
    mark: markNow() ?? undefined,
    policy: opts.policy,
  })

  const hitTest = (clientX: number, clientY: number): { hit: Hit; entry: LineEntry } | null => {
    // A tap resolves against the CONTROL it landed on. Only when no control is under the pointer
    // does it fall through to the line body, where a grab means "reprice".
    const part = partAt(clientX, clientY)
    if (part && part.entry.kind !== 'preview' && (part.hit.role === 'close' || part.hit.role === 'reverse')) {
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
      if (entry.kind === 'preview') continue
      const ly = series.priceToCoordinate(entry.price)
      if (ly == null || ly < 0 || ly > rect.height) continue
      const dist = Math.abs(y - ly)
      if (dist > GRAB_PX) continue
      cands.push({ key, kind: entry.kind, dist, isXZone: false, isRevZone: false })
    }
    const hit = pickHit(cands)
    if (!hit) return null
    const entry = lines.get(hit.key)
    return entry ? { hit, entry } : null
  }

  // Nearest PREVIEW line within the grab radius — editable or not (the caller decides the cursor +
  // whether to start a drag vs a cancel). `isXZone` flags the right-edge ✕ band: a tap there
  // CANCELS the line (works for non-editable leg groups too), elsewhere a drag reprices an editable one.
  const previewHitTest = (clientX: number, clientY: number): { key: string; entry: LineEntry; isXZone: boolean } | null => {
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const yy = clientY - rect.top
    const plotRight = rect.width - chart.priceScale('right').width()
    let best: { key: string; entry: LineEntry; dist: number } | null = null
    for (const [key, entry] of lines) {
      if (entry.kind !== 'preview') continue
      const ly = series.priceToCoordinate(entry.price)
      if (ly == null || ly < 0 || ly > rect.height) continue
      const dist = Math.abs(yy - ly)
      if (dist > GRAB_PX) continue
      if (!best || dist < best.dist) best = { key, entry, dist }
    }
    if (!best) return null
    return { key: best.key, entry: best.entry, isXZone: x >= plotRight - X_ZONE_W && x <= plotRight + 2 }
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
    if (plan.method === 'setProtectiveStop' && typeof plan.undoPrevStop === 'number') {
      const prev = plan.undoPrevStop
      const inst = plan.instrument
      undo = () => {
        if (opts.scope !== scope || opts.symbol !== symbolAtExec) return
        const pos = opts.snapshot.positions.find((x) => x.instrument === inst && x.qty !== 0)
        if (!pos) return
        const mk = markNow() ?? undefined
        const anchor = typeof pos.avgPrice === 'number' && pos.avgPrice > 0 ? pos.avgPrice : (mk ?? null)
        const r = boundStopPrice(prev, { tick: opts.tick, anchor, protectiveSide: pos.qty > 0 ? 'long' : 'short', mark: mk, policy: opts.policy })
        if ('error' in r) return
        void broker
          .setProtectiveStop({ instrument: inst, price: r.price, intentKey: `stop|${scope}|${inst}|${r.price}` })
          .catch((err) => opts.onError?.(errMsg(err)))
      }
    }
    const run = async (): Promise<void> => {
      if (plan.method === 'setProtectiveStop') {
        await broker.setProtectiveStop({ instrument: plan.instrument, price: plan.price!, intentKey: plan.intentKey! })
      } else if (plan.method === 'moveOrder') {
        await broker.moveOrder({ brokerOrderId: plan.brokerOrderId!, instrument: plan.instrument, side: plan.side!, qty: plan.qty!, orderType: plan.orderType!, price: plan.price!, intentKey: plan.intentKey! })
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
      .catch((err) => opts.onError?.(errMsg(err)))
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || dragging || previewDrag || pendingX || pendingPreviewX) return
    if (!interactive()) return
    const capturedScope = opts.scope!
    const capturedSymbol = opts.symbol

    // LIVE lines (position avg / working order) — only when trading isn't locked.
    if (!opts.locked) {
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
        // Reprice grab — stop/limit only (pickHit never returns a non-X position). Disabled until
        // the tick is known.
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
    const drag = dragging ?? previewDrag
    if (!drag) {
      if (pendingX || pendingPreviewX) return
      if (!interactive()) return
      // Live hover (only when not locked) wins; otherwise reflect a preview line: the ✕ band →
      // pointer (cancellable), an editable body → ns-resize, a non-editable body → not-allowed.
      const res = opts.locked ? null : hitTest(e.clientX, e.clientY)
      if (res) {
        container.style.cursor = res.hit.isXZone || res.hit.isRevZone ? 'pointer' : 'ns-resize'
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
      lines.get(d.key)?.line.applyOptions({ price }) // UNSNAPPED — follow the cursor; snap at drop
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
    const snapBack = () => entry?.line.applyOptions({ price: drag.originalPrice })

    if (!drag.moved) {
      snapBack() // a tap, not a move → no order
      return true
    }
    if (opts.scope !== drag.capturedScope || opts.symbol !== drag.capturedSymbol) {
      snapBack()
      opts.onError?.('Selection changed — move cancelled')
      return true
    }
    const target: DropTarget = drag.kind === 'stop' ? { type: 'reprice-stop', brokerOrderId: drag.brokerOrderId } : { type: 'reprice-limit', brokerOrderId: drag.brokerOrderId }
    const plan = planBrokerDrop(target, drag.lastValidPrice, buildCtx(drag.capturedScope))
    if (plan.drop) {
      snapBack()
      opts.onError?.(plan.reason)
      return true
    }
    // Valid → execute; leave the optimistic line where dropped (the next snapshot reconciles it to
    // the broker-confirmed price now that the drag has cleared).
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
    const snapBack = () => entry?.line.applyOptions({ price: drag.originalPrice })

    if (!drag.moved) {
      snapBack()
      return true
    }
    if (opts.scope !== drag.capturedScope || opts.symbol !== drag.capturedSymbol) {
      snapBack()
      opts.onError?.('Selection changed — edit cancelled')
      return true
    }
    const ctx = { tick: opts.tick, entryRef: previewEntryRef(), policy: opts.policy }
    const emitted = dispatchPreviewDrop(drag.previewId, drag.lastValidPrice, ctx, (id, price) => opts.onPreviewEdit?.(id, price))
    if (!emitted) {
      snapBack()
      opts.onError?.('Outside the allowed range — reverted')
    }
    // Emitted → leave the line where dropped; the host's next preview push reconciles it.
    return true
  }

  const onPointerUp = (e: PointerEvent) => {
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
      const strayed = Math.abs(e.clientX - ppx.downX) > CLICK_SLOP || Math.abs(e.clientY - ppx.downY) > CLICK_SLOP
      if (strayed) return // dragged off the ✕ → no accidental cancel
      const res = previewHitTest(e.clientX, e.clientY)
      if (!res || res.key !== ppx.key || !res.isXZone) return // pointer left the line/✕ band, or it reconciled away
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
      const strayed = Math.abs(e.clientX - px.downX) > CLICK_SLOP || Math.abs(e.clientY - px.downY) > CLICK_SLOP
      if (strayed) return // dragged off the ✕/⇄ → no accidental action
      const res = hitTest(e.clientX, e.clientY)
      if (!res || res.hit.key !== px.key || (px.action === 'close' ? !res.hit.isXZone : !res.hit.isRevZone)) return
      if (opts.scope !== px.capturedScope || opts.symbol !== px.capturedSymbol) {
        opts.onError?.('Selection changed — action cancelled')
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
            opts.onAction?.(`Position reversed${r.cancelledOrders > 0 ? ` · ${r.cancelledOrders} order${r.cancelledOrders === 1 ? '' : 's'} cancelled` : ''}`)
          })
          .catch((err) => opts.onError?.(errMsg(err)))
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
    const drag = dragging ?? previewDrag
    if (drag) {
      try {
        container.releasePointerCapture(drag.pointerId)
      } catch {
        /* best-effort */
      }
      lines.get(drag.key)?.line.applyOptions({ price: drag.originalPrice })
      dragging = null
      previewDrag = null
    }
    pendingX = null
    pendingPreviewX = null
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
      lines.get(drag.key)?.line.applyOptions({ price: drag.originalPrice })
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
    detach() {
      detached = true
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
    },
  }
}
