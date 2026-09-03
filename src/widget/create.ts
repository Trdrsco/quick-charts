// `createChart(options)`: the one constructor, and the widget it answers with.
//
// A widget is one or many charts under one root. Everything scoped to the widget rather than to a
// chart lives here: the theme controller and the root element it paints, the language, the command
// registry, the capability plane, chart-root fullscreen, client image capture, the save-needed
// debounce, and the layout that arranges the charts. Everything scoped to one chart lives in
// `chart.ts`.
//
// The root element is the widget's own, created inside the host's container. That is what lets the
// package stylesheet be scoped to one attribute: the widget paints its theme onto its own root and
// touches no document-level selector and none of the host's container styling.
import { memoryChartStorage, type ChartStorage } from '../storage'
import { createChartI18n, type ChartI18n } from '../i18n'
import { createThemeController, type ThemeController } from '../theme/controller'
import type { DatafeedConfig } from '../datafeed'
import type { SymbolInfo } from '../symbology'
import { paintThemeRoot } from './theme'
import { createCommandRegistry, type CommandRegistry } from './commands'
import { createEmitter, type WidgetEvents } from './events'
import { createSearchController, memoryRecents, type RecentsPort, type SearchController } from '../search'
import { deriveCapabilities, resolveFeatures } from './planes'
import type { Capabilities, ChartWidgetOptions } from './options'
import { createChartInstance, type ChartHandle, type ChartInstance } from './chart'
import { createLayoutPlane, type LayoutApi } from './layout'
import { createFullscreen, type FullscreenApi } from './fullscreen'
import { createImageApi, type ImageApi, type ImageTile } from './image'
import { registerWidgetCommands } from './widgetCommands'
import { attachShortcuts } from './shortcuts'

/** Every mounted chart gets one id, so an extension attached to two charts of a layout can tell
 *  them apart and key its own per-chart state. Stable for the chart's life, never reused. */
let chartSeq = 0

/** How long a burst of state-dirtying writes is collected before one save-needed lands. Long
 *  enough that a drawing drag emits once rather than per frame. */
const SAVE_NEEDED_MS = 1_000

/** The running widget a host holds. */
export interface ChartWidget {
  /** Resolves once the widget has mounted and its first chart has painted its first data. Resolves
   *  immediately when that has already happened, so a late caller is never left waiting. */
  ready(): Promise<void>
  activeChart(): ChartHandle
  charts(): readonly ChartHandle[]
  chart(id: string): ChartHandle | null
  layout: LayoutApi
  theme: ThemeController
  locale(): string
  setLocale(code: string): Promise<void>
  commands: CommandRegistry
  /** What the ports, the resolved symbol and the browser can do, derived at the moment it is read. */
  capabilities(): Capabilities
  /** A fresh symbol-search controller over the widget's datafeed: its debounce, cache and
   *  cancellation are the chart's, so every picker a host builds behaves the same. Dispose it when
   *  the surface that opened it closes. */
  search(): SearchController
  /** The viewer's recent symbols, as the host stores them. */
  recents: RecentsPort
  image: ImageApi
  fullscreen: FullscreenApi
  on<K extends keyof WidgetEvents>(name: K, callback: WidgetEvents[K]): () => void
  /** Tear down every chart, subscription, timer and DOM resource. Idempotent, and every handle and
   *  subscription is inert afterwards. */
  dispose(): void
}

