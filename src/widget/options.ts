// What a host configures Quick Charts with, in five separate planes.
//
// The planes are separate because they answer different questions and only two of them are the
// host's to decide freely:
//
//   capabilities  what the ports and the resolved symbol can actually do. Derived, never set.
//   features      which chart behavior exists. Every flag defaults on.
//   ui            which of the chart's own controls render. Every control defaults present.
//   access        which commands, drawing tools and indicators the host permits.
//   preferences   the viewer's own values, persisted through the storage port.
//
// A hidden control is not authorization and not a disabled behavior: hiding a control removes that
// control alone, and the command behind it still runs for whoever else calls it, subject to the
// access policy. A disabled feature is the one that removes behavior. An absent port is not a
// preference: a feed with no search does not become a viewer who dislikes searching. Keeping the
// five apart is what lets the widget answer "can this run" and "is this drawn" without asking
// either question in another plane's vocabulary.
import type { ChartDatafeed } from '../datafeed'
import type { ChartStorage } from '../storage'
import type { ChartSaveLoadAdapter } from '../resources'
import type { DrawingContextKind } from '../drawings/document'
import type { PartialOverrides } from '../overrides'
import type { IndicatorManifest, IndicatorOverrides } from '../indicatorModel'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartLocaleCode } from '../i18n'
import type { ChartExtension } from '../extension'
import type { IndicatorPickerSource } from './indicatorPicker'
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
import type { MarkPainterHooks } from '../markPainters'
import type { ChartIcons } from '../ui/icons/catalog'

/** ── FEATURES ────────────────────────────────────────────────────────────────────────────────
 *  Which chart behavior exists. Every flag defaults on: a host that passes nothing gets the complete
 *  chart. Turning one off removes the behavior: its model is never built, the commands it owns
 *  answer `unavailable` rather than disappearing from the registry, and no control presents it,
 *  whatever `ui` says. */
export interface FeatureConfig {
  /** The drawing layer: tools, selection, editing, and the persistence `drawingPersistence` chose. */
  drawings?: boolean
  /** Comparing other symbols beside the charted one, and the compare dialog that adds them. */
  compare?: boolean
  /** Curated quick-add rows for the compare dialog, above the search results. Absent leaves the
   *  dialog search-only. */
  compareSymbols?: readonly CompareSymbol[]
  /** Bar replay: the replay model and its commands. */
  replay?: boolean
  /** Undo and redo over the chart's content: the history and its two commands. */
  history?: boolean
  /** Session shading under the bars. */
  sessions?: boolean
  /** The crosshair. Off draws none: the chart is read by looking rather than by pointing, which is
   *  what a touch surface does. The crosshair SYNC lane is untouched: a host mirroring a moment
   *  across a layout still gets its events. */
  crosshair?: boolean
}

/** ── UI ──────────────────────────────────────────────────────────────────────────────────────
 *  Which of the chart's own controls render. Every control defaults present: a host that passes
 *  nothing gets the complete default interface. Hiding a control removes that control alone. The
 *  behavior behind it, its commands and the public API stay available, so a control of the host's
 *  own can stand in its place and act through `widget.commands`. A control over a behavior that
 *  `features` turned off is absent whatever this says, and a control inside a hidden surface is
 *  hidden with it: no top bar, no symbol pill.
 *
 *  Presentation is read once, at construction. */
export interface UiConfig {
  /** The top bar. `false` removes the bar and every control in it; an object hides some of them. */
  topBar?: boolean | TopBarUi
  /** The bottom bar: range presets, the clock, the timezone picker and the session view. */
  bottomBar?: boolean
  /** The drawing rail: the tool groups, cursor, measure and zoom, magnet, lock, the eye, sync,
   *  remove and the favorites star. */
  drawingToolbar?: boolean
  /** The floating favorite-tools bar. */
  drawingFavorites?: boolean
  /** The legend over the plot. `false` removes it; an object hides some of its parts. */
  legend?: boolean | LegendUi
  /** The on-chart navigation cluster: zoom, scroll and reset. */
  navigation?: boolean
  /** The chart's own right-click level menu. */
  contextMenu?: boolean
  /** The replay transport row: play, pause, step, speed and exit. */
  replayTransport?: boolean
  /** The chart's own notices: feed states, the image fallback, a refused save. */
  toasts?: boolean
  /** The symbol search dialog, and every door that opens it: the symbol pill, the legend's symbol
   *  and `chart.symbol.search`. Off, the symbol still changes through `chart.symbol.set`. The
   *  compare dialog belongs to `features.compare`. */
  symbolSearch?: boolean
  /** The indicator browser, and its doors: the Indicators button and `chart.indicators.open`. Off,
   *  indicators are still added through `chart.indicators.add`. */
  indicatorPicker?: boolean
  /** The full indicator settings dialog. Off, the legend's gear opens the inputs-only editor, and
   *  `chart.indicators.update` still changes an indicator. */
  indicatorSettings?: boolean
}

