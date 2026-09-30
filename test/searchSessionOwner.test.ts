import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createSearchSessionOwner } from '../src/search'
import type { SearchPage, SymbolRow } from '../src/datafeed'

const row = (symbol: string): SymbolRow => ({ symbol, name: symbol, exchange: 'X', type: 'future' })
const page = (symbol: string, hasMore = false): SearchPage => ({ hits: [row(symbol)], hasMore })
const cleanups: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanups.splice(0).forEach((off) => off()); vi.useRealTimers() })
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const tick = () => vi.advanceTimersByTimeAsync(0)
function deferred() {
  const calls: { q: string; opts?: { cls?: string; limit?: number; offset?: number }; resolve(p: SearchPage): void; reject(e: unknown): void }[] = []
  return { calls, search: (q: string, opts?: { cls?: string; limit?: number; offset?: number }) => new Promise<SearchPage>((resolve, reject) => calls.push({ q, opts, resolve, reject })) }
}
function owner(feed: Parameters<typeof createSearchSessionOwner>[0], pageSize = 2) {
  const value = createSearchSessionOwner(feed, { pageSize, debounceMs: 0 })
  cleanups.push(() => value.dispose())
  return value
}

it('does not reuse an abandoned A flight after A to B to A', async () => {
  const f = deferred(), o = owner(f), c = o.create().controller
  c.search('A'); await tick()
  c.search('B'); await tick()
  c.search('A'); await tick()
  expect(f.calls.map((c) => c.q)).toEqual(['A', 'B', 'A'])
  f.calls[0]!.resolve(page('OLD-A')); f.calls[1]!.resolve(page('OLD-B')); await flush()
  expect(c.state().hits).toEqual([])
  f.calls[2]!.resolve(page('CURRENT-A')); await flush()
  c.dispose()
  const next = o.create().controller
  next.search('B')
  expect(next.state().hits).toEqual([])
  next.search('A')
  expect(next.state().hits).toEqual([row('CURRENT-A')])
})

it('isolates class/query keys even when a delimiter appears in the provider values', async () => {
  const o = owner({ search: async (q, opts) => page(JSON.stringify([q, opts?.cls])) })
  const first = o.create().controller
  first.search('B|C', 'A'); await tick(); first.dispose()
  const second = o.create().controller
  second.search('C', 'A|B')
  expect(second.state().hits).toEqual([])
  await tick()
  expect(second.state().hits[0]?.symbol).toBe('["C","A|B"]')
})

it('retains deep pages and raw server offsets when page edges repeat', async () => {
  const search = vi.fn(async (_q: string, opts?: { offset?: number }) => ({ hits: [row('SAME')], hasMore: (opts?.offset ?? 0) < 2 }))
  const o = owner({ search }, 1), first = o.create().controller
  first.search('A'); await tick(); first.loadMore(); await flush()
  first.dispose()
  const second = o.create().controller
  second.search('A')
  expect(second.state().hits).toEqual([row('SAME')])
  await tick()
  expect(search).toHaveBeenCalledTimes(2)
  second.loadMore(); await flush()
  expect(search.mock.calls[2]![1]?.offset).toBe(2)
  expect(second.state().hasMore).toBe(false)
})

it('does not let an old page unlock or mutate the new query page flight', async () => {
  const f = deferred(), o = owner(f), c = o.create().controller
  c.search('A'); await tick(); f.calls[0]!.resolve(page('A', true)); await flush()
  c.loadMore()
  c.search('B'); c.loadMore(); await tick()
  expect(f.calls.map((x) => [x.q, x.opts?.offset])).toEqual([['A', undefined], ['A', 1], ['B', undefined]])
  f.calls[2]!.resolve(page('B', true)); await flush(); c.loadMore()
  f.calls[1]!.resolve(page('LATE-A')); await flush(); c.loadMore()
  expect(f.calls).toHaveLength(4)
  f.calls[3]!.resolve(page('B2')); await flush()
  expect(c.state().hits).toEqual([row('B'), row('B2')])
})

it('drops late pages from a closed session and retries the uncompleted offset on reopen', async () => {
  const f = deferred(), o = owner(f), c = o.create().controller
  c.search('A'); await tick(); f.calls[0]!.resolve(page('A', true)); await flush()
  c.loadMore(); c.dispose()
  f.calls[1]!.resolve(page('ABANDONED')); await flush()
  const next = o.create().controller
  next.search('A'); next.loadMore()
  expect(next.state().hits).toEqual([row('A')])
  expect(f.calls[2]!.opts?.offset).toBe(1)
})

