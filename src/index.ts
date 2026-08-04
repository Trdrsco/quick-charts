// @trdrs/chart — the charting library's public surface. A host builds a chart by supplying a ChartDatafeed
// (implement it directly for real-time, or point createUdfDatafeed at a UDF server for the trivial on-ramp),
// optionally a ChartStorage for where viewer state lives, and the widget options/theme/event hooks. The
// engine reference implementation of ChartDatafeed lives in the trdrs app; this package is what a third
// party depends on to build their own platform on the chart.

export type {
  FeedBar,
  SymbolRow,
  SearchPage,
  SymbolInfo,
  SessionClass,
  HistoryPage,
  OlderPageVerdict,
  QuoteSnapshot,
  BarsEvent,
  SubscribeHandlers,
  DatafeedConfig,
  ChartDatafeed,
} from './datafeed'
export { FeedUnavailableError, olderPageVerdict } from './datafeed'

export type { ChartStorage } from './storage'
export { localStorageChartStorage, memoryChartStorage } from './storage'

export type { FetchLike, UdfDatafeedOptions } from './udfDatafeed'
export { createUdfDatafeed, tfToUdfResolution, udfResolutionToTf } from './udfDatafeed'

export type { ChartTheme, ChartWidgetEvents, ChartWidgetOptions, IndicatorDefinition, IndicatorInstance } from './widget'

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

export type { ChartWidgetApi, ChartDrawingsApi, ResolvedTheme } from './host'
export { attachDrawings, placeableByWidget, type AttachDrawingsOptions, type DrawingsEvents, type DrawingsHandle } from './drawings'
export * from './broker'
export { attachTradeLines, normalizeRoot, type PreviewLine, type PreviewSet, type TradeLineAttachment, type TradeLineHost, type TradeLineOptions } from './tradeLines'
export {
  buildOrderParts,
  buildPositionParts,
  drawParts,
  withAlpha,
  EXIT_ZONE_ALPHA,
  formatPnlMoney,
  formatPnlPercent,
  formatPnlTicks,
  findPart,
  hitTestParts,
  layoutParts,
  unionRect,
  PART_H,
  TRADE_FONT,
  TRADE_THEME,
  type DragRole,
  type LayoutCtx,
  type LayoutNode,
  type ExitPartsInput,
  type OrderPartsInput,
  type PartHit,
  type PartRole,
  type PartSpec,
  type PositionPartsInput,
  type DraftPartsInput,
} from './tradeLineParts'
export { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, mergeOverrides, type ChartOverrides, type PartialOverrides } from './overrides'
export { createChart, resolveTheme, applyBar, resolveInitialTf } from './host'
