// Resolving the configuration planes: which behavior exists, which of the chart's own controls
// render, what the viewer prefers, and what the ports can do. Access is not resolved here because
// it is not resolvable: its predicates are asked live, at the moment a command or a tool is reached
// for.
//
// Everything in this module is pure over its arguments. Capability derivation in particular reads
// only what it is handed, so the same inputs produce the same answer in a test with no DOM and no
// feed.
import type { ChartDatafeed, DatafeedConfig } from '../datafeed'
import type { ChartSaveLoadAdapter } from '../resources'
import type { SymbolInfo } from '../symbology'
import type { ChartExtension } from '../extension'
import type { Capabilities, FeatureConfig, LegendUi, SettingsMenuUi, TopBarUi, UiConfig } from './options'

/** What one configuration key takes: a flag, a list, or a node that is a flag or an object of its
 *  own keys. */
export type KeyShape = 'flag' | 'list' | { readonly [key: string]: KeyShape }

/** Every key the feature plane takes. Typed against the interface, so a key added there and not
 *  here is a compile error rather than a key the check refuses. */
export const FEATURE_KEYS: { readonly [K in keyof Required<FeatureConfig>]: KeyShape } = {
  drawings: 'flag',
  compare: 'flag',
  compareSymbols: 'list',
  replay: 'flag',
  history: 'flag',
  sessions: 'flag',
  crosshair: 'flag',
  navigation: 'flag',
}

const TOP_BAR_KEYS: { readonly [K in keyof Required<TopBarUi>]: KeyShape } = {
  symbol: 'flag',
  compare: 'flag',
  timeframes: 'flag',
  styles: 'flag',
  indicators: 'flag',
  replay: 'flag',
  history: 'flag',
  layouts: 'flag',
  layoutSetup: 'flag',
  savedLayouts: 'flag',
  settings: { theme: 'flag' } satisfies { readonly [K in keyof Required<SettingsMenuUi>]: KeyShape },
  fullscreen: 'flag',
  image: 'flag',
}

/** Every key the presentation plane takes, by node. */
export const UI_KEYS: { readonly [K in keyof Required<UiConfig>]: KeyShape } = {
  topBar: TOP_BAR_KEYS,
  bottomBar: 'flag',
  drawingToolbar: 'flag',
  drawingFavorites: 'flag',
  legend: { values: 'flag', marketStatus: 'flag' } satisfies { readonly [K in keyof Required<LegendUi>]: KeyShape },
  navigation: 'flag',
  contextMenu: 'flag',
  replayTransport: 'flag',
  toasts: 'flag',
  symbolSearch: 'flag',
  indicatorPicker: 'flag',
  indicatorSettings: 'flag',
}

/** Every flag path of a plane, in declaration order: a node is a flag of its own and then its
 *  children, as `topBar` is, then `topBar.symbol`. Lists are not flags. */
export function flagPaths(keys: { readonly [key: string]: KeyShape }, prefix = ''): string[] {
  return Object.entries(keys).flatMap(([key, shape]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (shape === 'list') return []
    return shape === 'flag' ? [path] : [path, ...flagPaths(shape, path)]
  })
}

/** Refuse a configuration the chart would otherwise read wrongly. A key the plane does not take is
 *  an error rather than something skipped: a skipped key is a control the host believes is hidden
 *  and a viewer still sees, or a behavior the host believes is off and a viewer can still reach.
 *  The message names the key's path and the keys that exist there. */
