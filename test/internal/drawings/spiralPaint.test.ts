// Which way a fib spiral winds: clockwise on the pane out from its first point, or counterclockwise,
// each the mirror of the other across the line through its two points.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'

/** A pane 800 by 400 where a time is its own x and a price stands that far up from the bottom. */
const viewport: Viewport = {
  width: 800,
  height: 400,
  xOf: (time) => Number(time),
  yOf: (price) => 400 - price,
  timeAt: (x) => x as never,
  priceAt: (y) => 400 - y,
  barsBetween: (a, b) => (Number(b) - Number(a)) / 10,
  logicalOf: (time) => Number(time) / 10,
  timeOfLogical: (logical) => (logical * 10) as never,
}

/** The points a spiral's path passes through, in order. */
function path(d: IDrawing): [number, number][] {
  const out: [number, number][] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => (p === 'moveTo' || p === 'lineTo' ? (x: number, y: number) => out.push([x, y]) : () => undefined),
    set: () => true,
  })
  ;(d as IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return out
}

describe('a fib spiral', () => {
  it('winds clockwise on the pane, and counterclockwise as the mirror of it across its points', () => {
    // From (100, 200) to (200, 200) on the pane: the line through its points is y = 200.
    const d = drawingTools.create('fib_spiral', 's', [
      { time: 100 as never, price: 200 },
      { time: 200 as never, price: 200 },
    ])!
    const clockwise = path(d)
    // A quarter turn on from its second point the spiral stands a golden ratio as far out, below the
    // line on the pane when it winds clockwise and above it when it winds the other way.
    const out = 100 * 1.618033988749895
    const near = (points: [number, number][], x: number, y: number): boolean => points.some(([px, py]) => Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6)
    expect(near(clockwise, 100, 200 + out)).toBe(true)
    d.applyProps({ counterclockwise: true })
    const other = path(d)
    expect(near(other, 100, 200 - out)).toBe(true)
    expect(other).toHaveLength(clockwise.length)
    other.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(clockwise[i]![0], 6)
      expect(y).toBeCloseTo(400 - clockwise[i]![1], 6)
    })
  })
})
