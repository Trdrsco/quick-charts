import type { Point } from './types'

/** Distance from a point to the segment [a, b]. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Distance from a point to the infinite line through a and b. */
export function distanceToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / Math.sqrt(lengthSq)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Angle of a→b in radians, y-down screen space. */
export function angleOf(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/**
 * Extend the segment a→b along its own direction to the pane bounds. `left` extends behind `a`
 * (opposite the a→b direction), `right` extends beyond `b`. A zero-length segment is returned
 * unchanged — it has no direction to extend along.
 */
export function extendSegment(
  a: Point,
  b: Point,
  width: number,
  height: number,
  left: boolean,
  right: boolean,
): { a: Point; b: Point } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return { a, b }

  // Parametric p(t) = a + t·d: find the t range where the line crosses the pane box, then clamp
  // the requested sides to it. t=0 is `a`, t=1 is `b`.
  let tMin = -Infinity
  let tMax = Infinity
  if (dx !== 0) {
    const t0 = (0 - a.x) / dx
    const t1 = (width - a.x) / dx
    tMin = Math.min(t0, t1)
    tMax = Math.max(t0, t1)
  } else {
    if (a.x < 0 || a.x > width) return { a, b }
  }
  if (dy !== 0) {
    const t0 = (0 - a.y) / dy
    const t1 = (height - a.y) / dy
    tMin = Math.max(tMin, Math.min(t0, t1))
    tMax = Math.min(tMax, Math.max(t0, t1))
  } else if (a.y < 0 || a.y > height) {
    return { a, b }
  }
  if (tMin > tMax) return { a, b } // the line never crosses the pane

  const tA = left ? Math.min(0, tMin) : 0
  const tB = right ? Math.max(1, tMax) : 1
  return {
    a: { x: a.x + tA * dx, y: a.y + tA * dy },
    b: { x: a.x + tB * dx, y: a.y + tB * dy },
  }
}
