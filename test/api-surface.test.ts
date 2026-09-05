// The API-surface pin — a lightweight stand-in for an api-extractor report: the package's public
// RUNTIME surface as { name: typeof }. A diff here is a SemVer event to decide consciously (a
// removal/rename is breaking → major; an addition → minor, then extend the pin) — never noise to
// appease. Type-only exports are erased at runtime so they cannot be pinned here; the clean-room
// consumer (clean-room/ts-consumer, skipLibCheck: false) compiles against the shipped .d.ts and is
// their gate.
import { describe, expect, it } from 'vitest'
import * as api from '../src/index'

const SURFACE: Record<string, string> = {
  // Unchanged by the extension seam, on purpose: `ChartExtension` and its context, handle, series
  // capabilities, menu rows and command specs are TYPES only. A host writes an object against them
  // and hands it to `ChartWidgetOptions.extensions`; every runtime piece stays inside the chart,
  // which is exactly what lets the chart take back whatever an extension drew. The clean-room
  // consumer compiles those declarations.
  // The free chart's runtime surface holds chart behavior only: nothing here draws, plans or
  // places anything for an account. Chart-native trading is @trdrs/chart-trading's own surface,
  // mounted through the extension seam.
  // Additive (minor): the multi-chart arrangement catalog, 2026-08-22. The layout HOST is no longer
  // a constructor of its own: a widget always has a layout, reached as `widget.layout`.
  ARRANGEMENTS: 'object',
  LAYOUT_MENU_ROWS: 'object',
  arrangementOf: 'function',
  // Additive (minor): COMPARE — other symbols beside the charted one, 2026-08-28.
  attachCompare: 'function',
  clipToWindow: 'function',
  COMPARE_COLORS: 'object',
  pickCompareColor: 'function',
  seriesTargetOf: 'function',
  // Additive (minor): the interface language — the widget's own catalog over its own localization runtime, 2026-08-25.
  BUILT_IN_LOCALES: 'object',
  createChartI18n: 'function',
  chartDictionaries: 'object',
  toolName: 'function',
  arrangementName: 'function',
  BRAND_DOWN: 'string',
  BRAND_UP: 'string',
  COLLAPSED_H: 'number',
  DEFAULT_OVERRIDES: 'object',
  FeedUnavailableError: 'function',
  FillBetweenPrimitive: 'function',
  MAIN_MIN_H: 'number',
  PRICE_SCALE_MODE: 'object',
  REPLAY_SPEEDS: 'object',
  SCALE_MODES: 'object',
  SCALE_MODE_OPTIONS: 'object',
  SESSION_DOT: 'object',
  SESSION_LABEL: 'object',
  ShadePrimitive: 'function',
  applyBar: 'function',
  applyPlotOverrides: 'function',
  attachDrawings: 'function',
  attachIndicators: 'function',
  autoIntervalFor: 'function',
  buildManifestPlots: 'function',
  chartContextMenu: 'function',
  coerceScaleMode: 'function',
  composeFormingBar: 'function',
  createChart: 'function',
  createSessionBands: 'function',
  createUdfDatafeed: 'function',
  effectivePlotColor: 'function',
  indicatorHidden: 'function',
  isCollapsed: 'function',
  latestPlotValue: 'function',
  layerOverrides: 'function',
  manifestInputDefaults: 'function',
  memoryChartStorage: 'function',
  mergeOverrides: 'function',
  mountContextMenu: 'function',
  openInputsEditor: 'function',
  olderPageVerdict: 'function',
  overriddenManifest: 'function',
  placeableByWidget: 'function',
  planPaneOp: 'function',
  resolveInitialTf: 'function',
  subIntervalsFor: 'function',
  tfSeconds: 'function',
  tfToUdfResolution: 'function',
  udfResolutionToTf: 'function',
  // ── Symbology, the price formatter and the revisioned resource contract ─────────────────────
  // Additive (minor): symbology and its one price formatter, the UDF symbology mapping, and the
  // revisioned saved-resource contract with its in-memory reference store.
  ResourceAbortError: 'function',
  createPriceFormatter: 'function',
  memorySaveLoadAdapter: 'function',
  // Additive (minor): the drawings document — where one lives, what it holds, and the pure rules
  // a host needs to read or merge one itself.
  DRAWING_CONTEXT_VERSION: 'number',
  DRAWING_DOCUMENT_VERSION: 'number',
  drawingBuried: 'function',
  drawingContextKey: 'function',
  emptyDrawingDocument: 'function',
  liveDrawingEntries: 'function',
  liveDrawingGroups: 'function',
  mergeDrawingDocuments: 'function',
  parseDrawingDocument: 'function',
  reviseDrawingDocument: 'function',
  sameDrawingContext: 'function',
  parseTickBands: 'function',
  tickBandFor: 'function',
  udfPriceFormat: 'function',
  udfSymbolInfo: 'function',
  // ── The executable theme contract ───────────────────────────────────────────────────────────
  // Additive (minor): the executable theme contract. `THEME_ROLES` is the public semantic role
  // inventory; `createThemeController` is the one runtime surface for mode selection, custom
  // palettes and change subscriptions. Everything else the theme system exposes is type-only, so
  // the clean-room consumer compiling the shipped declarations is its gate.
  THEME_ROLES: 'object',
  createThemeController: 'function',
  canvasTheme: 'function',
  // ── The built-in indicators ─────────────────────────────────────────────────────────────────
  // Additive (minor): the 23 built-in indicator definitions, bundled from the chart-indicators
  // seam, as one ordered registry. `BuiltInIndicator` and `IndicatorCategory` are types.
  BUILT_IN_INDICATORS: 'object',
  // ── Timeframes, timezones, sessions, ranges and search ──────────────────────────────────────
  // Additive (minor): the timeframe grammar and its 26 presets, the 60 display timezones and
  // their formatters, the session model and market status over a symbol's own session metadata,
  // the nine range presets with the framing and navigation step rules, and the search controller
  // with its recents port and list rules. The shapes (Timeframe, SessionModel, MarketStatus,
  // RangePreset, SearchState, RecentsPort) are types. The session model replaces the per-class
  // session model: sessionStateAt, nextSessionChange and sessionTimeline answer over a symbol's
  // own facts, and the active-subsession rules (DEFAULT_SUBSESSION, hasExtendedHours,
  // subsessionBarFilter) answer over a symbol's named subsessions.
  TIMEFRAME_MAX: 'object',
  TIMEFRAME_PRESET_TOKENS: 'object',
  TIMEFRAME_PRESETS: 'object',
  TIMEFRAME_UNIT_NAME: 'object',
  TIMEFRAME_UNIT_SECONDS: 'object',
  TIMEFRAME_UNITS: 'object',
  allowedTimeframes: 'function',
  compareTimeframes: 'function',
  formatTimeframe: 'function',
  isIntradayTimeframe: 'function',
  parseTimeframe: 'function',
  timeframeAllowed: 'function',
  timeframeGroupUnit: 'function',
  timeframeLabel: 'function',
  timeframeOrder: 'function',
  timeframeSeconds: 'function',
  DEFAULT_TIMEZONE: 'string',
  EXCHANGE_TIMEZONE: 'string',
  TIMEZONES: 'object',
  formatClock: 'function',
  isTimezoneChoice: 'function',
  makeCrosshairTimeFormatter: 'function',
  makeTickMarkFormatter: 'function',
  resolveDisplayTimezone: 'function',
  timezoneCity: 'function',
  timezoneLabel: 'function',
  timezoneListing: 'function',
  tzOffsetLabel: 'function',
  tzOffsetMinutes: 'function',
  zoneClock: 'function',
  DEFAULT_SUBSESSION: 'string',
  SESSION_STATE_TITLE: 'object',
  exchangeTimezoneText: 'function',
  formatDuration: 'function',
  hasExtendedHours: 'function',
  marketStatus: 'function',
  marketStatusFor: 'function',
  marketStatusText: 'function',
  marketStatusTitle: 'function',
  nextSessionChange: 'function',
  parseSessionModel: 'function',
  sessionStateAt: 'function',
  sessionTimeline: 'function',
  subsessionBarFilter: 'function',
  MIN_BAR_SPACING: 'number',
  RANGE_PRESETS: 'object',
  SCROLL_STEP_BARS: 'number',
  ZOOM_FACTOR: 'number',
  frameRange: 'function',
  rangeAvailable: 'function',
  rangePresetTip: 'function',
  rangeSpanSeconds: 'function',
  scrolledPosition: 'function',
  zoomedBarSpacing: 'function',
  RECENT_SYMBOLS_CAP: 'number',
  SPREAD_OPERATORS: 'object',
  createSearchController: 'function',
  isSymbolPair: 'function',
  looksLikeSpread: 'function',
  matchSegments: 'function',
  memoryRecents: 'function',
  promoteRecent: 'function',
  spreadExpression: 'function',
  spreadSearchQuery: 'function',
  // ── The widget kernel ───────────────────────────────────────────────────────────────────────
  // The widget kernel. `createChart` answers a `ChartWidget` that hosts one or many `ChartHandle`s;
  // its four configuration planes, its command registry, its two event maps and its layout, theme,
  // fullscreen and image surfaces are TYPES, so the clean-room consumer compiling the shipped
  // declarations is their gate. What is runtime here is the style vocabulary, the bar-series
  // algebra, and the image composition a host may reuse over its own bitmaps.
  //
  // Breaking (major) in the same landing: the standalone layout constructor, the one-shot theme
  // resolver and the constructor callback bag are gone, with no alias. A widget always has a
  // layout, a theme is a controller, and events are subscriptions. Their names are recorded in
  // scripts/retired-surfaces.json, which is what proves them absent on every gate.
  CHART_STYLES: 'object',
  coerceChartStyle: 'function',
  isChartStyle: 'function',
  valueShaped: 'function',
  IMAGE_HEADER_H: 'number',
  canvasToBlob: 'function',
  composeImage: 'function',
  imageFileName: 'function',
  imageHeaderRuns: 'function',
  imageLayoutHeaderRuns: 'function',
  imageTileRuns: 'function',
  // The default chrome adds NO runtime export: every surface is mounted by `createChart` and
  // driven through the registry, the planes and the event maps, and a host reaches it through
  // `FeatureConfig` (one flag per surface), `ChartPreferences` (the saved and custom timeframes,
  // layout autosave), `ChartWidgetOptions.search.classNames`, `ChartDatafeed.earliestBar` and the
  // `layout` and `image` members of `WidgetEvents` (`LayoutEvent`, `ImageEvent`), which are
  // all types. The clean-room consumer compiling the shipped declarations is their gate.
}

describe('quickcharts API surface pin', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort())
  })

  it('every export keeps its pinned runtime type', () => {
    for (const [name, kind] of Object.entries(SURFACE)) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe(kind)
    }
  })
})
