import { describe, expect, it } from 'vitest'
import { chartContextMenu, type ChartMenuContext } from '../src/contextMenu'
import menuUiSrc from '../src/contextMenuUi.ts?raw'
import { authoredStylesheet } from './theme/stylesheetSource'
import { BUILT_IN_THEMES } from '../src/theme/palettes'

/** The authored component recipes: the one place a chart visual is written. */
const css = authoredStylesheet()

// The menu's shape is pinned here: its order, its wording, and which rows exist at all. A level
// menu that quietly grows or reorders a row is a menu a viewer has to re-read every time.

const base: ChartMenuContext = {
  priceText: '4,512.25',
  symbol: 'ESU6',
  indicatorCount: 0,
  drawingCount: 0,
}

const labels = (c: Partial<ChartMenuContext> = {}) =>
  chartContextMenu({ ...base, ...c }).map((r) => (r.kind === 'separator' ? '—' : r.label))

describe('the context menu, in its own order', () => {
  it('reads top to bottom in one fixed order, with chart rows alone', () => {
    expect(labels()).toEqual([
      'Reset chart view',
      '—',
      'Copy price 4,512.25',
      'Paste',
      '—',
      'Settings…',
    ])
  })

  // Order and alert rows are a host's own, contributed for the level by an extension: the chart's
  // model has no row for either, and no field that could ask for one.
  it('offers no order or alert row and knows no order or alert field', () => {
    expect(labels().some((l) => /^(Buy|Sell) /.test(l))).toBe(false)
    expect(labels().some((l) => l.startsWith('Add order'))).toBe(false)
    expect(labels().some((l) => l.startsWith('Add alert'))).toBe(false)
    expect(Object.keys(base)).toEqual(['priceText', 'symbol', 'indicatorCount', 'drawingCount'])
  })
})

describe('what a level does NOT offer', () => {
  // Paste is offered whether or not anything is copied: pasting nothing is a no-op, and a row that
  // comes and goes with an invisible buffer reads as a glitch.
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

// A host that cannot serve a row must not show it: the widget's context menu never offers Settings
// (the settings dialog belongs to the selected drawing's own surfaces) and offers Paste only while
// the paste command would run.
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
  // The box model lives in the package stylesheet, which is the one place a rule lives; the painter
  // only names classes. So these read the authored recipes rather than a style string.
  const menu = css.slice(css.indexOf('.qc-menu {'), css.indexOf('/* Replay transport'))
  const overlay = css.slice(css.indexOf('.qc-overlay {'), css.indexOf('.qc-scrim {'))
  const row = css.slice(css.indexOf('.qc-menu-row {'), css.indexOf('.qc-menu-row:hover'))

  it('paints the row from ONE rule, so there is no second painting to drift from', () => {
    // The root rule is the only one that PAINTS a row. A menu may restate its rows' rhythm (height,
    // gap, margin, padding, radius) under its own class, but never their background or ink.
    expect(css.split('[data-qc-theme] .qc-menu-row {').length - 1).toBe(1)
    const scoped = [...css.matchAll(/\[data-qc-theme\] \.[\w-]+ \.qc-menu-row \{([^}]*)\}/g)].map((m) => m[1]!)
    expect(scoped.length).toBeGreaterThan(0)
    for (const block of scoped) {
      expect(block).not.toMatch(/background|(^|\s)color:/)
    }
  })

  // The row is its own rounded slot INSIDE the panel's padding, not a band cut off by the panel
  // edge: the panel insets its rows and each highlight rounds off within that inset, so a hover
  // reads as the row being picked rather than as a stripe running under the surface's corners.
  // The row still spans every pixel it is given, so the whole cell is the target.
  it('the row spans the full width and rounds off inside the panel', () => {
    expect(row).toContain('width: 100%')
    expect(row).toContain('border-radius: var(--qc-chrome-radius)')
  })

  it('the surface keeps its radius and CLIPS to it', () => {
    // Without the clip a square fill paints over the corners and out across the border.
    expect(overlay).toContain('border-radius: var(--qc-chrome-radiusLarge)')
    expect(BUILT_IN_THEMES.dark['chrome.radiusLarge']).toBe('6px')
    expect(menu).toContain('overflow: hidden')
  })

  it('wears one measured box model, so the two painters of this menu cannot drift', () => {
    // 6px inside the box, 6px on each side of a separator, and a 36px glyph cell flush left. The
    // row itself is the package's universal recipe: 32px tall on 8px side padding with 8px to the
    // label, which is the rhythm every list in the chrome keeps.
    expect(menu).toContain('padding: 6px 0')
    expect(menu).toContain('margin: 6px 0')
    expect(menu).toContain('flex: 0 0 36px')
    expect(menu).toContain('width: 36px')
    expect(row).toContain('height: 32px')
    expect(row).toContain('gap: 8px')
    expect(row).toContain('padding: 0 8px')
  })

  it('the painter names classes and writes no visual of its own', () => {
    expect(menuUiSrc).not.toContain('cssText')
    expect(menuUiSrc).toContain("box.className = 'qc-overlay qc-menu'")
    expect(menuUiSrc).toContain("b.className = 'qc-menu-row'")
  })
})