it('never retains failures and recovers from synchronous provider throws', async () => {
  let fail = true
  const o = owner({ search: () => { if (fail) throw new Error('provider'); return Promise.resolve(page('OK')) } })
  o.prefetch(); await flush()
  const first = o.create().controller
  first.search('A'); await tick()
  expect(first.state().failed).toBe(true)
  first.dispose(); fail = false
  const second = o.create().controller
  second.search('A')
  expect(second.state()).toMatchObject({ loading: true, failed: false, hits: [] })
  await tick()
  expect(second.state().hits).toEqual([row('OK')])
})

it('does not schedule provider work after a subscriber disposes the session', async () => {
  const search = vi.fn(async () => page('UNREACHABLE'))
  const o = owner({ search }), c = o.create().controller
  c.subscribe(() => c.dispose())
  c.search('A'); await tick()
  expect(search).not.toHaveBeenCalled()
  const listener = vi.fn()
  c.subscribe(listener); c.search('B'); c.loadMore(); c.prefetch()
  await tick()
  expect(listener).not.toHaveBeenCalled()
  o.dispose(); o.dispose()
  expect(() => o.create()).toThrow('disposed')
})

it('evicts least-recent queries at 32 entries without truncating active pages or offsets', async () => {
  const search = vi.fn(async (q: string, opts?: { offset?: number }) => ({ hits: [row(`${q}-${opts?.offset ?? 0}`)], hasMore: q === 'active' }))
  const o = owner({ search }), active = o.create().controller
  active.search('active'); await tick(); active.loadMore(); await flush()
  for (let i = 0; i < 32; i++) {
    const c = o.create().controller; c.search(`Q${i}`); await tick(); c.dispose()
  }
  expect(active.state().hits).toEqual([row('active-0'), row('active-1')])
  active.loadMore(); await flush()
  expect(search.mock.calls.at(-1)![1]?.offset).toBe(2)
  expect(active.state().hits).toHaveLength(3)
  const recent = o.create().controller; recent.search('Q31')
  expect(recent.state().hits).toEqual([row('Q31-0')])
  const oldest = o.create().controller; oldest.search('Q0')
  expect(oldest.state().hits).toEqual([])
  const reopened = o.create().controller; reopened.search('active')
  expect(reopened.state().hits).toHaveLength(3)
})

it('bounds retained rows at 5000 independently of the query count', async () => {
  const o = owner({ search: async (q) => ({ hits: Array.from({ length: 3_000 }, (_, i) => row(`${q}-${i}`)), hasMore: false }) })
  const first = o.create().controller; first.search('A'); await tick()
  const second = o.create().controller; second.search('B'); await tick(); second.dispose()
  expect(first.state().hits).toHaveLength(3_000)
  const reopened = o.create().controller; reopened.search('A')
  expect(reopened.state().hits).toEqual([])
  reopened.search('B')
  expect(reopened.state().hits).toHaveLength(3_000)
})

it('promotes a reused query before choosing the least-recent entry to evict', async () => {
  const o = owner({ search: async (q) => page(q) })
  for (let i = 0; i < 32; i++) {
    const c = o.create().controller; c.search(`Q${i}`); await tick(); c.dispose()
  }
  const reused = o.create().controller; reused.search('Q0'); reused.dispose()
  const added = o.create().controller; added.search('Q32'); await tick(); added.dispose()
  const check = o.create().controller
  check.search('Q1'); expect(check.state().hits).toEqual([])
  check.search('Q0'); expect(check.state().hits).toEqual([row('Q0')])
})

it('keeps an oversized active catalog pageable but does not retain it for reopen', async () => {
  const search = vi.fn(async (_q: string, opts?: { offset?: number }) => ({ hits: Array.from({ length: 3_000 }, (_, i) => row(`S${(opts?.offset ?? 0) + i}`)), hasMore: true }))
  const o = owner({ search }), first = o.create().controller
  first.search('A'); await tick(); first.loadMore(); await flush()
  expect(first.state().hits).toHaveLength(6_000)
  first.loadMore(); await flush()
  expect(search.mock.calls.at(-1)![1]?.offset).toBe(6_000)
  expect(first.state().hits).toHaveLength(9_000)
  first.dispose()
  const next = o.create().controller; next.search('A')
  expect(next.state().hits).toEqual([])
})

