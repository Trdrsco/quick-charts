import type { ControlPoint, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, paintArrowHead, withAlpha } from '../render/canvas'
import type { LineEnd } from './lines'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** Earlier saved highlighters stored the shared 1–4 line width and rendered it eightfold. New
 * strokes store their actual pixel width, so the style value matches the toolbar label. */
export function highlighterStrokeWidth(lineWidth: number): number {
  return lineWidth <= 4 ? Math.max(lineWidth * 8, 12) : lineWidth
}

/** Polyline through every anchor — the shared body of the freehand/multi-point family. */
abstract class StrokeDrawing<P extends Record<string, unknown> = Record<string, never>> extends Drawing<P> {
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
    const tolerance = hitTolerance(this.strokeWidth())
    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) return true
    }
    return false
  }

  protected strokeWidth(): number {
    return this.style.lineWidth
  }
}

/** Sampled points shape a freehand stroke, but are not individually editable handles. The whole
 * stroke remains selectable and movable by grabbing its ink. */
abstract class FreehandStroke<P extends Record<string, unknown> = Record<string, never>> extends StrokeDrawing<P> {
  override getControlPoints(_viewport: Viewport): ControlPoint[] {
    return []
  }
}

/** A stroke's two ends, each plain or an arrow. */
export type StrokeEndsProps = {
  leftEnd: LineEnd
  rightEnd: LineEnd
}

/** A brush's background switch, and its ends. */
export type BrushProps = StrokeEndsProps & {
  /** The area the stroke closes back to its start, filled in the drawing's fill. */
  fillBackground: boolean
}

/** Arrow heads at a stroke's ends, its first point the left end and its last the right. */
function paintEnds(ctx: CanvasRenderingContext2D, points: Point[], ends: StrokeEndsProps, style: DrawingStyle): void {
  if (ends.leftEnd === 'arrow') paintArrowHead(ctx, points[1]!, points[0]!, style)
  if (ends.rightEnd === 'arrow') paintArrowHead(ctx, points[points.length - 2]!, points[points.length - 1]!, style)
}

/** Freehand stroke captured while the pointer drags. */
export class Brush extends FreehandStroke<BrushProps> {
  readonly type: string = 'brush'

  protected override defaultProps(): BrushProps {
    return { fillBackground: false, leftEnd: 'normal', rightEnd: 'normal' }
  }

  /** A format-2 brush filled its stroke's closed shape wherever its fill showed. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, fillBackground: this._style.fillOpacity > 0 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    if (this.props.fillBackground && this.style.fillOpacity > 0) {
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
    paintEnds(ctx, points, this.props, this.style)
  }
}

/**
 * Brush variant: a wide stroke that reads as marker ink. Always solid — the translucency lives
 * in the color value itself (the default seeds ~35% alpha), so the opacity control is the whole
 * style surface.
 */
export class Highlighter extends FreehandStroke {
  override readonly type = 'highlighter'

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    ctx.save()
    ctx.setLineDash([])
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = highlighterStrokeWidth(this.style.lineWidth)
    this.tracePath(ctx, points, true)
    ctx.stroke()
    ctx.restore()
  }

  protected override strokeWidth(): number {
    return highlighterStrokeWidth(this.style.lineWidth)
  }
}

/** Click-placed polyline, an arrow at its last point unless its ends say otherwise. */
export class PathLine extends StrokeDrawing<StrokeEndsProps> {
  override readonly type = 'path'

  protected override defaultProps(): StrokeEndsProps {
    return { leftEnd: 'normal', rightEnd: 'arrow' }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    applyStroke(ctx, this.style)
    this.tracePath(ctx, points, false)
    ctx.stroke()
    paintEnds(ctx, points, this.props, this.style)
  }
}

/** A polygon's background switch: off, the polygon keeps its fill's color and opacity unpainted. */
export type PolylineProps = {
  fillBackground: boolean
}

/** Click-placed polygon; closes and fills once it has three points. */
export class Polyline extends StrokeDrawing<PolylineProps> {
  override readonly type = 'polyline'

  protected override defaultProps(): PolylineProps {
    return { fillBackground: true }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport)
    if (points.length < 2) return
    applyStroke(ctx, this.style)
    this.tracePath(ctx, points, false)
    if (points.length > 2) {
      ctx.closePath()
      if (this.props.fillBackground !== false && this.style.fillOpacity > 0) {
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
