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
// Hiding a control removes that control alone: the command behind it still runs for whoever else
// calls it, subject to the access policy, which is the plane that authorizes. A disabled feature
// is the one that removes behavior. An absent port is a capability the chart lacks, kept apart from
// the viewer's preferences, which hold only what the viewer chose. Keeping the
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
import type { RecentsPort, SpreadOperatorId } from '../search'
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
  /** The drawing toolbar: the tool groups, cursor, measure and zoom, magnet, lock, the eye, sync,
   *  remove and the favorites star. */
  drawingToolbar?: boolean
  /** The floating favorite-tools bar. */
  drawingFavorites?: boolean
  /** The legend over the plot. `false` removes it; an object hides some of its parts. */
  legend?: boolean | LegendUi
  /** The on-chart navigation cluster: zoom, scroll and reset. */
  navigation?: boolean
  /** The chart's own right-click context menu. */
  contextMenu?: boolean
  /** The replay transport row: play, pause, step, speed and exit. */
  replayTransport?: boolean
  /** The chart's own notices: feed states, the image fallback, a refused save. */
  toasts?: boolean
  /** The symbol search dialog, and every door that opens it: the symbol pill, the legend's symbol
   *  and `chart.symbol.search`. Off, the symbol still changes through `chart.symbol.set`. The
   *  compare dialog belongs to `features.compare`. */
  symbolSearch?: boolean
  /** The indicator picker, and its doors: the Indicators button and `chart.indicators.open`. Off,
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
  /** The layout setup menu and the saved-layouts menu. `false` hides both, whatever `layoutSetup`
   *  and `savedLayouts` say. */
  layouts?: boolean
  /** The layout setup menu: the arrangement grid and the sync switches. Not shown when the widget
   *  offers nothing to choose there (see `ChartWidgetOptions.layouts`). */
  layoutSetup?: boolean
  /** The saved-layouts menu: the layout's name with Save, and the menu that saves, copies, renames,
   *  creates and opens layouts. Not shown without a layouts store (`saveLoad.layouts`), since every
   *  row saves or reads one; Download chart data then sits in the image menu. */
  savedLayouts?: boolean
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
  /** Whether a drawing tool id may be armed. Placing an image (`placeImage`, the picker, a paste)
   *  asks it for `image`. A copy is a new drawing, so a drawing of a refused tool is not cloned,
   *  pasted or duplicated by a modifier-drag. A restore (a saved chart, a layout load, an undo, a
   *  drawings document) puts drawings of a refused tool back like any other, and on the chart they
   *  stay whole: they select, restyle, lock, hide and delete as any drawing does. */
  drawingTool?(id: string): boolean
  /** Whether an indicator definition may be added, asked by its DEFINITION id (`manifest.id`; a
   *  built-in's is the catalog id the picker lists, such as `sma`), never by an instance id. Every
   *  door that adds asks the same id: the picker row, `indicators.add`, and `indicators.set` for an
   *  instance the chart does not hold. The policy refuses adding, never restoring: a saved chart, a
   *  layout load, an undo or a redo puts an instance of a refused definition back like any other.
   *  An instance of a refused definition the chart holds stays whole: `indicators.set` and
   *  `chart.indicators.update` edit it, an edit that would move it onto a refused definition leaves
   *  it as it stands, and every remove door removes it. A definition that declares no id is not
   *  gated. */
  indicator?(id: string): boolean
  /** How the chart's own controls present what the predicates refuse. `'disable'` (the default)
   *  draws a refused control disabled, which suits an offer the viewer can unlock. `'hide'` leaves
   *  it out: a refused drawing tool is not in the drawing toolbar's flyouts, on the favorites bar
   *  or in the glyph picker, and a section or group it empties goes with it; a refused indicator is
   *  not in the indicator picker; and a control or menu row whose command is refused is not drawn.
   *
   *  Only a refusal hides. A permitted command that cannot run now (nothing to undo, no bars
   *  loaded, nothing selected) is still drawn disabled. Like the predicates it is read whenever a
   *  control is drawn or synced, and again on `widget.refreshAccess()`, so the controls follow a
   *  policy that changes. Nothing stored is
   *  rewritten: a viewer's favorite keeps its star and returns when the policy permits it again,
   *  and drawings and indicators already on the chart render as they do under either value. Every
   *  other door (the keyboard, `widget.commands`, the chart handles) refuses exactly as it does
   *  under `'disable'`. Any other value is a setup error thrown from `createChart`. */
  refused?: 'disable' | 'hide'
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
   *  venue the symbol resolves to. One that `timezones` leaves out opens on the first listed. */
  timezone: string
  /** Which subsession intraday bars are shown for. A symbol with no extended hours has one, so a
   *  stored `extended` on such a symbol falls back rather than filtering to nothing. */
  subsession: ActiveSubsession
  /** Instance ids whose plots the legend's eye has hidden. */
  hiddenIndicators: readonly string[]
  replaySpeed: ReplaySpeed
  /** The replay update grain: `auto` or a finer timeframe token. */
  replayTimeframe: string
  /** The standing drawing choices: cursor, magnet, stay-in-mode, favorites, per-group toolbar
   *  tools. The drawing models own what each one means; the chart only persists the record. */
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
 *  Where the viewer's drawings are stored. Two modes, and the host picks one HERE, at construction:
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
  /** An arrangement code from the catalog (default `s`, one chart, or the first of
   *  `ChartWidgetOptions.layouts` when the host lists them). Unknown codes throw, and with `layouts`
   *  the code must be one of them. */
  arrangement?: string
  /** Per-chart starting symbol and timeframe, index-aligned to the arrangement's panes. A timeframe
   *  must be one the widget offers. */
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

