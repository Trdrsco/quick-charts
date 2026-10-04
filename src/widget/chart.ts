// One chart: the composition root that holds the planes together, and the public handle a host
// drives it through.
//
// A widget hosts one or many of these. Everything a chart owns lives in a plane of its own — data,
// indicators, drawings, compare, replay, session, marks, extensions, the legend, the context menu —
// and this file is the wiring between them plus the handle they add up to. The rule that shapes it:
// a plane never reaches into another plane's state, it asks this file, and this file owns the
// mutable truth (the symbol, the timeframe, the style, the bars, the scale) that more than one
// plane reads. The chart mounts its own navigation cluster and knocks on the widget chrome's doors
// for surfaces it does not own: the replay row, search dialog and indicator settings dialog.
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
  TrackingModeExitMode,
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
import type { ChartExtension, ChartExtensionHost } from '../extension'
import type { CompareEntry, CompareSymbol } from '../compare'
import type { ThemeController } from '../theme/controller'
import { canvasTheme, type CanvasTheme } from '../theme/renderer'
import type { CommandExecutor, CommandRegistry } from './commands'
import { createEmitter, type ChartEvents, type SaveConflictInfo } from './events'
import type { AccessPolicy, Capabilities, ChartPreferences, IndicatorInstance } from './options'
import type { ResolvedFeatures, ResolvedUi } from './planes'
import type { IconResolver } from '../ui/icons/resolver'
import { addStyleSeries, offeredStyle, styleOptions, valueShaped, type ChartStyleId, type StylePaint } from './styles'
import { createBaselineLevel } from './baselineLevel'
import { offeredTimeframe, offersTimeframe, rangeTimeframe, type OfferedTimeframes } from './timeframes'
import {
  captureTimelineContinuity,
  registerChartRangeMirror,
  createRangeApi,
  restoreTimelineContinuity,
  type LogicalRange,
  type RangeApi,
  type TimeRange,
} from './ranges'
import { frameRange, rangeSpanSeconds, scrolledPosition, zoomedBarSpacing, type RangeSpan } from '../ranges'
import { attachSession } from './session'
import { attachDrawingsPlane, type ChartDrawingsApi } from './drawings'
import type { OfferedDrawingTools } from './drawingTools'
import { indicatorOffered, type OfferedIndicators } from './offeredIndicators'
import type { OfferedRanges } from './offeredRanges'
import { offeredTimezone, offersTimezone, type OfferedTimezones } from './offeredTimezones'
import type { DrawingDocumentApi } from '../drawings/layer/types'
import type { DrawingDocumentPort } from '../drawings/layer/documents'
import { attachIndicatorsPlane, type IndicatorCatalog, type IndicatorsPlane } from './indicators'
import { attachHistoryPlane, type ChartHistoryApi } from './history'
import { attachComparePlane, type ChartCompareApi } from './compare'
import { attachReplayPlane, coerceReplaySpeed, type ChartReplayApi } from './replay'
import { attachExtensionsPlane } from './extensions'
import { attachLegendPlane, type ChartLegendRow } from './legend'
import { attachFling } from './fling'
import { attachPinch } from './pinch'
import { watchPlotArea, type PlotArea } from './plotArea'
import { attachMenuPlane } from './menu'
import { commandShown } from './access'
import { symbolNames } from '../symbolLabel'
import { attachPointerPlane } from './pointer'
import { attachMarks } from './marks'
import type { ChromeDoors } from '../ui/chrome/doors'
import { mountNavControls } from '../ui/chrome/navControls'
import { closeOverlays } from '../ui/controls/overlays'
import { coercePriceAxisPolicy, createSaveLoadApi, serializeIndicatorInstance, type ChartContent, type ChartSaveLoadApi, type ParsedChartContent, type PriceAxisPolicy, type SavedIndicator } from './saveLoad'
import { registerChartCommands } from './chartCommands'
import { attachCountdown, createCountdownClock, type CountdownLayer } from './countdown'
import {
  DEFAULT_TIMEZONE,
  makeCrosshairTimeFormatter,
  makeTickMarkFormatter,
  resolveDisplayTimezone,
} from '../timezones'
import { isIntradayTimeframe, parseTimeframe, timeframeSeconds } from '../timeframe'
import { DEFAULT_SUBSESSION, type ActiveSubsession, type MarketStatus } from '../sessionModel'
import {
  DEFAULT_DRAWING_PREFERENCES,
  DRAWING_PREFERENCES_KEY,
  parseDrawingPreferences,
  serializeDrawingPreferences,
  type DrawingAssetPort,
  type DrawingPreferences,
} from '../drawings/index'
import type { MarkPainters } from '../markPainters'

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
/** How many consecutive pages ONE approach of the left edge may fetch without the viewer moving
 *  again. Four pages is 2,000 bars: enough to fill a wide or fast-panned window that a single page
 *  leaves short, and a hard ceiling on the work any one range report can start. A run that spends
 *  it stops, and the next approach opens a new one. */
const PAGE_RUNWAY = 4
/** How deep replay's first available date walks: the most bars one replay session holds. A feed
 *  that serves more starts the session at the oldest bar within this depth. */
const REPLAY_DEPTH = 20_000
/** The page that walk asks for: larger than scrolling's, so a deep walk takes few round trips. */
const REPLAY_PAGE_BARS = 2_000
/** The most bars one ask for a range preset's span may name. */
const SPAN_PAGE_MAX_BARS = 4_000

/** The bars a preset's span covers at its timeframe, with room past the paging trigger so framing
 *  the span does not start a page at once. Null for a span with no length, or a timeframe with no
 *  bar width. */
function barsForSpan(span: RangeSpan, tf: string): number | null {
  const secs = rangeSpanSeconds(span, Math.floor(Date.now() / 1000))
  const parsed = parseTimeframe(tf)
  if (secs === null || !parsed || parsed.unit === 't') return null
  return Math.min(SPAN_PAGE_MAX_BARS, Math.ceil(secs / timeframeSeconds(parsed)) + PAGE_TRIGGER_BARS + 20)
}

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
 *  VIEWER-driven changes only, so a chart being driven through the setters never re-reports the
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
  /** The market as the FEED resolved it, or null while nothing has resolved yet. What a surface
   *  reads to WRITE the symbol: the ticker alone cannot say what a pair is priced in, and a host
   *  that guessed from the string would be inventing a quote the feed never stated. */
  symbolInfo(): SymbolInfo | null
  timeframe(): string
  /** Switch the timeframe. A timeframe the widget does not offer is ignored. */
  setTimeframe(timeframe: string): void
  style(): ChartStyleId
  /** Switch the main-series style. Presentation only: nothing refetches, and the indicators,
   *  drawings, comparisons and visible range all survive. A style the widget does not offer is
   *  ignored. */
  setStyle(id: ChartStyleId): void
  visibleRange(): TimeRange | null
  /** The range preset currently framing this chart, or null after other navigation. */
  rangePreset(): string | null
  setVisibleRange(range: TimeRange): void
  logicalRange(): LogicalRange | null
  setLogicalRange(range: LogicalRange): void
  /** Move the window by whole bars: negative goes back in time. */
  scroll(bars: number): void
  /** Zoom about the window's center. Above 1 shows more bars, below 1 shows fewer. */
  zoom(factor: number): void
  /** Fit the loaded data. */
  reset(): void
  /** Return to the live edge, keeping the current span: a glide that eases into place, moving the
   *  view sideways and never the zoom. A touch, a drag, a wheel or any other navigation ends it
   *  where it stands. */
  goLive(): void
  /** Whether the view sits back from the live edge, scrolled more than a bar behind its resting
   *  place, which is what a control offering the way back reads. A glide under way reads as
   *  returned from its first frame, and bar replay, which has its own way back, reads as returned
   *  throughout. The `liveEdge` event reports each change. */
  awayFromLiveEdge(): boolean
  /** Where the main pane draws its bars, in the pixels of the element the host handed the widget,
   *  or null before the chart has laid out. The `plotArea` event reports each change. */
  plotArea(): PlotArea | null
  scaleMode(): ScaleMode
  setScaleMode(mode: ScaleMode): void
  /** The viewer's display-timezone CHOICE: an IANA id from the chart's registry, or `exchange` to
   *  follow whatever venue the symbol resolves to. */
  timezone(): string
  /** Set the choice. A value the chart's registry does not carry is refused, because the axis
   *  formatters could not label a tick with it, and so is one the widget does not offer. */
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
  /** The low-level separate-drawing document operations: get, apply and reload over this chart's
   *  own drawing-resource context. Null when the drawings feature is off; in combined mode every
   *  verb refuses, because there is no separate document to reach. */
  drawingResources: DrawingDocumentApi | null
  compare: ChartCompareApi
  replay: ChartReplayApi
  /** Stepping back and forward through this chart's own content. Each step is one reading of the
   *  content, so a step back puts the whole reading back rather than reversing one verb. */
  history: ChartHistoryApi
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

/** How ONE chart's drawings are stored, as the widget resolved it. `chartKey` is the chart's place
 *  in the layout, which is the identity a document outlives a re-tile and a reload by; the mode is
 *  the widget's construction-time choice, and there is no path between the two. */
export interface ChartEntityIdentity { current(): string; set(value: string): void }
export type ChartDrawingPersistence = { identity: ChartEntityIdentity } & ({ mode: 'combined' } | { mode: 'separate'; documents: DrawingDocumentPort })

