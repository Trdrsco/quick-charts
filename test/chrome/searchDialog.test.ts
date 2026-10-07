// @vitest-environment happy-dom
// The symbol search dialog: the row model in each mode, the keyboard (arrows move the highlight,
// Enter acts, Escape closes), the class strip, the spread operators, and the verbs, every one a
// command: a pick sets the symbol, a compare pick adds at a placement, an added row removes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dialogRows, openSearchDialog, rowLabels } from '../../src/ui/chrome/searchDialog'
import type { ChartDatafeed, SymbolRow } from '../../src/datafeed'
import type { SearchScope } from '../../src/widget/options'
import { fakeWidget, press } from './harness'
import { createSearchSessionOwner } from '../../src/search'
import { resolveMarkPainters } from '../../src/markPainters'

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
  extra: { access?: (id: string) => boolean; classes?: string[]; scope?: SearchScope; onPick?(s: string): void; changeFrom?: string; catalog?: readonly SymbolRow[]; venueMark?: MarkHook<'exchange'>; dataSourceMark?: MarkHook<'dataSource'> } = {},
) {
  const w = fakeWidget({ access: extra.access ? { command: extra.access } : undefined })
  const dialog = openSearchDialog({
    host: w.overlays,
    i18n: w.i18n,
    icons: w.icons,
    search: createSearchSessionOwner(datafeed(extra.catalog)).create(),
    commands: w.commands,
    recents: w.widget.recents,
    classes: () => extra.classes ?? null,
    classNames: { future: 'Futures' },
    scope: () => extra.scope ?? null,
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

  it('names the search scope and paints its host mark at the far edge of the class strip', () => {
    const painted: number[] = []
    const exchanges: string[] = []
    const { dialog } = open('search', {
      classes: ['future', 'crypto'],
      scope: {
        label: 'Northwind Watchlist',
        mark: ({ host, size }) => {
          painted.push(size)
          host.appendChild(document.createElement('img'))
          return () => undefined
        },
      },
      venueMark: ({ exchange }) => { exchanges.push(exchange) },
    })
    const strip = dialog.element.querySelector<HTMLElement>('.qc-search-classes')!
    const badge = strip.lastElementChild as HTMLElement
    expect(badge.classList.contains('qc-search-scope')).toBe(true)
    expect(badge.getAttribute('aria-label')).toBe('Northwind Watchlist')
    expect(badge.textContent).toBe('Northwind Watchlist')
    expect(badge.querySelector('img')).not.toBeNull()
    expect(painted).toEqual([18])
    // The scope wears its own mark: the venue painter is never asked for it.
    expect(exchanges).not.toContain('Northwind Watchlist')
  })

  it('keeps the scope mark while results render, then releases it with the surface', async () => {
    const disposed = vi.fn()
    const { dialog } = open('search', {
      scope: {
        label: 'Northwind Watchlist',
        mark: ({ host }) => {
          host.appendChild(document.createElement('img'))
          return () => {
            disposed()
            host.replaceChildren()
          }
        },
      },
    })
    const badge = dialog.element.querySelector<HTMLElement>('.qc-search-scope')!
    await settle()
    expect(dialog.element.querySelectorAll('[role="option"]').length).toBeGreaterThan(0)
    expect(badge.querySelector('img')).not.toBeNull()
    expect(disposed).not.toHaveBeenCalled()
    dialog.close()
    await vi.waitFor(() => expect(disposed).toHaveBeenCalledTimes(1))
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('writes the scope initial when the host lends no mark', () => {
    const { dialog } = open('search', { scope: { label: 'portfolio' } })
    const badge = dialog.element.querySelector<HTMLElement>('.qc-search-scope')!
    expect(badge.querySelector('.qc-search-scope-mark')!.textContent).toBe('P')
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