/** The set of symbols a search answers from, as the host names it: a portfolio, a watchlist or
 *  any other scope its datafeed applies. `mark` paints the scope's own mark into the
 *  box the chart owns and returns what takes it down; absent, the scope wears its initial. */
export interface SearchScope {
  readonly label: string
  readonly mark?: (request: { host: HTMLElement; size: number }) => (() => void) | void
}

/** How the symbol search offers its class filter and its spread operators. Every field is optional,
 *  and a host that sets none gets the default search: all six operators, an All chip, and one class
 *  selected at a time. */
export interface SearchDisplayOptions {
  /** The spread operators and the expression rows. `true` (the default) offers every operator.
   *  `false` offers no operator toggle, no operator and no expression row, and searches your feed
   *  with the query exactly as typed. `{ operators }` keeps spreads on and offers only the listed
   *  operators, in the listed order; an empty list offers no operator toggle while a typed
   *  expression still reads as one. The compare dialog offers no operator buttons either way. */
  spreads?: boolean | { readonly operators: readonly SpreadOperatorId[] }
  /** The class strip's All chip. `false` offers none: with one class selected at a time the first
   *  declared class starts selected, and with several, no selection means every class. `{ label }`
   *  writes the chip with your label. Absent, the chip wears the catalog's own label. A class's own
   *  row of narrower classes always opens with its all chip, written the same way. */
  allClasses?: false | { readonly label: string }
  /** How many classes the viewer selects at once. `single` (the default) makes the chips a choice
   *  of one, and your feed hears it as `cls`. `multiple` makes each chip a toggle, the All chip
   *  clears the selection, and your feed hears `classes` with every selected class, and `cls` too
   *  while exactly one is selected. */
  classSelection?: 'single' | 'multiple'
}

