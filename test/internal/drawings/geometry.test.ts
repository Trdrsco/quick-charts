import { describe, expect, it } from 'vitest'
import { angleOf, distanceToLine, distanceToSegment, extendSegment, midpoint } from '../src/core/geometry'

describe('distance helpers', () => {
  it('segment distance clamps to the endpoints', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3)
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBe(4) // beyond a → distance to a
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5) // beyond b → distance to b
  })

  it('line distance does not clamp', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(distanceToLine({ x: -100, y: 7 }, a, b)).toBe(7)
  })

  it('degenerate segments measure point distance', () => {
    const p = { x: 3, y: 4 }
    expect(distanceToSegment(p, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
  })

  it('midpoint and angle', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 6 })).toEqual({ x: 5, y: 3 })
    expect(angleOf({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(Math.PI / 2)
  })
})

describe('extendSegment — parametric clipping to the pane box', () => {
  const W = 100
  const H = 100

  it('extends right along the segment direction to the pane edge', () => {
    const { a, b } = extendSegment({ x: 10, y: 10 }, { x: 20, y: 20 }, W, H, false, true)
    expect(a).toEqual({ x: 10, y: 10 })
    expect(b.x).toBeCloseTo(100)
    expect(b.y).toBeCloseTo(100)
  })

  it('extends left behind the first point', () => {
    const { a, b } = extendSegment({ x: 10, y: 10 }, { x: 20, y: 20 }, W, H, true, false)
    expect(a.x).toBeCloseTo(0)
    expect(a.y).toBeCloseTo(0)
    expect(b).toEqual({ x: 20, y: 20 })
  })

  it('a steep line clips on the horizontal pane bounds, not the vertical', () => {
    const { b } = extendSegment({ x: 50, y: 10 }, { x: 52, y: 30 }, W, H, false, true)
    expect(b.y).toBeCloseTo(100)
    expect(b.x).toBeGreaterThan(52)
    expect(b.x).toBeLessThan(100)
  })

  it('vertical and horizontal segments extend along their own axis', () => {
    const vertical = extendSegment({ x: 40, y: 30 }, { x: 40, y: 60 }, W, H, true, true)
    expect(vertical.a).toEqual({ x: 40, y: 0 })
    expect(vertical.b).toEqual({ x: 40, y: 100 })
    const horizontal = extendSegment({ x: 30, y: 40 }, { x: 60, y: 40 }, W, H, true, true)
    expect(horizontal.a).toEqual({ x: 0, y: 40 })
    expect(horizontal.b).toEqual({ x: 100, y: 40 })
  })

  it('zero-length segments come back unchanged', () => {
    const same = { x: 5, y: 5 }
    expect(extendSegment(same, same, W, H, true, true)).toEqual({ a: same, b: same })
  })
})
