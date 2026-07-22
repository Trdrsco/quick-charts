import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, paintArrowHead, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** Polyline through every anchor — the shared body of the freehand/multi-point family. */
abstract class StrokeDrawing extends Drawing {
  requiredAnchors(): number {
    return 2
  }

  protected points(viewport: Viewport): Point[] {
    return this.anchorPixels(viewport).filter((p): p is Point => !!p)
  }

  protected tracePath(ctx: CanvasRenderingContext2D, points: Point[], smooth: boolean): void {
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    if (smooth && points.length > 2) {
      // Midpoint quadratic smoothing keeps a hand-drawn stroke from looking segmented.
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2
        const midY = (points[i].y + points[i + 1].y) / 2
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY)
      }
      const last = points[points.length - 1]
      ctx.lineTo(last.x, last.y)
    } else {
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const points = this.points(viewport)
    const tolerance = hitTolerance(this.style.lineWidth) + this.extraHitWidth()
    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) return true
    }
    return false
  }

  protected extraHitWidth(): number {
    return 0
  }
}

/** Freehand stroke captured while the pointer drags. */
export class Brush extends StrokeDrawing {
  readonly type: string = 'brush'

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    // The background channel fills the stroke's enclosed area (path closed back to the start).
    if (this.style.fillOpacity > 0) {
      ctx.save()
      ctx.fillStyle = withAlpha(this.style.fillColor, this.style.fillOpacity)
      this.tracePath(ctx, points, true)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    applyStroke(ctx, this.style)
    this.tracePath(ctx, points, true)
    ctx.stroke()
  }
}

/**
 * Brush variant: a wide stroke that reads as marker ink. Always solid — the translucency lives
 * in the color value itself (the default seeds ~35% alpha), so the opacity control is the whole
 * style surface.
 */
export class Highlighter extends StrokeDrawing {
  override readonly type = 'highlighter'

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    ctx.save()
    ctx.setLineDash([])
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = Math.max(this.style.lineWidth * 8, 12)
    this.tracePath(ctx, points, true)
    ctx.stroke()
    ctx.restore()
  }

  protected override extraHitWidth(): number {
    return Math.max(this.style.lineWidth * 4, 6)
  }
}

/** Click-placed polyline with an arrow at its final point. */
export class PathLine extends StrokeDrawing {
  override readonly type = 'path'

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    applyStroke(ctx, this.style)
    this.tracePath(ctx, points, false)
    ctx.stroke()
    paintArrowHead(ctx, points[points.length - 2], points[points.length - 1], this.style)
  }
}

/** Click-placed polygon; closes and fills once it has three points. */
export class Polyline extends StrokeDrawing {
  override readonly type = 'polyline'

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    applyStroke(ctx, this.style)
    this.tracePath(ctx, points, false)
    if (points.length > 2) {
      ctx.closePath()
      if (this.style.fillOpacity > 0) {
        ctx.fillStyle = withAlpha(this.style.fillColor, this.style.fillOpacity)
        ctx.fill()
      }
    }
    ctx.stroke()
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    if (super.testHit(point, viewport)) return true
    const points = this.points(viewport)
    if (points.length < 3) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return distanceToSegment(point, points[points.length - 1], points[0]) <= tolerance
  }
}
