// The public widget surface a host configures the chart through — the contract that decouples "what a host
// supplies" (a datafeed, a store, a symbol, a theme, event hooks) from the chart's internal React
// props/state. A host constructs the chart with these options; the running host component reads them. The
// options are stable public API; the component that mounts them is the remaining packaging step.
import type { ChartDatafeed } from './datafeed'
import type { ChartStorage } from './storage'

/** Theme overrides — a host tints the chart to its own palette. Every field optional; omitted values keep
 *  the built-in default. Colors are any CSS color string. */
export interface ChartTheme {
  background?: string
  gridColor?: string
  textColor?: string
  upColor?: string
  downColor?: string
  /** 'dark' | 'light' base the other defaults derive from when a specific color is not given. */
  mode?: 'dark' | 'light'
}

/** Lifecycle + interaction events a host subscribes to. All optional; each is a plain callback so a host
 *  wires them to its own state without a framework dependency. */
export interface ChartWidgetEvents {
  /** The chart is mounted and has painted its first data. */
  onReady?: () => void
  /** The active symbol changed (a search pick, a linked-symbol publish). */
  onSymbolChange?: (symbol: string) => void
  /** The active timeframe changed. */
  onTimeframeChange?: (tf: string) => void
  /** The feed reported a terminal or status condition ('live' | 'no-data' | 'not_entitled' | …). */
  onFeedStatus?: (status: string) => void
}

/** Everything needed to construct a chart. `datafeed` is the only hard requirement — the rest have
 *  defaults (browser storage, a starting symbol/timeframe, the built-in dark theme). */
export interface ChartWidgetOptions {
  /** The DOM element the chart mounts into. */
  container: HTMLElement
  /** The market-data backend. Required — this is the seam the whole design turns on. */
  datafeed: ChartDatafeed
  /** Where the chart persists viewer state (drawings, indicators, appearance). Defaults to the browser's
   *  localStorage; a host supplies its own to sync state to a user account. */
  storage?: ChartStorage
  /** The symbol to open on. */
  symbol?: string
  /** The timeframe token to open on (e.g. '1m', '1h', '1d'). */
  timeframe?: string
  /** Palette overrides. */
  theme?: ChartTheme
  /** Extra indicator plugins to register beyond the built-ins. */
  indicators?: IndicatorPlugin[]
  events?: ChartWidgetEvents
}

/** A third-party indicator, registered through {@link ChartWidgetOptions.indicators}. `compute` runs over
 *  the visible bar series and returns one or more plot lines the chart overlays; the host never reaches
 *  into chart internals. Kept intentionally small — richer plot kinds (histograms, bands, marks) extend
 *  this contract additively rather than by exposing the renderer. */
export interface IndicatorPlugin {
  /** Stable id (namespaced to avoid colliding with built-ins), e.g. 'acme:supertrend'. */
  id: string
  /** Display name in the indicator picker. */
  name: string
  /** Numeric inputs the settings UI renders (period, multiplier, …), with their defaults. */
  inputs?: Record<string, number>
  /** Compute plot series from the bar closes/OHLCV and the resolved inputs. Pure — no side effects, no
   *  chart access. Returns one array of `{ time, value }` points per plotted line. */
  compute(bars: ReadonlyArray<{ t: number; o: number; h: number; l: number; c: number; v: number }>, inputs: Record<string, number>): IndicatorPlot[]
}

export interface IndicatorPlot {
  /** Line label (shown in the legend). */
  label: string
  /** CSS color for the line. */
  color?: string
  points: Array<{ time: number; value: number }>
}
