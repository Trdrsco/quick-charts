// @vitest-environment happy-dom
// The on-chart features the settings switch on, on a mounted chart: what each draws, where its data
// comes from, and what it leaves alone while it is off.
import { LineStyle } from 'lightweight-charts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { seriesTargetOf } from '../../src/compare'
import type { ChartDatafeed, FeedBar, SymbolPrices } from '../../src/datafeed'
import { chartSettingsDefaults } from '../../src/settings/defaults'
import type { PartialChartSettings } from '../../src/settings/schema'
import type { PriceFormat, SymbolInfo } from '../../src/symbology'
import { DARK_THEME } from '../../src/theme/palettes'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { UiConfig } from '../../src/widget/options'
import { priceLevels, visibleRange } from '../../src/widget/priceLevels'
import { signedPercentText } from '../../src/widget/prices'
import { barValue } from '../../src/widget/styles'
import { fakePriceAt, lastRenderer, type FakeRenderer, type FakeSeries } from './rendererFake'

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
    const facts = { intraday: true, previousClose: 10, range: { high: 12, low: 8 }, bid: 9.9, ask: 10.1, extendedHours: null }
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

describe('the extended-hours label', () => {
  it('marks the last price of a stretch the regular-hours chart leaves out, in that stretch color', async () => {
    const stock: SymbolInfo = {
      ...info,
      ticker: 'AAPL',
      session: '1430-2100',
      timezone: 'Etc/UTC',
      subsessions: [
        { id: 'regular', description: 'Regular', session: '1430-2100' },
        { id: 'premarket', description: 'Pre-market', session: '0900-1430' },
        { id: 'postmarket', description: 'Post-market', session: '2100-2300' },
      ],
    }
    const day = Date.UTC(2026, 9, 6) / 1000
    const bar = (hour: number, c: number): FeedBar => ({ t: day + hour * 3600, o: c, h: c, l: c, c, v: 1 })
    const bars = [bar(15, 100), bar(20, 101), bar(22, 104)]
    const { chart, renderer } = await mount({ datafeed: feed({ resolve: async () => stock, history: async () => ({ bars, noData: false }) }), timeframe: '1h' })
    // Regular hours by default: the post-market bar is left off and marked on the scale instead.
    expect(main(renderer).data.map((row) => (row as { close: number }).close)).toEqual([100, 101])
    expect(lines(renderer)).toEqual([expect.objectContaining({ price: 104, color: '#2962ff', axisLabelVisible: true, lineVisible: true, title: '' })])
    chart.applySettings({ priceLabels: { postMarketLabelColor: '#abcdef', extendedHoursLine: false } })
    expect(lines(renderer)).toEqual([expect.objectContaining({ color: '#abcdef', lineVisible: false })])
    // Showing the extended hours draws the bar itself, and its last value stands in its own label.
    chart.applySettings({ symbol: { session: 'extended' } })
    expect(lines(renderer)).toEqual([])
  })
})

describe('the scales placement', () => {
  it('stands the main series, the anchor and its framing on the left, and back', async () => {
    const { chart, renderer } = await mount()
    const options = (): Record<string, Record<string, unknown> | string> => renderer.chart.options() as never
    chart.setScaleMode('log')
    expect(main(renderer).options.priceScaleId).toBeUndefined()
    chart.applySettings({ priceScale: { placement: 'left' } })
    const onPane = renderer.series.filter((s) => s.paneIndex === 0 && s.options.priceScaleId !== 'volume')
    expect(onPane.map((s) => s.options.priceScaleId)).toEqual(onPane.map(() => 'left'))
    expect(options().leftPriceScale).toMatchObject({ visible: true })
    expect(options().rightPriceScale).toMatchObject({ visible: false })
    expect(options().defaultVisiblePriceScaleId).toBe('left')
    // The scale mode travels with the scale; the side it left is a regular scale again.
    expect(renderer.priceScaleOptions.left).toMatchObject({ mode: 1 })
    expect(renderer.priceScaleOptions.right).toMatchObject({ mode: 0, autoScale: true })
    // A new style series takes the main side too.
    chart.setStyle('line')
    expect(options().defaultVisiblePriceScaleId).toBe('left')
    chart.applySettings({ priceScale: { placement: 'auto' } })
    expect(main(renderer).options.priceScaleId).toBe('right')
    expect(options().rightPriceScale).toMatchObject({ visible: true })
    expect(options().leftPriceScale).toMatchObject({ visible: false })
  })

  it('opens on the left when the settings say so', async () => {
    const { renderer } = await mount({ settings: { priceScale: { placement: 'left' } } })
    expect(renderer.created.leftPriceScale).toMatchObject({ visible: true })
    expect(renderer.created.rightPriceScale).toMatchObject({ visible: false })
    expect(renderer.created.defaultVisiblePriceScaleId).toBe('left')
  })

  it('puts a comparison on a scale of its own on the side the main series left', () => {
    expect(seriesTargetOf('new-scale', 1)).toEqual({ paneIndex: 0, priceScaleId: 'left' })
    expect(seriesTargetOf('new-scale', 1, 'right')).toEqual({ paneIndex: 0, priceScaleId: 'right' })
    expect(seriesTargetOf('same-percent', 1, 'right')).toEqual({ paneIndex: 0 })
  })
})

