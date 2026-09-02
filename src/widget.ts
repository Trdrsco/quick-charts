// The public widget surface a host configures the chart through — the contract that decouples "what a host
// supplies" (a datafeed, a store, a symbol, a theme, event hooks) from the chart's internal React
// props/state. A host constructs the chart with these options; the running host component reads them. The
// options are stable public API; the component that mounts them is the remaining packaging step.
import type { ChartDatafeed, FeedBar } from './datafeed'
import type { ChartStorage } from './storage'
import type { ChartSaveLoadAdapter, ResourceRef } from './resources'
import type { PartialOverrides } from './overrides'
import type { IndicatorManifest, IndicatorOverrides } from './indicatorModel'
import type { ChartLocaleCode } from './i18n'
import type { ChartI18n } from './i18n'
import type { ChartExtension } from './extension'

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
  /** Viewer state changed (a drawing edit, a symbol/timeframe/scale switch, a legend eye…) —
   *  debounced ~1s so a drag emits once, not per frame. TradingView's onAutoSaveNeeded shape: a
   *  host that saves the open chart through `api.saveLoad.save()` calls it here. The widget
   *  already persists its own sticky preferences through `storage` either way — this event
   *  exists for hosts saving NAMED charts on top of that. */
  onSaveNeeded?: () => void
  /** A write the widget made on its own (the drawing layer persisting a symbol's drawings) was
   *  refused because the stored document moved on, or vanished, since it was read. The widget
   *  never overwrites newer work: it keeps the on-screen state, adopts the current ref for the next
   *  write, and tells the host here with the catalog's copy for the case. */
  onSaveConflict?: (info: { family: 'drawings'; symbol: string; current: ResourceRef | null; message: string }) => void
}

/** Everything needed to construct a chart. `datafeed` is the only hard requirement — the rest have
 *  defaults (browser storage, a starting symbol/timeframe, the built-in dark theme). */
export interface ChartWidgetOptions {
  /** Curated quick-add rows for the compare dialog (the reference's compare_symbols shape) —
   *  rendered above search results in compare mode. Absent ⇒ the dialog is search-only. */
  compareSymbols?: import('./compare').CompareSymbol[]
  /** The DOM element the chart mounts into. */
  container: HTMLElement
  /** The market-data backend. Required — this is the seam the whole design turns on. */
  datafeed: ChartDatafeed
  /** Where the chart persists the viewer's flat preferences (the sticky symbol and timeframe, the
   *  scale mode, hidden studies, the replay speed). Defaults to an in-memory store that lasts the
   *  page; a host supplies its own to keep them per device or per account. */
  storage?: ChartStorage
  /** The revisioned saved-resource adapter (named charts, layouts, symbol-scoped drawings and
   *  templates) — the seam a host plugs its own backend into. Absent, the widget saves nothing
   *  beyond the page: the drawing layer keeps its documents in memory and `api.saveLoad.save`
   *  rejects. The host-facing surface is `api.saveLoad`. */
  saveLoad?: ChartSaveLoadAdapter
  /** The symbol to open on. */
  symbol?: string
  /** The timeframe token to open on (e.g. '1m', '1h', '1d'). */
  timeframe?: string
  /** Palette overrides. */
  theme?: ChartTheme
  /** The full override tree, partial over the theme-derived defaults — the richer sibling of
   *  `theme` (candle anatomy, the grid, session and countdown switches).
   *  Precedence is TradingView's ladder: runtime `applyOverrides` beats this, this beats `theme`,
   *  `theme` beats the built-ins. A loaded saved chart's appearance snapshot applies as a runtime
   *  layer, so a viewer's saved look beats the host's constructor values. */
  overrides?: PartialOverrides
  /** Indicator instances on the chart. Each pairs a host-supplied definition (manifest + compute)
   *  with instance inputs/overrides; the widget renders them through the same manifest pipeline
   *  richer hosts use — panes, histograms, areas, markers, levels, band fills. */
  indicators?: IndicatorInstance[]
  /** The drawing layer (on by default): tools, selection, per-symbol persistence through the
   *  adapter's drawings family, and a small built-in rail. `false` removes the layer entirely;
   *  `{ rail: false }` keeps the layer but hides the rail for a host that drives
   *  `ChartWidgetApi.drawings` from its own UI. */
  drawings?: false | { rail?: false }
  /** Session bands (on by default): non-regular-hours stretches shade under the candles, driven
   *  by the session model the feed serves via `resolve()`. `false` turns the shading off. */
  sessions?: false
  /** The legend (on by default): the symbol/timeframe header with a market-status dot, plus one
   *  chip per indicator instance (title, latest value, per-chip eye). `false` removes it. */
  legend?: false
  /** The right-click LEVEL menu (reset view, copy price, remove indicators/drawings, and whatever
   *  the chart's extensions contribute). `false` removes it and leaves the browser's own menu
   *  in place. */
  contextMenu?: false
  /** A built-in interface language for the widget chrome and chart date formatting. English when
   *  omitted. `setLocale` switches at runtime. Symbols, prices and anything the datafeed says
   *  are data and pass through untranslated. */
  locale?: ChartLocaleCode
  /** A host-owned localization adapter. When supplied, it replaces `locale` and may use any stable
   *  locale codes and BCP 47 tags. The host owns its dictionaries, loading policy, and fallback. */
  i18n?: ChartI18n
  /** Extensions the chart attaches at mount: host code that draws on the chart, contributes menu
   *  rows and commands, and stores viewer state in the chart's save blob. Each is attached once per
   *  chart — a layout attaches them per pane — and torn down with it, including anything it drew.
   *  The contract they receive is `ChartExtensionContext`: prices, times, bars, feed status,
   *  theme and pane geometry, and nothing about accounts or money. */
  extensions?: readonly ChartExtension[]
  events?: ChartWidgetEvents
}

/** An indicator DEFINITION: the declarative manifest plus a pure compute over the widget's bars.
 *  The 23 built-ins ship in this shape as `BUILT_IN_INDICATORS`, and a host supplies its own in
 *  the same shape; the widget owns the rendering pipeline (panes, histograms, levels, fills) and
 *  treats every definition alike. Compute returns per-plot value channels aligned 1:1 to `bars`,
 *  NaN/null through the warmup (the walker maps those to clean whitespace gaps). No side
 *  effects, no chart access. */
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
