// @vitest-environment happy-dom
// Exercise the real chrome door, search controller and dialog across their different lifetimes.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mountChrome } from '../../src/ui/chrome/mount'
import { emptyDoors } from '../../src/ui/chrome/doors'
import { memoryChartStorage } from '../../src/storage'
import type { ChartDatafeed, SearchPage, SymbolRow } from '../../src/datafeed'
import { fakeWidget, press } from './harness'
import { resolveMarkPainters } from '../../src/markPainters'

const row = (symbol: string): SymbolRow => ({ symbol, name: symbol, exchange: 'X', type: 'future' })
const cleanup: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const off of cleanup.splice(0).reverse()) off()
  vi.useRealTimers()
  document.body.replaceChildren()
})
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const settle = async () => { await vi.advanceTimersByTimeAsync(250) }

function mount(provider: ChartDatafeed['search'] | ChartDatafeed) {
  const w = fakeWidget()
  const root = document.body.appendChild(document.createElement('div'))
  const panes = root.appendChild(document.createElement('div'))
  const doors = emptyDoors()
  const datafeed: ChartDatafeed = typeof provider === 'function' ? { search: provider, resolve: async () => null, history: async () => ({ bars: [], noData: true }), subscribeBars: () => () => {} } : provider
  const chrome = mountChrome({ root, layer: document.body.appendChild(document.createElement('div')), panes, widget: w.widget, i18n: w.i18n, features: w.features, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, datafeed, feedConfig: () => ({ classes: ['future', 'crypto'] }), autosave: w.autosave, layoutChanges: w.layoutChanges, icons: w.icons, styles: w.ctx.styles, timeframes: w.ctx.timeframes, layouts: w.ctx.layouts, doors, painters: resolveMarkPainters({}) })
  cleanup.push(() => { chrome.dispose(); w.dispose() })
  const open = (mode: 'search' | 'compare' | 'change-symbol' = 'search', changeFrom?: string) => {
    doors.openSearch({ mode, chart: w.chart.handle, changeFrom, ...(mode === 'change-symbol' ? { onPick: () => {} } : {}) })
    const input = root.querySelector<HTMLInputElement>('.qc-search-input')!
    return {
      input,
      rows: () => [...root.querySelectorAll<HTMLElement>('[data-symbol-row]')].map((r) => r.dataset.symbolRow),
      query: (value: string) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })) },
      close: () => press(input, 'Escape'),
    }
  }
  return { w, root, chrome, open, datafeed }
}

it('prefetches the widget catalog so the first search opens warm', async () => {
  const search = vi.fn(async () => ({ hits: [row('WARM')], hasMore: false }))
  const m = mount(search)
  await flush()
  expect(search).toHaveBeenCalledTimes(1)
  expect(m.open().rows()).toEqual(['WARM'])
})

it('reopens all three accumulated pages immediately without a page-zero truncation', async () => {
  const catalog = Array.from({ length: 150 }, (_, i) => row(`S${i}`))
  const search = vi.fn(async (_q: string, opts?: { offset?: number; limit?: number }) => {
    const offset = opts?.offset ?? 0
    return { hits: catalog.slice(offset, offset + 50), hasMore: offset + 50 < catalog.length }
  })
  const m = mount(search)
  const first = m.open()
  await settle()
  for (let i = 0; i < 60; i++) press(first.input, 'ArrowDown')
  await flush()
  for (let i = 0; i < 60; i++) press(first.input, 'ArrowDown')
  await flush()
  expect(first.rows()).toHaveLength(150)
  first.close()
  const calls = search.mock.calls.length
  const reopened = m.open()
  expect(reopened.rows()).toHaveLength(150)
  await settle()
  expect(search).toHaveBeenCalledTimes(calls)
})

it('does not reuse a disposed widget cache with a new provider', async () => {
  const first = mount(async () => ({ hits: [row('A')], hasMore: false }))
  first.open(); await settle()
  first.chrome.dispose()
  const second = mount(async () => ({ hits: [row('B')], hasMore: false }))
  const opened = second.open()
  expect(opened.rows()).not.toContain('A')
  await settle()
  expect(opened.rows()).toEqual(['B'])
})

it('invalidates cached locale-dependent rows and closes the old localized session', async () => {
  let label = 'EN'
  const m = mount(async () => ({ hits: [row(label)], hasMore: false }))
  const first = m.open(); await settle()
  expect(first.rows()).toEqual(['EN'])
  label = 'AR'
  await m.w.i18n.setLocale('ar')
  expect(m.root.querySelector('.qc-search-input')).toBeNull()
  await flush()
  expect(m.open().rows()).toEqual(['AR'])
})

