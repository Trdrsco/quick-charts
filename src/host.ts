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
import { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, layerOverrides, type ChartOverrides, type PartialOverrides } from './overrides'
import { storageSaveLoadAdapter, type ChartSaveLoadAdapter } from './saveLoad'
import { attachDrawings, type DrawingsEvents, type DrawingsHandle } from './drawings'
import { mountDrawingsRail, type DrawingsRail } from './drawingsRail'
import { applyPlotOverrides, buildManifestPlots, indicatorHidden, latestPlotValue, manifestInputDefaults, overriddenManifest } from './indicatorModel'
import { attachIndicators } from './indicatorRenderer'
import { coerceScaleMode, PRICE_SCALE_MODE, type ScaleMode } from './scaleMode'
import { attachCompare, type CompareEntry, type ComparePlacement, type CompareSymbol } from './compare'
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
import { mountContextMenu, type ContextMenuHandle } from './contextMenuUi'
import { attachExecutionMarks, type ChartExecution, type ExecutionMarksHandle, type ExecutionScope } from './executionMarks'
import { decimalsOfTick } from './broker'
import { localeInfo, type LanguageCode } from '@trdrs/i18n'
import { createChartI18n } from './i18n'

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

/** The save/load surface a host drives: the active adapter (the default storage-backed one, or
 *  whatever the host plugged in) plus the widget's own content (de)serialization — the two halves
 *  a "saved charts" UI composes: `serialize()` + `adapter.saveChart()` to save,
 *  `adapter.loadChart()` + `restore()` to load. */
export interface ChartSaveLoadApi {
  adapter: ChartSaveLoadAdapter
  /** Snapshot the widget's state as a name-less save: symbol/timeframe for the listing row, and
   *  the opaque, versioned content blob (symbol, timeframe, scale, hidden indicators, and the
   *  effective appearance — a loaded chart restores its LOOK, TradingView's layout behavior). */
  serialize(): { symbol: string; timeframe: string; content: string }
  /** Apply a saved chart's content blob. Throws on an unrecognized content version — content is
   *  opaque to every backend, so the reader is the only place an upgrade path can live. */
  restore(content: string): void
}

/** Pane-composition primitives — the raw mirrors a multi-chart layout host syncs panes with.
 *  Subscriptions report USER-driven changes only: a pane being driven through the setters never
 *  re-reports the change, so two mirrored panes cannot echo each other into a feedback loop.
 *  Times are the feed's unix seconds. */
