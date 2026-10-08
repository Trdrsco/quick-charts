import type { ControlPoint, DrawingStyle, LineStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint } from '../core/geometry'
import { applyStroke, dashPattern, paintLabel, strokeSegment, withAlpha } from '../render/canvas'
import type { TextHAlign, TextVAlign } from './lines'

/** One retracement/extension level. Color falls back to the shared palette by position. */
export type FibLevel = {
  value: number
  visible: boolean
  color?: string
  /** The level's own words, which it carries where its tool shows them. */
  text?: string
}

export type FibProps = {
  levels: FibLevel[]
  extendLeft: boolean
  extendRight: boolean
  showPrices: boolean
  showLevels: boolean
  /** Swap which anchor is level 0 / level 1. */
  reverse: boolean
  background: boolean
}

/** Level palette keyed by common ratios; anything else falls back by index. */
const LEVEL_COLORS: Record<string, string> = {
  '0': '#787b86',
  '0.236': '#f23645',
  '0.382': '#ff9800',
  '0.5': '#4caf50',
  '0.618': '#089981',
  '0.786': '#00bcd4',
  '1': '#787b86',
  '1.618': '#2962ff',
  '2.618': '#f23645',
  '3.618': '#9c27b0',
  '4.236': '#e91e63',
}

const FALLBACK_COLORS = ['#2962ff', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#9c27b0', '#e91e63']

export function fibLevelColor(level: FibLevel, index: number): string {
  return level.color ?? LEVEL_COLORS[String(level.value)] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

/** The color a leveled tool's one-color control shows while its levels differ, and the second hue
 *  its face pairs with it to say so. Picking a color there gives every level that color. */
export const MIXED_LEVEL_COLORS: readonly [shown: string, paired: string] = ['#f7525f', '#22ab94']

/** The one color every level of a leveled tool shares, or null while they differ. */
export function sharedLevelColor(levels: readonly FibLevel[]): string | null {
  if (!levels.length) return null
  const colors = new Set(levels.map((level, i) => fibLevelColor(level, i).toLowerCase()))
  return colors.size === 1 ? fibLevelColor(levels[0]!, 0) : null
}

/** The twenty-four levels a retracement, an extension and a fib channel offer: the eleven classic
 *  ratios shown, then thirteen more to switch on, each in its own color. */
const FIB_LEVELS: readonly FibLevel[] = [
  { value: 0, visible: true, color: '#808080' },
  { value: 0.236, visible: true, color: '#f23645' },
  { value: 0.382, visible: true, color: '#ff9800' },
  { value: 0.5, visible: true, color: '#4caf50' },
  { value: 0.618, visible: true, color: '#089981' },
  { value: 0.786, visible: true, color: '#00bcd4' },
  { value: 1, visible: true, color: '#808080' },
  { value: 1.618, visible: true, color: '#2962ff' },
  { value: 2.618, visible: true, color: '#f23645' },
  { value: 3.618, visible: true, color: '#9c27b0' },
  { value: 4.236, visible: true, color: '#e91e63' },
  { value: 1.272, visible: false, color: '#ff9800' },
  { value: 1.414, visible: false, color: '#f23645' },
  { value: 2.272, visible: false, color: '#ff9800' },
  { value: 2.414, visible: false, color: '#4caf50' },
  { value: 2, visible: false, color: '#089981' },
  { value: 3, visible: false, color: '#00bcd4' },
  { value: 3.272, visible: false, color: '#808080' },
  { value: 3.414, visible: false, color: '#2962ff' },
  { value: 4, visible: false, color: '#f23645' },
  { value: 4.272, visible: false, color: '#9c27b0' },
  { value: 4.414, visible: false, color: '#e91e63' },
  { value: 4.618, visible: false, color: '#ff9800' },
  { value: 4.764, visible: false, color: '#089981' },
]

const RATIO_FRACTIONS: FibLevel[] = [
  { value: 0.25, visible: true },
  { value: 0.382, visible: true },
  { value: 0.5, visible: true },
  { value: 0.618, visible: true },
  { value: 0.75, visible: true },
  { value: 1, visible: true },
]

const TIME_SEQUENCE = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
const TIME_RATIOS: FibLevel[] = [
  { value: 0, visible: true },
  { value: 0.382, visible: true },
  { value: 0.618, visible: true },
  { value: 1, visible: true },
  { value: 1.382, visible: true },
  { value: 1.618, visible: true },
  { value: 2, visible: true },
  { value: 2.618, visible: false },
]

const GOLDEN_RATIO = 1.618033988749895

function fibDefaults(levels: FibLevel[]): FibProps {
  return {
    levels: levels.map((l) => ({ ...l })),
    extendLeft: false,
    extendRight: false,
    showPrices: true,
    showLevels: true,
    reverse: false,
    background: true,
  }
}

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A fib's levels and what its labels read: each level's value as a ratio or as a percent, its
 *  price, and where the label stands along the level's line (before it, at its middle, after it)
 *  and across it (above it, on it, below it). */
export type FibChannelProps = {
  levels: FibLevel[]
  extendLeft: boolean
  extendRight: boolean
  showLevels: boolean
  coeffsAsPercents: boolean
  showPrices: boolean
  labelsHAlign: TextHAlign
  labelsVAlign: TextVAlign
  /** The bands between neighbouring levels, each in the color of the level that closes it, at
   *  `backgroundOpacity`. Switched off, the bands keep their opacity for when they return. */
  fillBackground: boolean
  backgroundOpacity: number
}

/** A retracement's and an extension's own: the trend line through the swing points in a stroke of
 *  its own, which swing point is level 0, a level's own words and where they stand on its line, and
 *  levels that divide the swing by log price while the pane's price scale is logarithmic. */
export type FibRetracementProps = FibChannelProps & {
  trendLine: boolean
  trendLineColor: string
  trendLineWidth: number
  trendLineStyle: LineStyle
  reverse: boolean
  showText: boolean
  textHAlign: TextHAlign
  textVAlign: TextVAlign
  levelsOnLogScale: boolean
}

const CHANNEL_PROPS: Omit<FibChannelProps, 'levels'> = {
  extendLeft: false,
  extendRight: false,
  showLevels: true,
  coeffsAsPercents: false,
  showPrices: true,
  labelsHAlign: 'left',
  labelsVAlign: 'middle',
  fillBackground: true,
  backgroundOpacity: 0.2,
}

const RETRACEMENT_PROPS: Omit<FibRetracementProps, 'levels'> = {
  ...CHANNEL_PROPS,
  trendLine: true,
  trendLineColor: '#808080',
  trendLineWidth: 2,
  trendLineStyle: 'dashed',
  reverse: false,
  showText: true,
  textHAlign: 'center',
  textVAlign: 'middle',
  levelsOnLogScale: false,
}

/** A saved fib that carries its background switch as `background` reads it as `fillBackground`. */
function upgradeBackground<P extends { fillBackground: boolean }>(props: Partial<P>): Partial<P> {
  const saved = props as Partial<P> & { background?: unknown }
  if (!('background' in saved)) return props
  const { background, ...rest } = saved
  return ('fillBackground' in rest ? rest : { ...rest, fillBackground: background !== false }) as Partial<P>
}

/** A level's value as its label writes it: the ratio, or the ratio as a percent. */
function levelValueText(value: number, asPercent: boolean): string {
  return asPercent ? `${Number((value * 100).toFixed(4))}%` : String(value)
}

/** How a fib's words stand across a level's line: above it, on it, or below it. */
const ACROSS_LEVEL: Record<TextVAlign, { dy: number; baseline: CanvasTextBaseline }> = {
  top: { dy: -3, baseline: 'bottom' },
  middle: { dy: 0, baseline: 'middle' },
  bottom: { dy: 3, baseline: 'top' },
}

type Placement = { at: Point; align: CanvasTextAlign; baseline: CanvasTextBaseline }

/** Where a level's label stands on a level line from `a` to `b`: before the line's start, at its
 *  middle or after its end, and above, on or below it. */
function labelPlace(h: TextHAlign, v: TextVAlign, a: Point, b: Point): Placement {
  const across = ACROSS_LEVEL[v]
  const [start, end] = a.x <= b.x ? [a, b] : [b, a]
  if (h === 'left') return { at: { x: start.x - 4, y: start.y + across.dy }, align: 'right', baseline: across.baseline }
  if (h === 'right') return { at: { x: end.x + 4, y: end.y + across.dy }, align: 'left', baseline: across.baseline }
  const mid = midpoint(start, end)
  return { at: { x: mid.x, y: mid.y + across.dy }, align: 'center', baseline: across.baseline }
}

/** Where a level's own words stand on its line from `a` to `b`: inside its start, at its middle or
 *  inside its end, and above, on or below it. */
function textPlace(h: TextHAlign, v: TextVAlign, a: Point, b: Point): Placement {
  const across = ACROSS_LEVEL[v]
  const [start, end] = a.x <= b.x ? [a, b] : [b, a]
  if (h === 'left') return { at: { x: start.x + 4, y: start.y + across.dy }, align: 'left', baseline: across.baseline }
  if (h === 'right') return { at: { x: end.x - 4, y: end.y + across.dy }, align: 'right', baseline: across.baseline }
  const mid = midpoint(start, end)
  return { at: { x: mid.x, y: mid.y + across.dy }, align: 'center', baseline: across.baseline }
}

/** A price a fraction of the way from one price to another: by price, or by log price where both
 *  are positive and the levels divide the swing logarithmically. */
function priceBetween(from: number, to: number, fraction: number, log: boolean): number {
  if (log && from > 0 && to > 0) return Math.exp(Math.log(from) + (Math.log(to) - Math.log(from)) * fraction)
  return from + (to - from) * fraction
}

/** One level as a tool paints it: the level, its color, its line on the pane and its price. */
type LevelLine = { level: FibLevel; color: string; a: Point; b: Point; price: number }

/** What a leveled fib paints its level lines from: its style, its props, and its price formatter. */
type LevelLinePainter = {
  style: Readonly<DrawingStyle>
  props: Readonly<FibChannelProps & { showText?: boolean; textHAlign?: TextHAlign; textVAlign?: TextVAlign }>
  format(price: number): string
}

/** The parts a horizontal or parallel leveled fib paints from its level lines: the bands, the lines
 *  in the levels' stroke, and each level's label and words in its own color. */
function paintLevelLines(ctx: CanvasRenderingContext2D, drawing: LevelLinePainter, lines: readonly LevelLine[]): void {
  const { props, style } = drawing
  if (props.fillBackground && props.backgroundOpacity > 0) {
    const ordered = [...lines].sort((p, q) => p.level.value - q.level.value)
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i]!
      const to = ordered[i + 1]!
      ctx.fillStyle = withAlpha(to.color, props.backgroundOpacity)
      ctx.beginPath()
      ctx.moveTo(from.a.x, from.a.y)
      ctx.lineTo(from.b.x, from.b.y)
      ctx.lineTo(to.b.x, to.b.y)
      ctx.lineTo(to.a.x, to.a.y)
      ctx.closePath()
      ctx.fill()
    }
  }
  for (const line of lines) {
    ctx.save()
    applyStroke(ctx, { ...style, lineColor: line.color })
    strokeSegment(ctx, line.a, line.b)
    ctx.restore()
  }
  const ink = (color: string): DrawingStyle => ({ ...style, textColor: color })
  for (const line of lines) {
    const parts: string[] = []
    if (props.showLevels) parts.push(levelValueText(line.level.value, props.coeffsAsPercents))
    if (props.showPrices && Number.isFinite(line.price)) parts.push(`(${drawing.format(line.price)})`)
    if (parts.length) {
      const place = labelPlace(props.labelsHAlign, props.labelsVAlign, line.a, line.b)
      paintLabel(ctx, parts.join(' '), place.at, ink(line.color), { align: place.align, baseline: place.baseline })
    }
    if (props.showText && line.level.text && props.textHAlign && props.textVAlign) {
      const place = textPlace(props.textHAlign, props.textVAlign, line.a, line.b)
      paintLabel(ctx, line.level.text, place.at, ink(line.color), { align: place.align, baseline: place.baseline })
    }
  }
}

