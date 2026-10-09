import type { ISeriesPrimitiveAxisView } from 'lightweight-charts'

import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint, segmentTextAngle } from '../core/geometry'
import {
  applyStroke,
  paintArrowHead,
  paintLabel,
  strokeSegment,
  withAlpha,
} from '../render/canvas'
import { AxisLabel } from '../render/axis-view'

export type LineEnd = 'normal' | 'arrow'

/** Where a line's stats stand along it: near its left end, at its middle, near its right end, or
 *  near the right end unless the pane leaves no room there, then near the left. */
export type StatsPosition = 'left' | 'center' | 'right' | 'auto'

/** Where a label stands across what carries it: above it, on it, or below it. A box's label stands
 *  above it, inside it, or below it. */
export type TextVAlign = 'top' | 'middle' | 'bottom'

/** Where a label stands along what carries it. */
export type TextHAlign = 'left' | 'center' | 'right'

/** The two-point line family's full option set. Tool identity = these defaults. */
export type TrendLineProps = {
  /** Free label rendered along the line (edited in the settings dialog's Text tab). */
  text: string
  extendLeft: boolean
  extendRight: boolean
  leftEnd: LineEnd
  rightEnd: LineEnd
  /** Marker at the segment's midpoint. */
  middlePoint: boolean
  /** Price pill beside each end point. */
  showPriceLabels: boolean
  /** Stats readout items (price delta, percent change, the change counted in the symbol's smallest
   *  price move, bar count, span, slope angle). The count shows only where the chart knows that
   *  move. */
  showPriceRange: boolean
  showPercentChange: boolean
  showPipsChange: boolean
  showBarsRange: boolean
  showDateTimeRange: boolean
  showAngle: boolean
  statsPosition: StatsPosition
  /** The stats show whether or not the line is selected. Off, they show while it is. */
  alwaysShowStats: boolean
  /** Where the label stands across the line and along it. */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
}

const LINE_PROPS: TrendLineProps = {
  text: '',
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
  middlePoint: false,
  showPriceLabels: false,
  showPriceRange: false,
  showPercentChange: false,
  showPipsChange: false,
  showBarsRange: false,
  showDateTimeRange: false,
  showAngle: false,
  statsPosition: 'right',
  alwaysShowStats: false,
  textVAlign: 'top',
  textHAlign: 'center',
}

/** How a label stands across a line it rides: its offset from the line and the edge of the text
 *  that offset is measured to. */
