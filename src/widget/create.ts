// `createChart(options)`: the one constructor, and the widget it answers with.
//
// A widget is one or many charts under one root. Everything scoped to the widget rather than to a
// chart lives here: the theme controller and the root element it paints, the language, the command
// registry, the capability plane, chart-root fullscreen, client image capture, the save-needed
// debounce, the layout that arranges the charts, and the default chrome mounted around them (the
// top bar, the bottom bar, the dialogs and the notices), which consumes the widget through its
// public handle. Everything scoped to one chart lives in `chart.ts`.
//
// The root element is the widget's own, created inside the host's container. That is what lets the
// package stylesheet be scoped to one attribute: the widget paints its theme onto its own root and
// touches no document-level selector and none of the host's container styling.
import { memoryChartStorage, type ChartStorage } from '../storage'
import { createChartI18n, readingDirection, type ChartI18n } from '../i18n'
import { createThemeController, type ThemeController } from '../theme/controller'
import type { DatafeedConfig } from '../datafeed'
import type { SymbolInfo } from '../symbology'
import { paintThemeRoot } from './theme'
import { createChartCommandScope, createCommandRegistry, type CommandRegistry } from './commands'
import { createEmitter, type WidgetEvents } from './events'
import { createSearchController, memoryRecents, type RecentsPort, type SearchController } from '../search'
import { deriveCapabilities, resolveFeatures, resolveUi } from './planes'
import { validateAccess } from './access'
import { resolveOfferedStyles } from './styles'
import { resolveOfferedDrawingTools } from './drawingTools'
import { resolveOfferedIndicators } from './offeredIndicators'
import { resolveOfferedRanges } from './offeredRanges'
import { resolveOfferedTimezones } from './offeredTimezones'
import { offeredTimeframe, resolveOfferedTimeframes } from './timeframes'
import { layoutChoices, openingArrangement, resolveOfferedLayouts } from './arrangements'
import type { Capabilities, ChartWidgetOptions } from './options'
import { DRAWING_CONTEXT_VERSION, type DrawingContextKind, type DrawingResourceContext } from '../drawings/document'
import type { ChartDrawingPersistence } from './chart'
import { createChartInstance, type ChartHandle, type ChartInstance } from './chart'
import { createLayoutPlane, type LayoutApi } from './layout'
import { arrangementOf } from '../layoutGrid'
import { createFullscreen, type FullscreenApi } from './fullscreen'
import { createImageApi, type ImageApi, type ImageTile } from './image'
import { registerWidgetCommands } from './widgetCommands'
import { attachShortcuts, tileAtPoint, type ShortcutPoint } from './shortcuts'
import { emptyDoors } from '../ui/chrome/doors'
import { createAutosaveStore } from '../ui/chrome/preferences'
import { mountChrome, type ChromeHandle } from '../ui/chrome/mount'
import type { ToolbarButton, ToolbarButtonOptions } from '../ui/chrome/hostControls'
import type { ChartIconDiagnostic } from '../ui/icons/contract'
import { createIconDiagnostics } from '../ui/icons/draw'
import { createIconResolver } from '../ui/icons/resolver'
import { trackLayoutChanges } from './layoutChanges'
import type { TopBarSlot } from '../ui/chrome/topBar'
import { createIndicatorCatalog } from './indicators'
import { resolveMarkPainters } from '../markPainters'
import { registerLayer } from '../ui/controls/layer'
import { refreshOverlays } from '../ui/controls/overlays'

/** Every mounted chart gets one id, so an extension attached to two charts of a layout can tell
 *  them apart and key its own per-chart state. Stable for the chart's life, never reused. */
let chartSeq = 0

/** How long a burst of state-dirtying writes is collected before one save-needed lands. Long
 *  enough that a drawing drag emits once rather than per frame. */
const SAVE_NEEDED_MS = 1_000

