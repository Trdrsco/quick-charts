// @vitest-environment happy-dom
// A host's filters beside the symbol search's results: each a labelled group of its All and the
// entries the search's first page answers, each with its count and, for an entry that stands for a
// venue, that venue's artwork. The dialog stands wider by their column, so the results keep their
// width. Choosing an entry asks again at once with it; choosing it again, or All, clears it; a
// chosen entry missing from the newest answer stays at none; no recents are listed while an entry
// is chosen; and the compare dialog offers no filters. A chart's `search.filters` reaches its own
// search.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openSearchDialog } from '../../src/ui/chrome/searchDialog'
import { createSearchSessionOwner } from '../../src/search'
import { resolveMarkPainters } from '../../src/markPainters'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, DatafeedSearchOptions, SymbolRow } from '../../src/datafeed'
import type { SearchFilter } from '../../src/widget/options'
import { fakeWidget } from './harness'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('../widget/rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const CATALOG: SymbolRow[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'CME', type: 'future' },
  { symbol: 'BTCUSDC', name: 'Bitcoin', exchange: 'Hyperliquid', type: 'crypto' },
]

const EXCHANGE: SearchFilter = { id: 'exchange', label: 'Exchange' }

/** A feed that narrows by the chosen exchange and answers, on a first page, every exchange the query
 *  finds with its count, each standing for its venue. */
function exchangeFeed() {
  const calls: { q: string; opts: DatafeedSearchOptions | undefined }[] = []
  const feed: ChartDatafeed = {
    async search(q, opts) {
      calls.push({ q, opts })
      const needle = q.trim().toUpperCase()
      const found = CATALOG.filter((row) => !needle || row.symbol.includes(needle))
      const chosen = opts?.filters?.exchange
      const hits = found.filter((row) => chosen === undefined || row.exchange === chosen)
      const counts = new Map<string, number>()
      for (const row of found) counts.set(row.exchange, (counts.get(row.exchange) ?? 0) + 1)
      const entries = [...counts].map(([id, count]) => ({ id, label: id, count, exchange: id }))
      return { hits, hasMore: false, ...(opts?.offset ? {} : { filterCounts: { exchange: { all: found.length, entries } } }) }
    },
    resolve: async () => null,
    history: async () => ({ bars: [], noData: true }),
    subscribeBars: () => () => undefined,
  }
  return { feed, calls }
}

let cleanup: (() => void)[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  vi.useRealTimers()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(250)
}

function open(options: { mode?: 'search' | 'compare'; recents?: readonly SymbolRow[]; filters?: readonly SearchFilter[] } = {}) {
  const w = fakeWidget()
  for (const row of [...(options.recents ?? [])].reverse()) w.widget.recents.promote(row)
  const { feed, calls } = exchangeFeed()
  const painted: [string, number][] = []
  const dialog = openSearchDialog({
    host: w.overlays,
    i18n: w.i18n,
    icons: w.icons,
    search: createSearchSessionOwner(feed).create(),
    commands: w.commands,
    recents: w.widget.recents,
    classes: () => null,
    filters: options.filters ?? [EXCHANGE],
    painters: resolveMarkPainters({
      venueMark: ({ exchange, host, size }) => {
        painted.push([exchange, size])
        host.appendChild(document.createElement('i'))
        return () => undefined
      },
    }),
    request: { mode: options.mode ?? 'search', chart: w.chart.handle },
  })
  cleanup.push(() => (dialog.close({ animate: false }), w.dispose()))
  const box = dialog.element
  const input = box.querySelector<HTMLInputElement>('.qc-search-input')!
  const entryButtons = () => [...box.querySelectorAll<HTMLButtonElement>('.qc-search-filter-entry')]
  return {
    box,
    calls,
    painted,
    /** The last ask's query and filters. */
    lastAsk: () => ({ q: calls.at(-1)?.q, filters: calls.at(-1)?.opts?.filters }),
    type: async (text: string) => {
      input.value = text
      input.dispatchEvent(new Event('input'))
      await settle()
    },
    rows: () => [...box.querySelectorAll<HTMLElement>('[role="option"]')].map((row) => row.dataset.symbolRow),
    /** Each entry as a viewer reads it: its name, its count and whether it is chosen. */
    entries: () =>
      entryButtons().map((entry) => [
        entry.querySelector('.qc-search-filter-name')?.textContent,
        entry.querySelector('.qc-search-filter-count')?.textContent ?? null,
        entry.getAttribute('aria-pressed') === 'true',
      ]),
    choose: async (name: string) => {
      entryButtons().find((entry) => entry.querySelector('.qc-search-filter-name')?.textContent === name)!.click()
      await vi.advanceTimersByTimeAsync(0)
    },
  }
}

