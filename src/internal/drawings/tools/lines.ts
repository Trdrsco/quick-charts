import type { ISeriesPrimitiveAxisView } from 'lightweight-charts'

import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint } from '../core/geometry'
import {
  applyStroke,
  formatPrice,
  paintArrowHead,
  paintLabel,
  strokeSegment,
  withAlpha,
} from '../render/canvas'
import { AxisLabel } from '../render/axis-view'

export type LineEnd = 'normal' | 'arrow'

/** The two-point line family's full option set. Tool identity = these defaults. */
export type TrendLineProps = {
  extendLeft: boolean
  extendRight: boolean
  leftEnd: LineEnd
  rightEnd: LineEnd
  /** Marker at the segment's midpoint. */
  middlePoint: boolean
  /** Price pill beside each end point. */
  showPriceLabels: boolean
  /** Stats readout items (price delta + %, bar count, slope angle). */
  showPriceRange: boolean
  showBarsRange: boolean
  showAngle: boolean
  statsPosition: 'left' | 'center' | 'right'
}

const LINE_PROPS: TrendLineProps = {
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
  middlePoint: false,
  showPriceLabels: false,
  showPriceRange: false,
  showBarsRange: false,
  showAngle: false,
  statsPosition: 'center',
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
    this.paintProps(ctx, viewport)
    this.paintDecorations(ctx, viewport)
  }

  /** Prop-driven ink shared by the family: midpoint marker, end price pills, the stats block. */
  private paintProps(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return

    if (this.props.middlePoint) {
      const mid = midpoint(pa, pb)
      ctx.save()
      ctx.setLineDash([])
      ctx.fillStyle = this.style.lineColor
      ctx.beginPath()
      ctx.arc(mid.x, mid.y, Math.max(2.5, this.style.lineWidth), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    if (this.props.showPriceLabels) {
      const [a, b] = this.anchors
      paintLabel(ctx, formatPrice(a.price), { x: pa.x - 8, y: pa.y }, this.style, {
        align: 'right',
        background: withAlpha(this.style.lineColor, 0.2),
      })
      paintLabel(ctx, formatPrice(b.price), { x: pb.x + 8, y: pb.y }, this.style, {
        background: withAlpha(this.style.lineColor, 0.2),
      })
    }

    const stats = this.statsText(viewport)
    if (stats) {
      const t = this.props.statsPosition === 'left' ? 0.12 : this.props.statsPosition === 'right' ? 0.88 : 0.5
      const at = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t - 14 }
      paintLabel(ctx, stats, at, this.style, { align: 'center', background: withAlpha('#1b1f27', 0.92) })
    }
  }

  protected statsText(viewport: Viewport): string | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const parts: string[] = []
    if (this.props.showPriceRange) {
      const dPrice = b.price - a.price
      const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
      parts.push(`${dPrice >= 0 ? '+' : ''}${formatPrice(dPrice)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`)
    }
    if (this.props.showBarsRange) {
      const bars = viewport.barsBetween(a.time, b.time)
      if (bars !== null) parts.push(`${Math.round(bars)} bars`)
    }
    if (this.props.showAngle) {
      const [pa, pb] = this.anchorPixels(viewport)
      if (pa && pb) parts.push(`${(-angleOf(pa, pb) * (180 / Math.PI)).toFixed(0)}°`)
    }
    return parts.length ? parts.join('  ·  ') : null
  }

  /** Extra ink beyond the shared prop set — the family variants override. */
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

/** Trend line whose identity is the full measurement readout. */
export class InfoLine extends TrendLine {
  override readonly type = 'info_line'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, showPriceRange: true, showBarsRange: true, showAngle: true }
  }
}

/** Trend line that reports its slope, with a horizontal reference arc at the origin. */
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
      // Reference horizontal from the first anchor, then the sweep up/down to the line's angle.
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

export type HorizontalLineProps = {
  /** Price pill on the axis at the line's level. */
  showPrice: boolean
}

/** Full-width horizontal line at one price. */
export class HorizontalLine extends Drawing<HorizontalLineProps> {
  readonly type: string = 'horizontal_line'

  private readonly _axisViews = [
    new AxisLabel({
      coordinate: () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        if (!anchor || !viewport) return null
        return viewport.yOf(anchor.price)
      },
      text: () => formatPrice(this.anchors[0]?.price ?? 0),
      color: () => this.style.lineColor,
      visible: () => this.props.showPrice && this.isVisibleNow(),
    }),
  ]

  protected override defaultProps(): HorizontalLineProps {
    return { showPrice: true }
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const y = viewport.yOf(this.anchors[0]?.price ?? NaN)
    if (y === null || !Number.isFinite(y)) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x: this.leftEdge(viewport), y }, { x: viewport.width, y })
  }

  /** Where the line starts; the ray variant starts at its anchor. */
  protected leftEdge(_viewport: Viewport): number {
    return 0
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const y = viewport.yOf(this.anchors[0]?.price ?? NaN)
    if (y === null) return false
    return point.x >= this.leftEdge(viewport) - 4 && Math.abs(point.y - y) <= hitTolerance(this.style.lineWidth)
  }
}

/** Horizontal line from its anchor rightward. */
export class HorizontalRay extends HorizontalLine {
  override readonly type = 'horizontal_ray'

  protected override leftEdge(viewport: Viewport): number {
    const anchor = this.anchors[0]
    if (!anchor) return 0
    const p = this.anchorToPixel(anchor, viewport)
    return p ? p.x : 0
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
export class CrossLine extends Drawing<HorizontalLineProps> {
  readonly type = 'cross_line'

  private readonly _axisViews = [
    new AxisLabel({
      coordinate: () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        if (!anchor || !viewport) return null
        return viewport.yOf(anchor.price)
      },
      text: () => formatPrice(this.anchors[0]?.price ?? 0),
      color: () => this.style.lineColor,
      visible: () => this.props.showPrice && this.isVisibleNow(),
    }),
  ]

  protected override defaultProps(): HorizontalLineProps {
    return { showPrice: true }
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

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