/** The chart's presentation, as a host reaches into it: the places a control of its own may stand,
 *  the control the chart makes for it, and what became of the artwork it supplied.
 *
 *  The chart keeps the bar's composition: which of its own controls are present, what order they
 *  stand in, where the rules fall between them, and the height, spacing and hover every control
 *  keeps. A host chooses only WHAT stands at a named boundary. A control made by `toolbarButton`
 *  reads as a built-in one, which is the intent: a service the chart does not implement should not
 *  have to sit outside the chart to be used.
 *
 *  A slot is live for as long as the widget is. A host appends its own node and takes that node back
 *  out again; the slot itself belongs to the chart and is never removed or replaced. */
export interface ChartChrome {
  /** Transient host activity in this chart's native indicator list. Does not affect chart
   *  content. */
  legendRows(chartId: string, rows: readonly import('./legend').ChartLegendRow[]): void
  /** One named place in the top bar. Null when the top bar is hidden, which is the answer a host
   *  checks before composing a door it would have nowhere to put. */
  topBar(slot: TopBarSlot): HTMLElement | null
  /** A control of the host's own, made as one of the bar's: the host places it in a slot. */
  toolbarButton(options: ToolbarButtonOptions): ToolbarButton
  /** The glyphs a host's factory could not draw, each icon's first failure. */
  iconDiagnostics(): readonly ChartIconDiagnostic[]
}

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
  /** The chrome's host slots. A host that composes its own doors puts them here rather than beside
   *  the chart, so a service the chart does not own still reads as part of the same toolbar. */
  chrome: ChartChrome
  /** Ask the access policy again, now. The chart's own controls read `access` whenever they sync
   *  and whenever a menu opens; call this when the policy's answers changed with nothing on the
   *  chart changing (a viewer's plan changed mid-session). Every control, menu row, drawing toolbar
   *  tool and group, the favorites bar, the glyph picker, the legend's row controls and every menu,
   *  flyout and dialog that is open (the indicator picker among them) read the policy again: shown
   *  or left out under `access.refused`, enabled or disabled. Listeners of `commands.onChange` hear
   *  it too, so a host's own controls can read `commands.available` again. Nothing stored and
   *  nothing on the chart changes. Inert after `dispose`. */
  refreshAccess(): void
  on<K extends keyof WidgetEvents>(name: K, callback: WidgetEvents[K]): () => void
  /** Tear down every chart, subscription, timer and DOM resource. Idempotent, and every handle and
   *  subscription is inert afterwards. */
  dispose(): void
}

