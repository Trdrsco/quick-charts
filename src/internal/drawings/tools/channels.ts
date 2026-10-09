import type { ControlPoint, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, extendSegment } from '../core/geometry'
import { applyStroke, fillPaint, paintArrowHead, paintLabel, strokeSegment } from '../render/canvas'
import { fibLevelColor, type FibLevel } from './fibonacci'
import type { LineEnd, TextHAlign, TextVAlign } from './lines'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A channel's label: its words, where they stand across the channel (above it, inside it, below
 *  it) and along it, in the drawing's text channel. */
export type ChannelLabelProps = {
  text: string
  textVAlign: TextVAlign
  textHAlign: TextHAlign
  /** The words stand over the first side's start instead, 6px in and 12px up. */
  textAtStart: boolean
}

/** Paint a channel's words over its first side's start. */
function paintWordsAtStart(ctx: CanvasRenderingContext2D, text: string, first: Segment, style: Readonly<DrawingStyle>): void {
  paintLabel(ctx, text, { x: first.a.x + 6, y: first.a.y - 12 }, style)
}

/** A channel's background switch: off, the channel keeps its fill's color and opacity for when it
 *  is switched back on. */
export type ChannelFillProps = {
  fillBackground: boolean
}

type Segment = { a: Point; b: Point }

/** Where a channel's label stands: across it above its upper side, inside it at the middle, or
 *  below its lower side, and along it at the start, the middle or the end. */
function labelAt(upper: Segment, lower: Segment, v: TextVAlign, h: TextHAlign): { at: Point; align: CanvasTextAlign; baseline: CanvasTextBaseline } {
  const along = h === 'left' ? 0 : h === 'right' ? 1 : 0.5
  const on = (s: Segment): Point => ({ x: s.a.x + (s.b.x - s.a.x) * along, y: s.a.y + (s.b.y - s.a.y) * along })
  const top = on(upper)
  const bottom = on(lower)
  const align: CanvasTextAlign = h === 'left' ? 'left' : h === 'right' ? 'right' : 'center'
  if (v === 'top') return { at: { x: top.x, y: Math.min(top.y, bottom.y) - 4 }, align, baseline: 'bottom' }
  if (v === 'bottom') return { at: { x: bottom.x, y: Math.max(top.y, bottom.y) + 4 }, align, baseline: 'top' }
  return { at: { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 }, align, baseline: 'middle' }
}

/** A channel side, the upper of two by the pane's y at their middles. */
const upperOf = (p: Segment, q: Segment): [Segment, Segment] => ((p.a.y + p.b.y) / 2 <= (q.a.y + q.b.y) / 2 ? [p, q] : [q, p])