it('preserves oversized active pages across a normalized same-query edit but resets on a new query', async () => {
  const search = vi.fn(async (q: string, opts?: { offset?: number }) => ({ hits: Array.from({ length: 3_000 }, (_, i) => row(`${q.trim().toUpperCase()}-${(opts?.offset ?? 0) + i}`)), hasMore: true }))
  const o = owner({ search }), c = o.create().controller
  c.search('A'); await tick(); c.loadMore(); await flush()
  expect(c.state().hits).toHaveLength(6_000)
  c.search(' a ')
  expect(c.state()).toMatchObject({ loading: false, query: ' a ' })
  await tick()
  expect(c.state().hits).toHaveLength(6_000)
  expect(search).toHaveBeenCalledTimes(2)
  c.loadMore(); await flush()
  expect(search.mock.calls.at(-1)![1]?.offset).toBe(6_000)
  c.search('B'); c.loadMore(); await tick()
  expect(search.mock.calls.at(-1)).toEqual(['B', { limit: 2, cls: undefined }])
  expect(c.state().hits[0]?.symbol).toBe('B-0')
})

it('keeps an evicted active single page when its same-query revalidation fails', async () => {
  let fail = false
  const o = owner({ search: async (q) => { if (q.trim().toLowerCase() === 'a' && fail) throw new Error('offline'); return page(q, true) } })
  const active = o.create().controller
  active.search('A'); await tick()
  for (let i = 0; i < 32; i++) {
    const c = o.create().controller; c.search(`Q${i}`); await tick(); c.dispose()
  }
  fail = true
  active.search(' a '); await tick()
  expect(active.state()).toMatchObject({ hits: [row('A')], loading: false, failed: false, hasMore: true })
})

it.each([
  ['first-page', false], ['continuation', false],
  ['first-page', true], ['continuation', true],
] as const)('keeps one coherent page family when %s commits first (normalized edit=%s)', async (first, edit) => {
  const f = deferred(), o = owner(f), seed = o.create().controller
  seed.search('A'); await tick()
  f.calls[0]!.resolve(page('OLD-0', true)); await flush(); seed.dispose()
  const c = o.create().controller
  c.search('A'); await tick() // background page-zero revalidation
  c.loadMore() // continuation captured from OLD-0
  expect(f.calls[2]!.opts?.offset).toBe(1)
  if (edit) { c.search(' a '); await tick() }
  expect(f.calls).toHaveLength(3)
  const fresh = { hits: [row('FRESH-0'), row('FRESH-1')], hasMore: true }
  const expected = first === 'first-page' ? fresh.hits : [row('OLD-0'), row('OLD-1')]
  if (first === 'first-page') {
    f.calls[1]!.resolve(fresh); await flush()
    expect(c.state().hits).toEqual(fresh.hits)
    f.calls[2]!.resolve(page('OLD-1', true)); await flush()
  } else {
    f.calls[2]!.resolve(page('OLD-1', true)); await flush()
    f.calls[1]!.resolve(fresh); await flush()
  }
  expect(c.state().hits).toEqual(expected)
  c.loadMore()
  expect(f.calls[3]!.opts?.offset).toBe(2)
  f.calls[3]!.resolve(page('NEXT')); await flush()
  expect(c.state().hits).toEqual([...expected, row('NEXT')])
  c.dispose()
  const reopened = o.create().controller; reopened.search('A')
  expect(reopened.state().hits).toEqual([...expected, row('NEXT')])
})

it('retires the old continuation immediately and its cleanup cannot unlock a newer flight', async () => {
  const f = deferred(), o = owner(f), c = o.create().controller
  c.search('A'); await tick(); f.calls[0]!.resolve(page('OLD', true)); await flush()
  c.search('A'); await tick(); c.loadMore()
  f.calls[1]!.resolve({ hits: [row('FRESH-0'), row('FRESH-1')], hasMore: true }); await flush()
  c.loadMore()
  expect(f.calls).toHaveLength(4)
  expect(f.calls[3]!.opts?.offset).toBe(2)
  f.calls[2]!.resolve(page('STALE')); await flush(); c.loadMore()
  expect(f.calls).toHaveLength(4)
  expect(c.state().hits).toEqual([row('FRESH-0'), row('FRESH-1')])
  f.calls[3]!.resolve(page('FRESH-2')); await flush()
  expect(c.state().hits).toEqual([row('FRESH-0'), row('FRESH-1'), row('FRESH-2')])
})

it.each(['first-page', 'continuation'] as const)('keeps %s ownership when both responses settle before promise continuations', async (first) => {
  const f = deferred(), o = owner(f), c = o.create().controller
  c.search('A'); await tick(); f.calls[0]!.resolve(page('OLD', true)); await flush()
  c.search('A'); await tick(); c.loadMore()
  if (first === 'first-page') {
    f.calls[1]!.resolve(page('FRESH', true)); f.calls[2]!.resolve(page('OLD-NEXT'))
  } else {
    f.calls[2]!.resolve(page('OLD-NEXT')); f.calls[1]!.resolve(page('FRESH', true))
  }
  await flush()
  expect(c.state().hits).toEqual(first === 'first-page' ? [row('FRESH')] : [row('OLD'), row('OLD-NEXT')])
})
