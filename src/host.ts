// The standalone chart host — createChart(options) mounts a complete datafeed-driven chart into a DOM
// element with no framework dependency: lightweight-charts underneath, the ChartDatafeed seam for data,
// ChartStorage for the viewer's sticky symbol/timeframe, theme overrides, event hooks, and indicator
// plugins computed over the live bar series. This is the widget a third party embeds; the trdrs app's own
// ChartPanel is a richer host over the same seams (drawings UI, replay) and does not use this.
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
import { attachCompare, type CompareEntry, type CompareHandle, type ComparePlacement, type CompareSymbol } from './compare'
import { openCompareDialog, type CompareDialogHandle } from './compareDialog'
import { createSessionBands, isIntradayTf, knownMarketKind, sessionOf, setHolidayCalendar, SESSION_DOT, type MaybeMarketKind, type SessionBandsPrimitive } from './sessions'
import { mountChartLegend, type ChartLegend, type LegendChip } from './chartLegend'
import { isCollapsed, planPaneOp } from './panePlan'
import { openInputsEditor } from './inputsEditor'
import { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from './replay'
import { mountReplayBar, type ReplayBarHandle } from './replayBar'
import { mountContextMenu, type ContextMenuHandle } from './contextMenuUi'
import { createChartI18n } from './i18n'
import { createPriceFormatter } from './priceFormatter'
import type { PriceFormat } from './symbology'
import {
  createExtensionHost,
  type CommandRegistry,
  type ChartExtensionHost,
  type ChartExtensionMenuItem,
  type ChartExtensionPane,
  type ChartExtensionReplayState,
  type ChartExtensionSeries,
  type ChartPriceFormatter,
} from './extension'
import { longPressArms, longPressCancels, pointerLock, LONG_PRESS_MS } from './pointerInput'

/** The drawing surface a host drives (a subset of the layer's handle: symbol/timeframe/tick flow
 *  and teardown stay widget-owned, so a host cannot desync the layer from the chart). */
export type ChartDrawingsApi = Omit<DrawingsHandle, 'setSymbol' | 'setTimeframe' | 'setTick' | 'destroy'>

/** The bar-replay surface: a cursor over the widget's OWN loaded bars — whole-bar updates, played
 *  at a chosen speed or stepped. While replay is on, live updates keep accumulating off-screen
 *  (Go live / exit catches up). Replay is a VIEW state and nothing more: an extension reads it
 *  through its context, and what it does about a historical view is its own rule. */
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
  /** Bar replay over the loaded window. */
  replay: ChartReplayApi
  /** Pane-composition sync primitives (crosshair / time-click / visible range). */
  sync: ChartPaneSyncApi
  /** Commands contributed by the chart's extensions: what a host toolbar or menu can offer, and the
   *  one way to run them. Empty on a chart with no extensions. */
  commands: CommandRegistry
  /** The interface language the widget is showing. */
  locale(): string
  /** Switch the interface language at runtime: the chrome re-labels as the translation lands, and
   *  the axis and crosshair formatting follow at once. */
  setLocale(code: string): Promise<void>
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

/** The price format a decimal tick implies, exactly: 0.25 is { pricescale: 100, minmov: 25 },
 *  0.01 is { 100, 1 }, 0.0001 is { 10000, 1 }. A chart-local stand-in until W2-A serves these facts
 *  through `SymbolInfo`; it derives nothing from a price's magnitude. */
function priceFormatOfTick(tick: number): PriceFormat {
  const s = tick.toString()
  const sci = s.match(/e-(\d+)$/i)
  const dot = s.indexOf('.')
  const decimals = sci ? Number(sci[1]) + (s.split('e')[0]!.split('.')[1]?.length ?? 0) : dot < 0 ? 0 : s.length - dot - 1
  const pricescale = 10 ** decimals
  return { pricescale, minmov: Math.max(1, Math.round(tick * pricescale)) }
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
/** Every mounted widget gets one, so an extension attached to two panes of a layout can tell them
 *  apart and key its own per-pane state. Stable for the pane's life, never reused. */
let chartSeq = 0
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
   *  signal for a look that only engages once someone asks: candle borders. */
  const overrideNamed = (leaf: keyof ChartOverrides['appearance']): boolean =>
    [options.overrides, runtimePartial].some((p) => !!p?.appearance && leaf in p.appearance)
  const candleBordersOn = (): boolean => overrideNamed('borderUpColor') || overrideNamed('borderDownColor')
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
  /** The feed's last reported status for this subscription, as the extension plane reads it;
   *  null until the subscription has spoken. */
  let feedStatus: string | null = null
  /** The resolved symbol's tick: the drawing readouts and the extension formatter read it. */
  let symbolTick: number | null = null
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

  // The widget owns its container's inner layout: a chart host (the chart + every overlay — the
  // rail, the legend, an extension's canvas and editors) filling the container. The overlays
  // parent on the chart box, never the outer container: an overlay canvas sizes to its parent.
  const container = options.container
  const prevContainerStyle = { display: container.style.display, flexDirection: container.style.flexDirection }
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  const chartHost = document.createElement('div')
  chartHost.style.cssText = 'position:relative;flex:1 1 auto;min-height:0;'
  container.appendChild(chartHost)
  // Two SIBLING boxes, and the split is load-bearing rather than cosmetic. The chart box belongs
  // to the gesture layers: an extension's drag surface binds a CAPTURE-phase pointer handler there
  // and takes pointer capture to track drags, which no bubble-phase stopPropagation in a descendant
  // could ever prevent — so widget chrome mounted inside that box would have its clicks swallowed
  // (the press retargets to the capturing element and the browser emits no click on the button).
  // The chrome box is therefore a SEPARATE subtree overlaying it: presses on the rail, the legend,
  // or an extension's editor never traverse the chart box at all. It is inert by default; each
  // interactive piece opts back in with pointer-events:auto, so the chart stays fully draggable
  // underneath.
  const chartBox = document.createElement('div')
  chartBox.style.cssText = 'position:absolute;inset:0;'
  const chromeBox = document.createElement('div')
  chromeBox.style.cssText = 'position:absolute;inset:0;z-index:5;pointer-events:none;'
  chartHost.append(chartBox, chromeBox)

  // Every string the chrome shows comes through here, in the host's language; the tag also drives
  // the library's own axis and crosshair formatting, so a canvas label and a menu row never disagree
  // about what language the screen is in.
  const i18n = options.i18n ?? createChartI18n(options.locale)

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

  /** The extension plane. Created once the chart, its overlay and its capabilities exist (below);
   *  every notification site reads it optionally, so nothing depends on where that line sits. */
  let extHost: ChartExtensionHost | null = null

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
        // Compare chips carry the `cmp:` prefix — their eye toggles the organ's visibility.
        if (id.startsWith('cmp:')) {
          const sym = id.slice(4)
          const entry = compareHandle?.list().find((e) => e.symbol === sym)
          if (entry) compareHandle!.setVisible(sym, !entry.visible)
          return
        }
        if (hiddenIndicators.has(id)) hiddenIndicators.delete(id)
        else hiddenIndicators.add(id)
        storage.set(HIDDEN_KEY, JSON.stringify([...hiddenIndicators]))
        recomputeIndicators()
      },
      onTitle: (id) => {
        if (id.startsWith('cmp:')) openCompareUi('change-symbol', id.slice(4))
      },
      onRemove: (id) => {
        if (id.startsWith('cmp:')) compareRemove(id.slice(4))
      },
      onCompare: () => openCompareUi('compare'),
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

  // The indicator pipeline: instance → compute (host-supplied) → the shared manifest walker → the
  // shared renderer. Identical to what a richer host runs, so a definition renders the same
  // everywhere — panes, histograms, areas, markers, levels, band fills, volume-scale plots.
  const indicatorsRenderer = attachIndicators(chart, { candles: () => candles })

  // The legend strip is ONE chip list: indicator chips (rebuilt by recomputeIndicators) followed
  // by compare chips (rebuilt on every organ notification). `compareHandle` is assigned after the
  // chart's data plumbing below; chips built before that simply carry no compares yet.
  let compareHandle: CompareHandle | null = null
  let lastIndicatorChips: LegendChip[] = []
  const compareChips = (): LegendChip[] =>
    (compareHandle?.list() ?? []).map((e) => {
      const pct = e.placement === 'same-percent' ? compareHandle!.changePct(e.symbol) : null
      const last = e.placement === 'same-percent' ? null : compareHandle!.latest(e.symbol)
      return {
        id: `cmp:${e.symbol}`,
        // A plain pair wears the reference's spaced form ("XRP / USDC"); anything else verbatim.
        title: /^[A-Za-z][A-Za-z0-9.]*\/[A-Za-z][A-Za-z0-9.]*$/.test(e.symbol) ? e.symbol.replace('/', ' / ') : e.symbol,
        value: pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : last != null ? last.toFixed(2) : null,
        hidden: !e.visible,
        titleButton: true,
        removable: true,
      }
    })
  const pushChips = (): void => {
    legend?.setChips([...lastIndicatorChips, ...compareChips()])
    // The strip anchors past the LEFT axis while a new-scale compare holds it up.
    try {
      legend?.setLeftInset(chart.priceScale('left').width())
    } catch {
      /* chart mid-teardown */
    }
  }

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
    lastIndicatorChips = chips
    pushChips()
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
        if (changed) pushChips()
      })
    }
  }

  function paintAll(): void {
    candles.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c })))
    volume.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? theme.upColor : theme.downColor })))
    recomputeIndicators()
    // Compares clip to the main window, so every reshape of the bar model re-clips them here —
    // paintAll is the one choke point every load / scroll-back / snapshot / replay path exits by.
    compareHandle?.sync()
    extHost?.barsChanged(bars)
  }

  // ── COMPARE: the data-bearing organ, clipped to the main bar model (compare.ts owns the why).
  // Chip pushes throttle to a trailing tick — every compare's live bar notifies, and the legend
  // re-rendering its DOM per tick would be churn for a value the eye cannot follow anyway.
  let compareChipTimer: ReturnType<typeof setTimeout> | null = null
  compareHandle = attachCompare(chart, {
    datafeed,
    tf: () => tf,
    mainWindow: () => (bars.length ? { from: bars[0]!.t, to: bars[bars.length - 1]!.t } : null),
    onChange: () => {
      if (compareChipTimer !== null) return
      compareChipTimer = setTimeout(() => {
        compareChipTimer = null
        if (!removed) pushChips()
      }, 250)
    },
  })
  /** The scale the trader held before same-percent forced percent — restored when the last
   *  same-percent compare leaves. Null while no flip is on loan. */
  let scaleBeforeCompare: ScaleMode | null = null
  const compareScalePolicy = () => {
    if (compareHandle!.hasSamePercent()) {
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
  /** ONE add/remove pair for every door — the api, the dialog, the legend's remove — so the scale
   *  loan can never depend on which door was used. */
  const compareAdd = (sym: string, placement: ComparePlacement): void => {
    if (removed || !sym || sym === symbol) return // the charted symbol compared to itself is a no-op
    compareHandle!.add(sym, { placement })
    compareScalePolicy()
  }
  const compareRemove = (sym: string): void => {
    if (removed) return
    compareHandle!.remove(sym)
    compareScalePolicy()
  }
  /** The widget's own dialog (the legend's compare door and a compare chip's title). One at a
   *  time; a change-symbol pick re-keys in place, keeping the compare's placement and color. */
  let compareDialog: CompareDialogHandle | null = null
  const openCompareUi = (mode: 'compare' | 'change-symbol', changeFrom?: string): void => {
    if (removed) return
    compareDialog?.close()
    compareDialog = openCompareDialog({
      theme,
      strings: i18n,
      datafeed,
      mode,
      curated: options.compareSymbols,
      added: () => compareHandle!.list(),
      onAdd: compareAdd,
      onRemove: compareRemove,
      initialQuery: changeFrom,
      onPick: (next) => {
        if (!changeFrom || next === changeFrom || next === symbol) return
        const cur = compareHandle!.list().find((e) => e.symbol === changeFrom)
        if (!cur || compareHandle!.list().some((e) => e.symbol === next)) return
        compareHandle!.remove(changeFrom)
        compareHandle!.add(next, { placement: cur.placement, color: cur.color, visible: cur.visible })
        compareScalePolicy()
      },
      onClose: () => {
        compareDialog = null
      },
    })
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
    extHost?.barsChanged(bars)
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
    feedStatus = null // the new subscription reports its own status; a stale one must not carry over
    sessionKind = null // the next resolve states the new symbol's model; unresolved never bands
    sessionBands?.refresh() // the old symbol's bands must not survive the switch
    symbolTick = null
    abandonReplay() // a replay window is symbol+timeframe-bound; the switch invalidates it
    drawingsHandle?.setTick(null)
    paintAll()
    if (!symbol) return
    // Symbol metadata rides ALONGSIDE the first history ask (never blocking it): tick size feeds
    // the drawing readouts, sessionClass feeds the session bands. A failed resolve leaves both at
    // their honest unknowns.
    void datafeed
      .resolve(symbol)
      .then((info) => {
        if (removed || myEpoch !== epoch || !info) return
        symbolTick = info.tick
        drawingsHandle?.setTick(info.tick)
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
          feedStatus = 'feed_unavailable'
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
        feedStatus = status
        events.onFeedStatus?.(status)
      },
    })
  }

  // ── The EXTENSION PLANE. Everything an extension can reach is built here, in the widget's own
  // terms: the chart never hands out its lightweight-charts instance, so an extension can only do
  // what these capabilities express and the widget can take back everything it gave.
  const chartId = `chart-${++chartSeq}`
  /** The palette an extension paints to: the resolved theme with the effective appearance layer on
   *  top, so an `applyOverrides` reaches an overlay the same way it reaches the candles. */
  const extTheme = (): ResolvedTheme => ({
    background: eff.appearance.background,
    gridColor: theme.gridColor,
    textColor: theme.textColor,
    upColor: eff.appearance.upColor,
    downColor: eff.appearance.downColor,
    fontSize: theme.fontSize,
  })
  /** The chart's price formatter: the package's own over the resolved tick's price format, in the
   *  widget's language; two places only while the symbol is unresolved. */
  const extFormatter = (): ChartPriceFormatter => {
    const format = symbolTick != null && symbolTick > 0 ? priceFormatOfTick(symbolTick) : { pricescale: 100, minmov: 1 }
    const formatter = createPriceFormatter(format, { locale: i18n.tag() })
    return { format: (price) => formatter.format(price), precision: () => formatter.precision() }
  }
  const extPane = (): ChartExtensionPane => ({ id: chartId, width: chartBox.clientWidth, height: chartBox.clientHeight })
  const extReplay = (): ChartExtensionReplayState => ({
    active: replayAll !== null,
    cursor: replayAll === null ? bars.length : replayCursor,
    total: replayAll?.length ?? bars.length,
  })
  const extSeries: ChartExtensionSeries = {
    createPriceLine(opts) {
      const line = candles.createPriceLine(opts)
      return {
        update: (next) => {
          if (!removed) line.applyOptions(next)
        },
        remove: () => {
          if (removed) return
          try {
            candles.removePriceLine(line)
          } catch {
            /* the series went down first */
          }
        },
      }
    },
    attachPrimitive(primitive) {
      candles.attachPrimitive(primitive)
      return () => {
        try {
          candles.detachPrimitive(primitive)
        } catch {
          /* likewise */
        }
      }
    },
    priceToY: (price) => (removed ? null : candles.priceToCoordinate(price)),
    yToPrice: (y) => (removed ? null : candles.coordinateToPrice(y)),
    timeToX: (timeSeconds) => (removed ? null : chart.timeScale().timeToCoordinate(timeSeconds as UTCTimestamp)),
    xToTime: (x) => {
      if (removed) return null
      const t = chart.timeScale().coordinateToTime(x)
      return typeof t === 'number' ? t : null
    },
    plotWidth: () => {
      if (removed) return 0
      try {
        return chartBox.clientWidth - chart.priceScale('right').width()
      } catch {
        return chartBox.clientWidth
      }
    },
    lockPanZoom: (locked) => {
      if (removed) return
      // ONE rule for every in-chart drag (pointerInput.pointerLock): navigation and the container's
      // touch action move together, so a released gesture cannot leave the chart half-frozen.
      const state = pointerLock(locked)
      chart.applyOptions({ handleScroll: state.handleScroll, handleScale: state.handleScale })
      chartBox.style.touchAction = state.touchAction
    },
  }
  extHost = createExtensionHost(
    {
      chartId,
      container: chartBox,
      overlay: chromeBox,
      symbol: () => symbol,
      timeframe: () => tf,
      bars: () => bars,
      replay: extReplay,
      feedStatus: () => feedStatus,
      theme: extTheme,
      formatter: extFormatter,
      pane: extPane,
      series: extSeries,
    },
    options.extensions ?? [],
  )
  // The pane lane: a layout re-tile and a window resize both reach an overlay the same way.
  let paneObserver: ResizeObserver | null = null
  if (typeof ResizeObserver === 'function') {
    paneObserver = new ResizeObserver(() => {
      if (!removed) extHost?.paneChanged(extPane())
    })
    paneObserver.observe(chartBox)
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

  const replaySync = () => {
    replayBar?.sync({
      playing: replayPlaying,
      cursor: replayCursor,
      total: replayAll?.length ?? 0,
      speed: replaySpeed,
      interval: replayAutoInterval ? 'auto' : (replayManualInterval ?? 'auto'),
    })
    // Extensions see replay as a VIEW state, not as a session: entered, where the cursor sits, and
    // exited. What a host does about it (disarming a money gesture, say) is the host's rule.
    extHost?.replayChanged(extReplay())
  }
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
    extHost?.replayChanged(extReplay())
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

  // The level menu, on the widget's own right-click. Its ROWS come from chartContextMenu, so an
  // embedder's chart offers what the app's does minus what this widget cannot serve: no clipboard
  // and no settings dialog here. Whatever an extension contributes for the level rides below.
  let contextMenu: ContextMenuHandle | null = null
  /** The level the open menu was raised at — its rows act on this, not on wherever the pointer
   *  wandered to while the menu was up. */
  let lastMenuPrice: number | null = null
  /** Cancels an armed press-and-hold at teardown, so a widget removed mid-press fires nothing. */
  let holdCleanup: (() => void) | null = null
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
    /** Raise the level menu at a viewport point — the right-click and the touch hold share it, so
     *  a finger and a mouse reach the same rows. False when the point holds no readable level. */
    const raiseMenuAt = (clientX: number, clientY: number): boolean => {
      const price = priceAt(clientY)
      if (price == null) return false
      lastMenuPrice = price
      const priceText = price.toLocaleString(i18n.tag(), { maximumFractionDigits: 8 })
      // Contributed rows are asked for at the raise, so they can depend on the level pressed, and
      // they carry their own actions — the widget routes nothing on their behalf.
      const extra: readonly ChartExtensionMenuItem[] =
        extHost?.menuItems({ price, priceText, symbol, timeframe: tf, clientX, clientY }) ?? []
      contextMenu?.open(
        { clientX, clientY },
        {
          priceText,
          symbol,
          canAlert: false, // no alerts surface in the widget
          canPaste: false, // the widget's drawing layer has no clipboard
          canSettings: false, // …and no settings dialog to open
          indicatorCount: indicatorInstances.length,
          drawingCount: drawingsHandle?.count() ?? 0,
        },
        extra,
      )
      return true
    }
    chartBox.addEventListener('contextmenu', (e) => {
      if (raiseMenuAt(e.clientX, e.clientY)) e.preventDefault()
    })
    // The TOUCH way into the same menu: one finger held still. Generic chart input, owned by the
    // package at every width — an embedder gets press-and-hold without writing any of it. It stands
    // down while a drawing tool is armed (the press IS the drawing gesture) and the moment a second
    // finger lands (that is a pinch, which is navigation). The rules are pointerInput's.
    let hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
    const cancelHold = (): void => {
      if (!hold) return
      clearTimeout(hold.timer)
      hold = null
    }
    chartBox.addEventListener(
      'touchstart',
      (e) => {
        cancelHold()
        if (!longPressArms({ touches: e.touches.length, toolArmed: drawingsHandle?.activeTool() != null })) return
        const touch = e.touches[0]
        if (!touch) return
        const { clientX: x, clientY: y } = touch
        hold = {
          x,
          y,
          timer: setTimeout(() => {
            hold = null
            if (!removed) raiseMenuAt(x, y)
          }, LONG_PRESS_MS),
        }
      },
      { passive: true },
    )
    chartBox.addEventListener(
      'touchmove',
      (e) => {
        const held = hold
        if (!held) return
        const touch = e.touches[0]
        if (!touch || longPressCancels({ touches: e.touches.length, fromX: held.x, fromY: held.y, x: touch.clientX, y: touch.clientY })) cancelHold()
      },
      { passive: true },
    )
    chartBox.addEventListener('touchend', cancelHold, { passive: true })
    chartBox.addEventListener('touchcancel', cancelHold, { passive: true })
    holdCleanup = cancelHold
  }

  /** Re-resolve the ladder and restyle every surface that reads it — the runtime half of the
   *  precedence contract. Everything here is a repaint, never a rebuild: series options, chart
   *  layout; the getter-driven surfaces (session bands, extensions reading the theme lane) pick
   *  the new values up on their next draw. */
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
    extHost?.themeChanged(extTheme())
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
    chart.applyOptions({ localization: { locale: i18n.tag() } })
    legend?.setHeader(symbol, replayAll === null ? tf : i18n.t('host.replayHeader', { tf }))
  })

  /** The widget's saved-chart CONTENT format. Versioned because the blob is contractually opaque
   *  to every backend — the reader here is the only place an upgrade path can ever live. */
  const CONTENT_V = 1
  const serializeContent = (): string =>
    JSON.stringify({
      v: CONTENT_V,
      symbol,
      tf,
      scale: scaleMode,
      hidden: [...hiddenIndicators],
      appearance: eff.appearance,
      compares: compareHandle!.serialize(),
      // Extension state rides in its own namespace, keyed by extension id, so a chart saved with
      // one set of extensions loads under another without either reading the other's state. An
      // additive key: a blob written before extensions existed simply has none.
      ext: extHost?.serialize() ?? {},
    })

  const api: ChartWidgetApi = {
    symbol: () => symbol,
    timeframe: () => tf,
    locale: () => i18n.locale(),
    async setLocale(code: string) {
      if (removed || code === i18n.locale()) return
      await i18n.setLocale(code)
      if (!removed) chart.applyOptions({ localization: { locale: i18n.tag() } })
    },
    setSymbol(next: string) {
      if (removed || next === symbol) return
      symbol = next
      storage.set(SYMBOL_KEY, next)
      drawingsHandle?.setSymbol(next)
      legend?.setHeader(symbol, tf)
      events.onSymbolChange?.(next)
      // Before the load: a symbol-scoped extension re-attaches against the new market, so its first
      // sight of the chart is the new symbol's empty buffer rather than the old symbol's bars.
      extHost?.symbolChanged(next)
      load()
    },
    setTimeframe(next: string) {
      if (removed || next === tf) return
      tf = next
      storage.set(TF_KEY, next)
      drawingsHandle?.setTimeframe(next)
      legend?.setHeader(symbol, tf)
      events.onTimeframeChange?.(next)
      extHost?.timeframeChanged(next)
      load()
      compareHandle!.setTimeframe()
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
      add: (sym: string, opts: { placement: ComparePlacement }) => compareAdd(sym, opts.placement),
      remove: compareRemove,
      setVisible: (sym: string, visible: boolean) => compareHandle!.setVisible(sym, visible),
      list: () => compareHandle!.list(),
      latest: (sym: string) => compareHandle!.latest(sym),
      symbols: () => [...(options.compareSymbols ?? [])],
    },
    overrides: () => eff,
    applyOverrides(partial: PartialOverrides) {
      if (removed) return
      // Runtime layers ACCUMULATE leaf by leaf — a later call restyles what it names and leaves
      // the rest of the runtime layer standing, so two hosts' calls compose instead of clobbering.
      runtimePartial = { appearance: { ...runtimePartial.appearance, ...(partial.appearance ?? {}) } }
      applyLook()
      pingSaveNeeded()
    },
    saveLoad: {
      adapter: saveLoad,
      serialize: () => ({ symbol, timeframe: tf, content: serializeContent() }),
      restore(content: string) {
        if (removed) return
        const c = JSON.parse(content) as {
          v?: unknown
          symbol?: unknown
          tf?: unknown
          scale?: unknown
          hidden?: unknown
          appearance?: unknown
          compares?: unknown
          ext?: unknown
        }
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
        compareHandle!.restore(Array.isArray(c.compares) ? c.compares : [])
        compareScalePolicy()
        // Extensions restore LAST: the symbol, timeframe and scale a saved chart carries are the
        // world an extension's state describes, so it must already be the world on screen.
        extHost?.restore(c.ext)
      },
    },
    commands: {
      list: () => extHost?.commands.list() ?? [],
      execute: (id: string) => extHost?.commands.execute(id) ?? false,
    },
    drawings: drawingsApi,
    replay: replayApi,
    sync: paneSync,
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
      holdCleanup?.()
      paneObserver?.disconnect()
      // Extensions come down FIRST, while the chart they drew on is still there to take the drawing
      // off. Detaching after the renderer is gone would leave their teardown reaching into nothing.
      extHost?.detach()
      extHost = null
      contextMenu?.destroy()
      drawingsRail?.destroy()
      compareDialog?.close()
      compareHandle!.destroy()
      drawingsHandle?.destroy()
      legend?.destroy()
      indicatorsRenderer.destroy()
      chart.remove()
      // Leave the host element exactly as found: our wrapper rows go, its layout styles restore.
      chartHost.remove()
      container.style.display = prevContainerStyle.display
      container.style.flexDirection = prevContainerStyle.flexDirection
    },
  }
  return api
}
