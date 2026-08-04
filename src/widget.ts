// The public widget surface a host configures the chart through — the contract that decouples "what a host
// supplies" (a datafeed, a store, a symbol, a theme, event hooks) from the chart's internal React
// props/state. A host constructs the chart with these options; the running host component reads them. The
// options are stable public API; the component that mounts them is the remaining packaging step.
import type { ChartDatafeed, FeedBar } from './datafeed'
import type { ChartStorage } from './storage'
import type { IndicatorManifest, IndicatorOverrides } from './indicatorModel'

/** Theme overrides — a host tints the chart to its own palette. Every field optional; omitted values keep
 *  the built-in default. Colors are any CSS color string. */
export interface ChartTheme {
  background?: string
  gridColor?: string
  textColor?: string
  upColor?: string
  downColor?: string
  /** Axis-label size in px. Injected rather than hardcoded because this text is drawn into a canvas,
   *  where a stylesheet cannot reach it — an embedder passes the size its own type scale uses so the
   *  chart's labels stay in step with the surface around them. */
  fontSize?: number
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
  /** Indicator instances on the chart. Each pairs a host-supplied definition (manifest + compute)
   *  with instance inputs/overrides; the widget renders them through the same manifest pipeline
   *  richer hosts use — panes, histograms, areas, markers, levels, band fills. */
  indicators?: IndicatorInstance[]
  /** The drawing layer (on by default): tools, selection, per-symbol persistence, and a small
   *  built-in rail. `false` removes the layer entirely; `{ rail: false }` keeps the layer but
   *  hides the rail for a host that drives `ChartWidgetApi.drawings` from its own UI;
   *  `storageKey` names the persisted store document (one key = one drawings surface). */
  drawings?: false | { rail?: false; storageKey?: string }
  events?: ChartWidgetEvents
}

/** An indicator DEFINITION a host supplies: the declarative manifest plus a pure compute over the
 *  widget's bars. Compute stays outside the package on purpose — the widget owns the rendering
 *  pipeline (panes, histograms, levels, fills), never the math — and returns per-plot value
 *  channels aligned 1:1 to `bars`, NaN/null through the warmup (the walker maps those to clean
 *  whitespace gaps). No side effects, no chart access. */
export interface IndicatorDefinition {
  manifest: IndicatorManifest
  compute(bars: readonly FeedBar[], inputs: Record<string, number>): Readonly<Record<string, readonly (number | null)[]>>
}

/** One configured indicator on the chart: a definition + this instance's inputs and styling. */
export interface IndicatorInstance {
  /** Stable id — keys the instance's series across recomputes. */
  id: string
  definition: IndicatorDefinition
  /** Input values over the manifest defaults (absent keys fall back to the defaults). */
  inputs?: Record<string, number>
  /** The instance's color — any plot channel without a declared color takes it. */
  color?: string
  /** Display title; defaults to the manifest name, then the id. */
  title?: string
  overrides?: IndicatorOverrides
}
