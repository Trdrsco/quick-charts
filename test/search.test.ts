// The search controller (debounce, session cache, stale-while-revalidate, paging with
// de-duplication, cancellation, prefetch) and the pure list rules beside it: the recents
// promotion, the match highlight, and the spread-expression offer.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SearchPage, SymbolRow } from '../src/datafeed'
import {
  createSearchController,
  isSymbolPair,
  looksLikeSpread,
  matchSegments,
  memoryRecents,
  promoteRecent,
  RECENT_SYMBOLS_CAP,
  SPREAD_OPERATORS,
  spreadExpression,
  spreadSearchQuery,
  type SearchState,
} from '../src/search'

const row = (symbol: string, exchange = 'X'): SymbolRow => ({ symbol, name: symbol.toLowerCase(), exchange, type: 'future' })

/** A feed whose every search resolves by hand, in order, so the controller's timing is observed
 *  rather than raced. */
function feed() {
  const calls: { q: string; opts: { cls?: string; limit?: number; offset?: number } | undefined; resolve: (page: SearchPage) => void; reject: (e: unknown) => void }[] = []
  return {
    calls,
    search: (q: string, opts?: { cls?: string; limit?: number; offset?: number }) =>
      new Promise<SearchPage>((resolve, reject) => {
        calls.push({ q, opts, resolve, reject })
      }),
  }
}

/** Let the controller's promise chains settle; timers are faked, so this walks microtasks only. */
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('createSearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits the debounce before asking the feed, marks loading meanwhile, and keeps the previous rows', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 2, debounceMs: 200 })
    const seen: SearchState[] = []
    c.subscribe((s) => seen.push(s))
    c.search('es')
    expect(f.calls).toHaveLength(0)
    expect(c.state()).toMatchObject({ query: 'es', cls: '', loading: true, failed: false, hits: [] })
    vi.advanceTimersByTime(199)
    expect(f.calls).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0]!.opts).toEqual({ limit: 2, cls: undefined })
    f.calls[0]!.resolve({ hits: [row('ES'), row('ESM')], hasMore: true })
    await flush()
    expect(c.state()).toMatchObject({ hits: [row('ES'), row('ESM')], loading: false, hasMore: true })
    // The next query keeps ES rows on screen while it loads.
    c.search('nq')
    expect(c.state()).toMatchObject({ query: 'nq', loading: true, hits: [row('ES'), row('ESM')] })
    expect(seen.length).toBeGreaterThan(0)
  })

  it('answers a cached query at once and revalidates a single-page entry in the background', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 200 })
    c.search('es')
    vi.advanceTimersByTime(200)
    f.calls[0]!.resolve({ hits: [row('ES')], hasMore: false })
    await flush()
    c.search('nq')
    c.search('es')
    expect(c.state()).toMatchObject({ query: 'es', hits: [row('ES')], loading: false })
    vi.advanceTimersByTime(200)
    expect(f.calls).toHaveLength(2) // the revalidation; 'nq' was cancelled before its debounce
    expect(f.calls[1]!.q).toBe('es')
    f.calls[1]!.resolve({ hits: [row('ES'), row('ESZ')], hasMore: false })
    await flush()
    expect(c.state().hits).toEqual([row('ES'), row('ESZ')])
  })

  it('ignores the result of a query that a newer one replaced', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 0 })
    c.search('es')
    vi.advanceTimersByTime(0)
    c.search('nq')
    vi.advanceTimersByTime(0)
    expect(f.calls.map((k) => k.q)).toEqual(['es', 'nq'])
    f.calls[1]!.resolve({ hits: [row('NQ')], hasMore: false })
    await flush()
    f.calls[0]!.resolve({ hits: [row('ES')], hasMore: false })
    await flush()
    expect(c.state()).toMatchObject({ query: 'nq', hits: [row('NQ')] })
  })

  it('keys the cache by class as well as query, and passes the class to the feed', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 0 })
    c.search('e', 'crypto')
    vi.advanceTimersByTime(0)
    expect(f.calls[0]!.opts).toEqual({ limit: 5, cls: 'crypto' })
    f.calls[0]!.resolve({ hits: [row('ETH')], hasMore: false })
    await flush()
    c.search('e', 'future')
    expect(c.state()).toMatchObject({ cls: 'future', loading: true })
  })

  it('appends the next page without repeating a row, one page in flight at a time', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 2, debounceMs: 0 })
    c.search('')
    vi.advanceTimersByTime(0)
    f.calls[0]!.resolve({ hits: [row('A'), row('B')], hasMore: true })
    await flush()
    c.loadMore()
    c.loadMore()
    expect(f.calls).toHaveLength(2)
    expect(f.calls[1]!.opts).toEqual({ limit: 2, cls: undefined, offset: 2 })
    f.calls[1]!.resolve({ hits: [row('B'), row('C')], hasMore: false })
    await flush()
    expect(c.state()).toMatchObject({ hits: [row('A'), row('B'), row('C')], hasMore: false })
    c.loadMore()
    expect(f.calls).toHaveLength(2)
  })

  it('does not truncate a deep entry back to its first page on a repeat query', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 1, debounceMs: 0 })
    c.search('')
    vi.advanceTimersByTime(0)
    f.calls[0]!.resolve({ hits: [row('A')], hasMore: true })
    await flush()
    c.loadMore()
    f.calls[1]!.resolve({ hits: [row('B')], hasMore: true })
    await flush()
    c.search('x')
    c.search('')
    vi.advanceTimersByTime(0)
    expect(c.state().hits).toEqual([row('A'), row('B')])
    expect(f.calls.filter((k) => k.q === '')).toHaveLength(2)
  })

  it('reports a failure only when nothing cached answers the query', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 0 })
    c.search('es')
    vi.advanceTimersByTime(0)
    f.calls[0]!.reject(new Error('down'))
    await flush()
    expect(c.state()).toMatchObject({ hits: [], loading: false, failed: true })
    c.search('nq')
    vi.advanceTimersByTime(0)
    f.calls[1]!.resolve({ hits: [row('NQ')], hasMore: false })
    await flush()
    c.search('nq')
    vi.advanceTimersByTime(0)
    f.calls[2]!.reject(new Error('down'))
    await flush()
    expect(c.state()).toMatchObject({ hits: [row('NQ')], loading: false, failed: false })
  })

  it('prefetches a query into the cache without changing the current one', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 0 })
    c.prefetch()
    c.prefetch()
    expect(f.calls).toHaveLength(1)
    f.calls[0]!.resolve({ hits: [row('A')], hasMore: false })
    await flush()
    expect(c.state().query).toBe('')
    expect(c.state().hits).toEqual([])
    c.search('')
    expect(c.state()).toMatchObject({ hits: [row('A')], loading: false })
  })

  it('ignores everything after dispose', async () => {
    const f = feed()
    const c = createSearchController(f, { pageSize: 5, debounceMs: 0 })
    c.search('es')
    c.dispose()
    vi.advanceTimersByTime(0)
    expect(f.calls).toHaveLength(0)
    c.search('nq')
    expect(c.state().query).toBe('es')
  })
})