describe('a host\'s filters in the symbol search', () => {
  it('shows each filter as a group under its heading: All with every row, then each entry with its artwork and count', async () => {
    const s = open()
    await settle()
    const group = s.box.querySelector<HTMLElement>('.qc-search-filters [role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Exchange')
    expect(group.querySelector('.qc-search-filter-heading')!.textContent).toBe('Exchange')
    expect(s.entries()).toEqual([['All', '3', true], ['CME', '2', false], ['Hyperliquid', '1', false]])
    // Each entry that stands for a venue wears the venue's artwork, through the host's painter.
    expect(s.painted).toContainEqual(['CME', 18])
    expect(s.painted).toContainEqual(['Hyperliquid', 18])
    expect(s.box.querySelectorAll('.qc-search-filter-art[data-qc-host="true"]')).toHaveLength(2)
    expect(s.lastAsk().filters).toBeUndefined()
  })

  it('narrows to the chosen entry at once, keeps it through a new query, and clears it on a second press or on All', async () => {
    const s = open()
    await settle()
    await s.choose('CME')
    expect(s.lastAsk()).toEqual({ q: '', filters: { exchange: 'CME' } })
    expect(s.rows()).toEqual(['ES', 'NQ'])
    expect(s.entries()).toEqual([['All', '3', false], ['CME', '2', true], ['Hyperliquid', '1', false]])
    await s.type('N')
    expect(s.lastAsk()).toEqual({ q: 'N', filters: { exchange: 'CME' } })
    expect(s.rows()).toEqual(['NQ'])
    await s.type('')
    await s.choose('CME')
    expect(s.lastAsk().filters).toBeUndefined()
    expect(s.rows()).toEqual(['ES', 'NQ', 'BTCUSDC'])
    await s.choose('Hyperliquid')
    expect(s.rows()).toEqual(['BTCUSDC'])
    await s.choose('All')
    expect(s.lastAsk().filters).toBeUndefined()
    expect(s.entries()[0]).toEqual(['All', '3', true])
  })

  it('keeps a chosen entry missing from the newest answer, at none, so an empty list says why', async () => {
    const s = open()
    await settle()
    await s.choose('Hyperliquid')
    await s.type('ES')
    expect(s.entries()).toEqual([['All', '1', false], ['CME', '1', false], ['Hyperliquid', '0', true]])
    expect(s.rows()).toEqual([])
    expect(s.box.querySelector('.qc-search-status')!.textContent).not.toBe('')
  })

  it('lists no recents while an entry is chosen', async () => {
    const recent: SymbolRow = { symbol: 'YM', name: 'E-mini Dow', exchange: 'CBOT', type: 'future' }
    const s = open({ recents: [recent] })
    await settle()
    expect(s.rows()[0]).toBe('YM')
    await s.choose('CME')
    expect(s.rows()).toEqual(['ES', 'NQ'])
    await s.choose('All')
    expect(s.rows()[0]).toBe('YM')
  })

  it('stands the dialog wider by the filters column, so the results keep the width a search without filters has', () => {
    expect(open().box.style.width).toBe('1024px')
    expect(open({ filters: [] }).box.style.width).toBe('840px')
  })

  it('offers no filters in the compare dialog, and asks the feed with none', async () => {
    const s = open({ mode: 'compare' })
    await s.type('E')
    expect(s.box.querySelector('.qc-search-filters')).toBeNull()
    expect(s.box.style.width).toBe('840px')
    expect(s.lastAsk().filters).toBeUndefined()
  })

  it('leaves the dialog as it was where the host offers no filters', async () => {
    const s = open({ filters: [] })
    await settle()
    expect(s.box.querySelector('.qc-search-filters')).toBeNull()
    expect(s.box.querySelector('.qc-search-body')).toBeNull()
    expect(s.box.querySelector(':scope .qc-search-list')).not.toBeNull()
  })
})

describe('a chart\'s search.filters', () => {
  const widgets: ChartWidget[] = []
  afterEach(() => {
    widgets.splice(0).forEach((widget) => widget.dispose())
  })

  it('reaches the chart\'s own symbol search, which asks its datafeed with the chosen entry', async () => {
    vi.useRealTimers()
    const { feed, calls } = exchangeFeed()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', search: { filters: [EXCHANGE] } })
    widgets.push(widget)
    await widget.ready()
    expect(widget.commands.execute('chart.symbol.search').kind).toBe('ok')
    await new Promise((resolve) => setTimeout(resolve, 300))
    const entries = [...document.querySelectorAll<HTMLButtonElement>('.qc-search-filter-entry')]
    expect(entries.map((entry) => entry.querySelector('.qc-search-filter-name')?.textContent)).toEqual(['All', 'CME', 'Hyperliquid'])
    entries[1]!.click()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls.at(-1)?.opts?.filters).toEqual({ exchange: 'CME' })
  })
})
