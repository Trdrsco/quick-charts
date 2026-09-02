// Symbol search, framework-free: the controller every search surface drives (debounce, a
// session cache by query and class, stale-while-revalidate, paging with de-duplication, cancel on
// a newer query, prefetch), the recents port a host backs with its own storage, and the pure rules
// a result list applies (the recents promotion, the match highlight, and the spread-expression
// offer). The datafeed's `search` is the only source; the chart never caches across sessions or
// invents a row.
import type { ChartDatafeed, SymbolRow } from './datafeed'
import type { ChartMessageKey } from './i18n/en'

export interface SearchControllerOptions {
  /** Rows per server page. Default 50. */
  pageSize?: number
  /** The pause after the last keystroke before a query reaches the feed. Default 200 ms. */
  debounceMs?: number
}

export interface SearchState {
  readonly query: string
  /** The asset-class filter the feed narrowed to; '' is every class. */
  readonly cls: string
  /** Every row loaded so far for the query, in the feed's order. */
  readonly hits: readonly SymbolRow[]
  /** A page for THIS query is in flight and nothing cached answers it yet. Rows of the previous
   *  query stay on screen meanwhile, so a list morphs rather than blanks. */
  readonly loading: boolean
  /** The last page for this query failed and nothing cached answers it. */
  readonly failed: boolean
  /** Exact: another page exists after `hits`. */
  readonly hasMore: boolean
}

export interface SearchController {
  state(): SearchState
  /** Hear every state change. Returns the unsubscribe. */
  subscribe(listener: (state: SearchState) => void): () => void
  /** Ask for a query. A cached answer shows at once and a single-page entry revalidates in the
   *  background; a miss keeps the previous rows, marks loading, and fetches after the debounce.
   *  A newer query cancels an older one's result. */
  search(query: string, cls?: string): void
  /** Append the next page of the current query while `hasMore` holds. One page in flight at a
   *  time; rows already shown are never repeated even when a revalidation shifted a page edge. */
  loadMore(): void
  /** Warm the cache for a query without changing the current one, so its first open is instant.
   *  A failure is dropped; the query fetches on open as it would have. */
  prefetch(query?: string, cls?: string): void
  /** Stop timers; later results are ignored. */
  dispose(): void
}

interface Loaded {
  readonly hits: readonly SymbolRow[]
  readonly hasMore: boolean
}

const keyOf = (query: string, cls: string): string => `${cls}::${query.trim().toLowerCase()}`
const hitKey = (h: SymbolRow): string => `${h.symbol}|${h.exchange}`

export function createSearchController(datafeed: Pick<ChartDatafeed, 'search'>, options: SearchControllerOptions = {}): SearchController {
  const pageSize = options.pageSize ?? 50
  const debounceMs = options.debounceMs ?? 200
  // The cache lives for the controller's lifetime and is keyed by the normalized (class, query)
  // pair. An entry the user has paged DEEPER than one page is never revalidated: a page-0 refetch
  // would truncate what they scrolled to.
  const cache = new Map<string, Loaded>()
  // One first-page ask in flight per key: a prefetch and a search for the same query share it.
  const inflight = new Map<string, Promise<Loaded>>()
  const listeners = new Set<(state: SearchState) => void>()
  let state: SearchState = { query: '', cls: '', hits: [], loading: false, failed: false, hasMore: false }
  let key = keyOf('', '')
  let timer: ReturnType<typeof setTimeout> | undefined
  let moreBusy = false
  let disposed = false

  const emit = (next: Partial<SearchState>) => {
    state = { ...state, ...next }
    for (const l of listeners) l(state)
  }

  const load = (k: string, query: string, cls: string): Promise<Loaded> => {
    const pending = inflight.get(k)
    if (pending) return pending
    const ask = datafeed
      .search(query, { limit: pageSize, cls: cls || undefined })
      .then(({ hits, hasMore }) => {
        const loaded = { hits, hasMore }
        cache.set(k, loaded)
        return loaded
      })
      .finally(() => {
        inflight.delete(k)
      })
    inflight.set(k, ask)
    return ask
  }

  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    search(query, cls = '') {
      if (disposed) return
      clearTimeout(timer)
      key = keyOf(query, cls)
      const mine = key
      const cached = cache.get(key)
      if (cached) {
        emit({ query, cls, hits: cached.hits, hasMore: cached.hasMore, loading: false, failed: false })
        if (cached.hits.length > pageSize) return
      } else {
        emit({ query, cls, loading: true, failed: false })
      }
      timer = setTimeout(() => {
        load(mine, query, cls)
          .then((loaded) => {
            if (disposed || key !== mine) return
            emit({ hits: loaded.hits, hasMore: loaded.hasMore, loading: false, failed: false })
          })
          .catch(() => {
            if (disposed || key !== mine) return
            // A failure only surfaces when nothing cached stands in for it.
            if (cache.has(mine)) emit({ loading: false })
            else emit({ hits: [], hasMore: false, loading: false, failed: true })
          })
      }, debounceMs)
    },
    loadMore() {
      if (disposed) return
      const mine = key
      const current = cache.get(mine) ?? state
      if (!current.hasMore || current.hits.length === 0 || moreBusy) return
      moreBusy = true
      const { query, cls } = state
      datafeed
        .search(query, { limit: pageSize, cls: cls || undefined, offset: current.hits.length })
        .then(({ hits, hasMore }) => {
          const base = cache.get(mine)?.hits ?? current.hits
          const seen = new Set(base.map(hitKey))
          const merged = { hits: [...base, ...hits.filter((h) => !seen.has(hitKey(h)))], hasMore }
          cache.set(mine, merged)
          if (!disposed && key === mine) emit({ hits: merged.hits, hasMore: merged.hasMore })
        })
        .catch(() => {
          /* a failed page keeps the list as it is; the next ask retries */
        })
        .finally(() => {
          moreBusy = false
        })
    },
    prefetch(query = '', cls = '') {
      if (disposed) return
      const k = keyOf(query, cls)
      if (!cache.has(k)) void load(k, query, cls).catch(() => {})
    },
    dispose() {
      disposed = true
      clearTimeout(timer)
      listeners.clear()
    },
  }
}

