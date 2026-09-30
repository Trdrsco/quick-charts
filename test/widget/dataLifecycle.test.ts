// @vitest-environment happy-dom
// One chart's data lifecycle, driven end to end over a scripted datafeed with the renderer
// replaced by a fake: what a load fetches, when the live subscription opens, and which asks never
// happen. The code under test is the real chart instance and its planes; only `createChart` is a
// stand-in, because happy-dom has no canvas.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createChartInstance, type ChartInstance } from '../../src/widget/chart'
import { createCommandRegistry } from '../../src/widget/commands'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import { createThemeController } from '../../src/theme/controller'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import { emptyDoors } from '../../src/ui/chrome/doors'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createIndicatorCatalog } from '../../src/widget/indicators'
import { FeedUnavailableError, type ChartDatafeed, type FeedBar, type HistoryPage, type SubscribeHandlers } from '../../src/datafeed'
import type { AccessPolicy, FeatureConfig, UiConfig } from '../../src/widget/options'
import type { SymbolInfo } from '../../src/symbology'
import { lastRenderer, type FakeRenderer } from './rendererFake'
import { CHART_STYLES } from '../../src/widget/styles'
import { resolveMarkPainters } from '../../src/markPainters'
import { ownIcons } from '../ownIcons'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (t: number, c = 100): FeedBar => ({ t, o: c, h: c + 1, l: c - 1, c, v: 10 })
const bars = (count: number, start = 1_700_000_000): FeedBar[] => Array.from({ length: count }, (_, i) => bar(start + i * 60, 100 + i))

/** Let every promise the load chained settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

interface FeedScript {
  history?: (symbol: string, tf: string, range: { from?: number; to?: number; countBack?: number }) => Promise<HistoryPage>
  resolve?: (symbol: string) => Promise<SymbolInfo | null>
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A datafeed that records every ask and every subscription it was opened with. */
function scriptedFeed(script: FeedScript = {}) {
  const asks: { symbol: string; tf: string; range: { from?: number; to?: number; countBack?: number } }[] = []
  const subscriptions: { symbol: string; tf: string; handlers: SubscribeHandlers; open: boolean }[] = []
  const feed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: script.resolve ?? (async () => null),
    history: (symbol, tf, range = {}) => {
      asks.push({ symbol, tf, range })
      return script.history ? script.history(symbol, tf, range) : Promise.resolve({ bars: bars(5), noData: false })
    },
    subscribeBars: (symbol, tf, handlers) => {
      const record = { symbol, tf, handlers, open: true }
      subscriptions.push(record)
      return () => {
        record.open = false
      }
    },
  }
  return { feed, asks, subscriptions, open: () => subscriptions.filter((s) => s.open) }
}

let mounted: ChartInstance[] = []
afterEach(() => {
  for (const instance of mounted.splice(0)) instance.dispose()
  document.body.replaceChildren()
})

function mountChart(feed: ChartDatafeed, options: { features?: FeatureConfig; ui?: UiConfig; symbol?: string; access?: AccessPolicy; storage?: Record<string, string> } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const registry = createCommandRegistry()
  const i18n = createChartI18n()
  const statuses: string[] = []
  const instance = createChartInstance({
    icons: ownIcons(),
    id: 'chart-1',
    painters: resolveMarkPainters({}),
    active: () => true,
    container,
    layer: document.body,
    datafeed: feed,
    saveLoad: null,
    // These checks are about the feed, so the chart takes the widget's default drawing storage: its
    // own place in the layout, with drawings riding the chart's saved content.
    drawings: { identity: { current: () => 'chart-1', set: () => undefined }, mode: 'combined' },
    storage: memoryChartStorage(options.storage),
    i18n,
    theme: createThemeController({ mode: 'dark' }),
    features: resolveFeatures({ drawings: false, replay: false, sessions: false, ...options.features }),
    ui: resolveUi({ legend: false, contextMenu: false, navigation: false, ...options.ui }, resolveFeatures({ drawings: false, replay: false, sessions: false, ...options.features })),
    compareSymbols: [],
    indicators: [],
    indicatorCatalog: createIndicatorCatalog(),
    extensions: [],
    marks: false,
    commands: registry.registry,
    replayCommands: registry.registry,
    access: options.access,
    preferences: {},
    symbol: options.symbol ?? 'ES',
    timeframe: '1m',
    onSymbolInfo: () => undefined,
    onConfig: () => undefined,
    onSaveConflict: () => undefined,
    onReady: () => undefined,
    capabilities: () => ({
      resolutions: null,
      symbolResolutions: null,
      search: true,
      history: true,
      serverTime: false,
      marks: false,
      timescaleMarks: false,
      dataStatus: 'streaming',
      saveLoad: { charts: false, layouts: false, drawings: false, templates: false },
      imageCopy: false,
      fullscreen: false,
      extensions: [],
    }),
    chartCount: () => 1,
    layoutMaximized: () => false,
    doors: emptyDoors(),
  })
  instance.handle.on('feedStatus', (status) => statuses.push(status))
  mounted.push(instance)
  const renderer: FakeRenderer = lastRenderer()
  return { instance, handle: instance.handle, renderer, statuses, registry }
}

