// @vitest-environment happy-dom
// The symbol search dialog: the row model in each mode, the keyboard (arrows move the highlight,
// Enter acts, Escape closes), the class strip, the scope chip, the spread operators, the row that
// lists one instrument on several venues and opens its other venues beneath it, and the verbs, every
// one a command: a pick sets the symbol, a compare pick adds at a placement, an added row removes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dialogRows, openSearchDialog, rowLabels, type DialogRow } from '../../src/ui/chrome/searchDialog'
import { tipText } from '../../src/ui/chrome/tips'
import type { ChartDatafeed, DatafeedSearchOptions, SearchPage, SymbolRow } from '../../src/datafeed'
import type { SearchScope } from '../../src/widget/options'
import { fakeWidget, press } from './harness'
import { createSearchSessionOwner, memoryRecents, type RecentsPort } from '../../src/search'
import { resolveMarkPainters } from '../../src/markPainters'
import { focusables } from '../../src/ui/controls/dom'
import { ICONS } from '../../src/ui/controls/icons'
import { authoredStylesheets } from '../theme/stylesheetSource'

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

  it('writes the ticker a row states, where the feed writes one apart from its symbol', () => {
    // One exchange prefix comes off a symbol on its own; a symbol that says more names its market
    // through the row's ticker, and the symbol stays what a pick hands back.
    expect(rowLabels({ symbol: 'EXCH:BOOK:NVDA', ticker: 'NVDA', name: 'NVIDIA Corp', exchange: 'EXCH', type: 'stock' })).toEqual({ ticker: 'NVDA', description: 'NVIDIA Corp', source: 'EXCH' })
    expect(rowLabels({ symbol: 'EXCH:BOOK:NVDA', name: 'NVIDIA Corp', exchange: 'EXCH', type: 'stock' }).ticker).toBe('EXCH:BOOK:NVDA')
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

/** One instrument listed on three venues, interleaved with markets of their own, as the feed lists them. */
const LISTED: SymbolRow[] = [
  { symbol: 'ETH', name: 'Ether', exchange: 'Alpha', type: 'crypto' },
  { symbol: 'ALPHA:BTCUSDT', ticker: 'BTCUSDT', name: 'Bitcoin', exchange: 'Alpha', type: 'crypto', group: 'BTC' },
  { symbol: 'SOL', name: 'Solana', exchange: 'Beta', type: 'crypto' },
  { symbol: 'BETA:BTCUSD', ticker: 'BTCUSD', name: 'Bitcoin', exchange: 'Beta', type: 'crypto', group: 'BTC' },
  { symbol: 'GAMMA:BTCUSDC', ticker: 'BTCUSDC', name: 'Bitcoin', exchange: 'Gamma', type: 'crypto', group: 'BTC' },
]

/** Each row of a model as its symbol: a grouped row with its members after a slash and `open` while
 *  its group stands open, a member beneath its open group after `>`, and a row on a group's panel
 *  with its place after `@`. */
const shape = (rows: readonly DialogRow[]): string[] =>
  rows.map((r) => {
    const base = r.members ? `${r.row.symbol}/${r.members.map((m) => m.symbol).join(',')}${r.open ? ' open' : ''}` : r.nested ? `> ${r.row.symbol}` : r.row.symbol
    return r.panel ? `${base}@${r.panel}` : base
  })

const rowsFor = (mode: 'search' | 'compare' | 'change-symbol', query: string, hits: readonly SymbolRow[], recents: readonly SymbolRow[] = [], open?: ReadonlySet<string>): DialogRow[] =>
  dialogRows({ mode, query, hits, loading: false, recents, curated: [], added: [], open })

describe('rows that share a group', () => {
  it('collapse into one closed row where the first of them stands, its members as the feed lists them and the first its primary', () => {
    const rows = rowsFor('search', 'b', LISTED)
    expect(shape(rows)).toEqual(['ETH', 'ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC', 'SOL'])
    expect(rows[1]).toEqual({ row: LISTED[1], added: false, members: [LISTED[1], LISTED[3], LISTED[4]], open: false })
    // Every search that picks one market groups: a change of symbol too.
    expect(shape(rowsFor('change-symbol', 'b', LISTED))).toEqual(shape(rows))
  })

  it('list an open group’s other members beneath its row, as the feed lists them, on one panel', () => {
    const rows = rowsFor('search', 'b', LISTED, [], new Set(['BTC']))
    expect(shape(rows)).toEqual(['ETH', 'ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC open@first', '> BETA:BTCUSD@middle', '> GAMMA:BTCUSDC@last', 'SOL'])
    expect(rows[2]).toEqual({ row: LISTED[3], added: false, nested: true, panel: 'middle' })
    expect(rows[3]!.row).toBe(LISTED[4])
    // Two members stand on a panel with a first and a last and nothing between.
    expect(shape(rowsFor('search', 'b', LISTED.slice(0, 4), [], new Set(['BTC'])))).toEqual(['ETH', 'ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD open@first', '> BETA:BTCUSD@last', 'SOL'])
    // An open key with no group of two or more behind it opens nothing.
    expect(shape(rowsFor('search', 'b', LISTED.slice(0, 3), [], new Set(['BTC', 'ETH'])))).toEqual(['ETH', 'ALPHA:BTCUSDT', 'SOL'])
  })

  it('join the row their group already has when they arrive on a later page, open or closed', () => {
    const first = rowsFor('search', 'b', LISTED.slice(0, 3))
    expect(shape(first)).toEqual(['ETH', 'ALPHA:BTCUSDT', 'SOL'])
    const both = rowsFor('search', 'b', LISTED)
    expect(both).toHaveLength(3)
    expect(shape(both)[1]).toBe('ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC')
    const open = new Set(['BTC'])
    expect(shape(rowsFor('search', 'b', LISTED.slice(0, 4), [], open)).slice(1, 3)).toEqual(['ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD open@first', '> BETA:BTCUSD@last'])
    expect(shape(rowsFor('search', 'b', LISTED, [], open)).slice(1, 4)).toEqual(['ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC open@first', '> BETA:BTCUSD@middle', '> GAMMA:BTCUSDC@last'])
  })

  it('make a plain row of a group with one member, and never group an empty group', () => {
    const lone: SymbolRow = { ...LISTED[0]!, group: 'ETH' }
    expect(rowsFor('search', 'e', [lone], [], new Set(['ETH']))).toEqual([{ row: lone, added: false }])
    const unnamed: SymbolRow[] = [
      { ...LISTED[0]!, group: '' },
      { ...LISTED[2]!, group: '' },
    ]
    expect(shape(rowsFor('search', 's', unnamed))).toEqual(['ETH', 'SOL'])
  })

  it('leave the recents a row each, keep a grouped row whole, and leave out an ungrouped hit a recent lists', () => {
    const recents = [LISTED[3]!, LISTED[4]!, LISTED[2]!]
    const rows = rowsFor('search', '', LISTED, recents)
    expect(shape(rows)).toEqual(['BETA:BTCUSD', 'GAMMA:BTCUSDC', 'SOL', 'ETH', 'ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC'])
    expect(rows.slice(0, 3).every((r) => r.members === undefined && r.nested === undefined)).toBe(true)
    // Open, the group lists every member beneath it while the recents above stay as they are.
    expect(shape(rowsFor('search', '', LISTED, recents, new Set(['BTC'])))).toEqual([
      'BETA:BTCUSD',
      'GAMMA:BTCUSDC',
      'SOL',
      'ETH',
      'ALPHA:BTCUSDT/ALPHA:BTCUSDT,BETA:BTCUSD,GAMMA:BTCUSDC open@first',
      '> BETA:BTCUSD@middle',
      '> GAMMA:BTCUSDC@last',
    ])
  })

  it('leave compare rows as they are, one market a row, whatever is open', () => {
    expect(rowsFor('compare', 'b', LISTED, [], new Set(['BTC']))).toEqual(LISTED.map((row) => ({ row, added: false })))
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

  it('opens on its field with no title band, and writes each row as its ticker over its description and kind', async () => {
    const { dialog, input, rows } = open('search')
    expect(dialog.element.querySelector('.qc-dialog-title')).toBeNull()
    expect(dialog.element.firstElementChild?.classList.contains('qc-search-field')).toBe(true)
    input.value = 'ES'
    input.dispatchEvent(new Event('input'))
    await settle()
    const row = rows()[0]!
    expect(row.querySelector('.qc-search-text > .qc-search-symbol')?.textContent).toBe('ES')
    expect(row.querySelector('.qc-search-line > .qc-search-name')?.textContent).toBe('E-mini S&P 500')
    expect(row.querySelector('.qc-search-line > .qc-search-kind')?.textContent).toBe('future')
    expect(row.querySelector<HTMLElement>('.qc-search-source .qc-search-mark')?.dataset.qcTip).toBe('CME')
  })

  it('wears the kind a row states in place of its type, and a contract that is no pair reads as its ticker and name', async () => {
    const catalog: SymbolRow[] = [
      { symbol: 'VENUE:SOL_USDC_PERP', ticker: 'SOL-PERP', name: 'Solana', exchange: 'Venue', type: 'crypto', currencyCode: 'USDC', pair: false, kind: 'perp' },
      { symbol: 'VENUE:SOL_USDC', ticker: 'SOLUSDC', name: 'Solana', exchange: 'Venue', type: 'crypto', currencyCode: 'USDC', kind: 'spot' },
    ]
    const { input, rows } = open('search', { catalog })
    input.value = 'SOL'
    input.dispatchEvent(new Event('input'))
    await settle()
    const [perp, spot] = rows()
    expect(perp!.querySelector('.qc-search-symbol')?.textContent).toBe('SOL-PERP')
    expect(perp!.querySelector('.qc-search-name')?.textContent).toBe('Solana')
    expect(perp!.querySelector('.qc-search-kind')?.textContent).toBe('perp')
    expect(spot!.querySelector('.qc-search-symbol')?.textContent).toBe('SOLUSDC')
    expect(spot!.querySelector('.qc-search-name')?.textContent).toBe('SOL / USDC')
    expect(spot!.querySelector('.qc-search-kind')?.textContent).toBe('spot')
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
    expect(chip.hasAttribute('title')).toBe(false)
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
    expect(painted).toEqual(expect.arrayContaining(['dataSource:feed:24', 'venue:CME:24']))
    // The source is written before its mark, which names it for the pointer and only shows to a reader.
    expect(es.previousElementSibling?.classList.contains('qc-search-exchange')).toBe(true)
    expect(es.previousElementSibling?.textContent).toBe('CME')
    expect(es.dataset.qcTip).toBe('CME')
    expect(es.hasAttribute('title')).toBe(false)
    expect(es.getAttribute('aria-hidden')).toBe('true')
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

describe('a grouped row', () => {
  const type = async (input: HTMLInputElement, query: string): Promise<void> => {
    input.value = query
    input.dispatchEvent(new Event('input'))
    await settle()
  }
  const pillOf = (row: HTMLElement): HTMLButtonElement | null => row.querySelector<HTMLButtonElement>('.qc-search-source > .qc-search-more')
  const chevron = (pill: HTMLElement): string => pill.querySelector('.qc-search-more-chevron')!.innerHTML
  /** A row's markup without its ids, which carry the dialog's own scope. */
  const html = (row: Element): string => row.outerHTML.replace(/ id="[^"]*"/g, '')
  const withoutGroup = ({ group: _, ...row }: SymbolRow): SymbolRow => row

  it('reads exactly as its first member’s own row, with a pill between the source’s name and its mark', async () => {
    const { w, dialog, input, rows } = open('search', { catalog: LISTED })
    await type(input, 'BTC')
    expect(rows()).toHaveLength(1)
    const row = rows()[0]!
    expect(row.dataset.symbolRow).toBe('ALPHA:BTCUSDT')
    expect(row.dataset.symbolGroup).toBe('BTC')
    expect(row.querySelector('.qc-symbol-badge')).not.toBeNull()
    expect(row.querySelector('.qc-search-text > .qc-search-symbol')?.textContent).toBe('BTCUSDT')
    expect([...row.querySelector('.qc-search-source')!.children].map((c) => c.getAttribute('class'))).toEqual(['qc-search-exchange', 'qc-search-more', 'qc-search-pile'])
    // Its members list on three venues, so its mark stands piled over the edges of the discs under it.
    expect([...row.querySelector('.qc-search-pile')!.children].map((c) => c.getAttribute('class'))).toEqual(['qc-search-pile-edges', 'qc-search-mark'])
    const pill = pillOf(row)!
    expect([pill.tagName, pill.type, pill.tabIndex]).toEqual(['BUTTON', 'button', 0])
    expect(pill.querySelector('.qc-search-more-count')?.textContent).toBe('+2')
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(pill.getAttribute('aria-label')).toBe('2 more listings')
    expect(pill.getAttribute('aria-label')).toBe('2 more listings')
    expect(pill.dataset.qcTip).toBe(pill.getAttribute('aria-expanded') === 'true' ? 'Collapse' : 'Expand')
    expect(chevron(pill)).toBe(w.icons.glyph(ICONS.chevronDown, { size: 16 }).outerHTML)
    expect(focusables(dialog.element)).toContain(pill)
    // Without its pill and its group, the row is the first member's own row, byte for byte.
    const plain = open('search', { catalog: [withoutGroup(LISTED[1]!)] })
    await type(plain.input, 'BTC')
    const bare = row.cloneNode(true) as HTMLElement
    bare.querySelector('.qc-search-more')!.remove()
    const pile = bare.querySelector('.qc-search-pile')!
    pile.replaceWith(pile.querySelector('.qc-search-mark')!)
    bare.removeAttribute('data-symbol-group')
    expect(html(bare)).toBe(html(plain.rows()[0]!))
  })

  it('piles its mark only when its members list on more than one venue', async () => {
    const sameVenue: SymbolRow[] = [
      { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future', group: 'ES' },
      { symbol: 'ES1!', name: 'E-mini S&P 500 continuous front month', exchange: 'CME', type: 'future', group: 'ES' },
      { symbol: 'CME:ESZ2026', name: 'E-mini S&P 500 Dec 2026', exchange: 'CME', type: 'future', group: 'ES' },
    ]
    const { input, rows } = open('search', { catalog: sameVenue })
    await type(input, 'ES')
    expect(rows()).toHaveLength(1)
    expect(pillOf(rows()[0]!)?.querySelector('.qc-search-more-count')?.textContent).toBe('+2')
    expect(rows()[0]!.querySelector('.qc-search-pile')).toBeNull()
    expect(rows()[0]!.querySelector('.qc-search-source > .qc-search-mark')).not.toBeNull()
  })

  it('opens and closes its group with the pill, its other members beneath it as rows of their own on one panel', async () => {
    const painted: string[] = []
    const venueMark: MarkHook<'exchange'> = ({ exchange, host, size }) => {
      painted.push(`${exchange}:${size}`)
      host.appendChild(document.createElement('img'))
      return () => undefined
    }
    const { w, dialog, input, rows } = open('search', { catalog: LISTED, venueMark })
    await type(input, 'BTC')
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    pillOf(rows()[0]!)!.dispatchEvent(press)
    // A pointer press leaves the keyboard in the field.
    expect(press.defaultPrevented).toBe(true)
    painted.length = 0
    pillOf(rows()[0]!)!.click()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['ALPHA:BTCUSDT', 'BETA:BTCUSD', 'GAMMA:BTCUSDC'])
    expect(rows().map((r) => r.dataset.qcPanel)).toEqual(['first', 'middle', 'last'])
    const pill = pillOf(rows()[0]!)!
    expect(pill.getAttribute('aria-expanded')).toBe('true')
    expect(chevron(pill)).toBe(w.icons.glyph(ICONS.chevronUp, { size: 16 }).outerHTML)
    // The pill opens the group and picks nothing.
    expect(w.chart.calls).toEqual([])
    expect(dialog.open()).toBe(true)
    // Each member reads as its own row, without a mark of its own: its ticker, its words, its kind,
    // its source by name and its source's mark, painted through the venue hook.
    const [, beta, gamma] = rows()
    for (const [row, ticker, venue] of [
      [beta!, 'BTCUSD', 'Beta'],
      [gamma!, 'BTCUSDC', 'Gamma'],
    ] as const) {
      expect(row.classList.contains('qc-search-row--nested')).toBe(true)
      expect(row.getAttribute('role')).toBe('option')
      expect(row.querySelector('.qc-symbol-badge')).toBeNull()
      expect(row.querySelector('.qc-search-symbol')?.textContent).toBe(ticker)
      expect(row.querySelector('.qc-search-name')?.textContent).toBe('Bitcoin')
      expect(row.querySelector('.qc-search-kind')?.textContent).toBe('crypto')
      expect(row.querySelector('.qc-search-exchange')?.textContent).toBe(venue)
      expect(row.querySelector('.qc-search-mark')?.querySelector('img')).not.toBeNull()
      expect(pillOf(row)).toBeNull()
    }
    expect(painted).toEqual(expect.arrayContaining(['Alpha:24', 'Beta:24', 'Gamma:24']))
    pillOf(rows()[0]!)!.click()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['ALPHA:BTCUSDT'])
    expect(rows()[0]!.dataset.qcPanel).toBeUndefined()
    expect(pillOf(rows()[0]!)!.getAttribute('aria-expanded')).toBe('false')
  })

  it('picks the member a nested row names, by the pointer or by Enter, and records that member in the recents', async () => {
    const pointer = open('search', { catalog: LISTED })
    await type(pointer.input, 'BTC')
    pillOf(pointer.rows()[0]!)!.click()
    pointer.rows()[2]!.click()
    expect(pointer.w.chart.calls).toEqual(['symbol:GAMMA:BTCUSDC'])
    expect(pointer.w.widget.recents.list()[0]?.symbol).toBe('GAMMA:BTCUSDC')
    expect(pointer.dialog.open()).toBe(false)
    const keyboard = open('search', { catalog: LISTED })
    await type(keyboard.input, 'BTC')
    pillOf(keyboard.rows()[0]!)!.click()
    press(keyboard.input, 'ArrowDown')
    press(keyboard.input, 'ArrowDown')
    expect(keyboard.rows()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(keyboard.input.getAttribute('aria-activedescendant')).toBe(keyboard.rows()[1]!.id)
    press(keyboard.input, 'Enter')
    expect(keyboard.w.chart.calls).toEqual(['symbol:BETA:BTCUSD'])
    expect(keyboard.w.widget.recents.list()[0]?.symbol).toBe('BETA:BTCUSD')
  })

  it('picks its first member from the row, by the pointer or by Enter, and leaves Left and Right to the field', async () => {
    const pointer = open('search', { catalog: LISTED })
    await type(pointer.input, 'BTC')
    pointer.rows()[0]!.querySelector<HTMLElement>('.qc-search-text')!.click()
    expect(pointer.w.chart.calls).toEqual(['symbol:ALPHA:BTCUSDT'])
    expect(pointer.w.widget.recents.list()[0]?.symbol).toBe('ALPHA:BTCUSDT')
    const keyboard = open('search', { catalog: LISTED })
    await type(keyboard.input, 'BTC')
    press(keyboard.input, 'ArrowDown')
    expect(press(keyboard.input, 'ArrowRight').defaultPrevented).toBe(false)
    expect(press(keyboard.input, 'ArrowLeft').defaultPrevented).toBe(false)
    expect(pillOf(keyboard.rows()[0]!)!.getAttribute('aria-expanded')).toBe('false')
    press(keyboard.input, 'Enter')
    expect(keyboard.w.chart.calls).toEqual(['symbol:ALPHA:BTCUSDT'])
  })

  it('keeps the keyboard’s focus on the pill it toggles, and the keyboard’s row on a row still listed', async () => {
    const { input, rows } = open('search', { catalog: LISTED })
    await type(input, 'BTC')
    const closed = pillOf(rows()[0]!)!
    closed.focus()
    closed.click()
    const opened = pillOf(rows()[0]!)!
    expect(opened).not.toBe(closed)
    expect(document.activeElement).toBe(opened)
    expect(opened.getAttribute('aria-expanded')).toBe('true')
    // A member under the keyboard folds into its group's row as the group closes.
    for (let i = 0; i < 3; i++) press(input, 'ArrowDown')
    expect(rows()[2]!.getAttribute('aria-selected')).toBe('true')
    opened.click()
    expect(rows()).toHaveLength(1)
    expect(rows()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(rows()[0]!.id)
    expect(document.activeElement).toBe(pillOf(rows()[0]!))
  })

  it('closes every group when the query changes', async () => {
    const { input, rows } = open('search', { catalog: LISTED })
    await type(input, 'BTC')
    pillOf(rows()[0]!)!.click()
    expect(rows()).toHaveLength(3)
    await type(input, 'BTCU')
    expect(rows()).toHaveLength(1)
    expect(pillOf(rows()[0]!)!.getAttribute('aria-expanded')).toBe('false')
  })

  it('renders a group of one exactly as the same row without a group', async () => {
    const plain = open('search', { catalog: [withoutGroup(LISTED[1]!)] })
    const lone = open('search', { catalog: [LISTED[1]!] })
    await type(plain.input, 'BTC')
    await type(lone.input, 'BTC')
    expect(lone.rows()).toHaveLength(1)
    expect(html(lone.rows()[0]!)).toBe(html(plain.rows()[0]!))
    expect(pillOf(lone.rows()[0]!)).toBeNull()
  })

  it('keeps one row for a group whose members arrive on different pages', async () => {
    const wide: SymbolRow[] = [
      LISTED[1]!,
      ...Array.from({ length: 49 }, (_, i) => ({ symbol: `W${i}`, name: `W${i}`, exchange: 'X', type: 'future' })),
      LISTED[3]!,
      { symbol: 'W49', name: 'W49', exchange: 'X', type: 'future' },
    ]
    const feedSearch = async (_q: string, opts?: DatafeedSearchOptions): Promise<SearchPage> => {
      const offset = opts?.offset ?? 0
      return { hits: wide.slice(offset, offset + 50), hasMore: offset + 50 < wide.length }
    }
    const { input, rows } = open('search', { feedSearch })
    await settle()
    expect(rows()).toHaveLength(50)
    expect(pillOf(rows()[0]!)).toBeNull()
    for (let i = 0; i < 45; i++) press(input, 'ArrowDown')
    await settle()
    expect(rows()).toHaveLength(51)
    expect(rows().filter((r) => r.dataset.symbolGroup === 'BTC')).toEqual([rows()[0]])
    expect(pillOf(rows()[0]!)!.querySelector('.qc-search-more-count')?.textContent).toBe('+1')
    expect(pillOf(rows()[0]!)!.getAttribute('aria-label')).toBe('1 more listing')
  })

  it('keeps the keyboard on the pill while a page lands and rebuilds the row', async () => {
    const wide: SymbolRow[] = [
      LISTED[1]!,
      LISTED[3]!,
      ...Array.from({ length: 48 }, (_, i) => ({ symbol: `W${i}`, name: `W${i}`, exchange: 'X', type: 'future' })),
      LISTED[4]!,
      { symbol: 'W48', name: 'W48', exchange: 'X', type: 'future' },
    ]
    const feedSearch = async (_q: string, opts?: DatafeedSearchOptions): Promise<SearchPage> => {
      const offset = opts?.offset ?? 0
      return { hits: wide.slice(offset, offset + 50), hasMore: offset + 50 < wide.length }
    }
    const { input, rows } = open('search', { feedSearch })
    await settle()
    const before = pillOf(rows()[0]!)!
    expect(before.querySelector('.qc-search-more-count')?.textContent).toBe('+1')
    before.focus()
    for (let i = 0; i < 45; i++) press(input, 'ArrowDown')
    await settle()
    const after = pillOf(rows()[0]!)!
    expect(after).not.toBe(before)
    expect(after.querySelector('.qc-search-more-count')?.textContent).toBe('+2')
    expect(document.activeElement).toBe(after)
  })

  it('stays a row a market in compare, each with its own source and placements', async () => {
    const { input, rows } = open('compare', { catalog: LISTED })
    await type(input, 'BTC')
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['ALPHA:BTCUSDT', 'BETA:BTCUSD', 'GAMMA:BTCUSDC'])
    for (const row of rows()) {
      expect(row.dataset.symbolGroup).toBeUndefined()
      expect(row.querySelector('.qc-search-more')).toBeNull()
      expect(row.querySelector('.qc-search-source > .qc-search-exchange')?.textContent).toBeTruthy()
      expect(row.querySelector('.qc-search-source > .qc-search-mark')).not.toBeNull()
      expect(row.querySelectorAll('.qc-search-actions button')).toHaveLength(3)
      // The placement pills stand where the source's name was, the source's mark still at the row's end.
      expect([...row.querySelector('.qc-search-source')!.children].map((child) => child.className)).toEqual(['qc-search-exchange', 'qc-search-actions', 'qc-search-mark'])
      for (const pill of row.querySelectorAll<HTMLButtonElement>('.qc-search-place')) {
        expect(pill.hasAttribute('title')).toBe(false)
        expect(tipText(pill)).toBeNull()
      }
    }
  })

  it('lines a nested row’s text up at 72px with every row’s text, and rounds the panel at its ends only', () => {
    const css = authoredStylesheets()['/src/styles/components/search.css']!.replace(/\r\n/g, '\n')
    const rule = (selector: string): string => {
      const at = css.indexOf(`[data-qc-theme] ${selector} {\n`)
      expect(at, selector).toBeGreaterThanOrEqual(0)
      return css.slice(at, css.indexOf('}', at))
    }
    const value = (block: string, property: string): string => block.match(new RegExp(`\\n  ${property}: ([^;]+);`))?.[1] ?? ''
    const inset = Number(value(rule('.qc-search-row'), 'padding').split(' ')[1]!.replace('px', ''))
    const badge = rule('.qc-search-row .qc-symbol-badge')
    const mark = Number(value(badge, 'width').replace('px', ''))
    const gap = Number(value(badge, 'margin-inline-end').replace('px', ''))
    expect([inset, mark, gap]).toEqual([20, 36, 16])
    expect(value(rule('.qc-search-row--nested'), 'padding-inline-start')).toBe(`${inset + mark + gap}px`)
    expect(value(rule('.qc-search-row[data-qc-panel]::after'), 'inset')).toBe(value(rule('.qc-search-row::before'), 'inset'))
    expect(value(rule(".qc-search-row[data-qc-panel='first']::after"), 'border-radius')).toBe('8px 8px 0 0')
    expect(value(rule(".qc-search-row[data-qc-panel='last']::after"), 'border-radius')).toBe('0 0 8px 8px')
  })
})
