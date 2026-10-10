// @vitest-environment happy-dom
// The on-chart features the settings switch on, on a mounted chart: what each draws, where its data
// comes from, and what it leaves alone while it is off.
import { LineStyle } from 'lightweight-charts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar, SymbolPrices } from '../../src/datafeed'
import { chartSettingsDefaults } from '../../src/settings/defaults'
import type { PartialChartSettings } from '../../src/settings/schema'
import type { PriceFormat, SymbolInfo } from '../../src/symbology'
import { DARK_THEME } from '../../src/theme/palettes'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { UiConfig } from '../../src/widget/options'
import { priceLevels, visibleRange } from '../../src/widget/priceLevels'
import { barValue } from '../../src/widget/styles'
import { lastRenderer, type FakeRenderer, type FakeSeries } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const FORMAT: PriceFormat = { pricescale: 100, minmov: 1 }
const info: SymbolInfo = {
  ticker: 'ES',
  name: 'ES',
  description: 'E-mini S&P 500',
  exchange: 'CME',
  listedExchange: 'CME',
  type: 'futures',
  supportedResolutions: [],
  timezone: 'Etc/UTC',
  session: '24x7',
  dataStatus: 'streaming',
  volumePrecision: 0,
  format: FORMAT,
  currencyCode: 'USD',
}

const BARS: FeedBar[] = Array.from({ length: 30 }, (_, i) => {
  const c = 4500 + i
  const o = c - 0.5
  return { t: 1_700_000_000 + i * 60, o, h: c + 2, l: o - 1, c, v: 1000 + i }
})

