import { describe, expect, it } from 'vitest'
import { ARRANGEMENTS, LAYOUT_MENU_ROWS, arrangementOf } from '../src/layoutGrid'
import type { PaneRect } from '../src/layoutGrid'

const overlaps = (a: PaneRect, b: PaneRect) =>
  a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9

describe('the arrangement catalog', () => {
  it('holds all 55 reference codes, uniquely', () => {
    expect(ARRANGEMENTS.length).toBe(55)
    expect(new Set(ARRANGEMENTS.map((a) => a.code)).size).toBe(55)
  })

  it('every arrangement tiles the unit square exactly — full area, no overlaps, in bounds', () => {
    for (const a of ARRANGEMENTS) {
      expect(a.count, a.code).toBe(a.rects.length)
      const area = a.rects.reduce((sum, r) => sum + r.w * r.h, 0)
      expect(area, a.code).toBeCloseTo(1, 9)
      for (const r of a.rects) {
        expect(r.x, a.code).toBeGreaterThanOrEqual(0)
        expect(r.y, a.code).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w, a.code).toBeLessThanOrEqual(1 + 1e-9)
        expect(r.y + r.h, a.code).toBeLessThanOrEqual(1 + 1e-9)
      }
      for (let i = 0; i < a.rects.length; i++)
        for (let j = i + 1; j < a.rects.length; j++)
          expect(overlaps(a.rects[i]!, a.rects[j]!), `${a.code} panes ${i}/${j}`).toBe(false)
    }
  })

  it('menu rows carry every code once, labeled by the actual chart count', () => {
    const listed = LAYOUT_MENU_ROWS.flatMap((r) => r.codes)
    expect(listed.length).toBe(55)
    expect(new Set(listed).size).toBe(55)
    for (const row of LAYOUT_MENU_ROWS)
      for (const code of row.codes) expect(String(arrangementOf(code)?.count), code).toBe(row.label)
  })

  it('spot geometry from the captured icons: the exceptions decode the way the icons draw them', () => {
    // 2-2: two panes atop two FULL-WIDTH rows (not a 2×2 grid)
    expect(arrangementOf('2-2')?.rects[2]).toEqual({ x: 0, y: 0.5, w: 1, h: 0.25 })
    // 3r: stack left, large pane right
    expect(arrangementOf('3r')?.rects[2]).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    // 2-3-l: two full-height columns + a 3-stack on the RIGHT
    const l = arrangementOf('2-3-l')!
    expect(l.rects[0]).toEqual({ x: 0, y: 0, w: 1 / 3, h: 1 })
    expect(l.rects[2]!.x).toBeCloseTo(2 / 3, 9)
    // 9s is the 3×3 square; 6c is 2 columns × 3 rows
    expect(arrangementOf('9s')?.rects[4]).toEqual({ x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 })
    expect(arrangementOf('6c')?.rects[1]).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 / 3 })
    // 7s: large left + six stacked right
    expect(arrangementOf('7s')?.rects[0]).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(arrangementOf('7s')?.count).toBe(7)
  })

  it('unknown codes return null instead of throwing', () => {
    expect(arrangementOf('nope')).toBeNull()
  })
})
