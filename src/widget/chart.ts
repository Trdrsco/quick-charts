// One chart: the composition root that holds the planes together, and the public handle a host
// drives it through.
//
// A widget hosts one or many of these. Everything a chart owns lives in a plane of its own — data,
// indicators, drawings, compare, replay, session, marks, extensions, the legend, the level menu —
// and this file is the wiring between them plus the handle they add up to. The rule that shapes it:
// a plane never reaches into another plane's state, it asks this file, and this file owns the
// mutable truth (the symbol, the timeframe, the style, the bars, the scale) that more than one
// plane reads. The chart also mounts its own per-chart chrome (the navigation cluster, the replay
// transport while replay is on) and knocks on the widget chrome's doors for the surfaces it does
// not own: the search dialog and the indicator settings dialog.
//
// TWO SERIES, and the split is what makes a style switch cheap. The ANCHOR is an invisible line of
// closes that lives as long as the chart: drawings, session bands, marks, the extension seam and
// the crosshair all bind to it, so none of them is torn down when the look changes. The STYLE
// series is the visible one, and switching styles replaces only that.
import {
  ColorType,
  CrosshairMode,
  createChart as createRenderer,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts'
import { FeedUnavailableError, olderPageVerdict, type ChartDatafeed, type DatafeedConfig, type FeedBar } from '../datafeed'
import type { ChartStorage } from '../storage'
import type { ChartSaveLoadAdapter } from '../resources'
import { DEFAULT_OVERRIDES, layerOverrides, type ChartOverrides, type PartialOverrides } from '../overrides'
import { coerceScaleMode, PRICE_SCALE_MODE, type ScaleMode } from '../scaleMode'
import { createPriceFormatter, type PriceFormatter } from '../priceFormatter'
import type { PriceFormat, SymbolInfo } from '../symbology'
import type { ChartI18n } from '../i18n'
import type { ChartExtension } from '../extension'
import type { CompareSymbol } from '../compare'
import type { ThemeController } from '../theme/controller'
import { canvasTheme, type CanvasTheme } from '../theme/renderer'
import type { CommandRegistry } from './commands'
import { createEmitter, type ChartEvents, type SaveConflictInfo } from './events'
import type { AccessPolicy, Capabilities, ChartPreferences, IndicatorInstance } from './options'
import type { ResolvedFeatures } from './planes'
import { addStyleSeries, coerceChartStyle, styleOptions, valueShaped, type ChartStyleId, type StylePaint } from './styles'
import { createRangeApi, type LogicalRange, type RangeApi, type TimeRange } from './ranges'
import { frameRange, scrolledPosition, zoomedBarSpacing } from '../ranges'
import { attachSession } from './session'
import { attachDrawingsPlane, type ChartDrawingsApi } from './drawings'
import { attachIndicatorsPlane, type IndicatorsPlane } from './indicators'
import { attachComparePlane, type ChartCompareApi } from './compare'
import { attachReplayPlane, coerceReplaySpeed, type ChartReplayApi } from './replay'
import { attachExtensionsPlane } from './extensions'
import { attachLegendPlane } from './legend'
import { attachMenuPlane } from './menu'
import { attachPointerPlane } from './pointer'
import { attachMarks } from './marks'
import type { ChromeDoors } from '../ui/chrome/doors'
import { mountNavControls } from '../ui/chrome/navControls'
import { mountReplayTransport, type ReplayTransportHandle } from '../ui/chrome/replayBar'
import { closeOverlays } from '../ui/chrome/overlays'
import { createSaveLoadApi, type ChartSaveLoadApi, type ParsedChartContent } from './saveLoad'
import { registerChartCommands } from './chartCommands'
import {
  DEFAULT_TIMEZONE,
  isTimezoneChoice,
  makeCrosshairTimeFormatter,
  makeTickMarkFormatter,
  resolveDisplayTimezone,
} from '../timezones'
import { isIntradayTimeframe } from '../timeframe'
import { DEFAULT_SUBSESSION, type ActiveSubsession, type MarketStatus } from '../sessionModel'
import {
  DEFAULT_DRAWING_PREFERENCES,
  DRAWING_PREFERENCES_KEY,
  parseDrawingPreferences,
  serializeDrawingPreferences,
  type DrawingAssetPort,
  type DrawingPreferences,
} from '../drawings/index'

/** The price format the chart writes with while the symbol is unresolved: cents. A DECLARED
 *  stand-in for the moment between mount and the resolve landing (and for a feed that answers
 *  null), never a rule that reads precision off a price's magnitude. */
const UNRESOLVED_PRICE_FORMAT: PriceFormat = { pricescale: 100, minmov: 1 }

/** The smallest move a price format declares, as a price: the grid drawings snap to and the
 *  series' `minMove`. */
export const minMoveOf = (format: PriceFormat): number => format.minmov / format.pricescale

const SNAPSHOT_BARS = 300
const PAGE_BARS = 500
/** How close to the left edge (in bars) the visible range must get before the next page is fetched. */
const PAGE_TRIGGER_BARS = 60

/** Apply a live bar event to an ascending series: mutate the last bar (same bucket time), append
 *  (newer), or drop a stale update (older than the last bar; never splice history). Returns the new
 *  array only when something changed. Exported for tests. */
export function applyBar(bars: FeedBar[], bar: FeedBar): FeedBar[] | null {
  const last = bars[bars.length - 1]
  if (!last || bar.t > last.t) return [...bars, bar]
  if (bar.t === last.t) return [...bars.slice(0, -1), bar]
  return null
}

/** The initial-timeframe rule for a capability-declaring feed: the sticky or default timeframe when
 *  the feed declares nothing (or declares that timeframe), else the feed's FIRST declared
 *  resolution — the chart must never open with an ask the feed already said it cannot serve. The
 *  sticky PREFERENCE is not overwritten: capability is the feed's property and preference is the
 *  viewer's, so a later feed that serves the preferred timeframe gets it back. Exported for tests. */
export function resolveInitialTf(sticky: string, declared: readonly string[] | undefined): string {
  if (!declared || declared.length === 0) return sticky
  return declared.includes(sticky) ? sticky : (declared[0] ?? sticky)
}

/** Pane-composition primitives: the raw mirrors a layout syncs charts with. Subscriptions report
 *  USER-driven changes only, so a chart being driven through the setters never re-reports the
 *  change and two mirrored charts cannot echo each other into a loop. Times are the feed's unix
 *  seconds. */
export interface ChartPaneSyncApi {
  /** The crosshair moved (null means it left the chart). */
  onCrosshair(cb: (time: number | null) => void): () => void
  /** Mirror another chart's crosshair by TIME, anchored at this chart's own bar for that moment
   *  (the nearest earlier bar when feeds tick on different clocks); null or no bar clears it. */
  setCrosshair(time: number | null): void
  onTimeClick(cb: (time: number) => void): () => void
  onVisibleRange(cb: (range: TimeRange) => void): () => void
}

/** The indicator surface a host drives. */
export interface IndicatorsApi {
  get(): readonly IndicatorInstance[]
  set(instances: readonly IndicatorInstance[]): void
  /** Add one. False when the access policy refuses it. */
  add(instance: IndicatorInstance): boolean
  remove(id: string): void
  hide(id: string): void
  show(id: string): void
  hidden(): readonly string[]
}

/** One chart, as a host drives it. */
export interface ChartHandle {
  /** Stable for this chart's life, and unique within the process. */
  id: string
  symbol(): string
  setSymbol(symbol: string): void
  timeframe(): string
  setTimeframe(timeframe: string): void
  style(): ChartStyleId
  /** Switch the main-series style. Presentation only: nothing refetches, and the indicators,
   *  drawings, comparisons and visible range all survive. */
  setStyle(id: ChartStyleId): void
  visibleRange(): TimeRange | null
  setVisibleRange(range: TimeRange): void
  logicalRange(): LogicalRange | null
  setLogicalRange(range: LogicalRange): void
  /** Move the window by whole bars: negative goes back in time. */
  scroll(bars: number): void
  /** Zoom about the window's center. Above 1 shows more bars, below 1 shows fewer. */
  zoom(factor: number): void
  /** Fit the loaded data. */
  reset(): void
  /** Return to the live edge, keeping the current span. */
  goLive(): void
  scaleMode(): ScaleMode
  setScaleMode(mode: ScaleMode): void
  /** The viewer's display-timezone CHOICE: an IANA id from the chart's registry, or `exchange` to
   *  follow whatever venue the symbol resolves to. */
  timezone(): string
  /** Set the choice. A value the chart's registry does not carry is refused, because the axis
   *  formatters could not label a tick with it. */
  setTimezone(choice: string): void
  /** The zone the choice resolves to for the symbol on screen: the chosen IANA id, or the exchange
   *  zone the resolved symbol declared. Null while `exchange` is chosen and no symbol has resolved. */
  displayTimezone(): string | null
  /** The market's status right now: its session state, what transition is next, and how live the
   *  feed says its data is. Null until the symbol resolves. */
  marketStatus(nowSecs?: number): MarketStatus | null
  /** Which subsession intraday bars are shown for. */
  subsession(): ActiveSubsession
  setSubsession(active: ActiveSubsession): void
  /** Whether this symbol trades outside regular hours at all: what a subsession control asks
   *  before it offers the choice. */
  hasExtendedHours(): boolean
  /** The standing drawing choices the layer consults. ONE record: replace it whole. */
  drawingPreferences(): DrawingPreferences
  setDrawingPreferences(next: DrawingPreferences): void
  indicators: IndicatorsApi
  /** The drawing layer, or null when the drawings feature is off. */
  drawings: ChartDrawingsApi | null
  compare: ChartCompareApi
  replay: ChartReplayApi
  /** The EFFECTIVE appearance tree: the mode's floor, the constructor partial, then every runtime
   *  layer. */
  appearance(): ChartOverrides
  /** Apply an appearance partial at RUNTIME: the top of the precedence ladder. Later calls layer
   *  over earlier ones leaf by leaf, so two hosts' calls compose instead of clobbering. */
  applyAppearance(partial: PartialOverrides): void
  /** The chart's one price formatter, in the chart's language and on the symbol's own grid. */
  formatter(): PriceFormatter
  saveLoad: ChartSaveLoadApi
  /** Pane-composition sync primitives, which a layout drives. */
  sync: ChartPaneSyncApi
  on<K extends keyof ChartEvents>(name: K, callback: ChartEvents[K]): () => void
}

/** What the widget hands one chart. */
export interface ChartInstanceDeps {
  id: string
  /** The pane element this chart fills. The chart creates its own boxes inside it. */
  container: HTMLElement
  datafeed: ChartDatafeed
  saveLoad: ChartSaveLoadAdapter | null
  /** The preference store, already wrapped so a write pings the widget's save-needed debounce. */
  storage: ChartStorage
  i18n: ChartI18n
  theme: ThemeController
  features: ResolvedFeatures
  /** The curated quick-add rows the compare dialog offers. */
  compareSymbols: readonly CompareSymbol[]
  access?: AccessPolicy
  appearance?: PartialOverrides
  indicators: readonly IndicatorInstance[]
  extensions: readonly ChartExtension[]
  marks: boolean
  commands: CommandRegistry
  /** Where the image and glyph drawing tools get their artwork. */
  assets?: DrawingAssetPort
  preferences: Partial<ChartPreferences>
  symbol?: string
  timeframe?: string
  style?: ChartStyleId
  /** The chart resolved a symbol: the widget re-derives its capability plane from it. */
  onSymbolInfo(info: SymbolInfo | null): void
  onConfig(config: DatafeedConfig | null): void
  onSaveConflict(info: SaveConflictInfo): void
  /** The chart painted its first data. */
  onReady(): void
  capabilities(): Capabilities
  /** Charts in the layout, read live; the drawing toolbar offers sync only past one. */
  chartCount(): number
  /** The widget chrome's doors: the search dialog and the indicator settings dialog. The object is
   *  filled once the chrome mounts and answers honestly before that. */
  doors: ChromeDoors
}

export interface ChartInstance {
  handle: ChartHandle
  /** The whole chart as one bitmap: the plot area with its axes, crosshair and every indicator
   *  pane. The renderer composes it; tiling a single series canvas would ship a picture missing
   *  the scales that make it readable. */
  screenshot(): HTMLCanvasElement
  /** Push a theme change through every surface that reads it. */
  repaintTheme(): void
  /** The chart's language changed. */
  relabel(): void
  dispose(): void
}

/** Storage keys. Every one flows through the `ChartStorage` port and nothing else: where a viewer's
 *  preferences live is the host's decision, and the chart has no business assuming a browser store
 *  of any kind. */
const SYMBOL_KEY = 'trdrs.chart.widget.symbol.v1'
const TF_KEY = 'trdrs.chart.widget.tf.v1'
const STYLE_KEY = 'trdrs.chart.widget.style.v1'
const SCALE_KEY = 'trdrs.chart.widget.scale.v1'
const HIDDEN_KEY = 'trdrs.chart.widget.indHidden.v1'
const REPLAY_SPEED_KEY = 'trdrs.chart.widget.replaySpeed.v1'
const REPLAY_INTERVAL_KEY = 'trdrs.chart.widget.replayIv.v1'
const TIMEZONE_KEY = 'trdrs.chart.widget.timezone.v1'
const SUBSESSION_KEY = 'trdrs.chart.widget.subsession.v1'

export function createChartInstance(deps: ChartInstanceDeps): ChartInstance {
  const { datafeed, storage, i18n } = deps
  let disposed = false
  const disposedFn = (): boolean => disposed
  const events = createEmitter<ChartEvents>()

  // ── State more than one plane reads. Everything else lives in the plane that owns it. ────────
  let symbol = deps.symbol ?? storage.get(SYMBOL_KEY) ?? deps.preferences.symbol ?? ''
  let tf = deps.timeframe ?? storage.get(TF_KEY) ?? deps.preferences.timeframe ?? '1m'
  let style: ChartStyleId = deps.style ?? coerceChartStyle(storage.get(STYLE_KEY) ?? deps.preferences.style)
  let scaleMode: ScaleMode = coerceScaleMode(storage.get(SCALE_KEY) ?? deps.preferences.scaleMode)
  /** The viewer's timezone CHOICE: an IANA id, or `exchange` to follow the symbol's own venue. It
   *  is what persists, because a resolved zone would go stale the moment the symbol changed. */
  let timezoneChoice: string = readTimezoneChoice()
  /** The zone that choice resolves to for the symbol on screen; null while it cannot be resolved. */
  let displayZone: string | null = null
  /** The full ascending bar series the chart has LOADED (snapshot, prepended pages, live updates).
   *  It keeps everything the feed served; what is drawn from it is `shownBars()`. */
  let bars: FeedBar[] = []
  /** The replay cursor's slice while replay is on, else null. It is what gets PAINTED; the loaded
   *  model above is untouched, so exiting replay gives it back whole. */
  let replaySlice: FeedBar[] | null = null
  let unsubscribe: (() => void) | null = null
  let noMoreHistory = false
  let paging = false
  let ready = false
  /** The feed's last reported status for this subscription; null until it has spoken. */
  let feedStatus: string | null = null
  /** The resolved symbol, held because the session status, the display timezone and the capability
   *  plane all read facts off it after the resolve lands. */
  let symbolInfo: SymbolInfo | null = null
  /** The resolved symbol's price format, null until resolve() states one. */
  let symbolFormat: PriceFormat | null = null
  /** The feed's stated depth of history for the symbol (epoch seconds of its earliest bar), or
   *  null while unknown: the range presets withhold nothing on an unknown depth. */
  let earliestBarSecs: number | null = null
  /** The transport bar while replay is on, mounted by this chart from the plane's change signal
   *  so the replay plane owns no DOM. */
  let replayBar: ReplayTransportHandle | null = null
  /** THE price formatter: one per symbol, in the chart's language. The price scale, the crosshair
   *  and last-price labels, the legend rows, the level menu, the drawing labels, the study scales
   *  and the extension seam all write through it, so no surface carries its own precision. */
  let symbolFormatter: PriceFormatter = createPriceFormatter(UNRESOLVED_PRICE_FORMAT, { locale: i18n.tag() })
  /** Increments on every symbol or timeframe switch and at dispose; stale async work checks it. */
  let epoch = 0
  /** The level the open menu was raised at, so a copy runs on that and not on wherever the pointer
   *  wandered to while the menu was up. */
  let menuLevel: number | null = null
  /** The standing drawing choices. ONE copy: the layer consults it through a getter, and a rail or
   *  a host control changes it through `setDrawingPreferences`, so nothing can drift out of step. */
  let drawingPrefs: DrawingPreferences = readDrawingPreferences()

  // ── The appearance ladder. Floor: the built-in defaults, tinted by the mode's series pair, with
  // candle borders left INVISIBLE until some layer names a border color. Above it: the host's
  // constructor partial, then every runtime layer.
  let runtimePartial: PartialOverrides = {}
  const canvas = (): CanvasTheme => canvasTheme(deps.theme.get())
  const themeFloor = (): ChartOverrides => {
    const c = canvas()
    return layerOverrides(DEFAULT_OVERRIDES, {
      appearance: {
        background: c.background,
        upColor: c.up,
        downColor: c.down,
        borderUpColor: c.up,
        borderDownColor: c.down,
        wickUpColor: c.up,
        wickDownColor: c.down,
      },
    })
  }
  let eff: ChartOverrides = layerOverrides(themeFloor(), deps.appearance, runtimePartial)
  /** True when a HOST-STATED layer names the leaf: the explicitness signal for a look that only
   *  engages once someone asks, which is what candle borders are. */
  const overrideNamed = (leaf: keyof ChartOverrides['appearance']): boolean =>
    [deps.appearance, runtimePartial].some((p) => !!p?.appearance && leaf in p.appearance)
  const candleBordersOn = (): boolean => overrideNamed('borderUpColor') || overrideNamed('borderDownColor')
  const paint = (): StylePaint => ({ appearance: eff.appearance, canvas: canvas(), candleBorders: candleBordersOn() })

  // ── DOM. The chart owns two SIBLING boxes inside its pane; the split is load-bearing and the
  // stylesheet's own comment carries why.
  const gestures = document.createElement('div')
  gestures.className = 'qc-gestures'
  const chrome = document.createElement('div')
  chrome.className = 'qc-chrome'
  deps.container.append(gestures, chrome)

  const chart: IChartApi = createRenderer(gestures, {
    autoSize: true,
    localization: { locale: i18n.tag() },
    layout: {
      background: { type: ColorType.Solid, color: eff.appearance.background },
      textColor: canvas().axisText,
      // From the shared type scale: canvas text is outside the stylesheet's reach and would
      // otherwise drift alone.
      fontSize: canvas().fontSize,
      fontFamily: canvas().fontFamily,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: canvas().grid, visible: eff.appearance.grid },
      horzLines: { color: canvas().grid, visible: eff.appearance.grid },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 8, minBarSpacing: 0.5 },
  })

  /** The anchor: an invisible line of closes on the main price scale. It exists so that everything
   *  with a long life can bind to ONE series and survive a style switch, and it draws nothing. */
  const anchor: ISeriesApi<'Line'> = chart.addSeries(LineSeries, {
    visible: false,
    lastValueVisible: false,
    priceLineVisible: false,
    crosshairMarkerVisible: false,
  })
  let series: ISeriesApi<SeriesType> = addStyleSeries(chart, style, paint())
  const volume: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume' })
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
  if (scaleMode !== 'normal') chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[scaleMode] })

  /** The style series when it is candle-shaped. A study that recolors bar bodies needs a series that
   *  has bodies; the other five styles answer null rather than a series that cannot take the paint. */
  const candleSeries = (): ISeriesApi<'Candlestick'> | null =>
    style === 'candles' || style === 'hollow' ? (series as ISeriesApi<'Candlestick'>) : null

  /** The style series' price format IS the symbol formatter: the price scale, the crosshair label
   *  and the last-price label all write through it, on the symbol's own grid. */
  const applyPriceFormat = (): void => {
    const format = symbolFormat ?? UNRESOLVED_PRICE_FORMAT
    const priceFormat = { type: 'custom' as const, formatter: (price: number) => symbolFormatter.format(price), minMove: minMoveOf(format) }
    series.applyOptions({ priceFormat })
    anchor.applyOptions({ priceFormat })
  }

  const formatKey = (): string => `${JSON.stringify(symbolFormat ?? UNRESOLVED_PRICE_FORMAT)}@${i18n.tag()}`
  const minMove = (): number => minMoveOf(symbolFormat ?? UNRESOLVED_PRICE_FORMAT)

  // ── The sync bus. Driving a chart through the setters MUTES its own subscriptions for the
  // duration, so a layout mirroring chart A onto chart B never hears B echo the change back. The
  // renderer fires these synchronously, which is what makes the flag work.
  let syncMuted = false
  const muted = (write: () => void): void => {
    syncMuted = true
    try {
      write()
    } finally {
      syncMuted = false
    }
  }
  const crosshairSubs = new Set<(time: number | null) => void>()
  const timeClickSubs = new Set<(time: number) => void>()
  const rangeSubs = new Set<(range: TimeRange) => void>()

  const ranges: RangeApi = createRangeApi({ chart, disposed: disposedFn, muted })

  /** Resolve the viewer's timezone CHOICE against the symbol on screen and re-label the axis and
   *  the crosshair through it. Both formatters carry the widget's locale tag, so the month a tick
   *  writes and the language a menu reads are never two different answers. */
  function applyTimezone(): void {
    if (disposed) return
    const zone = resolveDisplayTimezone(timezoneChoice, symbolInfo) ?? DEFAULT_TIMEZONE
    const changed = zone !== displayZone
    displayZone = zone
    chart.applyOptions({
      localization: { locale: i18n.tag(), timeFormatter: makeCrosshairTimeFormatter(i18n.tag(), zone, isIntradayTimeframe(tf)) },
      timeScale: { tickMarkFormatter: makeTickMarkFormatter(i18n.tag(), zone) },
    })
    if (changed) events.emit('timezone', timezoneChoice)
  }

  function applyScaleMode(next: ScaleMode): void {
    if (disposed || next === scaleMode) return
    scaleMode = next
    chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[next] })
    storage.set(SCALE_KEY, next)
    legend.syncScale(next)
    events.emit('scaleMode', next)
  }

  // ── Planes. Declared in dependency order; every cross-reference is a getter or a callback, so a
  // plane created earlier can still reach one created later by the time it is called.
  const indicators: IndicatorsPlane = attachIndicatorsPlane({
    chart,
    candleSeries,
    // A study drawn over bars the active subsession hides would not line up with the series beside
    // it, so it computes over the painted model rather than the loaded one.
    bars: () => shownBars(),
    i18n,
    formatter: () => symbolFormatter,
    formatKey,
    minMove,
    canvas,
    access: deps.access,
    disposed: disposedFn,
    onChips: () => legend.push(),
    onEvent: (event) => events.emit('indicator', event),
  })

  const session = attachSession({
    chart,
    series: () => anchor,
    enabled: () => deps.features.sessions && eff.appearance.sessions,
    timeframe: () => tf,
    theme: () => deps.theme.get(),
    dataStatus: () => symbolInfo?.dataStatus ?? null,
    initialSubsession: readSubsession(),
    onSubsession: (active) => {
      storage.set(SUBSESSION_KEY, active)
      // The filter decides which intraday bars are shown, so the painted model changes with it.
      paintAll()
      events.emit('subsession', active)
    },
  })

  const compare = deps.features.compare
    ? attachComparePlane({
        chart,
        datafeed,
        i18n,
        openSearch: (mode, changeFrom, onPick) => deps.doors.openSearch({ mode, chart: handle, changeFrom, onPick }),
        symbol: () => symbol,
        timeframe: () => tf,
        mainWindow: () => (bars.length ? { from: bars[0]!.t, to: bars[bars.length - 1]!.t } : null),
        scaleMode: () => scaleMode,
        applyScaleMode,
        curated: deps.compareSymbols,
        enabled: true,
        disposed: disposedFn,
        onChips: () => legend.push(),
        onEvent: (entries) => events.emit('compare', entries),
      })
    : null

  const legend = attachLegendPlane({
    commands: deps.commands,
    chart,
    chrome,
    i18n,
    enabled: deps.features.legend,
    marketStatus: deps.features.marketStatus,
    indicators,
    compare,
    scaleMode: () => scaleMode,
    sessionModel: () => session.model(),
    status: (nowSecs) => session.status(nowSecs),
    openIndicatorSettings: (id) => deps.doors.openIndicatorSettings(handle, id),
  })

  // ── W4-B: the drawing plane, its toolbar and its settings surfaces ──────────────────────────
  // The plane CONSULTS the standing choices through the chart's one record and writes them back
  // through the same setter the handle exposes, so a toolbar and the layer cannot disagree about
  // what "weak magnet" or "stay in drawing mode" does, and a host reading `drawingPreferences()`
  // sees what the toolbar shows.
  const drawings = attachDrawingsPlane({
    chart,
    series: anchor,
    container: gestures,
    chrome,
    chartId: deps.id,
    symbol,
    timeframe: tf,
    bars: () => bars,
    resources: deps.saveLoad,
    i18n,
    enabled: deps.features.drawings,
    toolbar: deps.features.drawingsToolbar,
    favorites: deps.features.drawingsFavorites,
    access: deps.access,
    commands: deps.commands,
    assets: deps.assets,
    preferences: () => drawingPrefs,
    setPreferences: (next) => handle.setDrawingPreferences(next),
    indicators: { count: () => indicators.list().length, setAllHidden: (hidden) => indicators.setAllHidden(hidden) },
    chartCount: deps.chartCount,
    onSaveConflict: (info) => deps.onSaveConflict({ family: 'drawings', ...info }),
    onChange: (kind, id) => events.emit('drawing', { kind, id }),
  })
  // ── end W4-B ────────────────────────────────────────────────────────────────────────────────

  const marks = deps.marks
    ? attachMarks({
        chart,
        series: () => anchor,
        symbol: () => symbol,
        timeframe: () => tf,
        theme: () => deps.theme.get(),
        fetchBarMarks: datafeed.marks ? (s, from, to, resolution) => datafeed.marks!(s, from, to, resolution) : null,
        fetchTimescaleMarks: datafeed.timescaleMarks ? (s, from, to, resolution) => datafeed.timescaleMarks!(s, from, to, resolution) : null,
        disposed: disposedFn,
      })
    : null

  const replay = attachReplayPlane({
    chart,
    datafeed,
    symbol: () => symbol,
    timeframe: () => tf,
    // Replay runs over the model a viewer can SEE, so its cursor and total never count a bar the
    // active subsession hides and a step never lands on one that paints nothing.
    bars: () => shownBars(),
    visible: (epochSecs) => {
      const filter = session.barFilter(tf)
      return filter ? filter(epochSecs) : true
    },
    paint: (next) => {
      replaySlice = next
      paintAll()
    },
    clearSlice: () => {
      replaySlice = null
      paintAll()
    },
    enabled: deps.features.replay,
    disposed: disposedFn,
    setHeader: (replaying) => legend.setHeader(symbol, replaying ? i18n.t('host.replayHeader', { tf }) : tf),
    persist: (key, value) => storage.set(key === 'speed' ? REPLAY_SPEED_KEY : REPLAY_INTERVAL_KEY, value),
    onChange: () => {
      const state = replay.snapshot()
      // The transport bar rides replay: mounted when replay comes on, taken down when it leaves,
      // and re-read on every change in between. It states every intent by command id.
      if (state.on && !replayBar && deps.features.replay) {
        replayBar = mountReplayTransport({ chrome, i18n, commands: deps.commands, handle, bars: () => bars, intraday: () => isIntradayTimeframe(tf) })
      } else if (!state.on && replayBar) {
        replayBar.destroy()
        replayBar = null
      }
      replayBar?.sync()
      extensions.host.replayChanged({ active: state.on, cursor: state.cursor, total: state.total })
      events.emit('replay', state)
    },
    initialSpeed: coerceReplaySpeed(storage.get(REPLAY_SPEED_KEY) ?? deps.preferences.replaySpeed),
    initialInterval: storage.get(REPLAY_INTERVAL_KEY) ?? deps.preferences.replayInterval ?? 'auto',
  })

  const extensions = attachExtensionsPlane({
    chartId: deps.id,
    chart,
    series: () => anchor,
    gestures,
    chrome,
    symbol: () => symbol,
    timeframe: () => tf,
    // What an extension reads is what is DRAWN: the same filtered model every paint path uses, so
    // an overlay can never be placed against a bar that is not on screen.
    bars: () => shownBars(),
    replay: () => {
      const state = replay.snapshot()
      return { active: state.on, cursor: state.cursor, total: state.total }
    },
    feedStatus: () => feedStatus,
    theme: canvas,
    formatter: () => ({ format: (price) => symbolFormatter.format(price), precision: () => symbolFormatter.precision() }),
    commands: deps.commands,
    extensions: deps.extensions,
    disposed: disposedFn,
    setTouchAction: (value) => {
      gestures.style.touchAction = value
    },
  })

  const menu = deps.features.contextMenu
    ? attachMenuPlane({
        chart,
        series: () => anchor,
        gestures,
        chrome,
        i18n,
        commands: deps.commands,
        formatter: () => symbolFormatter,
        minMove,
        symbol: () => symbol,
        timeframe: () => tf,
        indicatorCount: () => indicators.list().length,
        drawingCount: () => drawings.handle?.count() ?? 0,
        extensions: () => extensions.host,
        setLevel: (price) => {
          menuLevel = price
        },
      })
    : null

  const pointer = menu
    ? attachPointerPlane({
        gestures,
        toolArmed: () => drawings.handle?.activeTool() != null,
        disposed: disposedFn,
        raiseAt: (x, y) => menu.raiseAt(x, y),
      })
    : null

  if (menu) {
    gestures.addEventListener('contextmenu', (e) => {
      if (menu.raiseAt(e.clientX, e.clientY)) e.preventDefault()
    })
  }

  // The on-chart navigation cluster: zoom, scroll and reset over the chart's own view commands.
  const nav = deps.features.navigation ? mountNavControls({ chrome, commands: deps.commands, i18n }) : null

  // ── Painting ─────────────────────────────────────────────────────────────────────────────────
  /** The bars actually PAINTED: the loaded model, filtered to the active subsession on an intraday
   *  timeframe, or the replay cursor's slice while replay is on. A daily or larger bar spans whole
   *  sessions, so it is never filtered. */
  function shownBars(): FeedBar[] {
    if (replaySlice) return replaySlice
    const filter = session.barFilter(tf)
    return filter ? bars.filter((b) => filter(b.t)) : bars
  }

  function paintAll(): void {
    const shaped = valueShaped(style)
    const painted = shownBars()
    const values = painted.map((b) => ({ time: b.t as UTCTimestamp, value: b.c }))
    anchor.setData(values)
    series.setData(
      (shaped ? values : painted.map((b) => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c }))) as never,
    )
    const up = eff.appearance.upColor
    const down = eff.appearance.downColor
    volume.setData(painted.map((b) => ({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? up : down })))
    indicators.recompute()
    // Compares clip to the main window, so every reshape re-clips them here: paintAll is the one
    // choke point every load, scroll-back, snapshot and replay path exits by.
    compare?.sync()
    // An extension sees what is DRAWN. A bar the active subsession filters out is not on screen,
    // and an overlay placed against it would sit where there is nothing.
    extensions.host.barsChanged(painted)
    events.emit("dataLoaded", { bars: painted.length })
  }

  function paintLast(b: FeedBar): void {
    // A tick the active subsession hides is not part of the picture. Painting it here and dropping
    // it on the next full repaint would show a bar that flickers in and back out, which reads as a
    // glitch rather than as a filter doing its job.
    const filter = session.barFilter(tf)
    if (filter && !filter(b.t)) return
    const value = { time: b.t as UTCTimestamp, value: b.c }
    anchor.update(value)
    series.update((valueShaped(style) ? value : { time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c }) as never)
    volume.update({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? eff.appearance.upColor : eff.appearance.downColor })
    indicators.recomputeThrottled()
    extensions.host.barsChanged(shownBars())
  }

  /** Rebuild the formatter (a resolve, a symbol switch, a language switch) and push it to every
   *  surface that holds a reference rather than reading it live. */
  const setSymbolFormat = (format: PriceFormat | null): void => {
    symbolFormat = format
    symbolFormatter = createPriceFormatter(format ?? UNRESOLVED_PRICE_FORMAT, { locale: i18n.tag() })
    applyPriceFormat()
    drawings.setPricing(format ? minMoveOf(format) : null, (price) => symbolFormatter.format(price))
  }

  /** Re-resolve the ladder and restyle every surface that reads it: the runtime half of the
   *  precedence contract. Everything here is a repaint, never a rebuild. The getter-driven surfaces
   *  (session bands, marks, extensions reading the theme lane) pick the new values up on their next
   *  draw. */
  function applyLook(): void {
    eff = layerOverrides(themeFloor(), deps.appearance, runtimePartial)
    const c = canvas()
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: eff.appearance.background },
        textColor: c.axisText,
        fontSize: c.fontSize,
        fontFamily: c.fontFamily,
      },
      grid: {
        vertLines: { color: c.grid, visible: eff.appearance.grid },
        horzLines: { color: c.grid, visible: eff.appearance.grid },
      },
    })
    series.applyOptions(styleOptions(style, paint()) as never)
    session.refresh()
    marks?.repaint()
    extensions.host.themeChanged(c)
  }

  // ── Data ─────────────────────────────────────────────────────────────────────────────────────
  /** One older-history fetch with the gap hop: an empty page carrying nextTime re-asks once
   *  anchored there; only the `end` verdict is the true end of history. */
  async function fetchOlder(to: number): Promise<{ olderBars: FeedBar[]; end: boolean }> {
    const page = await datafeed.history(symbol, tf, { to, countBack: PAGE_BARS })
    const verdict = olderPageVerdict(page, to, false)
    if (verdict.kind !== 'hop') return { olderBars: page.bars, end: verdict.kind === 'end' }
    const hop = await datafeed.history(symbol, tf, { to: verdict.to, countBack: PAGE_BARS })
    return { olderBars: hop.bars, end: olderPageVerdict(hop, verdict.to, true).kind === 'end' }
  }

  const refreshMarks = (): void => {
    if (!marks || bars.length === 0) return
    marks.refresh({ from: bars[0]!.t, to: bars[bars.length - 1]!.t })
  }

  /** Fetch the page older than the current left edge and prepend it while HOLDING the visible
   *  window in place. Stops for good at the feed's true end of history. */
  function maybePageBack(): void {
    if (replay.active()) return // the replay window is fixed; paging would desync the master set
    if (paging || noMoreHistory || bars.length === 0) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range || range.from > PAGE_TRIGGER_BARS) return
    paging = true
    const myEpoch = epoch
    const oldest = bars[0]!.t
    void fetchOlder(oldest - 1)
      .then(({ olderBars, end }) => {
        if (disposed || myEpoch !== epoch) return
        if (end) noMoreHistory = true
        const older = olderBars.filter((b) => b.t < oldest)
        if (older.length === 0) return
        const keep = chart.timeScale().getVisibleRange()
        bars = [...older, ...bars]
        paintAll()
        if (keep) chart.timeScale().setVisibleRange(keep)
        refreshMarks()
      })
      .catch(() => {
        /* transient; the next left-edge approach retries */
      })
      .finally(() => {
        paging = false
      })
  }

  /** (Re)load the active symbol and timeframe: initial history paints first, then the live
   *  subscription's snapshot replaces it and bar events mutate or append. A FeedUnavailableError is
   *  terminal for this symbol; any other history failure leaves the subscription to seed the chart
   *  through its own snapshot. */
  function load(): void {
    const myEpoch = ++epoch
    unsubscribe?.()
    unsubscribe = null
    bars = []
    noMoreHistory = false
    feedStatus = null // the new subscription reports its own status; a stale one must not carry over
    symbolInfo = null
    earliestBarSecs = null
    session.reset() // the next resolve states the new symbol's model, and unresolved never bands
    marks?.clear()
    setSymbolFormat(null) // until the next resolve, the declared stand-in
    replay.abandon() // a replay window is symbol and timeframe bound; the switch invalidates it
    replaySlice = null // and its cursor slice with it: the new symbol paints from its own model
    paintAll()
    if (!symbol) return
    // Symbol metadata rides ALONGSIDE the first history ask, never blocking it. A failed resolve
    // leaves the price format and the session model at their honest unknowns.
    void datafeed
      .resolve(symbol)
      .then((info) => {
        if (disposed || myEpoch !== epoch || !info) return
        symbolInfo = info
        setSymbolFormat(info.format)
        indicators.recompute() // study scales and rows re-read the formatter
        session.adopt(info)
        legend.setDot(session.state())
        // The choice is the viewer's; what it RESOLVES to follows the symbol, so a chart set to
        // `exchange` re-labels its axis on every symbol switch without the choice moving.
        applyTimezone()
        deps.onSymbolInfo(info)
      })
      .catch(() => {
        /* metadata is an enhancement; the chart works without it */
      })
    // The feed's depth of history rides beside the resolve, and only a feed that states one is
    // asked. It gates the range presets; nothing else waits on it.
    if (datafeed.earliestBar) {
      void datafeed
        .earliestBar(symbol)
        .then((secs) => {
          if (disposed || myEpoch !== epoch) return
          earliestBarSecs = typeof secs === 'number' && Number.isFinite(secs) ? secs : null
        })
        .catch(() => {
          /* an unknown depth withholds no preset */
        })
    }
    void datafeed
      .history(symbol, tf, { countBack: SNAPSHOT_BARS })
      .then((page) => {
        if (disposed || myEpoch !== epoch) return
        bars = [...page.bars]
        paintAll()
        chart.timeScale().fitContent()
        refreshMarks()
        if (!ready) {
          ready = true
          deps.onReady()
        }
      })
      .catch((e) => {
        if (disposed || myEpoch !== epoch) return
        if (e instanceof FeedUnavailableError) {
          feedStatus = 'feed_unavailable'
          events.emit('feedStatus', 'feed_unavailable')
          return // terminal: do not open a live subscription for a symbol nothing serves
        }
        // Transient history failure: the subscription snapshot below still seeds the chart.
        openSubscription(myEpoch)
      })
      .then(() => {
        if (!disposed && myEpoch === epoch && unsubscribe === null) openSubscription(myEpoch)
      })
  }

  function openSubscription(myEpoch: number): void {
    if (disposed || myEpoch !== epoch) return
    unsubscribe = datafeed.subscribeBars(symbol, tf, {
      onBars: (e) => {
        if (disposed || myEpoch !== epoch) return
        // While replaying, the painted slice stays put and the replay master accumulates off-screen
        // so Go live and exit can catch up. The LOADED model below takes the update either way:
        // what the feed served is not the cursor's business, and exiting must give it all back.
        const replaying = replay.absorb(e)
        if (e.kind === 'snapshot') {
          // The transport's self-healing re-sync: the snapshot replaces the RECENT window; bars
          // paged in further back stay, because they are older than the snapshot's first bar.
          const first = e.bars[0]?.t
          bars = first === undefined ? [...e.bars] : [...bars.filter((b) => b.t < first), ...e.bars]
          if (!replaying) paintAll()
        } else {
          const next = applyBar(bars, e.bar)
          if (next) {
            bars = next
            if (!replaying) paintLast(e.bar)
          }
        }
      },
      onStatus: (status) => {
        if (disposed || myEpoch !== epoch) return
        feedStatus = status
        events.emit('feedStatus', status)
      },
    })
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
    maybePageBack()
    if (syncMuted) return
    const range = ranges.logicalRange()
    if (range) events.emit('logicalRange', range)
  })
  chart.subscribeCrosshairMove((param) => {
    if (syncMuted || crosshairSubs.size === 0) return
    const t = typeof param.time === 'number' ? param.time : null
    for (const cb of crosshairSubs) cb(t)
  })
  chart.subscribeClick((param) => {
    if (syncMuted || typeof param.time !== 'number') return
    for (const cb of timeClickSubs) cb(param.time)
  })
  chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (syncMuted || !range) return
    const next: TimeRange = { from: range.from as number, to: range.to as number }
    for (const cb of rangeSubs) cb(next)
    events.emit('visibleRange', next)
  })

  // ── The handle ───────────────────────────────────────────────────────────────────────────────
  function setStyle(next: ChartStyleId): void {
    if (disposed || next === style) return
    // A style switch is presentation. The loaded bars, the indicators, the drawings, the compares,
    // the scale and the visible range all survive it, and nothing refetches: only the visible
    // series is replaced, and the same bar model is painted into the new one. Everything with a
    // long life is bound to the anchor, so nothing else here is torn down.
    const keep = chart.timeScale().getVisibleLogicalRange()
    const previous = series
    style = next
    storage.set(STYLE_KEY, next)
    series = addStyleSeries(chart, next, paint())
    applyPriceFormat()
    try {
      chart.removeSeries(previous)
    } catch {
      /* the renderer already dropped it */
    }
    paintAll()
    if (keep) chart.timeScale().setVisibleLogicalRange(keep)
    events.emit('style', next)
  }

  function applyContent(parsed: ParsedChartContent): void {
    if (parsed.symbol) handle.setSymbol(parsed.symbol)
    if (parsed.timeframe) handle.setTimeframe(parsed.timeframe)
    if (parsed.style) setStyle(coerceChartStyle(parsed.style))
    applyScaleMode(coerceScaleMode(parsed.scale ?? null))
    indicators.setHidden(parsed.hidden ?? [])
    storage.set(HIDDEN_KEY, JSON.stringify(indicators.hidden()))
    // The saved appearance applies as a RUNTIME layer: a viewer's saved look beats the host's
    // constructor values, exactly the precedence the option contract states.
    if (parsed.appearance) handle.applyAppearance({ appearance: parsed.appearance })
    // Compares restore AFTER the scale: the blob's own scale is the truth of how it was saved, so
    // the policy only re-arms the flip-back for compares the restore brings in.
    compare?.restore(parsed.compares)
    // Extensions restore LAST: the symbol, timeframe and scale a saved chart carries are the world
    // an extension's state describes, so it must already be the world on screen.
    extensions.host.restore(parsed.ext)
  }

  const saveLoad = createSaveLoadApi({
    adapter: deps.saveLoad,
    i18n,
    symbol: () => symbol,
    timeframe: () => tf,
    content: () => ({
      symbol,
      timeframe: tf,
      style,
      scale: scaleMode,
      hidden: indicators.hidden(),
      appearance: eff.appearance,
      compares: compare?.serialize() ?? [],
      // Extension state rides in its own namespace, keyed by extension id, so a chart saved with
      // one set of extensions loads under another without either reading the other's state.
      ext: extensions.host.serialize(),
    }),
    apply: applyContent,
    disposed: disposedFn,
  })

  const handle: ChartHandle = {
    id: deps.id,
    symbol: () => symbol,
    setSymbol(next) {
      if (disposed || next === symbol) return
      symbol = next
      storage.set(SYMBOL_KEY, next)
      drawings.setSymbol(next)
      legend.setHeader(symbol, tf)
      events.emit('symbol', next)
      // Before the load: a symbol-scoped extension re-attaches against the new market, so its first
      // sight of the chart is the new symbol's empty buffer rather than the old symbol's bars.
      extensions.host.symbolChanged(next)
      load()
    },
    timeframe: () => tf,
    setTimeframe(next) {
      if (disposed || next === tf) return
      tf = next
      storage.set(TF_KEY, next)
      drawings.setTimeframe(next)
      legend.setHeader(symbol, tf)
      events.emit('timeframe', next)
      extensions.host.timeframeChanged(next)
      load()
      compare?.setTimeframe()
    },
    style: () => style,
    setStyle,
    visibleRange: () => ranges.visibleRange(),
    setVisibleRange: (range) => ranges.setVisibleRange(range),
    logicalRange: () => ranges.logicalRange(),
    setLogicalRange: (range) => ranges.setLogicalRange(range),
    scroll: (barCount) => ranges.scroll(barCount),
    zoom: (factor) => ranges.zoom(factor),
    reset: () => ranges.reset(),
    goLive: () => ranges.goLive(),
    scaleMode: () => scaleMode,
    setScaleMode(mode) {
      applyScaleMode(mode)
      compare?.releaseScaleLoan()
    },
    timezone: () => timezoneChoice,
    setTimezone(choice) {
      // The CHOICE is what a host sets and what persists: an IANA id, or `exchange` to follow
      // whatever venue the symbol resolves to. A choice outside the chart's registry is refused
      // rather than written, because a zone the formatters cannot honor would silently mislabel
      // every axis tick.
      if (disposed || choice === timezoneChoice || !isTimezoneChoice(choice)) return
      timezoneChoice = choice
      storage.set(TIMEZONE_KEY, choice)
      applyTimezone()
    },
    displayTimezone: () => resolveDisplayTimezone(timezoneChoice, symbolInfo),
    marketStatus: (nowSecs?: number) => session.status(nowSecs),
    subsession: () => session.subsession(),
    setSubsession: (active: ActiveSubsession) => session.setSubsession(active),
    hasExtendedHours: () => session.extended(),
    drawingPreferences: () => drawingPrefs,
    setDrawingPreferences(next: DrawingPreferences) {
      if (disposed) return
      drawingPrefs = next
      storage.set(DRAWING_PREFERENCES_KEY, serializeDrawingPreferences(next))
      drawings.refresh()
    },
    indicators: {
      get: () => indicators.list(),
      set: (instances) => indicators.set(instances),
      add: (instance) => indicators.add(instance),
      remove: (id) => indicators.remove(id),
      hide(id) {
        if (!indicators.isHidden(id)) indicators.toggleHidden(id)
        storage.set(HIDDEN_KEY, JSON.stringify(indicators.hidden()))
      },
      show(id) {
        if (indicators.isHidden(id)) indicators.toggleHidden(id)
        storage.set(HIDDEN_KEY, JSON.stringify(indicators.hidden()))
      },
      hidden: () => indicators.hidden(),
    },
    drawings: drawings.api,
    compare: compare?.api ?? {
      add: () => undefined,
      remove: () => undefined,
      setVisible: () => undefined,
      list: () => [],
      latest: () => null,
      symbols: () => [],
    },
    replay: replay.api,
    appearance: () => eff,
    applyAppearance(partial) {
      if (disposed) return
      // Runtime layers ACCUMULATE leaf by leaf: a later call restyles what it names and leaves the
      // rest of the runtime layer standing, so two hosts' calls compose instead of clobbering.
      runtimePartial = { appearance: { ...runtimePartial.appearance, ...(partial.appearance ?? {}) } }
      applyLook()
    },
    formatter: () => symbolFormatter,
    saveLoad,
    sync: {
      onCrosshair(cb) {
        crosshairSubs.add(cb)
        return () => crosshairSubs.delete(cb)
      },
      setCrosshair(time) {
        if (disposed) return
        muted(() => {
          // Anchor at this chart's own bar for the moment (its close), the nearest earlier bar when
          // feeds tick on different clocks. No bar for that moment clears instead of guessing.
          let bar: FeedBar | undefined
          if (time !== null)
            for (let i = bars.length - 1; i >= 0; i--) {
              const b = bars[i]!
              if (b.t <= time) {
                bar = b
                break
              }
            }
          if (bar) chart.setCrosshairPosition(bar.c, bar.t as UTCTimestamp, anchor)
          else chart.clearCrosshairPosition()
        })
      },
      onTimeClick(cb) {
        timeClickSubs.add(cb)
        return () => timeClickSubs.delete(cb)
      },
      onVisibleRange(cb) {
        rangeSubs.add(cb)
        return () => rangeSubs.delete(cb)
      },
    },
    on: (name, callback) => events.on(name, callback),
  }

  // ── Opening state. Everything above is wiring; these are the first values on screen. ──────────
  setSymbolFormat(null)
  legend.setHeader(symbol, tf)
  legend.syncScale(scaleMode)
  indicators.setHidden(readHidden())
  indicators.set(deps.indicators)

  const unregisterCommands = registerChartCommands({
    commands: deps.commands,
    handle,
    features: deps.features,
    capabilities: deps.capabilities,
    t: () => i18n.t,
    // The feed's own statement of how deep its history goes, never the oldest bar that happens to
    // be loaded: the chart opens on a short window, and a preset judged against that would be
    // withheld for a market that serves years.
    earliestBar: () => earliestBarSecs,
    // A range preset frames the pane on its span AND switches to the timeframe that span reads
    // best at, which is what makes one chip a whole answer rather than half of one.
    frame: (preset) => {
      if (preset.tf !== tf) handle.setTimeframe(preset.tf)
      frameRange(chart, anchor, preset.span, preset.tf)
    },
    zoom: (direction) => {
      const spacing = chart.timeScale().options().barSpacing
      chart.timeScale().applyOptions({ barSpacing: zoomedBarSpacing(spacing, direction) })
    },
    scroll: (direction) => {
      const position = chart.timeScale().scrollPosition()
      chart.timeScale().scrollToPosition(scrolledPosition(position, direction), false)
    },
    level: () => menuLevel,
    formatter: () => symbolFormatter,
    compareOpen: (mode, changeFrom) => compare?.openDialog(mode, changeFrom),
    drawingVerbs: () => drawings.verbs,
  })

  // The initial load waits on the feed's OPTIONAL capability declaration: opening with a sticky
  // timeframe the feed already declared unservable would dead-end the first paint on a refusal. A
  // declaring feed resolves the initial timeframe first (a failed or empty declaration constrains
  // nothing); a feed without config() starts immediately. Epoch 0 means no host-driven load has
  // happened yet, so a setSymbol or setTimeframe that beats a slow config() is the host's explicit
  // choice and wins.
  if (datafeed.config) {
    void datafeed
      .config()
      .catch((): DatafeedConfig => ({}))
      .then((cfg) => {
        if (disposed || epoch !== 0) return
        deps.onConfig(cfg)
        tf = resolveInitialTf(tf, cfg.resolutions)
        drawings.setTimeframe(tf)
        // The header carries the timeframe on screen, and negotiation can move it off the one the
        // host asked for. Leaving it stale makes the legend state a timeframe the chart is not on.
        legend.setHeader(symbol, tf)
        load()
      })
  } else {
    deps.onConfig(null)
    load()
  }

  /** The viewer's timezone choice, or the chart's default. A stored value outside the registry is
   *  ignored rather than honored: the formatters could not label an axis with it. */
  function readTimezoneChoice(): string {
    const stored = storage.get(TIMEZONE_KEY) ?? deps.preferences.timezone
    return stored && isTimezoneChoice(stored) ? stored : DEFAULT_TIMEZONE
  }

  function readSubsession(): ActiveSubsession {
    const stored = storage.get(SUBSESSION_KEY) ?? deps.preferences.subsession
    return stored === 'extended' ? 'extended' : DEFAULT_SUBSESSION
  }

  /** The standing drawing choices. The record's own parser owns every fallback, so a stored value
   *  this build does not recognize degrades to the shipped default rather than to nothing. */
  function readDrawingPreferences(): DrawingPreferences {
    const stored = storage.get(DRAWING_PREFERENCES_KEY)
    if (stored) return parseDrawingPreferences(stored)
    return deps.preferences.drawings ?? DEFAULT_DRAWING_PREFERENCES
  }

  function readHidden(): string[] {
    const stored = storage.get(HIDDEN_KEY)
    if (stored === null || stored === undefined) return [...(deps.preferences.hiddenIndicators ?? [])]
    try {
      const parsed: unknown = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }

  return {
    handle,
    screenshot: () => chart.takeScreenshot(),
    repaintTheme() {
      applyLook()
      legend.setDot(session.state())
    },
    relabel() {
      applyTimezone() // the tick and crosshair formatters carry the language, so they rebuild
      setSymbolFormat(symbolFormat) // the formatter carries the language's decimal sign
      indicators.recompute()
      legend.setHeader(symbol, replay.active() ? i18n.t('host.replayHeader', { tf }) : tf)
      drawings.relabel()
      replayBar?.sync()
    },
    dispose() {
      if (disposed) return
      disposed = true
      epoch++
      unsubscribe?.()
      unsubscribe = null
      unregisterCommands()
      replayBar?.destroy()
      replayBar = null
      nav?.destroy()
      replay.destroy()
      pointer?.destroy()
      // Extensions come down FIRST, while the chart they drew on is still there to take the drawing
      // off. Detaching after the renderer is gone would leave their teardown reaching into nothing.
      extensions.destroy()
      menu?.destroy()
      marks?.destroy()
      compare?.destroy()
      drawings.destroy()
      legend.destroy()
      session.destroy()
      indicators.destroy()
      crosshairSubs.clear()
      timeClickSubs.clear()
      rangeSubs.clear()
      events.clear()
      chart.remove()
      gestures.remove()
      // Any popup or dialog still hosted in the chrome subtree closes with it, taking its document
      // listeners and timers down rather than leaving them bound to a detached panel.
      closeOverlays(chrome)
      chrome.remove()
    },
  }
}
