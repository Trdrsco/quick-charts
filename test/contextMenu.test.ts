import { describe, expect, it } from 'vitest'
import { chartContextMenu, type ChartMenuContext } from '../src/contextMenu'
import menuUiSrc from '../src/contextMenuUi.ts?raw'

// The reference's own menu is the shape — order, verbatim wording, and which rows exist at all.
// Captured live from both the Trading Platform library and tradingview.com; see the layouts corpus.

const base: ChartMenuContext = {
  priceText: '4,512.25',
  symbol: 'ESU6',
  indicatorCount: 0,
  drawingCount: 0,
}

const labels = (c: Partial<ChartMenuContext> = {}) =>
  chartContextMenu({ ...base, ...c }).map((r) => (r.kind === 'separator' ? '—' : r.label))

describe('the level menu, in the reference order', () => {
  it('reads top to bottom as the reference does, with nothing about an account in it', () => {
    expect(labels()).toEqual([
      'Reset chart view',
      '—',
      'Copy price 4,512.25',
      'Paste',
      '—',
      'Settings…',
    ])
  })

  // The orders a level can hold are an account's business and an alert is an application's: the
  // chart's model has no row for either, and no field that could ask for one. An extension
  // contributes those rows for the level.
  it('offers no order or alert row and knows no order or alert field', () => {
    expect(labels().some((l) => /^(Buy|Sell) /.test(l))).toBe(false)
    expect(labels().some((l) => l.startsWith('Add order'))).toBe(false)
    expect(labels().some((l) => l.startsWith('Add alert'))).toBe(false)
    for (const field of ['aboveMarket', 'tradable', 'canTrade', 'qty', 'marksHidden', 'canAlert']) expect(field in base).toBe(false)
  })
})

describe('what a level does NOT offer', () => {
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

})

// The WIDGET serves a subset: no clipboard and no settings dialog. A row it cannot serve must not
// appear at all.
describe('a host that cannot serve a row does not show it', () => {
  const widget = { ...base, canPaste: false, canSettings: false }
  it('omits paste and settings', () => {
    const rows = labels(widget)
    expect(rows).not.toContain('Paste')
    expect(rows).not.toContain('Settings…')
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
    for (const c of [{}, { canPaste: false, canSettings: false }, { indicatorCount: 3 }]) {
      const rows = chartContextMenu({ ...base, ...(c as Partial<ChartMenuContext>) })
      expect(rows[0]!.kind).toBe('item')
      expect(rows[rows.length - 1]!.kind).toBe('item')
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i]!.kind === 'separator' && rows[i - 1]!.kind === 'separator').toBe(false)
      }
    }
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
