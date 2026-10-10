// @vitest-environment happy-dom
// The on-chart features the settings switch on, on a mounted chart: what each draws, where its data
// comes from, and what it leaves alone while it is off.
import { afterEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { PartialChartSettings } from '../../src/settings/schema'
import type { PriceFormat, SymbolInfo } from '../../src/symbology'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { UiConfig } from '../../src/widget/options'
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
