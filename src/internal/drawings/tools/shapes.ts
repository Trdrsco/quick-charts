import type { Point, Viewport } from '../core/types'
import { Drawing, type AnyDrawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fillPaint } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

function pointInPolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function nearPolygonEdge(p: Point, polygon: readonly Point[], tolerance: number, close: boolean): boolean {
  const last = close ? polygon.length : polygon.length - 1
  for (let i = 0; i < last; i++) {
    if (distanceToSegment(p, polygon[i], polygon[(i + 1) % polygon.length]) <= tolerance) return true
  }
  return false
}

/** Stroke + optional fill for a closed polygon in one pass. */
function paintPolygon(
  ctx: CanvasRenderingContext2D,
  polygon: readonly Point[],
  drawing: AnyDrawing,
): void {
  if (polygon.length < 2) return
  applyStroke(ctx, drawing.style)
  ctx.beginPath()
  ctx.moveTo(polygon[0].x, polygon[0].y)
  for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y)
  ctx.closePath()
  const fill = fillPaint(drawing.style)
  if (fill) {
    ctx.fillStyle = fill
    ctx.fill()
  }
  ctx.stroke()
}

/** Axis-aligned rectangle spanned by two corner anchors. */
export class Rectangle extends Drawing {
  readonly type = 'rectangle'

  requiredAnchors(): number {
    return 2
  }

  protected corners(viewport: Viewport): Point[] | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return [
      { x: a.x, y: a.y },
      { x: b.x, y: a.y },
      { x: b.x, y: b.y },
      { x: a.x, y: b.y },
    ]
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const corners = this.corners(viewport)
    if (corners) paintPolygon(ctx, corners, this)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const corners = this.corners(viewport)
    if (!corners) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (nearPolygonEdge(point, corners, tolerance, true)) return true
    return this.style.fillOpacity > 0 && pointInPolygon(point, corners)
  }
}

/**
 * Rectangle at an arbitrary angle: anchors 1–2 span one edge, anchor 3 sets the extrusion —
 * the rectangle extends perpendicular from the base edge through the third point.
 */
export class RotatedRectangle extends Drawing {
  readonly type = 'rotated_rectangle'

  requiredAnchors(): number {
    return 3
  }

  protected corners(viewport: Viewport): Point[] | null {
    const [a, b, c] = this.anchorPixels(viewport)
    if (!a || !b || !c) return null
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lengthSq = dx * dx + dy * dy
    if (lengthSq === 0) return null
    // Perpendicular offset of c from the a→b edge, projected onto the unit normal.
    const t = ((c.x - a.x) * -dy + (c.y - a.y) * dx) / lengthSq
    const nx = -dy * t
    const ny = dx * t
    return [a, b, { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny }]
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const corners = this.corners(viewport)
    if (corners) paintPolygon(ctx, corners, this)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const corners = this.corners(viewport)
    if (!corners) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (nearPolygonEdge(point, corners, tolerance, true)) return true
    return this.style.fillOpacity > 0 && pointInPolygon(point, corners)
  }
}

/** Three-corner polygon. */
export class Triangle extends Drawing {
  readonly type = 'triangle'

  requiredAnchors(): number {
    return 3
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.anchorPixels(viewport).filter((p): p is Point => !!p)
    if (points.length === 3) paintPolygon(ctx, points, this)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const points = this.anchorPixels(viewport).filter((p): p is Point => !!p)
    if (points.length < 3) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (nearPolygonEdge(point, points, tolerance, true)) return true
    return this.style.fillOpacity > 0 && pointInPolygon(point, points)
  }
}

/** Circle from a center anchor and a radius anchor. */
export class Circle extends Drawing {
  readonly type = 'circle'

  requiredAnchors(): number {
    return 2
  }

  protected geometry(viewport: Viewport): { center: Point; radius: number } | null {
    const [center, rim] = this.anchorPixels(viewport)
    if (!center || !rim) return null
    return { center, radius: Math.hypot(rim.x - center.x, rim.y - center.y) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const geo = this.geometry(viewport)
    if (!geo) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.arc(geo.center.x, geo.center.y, geo.radius, 0, Math.PI * 2)
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const geo = this.geometry(viewport)
    if (!geo) return false
    const distance = Math.hypot(point.x - geo.center.x, point.y - geo.center.y)
    if (Math.abs(distance - geo.radius) <= hitTolerance(this.style.lineWidth)) return true
    return this.style.fillOpacity > 0 && distance < geo.radius
  }
}

/**
 * Axis-aligned ellipse: anchors 1–2 span the horizontal diameter, anchor 3 drags the vertical
 * radius from the diameter's midline.
 */
export class Ellipse extends Drawing {
  readonly type = 'ellipse'

  requiredAnchors(): number {
    return 3
  }

