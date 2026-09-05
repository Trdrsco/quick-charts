// What a host configures Quick Charts with, in four separate planes.
//
// The planes are separate because they answer different questions and only one of them is the
// host's to decide freely:
//
//   capabilities  what the ports and the resolved symbol can actually do. Derived, never set.
//   features      which built-in UI and behavior the host wants visible. Every flag defaults on.
//   access        which commands, drawing tools and indicators the host permits.
//   preferences   the viewer's own values, persisted through the storage port.
//
// A hidden control is not authorization: turning a feature off removes chrome, and the command
// behind it still answers to the access policy. An absent port is not a preference: a feed with no
// search does not become a viewer who dislikes searching. Keeping the four apart is what lets the
// widget answer "can this run" without asking four questions in four different vocabularies.
import type { ChartDatafeed } from '../datafeed'
import type { ChartStorage } from '../storage'
import type { ChartSaveLoadAdapter } from '../resources'
import type { DrawingContextKind } from '../drawings/document'
import type { PartialOverrides } from '../overrides'
import type { IndicatorManifest, IndicatorOverrides } from '../indicatorModel'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartLocaleCode } from '../i18n'
import type { ChartExtension } from '../extension'
import type { CompareSymbol } from '../compare'
import type { ScaleMode } from '../scaleMode'
import type { ReplaySpeed } from '../replay'
import type { DataStatus } from '../symbology'
import type { ActiveSubsession } from '../sessionModel'
import type { DrawingAssetPort, DrawingPreferences } from '../drawings/index'
import type { RecentsPort } from '../search'
import type { CustomThemes, ThemeMode } from '../theme/schema'
import type { ChartStyleId } from './styles'
import type { LayoutSyncFlags } from './layout'

/** ── FEATURES ────────────────────────────────────────────────────────────────────────────────
 *  Which built-in UI and behavior is present. Every flag defaults on: a host that passes nothing
 *  gets the complete chart. Turning one off removes the chrome AND the behavior behind it, and the
 *  commands it owned answer `unavailable` rather than disappearing from the registry. */
export interface FeatureConfig {
  /** The drawing layer: tools, selection, the selected drawing's settings surfaces, and the
   *  persistence `drawingPersistence` chose. */
  drawings?: boolean
  /** The drawing toolbar: the tool groups, cursor, measure and zoom, magnet, lock, the eye, sync,
   *  remove and the favorites star. Absent with `drawings` off. */
  drawingsToolbar?: boolean
  /** The floating favorite-tools bar. Absent with `drawings` off. */
  drawingsFavorites?: boolean
  /** Session shading under the bars. */
  sessions?: boolean
  /** The on-canvas legend. */
  legend?: boolean
  /** The chart's own right-click level menu. */
  contextMenu?: boolean
  /** Comparing other symbols beside the charted one, and the compare dialog. */
  compare?: boolean
  /** Curated quick-add rows for the compare dialog, above the search results. Absent leaves the
   *  dialog search-only. */
  compareSymbols?: readonly CompareSymbol[]
  /** Bar replay and its transport bar. */
  replay?: boolean
  /** The top bar: the symbol pill, the compare door, the timeframe picker, the style picker, the
   *  indicators button, the replay button, the layout menus, the settings menu, fullscreen and the
   *  image menu. Each of those has its own flag below; this one removes the bar itself. */
  topBar?: boolean
  /** The bottom bar: range presets, the clock, the timezone picker and the session view. */
  bottomBar?: boolean
  /** The on-chart navigation cluster: zoom, scroll and reset. */
  navigation?: boolean
  /** The legend's market-status control and its popup. The dot itself stays. */
  marketStatus?: boolean
  /** The symbol pill and the search dialog's search mode. Compare keeps its own dialog mode. */
  symbolSearch?: boolean
  /** The timeframe picker. */
  timeframes?: boolean
  /** The chart-style picker. */
  chartStyles?: boolean
  /** The indicator picker and the indicator settings dialog. The legend's gear opens the
   *  inputs-only editor instead when this is off. */
  indicators?: boolean
  /** The layout setup menu and the saved-layouts menu. */
  layouts?: boolean
  /** The chart settings menu. */
  settings?: boolean
  /** The fullscreen button. */
  fullscreen?: boolean
  /** The image menu. */
  image?: boolean
  /** The chart's own notices: feed states, the image fallback, a refused save. */
  toasts?: boolean
}

/** ── ACCESS ──────────────────────────────────────────────────────────────────────────────────
 *  What the host permits. Each predicate is asked live, so a policy may follow the host's own
 *  session or entitlement state. An omitted predicate permits everything in its class. A policy
 *  that throws refuses: the chart never resolves an error in the host's favor. */