const ACROSS: Record<TextVAlign, { y: number; baseline: 'bottom' | 'middle' | 'top' }> = {
  top: { y: -4, baseline: 'bottom' },
  middle: { y: 0, baseline: 'middle' },
  bottom: { y: 4, baseline: 'top' },
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

  /** The hint rides the segment's slope, lifted off the line where the text itself paints. */
  protected override textHintPlacement(points: Point[]): { x: number; y: number; angle: number } {
    if (points.length < 2) return super.textHintPlacement(points)
    const angle = segmentTextAngle(points[0], points[1])
    return {
      x: (points[0].x + points[1].x) / 2 + 16 * Math.sin(angle),
      y: (points[0].y + points[1].y) / 2 - 16 * Math.cos(angle),
      angle,
    }
  }

  /** The on-screen segment after extension — the shared basis for painting and hit-testing. */
  protected segment(viewport: Viewport): { a: Point; b: Point } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const { extendLeft, extendRight } = this.props
    if (!extendLeft && !extendRight) return { a: pa, b: pb }
    return extendSegment(pa, pb, viewport.width, viewport.height, extendLeft, extendRight)
  }

  /** A format-2 line showed its stats whether or not it was selected and counted no price moves; a
   *  stats position counted its left and right from the first point, and a save naming none stood
   *  them at the middle. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const position = (saved.statsPosition ?? 'center') as StatsPosition
    const [a, b] = this._anchors
    const flipped = !!a && !!b && Number(b.time) < Number(a.time)
    const statsPosition: StatsPosition = flipped && position === 'left' ? 'right' : flipped && position === 'right' ? 'left' : position
    this._props = { ...this._props, statsPosition, alwaysShowStats: true, showPipsChange: false }
  }

  /** The stats stand while the line is selected or edited, or always where the viewer asked. */
  protected statsShown(): boolean {
    return this.props.alwaysShowStats || this.state !== 'normal'
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
      paintLabel(ctx, this.formatPrice(a.price), { x: pa.x - 8, y: pa.y }, this.style, {
        align: 'right',
        background: withAlpha(this.style.lineColor, 0.2),
      })
      paintLabel(ctx, this.formatPrice(b.price), { x: pb.x + 8, y: pb.y }, this.style, {
        background: withAlpha(this.style.lineColor, 0.2),
      })
    }

    // Text and stats ride the segment's angle — a label on a rising line slopes with it.
    const textAngle = segmentTextAngle(pa, pb)
    // Left and right are the screen's: the end nearer the left edge is the left one, whichever
    // anchor it is.
    const [left, right] = pa.x <= pb.x ? [pa, pb] : [pb, pa]

    if (this.props.text) {
      const along = this.props.textHAlign
      const at = along === 'left' ? left : along === 'right' ? right : midpoint(pa, pb)
      const across = ACROSS[this.props.textVAlign] ?? ACROSS.top
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(textAngle)
      paintLabel(ctx, this.props.text, { x: 0, y: across.y }, this.style, { align: along === 'left' ? 'left' : along === 'right' ? 'right' : 'center', baseline: across.baseline })
      ctx.restore()
    }

    const stats = this.statsShown() ? this.statsText(viewport) : null
    if (stats) {
      const place = this.props.statsPosition
      const toRight = (f: number): Point => ({ x: left.x + (right.x - left.x) * f, y: left.y + (right.y - left.y) * f })
      const t = place === 'left' ? 0.12 : place === 'center' ? 0.5 : place === 'auto' && toRight(0.88).x > viewport.width * 0.85 ? 0.12 : 0.88
      const at = toRight(t)
      // The stats pill drops below its usual perch when a text label already sits above the line
      // where it stands.
      const crowded = !!this.props.text && this.props.textVAlign === 'top' && ((place === 'center' && this.props.textHAlign === 'center') || (t === 0.12 && this.props.textHAlign === 'left') || (t === 0.88 && this.props.textHAlign === 'right'))
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(textAngle)
      paintLabel(ctx, stats, { x: 0, y: crowded ? -32 : -14 }, this.style, { align: 'center', background: withAlpha('#1b1f27', 0.92) })
      ctx.restore()
    }
  }

  protected statsText(viewport: Viewport): string | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const parts: string[] = []
    const dPrice = b.price - a.price
    if (this.props.showPriceRange) {
      parts.push(`${dPrice >= 0 ? '+' : ''}${this.formatPrice(dPrice)}`)
    }
    if (this.props.showPercentChange) {
      const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
      parts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`)
    }
    if (this.props.showPipsChange) {
      // The count rides only on a host-stated move; without one the readout omits it.
      const tick = this.tickSize()
      if (tick !== null && tick > 0) {
        const moves = Math.round(dPrice / tick)
        parts.push(`${moves >= 0 ? '+' : ''}${moves}`)
      }
    }
    if (this.props.showBarsRange) {
      const bars = viewport.barsBetween(a.time, b.time)
      if (bars !== null) parts.push(`${Math.round(bars)} bars`)
    }
    if (this.props.showDateTimeRange) {
      const secs = Math.abs(Number(b.time) - Number(a.time))
      if (Number.isFinite(secs) && secs > 0) {
        const d = Math.floor(secs / 86400)
        const h = Math.floor((secs % 86400) / 3600)
        const m = Math.floor((secs % 3600) / 60)
        parts.push(d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`)
      }
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
    return {
      ...LINE_PROPS,
      showPriceRange: true,
      showPercentChange: true,
      showPipsChange: true,
      showBarsRange: true,
      showDateTimeRange: true,
      showAngle: true,
      statsPosition: 'center',
      alwaysShowStats: true,
    }
  }

  /** A format-2 info line that named no percent change or span showed neither. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    super.keepSavedLook(saved)
    const props: Partial<TrendLineProps> = {}
    if (!('showPercentChange' in saved)) props.showPercentChange = false
    if (!('showDateTimeRange' in saved)) props.showDateTimeRange = false
    this._props = { ...this._props, ...props }
  }
}

/** Trend line that reports its slope, with a horizontal reference arc at the origin. Its pages offer
 *  no ends and no label, since the angle is its reading; a save that carries them draws them. */
export class TrendAngle extends TrendLine {
  override readonly type = 'trend_angle'