export function createChart(options: ChartWidgetOptions): ChartWidget {
  // The host's marks, resolved once for the whole widget: every chart, its legend and every search
  // row paint from this one value, so a market wears the same mark wherever the widget names it.
  const painters = resolveMarkPainters(options)
  let disposed = false
  const events = createEmitter<WidgetEvents>()
  const features = resolveFeatures(options.features)
  // How the controls present a refusal is checked with the rest of the setup: a value the chart
  // does not take is an error, never a chart that quietly draws refusals some other way.
  validateAccess(options.access)
  // The styles every chart of this widget offers, checked before anything mounts: a list or an
  // opening style the host got wrong is a setup error, never a chart quietly on another style.
  const styles = resolveOfferedStyles(options.styles, options.style)
  // The timeframes likewise: a list, a custom switch or an opening timeframe that disagree are a
  // setup error, never a chart quietly on another timeframe.
  const timeframes = resolveOfferedTimeframes(options.timeframes, options.customTimeframes, [
    { name: 'timeframe', token: options.timeframe },
    ...(options.layout?.charts ?? []).map((chart, i) => ({ name: `layout.charts[${i}].timeframe`, token: chart?.timeframe })),
  ])
  // The arrangements and sync switches likewise: a list or an opening arrangement the host got
  // wrong is a setup error, never a layout quietly on another arrangement.
  const layouts = resolveOfferedLayouts(options.layouts, options.layoutSync, options.layout?.arrangement)
  const arrangementCode = openingArrangement(layouts, options.layout?.arrangement)
  // The drawing tools likewise: a list naming no tool, or one twice, is a setup error, never a
  // drawing toolbar quietly short of what the host meant to offer.
  const drawingTools = resolveOfferedDrawingTools(options.drawingTools)
  // The built-in indicators likewise, with the instances the host mounts: a list the host got wrong,
  // or a mount instance outside it, is a setup error, never an indicator quietly dropped.
  const builtInIndicators = resolveOfferedIndicators(options.builtInIndicators, options.indicators)
  // The range presets and the display timezones likewise: a key or a zone the host got wrong, or
  // one named twice, is a setup error, never a bottom bar quietly short of what the host meant.
  const ranges = resolveOfferedRanges(options.ranges)
  const timezones = resolveOfferedTimezones(options.timezones)
  const ui = resolveUi(options.ui, features, {
    styleCount: styles.list.length,
    timeframeCount: timeframes.list?.length,
    layoutChoices: layoutChoices(layouts),
    layoutStore: !!options.saveLoad?.layouts,
  })
  const iconDiagnostics = createIconDiagnostics()
  const i18n: ChartI18n = options.i18n ?? createChartI18n(options.locale)
  // Every glyph the widget draws goes through this one resolver, so a host's drawing for an icon
  // stands wherever the icon does. It refuses a drawing for an icon nothing draws before anything
  // mounts, as the planes refuse a key they do not take.
  const icons = createIconResolver({ icons: options.icons, document: options.container.ownerDocument, direction: () => readingDirection(i18n), diagnostics: iconDiagnostics })
  const theme = createThemeController(options.theme)

  // ── Preferences. Every chart key flows through this store, wrapped so each state-dirtying write
  // funnels ONE debounced save-needed: no per-site wiring, and a drag emits once rather than per
  // frame. In a layout the charts share the store last-writer-wins, which is why a layout's real
  // state lives in its serialized blob rather than in these keys.
  const backing: ChartStorage = options.storage ?? memoryChartStorage()
  let saveNeededTimer: ReturnType<typeof setTimeout> | null = null
  let hydrationDepth = 0
  const beginHydration = (): (() => void) => {
    hydrationDepth++
    // Do not cancel a timer queued before hydration: it belongs to an existing viewer edit.
    return () => {
      hydrationDepth--
    }
  }
  const pingSaveNeeded = (): void => {
    if (disposed || hydrationDepth > 0) return
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
  // The layer: a second painted element on the document body, for the surfaces that stand over
  // the whole page at viewport coordinates. Inside the root every pane is its own stacking
  // context and the host's own chrome may stack above the widget, so a menu raised in a pane
  // could be painted over by the pane beside it or by a dock below; on the body nothing the page
  // stacks reaches it. It is themed exactly as the root is, and goes with it.
  const layer = document.createElement('div')
  layer.className = 'qc-layer'
  document.body.appendChild(layer)
  const unregisterLayer = registerLayer(root, layer)
  paintThemeRoot(root, theme.mode(), theme.get())
  paintThemeRoot(layer, theme.mode(), theme.get())

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

  // ── The chrome's doors. Every chart holds this one object from construction; the chrome fills it
  // in once it is mounted below, after the layout has built the charts it acts on.
  const doors = emptyDoors()
  const indicatorCatalog = createIndicatorCatalog()

  // ── Drawing persistence. The mode is settled ONCE, here, and each chart is handed the result: a
  // document port in separate mode, nothing in combined mode. Both refusals below are construction
  // errors rather than quiet degradations, because each describes a host that asked for separate
  // documents nothing could ever read back.
  const persistence = options.drawingPersistence ?? { mode: 'combined' as const }
  const drawingScope: DrawingContextKind = persistence.scope ?? 'chart-local'
  if (persistence.mode === 'separate') {
    if (!options.saveLoad)
      throw new Error('drawingPersistence.mode "separate" needs ChartWidgetOptions.saveLoad: the adapter\'s drawings family is where separate documents live')
    if (drawingScope !== 'symbol-global' && !persistence.layoutId)
      throw new Error(`drawingPersistence.scope "${drawingScope}" needs drawingPersistence.layoutId: a document keyed by a per-page id can never be read back`)
  }
  const layoutId = persistence.layoutId ?? ''
  /** The context one chart's document is keyed by, for a symbol. */
  const drawingContextFor = (chartKey: string, symbol: string): DrawingResourceContext => {
    if (drawingScope === 'symbol-global') return { version: DRAWING_CONTEXT_VERSION, kind: 'symbol-global', symbol }
    if (drawingScope === 'layout-shared') return { version: DRAWING_CONTEXT_VERSION, kind: 'layout-shared', layoutId, symbol }
    return { version: DRAWING_CONTEXT_VERSION, kind: 'chart-local', layoutId, chartId: chartKey, symbol }
  }
  /** What one chart is handed: its stable place in the layout, and the mode with its port. */
  const drawingPlanFor = (chartKey: string): ChartDrawingPersistence => {
    let current = chartKey
    const identity = { current: () => current, set: (value: string) => { current = value } }
    const adapter = options.saveLoad
    if (persistence.mode !== 'separate' || !adapter) return { identity, mode: 'combined' }
    return {
      identity,
      mode: 'separate',
      documents: { context: (symbol) => drawingContextFor(identity.current(), symbol), store: (context) => adapter.drawings(context) },
    }
  }

  // ── Charts. The layout owns placement; the widget owns construction.
  const instances = new Map<string, ChartInstance>()
  const commandScopes = new Map<string, ReturnType<typeof createChartCommandScope>>()
  /** The active chart as the layout last announced it. Every chart reads its own activity from
   *  here, and an extension attached to it hears the change. */
  let activeChartId: string | null = null
  let activeCommands: ReturnType<typeof createChartCommandScope> | undefined
  const activateCommands = (id: string): void => {
    const next = commandScopes.get(id)
    if (next === activeCommands) return
    activeCommands?.deactivate()
    activeCommands = next
    activeCommands?.activate()
  }
  // The layout builds its first charts synchronously inside its own construction, so a chart
  // mounting then cannot ask the layout how many charts there are: until the layout exists, the
  // count is what the arrangement will build, and after it the layout's own tally.
  let layoutBuilt = false
  const configuredCharts = (): number => arrangementOf(arrangementCode)?.count ?? 1
  // While the layout rebuilds itself for a new arrangement, the chart being built is not in its
  // tally yet, so the arrangement's own count is the floor.
  const chartCount = (): number => (layoutBuilt ? Math.max(layout.handles().length, arrangementOf(layout.api.arrangement())?.count ?? 1) : configuredCharts())
  /** A chart came or went (createChart and destroyChart): every chart's surfaces that read the
   *  layout re-render. A symbol or timeframe change moves nothing they read. */
  const layoutChanged = (): void => {
    for (const instance of instances.values()) instance.layoutChanged()
  }
  /** One external drawing toolbar intent follows the pointer into a pane. The owning layer reports
   * completion back, so one-shot tools clear while Stay and Eraser remain armed. */
  let sharedDrawingIntent: unknown = null
  let sharedDrawingOwner: string | null = null
  const toolOf = (arg: unknown): string | null | undefined =>
    arg === null || typeof arg === 'string'
      ? arg
      : arg && typeof arg === 'object' && typeof (arg as { tool?: unknown }).tool === 'string'
        ? (arg as { tool: string }).tool
        : undefined
  const layout = createLayoutPlane({
    beginHydration,
    container: panes,
    adapter: options.saveLoad ?? null,
    i18n,
    arrangement: arrangementCode,
    charts: options.layout?.charts,
    sync: options.layout?.sync,
    arrangements: layouts.named ? layouts.arrangements : undefined,
    syncOffered: options.layoutSync === undefined ? undefined : layouts.sync,
    identitySeed: persistence.layoutId,
    timeframeOf: (token) => offeredTimeframe(token, timeframes),
    createChart(element, init, _index, chartKey) {
      const id = `chart-${++chartSeq}`
      const scope = createChartCommandScope(commands, { access: options.access })
      commandScopes.set(id, scope)
      // The chart's identity for PERSISTENCE is its PLACE in the layout, not the instance id: the
      // id is minted again on every mount, so a document keyed by one could never be read back.
      // The place is exactly that, a place: re-tiling, or removing a chart from the middle of the
      // layout, renumbers the tiles after it, and a chart-local document follows the tile rather
      // than the chart that used to sit in it. Sharing a document across the layout is what
      // `layout-shared` is for.
      let instance: ChartInstance
      try {
        instance = createChartInstance({
          beginHydration,
          // The same debounced save-needed a preference write pings, for the content changes that
          // write no key: one signal, one definition of dirty.
          contentChanged: pingSaveNeeded,
          id,
          container: element,
          hostContainer: options.container,
          verticalDrag: options.touch?.verticalDrag === true,
          layer,
          datafeed: options.datafeed,
          externalDrawingToolbar: !!options.drawingToolbarContainer,
          saveLoad: options.saveLoad ?? null,
          drawings: drawingPlanFor(chartKey),
          storage,
          i18n,
          theme,
          features,
          ui,
          icons,
          compareSymbols: options.features?.compareSymbols ?? [],
          access: options.access,
          appearance: options.appearance,
          indicators: init?.indicators ?? options.indicators ?? [],
          indicatorCatalog,
          extensions: options.extensions ?? [],
          active: () => (layoutBuilt ? layout.activeHandle()?.id === id : activeChartId === id),
          marks: options.marks !== false,
          commands: scope.registry,
          replayCommands: scope.target,
          assets: options.assets,
          preferences: options.preferences ?? {},
          symbol: init?.symbol ?? options.symbol,
          timeframe: init?.timeframe ?? options.timeframe,
          style: init?.style ?? options.style,
          styles: styles.list,
          drawingTools,
          builtInIndicators,
          ranges,
          timezones,
          timeframes,
          compares: init?.compares,
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
          chartCount,
          layoutMaximized: () => layoutBuilt && layout.maximized(),
          drawingToolIntent: {
            shared: (arg) => {
              const tool = toolOf(arg)
              if (tool === undefined || tool === null) {
                sharedDrawingIntent = null
                sharedDrawingOwner = null
              } else {
                sharedDrawingIntent = arg
                sharedDrawingOwner = id
              }
            },
            state: (tool) => {
              if (sharedDrawingOwner !== id) return
              if (tool === null) {
                sharedDrawingIntent = null
                sharedDrawingOwner = null
              }
            },
          },
          doors,
          painters,
        })
      } catch (error) {
        scope.dispose()
        commandScopes.delete(id)
        symbolInfoByChart.delete(id)
        throw error
      }
      instances.set(id, instance)
      layoutChanged()
      return instance.handle
    },
    rebindChart(handle, entityId) {
      instances.get(handle.id)?.rebindDrawingIdentity(entityId)
    },
    beforePointer(handle) {
      if (sharedDrawingIntent === null || sharedDrawingOwner === handle.id) return
      const prior = sharedDrawingOwner
      sharedDrawingOwner = handle.id
      instances.get(handle.id)?.applyDrawingToolIntent(sharedDrawingIntent)
      if (prior) instances.get(prior)?.applyDrawingToolIntent(null)
    },
    destroyChart(handle) {
      if (sharedDrawingOwner === handle.id) {
        sharedDrawingOwner = null
      }
      instances.get(handle.id)?.dispose()
      commandScopes.get(handle.id)?.dispose()
      commandScopes.delete(handle.id)
      instances.delete(handle.id)
      layoutChanged()
    },
    onActive: (handle) => {
      // Capabilities describe the chart a host is POINTED AT, so activating another chart re-reads
      // its symbol rather than leaving the previous one's facts standing.
      activeSymbolInfo = symbolInfoByChart.get(handle.id) ?? null
      activateCommands(handle.id)
      // The layout announces the active chart on activation and on its symbol changing; only a
      // change of active chart reaches the extensions, the previous chart's first and the new
      // chart's after. The layout's word during its own build is the starting state, not a change.
      if (activeChartId !== handle.id) {
        const prior = activeChartId
        activeChartId = handle.id
        if (layoutBuilt) {
          if (prior !== null) instances.get(prior)?.activeChanged(false)
          instances.get(handle.id)?.activeChanged(true)
        }
      }
      if (sharedDrawingIntent !== null && sharedDrawingOwner === null) {
        sharedDrawingOwner = handle.id
        instances.get(handle.id)?.applyDrawingToolIntent(sharedDrawingIntent)
      }
      events.emit('activeChart', handle)
    },
    onChange: pingSaveNeeded,
    onCommitted: (state) => {
      doors.layoutChanged(state)
      // Filling the layout with one tile is a layout commit each chart's own surfaces read: the
      // on-chart control wears the mark and the name for what the next press would do.
      layoutChanged()
    },
    onResource: (event) => events.emit('layout', event),
    onRefusal: (event) => events.emit('saveConflict', event),
  })
  layoutBuilt = true
  activeChartId = layout.activeHandle()?.id ?? activeChartId
  const initialActive = layout.activeHandle()
  if (initialActive) activateCommands(initialActive.id)

  // ── Theme. A change repaints the root's custom properties and every chart's canvas in one pass,
  // and the chart keeps its symbol, timeframe, range, drawings and indicators across it.
  const unsubscribeTheme = theme.onChange((resolved, mode) => {
    if (disposed) return
    paintThemeRoot(root, mode, resolved)
    paintThemeRoot(layer, mode, resolved)
    for (const instance of instances.values()) instance.repaintTheme()
    events.emit('theme', resolved, mode)
  })

  // ── Language. The chrome re-labels as the translation lands, and the axis and crosshair
  // formatting follow at once.
  const unsubscribeStrings = i18n.onChange(() => {
    if (disposed) return
    for (const instance of instances.values()) instance.relabel()
    // A host's drawing was made for the direction the widget read in when it was drawn; a language
    // that turns the direction around has every one made again for the new one.
    icons.redraw()
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
  //
  // A press no built-in verb claims reaches the rows extensions contribute, at the level under the
  // POINTER and on the tile the pointer is over — the active tile does not decide, because the only
  // level a contributed row can act at is the one the viewer is pointing to. The position is
  // tracked on the root the listener already lives on; outside every tile there is no level and the
  // press is left alone.
  let pointerPoint: ShortcutPoint | null = null
  const onPointerMove = (event: PointerEvent): void => {
    pointerPoint = { clientX: event.clientX, clientY: event.clientY }
  }
  const onPointerLeave = (): void => {
    pointerPoint = null
  }
  root.addEventListener('pointermove', onPointerMove, { passive: true })
  root.addEventListener('pointerleave', onPointerLeave)
  const shortcuts = attachShortcuts({
    root,
    commands,
    contributions(pressed) {
      const point = pointerPoint
      if (!point) return false
      const tiles = layout.slots().flatMap((slot) => {
        if (slot.element.hidden) return []
        const box = slot.element.getBoundingClientRect()
        return [{ id: slot.handle.id, rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom } }]
      })
      const id = tileAtPoint(tiles, point)
      if (id === null) return false
      return instances.get(id)?.runShortcutAt(point.clientX, point.clientY, pressed) === true
    },
  })

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
    // Read on demand, because the chrome mounts below this object: a host asks for the slot when it
    // has a door to put there, which is always after the widget exists.
    chrome: {
      legendRows: (chartId, rows) => { if (!disposed) instances.get(chartId)?.setLegendRows(rows) },
      topBar: (slot) => chrome.topBarSlot(slot),
      toolbarButton: (options) => chrome.toolbarButton(options),
      iconDiagnostics: () => iconDiagnostics.list(),
    },
    on: (name, callback) => events.on(name, callback),
    refreshAccess() {
      if (disposed) return
      // The registry's listeners first: the drawing toolbars, the favorites bars, the selection's
      // bars, the navigation clusters and the host's own controls. Then what no registry change
      // reaches: each chart's legend and context menu, the bars at once, and every overlay open in
      // the widget's root and layer, which re-reads in place or opens again from its control.
      commandHandle.changed()
      for (const instance of instances.values()) instance.refreshAccess()
      chrome.refreshAccess()
      refreshOverlays([root, layer])
    },
    dispose() {
      if (disposed) return
      disposed = true
      events.emit('dispose')
      chrome.dispose()
      unregisterCommands()
      layoutChanges.dispose()
      unsubscribeTheme()
      unsubscribeStrings()
      if (saveNeededTimer) clearTimeout(saveNeededTimer)
      saveNeededTimer = null
      shortcuts.dispose()
      root.removeEventListener('pointermove', onPointerMove)
      root.removeEventListener('pointerleave', onPointerLeave)
      pointerPoint = null
      for (const controller of searchControllers) controller.dispose()
      searchControllers.clear()
      fullscreen.dispose()
      layout.destroy()
      instances.clear()
      commandHandle.dispose()
      events.clear()
      unregisterLayer()
      layer.remove()
      // Leave the host's container exactly as found: the widget's own root goes, and nothing of the
      // host's was ever written to.
      root.remove()
      // A host that never got its first data still gets a settled promise rather than one that
      // hangs for the life of the page.
      resolveReady()
    },
  }

  // The layout autosave switch is a viewer preference the layout commands read and the chrome
  // shows; it lives here so both see one store. Whether to autosave is not part of any layout, so it
  // writes past the save-needed funnel: flipping it neither dirties the layout nor rebuilds an open
  // menu.
  const autosave = createAutosaveStore(backing, options.preferences ?? {})
  // Whether the open layout holds unwritten changes, and the autosave that writes them: the layout's
  // behavior, kept here so it runs whatever controls the chrome draws. It subscribes before the chrome
  // does, so the saved-layouts menu reads an answer that already heard the same event.
  const layoutChanges = trackLayoutChanges({ widget, commands, autosave, events })
  const unregisterCommands = registerWidgetCommands({ commands, widget, theme, i18n, capabilities, canSaveLayout: layout.canSave, toggleMaximize: layout.toggleMaximize, layouts, startLayout: layout.startNew,nameLayout: () => doors.nameLayout(), openLayouts: () => doors.openLayouts(), removeLayout: layout.removeResource, autosave, layoutChanges, events })

  // ── The default chrome: the top bar, the bottom bar, the dialogs and the notices, driven only by
  // the registry, the planes and the event maps. It fills the doors the charts already hold.
  const chrome: ChromeHandle = mountChrome({
    root,
    layer,
    toolbarContainer: options.toolbarContainer,
    drawingToolbarContainer: options.drawingToolbarContainer,
    mountDrawingToolbar: (chart, container) => instances.get(chart.id)?.mountDrawingToolbar(container),
    panes,
    widget,
    i18n,
    features,
    ui,
    // What the chrome keeps is the viewer's own choices about it (favorite and custom timeframes,
    // starred layouts and indicators, how the layouts sort), which change no layout, so it reads and
    // writes the host's store directly rather than through the save-needed funnel.
    storage: backing,
    preferences: options.preferences ?? {},
    saveLoad: options.saveLoad ?? null,
    datafeed: options.datafeed,
    feedConfig: () => feedConfig,
    classNames: options.search?.classNames,
    scope: options.search?.scope,
    searchDisplay: options.search,
    painters,
    indicatorPicker: options.indicatorPicker,
    access: options.access,
    builtInIndicators,
    ranges,
    timezones,
    autosave,
    layoutChanges,
    icons,
    styles,
    timeframes,
    layouts,
    doors,
  })

  return widget
}
