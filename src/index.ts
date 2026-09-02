// quickcharts — the charting library's public surface. A host builds a chart by supplying a ChartDatafeed
// (implement it directly for real-time, or point createUdfDatafeed at a UDF server for the trivial on-ramp),
// optionally a ChartStorage for where viewer state lives, and the widget options/theme/event hooks. The
// engine reference implementation of ChartDatafeed lives in the trdrs app; this package is what a third
// party depends on to build their own platform on the chart.

export type {
  FeedBar,
  SymbolRow,
  SearchPage,
  SessionClass,
  HistoryPage,
  OlderPageVerdict,
  BarsEvent,
  SubscribeHandlers,
  DatafeedConfig,
  ChartDatafeed,
} from './datafeed'
export { FeedUnavailableError, olderPageVerdict } from './datafeed'

export type { ChartStorage } from './storage'
export { memoryChartStorage } from './storage'

export type { FetchLike, UdfDatafeedOptions } from './udfDatafeed'
export { createUdfDatafeed } from './udfDatafeed'
export { tfToUdfResolution, udfResolutionToTf } from './udfResolution'

export type { ChartTheme, ChartWidgetEvents, ChartWidgetOptions, IndicatorDefinition, IndicatorInstance } from './widget'

// The extension seam — a TYPE contract only. A host writes an object against `ChartExtension` and
// hands it to `ChartWidgetOptions.extensions`; the chart owns every runtime piece, which is what
// lets it take back everything an extension drew.
export type {
  ChartExtension,
  ChartExtensionChart,
  ChartExtensionCommand,
  CommandRegistry,
  ChartExtensionContext,
  ChartExtensionHandle,
  ChartExtensionMenuContext,
  ChartExtensionMenuItem,
  ChartExtensionMenuProvider,
  ChartExtensionPane,
  ChartExtensionPriceLine,
  ChartExtensionReplayState,
  ChartExtensionScope,
  ChartExtensionSeries,
  ChartPriceFormatter,
} from './extension'

export type {
  ManifestInput,
  ManifestPlot,
  ManifestLevel,
  ManifestFill,
  IndicatorManifest,
  PlotPoint,
  IndicatorPlot,
  IndicatorLevel,
  IndicatorFill,
  IndicatorPlots,
  IndicatorOverrides,
  ManifestRun,
} from './indicatorModel'
export {
  applyPlotOverrides,
  buildManifestPlots,
  effectivePlotColor,
  indicatorHidden,
  latestPlotValue,
  manifestInputDefaults,
  overriddenManifest,
} from './indicatorModel'
export { FillBetweenPrimitive, ShadePrimitive } from './indicatorPrimitives'
export { attachIndicators, type IndicatorsRenderer } from './indicatorRenderer'

export { COLLAPSED_H, MAIN_MIN_H, isCollapsed, planPaneOp, type PaneOp, type PanePlan, type PaneState } from './panePlan'
export { chartContextMenu, type ChartMenuAction, type ChartMenuContext, type ChartMenuIcon, type ChartMenuRow } from './contextMenu'
export { mountContextMenu, type ContextMenuHandle } from './contextMenuUi'
export { coerceScaleMode, PRICE_SCALE_MODE, SCALE_MODES, SCALE_MODE_OPTIONS, type ScaleMode } from './scaleMode'
export { attachCompare, clipToWindow, COMPARE_COLORS, pickCompareColor, seriesTargetOf, type CompareDeps, type CompareEntry, type CompareHandle, type ComparePlacement, type CompareSnapshot, type CompareSymbol } from './compare'
export {
  createSessionBands,
  exchangeZoneOf,
  isIntradayTf,
  knownMarketKind,
  marketKindOf,
  nextSessionChange,
  sessionOf,
  sessionTimeline,
  setHolidayCalendar,
  SESSION_DOT,
  SESSION_LABEL,
  type HolidayCalendar,
  type MarketKind,
  type MarketSession,
  type MaybeMarketKind,
  type SessionBandsPrimitive,
  type SessionTimeline,
} from './sessions'

