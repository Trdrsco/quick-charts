// A ChartDatafeed over a UDF (Universal Data Feed) HTTP server — the trivial-onboarding adapter. UDF is a
// plain REST protocol (/config, /symbol_info, /search, /symbols, /history, /quotes, /time); anyone with a
// UDF endpoint gets a working chart by pointing this adapter at it, with zero custom code. UDF is
// POLL-based (no push), so live updates poll /history for the newest bar — for true real-time a backend
// implements ChartDatafeed directly (as the engine reference implementation does over SSE). This adapter
// is the low-effort on-ramp.
//
// Conformance posture (the adapter's obligations, not the server's):
//   - /config is fetched ONCE and drives behaviour — search mode (supports_search vs group requests) and
//     the served resolution set. A server without /config gets the protocol's own documented defaults.
//   - A resolution the server does not list is REFUSED with a clear terminal error — never requested
//     anyway (a server may answer a wrong-size bar rather than an error; fail closed beats silently-wrong).
//   - supports_search: false is honoured: the group catalogs (/symbol_info?group=) are fetched once and
//     searched locally, so group-request-only servers work instead of 404ing forever.
//   - `nextTime` on a no_data answer is surfaced (seconds) so scroll-back can jump a gap instead of
//     dead-ending at a market holiday.
//   - The ChartDatafeed window is INCLUSIVE [from, to] while UDF's `to` is EXCLUSIVE — the adapter
//     bridges with `to + 1` so the chart's `to = oldest − 1` paging never silently drops one bar per page.
//
// The bar rules the chart relies on remain the UDF server's responsibility (ascending unique bars,
// countback outranking from); this adapter forwards countback and surfaces the server's `s: "no_data"`
// as the stop-scrolling-back signal. Live polling only ever emits the newest bar, which the chart applies
// as mutate-last-or-append by bucket time.
import { FeedUnavailableError } from './datafeed'
import type { BarsEvent, ChartDatafeed, DatafeedConfig, FeedBar, HistoryPage, QuoteSnapshot, SearchPage, SubscribeHandlers, SymbolInfo, SymbolRow } from './datafeed'

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

/** Canonical spelling of a UDF resolution for EQUALITY: real servers spell one-day as either 'D' or
 *  '1D' (same for W/M/S/T — a bare letter is an implicit count of 1), so both forms normalize to the
 *  digit-prefixed one. Anything else passes through unchanged — this canonicalizes spelling only,
 *  it never reinterprets an unknown token. */
const canonicalResolution = (r: string): string => {
  const t = r.trim()
  return /^[TSDWM]$/.test(t) ? `1${t}` : t
}

/** The inverse of {@link tfToUdfResolution}: a UDF resolution string back to a wire tf token.
 *  Bare numbers are minutes; whole-hour counts ≥ 60 normalize to `<N>h` (the forward map emits hours
 *  AS minutes, so '1h' → '60' → '1h' round-trips); bare 'D'/'W'/'M'/'S'/'T' mean a count of 1. Null
 *  for a resolution the wire tf grammar cannot express — a caller building a capability declaration
 *  OMITS that resolution rather than mis-declaring it (the widget can't do bucket arithmetic on a
 *  token outside the grammar, so it isn't widget-servable even if the server serves it). */
