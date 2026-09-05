// @vitest-environment happy-dom
// One chart's data lifecycle, driven end to end over a scripted datafeed with the renderer
// replaced by a fake: what a load fetches, when the live subscription opens, and which asks never
// happen. The code under test is the real chart instance and its planes; only `createChart` is a
// stand-in, because happy-dom has no canvas.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartInstance, type ChartInstance } from '../../src/widget/chart'
import { createCommandRegistry } from '../../src/widget/commands'
import { resolveFeatures } from '../../src/widget/planes'
import { createThemeController } from '../../src/theme/controller'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import { emptyDoors } from '../../src/ui/chrome/doors'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { FeedUnavailableError, type ChartDatafeed, type FeedBar, type HistoryPage, type SubscribeHandlers } from '../../src/datafeed'
import type { AccessPolicy, FeatureConfig } from '../../src/widget/options'
import { lastRenderer, type FakeRenderer } from './rendererFake'

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
}

/** A datafeed that records every ask and every subscription it was opened with. */
function scriptedFeed(script: FeedScript = {}) {
  const asks: { symbol: string; tf: string; range: { from?: number; to?: number; countBack?: number } }[] = []
  const subscriptions: { symbol: string; tf: string; handlers: SubscribeHandlers; open: boolean }[] = []
  const feed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => null,
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

function mountChart(feed: ChartDatafeed, options: { features?: FeatureConfig; symbol?: string; access?: AccessPolicy } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const registry = createCommandRegistry()
  const i18n = createChartI18n()
  const statuses: string[] = []
  const instance = createChartInstance({
    id: 'chart-1',
    container,
    datafeed: feed,
    saveLoad: null,
    storage: memoryChartStorage(),
    i18n,
    theme: createThemeController({ mode: 'dark' }),
    features: resolveFeatures({ drawings: false, legend: false, contextMenu: false, navigation: false, replay: false, sessions: false, ...options.features }),
    compareSymbols: [],
    indicators: [],
    extensions: [],
    marks: false,
    commands: registry.registry,
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

describe('a style switch', () => {
  it('is presentation only: nothing refetches, and the compares, indicators and visible range survive it', async () => {
    // The compare's history is shorter than the main window, the case where a repaint used to
    // re-ask the feed for the span it had already answered.
    const feed = scriptedFeed({ history: (symbol) => Promise.resolve({ bars: symbol === 'NQ' ? bars(2, 1_700_000_180) : bars(5), noData: false }) })
    const { handle, renderer } = mountChart(feed.feed, { features: { compare: true } })
    await settle()
    handle.compare.add('NQ', { placement: 'same-percent' })
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS[0]! })
    await settle()
    renderer.logicalRange = { from: 1, to: 4 }
    const asked = feed.asks.length
    const subscriptions = feed.subscriptions.length
    handle.setStyle('line')
    await settle()
    expect(feed.asks.length).toBe(asked)
    expect(feed.subscriptions.length).toBe(subscriptions)
    expect(handle.style()).toBe('line')
    expect(handle.compare.list().map((c) => c.symbol)).toEqual(['NQ'])
    expect(handle.indicators.get().map((i) => i.id)).toEqual(['sma-1'])
    expect(renderer.logicalRange).toEqual({ from: 1, to: 4 })
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
