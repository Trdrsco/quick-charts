// The standalone chart host — createChart(options) mounts a complete datafeed-driven chart into a DOM
// element with no framework dependency: lightweight-charts underneath, the ChartDatafeed seam for data,
// ChartStorage for the viewer's sticky symbol/timeframe, theme overrides, event hooks, and indicator
// plugins computed over the live bar series. This is the widget a third party embeds; the trdrs app's own
// ChartPanel is a richer host over the same seams (trading, drawings UI, replay) and does not use this.
import {
  CandlestickSeries,
  ColorType,
  createChart as createLwChart,
  CrosshairMode,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { FeedUnavailableError, olderPageVerdict, type ChartDatafeed, type DatafeedConfig, type FeedBar } from './datafeed'
import { localStorageChartStorage, type ChartStorage } from './storage'
import type { ChartTheme, ChartWidgetOptions, IndicatorInstance } from './widget'
import { BRAND_DOWN, BRAND_UP } from './overrides'
import { attachDrawings, type DrawingsEvents, type DrawingsHandle } from './drawings'
import { mountDrawingsRail, type DrawingsRail } from './drawingsRail'
import { applyPlotOverrides, buildManifestPlots, indicatorHidden, latestPlotValue, manifestInputDefaults, overriddenManifest } from './indicatorModel'
import { attachIndicators } from './indicatorRenderer'
import { coerceScaleMode, PRICE_SCALE_MODE, type ScaleMode } from './scaleMode'
import { createSessionBands, isIntradayTf, knownMarketKind, sessionOf, setHolidayCalendar, SESSION_DOT, type MaybeMarketKind, type SessionBandsPrimitive } from './sessions'
import { mountChartLegend, type ChartLegend, type LegendChip } from './chartLegend'
import { isCollapsed, planPaneOp } from './panePlan'
import { openInputsEditor } from './inputsEditor'
import { attachTradeLines, type TradeLineAttachment } from './tradeLines'
import { createOrderTicket, type OrderTicket } from './orderTicket'
import { openQtyPopover, openTypeMenu } from './ticketChrome'
import { mountAccountPanel, type AccountPanelHandle } from './accountPanel'
import { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from './replay'
import { mountReplayBar, type ReplayBarHandle } from './replayBar'
import { attachExecutionMarks, type ChartExecution, type ExecutionMarksHandle, type ExecutionScope } from './executionMarks'
import { decimalsOfTick } from './broker'

/** The drawing surface a host drives (a subset of the layer's handle: symbol/timeframe/tick flow
 *  and teardown stay widget-owned, so a host cannot desync the layer from the chart). */
export type ChartDrawingsApi = Omit<DrawingsHandle, 'setSymbol' | 'setTimeframe' | 'setTick' | 'destroy'>

/** The ticket surface a host drives (teardown stays widget-owned). */
export type ChartTicketApi = Omit<OrderTicket, 'destroy'>

/** The bar-replay surface: a cursor over the widget's OWN loaded bars — whole-bar updates, played
 *  at a chosen speed or stepped. While replay is on, live updates keep accumulating off-screen
 *  (Go live / exit catches up) and LIVE TRADING FROM THE CHART DISARMS: a money gesture priced
 *  off a historical view is a foot-gun, so the trade lines go display-only and the ticket refuses
 *  — the account panel stays live (its actions are table-explicit, not chart-price-coupled). A
 *  host that wants replay TRADING swaps in a replay TradingAdapter at the seam. */
export interface ChartReplayApi {
  /** Enter replay with the cursor at the bar at/after `atSec` (default: three quarters through
   *  the loaded window). No-op with fewer than 3 loaded bars. */
  start(atSec?: number): void
  exit(): void
  play(): void
  pause(): void
  stepForward(): void
  stepBack(): void
  setSpeed(speed: ReplaySpeed): void
  /** Jump the cursor to the live edge (playback pauses; replay stays on). */
  goLive(): void
  state(): { on: boolean; playing: boolean; cursor: number; total: number; speed: ReplaySpeed }
}

/** The execution-marks surface a host drives: push fills into a history, read/flip which one
 *  draws. Live and replay are ISOLATED histories — replay fills never paint in live mode and
 *  vice versa. The widget flips the scope itself on replay start/exit; `set` is how a host that
 *  runs replay TRADING pushes its session's fills, and how a non-trading host overlays any fill
 *  history it holds. */
export interface ChartExecutionsApi {
  set(scope: ExecutionScope, executions: readonly ChartExecution[]): void
  setScope(scope: ExecutionScope): void
  scope(): ExecutionScope
}

/** The running widget a host holds — change what's displayed, or tear it down. */
export interface ChartWidgetApi {
  symbol(): string
  timeframe(): string
  setSymbol(symbol: string): void
  setTimeframe(tf: string): void
  /** The price scale's mode (regular/log/percent/indexed). Persisted through ChartStorage. */
  scaleMode(): ScaleMode
  setScaleMode(mode: ScaleMode): void
  /** Replace the configured indicator list (removed ids tear down, panes sweep, the legend
   *  follows). The initial list comes from `ChartWidgetOptions.indicators`. */
  setIndicators(instances: IndicatorInstance[]): void
  /** The drawing layer, or null when the widget was created with `drawings: false`. */
  drawings: ChartDrawingsApi | null
  /** The order ticket, or null when no `trading` adapter was supplied OR its broker omits
   *  `placeOrder` (a mutation-only integration has no placement surface, by contract). */
  ticket: ChartTicketApi | null
  /** Bar replay over the loaded window. */
  replay: ChartReplayApi
  /** Execution marks, or null when the widget was created with `executionMarks: false`. */
  executions: ChartExecutionsApi | null
  /** Tear down the chart, the live subscription, and every DOM/timer resource. Idempotent. */
  remove(): void
}

/** A fully-resolved palette: every field concrete. Exported for tests. */
export interface ResolvedTheme {
  background: string
  gridColor: string
  textColor: string
  upColor: string
  downColor: string
  fontSize: number
}

/** Resolve theme overrides over the mode's defaults — a partial theme tints only what it names. */
export function resolveTheme(theme?: ChartTheme): ResolvedTheme {
  const dark = (theme?.mode ?? 'dark') === 'dark'
  return {
    background: theme?.background ?? (dark ? '#0f0f0f' : '#ffffff'),
    gridColor: theme?.gridColor ?? (dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'),
    textColor: theme?.textColor ?? (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.55)'),
    upColor: theme?.upColor ?? BRAND_UP,
    downColor: theme?.downColor ?? BRAND_DOWN,
    fontSize: theme?.fontSize ?? 13,
  }
}

/** Apply a live bar event to an ascending series: mutate the last bar (same bucket time), append (newer),
 *  or drop a stale update (older than the last bar — never splice history). Returns the new array only
 *  when something changed. Exported for tests. */
export function applyBar(bars: FeedBar[], bar: FeedBar): FeedBar[] | null {
  const last = bars[bars.length - 1]
  if (!last || bar.t > last.t) return [...bars, bar]
  if (bar.t === last.t) return [...bars.slice(0, -1), bar]
  return null
}

/** The initial-timeframe rule for a capability-declaring feed: the sticky/default tf when the feed
 *  declares nothing (or declares that tf), else the feed's FIRST declared resolution — the widget
 *  must never open with an ask the feed already said it can't serve. The sticky PREFERENCE is not
 *  overwritten: capability is the feed's property, preference is the viewer's, so a later feed that
 *  serves the preferred tf gets it back. Exported for tests. */
export function resolveInitialTf(sticky: string, declared: readonly string[] | undefined): string {
  if (!declared || declared.length === 0) return sticky
  return declared.includes(sticky) ? sticky : (declared[0] ?? sticky)
}

const SYMBOL_KEY = 'trdrs.chart.widget.symbol.v1'
const TF_KEY = 'trdrs.chart.widget.tf.v1'
const SCALE_KEY = 'trdrs.chart.widget.scale.v1'
const SNAPSHOT_BARS = 300
const PAGE_BARS = 500
/** How close to the left edge (in bars) the visible range must get before the next page is fetched. */
const PAGE_TRIGGER_BARS = 60

export function createChart(options: ChartWidgetOptions): ChartWidgetApi {
  const datafeed: ChartDatafeed = options.datafeed
  const storage: ChartStorage = options.storage ?? localStorageChartStorage
  const theme = resolveTheme(options.theme)
  const events = options.events ?? {}
  let indicatorInstances: IndicatorInstance[] = options.indicators ?? []

  let symbol = options.symbol ?? storage.get(SYMBOL_KEY) ?? ''
  let tf = options.timeframe ?? storage.get(TF_KEY) ?? '1m'
  let scaleMode: ScaleMode = coerceScaleMode(storage.get(SCALE_KEY))
  /** The resolved symbol's session model — null until resolve() states one. Null draws NOTHING
   *  (the bands primitive admits it), never a coerced stand-in class: an unknown symbol is not a
   *  24/7 claim any more than it is a CME one. */
  let sessionKind: MaybeMarketKind = null
  let legend: ChartLegend | null = null
  // The legend's per-chip eye state, persisted so a hide survives reloads. The widget merges it
  // with any host-supplied display.hidden so indicatorHidden stays the ONE render-or-not read.
  const HIDDEN_KEY = 'trdrs.chart.widget.indHidden.v1'
  const hiddenIndicators = new Set<string>(
    (() => {
      try {
        const parsed: unknown = JSON.parse(storage.get(HIDDEN_KEY) ?? '[]')
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
      } catch {
        return []
      }
    })(),
  )
  let removed = false
  let ready = false
  /** Live-trust for the mark the trade surface reads: true only while the feed reports 'live' —
   *  a stale last close must not price a P&L readout or anchor a protective-stop band. */
  let feedLive = false
  /** The resolved symbol's tick and the armed selection from the latest account snapshot — the
   *  two instrument/account truths the order ticket composes with. */
  let symbolTick: number | null = null
  let currentScope: string | null = null
  let currentLocked = false
  /** Replay: the MASTER bar set while replaying (null = replay off; `bars` is then the painted
   *  cursor slice). Live updates land here off-screen; Go live / exit catches the paint up. */
  let replayAll: FeedBar[] | null = null
  let replayCursor = 0
  let replayPlaying = false
  let replayTimer: ReturnType<typeof setInterval> | null = null
  const REPLAY_SPEED_KEY = 'trdrs.chart.widget.replaySpeed.v1'
  let replaySpeed: ReplaySpeed = (() => {
    const raw = Number(storage.get(REPLAY_SPEED_KEY))
    return (REPLAY_SPEEDS as readonly number[]).includes(raw) ? (raw as ReplaySpeed) : 10
  })()
  let replayBar: ReplayBarHandle | null = null
  /** Increments on every symbol/timeframe switch and on remove() — stale async work checks it and bails. */
  let epoch = 0

  // The widget owns its container's inner layout: a chart host (the chart + every overlay —
  // rail, legend, trade-line canvas, ticket editors) above an optional account panel. The
  // overlays MUST parent on the chart box, never the outer container: the trade-line overlay
  // canvas sizes to its parent, and a panel-tall parent would misalign every drawn control.
  const container = options.container
  const prevContainerStyle = { display: container.style.display, flexDirection: container.style.flexDirection }
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  const chartHost = document.createElement('div')
  chartHost.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;'
  container.appendChild(chartHost)
  // Two SIBLING boxes, and the split is load-bearing rather than cosmetic. The chart box belongs
  // to the gesture layers: the trade-line surface binds a CAPTURE-phase pointer handler there and
  // takes pointer capture to track drags, which no bubble-phase stopPropagation in a descendant
  // could ever prevent — so widget chrome mounted inside that box has its clicks swallowed (the
  // press retargets to the capturing element and the browser emits no click on the button). The
  // chrome box is therefore a SEPARATE subtree overlaying it: presses on the rail, the legend, or
  // a ticket editor never traverse the chart box at all. It is inert by default; each interactive
  // piece opts back in with pointer-events:auto, so the chart stays fully draggable underneath.
  const chartBox = document.createElement('div')
  chartBox.style.cssText = 'position:absolute;inset:0;'
  const chromeBox = document.createElement('div')
  chromeBox.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;'
  chartHost.append(chartBox, chromeBox)
  let panelHost: HTMLDivElement | null = null
  if (options.trading && options.accountPanel !== false) {
    panelHost = document.createElement('div')
    panelHost.style.cssText = `flex:0 0 ${typeof options.accountPanel === 'object' ? (options.accountPanel.height ?? 148) : 148}px;min-height:0;`
    container.appendChild(panelHost)
  }

  const chart: IChartApi = createLwChart(chartBox, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.textColor,
      // From the shared scale — canvas text is outside Tailwind and would otherwise drift alone.
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.gridColor },
      horzLines: { color: theme.gridColor },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 8, minBarSpacing: 0.5 },
  })
  const candles: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
    upColor: theme.upColor,
    downColor: theme.downColor,
    borderVisible: false,
    wickUpColor: theme.upColor,
    wickDownColor: theme.downColor,
  })
  const volume: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  })
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
  if (scaleMode !== 'normal') chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[scaleMode] })

  // Session bands (on unless the host opted out): non-regular-hours stretches shade under the
  // candles once resolve() states the symbol's session model. Intraday only, crypto never.
  let sessionBands: SessionBandsPrimitive | null = null
  if (options.sessions !== false) {
    sessionBands = createSessionBands(chart, candles, () => true, () => sessionKind, () => isIntradayTf(tf))
    candles.attachPrimitive(sessionBands as never)
  }

  // Execution marks (on unless the host opted out): grouped arrows on the bars where orders
  // filled, with the click card of the trades. The card mounts in the chrome overlay — the chart
  // box's capture-phase trade-line handler would swallow its clicks. Data arrives from the
  // trading adapter's executions() (refetchExecutions below) or a host push through the api.
  let execMarks: ExecutionMarksHandle | null = null
  if (options.executionMarks !== false) {
    const execLabels = options.executionMarks?.labels === true
    execMarks = attachExecutionMarks(chart, candles, chromeBox, {
      buyColor: () => theme.upColor,
      sellColor: () => theme.downColor,
      textColor: () => theme.textColor,
      labels: () => execLabels,
      precision: () => (symbolTick != null && symbolTick > 0 ? decimalsOfTick(symbolTick) : null),
    })
  }
  /** Refetch the LIVE scope's fills for the charted symbol (adapters that declare executions()
   *  only). Only the NEWEST in-flight read may land: a slow response issued before an account or
   *  symbol switch must never repopulate the cleared scope with the old identity's fills. Hoisted
   *  declarations on purpose: a config-less feed runs load() synchronously at mount, before any
   *  later const initializes. */
  let execFetchGen = 0
  function refetchExecutions(): void {
    const fetchExecutions = options.trading?.executions
    if (!execMarks || !fetchExecutions || !symbol) return
    const myGen = ++execFetchGen
    void fetchExecutions(symbol)
      .then((list) => {
        if (removed || myGen !== execFetchGen) return
        execMarks?.set('live', list)
      })
      .catch(() => {
        /* marks are advisory — a failed read keeps the cleared/previous set */
      })
  }

  /** The full ascending bar series currently painted (snapshot + prepended pages + live updates). */
  let bars: FeedBar[] = []
  let unsubscribe: (() => void) | null = null
  let noMoreHistory = false
  let paging = false

  // The drawing layer (on unless the host opted out). The rail wires to the layer's events
  // through a mutable events object: the layer needs the events at construction, the rail needs
  // the layer's handle — filling the object after both exist resolves the cycle without state.
  let drawingsHandle: DrawingsHandle | null = null
  let drawingsRail: DrawingsRail | null = null
  if (options.drawings !== false) {
    const drawingsEvents: DrawingsEvents = {}
    drawingsHandle = attachDrawings({
      chart,
      series: candles,
      container: chartBox,
      symbol,
      timeframe: tf,
      storage,
      storageKey: options.drawings?.storageKey,
      bars: () => bars,
      events: drawingsEvents,
    })
    if (options.drawings?.rail !== false) {
      drawingsRail = mountDrawingsRail(chromeBox, drawingsHandle, theme)
      drawingsEvents.onToolChange = drawingsRail.syncTool
      drawingsEvents.onSelectionChange = drawingsRail.syncSelection
    }
  }

  /** Remembered pane heights for the legend's collapse/maximize/restore (planPaneOp state). */
  let paneRemembered: Record<number, number> = {}
  /** ONE scale-mode application shared by the api and the legend chips. */
  const applyScaleMode = (next: ScaleMode): void => {
    if (removed || next === scaleMode) return
    scaleMode = next
    chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[next] })
    storage.set(SCALE_KEY, next)
    legend?.syncScale(next)
  }
  if (options.legend !== false) {
    legend = mountChartLegend(chromeBox, theme, {
      onToggleEye: (id) => {
        if (hiddenIndicators.has(id)) hiddenIndicators.delete(id)
        else hiddenIndicators.add(id)
        storage.set(HIDDEN_KEY, JSON.stringify([...hiddenIndicators]))
        recomputeIndicators()
      },
      onScaleMode: (mode) => applyScaleMode(mode),
      onSettings: (id, rect) => {
        const inst = indicatorInstances.find((i) => i.id === id)
        if (!inst) return
        const declared = inst.definition.manifest.inputs ?? {}
        openInputsEditor(chromeBox, rect, declared, { ...manifestInputDefaults(inst.definition.manifest), ...inst.inputs }, theme, (patch) => {
          indicatorInstances = indicatorInstances.map((i) => (i.id === id ? { ...i, inputs: { ...i.inputs, ...patch } } : i))
          recomputeIndicators()
        })
      },
      onPaneOp: (id, op) => {
        const paneIdx = indicatorsRenderer.paneOf()[id]
        if (paneIdx === undefined || paneIdx === 0) return
        const panes = chart.panes()
        const heights: Record<number, number> = {}
        panes.forEach((p, i) => (heights[i] = p.getHeight()))
        const plan = planPaneOp({ heights, remembered: paneRemembered }, { kind: op, pane: paneIdx })
        paneRemembered = plan.remembered
        for (const [i, h] of Object.entries(plan.apply)) panes[Number(i)]?.setHeight(h)
        recomputeIndicators() // the chip's collapsed state follows the new heights
      },
    })
    legend.setHeader(symbol, tf)
    legend.syncScale(scaleMode)
  }

  // The trading plane (mounted only when the host supplies an adapter): the package's trade-line
  // surface fed by the adapter's FULL account snapshots, actions through its ChartBroker, prices
  // gated by its policy. The widget contributes what it owns — the live-trusted mark, the resolved
  // tick, the charted symbol — and nothing else; the package still holds no trading state.
  let tradeLines: TradeLineAttachment | null = null
  let tradingUnsub: (() => void) | null = null
  let ticket: OrderTicket | null = null
  let accountPanel: AccountPanelHandle | null = null
  if (options.trading) {
    const adapter = options.trading
    // The mark is live-trusted AND not-replaying: a replayed close pricing a live P&L readout or
    // anchoring a protective band would be trading against history.
    const markNow = () => (feedLive && replayAll === null && bars.length ? bars[bars.length - 1]!.c : null)
    // The ticket exists ONLY when the broker can place (presence-driven, like every affordance):
    // without placeOrder the draft chrome never appears and the ticket api is null.
    if (adapter.broker.placeOrder) {
      ticket = createOrderTicket({
        broker: adapter.broker,
        instrument: () => symbol,
        tick: () => symbolTick,
        mark: markNow,
        scope: () => currentScope,
        locked: () => currentLocked || replayAll !== null,
        policy: adapter.policy,
        confirm: adapter.confirmOrder ? (order) => adapter.confirmOrder!(order) : undefined,
        onChange: (preview) => tradeLines?.update({ preview }),
        onAction: (text) => events.onTradingAction?.(text),
        onError: (msg) => events.onTradingError?.(msg),
      })
    }
    tradeLines = attachTradeLines({ chart, series: candles, container: chartBox }, adapter.broker, {
      symbol,
      snapshot: { positions: [], orders: [] },
      scope: null,
      mark: markNow,
      policy: adapter.policy,
      onAction: (text, undo) => events.onTradingAction?.(text, undo),
      onError: (msg) => events.onTradingError?.(msg),
      // The draft path routes to the ticket controller; the micro-editors are the package's own
      // chrome (pre-money: they only hand values back).
      ...(ticket
        ? {
            onPreviewEdit: (id: string, price: number) => ticket?.setPrice(price, id === 'ticket-limit' ? 'limit' : 'trigger'),
            onPreviewCancel: () => ticket?.close(),
            onDraftSubmit: () => void ticket?.submit(),
            onQtyEdit: (args: { qty: number; step: number; rect: { x: number; y: number; w: number; h: number } }) =>
              openQtyPopover(chromeBox, args.rect, args.qty, args.step, theme, (qty) => ticket?.setQty(qty)),
            onOrderTypeEdit: (args: { current: string; rect: { x: number; y: number; w: number; h: number } }) =>
              openTypeMenu(chromeBox, args.rect, args.current, theme, (orderType) => ticket?.setOrderType(orderType)),
          }
        : {}),
    })
    // The account panel: the SAME snapshot plane as the lines, the SAME broker seam for its
    // actions — one data plane, one write path, two views.
    if (panelHost) {
      accountPanel = mountAccountPanel(panelHost, adapter.broker, theme, {
        onAction: (text) => events.onTradingAction?.(text),
        onError: (msg) => events.onTradingError?.(msg),
      })
    }
    /** The last snapshot's position-quantity signature — the honest executions-refetch trigger:
     *  a fill is the only event that moves a quantity, while P&L churns with every price tick
     *  (refetching on the raw snapshot would hammer the backend once a second). */
    let lastFillSig: string | null = null
    /** The armed selection the current live fill set belongs to — fills are scoped to the account
     *  that made them, so a selection switch CLEARS before it refetches (a failed refetch must
     *  leave an empty chart, never another account's arrows). */
    let lastExecScope: string | null = null
    tradingUnsub = adapter.subscribeAccount({
      onSnapshot: (s) => {
        currentScope = s.scope
        currentLocked = s.locked === true
        accountPanel?.update(s)
        tradeLines?.update({
          snapshot: { positions: s.positions, orders: s.orders },
          scope: s.scope,
          currency: s.currency,
          pointValue: s.pointValue,
          // Replay folds into the lock: a historical view must not carry live money gestures.
          locked: s.locked === true || replayAll !== null,
          orderBrackets: s.orderBrackets,
          managedOrderIds: s.managedOrderIds,
        })
        const scopeChanged = s.scope !== lastExecScope
        if (scopeChanged) {
          lastExecScope = s.scope
          execMarks?.set('live', [])
        }
        const fillSig = s.positions.map((p) => `${p.instrument}:${p.qty}`).sort().join('|')
        if (scopeChanged || fillSig !== lastFillSig) {
          lastFillSig = fillSig
          refetchExecutions()
        }
      },
    })
    // Declared capabilities, read once (declare-only-truth): what presence can't express.
    void adapter
      .capabilities?.()
      .then((caps) => tradeLines?.update({ exits: caps.exits, orderBracketTypes: caps.orderBracketTypes }))
      .catch(() => {
        /* an undeclared capability set constrains nothing */
      })
  }

  // The indicator pipeline: instance → compute (host-supplied) → the shared manifest walker → the
  // shared renderer. Identical to what a richer host runs, so a definition renders the same
  // everywhere — panes, histograms, areas, markers, levels, band fills, volume-scale plots.
  const indicatorsRenderer = attachIndicators(chart, { candles: () => candles })

  /** Recompute every configured instance over the current bars and refresh the legend chips. A
   *  compute that throws is skipped this round rather than sinking the chart; a hidden instance
   *  renders nothing (its series come down) but keeps its chip, so the eye can bring it back. */
  function recomputeIndicators(): void {
    lastIndicatorRecompute = Date.now() // every direct (structural) run resets the tick cap
    const chips: LegendChip[] = []
    const times = bars.map((b) => b.t as UTCTimestamp)
    const hasVolume = bars.some((b) => b.v > 0)
    // A blanked buffer (mid symbol/timeframe switch): clear plot data without teardown, or the
    // previous window's lines paint stale garbage over the empty chart.
    if (bars.length === 0 && indicatorInstances.length > 0) indicatorsRenderer.blank()
    const paneOfMap = indicatorsRenderer.paneOf()
    const paneHeights = chart.panes().map((p) => p.getHeight())
    for (const inst of indicatorInstances) {
      const def = inst.definition
      const title = inst.title ?? def.manifest.name ?? inst.id
      const placement = def.manifest.pane === 'pane' ? ('pane' as const) : ('overlay' as const)
      const paneIdx = placement === 'pane' ? paneOfMap[inst.id] : undefined
      const chipBase = {
        id: inst.id,
        title,
        hasInputs: Object.keys(def.manifest.inputs ?? {}).length > 0,
        pane: placement === 'pane',
        collapsed: paneIdx !== undefined && paneIdx > 0 ? isCollapsed(paneHeights[paneIdx]) : false,
      }
      const hidden = hiddenIndicators.has(inst.id) || indicatorHidden(inst.overrides)
      if (hidden) {
        indicatorsRenderer.remove(inst.id)
        chips.push({ ...chipBase, value: null, hidden: true })
        continue
      }
      if (bars.length === 0) {
        chips.push({ ...chipBase, value: null, hidden: false })
        continue
      }
      // Honest gate: a volume-based definition on a feed that carries no volume draws nothing
      // (an all-zero flat line would be a lie), and the unavailable note says why.
      if (def.manifest.needsVolume && !hasVolume) {
        indicatorsRenderer.render(inst.id, { placement, title, plots: [], unavailable: 'No volume from this feed' })
        chips.push({ ...chipBase, value: null, note: 'No volume from this feed', hidden: false })
        continue
      }
      let channels: Readonly<Record<string, readonly (number | null)[]>>
      try {
        channels = def.compute(bars, { ...manifestInputDefaults(def.manifest), ...(inst.inputs ?? {}) })
      } catch {
        chips.push({ ...chipBase, value: null, hidden: false })
        continue
      }
      const manifest = overriddenManifest(def.manifest, inst.overrides)
      const built = applyPlotOverrides(buildManifestPlots({ manifest, plots: channels }, times, title, inst.color ?? theme.upColor), inst.overrides)
      indicatorsRenderer.render(inst.id, built)
      const value = latestPlotValue(built.plots[0]?.data)
      chips.push({ ...chipBase, value: value == null ? null : value.toFixed(built.precision ?? 2), hidden: false })
    }
    legend?.setChips(chips)
    legend?.setDot(sessionKind ? SESSION_DOT[sessionOf(Date.now(), sessionKind)] : null)
    // Pane heights settle a frame AFTER a pane is created/resized — a chip built in the same
    // frame can misread a fresh pane as collapsed. Converge on layout truth: re-check next frame
    // and re-render the chips only if a collapsed reading actually changed.
    if (chips.some((c) => c.pane) && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (removed) return
        const freshPaneOf = indicatorsRenderer.paneOf()
        const freshHeights = chart.panes().map((p) => p.getHeight())
        let changed = false
        for (const c of chips) {
          if (!c.pane) continue
          const idx = freshPaneOf[c.id]
          const collapsed = idx !== undefined && idx > 0 ? isCollapsed(freshHeights[idx]) : false
          if (collapsed !== c.collapsed) {
            c.collapsed = collapsed
            changed = true
          }
        }
        if (changed) legend?.setChips(chips)
      })
    }
  }

  function paintAll(): void {
    candles.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c })))
    volume.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? theme.upColor : theme.downColor })))
    recomputeIndicators()
  }

  // Live ticks arrive many times a second, and a full indicator recompute per tick multiplies by
  // every configured instance — the classic cost cliff. Structural paints (paintAll) recompute
  // immediately; the MID-BAR tick path is capped at ~1/s: the trailing timer guarantees the final
  // tick of a burst still lands, so the legend value is never stale for more than the cap.
  const INDICATOR_TICK_MS = 1000
  let lastIndicatorRecompute = 0
  let indicatorTrailer: ReturnType<typeof setTimeout> | null = null
  function recomputeIndicatorsThrottled(): void {
    const since = Date.now() - lastIndicatorRecompute
    if (since >= INDICATOR_TICK_MS) {
      recomputeIndicators()
      return
    }
    if (indicatorTrailer) return // a trailing run is already scheduled — this burst is covered
    indicatorTrailer = setTimeout(() => {
      indicatorTrailer = null
      if (!removed) recomputeIndicators()
    }, INDICATOR_TICK_MS - since)
  }

  function paintLast(b: FeedBar): void {
    candles.update({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c })
    volume.update({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? theme.upColor : theme.downColor })
    recomputeIndicatorsThrottled()
  }

  /** One older-history fetch with the gap hop (olderPageVerdict's rule): an empty page carrying
   *  nextTime re-asks once anchored there; only the `end` verdict is the true end of history. */
  async function fetchOlder(to: number): Promise<{ olderBars: FeedBar[]; end: boolean }> {
    const page = await datafeed.history(symbol, tf, { to, countBack: PAGE_BARS })
    const verdict = olderPageVerdict(page, to, false)
    if (verdict.kind !== 'hop') return { olderBars: page.bars, end: verdict.kind === 'end' }
    const hop = await datafeed.history(symbol, tf, { to: verdict.to, countBack: PAGE_BARS })
    return { olderBars: hop.bars, end: olderPageVerdict(hop, verdict.to, true).kind === 'end' }
  }

  /** Fetch the page of bars older than the current left edge; prepend while HOLDING the visible window
   *  in place (the standard scroll-back experience). Stops for good at the feed's true end of history. */
  function maybePageBack(): void {
    if (replayAll !== null) return // the replay window is fixed; paging would desync the master set
    if (paging || noMoreHistory || bars.length === 0) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range || range.from > PAGE_TRIGGER_BARS) return
    paging = true
    const myEpoch = epoch
    const oldest = bars[0]!.t
    void fetchOlder(oldest - 1)
      .then(({ olderBars, end }) => {
        if (removed || myEpoch !== epoch) return
        if (end) noMoreHistory = true
        const older = olderBars.filter((b) => b.t < oldest)
        if (older.length === 0) return
        const keep = chart.timeScale().getVisibleRange()
        bars = [...older, ...bars]
        paintAll()
        if (keep) chart.timeScale().setVisibleRange(keep)
      })
      .catch(() => {
        /* transient — the next left-edge approach retries */
      })
      .finally(() => {
        paging = false
      })
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(maybePageBack)

  /** (Re)load the active (symbol, timeframe): initial history paints first, then the live subscription's
   *  snapshot replaces it and bar events mutate/append. A FeedUnavailableError is terminal for this
   *  symbol (status surfaces to the host); any other history failure leaves the subscription to seed the
   *  chart through its own snapshot. */
  function load(): void {
    const myEpoch = ++epoch
    unsubscribe?.()
    unsubscribe = null
    bars = []
    noMoreHistory = false
    feedLive = false // the new subscription reports its own liveness; a stale mark must not carry over
    sessionKind = null // the next resolve states the new symbol's model; unresolved never bands
    sessionBands?.refresh() // the old symbol's bands must not survive the switch
    symbolTick = null
    ticket?.close() // a draft composed against the old symbol must not survive onto the new one
    abandonReplay() // a replay window is symbol+timeframe-bound; the switch invalidates it
    // Both fill histories clear: grouping is by containing bar, so the old symbol's fills would
    // otherwise land on the new symbol's bars as if money moved there.
    execMarks?.set('live', [])
    execMarks?.set('replay', [])
    drawingsHandle?.setTick(null)
    paintAll()
    if (!symbol) return
    refetchExecutions()
    // Symbol metadata rides ALONGSIDE the first history ask (never blocking it): tick size feeds
    // the drawing readouts, sessionClass feeds the session bands. A failed resolve leaves both at
    // their honest unknowns.
    void datafeed
      .resolve(symbol)
      .then((info) => {
        if (removed || myEpoch !== epoch || !info) return
        symbolTick = info.tick
        drawingsHandle?.setTick(info.tick)
        tradeLines?.update({ tick: info.tick ?? undefined })
        sessionKind = knownMarketKind(info.type, info.sessionClass ?? null)
        if (info.sessionCalendar && sessionKind) setHolidayCalendar(sessionKind, info.sessionCalendar)
        sessionBands?.refresh() // nothing else invalidates the pane when the model resolves
        legend?.setDot(sessionKind ? SESSION_DOT[sessionOf(Date.now(), sessionKind)] : null)
      })
      .catch(() => {
        /* metadata is an enhancement — the chart works without it */
      })
    void datafeed
      .history(symbol, tf, { countBack: SNAPSHOT_BARS })
      .then((page) => {
        if (removed || myEpoch !== epoch) return
        bars = [...page.bars]
        paintAll()
        chart.timeScale().fitContent()
        if (!ready) {
          ready = true
          events.onReady?.()
        }
      })
      .catch((e) => {
        if (removed || myEpoch !== epoch) return
        if (e instanceof FeedUnavailableError) {
          events.onFeedStatus?.('feed_unavailable')
          return // terminal — don't open a live subscription for a symbol nothing serves
        }
        // Transient history failure: fall through, the subscription snapshot below still seeds the chart.
        openSubscription(myEpoch)
      })
      .then(() => {
        if (!removed && myEpoch === epoch && unsubscribe === null) openSubscription(myEpoch)
      })
  }

  function openSubscription(myEpoch: number): void {
    if (removed || myEpoch !== epoch) return
    unsubscribe = datafeed.subscribeBars(symbol, tf, {
      onBars: (e) => {
        if (removed || myEpoch !== epoch) return
        // While replaying, live updates land in the MASTER set off-screen — the painted slice
        // stays put; Go live / exit catches up. Nothing is dropped, nothing repaints history.
        if (replayAll !== null) {
          if (e.kind === 'snapshot') {
            const first = e.bars[0]?.t
            replayAll = first === undefined ? [...e.bars] : [...replayAll.filter((b) => b.t < first), ...e.bars]
          } else {
            const next = applyBar(replayAll, e.bar)
            if (next) replayAll = next
          }
          replaySync()
          return
        }
        if (e.kind === 'snapshot') {
          // The transport's self-healing re-sync: the snapshot replaces the RECENT window; bars we paged
          // in further back stay (they're older than the snapshot's first bar).
          const first = e.bars[0]?.t
          bars = first === undefined ? [...e.bars] : [...bars.filter((b) => b.t < first), ...e.bars]
          paintAll()
        } else {
          const next = applyBar(bars, e.bar)
          if (next) {
            bars = next
            paintLast(e.bar)
          }
        }
      },
      onStatus: (status) => {
        if (removed || myEpoch !== epoch) return
        feedLive = status === 'live'
        events.onFeedStatus?.(status)
      },
    })
  }

  // The initial load waits on the feed's OPTIONAL capability declaration: opening with a sticky tf the
  // feed already declared unservable would dead-end the first paint on a refusal. A declaring feed
  // resolves the initial tf first (a failed/empty declaration constrains nothing); a feed without
  // config() starts immediately — exactly today's behavior. epoch 0 = "no host-driven load happened
  // yet": a setSymbol/setTimeframe that beats a slow config() is the host's explicit choice and wins.
  if (datafeed.config) {
    void datafeed
      .config()
      .catch((): DatafeedConfig => ({}))
      .then((cfg) => {
        if (removed || epoch !== 0) return
        tf = resolveInitialTf(tf, cfg.resolutions)
        drawingsHandle?.setTimeframe(tf)
        load()
      })
  } else {
    load()
  }

  // ── Bar replay: a cursor over the widget's OWN loaded bars. `bars` becomes the painted slice
  // while `replayAll` holds the master set; every consumer of `bars` (indicators, legend values,
  // session bands, the drawings' bar source) rides the replayed view for free. ──
  // Sub-bar FORMING: with an update interval finer than the chart's timeframe, the current bar
  // forms progressively from REAL finer bars fetched over the parent's window through the SAME
  // datafeed seam as every other read — never synthesized ticks. 'Auto' picks the largest
  // sub-interval giving at least four updates per bar; a fetch the feed can't answer falls back
  // to a whole-bar advance, gracefully.
  const REPLAY_AUTO_KEY = 'trdrs.chart.widget.replayAutoIv.v1'
  let replayAutoInterval = storage.get(REPLAY_AUTO_KEY) !== '0'
  let replayManualInterval: string | null = null
  let replaySubs: FeedBar[] | null = null
  let replayFormK = 0
  let replayStepping = false
  const replayEffectiveInterval = (): { tf: string; sec: number } | null => {
    if (replayAutoInterval) return autoIntervalFor(tf)
    return subIntervalsFor(tf).find((s) => s.tf === replayManualInterval) ?? null
  }

  const replaySync = () =>
    replayBar?.sync({
      playing: replayPlaying,
      cursor: replayCursor,
      total: replayAll?.length ?? 0,
      speed: replaySpeed,
      interval: replayAutoInterval ? 'auto' : (replayManualInterval ?? 'auto'),
    })
  const replayPaint = () => {
    if (!replayAll) return
    bars = replayAll.slice(0, replayCursor)
    paintAll()
    chart.timeScale().scrollToRealTime() // keep the forming edge in view as the cursor advances
  }
  /** Repaint with the cursor's LAST bar partially formed from its played sub-bars. */
  const replayPaintForming = () => {
    if (!replayAll || !replaySubs) return
    const parent = replayAll[replayCursor - 1]!
    bars = [...replayAll.slice(0, replayCursor - 1), composeFormingBar(parent, replaySubs, replayFormK)]
    paintAll()
    chart.timeScale().scrollToRealTime()
  }
  const stopReplayTimer = () => {
    if (replayTimer) {
      clearInterval(replayTimer)
      replayTimer = null
    }
  }
  /** Re-push the effective lock so the trade lines disarm/re-arm the moment replay flips. */
  const replayLockRefresh = () => tradeLines?.update({ locked: currentLocked || replayAll !== null })
  const replayPause = () => {
    replayPlaying = false
    stopReplayTimer()
    replaySync()
  }
  /** The forming parent's sub-bars over its window, or null when the feed can't provide at least
   *  two (one sub-bar has no forming value) — the caller then advances whole-bar. */
  const fetchReplaySubs = async (parentIdx: number): Promise<FeedBar[] | null> => {
    const interval = replayEffectiveInterval()
    if (!replayAll || !interval) return null
    const parent = replayAll[parentIdx]
    if (!parent) return null
    const from = parent.t
    const to = parent.t + tfSeconds(tf) - 1
    try {
      const page = await datafeed.history(symbol, interval.tf, { from, to })
      const subs = page.bars.filter((b) => b.t >= from && b.t <= to)
      return subs.length >= 2 ? subs : null
    } catch {
      return null
    }
  }
  /** One replay UPDATE: the next sub-step of a forming bar, or the next whole bar (starting its
   *  forming when the interval and the feed allow). Async because forming fetches; re-entrancy
   *  guarded so a fast timer never double-advances over one fetch. */
  const replayStepForward = (): void => {
    void (async () => {
      if (!replayAll || replayStepping) return
      replayStepping = true
      try {
        if (replaySubs && replayFormK < replaySubs.length) {
          replayFormK += 1
          replayPaintForming()
          if (replayFormK >= replaySubs.length) {
            replaySubs = null // the parent sealed exactly (composeFormingBar returned it verbatim)
            replayFormK = 0
          }
          replaySync()
          return
        }
        if (replayCursor >= replayAll.length) {
          replayPause() // the live edge: playback stops, replay stays on
          return
        }
        replayCursor += 1
        const subs = await fetchReplaySubs(replayCursor - 1)
        if (subs && replayAll) {
          replaySubs = subs
          replayFormK = 1
          replayPaintForming()
        } else {
          replayPaint()
        }
        replaySync()
      } finally {
        replayStepping = false
      }
    })()
  }
  /** Tear replay state down WITHOUT repainting — load() blanks and repaints on its own. A hoisted
   *  declaration on purpose: a config-less feed runs load() synchronously at mount, before the
   *  replay consts around here initialize — the early return below is all that executes then. */
  function abandonReplay(): void {
    if (!replayAll) return
    stopReplayTimer()
    replayPlaying = false
    replayAll = null
    replaySubs = null
    replayFormK = 0
    replayBar?.destroy()
    replayBar = null
    replayLockRefresh()
    execMarks?.setScope('live') // the replay history stays held, but only live fills may draw now
  }
  const replayApi: ChartReplayApi = {
    start(atSec) {
      if (removed || replayAll !== null || bars.length < 3) return
      replayAll = bars
      const at = atSec ?? replayAll[Math.floor(replayAll.length * 0.75)]!.t
      const idx = replayAll.findIndex((b) => b.t >= at)
      replayCursor = Math.max(2, (idx === -1 ? replayAll.length - 1 : idx) + 1)
      replayBar = mountReplayBar(
        chromeBox,
        {
          play: () => replayApi.play(),
          pause: () => replayApi.pause(),
          stepForward: () => replayApi.stepForward(),
          stepBack: () => replayApi.stepBack(),
          setSpeed: (s) => replayApi.setSpeed(s),
          setInterval: (token) => {
            if (token === 'auto') replayAutoInterval = true
            else {
              replayAutoInterval = false
              replayManualInterval = token
            }
            storage.set(REPLAY_AUTO_KEY, replayAutoInterval ? '1' : '0')
            replaySubs = null // the next update re-fetches at the new grain
            replayFormK = 0
            replaySync()
          },
          goLive: () => replayApi.goLive(),
          exit: () => replayApi.exit(),
        },
        theme,
        subIntervalsFor(tf).map((s) => s.tf),
      )
      legend?.setHeader(symbol, `${tf} · replay`)
      replayLockRefresh()
      // Replay is a SEPARATE fill timeline: live marks hide for the whole session; whatever the
      // host pushes into the 'replay' scope (a replay-trading sim's fills) draws instead.
      execMarks?.setScope('replay')
      replayPaint()
      replaySync()
    },
    exit() {
      if (!replayAll) return
      const master = replayAll
      abandonReplay()
      bars = master // the live edge, with everything that accumulated off-screen
      paintAll()
      legend?.setHeader(symbol, tf)
    },
    play() {
      if (!replayAll || replayPlaying) return
      replayPlaying = true
      replayTimer = setInterval(replayStepForward, 1000 / replaySpeed)
      replaySync()
    },
    pause: () => replayPause(),
    stepForward: () => replayStepForward(),
    stepBack() {
      if (!replayAll || replayCursor <= 2) return
      replayPause() // retreating while playing is a scrub, not playback
      if (replaySubs) {
        // A forming bar rewinds to its sealed boundary first: the partial disappears and the
        // view ends on the last fully-sealed bar.
        replaySubs = null
        replayFormK = 0
      }
      replayCursor -= 1
      replayPaint()
      replaySync()
    },
    setSpeed(speed) {
      if (!(REPLAY_SPEEDS as readonly number[]).includes(speed)) return
      replaySpeed = speed
      storage.set(REPLAY_SPEED_KEY, String(speed))
      if (replayPlaying) {
        stopReplayTimer()
        replayTimer = setInterval(replayStepForward, 1000 / replaySpeed)
      }
      replaySync()
    },
    goLive() {
      if (!replayAll) return
      replayPause()
      replaySubs = null
      replayFormK = 0
      replayCursor = replayAll.length
      replayPaint()
      replaySync()
    },
    state: () => ({ on: replayAll !== null, playing: replayPlaying, cursor: replayCursor, total: replayAll?.length ?? bars.length, speed: replaySpeed }),
  }

  // The public drawings surface is a REAL subset (not a type-level narrowing of the full handle):
  // symbol/timeframe flow and teardown stay widget-owned, and an untyped consumer must not find
  // them either.
  const dh = drawingsHandle
  const drawingsApi: ChartDrawingsApi | null = dh
    ? {
        armTool: (type) => dh.armTool(type),
        activeTool: () => dh.activeTool(),
        hasSelection: () => dh.hasSelection(),
        deleteSelected: () => dh.deleteSelected(),
        clearAll: () => dh.clearAll(),
        count: () => dh.count(),
        export: () => dh.export(),
        restore: (list) => dh.restore(list),
      }
    : null

  // The public ticket surface is a REAL subset (the drawings-api discipline): teardown stays
  // widget-owned, and an untyped consumer must not find it either.
  const tk = ticket
  const ticketApi: ChartTicketApi | null = tk
    ? {
        open: (seed) => tk.open(seed),
        close: () => tk.close(),
        state: () => tk.state(),
        setSide: (side) => tk.setSide(side),
        setQty: (qty) => tk.setQty(qty),
        setOrderType: (orderType) => tk.setOrderType(orderType),
        setPrice: (price, leg) => tk.setPrice(price, leg),
        submit: () => tk.submit(),
      }
    : null

  // The public executions surface is a REAL subset (the drawings-api discipline): teardown stays
  // widget-owned, and an untyped consumer must not find it either.
  const em = execMarks
  const executionsApi: ChartExecutionsApi | null = em
    ? {
        set: (scope, executions) => em.set(scope, executions),
        setScope: (scope) => em.setScope(scope),
        scope: () => em.scope(),
      }
    : null

  return {
    symbol: () => symbol,
    timeframe: () => tf,
    setSymbol(next: string) {
      if (removed || next === symbol) return
      symbol = next
      storage.set(SYMBOL_KEY, next)
      drawingsHandle?.setSymbol(next)
      tradeLines?.update({ symbol: next })
      legend?.setHeader(symbol, tf)
      events.onSymbolChange?.(next)
      load()
    },
    setTimeframe(next: string) {
      if (removed || next === tf) return
      tf = next
      storage.set(TF_KEY, next)
      drawingsHandle?.setTimeframe(next)
      legend?.setHeader(symbol, tf)
      events.onTimeframeChange?.(next)
      load()
    },
    setIndicators(next: IndicatorInstance[]) {
      if (removed) return
      indicatorInstances = [...next]
      indicatorsRenderer.prune(new Set(next.map((i) => i.id)))
      recomputeIndicators()
    },
    scaleMode: () => scaleMode,
    setScaleMode: (next: ScaleMode) => applyScaleMode(next),
    drawings: drawingsApi,
    ticket: ticketApi,
    replay: replayApi,
    executions: executionsApi,
    remove() {
      if (removed) return
      removed = true
      epoch++
      unsubscribe?.()
      unsubscribe = null
      abandonReplay()
      if (indicatorTrailer) clearTimeout(indicatorTrailer)
      ticket?.destroy()
      tradingUnsub?.()
      accountPanel?.destroy()
      execMarks?.destroy()
      tradeLines?.detach()
      drawingsRail?.destroy()
      drawingsHandle?.destroy()
      legend?.destroy()
      indicatorsRenderer.destroy()
      chart.remove()
      // Leave the host element exactly as found: our wrapper rows go, its layout styles restore.
      chartHost.remove()
      panelHost?.remove()
      container.style.display = prevContainerStyle.display
      container.style.flexDirection = prevContainerStyle.flexDirection
    },
  }
}