  /** A trend angle offers no label, so it invites none. */
  override paintTextHint(): void {}

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
  /** Free label the line carries. */
  text: string
  /** Price pill on the axis at the line's level. */
  showPrice: boolean
  /** Where the label stands across the line and along it. */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
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
      text: () => this.formatPrice(this.anchors[0]?.price ?? 0),
      color: () => this.style.lineColor,
      visible: () => this.props.showPrice && this.isVisibleNow(),
    }),
  ]

  protected override defaultProps(): HorizontalLineProps {
    return { text: '', showPrice: true, textVAlign: 'middle', textHAlign: 'center' }
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
    const start = this.leftEdge(viewport)
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x: start, y }, { x: viewport.width, y })
    if (this.props.text) {
      const along = this.props.textHAlign
      const across = ACROSS[this.props.textVAlign] ?? ACROSS.middle
      const x = along === 'left' ? start + 4 : along === 'right' ? viewport.width - 4 : (start + viewport.width) / 2
      paintLabel(ctx, this.props.text, { x, y: y + across.y }, this.style, { align: along === 'left' ? 'left' : along === 'right' ? 'right' : 'center', baseline: across.baseline })
    }
  }

  /** Where the line starts; the ray variant starts at its anchor. */
  protected leftEdge(_viewport: Viewport): number {
    return 0
  }

  /** A format-2 line's label stood above its left side. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textVAlign: 'top', textHAlign: 'left' }
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

  protected override defaultProps(): HorizontalLineProps {
    return { text: '', showPrice: true, textVAlign: 'bottom', textHAlign: 'center' }
  }

  protected override leftEdge(viewport: Viewport): number {
    const anchor = this.anchors[0]
    if (!anchor) return 0
    const p = this.anchorToPixel(anchor, viewport)
    return p ? p.x : 0
  }
}

/** Time-axis pill text for a numeric (unix-seconds) anchor time. */
function timeText(time: unknown): string {
  const t = Number(time)
  if (!Number.isFinite(t)) return String(time)
  const d = new Date(t * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export type VerticalLineProps = {
  /** Free label the line carries. */
  text: string
  /** Timestamp pill on the time axis. */
  showTime: boolean
  /** Where the label stands along the line (top, middle, bottom of the pane) and across it (to its
   *  left, on it, to its right). */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
  /** Whether the label reads across the line or runs up it. */
  textOrientation: 'horizontal' | 'vertical'
}

/** Full-height vertical line at one time. */
export class VerticalLine extends Drawing<VerticalLineProps> {
  readonly type = 'vertical_line'

  private readonly _timeViews = [
    new AxisLabel({
      coordinate: () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        if (!anchor || !viewport) return null
        return viewport.xOf(anchor.time)
      },
      text: () => timeText(this.anchors[0]?.time),
      color: () => this.style.lineColor,
      visible: () => this.props.showTime && this.isVisibleNow(),
    }),
  ]

  protected override defaultProps(): VerticalLineProps {
    return { text: '', showTime: true, textVAlign: 'middle', textHAlign: 'center', textOrientation: 'vertical' }
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._timeViews
  }

  requiredAnchors(): number {
    return 1
  }

  /** A format-2 line's label read across it, to its right at the top of the pane. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textOrientation: 'horizontal', textVAlign: 'top', textHAlign: 'right' }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const x = viewport.xOf(anchor.time)
    if (x === null) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, { x, y: 0 }, { x, y: viewport.height })
    if (this.props.text) this.paintText(ctx, x, viewport.height)
  }

  /** The label at its place along the line and beside it. Running up the line, the label is turned
   *  a quarter left, so the line's top is where its words end. */
  private paintText(ctx: CanvasRenderingContext2D, x: number, height: number): void {
    const { textVAlign: along, textHAlign: across } = this.props
    const y = along === 'top' ? 4 : along === 'bottom' ? height - 4 : height / 2
    if (this.props.textOrientation === 'horizontal') {
      const at = across === 'left' ? x - 4 : across === 'right' ? x + 4 : x
      paintLabel(ctx, this.props.text, { x: at, y }, this.style, { align: across === 'left' ? 'right' : across === 'right' ? 'left' : 'center', baseline: along === 'top' ? 'top' : along === 'bottom' ? 'bottom' : 'middle' })
      return
    }
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-Math.PI / 2)
    paintLabel(ctx, this.props.text, { x: 0, y: across === 'left' ? -4 : across === 'right' ? 4 : 0 }, this.style, {
      align: along === 'top' ? 'right' : along === 'bottom' ? 'left' : 'center',
      baseline: across === 'left' ? 'bottom' : across === 'right' ? 'top' : 'middle',
    })
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const x = viewport.xOf(anchor.time)
    if (x === null) return false
    return Math.abs(point.x - x) <= hitTolerance(this.style.lineWidth)
  }
}

export type CrossLineProps = {
  /** Price pill on the axis at the cross's level. */
  showPrice: boolean
  /** Timestamp pill on the time axis at the cross's time. */
  showTime: boolean
}

/** Crosshair pinned to one point: a horizontal and a vertical line through the anchor. */
export class CrossLine extends Drawing<CrossLineProps> {
  readonly type = 'cross_line'

  private readonly _axisViews = [
    new AxisLabel({
      coordinate: () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        if (!anchor || !viewport) return null
        return viewport.yOf(anchor.price)
      },
      text: () => this.formatPrice(this.anchors[0]?.price ?? 0),
      color: () => this.style.lineColor,
      visible: () => this.props.showPrice && this.isVisibleNow(),
    }),
  ]

  private readonly _timeViews = [
    new AxisLabel({
      coordinate: () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        if (!anchor || !viewport) return null
        return viewport.xOf(anchor.time)
      },
      text: () => timeText(this.anchors[0]?.time),
      color: () => this.style.lineColor,
      visible: () => this.props.showTime && this.isVisibleNow(),
    }),
  ]

  protected override defaultProps(): CrossLineProps {
    return { showPrice: true, showTime: true }
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._timeViews
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
