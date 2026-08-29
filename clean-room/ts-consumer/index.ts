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
} from '@trdrs/chart'
import type { AccountSnapshot, BrokerAdapter, TradingAdapter, TradingCapabilities } from '@trdrs/broker'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { parseDrawingsStore, serializeDrawingsStore, toolRegistry, type SerializedDrawing } from '@trdrs/chart-drawings'

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
  async placeOrder() {},
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
