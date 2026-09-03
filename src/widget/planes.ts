// Resolving the four configuration planes: what features are on, what the viewer prefers, and what
// the ports can do. Access is not resolved here because it is not resolvable: its predicates are
// asked live, at the moment a command or a tool is reached for.
//
// Everything in this module is pure over its arguments. Capability derivation in particular reads
// only what it is handed, so the same inputs produce the same answer in a test with no DOM and no
// feed.
import type { ChartDatafeed, DatafeedConfig } from '../datafeed'
import type { ChartSaveLoadAdapter } from '../resources'
import type { SymbolInfo } from '../symbology'
import type { ChartExtension } from '../extension'
import type { Capabilities, FeatureConfig } from './options'

/** Every feature flag, concrete. Curated compare rows ride along because they belong to the compare
 *  feature and would otherwise need a plane of their own. */
export interface ResolvedFeatures {
  drawings: boolean
  drawingsToolbar: boolean
  drawingsFavorites: boolean
  sessions: boolean
  legend: boolean
  contextMenu: boolean
  compare: boolean
  replay: boolean
  topBar: boolean
  bottomBar: boolean
  navigation: boolean
  marketStatus: boolean
  symbolSearch: boolean
  timeframes: boolean
  chartStyles: boolean
  indicators: boolean
  layouts: boolean
  settings: boolean
  fullscreen: boolean
  image: boolean
  toasts: boolean
}

/** Fill the feature plane. Every flag defaults on, the drawing surfaces cannot outlive the layer
 *  they drive, and a top-bar control cannot outlive the bar it sits in. */
export function resolveFeatures(config?: FeatureConfig): ResolvedFeatures {
  const drawings = config?.drawings !== false
  const topBar = config?.topBar !== false
  const on = (flag: boolean | undefined): boolean => flag !== false
  return {
    drawings,
    drawingsToolbar: drawings && config?.drawingsToolbar !== false,
    drawingsFavorites: drawings && config?.drawingsFavorites !== false,
    sessions: on(config?.sessions),
    legend: on(config?.legend),
    contextMenu: on(config?.contextMenu),
    compare: on(config?.compare),
    replay: on(config?.replay),
    topBar,
    bottomBar: on(config?.bottomBar),
    navigation: on(config?.navigation),
    marketStatus: on(config?.legend) && on(config?.marketStatus),
    symbolSearch: topBar && on(config?.symbolSearch),
    timeframes: topBar && on(config?.timeframes),
    chartStyles: topBar && on(config?.chartStyles),
    indicators: on(config?.indicators),
    layouts: topBar && on(config?.layouts),
    settings: topBar && on(config?.settings),
    fullscreen: topBar && on(config?.fullscreen),
    image: topBar && on(config?.image),
    toasts: on(config?.toasts),
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