describe('the scale mode buttons', () => {
  const layOut = (renderer: FakeRenderer): void => {
    renderer.scaleWidths.right = 60
    renderer.paneHeights[0] = 300
  }
  const pointer = (target: HTMLElement, type: string, x: number, y: number): void => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as MouseEvent & { pointerType?: string }
    Object.defineProperty(event, 'pointerType', { value: 'mouse' })
    target.dispatchEvent(event)
  }

  it('show over the price scale, always, or never, and press the chart own verbs', async () => {
    const { chart, renderer, container } = await mount()
    layOut(renderer)
    const gestures = container.querySelector<HTMLElement>('.qc-gestures')!
    Object.defineProperty(gestures, 'clientWidth', { value: 600, configurable: true })
    chart.applySettings({ canvas: { marginTop: 11 } })
    const modes = container.querySelector<HTMLElement>('.qc-scale-modes')!
    const auto = modes.querySelector<HTMLButtonElement>('[data-role="scale-auto"]')!
    const log = modes.querySelector<HTMLButtonElement>('[data-role="scale-log"]')!
    expect(modes.hidden).toBe(true)
    // Over the scale, which stands at the right 60px of the 600px pane.
    pointer(gestures, 'pointermove', 570, 100)
    expect(modes.hidden).toBe(false)
    expect(modes.style.left).toBe('548px')
    expect(modes.style.top).toBe('274px')
    expect([auto.textContent, log.textContent, auto.getAttribute('aria-label')]).toEqual(['A', 'L', 'Auto scale'])
    pointer(gestures, 'pointermove', 100, 100)
    expect(modes.hidden).toBe(true)
    chart.applySettings({ priceScale: { scaleModeButtons: 'always' } })
    expect(modes.hidden).toBe(false)
    expect(auto.getAttribute('aria-pressed')).toBe('true')
    expect(log.getAttribute('aria-pressed')).toBe('false')
    log.click()
    expect(chart.scaleMode()).toBe('log')
    expect(log.getAttribute('aria-pressed')).toBe('true')
    auto.click()
    expect(renderer.priceScaleOptions.right).toMatchObject({ autoScale: false })
    expect(auto.getAttribute('aria-pressed')).toBe('false')
    auto.click()
    expect(renderer.priceScaleOptions.right).toMatchObject({ autoScale: true })
    chart.applySettings({ priceScale: { scaleModeButtons: 'never' } })
    pointer(gestures, 'pointermove', 570, 100)
    expect(modes.hidden).toBe(true)
  })
})

describe('the currency and unit box', () => {
  it('names the symbol currency and unit at the top of the scale, as the setting says', async () => {
    const { chart, renderer, container } = await mount({ datafeed: feed({ resolve: async () => ({ ...info, unitId: 'point' }) }) })
    renderer.scaleWidths.right = 72
    renderer.paneHeights[0] = 300
    const gestures = container.querySelector<HTMLElement>('.qc-gestures')!
    Object.defineProperty(gestures, 'clientWidth', { value: 600, configurable: true })
    chart.applySettings({ priceScale: { currencyAndUnit: 'always' } })
    const box = container.querySelector<HTMLElement>('.qc-scale-unit')!
    expect(box.hidden).toBe(false)
    expect(box.textContent).toBe('USD · point')
    expect([box.style.left, box.style.top]).toEqual(['532px', '4px'])
    chart.applySettings({ priceScale: { currencyAndUnit: 'hover' } })
    expect(box.hidden).toBe(true)
    chart.applySettings({ priceScale: { currencyAndUnit: 'never' } })
    expect(box.hidden).toBe(true)
    // On a left scale the box keeps four pixels from the scale's outer side.
    chart.applySettings({ priceScale: { currencyAndUnit: 'always', placement: 'left' } })
    renderer.scaleWidths.left = 72
    chart.applySettings({ canvas: { marginTop: 12 } })
    expect([box.style.left, box.style.right]).toEqual(['', '532px'])
  })

  it('shows nothing for a symbol that names neither', async () => {
    const { chart, renderer, container } = await mount({ datafeed: feed({ resolve: async () => ({ ...info, currencyCode: undefined }) }) })
    renderer.scaleWidths.right = 72
    renderer.paneHeights[0] = 300
    chart.applySettings({ priceScale: { currencyAndUnit: 'always' } })
    expect(container.querySelector<HTMLElement>('.qc-scale-unit')!.hidden).toBe(true)
  })
})