export interface AccessPolicy {
  /** Whether a command id may run. A refused command answers `denied` from every surface. */
  command?(id: string): boolean
  /** Whether a drawing tool id may be armed. */
  drawingTool?(id: string): boolean
  /** Whether an indicator definition may be added, asked by its DEFINITION id (`manifest.id`; a
   *  built-in's is the catalog id the picker lists, such as `sma`), never by an instance id. Every
   *  door asks the same id: the picker row, `indicators.add`, and a restore. A definition that
   *  declares no id is not gated. */
  indicator?(id: string): boolean
}

/** ── PREFERENCES ─────────────────────────────────────────────────────────────────────────────
 *  The viewer's own values: what the storage port persists and restores. A host supplies initial
 *  values for a first-run chart or for a viewer whose preferences it holds itself; the stored
 *  value wins once there is one, because these belong to the viewer rather than the embed. */
export interface ChartPreferences {
  symbol: string
  timeframe: string
  style: ChartStyleId
  scaleMode: ScaleMode
  /** The display timezone: an IANA id from the chart's registry, or `exchange` to follow whatever
   *  venue the symbol resolves to. */
  timezone: string
  /** Which subsession intraday bars are shown for. A symbol with no extended hours has one, so a
   *  stored `extended` on such a symbol falls back rather than filtering to nothing. */
  subsession: ActiveSubsession
  /** Instance ids whose plots the legend's eye has hidden. */
  hiddenIndicators: readonly string[]
  replaySpeed: ReplaySpeed
  /** The replay update grain: `auto` or a finer timeframe token. */
  replayInterval: string
  /** The standing drawing choices: cursor, magnet, stay-in-mode, favorites, per-group rail tools.
   *  The drawing models own what each one means; the chart only persists the record. */
  drawings: DrawingPreferences
  /** The timeframe tokens the top bar shows as quick-select chips. */
  savedTimeframes: readonly string[]
  /** Timeframe tokens the viewer composed beyond the presets. */
  customTimeframes: readonly string[]
  /** Whether the saved-layouts menu saves the open layout on every change. */
  layoutAutosave: boolean
}

/** ── CAPABILITIES ────────────────────────────────────────────────────────────────────────────
 *  What the ports, the resolved symbol and the browser can do. Every field is derived at the
 *  moment it is read; nothing here is configurable, and features and access filter what it allows
 *  rather than widening it. */
export interface Capabilities {
  /** Timeframe tokens the feed declares, or null when it declares none (no restriction). */
  resolutions: readonly string[] | null
  /** The active symbol's own resolutions, or null for no restriction. An empty declared list is
   *  no restriction, which is why it arrives here as null rather than as an empty array. */
  symbolResolutions: readonly string[] | null
  /** The feed answers symbol search. */
  search: boolean
  /** The feed serves history beyond the opening window, so scroll-back can page. */
  history: boolean
  /** The feed reports a server clock. */
  serverTime: boolean
  /** The feed serves neutral bar marks / time-scale marks. */
  marks: boolean
  timescaleMarks: boolean
  /** How live the active symbol's data is; null until it resolves. */
  dataStatus: DataStatus | null
  /** Which saved-resource families the adapter carries. All false without an adapter. */
  saveLoad: { charts: boolean; layouts: boolean; drawings: boolean; templates: boolean }
  /** The browser can put an image on the clipboard. */
  imageCopy: boolean
  /** The Fullscreen API is available on this document. */
  fullscreen: boolean
  /** The ids of the extensions attached to the active chart. */
  extensions: readonly string[]
}

/** The theme plane a host passes: which mode to open in, and any custom palettes. It feeds the
 *  widget's `ThemeController`, which is where a runtime switch happens. */
export interface ThemeOptions {
  mode?: ThemeMode
  custom?: CustomThemes
}

/** Chart-root fullscreen. The default target is the widget's own root, so the chart fills the
 *  screen and the host application's shell is never taken over. */
export interface FullscreenOptions {
  /** The element to make fullscreen instead of the widget root. */
  target?: HTMLElement
}

/** Client image capture. */
export interface ImageOptions {
  /** A line the header carries, e.g. the host's product name. Omitted writes no attribution. */
  attribution?: string
  /** Draw the header strip at all. Default true. */
  header?: boolean
}

/** ── DRAWING PERSISTENCE ─────────────────────────────────────────────────────────────────────
 *  Where the trader's drawings are stored. Two modes, and the host picks one HERE, at construction:
 *
 *    combined  (the default) the drawings ride the chart's own saved content, so saving a chart or
 *              a layout saves the drawings that are on it.
 *    separate  the chart's saved content carries no drawings at all, and the adapter's drawings
 *              family is their only path.
 *
 *  There is no third behavior: no fallback reader, no mirrored write and no runtime switch between
 *  the two. A mode that could change under a running chart would mean two places one drawing might
 *  be, and a save that has to guess which of them is the truth. */
export interface DrawingPersistenceOptions {
  mode: 'combined' | 'separate'
  /** Which context a separate document is keyed by: this chart alone (`chart-local`, the default),
   *  every chart of the layout (`layout-shared`), or every chart on the symbol (`symbol-global`). */
  scope?: DrawingContextKind
  /** The host's own stable identity for this layout. Required by `chart-local` and
   *  `layout-shared`: a document keyed by an id the next page load mints again is a document
   *  nothing can ever read back. */
  layoutId?: string
}

