// A ChartDatafeed over a UDF (Universal Data Feed) HTTP server — the trivial-onboarding adapter. UDF is a
// plain REST protocol (/config, /search, /symbols, /history, /quotes, /time); anyone with a UDF endpoint
// gets a working chart by pointing this adapter at it, with zero custom code. UDF is POLL-based (no push),
// so live updates poll /history for the newest bar — for true real-time a backend implements ChartDatafeed
// directly (as the engine reference implementation does over SSE). This adapter is the low-effort on-ramp.
//
// The bar rules the chart relies on are the UDF server's responsibility (ascending unique bars, [from,to)
// right-exclusivity, countBack outranking from); this adapter forwards countback and surfaces the server's
// `s: "no_data"` as the stop-scrolling-back signal. Live polling only ever emits the newest bar, which the
// chart applies as mutate-last-or-append by bucket time.
import type { BarsEvent, ChartDatafeed, FeedBar, HistoryPage, QuoteSnapshot, SearchPage, SubscribeHandlers, SymbolInfo, SymbolRow } from './datafeed'

/** The subset of `fetch` this adapter uses — kept minimal so the package stays DOM-independent and a
 *  test can drive it with a plain fake. The global `fetch` satisfies it. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

export interface UdfDatafeedOptions {
  /** UDF server base URL, e.g. `https://feed.example.com/udf` (no trailing slash needed). */
  baseUrl: string
  /** Injected fetch — defaults to the global. Provide one in tests or to add auth headers via a wrapper. */
  fetch?: FetchLike
  /** Live-poll cadence in ms for `subscribeBars` (UDF has no push). Default 10s, the UDF norm. */
  pollMs?: number
  /** Bars pulled for the initial live snapshot. Default 300. */
  snapshotBars?: number
}

/** Map a `<N><unit>` timeframe token to a UDF resolution string: seconds `<N>S`, minutes `<N>`, hours as
 *  minutes (`<N*60>`, the classic UDF intraday encoding), day/week/month `<N>D`/`<N>W`/`<N>M`, ticks
 *  `<N>T`. An unrecognized token falls through as-is (a custom server may accept it). */
export function tfToUdfResolution(tf: string): string {
  const m = /^(\d+)(t|s|m|h|d|w|mo)$/.exec(tf)
  if (!m) return tf
  const n = Number(m[1])
  switch (m[2]) {
    case 't':
      return `${n}T`
    case 's':
      return `${n}S`
    case 'm':
      return `${n}`
    case 'h':
      return `${n * 60}`
    case 'd':
      return `${n}D`
    case 'w':
      return `${n}W`
    case 'mo':
      return `${n}M`
    default:
      return tf
  }
}

/** Decimal places implied by a UDF `pricescale` that is a power of ten (100 → 2); null otherwise (the
 *  chart then derives precision from price magnitude). */