/** Fill a channel's body between two sides with its background. */
function fillBody(ctx: CanvasRenderingContext2D, fill: string, p: Segment, q: Segment): void {
  ctx.save()
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(p.a.x, p.a.y)
  ctx.lineTo(p.b.x, p.b.y)
  ctx.lineTo(q.b.x, q.b.y)
  ctx.lineTo(q.a.x, q.a.y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/**
 * A parallel channel's settings: its levels at ratios of its width (0 the line through its first
 * two points, 1 the parallel through its third), each in a stroke of its own, its extensions, its
 * background between the 0 and 1 lines, and its label.
 */
export type ParallelChannelProps = ChannelLabelProps &
  ChannelFillProps & {
    levels: FibLevel[]
    extendLeft: boolean
    extendRight: boolean
  }

const PARALLEL_LEVELS: FibLevel[] = [
  { value: -0.25, visible: false, color: '#2962ff', width: 1, style: 'solid' },
  { value: 0, visible: true, color: '#2962ff', width: 2, style: 'solid' },
  { value: 0.25, visible: false, color: '#2962ff', width: 1, style: 'solid' },
  { value: 0.5, visible: true, color: '#2962ff', width: 1, style: 'dashed' },
  { value: 0.75, visible: false, color: '#2962ff', width: 1, style: 'solid' },
  { value: 1, visible: true, color: '#2962ff', width: 2, style: 'solid' },
  { value: 1.25, visible: false, color: '#2962ff', width: 1, style: 'solid' },
]

/**
 * Parallel channel: the first two anchors span the baseline, and the third sets how far the parallel
 * stands from it, at the same slope over the same times.
 */
export class ParallelChannel extends Drawing<ParallelChannelProps> {
  readonly type = 'parallel_channel'

  protected override defaultProps(): ParallelChannelProps {
    return { text: '', textVAlign: 'top', textHAlign: 'left', textAtStart: false, levels: PARALLEL_LEVELS.map((l) => ({ ...l })), extendLeft: false, extendRight: false, fillBackground: true }
  }

  /** A channel saved with its middle line as `showMiddle` shows or hides its half level by it. */
  protected override upgradeProps(props: Partial<ParallelChannelProps>): Partial<ParallelChannelProps> {
    const saved = props as Partial<ParallelChannelProps> & { showMiddle?: unknown }
    if (!('showMiddle' in saved)) return props
    const { showMiddle, ...rest } = saved
    if ('levels' in rest) return rest
    return { ...rest, levels: PARALLEL_LEVELS.map((l) => (l.value === 0.5 ? { ...l, visible: showMiddle === true } : { ...l })) }
  }

  /** A format-2 channel drew its sides, and its middle where it showed one, in its own stroke, the
   *  middle dashed, and its words over its first side's start. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const { lineColor, lineWidth, lineStyle } = this._style
    const middle = saved.showMiddle === true
    const levels = PARALLEL_LEVELS.map((l): FibLevel => ({
      ...l,
      visible: l.value === 0 || l.value === 1 || (l.value === 0.5 && middle),
      color: lineColor,
      width: lineWidth,
      style: l.value === 0.5 ? 'dashed' : lineStyle,
    }))
    this._props = { ...this._props, levels, textAtStart: true }
  }

  requiredAnchors(): number {
    return 3
  }

  /** The pane offset from the baseline to the parallel through the third point. */
  protected offset(viewport: Viewport): { p1: Point; p2: Point; dy: number } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    return { p1, p2, dy: p3.y - (p1.y + (p2.y - p1.y) * ((p3.x - p1.x) / ((p2.x - p1.x) || 1))) }
  }

  /** The line at a level's ratio of the channel's width, after extension. */
  protected levelLine(o: { p1: Point; p2: Point; dy: number }, value: number, viewport: Viewport): Segment {
    const a = { x: o.p1.x, y: o.p1.y + o.dy * value }
    const b = { x: o.p2.x, y: o.p2.y + o.dy * value }
    const { extendLeft, extendRight } = this.props
    return extendLeft || extendRight ? extendSegment(a, b, viewport.width, viewport.height, extendLeft, extendRight) : { a, b }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const o = this.offset(viewport)
    if (!o) return
    const zero = this.levelLine(o, 0, viewport)
    const one = this.levelLine(o, 1, viewport)
    const fill = this.props.fillBackground !== false ? fillPaint(this.style) : null
    if (fill) fillBody(ctx, fill, zero, one)
    this.props.levels.forEach((level, i) => {
      if (!level.visible) return
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: fibLevelColor(level, i), lineWidth: level.width ?? this.style.lineWidth, lineStyle: level.style ?? this.style.lineStyle })
      const line = this.levelLine(o, level.value, viewport)
      strokeSegment(ctx, line.a, line.b)
      ctx.restore()
    })
    if (this.props.text && this.props.textAtStart) paintWordsAtStart(ctx, this.props.text, zero, this.style)
    else if (this.props.text) {
      const [upper, lower] = upperOf(zero, one)
      const place = labelAt(upper, lower, this.props.textVAlign, this.props.textHAlign)
      paintLabel(ctx, this.props.text, place.at, this.style, { align: place.align, baseline: place.baseline })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const o = this.offset(viewport)
    if (!o) return false
    for (const level of this.props.levels) {
      if (!level.visible) continue
      const line = this.levelLine(o, level.value, viewport)
      if (distanceToSegment(point, line.a, line.b) <= hitTolerance(level.width ?? this.style.lineWidth)) return true
    }
    // Inside the channel body counts as a hit: that is how the whole channel is grabbed.
    const zero = this.levelLine(o, 0, viewport)
    const one = this.levelLine(o, 1, viewport)
    const minX = Math.min(zero.a.x, zero.b.x)
    const maxX = Math.max(zero.a.x, zero.b.x)
    if (point.x < minX || point.x > maxX) return false
    const t = (point.x - zero.a.x) / (zero.b.x - zero.a.x || 1)
    const yZero = zero.a.y + (zero.b.y - zero.a.y) * t
    const yOne = one.a.y + (one.b.y - one.a.y) * t
    return point.y >= Math.min(yZero, yOne) && point.y <= Math.max(yZero, yOne)
  }
}

/** A flat top/bottom's and a disjoint channel's settings: their sides' ends and extensions, their
 *  sides' prices in a text style of their own, their background, and their label. */
export type ChannelProps = ChannelLabelProps &
  ChannelFillProps & {
    extendLeft: boolean
    extendRight: boolean
    leftEnd: LineEnd
    rightEnd: LineEnd
    showPrices: boolean
    pricesColor: string
    pricesFontSize: number
    pricesBold: boolean
    pricesItalic: boolean
  }

const channelProps = (hue: string): ChannelProps => ({
  text: '',
  textVAlign: 'top',
  textHAlign: 'left',
  textAtStart: false,
  fillBackground: true,
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
  showPrices: false,
  pricesColor: hue,
  pricesFontSize: 12,
  pricesBold: false,
  pricesItalic: false,
})

/** A channel saved before its middle line was a setting of its own carries none. */
function upgradeChannel(props: Partial<ChannelProps>): Partial<ChannelProps> {
  const saved = props as Partial<ChannelProps> & { showMiddle?: unknown }
  if (!('showMiddle' in saved)) return props
  const { showMiddle: _showMiddle, ...rest } = saved
  void _showMiddle
  return rest
}

