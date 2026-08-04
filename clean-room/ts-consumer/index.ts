// The clean-room TS consumer: a fresh project installing the PACKED tarballs (never the workspace
// source) must be able to implement the seams and drive the widget with full types. This file IS
// the gate — `skipLibCheck: false`, so the shipped .d.ts must stand on its own.
import {
  createChart,
  createUdfDatafeed,
  mergeOverrides,
  memoryChartStorage,
  olderPageVerdict,
  resolveInitialTf,
  tfToUdfResolution,
  udfResolutionToTf,
  type ChartBroker,
  type ChartDatafeed,
  type ChartWidgetApi,
  type DatafeedConfig,
  type FeedBar,
  type HistoryPage,
  type SessionClass,
} from '@trdrs/chart'
import { toolRegistry, type SerializedDrawing } from '@trdrs/chart-drawings'

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

// The broker seam type-checks against the real six methods.
const broker: ChartBroker = {
  async moveOrder() {},
  async setExits() {},
  async flatten() {},
  async cancelOrder() {},
  async reversePosition() {
    return { cancelledOrders: 0 }
  },
  async setOrderBracket() {},
}
void broker

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
if (!toolRegistry.get('trend_line')) throw new Error('registry missing trend_line')
const drawing: SerializedDrawing | undefined = undefined
void drawing