/** The visible main series' bar count: the style series is the one that is not the invisible
 *  anchor and not the volume histogram. */
const paintedBars = (renderer: FakeRenderer): number => renderer.series.filter((s) => s.options.visible !== false && s.options.priceScaleId !== 'volume')[0]?.data.length ?? 0

describe('the load and the live subscription', () => {
  it('a served symbol paints its snapshot and opens exactly one subscription', async () => {
    const feed = scriptedFeed()
    const { renderer } = mountChart(feed.feed)
    await settle()
    expect(feed.asks.map((a) => a.range)).toEqual([{ countBack: 300 }])
    expect(feed.open().map((s) => `${s.symbol}@${s.tf}`)).toEqual(['ES@1m'])
    expect(paintedBars(renderer)).toBe(5)
  })

  it('a symbol nothing serves is terminal: the status is reported once, no subscription opens, the chart stays honestly empty', async () => {
    const feed = scriptedFeed({ history: () => Promise.reject(new FeedUnavailableError('no feed', 'feed_requires_connection')) })
    const { renderer, statuses } = mountChart(feed.feed)
    await settle()
    await settle()
    expect(statuses).toEqual(['feed_unavailable'])
    expect(feed.subscriptions).toEqual([])
    expect(paintedBars(renderer)).toBe(0)
  })

  it('the terminal state is per symbol: a later switch to a served symbol loads, subscribes once, and the status lane moves on', async () => {
    const feed = scriptedFeed({
      history: (symbol) => (symbol === 'ES' ? Promise.reject(new FeedUnavailableError('no feed', 'feed_requires_connection')) : Promise.resolve({ bars: bars(4), noData: false })),
    })
    const { handle, renderer, statuses } = mountChart(feed.feed)
    await settle()
    await settle()
    expect(statuses).toEqual(['feed_unavailable'])
    expect(feed.subscriptions).toEqual([])
    handle.setSymbol('NQ')
    await settle()
    await settle()
    expect(paintedBars(renderer)).toBe(4)
    expect(feed.subscriptions.map((s) => `${s.symbol}@${s.tf}`)).toEqual(['NQ@1m'])
    // The new subscription's status is the one the lane reports; the old symbol's terminal state
    // does not carry over onto a symbol that is served.
    feed.open()[0]!.handlers.onStatus?.('live')
    expect(statuses).toEqual(['feed_unavailable', 'live'])
  })

  it('a transient history failure still lets the subscription seed the chart from its own snapshot', async () => {
    const feed = scriptedFeed({ history: () => Promise.reject(new Error('timeout')) })
    const { renderer, statuses } = mountChart(feed.feed)
    await settle()
    expect(feed.open()).toHaveLength(1)
    feed.open()[0]!.handlers.onBars({ kind: 'snapshot', bars: bars(3) })
    expect(paintedBars(renderer)).toBe(3)
    expect(statuses).toEqual([])
  })

  it('a symbol switch closes the old subscription before the new load, and a stale snapshot never paints', async () => {
    let release: ((page: HistoryPage) => void) | null = null
    const feed = scriptedFeed({
      history: (symbol) => (symbol === 'ES' ? new Promise<HistoryPage>((resolve) => (release = resolve)) : Promise.resolve({ bars: bars(2), noData: false })),
    })
    const { handle, renderer } = mountChart(feed.feed)
    handle.setSymbol('NQ')
    await settle()
    expect(feed.open().map((s) => s.symbol)).toEqual(['NQ'])
    release!({ bars: bars(50), noData: false })
    await settle()
    expect(paintedBars(renderer)).toBe(2)
    expect(feed.open().map((s) => s.symbol)).toEqual(['NQ'])
  })
})