function feed(overrides: Partial<ChartDatafeed> = {}): ChartDatafeed {
  return {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => info,
    history: async () => ({ bars: BARS, noData: false }),
    subscribeBars: () => () => undefined,
    ...overrides,
  }
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

async function mount(options: { settings?: PartialChartSettings; ui?: UiConfig; datafeed?: ChartDatafeed; timeframe?: string } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({
    container,
    datafeed: options.datafeed ?? feed(),
    symbol: 'ES',
    timeframe: options.timeframe ?? '1m',
    theme: { mode: 'dark' },
    features: { drawings: false, replay: false, compare: false },
    ui: options.ui ?? { contextMenu: false, topBar: false, bottomBar: false, toasts: false },
    ...(options.settings ? { settings: options.settings } : {}),
  })
  mounted.push(widget)
  const renderer = lastRenderer()
  await settle()
  return { widget, chart: widget.activeChart(), renderer, container }
}

/** The style series on screen: the last visible series on the price scale. */
const main = (renderer: FakeRenderer): FakeSeries =>
  renderer.series.filter((s) => s.options.visible !== false && s.options.priceScaleId !== 'volume' && s.paneIndex === 0).at(-1)!

/** A feed whose prices port the test pushes through. */
function pricedFeed(overrides: Partial<ChartDatafeed> = {}) {
  let push: ((prices: SymbolPrices) => void) | null = null
  const datafeed = feed({
    subscribePrices: (_symbol, handlers) => {
      push = handlers.onPrices
      return () => {
        push = null
      }
    },
    ...overrides,
  })
  return { datafeed, push: (prices: SymbolPrices) => push?.(prices) }
}

const dayChange = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('[data-role="legend-day-change"]')!

describe('the last day change', () => {
  it('reads the feed prices: the change since the previous close, in its direction', async () => {
    const { datafeed, push } = pricedFeed()
    const { chart, container } = await mount({ datafeed })
    expect(dayChange(container).hidden).toBe(true)
    chart.applySettings({ statusLine: { lastDayChange: true } })
    push({ last: 4529, previousClose: 4400 })
    expect(dayChange(container).hidden).toBe(false)
    expect(dayChange(container).textContent).toBe('+129.00 (+2.93%)')
    expect(dayChange(container).dataset.qcTone).toBe('up')
    push({ last: 4390 })
    expect(dayChange(container).textContent).toBe('-10.00 (-0.23%)')
    expect(dayChange(container).dataset.qcTone).toBe('down')
    chart.applySettings({ statusLine: { lastDayChange: false } })
    expect(dayChange(container).hidden).toBe(true)
  })

  it('reads the previous close off the bars when the feed states no prices', async () => {
    // Two trading days of a continuous market: the newest day's change runs from the last close of
    // the day before.
    const midnight = Date.UTC(2026, 9, 6) / 1000
    const bars: FeedBar[] = [
      { t: midnight - 120, o: 99, h: 100, l: 98, c: 100, v: 1 },
      { t: midnight - 60, o: 100, h: 101, l: 99, c: 101, v: 1 },
      { t: midnight, o: 101, h: 103, l: 100, c: 102, v: 1 },
      { t: midnight + 60, o: 102, h: 104, l: 101, c: 103.02, v: 1 },
    ]
    const { chart, container } = await mount({ datafeed: feed({ history: async () => ({ bars, noData: false }) }) })
    chart.applySettings({ statusLine: { lastDayChange: true } })
    expect(dayChange(container).textContent).toBe('+2.02 (+2%)')
  })

  it('draws nothing without a previous close', async () => {
    const { chart, container } = await mount()
    chart.applySettings({ statusLine: { lastDayChange: true } })
    expect(dayChange(container).hidden).toBe(true)
  })
})

/** The price lines on the style series, as the renderer holds their options. */
const lines = (renderer: FakeRenderer): Record<string, unknown>[] =>
  main(renderer).priceLines.map((line) => (line as { options(): Record<string, unknown> }).options())

describe('the price levels', () => {
  it('reads each level only while its setting asks, and finds the high and low in view', () => {
    const settings = chartSettingsDefaults(DARK_THEME)
    const facts = { intraday: true, previousClose: 10, range: { high: 12, low: 8 }, bid: 9.9, ask: 10.1 }
    const tags = { high: 'High', low: 'Low', bid: 'Bid', ask: 'Ask' }
    expect(priceLevels(settings, facts, tags)).toEqual([])
    const on = { ...settings, priceLabels: { ...settings.priceLabels, previousCloseLine: true, highLowValue: true, bidAskValue: true, bidAskLine: true } }
    expect(priceLevels(on, facts, tags).map((level) => [level.key, level.price, level.title, level.value, level.line])).toEqual([
      ['previousClose', 10, '', false, true],
      ['high', 12, 'High', true, false],
      ['low', 8, 'Low', true, false],
      ['ask', 10.1, 'Ask', true, true],
      ['bid', 9.9, 'Bid', true, true],
    ])
    // The previous close is an intraday level.
    expect(priceLevels(on, { ...facts, intraday: false }, tags).map((level) => level.key)).not.toContain('previousClose')
    const bars = [1, 2, 3, 4].map((i) => ({ t: i, h: 10 + i, l: 10 - i }))
    expect(visibleRange(bars, 2, 3)).toEqual({ high: 13, low: 7 })
    expect(visibleRange(bars, 2, 3, (bar) => bar.h)).toEqual({ high: 13, low: 12 })
    expect(visibleRange(bars, 5, 9)).toBeNull()
  })

  it('marks the previous close in its own color, the line dotted', async () => {
    const midnight = Date.UTC(2026, 9, 6) / 1000
    const bars: FeedBar[] = [
      { t: midnight - 60, o: 100, h: 101, l: 99, c: 101, v: 1 },
      { t: midnight, o: 101, h: 103, l: 100, c: 102, v: 1 },
    ]
    const { chart, renderer } = await mount({ datafeed: feed({ history: async () => ({ bars, noData: false }) }) })
    expect(lines(renderer)).toEqual([])
    chart.applySettings({ priceLabels: { previousCloseValue: true, previousCloseLine: true } })
    expect(lines(renderer)).toEqual([
      expect.objectContaining({ price: 101, color: '#555555', axisLabelColor: '#555555', axisLabelTextColor: '#ffffff', lineStyle: LineStyle.SparseDotted, lineWidth: 1, lineVisible: true, axisLabelVisible: true, title: '' }),
    ])
    chart.applySettings({ priceLabels: { previousCloseValue: false, previousCloseColor: '#123456', previousCloseLineWidth: 2 } })
    expect(lines(renderer)).toEqual([expect.objectContaining({ color: '#123456', lineWidth: 2, axisLabelVisible: false })])
    chart.applySettings({ priceLabels: { previousCloseLine: false } })
    expect(lines(renderer)).toEqual([])
  })

  it('marks the high and low of the bars in view under their tags, and follows the view', async () => {
    const { chart, renderer } = await mount()
    renderer.timeRange = { from: BARS[10]!.t, to: BARS[19]!.t }
    chart.applySettings({ priceLabels: { highLowValue: true, highLowLine: true } })
    expect(lines(renderer)).toEqual([
      expect.objectContaining({ price: BARS[19]!.h, title: 'High', color: '#808080', axisLabelColor: '#142e61', lineStyle: LineStyle.SparseDotted }),
      expect.objectContaining({ price: BARS[10]!.l, title: 'Low', color: '#808080', axisLabelColor: '#142e61' }),
    ])
    renderer.timeRange = { from: BARS[0]!.t, to: BARS[5]!.t }
    renderer.fireLogicalRange()
    expect(lines(renderer).map((line) => line.price)).toEqual([BARS[5]!.h, BARS[0]!.l])
    chart.applySettings({ priceLabels: { highLowColor: '#00ff00' } })
    expect(lines(renderer)[0]).toMatchObject({ color: '#00ff00', axisLabelColor: '#00ff00' })
  })

  it('marks the bid and ask from the feed prices, and moves them to a new style series', async () => {
    const { datafeed, push } = pricedFeed()
    const { chart, renderer } = await mount({ datafeed })
    chart.applySettings({ priceLabels: { bidAskValue: true, bidAskLine: true } })
    expect(lines(renderer)).toEqual([])
    push({ bid: 4528.5, ask: 4529.25 })
    expect(lines(renderer)).toEqual([
      expect.objectContaining({ price: 4529.25, title: 'Ask', color: '#f7525f', axisLabelColor: '#f7525f' }),
      expect.objectContaining({ price: 4528.5, title: 'Bid', color: '#2962ff', axisLabelColor: '#2962ff' }),
    ])
    push({ bid: 4528.75 })
    expect(lines(renderer)[1]).toMatchObject({ price: 4528.75 })
    // A line alone wears no tag: the renderer writes a tag only beside a value box.
    chart.applySettings({ priceLabels: { bidAskValue: false } })
    expect(lines(renderer).map((line) => [line.title, line.axisLabelVisible])).toEqual([['', false], ['', false]])
    const before = main(renderer)
    chart.setStyle('line')
    expect(before.priceLines).toEqual([])
    expect(lines(renderer)).toHaveLength(2)
  })
})

describe('the price source', () => {
  it('reads each source off a bar', () => {
    const bar = { o: 10, h: 14, l: 8, c: 12 }
    expect(barValue(bar, 'open')).toBe(10)
    expect(barValue(bar, 'high')).toBe(14)
    expect(barValue(bar, 'low')).toBe(8)
    expect(barValue(bar, 'close')).toBe(12)
    expect(barValue(bar, 'hl2')).toBe(11)
    expect(barValue(bar, 'hlc3')).toBeCloseTo(34 / 3)
    expect(barValue(bar, 'ohlc4')).toBe(11)
    expect(barValue(bar, 'hlcc4')).toBe(11.5)
  })

  it('draws each single-value style from its own source, and a bar style from the whole bar', async () => {
    const { chart, renderer } = await mount()
    chart.setStyle('line')
    const last = (): Record<string, number> => main(renderer).data.at(-1) as Record<string, number>
    expect(last().value).toBe(BARS.at(-1)!.c)
    chart.applySettings({ line: { priceSource: 'hl2' } })
    const bar = BARS.at(-1)!
    expect(last().value).toBe((bar.h + bar.l) / 2)
    chart.setStyle('area')
    expect(last().value).toBe(bar.c)
    chart.applySettings({ area: { priceSource: 'high' } })
    expect(last().value).toBe(bar.h)
    chart.setStyle('baseline')
    chart.applySettings({ baseline: { priceSource: 'open' } })
    expect(last().value).toBe(bar.o)
    chart.setStyle('stepline')
    chart.applySettings({ stepLine: { priceSource: 'ohlc4' } })
    expect(last().value).toBe((bar.o + bar.h + bar.l + bar.c) / 4)
    chart.setStyle('candles')
    expect(last()).toMatchObject({ open: bar.o, high: bar.h, low: bar.l, close: bar.c })
  })
})
