// The network-denied WebView guest: Quick Charts as one local page a native host loads from its own
// files and drives over a typed bridge. It proves the chart bundles into a network-denied local
// WebView guest from its public surface alone; the guest is a build artifact, kept out of the
// published package.
//
// This entry imports the chart's public surface and nothing else. It publishes one frozen global
// the host reaches through its WebView bridge: the constructor, the drawing catalog, the built-in
// registries and the guest's own version, so a host can mount a chart over a datafeed it supplies
// and read the inventory the guest carries. It opens no connection, reads no storage, and knows no
// service: data arrives through the datafeed the host hands `createChart`, and nothing here names a
// URL. The page's Content Security Policy in index.html forbids every origin but its own.
import {
  ARRANGEMENTS,
  BUILT_IN_INDICATORS,
  BUILT_IN_LOCALES,
  CHART_STYLES,
  createChart,
  createChartI18n,
  createPriceFormatter,
  memoryChartStorage,
  memorySaveLoadAdapter,
  THEME_ROLES,
  TIMEFRAME_PRESETS,
  TIMEZONES,
} from '../src/index'
import { drawingTools, TOOL_CATEGORIES } from '../src/drawings/index'

/** Stamped by the guest build from package.json. */
declare const __QC_VERSION__: string

/** What the host reaches through the bridge. */
export interface QuickChartsGuest {
  readonly version: string
  readonly createChart: typeof createChart
  readonly createChartI18n: typeof createChartI18n
  readonly createPriceFormatter: typeof createPriceFormatter
  readonly memoryChartStorage: typeof memoryChartStorage
  readonly memorySaveLoadAdapter: typeof memorySaveLoadAdapter
  readonly drawingTools: typeof drawingTools
  readonly inventory: {
    readonly styles: readonly string[]
    readonly indicators: readonly string[]
    readonly drawings: readonly string[]
    readonly drawingCategories: readonly string[]
    readonly layouts: readonly string[]
    readonly timeframes: readonly string[]
    readonly timezones: readonly string[]
    readonly themeRoles: readonly string[]
    readonly locales: readonly string[]
  }
  /** The element the guest page reserves for the chart. */
  container(): HTMLElement | null
}

declare global {
  interface Window {
    quickchartsGuest?: QuickChartsGuest
  }
}

const guest: QuickChartsGuest = Object.freeze({
  version: __QC_VERSION__,
  createChart,
  createChartI18n,
  createPriceFormatter,
  memoryChartStorage,
  memorySaveLoadAdapter,
  drawingTools,
  inventory: Object.freeze({
    styles: [...CHART_STYLES],
    indicators: BUILT_IN_INDICATORS.map((d) => d.id),
    drawings: drawingTools.all().map((t) => t.type),
    drawingCategories: [...TOOL_CATEGORIES],
    layouts: ARRANGEMENTS.map((a) => a.code),
    timeframes: TIMEFRAME_PRESETS.flatMap((g) => g.tokens),
    timezones: TIMEZONES.map((z) => z.id),
    themeRoles: THEME_ROLES.map((r) => r.id),
    locales: BUILT_IN_LOCALES.map((l) => l.code),
  }),
  container: () => document.getElementById('chart'),
})

window.quickchartsGuest = guest