/** Horizontal retracement levels between two swing points (level 0 at the second anchor). */
export class FibRetracement extends Drawing<FibRetracementProps> {
  readonly type: string = 'fib_retracement'

  protected override defaultProps(): FibRetracementProps {
    return { levels: FIB_LEVELS.map((l) => ({ ...l })), ...RETRACEMENT_PROPS }
  }

  protected override upgradeProps(props: Partial<FibRetracementProps>): Partial<FibRetracementProps> {
    return upgradeBackground(props)
  }

  requiredAnchors(): number {
    return 2
  }

  /** Whether the levels divide the swing by log price: asked for, and the pane's scale is log. */
  protected logLevels(viewport: Viewport): boolean {
    return this.props.levelsOnLogScale && viewport.logScale === true
  }

  /** Price at a ratio (0 = second anchor, 1 = first; reverse swaps). */
  protected priceAt(value: number, viewport: Viewport): number {
    const [a, b] = this.anchors
    const [from, to] = this.props.reverse ? [a, b] : [b, a]
    return priceBetween(from.price, to.price, value, this.logLevels(viewport))
  }

  protected span(viewport: Viewport): { minX: number; maxX: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    return {
      minX: this.props.extendLeft ? 0 : Math.min(pa.x, pb.x),
      maxX: this.props.extendRight ? viewport.width : Math.max(pa.x, pb.x),
    }
  }