describe('the recents', () => {
  it('promotes a pick to the front and drops its older copy', () => {
    const list = [row('ES'), row('NQ'), row('GC')]
    expect(promoteRecent(list, row('GC')).map((r) => r.symbol)).toEqual(['GC', 'ES', 'NQ'])
  })

  it('caps at the visible depth, oldest out', () => {
    const list = Array.from({ length: RECENT_SYMBOLS_CAP }, (_, i) => row(`S${i}`))
    const next = promoteRecent(list, row('NEW'))
    expect(next).toHaveLength(RECENT_SYMBOLS_CAP)
    expect(next[0]!.symbol).toBe('NEW')
    expect(next.some((r) => r.symbol === `S${RECENT_SYMBOLS_CAP - 1}`)).toBe(false)
  })

  it('the in-memory port applies the same rule', () => {
    const port = memoryRecents(2)
    port.promote(row('A'))
    port.promote(row('B'))
    port.promote(row('A'))
    port.promote(row('C'))
    expect(port.list().map((r) => r.symbol)).toEqual(['C', 'A'])
  })
})

describe('the match highlight', () => {
  it('marks the first case-insensitive occurrence only', () => {
    expect(matchSegments('BTCUSDT', 'usd')).toEqual([
      { text: 'BTC', hit: false },
      { text: 'USD', hit: true },
      { text: 'T', hit: false },
    ])
  })

  it('no query or no occurrence renders one unmarked segment', () => {
    expect(matchSegments('ES', '')).toEqual([{ text: 'ES', hit: false }])
    expect(matchSegments('ES', '  ')).toEqual([{ text: 'ES', hit: false }])
    expect(matchSegments('ES', 'zzz')).toEqual([{ text: 'ES', hit: false }])
  })

  it('a match at either edge keeps no empty segments', () => {
    expect(matchSegments('ES', 'es')).toEqual([{ text: 'ES', hit: true }])
    expect(matchSegments('ESU4', 'es')).toEqual([
      { text: 'ES', hit: true },
      { text: 'U4', hit: false },
    ])
  })
})

describe('the spread-row offer', () => {
  it('offers only for operator-bearing symbol expressions (the feed is the real parser)', () => {
    expect(looksLikeSpread('ES-NQ')).toBe(true)
    expect(looksLikeSpread('1/ES')).toBe(true)
    expect(looksLikeSpread('(ES+NQ)/2')).toBe(true)
    expect(looksLikeSpread('ES')).toBe(false) // no operator: a plain symbol
    expect(looksLikeSpread('1+2')).toBe(false) // no symbol leg
    expect(looksLikeSpread('ES-NQ!')).toBe(false) // outside the grammar
    expect(looksLikeSpread('')).toBe(false)
  })

  it('tells a plain pair from an expression, and writes the expression the feed evaluates', () => {
    expect(isSymbolPair('BTC/USD')).toBe(true)
    expect(isSymbolPair('ES-NQ')).toBe(false)
    expect(isSymbolPair('(ES+NQ)/2')).toBe(false)
    expect(spreadExpression(' es - nq ')).toBe('ES-NQ')
    expect(spreadSearchQuery('ETH+BTC')).toBe('ETHBTC')
    expect(spreadSearchQuery('1/ES')).toBe('1ES')
  })

  it('lists the six operators in the order the input row offers them, the reciprocal as a prefix', () => {
    expect(SPREAD_OPERATORS.map((o) => o.insert)).toEqual(['/', '-', '+', '*', '^', '1/'])
    expect(SPREAD_OPERATORS.filter((o) => o.prefix).map((o) => o.id)).toEqual(['reciprocal'])
    for (const o of SPREAD_OPERATORS) expect(o.label.startsWith('search.op')).toBe(true)
  })
})