/** How many recent picks a search surface lists. */
export const RECENT_SYMBOLS_CAP = 10

/** Where a search surface reads and records recent picks. The chart supplies
 *  {@link memoryRecents}; a host that wants recents to outlive the page backs the port with its
 *  own storage. */
export interface RecentsPort {
  list(): readonly SymbolRow[]
  promote(row: SymbolRow): void
}

/** Promote a pick to the front of a recents list, dropping the older copy of the same symbol and
 *  anything past the cap. Pure. */
export function promoteRecent(list: readonly SymbolRow[], pick: SymbolRow, cap: number = RECENT_SYMBOLS_CAP): SymbolRow[] {
  const rest = list.filter((r) => r.symbol !== pick.symbol)
  return [pick, ...rest].slice(0, cap)
}

/** A recents port that lives as long as the object does. */
export function memoryRecents(cap: number = RECENT_SYMBOLS_CAP): RecentsPort {
  let rows: SymbolRow[] = []
  return {
    list: () => rows,
    promote(row) {
      rows = promoteRecent(rows, row, cap)
    },
  }
}

export interface MatchSegment {
  readonly text: string
  readonly hit: boolean
}

/** Split `text` around the first case-insensitive occurrence of `query` (trimmed), for a result
 *  row's highlight. No query or no occurrence gives one unmarked segment; a match at either edge
 *  leaves no empty segment. */
export function matchSegments(text: string, query: string): MatchSegment[] {
  const q = query.trim()
  if (!q) return [{ text, hit: false }]
  const at = text.toLowerCase().indexOf(q.toLowerCase())
  if (at === -1) return [{ text, hit: false }]
  const out: MatchSegment[] = []
  if (at > 0) out.push({ text: text.slice(0, at), hit: false })
  out.push({ text: text.slice(at, at + q.length), hit: true })
  if (at + q.length < text.length) out.push({ text: text.slice(at + q.length), hit: false })
  return out
}

/** One spread operator a search input offers. It TYPES into the query; the feed parses and
 *  evaluates the expression, because the whole expression is the instrument. */
export interface SpreadOperator {
  readonly id: 'division' | 'subtraction' | 'addition' | 'multiplication' | 'exponentiation' | 'reciprocal'
  /** What it inserts. */
  readonly insert: string
  /** Inserted before the query rather than after it (the reciprocal form). */
  readonly prefix?: boolean
  /** The catalog key of its name. */
  readonly label: ChartMessageKey
}

/** The six operators, in the order the input row offers them. */
export const SPREAD_OPERATORS: readonly SpreadOperator[] = [
  { id: 'division', insert: '/', label: 'search.opDivision' },
  { id: 'subtraction', insert: '-', label: 'search.opSubtraction' },
  { id: 'addition', insert: '+', label: 'search.opAddition' },
  { id: 'multiplication', insert: '*', label: 'search.opMultiplication' },
  { id: 'exponentiation', insert: '^', label: 'search.opExponentiation' },
  { id: 'reciprocal', insert: '1/', prefix: true, label: 'search.opReciprocal' },
]

/** Whether a query reads as a spread EXPRESSION: an operator over at least one symbol leg, within
 *  the expression grammar. The feed is the real parser; this only says the text is
 *  expression-shaped, so a list may offer the expression as a row. */
export function looksLikeSpread(query: string): boolean {
  const s = query.trim()
  if (!s || s.length > 96) return false
  if (!/[+\-*/^]/.test(s)) return false
  if (!/[A-Za-z]/.test(s)) return false
  return /^[A-Za-z0-9:._+\-*/^() ]+$/.test(s)
}

/** Whether a query is a plain slash PAIR ('BTC/USD'). A pair is catalog identity, not a division:
 *  the feed lists the market that name resolves to, and a list offers a spread row for it only
 *  once the search settled with no hits. */
export function isSymbolPair(query: string): boolean {
  return /^[A-Za-z0-9.]+\/[A-Za-z0-9.]+$/.test(query.trim())
}

/** The expression a spread row carries and the feed evaluates: upper-cased, whitespace removed. */
export function spreadExpression(query: string): string {
  return query.trim().toUpperCase().replace(/\s+/g, '')
}

/** The query the feed is searched with for an expression: its operators stripped, so 'ETH+BTC'
 *  lists the ETHBTC markets under the expression row. */
export function spreadSearchQuery(query: string): string {
  return query.replace(/[^A-Za-z0-9:.]/g, '')
}
