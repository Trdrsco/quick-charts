import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, extendSegment } from '../core/geometry'
import { applyStroke, dashPattern, fillPaint, strokeSegment } from '../render/canvas'

export type ChannelProps = {
  extendLeft: boolean
  extendRight: boolean
  /** Dashed midline halfway between the channel boundaries. */
  showMiddle: boolean
}

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/**
 * Parallel channel: anchors 1–2 span the baseline, anchor 3 sets the vertical offset of the
 * second boundary (same slope, same time range).
 */
export class ParallelChannel extends Drawing<ChannelProps> {
  readonly type = 'parallel_channel'

  protected override defaultProps(): ChannelProps {
    return { extendLeft: false, extendRight: false, showMiddle: false }
  }

  requiredAnchors(): number {
    return 3
  }

  /** Both boundaries after extension, or null while an anchor is off-range. */
  protected boundaries(viewport: Viewport): { base: { a: Point; b: Point }; offset: { a: Point; b: Point } } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    // The second boundary is the baseline translated vertically through p3.
    const dy = p3.y - (p1.y + (p2.y - p1.y) * ((p3.x - p1.x) / ((p2.x - p1.x) || 1)))
    const { extendLeft, extendRight } = this.props
    const base =
      extendLeft || extendRight
        ? extendSegment(p1, p2, viewport.width, viewport.height, extendLeft, extendRight)
        : { a: p1, b: p2 }
    const offset =
      extendLeft || extendRight
        ? extendSegment(
            { x: p1.x, y: p1.y + dy },
            { x: p2.x, y: p2.y + dy },
            viewport.width,
            viewport.height,
            extendLeft,
            extendRight,
          )
        : { a: { x: p1.x, y: p1.y + dy }, b: { x: p2.x, y: p2.y + dy } }
    return { base, offset }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.boundaries(viewport)
    if (!b) return
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(b.base.a.x, b.base.a.y)
      ctx.lineTo(b.base.b.x, b.base.b.y)
      ctx.lineTo(b.offset.b.x, b.offset.b.y)
      ctx.lineTo(b.offset.a.x, b.offset.a.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    applyStroke(ctx, this.style)
    strokeSegment(ctx, b.base.a, b.base.b)
    strokeSegment(ctx, b.offset.a, b.offset.b)
    if (this.props.showMiddle) {
      ctx.save()
      ctx.setLineDash(dashPattern('dashed', this.style.lineWidth))
      strokeSegment(
        ctx,
        { x: (b.base.a.x + b.offset.a.x) / 2, y: (b.base.a.y + b.offset.a.y) / 2 },
        { x: (b.base.b.x + b.offset.b.x) / 2, y: (b.base.b.y + b.offset.b.y) / 2 },
      )
      ctx.restore()
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const b = this.boundaries(viewport)
    if (!b) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (distanceToSegment(point, b.base.a, b.base.b) <= tolerance) return true
    if (distanceToSegment(point, b.offset.a, b.offset.b) <= tolerance) return true
    // Inside the channel body counts as a hit — that is how the whole channel is grabbed.
    const minX = Math.min(b.base.a.x, b.base.b.x)
    const maxX = Math.max(b.base.a.x, b.base.b.x)
    if (point.x < minX || point.x > maxX) return false
    const t = maxX === minX ? 0 : (point.x - b.base.a.x) / (b.base.b.x - b.base.a.x || 1)
    const yBase = b.base.a.y + (b.base.b.y - b.base.a.y) * t
    const yOff = b.offset.a.y + (b.offset.b.y - b.offset.a.y) * t
    return point.y >= Math.min(yBase, yOff) && point.y <= Math.max(yBase, yOff)
  }
}

/**
 * Flat top/bottom: anchors 1–2 span a trend boundary, anchor 3 sets a horizontal boundary —
 * a channel with one sloped and one flat side.
 */
export class FlatTopBottom extends Drawing<ChannelProps> {
  readonly type = 'flat_top_bottom'

  protected override defaultProps(): ChannelProps {
    return { extendLeft: false, extendRight: false, showMiddle: false }
  }

  requiredAnchors(): number {
    return 3
  }

  protected boundaries(viewport: Viewport): { slope: { a: Point; b: Point }; flat: { a: Point; b: Point } } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    const { extendLeft, extendRight } = this.props
    const slope =
      extendLeft || extendRight
        ? extendSegment(p1, p2, viewport.width, viewport.height, extendLeft, extendRight)
        : { a: p1, b: p2 }
    const flatA = { x: slope.a.x, y: p3.y }
    const flatB = { x: slope.b.x, y: p3.y }
    return { slope, flat: { a: flatA, b: flatB } }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.boundaries(viewport)
    if (!b) return
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(b.slope.a.x, b.slope.a.y)
      ctx.lineTo(b.slope.b.x, b.slope.b.y)
      ctx.lineTo(b.flat.b.x, b.flat.b.y)
      ctx.lineTo(b.flat.a.x, b.flat.a.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    applyStroke(ctx, this.style)
    strokeSegment(ctx, b.slope.a, b.slope.b)
    strokeSegment(ctx, b.flat.a, b.flat.b)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const b = this.boundaries(viewport)
    if (!b) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (distanceToSegment(point, b.slope.a, b.slope.b) <= tolerance) return true
    if (distanceToSegment(point, b.flat.a, b.flat.b) <= tolerance) return true
    const minX = Math.min(b.slope.a.x, b.slope.b.x)
    const maxX = Math.max(b.slope.a.x, b.slope.b.x)
    if (point.x < minX || point.x > maxX) return false
    const t = (point.x - b.slope.a.x) / (b.slope.b.x - b.slope.a.x || 1)
    const ySlope = b.slope.a.y + (b.slope.b.y - b.slope.a.y) * t
    return point.y >= Math.min(ySlope, b.flat.a.y) && point.y <= Math.max(ySlope, b.flat.a.y)
  }
}

/** Disjoint channel: two independent boundaries (anchors 1–2 and 3–4) with a filled body. */
export class DisjointChannel extends Drawing<ChannelProps> {
  readonly type = 'disjoint_channel'

  protected override defaultProps(): ChannelProps {
    return { extendLeft: false, extendRight: false, showMiddle: false }
  }

  requiredAnchors(): number {
    return 4
  }

  protected boundaries(viewport: Viewport): { top: { a: Point; b: Point }; bottom: { a: Point; b: Point } } | null {
    const [p1, p2, p3, p4] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3 || !p4) return null
    const { extendLeft, extendRight } = this.props
    const line = (a: Point, b: Point) =>
      extendLeft || extendRight ? extendSegment(a, b, viewport.width, viewport.height, extendLeft, extendRight) : { a, b }
    return { top: line(p1, p2), bottom: line(p3, p4) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.boundaries(viewport)
    if (!b) return
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      ctx.beginPath()
      ctx.moveTo(b.top.a.x, b.top.a.y)
      ctx.lineTo(b.top.b.x, b.top.b.y)
      ctx.lineTo(b.bottom.b.x, b.bottom.b.y)
      ctx.lineTo(b.bottom.a.x, b.bottom.a.y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    applyStroke(ctx, this.style)
    strokeSegment(ctx, b.top.a, b.top.b)
    strokeSegment(ctx, b.bottom.a, b.bottom.b)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const b = this.boundaries(viewport)
    if (!b) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return (
      distanceToSegment(point, b.top.a, b.top.b) <= tolerance ||
      distanceToSegment(point, b.bottom.a, b.bottom.b) <= tolerance
    )
  }
}
