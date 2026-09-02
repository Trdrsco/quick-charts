// The 55 layout arrangements as explicit release inventory (public-chart-library-boundary-plan.md
// PCL-1, PCL-5 "preserve all 55 arrangements, panes through 16"). layoutGrid.test.ts proves the
// geometry; this file pins the catalog itself, code by code and count by count, in picker
// menu's own order, so an arrangement added or dropped is a conscious event with a readable diff.
import { describe, expect, it } from 'vitest'
import { ARRANGEMENTS, LAYOUT_MENU_ROWS, arrangementOf } from '../../src/layoutGrid'

/** Every arrangement code with its pane count, in catalog order. */
const CODES: readonly (readonly [code: string, panes: number])[] = [
  ['s', 1],
  ['2h', 2],
  ['2v', 2],
  ['3h', 3],
  ['3v', 3],
  ['3s', 3],
  ['3r', 3],
  ['2-1', 3],
  ['1-2', 3],
  ['4', 4],
  ['4v', 4],
  ['4h', 4],
  ['4s', 4],
  ['4s-l', 4],
  ['1-3', 4],
  ['3-1', 4],
  ['2-2-l', 4],
  ['2-2-r', 4],
  ['2-2', 4],
  ['1-4', 5],
  ['5h', 5],
  ['5v', 5],
  ['5s', 5],
  ['5s-l', 5],
  ['2-3', 5],
  ['3-2', 5],
  ['4-1', 5],
  ['2-3-l', 5],
  ['2-3-r', 5],
  ['6', 6],
  ['6h', 6],
  ['6v', 6],
  ['6c', 6],
  ['2-4', 6],
  ['4-2', 6],
  ['4-3', 7],
  ['7h', 7],
  ['7s', 7],
  ['8', 8],
  ['8c', 8],
  ['8h', 8],
  ['8v', 8],
  ['9s', 9],
  ['5-4', 9],
  ['9h', 9],
  ['9v', 9],
  ['10c5', 10],
  ['10h', 10],
  ['10v', 10],
  ['12c6', 12],
  ['12c4', 12],
  ['12h', 12],
  ['14c7', 14],
  ['16c8', 16],
  ['16c4', 16],
]

/** The pane counts the catalog offers: one through ten, then twelve, fourteen, and sixteen. */
const PANE_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16]

describe('the 55 layout arrangements', () => {
  it('pins every code and its pane count, in catalog order', () => {
    expect(ARRANGEMENTS.map((a) => [a.code, a.count] as const)).toEqual(CODES)
    expect(CODES.length).toBe(55)
  })

  it('offers panes through 16 in exactly these counts', () => {
    expect([...new Set(ARRANGEMENTS.map((a) => a.count))].sort((a, b) => a - b)).toEqual(PANE_COUNTS)
    expect(Math.max(...ARRANGEMENTS.map((a) => a.count))).toBe(16)
  })

  it('names every arrangement in English, from the widget catalog and never the code', () => {
    for (const a of ARRANGEMENTS) {
      expect(a.label, a.code).not.toBe(a.code)
      expect(a.label.length, a.code).toBeGreaterThan(0)
    }
  })

  it('places every code in the menu row for its pane count, once', () => {
    const rows = new Map(LAYOUT_MENU_ROWS.map((r) => [r.label, r.codes]))
    for (const [code, panes] of CODES) expect(rows.get(String(panes)), code).toContain(code)
    expect(LAYOUT_MENU_ROWS.flatMap((r) => r.codes).length).toBe(55)
    for (const [code] of CODES) expect(arrangementOf(code)?.code).toBe(code)
  })
})