/** How the chart answers a finger, beyond what every chart does. */
export interface TouchOptions {
  /** A one-finger drag on the main pane that sets off mostly vertically releases the price scale's
   *  framing, as a drag on the price scale does, and the price follows the finger as the time does.
   *  A drag that sets off sideways keeps the bars framed. A double-tap on the price scale frames
   *  them again. Off by default: a drag moves the time alone while the price scale frames itself. */
  verticalDrag?: boolean
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
  /** The timeframe token to open on. With `timeframes` or `customTimeframes: false` it must be one
   *  the chart offers. */
  timeframe?: string
  /** The main-series style to open on. It must be one of `styles`. */
  style?: ChartStyleId
  /** The main-series styles the chart offers, in this order. Absent, every style in `CHART_STYLES`
   *  is offered and the picker groups them by family.
   *
   *  A style left out stays off this chart: it has no `chart.style.<id>` command, so no
   *  menu, shortcut or host control reaches it, and `setStyle` ignores it. The picker lists the
   *  offered styles in the order given, and is not shown when one style is offered, since there is
   *  nothing to choose. `ui.topBar.styles: false` hides the picker on its own terms.
   *
   *  A saved layout, saved chart or stored preference that names a style outside the list opens on
   *  the FIRST offered style, and the rest of it restores. An empty list, an id outside
   *  `CHART_STYLES`, a repeated id, and a `style` outside the list are setup errors thrown from
   *  `createChart`. */
  styles?: readonly ChartStyleId[]
  /** The timeframe tokens the chart offers. Absent, every preset in `TIMEFRAME_PRESETS` is offered
   *  and the viewer may compose custom timeframes. Any token the grammar reads may be listed,
   *  preset or not (`2m`). The order given does not matter: the picker lists each unit's group
   *  smallest first.
   *
   *  A token left out stays off this chart. A preset left out has no
   *  `chart.timeframe.<token>` command, `chart.timeframe.set` and `setTimeframe` ignore a token
   *  left out, and the picker shows no chip and no row for it. A group with no listed token is not
   *  shown, a listed token beyond the presets sits in its unit's group, and there is no
   *  custom-timeframe composer. The viewer's saved chips show where they are listed. When the list
   *  leaves none of them, the chips are the first five listed tokens, and the viewer's stored chips
   *  are kept unchanged for a chart that offers them. The picker is not shown when one timeframe is
   *  offered, since there is nothing to choose. `ui.topBar.timeframes: false` hides the picker on
   *  its own terms. A range preset whose timeframe is left out reads its span at the smallest
   *  listed timeframe at or above that timeframe, else at the largest listed.
   *
   *  A saved layout, saved chart or stored preference that names a token outside the list opens on
   *  the SMALLEST listed timeframe, and the rest of it restores. An empty list, a token the grammar
   *  cannot read, a repeated token, a `timeframe` or `layout.charts[].timeframe` outside the list,
   *  and `customTimeframes: true` beside a list are setup errors thrown from `createChart`. */
  timeframes?: readonly string[]
  /** Whether the viewer may compose custom timeframes beyond the presets (default true). `false`
   *  offers the 26 presets alone: the picker has no composer and lists none of the viewer's custom
   *  timeframes, and `chart.timeframe.set` and `setTimeframe` ignore a token that is not a preset.
   *  A stored token beyond the presets opens on `1m`, and a `timeframe` beyond them is a setup
   *  error. A `timeframes` list offers nothing beyond itself, so `false` beside one changes nothing
   *  and `true` beside one is a setup error.
   *
   *  This switch is not `preferences.customTimeframes`, which is the list of custom tokens a
   *  first-run viewer starts with. */
  customTimeframes?: boolean
  /** The range presets the chart's bottom bar offers, by the key `RANGE_PRESETS` gives each
   *  (`1D`, `5D`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `5Y`, `All`), in this order. Absent, all nine
   *  are offered in their own order.
   *
   *  A preset left out stays off this chart: it has no `chart.range.<key>` command, so no
   *  menu, shortcut or host control reaches it, `chart.range.set` ignores its key, and the bottom
   *  bar draws no button for it. An empty list offers no preset: the bottom bar keeps its clock,
   *  timezone picker and session view, and `chart.range.set` still takes an explicit window.
   *  `ui.bottomBar: false` removes the whole bar. A preset whose timeframe `timeframes` leaves out
   *  reads its span at the nearest coarser timeframe the chart offers. A non-list, a key that names
   *  no preset and a repeated key are setup errors thrown from `createChart`. */
  ranges?: readonly string[]
  /** The display timezones the chart offers: zone ids `TIMEZONES` lists, and `exchange` for the
   *  charted symbol's own zone. Absent, every zone and the exchange choice are offered. The
   *  timezone picker keeps its own order (UTC, the exchange choice, then every zone by its current
   *  offset); the order given decides only which choice is first.
   *
   *  A choice left out stays off this chart: it has no `chart.timezone.<id>` command (or
   *  `chart.timezone.exchange`), `chart.timezone.set` and `setTimezone` ignore it, and the picker
   *  lists no row for it. With one choice offered the picker is not shown, since there is nothing to
   *  choose, and the bottom bar's clock still reads the time in that zone.
   *
   *  A chart opens on the viewer's stored choice, else `preferences.timezone`, when the list offers
   *  it, and otherwise on the FIRST choice listed. A stored choice outside the list is not
   *  rewritten until the viewer chooses, so a chart that offers it again opens on it. The exported
   *  registry (`TIMEZONES`, `isTimezoneChoice`, `timezoneListing`) is never filtered. A non-list,
   *  an empty list, an id that names no zone and a repeated id are setup errors thrown from
   *  `createChart`. */
  timezones?: readonly string[]
  /** The multi-chart arrangement. One chart when omitted. */
  layout?: LayoutOptions
  /** The arrangement codes the chart offers (`ARRANGEMENTS`). Absent, all 55 are offered. The
   *  layout opens on `layout.arrangement`, else on the first code listed. The layout setup menu
   *  keeps its own rows by chart count and shows only the listed arrangements, and the order given
   *  breaks ties when a saved layout falls back (below).
   *
   *  An arrangement left out stays off this chart: no tile shows it, and
   *  `widget.layout.setArrangement` and the `widget.layout.setArrangement` command ignore it. With
   *  one arrangement offered the layout setup menu is not shown, since there is nothing to choose,
   *  unless that arrangement holds several charts and a sync switch is offered (`layoutSync`): the
   *  menu then holds the switches alone. `['s']` is a single chart with no layout setup menu.
   *  `ui.topBar.layoutSetup: false` hides the menu on its own terms.
   *
   *  A saved layout whose arrangement is left out opens on the offered arrangement with the most
   *  charts not above the saved layout's count, the first listed winning a tie. When every offered
   *  arrangement holds more charts, it opens on the one with the fewest, and the panes past the
   *  saved charts are filled as a re-tile fills new panes, from the first chart. Saved charts past
   *  the ones shown are not dropped: the layout carries them, with the saved arrangement and its
   *  divider positions, and a save of it writes them back unchanged beside the shown charts as they
   *  are now, so a chart that offers the saved arrangement again opens all of them. A re-tile the
   *  viewer or the host makes is a new arrangement, and what was carried goes with the charts it
   *  tears down. A saved active chart among the hidden ones leaves the first chart active. Sync
   *  switches restore as saved, apart from those `layoutSync` leaves out.
   *
   *  An empty list, an unknown code, a repeated code and a `layout.arrangement` outside the list
   *  are setup errors thrown from `createChart`. */
  layouts?: readonly string[]
  /** The sync switches the viewer may change (`symbol`, `timeframe`, `crosshair`, `time`,
   *  `dateRange`). Absent, every one. A switch left out holds the value `layout.sync` gives it, or
   *  off: the layout setup menu does not show it, `widget.layout.setSync` and its command leave it
   *  as it is, and a saved layout cannot change it. An empty list fixes every switch and leaves the
   *  layout setup menu the arrangements alone. An unknown or repeated switch is a setup error thrown
   *  from `createChart`. */
  layoutSync?: readonly (keyof LayoutSyncFlags)[]
  /** The drawing tools the chart offers, by the type `access.drawingTool` and the `tool.<type>`
   *  icon ids use: any type `drawingTools.all()` lists, `zoom` or `eraser`. Absent, every tool is
   *  offered. The order given does not matter: the drawing toolbar keeps its own groups and
   *  sections.
   *
   *  A tool left out stays off this chart for creating drawings, and every place a tool is chosen
   *  leaves it out: its group's flyout, a group's face (which wears the first tool the group
   *  offers), the favorites bar and the drawing toolbar (`measure`, `zoom`). A section
   *  or group it empties goes with it. The glyph picker's kinds are the `emoji`, `sticker` and
   *  `icon` tools, and a kind left out has no tab. `chart.drawings.arm`, `armTool`, `placeImage` and
   *  an image pasted over the chart refuse it. A copy of a drawing of it is refused too, since a
   *  copy is a new drawing: `chart.drawings.clone` and `chart.drawings.paste` are unavailable for
   *  one, `clone` and `paste` make nothing, and a modifier-drag moves the drawing instead of
   *  duplicating it. Copying one to the clipboard, to paste on a chart that offers it, is not
   *  refused.
   *
   *  Drawings of a tool left out that are already on the chart (from a saved chart or layout, a
   *  drawings document or another host) render and stay fully editable: they select, restyle
   *  through the selection's bar and the settings dialog, lock, hide and delete as any drawing
   *  does. The eraser is always offered, listed or not, because it removes rather than creates, so
   *  `['eraser']` is a chart whose viewers keep and remove what is on it and make nothing new.
   *
   *  It composes with `access`: a tool is offered when it is listed AND the policy permits it, and a
   *  listed tool the policy refuses is drawn as `access.refused` says. Nothing stored is rewritten:
   *  a starred tool left out keeps its star, and a group's remembered face is kept, for a chart that
   *  offers them. `features.drawings: false` removes drawing altogether whatever the list says. An
   *  empty list, a type that names no tool and a repeated type are setup errors thrown from
   *  `createChart`. */
  drawingTools?: readonly string[]
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
  /** Optional localized content and actions in the chart-owned indicator picker. */
  indicatorPicker?: IndicatorPickerSource
  /** Indicator instances on the chart at mount. */
  indicators?: IndicatorInstance[]
  /** The built-in indicators the chart offers, by the definition id `access.indicator` receives:
   *  any id `BUILT_IN_INDICATORS` lists, such as `sma`. Absent, every built-in is offered. The order
   *  given does not matter: the indicator picker keeps its own.
   *
   *  A built-in left out stays off this chart. The indicator picker leaves it out of the built-ins,
   *  the favorites (a starred one keeps its star in storage) and the search results, and the host's
   *  `indicatorPicker` listing is handed only the offered ids. Every
   *  door that would add one refuses: `chart.indicators.add` answers `denied`, `indicators.add`
   *  adds nothing, `indicators.set` leaves out an instance of it the chart does not already hold,
   *  and a new pane a re-tile adds copies the first chart's indicators without it. There is no
   *  duplicate verb for an indicator; adding a second instance is adding.
   *
   *  Instances of a built-in left out that are already on the chart (from a saved chart or layout,
   *  an undo step or another host sharing the store) render and stay fully editable and removable:
   *  the settings dialog, `chart.indicators.update`, the legend's eye and remove, remove all and
   *  `indicators.remove` all work on them, and an edit that would move one onto another left-out
   *  built-in keeps it as it stands. Nothing saved is rewritten because of the list.
   *
   *  A definition whose `manifest.id` names no built-in is the host's own and is never filtered, nor
   *  is what an `indicatorPicker` source lists. It composes with `access`: a built-in is offered
   *  when it is listed AND the policy permits it, and a listed one the policy refuses is drawn as
   *  `access.refused` says. A non-list, an empty list, an id that names no built-in, a repeated id
   *  and an `indicators` instance whose built-in is not listed are setup errors thrown from
   *  `createChart`. */
  builtInIndicators?: readonly string[]
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
   *  live, what its feed's asset classes are called, and how the classes and the spread operators
   *  are offered. Absent, recents last the page, a class's filter chip wears the class token as
   *  written, and the search offers its default class strip and operators. */
  search?: SearchDisplayOptions & {
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
  /** How the chart answers a finger, beyond what every chart does. */
  touch?: TouchOptions
}