/** The multi-chart arrangement the widget opens with. */
export interface LayoutOptions {
  /** An arrangement code from the catalog (default `s`, one chart). Unknown codes throw. */
  arrangement?: string
  /** Per-chart starting symbol and timeframe, index-aligned to the arrangement's panes. */
  charts?: { symbol?: string; timeframe?: string }[]
  /** Which changes replay across the layout. All off by default. */
  sync?: Partial<LayoutSyncFlags>
}

/** An indicator DEFINITION: the declarative manifest plus a pure compute over the chart's bars.
 *  The 23 built-ins ship in this shape as `BUILT_IN_INDICATORS`, and a host supplies its own in the
 *  same shape; the chart owns the rendering pipeline and treats every definition alike. Compute
 *  returns per-plot value channels aligned 1:1 to `bars`, NaN or null through the warmup. No side
 *  effects, no chart access. */
export interface IndicatorDefinition {
  manifest: IndicatorManifest
  compute(bars: readonly FeedBar[], inputs: Record<string, number>): Readonly<Record<string, readonly (number | null)[]>>
}

/** One configured indicator on the chart: a definition plus this instance's inputs and styling. */
export interface IndicatorInstance {
  /** Stable id, which keys the instance's series across recomputes. */
  id: string
  definition: IndicatorDefinition
  /** Input values over the manifest defaults. */
  inputs?: Record<string, number>
  /** The instance's color; any plot channel without a declared color takes it. */
  color?: string
  /** Display title; defaults to the manifest name, then the catalog name, then the id. */
  title?: string
  overrides?: IndicatorOverrides
}

/** Everything needed to construct a widget. `container` and `datafeed` are the two hard
 *  requirements; every other field has a working default. */
export interface ChartWidgetOptions {
  /** The DOM element the widget mounts into. */
  container: HTMLElement
  /** The market-data backend. Required: this is the seam the whole design turns on. */
  datafeed: ChartDatafeed
  /** The revisioned saved-resource adapter (named charts, layouts, drawing documents and
   *  templates). Absent, the widget saves nothing beyond the page. */
  saveLoad?: ChartSaveLoadAdapter
  /** Where the viewer's flat preferences live. Defaults to an in-memory store that lasts the page. */
  storage?: ChartStorage
  /** The symbol to open on. */
  symbol?: string
  /** The timeframe token to open on. */
  timeframe?: string
  /** The main-series style to open on. */
  style?: ChartStyleId
  /** The multi-chart arrangement. One chart when omitted. */
  layout?: LayoutOptions
  /** Where the drawings are stored: with the chart's own saved content (the default) or in their
   *  own documents through the adapter's drawings family. */
  drawingPersistence?: DrawingPersistenceOptions
  /** The product theme: which built-in mode, and any custom semantic palettes. */
  theme?: ThemeOptions
  /** Chart appearance: the typed override tree over the mode's defaults. This is the other
   *  precedence ladder, and it wins over the palette wherever both could reach the same pixel:
   *  runtime `applyAppearance` beats this, and this beats what the theme resolves to. */
  appearance?: PartialOverrides
  /** Which built-in UI and behavior is present. */
  features?: FeatureConfig
  /** What the host permits. */
  access?: AccessPolicy
  /** Initial viewer preferences, for a first-run chart. A stored value wins once there is one. */
  preferences?: Partial<ChartPreferences>
  /** Indicator instances on the chart at mount. */
  indicators?: IndicatorInstance[]
  /** A built-in interface language for the chart's chrome and its date formatting. */
  locale?: ChartLocaleCode
  /** A host-owned localization adapter. When supplied it replaces `locale`, and the host owns its
   *  dictionaries, loading policy and fallback. */
  i18n?: ChartI18n
  /** Extensions attached to every chart at mount. */
  extensions?: readonly ChartExtension[]
  /** Chart-root fullscreen. */
  fullscreen?: FullscreenOptions
  /** Client image capture. */
  image?: ImageOptions
  /** The symbol picker's host inputs. The chart owns the search controller (its debounce, cache and
   *  cancellation); a host supplies only what it alone knows: where the viewer's recent symbols
   *  live, and what its feed's asset classes are called. Absent, recents last the page and a
   *  class's filter chip wears the class token as written. */
  search?: {
    recents?: RecentsPort
    /** Display names for the asset-class tokens the feed's `config()` declares in `classes`. */
    classNames?: Readonly<Record<string, string>>
  }
  /** Where the image and glyph drawing tools get their artwork, and how a picked file becomes a
   *  usable payload. Absent, those tools draw their glyphs as text and take no file. */
  assets?: DrawingAssetPort
  /** Neutral bar marks and time-scale marks from the datafeed. On by default; `false` draws none
   *  even from a feed that serves them. */
  marks?: boolean
}
