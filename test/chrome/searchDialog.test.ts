// @vitest-environment happy-dom
// The symbol search dialog: the row model in each mode, the keyboard (arrows move the highlight,
// Enter acts, Escape closes), the class strip, the spread operators, and the verbs, every one a
// command: a pick sets the symbol, a compare adds at a placement, an added row removes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dialogRows, openSearchDialog } from '../../src/ui/chrome/searchDialog'
import type { ChartDatafeed, SymbolRow } from '../../src/datafeed'
import { fakeWidget, press } from './harness'

const CATALOG: SymbolRow[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'CME', type: 'future' },
  { symbol: 'BTC/USD', name: 'Bitcoin', exchange: 'X', type: 'crypto' },
]

const datafeed = (): ChartDatafeed => ({
  async search(q, opts) {
    const needle = q.trim().toUpperCase()
    const hits = CATALOG.filter((r) => (!needle || r.symbol.includes(needle)) && (!opts?.cls || r.type === opts.cls))
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

function open(mode: 'search' | 'compare' | 'change-symbol', extra: { access?: (id: string) => boolean; classes?: string[]; onPick?(s: string): void; changeFrom?: string } = {}) {
  const w = fakeWidget({ access: extra.access ? { command: extra.access } : undefined })
  const dialog = openSearchDialog({
    host: w.overlays,
    i18n: w.i18n,
    datafeed: datafeed(),
    commands: w.commands,
    recents: w.widget.recents,
    classes: () => extra.classes ?? null,
    classNames: { future: 'Futures' },
    curated: [{ symbol: 'NQ', title: 'Nasdaq' }],
    request: { mode, chart: w.chart.handle, changeFrom: extra.changeFrom, onPick: extra.onPick },
  })
  cleanup.push(() => (dialog.close(), w.dispose()))
  return { w, dialog, input: dialog.element.querySelector<HTMLInputElement>('.qc-search-input')!, rows: () => [...dialog.element.querySelectorAll<HTMLElement>('[role="option"]')] }
}

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
    const { w, input, rows } = open('search')
    input.value = 'n'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows().map((r) => r.dataset.symbolRow)).toEqual(['NQ'])
    expect(rows()[0]!.querySelector('.qc-search-hit')?.textContent).toBe('N')
    input.value = ''
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(rows().length).toBe(3)
    press(input, 'ArrowDown')
    expect(rows()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(input.getAttribute('aria-activedescendant')).toBe(rows()[1]!.id)
    press(input, 'Enter')
    expect(w.chart.calls).toContain('symbol:NQ')
    expect(w.widget.recents.list()[0]?.symbol).toBe('NQ')
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
    const ops = [...dialog.element.querySelectorAll<HTMLButtonElement>('.qc-search-ops .qc-search-op')]
    expect(ops.map((o) => o.getAttribute('aria-label'))).toEqual(['Division', 'Subtraction', 'Addition', 'Multiplication', 'Exponentiation', 'Reciprocal', 'Hide spread operators'])
    ops[5]!.click()
    expect(input.value).toBe('1/')
    ops[6]!.click()
    expect(ops[0]!.hidden).toBe(true)
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

  it('change-symbol prefills and selects the symbol and hands the pick back', async () => {
    const picks: string[] = []
    const { input, rows } = open('change-symbol', { changeFrom: 'ES', onPick: (s) => picks.push(s) })
    expect(input.value).toBe('ES')
    await settle()
    rows()[0]!.click()
    expect(picks).toEqual(['ES'])
  })
})