/** What the widget hands one chart. */
export interface ChartInstanceDeps {
  beginHydration?: () => () => void
  /** Report a committed change to this chart's CONTENT, for a surface that changes content without
   *  writing a preference key. Every other content change reaches the widget's debounced
   *  save-needed through the wrapped storage port; appearance has no key of its own, so it says so
   *  here. Hydration-aware and debounced by the widget, exactly as a key write is. */
  contentChanged?: () => void
  id: string
  /** Whether this chart is the widget's active chart, the widget's own fact. */
  active(): boolean
  /** The pane element this chart fills. The chart creates its own boxes inside it. */
  container: HTMLElement
  /** The element the host handed the widget: the box the plot area is reported in. */
  hostContainer: HTMLElement
  /** The widget's layer on the document body, themed as the root is. The context menu mounts here
   *  rather than in this pane's own chrome: it stands over every pane and over whatever the page
   *  stacks around the widget, at viewport coordinates. */
  layer: HTMLElement
  /** An external widget-level drawing toolbar replaces the internal per-chart drawing toolbar. */
  externalDrawingToolbar?: boolean
  datafeed: ChartDatafeed
  saveLoad: ChartSaveLoadAdapter | null
  /** Where this chart's drawings are stored. */
  drawings: ChartDrawingPersistence
  /** The preference store, already wrapped so a write pings the widget's save-needed debounce. */
  storage: ChartStorage
  i18n: ChartI18n
  theme: ThemeController
  features: ResolvedFeatures
  /** Which of the chart's own controls render. */
  ui: ResolvedUi
  /** Draws every glyph the chart's own surfaces draw. */
  icons: IconResolver
  /** The curated quick-add rows the compare dialog offers. */
  compareSymbols: readonly CompareSymbol[]
  access?: AccessPolicy
  appearance?: PartialOverrides
  indicators: readonly IndicatorInstance[]
  /** Private safe presentation copied when the layout creates a sibling. */
  compares?: readonly CompareEntry[]
  /** Definitions carried by any chart in this widget, shared so a saved tile can resolve them. */
  indicatorCatalog: IndicatorCatalog
  extensions: readonly ChartExtension[]
  marks: boolean
  commands: CommandRegistry
  /** This chart's private command target for an origin-bound widget-owned transport. */
  replayCommands: CommandExecutor
  /** Where the image and glyph drawing tools get their artwork. */
  assets?: DrawingAssetPort
  preferences: Partial<ChartPreferences>
  symbol?: string
  timeframe?: string
  style?: ChartStyleId
  /** The styles the widget offers, in the host's order. A style outside them is never set. */
  styles: readonly ChartStyleId[]
  /** The drawing tools the widget offers, or null for every tool. A tool outside them is never
   *  armed, and no copy of a drawing of it is made. */
  drawingTools: OfferedDrawingTools
  /** The built-in indicators the widget offers, or null (or absent) for every built-in. One left out
   *  is never added; an instance of it already on the chart stays. */
  builtInIndicators?: OfferedIndicators
  /** The range presets the widget offers, or absent for every preset. One left out has no command. */
  ranges?: OfferedRanges
  /** The display timezones the widget offers, or null (or absent) for every choice. A choice outside
   *  them is never set, and a stored one outside them opens on the first offered. */
  timezones?: OfferedTimezones
  /** The timeframes the widget offers. A timeframe outside them is never set. */
  timeframes: OfferedTimeframes
  /** The chart resolved a symbol: the widget re-derives its capability plane from it. */
  onSymbolInfo(info: SymbolInfo | null): void
  onConfig(config: DatafeedConfig | null): void
  onSaveConflict(info: SaveConflictInfo): void
  /** The chart painted its first data. */
  onReady(): void
  capabilities(): Capabilities
  /** Charts in the layout, read live; the drawing toolbar offers sync only past one. */
  chartCount(): number
  /** The host's mark painters, as the widget resolved them. The legend paints its badge with the
   *  market's, and an extension reads the same value, so a split carries a badge on each chart
   *  rather than one over the grid, and a notice wears what the legend wears. */
  painters: MarkPainters
  /** Whether a tile fills the layout now, so the on-chart control wears the mark for what it would
   *  do next. */
  layoutMaximized(): boolean
  drawingToolIntent?: { shared(arg: unknown): void; state(tool: string | null): void }
  /** The widget chrome's doors: the search dialog and the indicator settings dialog. The object is
   *  filled once the chrome mounts and answers honestly before that. */
  doors: ChromeDoors
}

export interface ChartInstance {
  setLegendRows(rows: readonly ChartLegendRow[]): void
  mountDrawingToolbar(container: HTMLElement | null): void
  handle: ChartHandle
  /** The whole chart as one bitmap: the plot area with its axes, crosshair and every indicator
   *  pane. The renderer composes it; tiling a single series canvas would ship a picture missing
   *  the scales that make it readable. */
  screenshot(): HTMLCanvasElement
  /** Push a theme change through every surface that reads it. */
  repaintTheme(): void
  /** The chart's language changed. */
  relabel(): void
  /** The layout's chart count moved: the surfaces that read it re-render. */
  layoutChanged(): void
  /** The host's access policy may answer differently: every surface of this chart that reads it
   *  (the legend's row controls, the context menu if open, the navigation cluster, the drawing
   *  surfaces) reads it again. Nothing stored and nothing drawn on the chart changes. */
  refreshAccess(): void
  /** Run the contributed row bound to a press, at the level under a viewport point on THIS chart.
   *  The widget resolves which chart the pointer is over; this one answers only for itself. */
  runShortcutAt(clientX: number, clientY: number, pressed: string): boolean
  applyDrawingToolIntent(arg: unknown): void
  /** Private layout transaction hook. Public handles never expose persistence identity. */
  rebindDrawingIdentity(id: string): void
  /** The widget activated this chart, or another one. Reaches every attached extension. */
  activeChanged(active: boolean): void
  dispose(): void
}

/** Storage keys. Every one flows through the `ChartStorage` port and nothing else: where a viewer's
 *  preferences live is the host's decision, and the chart has no business assuming a browser store
 *  of any kind. */
const SYMBOL_KEY = 'quickcharts.symbol.v1'
const TF_KEY = 'quickcharts.tf.v1'
const STYLE_KEY = 'quickcharts.style.v1'
const SCALE_KEY = 'quickcharts.scale.v1'
const PRICE_AXIS_KEY = 'quickcharts.priceAxis.v1'
const HIDDEN_KEY = 'quickcharts.indHidden.v1'
const REPLAY_SPEED_KEY = 'quickcharts.replaySpeed.v1'
const REPLAY_TIMEFRAME_KEY = 'quickcharts.replayTf.v1'
const TIMEZONE_KEY = 'quickcharts.timezone.v1'
const SUBSESSION_KEY = 'quickcharts.subsession.v1'

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const ids = new Set(left)
  return right.every((id) => ids.has(id))
}