/** Paint a channel's two sides with their ends, its body, its prices and its label. */
function paintChannel(ctx: CanvasRenderingContext2D, drawing: { style: Readonly<DrawingStyle>; props: Readonly<ChannelProps>; format(price: number): string }, sides: [Segment, Segment], prices: [number, number][]): void {
  const { style, props } = drawing
  const fill = props.fillBackground !== false ? fillPaint(style) : null
  if (fill) fillBody(ctx, fill, sides[0], sides[1])
  applyStroke(ctx, style)
  for (const side of sides) {
    strokeSegment(ctx, side.a, side.b)
    if (props.leftEnd === 'arrow') paintArrowHead(ctx, side.b, side.a, style)
    if (props.rightEnd === 'arrow') paintArrowHead(ctx, side.a, side.b, style)
  }
  if (props.showPrices) {
    const ink: DrawingStyle = { ...style, textColor: props.pricesColor, fontSize: props.pricesFontSize, bold: props.pricesBold, italic: props.pricesItalic }
    sides.forEach((side, i) => {
      const [left, right] = prices[i]!
      paintLabel(ctx, drawing.format(left), { x: side.a.x - 4, y: side.a.y }, ink, { align: 'right' })
      paintLabel(ctx, drawing.format(right), { x: side.b.x + 4, y: side.b.y }, ink, { align: 'left' })
    })
  }
  if (props.text && props.textAtStart) paintWordsAtStart(ctx, props.text, sides[0], style)
  else if (props.text) {
    const [upper, lower] = upperOf(sides[0], sides[1])
    const place = labelAt(upper, lower, props.textVAlign, props.textHAlign)
    paintLabel(ctx, props.text, place.at, style, { align: place.align, baseline: place.baseline })
  }
}

/**
 * Flat top/bottom: the first two anchors span a sloped side and the third sets a flat one, a channel
 * with one sloped and one flat side.
 */
export class FlatTopBottom extends Drawing<ChannelProps> {
  readonly type = 'flat_top_bottom'

  protected override defaultProps(): ChannelProps {
    return channelProps('#ff9800')
  }

  protected override upgradeProps(props: Partial<ChannelProps>): Partial<ChannelProps> {
    return upgradeChannel(props)
  }

  /** A format-2 channel set its words over its first side's start. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textAtStart: true }
  }

  requiredAnchors(): number {
    return 3
  }

  protected boundaries(viewport: Viewport): { slope: Segment; flat: Segment } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    const { extendLeft, extendRight } = this.props
    const slope = extendLeft || extendRight ? extendSegment(p1, p2, viewport.width, viewport.height, extendLeft, extendRight) : { a: p1, b: p2 }
    return { slope, flat: { a: { x: slope.a.x, y: p3.y }, b: { x: slope.b.x, y: p3.y } } }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.boundaries(viewport)
    if (!b) return
    const [a1, a2, a3] = this.anchors
    paintChannel(ctx, { style: this.style, props: this.props, format: (p) => this.formatPrice(p) }, [b.slope, b.flat], [
      [a1!.price, a2!.price],
      [a3!.price, a3!.price],
    ])
  }

  /** The flat side's handle stands at the flat side's end under the second anchor: the flat side
   *  spans the sloped side's times at the third anchor's price, and that anchor's own time paints
   *  nothing, so a handle at it would drift off the side as the sloped side moves. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points = super.getControlPoints(viewport)
    const end = points.find((point) => point.index === 1)
    return end ? points.map((point) => (point.index === 2 ? { ...point, x: end.x } : point)) : points
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

/** Disjoint channel: two sides of their own, the first two anchors and the last two, with a filled
 *  body between them. */
export class DisjointChannel extends Drawing<ChannelProps> {
  readonly type = 'disjoint_channel'

  protected override defaultProps(): ChannelProps {
    return channelProps('#089981')
  }

  protected override upgradeProps(props: Partial<ChannelProps>): Partial<ChannelProps> {
    return upgradeChannel(props)
  }

  /** A format-2 channel set its words over its first side's start. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textAtStart: true }
  }

  requiredAnchors(): number {
    return 4
  }

  protected boundaries(viewport: Viewport): { top: Segment; bottom: Segment } | null {
    const [p1, p2, p3, p4] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3 || !p4) return null
    const { extendLeft, extendRight } = this.props
    const line = (a: Point, b: Point): Segment => (extendLeft || extendRight ? extendSegment(a, b, viewport.width, viewport.height, extendLeft, extendRight) : { a, b })
    return { top: line(p1, p2), bottom: line(p3, p4) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.boundaries(viewport)
    if (!b) return
    const [a1, a2, a3, a4] = this.anchors
    paintChannel(ctx, { style: this.style, props: this.props, format: (p) => this.formatPrice(p) }, [b.top, b.bottom], [
      [a1!.price, a2!.price],
      [a3!.price, a4!.price],
    ])
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const b = this.boundaries(viewport)
    if (!b) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return distanceToSegment(point, b.top.a, b.top.b) <= tolerance || distanceToSegment(point, b.bottom.a, b.bottom.b) <= tolerance
  }
}
