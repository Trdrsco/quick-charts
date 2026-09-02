// The clean-room TS consumer: a fresh project installing the PACKED tarballs (never the workspace
// source) must be able to implement the seams and drive the widget with full types. This file IS
// the gate — `skipLibCheck: false`, so the shipped .d.ts must stand on its own.
import {
  attachDrawings,
  buildManifestPlots,
  createChart,
  createUdfDatafeed,
  manifestInputDefaults,
  mergeOverrides,
  memoryChartStorage,
  olderPageVerdict,
  placeableByWidget,
  resolveInitialTf,
  tfToUdfResolution,
  udfResolutionToTf,
  type ChartDatafeed,
  type ChartWidgetApi,
  type DatafeedConfig,
  type DrawingsHandle,
  type FeedBar,
  type HistoryPage,
  type IndicatorDefinition,
  type SessionClass,
} from 'quickcharts'
import type { AccountSnapshot, BrokerAdapter, TradingAdapter, TradingCapabilities } from '@trdrs/broker'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { parseDrawingsStore, serializeDrawingsStore, toolRegistry, type SerializedDrawing } from '@trdrs/chart-drawings'
import { memoryDatafeed } from './fakes/memoryDatafeed'
import { memorySaveLoad, memoryStorage } from './fakes/memorySaveLoad'

// THE FREE-CHART PATH (public-chart-library-boundary-plan.md PCL-1): the chart mounted over ONLY
// consumer-owned fakes. No engine adapter, no trading plane, no account panel, no quote surface:
// a datafeed, a settings store, and a save/load adapter the consumer wrote against the shipped
// d.ts. This is the boundary a Quick Charts consumer lives on; mode-b.ts and ticket.ts are the
// private product consumers and are not this.
export function mountFreeChart(el: HTMLElement): ChartWidgetApi {
  return createChart({
    container: el,
    datafeed: memoryDatafeed(),
    storage: memoryStorage(),
    saveLoad: memorySaveLoad(),
    symbol: 'ESZ2026',
    timeframe: '5m',
  })
}

// The fakes' pure surface types end-to-end against the shipped contract: a countBack window, a
// [from, to] window, the terminal no-data answer, paged search with an exact hasMore, resolve,
// the server clock, and a save/load round trip. Not executed here (node has no DOM for the
// widget; the render smoke covers it), but every call below must type-check as a consumer's would.
export async function exerciseFakes(): Promise<void> {
  const feed = memoryDatafeed({ liveIntervalMs: 0, now: () => 1_700_000_000 + 3600 * 24 })
  const config = await feed.config?.()
  if (!config?.resolutions?.includes('5m')) throw new Error('the fake feed must serve 5m')
  const info = await feed.resolve('ESZ2026')
  if (info?.tick !== 0.25) throw new Error('unexpected tick')
  const tail = await feed.history('ESZ2026', '5m', { countBack: 10 })
  if (tail.bars.length !== 10 || tail.noData) throw new Error('countBack must answer exactly the asked bars')
  const window = await feed.history('ESZ2026', '1h', { from: 1_700_000_000, to: 1_700_000_000 + 3600 * 5 })
  if (window.bars.length !== 6) throw new Error('an inclusive window must answer both ends')
  const beforeInception = await feed.history('ESZ2026', '1d', { to: 1_600_000_000, countBack: 5 })
  if (!beforeInception.noData) throw new Error('a countBack past inception is the terminal answer')
  const page = await feed.search('usd', { limit: 1 })
  if (page.hits.length !== 1 || !page.hasMore) throw new Error('hasMore is exact')
  const clock = await feed.serverTime?.()
  if (clock === undefined) throw new Error('the fake feed has a clock')
  const unsubscribe = feed.subscribeBars('ESZ2026', '5m', { onBars: () => undefined })
  unsubscribe()

  const saveLoad = memorySaveLoad({ clock: () => 1 })
  const id = await saveLoad.saveChart({ name: 'Morning', symbol: 'ESZ2026', timeframe: '5m', content: '{}' })
  if ((await saveLoad.loadChart(id)) !== '{}') throw new Error('a saved chart loads back')
  if ((await saveLoad.listCharts())[0]?.name !== 'Morning') throw new Error('a saved chart lists')
  await saveLoad.saveDrawings({ symbol: 'ESZ2026' }, '[]')
  if ((await saveLoad.loadDrawings({ symbol: 'ESZ2026' })) !== '[]') throw new Error('drawings are symbol-scoped')
  await saveLoad.templates('study').save('Bands', '{}')
  if ((await saveLoad.templates('study').load('Bands')) !== '{}') throw new Error('a template loads back')
  saveLoad.settings.set('k', 'v')
  if (saveLoad.settings.get('k') !== 'v') throw new Error('settings persist for the session')
}

