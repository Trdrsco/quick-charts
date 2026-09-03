// The chrome fixtures' stand-in widget: a fake chart handle over an emitter, the REAL command
// registry with the REAL built-in command specs registered against that handle, and a fake widget
// that answers `activeChart`, `layout`, `theme`, `fullscreen`, `image` and `capabilities`. The
// chrome under test therefore routes through the same registry, the same availability reads and
// the same access policy the widget uses; only the renderer is absent, because these fixtures run
// under happy-dom, which has no canvas.
import { vi } from 'vitest'
import { createEmitter, type ChartEvents, type WidgetEvents } from '../../src/widget/events'
import { createCommandRegistry, type CommandRegistry } from '../../src/widget/commands'
import { registerChartCommands } from '../../src/widget/chartCommands'
import { registerWidgetCommands } from '../../src/widget/widgetCommands'
import { resolveFeatures, type ResolvedFeatures } from '../../src/widget/planes'
import { createThemeController } from '../../src/theme/controller'
import { createChartI18n, type ChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { memoryRecents } from '../../src/search'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { DEFAULT_OVERRIDES, type ChartOverrides } from '../../src/overrides'
import type { ChartHandle } from '../../src/widget/chart'
import type { ChartWidget } from '../../src/widget/create'
import type { AccessPolicy, Capabilities, FeatureConfig, IndicatorInstance } from '../../src/widget/options'
import type { ChartStyleId } from '../../src/widget/styles'
import type { ScaleMode } from '../../src/scaleMode'
import type { ActiveSubsession, MarketStatus, SessionModel } from '../../src/sessionModel'
import type { CompareEntry } from '../../src/compare'
import type { ReplaySpeed } from '../../src/replay'
import type { LayoutSyncFlags } from '../../src/widget/layout'
import type { OpenResource } from '../../src/openResource'
import type { FeedBar } from '../../src/datafeed'
import type { ChromeContext } from '../../src/ui/chrome/context'

export interface FakeChartOptions {
  symbol?: string
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
    timeframe: options.timeframe ?? '1m',
    style: options.style ?? ('candles' as ChartStyleId),
    scale: 'normal' as ScaleMode,
    timezone: 'Etc/UTC',
    subsession: 'extended' as ActiveSubsession,
    indicators: [] as IndicatorInstance[],
    hidden: [] as string[],
    compares: [] as CompareEntry[],
    replay: { on: false, playing: false, cursor: 0, total: 0, speed: 10 as ReplaySpeed },
    interval: 'auto',
    appearance: { appearance: { ...DEFAULT_OVERRIDES.appearance } } as ChartOverrides,
    visible: { from: 0, to: 100 },
  }
  const timeClicks = new Set<(time: number) => void>()
  const calls: string[] = []
  const handle: ChartHandle = {
    id: 'chart-1',
    symbol: () => state.symbol,
    setSymbol(next) {
      state.symbol = next
      calls.push(`symbol:${next}`)
      events.emit('symbol', next)
    },
    timeframe: () => state.timeframe,
    setTimeframe(next) {
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
    setVisibleRange(range) {
      state.visible = range
      calls.push(`range:${range.from}-${range.to}`)
    },
    logicalRange: () => ({ from: 0, to: 100 }),
    setLogicalRange: () => undefined,
    scroll: (bars) => calls.push(`scroll:${bars}`),
    zoom: (factor) => calls.push(`zoom:${factor}`),
    reset: () => calls.push('reset'),
    goLive: () => calls.push('goLive'),
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
      start(at) {
        state.replay = { ...state.replay, on: true, cursor: 91, total: 120 }
        calls.push(`replay:start:${at ?? ''}`)
        events.emit('replay', state.replay)
      },
      exit() {
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
      stepForward: () => calls.push('replay:stepForward'),
      stepBack: () => calls.push('replay:stepBack'),
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
      interval: () => state.interval,
      setInterval(token) {
        state.interval = token
        calls.push(`replay:interval:${token}`)
        events.emit('replay', state.replay)
      },
      subIntervals: () => ['1m', '5m', '15m'],
      state: () => state.replay,
    },
    appearance: () => state.appearance,
    applyAppearance(partial) {
      state.appearance = { appearance: { ...state.appearance.appearance, ...(partial.appearance ?? {}) } }
      calls.push(`appearance:${Object.keys(partial.appearance ?? {}).join(',')}`)
    },
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    saveLoad: {} as never,
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
  access?: AccessPolicy
  features?: FeatureConfig
  capabilities?: Partial<Capabilities>
  i18n?: ChartI18n
  storage?: ChartStorage
  layoutSaveLoad?: Partial<ChartWidget['layout']['saveLoad']>
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
  const caps: Capabilities = {
    resolutions: null,
    symbolResolutions: null,
    search: true,
    history: true,
    serverTime: false,
    marks: false,
    timescaleMarks: false,
    dataStatus: 'streaming',
    saveLoad: { charts: false, layouts: true, drawings: false, templates: false },
    imageCopy: true,
    fullscreen: true,
    extensions: [],
    ...options.capabilities,
  }
  let fullscreenActive = false
  let arrangement = 's'
  let sync: LayoutSyncFlags = { symbol: false, interval: false, crosshair: false, time: false, dateRange: false }
  let open: OpenResource | null = null
  const widgetCalls: string[] = []
  const widget: ChartWidget = {
    ready: () => Promise.resolve(),
    activeChart: () => chart.handle,
    charts: () => [chart.handle],
    chart: () => chart.handle,
    layout: {
      arrangement: () => arrangement,
      setArrangement(code) {
        arrangement = code
        widgetCalls.push(`arrangement:${code}`)
      },
      active: () => 0,
      setActive: () => undefined,
      sync: () => sync,
      setSync(partial) {
        sync = { ...sync, ...partial }
        widgetCalls.push(`sync:${JSON.stringify(partial)}`)
      },
      serialize: () => ({ content: '{}' }),
      restore: () => undefined,
      saveLoad: {
        current: () => open,
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
    on: (name, callback) => events.on(name, callback),
    dispose: () => undefined,
  }
  const unregisterChart = registerChartCommands({
    commands,
    handle: chart.handle,
    features,
    capabilities: () => caps,
    t: () => i18n.t,
    earliestBar: () => null,
    frame: (preset) => chart.calls.push(`frame:${preset.key}`),
    zoom: (direction) => chart.calls.push(`zoom:${direction}`),
    scroll: (direction) => chart.calls.push(`scroll:${direction}`),
    level: () => null,
    formatter: () => chart.handle.formatter(),
    drawingVerbs: () => null,
    compareOpen: (mode) => chart.calls.push(`compareOpen:${mode}`),
  })
  const unregisterWidget = registerWidgetCommands({ commands, widget, theme, i18n, capabilities: () => caps })
  const overlays = document.createElement('div')
  document.body.appendChild(overlays)
  const ctx: ChromeContext = { i18n, commands, overlays, widget }
  return {
    widget,
    chart,
    commands,
    i18n,
    features,
    ctx,
    overlays,
    events,
    widgetCalls,
    storage: options.storage ?? memoryChartStorage(),
    dispose() {
      unregisterChart()
      unregisterWidget()
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
