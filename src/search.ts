// Symbol search, framework-free: the controller every search surface drives (debounce, a
// session cache by query and class, stale-while-revalidate, paging with de-duplication, cancel on
// a newer query, prefetch), the recents port a host backs with its own storage, and the pure rules
// a result list applies (the recents promotion, the match highlight, and the spread-expression
// offer). The datafeed's `search` is the only source; completed pages may be reused within one
// widget/feed lifetime, never globally or across providers. The chart never invents a row.
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
  readonly pages: number
  readonly nextOffset: number
}

const keyOf = (query: string, cls: string, pageSize: number): string => JSON.stringify([pageSize, cls, query.trim().toLowerCase()])
const hitKey = (h: SymbolRow): string => `${h.symbol}|${h.exchange}`

/** Bounded completed-result reuse. An active session holds its current page separately, so an
 *  eviction never truncates the visible list or changes its next server offset. */
function completedCache() {
  const entries = new Map<string, Loaded>()
  let rows = 0
  return {
    get(key: string) {
      const held = entries.get(key)
      if (held) { entries.delete(key); entries.set(key, held) }
      return held
    },
    has: (key: string) => entries.has(key),
    set(key: string, value: Loaded) {
      rows -= entries.get(key)?.hits.length ?? 0
      entries.delete(key)
      // Large catalogs remain pageable in the active session, without unbounded retained reuse.
      if (value.hits.length > 5_000) return
      entries.set(key, value)
      rows += value.hits.length
      while (entries.size > 32 || rows > 5_000) {
        const oldest = entries.keys().next().value!
        rows -= entries.get(oldest)!.hits.length
        entries.delete(oldest)
      }
    },
    clear() { entries.clear(); rows = 0 },
  }
}

/** Private dialog lifecycle, not part of the public controller or root entrypoint. */
export interface SearchSession {
  readonly controller: SearchController
  /** Retire the current query without searching the feed's empty catalog. */
  cancelPending(): void
}

export function createSearchController(datafeed: Pick<ChartDatafeed, 'search'>, options: SearchControllerOptions = {}): SearchController {
  const cache = completedCache()
  return searchSession(datafeed, options, cache, () => cache.clear()).controller
}

/** Private chrome owner, deliberately absent from the public entrypoint. Completed catalog pages
 *  outlive a dialog, but query state and in-flight work never pass from a closed session to a new one. */
export function createSearchSessionOwner(datafeed: Pick<ChartDatafeed, 'search'>, options: SearchControllerOptions = {}) {
  const cache = completedCache()
  const sessions = new Set<SearchSession>()
  let warm: SearchSession | undefined
  let disposed = false
  const create = (): SearchSession => {
    if (disposed) throw new Error('search owner is disposed')
    if (warm) {
      const session = warm
      warm = undefined
      return session
    }
    const session = searchSession(datafeed, options, cache, () => sessions.delete(session))
    sessions.add(session)
    return session
  }
  return {
    create,
    prefetch() {
      if (disposed || warm) return
      warm = create()
      warm.controller.prefetch()
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const session of sessions) session.controller.dispose()
      warm = undefined
      cache.clear()
    },
  }
}