describe('older-history viewport continuity', () => {
  it('uses the latest fractional viewport and the effective rendered timeline when a deferred page lands', async () => {
    const page = deferred<HistoryPage>()
    const comparePage = deferred<HistoryPage>()
    const main = [bar(300), bar(360), bar(420)]
    const feed = scriptedFeed({
      history: (symbol, _tf, range) => {
        if (symbol === 'NQ') return range.from === 120 ? comparePage.promise : Promise.resolve({ bars: main, noData: false })
        return range.to === undefined ? Promise.resolve({ bars: main, noData: false }) : page.promise
      },
    })
    const { handle, renderer } = mountChart(feed.feed, { features: { compare: true } })
    await settle()
    handle.compare.add('NQ', { placement: 'same-percent' })
    await settle()

    renderer.logicalRange = { from: -0.75, to: 3.25 }
    renderer.fireLogicalRange()
    expect(feed.asks.at(-1)?.range).toEqual({ to: 299, countBack: 500 })

    // The page was requested from the first range, but the viewer keeps dragging while it is away.
    renderer.logicalRange = { from: -1.375, to: 2.625 }
    handle.zoom(2)
    expect(renderer.barSpacing).toBe(4)
    const beforeX = renderer.chart.timeScale().timeToCoordinate(300 as never)
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()

    expect(renderer.logicalRange).toEqual({ from: 1.625, to: 5.625 })
    comparePage.resolve({ bars: [bar(150), bar(210)], noData: false })
    await settle()

    // Three main timestamps plus two comparison-only timestamps entered before the old candle.
    // The exact fractional endpoints move by that effective five-point delta, retaining its X.
    expect(renderer.logicalRange).toEqual({ from: 3.625, to: 7.625 })
    expect(renderer.barSpacing).toBe(4)
    expect(renderer.chart.timeScale().timeToCoordinate(300 as never)).toBe(beforeX)
  })

  it('does not broadcast its maintenance range write as synchronized user navigation', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }])
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: 2.5, to: 5.5 })
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }])
  })

  it('does not swallow a native pan coalesced with the deferred maintenance notification', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    // The renderer may defer range publication until its next render. A native pan can move the
    // range again before that notification; it does not call the public handle's range setter.
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer.logicalRange = { from: range.from, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: true })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: 2.5, to: 5.5 })
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }))
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }))
    renderer.logicalRange = { from: 1.5, to: 4.5 }
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 1.5, to: 4.5 }])
  })

  it('owns its exact delayed maintenance report without swallowing a zoom anchored on one requested edge', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer.logicalRange = { from: range.from, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }])

    // A renderer-native zoom can retain one edge of the maintenance target. The later range is the
    // interaction, not an approximate echo of the earlier write.
    document.querySelector('.qc-gestures')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true }))
    renderer.logicalRange = { from: 2.5, to: 6.5 }
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 2.5, to: 6.5 }])
  })

  it('owns the renderer-bounded target when its maintenance report is delayed', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      // Lightweight Charts may honor its current bounds rather than retain both requested edges.
      renderer.logicalRange = { from: range.from + 0.5, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: 3, to: 5.5 })

    // A renderer invalidation can settle its bounds again before publishing. With no intervening
    // native navigation input, this remains the owned maintenance result regardless of its shape.
    renderer.logicalRange = { from: 3.25, to: 5.75 }
    renderer.fireTimeRange()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }])

    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }))
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }))
    renderer.logicalRange = { from: 2, to: 4.5 }
    renderer.timeRange = { from: 240, to: 360 }
    renderer.fireTimeRange()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 2, to: 4.5 }])
  })

  it('does not fan a delayed maintenance report through date-range sync, but does publish the next native move', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.sync.onVisibleRange((range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.timeRange = { from: 300, to: 420 }
    renderer.fireLogicalRange()
    renderer.fireTimeRange()
    expect(seen).toEqual([{ from: 300, to: 420 }])
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer.logicalRange = { from: range.from, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    renderer.fireTimeRange()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: 300, to: 420 }])

    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }))
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }))
    renderer.logicalRange = { from: 1.5, to: 4.5 }
    renderer.timeRange = { from: 240, to: 360 }
    renderer.fireTimeRange()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: 300, to: 420 }, { from: 240, to: 360 }])
  })

  it('cannot let an old maintenance owner swallow a matching range from a newer symbol generation', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({
      history: (symbol, _tf, range) =>
        symbol === 'ES' && range.to !== undefined
          ? page.promise
          : Promise.resolve({ bars: [bar(symbol === 'ES' ? 300 : 900), bar(symbol === 'ES' ? 360 : 960), bar(symbol === 'ES' ? 420 : 1_020)], noData: false }),
    })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer.logicalRange = { from: range.from, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    handle.setSymbol('NQ')
    await settle()

    renderer.logicalRange = { from: 2.5, to: 5.5 }
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 2.5, to: 5.5 }])
  })

  it.each(['chart.view.zoomIn', 'chart.view.scrollLeft', 'chart.range.1D'])(
    'retires deferred maintenance before the %s command moves the renderer',
    async (command) => {
      const page = deferred<HistoryPage>()
      const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
      const { handle, renderer, registry } = mountChart(feed.feed, { ui: { navigation: true } })
      await settle()
      const seen: unknown[] = []
      handle.on('logicalRange', (range) => seen.push(range))
      renderer.logicalRange = { from: -0.5, to: 2.5 }
      renderer.fireLogicalRange()
      vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
        renderer.logicalRange = { from: range.from, to: range.to }
        renderer.logicalWrites.push({ ...renderer.logicalRange })
      })
      page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: true })
      await settle()

      expect(registry.registry.execute(command)).toEqual({ kind: 'ok' })
      renderer.logicalRange = { from: 1.25, to: 4.75 }
      renderer.timeRange = { from: 240, to: 360 }
      renderer.fireTimeRange()
      renderer.fireLogicalRange()
      expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 1.25, to: 4.75 }])
    },
  )

  it('retires deferred maintenance when a chart drag continues on the document root', async () => {
    const page = deferred<HistoryPage>()
    const feed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false }) : page.promise) })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    const seen: unknown[] = []
    handle.on('logicalRange', (range) => seen.push(range))
    renderer.logicalRange = { from: -0.5, to: 2.5 }
    renderer.fireLogicalRange()
    vi.spyOn(renderer.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer.logicalRange = { from: range.from, to: range.to }
      renderer.logicalWrites.push({ ...renderer.logicalRange })
    })
    page.resolve({ bars: [bar(120), bar(180), bar(240)], noData: true })
    await settle()

    const gestures = document.querySelector<HTMLElement>('.qc-gestures')!
    gestures.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }))
    document.documentElement.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }))
    renderer.logicalRange = { from: 1.25, to: 4.75 }
    renderer.timeRange = { from: 240, to: 360 }
    renderer.fireTimeRange()
    renderer.fireLogicalRange()
    expect(seen).toEqual([{ from: -0.5, to: 2.5 }, { from: 1.25, to: 4.75 }])
  })

  it('releases every document-root drag continuation listener at disposal', () => {
    const root = document.documentElement
    const add = vi.spyOn(root, 'addEventListener')
    const remove = vi.spyOn(root, 'removeEventListener')
    try {
      const { instance } = mountChart(scriptedFeed().feed)
      const installed = add.mock.calls.filter(([type]) => ['mousemove', 'pointermove', 'mouseup', 'pointerup', 'pointercancel', 'dblclick'].includes(type))
      // The navigation continuations first, then the history's own pointer sweep: a gesture that
      // ends outside the pane still has to be read, so both bind to the document root.
      expect(installed.map(([type]) => type)).toEqual(['mousemove', 'pointermove', 'mouseup', 'pointerup', 'pointercancel', 'pointerup', 'dblclick'])

      instance.dispose()
      // By target and function, whatever options the addition carried: the sweep listens in the
      // capture phase and its removal says so, which a fixed argument list would not match.
      for (const [type, listener] of installed) {
        expect(
          remove.mock.calls.some(([removedType, removedListener]) => removedType === type && removedListener === listener),
          type,
        ).toBe(true)
      }
    } finally {
      add.mockRestore()
      remove.mockRestore()
    }
  })

  it('counts only unique effective timestamps and leaves the viewport alone when a page paints nothing new', async () => {
    const pages = [
      deferred<HistoryPage>(),
      deferred<HistoryPage>(),
    ]
    let pageIndex = 0
    const feed = scriptedFeed({
      history: (_symbol, _tf, range) =>
        range.to === undefined
          ? Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false })
          : pages[pageIndex++]!.promise,
    })
    const { renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -0.25, to: 2.75 }
    renderer.fireLogicalRange()
    pages[0]!.resolve({ bars: [bar(120), bar(120), bar(180), bar(300)], noData: false })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: 1.75, to: 4.75 })
    expect(renderer.logicalWrites).toEqual([{ from: 1.75, to: 4.75 }])

    // A retry made at the edge that contains only the seam and already-held times mutates neither
    // the model nor the range. In particular it cannot add raw response length to the viewport.
    renderer.logicalRange = { from: -0.125, to: 4.875 }
    renderer.fireLogicalRange()
    pages[1]!.resolve({ bars: [bar(120), bar(180), bar(300)], noData: false })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: -0.125, to: 4.875 })
    expect(renderer.logicalWrites).toHaveLength(1)
  })

  it('does not shift for a page the current session filters entirely out before paint', async () => {
    const page = deferred<HistoryPage>()
    const regular = Date.UTC(2026, 8, 7, 10) / 1000
    const feed = scriptedFeed({
      resolve: async (symbol) => ({
        ticker: symbol,
        name: symbol,
        description: symbol,
        exchange: 'TEST',
        listedExchange: 'TEST',
        type: 'stock',
        supportedResolutions: ['1m'],
        timezone: 'Etc/UTC',
        session: '0900-1700',
        subsessions: [{ id: 'premarket', session: '0000-0900' }],
        dataStatus: 'streaming',
        volumePrecision: 0,
        format: { pricescale: 100, minmov: 1 },
      }),
      history: (_symbol, _tf, range) =>
        range.to === undefined
          ? Promise.resolve({ bars: [bar(regular), bar(regular + 60), bar(regular + 120)], noData: false })
          : page.promise,
    })
    const { handle, renderer } = mountChart(feed.feed, { features: { sessions: true } })
    await settle()
    handle.setSubsession('regular')
    renderer.logicalRange = { from: -0.625, to: 2.375 }
    renderer.fireLogicalRange()
    page.resolve({ bars: [bar(regular - 7_200), bar(regular - 7_140)], noData: false })
    await settle()
    expect(renderer.logicalRange).toEqual({ from: -0.625, to: 2.375 })
    expect(renderer.logicalWrites).toEqual([])
  })

  it.each([
    { name: 'end', older: async (): Promise<HistoryPage> => ({ bars: [], noData: true }) },
    { name: 'gap stop', older: async (): Promise<HistoryPage> => ({ bars: [], noData: false, nextTime: 60 }) },
    { name: 'transient error', older: async (): Promise<HistoryPage> => Promise.reject(new Error('timeout')) },
  ])('leaves the viewport untouched when an older-page $name paints no data', async ({ older }) => {
    let olderAsks = 0
    const feed = scriptedFeed({
      history: (_symbol, _tf, range) => {
        if (range.to === undefined) return Promise.resolve({ bars: [bar(300), bar(360), bar(420)], noData: false })
        olderAsks++
        // The gap hop gets one bounded second empty answer.
        return olderAsks > 1 ? Promise.resolve({ bars: [], noData: false }) : older()
      },
    })
    const { renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -0.875, to: 2.125 }
    renderer.fireLogicalRange()
    await settle()
    await settle()
    expect(renderer.logicalRange).toEqual({ from: -0.875, to: 2.125 })
    expect(renderer.logicalWrites).toEqual([])
  })

  it('ignores a deferred prepend after the symbol generation changes or the chart is disposed', async () => {
    const oldPage = deferred<HistoryPage>()
    const feed = scriptedFeed({
      history: (symbol, _tf, range) => {
        if (symbol === 'ES' && range.to !== undefined) return oldPage.promise
        return Promise.resolve({ bars: [bar(symbol === 'ES' ? 300 : 900), bar(symbol === 'ES' ? 360 : 960)], noData: false })
      },
    })
    const first = mountChart(feed.feed)
    await settle()
    first.renderer.logicalRange = { from: -0.5, to: 1.5 }
    first.renderer.fireLogicalRange()
    first.handle.setSymbol('NQ')
    await settle()
    first.renderer.logicalRange = { from: 0.25, to: 1.25 }
    oldPage.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    expect(first.renderer.logicalRange).toEqual({ from: 0.25, to: 1.25 })

    const disposedPage = deferred<HistoryPage>()
    const secondFeed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(300), bar(360)], noData: false }) : disposedPage.promise) })
    const second = mountChart(secondFeed.feed)
    await settle()
    second.renderer.logicalRange = { from: -0.25, to: 1.75 }
    second.renderer.fireLogicalRange()
    second.instance.dispose()
    disposedPage.resolve({ bars: [bar(120), bar(180), bar(240)], noData: false })
    await settle()
    expect(second.renderer.logicalWrites).toEqual([])
  })
})

