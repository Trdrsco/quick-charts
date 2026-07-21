import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint } from '../core/geometry'
import { applyStroke, formatPrice, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

export type LineEnd = 'normal' | 'arrow'

/** Props shared by the two-point line family. Tool identity = these defaults. */
export type TrendLineProps = {
  extendLeft: boolean
  extendRight: boolean
  leftEnd: LineEnd
  rightEnd: LineEnd
}

const LINE_PROPS: TrendLineProps = {
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
}

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/**
 * Two-anchor straight line. The whole family (trend line, ray, extended line, arrow, info line,
 * trend angle) is this geometry under different prop defaults and decorations.
 */
export class TrendLine extends Drawing<TrendLineProps> {
  readonly type: string = 'trend_line'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS }
  }

  requiredAnchors(): number {
    return 2
  }

  /** The on-screen segment after extension — the shared basis for painting and hit-testing. */
  protected segment(viewport: Viewport): { a: Point; b: Point } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const { extendLeft, extendRight } = this.props
    if (!extendLeft && !extendRight) return { a: pa, b: pb }
    return extendSegment(pa, pb, viewport.width, viewport.height, extendLeft, extendRight)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const seg = this.segment(viewport)
    if (!seg) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, seg.a, seg.b)
    if (this.props.leftEnd === 'arrow') paintArrowHead(ctx, seg.b, seg.a, this.style)
    if (this.props.rightEnd === 'arrow') paintArrowHead(ctx, seg.a, seg.b, this.style)
    this.paintDecorations(ctx, viewport)
  }

  /** Extra ink beyond the segment (stats, angle marks) — the family variants override. */
  protected paintDecorations(_ctx: CanvasRenderingContext2D, _viewport: Viewport): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    const seg = this.segment(viewport)
    if (!seg) return false
    return distanceToSegment(point, seg.a, seg.b) <= hitTolerance(this.style.lineWidth)
  }
}

export class Ray extends TrendLine {
  override readonly type = 'ray'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, extendRight: true }
  }
}

export class ExtendedLine extends TrendLine {
  override readonly type = 'extended'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, extendLeft: true, extendRight: true }
  }
}

export class Arrow extends TrendLine {
  override readonly type = 'arrow'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, rightEnd: 'arrow' }
  }
}

/** Trend line that always reports its measurements (price delta, %, bars, angle). */
export class InfoLine extends TrendLine {
  override readonly type = 'info_line'

  protected override paintDecorations(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [a, b] = this.anchors
    if (!a || !b) return
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return

    const dPrice = b.price - a.price
    const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
    const bars = viewport.barsBetween(a.time, b.time)
    const angleDeg = -angleOf(pa, pb) * (180 / Math.PI) // y-down screen → trader's y-up angle

    const parts = [
      `${dPrice >= 0 ? '+' : ''}${formatPrice(dPrice)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`,
      bars === null ? null : `${Math.round(bars)} bars`,
      `${angleDeg.toFixed(0)}°`,
    ].filter((s): s is string => s !== null)

    const mid = midpoint(pa, pb)
    paintLabel(ctx, parts.join('  ·  '), { x: mid.x, y: mid.y - 14 }, this.style, {
      align: 'center',
      background: withAlpha('#1b1f27', 0.92),
    })
  }
}

/** Trend line that reports its slope as an angle, with a horizontal reference arc. */
export class TrendAngle extends TrendLine {
  override readonly type = 'trend_angle'

  protected override paintDecorations(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    const angle = angleOf(pa, pb)
    const angleDeg = -angle * (180 / Math.PI)
    const radius = Math.min(36, Math.hypot(pb.x - pa.x, pb.y - pa.y) / 2)
    if (radius > 8) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      // Reference horizontal from the first anchor, then the sweep down/up to the line's angle.
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pa.x + radius + 12, pa.y)
      ctx.stroke()
      ctx.beginPath()
      // Canvas arcs sweep clockwise in y-down space; draw from 0 to the line's angle the short way.
      ctx.arc(pa.x, pa.y, radius, 0, angle, angle < 0)
      ctx.stroke()
      ctx.restore()
    }
    paintLabel(ctx, `${angleDeg.toFixed(0)}°`, { x: pa.x + radius + 18, y: pa.y }, this.style, {
      background: withAlpha('#1b1f27', 0.92),
    })
  }
}

/** Full-width horizontal line at one price. */
export class HorizontalLine extends Drawing {
  readonly type = 'horizontal_line'

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const y = viewport.yOf(this.anchors[0]?.price ?? NaN)
    if (y === null || !Number.isFinite(y)) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x: 0, y }, { x: viewport.width, y })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const y = viewport.yOf(this.anchors[0]?.price ?? NaN)
    if (y === null) return false
    return Math.abs(point.y - y) <= hitTolerance(this.style.lineWidth)
  }
}

/** Horizontal line from its anchor rightward. */
export class HorizontalRay extends Drawing {
  readonly type = 'horizontal_ray'

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, p, { x: viewport.width, y: p.y })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    return distanceToSegment(point, p, { x: viewport.width, y: p.y }) <= hitTolerance(this.style.lineWidth)
  }
}

/** Full-height vertical line at one time. */
export class VerticalLine extends Drawing {
  readonly type = 'vertical_line'

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const x = viewport.xOf(anchor.time)
    if (x === null) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x, y: 0 }, { x, y: viewport.height })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const x = viewport.xOf(anchor.time)
    if (x === null) return false
    return Math.abs(point.x - x) <= hitTolerance(this.style.lineWidth)
  }
}

/** Crosshair pinned to one point: a horizontal and a vertical line through the anchor. */
export class CrossLine extends Drawing {
  readonly type = 'cross_line'

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x: 0, y: p.y }, { x: viewport.width, y: p.y })
    strokeSegment(ctx, { x: p.x, y: 0 }, { x: p.x, y: viewport.height })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return Math.abs(point.y - p.y) <= tolerance || Math.abs(point.x - p.x) <= tolerance
  }
}