  /** The visible levels as lines across the span, in level order. */
  protected levelLines(viewport: Viewport): LevelLine[] {
    const span = this.span(viewport)
    if (!span) return []
    const out: LevelLine[] = []
    this.props.levels.forEach((level, i) => {
      if (!level.visible) return
      const price = this.priceAt(level.value, viewport)
      const y = viewport.yOf(price)
      if (y === null) return
      out.push({ level, color: fibLevelColor(level, i), a: { x: span.minX, y }, b: { x: span.maxX, y }, price })
    })
    return out
  }

  /** The trend line's run through the swing points. */
  protected trendPoints(viewport: Viewport): Point[] {
    return this.anchorPixels(viewport).filter((p): p is Point => p !== null)
  }

  protected painter(): LevelLinePainter {
    return { style: this.style, props: this.props, format: (price) => this.formatPrice(price) }
  }

  /** The trend line's stroke: its own color, thickness and style. */
  protected trendStyle(): DrawingStyle {
    return { ...this.style, lineColor: this.props.trendLineColor, lineWidth: this.props.trendLineWidth, lineStyle: this.props.trendLineStyle }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.anchors.length < this.requiredAnchors()) return
    paintLevelLines(ctx, this.painter(), this.levelLines(viewport))
    if (this.props.trendLine) {
      const points = this.trendPoints(viewport)
      ctx.save()
      applyStroke(ctx, this.trendStyle())
      for (let i = 0; i < points.length - 1; i++) strokeSegment(ctx, points[i]!, points[i + 1]!)
      ctx.restore()
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (this.anchors.length < this.requiredAnchors()) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (this.levelLines(viewport).some((line) => distanceToSegment(point, line.a, line.b) <= tolerance)) return true
    if (!this.props.trendLine) return false
    const points = this.trendPoints(viewport)
    const trendTolerance = hitTolerance(this.props.trendLineWidth)
    for (let i = 0; i < points.length - 1; i++) if (distanceToSegment(point, points[i]!, points[i + 1]!) <= trendTolerance) return true
    return false
  }
}