describe('the scroll-back runway', () => {
  /** A feed whose older pages are scripted in order, recording how many asks are in flight at once
   *  and what each one asked for. The initial snapshot is always the same three bars. */
  function pagingFeed(pages: (() => Promise<HistoryPage>)[]) {
    const tos: number[] = []
    let inFlight = 0
    let peak = 0
    const feed = scriptedFeed({
      history: (_symbol, _tf, range) => {
        if (range.to === undefined) return Promise.resolve({ bars: [bar(3_000), bar(3_060), bar(3_120)], noData: false })
        tos.push(range.to)
        const next = pages.shift() ?? (async (): Promise<HistoryPage> => ({ bars: [], noData: true }))
        inFlight++
        peak = Math.max(peak, inFlight)
        return next().finally(() => {
          inFlight--
        })
      },
    })
    return { feed: feed.feed, tos, peak: () => peak }
  }

  /** A page of three bars ending just before `before`, so every run keeps reaching further back. */
  const olderPage = (before: number) => async (): Promise<HistoryPage> => ({ bars: [bar(before - 180), bar(before - 120), bar(before - 60)], noData: false })

  it('keeps paging a wide view that one short page leaves at the left edge, and spends a bounded runway', async () => {
    const feed = pagingFeed([olderPage(3_000), olderPage(2_820), olderPage(2_640), olderPage(2_460), olderPage(2_280), olderPage(2_100), olderPage(1_920), olderPage(1_740)])
    const { renderer } = mountChart(feed.feed)
    await settle()
    // A window far wider than any page: every landing still leaves the left edge inside the
    // trigger, which is exactly the approach that used to strand after one page.
    renderer.logicalRange = { from: -20, to: 40 }
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 8; tick++) await settle()

    expect(feed.tos).toEqual([2_999, 2_819, 2_639, 2_459])
    expect(feed.peak()).toBe(1)

    // The run is spent, not sealed: the viewer's next approach opens a fresh one. That approach is
    // a real gesture, which retires the last page's maintenance ownership as it always does.
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, buttons: 1 }))
    document.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1 }))
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 8; tick++) await settle()
    expect(feed.tos).toHaveLength(8)
  })

  it('ends the run on a page the chart already holds or the session filters away', async () => {
    const feed = pagingFeed([async () => ({ bars: [bar(3_000), bar(3_060)], noData: false })])
    const { renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -20, to: 40 }
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 6; tick++) await settle()
    expect(feed.tos).toEqual([2_999])
    expect(renderer.logicalWrites).toEqual([])
  })

  it('honors a nextTime hop inside the run and stops at the end of history', async () => {
    const feed = pagingFeed([
      async () => ({ bars: [], noData: false, nextTime: 1_000 }),
      async () => ({ bars: [bar(880), bar(940), bar(1_000)], noData: false }),
      async () => ({ bars: [], noData: true }),
    ])
    const { renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -20, to: 40 }
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 8; tick++) await settle()
    // The gap hop re-asks once anchored at the hint, the page it serves continues the run, and the
    // feed inception that follows seals scroll-back for good.
    expect(feed.tos).toEqual([2_999, 1_000, 879])
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 4; tick++) await settle()
    expect(feed.tos).toHaveLength(3)
  })

  it('ends the run on a transient failure and lets the next approach retry', async () => {
    const feed = pagingFeed([async () => Promise.reject(new Error('timeout')), olderPage(3_000)])
    const { renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -20, to: 40 }
    renderer.fireLogicalRange()
    for (let tick = 0; tick < 6; tick++) await settle()
    expect(feed.tos).toEqual([2_999])
    expect(renderer.logicalWrites).toEqual([])

    renderer.fireLogicalRange()
    for (let tick = 0; tick < 6; tick++) await settle()
    expect(feed.tos[1]).toBe(2_999)
    expect(renderer.logicalWrites).toHaveLength(1)
  })

  it('discards a page that lands after a symbol switch or a disposal, and starts no continuation', async () => {
    const landing = deferred<HistoryPage>()
    const feed = scriptedFeed({
      history: (symbol, _tf, range) => {
        if (range.to === undefined) return Promise.resolve({ bars: [bar(symbol === 'ES' ? 3_000 : 9_000), bar(symbol === 'ES' ? 3_060 : 9_060), bar(symbol === 'ES' ? 3_120 : 9_120)], noData: false })
        return landing.promise
      },
    })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    renderer.logicalRange = { from: -20, to: 40 }
    renderer.fireLogicalRange()
    handle.setSymbol('NQ')
    await settle()
    const asksAtSwitch = feed.asks.length
    landing.resolve({ bars: [bar(2_820), bar(2_880), bar(2_940)], noData: false })
    for (let tick = 0; tick < 4; tick++) await settle()
    expect(feed.asks).toHaveLength(asksAtSwitch)
    expect(renderer.logicalWrites).toEqual([])

    const disposedLanding = deferred<HistoryPage>()
    const secondFeed = scriptedFeed({ history: (_symbol, _tf, range) => (range.to === undefined ? Promise.resolve({ bars: [bar(3_000), bar(3_060), bar(3_120)], noData: false }) : disposedLanding.promise) })
    const second = mountChart(secondFeed.feed)
    await settle()
    second.renderer.logicalRange = { from: -20, to: 40 }
    second.renderer.fireLogicalRange()
    const beforeDispose = secondFeed.asks.length
    second.instance.dispose()
    disposedLanding.resolve({ bars: [bar(2_820), bar(2_880), bar(2_940)], noData: false })
    for (let tick = 0; tick < 4; tick++) await settle()
    expect(secondFeed.asks).toHaveLength(beforeDispose)
    expect(second.renderer.logicalWrites).toEqual([])
  })
})

