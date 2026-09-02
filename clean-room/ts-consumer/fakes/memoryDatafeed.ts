// An in-memory ChartDatafeed a consumer owns outright: a small catalog, deterministic bars, paged
// search, resolve, history with both window shapes, live updates, and a server clock. Nothing here
// reaches a network or a trdrs service, which is the point (public-chart-library-boundary-plan.md
// PCL-1: the clean-room consumer supplies its own fake datafeed and storage, never an engine
// adapter). Bars are a pure function of symbol and bucket, so any window asked twice answers the
// same twice and a snapshot never disagrees with history.
import type { ChartDatafeed, DatafeedConfig, FeedBar, HistoryPage, PriceFormat, SearchPage, SubscribeHandlers, SymbolInfo } from 'quickcharts'

interface CatalogRow {
  symbol: string
  name: string
  exchange: string
  type: string
  timezone: string
  session: string
  currencyCode: string
  /** How the symbol writes its prices: the symbology facts the chart formats from. */
  format: PriceFormat
  /** The price the deterministic series is centered on. */
  base: number
}

const CATALOG: readonly CatalogRow[] = [
  { symbol: 'ESZ2026', name: 'E-mini S&P 500 Dec 2026', exchange: 'CME', type: 'futures', timezone: 'America/Chicago', session: '1700-1600:23456', currencyCode: 'USD', format: { pricescale: 100, minmov: 25 }, base: 5000 },
  { symbol: 'EURUSD', name: 'Euro / US Dollar', exchange: 'FX', type: 'fx', timezone: 'America/New_York', session: '1700-1700:23456', currencyCode: 'USD', format: { pricescale: 100000, minmov: 1 }, base: 1.085 },
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', exchange: 'X', type: 'crypto', timezone: 'Etc/UTC', session: '24x7', currencyCode: 'USD', format: { pricescale: 100, minmov: 1 }, base: 65000 },
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', type: 'stock', timezone: 'America/New_York', session: '0930-1600', currencyCode: 'USD', format: { pricescale: 100, minmov: 1 }, base: 190 },
]

/** The smallest price move a row's format declares: the grid its deterministic closes land on. */
const tickOf = (row: CatalogRow): number => row.format.minmov / row.format.pricescale

/** The intervals this feed serves, as wire tokens, and their bucket length in seconds. */
const RESOLUTIONS: Readonly<Record<string, number>> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }

/** Feed inception: no bar exists before this bucket, so a countBack that reaches past it is the
 *  terminal no-more-history answer rather than a fabricated one. */
const ORIGIN = 1_700_000_000