export function createChart(options: ChartWidgetOptions): ChartWidget {
  let disposed = false
  const events = createEmitter<WidgetEvents>()
  const features = resolveFeatures(options.features)
  const i18n: ChartI18n = options.i18n ?? createChartI18n(options.locale)
  const theme = createThemeController(options.theme)

  // ── Preferences. Every chart key flows through this store, wrapped so each state-dirtying write
  // funnels ONE debounced save-needed: no per-site wiring, and a drag emits once rather than per
  // frame. In a layout the charts share the store last-writer-wins, which is why a layout's real
  // state lives in its serialized blob rather than in these keys.
  const backing: ChartStorage = options.storage ?? memoryChartStorage()
  let saveNeededTimer: ReturnType<typeof setTimeout> | null = null
  const pingSaveNeeded = (): void => {
    if (disposed) return
    if (saveNeededTimer) clearTimeout(saveNeededTimer)
    saveNeededTimer = setTimeout(() => {
      saveNeededTimer = null
      if (!disposed) events.emit('saveNeeded')
    }, SAVE_NEEDED_MS)
  }
  const storage: ChartStorage = {
    get: (key) => backing.get(key),
    set: (key, value) => {
      backing.set(key, value)
      pingSaveNeeded()
    },
    remove: (key) => {
      backing.remove(key)
      pingSaveNeeded()
    },
    keys: () => backing.keys(),
  }

  // ── The root. The widget owns one element inside the host's container and paints its theme onto
  // that element alone, so two widgets in one document can run different modes and the host page
  // keeps its own styling untouched.
  const root = document.createElement('div')
  root.className = 'qc-root'
  const panes = document.createElement('div')
  panes.className = 'qc-panes'
  root.appendChild(panes)
  options.container.appendChild(root)
  paintThemeRoot(root, theme.mode(), theme.get())

  const commandHandle = createCommandRegistry({ access: options.access })
  const commands = commandHandle.registry

  // ── The capability plane. Derived, never configured: the feed's declaration and the active
  // symbol's metadata are recorded as they land, and everything else is read at the moment it is
  // asked for.
  let feedConfig: DatafeedConfig | null = null
  let activeSymbolInfo: SymbolInfo | null = null
  /** Each chart's last resolved symbol, so activating one re-reads ITS facts instead of keeping
   *  whichever chart resolved most recently. */
  const symbolInfoByChart = new Map<string, SymbolInfo | null>()
  const capabilities = (): Capabilities =>
    deriveCapabilities({
      datafeed: options.datafeed,
      config: feedConfig,
      symbol: activeSymbolInfo,
      saveLoad: options.saveLoad ?? null,
      extensions: options.extensions ?? [],
    })

  // ── Readiness. One promise, resolved by the first chart that paints data. A host that asks after
  // that gets a resolved promise rather than one that never settles.
  let readyResolved = false
  let resolveReady: () => void = () => undefined
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve
  })
  const markReady = (): void => {
    if (readyResolved || disposed) return
    readyResolved = true
    resolveReady()
    events.emit('ready')
  }

  // ── Charts. The layout owns placement; the widget owns construction.
  const instances = new Map<string, ChartInstance>()
  const layout = createLayoutPlane({
    container: panes,
    adapter: options.saveLoad ?? null,
    i18n,
    arrangement: options.layout?.arrangement,
    charts: options.layout?.charts,
    sync: options.layout?.sync,
    createChart(element, init) {
      const id = `chart-${++chartSeq}`
      const instance = createChartInstance({
        id,
        container: element,
        datafeed: options.datafeed,
        saveLoad: options.saveLoad ?? null,
        storage,
        i18n,
        theme,
        features,
        compareSymbols: options.features?.compareSymbols ?? [],
        access: options.access,
        appearance: options.appearance,
        indicators: options.indicators ?? [],
        extensions: options.extensions ?? [],
        marks: options.marks !== false,
        commands,
        assets: options.assets,
        preferences: options.preferences ?? {},
        symbol: init?.symbol ?? options.symbol,
        timeframe: init?.timeframe ?? options.timeframe,
        style: options.style,
        onSymbolInfo: (info) => {
          symbolInfoByChart.set(id, info)
          if (layout.activeHandle()?.id === id) activeSymbolInfo = info
        },
        onConfig: (config) => {
          feedConfig = config
        },
        onSaveConflict: (info) => events.emit('saveConflict', info),
        onReady: markReady,
        capabilities,
        // ── W4-B: the drawing toolbar offers sync only in a layout of more than one chart ────
        chartCount: () => layout.handles().length,
        // ── end W4-B ──────────────────────────────────────────────────────────────────────────
      })
      instances.set(id, instance)
      return instance.handle
    },
    destroyChart(handle) {
      instances.get(handle.id)?.dispose()
      instances.delete(handle.id)
    },
    onActive: (handle) => {
      // Capabilities describe the chart a host is POINTED AT, so activating another chart re-reads
      // its symbol rather than leaving the previous one's facts standing.
      activeSymbolInfo = symbolInfoByChart.get(handle.id) ?? null
      events.emit('activeChart', handle)
    },
    onChange: pingSaveNeeded,
  })

  // ── Theme. A change repaints the root's custom properties and every chart's canvas in one pass,
  // and the chart keeps its symbol, timeframe, range, drawings and studies across it.
  const unsubscribeTheme = theme.onChange((resolved, mode) => {
    if (disposed) return
    paintThemeRoot(root, mode, resolved)
    for (const instance of instances.values()) instance.repaintTheme()
    events.emit('theme', resolved, mode)
  })

  // ── Language. The chrome re-labels as the translation lands, and the axis and crosshair
  // formatting follow at once.
  const unsubscribeStrings = i18n.onChange(() => {
    if (disposed) return
    for (const instance of instances.values()) instance.relabel()
    events.emit('locale', i18n.locale())
  })

  // The symbol picker's controller is the chart's: one debounce, one cache, one cancellation rule
  // for every search surface. A host supplies only what it alone knows, which is where the viewer's
  // recent symbols live; without one they last the page.
  const recents: RecentsPort = options.search?.recents ?? memoryRecents()
  /** Every controller handed out, so dispose takes down the debounce timers and in-flight asks a
   *  host's picker would otherwise leave running after the chart is gone. */
  const searchControllers = new Set<SearchController>()
  const search = (): SearchController => {
    const controller = createSearchController(options.datafeed)
    searchControllers.add(controller)
    return controller
  }

  // The keyboard reaches verbs the same way the glass does: a press resolves to a command id and
  // goes through the registry, so `access` and `features` gate it without a second rule.
  const shortcuts = attachShortcuts({ root, commands })

  const fullscreen = createFullscreen(root, options.fullscreen, (active) => events.emit('fullscreen', active))

  const image: ImageApi = createImageApi({
    tiles(): ImageTile[] {
      const rects = layout.rects()
      const out: ImageTile[] = []
      layout.slots().forEach((slot, index) => {
        const canvas = instances.get(slot.handle.id)?.screenshot()
        const rect = rects[index]
        if (!canvas || !rect) return
        out.push({ canvas, rect, symbol: slot.handle.symbol(), timeframe: slot.handle.timeframe() })
      })
      return out
    },
    size: () => ({ width: panes.clientWidth, height: panes.clientHeight }),
    header() {
      const handle = layout.activeHandle()
      const resolved = theme.get()
      return {
        symbol: handle?.symbol() ?? '',
        timeframe: handle?.timeframe() ?? '',
        attribution: options.image?.attribution ?? null,
        background: resolved['canvas.background'],
        ink: resolved['text.onCanvas'],
        inkMuted: resolved['text.muted'],
      }
    },
    options: options.image,
  })

  const widget: ChartWidget = {
    ready: () => readyPromise,
    activeChart() {
      const handle = layout.activeHandle()
      if (!handle) throw new Error('the widget has no charts')
      return handle
    },
    charts: () => layout.handles(),
    chart: (id) => layout.handles().find((h) => h.id === id) ?? null,
    layout: layout.api,
    theme,
    locale: () => i18n.locale(),
    async setLocale(code) {
      if (disposed || code === i18n.locale()) return
      await i18n.setLocale(code)
    },
    commands,
    capabilities,
    search,
    recents,
    image,
    fullscreen: fullscreen.api,
    on: (name, callback) => events.on(name, callback),
    dispose() {
      if (disposed) return
      disposed = true
      events.emit('dispose')
      unregisterCommands()
      unsubscribeTheme()
      unsubscribeStrings()
      if (saveNeededTimer) clearTimeout(saveNeededTimer)
      saveNeededTimer = null
      shortcuts.dispose()
      for (const controller of searchControllers) controller.dispose()
      searchControllers.clear()
      fullscreen.dispose()
      layout.destroy()
      instances.clear()
      commandHandle.dispose()
      events.clear()
      // Leave the host's container exactly as found: the widget's own root goes, and nothing of the
      // host's was ever written to.
      root.remove()
      // A host that never got its first data still gets a settled promise rather than one that
      // hangs for the life of the page.
      resolveReady()
    },
  }

  const unregisterCommands = registerWidgetCommands({ commands, widget, theme, i18n, capabilities })

  return widget
}