describe('a style switch', () => {
  it('keeps one combined price/countdown label across every style and restores the native label when stale or disabled', async () => {
    const now = Math.floor(Date.now() / 1000 / 60) * 60 + 20
    const feed = scriptedFeed({
      resolve: async (symbol) => ({
        ticker: symbol,
        name: symbol,
        description: symbol,
        exchange: 'TEST',
        listedExchange: 'TEST',
        type: 'stock',
        supportedResolutions: ['1m'],
        timezone: 'Etc/UTC',
        session: '24x7',
        dataStatus: 'streaming',
        volumePrecision: 0,
        format: { pricescale: 32, minmov: 1, fractional: true },
      }),
      history: async () => ({ bars: [bar(now - 20, 110.5)], noData: false }),
    })
    const { handle, renderer } = mountChart(feed.feed)
    await settle()
    feed.open()[0]!.handlers.onStatus?.('live')

    for (const style of CHART_STYLES) {
      handle.setStyle(style)
      const visible = renderer.series.find((item) => item.options.visible !== false && item.options.priceScaleId !== 'volume')
      expect(visible?.options.lastValueVisible, style).toBe(false)
    }

    feed.open()[0]!.handlers.onStatus?.('feed_down')
    let visible = renderer.series.find((item) => item.options.visible !== false && item.options.priceScaleId !== 'volume')
    expect(visible?.options.lastValueVisible).toBe(true)
    feed.open()[0]!.handlers.onStatus?.('live')
    handle.applyAppearance({ appearance: { countdown: false } })
    visible = renderer.series.find((item) => item.options.visible !== false && item.options.priceScaleId !== 'volume')
    expect(visible?.options.lastValueVisible).toBe(true)
  })

  it('is presentation only: nothing refetches, and the compares, indicators and visible range survive it', async () => {
    // The compare's history is shorter than the main window, the case where a repaint used to
    // re-ask the feed for the span it had already answered.
    const feed = scriptedFeed({ history: (symbol) => Promise.resolve({ bars: symbol === 'NQ' ? bars(2, 1_700_000_180) : bars(5), noData: false }) })
    const { handle, renderer } = mountChart(feed.feed, { features: { compare: true } })
    await settle()
    handle.compare.add('NQ', { placement: 'same-percent' })
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS[0]! })
    await settle()
    renderer.logicalRange = { from: 101, to: 104 }
    const asked = feed.asks.length
    const subscriptions = feed.subscriptions.length
    handle.setStyle('line')
    await settle()
    expect(feed.asks.length).toBe(asked)
    expect(feed.subscriptions.length).toBe(subscriptions)
    expect(handle.style()).toBe('line')
    expect(handle.compare.list().map((c) => c.symbol)).toEqual(['NQ'])
    expect(handle.indicators.get().map((i) => i.id)).toEqual(['sma-1'])
    expect(renderer.logicalRange).toEqual({ from: 101, to: 104 })
    // The candle series is gone; a visible line series carries the same five bars.
    expect(renderer.series.some((s) => s.kind === 'Candlestick')).toBe(false)
    expect(renderer.series.some((s) => s.kind === 'Line' && s.options.visible !== false && s.data.length === 5)).toBe(true)
  })
})