function decimalsOfPriceScale(pricescale: number): number | null {
  if (!Number.isFinite(pricescale) || pricescale <= 0) return null
  const log = Math.log10(pricescale)
  return Number.isInteger(log) ? log : null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A ChartDatafeed backed by a UDF server. */
export function createUdfDatafeed(options: UdfDatafeedOptions): ChartDatafeed {
  const base = options.baseUrl.replace(/\/$/, '')
  const doFetch: FetchLike = options.fetch ?? ((url) => fetch(url) as unknown as ReturnType<FetchLike>)
  const pollMs = options.pollMs ?? 10_000
  const snapshotBars = options.snapshotBars ?? 300

  async function getJson(path: string): Promise<unknown> {
    const res = await doFetch(`${base}${path}`)
    if (!res.ok) throw new Error(`udf ${path} → HTTP ${res.status}`)
    return res.json()
  }

  /** Parse a UDF /history payload into a page. `s: "no_data"` → the stop-scrolling-back signal; `s: "error"`
   *  throws (a retryable transport-level failure); `s: "ok"` zips the parallel OHLCV arrays into bars. */
  function parseHistory(raw: unknown): HistoryPage {
    const r = raw as { s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; errmsg?: string }
    if (r.s === 'no_data') return { bars: [], noData: true }
    if (r.s !== 'ok') throw new Error(`udf history: ${r.errmsg ?? r.s ?? 'malformed'}`)
    const t = r.t ?? []
    const bars: FeedBar[] = t.map((time, i) => ({
      t: time,
      o: r.o?.[i] ?? 0,
      h: r.h?.[i] ?? 0,
      l: r.l?.[i] ?? 0,
      c: r.c?.[i] ?? 0,
      v: r.v?.[i] ?? 0,
    }))
    return { bars, noData: false }
  }

  async function history(symbol: string, tf: string, range?: { from?: number; to?: number; countBack?: number }): Promise<HistoryPage> {
    const resolution = tfToUdfResolution(tf)
    const to = range?.to ?? Math.floor(Date.now() / 1000)
    const params = new URLSearchParams({ symbol, resolution, to: String(to) })
    if (range?.countBack != null) params.set('countback', String(range.countBack))
    else params.set('from', String(range?.from ?? to - 86_400))
    return parseHistory(await getJson(`/history?${params.toString()}`))
  }

  return {
    async search(q, opts): Promise<SearchPage> {
      // UDF /search returns a flat capped list with no cursor; page 2+ (offset > 0) is empty, hasMore false.
      if (opts?.offset && opts.offset > 0) return { hits: [], hasMore: false }
      const params = new URLSearchParams({ query: q, limit: String(opts?.limit ?? 50) })
      if (opts?.cls) params.set('type', opts.cls)
      const raw = (await getJson(`/search?${params.toString()}`)) as Array<{ symbol?: string; full_name?: string; description?: string; exchange?: string; type?: string }>
      const hits: SymbolRow[] = (Array.isArray(raw) ? raw : []).map((r) => ({
        symbol: r.symbol ?? r.full_name ?? '',
        name: r.description ?? r.symbol ?? '',
        exchange: r.exchange ?? '',
        type: r.type ?? '',
        provider: null,
        via: null,
      }))
      return { hits, hasMore: false }
    },

    async resolve(symbol): Promise<SymbolInfo | null> {
      let raw: { name?: string; ticker?: string; description?: string; exchange?: string; type?: string; pricescale?: number; minmov?: number; has_no_volume?: boolean; s?: string }
      try {
        raw = (await getJson(`/symbols?symbol=${encodeURIComponent(symbol)}`)) as typeof raw
      } catch {
        return null // UDF answers an unknown symbol with a non-2xx or an error object — treat as unresolved
      }
      if (!raw || raw.s === 'error' || !(raw.name || raw.ticker)) return null
      const pricescale = raw.pricescale ?? 0
      const minmov = raw.minmov ?? 1
      const tick = pricescale > 0 ? minmov / pricescale : null
      return {
        symbol: raw.ticker ?? raw.name ?? symbol,
        name: raw.description ?? raw.name ?? symbol,
        exchange: raw.exchange ?? '',
        type: raw.type ?? '',
        provider: null, // UDF carries no per-row provider truth
        via: null,
        tick,
        pricePrecision: decimalsOfPriceScale(pricescale),
        quotes: false, // a UDF server may serve /quotes, but not per-symbol L1 capability — never assume it
      }
    },

    history,

    subscribeBars(symbol, tf, handlers: SubscribeHandlers): () => void {
      let stopped = false
      let timer: ReturnType<typeof setInterval> | null = null
      // Initial snapshot, then poll the tail for the newest bar (UDF has no push).
      void history(symbol, tf, { countBack: snapshotBars })
        .then((page) => {
          if (stopped) return
          handlers.onBars({ kind: 'snapshot', bars: page.bars } satisfies BarsEvent)
          handlers.onStatus?.(page.noData ? 'no-data' : 'live')
          timer = setInterval(() => {
            void history(symbol, tf, { countBack: 2 })
              .then((tail) => {
                if (stopped) return
                const last = tail.bars[tail.bars.length - 1]
                if (last) handlers.onBars({ kind: 'bar', bar: last } satisfies BarsEvent)
              })
              .catch(() => {
                /* transient poll failure — the next tick retries */
              })
          }, pollMs)
        })
        .catch((e) => {
          if (!stopped) handlers.onStatus?.(e instanceof Error ? e.message : 'error')
        })
      return () => {
        stopped = true
        if (timer) clearInterval(timer)
      }
    },

    async serverTime(): Promise<number> {
      const res = await doFetch(`${base}/time`)
      if (!res.ok) throw new Error(`udf /time → HTTP ${res.status}`)
      return Math.floor(Number(await res.text()))
    },

    async getQuotes(symbols): Promise<QuoteSnapshot[]> {
      if (symbols.length === 0) return []
      const raw = (await getJson(`/quotes?symbols=${encodeURIComponent(symbols.join(','))}`)) as {
        s?: string
        d?: Array<{ n?: string; s?: string; v?: Record<string, unknown> }>
      }
      const byName = new Map<string, Record<string, unknown>>()
      for (const row of raw.d ?? []) if (row.n && row.v) byName.set(row.n, row.v)
      // Echo one snapshot per REQUESTED symbol, in request order (a symbol the server omits → all-null).
      // Prefer the server's ch/chp; derive them from last/prevClose when the server leaves them out.
      return symbols.map((sym) => {
        const v = byName.get(sym)
        const last = v ? num(v.lp) : null
        const prevClose = v ? num(v.prev_close_price) : null
        const change = v ? (num(v.ch) ?? (last != null && prevClose != null ? last - prevClose : null)) : null
        const changePct = v ? (num(v.chp) ?? (change != null && prevClose ? (change / prevClose) * 100 : null)) : null
        return {
          symbol: sym,
          last,
          open: v ? num(v.open_price) : null,
          high: v ? num(v.high_price) : null,
          low: v ? num(v.low_price) : null,
          prevClose,
          volume: v ? num(v.volume) : null,
          change,
          changePct,
          spark: [], // UDF quotes carry no history series
        }
      })
    },
  }
}
