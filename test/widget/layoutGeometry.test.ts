import { describe, expect, it } from 'vitest'
import { ARRANGEMENTS, arrangementOf } from '../../src/layoutGrid'
import { dividersOf, moveDivider, validGeometry } from '../../src/widget/layoutGeometry'

describe('layout geometry', () => {
  it('accepts every catalog topology as durable normalized geometry', () => {
    expect(ARRANGEMENTS).toHaveLength(55)
    for (const arrangement of ARRANGEMENTS) expect(validGeometry(arrangement.rects, arrangement.rects)).toEqual(arrangement.rects)
  })

  it('moves only panes joined to an irregular divider segment', () => {
    const rects = arrangementOf('3s')!.rects
    const horizontal = dividersOf(rects).find((divider) => divider.axis === 'h')!
    const moved = moveDivider(rects, horizontal, 0.7)!
    expect(moved[0]).toEqual(rects[0])
    expect(moved[1]).toMatchObject({ x: 0.5, y: 0, w: 0.5, h: 0.7 })
    expect(moved[2]).toMatchObject({ x: 0.5, y: 0.7, w: 0.5 })
    expect(moved[2]!.h).toBeCloseTo(0.3)
    expect(validGeometry(moved, rects)).toEqual(moved)
  })

  it('preserves a T-junction while moving its trunk and branch independently', () => {
    const base = arrangementOf('2-1')!.rects
    const vertical = dividersOf(base).find((divider) => divider.axis === 'v')!
    const topMoved = moveDivider(base, vertical, 0.65)!
    expect(topMoved[2]).toEqual(base[2])
    const horizontal = dividersOf(topMoved).find((divider) => divider.axis === 'h')!
    const bothMoved = moveDivider(topMoved, horizontal, 0.6)!
    expect(bothMoved[0].h).toBe(0.6)
    expect(bothMoved[1].h).toBe(0.6)
    expect(bothMoved[2]).toMatchObject({ y: 0.6, h: 0.4 })
    expect(validGeometry(bothMoved, base)).toEqual(bothMoved)
  })

  it.each(([
    [{ x: 0, y: 0, w: 1.01, h: 1 }],
    [{ x: 0, y: 0, w: 0.01, h: 1 }],
    [{ x: 0, y: 0, w: Number.NaN, h: 1 }],
    [{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  ] as { x: number; y: number; w: number; h: number }[][]).map((geometry) => [geometry] as const))('rejects malformed normalized geometry %#', (geometry) => {
    const catalog = geometry.length === 1 ? arrangementOf('s')!.rects : arrangementOf('2h')!.rects
    expect(validGeometry(geometry, catalog)).toBeNull()
  })

  it('does not use viewport pixel minima when validating saved geometry', () => {
    const narrow = [{ x: 0, y: 0, w: 0.03, h: 1 }, { x: 0.03, y: 0, w: 0.97, h: 1 }]
    expect(validGeometry(narrow, arrangementOf('2h')!.rects)).toEqual(narrow)
  })

  it('keeps a grid center line whole but scopes the 2-2 top branch', () => {
    const grid = arrangementOf('4')!.rects
    expect(dividersOf(grid).find((divider) => divider.axis === 'v')).toMatchObject({ span: [0, 1] })
    const irregular = arrangementOf('2-2')!.rects
    const vertical = dividersOf(irregular).find((divider) => divider.axis === 'v')!
    expect(vertical.span).toEqual([0, 0.5])
    const moved = moveDivider(irregular, vertical, 0.65)!
    expect(moved.slice(2)).toEqual(irregular.slice(2))
  })

  it('refuses an impossible viewport minimum without deforming either pane', () => {
    const rects = arrangementOf('16c8')!.rects
    const divider = dividersOf(rects).find((entry) => entry.axis === 'v')!
    expect(moveDivider(rects, divider, 0.5, 0.6)).toBeNull()
  })
})