describe('the indicator access policy', () => {
  it('is asked the definition id, the one the picker lists, never the instance id', async () => {
    const asked: string[] = []
    const feed = scriptedFeed()
    const { handle } = mountChart(feed.feed, {
      access: {
        indicator: (id) => {
          asked.push(id)
          return id !== 'rsi'
        },
      },
    })
    await settle()
    const sma = BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!
    const rsi = BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')!
    expect(handle.indicators.add({ id: 'my-average', definition: sma })).toBe(true)
    expect(handle.indicators.add({ id: 'momentum', definition: rsi })).toBe(false)
    expect(asked).toEqual(['sma', 'rsi'])
    expect(handle.indicators.get().map((i) => i.id)).toEqual(['my-average'])
  })
})

describe('a held price axis', () => {
  const framing = (renderer: FakeRenderer): boolean => renderer.chart.priceScale('right').options().autoScale !== false
  // The hold retries for a bounded number of animation frames. happy-dom runs a frame on every
  // event-loop turn, so a timer wait in the test would pass however many frames the machine fits
  // into it. Frames here advance only when the test says so.
  const queued = new Map<number, FrameRequestCallback>()
  let lastFrame = 0
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      queued.set(++lastFrame, callback)
      return lastFrame
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => void queued.delete(id))
  })
  afterEach(() => {
    queued.clear()
    vi.restoreAllMocks()
  })
  /** The renderer frames in its queued animation frame; the hold lands in the one after. */
  const frames = async (): Promise<void> => {
    for (let frame = 0; frame < 2; frame++) {
      const due = [...queued.values()]
      queued.clear()
      for (const callback of due) callback(performance.now())
    }
  }

  it('frames the first history before it holds: a saved manual axis never keeps bounds from before the bars', async () => {
    const history = deferred<HistoryPage>()
    const storage = { 'quickcharts.priceAxis.v1': 'manual' }
    const { renderer } = mountChart(scriptedFeed({ history: () => history.promise }).feed, { storage })
    // Nothing has painted: the renderer is still framing, whatever the saved policy says.
    expect(framing(renderer)).toBe(true)
    history.resolve({ bars: bars(5, 1_700_000_000), noData: false })
    await settle()
    expect(paintedBars(renderer)).toBe(5)
    // The paint frames the market in the renderer's own frame; the hold lands in the one after.
    await frames()
    expect(framing(renderer)).toBe(false)
    // The intent is kept as the viewer chose it, framed or not.
    expect(storage['quickcharts.priceAxis.v1']).toBe('manual')
  })

  it('never holds a scale whose range the bars fall outside', async () => {
    const history = deferred<HistoryPage>()
    const { renderer } = mountChart(scriptedFeed({ history: () => history.promise }).feed, { storage: { 'quickcharts.priceAxis.v1': 'manual' } })
    // Before any bars: the renderer answers a frame of some other data. The hold must keep waiting.
    const scale = renderer.chart.priceScale('right') as unknown as { getVisibleRange: () => { from: number; to: number } | null }
    const real = scale.getVisibleRange
    scale.getVisibleRange = () => ({ from: 1_000_000, to: 2_000_000 })
    history.resolve({ bars: bars(5, 1_700_000_000), noData: false })
    await settle()
    await frames()
    expect(framing(renderer)).toBe(true)
    // The frame that covers the bars is the one it holds.
    scale.getVisibleRange = real
    await frames()
    expect(framing(renderer)).toBe(false)
  })

  it('frames again for a new market, then holds again', async () => {
    const { handle, renderer } = mountChart(scriptedFeed().feed, { storage: { 'quickcharts.priceAxis.v1': 'manual' } })
    await settle()
    await frames()
    expect(framing(renderer)).toBe(false)
    handle.setSymbol('NQ')
    // The new history is away: the axis frames, so the first bars of the new market land in view.
    expect(framing(renderer)).toBe(true)
    await settle()
    await frames()
    expect(framing(renderer)).toBe(false)
  })
})