  protected geometry(viewport: Viewport): { center: Point; rx: number; ry: number } | null {
    const [a, b, c] = this.anchorPixels(viewport)
    if (!a || !b || !c) return null
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const rx = Math.abs(b.x - a.x) / 2
    const ry = Math.abs(c.y - center.y)
    if (rx === 0 || ry === 0) return null
    return { center, rx, ry }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const geo = this.geometry(viewport)
    if (!geo) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.ellipse(geo.center.x, geo.center.y, geo.rx, geo.ry, 0, 0, Math.PI * 2)
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const geo = this.geometry(viewport)
    if (!geo) return false
    // Normalized radial distance: 1 = on the ellipse. Tolerance scales by the smaller radius.
    const nx = (point.x - geo.center.x) / geo.rx
    const ny = (point.y - geo.center.y) / geo.ry
    const radial = Math.sqrt(nx * nx + ny * ny)
    const tolerance = hitTolerance(this.style.lineWidth) / Math.min(geo.rx, geo.ry)
    if (Math.abs(radial - 1) <= tolerance) return true
    return this.style.fillOpacity > 0 && radial < 1
  }
}

/** Sampled quadratic/cubic Bézier shared by the curved tools. */
function sampleBezier(controls: readonly Point[], samples = 32): Point[] {
  const out: Point[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    if (controls.length === 3) {
      const [p0, p1, p2] = controls
      const u = 1 - t
      out.push({
        x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
      })
    } else {
      const [p0, p1, p2, p3] = controls
      const u = 1 - t
      out.push({
        x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
        y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
      })
    }
  }
  return out
}

function paintSampled(ctx: CanvasRenderingContext2D, drawing: AnyDrawing, samples: Point[]): void {
  if (samples.length < 2) return
  applyStroke(ctx, drawing.style)
  ctx.beginPath()
  ctx.moveTo(samples[0].x, samples[0].y)
  for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y)
  ctx.stroke()
}

function hitSampled(point: Point, samples: Point[], tolerance: number): boolean {
  for (let i = 0; i < samples.length - 1; i++) {
    if (distanceToSegment(point, samples[i], samples[i + 1]) <= tolerance) return true
  }
  return false
}

/**
 * Bend line: anchors 1–2 are the ends, anchor 3 is the bend — the curve passes THROUGH it
 * (the Bézier control is derived so the midpoint lands on the bend anchor).
 */
export class Curve extends Drawing {
  readonly type = 'curve'

  requiredAnchors(): number {
    return 3
  }

  protected samples(viewport: Viewport): Point[] | null {
    const [a, b, bend] = this.anchorPixels(viewport)
    if (!a || !b || !bend) return null
    const control = { x: 2 * bend.x - (a.x + b.x) / 2, y: 2 * bend.y - (a.y + b.y) / 2 }
    return sampleBezier([a, control, b])
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.samples(viewport)
    if (samples) paintSampled(ctx, this, samples)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const samples = this.samples(viewport)
    return !!samples && hitSampled(point, samples, hitTolerance(this.style.lineWidth))
  }
}

/** S-curve: ends at anchors 1–2, shaped through the two bend anchors 3–4. */
export class DoubleCurve extends Drawing {
  readonly type = 'double_curve'

  requiredAnchors(): number {
    return 4
  }

  protected samples(viewport: Viewport): Point[] | null {
    const [a, b, bend1, bend2] = this.anchorPixels(viewport)
    if (!a || !b || !bend1 || !bend2) return null
    // Cubic through both bends at t=1/3 and t=2/3 (standard interpolation → control points).
    const c1 = {
      x: (-5 * a.x + 18 * bend1.x - 9 * bend2.x + 2 * b.x) / 6,
      y: (-5 * a.y + 18 * bend1.y - 9 * bend2.y + 2 * b.y) / 6,
    }
    const c2 = {
      x: (2 * a.x - 9 * bend1.x + 18 * bend2.x - 5 * b.x) / 6,
      y: (2 * a.y - 9 * bend1.y + 18 * bend2.y - 5 * b.y) / 6,
    }
    return sampleBezier([a, c1, c2, b], 48)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.samples(viewport)
    if (samples) paintSampled(ctx, this, samples)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const samples = this.samples(viewport)
    return !!samples && hitSampled(point, samples, hitTolerance(this.style.lineWidth))
  }
}

/** Circular arc through a chord (anchors 1–2) bent to pass through anchor 3. */
export class Arc extends Drawing {
  readonly type = 'arc'

  requiredAnchors(): number {
    return 3
  }

  protected samples(viewport: Viewport): Point[] | null {
    const [a, b, bend] = this.anchorPixels(viewport)
    if (!a || !b || !bend) return null
    const control = { x: 2 * bend.x - (a.x + b.x) / 2, y: 2 * bend.y - (a.y + b.y) / 2 }
    return sampleBezier([a, control, b])
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.samples(viewport)
    if (samples) paintSampled(ctx, this, samples)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const samples = this.samples(viewport)
    return !!samples && hitSampled(point, samples, hitTolerance(this.style.lineWidth))
  }
}