export type {
  ChartWidgetApi,
  ChartDrawingsApi,
  ChartPaneSyncApi,
  ChartReplayApi,
  ChartSaveLoadApi,
  OpenResource,
  ResourceLoadOutcome,
  ResourceRemoveOutcome,
  ResourceSaveOutcome,
  ResolvedTheme,
} from './host'
export { ARRANGEMENTS, LAYOUT_MENU_ROWS, arrangementOf, type Arrangement, type PaneRect } from './layoutGrid'
export { createChartLayout, type ChartLayoutApi, type ChartLayoutOptions, type LayoutSaveLoadApi, type LayoutSyncFlags } from './layout'
export { openInputsEditor } from './inputsEditor'
export { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from './replay'
export { attachDrawings, placeableByWidget, type AttachDrawingsOptions, type DrawingsEvents, type DrawingsHandle } from './drawings'
export { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, layerOverrides, mergeOverrides, type ChartOverrides, type PartialOverrides } from './overrides'
export { createChart, resolveTheme, applyBar, resolveInitialTf } from './host'
export {
  BUILT_IN_LOCALES,
  arrangementName,
  chartDictionaries,
  createChartI18n,
  toolName,
  type ChartCustomLocale,
  type ChartDictionary,
  type ChartI18n,
  type ChartI18nOptions,
  type ChartLocale,
  type ChartLocaleCode,
  type ChartMessageKey,
  type ChartTranslate,
} from './i18n'

// ── W1-B: symbology, the price formatter, and the revisioned resource contract ────────────────
// The symbology contract and its formatter are root Quick Charts API (DECISIONS.md: no symbology
// subpath, package, or repository). `SymbolInfo` is the shape `ChartDatafeed.resolve` answers
// with. The revisioned saved-resource contract in `resources.ts` is the one save/load seam: the
// widget, the layout and every host adapter run over its four `ResourceStore` families.
export type { DataStatus, PriceFormat, SymbolInfo, TickBand } from './symbology'
export { parseTickBands, tickBandFor } from './symbology'
export type { NumericPunctuation, PriceFormatter, PriceFormatterOptions } from './priceFormatter'
export { createPriceFormatter } from './priceFormatter'
export type { UdfSymbolResponse } from './udfSymbology'
export { udfPriceFormat, udfSymbolInfo } from './udfSymbology'
export type {
  ChartBody,
  ChartMeta,
  ChartSaveLoadAdapter,
  DrawingScope,
  DrawingsBody,
  DrawingsMeta,
  LayoutBody,
  LayoutMeta,
  MemoryResourcesOptions,
  ResourceRef,
  ResourceStore,
  TemplateBody,
  TemplateKind,
  TemplateMeta,
  WriteOutcome,
} from './resources'
export { memorySaveLoadAdapter, ResourceAbortError } from './resources'
// ── end W1-B ──────────────────────────────────────────────────────────────────────────────────

// ── W2-C: the executable theme contract ───────────────────────────────────────────────────────
// Quick Charts ships complete light and dark UI. A host selects a mode, optionally overrides the
// semantic palette for either mode, and switches at runtime through one controller; the chart keeps
// its symbol, timeframe, range, drawings and studies across the switch. `THEME_ROLES` is the public
// role inventory the palettes and the generated stylesheet are built from, and the same list is
// published as `dist/theme-manifest.json`.
//
// The stylesheet is a separate asset: import `quickcharts/styles.css` once. The chart injects no
// styles from JavaScript, and its custom-property names and component selectors are private.
//
// Chart appearance is the other ladder: `ChartOverrides.appearance` names specific series, grid and
// study visuals and wins over the broad palette wherever both could reach the same pixel.
export { createThemeController } from './theme/controller'
export { THEME_ROLES } from './theme/schema'
export type {
  CustomThemes,
  SemanticTheme,
  ThemeMode,
  ThemeRole,
  ThemeRoleFamily,
  ThemeRoleId,
  ThemeRoleKind,
} from './theme/schema'
export type { ThemeChangeListener, ThemeController, ThemeControllerOptions } from './theme/controller'
export type { ThemeDiagnostic, ThemeDiagnosticCode } from './theme/validate'
// ── end W2-C ──────────────────────────────────────────────────────────────────────────────────
// ── W2-B: the built-in indicators ───────────────────────────────────────────────────────
// The 23 built-in definitions ship in the package (the day-one catalog of
// public-chart-library-boundary-plan.md), each a plain IndicatorDefinition with its catalog keys,
// tag and category beside it. A host mounts one through ChartWidgetOptions.indicators exactly as
// it mounts its own definition, and reads its name through the chart's ChartI18n.
export { BUILT_IN_INDICATORS, type BuiltInIndicator, type IndicatorCategory } from './builtInIndicators'
// ── end W2-B ──────────────────────────────────────────────────────────────────────────
// ── W2-A: the symbol price format a study scale falls back to ────────────────────────────────
// The renderer's `symbolPriceFormat` option names this shape; a host composing the renderer
// itself supplies it from its own symbol formatter.
export type { SymbolPriceFormat } from './indicatorRenderer'
// ── end W2-A ──────────────────────────────────────────────────────────────────────────────────