export function createChartInstance(deps: ChartInstanceDeps): ChartInstance {
  const { datafeed, storage, i18n } = deps
  let disposed = false
  const disposedFn = (): boolean => disposed
  const events = createEmitter<ChartEvents>()

  // ── State more than one plane reads. Everything else lives in the plane that owns it. ────────
  let symbol = deps.symbol ?? storage.get(SYMBOL_KEY) ?? deps.preferences.symbol ?? ''
  let tf = offeredTimeframe(deps.timeframe ?? storage.get(TF_KEY) ?? deps.preferences.timeframe ?? '1m', deps.timeframes)
  let style: ChartStyleId = deps.style ?? offeredStyle(storage.get(STYLE_KEY) ?? deps.preferences.style, deps.styles)
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
  /** How many bars the next load's first page asks for: a preset that switches the timeframe sizes
   *  it to its span, so the first paint can frame the whole span. */
  let firstPageBars = SNAPSHOT_BARS
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
  /** THE price formatter: one per symbol, in the chart's language. The price scale, the crosshair
   *  and last-price labels, the legend rows, the context menu, the drawing labels, the indicator
   *  scales and the extension seam all write through it, so no surface carries its own
   *  precision. */
  let symbolFormatter: PriceFormatter = createPriceFormatter(UNRESOLVED_PRICE_FORMAT, { locale: i18n.tag() })
  /** Increments on every symbol or timeframe switch and at dispose; stale async work checks it. */
  let epoch = 0
  /** True once the load epoch on screen has painted its own history answer, or has been refused.
   *  A range preset asked before that has nothing to measure a span against. */
  let historyPainted = false
  /** A range preset asked while the current load epoch still has no data: the span it wants, held
   *  until that load's FIRST paint frames it, once, in place of the default fit. It is bound to the
   *  epoch it was issued under, so a newer preset, a symbol switch, a refused load or disposal
   *  drops it rather than framing a picture nobody asked for. */
  let pendingFrame: { epoch: number; span: RangeSpan; tf: string } | null = null
  /** The level the open menu was raised at, so a copy runs on that and not on wherever the pointer
   *  wandered to while the menu was up. */
  let menuLevel: number | null = null
  /** The standing drawing choices. ONE copy: the layer consults it through a getter, and a drawing
   *  toolbar or a host control changes it through `setDrawingPreferences`, so nothing can drift out
   *  of step. */
  let drawingPrefs: DrawingPreferences = readDrawingPreferences()

  // ── The appearance ladder. Floor: the built-in defaults, tinted by the mode's series pair, with
  // candle borders left INVISIBLE until some layer names a border color. Above it: the host's
  // constructor partial, then every runtime layer.
  // The VIEWER's own leaves, and only those. It has no preference key: saved chart content is the
  // single authority on an authored look, so a second device-wide copy here would be a second
  // writer of the same fact and would stamp a loaded layout's look onto the device.
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
  if (deps.ui.drawingToolbar && !deps.externalDrawingToolbar) {
    gestures.dataset.qcDrawingToolbar = 'true'
    chrome.dataset.qcDrawingToolbar = 'true'
  }
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
    crosshair: { mode: deps.features.crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden },
    // A finger held on the plot scrubs the crosshair for as long as it stays down, and lifting it
    // takes the crosshair away, so the next one-finger drag pans: the way a native chart reads.
    trackingMode: { exitMode: TrackingModeExitMode.OnTouchEnd },
    // The renderer's own momentum throws a flick as fast as seven pixels a millisecond and coasts
    // it thousands of pixels; the chart coasts a flick itself, calmly.
    kineticScroll: { touch: false, mouse: false },
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
  // The Baseline style's base is a screen level, not a price, so it is re-derived while that style
  // is the one on screen and never written into saved content.
  const baselineLevel = createBaselineLevel({ paneHeight: () => chart.paneSize().height })
  if (style === 'baseline') baselineLevel.follow(series)
  // THE VOLUME HISTOGRAM IS THE `volume` INDICATOR'S BODY, not chart furniture. The catalog carries
  // the indicator (its MA plots pin to this same band's scale); the bars themselves are drawn here,
  // because they are per-bar chart data rather than a computed series. So the presence of a
  // non-hidden `volume` instance is what shows them, and its `colorPrevClose` input is what colours
  // them. Drawn unconditionally, they were a second volume nobody could remove: bars at the foot of
  // a chart whose owner never asked for them, with no legend row, no eye and no ✕.
  const volume: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    visible: false,
  })
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
  /** The showing `volume` instance, or null when none is configured or it is hidden. */
  const volumeInstance = (): IndicatorInstance | null =>
    indicators.list().find((i) => i.definition.manifest.id === 'volume' && !indicators.isHidden(i.id)) ?? null
  /** Bar colours: the indicator's own rule when it asks for it (this close against the PREVIOUS
   *  one), else the chart's up/down by the bar's own body. */
  const volumeColors = (bars: readonly FeedBar[]): string[] => {
    const inst = volumeInstance()
    const prevClose = (inst?.inputs?.colorPrevClose ?? inst?.definition.manifest.inputs?.colorPrevClose?.default ?? 0) === 1
    const up = eff.appearance.upColor
    const down = eff.appearance.downColor
    return bars.map((b, i) => {
      const ref = prevClose ? bars[i - 1]?.c : b.o
      return ref == null || b.c >= ref ? up : down
    })
  }
  /** Show or hide the band with the indicator, and repaint its bars when it appears or its rule
   *  moves. */
  const syncVolume = (): void => {
    const on = volumeInstance() != null
    volume.applyOptions({ visible: on })
    if (on) paintVolume()
  }
  function paintVolume(): void {
    const bars = shownBars()
    const colors = volumeColors(bars)
    volume.setData(bars.map((b, i) => ({ time: b.t as UTCTimestamp, value: b.v, color: colors[i]! })))
  }
  if (scaleMode !== 'normal') chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[scaleMode] })
  /** The policy the viewer chose, held as intent until there are bars to hold. A manual axis with
   *  no bars behind it would keep the renderer's default bounds, and every bar of a market priced
   *  outside them would stand off the pane: a blank chart under a legend that reads the data. So the
   *  renderer is told to stop framing only once a history has painted and framed the market, and
   *  a load that brings a new symbol or timeframe frames first for the same reason. */
  let heldPolicy: PriceAxisPolicy = coercePriceAxisPolicy(storage.get(PRICE_AXIS_KEY))

  /** Whether the price axis is framing itself or holding what the viewer stretched it to. The
   *  renderer's own price scale is the truth, because a drag on the axis is what turns framing off
   *  and no event announces it; reading the option means a manual axis is caught however it was
   *  reached. It is INDEPENDENT of the scale mode: regular, log, percent and indexed each frame
   *  either way, and neither setting moves the other. Until the first history has framed, the
   *  answer is the held intent, since the renderer has not yet been asked to hold anything. */
  const priceAxisPolicy = (): PriceAxisPolicy =>
    historyPainted && bars.length > 0 ? (chart.priceScale('right').options().autoScale ? 'auto' : 'manual') : heldPolicy

  /** Move the policy and remember it. The exact bounds are deliberately not carried: they are this
   *  device's view of this market, and a saved chart states the POLICY the viewer chose. A manual
   *  policy reaches the renderer once bars stand behind it; before that it is held as intent. */
  function applyPriceAxisPolicy(next: PriceAxisPolicy): void {
    if (disposed) return
    heldPolicy = next
    storage.set(PRICE_AXIS_KEY, next)
    if (historyPainted && bars.length > 0) chart.priceScale('right').applyOptions({ autoScale: next === 'auto' })
  }

  /** The first paint of a history frames the market, and only then is a held manual policy handed
   *  to the renderer: the bounds it holds are the frame it just drew, never bounds from before the
   *  bars existed. The renderer frames in its own render pass and says so through the price scale's
   *  visible range, which is null until a frame has happened and then states the prices on screen.
   *  The hold waits, one animation frame at a time, until that range exists and covers the bars it
   *  is asked to hold; a range the bars fall outside is a frame of some other data, never held. A
   *  new load or disposal withdraws a hold still waiting. */
  let holdFrame: number | null = null
  const HOLD_FRAMES = 120
  function holdAxisAfterFrame(): void {
    if (holdFrame !== null) window.cancelAnimationFrame(holdFrame)
    holdFrame = null
    if (heldPolicy !== 'manual') return
    let left = HOLD_FRAMES
    const attempt = (): void => {
      holdFrame = null
      if (disposed || heldPolicy !== 'manual') return
      const shown = shownBars()
      const range = chart.priceScale('right').getVisibleRange()
      const framed = shown.length > 0 && range !== null && shown.some((b) => b.l <= range.to && b.h >= range.from)
      if (framed) {
        chart.priceScale('right').applyOptions({ autoScale: false })
        return
      }
      if (--left > 0) holdFrame = window.requestAnimationFrame(attempt)
    }
    holdFrame = window.requestAnimationFrame(attempt)
  }

  /** The style series when it is candle-shaped. An indicator that recolors bar bodies needs a
   *  series that has bodies; the other five styles answer null rather than a series that cannot
   *  take the paint. */
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

  // ── The sync bus. Maintenance writes are muted for their immediate renderer reports. A layout
  // mirror additionally owns its next accepted time report, because a renderer may publish that
  // report after its setter returns. Public navigation clears that ownership before it writes.
  let syncMuted = false
  let mirrorEpoch = 0
  let mirrorOwner: number | null = null
  let mirrorReleaseFrame: number | null = null
  const releaseMirror = (): void => {
    mirrorOwner = null
    if (mirrorReleaseFrame !== null) window.cancelAnimationFrame(mirrorReleaseFrame)
    mirrorReleaseFrame = null
  }
  /** Ownership of the renderer invalidation written solely to compensate for a timeline mutation.
   * Lightweight Charts may settle different bounds and publish logical and timestamp views later.
   * The chart and navigation-intent epochs distinguish that work from a newer motion without
   * guessing from the report's span or endpoints. */
  let maintenanceRange: {
    epoch: number
    navigationEpoch: number
    logicalReported: boolean
    timeReported: boolean
  } | null = null
  let navigationEpoch = 0
  let selectedRangePreset: string | null = null
  const setRangePreset = (key: string | null): void => {
    if (selectedRangePreset === key) return
    selectedRangePreset = key
    events.emit('rangePreset', key)
  }
  const currentMaintenance = (): NonNullable<typeof maintenanceRange> | null => {
    if (maintenanceRange && (maintenanceRange.epoch !== epoch || maintenanceRange.navigationEpoch !== navigationEpoch))
      maintenanceRange = null
    return maintenanceRange
  }
  const finishMaintenanceReport = (kind: 'logical' | 'time'): void => {
    if (!maintenanceRange) return
    if (kind === 'logical') maintenanceRange.logicalReported = true
    else maintenanceRange.timeReported = true
    if (maintenanceRange.logicalReported && maintenanceRange.timeReported) maintenanceRange = null
  }
  const beginNavigation = (): void => {
    navigationEpoch++
    maintenanceRange = null
    ranges.stopGlide()
    fling.stop()
    releaseMirror()
    setRangePreset(null)
  }
  const muted = (write: () => void): void => {
    syncMuted = true
    try {
      write()
    } finally {
      syncMuted = false
    }
  }
  const mirrored = (write: () => void): void => {
    const owner = ++mirrorEpoch
    mirrorOwner = owner
    if (mirrorReleaseFrame !== null) window.cancelAnimationFrame(mirrorReleaseFrame)
    try {
      muted(write)
      // Lightweight Charts applies time-scale invalidations in its queued animation frame. Its
      // mask coalesces rapid ApplyRange writes and equal ranges can publish nothing, so ownership
      // belongs to that render batch rather than to an assumed callback count. This frame is
      // requested after the setter queued its own; it releases the batch whether it emitted once
      // or not at all.
      mirrorReleaseFrame = window.requestAnimationFrame(() => {
        if (mirrorOwner === owner) mirrorOwner = null
        mirrorReleaseFrame = null
      })
    } catch (error) {
      if (mirrorOwner === owner) releaseMirror()
      throw error
    }
  }
  const crosshairSubs = new Set<(time: number | null) => void>()
  const timeClickSubs = new Set<(time: number) => void>()
  const rangeSubs = new Set<(range: TimeRange) => void>()

  const ranges: RangeApi = createRangeApi({
    chart,
    disposed: disposedFn,
    muted,
    mirrored,
    onGlide: () => followLiveEdge(),
    reducedMotion: () => gestures.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  })
  const fling = attachFling({ chart, target: gestures })
  let unregisterRangeMirror = (): void => undefined

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
    // The renderer frames the axis again whenever the mode moves, which would make choosing a
    // logarithmic axis silently discard the bounds the viewer stretched it to. The mode is how
    // price maps to pixels and the policy is whether the axis re-frames at all: two settings, and
    // moving one must not move the other, so the policy is held across the mode write. It takes a
    // second call, because the renderer turns framing back on as part of applying the mode and
    // would swallow an `autoScale` asked for in the same one.
    const held = priceAxisPolicy()
    chart.priceScale('right').applyOptions({ mode: PRICE_SCALE_MODE[next] })
    if (held === 'manual') chart.priceScale('right').applyOptions({ autoScale: false })
    storage.set(SCALE_KEY, next)
    events.emit('scaleMode', next)
  }

  // ── Planes. Declared in dependency order; every cross-reference is a getter or a callback, so a
  // plane created earlier can still reach one created later by the time it is called.
  const indicators: IndicatorsPlane = attachIndicatorsPlane({
    chart,
    candleSeries,
    // An indicator drawn over bars the active subsession hides would not line up with the series
    // beside it, so it computes over the painted model rather than the loaded one.
    bars: () => shownBars(),
    i18n,
    formatter: () => symbolFormatter,
    formatKey,
    volumePrecision: () => symbolInfo?.volumePrecision ?? 0,
    minMove,
    canvas,
    access: deps.access,
    offered: deps.builtInIndicators ?? null,
    disposed: disposedFn,
    onChips: () => {
      syncVolume()
      legend.push()
    },
    onEvent: (event) => events.emit('indicator', event),
    catalog: deps.indicatorCatalog,
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
        mainWindow: () => {
          const painted = shownBars()
          return painted.length ? { from: painted[0]!.t, to: painted[painted.length - 1]!.t } : null
        },
        scaleMode: () => scaleMode,
        applyScaleMode,
        curated: deps.compareSymbols,
        enabled: true,
        disposed: disposedFn,
        maintainTimeline,
        onChips: () => legend.push(),
        onEvent: (entries) => events.emit('compare', entries),
      })
    : null

  const legend = attachLegendPlane({
    commands: deps.commands,
    shown: (id) => commandShown(deps.access, id),
    chart,
    chrome,
    i18n,
    icons: deps.icons,
    enabled: deps.ui.legend,
    marketStatus: deps.ui.marketStatus,
    symbolSearch: deps.ui.symbolSearch,
    openSearch: () => deps.doors.openSearch({ mode: 'search', chart: handle }),
    indicators,
    compare,
    // The market as the FEED resolved it, the bars actually on screen, and the chart's one
    // formatter: the legend states what this chart knows, never a second lookup of its own.
    symbolInfo: () => symbolInfo,
    bars: () => shownBars(),
    formatter: () => symbolFormatter,
    replayPhase: () => replay.api.phase(),
    valueShaped: () => valueShaped(style),
    sessionModel: () => session.model(),
    status: (nowSecs) => session.status(nowSecs),
    openIndicatorSettings: (id) => deps.doors.openIndicatorSettings(handle, id),
    legendValues: deps.ui.legendValues,
    painters: deps.painters,
  })

  // ── The drawing plane: the layer, its toolbar, its favorites bar and its settings surfaces.
  // The plane CONSULTS the standing choices through the chart's one record and writes them back
  // through the same setter the handle exposes, so a toolbar and the layer cannot disagree about
  // what "weak magnet" or "stay in drawing mode" does, and a host reading `drawingPreferences()`
  // sees what the toolbar shows.
  let extensionsHost: ChartExtensionHost | null = null
  const drawings = attachDrawingsPlane({
    chart,
    series: anchor,
    container: gestures,
    chrome,
    chartId: deps.id,
    chartIdentity: deps.drawings.identity,
    documents: deps.drawings.mode === 'separate' ? deps.drawings.documents : null,
    symbol,
    timeframe: tf,
    bars: () => bars,
    resources: deps.saveLoad,
    i18n,
    icons: deps.icons,
    enabled: deps.features.drawings,
    toolbar: deps.ui.drawingToolbar,
    toolbarContainer: deps.externalDrawingToolbar ? null : undefined,
    favorites: deps.ui.drawingFavorites,
    access: deps.access,
    offered: deps.drawingTools,
    commands: deps.commands,
    assets: deps.assets,
    theme: () => deps.theme.get(),
    replayPhase: () => replay.api.phase(),
    preferences: () => drawingPrefs,
    setPreferences: (next) => handle.setDrawingPreferences(next),
    indicators: { count: () => indicators.list().length, setAllHidden: (hidden) => indicators.setAllHidden(hidden) },
    // The extension plane attaches after this one and its layers are read live, so the eye lists
    // whatever is contributed by the time it is opened.
    hideLayers: () => extensionsHost?.hideLayers() ?? [],
    // What a stored drawing may name on this chart: the main series and its pane, plus every
    // indicator instance and the panes the pane-placed ones own.
    sources: () => ['main', ...indicators.list().map((instance) => instance.id)],
    panes: () => ['main', ...indicators.list().filter((instance) => instance.definition.manifest.pane === 'pane').map((instance) => instance.id)],
    chartCount: deps.chartCount,
    ...(deps.externalDrawingToolbar && deps.drawingToolIntent
      ? { onSharedToolIntent: deps.drawingToolIntent.shared, onToolState: deps.drawingToolIntent.state }
      : {}),
    onSaveConflict: (info) => deps.onSaveConflict({ family: 'drawings', ...info }),
    onChange: (kind, id) => events.emit('drawing', { kind, id }),
  })

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

  let countdown: CountdownLayer | null = null
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
      // Replay owns the picture while it runs; a range preset waiting on live history is not its
      // to consume.
      pendingFrame = null
      replaySlice = next
      paintAll()
    },
    clearSlice: () => {
      replaySlice = null
      paintAll()
    },
    enabled: deps.features.replay,
    disposed: disposedFn,
    setHeader: () => legend.setHeader(symbol, tf),
    // A chart whose crosshair the host switched OFF keeps it off: replay may take the crosshair
    // away for the length of a question, never hand one back that was never there.
    setCrosshair: (visible) =>
      chart.applyOptions({ crosshair: { mode: visible && deps.features.crosshair ? CrosshairMode.Normal : CrosshairMode.Hidden } }),
    // The feed's own grains: a chart never offers, or fetches, a timeframe its feed cannot serve.
    resolutions: () => deps.capabilities().resolutions,
    persist: (key, value) => storage.set(key === 'speed' ? REPLAY_SPEED_KEY : REPLAY_TIMEFRAME_KEY, value),
    onChange: () => {
      const state = replay.snapshot()
      countdown?.refresh()
      // The legend reads the PHASE, and a phase moves without the cursor moving: arming and
      // disarming change what the mark should say while `on` and the counts stay exactly as they
      // were. Refreshing the header here is what makes every consumer of the replay state hear the
      // same change — without it the mark only ever updated on entry and exit, because those are
      // the two transitions that happen to call `setHeader` on their own.
      legend.setHeader(symbol, tf)
      // The row is widget chrome, but its state and commands remain chart-local. The first chart
      // entering replay owns that one presentation row until it leaves or is removed.
      deps.doors.replayChanged({ chart: handle, commands: deps.replayCommands, bars: () => bars, intraday: () => isIntradayTimeframe(tf) })
      extensions.host.replayChanged({ active: state.on, cursor: state.cursor, total: state.total })
      events.emit('replay', state)
    },
    initialSpeed: coerceReplaySpeed(storage.get(REPLAY_SPEED_KEY) ?? deps.preferences.replaySpeed),
    initialGrain: storage.get(REPLAY_TIMEFRAME_KEY) ?? deps.preferences.replayTimeframe ?? 'auto',
  })

  const countdownClock = createCountdownClock(() => Date.now() / 1000, datafeed.serverTime?.bind(datafeed))
  countdown = attachCountdown({
    series: () => series,
    bars: () => shownBars(),
    timeframe: () => tf,
    enabled: () => eff.appearance.countdown,
    replaying: () => replay.active(),
    dataStatus: () => (feedStatus === 'live' ? deps.capabilities().dataStatus : null),
    session: () => session.model(),
    activeSubsession: () => session.subsession(),
    formatter: () => symbolFormatter,
    theme: () => deps.theme.get(),
    now: () => countdownClock.now(),
    setInterval: (callback, delay) => window.setInterval(callback, delay),
    clearInterval: (timer) => window.clearInterval(timer as number),
  })

  const extensions = attachExtensionsPlane({
    chartId: deps.id,
    chart,
    series: () => anchor,
    visible: () => series,
    gestures,
    chrome,
    layer: deps.layer,
    symbol: () => symbol,
    symbolTitle: () => symbolNames(symbolInfo ?? symbol).title,
    painters: deps.painters,
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
    active: deps.active,
    commands: deps.commands,
    extensions: deps.extensions,
    disposed: disposedFn,
    setTouchAction: (value) => {
      gestures.style.touchAction = value
    },
    // A contributed layer rides the same eye the drawing toolbar drives, through the drawing
    // plane's verbs.
    hideState: () => drawings.verbs?.hide() ?? { mode: 'drawings', on: false },
    setHide: (state) => drawings.verbs?.setHide(state),
    hideLayersChanged: () => drawings.syncHideLayers(),
  })
  extensionsHost = extensions.host

  const menu = deps.ui.contextMenu
    ? attachMenuPlane({
        chart,
        series: () => anchor,
        gestures,
        host: deps.layer,
        i18n,
        icons: deps.icons,
        commands: deps.commands,
        formatter: () => symbolFormatter,
        minMove,
        symbol: () => symbol,
        symbolName: () => symbolNames(symbolInfo ?? symbol).title,
        timeframe: () => tf,
        indicatorCount: () => indicators.list().length,
        drawingCount: () => drawings.handle?.count() ?? 0,
        extensions: () => extensions.host,
        shown: (id) => commandShown(deps.access, id),
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
        // The plot spans the time scale's width, beside the left price scale and above the time
        // scale, so whatever lies outside it is a scale.
        plotArea: () => {
          const box = gestures.getBoundingClientRect()
          const left = box.left + chart.priceScale('left').width()
          const time = chart.timeScale()
          return { left, right: left + time.width(), bottom: box.bottom - time.height() }
        },
      })
    : null

  if (menu) {
    gestures.addEventListener('contextmenu', (e) => {
      if (menu.raiseAt(e.clientX, e.clientY)) e.preventDefault()
    })
  }

  // The on-chart navigation cluster: zoom, scroll and reset over the chart's own view commands.
  const nav = deps.ui.navigation ? mountNavControls({ chrome, gestures, commands: deps.commands, i18n, icons: deps.icons, maximized: () => deps.layoutMaximized(), shown: (id) => commandShown(deps.access, id) }) : null

  // ── Painting ─────────────────────────────────────────────────────────────────────────────────
  /** The bars actually PAINTED: the loaded model, filtered to the active subsession on an intraday
   *  timeframe, or the replay cursor's slice while replay is on. A daily or larger bar spans whole
   *  sessions, so it is never filtered. */
  function shownBars(): FeedBar[] {
    if (replaySlice) return replaySlice
    const filter = session.barFilter(tf)
    return filter ? bars.filter((b) => filter(b.t)) : bars
  }
  let nativeDragActive = false
  const onNativeDragStart = (event: MouseEvent | PointerEvent): void => {
    // A press on the chart takes the view from the glide back to the live edge, as a hand stops a
    // sliding page, before it has moved at all. A coasting flick stops the same way.
    ranges.stopGlide()
    fling.stop()
    if (event.button === 0) nativeDragActive = true
  }
  const onNativeDragMove = (event: MouseEvent | PointerEvent): void => {
    if (!nativeDragActive) return
    if (event.buttons === 0) {
      nativeDragActive = false
      return
    }
    beginNavigation()
  }
  const onNativeDragEnd = (): void => {
    nativeDragActive = false
  }
  const onNativeTouchOrWheel = (): void => beginNavigation()
  const navigationRoot = gestures.ownerDocument.documentElement
  gestures.addEventListener('mousedown', onNativeDragStart, { passive: true })
  gestures.addEventListener('pointerdown', onNativeDragStart, { passive: true })
  gestures.addEventListener('touchmove', onNativeTouchOrWheel, { passive: true })
  gestures.addEventListener('wheel', onNativeTouchOrWheel, { passive: true })
  navigationRoot.addEventListener('mousemove', onNativeDragMove, { passive: true })
  navigationRoot.addEventListener('pointermove', onNativeDragMove, { passive: true })
  navigationRoot.addEventListener('mouseup', onNativeDragEnd, { passive: true })
  navigationRoot.addEventListener('pointerup', onNativeDragEnd, { passive: true })
  navigationRoot.addEventListener('pointercancel', onNativeDragEnd, { passive: true })
  const pinch = attachPinch({ chart, target: gestures })

  /** Apply a data-only rewrite without changing where the viewer is looking. Every current main
   * candle is a candidate so the range owner can choose one at the visible left edge, including
   * when a delayed compare page lands after the main page that requested it. */
  function maintainTimeline(write: () => void): void {
    const continuity = captureTimelineContinuity(
      chart.timeScale(),
      shownBars().map((bar) => bar.t),
    )
    write()
    // The renderer fires range subscriptions synchronously. This maintenance write must not echo
    // through layout synchronization as if it were a new drag from this chart.
    muted(() => {
      restoreTimelineContinuity(chart.timeScale(), continuity, () => {
        maintenanceRange = { epoch, navigationEpoch, logicalReported: false, timeReported: false }
      })
    })
  }

  function paintAll(): void {
    const shaped = valueShaped(style)
    const painted = shownBars()
    const values = painted.map((b) => ({ time: b.t as UTCTimestamp, value: b.c }))
    anchor.setData(values)
    series.setData(
      (shaped ? values : painted.map((b) => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c }))) as never,
    )
    if (volumeInstance()) paintVolume()
    indicators.recompute()
    // Comparisons clip to the main window, so every reshape re-clips them here: paintAll is the one
    // choke point every load, scroll-back, snapshot and replay path exits by.
    compare?.sync()
    // An extension sees what is DRAWN. A bar the active subsession filters out is not on screen,
    // and an overlay placed against it would sit where there is nothing.
    extensions.host.barsChanged(painted)
    countdown?.refresh()
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
    if (volumeInstance()) paintVolume()
    indicators.recomputeThrottled()
    extensions.host.barsChanged(shownBars())
    countdown?.refresh()
  }

  /** Rebuild the formatter (a resolve, a symbol switch, a language switch) and push it to every
   *  surface that holds a reference rather than reading it live. */
  const setSymbolFormat = (format: PriceFormat | null): void => {
    symbolFormat = format
    symbolFormatter = createPriceFormatter(format ?? UNRESOLVED_PRICE_FORMAT, { locale: i18n.tag() })
    applyPriceFormat()
    drawings.setPricing(format ? minMoveOf(format) : null, (price) => symbolFormatter.format(price))
    countdown?.refresh()
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
    countdown?.refresh()
  }

  /** Reset defaults: drop the viewer's OWN appearance layer and put the price scale back to normal.
   *
   *  Precisely the runtime layer and nothing else. The theme floor and the host's constructor
   *  partial are not the viewer's to reset, so a branded chart resets to its BRAND, not to the
   *  package's stock canvas. The viewport is a separate verb (`chart.view.reset`), and no other
   *  preference is touched.
   *
   *  It reports as a content change like any other, so an autosaving host writes the reset into the
   *  saved chart and reopening it does not undo the reset. Saved content is the only place an
   *  authored look persists. */
  function resetAppearance(): void {
    if (disposed) return
    runtimePartial = {}
    applyScaleMode('normal')
    applyLook()
    deps.contentChanged?.()
    history.changed()
  }

  // ── Data ─────────────────────────────────────────────────────────────────────────────────────
  /** One older-history fetch with the gap hop: an empty page carrying nextTime re-asks once
   *  anchored there; only the `end` verdict is the true end of history. */
  async function fetchOlder(to: number, count: number = PAGE_BARS): Promise<{ olderBars: FeedBar[]; end: boolean }> {
    const page = await datafeed.history(symbol, tf, { to, countBack: count })
    const verdict = olderPageVerdict(page, to, false)
    if (verdict.kind !== 'hop') return { olderBars: page.bars, end: verdict.kind === 'end' }
    const hop = await datafeed.history(symbol, tf, { to: verdict.to, countBack: count })
    return { olderBars: hop.bars, end: olderPageVerdict(hop, verdict.to, true).kind === 'end' }
  }

  const refreshMarks = (): void => {
    if (!marks || bars.length === 0) return
    marks.refresh({ from: bars[0]!.t, to: bars[bars.length - 1]!.t })
  }

  /** Fetch the page older than the current left edge and prepend it while HOLDING the visible
   *  window in place. Stops for good at the feed's true end of history.
   *
   *  `runway` is how many more consecutive pages this approach may fetch on its own. A landing page
   *  restores the viewport under a maintenance record, and that record owns the renderer's range
   *  report, so nothing would look at the left edge again until the viewer moved: a wide or
   *  fast-panned view needing several pages would strand one page in. The continuation is this
   *  function re-asking its own trigger after a page paints, never a second flight beside the one
   *  already in the air. */
  function maybePageBack(runway: number = PAGE_RUNWAY): void {
    if (replay.active()) return // the replay window is fixed; paging would desync the master set
    if (paging || noMoreHistory || bars.length === 0) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range || range.from > PAGE_TRIGGER_BARS) return
    paging = true
    const myEpoch = epoch
    const oldest = bars[0]!.t
    // Only a page that actually painted older bars earns another. The end of history, a gap verdict
    // that served nothing, an answer this chart already holds or the session filters away, and a
    // transient failure all end the run; the viewer's next approach opens a fresh one.
    let again = false
    void fetchOlder(oldest - 1)
      .then(({ olderBars, end }) => {
        if (disposed || myEpoch !== epoch) return
        if (end) noMoreHistory = true
        const seen = new Set(bars.map((b) => b.t))
        const older: FeedBar[] = []
        for (const bar of olderBars) {
          if (bar.t >= oldest || seen.has(bar.t)) continue
          seen.add(bar.t)
          older.push(bar)
        }
        if (older.length === 0) return
        // Read the view only now, after the asynchronous page has landed, so a drag or zoom made
        // while it was away wins. The surviving candle's renderer index measures every timestamp
        // the repaint actually adds to the unified axis, including session-filtered main bars and
        // comparison-only points. Raw response length cannot state that shift.
        maintainTimeline(() => {
          bars = [...older, ...bars]
          paintAll()
        })
        refreshMarks()
        again = runway > 1
      })
      .catch(() => {
        /* transient; the next left-edge approach retries */
      })
      .finally(() => {
        // A page from an earlier load leaves the flag to the load that replaced it.
        if (myEpoch === epoch) paging = false
        // The trigger is re-read inside this call, against the viewport the maintenance write just
        // restored: a page that pushed the left edge out of reach ends the run by itself.
        if (again && !disposed && myEpoch === epoch) maybePageBack(runway - 1)
      })
  }

  /** Bring the loaded history back far enough to cover a preset's span, then frame it again. The
   *  whole shortfall is one ask, so a preset costs at most one fetch; a span the history already
   *  covers, or a feed at its end, asks nothing. */
  function fillSpan(span: RangeSpan, spanTf: string): void {
    const want = barsForSpan(span, spanTf)
    if (want === null || replay.active() || paging || noMoreHistory || bars.length === 0) return
    const short = want - bars.length
    if (short <= 0) return
    paging = true
    const myEpoch = epoch
    const oldest = bars[0]!.t
    void fetchOlder(oldest - 1, short)
      .then(({ olderBars, end }) => {
        if (disposed || myEpoch !== epoch) return
        if (end) noMoreHistory = true
        const older = olderBars.filter((bar) => bar.t < oldest)
        if (older.length === 0) return
        bars = [...older, ...bars]
        paintAll()
        refreshMarks()
        frameRange(chart, anchor, span, spanTf)
      })
      .catch(() => {
        /* transient; the span frames what the chart holds */
      })
      .finally(() => {
        if (myEpoch === epoch) paging = false
      })
  }

  /** Replay's first available date: page older history back to the feed's true beginning, or to the
   *  depth it states, prepending each page while holding the view, then start at the oldest bar held.
   *  A session already open is left first, because its window is fixed and paging under it would
   *  desync it. The walk stops at REPLAY_DEPTH bars, and a symbol or timeframe switch abandons it. */
  let walkingBack = false
  async function replayFromFirst(): Promise<void> {
    if (!symbol || walkingBack || disposed) return
    if (handle.replay.phase() !== 'off') handle.replay.exit()
    walkingBack = true
    paging = true
    const myEpoch = epoch
    try {
      while (!noMoreHistory && bars.length > 0 && bars.length < REPLAY_DEPTH) {
        if (earliestBarSecs !== null && bars[0]!.t <= earliestBarSecs) break
        const oldest = bars[0]!.t
        const { olderBars, end } = await fetchOlder(oldest - 1, REPLAY_PAGE_BARS)
        if (disposed || myEpoch !== epoch) return
        if (end) noMoreHistory = true
        const seen = new Set<number>()
        const older: FeedBar[] = []
        for (const bar of olderBars) {
          if (bar.t >= oldest || seen.has(bar.t)) continue
          seen.add(bar.t)
          older.push(bar)
        }
        if (older.length === 0) break
        maintainTimeline(() => {
          bars = [...older, ...bars]
          paintAll()
        })
        refreshMarks()
      }
    } catch {
      // A page that failed ends the walk; the session starts on the history already held.
    } finally {
      walkingBack = false
      if (myEpoch === epoch) paging = false
    }
    if (disposed || myEpoch !== epoch || bars.length === 0) return
    handle.replay.start(bars[0]!.t)
  }

  /** (Re)load the active symbol and timeframe: initial history paints first, then the live
   *  subscription's snapshot replaces it and bar events mutate or append. A FeedUnavailableError is
   *  terminal for this symbol: the chart stays honestly empty, no subscription opens, and the
   *  status lane reads `feed_unavailable` alone. Any other history failure leaves the subscription
   *  to seed the chart through its own snapshot. */
  function load(): void {
    const myEpoch = ++epoch
    const firstPage = firstPageBars
    firstPageBars = SNAPSHOT_BARS
    unsubscribe?.()
    unsubscribe = null
    bars = []
    // A page still away for the previous load cannot hold this one's first page back.
    paging = false
    historyPainted = false
    // The axis frames the market that is about to arrive; a held manual policy returns once it has.
    if (holdFrame !== null) window.cancelAnimationFrame(holdFrame)
    holdFrame = null
    chart.priceScale('right').applyOptions({ autoScale: true })
    pendingFrame = null // a preset issued against the previous load never frames this one
    noMoreHistory = false
    feedStatus = null // the new subscription reports its own status; a stale one must not carry over
    symbolInfo = null
    earliestBarSecs = null
    session.reset() // the next resolve states the new symbol's model, and unresolved never bands
    marks?.clear()
    setSymbolFormat(null) // until the next resolve, the declared stand-in
    replay.abandon() // a replay window is symbol and timeframe bound; the switch invalidates it
    replaySlice = null // and its cursor slice with it: the new symbol paints from its own model
    legend.setHeader(symbol, tf)
    legend.setDot(null)
    paintAll()
    if (!symbol) return
    countdownClock.reset()
    // Symbol metadata rides ALONGSIDE the first history ask, never blocking it. A failed resolve
    // leaves the price format and the session model at their honest unknowns.
    void datafeed
      .resolve(symbol)
      .then((info) => {
        if (disposed || myEpoch !== epoch || !info) return
        symbolInfo = info
        setSymbolFormat(info.format)
        indicators.recompute() // indicator scales and rows re-read the formatter
        session.adopt(info)
        legend.setHeader(symbol, tf)
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
      .history(symbol, tf, { countBack: firstPage })
      .then((page) => {
        if (disposed || myEpoch !== epoch) return
        bars = [...page.bars]
        paintAll()
        historyPainted = true
        // A preset asked while this load was away framed nothing: the series was empty. Its span is
        // what the viewer asked to see, so it frames this first paint instead of the default fit.
        const framing = pendingFrame?.epoch === myEpoch ? pendingFrame : null
        pendingFrame = null
        if (framing) {
          frameRange(chart, anchor, framing.span, framing.tf)
          fillSpan(framing.span, framing.tf)
        } else chart.timeScale().fitContent()
        holdAxisAfterFrame()
        refreshMarks()
        if (!ready) {
          ready = true
          deps.onReady()
        }
        openSubscription(myEpoch)
      })
      .catch((e) => {
        if (disposed || myEpoch !== epoch) return
        // Refused or failed: this load paints no history, so a waiting preset has nothing to frame.
        historyPainted = true
        pendingFrame = null
        if (e instanceof FeedUnavailableError) {
          feedStatus = 'feed_unavailable'
          events.emit('feedStatus', 'feed_unavailable')
          return // terminal: no live subscription for a symbol nothing serves
        }
        // Transient history failure: the subscription's own snapshot still seeds the chart.
        openSubscription(myEpoch)
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
        countdown?.refresh()
      },
    })
  }

  // ── The live edge. Whether the view sits back from it is the chart's to read: the renderer's
  // scroll position against its resting place, a glide under way and a replay all bear on it, and
  // a host reading only the visible range could not tell them apart. Reported when it changes.
  /** How far behind its resting place the view may sit, in bars, and still read as at the edge. */
  const LIVE_EDGE_SLACK_BARS = 1
  let awayFromLive = false
  const readAwayFromLive = (): boolean => {
    if (disposed || ranges.gliding() || replay.active()) return false
    const s = chart.timeScale()
    if (s.getVisibleLogicalRange() === null) return false
    return s.scrollPosition() < s.options().rightOffset - LIVE_EDGE_SLACK_BARS
  }
  function followLiveEdge(): void {
    if (disposed) return
    const away = readAwayFromLive()
    if (away === awayFromLive) return
    awayFromLive = away
    events.emit('liveEdge', away)
  }
  events.on('replay', () => {
    // Replay moves the view itself from its first step, so a glide still under way gives it up.
    if (replay.active()) ranges.stopGlide()
    followLiveEdge()
  })
  const plotArea = watchPlotArea({ chart, host: deps.hostContainer, changed: (area: PlotArea) => events.emit('plotArea', area) })

  chart.timeScale().subscribeVisibleLogicalRangeChange((reported) => {
    // Every move of the view, the muted and maintained ones included, can carry it across the edge.
    followLiveEdge()
    if (syncMuted) {
      const maintenance = currentMaintenance()
      if (maintenance && reported) finishMaintenanceReport('logical')
      return
    }
    const maintenance = currentMaintenance()
    if (maintenance && reported) {
      // The renderer is free to settle different bounded endpoints from the range it accepted.
      // Absent a newer navigation input or public command, this report still belongs to the owned
      // invalidation rather than to a user gesture.
      finishMaintenanceReport('logical')
      return
    } else if (maintenance) {
      // Null is the renderer rebuilding its logical points, not a settled range report.
      return
    }
    maybePageBack()
    if (syncMuted) return
    const range = ranges.logicalRange()
    if (range) events.emit('logicalRange', range)
  })
  chart.subscribeCrosshairMove((param) => {
    if (syncMuted || crosshairSubs.size === 0) return
    const t = typeof param.time === 'number' ? param.time : null
    for (const cb of [...crosshairSubs]) cb(t)
  })
  chart.subscribeClick((param) => {
    if (syncMuted || typeof param.time !== 'number') return
    // Over a COPY, because a listener may subscribe from inside its own call: the replay transport
    // answers a picked bar by re-arming, which adds the next picker. A Set iterator visits values
    // added while it runs, so dispatching over the live set would hand that new picker the click
    // that created it, and each answer would arm again without end.
    for (const cb of [...timeClickSubs]) cb(param.time)
  })
  chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
    if (syncMuted) {
      if (currentMaintenance() && range) finishMaintenanceReport('time')
      return
    }
    if (mirrorOwner !== null) return
    const maintenance = currentMaintenance()
    if (maintenance) {
      if (!range) return
      finishMaintenanceReport('time')
      return
    }
    if (!range) return
    const next: TimeRange = { from: range.from as number, to: range.to as number }
    for (const cb of [...rangeSubs]) cb(next)
    events.emit('visibleRange', next)
  })

  // ── The handle ───────────────────────────────────────────────────────────────────────────────
  function setStyle(next: ChartStyleId): void {
    if (disposed || next === style || !deps.styles.includes(next)) return
    // A style switch is presentation. The loaded bars, the indicators, the drawings, the
    // comparisons, the scale and the visible range all survive it, and nothing refetches: only the
    // visible series is replaced, and the same bar model is painted into the new one. Everything
    // with a long life is bound to the anchor, so nothing else here is torn down.
    const keep = chart.timeScale().getVisibleLogicalRange()
    const previous = series
    style = next
    storage.set(STYLE_KEY, next)
    series = addStyleSeries(chart, next, paint())
    baselineLevel.follow(next === 'baseline' ? series : null)
    countdown?.seriesChanged(previous)
    extensions.visibleSeriesReplaced()
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

  /** Everything this chart is showing, as the save format states it. One value, read fresh: the
   *  saved-chart writer, the layout writer and the undo history all describe a chart the same way,
   *  so none of them can drift from another about what a chart IS. */
  function content(): ChartContent {
    return {
      symbol,
      timeframe: tf,
      style,
      scale: scaleMode,
      priceAxis: priceAxisPolicy(),
      indicators: indicators.list().map(serializeIndicatorInstance).filter((saved): saved is SavedIndicator => saved !== null),
      // The AUTHORED layer, never the resolved tree: writing `eff` down would save the theme's
      // derived colors and the host's brand as though a viewer had chosen every one of them, and a
      // reopen under another theme or another brand would then be stuck with the old ones.
      appearance: { ...runtimePartial.appearance },
      compares: compare?.serialize() ?? [],
      // The drawings ride the blob in combined mode only. They are the symbol's own: a saved chart
      // is one symbol, and the drawings it carries are the ones drawn on it.
      ...(deps.drawings.mode === 'combined' ? { drawings: drawings.handle?.export() ?? [] } : {}),
      // Extension state rides in its own namespace, keyed by extension id, so a chart saved with
      // one set of extensions loads under another without either reading the other's state.
      ext: extensions.host.serialize(),
    }
  }

  function applyContent(parsed: ParsedChartContent): boolean {
    if (parsed.symbol) handle.setSymbol(parsed.symbol)
    if (parsed.timeframe) handle.setTimeframe(offeredTimeframe(parsed.timeframe, deps.timeframes))
    if (parsed.style) setStyle(offeredStyle(parsed.style, deps.styles))
    applyScaleMode(coerceScaleMode(parsed.scale ?? null))
    // The blob's policy is authoritative in both directions: a manual chart loading an auto blob
    // starts framing again, and a fresh auto chart loading a manual blob stops. A blob that states
    // none is auto, which is what a chart saved before the policy existed meant.
    applyPriceAxisPolicy(coercePriceAxisPolicy(parsed.priceAxis))
    const { dropped } = indicators.restore(parsed.indicators)
    writeHidden()
    if (dropped > 0) deps.doors.notify('info', i18n.t('toast.indicatorsNotCarried', { count: dropped }))
    // The saved appearance applies as a RUNTIME layer: a viewer's saved look beats the host's
    // constructor values, exactly the precedence the option contract states.
    if (parsed.appearance) handle.applyAppearance({ appearance: parsed.appearance })
    // Comparisons restore AFTER the scale: the blob's own scale is the truth of how it was saved,
    // so the policy only re-arms the flip-back for comparisons the restore brings in.
    compare?.restore(parsed.compares)
    // In COMBINED mode the blob carries the drawings that were on the chart, so restoring it puts
    // them back; in separate mode it carries none and the drawings family is their only path.
    if (deps.drawings.mode === 'combined' && parsed.drawings) drawings.handle?.restore(parsed.drawings)
    // Extensions restore LAST: the symbol, timeframe and scale a saved chart carries are the world
    // an extension's state describes, so it must already be the world on screen.
    const extensionsComplete = extensions.host.restore(parsed.ext)
    return dropped === 0 && extensionsComplete
  }

  /** Put one reading of this chart's content back, for the history.
   *
   *  Two things separate it from loading a saved chart. The viewer's appearance layer is REPLACED
   *  rather than layered over, because a step back has to take a leaf off again and a layering call
   *  can only ever add one. And extension state is left alone: a reading does not carry it, so an
   *  extension keeps whatever it holds rather than being handed an empty namespace. */
  function applyHistoryContent(next: ChartContent): void {
    if (disposed) return
    runtimePartial = { appearance: { ...next.appearance } }
    // Ahead of the rest, so a style series built during the apply is painted with the look that is
    // going back rather than with the one being left behind.
    applyLook()
    applyContent({
      symbol: next.symbol,
      timeframe: next.timeframe,
      style: next.style,
      scale: next.scale,
      priceAxis: next.priceAxis,
      indicators: [...next.indicators],
      compares: next.compares,
      ...(next.drawings ? { drawings: [...next.drawings] } : {}),
    })
    // A step back is a content change like any other. The fields that write a preference key have
    // already said so; an appearance-only step writes none, so it says so here.
    deps.contentChanged?.()
  }

  const saveLoad = createSaveLoadApi({
    beginHydration: deps.beginHydration,
    adapter: deps.saveLoad,
    i18n,
    symbol: () => symbol,
    timeframe: () => tf,
    content,
    apply: applyContent,
    // In separate mode the blob carries no drawings, and applying one still moves them: the symbol
    // it lands loads that symbol's drawings. So a rollback puts the chart's own drawing state back
    // rather than the blob's. In combined mode the blob is already carrying them.
    heldDrawings:
      deps.drawings.mode === 'separate'
        ? { snapshot: () => drawings.handle?.export() ?? null, restore: (list) => drawings.handle?.restore(list) }
        : undefined,
    heldIndicators: { snapshot: () => indicators.list(), restore: (list) => indicators.restoreHeld(list) },
    disposed: disposedFn,
  })

  const history = attachHistoryPlane({
    enabled: deps.features.history,
    content,
    symbol: () => symbol,
    apply: applyHistoryContent,
    // In separate mode the content carries no drawings, so a reading holds the layer's own copy and
    // puts it back itself. In combined mode the content is already carrying them.
    drawings:
      deps.drawings.mode === 'separate'
        ? { snapshot: () => drawings.handle?.export() ?? null, restore: (list) => drawings.handle?.restore(list) }
        : null,
    disposed: disposedFn,
    // The document, not the gesture box: a price-axis drag is released wherever the pointer ended
    // up, and the renderer captures the pointer on its own canvas while it lasts.
    pointerRoot: navigationRoot,
    onChange: () =>
      events.emit('history', {
        canUndo: history.api.canUndo(),
        canRedo: history.api.canRedo(),
        undoChange: history.api.undoChange(),
        redoChange: history.api.redoChange(),
      }),
  })

  const handle: ChartHandle = {
    id: deps.id,
    symbol: () => symbol,
    symbolInfo: () => symbolInfo,
    setSymbol(next) {
      if (disposed || next === symbol) return
      setRangePreset(null)
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
      if (disposed || next === tf || !offersTimeframe(deps.timeframes, next)) return
      setRangePreset(null)
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
    rangePreset: () => selectedRangePreset,
    setVisibleRange: (range) => {
      beginNavigation()
      ranges.setVisibleRange(range)
    },
    logicalRange: () => ranges.logicalRange(),
    setLogicalRange: (range) => {
      beginNavigation()
      ranges.setLogicalRange(range)
    },
    scroll: (barCount) => {
      beginNavigation()
      ranges.scroll(barCount)
    },
    zoom: (factor) => {
      beginNavigation()
      ranges.zoom(factor)
    },
    reset: () => {
      beginNavigation()
      // Reset frames the view again on BOTH axes: a stretched price axis is exactly what a viewer
      // asking for the default view wants undone. The scale MODE is not a framing choice and
      // survives, so a log chart reset stays logarithmic.
      applyPriceAxisPolicy('auto')
      ranges.reset()
    },
    goLive: () => {
      beginNavigation()
      ranges.goLive()
    },
    awayFromLiveEdge: () => {
      followLiveEdge()
      return awayFromLive
    },
    plotArea: () => plotArea.current(),
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
      // every axis tick. A choice the widget does not offer is refused the same way.
      if (disposed || choice === timezoneChoice || !offersTimezone(deps.timezones ?? null, choice)) return
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
      },
      show(id) {
        if (indicators.isHidden(id)) indicators.toggleHidden(id)
      },
      hidden: () => indicators.hidden(),
    },
    drawings: drawings.api,
    drawingResources: drawings.documents,
    compare: compare?.api ?? {
      add: () => undefined,
      remove: () => undefined,
      setVisible: () => undefined,
      list: () => [],
      latest: () => null,
      symbols: () => [],
    },
    replay: replay.api,
    history: history.api,
    appearance: () => eff,
    applyAppearance(partial) {
      if (disposed) return
      // Runtime layers ACCUMULATE leaf by leaf: a later call restyles what it names and leaves the
      // rest of the runtime layer standing, so two hosts' calls compose instead of clobbering.
      runtimePartial = { appearance: { ...runtimePartial.appearance, ...(partial.appearance ?? {}) } }
      applyLook()
      // An appearance-only edit changes CONTENT, so it marks the chart dirty like a style or a
      // timeframe does. During a restore the widget is hydrating and this reports nothing.
      deps.contentChanged?.()
      // The appearance ladder has no event lane of its own, so the history is told here rather than
      // through a subscription it could take out on its own.
      history.changed()
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
  unregisterRangeMirror = registerChartRangeMirror(handle, { setVisibleRange: (range) => ranges.mirrorVisibleRange(range) })

  // ── Opening state. Everything above is wiring; these are the first values on screen. ──────────
  setSymbolFormat(null)
  legend.setHeader(symbol, tf)
  const storedHidden = readHidden()
  const endOpening = deps.beginHydration?.()
  try {
    indicators.set(deps.indicators)
    indicators.setHidden(storedHidden)
    if (deps.compares) compare?.restore(deps.compares)
    if (!sameIds(storedHidden, indicators.hidden())) writeHidden()
  } finally {
    endOpening?.()
  }
  events.on('indicator', writeHidden)

  // The lanes the history reads a change from. Everything else content is made of either travels on
  // one of these or is caught by the plane's own pointer sweep: the price-axis policy and the
  // appearance ladder have no lane, and the appearance ladder says so where it moves. Subscribing on
  // the chart's own emitter rather than through the handle means a host cannot unsubscribe it.
  for (const lane of ['symbol', 'timeframe', 'style', 'scaleMode', 'indicator', 'compare', 'drawing'] as const) {
    events.on(lane, () => history.changed())
  }

  const unregisterCommands = registerChartCommands({
    commands: deps.commands,
    handle,
    styles: deps.styles,
    timeframes: deps.timeframes,
    ranges: deps.ranges,
    timezones: deps.timezones ?? null,
    indicatorOffered: (definition) => indicatorOffered(deps.builtInIndicators ?? null, definition),
    features: deps.features,
    ui: deps.ui,
    capabilities: deps.capabilities,
    resetAppearance,
    t: () => i18n.t,
    // What is PAINTED, which is the replay slice while replay is on: the data export writes what
    // the viewer can see and never a bar the cursor has not revealed.
    bars: () => shownBars(),
    // The feed's own statement of how deep its history goes, never the oldest bar that happens to
    // be loaded: the chart opens on a short window, and a preset judged against that would be
    // withheld for a market that serves years.
    earliestBar: () => earliestBarSecs,
    replayFromFirst,
    // A range preset frames the pane on its span AND switches to the timeframe that span reads
    // best at, which is what makes one chip a whole answer rather than half of one.
    frame: (preset) => {
      beginNavigation()
      // The span reads at the preset's own timeframe, or, when the widget does not offer it, at the
      // nearest coarser timeframe it offers, else the largest it offers.
      const target = rangeTimeframe(preset.tf, deps.timeframes)
      // Switching the timeframe reloads: the model is cleared synchronously and the new page is
      // still away, so framing here would measure an empty series and the arriving history would
      // fit content instead of the span. The intent waits for that load's first paint.
      if (target !== tf) {
        firstPageBars = Math.max(SNAPSHOT_BARS, barsForSpan(preset.span, target) ?? 0)
        handle.setTimeframe(target)
      }
      if (historyPainted) {
        pendingFrame = null
        frameRange(chart, anchor, preset.span, target)
        fillSpan(preset.span, target)
      } else {
        pendingFrame = { epoch, span: preset.span, tf: target }
      }
      setRangePreset(preset.key)
    },
    zoom: (direction) => {
      beginNavigation()
      const spacing = chart.timeScale().options().barSpacing
      chart.timeScale().applyOptions({ barSpacing: zoomedBarSpacing(spacing, direction) })
    },
    scroll: (direction) => {
      beginNavigation()
      const position = chart.timeScale().scrollPosition()
      chart.timeScale().scrollToPosition(scrolledPosition(position, direction), false)
    },
    level: () => menuLevel,
    formatter: () => symbolFormatter,
    compareOpen: (mode, changeFrom) => compare?.openDialog(mode, changeFrom),
    indicatorsOpen: (collection) => deps.doors.showIndicatorPicker(collection),
    symbolSearchOpen: () => deps.doors.openSearch({ mode: 'search', chart: handle }),
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
        // Only a declared timeframe the widget offers can be the one negotiation lands on.
        tf = resolveInitialTf(tf, cfg.resolutions?.filter((token) => offersTimeframe(deps.timeframes, token)))
        drawings.setTimeframe(tf)
        // The header carries the timeframe on screen, and negotiation can move it off the one the
        // host asked for. Leaving it stale makes the legend state a timeframe the chart is not on.
        legend.setHeader(symbol, tf)
        load()
        // The first reading is taken here rather than at construction: the negotiation above moves
        // the timeframe with no event and no key write, and a reading taken before it would make
        // the viewer's first change look like a timeframe change and offer to undo the negotiation.
        history.seed()
      })
  } else {
    deps.onConfig(null)
    load()
    history.seed()
  }

  /** The viewer's timezone choice, or the chart's default. A stored value outside the registry is
   *  ignored rather than honored: the formatters could not label an axis with it. One outside the
   *  zones the widget offers opens on the first offered, and stays stored as it is until the viewer
   *  chooses, so a chart that offers it again opens on it. */
  function readTimezoneChoice(): string {
    return offeredTimezone(storage.get(TIMEZONE_KEY) ?? deps.preferences.timezone, deps.timezones ?? null)
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

  function writeHidden(): void {
    storage.set(HIDDEN_KEY, JSON.stringify(indicators.hidden()))
  }

  return {
    handle,
    setLegendRows: (rows) => legend.setHostRows(rows),
    screenshot: () => chart.takeScreenshot(),
    repaintTheme() {
      applyLook()
      legend.setDot(session.state())
    },
    relabel() {
      applyTimezone() // the tick and crosshair formatters carry the language, so they rebuild
      setSymbolFormat(symbolFormat) // the formatter carries the language's decimal sign
      indicators.recompute()
      legend.setHeader(symbol, tf)
      drawings.relabel()
    },
    layoutChanged() {
      drawings.refresh()
      nav?.sync()
    },
    refreshAccess() {
      if (disposed) return
      legend.push()
      menu?.refresh()
      nav?.sync()
      drawings.refresh()
    },
    runShortcutAt: (clientX, clientY, pressed) => menu?.runShortcutAt(clientX, clientY, pressed) ?? false,
    applyDrawingToolIntent(arg) {
      drawings.applyToolIntent(arg)
    },
    rebindDrawingIdentity(id) {
      drawings.rebindIdentity(id)
    },
    activeChanged(active) {
      extensions.host.activeChanged(active)
    },
    mountDrawingToolbar: (container) => drawings.mountToolbar(container),
    dispose() {
      if (holdFrame !== null) window.cancelAnimationFrame(holdFrame)
      holdFrame = null
      if (disposed) return
      disposed = true
      epoch++
      pendingFrame = null
      unsubscribe?.()
      unsubscribe = null
      unregisterCommands()
      baselineLevel.destroy()
      nav?.destroy()
      replay.destroy()
      countdown?.destroy()
      countdown = null
      countdownClock.destroy()
      pointer?.destroy()
      ranges.stopGlide()
      fling.destroy()
      pinch.destroy()
      plotArea.destroy()
      // Extensions come down FIRST, while the chart they drew on is still there to take the drawing
      // off. Detaching after the renderer is gone would leave their teardown reaching into nothing.
      extensions.destroy()
      history.destroy()
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
      unregisterRangeMirror()
      releaseMirror()
      events.clear()
      gestures.removeEventListener('mousedown', onNativeDragStart)
      gestures.removeEventListener('pointerdown', onNativeDragStart)
      gestures.removeEventListener('touchmove', onNativeTouchOrWheel)
      gestures.removeEventListener('wheel', onNativeTouchOrWheel)
      navigationRoot.removeEventListener('mousemove', onNativeDragMove)
      navigationRoot.removeEventListener('pointermove', onNativeDragMove)
      navigationRoot.removeEventListener('mouseup', onNativeDragEnd)
      navigationRoot.removeEventListener('pointerup', onNativeDragEnd)
      navigationRoot.removeEventListener('pointercancel', onNativeDragEnd)
      chart.remove()
      gestures.remove()
      // Any popup or dialog still hosted in the chrome subtree closes with it, taking its document
      // listeners and timers down rather than leaving them bound to a detached panel.
      closeOverlays(chrome)
      chrome.remove()
    },
  }
}