it('does not let an abandoned dialog response populate a later same-query session', async () => {
  const pending: ((page: SearchPage) => void)[] = []
  const m = mount((q) => q ? new Promise((resolve) => pending.push(resolve)) : Promise.resolve({ hits: [], hasMore: false }))
  const first = m.open(); first.query('x'); await settle()
  first.close()
  const second = m.open(); second.query('x'); await settle()
  pending[0]!({ hits: [row('OLD')], hasMore: false }); await flush()
  expect(second.rows()).toEqual([])
  pending[1]!({ hits: [row('NEW')], hasMore: false }); await flush()
  expect(second.rows()).toEqual(['NEW'])
})

it('shares the pending prefetch only with its first live dialog', async () => {
  let resolve!: (page: SearchPage) => void
  const search = vi.fn(() => new Promise<SearchPage>((done) => { resolve = done }))
  const m = mount(search)
  const first = m.open(); await settle()
  expect(search).toHaveBeenCalledTimes(1)
  resolve({ hits: [row('WARM')], hasMore: false }); await flush()
  expect(first.rows()).toEqual(['WARM'])
})

it('resets class and mode state while sharing only matching completed catalog pages', async () => {
  const search = vi.fn(async (q: string, opts?: { cls?: string }) => ({ hits: [row(`${q || 'ALL'}-${opts?.cls || 'all'}`)], hasMore: false }))
  const m = mount(search)
  const first = m.open(); first.query('ES'); await settle()
  m.root.querySelectorAll<HTMLButtonElement>('.qc-search-class')[1]!.click(); await settle()
  expect(first.rows()).toEqual(['ES-future'])
  const compare = m.open('compare')
  expect(first.input.isConnected).toBe(false)
  expect(compare.input.value).toBe('')
  expect(compare.rows()).not.toContain('ES-future')
  compare.query('ES')
  expect(compare.rows()).toEqual(['ES-all'])
  const rekey = m.open('change-symbol', 'ES')
  expect(compare.input.isConnected).toBe(false)
  expect(rekey.input.value).toBe('ES')
  expect(rekey.rows()).toEqual(['ES-all'])
  expect(m.root.querySelector('.qc-search-class[aria-pressed="true"]')?.textContent).toBe('All')
})

it('cancels a compare query when returning to its non-search empty view', async () => {
  const pending: ((page: SearchPage) => void)[] = []
  const search = vi.fn((q: string) => q ? new Promise<SearchPage>((done) => pending.push(done)) : Promise.resolve({ hits: [], hasMore: false }))
  const m = mount(search)
  const compare = m.open('compare')
  compare.query('ES'); await settle()
  compare.query('')
  pending[0]!({ hits: [row('STALE')], hasMore: false }); await flush()
  compare.query('ES')
  expect(compare.rows()).not.toContain('STALE')
  await settle()
  expect(pending).toHaveLength(2)
})

it('retires timers and doors, and uses a fresh cache even with the same provider object', async () => {
  let principal = 'A'
  const search = vi.fn(async () => ({ hits: [row(principal)], hasMore: false }))
  const first = mount(search)
  const dialog = first.open(); await settle()
  dialog.query('not-issued')
  first.chrome.dispose()
  const calls = search.mock.calls.length
  first.open()
  await settle()
  expect(search).toHaveBeenCalledTimes(calls)
  expect(first.root.querySelector('.qc-search-input')).toBeNull()
  principal = 'B'
  const second = mount(first.datafeed)
  expect(second.open().rows()).not.toContain('A')
  await settle()
  expect(second.root.querySelector('[data-symbol-row]')?.getAttribute('data-symbol-row')).toBe('B')
})

it('fences a pending prefetch across locale invalidation', async () => {
  const pending: ((page: SearchPage) => void)[] = []
  const m = mount(() => new Promise((done) => pending.push(done)))
  m.open()
  await m.w.i18n.setLocale('ar')
  pending[0]!({ hits: [row('OLD-LOCALE')], hasMore: false }); await flush()
  const current = m.open()
  expect(current.rows()).toEqual([])
  pending[1]!({ hits: [row('NEW-LOCALE')], hasMore: false }); await settle()
  expect(current.rows()).toEqual(['NEW-LOCALE'])
})
