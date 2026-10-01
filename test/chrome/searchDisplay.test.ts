// @vitest-environment happy-dom
// How a host has the symbol search offer its classes and its spread operators: spreads switched off
// or narrowed to some operators, the All chip hidden or renamed, several classes selected at once,
// and classes that hold narrower classes in a second row. A host that sets none of it gets the
// default search, asked of the feed exactly as before.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { offeredOperators, openSearchDialog } from '../../src/ui/chrome/searchDialog'
import { classBranches, classSelection } from '../../src/ui/chrome/searchClasses'
import { openSymbolSearch } from '../../src/ui/chrome/openSymbolSearch'
import type { ChartDatafeed, DatafeedSearchOptions, SearchClassNode, SymbolRow } from '../../src/datafeed'
import type { SearchDisplayOptions } from '../../src/widget/options'
import { createSearchController, createSearchSessionOwner, type SearchClassFilter } from '../../src/search'
import { resolveMarkPainters } from '../../src/markPainters'
import { focusables } from '../../src/ui/controls/dom'
import { fakeWidget, press } from './harness'

const CATALOG: SymbolRow[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' },
  { symbol: 'NQ', name: 'E-mini Nasdaq', exchange: 'CME', type: 'future' },
  { symbol: 'BTCUSDC', name: 'Bitcoin', exchange: 'X', type: 'usdc' },
  { symbol: 'BTCUSDT', name: 'Bitcoin', exchange: 'X', type: 'usdt' },
  { symbol: 'ETHUSDT', name: 'Ether', exchange: 'X', type: 'usdt' },
]

const SPOT: Record<string, readonly string[]> = { spot: ['usdc', 'usdt'] }

/** A feed that records every ask and narrows by `classes` when it is sent, else by `cls`. A parent
 *  class covers its children's rows. */