/** Extension levels projected from a third point by the first swing's price delta. */
export class FibExtension extends FibRetracement {
  override readonly type = 'fib_trend_ext'

  override requiredAnchors(): number {
    return 3
  }

  protected override priceAt(value: number, viewport: Viewport): number {
    const [a, b, c] = this.anchors
    const sign = this.props.reverse ? -1 : 1
    if (this.logLevels(viewport) && a.price > 0 && b.price > 0 && c.price > 0) return Math.exp(Math.log(c.price) + (Math.log(b.price) - Math.log(a.price)) * value * sign)
    return c.price + (b.price - a.price) * sign * value
  }

  protected override span(viewport: Viewport): { minX: number; maxX: number } | null {
    const [pa, pb, pc] = this.anchorPixels(viewport)
    if (!pa || !pb || !pc) return null
    return {
      minX: this.props.extendLeft ? 0 : pc.x,
      maxX: this.props.extendRight ? viewport.width : pc.x + Math.max(40, Math.abs(pb.x - pa.x)),
    }
  }
}

/** Parallel channel whose offset repeats at ratio multiples. */
export class FibChannel extends Drawing<FibChannelProps> {
  readonly type = 'fib_channel'

  protected override defaultProps(): FibChannelProps {
    return { levels: FIB_LEVELS.map((l) => ({ ...l })), ...CHANNEL_PROPS }
  }