export function udfResolutionToTf(resolution: string): string | null {
  const m = /^(\d+)(T|S|D|W|M)?$/.exec(canonicalResolution(resolution))
  if (!m) return null
  const n = Number(m[1])
  if (!(n > 0)) return null
  switch (m[2]) {
    case 'T':
      return `${n}t`
    case 'S':
      return `${n}s`
    case 'D':
      return `${n}d`
    case 'W':
      return `${n}w`
    case 'M':
      return `${n}mo`
    default:
      return n % 60 === 0 && n >= 60 ? `${n / 60}h` : `${n}m`
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

/** The /config surface this adapter consumes. */
interface UdfConfig {
  supportsSearch: boolean
  supportsGroupRequest: boolean
  /** The server's served resolution strings; empty = the server declared no restriction. */
  supportedResolutions: readonly string[]
  /** Group names for /symbol_info?group= (UDF reuses the exchange list as the group vocabulary). */
  groups: readonly string[]
}

/** Defaults for a server WITHOUT /config. Resolutions are the protocol's own documented defaults.
 *  Search deliberately deviates from the spec's default (`supports_group_request: true`): group mode
 *  needs a group vocabulary, and with no /config there are no exchanges to enumerate — /search is
 *  the only workable path for a config-less server, and it was this adapter's historical behaviour. */
const CONFIGLESS_DEFAULTS: UdfConfig = {
  supportsSearch: true,
  supportsGroupRequest: false,
  supportedResolutions: ['1', '5', '15', '30', '60', '1D', '1W', '1M'],
  groups: [],
}

/** A UDF `nextTime` in seconds. The protocol's own example is milliseconds while its request params are
 *  seconds; real servers ship both. Same magnitude heuristic the rest of the codebase uses. */
const nextTimeSecs = (v: unknown): number | undefined => {
  const n = num(v)
  if (n === null || n <= 0) return undefined
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
}

/** One column of a columnar (response-as-a-table) UDF payload: arrays index per row, scalars apply to
 *  every row. */
const col = (v: unknown, i: number): unknown => (Array.isArray(v) ? v[i] : v)

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

  /** /config, fetched once and cached (a failed fetch = the protocol's config-less defaults; the promise
   *  is NOT cached on failure so a transient blip retries on the next call). */
  let configPromise: Promise<UdfConfig> | null = null
  function udfConfig(): Promise<UdfConfig> {
    configPromise ??= getJson('/config')
      .then((raw) => {
        const r = raw as {
          supports_search?: boolean
          supports_group_request?: boolean
          supported_resolutions?: string[]
          exchanges?: Array<{ value?: string }>
        }
        return {
          supportsSearch: r.supports_search === true,
          supportsGroupRequest: r.supports_group_request === true,
          supportedResolutions: Array.isArray(r.supported_resolutions) ? r.supported_resolutions : [],
          groups: (r.exchanges ?? []).map((e) => e.value ?? '').filter((v) => v !== ''),
        } satisfies UdfConfig
      })
      .catch(() => {
        configPromise = null
        return CONFIGLESS_DEFAULTS
      })
    return configPromise
  }

  /** Refuse a resolution the server did not declare — terminal and precise, because a UDF server asked
   *  for an unlisted resolution may answer a DIFFERENT bar size rather than an error, and a
   *  silently-wrong bar is worse than no bar. An empty declaration = no restriction declared. */
  async function resolutionFor(tf: string): Promise<string> {
    const resolution = tfToUdfResolution(tf)
    const cfg = await udfConfig()
    // Membership is checked on CANONICAL spellings: a server declaring 'D' serves the same resolution
    // as one declaring '1D', and refusing '1D' against a ['D'] declaration would refuse a bar size the
    // server actually serves.
    const declared = cfg.supportedResolutions.map(canonicalResolution)
    if (declared.length > 0 && !declared.includes(canonicalResolution(resolution))) {
      throw new FeedUnavailableError(`udf: resolution ${resolution} (${tf}) is not served by this server (supported: ${cfg.supportedResolutions.join(', ')})`)
    }
    return resolution
  }

  /** Parse a UDF /history payload into a page. `s: "no_data"` → the stop-scrolling-back signal (with the
   *  optional `nextTime` gap hint, normalized to seconds); `s: "error"` throws (a retryable
   *  transport-level failure); `s: "ok"` zips the parallel OHLCV arrays into bars. */
  function parseHistory(raw: unknown): HistoryPage {
    const r = raw as { s?: string; t?: number[]; o?: number[]; h?: number[]; l?: number[]; c?: number[]; v?: number[]; errmsg?: string; nextTime?: number }
    if (r.s === 'no_data') {
      const nextTime = nextTimeSecs(r.nextTime)
      return nextTime === undefined ? { bars: [], noData: true } : { bars: [], noData: false, nextTime }
    }
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
    const resolution = await resolutionFor(tf)
    const to = range?.to ?? Math.floor(Date.now() / 1000)
    // The ChartDatafeed window is INCLUSIVE of `to`; UDF's `to` is EXCLUSIVE ("rightmost, not
    // inclusive"). Bridge with +1 so the chart's `to = oldest − 1` paging never drops the boundary
    // bar — without this, every scroll-back page silently loses one bar at the seam.
    const params = new URLSearchParams({ symbol, resolution, to: String(to + 1) })
    if (range?.countBack != null) params.set('countback', String(range.countBack))
    else params.set('from', String(range?.from ?? to - 86_400))
    return parseHistory(await getJson(`/history?${params.toString()}`))
  }

  /** The group catalogs (/symbol_info?group=) fetched once and flattened — the search source for a
   *  supports_search: false server. Columnar payloads: array fields index per row, scalars broadcast. */
  let groupCatalogPromise: Promise<SymbolRow[]> | null = null
  function groupCatalog(): Promise<SymbolRow[]> {
    groupCatalogPromise ??= (async () => {
      const cfg = await udfConfig()
      if (cfg.groups.length === 0) {
        throw new Error('udf: this server requires group requests (supports_search: false) but /config lists no exchanges to enumerate')
      }
      const rows: SymbolRow[] = []
      for (const group of cfg.groups) {
        const raw = (await getJson(`/symbol_info?group=${encodeURIComponent(group)}`)) as Record<string, unknown>
        const symbols = Array.isArray(raw.symbol) ? (raw.symbol as unknown[]) : []
        for (let i = 0; i < symbols.length; i++) {
          const symbol = String(col(raw.ticker, i) ?? col(raw.symbol, i) ?? '')
          if (!symbol) continue
          rows.push({
            symbol,
            name: String(col(raw.description, i) ?? symbol),
            exchange: String(col(raw['exchange-listed'], i) ?? group),
            type: String(col(raw.type, i) ?? ''),
            provider: null,
            via: null,
          })
        }
      }
      return rows
    })()
    // A failed catalog fetch retries on the next search rather than pinning the failure.
    void groupCatalogPromise.catch(() => {
      groupCatalogPromise = null
    })
    return groupCatalogPromise
  }

  return {
    /** Feed-level capability declaration: the server's /config resolutions mapped back to wire tf
     *  tokens (a config-less server declares the protocol's defaults, because {@link resolutionFor}
     *  enforces exactly those). The guarantee a consumer leans on is one-directional — every token
     *  DECLARED here is one resolutionFor will accept — so a widget opening on a declared token can
     *  never be refused. A resolution the tf grammar can't express is omitted rather than
     *  mis-declared, and an empty (or entirely unmappable) declaration constrains nothing (`{}`). */
    async config(): Promise<DatafeedConfig> {
      const cfg = await udfConfig()
      const resolutions = cfg.supportedResolutions.map(udfResolutionToTf).filter((tf): tf is string => tf !== null)
      return resolutions.length > 0 ? { resolutions } : {}
    },

    async search(q, opts): Promise<SearchPage> {
      const cfg = await udfConfig()
      const limit = opts?.limit ?? 50
      const offset = opts?.offset ?? 0
      if (!cfg.supportsSearch) {
        // Group-request mode: search the flattened catalogs locally — with REAL paging and an exact
        // hasMore, which /search itself could never give.
        const needle = q.trim().toUpperCase()
        const all = (await groupCatalog()).filter(
          (r) =>
            (needle === '' || r.symbol.toUpperCase().includes(needle) || r.name.toUpperCase().includes(needle)) &&
            (!opts?.cls || r.type === opts.cls),
        )
        return { hits: all.slice(offset, offset + limit), hasMore: all.length > offset + limit }
      }
      // /search returns a flat capped list with no cursor; page 2+ (offset > 0) is empty, hasMore false.
      if (offset > 0) return { hits: [], hasMore: false }
      const params = new URLSearchParams({ query: q, limit: String(limit) })
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