function recordingFeed() {
  const calls: { q: string; opts: DatafeedSearchOptions | undefined }[] = []
  const covers = (cls: string, type: string): boolean => cls === type || (SPOT[cls]?.includes(type) ?? false)
  const feed: ChartDatafeed = {
    async search(q, opts) {
      calls.push({ q, opts })
      const needle = q.trim().toUpperCase()
      const wanted = opts?.classes ?? (opts?.cls ? [opts.cls] : [])
      const hits = CATALOG.filter((r) => (!needle || r.symbol.includes(needle)) && (wanted.length === 0 || wanted.some((c) => covers(c, r.type))))
      return { hits, hasMore: false }
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

function open(options: { display?: SearchDisplayOptions; classes?: readonly (string | SearchClassNode)[]; mode?: 'search' | 'compare' } = {}) {
  const w = fakeWidget()
  const { feed, calls } = recordingFeed()
  const dialog = openSearchDialog({
    host: w.overlays,
    i18n: w.i18n,
    icons: w.icons,
    search: createSearchSessionOwner(feed).create(),
    commands: w.commands,
    recents: w.widget.recents,
    classes: () => options.classes ?? null,
    classNames: { future: 'Futures', spot: 'Spot', usdc: 'USDC', usdt: 'USDT' },
    painters: resolveMarkPainters({}),
    ...(options.display ? { display: options.display } : {}),
    request: { mode: options.mode ?? 'search', chart: w.chart.handle },
  })
  cleanup.push(() => (dialog.close({ animate: false }), w.dispose()))
  const box = dialog.element
  const input = box.querySelector<HTMLInputElement>('.qc-search-input')!
  return {
    dialog,
    box,
    input,
    calls,
    /** The last ask, without the page size every ask carries. */
    lastAsk: () => {
      const { limit: _limit, ...rest } = calls.at(-1)?.opts ?? {}
      return { q: calls.at(-1)?.q, ...rest }
    },
    type: async (text: string) => {
      input.value = text
      input.dispatchEvent(new Event('input'))
      await settle()
    },
    rows: () => [...box.querySelectorAll<HTMLElement>('[role="option"]')].map((r) => r.dataset.symbolRow),
    strip: () => box.querySelector<HTMLElement>('.qc-search-classes:not(.qc-search-subclasses)')!,
    topChips: () => [...box.querySelectorAll<HTMLButtonElement>('.qc-search-classes:not(.qc-search-subclasses) .qc-search-class')],
    subRows: () => [...box.querySelectorAll<HTMLElement>('.qc-search-subclasses')],
    pressed: (chips: HTMLButtonElement[]) => chips.filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent),
    toggle: () => box.querySelector<HTMLButtonElement>('[aria-controls$="-ops"]'),
  }
}

describe('the default search', () => {
  it('asks the feed exactly as it always has, with every operator and the expression row', async () => {
    const s = open({ classes: ['future', 'spot'] })
    await settle()
    expect(s.topChips().map((c) => c.textContent)).toEqual(['All', 'Futures', 'Spot'])
    expect(s.pressed(s.topChips())).toEqual(['All'])
    expect(s.calls.at(-1)!.opts).toEqual({ limit: 50, cls: undefined })
    expect('classes' in s.calls.at(-1)!.opts!).toBe(false)
    s.topChips()[1]!.click()
    await settle()
    expect(s.calls.at(-1)!.opts).toEqual({ limit: 50, cls: 'future' })
    expect('classes' in s.calls.at(-1)!.opts!).toBe(false)
    // A plain token class has no row beneath it, and a spot class holds none either until it is a node.
    expect(s.subRows()).toEqual([])
    expect(s.toggle()).not.toBeNull()
    expect(s.box.querySelector('.qc-search-rule')).not.toBeNull()
    expect([...s.box.querySelectorAll('.qc-search-ops .qc-search-op')].map((o) => o.getAttribute('aria-label'))).toEqual(['Division', 'Subtraction', 'Addition', 'Multiplication', 'Exponentiation', 'Reciprocal'])
    s.topChips()[0]!.click()
    await s.type('ES-NQ')
    expect(s.lastAsk()).toEqual({ q: 'ESNQ', cls: undefined })
    expect(s.rows()[0]).toBe('ES-NQ')
  })

  it('offers every operator for an absent or true option, and the listed ones in order otherwise', () => {
    expect(offeredOperators(undefined).map((o) => o.id)).toEqual(['division', 'subtraction', 'addition', 'multiplication', 'exponentiation', 'reciprocal'])
    expect(offeredOperators(true)).toBe(offeredOperators(undefined))
    expect(offeredOperators(false)).toEqual([])
    expect(offeredOperators({ operators: ['reciprocal', 'subtraction', 'reciprocal'] }).map((o) => o.id)).toEqual(['reciprocal', 'subtraction'])
  })
})

describe('spreads', () => {
  it('off: no operator toggle, no expression row, and the query reaches the feed as typed', async () => {
    const s = open({ display: { spreads: false } })
    expect(s.toggle()).toBeNull()
    expect(s.box.querySelector('.qc-search-ops')).toBeNull()
    expect(s.box.querySelector('.qc-search-rule')).toBeNull()
    await s.type('ES-NQ')
    expect(s.lastAsk()).toEqual({ q: 'ES-NQ', cls: undefined })
    expect(s.rows()).toEqual([])
    await s.type('ES+')
    expect(s.lastAsk().q).toBe('ES+')
    expect(s.rows()).not.toContain('ES+')
    // The highlight reads the query as typed too.
    await s.type('ES')
    expect(s.rows()).toEqual(['ES'])
    expect(s.box.querySelector('.qc-search-hit')?.textContent).toBe('ES')
  })

  it('a listed subset offers only those operators, in the listed order, and still reads expressions', async () => {
    const s = open({ display: { spreads: { operators: ['subtraction', 'division'] } } })
    s.toggle()!.click()
    const ops = [...s.box.querySelectorAll<HTMLButtonElement>('.qc-search-ops .qc-search-op')]
    expect(ops.map((o) => o.getAttribute('aria-label'))).toEqual(['Subtraction', 'Division'])
    ops[0]!.click()
    expect(s.input.value).toBe('-')
    await s.type('ES-NQ')
    expect(s.lastAsk().q).toBe('ESNQ')
    expect(s.rows()[0]).toBe('ES-NQ')
  })

  it('an empty list offers no toggle while a typed expression still reads as one', async () => {
    const s = open({ display: { spreads: { operators: [] } } })
    expect(s.toggle()).toBeNull()
    expect(s.box.querySelector('.qc-search-rule')).toBeNull()
    await s.type('ES-NQ')
    expect(s.rows()[0]).toBe('ES-NQ')
  })

  it('compare offers no operators, and spreads off keeps its expression rows off too', async () => {
    const on = open({ mode: 'compare' })
    expect(on.toggle()).toBeNull()
    on.dialog.close({ animate: false })
    const off = open({ mode: 'compare', display: { spreads: false } })
    await off.type('ES-NQ')
    expect(off.lastAsk().q).toBe('ES-NQ')
    expect(off.rows()).not.toContain('ES-NQ')
  })
})

describe('the All chip', () => {
  it('hidden, one class at a time: the first declared class starts selected and is asked for', async () => {
    const s = open({ classes: ['future', 'spot'], display: { allClasses: false } })
    await settle()
    expect(s.topChips().map((c) => c.textContent)).toEqual(['Futures', 'Spot'])
    expect(s.pressed(s.topChips())).toEqual(['Futures'])
    expect(s.calls.map((c) => c.opts)).toEqual([{ limit: 50, cls: 'future' }])
    expect(s.rows()).toEqual(['ES', 'NQ'])
    // Pressing the selected chip again keeps it: a choice of one with no All always holds one.
    s.topChips()[0]!.click()
    expect(s.pressed(s.topChips())).toEqual(['Futures'])
  })

  it('renamed: the chip wears the host label, pressed as the default is', () => {
    const s = open({ classes: ['future'], display: { allClasses: { label: 'Everything' } } })
    const all = s.topChips()[0]!
    expect(all.textContent).toBe('Everything')
    expect(all.getAttribute('aria-label')).toBe('Everything')
    expect(all.getAttribute('aria-pressed')).toBe('true')
  })
})

describe('several classes at once', () => {
  it('toggles chips independently, sends classes, and sends cls only while one is selected', async () => {
    const s = open({ classes: ['future', 'usdc', 'usdt'], display: { classSelection: 'multiple' } })
    await settle()
    const [all, future, usdc, usdt] = s.topChips()
    expect(s.lastAsk()).toEqual({ q: '', cls: undefined })
    future!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', classes: ['future'], cls: 'future' })
    expect(s.pressed(s.topChips())).toEqual(['Futures'])
    usdt!.click()
    await settle()
    expect(s.calls.at(-1)!.opts).toEqual({ limit: 50, classes: ['future', 'usdt'] })
    expect(s.calls.at(-1)!.opts!.cls).toBeUndefined()
    expect(s.pressed(s.topChips())).toEqual(['Futures', 'USDT'])
    expect(s.rows()).toEqual(['ES', 'NQ', 'BTCUSDT', 'ETHUSDT'])
    // Declared order, whatever order they were pressed in.
    usdc!.click()
    await settle()
    expect(s.lastAsk().classes).toEqual(['future', 'usdc', 'usdt'])
    future!.click()
    await settle()
    expect(s.lastAsk().classes).toEqual(['usdc', 'usdt'])
    // All clears the selection and asks for every class as the default does.
    all!.click()
    await settle()
    expect(s.pressed(s.topChips())).toEqual(['All'])
    expect(s.calls.at(-1)!.opts).toEqual({ limit: 50, cls: undefined })
    expect('classes' in s.calls.at(-1)!.opts!).toBe(false)
  })

  it('without an All chip, no selection is every class', async () => {
    const s = open({ classes: ['future', 'usdt'], display: { classSelection: 'multiple', allClasses: false } })
    await settle()
    expect(s.topChips().map((c) => c.textContent)).toEqual(['Futures', 'USDT'])
    expect(s.pressed(s.topChips())).toEqual([])
    expect(s.lastAsk()).toEqual({ q: '', cls: undefined })
    s.topChips()[1]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', classes: ['usdt'], cls: 'usdt' })
    s.topChips()[1]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', cls: undefined })
  })
})

describe('nested classes', () => {
  const NESTED: (string | SearchClassNode)[] = ['future', { id: 'spot', children: ['usdc', 'usdt'] }]

  it('shows a selected class’s children in a second row, and the feed hears the most specific class', async () => {
    const s = open({ classes: NESTED })
    await settle()
    expect(s.topChips().map((c) => c.textContent)).toEqual(['All', 'Futures', 'Spot'])
    const [row] = s.subRows()
    expect(row!.hidden).toBe(true)
    s.topChips()[2]!.click()
    await settle()
    expect(row!.hidden).toBe(false)
    const sub = [...row!.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
    expect(sub.map((c) => c.textContent)).toEqual(['All', 'USDC', 'USDT'])
    expect(s.pressed(sub)).toEqual(['All'])
    expect(s.lastAsk()).toEqual({ q: '', cls: 'spot' })
    expect(s.rows()).toEqual(['BTCUSDC', 'BTCUSDT', 'ETHUSDT'])
    sub[2]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', cls: 'usdt' })
    expect(s.pressed(sub)).toEqual(['USDT'])
    expect(s.pressed(s.topChips())).toEqual(['Spot'])
    expect(s.rows()).toEqual(['BTCUSDT', 'ETHUSDT'])
    sub[1]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', cls: 'usdc' })
    // The row's all chip returns to the whole class.
    sub[0]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', cls: 'spot' })
    // Another class puts the row away and forgets the child.
    sub[1]!.click()
    s.topChips()[1]!.click()
    await settle()
    expect(row!.hidden).toBe(true)
    expect(s.lastAsk()).toEqual({ q: '', cls: 'future' })
    s.topChips()[2]!.click()
    expect(s.pressed(sub)).toEqual(['All'])
  })

  it('keeps the second row a labelled group of pressed buttons in the tab order, and Escape closes from it', async () => {
    const s = open({ classes: NESTED, display: { allClasses: { label: 'Any' } } })
    const [row] = s.subRows()
    expect(row!.getAttribute('role')).toBe('group')
    expect(row!.getAttribute('aria-label')).toBe('Spot')
    expect(s.strip().getAttribute('role')).toBe('group')
    // Hidden, the row's chips are out of the dialog's tab order.
    const reachable = (): string[] => focusables(s.box).filter((el) => el.classList.contains('qc-search-class')).map((el) => el.textContent ?? '')
    expect(reachable()).toEqual(['Any', 'Futures', 'Spot'])
    s.topChips()[2]!.click()
    const sub = [...row!.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
    expect(sub.map((c) => c.textContent)).toEqual(['Any', 'USDC', 'USDT'])
    for (const chip of sub) {
      expect(chip.tagName).toBe('BUTTON')
      expect(chip.tabIndex).toBe(0)
      expect(chip.hasAttribute('aria-pressed')).toBe(true)
    }
    // The second row stands between the strip and the list, so Tab reaches it after the strip.
    expect(reachable()).toEqual(['Any', 'Futures', 'Spot', 'Any', 'USDC', 'USDT'])
    expect(s.strip().nextElementSibling).toBe(row)
    expect(row!.nextElementSibling?.getAttribute('role')).toBe('listbox')
    // A chip keeps focus through its own press: the row is never rebuilt under it.
    sub[1]!.focus()
    sub[1]!.click()
    expect(document.activeElement).toBe(sub[1])
    expect(sub[1]!.isConnected).toBe(true)
    press(sub[1]!, 'Escape')
    expect(s.dialog.open()).toBe(false)
  })

  it('selects several parents and children at once, in declared order', async () => {
    const s = open({ classes: NESTED, display: { classSelection: 'multiple' } })
    const [row] = s.subRows()
    s.topChips()[2]!.click()
    s.topChips()[1]!.click()
    await settle()
    expect(s.lastAsk().classes).toEqual(['future', 'spot'])
    const sub = [...row!.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
    sub[2]!.click()
    sub[1]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', classes: ['future', 'usdc', 'usdt'] })
    expect(s.pressed(sub)).toEqual(['USDC', 'USDT'])
    sub[1]!.click()
    await settle()
    expect(s.lastAsk().classes).toEqual(['future', 'usdt'])
    s.topChips()[1]!.click()
    await settle()
    expect(s.lastAsk()).toEqual({ q: '', classes: ['usdt'], cls: 'usdt' })
    // Turning the parent off drops its children with it.
    s.topChips()[2]!.click()
    await settle()
    expect(row!.hidden).toBe(true)
    expect(s.lastAsk()).toEqual({ q: '', cls: undefined })
  })

  it('renders two levels: a child’s own children are not offered, and the child narrows by its id', () => {
    const branches = classBranches(['future', { id: 'spot', children: [{ id: 'usdc', children: ['usdc-a', 'usdc-b'] }, 'usdt', 'usdt'] }, 'future', ''])
    expect(branches).toEqual([
      { id: 'future', children: [] },
      { id: 'spot', children: ['usdc', 'usdt'] },
    ])
    const s = open({ classes: ['future', { id: 'spot', children: [{ id: 'usdc', children: ['usdc-a'] }] }] })
    s.topChips()[2]!.click()
    expect(s.subRows().length).toBe(1)
    expect([...s.subRows()[0]!.querySelectorAll('.qc-search-class')].map((c) => c.textContent)).toEqual(['All', 'USDC'])
  })
})

describe('the selection model', () => {
  it('ignores a child of an unselected class and a class the feed never declared', () => {
    const selection = classSelection(classBranches([{ id: 'spot', children: ['usdc'] }, 'future']), { multiple: false, all: true })
    selection.pickChild('spot', 'usdc')
    selection.pickTop('nope')
    expect(selection.filter()).toBe('')
    selection.pickTop('spot')
    selection.pickChild('spot', 'usdt')
    expect(selection.filter()).toBe('spot')
    selection.pickChild('spot', 'usdc')
    expect(selection.filter()).toBe('usdc')
  })
})

describe('the controller with a class list', () => {
  it('sends classes, cls for a list of one, the same ask as every class for an empty list, and pages with the list', async () => {
    const asks: (DatafeedSearchOptions | undefined)[] = []
    const c = createSearchController({ search: async (_q, opts) => (asks.push(opts), { hits: [{ symbol: `S${asks.length}`, name: '', exchange: '', type: '' }], hasMore: true }) }, { pageSize: 1, debounceMs: 0 })
    const ask = async (cls: SearchClassFilter): Promise<void> => {
      c.search('x', cls)
      await vi.advanceTimersByTimeAsync(1)
    }
    await ask(['a', 'b'])
    expect(asks.at(-1)).toEqual({ limit: 1, classes: ['a', 'b'], cls: undefined })
    expect(c.state()).toMatchObject({ cls: '', classes: ['a', 'b'] })
    c.loadMore()
    await vi.advanceTimersByTimeAsync(1)
    expect(asks.at(-1)).toEqual({ limit: 1, classes: ['a', 'b'], cls: undefined, offset: 1 })
    await ask(['a'])
    expect(asks.at(-1)).toEqual({ limit: 1, classes: ['a'], cls: 'a' })
    expect(c.state()).toMatchObject({ cls: 'a', classes: ['a'] })
    await ask([])
    expect(asks.at(-1)).toEqual({ limit: 1, cls: undefined })
    expect('classes' in asks.at(-1)!).toBe(false)
    expect(c.state().classes).toBeUndefined()
    c.dispose()
  })
})

describe('the picker away from a chart', () => {
  it('takes the same display options', async () => {
    const { feed, calls } = recordingFeed()
    const handle = openSymbolSearch({ datafeed: feed, onPick: () => undefined, classes: ['future', 'usdt'], spreads: false, allClasses: false, classSelection: 'multiple' })
    cleanup.push(() => (handle.close(), vi.runAllTimers()))
    await settle()
    const box = document.querySelector<HTMLElement>('[data-role="symbol-search"]')!
    expect(box.querySelector('[aria-controls$="-ops"]')).toBeNull()
    const chips = [...box.querySelectorAll<HTMLButtonElement>('.qc-search-class')]
    expect(chips.map((c) => c.textContent)).toEqual(['future', 'usdt'])
    chips[0]!.click()
    chips[1]!.click()
    await settle()
    expect(calls.at(-1)!.opts).toEqual({ limit: 50, classes: ['future', 'usdt'] })
  })
})
