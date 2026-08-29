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
export {
  storageSaveLoadAdapter,
  type ChartMeta,
  type ChartSaveData,
  type ChartSaveLoadAdapter,
  type DrawingScope,
  type TemplateKind,
  type TemplateMeta,
  type TemplateStore,
} from './saveLoad'
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

export type { ChartWidgetApi, ChartDrawingsApi, ChartExecutionsApi, ChartPaneSyncApi, ChartReplayApi, ChartSaveLoadApi, ChartTicketApi, ResolvedTheme } from './host'
export { ARRANGEMENTS, LAYOUT_MENU_ROWS, arrangementOf, type Arrangement, type PaneRect } from './layoutGrid'
export { createChartLayout, type ChartLayoutApi, type ChartLayoutOptions, type LayoutSyncFlags } from './layout'
export {
  attachExecutionMarks,
  groupExecutionsByBar,
  type ArrowHit,
  type ExecutionCardPalette,
  type ExecutionGroup,
  type ExecutionMarksHandle,
  type ExecutionMarksOptions,
  type ExecutionScope,
} from './executionMarks'
export { createOrderTicket, type OrderTicket, type OrderTicketDeps, type TicketOrderType, type TicketState, type TicketSubmit } from './orderTicket'
export { mountAccountPanel, type AccountPanelHandle } from './accountPanel'
export { openInputsEditor } from './inputsEditor'
export { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds, type ReplaySpeed } from './replay'
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
export { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, layerOverrides, mergeOverrides, type ChartOverrides, type PartialOverrides } from './overrides'
export { createChart, resolveTheme, applyBar, resolveInitialTf } from './host'
export { arrangementName, chartDictionaries, createChartI18n, toolName, type ChartI18n, type ChartMessageKey, type ChartTranslate } from './i18n'