/** A small integer hash, so a bar's noise is a function of (symbol, bucket) and nothing else. */
function hash(symbol: string, i: number): number {
  let h = 2166136261
  for (const ch of `${symbol}#${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return (h >>> 0) / 4294967296
}

/** The close of bucket `i` for a symbol: two slow waves plus bounded noise around the base. */
function closeAt(row: CatalogRow, i: number): number {
  const wave = 0.02 * Math.sin(i / 17) + 0.01 * Math.sin(i / 5)
  const noise = (hash(row.symbol, i) - 0.5) * 0.004
  const raw = row.base * (1 + wave + noise)
  return Math.round(raw / tickOf(row)) * tickOf(row)
}

function barAt(row: CatalogRow, step: number, i: number): FeedBar {
  const o = closeAt(row, i - 1)
  const c = closeAt(row, i)
  const spread = Math.abs(c - o) + tickOf(row) * (1 + Math.floor(hash(row.symbol, i * 7) * 4))
  return {
    t: ORIGIN + i * step,
    o,
    h: Math.max(o, c) + spread * 0.5,
    l: Math.min(o, c) - spread * 0.5,
    c,
    v: 100 + Math.floor(hash(row.symbol, i * 13) * 900),
  }
}

const bucketOf = (t: number, step: number): number => Math.floor((t - ORIGIN) / step)

export interface MemoryDatafeedOptions {
  /** Milliseconds between live updates; 0 disables the timer (snapshots still arrive). */
  liveIntervalMs?: number
  /** The clock, for tests that pin time. Epoch seconds. */
  now?: () => number
}

export function memoryDatafeed(options: MemoryDatafeedOptions = {}): ChartDatafeed {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000))
  const liveIntervalMs = options.liveIntervalMs ?? 1000
  const rowOf = (symbol: string): CatalogRow | null => CATALOG.find((r) => r.symbol === symbol.toUpperCase()) ?? null
  const stepOf = (tf: string): number => {
    const step = RESOLUTIONS[tf]
    if (!step) throw new Error(`memoryDatafeed serves ${Object.keys(RESOLUTIONS).join(', ')}, not ${tf}`)
    return step
  }

  return {
    async config(): Promise<DatafeedConfig> {
      return { resolutions: Object.keys(RESOLUTIONS), classes: ['futures', 'fx', 'crypto', 'stock'] }
    },

    async search(q, opts): Promise<SearchPage> {
      const needle = q.trim().toLowerCase()
      const cls = opts?.cls ?? ''
      const all = CATALOG.filter((r) => (cls === '' || r.type === cls) && (needle === '' || r.symbol.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)))
      const offset = opts?.offset ?? 0
      const limit = opts?.limit ?? 50
      const page = all.slice(offset, offset + limit)
      return { hits: page.map(({ symbol, name, exchange, type }) => ({ symbol, name, exchange, type })), hasMore: offset + page.length < all.length }
    },

    async resolve(symbol): Promise<SymbolInfo | null> {
      const row = rowOf(symbol)
      if (!row) return null
      return {
        ticker: row.symbol,
        name: row.symbol,
        description: row.name,
        exchange: row.exchange,
        listedExchange: row.exchange,
        type: row.type,
        supportedResolutions: Object.keys(RESOLUTIONS),
        timezone: row.timezone,
        session: row.session,
        dataStatus: 'streaming',
        currencyCode: row.currencyCode,
        volumePrecision: 0,
        format: { ...row.format },
      }
    },

    async history(symbol, tf, range): Promise<HistoryPage> {
      const row = rowOf(symbol)
      if (!row) return { bars: [], noData: true }
      const step = stepOf(tf)
      const last = bucketOf(range?.to ?? now(), step)
      let first: number
      if (range?.countBack !== undefined) first = last - range.countBack + 1
      else if (range?.from !== undefined) first = bucketOf(range.from, step)
      else first = last - 300 + 1
      const from = Math.max(0, first)
      const bars: FeedBar[] = []
      for (let i = from; i <= last; i++) bars.push(barAt(row, step, i))
      return { bars, noData: bars.length === 0 && range?.countBack !== undefined }
    },

    subscribeBars(symbol, tf, handlers: SubscribeHandlers) {
      const row = rowOf(symbol)
      const step = stepOf(tf)
      if (!row) {
        handlers.onStatus?.('no-data')
        return () => undefined
      }
      const last = bucketOf(now(), step)
      const snapshot: FeedBar[] = []
      for (let i = Math.max(0, last - 49); i <= last; i++) snapshot.push(barAt(row, step, i))
      handlers.onBars({ kind: 'snapshot', bars: snapshot })
      handlers.onStatus?.('live')
      if (liveIntervalMs <= 0) return () => undefined
      let tick = 0
      const timer = setInterval(() => {
        tick += 1
        const i = bucketOf(now(), step)
        const bar = barAt(row, step, i)
        // A forming bar wobbles inside its own range so the update is visibly live and still
        // deterministic for the tick count.
        const wobble = ((hash(row.symbol, i * 31 + tick) - 0.5) * (bar.h - bar.l)) / 2
        const c = Math.round((bar.c + wobble) / tickOf(row)) * tickOf(row)
        handlers.onBars({ kind: 'bar', bar: { ...bar, c, h: Math.max(bar.h, c), l: Math.min(bar.l, c) } })
      }, liveIntervalMs)
      return () => clearInterval(timer)
    },

    async serverTime(): Promise<number> {
      return now()
    },
  }
}