  protected override upgradeProps(props: Partial<FibChannelProps>): Partial<FibChannelProps> {
    return upgradeBackground(props)
  }

  requiredAnchors(): number {
    return 3
  }

  protected lines(viewport: Viewport): LevelLine[] {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return []
    const slopeT = (p3.x - p1.x) / ((p2.x - p1.x) || 1)
    const dy = p3.y - (p1.y + (p2.y - p1.y) * slopeT)
    const { extendLeft, extendRight } = this.props
    const out: LevelLine[] = []
    this.props.levels.forEach((level, i) => {
      if (!level.visible) return
      const a = { x: p1.x, y: p1.y + dy * level.value }
      const b = { x: p2.x, y: p2.y + dy * level.value }
      const seg = extendLeft || extendRight ? extendSegment(a, b, viewport.width, viewport.height, extendLeft, extendRight) : { a, b }
      // A level's price is where its line leaves the channel's first point.
      out.push({ level, color: fibLevelColor(level, i), a: seg.a, b: seg.b, price: viewport.priceAt(a.y) ?? Number.NaN })
    })
    return out
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    paintLevelLines(ctx, { style: this.style, props: this.props, format: (price) => this.formatPrice(price) }, this.lines(viewport))
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.lines(viewport).some((line) => distanceToSegment(point, line.a, line.b) <= tolerance)
  }
}

/** Vertical lines at Fibonacci-sequence multiples of the base span. */
export class FibTimeZone extends Drawing<FibProps> {
  readonly type = 'fib_timezone'

  protected override defaultProps(): FibProps {
    return {
      ...fibDefaults(TIME_SEQUENCE.map((n) => ({ value: n, visible: true }))),
      background: false,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  protected xs(viewport: Viewport): { level: FibLevel; color: string; x: number }[] {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return []
    const unit = p2.x - p1.x
    if (unit === 0) return []
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i), x: p1.x + unit * level.value }))
      .filter((e) => e.level.visible && e.x >= -viewport.width && e.x <= viewport.width * 2)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    for (const entry of this.xs(viewport)) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = entry.color
      strokeSegment(ctx, { x: entry.x, y: 0 }, { x: entry.x, y: viewport.height })
      ctx.restore()
      if (this.props.showLevels) {
        paintLabel(ctx, String(entry.level.value), { x: entry.x + 4, y: viewport.height - 12 }, { ...this.style, textColor: entry.color })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.xs(viewport).some((e) => Math.abs(point.x - e.x) <= tolerance)
  }
}

/** Fan rays from the first anchor through ratio points of the spanned box's far edge. */
export class FibSpeedFan extends Drawing<FibProps> {
  readonly type = 'fib_speed_resist_fan'

  protected override defaultProps(): FibProps {
    return fibDefaults(RATIO_FRACTIONS)
  }

  requiredAnchors(): number {
    return 2
  }

