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
  HistoryPage,
  QuoteSnapshot,
  BarsEvent,
  SubscribeHandlers,
  ChartDatafeed,
} from './datafeed'
export { FeedUnavailableError } from './datafeed'

export type { ChartStorage } from './storage'
export { localStorageChartStorage, memoryChartStorage } from './storage'

export type { FetchLike, UdfDatafeedOptions } from './udfDatafeed'
export { createUdfDatafeed, tfToUdfResolution } from './udfDatafeed'

export type { ChartTheme, ChartWidgetEvents, ChartWidgetOptions, IndicatorPlugin, IndicatorPlot } from './widget'

export type { ChartWidgetApi, ResolvedTheme } from './host'
export { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, mergeOverrides, type ChartOverrides, type PartialOverrides } from './overrides'
export { createChart, resolveTheme, applyBar } from './host'