function checkKeys(path: string, value: unknown, keys: { readonly [key: string]: KeyShape }): void {
  if (value === undefined) return
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${path} must be an object`)
  for (const [key, given] of Object.entries(value)) {
    const shape = keys[key]
    const at = `${path}.${key}`
    if (shape === undefined) throw new TypeError(`${at} is not an option of ${path}; it takes ${Object.keys(keys).join(', ')}`)
    if (given === undefined) continue
    if (shape === 'flag') {
      if (typeof given !== 'boolean') throw new TypeError(`${at} must be true or false`)
    } else if (shape === 'list') {
      if (!Array.isArray(given)) throw new TypeError(`${at} must be a list`)
    } else if (typeof given !== 'boolean') {
      checkKeys(at, given, shape)
    }
  }
}

/** Every behavior flag, concrete. */
export interface ResolvedFeatures {
  drawings: boolean
  compare: boolean
  replay: boolean
  history: boolean
  sessions: boolean
  crosshair: boolean
  navigation: boolean
}

/** Fill the feature plane. Every flag defaults on. A key the plane does not take throws. */
export function resolveFeatures(config?: FeatureConfig): ResolvedFeatures {
  checkKeys('features', config, FEATURE_KEYS)
  const on = (flag: boolean | undefined): boolean => flag !== false
  return {
    drawings: on(config?.drawings),
    compare: on(config?.compare),
    replay: on(config?.replay),
    history: on(config?.history),
    sessions: on(config?.sessions),
    crosshair: on(config?.crosshair),
    navigation: on(config?.navigation),
  }
}

/** Every control the chart renders, concrete: true where the control is drawn. */
export interface ResolvedUi {
  topBar: boolean
  symbolPill: boolean
  compareButton: boolean
  timeframePicker: boolean
  stylePicker: boolean
  indicatorsButton: boolean
  replayButton: boolean
  historyButtons: boolean
  layoutSetup: boolean
  savedLayouts: boolean
  settingsMenu: boolean
  settingsTheme: boolean
  fullscreenButton: boolean
  imageMenu: boolean
  bottomBar: boolean
  drawingToolbar: boolean
  drawingFavorites: boolean
  legend: boolean
  legendValues: boolean
  marketStatus: boolean
  navigation: boolean
  contextMenu: boolean
  replayTransport: boolean
  toasts: boolean
  symbolSearch: boolean
  indicatorPicker: boolean
  indicatorSettings: boolean
}

/** What the widget offers, as far as it decides which controls are drawn. Each is absent where the
 *  widget restricts nothing, which draws the control. */
export interface OfferedControls {
  /** How many chart styles are offered. The style picker needs two or more. */
  styleCount?: number
  /** How many timeframes the host listed. The timeframe picker needs two or more. */
  timeframeCount?: number
  /** Whether the layout setup menu has anything to choose: an arrangement to change to, or a sync
   *  switch over a layout of several charts. */
  layoutChoices?: boolean
  /** Whether the host saves layouts. The saved-layouts menu saves, opens and lists them, so it is
   *  drawn only over a store. */
  layoutStore?: boolean
}

/** A presentation value that is not `false` shows its control: `true`, an object naming some of
 *  its parts, and an omitted key all do. */
const shown = (value: boolean | object | undefined): boolean => value !== false

/** Fill the presentation plane against the behavior plane. Every control defaults present. A
 *  control is drawn only where the surface around it is drawn and the behavior it presents exists,
 *  and a door is drawn only where the dialog it opens is, so every resolved control can do what it
 *  shows. Nothing here changes a behavior: that is `resolveFeatures`, and it is not read back. A key
 *  the plane does not take throws. A picker needs something to choose between, so what the widget
 *  offers can leave one out whatever `ui` says; see {@link OfferedControls}. */
export function resolveUi(config: UiConfig | undefined, features: ResolvedFeatures, offered: OfferedControls = {}): ResolvedUi {
  checkKeys('ui', config, UI_KEYS)
  const bar = config?.topBar
  const topBar = shown(bar)
  const inBar = (key: keyof TopBarUi): boolean => topBar && (typeof bar !== 'object' || shown(bar[key]))
  const settingsMenu = inBar('settings')
  const settings = typeof bar === 'object' ? bar.settings : undefined
  const legendConfig = config?.legend
  const legend = shown(legendConfig)
  const inLegend = (key: keyof LegendUi): boolean => legend && (typeof legendConfig !== 'object' || shown(legendConfig[key]))
  const symbolSearch = shown(config?.symbolSearch)
  const indicatorPicker = shown(config?.indicatorPicker)
  return {
    topBar,
    symbolPill: inBar('symbol') && symbolSearch,
    compareButton: inBar('compare') && features.compare,
    timeframePicker: inBar('timeframes') && (offered.timeframeCount === undefined || offered.timeframeCount > 1),
    stylePicker: inBar('styles') && (offered.styleCount === undefined || offered.styleCount > 1),
    indicatorsButton: inBar('indicators') && indicatorPicker,
    replayButton: inBar('replay') && features.replay,
    historyButtons: inBar('history') && features.history,
    // `layouts` hides both layout menus, and each menu's own flag can hide it alone, never show it
    // where `layouts` hid it.
    layoutSetup: inBar('layouts') && inBar('layoutSetup') && offered.layoutChoices !== false,
    savedLayouts: inBar('layouts') && inBar('savedLayouts') && offered.layoutStore !== false,
    settingsMenu,
    settingsTheme: settingsMenu && (typeof settings !== 'object' || shown(settings.theme)),
    fullscreenButton: inBar('fullscreen'),
    imageMenu: inBar('image'),
    bottomBar: shown(config?.bottomBar),
    drawingToolbar: features.drawings && shown(config?.drawingToolbar),
    drawingFavorites: features.drawings && shown(config?.drawingFavorites),
    legend,
    legendValues: inLegend('values'),
    marketStatus: inLegend('marketStatus'),
    navigation: features.navigation && shown(config?.navigation),
    contextMenu: shown(config?.contextMenu),
    replayTransport: features.replay && shown(config?.replayTransport),
    toasts: shown(config?.toasts),
    symbolSearch,
    indicatorPicker,
    indicatorSettings: shown(config?.indicatorSettings),
  }
}

/** What capability derivation is handed. Each is a getter, so the answer follows the chart rather
 *  than the moment the widget was built. */
export interface CapabilityInputs {
  datafeed: ChartDatafeed
  /** The feed's declaration, or null before it answers (or when it declares nothing). */
  config: DatafeedConfig | null
  /** The active symbol's resolved metadata, or null while it is unresolved. */
  symbol: SymbolInfo | null
  saveLoad: ChartSaveLoadAdapter | null
  extensions: readonly ChartExtension[]
}

/** Whether the browser can put an image on the clipboard. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.clipboard?.write === 'function'
}

/** Whether the Fullscreen API is available on this document. */
export function canFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & { fullscreenEnabled?: boolean }
  return doc.fullscreenEnabled === true || typeof document.documentElement.requestFullscreen === 'function'
}

/** Derive the capability plane. Nothing here is configurable and nothing here is a preference: an
 *  absent port says the port is absent, which is a different fact from a viewer's choice. */
export function deriveCapabilities(inputs: CapabilityInputs): Capabilities {
  const { datafeed, config, symbol, saveLoad } = inputs
  // An EMPTY declared list is no restriction, which is the symbology contract's own rule. It
  // arrives here as null so a consumer cannot read it as "serves nothing".
  const declared = config?.resolutions
  const symbolResolutions = symbol && symbol.supportedResolutions.length > 0 ? symbol.supportedResolutions : null
  const feed = datafeed as ChartDatafeed & {
    marks?: unknown
    timescaleMarks?: unknown
  }
  return {
    resolutions: declared && declared.length > 0 ? declared : null,
    symbolResolutions,
    search: typeof datafeed.search === 'function',
    history: typeof datafeed.history === 'function',
    serverTime: typeof datafeed.serverTime === 'function',
    marks: typeof feed.marks === 'function',
    timescaleMarks: typeof feed.timescaleMarks === 'function',
    dataStatus: symbol?.dataStatus ?? null,
    saveLoad: {
      charts: !!saveLoad?.charts,
      layouts: !!saveLoad?.layouts,
      drawings: typeof saveLoad?.drawings === 'function',
      templates: typeof saveLoad?.templates === 'function',
    },
    imageCopy: canCopyImage(),
    fullscreen: canFullscreen(),
    extensions: inputs.extensions.map((e) => e.id),
  }
}

