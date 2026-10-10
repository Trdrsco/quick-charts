// The chrome fixtures' stand-in widget: a fake chart handle over an emitter, the REAL command
// registry with the REAL built-in command specs registered against that handle, and a fake widget
// that answers `activeChart`, `layout`, `theme`, `fullscreen`, `image` and `capabilities`. The
// chrome under test therefore routes through the same registry, the same availability reads and
// the same access policy the widget uses; only the renderer is absent, because these fixtures run
// under happy-dom, which has no canvas.
import { vi } from 'vitest'
import { EXIT_EVENT_GRACE_MS } from '../../src/ui/chrome/motion'
import { DARK_THEME } from '../../src/theme/palettes'
import { createEmitter, type ChartEvents, type HistoryEventState, type WidgetEvents } from '../../src/widget/events'
import type { HistoryChange } from '../../src/widget/history'
import { createCommandRegistry, type CommandRegistry } from '../../src/widget/commands'
import { registerChartCommands } from '../../src/widget/chartCommands'
import { registerWidgetCommands } from '../../src/widget/widgetCommands'
import { trackLayoutChanges } from '../../src/widget/layoutChanges'
import { resolveFeatures, resolveUi, type ResolvedFeatures, type ResolvedUi } from '../../src/widget/planes'
import { createThemeController } from '../../src/theme/controller'
import { paintThemeRoot } from '../../src/widget/theme'
import { createChartI18n, type ChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { memoryRecents } from '../../src/search'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { createAutosaveStore, createLayoutListStore } from '../../src/ui/chrome/preferences'
import { createLayoutCatalog } from '../../src/ui/chrome/layoutCatalog'
import { mountLayoutDialogs } from '../../src/ui/chrome/layoutDialogs'
import { createToolbarButton } from '../../src/ui/chrome/hostControls'
import { createIconDiagnostics } from '../../src/ui/icons/draw'
import type { LayoutBody, LayoutMeta, ResourceRef, ResourceStore } from '../../src/resources'
import { chartSettingsDefaults, layerChartSettings, mergePartialChartSettings } from '../../src/settings/defaults'
import type { ChartSettings, PartialChartSettings } from '../../src/settings/schema'
import type { ChartHandle } from '../../src/widget/chart'
import type { ChartWidget } from '../../src/widget/create'
import type { AccessPolicy, Capabilities, FeatureConfig, IndicatorInstance, UiConfig } from '../../src/widget/options'
import type { ChartIcons } from '../../src/ui/icons/catalog'
import { createIconResolver } from '../../src/ui/icons/resolver'
import { resolveOfferedStyles, type ChartStyleId } from '../../src/widget/styles'
import { resolveOfferedTimeframes } from '../../src/widget/timeframes'
import { layoutChoices, resolveOfferedLayouts } from '../../src/widget/arrangements'
import type { ScaleMode } from '../../src/scaleMode'
import type { ActiveSubsession, MarketStatus, SessionModel } from '../../src/sessionModel'
import type { CompareEntry } from '../../src/compare'
import type { ReplaySpeed } from '../../src/replay'
import type { LayoutSyncFlags } from '../../src/widget/layout'
import type { OpenResource } from '../../src/openResource'
import type { FeedBar } from '../../src/datafeed'
import type { SymbolInfo } from '../../src/symbology'
import type { ChromeContext } from '../../src/ui/chrome/context'
import { createChartSettingsDialog } from '../../src/ui/settings/dialog'

export interface FakeChartOptions {
  symbol?: string
  symbolInfo?: SymbolInfo | null
  timeframe?: string
  style?: ChartStyleId
  extendedHours?: boolean
  sessionModel?: SessionModel | null
  status?: MarketStatus | null
  bars?: FeedBar[]
}

/** A chart handle whose state is plain fields, each setter reporting through the chart event map
 *  exactly as the real chart does, so the chrome's subscriptions are exercised for real. */
export function fakeChart(options: FakeChartOptions = {}) {
  const events = createEmitter<ChartEvents>()
  const state = {
    symbol: options.symbol ?? 'ES',
    /** What the feed resolved, so a spec can drive how a surface WRITES the symbol. Null is the
     *  honest default: a chart that has not resolved yet knows only its ticker. */
    symbolInfo: options.symbolInfo ?? null,
    timeframe: options.timeframe ?? '1m',
    style: options.style ?? ('candles' as ChartStyleId),
    scale: 'normal' as ScaleMode,
    timezone: 'Etc/UTC',
    subsession: 'extended' as ActiveSubsession,
    indicators: [] as IndicatorInstance[],
    hidden: [] as string[],
    compares: [] as CompareEntry[],
    replay: { on: false, playing: false, cursor: 0, total: 0, speed: 10 as ReplaySpeed },
    /** The picker is live: a click on the plot would name the bar replay starts from. */
    arming: false,
    replayTimeframe: 'auto',
    settings: chartSettingsDefaults(DARK_THEME) as ChartSettings,
    viewer: {} as PartialChartSettings,
    visible: { from: 0, to: 100 },
    rangePreset: null as string | null,
    /** Two depths and the word on top of each: enough for a control to read both states without a
     *  content model behind them. */
    history: { past: 0, future: 0, undoChange: null as HistoryChange | null, redoChange: null as HistoryChange | null },
  }
  const historyState = (): HistoryEventState => ({
    canUndo: state.history.past > 0,
    canRedo: state.history.future > 0,
    undoChange: state.history.undoChange,
    redoChange: state.history.redoChange,
  })
  const timeClicks = new Set<(time: number) => void>()
  const calls: string[] = []
  const setRangePreset = (key: string | null): void => {
    if (state.rangePreset === key) return
    state.rangePreset = key
    events.emit('rangePreset', key)
  }
  const handle: ChartHandle = {
    id: 'chart-1',
    symbol: () => state.symbol,
    symbolInfo: () => state.symbolInfo,
    setSymbol(next) {
      setRangePreset(null)
      state.symbol = next
      calls.push(`symbol:${next}`)
      events.emit('symbol', next)
    },
    timeframe: () => state.timeframe,
    setTimeframe(next) {
      setRangePreset(null)
      state.timeframe = next
      calls.push(`timeframe:${next}`)
      events.emit('timeframe', next)
    },
    style: () => state.style,
    setStyle(next) {
      state.style = next
      calls.push(`style:${next}`)
      events.emit('style', next)
    },
    visibleRange: () => state.visible,
    rangePreset: () => state.rangePreset,
    setVisibleRange(range) {
      setRangePreset(null)
      state.visible = range
      calls.push(`range:${range.from}-${range.to}`)
    },
    logicalRange: () => ({ from: 0, to: 100 }),
    setLogicalRange: () => undefined,
    scroll: (bars) => calls.push(`scroll:${bars}`),
    zoom: (factor) => calls.push(`zoom:${factor}`),
    reset: () => { setRangePreset(null); calls.push('reset') },
    goLive: () => calls.push('goLive'),
    awayFromLiveEdge: () => false,
    plotArea: () => null,
    scaleMode: () => state.scale,
    setScaleMode(mode) {
      state.scale = mode
      calls.push(`scale:${mode}`)
      events.emit('scaleMode', mode)
    },
    timezone: () => state.timezone,
    setTimezone(choice) {
      state.timezone = choice
      calls.push(`timezone:${choice}`)
      events.emit('timezone', choice)
    },
    displayTimezone: () => (state.timezone === 'exchange' ? 'America/New_York' : state.timezone),
    marketStatus: () => options.status ?? null,
    subsession: () => state.subsession,
    setSubsession(next) {
      state.subsession = next
      calls.push(`subsession:${next}`)
      events.emit('subsession', next)
    },
    hasExtendedHours: () => options.extendedHours === true,
    drawingPreferences: () => ({}) as never,
    setDrawingPreferences: () => undefined,
    indicators: {
      get: () => state.indicators,
      set(next) {
        state.indicators = [...next]
        calls.push(`indicators:set:${next.map((i) => i.id).join(',')}`)
        events.emit('indicator', { kind: 'changed', id: '*' })
      },
      add(instance) {
        state.indicators = [...state.indicators, instance]
        calls.push(`indicators:add:${instance.id}`)
        events.emit('indicator', { kind: 'added', id: instance.id })
        return true
      },
      remove(id) {
        state.indicators = state.indicators.filter((i) => i.id !== id)
        calls.push(`indicators:remove:${id}`)
      },
      hide(id) {
        state.hidden = [...new Set([...state.hidden, id])]
        calls.push(`indicators:hide:${id}`)
      },
      show(id) {
        state.hidden = state.hidden.filter((h) => h !== id)
        calls.push(`indicators:show:${id}`)
      },
      hidden: () => state.hidden,
    },
    drawings: null,
    drawingResources: null,
    compare: {
      add(symbol, opts) {
        state.compares = [...state.compares, { symbol, placement: opts.placement, color: 'x', visible: true } as CompareEntry]
        calls.push(`compare:add:${symbol}:${opts.placement}`)
        events.emit('compare', state.compares)
      },
      remove(symbol) {
        state.compares = state.compares.filter((c) => c.symbol !== symbol)
        calls.push(`compare:remove:${symbol}`)
        events.emit('compare', state.compares)
      },
      setVisible: () => undefined,
      list: () => state.compares,
      latest: () => null,
      symbols: () => [{ symbol: 'NQ', title: 'Nasdaq' }],
    },
    replay: {
      // The phase the fake reports, so a spec can drive the armed state the bar and the legend mark
      // both read. An open question outranks a running session, as the real plane's does.
      phase: () => (state.arming ? 'arming' : state.replay.on ? 'on' : 'off'),
      arm() {
        if (state.arming) return
        state.arming = true
        calls.push('replay:arm')
        events.emit('replay', state.replay)
      },
      disarm() {
        if (!state.arming) return
        state.arming = false
        calls.push('replay:disarm')
        events.emit('replay', state.replay)
      },
      start(at) {
        calls.push(`replay:start:${at ?? ''}`)
        // No moment ARMS, as the real plane does: entry asks where to begin and leaves the window
        // whole until it is told.
        if (at === undefined) {
          state.arming = true
          return
        }
        state.arming = false
        state.replay = { ...state.replay, on: true, cursor: 91, total: 120 }
        events.emit('replay', state.replay)
      },
      exit() {
        state.arming = false
        state.replay = { ...state.replay, on: false, playing: false }
        calls.push('replay:exit')
        events.emit('replay', state.replay)
      },
      play() {
        state.replay = { ...state.replay, playing: true }
        calls.push('replay:play')
        events.emit('replay', state.replay)
      },
      pause() {
        state.replay = { ...state.replay, playing: false }
        calls.push('replay:pause')
        events.emit('replay', state.replay)
      },
      // A step MOVES the cursor and reports it, as the real plane's does. A transport row repaints
      // on every one of these, so a spec that never moves the cursor never exercises the repaint.
      stepForward() {
        calls.push('replay:stepForward')
        state.replay = { ...state.replay, cursor: state.replay.cursor + 1 }
        events.emit('replay', state.replay)
      },
      stepBack() {
        calls.push('replay:stepBack')
        state.replay = { ...state.replay, cursor: state.replay.cursor - 1 }
        events.emit('replay', state.replay)
      },
      setSpeed(speed) {
        state.replay = { ...state.replay, speed }
        calls.push(`replay:speed:${speed}`)
        events.emit('replay', state.replay)
      },
      goLive() {
        state.replay = { ...state.replay, cursor: state.replay.total }
        calls.push('replay:goLive')
        events.emit('replay', state.replay)
      },
      timeframe: () => state.replayTimeframe,
      // `auto` resolves to a grain, as the real plane's does: the control draws the token, not the
      // mode, so a spec that only set the mode would never see what it renders.
      resolvedTimeframe: () => (state.replayTimeframe === 'auto' ? '15m' : state.replayTimeframe),
      setTimeframe(token) {
        state.replayTimeframe = token
        calls.push(`replay:timeframe:${token}`)
        events.emit('replay', state.replay)
      },
      // Grains spanning three UNIT groups, as a real hour chart's do, so a spec sees the rules the
      // menu draws between them.
      subTimeframes: () => ['1s', '1m', '5m', '15m', '1h'],
      state: () => state.replay,
    },
    history: {
      canUndo: () => state.history.past > 0,
      canRedo: () => state.history.future > 0,
      undoChange: () => state.history.undoChange,
      redoChange: () => state.history.redoChange,
      undo() {
        if (state.history.past === 0) return
        state.history = { ...state.history, past: state.history.past - 1, future: state.history.future + 1 }
        calls.push('history:undo')
        events.emit('history', historyState())
      },
      redo() {
        if (state.history.future === 0) return
        state.history = { ...state.history, past: state.history.past + 1, future: state.history.future - 1 }
        calls.push('history:redo')
        events.emit('history', historyState())
      },
    },
    settings: () => state.settings,
    applySettings(partial) {
      state.viewer = mergePartialChartSettings(state.viewer, partial)
      state.settings = layerChartSettings(chartSettingsDefaults(DARK_THEME), state.viewer)
      calls.push(`settings:${Object.entries(partial).flatMap(([section, leaves]) => Object.keys(leaves ?? {}).map((leaf) => `${section}.${leaf}`)).join(',')}`)
    },
    resetSettings() {
      state.viewer = {}
      state.settings = chartSettingsDefaults(DARK_THEME)
      handle.setScaleMode('normal')
      calls.push('settings:reset')
    },
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    // The content holds the viewer's settings, as the chart saves them.
    saveLoad: { serialize: () => ({ content: JSON.stringify({ settings: state.viewer }) }) } as never,
    sync: {
      onCrosshair: () => () => undefined,
      setCrosshair: () => undefined,
      onTimeClick(cb) {
        timeClicks.add(cb)
        return () => timeClicks.delete(cb)
      },
      onVisibleRange: () => () => undefined,
    },
    on: (name, callback) => events.on(name, callback),
  }
  return {
    handle,
    state,
    calls,
    events,
    setRangePreset,
    /** A viewer click on the chart at a moment. */
    clickTime: (time: number): void => {
      for (const cb of [...timeClicks]) cb(time)
    },
    bars: options.bars ?? Array.from({ length: 120 }, (_, i) => ({ t: 1_700_000_000 + i * 60, o: 1, h: 2, l: 0.5, c: 1, v: 1 })),
    sessionModel: options.sessionModel ?? null,
  }
}

export interface FakeWidgetOptions {
  chart?: ReturnType<typeof fakeChart>
  chartCount?: number
  access?: AccessPolicy
  features?: FeatureConfig
  ui?: UiConfig
  /** The host's drawings for the chart's icons, as a widget takes them. */
  icons?: ChartIcons
  capabilities?: Partial<Capabilities>
  i18n?: ChartI18n
  storage?: ChartStorage
  layoutSaveLoad?: Partial<ChartWidget['layout']['saveLoad']>
  /** The layouts store the widget commands delete through. */
  layoutStore?: ResourceStore<LayoutMeta, LayoutBody> | null
  /** The styles the widget offers, as `ChartWidgetOptions.styles` takes them. */
  styles?: readonly ChartStyleId[]
  /** The timeframes the widget offers, as `ChartWidgetOptions.timeframes` takes them. */
  timeframes?: readonly string[]
  /** Whether the widget offers custom timeframes, as `ChartWidgetOptions.customTimeframes`. */
  customTimeframes?: boolean
  /** The arrangements the widget offers, as `ChartWidgetOptions.layouts` takes them. */
  layouts?: readonly string[]
  /** The sync switches the widget offers, as `ChartWidgetOptions.layoutSync` takes them. */
  layoutSync?: readonly (keyof LayoutSyncFlags)[]
}

/** The fake widget: the real registry over the fake chart, and enough of the widget surface for
 *  every chrome surface to read. */
export function fakeWidget(options: FakeWidgetOptions = {}) {
  const chart = options.chart ?? fakeChart()
  const i18n = options.i18n ?? createChartI18n()
  const events = createEmitter<WidgetEvents>()
  const theme = createThemeController({ mode: 'dark' })
  const registryHandle = createCommandRegistry({ access: options.access })
  const commands: CommandRegistry = registryHandle.registry
  const features: ResolvedFeatures = resolveFeatures(options.features)
  const iconDiagnostics = createIconDiagnostics()
  const icons = createIconResolver({ icons: options.icons, document, direction: () => 'ltr', diagnostics: iconDiagnostics })
  const styles = resolveOfferedStyles(options.styles, undefined)
  const timeframes = resolveOfferedTimeframes(options.timeframes, options.customTimeframes)
  const layouts = resolveOfferedLayouts(options.layouts, options.layoutSync, undefined)
  const ui: ResolvedUi = resolveUi(options.ui, features, {
    styleCount: styles.list.length,
    timeframeCount: timeframes.list?.length,
    layoutChoices: layoutChoices(layouts),
    layoutStore: options.capabilities?.saveLoad?.layouts ?? true,
  })
  const caps: Capabilities = {
    resolutions: null,
    symbolResolutions: null,
    search: true,
    history: true,
    serverTime: false,
    marks: false,
    timescaleMarks: false,
    prices: false,
    dataStatus: 'streaming',
    saveLoad: { charts: false, layouts: true, drawings: false, templates: false },
    imageCopy: true,
    fullscreen: true,
    extensions: [],
    ...options.capabilities,
  }
  let fullscreenActive = false
  let arrangement = 's'
  let sync: LayoutSyncFlags = { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }
  let open: OpenResource | null = null
  const widgetCalls: string[] = []
  /** The chrome's name-prompt door, filled by a mounted saved-layouts menu exactly as the real
   *  chrome fills it. */
  let nameLayoutDoor: () => boolean = () => false
  /** The chrome's Open-layout door, filled the same way. */
  let openLayoutsDoor: () => boolean = () => false
  let openSettingsDoor: (page?: string) => boolean = () => false
  const widget: ChartWidget = {
    ready: () => Promise.resolve(),
    activeChart: () => chart.handle,
    charts: () => Array.from({ length: options.chartCount ?? 1 }, () => chart.handle),
    chart: () => chart.handle,
    layout: {
      arrangement: () => arrangement,
      setArrangement(code) {
        arrangement = code
        widgetCalls.push(`arrangement:${code}`)
      },
      active: () => 0,
      setActive: () => undefined,
      maximized: () => null,
      setMaximized: () => undefined,
      sync: () => sync,
      setSync(partial) {
        sync = { ...sync, ...partial }
        widgetCalls.push(`sync:${JSON.stringify(partial)}`)
      },
      serialize: () => ({ content: '{}' }),
      restore: () => undefined,
      saveLoad: {
        current: () => open,
        notSaving: () => false,
        save: vi.fn(async (name: string) => {
          open = { ref: { id: 'l-1', revision: '1' }, name }
          widgetCalls.push(`save:${name}`)
          return { kind: 'ok' as const, ref: open.ref }
        }),
        load: vi.fn(async (id: string) => {
          open = { ref: { id, revision: '1' }, name: `layout ${id}` }
          widgetCalls.push(`load:${id}`)
          return { kind: 'ok' as const, ref: open.ref, body: { name: open.name, content: '{}' } }
        }),
        remove: vi.fn(async () => ({ kind: 'ok' as const })),
        detach: () => {
          open = null
          widgetCalls.push('detach')
        },
        ...options.layoutSaveLoad,
      },
    },
    theme,
    locale: () => i18n.locale(),
    setLocale: (code) => i18n.setLocale(code),
    commands,
    capabilities: () => caps,
    search: () => ({}) as never,
    recents: memoryRecents(),
    image: {
      capture: vi.fn(async () => new Blob()),
      download: vi.fn(async () => undefined),
      copy: vi.fn(async () => true),
    },
    fullscreen: {
      enter: async () => {
        fullscreenActive = true
        events.emit('fullscreen', true)
      },
      exit: async () => {
        fullscreenActive = false
        events.emit('fullscreen', false)
      },
      toggle: async () => {
        fullscreenActive = !fullscreenActive
        widgetCalls.push('fullscreen:toggle')
        events.emit('fullscreen', fullscreenActive)
      },
      active: () => fullscreenActive,
    },
    // The fake mounts a top bar of its own, so the slot is read off whatever bar the test raised
    // rather than answered from a stub: a spec that fills the slot fills the real element.
    chrome: {
      legendRows: () => undefined,
      topBar: () => document.querySelector<HTMLElement>('.qc-topbar-host'),
      toolbarButton: (options) => createToolbarButton(options, icons),
      iconDiagnostics: () => iconDiagnostics.list(),
    },
    on: (name, callback) => events.on(name, callback),
    refreshAccess: () => undefined,
    dispose: () => undefined,
  }
  const unregisterChart = registerChartCommands({
    commands,
    handle: chart.handle,
    styles: styles.list,
    timeframes,
    features,
    ui,
    capabilities: () => caps,
    // The fake's Reset defaults: the viewer's layer drops back to the package defaults and the
    // scale returns to normal, which is what the real chart's reset leaves behind.
    resetSettings: () => {
      chart.state.viewer = {}
      chart.state.settings = chartSettingsDefaults(DARK_THEME)
      chart.handle.setScaleMode('normal')
      chart.calls.push('settings:reset')
    },
    t: () => i18n.t,
    bars: () => chart.bars,
    earliestBar: () => null,
    replayFromFirst: async () => {
      chart.calls.push('replay:first')
    },
    frame: (preset) => { chart.setRangePreset(preset.key); chart.calls.push(`frame:${preset.key}`) },
    zoom: (direction) => chart.calls.push(`zoom:${direction}`),
    scroll: (direction) => chart.calls.push(`scroll:${direction}`),
    level: () => null,
    formatter: () => chart.handle.formatter(),
    drawingVerbs: () => null,
    compareOpen: (mode) => chart.calls.push(`compareOpen:${mode}`),
    indicatorsOpen: () => chart.calls.push('indicatorsOpen'),
    symbolSearchOpen: () => chart.calls.push('symbolSearchOpen'),
  })
  const storage = options.storage ?? memoryChartStorage()
  const autosave = createAutosaveStore(storage, {})
  // The widget's own record of unwritten layout changes and its autosave, heard on the real events.
  const layoutChanges = trackLayoutChanges({ widget, commands, autosave, events })
  // The fake layout owns publication, just like the real layout plane. Commands only delegate.
  const resource = { ...widget.layout.saveLoad }
  const report = <T extends { kind: string; message?: string }>(outcome: T): T => {
    if (outcome.message) events.emit('saveConflict', { family: 'layout', current: 'current' in outcome ? outcome.current as ResourceRef : null, message: outcome.message })
    return outcome
  }
  widget.layout.saveLoad.save = vi.fn(async (name, opts) => {
    const outcome = await resource.save(name, opts)
    if (outcome.kind === 'ok') events.emit('layout', { kind: 'saved', id: outcome.ref.id, name })
    return report(outcome)
  })
  widget.layout.saveLoad.load = vi.fn(async (id, signal) => {
    const outcome = await resource.load(id, signal)
    if (outcome.kind === 'ok') events.emit('layout', { kind: 'loaded', id: outcome.ref.id, name: outcome.body.name })
    return report(outcome)
  })
  widget.layout.saveLoad.detach = () => {
    resource.detach()
    events.emit('layout', { kind: 'detached', id: null, name: null })
  }
  const unregisterWidget = registerWidgetCommands({
    commands,
    widget,
    toggleMaximize: () => {},
    layouts,
    startLayout: (content) => {
      widget.layout.setArrangement('s')
      widget.charts()[0]!.saveLoad.restore(content)
    },
    theme,
    i18n,
    capabilities: () => caps,
    canSaveLayout: () => true,
    nameLayout: () => nameLayoutDoor(),
    openLayouts: () => openLayoutsDoor(),
    openSettings: (page) => openSettingsDoor(page),
    layoutChanges,
    removeLayout: async (ref) => {
      const outcome = await options.layoutStore?.remove(ref)
      if (outcome?.kind === 'ok') {
        if (resource.current()?.ref.id === ref.id) resource.detach()
        events.emit('layout', { kind: 'removed', id: ref.id, name: null })
        return { kind: 'ok' }
      }
      const message = i18n.t(outcome?.kind === 'conflict' ? 'host.saveConflict' : 'host.saveNotFound')
      return report(outcome?.kind === 'conflict' ? { kind: 'conflict' as const, current: outcome.current, message } : { kind: 'not-found' as const, message })
    },
    autosave,
    events,
  })
  const overlays = document.createElement('div')
  // The overlay host wears the theme, as a widget root's layer does, so a surface reads its motion
  // roles from it.
  paintThemeRoot(overlays, theme.mode(), theme.get())
  document.body.appendChild(overlays)
  const ctx: ChromeContext = { i18n, commands, overlays, widget, icons, styles, timeframes, layouts }
  // The chrome's saved-layout parts, built as `mountChrome` builds them: what a top bar presents and
  // outlives. A test that mounts a top bar passes them in; one that needs its own store builds its own.
  const layoutListing = createLayoutListStore(storage)
  const layoutCatalog = options.layoutStore ? createLayoutCatalog({ store: options.layoutStore, widget }) : null
  const layoutDialogs = mountLayoutDialogs({ ...ctx, catalog: layoutCatalog, listing: layoutListing, notify: () => undefined })
  // The chrome's chart settings dialog, which the bar's gear and the open command both reach.
  const settingsDialog = createChartSettingsDialog({ ...ctx, templates: null })
  openSettingsDoor = (page) => settingsDialog.open(page)
  const topBarParts = { layoutDialogs, layoutCatalog, layoutListing, layoutChanges, settingsDialog }
  return {
    widget,
    chart,
    commands,
    i18n,
    features,
    ui,
    ctx,
    overlays,
    events,
    widgetCalls,
    layoutChanges,
    topBarParts,
    iconDiagnostics,
    icons,
    /** Fill the name-prompt door, as `mountChrome` does with the chrome's layout dialogs. */
    setNameLayoutDoor(fn: () => boolean) {
      nameLayoutDoor = fn
    },
    /** Fill the Open-layout door, as `mountChrome` does with the chrome's layout dialogs. */
    setOpenLayoutsDoor(fn: () => boolean) {
      openLayoutsDoor = fn
    },
    resource,
    storage,
    autosave,
    dispose() {
      unregisterChart()
      unregisterWidget()
      layoutDialogs.destroy()
      layoutChanges.dispose()
      registryHandle.dispose()
      overlays.remove()
    },
  }
}

/** Fire a keyboard event at an element with the key and modifiers of a real press. */
export function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

/** Every button under a root with its accessible name, for a census a spec can read. */
export function buttonNames(root: ParentNode): string[] {
  return [...root.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
}

/** Let queued microtasks and a macrotask run, so debounced syncs and promised outcomes land. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** How long a closing modal dialog keeps its pixels under the built-in palettes: the base motion
 *  duration, and the grace the chrome waits for the box's own transition end. */
export const DIALOG_EXIT_MS = Number.parseFloat(DARK_THEME['motion.durationBase']) + EXIT_EVENT_GRACE_MS

/** Run a faked clock past a modal dialog's exit, so a dialog that was closed has left the page. */
export const pastDialogExit = (): Promise<unknown> => vi.advanceTimersByTimeAsync(DIALOG_EXIT_MS)