export interface ChartPaneSyncApi {
  /** The crosshair moved (null = left the chart). */
  onCrosshair(cb: (time: number | null) => void): () => void
  /** Mirror another pane's crosshair by TIME — anchored at this pane's own bar for that moment
   *  (nearest earlier bar when feeds tick on different clocks); null or no bar clears it. */
  setCrosshair(time: number | null): void
  /** The chart was clicked at a moment in time. */
  onTimeClick(cb: (time: number) => void): () => void
  /** Center the visible range on a moment, keeping the current span. */
  centerOn(time: number): void
  /** The visible time range changed (pan, zoom, scroll-back). */
  onVisibleRange(cb: (range: { from: number; to: number }) => void): () => void
  setVisibleRange(range: { from: number; to: number }): void
  /** The current visible time range (null before first data). */
  visibleRange(): { from: number; to: number } | null
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
  /** COMPARE — other symbols beside the charted one (corpus: docs/corpus/chart-compare/). The
   *  placement vocabulary is the reference dialog's own: 'same-percent' shares the main scale and
   *  flips it to percent while any such compare lives; 'new-scale' binds the LEFT scale;
   *  'new-pane' takes a pane of its own. Compares persist in the content blob beside the rest of
   *  the chart's state. */
  compare: ChartCompareApi
  /** The EFFECTIVE override tree: theme floor, then the constructor partial, then every runtime
   *  applyOverrides layer — the resolved look every surface reads. */
  overrides(): ChartOverrides
  /** Apply a partial at RUNTIME — the top of the precedence ladder; restyles the live chart
   *  without a re-mount. Later calls layer over earlier ones leaf by leaf. */
  applyOverrides(partial: PartialOverrides): void
  /** Save/load: the adapter plus the widget's content (de)serialization. */
  saveLoad: ChartSaveLoadApi
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
  /** Pane-composition sync primitives (crosshair / time-click / visible range). */
  sync: ChartPaneSyncApi
  /** Execution marks, or null when the widget was created with `executionMarks: false`. */
  executions: ChartExecutionsApi | null
  /** The interface language the widget is showing. */
  locale(): LanguageCode
  /** Switch the interface language at runtime: the chrome re-labels as the translation lands, and
   *  the axis and crosshair formatting follow at once. */
  setLocale(code: LanguageCode): void
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

/** The widget's compare surface — the organ's handle plus the widget-owned scale policy. */
export interface ChartCompareApi {
  add(symbol: string, opts: { placement: ComparePlacement }): void
  remove(symbol: string): void
  setVisible(symbol: string, visible: boolean): void
  list(): CompareEntry[]
  /** Latest in-window close for one compare, or null. */
  latest(symbol: string): number | null
  /** The host-supplied curated quick-add list, for the compare dialog. */
  symbols(): CompareSymbol[]
}

export function createChart(options: ChartWidgetOptions): ChartWidgetApi {
  const datafeed: ChartDatafeed = options.datafeed
  const events = options.events ?? {}
  let removed = false
  // The save/load adapter — the host's, or the default layering the same entities on the plain
  // KV (options.storage, else localStorage), so an adapter-less widget behaves exactly as before.
  const saveLoad: ChartSaveLoadAdapter = options.saveLoad ?? storageSaveLoadAdapter(options.storage ?? localStorageChartStorage)
  // Every widget key flows through the adapter's settings store, wrapped so each state-dirtying
  // write funnels ONE debounced onSaveNeeded (~1s, TradingView's auto-save shape) — no per-site
  // wiring, and a drawing drag emits once rather than per frame.
  let saveNeededTimer: ReturnType<typeof setTimeout> | null = null
  const pingSaveNeeded = (): void => {
    if (!events.onSaveNeeded || removed) return
    if (saveNeededTimer) clearTimeout(saveNeededTimer)
    saveNeededTimer = setTimeout(() => {
      saveNeededTimer = null
      if (!removed) events.onSaveNeeded?.()
    }, 1_000)
  }
  const storage: ChartStorage = {
    get: (key) => saveLoad.settings.get(key),
    set: (key, value) => {
      saveLoad.settings.set(key, value)
      pingSaveNeeded()
    },
    remove: (key) => {
      saveLoad.settings.remove(key)
      pingSaveNeeded()
    },
    keys: () => saveLoad.settings.keys(),
  }
  const theme = resolveTheme(options.theme)
  // The override LADDER. Floor: the resolved theme lifted into the full tree (candle bodies and
  // wicks take the theme pair; borders stay INVISIBLE until some layer names a border color —
  // the widget never drew borders, and a floor that silently switched them on would repaint every
  // existing embed). Above it: the host's constructor partial, then runtime applyOverrides layers.
  const themeFloor: ChartOverrides = layerOverrides(DEFAULT_OVERRIDES, {
    appearance: {
      background: theme.background,
      upColor: theme.upColor,
      downColor: theme.downColor,
      borderUpColor: theme.upColor,
      borderDownColor: theme.downColor,
      wickUpColor: theme.upColor,
      wickDownColor: theme.downColor,
    },
  })
  let runtimePartial: PartialOverrides = {}
  let eff: ChartOverrides = layerOverrides(themeFloor, options.overrides, runtimePartial)
  /** True when a HOST-STATED layer (constructor or runtime) names the leaf — the explicitness
   *  signal for looks that only engage once someone asks: candle borders, and the trading colors
   *  whose per-surface defaults otherwise stay theme-derived. */
  const overrideNamed = (section: 'appearance' | 'trading', leaf: string): boolean =>
    [options.overrides, runtimePartial].some((p) => {
      const sec = p?.[section] as Record<string, unknown> | undefined
      return !!sec && leaf in sec
    })
  const candleBordersOn = (): boolean => overrideNamed('appearance', 'borderUpColor') || overrideNamed('appearance', 'borderDownColor')
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

  // Every string the chrome shows comes through here, in the host's language; the tag also drives
  // the library's own axis and crosshair formatting, so a canvas label and a menu row never disagree
  // about what language the screen is in.
  const i18n = createChartI18n(options.locale)

  const chart: IChartApi = createLwChart(chartBox, {
    autoSize: true,
    localization: { locale: i18n.tag() },
    layout: {
      // The look reads the resolved override ladder (`eff`), never the theme directly — with no
      // host layers the two are identical, so an override-less widget renders exactly as before.
      background: { type: ColorType.Solid, color: eff.appearance.background },
      textColor: theme.textColor,
      // From the shared scale — canvas text is outside Tailwind and would otherwise drift alone.
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.gridColor, visible: eff.appearance.grid },
      horzLines: { color: theme.gridColor, visible: eff.appearance.grid },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 8, minBarSpacing: 0.5 },
  })
  const candles: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
    upColor: eff.appearance.upColor,
    downColor: eff.appearance.downColor,
    borderVisible: candleBordersOn(),
    borderUpColor: eff.appearance.borderUpColor,
    borderDownColor: eff.appearance.borderDownColor,
    wickUpColor: eff.appearance.wickUpColor,
    wickDownColor: eff.appearance.wickDownColor,
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
    // The enabled getter reads the ladder live, so `appearance.sessions: false` (constructor or
    // runtime) blanks the shading without tearing the layer down.
    sessionBands = createSessionBands(chart, candles, () => eff.appearance.sessions, () => sessionKind, () => isIntradayTf(tf))
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
      // Theme-derived until a host layer NAMES the trading color — the arrows' default follows
      // the candles (as it always has), while a stated trading.buyColor/sellColor wins.
      buyColor: () => (overrideNamed('trading', 'buyColor') ? eff.trading.buyColor : theme.upColor),
      sellColor: () => (overrideNamed('trading', 'sellColor') ? eff.trading.sellColor : theme.downColor),
      textColor: () => theme.textColor,
      labels: () => execLabels || eff.trading.executionLabels,
      precision: () => (symbolTick != null && symbolTick > 0 ? decimalsOfTick(symbolTick) : null),
      strings: i18n,
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
      drawingsRail = mountDrawingsRail(chromeBox, drawingsHandle, theme, i18n)
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
    legend = mountChartLegend(chromeBox, theme, i18n, {
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
        openInputsEditor(
          chromeBox,
          rect,
          declared,
          { ...manifestInputDefaults(inst.definition.manifest), ...inst.inputs },
          theme,
          (patch) => {
            indicatorInstances = indicatorInstances.map((i) => (i.id === id ? { ...i, inputs: { ...i.inputs, ...patch } } : i))
            recomputeIndicators()
          },
          i18n,
        )
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
        strings: i18n,
      })
    }
    tradeLines = attachTradeLines({ chart, series: candles, container: chartBox }, adapter.broker, {
      symbol,
      snapshot: { positions: [], orders: [] },
      scope: null,
      mark: markNow,
      policy: adapter.policy,
      // The trading section of the resolved ladder — colors, widths, visibility, pnlMode. With no
      // host layers this IS the package default the surface always used; applyOverrides refreshes
      // it through update().
      overrides: eff.trading,
      strings: i18n,
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
              openTypeMenu(chromeBox, args.rect, args.current, theme, (orderType) => ticket?.setOrderType(orderType), i18n),
          }
        : {}),
    })
    // The account panel: the SAME snapshot plane as the lines, the SAME broker seam for its
    // actions — one data plane, one write path, two views.
    if (panelHost) {
      accountPanel = mountAccountPanel(
        panelHost,
        adapter.broker,
        theme,
        {
          onAction: (text) => events.onTradingAction?.(text),
          onError: (msg) => events.onTradingError?.(msg),
        },
        i18n,
      )
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
        const note = i18n.t('host.noVolume')
        indicatorsRenderer.render(inst.id, { placement, title, plots: [], unavailable: note })
        chips.push({ ...chipBase, value: null, note, hidden: false })
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
    // Compares clip to the main window, so every reshape of the bar model re-clips them here —
    // paintAll is the one choke point every load / scroll-back / snapshot / replay path exits by.
    compareHandle.sync()
  }

  // ── COMPARE: the data-bearing organ, clipped to the main bar model (compare.ts owns the why).
  const compareHandle = attachCompare(chart, {
    datafeed,
    tf: () => tf,
    mainWindow: () => (bars.length ? { from: bars[0]!.t, to: bars[bars.length - 1]!.t } : null),
  })
  /** The scale the trader held before same-percent forced percent — restored when the last
   *  same-percent compare leaves. Null while no flip is on loan. */
  let scaleBeforeCompare: ScaleMode | null = null
  const compareScalePolicy = () => {
    if (compareHandle.hasSamePercent()) {
      if (scaleMode !== 'percent') {
        scaleBeforeCompare = scaleMode
        applyScaleMode('percent')
      }
    } else if (scaleBeforeCompare !== null) {
      const prior = scaleBeforeCompare
      scaleBeforeCompare = null
      applyScaleMode(prior)
    }
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
        i18n,
      )
      legend?.setHeader(symbol, i18n.t('host.replayHeader', { tf }))
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

  // The level menu, on the widget's own right-click. Its ROWS come from chartContextMenu, so an
  // embedder's chart offers what the app's does minus what this widget cannot serve: no clipboard
  // and no settings dialog here, and the marks row only where execution marks are drawn.
  let contextMenu: ContextMenuHandle | null = null
  /** The level the open menu was raised at — its rows act on this, not on wherever the pointer
   *  wandered to while the menu was up. */
  let lastMenuPrice: number | null = null
  if (options.contextMenu !== false) {
    const priceAt = (clientY: number): number | null => {
      const box = chartBox.getBoundingClientRect()
      const p = candles.coordinateToPrice(clientY - box.top)
      return p != null && p > 0 ? p : null
    }
    contextMenu = mountContextMenu(
      chromeBox,
      (id) => {
        const at = lastMenuPrice
        switch (id) {
          case 'reset-view':
            chart.timeScale().fitContent()
            break
          case 'copy-price':
            if (at != null) void navigator.clipboard?.writeText(String(at)).catch(() => undefined)
            break
          case 'trade-sell-limit':
          case 'trade-sell-stop':
            if (at != null) ticket?.open({ side: 'sell', orderType: id.endsWith('stop') ? 'stop' : 'limit', price: at })
            break
          case 'trade-buy-limit':
          case 'trade-buy-stop':
            if (at != null) ticket?.open({ side: 'buy', orderType: id.endsWith('stop') ? 'stop' : 'limit', price: at })
            break
          case 'trade-new-order':
            if (at != null) ticket?.open({ price: at })
            break
          case 'remove-indicators':
            indicatorInstances = []
            indicatorsRenderer.prune(new Set())
            recomputeIndicators()
            break
          case 'remove-drawings':
            drawingsHandle?.clearAll()
            break
          default:
            break
        }
      },
      theme,
      i18n,
    )
    chartBox.addEventListener('contextmenu', (e) => {
      const price = priceAt(e.clientY)
      if (price == null) return
      e.preventDefault()
      lastMenuPrice = price
      const last = bars.length ? bars[bars.length - 1] : null
      const mark = last ? last.c : null
      contextMenu?.open(
        { clientX: e.clientX, clientY: e.clientY },
        {
          priceText: price.toLocaleString(i18n.tag(), { maximumFractionDigits: 8 }),
          symbol,
          aboveMarket: mark != null && mark > 0 ? price >= mark : null,
          tradable: true,
          canTrade: ticket !== null,
          canAlert: false, // no alerts surface in the widget
          canPaste: false, // the widget's drawing layer has no clipboard
          canSettings: false, // …and no settings dialog to open
          indicatorCount: indicatorInstances.length,
          drawingCount: drawingsHandle?.count() ?? 0,
          marksHidden: null, // the widget's marks switch live/replay, not shown/hidden
        },
      )
    })
  }

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

  /** Re-resolve the ladder and restyle every surface that reads it — the runtime half of the
   *  precedence contract. Everything here is a repaint, never a rebuild: series options, chart
   *  layout, the trade-line styles; the getter-driven surfaces (session bands, execution-mark
   *  colors) pick the new values up on their next draw. */
  const applyLook = (): void => {
    eff = layerOverrides(themeFloor, options.overrides, runtimePartial)
    const A = eff.appearance
    chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: A.background } },
      grid: {
        vertLines: { color: theme.gridColor, visible: A.grid },
        horzLines: { color: theme.gridColor, visible: A.grid },
      },
    })
    candles.applyOptions({
      upColor: A.upColor,
      downColor: A.downColor,
      borderVisible: candleBordersOn(),
      borderUpColor: A.borderUpColor,
      borderDownColor: A.borderDownColor,
      wickUpColor: A.wickUpColor,
      wickDownColor: A.wickDownColor,
    })
    tradeLines?.update({ overrides: eff.trading })
  }

  // Pane-composition sync. Driving a pane through the setters MUTES its own subscriptions for the
  // duration, so a layout host mirroring pane A onto pane B never hears B echo the change back.
  // lightweight-charts fires these subscriptions synchronously, which is what makes the flag work.
  let syncMuted = false
  const crosshairSubs = new Set<(time: number | null) => void>()
  const timeClickSubs = new Set<(time: number) => void>()
  const rangeSubs = new Set<(range: { from: number; to: number }) => void>()
  chart.subscribeCrosshairMove((param) => {
    if (syncMuted || crosshairSubs.size === 0) return
    const t = typeof param.time === 'number' ? param.time : null
    for (const cb of crosshairSubs) cb(t)
  })
  chart.subscribeClick((param) => {
    if (syncMuted || timeClickSubs.size === 0 || typeof param.time !== 'number') return
    for (const cb of timeClickSubs) cb(param.time)
  })
  chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (syncMuted || rangeSubs.size === 0 || !range) return
    for (const cb of rangeSubs) cb({ from: range.from as number, to: range.to as number })
  })
  const paneSync: ChartPaneSyncApi = {
    onCrosshair(cb) {
      crosshairSubs.add(cb)
      return () => crosshairSubs.delete(cb)
    },
    setCrosshair(time) {
      if (removed) return
      syncMuted = true
      try {
        // Anchor at this pane's own bar for the moment (its close) — the nearest earlier bar when
        // feeds tick on different clocks. No bar for that moment clears instead of guessing.
        let bar: FeedBar | undefined
        if (time !== null) for (let i = bars.length - 1; i >= 0; i--) { const b = bars[i]!; if (b.t <= time) { bar = b; break } }
        if (bar) chart.setCrosshairPosition(bar.c, bar.t as UTCTimestamp, candles)
        else chart.clearCrosshairPosition()
      } finally {
        syncMuted = false
      }
    },
    onTimeClick(cb) {
      timeClickSubs.add(cb)
      return () => timeClickSubs.delete(cb)
    },
    centerOn(time) {
      if (removed) return
      const cur = chart.timeScale().getVisibleRange()
      if (!cur) return
      const span = (cur.to as number) - (cur.from as number)
      paneSync.setVisibleRange({ from: time - span / 2, to: time + span / 2 })
    },
    onVisibleRange(cb) {
      rangeSubs.add(cb)
      return () => rangeSubs.delete(cb)
    },
    setVisibleRange(range) {
      if (removed) return
      syncMuted = true
      try {
        chart.timeScale().setVisibleRange({ from: range.from as UTCTimestamp, to: range.to as UTCTimestamp })
      } catch {
        /* a range entirely outside the data is the scale's refusal to honor — stay put */
      } finally {
        syncMuted = false
      }
    },
    visibleRange() {
      const r = chart.timeScale().getVisibleRange()
      return r ? { from: r.from as number, to: r.to as number } : null
    },
  }

  // The legend header carries a WORD while replay is on, so the language has to reach it: every
  // other piece of chrome re-labels itself, but the header's text is the host's to set.
  const unsubscribeStrings = i18n.onChange(() => {
    if (removed) return
    legend?.setHeader(symbol, replayAll === null ? tf : i18n.t('host.replayHeader', { tf }))
  })

  /** The widget's saved-chart CONTENT format. Versioned because the blob is contractually opaque
   *  to every backend — the reader here is the only place an upgrade path can ever live. */
  const CONTENT_V = 1
  const serializeContent = (): string =>
    JSON.stringify({ v: CONTENT_V, symbol, tf, scale: scaleMode, hidden: [...hiddenIndicators], appearance: eff.appearance, compares: compareHandle.serialize() })

  const api: ChartWidgetApi = {
    symbol: () => symbol,
    timeframe: () => tf,
    locale: () => i18n.locale(),
    setLocale(code: LanguageCode) {
      if (removed || code === i18n.locale()) return
      void i18n.setLocale(code)
      chart.applyOptions({ localization: { locale: localeInfo(code).tag } })
    },
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
      compareHandle.setTimeframe()
    },
    setIndicators(next: IndicatorInstance[]) {
      if (removed) return
      indicatorInstances = [...next]
      indicatorsRenderer.prune(new Set(next.map((i) => i.id)))
      recomputeIndicators()
    },
    scaleMode: () => scaleMode,
    setScaleMode: (next: ScaleMode) => {
      applyScaleMode(next)
      // An explicit pick is the trader overriding the loan — nothing to give back later.
      scaleBeforeCompare = null
    },
    compare: {
      add(sym: string, opts: { placement: ComparePlacement }) {
        if (removed || !sym || sym === symbol) return // the charted symbol compared to itself is a no-op
        compareHandle.add(sym, { placement: opts.placement })
        compareScalePolicy()
      },
      remove(sym: string) {
        if (removed) return
        compareHandle.remove(sym)
        compareScalePolicy()
      },
      setVisible: (sym: string, visible: boolean) => compareHandle.setVisible(sym, visible),
      list: () => compareHandle.list(),
      latest: (sym: string) => compareHandle.latest(sym),
      symbols: () => [...(options.compareSymbols ?? [])],
    },
    overrides: () => eff,
    applyOverrides(partial: PartialOverrides) {
      if (removed) return
      // Runtime layers ACCUMULATE leaf by leaf — a later call restyles what it names and leaves
      // the rest of the runtime layer standing, so two hosts' calls compose instead of clobbering.
      runtimePartial = {
        appearance: { ...runtimePartial.appearance, ...(partial.appearance ?? {}) },
        trading: { ...runtimePartial.trading, ...(partial.trading ?? {}) },
      }
      applyLook()
      pingSaveNeeded()
    },
    saveLoad: {
      adapter: saveLoad,
      serialize: () => ({ symbol, timeframe: tf, content: serializeContent() }),
      restore(content: string) {
        if (removed) return
        const c = JSON.parse(content) as { v?: unknown; symbol?: unknown; tf?: unknown; scale?: unknown; hidden?: unknown; appearance?: unknown; compares?: unknown }
        if (c.v !== CONTENT_V) throw new Error(`unsupported chart content version ${String(c.v)}`)
        if (typeof c.symbol === 'string' && c.symbol) api.setSymbol(c.symbol)
        if (typeof c.tf === 'string' && c.tf) api.setTimeframe(c.tf)
        applyScaleMode(coerceScaleMode(typeof c.scale === 'string' ? c.scale : null))
        hiddenIndicators.clear()
        if (Array.isArray(c.hidden)) for (const id of c.hidden) if (typeof id === 'string') hiddenIndicators.add(id)
        storage.set(HIDDEN_KEY, JSON.stringify([...hiddenIndicators]))
        recomputeIndicators()
        // The saved appearance applies as a RUNTIME layer — a viewer's saved look beats the
        // host's constructor values, exactly the precedence the option contract states.
        if (c.appearance && typeof c.appearance === 'object') api.applyOverrides({ appearance: c.appearance as Partial<ChartOverrides['appearance']> })
        // Compares restore AFTER the scale: the blob's own scale is the truth of how it was saved,
        // so the policy only re-arms the flip-back for compares the restore brings in.
        compareHandle.restore(Array.isArray(c.compares) ? c.compares : [])
        compareScalePolicy()
      },
    },
    drawings: drawingsApi,
    ticket: ticketApi,
    replay: replayApi,
    sync: paneSync,
    executions: executionsApi,
    remove() {
      if (removed) return
      removed = true
      epoch++
      unsubscribe?.()
      unsubscribe = null
      unsubscribeStrings()
      abandonReplay()
      if (saveNeededTimer) clearTimeout(saveNeededTimer)
      if (indicatorTrailer) clearTimeout(indicatorTrailer)
      ticket?.destroy()
      tradingUnsub?.()
      accountPanel?.destroy()
      execMarks?.destroy()
      tradeLines?.detach()
      contextMenu?.destroy()
      drawingsRail?.destroy()
      compareHandle.destroy()
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
  return api
}