  protected rays(viewport: Viewport): { level: FibLevel; color: string; a: Point; b: Point }[] {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2 || p1.x === p2.x) return []
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible)
      .map((e) => {
        const through = { x: p2.x, y: p1.y + (p2.y - p1.y) * e.level.value }
        const seg = extendSegment(p1, through, viewport.width, viewport.height, false, true)
        return { ...e, a: p1, b: seg.b }
      })
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.45
    ctx.setLineDash(dashPattern('dashed', this.style.lineWidth))
    ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y))
    ctx.restore()
    for (const ray of this.rays(viewport)) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = ray.color
      strokeSegment(ctx, ray.a, ray.b)
      ctx.restore()
      if (this.props.showLevels || this.props.showPrices || ray.level.text) {
        const y = p1.y + (p2.y - p1.y) * ray.level.value
        const price = viewport.priceAt(y)
        const parts = [
          ray.level.text || null,
          this.props.showLevels ? String(ray.level.value) : null,
          this.props.showPrices && price !== null ? `(${this.formatPrice(price)})` : null,
        ].filter((s): s is string => s !== null)
        paintLabel(ctx, parts.join(' '), { x: p2.x + 6, y }, { ...this.style, textColor: ray.color })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.rays(viewport).some((ray) => distanceToSegment(point, ray.a, ray.b) <= tolerance)
  }
}

/** Vertical time ratios of the first swing projected from the third anchor. */
export class FibTimeExtension extends Drawing<FibProps> {
  readonly type = 'fib_trend_time'

  protected override defaultProps(): FibProps {
    return { ...fibDefaults(TIME_RATIOS), background: false }
  }

  requiredAnchors(): number {
    return 3
  }

  protected xs(viewport: Viewport): { level: FibLevel; color: string; x: number }[] {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return []
    const unit = p2.x - p1.x
    if (unit === 0) return []
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i), x: p3.x + unit * level.value }))
      .filter((e) => e.level.visible)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    for (const entry of this.xs(viewport)) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = entry.color
      strokeSegment(ctx, { x: entry.x, y: 0 }, { x: entry.x, y: viewport.height })
      ctx.restore()
      if (this.props.showLevels) {
        paintLabel(ctx, String(entry.level.value), { x: entry.x + 4, y: viewport.height - 12 }, { ...this.style, textColor: entry.color })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.xs(viewport).some((e) => Math.abs(point.x - e.x) <= tolerance)
  }
}

/** Concentric circles at ratio multiples of the anchor distance. */
export type FibCirclesProps = FibProps & {
  /** Label the ratios as percentages (0.618 → 62%). */
  coeffsAsPercents: boolean
}

export class FibCircles extends Drawing<FibCirclesProps> {
  readonly type = 'fib_circles'

  protected override defaultProps(): FibCirclesProps {
    return { ...fibDefaults(RATIO_FRACTIONS.concat([{ value: 1.618, visible: true }])), coeffsAsPercents: false }
  }

