import { describe, expect, it } from 'vitest'
import { chartContextMenu, type ChartMenuContext } from '../src/contextMenu'
import menuUiSrc from '../src/contextMenuUi.ts?raw'

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

// The WIDGET serves a subset: no clipboard, no settings dialog, and its execution marks switch
// live/replay rather than shown/hidden. A row it cannot serve must not appear at all.
describe('a host that cannot serve a row does not show it', () => {
  const widget = { ...base, canAlert: false, canPaste: false, canSettings: false, marksHidden: null }
  it('omits paste, settings and the marks switch', () => {
    const rows = labels(widget)
    expect(rows).not.toContain('Paste')
    expect(rows).not.toContain('Settings…')
    expect(rows).not.toContain('Hide marks on bars')
    expect(rows).not.toContain('Add alert on ESU6 at 4,512.25…')
  })

  it('still offers what it CAN serve, with no dangling separator', () => {
    const rows = chartContextMenu(widget)
    expect(labels(widget)).toContain('Reset chart view')
    expect(labels(widget)).toContain('Copy price 4,512.25')
    expect(rows[0].kind).toBe('item')
    expect(rows[rows.length - 1].kind).toBe('item')
  })

  it('the defaults keep every existing caller unchanged', () => {
    expect(labels()).toContain('Paste')
    expect(labels()).toContain('Settings…')
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

describe('with no market, the menu names no side', () => {
  // Which orders a level can HOLD is a fact about the market, so with no mark there is no answer.
  // The pair was guessed once — a null mark fell through the above-market branch and offered a sell
  // LIMIT below the market, an order the venue would fill on arrival at a price the trader did not
  // mean. It is withheld now, and "Add order" carries the intent to the ticket instead.
  it('withholds the directional pair and keeps the way into the ticket', () => {
    const rows = labels({ aboveMarket: null })
    expect(rows.filter((l) => /^(Buy|Sell) /.test(l))).toEqual([])
    expect(rows).toContain('Add order on ESU6 at 4,512.25…')
  })

  it('still names both sides once a market is known, in the reference order', () => {
    expect(labels({ aboveMarket: true }).filter((l) => /^(Buy|Sell) /.test(l))).toEqual([
      'Sell ESU6 @ 4,512.25 limit',
      'Buy ESU6 @ 4,512.25 stop',
    ])
    expect(labels({ aboveMarket: false }).filter((l) => /^(Buy|Sell) /.test(l))).toEqual([
      'Buy ESU6 @ 4,512.25 limit',
      'Sell ESU6 @ 4,512.25 stop',
    ])
  })
})

describe('a menu row highlights as a ROW', () => {
  // The hover is a selection: it fills the row edge to edge and squarely. A radius on the row makes
  // it read as a floating pill inside the menu instead — the SURFACE is the thing that is rounded.
  // Pinned because the app paints this same menu from its own painter, and two paintings of one
  // menu are two things that can drift.
  it('the row spans the full width and carries no radius', () => {
    expect(menuUiSrc).toContain('width:100%')
    expect(menuUiSrc).not.toContain('border:0;border-radius:4px')
  })

  it('the surface keeps its radius and CLIPS to it', () => {
    // Without the clip a square fill paints over the corners and out across the border.
    expect(menuUiSrc).toContain('border-radius:6px')
    expect(menuUiSrc).toContain('overflow:hidden')
  })

  it('wears the same box model the app paints, read off the reference itself', () => {
    // Two paintings of one menu; the numbers come from the reference's live DOM, not from either
    // painter's taste. 6px inside the box, 6px on each side of a separator, a 36px glyph cell
    // flush left, 6px to the label, 20px of right padding.
    expect(menuUiSrc).toContain('padding:6px 0')
    expect(menuUiSrc).toContain('margin:6px 0')
    expect(menuUiSrc).toContain('width:36px;flex:0 0 36px')
    expect(menuUiSrc).toContain('gap:6px')
    expect(menuUiSrc).toContain('padding:0 20px 0 0')
  })
})