describe('the price to bar ratio lock', () => {
  it('takes the ratio on screen as it engages, and rescales the price axis with every zoom', async () => {
    const { chart, renderer } = await mount()
    const range = renderer.chart.priceScale('right').getVisibleRange()!
    const live = Math.round(((range.to - range.from) / 300) * 8 * 1e7) / 1e7
    chart.applySettings({ priceScale: { lockPriceToBarRatio: true } })
    expect(chart.settings().priceScale.priceToBarRatio).toBe(live)
    // The framing stops: the auto-scale button reads off.
    expect(renderer.priceScaleOptions.right).toMatchObject({ autoScale: false })
    const span = (): number => renderer.priceRanges.right!.to - renderer.priceRanges.right!.from
    const before = span()
    renderer.chart.timeScale().applyOptions({ barSpacing: 16 })
    renderer.fireLogicalRange()
    expect(span()).toBeCloseTo(before / 2, 6)
    // A ratio of the viewer's own holds at once.
    chart.applySettings({ priceScale: { priceToBarRatio: live * 2 } })
    expect(span()).toBeCloseTo(before, 6)
    // Unlocked, a zoom leaves the price axis where it is.
    chart.applySettings({ priceScale: { lockPriceToBarRatio: false } })
    renderer.chart.timeScale().applyOptions({ barSpacing: 4 })
    renderer.fireLogicalRange()
    expect(span()).toBeCloseTo(before, 6)
  })

  it('holds nothing on a scale that is not regular', async () => {
    const { chart, renderer } = await mount()
    chart.setScaleMode('log')
    chart.applySettings({ priceScale: { lockPriceToBarRatio: true } })
    expect(chart.settings().priceScale.priceToBarRatio).toBeNull()
    expect(renderer.priceRanges.right).toBeUndefined()
  })
})

describe('keeping the left edge', () => {
  /** Bars every timeframe's step apart up to one moment, served newest-last as a feed pages them. */
  const END = Date.UTC(2026, 9, 6, 12) / 1000
  const asks: { tf: string; to?: number; countBack?: number }[] = []
  const stepped: ChartDatafeed['history'] = async (_symbol, tf, range) => {
    asks.push({ tf, ...(range?.to !== undefined ? { to: range.to } : {}), ...(range?.countBack !== undefined ? { countBack: range.countBack } : {}) })
    const step = tf === '5m' ? 300 : 60
    const to = range?.to ?? END
    const count = range?.countBack ?? 300
    const last = Math.floor(to / step) * step
    const out: FeedBar[] = []
    for (let i = count - 1; i >= 0; i--) {
      const at = last - i * step
      out.push({ t: at, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 })
    }
    return { bars: out, noData: false }
  }

  it('stands the new timeframe from the moment the old one stood, paging older bars in first', async () => {
    asks.length = 0
    const { chart, renderer } = await mount({ datafeed: feed({ history: stepped }), timeframe: '5m' })
    const edge = END - 20 * 3600
    renderer.timeRange = { from: edge, to: END }
    renderer.logicalRange = { from: 60, to: 300 }
    chart.applySettings({ timeScale: { keepLeftEdge: true } })
    chart.setTimeframe('1m')
    await settle()
    // The first 1m page holds five hours; the edge is twenty hours back, so the first ask older reaches
    // it (a view standing near the oldest bar may page on from there, as any view there does).
    const older = asks.filter((ask) => ask.tf === '1m' && ask.to !== undefined)
    expect(older.length).toBeGreaterThanOrEqual(1)
    expect(older[0]!.countBack).toBeGreaterThanOrEqual(15 * 60)
    const last = renderer.logicalWrites.at(-1)!
    const anchorRows = renderer.series[0]!.data as { time: number }[]
    expect(anchorRows[last.from]!.time).toBe(edge)
    expect(last.to - last.from).toBe(240)
  })

  it('fits the new timeframe as before while the setting is off', async () => {
    const { chart, renderer } = await mount({ datafeed: feed({ history: stepped }), timeframe: '5m' })
    renderer.timeRange = { from: END - 3600, to: END }
    renderer.logicalRange = { from: 280, to: 300 }
    const writes = renderer.logicalWrites.length
    chart.setTimeframe('1m')
    await settle()
    expect(renderer.logicalWrites.length).toBe(writes)
  })
})

