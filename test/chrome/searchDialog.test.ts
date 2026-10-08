// @vitest-environment happy-dom
// The symbol search dialog: the row model in each mode, the keyboard (arrows move the highlight,
// Enter acts, Escape closes), the class strip, the scope chip, the spread operators, and the verbs,
// every one a command: a pick sets the symbol, a compare pick adds at a placement, an added row
// removes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dialogRows, openSearchDialog, rowLabels } from '../../src/ui/chrome/searchDialog'
import type { ChartDatafeed, DatafeedSearchOptions, SearchPage, SymbolRow } from '../../src/datafeed'
import type { SearchScope } from '../../src/widget/options'
import { fakeWidget, press } from './harness'
import { createSearchSessionOwner, memoryRecents, type RecentsPort } from '../../src/search'
import { resolveMarkPainters } from '../../src/markPainters'
import { focusables } from '../../src/ui/controls/dom'

const CATALOG: SymbolRow[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'CME', type: 'future' },
  { symbol: 'BTC/USD', name: 'Bitcoin', exchange: 'X', type: 'crypto' },
]

type MarkHook<K extends string> = (request: { [key in K]: string } & { host: HTMLElement; size: number }) => (() => void) | void

const datafeed = (catalog: readonly SymbolRow[] = CATALOG): ChartDatafeed => ({
  async search(q, opts) {
    const needle = q.trim().toUpperCase()
    const hits = catalog.filter((r) => (!needle || r.symbol.includes(needle)) && (!opts?.cls || r.type === opts.cls))
    return { hits, hasMore: false }
  },
  resolve: async () => null,
  history: async () => ({ bars: [], noData: true }),
  subscribeBars: () => () => undefined,
})

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

function open(
  mode: 'search' | 'compare' | 'change-symbol',
  extra: {
    access?: (id: string) => boolean
    classes?: string[]
    scope?: SearchScope | (() => SearchScope | null)
    onPick?(s: string): void
    changeFrom?: string
    catalog?: readonly SymbolRow[]
    /** The feed's own search, in place of the one over `catalog`. */
    feedSearch?: ChartDatafeed['search']
    recents?: RecentsPort
    venueMark?: MarkHook<'exchange'>
    dataSourceMark?: MarkHook<'dataSource'>
  } = {},
) {
  const w = fakeWidget({ access: extra.access ? { command: extra.access } : undefined })
  const feed = datafeed(extra.catalog)
  const scope = extra.scope
  const dialog = openSearchDialog({
    host: w.overlays,
    i18n: w.i18n,
    icons: w.icons,
    search: createSearchSessionOwner(extra.feedSearch ? { search: extra.feedSearch } : feed).create(),
    commands: w.commands,
    recents: extra.recents ?? w.widget.recents,
    classes: () => extra.classes ?? null,
    classNames: { future: 'Futures' },
    scope: typeof scope === 'function' ? scope : () => scope ?? null,
    curated: [{ symbol: 'NQ', title: 'Nasdaq' }],
    painters: resolveMarkPainters(extra),
    request: { mode, chart: w.chart.handle, changeFrom: extra.changeFrom, onPick: extra.onPick },
  })
  cleanup.push(() => (dialog.close({ animate: false }), w.dispose()))
  return { w, dialog, input: dialog.element.querySelector<HTMLInputElement>('.qc-search-input')!, rows: () => [...dialog.element.querySelectorAll<HTMLElement>('[role="option"]')] }
}