// A complete typed datafeed — the seam a licensee actually implements.
const feed: ChartDatafeed = {
  async config(): Promise<DatafeedConfig> {
    return { resolutions: ['1m', '1h'], quotes: false }
  },
  async search(q) {
    return { hits: [{ symbol: q.toUpperCase(), name: 'Stub', exchange: 'X', type: 'crypto' }], hasMore: false }
  },
  async resolve(symbol) {
    const sessionClass: SessionClass = 'crypto'
    return { symbol, name: 'Stub', exchange: 'X', type: 'crypto', provider: null, via: null, tick: 0.5, pricePrecision: 1, quotes: false, sessionClass }
  },
  async history(): Promise<HistoryPage> {
    const bars: FeedBar[] = [{ t: 60, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }]
    return { bars, noData: false }
  },
  subscribeBars() {
    return () => undefined
  },
}

// The broker seam type-checks against the real seven methods (four required, three optional).
const broker: BrokerAdapter = {
  async moveOrder() {},
  async setExits() {},
  async flatten() {},
  async cancelOrder() {},
  async reversePosition() {
    return { cancelledOrders: 0 }
  },
  async setOrderBracket() {},
  // A placement answers with what the venue accepted — the ticket reports the id and the fill.
  async placeOrder(args) {
    return { brokerOrderId: `stub-${args.intentKey}`, filledQty: 0, avgFillPrice: null }
  },
}
void broker

// The trading plane types end-to-end: adapter + full account snapshot + declared capabilities.
const trading: TradingAdapter = {
  broker,
  subscribeAccount(handlers) {
    const snapshot: AccountSnapshot = { scope: 'x|1', positions: [], orders: [], currency: 'USD' }
    handlers.onSnapshot(snapshot)
    return () => undefined
  },
  async capabilities(): Promise<TradingCapabilities> {
    return { exits: true, orderBracketTypes: ['limit'] }
  },
}
void trading

// Widget construction types (not executed here — node has no DOM; the render smoke covers that).
export function mount(el: HTMLElement): ChartWidgetApi {
  return createChart({ container: el, datafeed: feed, storage: memoryChartStorage(), symbol: 'BTC', timeframe: '1m', theme: mergeOverrides(null).appearance ? { mode: 'dark' } : undefined })
}

// Pure exports execute under types too.
const verdict = olderPageVerdict({ bars: [], noData: true }, 100, false)
if (verdict.kind !== 'end') throw new Error('unexpected verdict')
const udf = createUdfDatafeed({ baseUrl: 'https://example.test/udf' })
void udf
if (tfToUdfResolution('1h') !== '60') throw new Error('unexpected resolution mapping')
if (udfResolutionToTf('D') !== '1d') throw new Error('unexpected inverse resolution mapping')
if (resolveInitialTf('3m', ['1m', '4h']) !== '1m') throw new Error('unexpected initial-tf resolution')
if (!placeableByWidget('trend_line') || placeableByWidget('brush')) throw new Error('unexpected widget placeability')

// The drawing layer types against a real chart/series pair (construction is DOM-bound; the render
// smoke executes it) and the persisted store document round-trips through the shared codec.
export function mountDrawingLayer(el: HTMLElement, chartApi: IChartApi, series: ISeriesApi<'Candlestick'>): DrawingsHandle {
  return attachDrawings({ chart: chartApi, series, container: el, symbol: 'BTC', storage: memoryChartStorage() })
}
const storeDoc: Record<string, SerializedDrawing[]> = parseDrawingsStore(serializeDrawingsStore({}))
if (Object.keys(storeDoc).length !== 0) throw new Error('unexpected store round-trip')

// An indicator definition types against the shipped manifest model and walks through the shipped
// pipeline — the exact shape a licensee registers via ChartWidgetOptions.indicators.
const closeLine: IndicatorDefinition = {
  manifest: { name: 'Close', pane: 'overlay', plots: { close: { kind: 'line' } } },
  compute: (feedBars) => ({ close: feedBars.map((b) => b.c) }),
}
const builtSpec = buildManifestPlots(
  { manifest: closeLine.manifest, plots: closeLine.compute([{ t: 60, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }], manifestInputDefaults(closeLine.manifest)) },
  [60 as UTCTimestamp],
  'Close',
  '#4c98fb',
)
if (builtSpec.plots[0]?.type !== 'line') throw new Error('unexpected walked plot kind')
if (!toolRegistry.get('trend_line')) throw new Error('registry missing trend_line')
const drawing: SerializedDrawing | undefined = undefined
void drawing