describe('the plus button', () => {
  afterEach(() => fakePriceAt(null))

  it('stands beside the crosshair price on the main pane and opens that price menu, host rows and all', async () => {
    const run = vi.fn()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({
      container,
      datafeed: feed(),
      symbol: 'ES',
      timeframe: '1m',
      theme: { mode: 'dark' },
      features: { drawings: false, replay: false, compare: false },
      ui: { contextMenu: true, topBar: false, bottomBar: false, toasts: false },
      extensions: [
        {
          id: 'levels',
          attach: (ctx) => (ctx.contributeContextMenu((at) => [{ id: 'mark', label: `Mark ${at.priceText}`, group: 'level', run }]), { detach: () => undefined }),
        },
      ],
    })
    mounted.push(widget)
    const renderer = lastRenderer()
    await settle()
    renderer.scaleWidths.right = 60
    renderer.paneHeights[0] = 300
    const gestures = container.querySelector<HTMLElement>('.qc-gestures')!
    Object.defineProperty(gestures, 'clientWidth', { value: 600, configurable: true })
    fakePriceAt(() => 4510.25)
    const plus = container.querySelector<HTMLButtonElement>('.qc-scale-plus')!
    expect(plus.hidden).toBe(true)
    renderer.fireCrosshair(BARS[5]!.t, 300, 120)
    expect(plus.hidden).toBe(false)
    expect([plus.style.left, plus.style.top]).toEqual(['515px', '108px'])
    expect(plus.getAttribute('aria-label')).toBe('Actions at 4510.25')
    plus.click()
    const rows = [...document.querySelectorAll<HTMLElement>('.qc-menu-row')].map((row) => row.textContent)
    expect(rows.some((text) => text?.includes('Mark 4510.25'))).toBe(true)
    renderer.fireCrosshair(null)
    expect(plus.hidden).toBe(true)
    widget.activeChart().applySettings({ priceLabels: { plusButton: false } })
    renderer.fireCrosshair(BARS[5]!.t, 300, 120)
    expect(plus.hidden).toBe(true)
  })

  it('stands down without a context menu to open', async () => {
    const { renderer, container } = await mount()
    renderer.scaleWidths.right = 60
    renderer.paneHeights[0] = 300
    renderer.fireCrosshair(BARS[5]!.t, 300, 120)
    expect(container.querySelector<HTMLElement>('.qc-scale-plus')!.hidden).toBe(true)
  })
})

describe('the price and percentage label', () => {
  it('writes a change to two decimals with its sign', () => {
    expect(signedPercentText(0.0008, 'en')).toBe('+0.08%')
    expect(signedPercentText(-0.0123456, 'en')).toBe('-1.23%')
    expect(signedPercentText(0, 'en')).toBe('0.00%')
    expect(signedPercentText(0.5, 'de')).toBe('+50,00%')
  })

  it('stands in for the native label while the previous close is known', async () => {
    const { datafeed, push } = pricedFeed()
    const { chart, renderer } = await mount({ datafeed })
    expect(main(renderer).options.lastValueVisible).toBe(true)
    chart.applySettings({ priceLabels: { symbolValueMode: 'priceAndPercent' } })
    // No previous close yet: the price alone, in the native label.
    expect(main(renderer).options.lastValueVisible).toBe(true)
    push({ previousClose: 4500 })
    expect(main(renderer).options.lastValueVisible).toBe(false)
    chart.applySettings({ priceLabels: { symbolValueMode: 'scale' } })
    expect(main(renderer).options.lastValueVisible).toBe(true)
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
