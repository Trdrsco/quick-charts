import { describe, expect, it } from 'vitest'
import { chartContextMenu, type ChartMenuContext } from '../src/contextMenu'

// The reference's own menu is the shape — order, verbatim wording, and which rows exist at all.
// Captured live from both the Trading Platform library and tradingview.com; see the layouts corpus.

const base: ChartMenuContext = {
  priceText: '4,512.25',
  symbol: 'ESU6',
  aboveMarket: true,
  tradable: true,
  canTrade: true,
  canAlert: true,
  indicatorCount: 0,
  drawingCount: 0,
  marksHidden: false,
}

const labels = (c: Partial<ChartMenuContext> = {}) =>
  chartContextMenu({ ...base, ...c }).map((r) => (r.kind === 'separator' ? '—' : r.label))

describe('the level menu, in the reference order', () => {
  it('reads top to bottom as the reference does', () => {
    expect(labels()).toEqual([
      'Reset chart view',
      '—',
      'Copy price 4,512.25',
      'Paste',
      '—',
      'Add alert on ESU6 at 4,512.25…',
      'Sell ESU6 @ 4,512.25 limit',
      'Buy ESU6 @ 4,512.25 stop',
      'Add order on ESU6 at 4,512.25…',
      '—',
      'Hide marks on bars',
      '—',
      'Settings…',
    ])
  })

  // Only the two orders a level can HOLD. An entry that would fill on arrival is a market order,
  // not the order the trader pointed at.
  it('offers sell-limit and buy-stop above the market, and inverts below it', () => {
    expect(labels({ aboveMarket: true })).toContain('Sell ESU6 @ 4,512.25 limit')
    expect(labels({ aboveMarket: true })).toContain('Buy ESU6 @ 4,512.25 stop')
    expect(labels({ aboveMarket: false })).toContain('Buy ESU6 @ 4,512.25 limit')
    expect(labels({ aboveMarket: false })).toContain('Sell ESU6 @ 4,512.25 stop')
  })

  // Measured: above the market the reference lists Sell then Buy, below it Buy then Sell — the
  // LIMIT row leads either way.
  it('leads with the limit row in both directions', () => {
    const above = labels({ aboveMarket: true }).filter((l) => /^(Buy|Sell) /.test(l))
    const below = labels({ aboveMarket: false }).filter((l) => /^(Buy|Sell) /.test(l))
    expect(above[0]).toContain('limit')
    expect(below[0]).toContain('limit')
    expect(above[0]!.startsWith('Sell')).toBe(true)
    expect(below[0]!.startsWith('Buy')).toBe(true)
  })

  it('quotes a size only when the host knows one', () => {
    expect(labels({ qty: 3 })).toContain('Sell 3 ESU6 @ 4,512.25 limit')
    expect(labels()).toContain('Sell ESU6 @ 4,512.25 limit')
  })
})

describe('what a level does NOT offer', () => {
  // A seed carries a price and no symbol, so an entry taken from a pane charting another market
  // would arm the ticket at a price that is not its own.
  it('no trade rows on a pane charting something other than the armed instrument', () => {
    const rows = labels({ tradable: false })
    expect(rows.some((l) => /^(Buy|Sell) /.test(l))).toBe(false)
    expect(rows.some((l) => l.startsWith('Add order'))).toBe(false)
    // …but the symbol-honest rows stay
    expect(rows).toContain('Add alert on ESU6 at 4,512.25…')
    expect(rows).toContain('Copy price 4,512.25')
  })

  it('no trade rows without a ticket at all, and no alert row where alerts are off', () => {
    expect(labels({ canTrade: false }).some((l) => /^(Buy|Sell) /.test(l))).toBe(false)
    expect(labels({ canAlert: false }).some((l) => l.startsWith('Add alert'))).toBe(false)
  })

  // The reference offers Paste whether or not anything is copied — pasting nothing is a no-op, and
  // a row that comes and goes with an invisible buffer reads as a glitch.
  it('always offers Paste, and offers no remove row at zero', () => {
    expect(labels()).toContain('Paste')
    expect(labels().some((l) => l.startsWith('Remove'))).toBe(false)
  })
})

describe('counts and state', () => {
  it('pluralises each remove row on its own count', () => {
    expect(labels({ indicatorCount: 1, drawingCount: 1 })).toEqual(expect.arrayContaining(['Remove 1 indicator', 'Remove 1 drawing']))
    expect(labels({ indicatorCount: 2, drawingCount: 5 })).toEqual(expect.arrayContaining(['Remove 2 indicators', 'Remove 5 drawings']))
  })

  // The reference marks state with a CHECKMARK and never by rewording, so the label is stable.
  it('marks state with checked, leaving the wording alone', () => {
    const off = chartContextMenu({ ...base }).find((r) => r.kind === 'item' && r.id === 'hide-marks')
    const on = chartContextMenu({ ...base, marksHidden: true }).find((r) => r.kind === 'item' && r.id === 'hide-marks')
    expect(off).toMatchObject({ label: 'Hide marks on bars', checked: false })
    expect(on).toMatchObject({ label: 'Hide marks on bars', checked: true })
  })

  // Nothing in this menu sends an order. A pick composes the ticket and the trader submits there —
  // the reference has no such switch either.
  it('offers no way to place an order straight from the menu', () => {
    for (const c of [{}, { tradable: true, canTrade: true }, { indicatorCount: 2 }]) {
      expect(labels(c as Partial<ChartMenuContext>).some((l) => /instant/i.test(l))).toBe(false)
    }
  })
})

describe('separators', () => {
  it('never opens, closes, or doubles on an empty group', () => {
    for (const c of [{}, { tradable: false }, { canTrade: false, canAlert: false }, { indicatorCount: 3 }]) {
      const rows = chartContextMenu({ ...base, ...(c as Partial<ChartMenuContext>) })
      expect(rows[0]!.kind).toBe('item')
      expect(rows[rows.length - 1]!.kind).toBe('item')
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.kind === 'separator' && rows[i - 1]!.kind === 'separator').toBe(false)
      }
    }
  })
})