describe('how a row is written', () => {
  it('writes a pair market as its pair in both cells, whatever prose the feed sent with it', () => {
    // The venue prefix is feed identity and never reaches a cell. "Ethereum perpetual" names the
    // contract and leaves out the one fact the row is short of, what it is priced in, so the pair
    // wins wherever the feed states a currency: closed up as the mark, the way the pill wears it,
    // and spaced as the description, the way the legend does.
    expect(rowLabels({ symbol: 'HYPERLIQUID:ETH', name: 'Ethereum perpetual', exchange: 'Hyperliquid', type: 'crypto', currencyCode: 'USDC' })).toEqual({
      ticker: 'ETHUSDC',
      description: 'ETH / USDC',
      source: 'Hyperliquid',
    })
  })

  it('keeps the feed’s name where there is no pair to write, and never invents a quote', () => {
    // A share is priced in dollars and is still not a pair: `AAPL / USD` would claim a market that
    // does not exist, so a non-pair market keeps its name however plainly it states a currency.
    expect(rowLabels({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc', exchange: 'NASDAQ', type: 'stock', currencyCode: 'USD' })).toEqual({
      ticker: 'AAPL',
      description: 'Apple Inc',
      source: 'NASDAQ',
    })
    // A ticker already written as a pair says so without any currency to help it.
    expect(rowLabels({ symbol: 'BTC/USD', name: '', exchange: '', type: 'crypto' })).toMatchObject({ ticker: 'BTCUSD', description: 'BTC / USD' })
    // A spread's expression IS its identity: operators and all, through both cells, untouched.
    expect(rowLabels({ symbol: 'ES-NQ', name: 'ES-NQ', exchange: '', type: 'spread' })).toEqual({ ticker: 'ES-NQ', description: 'ES-NQ', source: '' })
  })

  it('names the venue as the source, and the publisher only where there is no venue', () => {
    expect(rowLabels({ symbol: 'ES', name: 'E-mini', exchange: 'CME', type: 'future', dataSource: 'feed' }).source).toBe('CME')
    expect(rowLabels({ symbol: 'ES', name: 'E-mini', exchange: '', type: 'future', dataSource: 'feed' }).source).toBe('feed')
    expect(rowLabels({ symbol: 'ES', name: 'E-mini', exchange: '', type: 'future' }).source).toBe('')
  })
})

describe('the row model', () => {
  it('leads a search with recents on an empty query, and with the exact expression on a spread', () => {
    const recents = [{ symbol: 'ZB', name: '', exchange: '', type: '' }]
    expect(dialogRows({ mode: 'search', query: '', hits: CATALOG, loading: false, recents, curated: [], added: [] }).map((r) => r.row.symbol)).toEqual(['ZB', 'ES', 'NQ', 'BTC/USD'])
    expect(dialogRows({ mode: 'search', query: 'ES-NQ', hits: [CATALOG[0]!], loading: false, recents, curated: [], added: [] }).map((r) => r.row.symbol)).toEqual(['ES-NQ', 'ES'])
    // A plain pair is catalog identity: it offers a spread row only once the search settled empty.
    expect(dialogRows({ mode: 'search', query: 'BTC/USD', hits: [CATALOG[2]!], loading: false, recents: [], curated: [], added: [] }).map((r) => r.row.symbol)).toEqual(['BTC/USD'])
    expect(dialogRows({ mode: 'search', query: 'BTC/USD', hits: [], loading: false, recents: [], curated: [], added: [] }).map((r) => r.row.symbol)).toEqual(['BTC/USD'])
  })

  it('stacks added, curated and recent rows for an empty compare query', () => {
    const rows = dialogRows({ mode: 'compare', query: '', hits: CATALOG, loading: false, recents: [CATALOG[0]!, CATALOG[1]!], curated: [{ symbol: 'NQ', title: 'Nasdaq' }], added: [{ symbol: 'ZB', placement: 'same-percent', color: 'x', visible: true }] })
    expect(rows.map((r) => `${r.row.symbol}:${r.added}`)).toEqual(['ZB:true', 'NQ:false', 'ES:false'])
  })
})

describe('search mode', () => {
  it('is a modal dialog whose field controls the result listbox', async () => {
    const { dialog, input } = open('search')
    expect(dialog.element.getAttribute('aria-modal')).toBe('true')
    expect(dialog.element.getAttribute('aria-label')).toBe('Symbol search')
    expect(input.getAttribute('role')).toBe('combobox')
    expect(document.activeElement).toBe(input)
    await settle()
    expect(dialog.element.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('types, highlights with the arrows, and Enter sets the symbol through its command', async () => {
    const { w, dialog, input, rows } = open('search')
    input.value = 'n'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['NQ'])
    expect(rows()[0]!.querySelector('.qc-search-hit')?.textContent).toBe('N')
    input.value = ''
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows().length).toBe(3)
    // The list opens with no row claimed; the pointer only hovers, and the first arrow lands on the top.
    expect(rows().some((r) => r.getAttribute('aria-selected') === 'true')).toBe(false)
    expect(input.hasAttribute('aria-activedescendant')).toBe(false)
    rows()[2]!.dispatchEvent(new MouseEvent('mouseenter'))
    expect(rows()[2]!.getAttribute('aria-selected')).toBe('false')
    press(input, 'ArrowDown')
    expect(rows()[0]!.getAttribute('aria-selected')).toBe('true')
    press(input, 'ArrowDown')
    expect(rows()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(rows()[0]!.getAttribute('aria-selected')).toBe('false')
    expect(input.getAttribute('aria-activedescendant')).toBe(rows()[1]!.id)
    press(input, 'Enter')
    expect(w.chart.calls).toContain('symbol:NQ')
    expect(w.widget.recents.list()[0]?.symbol).toBe('NQ')
    const scrim = dialog.element.parentElement!
    expect(dialog.open()).toBe(false)
    expect(scrim.dataset.state).toBe('closing')
    expect(dialog.element.getAttribute('aria-hidden')).toBe('true')
    await vi.advanceTimersByTimeAsync(200)
    expect(w.overlays.querySelector('[role="dialog"]')).toBeNull()
  })

  it('narrows by an asset class chip named by the host, and the operators type into the field', async () => {
    const { input, rows, dialog } = open('search', { classes: ['future', 'crypto'] })
    const chips = [...dialog.element.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
    expect(chips.map((c) => c.textContent)).toEqual(['All', 'Futures', 'crypto'])
    chips[2]!.click()
    await settle()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['BTC/USD'])
    expect(chips[2]!.getAttribute('aria-pressed')).toBe('true')
    // The operators wait behind their toggle until asked for.
    const strip = dialog.element.querySelector<HTMLElement>('.qc-search-ops')!
    const toggle = dialog.element.querySelector<HTMLButtonElement>('.qc-search-actions-field > .qc-search-op:last-child')!
    expect(strip.hidden).toBe(true)
    expect(toggle.getAttribute('aria-label')).toBe('Show spread operators')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe(strip.id)
    toggle.click()
    expect(strip.hidden).toBe(false)
    expect(toggle.getAttribute('aria-label')).toBe('Hide spread operators')
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const ops = [...strip.querySelectorAll<HTMLButtonElement>('.qc-search-op')]
    expect(ops.map((o) => o.getAttribute('aria-label'))).toEqual(['Division', 'Subtraction', 'Addition', 'Multiplication', 'Exponentiation', 'Reciprocal'])
    ops[5]!.click()
    expect(input.value).toBe('1/')
    toggle.click()
    expect(strip.hidden).toBe(true)
  })

  it('shows the clear mark and its rule only over a query', async () => {
    const { input, dialog } = open('search')
    const clear = dialog.element.querySelector<HTMLButtonElement>('[aria-label="Clear"]')!
    const rule = dialog.element.querySelector<HTMLElement>('.qc-search-rule')!
    expect([clear.hidden, rule.hidden]).toEqual([true, true])
    input.value = 'es'
    input.dispatchEvent(new Event('input'))
    expect([clear.hidden, rule.hidden]).toEqual([false, false])
    clear.click()
    expect(input.value).toBe('')
    expect([clear.hidden, rule.hidden]).toEqual([true, true])
  })

  it('answers a question nothing matches in place of the list, and Enter takes the top row before an arrow moves', async () => {
    const { w, input, rows, dialog } = open('search')
    const list = dialog.element.querySelector<HTMLElement>('[role="listbox"]')!
    const status = dialog.element.querySelector<HTMLElement>('[role="status"]')!
    input.value = 'zzz'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows()).toEqual([])
    expect(list.hidden).toBe(true)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(status.textContent).toBe('No symbols match your criteria')
    expect(status.querySelector('svg')).not.toBeNull()
    input.value = 'e'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(list.hidden).toBe(false)
    expect(status.textContent).toBe('')
    press(input, 'Enter')
    expect(w.chart.calls).toContain('symbol:ES')
  })

  it('a denied symbol command leaves the chart alone', async () => {
    const { w, input, rows } = open('search', { access: (id) => id !== 'chart.symbol.set' })
    await settle()
    rows()[0]!.click()
    expect(w.chart.calls).toEqual([])
    expect(input.isConnected).toBe(true) // the dialog stays: nothing happened
  })
})

/** What a scope holds: markets the feed lists under other tickers, so a row says which source
 *  answered it. */
const HELD: SymbolRow[] = [
  { symbol: 'ESZ5', name: 'E-mini S&P 500 Dec', exchange: 'CME', type: 'future' },
  { symbol: 'GCZ5', name: 'Gold Dec', exchange: 'COMEX', type: 'future' },
]

/** A scope over its own catalog that records every question it is asked. */
function scopeOver(catalog: readonly SymbolRow[], extra: Partial<SearchScope> = {}): { scope: SearchScope; asks: { q: string; opts?: DatafeedSearchOptions }[] } {
  const asks: { q: string; opts?: DatafeedSearchOptions }[] = []
  const scope: SearchScope = {
    label: 'Northwind Watchlist',
    async search(q, opts) {
      asks.push({ q, opts })
      const needle = q.trim().toUpperCase()
      return { hits: catalog.filter((r) => (!needle || r.symbol.includes(needle)) && (!opts?.cls || r.type === opts.cls)), hasMore: false }
    },
    ...extra,
  }
  return { scope, asks }
}

/** A search that answers when the test says, so an answer can arrive after the viewer moved on. */
function heldSearch() {
  const calls: { q: string; resolve(page: SearchPage): void }[] = []
  return { calls, search: (q: string): Promise<SearchPage> => new Promise((resolve) => calls.push({ q, resolve })) }
}

const answer = (...symbols: string[]): SearchPage => ({ hits: symbols.map((symbol) => ({ symbol, name: symbol, exchange: 'X', type: 'future' })), hasMore: false })

describe('the search scope', () => {
  const chipOf = (dialog: { element: HTMLElement }): HTMLButtonElement | null => dialog.element.querySelector<HTMLButtonElement>('.qc-search-scope')
  const symbols = (rows: () => HTMLElement[]): (string | undefined)[] => rows().map((r) => r.dataset.symbolRow)

  it('opens on at the far edge of the class strip and asks the scope at once, never the feed', async () => {
    const { scope, asks } = scopeOver(HELD)
    const feedSearch = vi.fn(datafeed().search)
    const { dialog, rows } = open('search', { classes: ['future', 'crypto'], scope, feedSearch })
    const strip = dialog.element.querySelector<HTMLElement>('.qc-search-classes')!
    const chip = chipOf(dialog)!
    expect(strip.lastElementChild).toBe(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    // An opening is no keystroke: the scope hears its first question before any debounce.
    expect(asks).toEqual([{ q: '', opts: { limit: 50, cls: undefined } }])
    await settle()
    expect(symbols(rows)).toEqual(['ESZ5', 'GCZ5'])
    expect(feedSearch).not.toHaveBeenCalled()
  })

  it('opens off when the scope says so, and searches the feed', async () => {
    const { scope, asks } = scopeOver(HELD, { on: false })
    const { dialog, rows } = open('search', { scope })
    expect(chipOf(dialog)!.getAttribute('aria-pressed')).toBe('false')
    await settle()
    expect(symbols(rows)).toEqual(['ES', 'NQ', 'BTC/USD'])
    expect(asks).toEqual([])
  })

  it('asks the same query and classes of the other source at each press', async () => {
    const { scope, asks } = scopeOver(HELD)
    const feed = datafeed()
    const feedAsks: { q: string; opts?: DatafeedSearchOptions }[] = []
    const { dialog, input, rows } = open('search', { classes: ['future', 'crypto'], scope, feedSearch: (q, opts) => (feedAsks.push({ q, opts }), feed.search(q, opts)) })
    const chip = chipOf(dialog)!
    await settle()
    dialog.element.querySelectorAll<HTMLButtonElement>('.qc-search-class')[1]!.click()
    input.value = 'e'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(asks.at(-1)).toEqual({ q: 'e', opts: { limit: 50, cls: 'future' } })
    expect(symbols(rows)).toEqual(['ESZ5'])
    chip.click()
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await settle()
    expect(feedAsks).toEqual([{ q: 'e', opts: { limit: 50, cls: 'future' } }])
    expect(symbols(rows)).toEqual(['ES'])
    // Back on, the scope's answer to the same question stands at once while it is asked again.
    chip.click()
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(symbols(rows)).toEqual(['ESZ5'])
  })

  it('pages the scope a page at a time, as it pages the feed', async () => {
    const wide: SymbolRow[] = Array.from({ length: 120 }, (_, i) => ({ symbol: `W${i}`, name: `W${i}`, exchange: 'X', type: 'future' }))
    const search = vi.fn(async (_q: string, opts?: DatafeedSearchOptions): Promise<SearchPage> => {
      const offset = opts?.offset ?? 0
      return { hits: wide.slice(offset, offset + 50), hasMore: offset + 50 < wide.length }
    })
    const { input, rows } = open('search', { scope: { label: 'Wide', search } })
    await settle()
    expect(rows()).toHaveLength(50)
    for (let i = 0; i < 45; i++) press(input, 'ArrowDown')
    await settle()
    expect(search).toHaveBeenLastCalledWith('', { limit: 50, cls: undefined, offset: 50 })
    expect(rows()).toHaveLength(100)
  })

  it('drops an answer that arrives for the state the viewer left', async () => {
    const feed = heldSearch()
    const held = heldSearch()
    const { dialog, rows } = open('search', { scope: { label: 'Northwind Watchlist', search: held.search }, feedSearch: feed.search })
    const chip = chipOf(dialog)!
    expect(held.calls.map((c) => c.q)).toEqual([''])
    chip.click()
    await settle()
    expect(feed.calls.map((c) => c.q)).toEqual([''])
    // The scope answers the question the viewer left after they left it.
    held.calls[0]!.resolve(answer('LATE-SCOPE'))
    await settle()
    expect(symbols(rows)).toEqual([])
    chip.click()
    await settle()
    expect(held.calls.map((c) => c.q)).toEqual(['', ''])
    // And the feed, the other way.
    feed.calls[0]!.resolve(answer('LATE-FEED'))
    await settle()
    expect(symbols(rows)).toEqual([])
    held.calls[1]!.resolve(answer('SCOPED'))
    await settle()
    expect(symbols(rows)).toEqual(['SCOPED'])
  })

  it('lists the scope’s recents while on and the chart’s while off, and records a pick in the scope in both', async () => {
    const chart = memoryRecents()
    chart.promote(CATALOG[1]!)
    const kept = memoryRecents()
    kept.promote(HELD[1]!)
    const { scope } = scopeOver(HELD, { recents: kept })
    const first = open('search', { scope, recents: chart })
    const chip = chipOf(first.dialog)!
    await settle()
    expect(symbols(first.rows)).toEqual(['GCZ5', 'ESZ5'])
    chip.click()
    await settle()
    expect(symbols(first.rows)).toEqual(['NQ', 'ES', 'BTC/USD'])
    chip.click()
    expect(symbols(first.rows)).toEqual(['GCZ5', 'ESZ5'])
    first.rows().find((r) => r.dataset.symbolRow === 'ESZ5')!.click()
    expect(first.w.chart.calls).toContain('symbol:ESZ5')
    expect(kept.list().map((r) => r.symbol)).toEqual(['ESZ5', 'GCZ5'])
    expect(chart.list().map((r) => r.symbol)).toEqual(['ESZ5', 'NQ'])
    // A pick with the chip off is the chart's alone.
    const second = open('search', { scope, recents: chart })
    chipOf(second.dialog)!.click()
    await settle()
    second.rows().find((r) => r.dataset.symbolRow === 'ES')!.click()
    expect(chart.list().map((r) => r.symbol)).toEqual(['ES', 'ESZ5', 'NQ'])
    expect(kept.list().map((r) => r.symbol)).toEqual(['ESZ5', 'GCZ5'])
  })

  it('lists no recents in a scope that keeps none, and records its picks in the chart’s', async () => {
    const chart = memoryRecents()
    chart.promote(CATALOG[1]!)
    const { scope } = scopeOver(HELD)
    const { rows } = open('search', { scope, recents: chart })
    await settle()
    expect(symbols(rows)).toEqual(['ESZ5', 'GCZ5'])
    rows()[1]!.click()
    expect(chart.list().map((r) => r.symbol)).toEqual(['GCZ5', 'NQ'])
  })

  it('is a toggle button after the classes in the tab order, named for what a press does', () => {
    const { scope } = scopeOver(HELD)
    const { dialog } = open('search', { classes: ['future', 'crypto'], scope })
    const chip = chipOf(dialog)!
    expect(chip.tagName).toBe('BUTTON')
    expect(chip.type).toBe('button')
    expect(chip.tabIndex).toBe(0)
    expect(chip.getAttribute('aria-label')).toBe('Limit search to Northwind Watchlist')
    expect(chip.title).toBe('Limit search to Northwind Watchlist')
    expect(chip.querySelector('.qc-button-text')!.textContent).toBe('Northwind Watchlist')
    // The classes are a labelled group of their own; the scope is no class and stands beside it.
    const group = dialog.element.querySelector<HTMLElement>('[role="group"][aria-label="Asset class"]')!
    expect(group.contains(chip)).toBe(false)
    expect(chip.parentElement).toBe(group.parentElement)
    const reachable = focusables(dialog.element).filter((el) => el.matches('.qc-search-class, .qc-search-scope'))
    expect(reachable.map((el) => el.getAttribute('aria-label'))).toEqual(['All', 'Futures', 'crypto', 'Limit search to Northwind Watchlist'])
    // A press keeps the focus where it is: the chip is never rebuilt under it.
    chip.focus()
    chip.click()
    expect(document.activeElement).toBe(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    chip.click()
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    press(chip, 'Escape')
    expect(dialog.open()).toBe(false)
  })

  it('offers no chip to a host without a scope, and searches the feed with the chart’s recents', async () => {
    const chart = memoryRecents()
    chart.promote(CATALOG[1]!)
    const { dialog, rows } = open('search', { classes: ['future', 'crypto'], recents: chart })
    expect(chipOf(dialog)).toBeNull()
    await settle()
    expect(symbols(rows)).toEqual(['NQ', 'ES', 'BTC/USD'])
    // A scope of null at the opening is none either, and a strip with nothing in it is not drawn.
    const none = open('search', { scope: () => null })
    expect(chipOf(none.dialog)).toBeNull()
    expect(none.dialog.element.querySelector('.qc-search-classes')).toBeNull()
  })

  it('offers no scope to the compare family, which searches the feed', async () => {
    const read = vi.fn(() => scopeOver(HELD).scope)
    const compare = open('compare', { scope: read })
    expect(chipOf(compare.dialog)).toBeNull()
    expect(compare.dialog.element.querySelector('.qc-search-classes')).toBeNull()
    const rekey = open('change-symbol', { scope: read, classes: ['future'], changeFrom: 'ES', onPick: () => undefined })
    expect(chipOf(rekey.dialog)).toBeNull()
    await settle()
    expect(symbols(rekey.rows)).toEqual(['ES'])
    expect(read).not.toHaveBeenCalled()
  })

  it('paints the host’s mark inside the chip, and the venue painter is never asked for it', () => {
    const painted: number[] = []
    const exchanges: string[] = []
    const { scope } = scopeOver(HELD, {
      mark: ({ host, size }) => {
        painted.push(size)
        host.appendChild(document.createElement('img'))
        return () => undefined
      },
    })
    const { dialog } = open('search', { classes: ['future', 'crypto'], scope, venueMark: ({ exchange }) => { exchanges.push(exchange) } })
    const chip = chipOf(dialog)!
    const mark = chip.querySelector<HTMLElement>('.qc-search-scope-mark')!
    expect(chip.firstElementChild).toBe(mark)
    expect(mark.dataset.qcHost).toBe('true')
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    expect(mark.querySelector('img')).not.toBeNull()
    expect(painted).toEqual([18])
    expect(exchanges).not.toContain('Northwind Watchlist')
  })

  it('keeps the scope’s mark through renders and presses, then releases it with the surface', async () => {
    const disposed = vi.fn()
    const { scope } = scopeOver(HELD, {
      mark: ({ host }) => {
        host.appendChild(document.createElement('img'))
        return () => {
          disposed()
          host.replaceChildren()
        }
      },
    })
    const { dialog } = open('search', { scope })
    const chip = chipOf(dialog)!
    await settle()
    chip.click()
    await settle()
    chip.click()
    await settle()
    expect(dialog.element.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
    expect(chip.querySelector('img')).not.toBeNull()
    expect(disposed).not.toHaveBeenCalled()
    dialog.close()
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1))
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('writes the label’s initial where the host lends no mark', () => {
    const { scope } = scopeOver(HELD, { label: 'portfolio' })
    const { dialog } = open('search', { scope })
    expect(chipOf(dialog)!.querySelector('.qc-search-scope-mark')!.textContent).toBe('P')
  })
})

describe('compare and change-symbol modes', () => {
  it('compare adds at a placement, keeps the dialog open, and an added row removes', async () => {
    const { w, dialog, rows } = open('compare')
    expect(dialog.element.getAttribute('aria-label')).toBe('Compare symbols')
    expect(dialog.element.querySelector('.qc-search-classes')).toBeNull()
    await settle()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['NQ']) // the curated row
    const verbs = [...rows()[0]!.querySelectorAll<HTMLButtonElement>('.qc-search-actions button')]
    expect(verbs.map((v) => v.textContent)).toEqual(['Same % scale', 'New price scale', 'New pane'])
    verbs[2]!.click()
    expect(w.chart.calls).toContain('compare:add:NQ:new-pane')
    expect(dialog.open()).toBe(true)
    expect(rows()[0]!.querySelector('.qc-search-added')).not.toBeNull()
    rows()[0]!.click()
    expect(w.chart.calls).toContain('compare:remove:NQ')
  })

  it('paints each source through the host: the venue where the row names one, else the data source', async () => {
    const painted: string[] = []
    const dropped: string[] = []
    const paint =
      (kind: string) =>
      (request: { host: HTMLElement; size: number } & Record<string, unknown>) => {
        const name = String(request.exchange ?? request.dataSource)
        painted.push(`${kind}:${name}:${request.size}`)
        request.host.appendChild(document.createElement('img'))
        return () => dropped.push(name)
      }
    const { input, rows } = open('search', {
      catalog: [...CATALOG, { symbol: 'GOLD', name: 'Gold spot', exchange: '', type: 'metal', dataSource: 'feed' }],
      venueMark: paint('venue'),
      dataSourceMark: paint('dataSource'),
    })
    input.value = 'O'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['GOLD'])
    input.value = ''
    input.dispatchEvent(new Event('input'))
    await settle()
    // A host mark owns its box: the package's initial stands down under it.
    const es = rows().find((r) => r.dataset.symbolRow === 'ES')!.querySelector<HTMLElement>('.qc-search-mark')!
    expect(es.dataset.qcHost).toBe('true')
    expect(es.querySelector('img')).not.toBeNull()
    expect(es.textContent).toBe('')
    expect(painted).toEqual(expect.arrayContaining(['dataSource:feed:18', 'venue:CME:18']))
    // Each rebuild releases every box the last one painted.
    expect(dropped).toContain('feed')
  })

  it('writes a source as its initial where the host paints no mark', async () => {
    const { input, rows } = open('search')
    input.value = 'E'
    input.dispatchEvent(new Event('input'))
    await settle()
    const box = rows()[0]!.querySelector<HTMLElement>('.qc-search-mark')!
    expect(box.textContent).toBe('C')
    expect(box.dataset.qcHost).toBeUndefined()
  })

  it('change-symbol prefills and selects the symbol and hands the pick back', async () => {
    const picks: string[] = []
    const { input, rows } = open('change-symbol', { changeFrom: 'ES', onPick: (s) => picks.push(s) })
    expect(input.value).toBe('ES')
    await settle()
    rows()[0]!.click()
    expect(picks).toEqual(['ES'])
  })
})