function searchSession(datafeed: Pick<ChartDatafeed, 'search'>, options: SearchControllerOptions, cache: ReturnType<typeof completedCache>, onDispose: () => void): SearchSession {
  const pageSize = options.pageSize ?? 50
  const debounceMs = options.debounceMs ?? 200
  // Completed entries belong to the bounded owner; query state and flights belong only to this
  // session. Page size, class and normalized query identify catalog results. Dialog mode only
  // projects those results and is not an input to the feed. A deep entry is never revalidated:
  // a page-0 refetch would truncate what the viewer scrolled to.
  // One first-page ask in flight per key: a prefetch and a search for the same query share it.
  const inflight = new Map<string, Promise<Loaded>>()
  const listeners = new Set<(state: SearchState) => void>()
  let state: SearchState = { query: '', cls: '', hits: [], loading: false, failed: false, hasMore: false }
  let key = keyOf('', '', pageSize)
  let timer: ReturnType<typeof setTimeout> | undefined
  let moreBusy: object | null = null
  let disposed = false
  let generation = 0
  let current: Loaded | undefined

  const cancelPending = () => {
    generation++
    clearTimeout(timer)
    inflight.clear()
    moreBusy = null
  }
  const askFeed: ChartDatafeed['search'] = (query, opts) => {
    try { return datafeed.search(query, opts) }
    catch (error) { return Promise.reject(error) }
  }

  const emit = (next: Partial<SearchState>) => {
    state = { ...state, ...next }
    for (const l of listeners) l(state)
  }

  const load = (k: string, query: string, cls: string): Promise<Loaded> => {
    const pending = inflight.get(k)
    if (pending) return pending
    const mine = generation
    const ask = askFeed(query, { limit: pageSize, cls: cls || undefined })
      .then(({ hits, hasMore }) => {
        const loaded = { hits, hasMore, pages: 1, nextOffset: hits.length }
        if (!disposed && generation === mine) {
          // A slower first page never replaces pages another live session already accumulated.
          const retained = cache.get(k)
          const held = key === k && current && current.pages > (retained?.pages ?? 0) ? current : retained
          if (held && held.pages > 1) return held
          // Revalidation replaces the active first-page receipt at the same point as cache
          // publication. A continuation captured from the old receipt is now obsolete, even
          // between this promise step and the state notification below.
          if (key === k && current) {
            current = loaded
            moreBusy = null
          }
          cache.set(k, loaded)
        }
        return loaded
      })
      .finally(() => {
        if (inflight.get(k) === ask) inflight.delete(k)
      })
    inflight.set(k, ask)
    return ask
  }

  const controller: SearchController = {
    state: () => state,
    subscribe(listener) {
      if (disposed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    search(query, cls = '') {
      if (disposed) return
      clearTimeout(timer)
      const nextKey = keyOf(query, cls, pageSize)
      const unchanged = key === nextKey
      if (!unchanged) {
        cancelPending()
      }
      key = nextKey
      const mine = key
      const epoch = generation
      const retained = cache.get(key)
      // A normalized same-query edit still owns its active pages, even if reuse evicted them.
      const cached = unchanged && current ? current : retained
      current = cached
      if (cached) {
        emit({ query, cls, hits: cached.hits, hasMore: cached.hasMore, loading: false, failed: false })
        if (cached.pages > 1) return
      } else {
        emit({ query, cls, loading: true, failed: false })
      }
      // A listener may close or replace this session during the loading notification.
      if (disposed || generation !== epoch || key !== mine) return
      const run = () => {
        if (disposed || generation !== epoch || key !== mine) return
        load(mine, query, cls)
          .then((loaded) => {
            if (disposed || generation !== epoch || key !== mine) return
            // A continuation may have committed between first-page acceptance and this callback.
            current = current && current.pages > loaded.pages ? current : loaded
            emit({ hits: current.hits, hasMore: current.hasMore, loading: false, failed: false })
          })
          .catch(() => {
            if (disposed || generation !== epoch || key !== mine) return
            // A failure only surfaces when nothing cached stands in for it.
            if (current) emit({ loading: false })
            else emit({ hits: [], hasMore: false, loading: false, failed: true })
          })
      }
      // Adopt a live prefetch immediately, including one that resolves before the debounce.
      if (inflight.has(mine)) run()
      else timer = setTimeout(run, debounceMs)
    },
    loadMore() {
      if (disposed || state.loading) return
      const mine = key
      if (!current) return
      if (!current.hasMore || current.hits.length === 0 || moreBusy) return
      const flight = {}
      moreBusy = flight
      const epoch = generation
      const page = current
      const { query, cls } = state
      askFeed(query, { limit: pageSize, cls: cls || undefined, offset: page.nextOffset })
        .then(({ hits, hasMore }) => {
          if (disposed || generation !== epoch || current !== page) return
          const base = page.hits
          const seen = new Set(base.map(hitKey))
          const merged = { hits: [...base, ...hits.filter((h) => !seen.has(hitKey(h)))], hasMore, pages: page.pages + 1, nextOffset: page.nextOffset + hits.length }
          current = merged
          cache.set(mine, merged)
          if (!disposed && key === mine) emit({ hits: merged.hits, hasMore: merged.hasMore })
        })
        .catch(() => {
          /* a failed page keeps the list as it is; the next ask retries */
        })
        .finally(() => {
          if (moreBusy === flight) moreBusy = null
        })
    },
    prefetch(query = '', cls = '') {
      if (disposed) return
      const k = keyOf(query, cls, pageSize)
      if (!cache.has(k)) void load(k, query, cls).catch(() => {})
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelPending()
      current = undefined
      listeners.clear()
      onDispose()
    },
  }
  return { controller, cancelPending }
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
