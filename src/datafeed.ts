// The chart's datafeed contract — the seam between the charting UI and ANY market-data backend. Every
// chart-side consumer (the price pane, symbol search, symbol metadata, the countdown, the quote board)
// speaks THIS interface and never a concrete client, so a third party can drive the chart from their own
// feed by implementing one object: the chart is the product, a backend is the implementation. Types are
// self-contained on purpose — the interface must not drag a backend SDK into the chart's dependency
// surface.

/** One OHLCV bar on the wire: `t` = epoch SECONDS at bucket open (never milliseconds, never an
 *  update's wall time), strictly ascending within any batch, one bar per timestamp. */
export interface FeedBar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** A symbol-search result row. `provider`/`via` carry the data-source truth a UI may attribute —
 *  a row names a provider ONLY when that provider actually publishes the symbol's data. */
export interface SymbolRow {
  symbol: string
  name: string
  exchange: string
  type: string
  provider?: string | null
  via?: string | null
}

export interface SearchPage {
  hits: SymbolRow[]
  /** Exact: another page exists at offset + hits.length (never a guess at a page boundary). */
  hasMore: boolean
}

/** Resolved metadata for ONE symbol — display identity + price format + feed capability. */
export interface SymbolInfo {
  symbol: string
  name: string
  exchange: string
  type: string
  provider: string | null
  via: string | null
  /** Minimum price increment, or null when the feed doesn't know it (the chart then derives
   *  display precision from price magnitude). */
  tick: number | null
  /** Decimal places for price labels, or null (derive from magnitude). */
  pricePrecision: number | null
  /** Whether the serving feed exposes a real L1 (top-of-book) quote surface for this symbol. */
  quotes: boolean
}

export interface HistoryPage {
  bars: FeedBar[]
  /** True when a countBack ask found NOTHING — the "no more history, stop scrolling back" signal.
   *  Plain from/to asks never set it (an empty window can be a mid-history gap). */
  noData: boolean
  /** OPTIONAL gap hint on an EMPTY page that is not the end of history: the epoch-seconds time of
   *  the closest bar older than the asked window (a market holiday between `to` and the data).
   *  A consumer may retry ONCE with `to = nextTime` to jump the gap instead of dead-ending —
   *  {@link olderPageVerdict} is that rule. Feeds without the concept simply never set it. */
  nextTime?: number
}

export type OlderPageVerdict = { kind: 'bars' } | { kind: 'hop'; to: number } | { kind: 'end' } | { kind: 'stop' }

/** The one scroll-back rule for an older-history page, shared by every paging consumer so the gap
 *  semantics can't drift between them:
 *  - `bars` — the page has data; prepend it (bars are never discarded, whatever flags ride along).
 *  - `hop` — empty but `nextTime` points strictly older and this ask wasn't already a hop: re-ask
 *    once anchored there (the session-gap answer). One hop per gap keeps a lying feed bounded —
 *    an honest hint names a real bar, so the hop can't come back empty.
 *  - `end` — empty, `noData`, and no hint: feed inception, the one verdict that seals scroll-back.
 *  - `stop` — every other empty page (a transient, or an unusable hint): end this flight WITHOUT
 *    sealing; the next gesture asks again. */
export function olderPageVerdict(page: HistoryPage, askedTo: number, alreadyHopped: boolean): OlderPageVerdict {
  if (page.bars.length > 0) return { kind: 'bars' }
  if (page.nextTime !== undefined && page.nextTime < askedTo && !alreadyHopped) return { kind: 'hop', to: page.nextTime }
  return page.noData && page.nextTime === undefined ? { kind: 'end' } : { kind: 'stop' }
}

/** A batch quote snapshot for ONE symbol — the scalar last/session/change values a quote board renders
 *  (the analog of the reference datafeed's quote API). Every price field is `number | null`: null (render
 *  '-') when the feed has no data for the symbol, NEVER synthesized. `spark` is a recent-closes series for
 *  a mini sparkline — a convenience an implementation may leave empty. */
export interface QuoteSnapshot {
  symbol: string
  last: number | null
  open: number | null
  high: number | null
  low: number | null
  prevClose: number | null
  volume: number | null
  change: number | null
  changePct: number | null
  spark: number[]
}

/** Push events from a live bar subscription. A `snapshot` REPLACES the recent window (delivered on
 *  connect and on every transport reconnect — the feed's self-healing re-sync); a `bar` mutates the
 *  last bar or appends the next one (bucket-open time). */
export type BarsEvent = { kind: 'snapshot'; bars: FeedBar[] } | { kind: 'bar'; bar: FeedBar }

export interface SubscribeHandlers {
  onBars(e: BarsEvent): void
  /** REAL top-of-book bid/ask only — a feed with no L1 for the symbol never calls this (the UI
   *  shows '-'); prices are never synthesized. */
  onQuote?(bid: number, ask: number): void
  /** Feed status codes: 'live' | 'no-data' | server codes ('not_entitled', 'feed_down', …). */
  onStatus?(status: string): void
}

/** Thrown by `history` when the backend has NO feed configured for the symbol — a TERMINAL state
 *  (the chart shows "market data unavailable" and closes the live subscription), unlike a transient
 *  fetch failure which is retried. */
export class FeedUnavailableError extends Error {
  constructor(message = 'market data unavailable') {
    super(message)
    this.name = 'FeedUnavailableError'
  }
}

/** The datafeed a chart consumes. Implementations must follow the bar rules on {@link FeedBar} and
 *  {@link BarsEvent}; everything else (transport, caching, auth) is the implementation's business. */
export interface ChartDatafeed {
  /** Server-side symbol search, paged. `cls` narrows to one asset class ('' / absent = all). */
  search(q: string, opts?: { cls?: string; limit?: number; offset?: number }): Promise<SearchPage>
  /** Resolve one symbol's metadata; null when the symbol is unknown to the feed's catalogs. */
  resolve(symbol: string): Promise<SymbolInfo | null>
  /** Historical sealed bars: a [from,to] window (epoch seconds, INCLUSIVE of both ends — the chart
   *  pages with `to = oldest − 1` and never re-requests a bar it holds), or `countBack` = the LAST
   *  N bars at/before `to` (outranks `from`; the count is an obligation — reach across closures).
   *  No range = the feed's default recent window. Throws {@link FeedUnavailableError} when no feed
   *  serves the symbol. */
  history(symbol: string, tf: string, range?: { from?: number; to?: number; countBack?: number }): Promise<HistoryPage>
  /** Live bar/quote push for one (symbol, timeframe). Returns the unsubscribe. The transport owns
   *  reconnection and re-syncs by emitting a fresh `snapshot`. */
  subscribeBars(symbol: string, tf: string, handlers: SubscribeHandlers): () => void
  /** Server clock (epoch seconds) — countdown skew correction. Optional: a feed without one leaves
   *  the chart on the client clock. */
  serverTime?(): Promise<number>
  /** Batch quote board: one {@link QuoteSnapshot} per requested symbol, in request order. Optional — a
   *  feed with no quote surface omits it (a board then shows '-'). The analog of the reference datafeed's
   *  quote API; drives a watchlist without per-symbol history polling. */
  getQuotes?(symbols: string[]): Promise<QuoteSnapshot[]>
}
