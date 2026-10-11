// @vitest-environment happy-dom
// The symbol's live prices: how a delivery merges, where the previous session's close comes from, and
// that the chart holds a subscription exactly while a setting draws the prices.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar, PricesHandlers } from '../../src/datafeed'
import { parseSessionModel } from '../../src/sessionModel'
import type { SymbolInfo } from '../../src/symbology'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { attachPrices, mergePrices, previousCloseFromBars, statedPreviousClose } from '../../src/widget/prices'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

describe('a delivery', () => {
  it('replaces the fields it states and keeps the rest', () => {
    const first = mergePrices(null, { bid: 1, ask: 2, last: 1.5 })
    expect(first).toEqual({ bid: 1, ask: 2, last: 1.5 })
    expect(mergePrices(first, { bid: 1.1, previousClose: 1.4 })).toEqual({ bid: 1.1, ask: 2, last: 1.5, previousClose: 1.4 })
  })

  it('leaves out a field that is not a finite number', () => {
    expect(mergePrices({ bid: 1 }, { bid: Number.NaN, ask: Infinity, last: '3' as unknown as number })).toEqual({ bid: 1 })
  })
})

describe('the previous session close', () => {
  it('is the feed close, or its last less its change', () => {
    expect(statedPreviousClose({ previousClose: 10, last: 12, change: 5 })).toBe(10)
    expect(statedPreviousClose({ last: 12, change: 2 })).toBe(10)
    expect(statedPreviousClose({ last: 12 })).toBeNull()
    expect(statedPreviousClose(null)).toBeNull()
  })

  it('is the bar before the newest on a daily chart', () => {
    const bars: FeedBar[] = [1, 2, 3].map((c, i) => ({ t: i * 86_400, o: c, h: c, l: c, c, v: 0 }))
    expect(previousCloseFromBars(bars, false, null)).toBe(2)
    expect(previousCloseFromBars(bars.slice(0, 1), false, null)).toBeNull()
  })

  it('is the last regular bar of the trading day before the newest on an intraday chart', () => {
    const model = parseSessionModel({
      timezone: 'Etc/UTC',
      session: '1430-2100',
      subsessions: [
        { id: 'regular', session: '1430-2100' },
        { id: 'premarket', session: '0900-1430' },
        { id: 'postmarket', session: '2100-2300' },
      ],
    })!
    const day = Date.UTC(2026, 9, 5) / 1000 // a Monday
    const at = (dayOffset: number, hour: number, c: number): FeedBar => ({ t: day + dayOffset * 86_400 + hour * 3600, o: c, h: c, l: c, c, v: 0 })
    const bars = [at(0, 15, 100), at(0, 20, 101), at(0, 22, 105), at(1, 10, 106), at(1, 15, 107)]
    // The post-market bar at 22:00 is not the close: the last regular bar of Monday is.
    expect(previousCloseFromBars(bars, true, model)).toBe(101)
    expect(previousCloseFromBars(bars.slice(0, 3), true, model)).toBeNull()
    expect(previousCloseFromBars(bars, true, null)).toBeNull()
  })
})

describe('the subscription', () => {
  const plane = (wanted: { on: boolean }, symbol: { at: string }) => {
    const calls: { symbol: string; handlers: PricesHandlers; open: boolean }[] = []
    const datafeed = {
      subscribePrices(s: string, handlers: PricesHandlers) {
        const call = { symbol: s, handlers, open: true }
        calls.push(call)
        return () => {
          call.open = false
        }
      },
    } as unknown as ChartDatafeed
    const changed = vi.fn()
    const prices = attachPrices({ datafeed, symbol: () => symbol.at, wanted: () => wanted.on, changed })
    return { calls, prices, changed }
  }

  it('stands only while wanted, one per symbol, and drops a stale delivery', () => {
    const wanted = { on: false }
    const symbol = { at: 'AAA' }
    const { calls, prices, changed } = plane(wanted, symbol)
    prices.sync()
    expect(calls).toHaveLength(0)
    wanted.on = true
    prices.sync()
    prices.sync()
    expect(calls.map((c) => c.symbol)).toEqual(['AAA'])
    calls[0]!.handlers.onPrices({ bid: 1, ask: 2 })
    expect(prices.current()).toEqual({ bid: 1, ask: 2 })
    expect(changed).toHaveBeenCalledTimes(1)
    symbol.at = 'BBB'
    expect(prices.current()).toBeNull()
    prices.sync()
    expect(calls.map((c) => [c.symbol, c.open])).toEqual([['AAA', false], ['BBB', true]])
    calls[0]!.handlers.onPrices({ bid: 9 })
    expect(prices.current()).toBeNull()
    wanted.on = false
    prices.sync()
    expect(calls[1]!.open).toBe(false)
    prices.destroy()
  })

  it('asks nothing of a feed without the port', () => {
    const prices = attachPrices({ datafeed: {} as ChartDatafeed, symbol: () => 'AAA', wanted: () => true, changed: () => undefined })
    prices.sync()
    expect(prices.current()).toBeNull()
  })
})

describe('on a mounted chart', () => {
  const info: SymbolInfo = {
    ticker: 'ES',
    name: 'ES',
    description: 'E-mini',
    exchange: 'CME',
    listedExchange: 'CME',
    type: 'futures',
    supportedResolutions: [],
    timezone: 'Etc/UTC',
    session: '24x7',
    dataStatus: 'streaming',
    volumePrecision: 0,
    format: { pricescale: 100, minmov: 1 },
  }
  const mounted: ChartWidget[] = []
  afterEach(() => {
    for (const widget of mounted.splice(0)) widget.dispose()
    document.body.replaceChildren()
  })

  it('subscribes while a setting draws the prices, follows the symbol and ends with the chart', async () => {
    const calls: { symbol: string; open: boolean }[] = []
    const datafeed: ChartDatafeed = {
      search: async () => ({ hits: [], hasMore: false }),
      resolve: async () => info,
      history: async () => ({ bars: [{ t: 1_700_000_000, o: 1, h: 1, l: 1, c: 1, v: 0 }], noData: false }),
      subscribeBars: () => () => undefined,
      subscribePrices: (symbol) => {
        const call = { symbol, open: true }
        calls.push(call)
        return () => {
          call.open = false
        }
      },
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { drawings: false, replay: false, compare: false }, ui: { contextMenu: false, topBar: false, bottomBar: false, toasts: false } })
    mounted.push(widget)
    const chart = widget.activeChart()
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
    expect(widget.capabilities().prices).toBe(true)
    expect(calls).toHaveLength(0)
    chart.applySettings({ priceLabels: { bidAskValue: true } })
    expect(calls.map((c) => [c.symbol, c.open])).toEqual([['ES', true]])
    chart.setSymbol('NQ')
    expect(calls.map((c) => [c.symbol, c.open])).toEqual([['ES', false], ['NQ', true]])
    chart.applySettings({ priceLabels: { bidAskValue: false } })
    expect(calls[1]!.open).toBe(false)
    chart.applySettings({ statusLine: { lastDayChange: true } })
    expect(calls.at(-1)).toEqual({ symbol: 'NQ', open: true })
    widget.dispose()
    mounted.length = 0
    expect(calls.every((c) => !c.open)).toBe(true)
  })
})
