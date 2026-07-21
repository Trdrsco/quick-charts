import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fontOf, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/**
 * Shared body of the pattern/wave tools: a polyline through every anchor with a circled letter
 * (or number) at each vertex. Subclasses supply the label sequence and any extra ink.
 */
export abstract class LabeledPolyline extends Drawing {
  protected abstract labels(): readonly string[]

  protected points(viewport: Viewport): (Point | null)[] {
    return this.anchorPixels(viewport)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport).filter((p): p is Point => !!p)
    if (points.length < 2) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
    this.paintExtras(ctx, points, viewport)
    this.paintLabels(ctx, points)
  }

  protected paintExtras(_ctx: CanvasRenderingContext2D, _points: Point[], _viewport: Viewport): void {}

  protected paintLabels(ctx: CanvasRenderingContext2D, points: Point[]): void {
    const labels = this.labels()
    ctx.save()
    ctx.setLineDash([])
    ctx.font = fontOf(this.style)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < points.length && i < labels.length; i++) {
      const p = points[i]
      // Place the pill away from the line: above when the vertex is a local high, below otherwise.
      const prev = points[i - 1] ?? points[i + 1]
      const dy = prev && prev.y > p.y ? -14 : 14
      const cy = p.y + dy
      ctx.fillStyle = withAlpha('#1b1f27', 0.95)
      ctx.beginPath()
      ctx.arc(p.x, cy, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = this.style.lineColor
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = this.style.lineColor
      ctx.fillText(labels[i], p.x, cy + 0.5)
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const points = this.points(viewport).filter((p): p is Point => !!p)
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) return true
    }
    return false
  }
}

/** Fill the triangle spanned by three points with the drawing's hue at low alpha. */
function fillTriangle(ctx: CanvasRenderingContext2D, color: string, a: Point, b: Point, c: Point): void {
  ctx.save()
  ctx.fillStyle = withAlpha(color, 0.12)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Five-point harmonic (X A B C D) with the two classic triangles shaded. */
export class XabcdPattern extends LabeledPolyline {
  readonly type: string = 'xabcd_pattern'

  requiredAnchors(): number {
    return 5
  }

  protected labels(): readonly string[] {
    return ['X', 'A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length >= 3) fillTriangle(ctx, this.style.lineColor, points[0], points[1], points[2])
    if (points.length >= 5) fillTriangle(ctx, this.style.lineColor, points[2], points[3], points[4])
  }
}

/** Cypher: same five-point construction, its own identity for defaults/recognition. */
export class CypherPattern extends XabcdPattern {
  override readonly type = 'cypher_pattern'
}

/** Four-point AB=CD pattern with the two legs shaded. */
export class AbcdPattern extends LabeledPolyline {
  readonly type = 'abcd_pattern'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length >= 4) {
      // The AC / BD guide diagonals, dashed.
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.setLineDash([4, 4])
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[2].x, points[2].y)
      ctx.moveTo(points[1].x, points[1].y)
      ctx.lineTo(points[3].x, points[3].y)
      ctx.stroke()
      ctx.restore()
    }
  }
}

/** Four-point triangle pattern: the zigzag plus its two converging boundary lines. */
export class TrianglePattern extends LabeledPolyline {
  readonly type = 'triangle_pattern'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 4) return
    // Boundaries connect the alternating swing points (A→C and B→D), extended to D's time.
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[2].x, points[2].y)
    ctx.moveTo(points[1].x, points[1].y)
    ctx.lineTo(points[3].x, points[3].y)
    ctx.stroke()
    ctx.restore()
    fillTriangle(ctx, this.style.lineColor, points[0], points[1], points[2])
  }
}

/** Seven-point head & shoulders with the neckline and shaded shoulders/head. */
export class HeadAndShoulders extends LabeledPolyline {
  readonly type = 'head_and_shoulders'

  requiredAnchors(): number {
    return 7
  }

  protected labels(): readonly string[] {
    // Left shoulder, head, right shoulder over the classic seven pivots.
    return ['', 'LS', '', 'H', '', 'RS', '']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 7) return
    // Neckline through the two troughs framing the head, extended across the pattern.
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[2].y + (points[0].x - points[2].x) * ((points[4].y - points[2].y) / ((points[4].x - points[2].x) || 1)))
    ctx.lineTo(points[6].x, points[2].y + (points[6].x - points[2].x) * ((points[4].y - points[2].y) / ((points[4].x - points[2].x) || 1)))
    ctx.stroke()
    ctx.restore()
    fillTriangle(ctx, this.style.lineColor, points[0], points[1], points[2])
    fillTriangle(ctx, this.style.lineColor, points[2], points[3], points[4])
    fillTriangle(ctx, this.style.lineColor, points[4], points[5], points[6])
  }
}