/** The top bar's own controls. */
export interface TopBarUi {
  /** The symbol pill. Absent with `symbolSearch` off, since it is the search dialog's door. */
  symbol?: boolean
  /** The compare button. */
  compare?: boolean
  /** The timeframe picker. */
  timeframes?: boolean
  /** The chart-style picker. */
  styles?: boolean
  /** The Indicators button. Absent with `indicatorPicker` off. */
  indicators?: boolean
  /** The Bar replay button. */
  replay?: boolean
  /** Undo and redo. */
  history?: boolean
  /** The layout setup menu and the saved-layouts menu. */
  layouts?: boolean
  /** The chart settings menu. `false` removes it; an object hides part of it. */
  settings?: boolean | SettingsMenuUi
  /** The fullscreen button. */
  fullscreen?: boolean
  /** The image menu. */
  image?: boolean
}

/** The settings menu's own sections. */
export interface SettingsMenuUi {
  /** The Theme section: the light and dark pair at the end of the menu, for a host that offers the
   *  choice in its own settings. The theme API and the theme commands are untouched. */
  theme?: boolean
}

/** The legend's own parts. */
export interface LegendUi {
  /** The values row: the hovered bar's O H L C and its move. The identity row stays. A touch
   *  surface with no pointer to hover with has no bar to read but the last one, and a row of
   *  numbers over the candles buys nothing there. */
  values?: boolean
  /** The market-status control and its popup. The dot itself stays. */
  marketStatus?: boolean
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

/** The set of symbols a search answers from, as the host names it: a portfolio, a broker, a
 *  watchlist or any other scope its datafeed applies. `mark` paints the scope's own mark into the
 *  box the chart owns and returns what takes it down; absent, the scope wears its initial. */
export interface SearchScope {
  readonly label: string
  readonly mark?: (request: { host: HTMLElement; size: number }) => (() => void) | void
}

/** Everything needed to construct a widget. `container` and `datafeed` are the two hard
 *  requirements; every other field has a working default. */
export interface ChartWidgetOptions extends MarkPainterHooks {
  /** The DOM element the widget mounts into. */
  container: HTMLElement
  /** Optional host-owned space for the chart's top toolbar, outside the chart container.
   *  The widget appends its own themed child here and removes only that child at dispose.
   *  Menus and dialogs stay in the chart container. Include both containers in a custom
   *  fullscreen target when the toolbar should remain available in fullscreen. */
  toolbarContainer?: HTMLElement
  /** Optional host-owned space for one drawing toolbar following the active chart.
   *  The widget appends its own themed child and leaves the supplied element untouched.
   *  Flyouts remain inside the active chart; include this space in a custom fullscreen target. */
  drawingToolbarContainer?: HTMLElement
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
  /** Which chart behavior exists. */
  features?: FeatureConfig
  /** Which of the chart's own controls render. */
  ui?: UiConfig
  /** The host's drawings for the chart's own glyphs, by icon id. An icon left out keeps the chart's
   *  own; `CHART_ICON_IDS` lists every one. Read once, at construction. */
  icons?: ChartIcons
  /** What the host permits. */
  access?: AccessPolicy
  /** Initial viewer preferences, for a first-run chart. A stored value wins once there is one. */
  preferences?: Partial<ChartPreferences>
  /** Optional localized content and actions in the chart-owned indicator browser. */
  indicatorPicker?: IndicatorPickerSource
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
    /** What the search is limited to, named at the far edge of the asset-class strip. Read each
     *  time the dialog opens; null names nothing. It only labels the scope: your datafeed's
     *  `searchSymbols` decides what is found. */
    scope?: () => SearchScope | null
  }
  /** Where the image and glyph drawing tools get their artwork, and how a picked file becomes a
   *  usable payload. Emoji artwork is bundled. Absent, the image tool takes no file. */
  assets?: DrawingAssetPort
  /** Neutral bar marks and time-scale marks from the datafeed. On by default; `false` draws none
   *  even from a feed that serves them. */
  marks?: boolean
}