  requiredAnchors(): number {
    return 2
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return
    for (const [i, level] of this.props.levels.entries()) {
      if (!level.visible) continue
      const color = fibLevelColor(level, i)
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = color
      ctx.beginPath()
      ctx.arc(p1.x, p1.y, base * level.value, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        const label = this.props.coeffsAsPercents ? `${Math.round(level.value * 100)}%` : String(level.value)
        paintLabel(ctx, label, { x: p1.x + base * level.value + 4, y: p1.y }, { ...this.style, textColor: color })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return false
    const d = Math.hypot(point.x - p1.x, point.y - p1.y)
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.props.levels.some((l) => l.visible && Math.abs(d - base * l.value) <= tolerance)
  }
}

/** Half-circle arcs at ratio radii, centered on the trend line's end and facing its origin. */
export type FibArcsProps = FibProps & {
  /** Complete each arc into a full circle. */
  fullCircles: boolean
}

export class FibArcs extends Drawing<FibArcsProps> {
  readonly type = 'fib_speed_resist_arcs'

  protected override defaultProps(): FibArcsProps {
    return {
      ...fibDefaults([
        { value: 0.382, visible: true },
        { value: 0.5, visible: true },
        { value: 0.618, visible: true },
        { value: 1, visible: true },
      ]),
      fullCircles: false,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return
    // The arcs bow back toward the origin: a half circle perpendicular to the trend segment.
    const back = angleOf(p2, p1)
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.45
    ctx.setLineDash(dashPattern('dashed', this.style.lineWidth))
    strokeSegment(ctx, p1, p2)
    ctx.restore()
    for (const [i, level] of this.props.levels.entries()) {
      if (!level.visible) continue
      const color = fibLevelColor(level, i)
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = color
      ctx.beginPath()
      if (this.props.fullCircles) ctx.arc(p2.x, p2.y, base * level.value, 0, Math.PI * 2)
      else ctx.arc(p2.x, p2.y, base * level.value, back - Math.PI / 2, back + Math.PI / 2)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        const lx = p2.x + Math.cos(back) * base * level.value
        const ly = p2.y + Math.sin(back) * base * level.value
        paintLabel(ctx, String(level.value), { x: lx, y: ly - 8 }, { ...this.style, textColor: color }, { align: 'center' })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return false
    const d = Math.hypot(point.x - p2.x, point.y - p2.y)
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.props.levels.some((l) => l.visible && Math.abs(d - base * l.value) <= tolerance)
  }
}

/** Golden-ratio spiral wound from the first anchor out through the second. */
export class FibSpiral extends Drawing {
  readonly type = 'fib_spiral'

  requiredAnchors(): number {
    return 2
  }

  protected samples(viewport: Viewport): Point[] | null {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return null
    const target = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (target === 0) return null
    const growth = Math.log(GOLDEN_RATIO) / (Math.PI / 2)
    const baseAngle = angleOf(p1, p2)
    const points: Point[] = []
    // Wind 2.5 turns inward and 1 turn outward around the anchor pair.
    for (let theta = -Math.PI * 5; theta <= Math.PI * 2; theta += Math.PI / 24) {
      const r = target * Math.exp(growth * theta)
      if (r < 0.5) continue
      points.push({ x: p1.x + Math.cos(baseAngle + theta) * r, y: p1.y + Math.sin(baseAngle + theta) * r })
    }
    return points
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.samples(viewport)
    if (!points || points.length < 2) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const points = this.samples(viewport)
    if (!points) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) return true
    }
    return false
  }
}

/** Fan of rays from the pitchfork origin through the fork's level points. */
export class Pitchfan extends Drawing<FibProps> {
  readonly type = 'pitchfan'

  protected override defaultProps(): FibProps {
    return fibDefaults([
      { value: 0, visible: true },
      { value: 0.25, visible: true },
      { value: 0.5, visible: true },
      { value: 0.75, visible: true },
      { value: 1, visible: true },
    ])
  }

  requiredAnchors(): number {
    return 3
  }

  protected rays(viewport: Viewport): { level: FibLevel; color: string; a: Point; b: Point }[] {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return []
    const mid = midpoint(p2, p3)
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible)
      .flatMap((e) => {
        const offsets = e.level.value === 0 ? [0] : [e.level.value, -e.level.value]
        return offsets.map((k) => {
          const through = { x: mid.x + (p3.x - mid.x) * k, y: mid.y + (p3.y - mid.y) * k }
          const seg = extendSegment(p1, through, viewport.width, viewport.height, false, true)
          return { ...e, a: p1, b: seg.b }
        })
      })
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    for (const ray of this.rays(viewport)) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = ray.color
      strokeSegment(ctx, ray.a, ray.b)
      ctx.restore()
      if (this.props.showLevels) {
        // Label near the ray's far end, pulled slightly back inside the pane.
        const t = 0.92
        paintLabel(
          ctx,
          String(ray.level.value),
          { x: ray.a.x + (ray.b.x - ray.a.x) * t, y: ray.a.y + (ray.b.y - ray.a.y) * t - 8 },
          { ...this.style, textColor: ray.color },
          { align: 'center' },
        )
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.rays(viewport).some((ray) => distanceToSegment(point, ray.a, ray.b) <= tolerance)
  }
}

/** Wedge: two rays from an apex with ratio arcs spanning the angle between them. */
export class FibWedge extends Drawing<FibProps> {
  readonly type = 'fib_wedge'

  protected override defaultProps(): FibProps {
    return fibDefaults([
      { value: 0.382, visible: true },
      { value: 0.5, visible: true },
      { value: 0.618, visible: true },
      { value: 1, visible: true },
    ])
  }

  requiredAnchors(): number {
    return 3
  }

  protected geometry(viewport: Viewport): { apex: Point; radius: number; a1: number; a2: number } | null {
    const [apex, p2, p3] = this.anchorPixels(viewport)
    if (!apex || !p2 || !p3) return null
    const radius = Math.hypot(p2.x - apex.x, p2.y - apex.y)
    if (radius === 0) return null
    return { apex, radius, a1: angleOf(apex, p2), a2: angleOf(apex, p3) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const geo = this.geometry(viewport)
    if (!geo) return
    applyStroke(ctx, this.style)
    strokeSegment(ctx, geo.apex, { x: geo.apex.x + Math.cos(geo.a1) * geo.radius, y: geo.apex.y + Math.sin(geo.a1) * geo.radius })
    strokeSegment(ctx, geo.apex, { x: geo.apex.x + Math.cos(geo.a2) * geo.radius, y: geo.apex.y + Math.sin(geo.a2) * geo.radius })
    // Labels sit along the wedge's bisector, just past each arc.
    const cross = Math.sin(geo.a2 - geo.a1)
    const sweep = cross < 0 ? geo.a1 - geo.a2 : geo.a2 - geo.a1
    const bisector = geo.a1 + (cross < 0 ? -1 : 1) * (Math.abs(sweep) / 2)
    for (const [i, level] of this.props.levels.entries()) {
      if (!level.visible) continue
      const color = fibLevelColor(level, i)
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = color
      ctx.beginPath()
      // Sweep the short way between the two rays.
      ctx.arc(geo.apex.x, geo.apex.y, geo.radius * level.value, geo.a1, geo.a2, cross < 0)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        const r = geo.radius * level.value + 9
        paintLabel(
          ctx,
          String(level.value),
          { x: geo.apex.x + Math.cos(bisector) * r, y: geo.apex.y + Math.sin(bisector) * r },
          { ...this.style, textColor: color },
          { align: 'center' },
        )
      }
    }
  }

  /** The third handle stands at the end of the second ray: that ray runs as long as the first, at
   *  the third anchor's angle, so the anchor's own distance from the apex paints nothing and a
   *  handle at it would float off the ray's end as the first ray changes length. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points = super.getControlPoints(viewport)
    const geo = this.geometry(viewport)
    if (!geo) return points
    const end = { x: geo.apex.x + Math.cos(geo.a2) * geo.radius, y: geo.apex.y + Math.sin(geo.a2) * geo.radius }
    return points.map((point) => (point.index === 2 ? { ...point, ...end } : point))
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const geo = this.geometry(viewport)
    if (!geo) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    const d = Math.hypot(point.x - geo.apex.x, point.y - geo.apex.y)
    if (this.props.levels.some((l) => l.visible && Math.abs(d - geo.radius * l.value) <= tolerance)) {
      // Constrain arc hits to the wedge's angular span (short way between the rays).
      const angle = Math.atan2(point.y - geo.apex.y, point.x - geo.apex.x)
      const norm = (x: number) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      const sweep = norm(geo.a2 - geo.a1) <= Math.PI ? norm(geo.a2 - geo.a1) : Math.PI * 2 - norm(geo.a2 - geo.a1)
      const start = norm(geo.a2 - geo.a1) <= Math.PI ? geo.a1 : geo.a2
      const rel = norm(angle - start)
      if (rel <= sweep + 0.05) return true
    }
    const end1 = { x: geo.apex.x + Math.cos(geo.a1) * geo.radius, y: geo.apex.y + Math.sin(geo.a1) * geo.radius }
    const end2 = { x: geo.apex.x + Math.cos(geo.a2) * geo.radius, y: geo.apex.y + Math.sin(geo.a2) * geo.radius }
    return distanceToSegment(point, geo.apex, end1) <= tolerance || distanceToSegment(point, geo.apex, end2) <= tolerance
  }
}
