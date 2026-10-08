import type { ControlPoint, DrawingStyle, LineStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint } from '../core/geometry'
import { applyStroke, paintLabel, strokeSegment, withAlpha } from '../render/canvas'
import type { TextHAlign, TextVAlign } from './lines'
import { boxDivisions, levelBox, paintBoxLabels, priceY, timeX, upgradeBoxLevels, type BoxLevelsProps, type LevelBox } from './boxLevels'

/** One retracement/extension level. Color falls back to the shared palette by position. */
export type FibLevel = {
  value: number
  visible: boolean
  color?: string
  /** The level's own words, which it carries where its tool shows them. */
  text?: string
  /** The level's own stroke width and style, where its tool draws each level in a stroke of its
   *  own; without them it takes the drawing's. */
  width?: number
  style?: LineStyle
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

const GOLDEN_RATIO = 1.618033988749895

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

/** A level's stroke: its own color, and its own width and style where it carries them. */
function levelStroke(style: Readonly<DrawingStyle>, level: FibLevel, color: string): DrawingStyle {
  return { ...style, lineColor: color, lineWidth: level.width ?? style.lineWidth, lineStyle: level.style ?? style.lineStyle }
}

/** The props a converted fib keeps from a save: the ones it reads, its background switch under
 *  either name, and nothing it no longer draws. */
function knownProps<P extends Record<string, unknown>>(props: Partial<P>, defaults: P): Partial<P> {
  const upgraded = upgradeBackground(props as Partial<P & { fillBackground: boolean }>) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(defaults)) if (key in upgraded) out[key] = upgraded[key]
  return out as Partial<P>
}

/** Levels drawn one to a line: each level its own color, width and style. */
const strokedLevels = (levels: readonly [value: number, color: string, visible: boolean][], width: number): FibLevel[] =>
  levels.map(([value, color, visible]) => ({ value, visible, color, width, style: 'solid' }))

/** Where a vertical level's label stands: before, on or after its line, and at the pane's top, middle
 *  or bottom. */
function verticalLabelPlace(h: TextHAlign, v: TextVAlign, x: number, height: number): Placement {
  const at = { x: h === 'left' ? x - 4 : h === 'right' ? x + 4 : x, y: v === 'top' ? 4 : v === 'bottom' ? height - 4 : height / 2 }
  return { at, align: h === 'left' ? 'right' : h === 'right' ? 'left' : 'center', baseline: v === 'top' ? 'top' : v === 'bottom' ? 'bottom' : 'middle' }
}

/** A vertical level as a tool paints it: the level, its color and its x. */
type VerticalLevel = { level: FibLevel; color: string; x: number }

/** What a time fib paints its vertical levels with: the bands between them, the lines in their own
 *  strokes, and each level's label. */
function paintVerticalLevels(
  ctx: CanvasRenderingContext2D,
  drawing: { style: Readonly<DrawingStyle>; props: Readonly<{ showLevels: boolean; labelsHAlign: TextHAlign; labelsVAlign: TextVAlign; fillBackground: boolean; backgroundOpacity: number }> },
  levels: readonly VerticalLevel[],
  viewport: Viewport,
): void {
  const { props, style } = drawing
  if (props.fillBackground && props.backgroundOpacity > 0) {
    const ordered = [...levels].sort((a, b) => a.x - b.x)
    for (let i = 0; i < ordered.length - 1; i++) {
      ctx.fillStyle = withAlpha(ordered[i + 1]!.color, props.backgroundOpacity)
      ctx.fillRect(ordered[i]!.x, 0, ordered[i + 1]!.x - ordered[i]!.x, viewport.height)
    }
  }
  for (const entry of levels) {
    ctx.save()
    applyStroke(ctx, levelStroke(style, entry.level, entry.color))
    strokeSegment(ctx, { x: entry.x, y: 0 }, { x: entry.x, y: viewport.height })
    ctx.restore()
    if (props.showLevels) {
      const place = verticalLabelPlace(props.labelsHAlign, props.labelsVAlign, entry.x, viewport.height)
      paintLabel(ctx, String(entry.level.value), place.at, { ...style, textColor: entry.color }, { align: place.align, baseline: place.baseline })
    }
  }
}

/** A time zone's levels and their labels: vertical lines at its sequence's multiples of the span
 *  between its points, each labelled with its multiple where `labelsHAlign` and `labelsVAlign` put
 *  it, and the bands between them. */
export type FibTimeZoneProps = {
  levels: FibLevel[]
  showLevels: boolean
  labelsHAlign: TextHAlign
  labelsVAlign: TextVAlign
  fillBackground: boolean
  backgroundOpacity: number
}

const TIME_ZONE_LEVELS = strokedLevels(
  [
    [0, '#808080', true],
    [1, '#2962ff', true],
    [2, '#2962ff', true],
    [3, '#2962ff', true],
    [5, '#2962ff', true],
    [8, '#2962ff', true],
    [13, '#2962ff', true],
    [21, '#2962ff', true],
    [34, '#2962ff', true],
    [55, '#2962ff', true],
    [89, '#2962ff', true],
  ],
  2,
)

/** Vertical lines at Fibonacci-sequence multiples of the base span. */
export class FibTimeZone extends Drawing<FibTimeZoneProps> {
  readonly type = 'fib_timezone'

  protected override defaultProps(): FibTimeZoneProps {
    return { levels: TIME_ZONE_LEVELS.map((l) => ({ ...l })), showLevels: true, labelsHAlign: 'right', labelsVAlign: 'bottom', fillBackground: false, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<FibTimeZoneProps>): Partial<FibTimeZoneProps> {
    return knownProps(props, this.defaultProps())
  }

  requiredAnchors(): number {
    return 2
  }

  protected xs(viewport: Viewport): VerticalLevel[] {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return []
    const unit = p2.x - p1.x
    if (unit === 0) return []
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i), x: p1.x + unit * level.value }))
      .filter((e) => e.level.visible && e.x >= -viewport.width && e.x <= viewport.width * 2)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    paintVerticalLevels(ctx, this, this.xs(viewport), viewport)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    return this.xs(viewport).some((e) => Math.abs(point.x - e.x) <= hitTolerance(e.level.width ?? this.style.lineWidth))
  }
}

/** A tool's trend line through its points, in a stroke of its own, switched on and off. */
export type FibTrendProps = {
  trendLine: boolean
  trendLineColor: string
  trendLineWidth: number
  trendLineStyle: LineStyle
}

/** A trend line's stroke. */
const trendStroke = (style: Readonly<DrawingStyle>, props: Readonly<FibTrendProps>): DrawingStyle => ({
  ...style,
  lineColor: props.trendLineColor,
  lineWidth: props.trendLineWidth,
  lineStyle: props.trendLineStyle,
})

/** Stroke a trend line through points, where it is switched on. */
function paintTrend(ctx: CanvasRenderingContext2D, style: Readonly<DrawingStyle>, props: Readonly<FibTrendProps>, points: readonly Point[]): void {
  if (!props.trendLine || points.length < 2) return
  ctx.save()
  applyStroke(ctx, trendStroke(style, props))
  for (let i = 0; i < points.length - 1; i++) strokeSegment(ctx, points[i]!, points[i + 1]!)
  ctx.restore()
}

/** Whether a point is on a trend line through points, where it is switched on. */
function hitsTrend(point: Point, props: Readonly<FibTrendProps>, points: readonly Point[]): boolean {
  if (!props.trendLine) return false
  const tolerance = hitTolerance(props.trendLineWidth)
  for (let i = 0; i < points.length - 1; i++) if (distanceToSegment(point, points[i]!, points[i + 1]!) <= tolerance) return true
  return false
}

/** A trend-based time fib: a time zone projected from the third point by the first swing's span,
 *  drawn with its trend line. */
export type FibTimeExtensionProps = FibTimeZoneProps & FibTrendProps

const TIME_RATIO_LEVELS = strokedLevels(
  [
    [0, '#808080', true],
    [0.382, '#f23645', true],
    [0.5, '#81c784', false],
    [0.618, '#4caf50', true],
    [1, '#089981', true],
    [1.382, '#00bcd4', true],
    [1.618, '#808080', true],
    [2, '#2962ff', true],
    [2.382, '#e91e63', true],
    [2.618, '#9c27b0', true],
    [3, '#673ab7', true],
  ],
  2,
)

const DASHED_TREND: FibTrendProps = { trendLine: true, trendLineColor: '#808080', trendLineWidth: 2, trendLineStyle: 'dashed' }

/** Vertical time ratios of the first swing projected from the third anchor. */
export class FibTimeExtension extends Drawing<FibTimeExtensionProps> {
  readonly type = 'fib_trend_time'

  protected override defaultProps(): FibTimeExtensionProps {
    return { levels: TIME_RATIO_LEVELS.map((l) => ({ ...l })), ...DASHED_TREND, showLevels: true, labelsHAlign: 'right', labelsVAlign: 'bottom', fillBackground: true, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<FibTimeExtensionProps>): Partial<FibTimeExtensionProps> {
    return knownProps(props, this.defaultProps())
  }

  requiredAnchors(): number {
    return 3
  }

  protected xs(viewport: Viewport): VerticalLevel[] {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return []
    const unit = p2.x - p1.x
    if (unit === 0) return []
    return this.props.levels.map((level, i) => ({ level, color: fibLevelColor(level, i), x: p3.x + unit * level.value })).filter((e) => e.level.visible)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    paintVerticalLevels(ctx, this, this.xs(viewport), viewport)
    paintTrend(ctx, this.style, this.props, this.anchorPixels(viewport).filter((p): p is Point => p !== null))
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (this.xs(viewport).some((e) => Math.abs(point.x - e.x) <= hitTolerance(e.level.width ?? this.style.lineWidth))) return true
    return hitsTrend(point, this.props, this.anchorPixels(viewport).filter((p): p is Point => p !== null))
  }
}

/** The ring levels of a circle or arc fib: each ratio of its trend line's length, with its trend
 *  line, its labels reading the ratio or its percent, and the bands between rings. */
export type FibRingProps = FibTrendProps & {
  levels: FibLevel[]
  showLevels: boolean
  fillBackground: boolean
  backgroundOpacity: number
}

export type FibCirclesProps = FibRingProps & {
  /** Label the ratios as percentages (0.618 → 61.8%). */
  coeffsAsPercents: boolean
}

const RING_LEVELS: readonly [number, string, boolean][] = [
  [0.236, '#f23645', true],
  [0.382, '#ff9800', true],
  [0.5, '#089981', true],
  [0.618, '#4caf50', true],
  [0.786, '#00bcd4', true],
  [1, '#808080', true],
  [1.618, '#2962ff', true],
  [2.618, '#e91e63', true],
  [3.618, '#2962ff', true],
  [4.236, '#e91e63', true],
  [4.618, '#f23645', true],
]

/** Fill the band between two rings around a center, an outer ring's color at an opacity. */
function fillRing(ctx: CanvasRenderingContext2D, center: Point, inner: number, outer: number, color: string, opacity: number, from = 0, to = Math.PI * 2): void {
  ctx.save()
  ctx.fillStyle = withAlpha(color, opacity)
  ctx.beginPath()
  ctx.arc(center.x, center.y, outer, from, to)
  ctx.arc(center.x, center.y, inner, to, from, true)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Circles about the first point at ratios of the trend line's length. */
export class FibCircles extends Drawing<FibCirclesProps> {
  readonly type = 'fib_circles'

  protected override defaultProps(): FibCirclesProps {
    return { levels: strokedLevels(RING_LEVELS, 2), ...DASHED_TREND, showLevels: true, coeffsAsPercents: false, fillBackground: true, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<FibCirclesProps>): Partial<FibCirclesProps> {
    return knownProps(props, this.defaultProps())
  }

  requiredAnchors(): number {
    return 2
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return
    const shown = this.props.levels.map((level, i) => ({ level, color: fibLevelColor(level, i), r: base * level.value })).filter((e) => e.level.visible && e.r > 0)
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      const ordered = [...shown].sort((a, b) => a.r - b.r)
      for (let i = 0; i < ordered.length; i++) fillRing(ctx, p1, i === 0 ? 0 : ordered[i - 1]!.r, ordered[i]!.r, ordered[i]!.color, this.props.backgroundOpacity)
    }
    for (const entry of shown) {
      ctx.save()
      applyStroke(ctx, levelStroke(this.style, entry.level, entry.color))
      ctx.beginPath()
      ctx.arc(p1.x, p1.y, entry.r, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        paintLabel(ctx, levelValueText(entry.level.value, this.props.coeffsAsPercents), { x: p1.x + entry.r + 4, y: p1.y }, { ...this.style, textColor: entry.color })
      }
    }
    paintTrend(ctx, this.style, this.props, [p1, p2])
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return false
    const d = Math.hypot(point.x - p1.x, point.y - p1.y)
    if (this.props.levels.some((l) => l.visible && Math.abs(d - base * l.value) <= hitTolerance(l.width ?? this.style.lineWidth))) return true
    return hitsTrend(point, this.props, [p1, p2])
  }
}

/** Half-circle arcs at ratio radii, centered on the trend line's end and facing its origin. */
export type FibArcsProps = FibRingProps & {
  /** Complete each arc into a full circle. */
  fullCircles: boolean
}

/** Arcs about the trend line's end at ratios of its length, bowed back toward its start. */
export class FibArcs extends Drawing<FibArcsProps> {
  readonly type = 'fib_speed_resist_arcs'

  protected override defaultProps(): FibArcsProps {
    return { levels: strokedLevels(RING_LEVELS, 2), ...DASHED_TREND, showLevels: true, fullCircles: false, fillBackground: true, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<FibArcsProps>): Partial<FibArcsProps> {
    return knownProps(props, this.defaultProps())
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
    const [from, to] = this.props.fullCircles ? [0, Math.PI * 2] : [back - Math.PI / 2, back + Math.PI / 2]
    const shown = this.props.levels.map((level, i) => ({ level, color: fibLevelColor(level, i), r: base * level.value })).filter((e) => e.level.visible && e.r > 0)
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      const ordered = [...shown].sort((a, b) => a.r - b.r)
      for (let i = 0; i < ordered.length; i++) fillRing(ctx, p2, i === 0 ? 0 : ordered[i - 1]!.r, ordered[i]!.r, ordered[i]!.color, this.props.backgroundOpacity, from, to)
    }
    for (const entry of shown) {
      ctx.save()
      applyStroke(ctx, levelStroke(this.style, entry.level, entry.color))
      ctx.beginPath()
      ctx.arc(p2.x, p2.y, entry.r, from, to)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        const lx = p2.x + Math.cos(back) * entry.r
        const ly = p2.y + Math.sin(back) * entry.r
        paintLabel(ctx, String(entry.level.value), { x: lx, y: ly - 8 }, { ...this.style, textColor: entry.color }, { align: 'center' })
      }
    }
    paintTrend(ctx, this.style, this.props, [p1, p2])
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    const base = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    if (base === 0) return false
    const d = Math.hypot(point.x - p2.x, point.y - p2.y)
    if (this.props.levels.some((l) => l.visible && Math.abs(d - base * l.value) <= hitTolerance(l.width ?? this.style.lineWidth))) return true
    return hitsTrend(point, this.props, [p1, p2])
  }
}

/** A wedge's levels: arcs at ratios of its first ray's length between its two rays, with the rays
 *  as its trend line, the arcs' labels, and the bands between arcs. */
export type FibWedgeProps = FibTrendProps & {
  levels: FibLevel[]
  showLevels: boolean
  fillBackground: boolean
  backgroundOpacity: number
}

const WEDGE_LEVELS: readonly [number, string, boolean][] = [
  [0.236, '#f23645', true],
  [0.382, '#ff9800', true],
  [0.5, '#4caf50', true],
  [0.618, '#089981', true],
  [0.786, '#00bcd4', true],
  [1, '#808080', true],
  [1.618, '#2962ff', false],
  [2.618, '#f23645', false],
  [3.618, '#673ab7', false],
  [4.236, '#e91e63', false],
  [4.618, '#e91e63', false],
]

/** Wedge: two rays from an apex with ratio arcs spanning the angle between them. */
export class FibWedge extends Drawing<FibWedgeProps> {
  readonly type = 'fib_wedge'

  protected override defaultProps(): FibWedgeProps {
    return { levels: strokedLevels(WEDGE_LEVELS, 2), trendLine: true, trendLineColor: '#808080', trendLineWidth: 2, trendLineStyle: 'solid', showLevels: true, fillBackground: true, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<FibWedgeProps>): Partial<FibWedgeProps> {
    return knownProps(props, this.defaultProps())
  }

  requiredAnchors(): number {
    return 3
  }

  /** The apex, the first ray's length, the rays' angles, and the arcs' sweep the short way between
   *  the rays, as a clockwise run from `start` to `end`. */
  protected geometry(viewport: Viewport): { apex: Point; radius: number; a1: number; a2: number; start: number; end: number; bisector: number } | null {
    const [apex, p2, p3] = this.anchorPixels(viewport)
    if (!apex || !p2 || !p3) return null
    const radius = Math.hypot(p2.x - apex.x, p2.y - apex.y)
    if (radius === 0) return null
    const a1 = angleOf(apex, p2)
    const a2 = angleOf(apex, p3)
    const [start, end] = Math.sin(a2 - a1) < 0 ? [a2, a1] : [a1, a2]
    const sweep = (((end - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    return { apex, radius, a1, a2, start, end: start + sweep, bisector: start + sweep / 2 }
  }

  /** The two rays, each as long as the first. */
  protected rays(geo: { apex: Point; radius: number; a1: number; a2: number }): Point[][] {
    const end = (a: number): Point => ({ x: geo.apex.x + Math.cos(a) * geo.radius, y: geo.apex.y + Math.sin(a) * geo.radius })
    return [
      [geo.apex, end(geo.a1)],
      [geo.apex, end(geo.a2)],
    ]
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const geo = this.geometry(viewport)
    if (!geo) return
    const shown = this.props.levels.map((level, i) => ({ level, color: fibLevelColor(level, i), r: geo.radius * level.value })).filter((e) => e.level.visible && e.r > 0)
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      const ordered = [...shown].sort((a, b) => a.r - b.r)
      for (let i = 0; i < ordered.length; i++) fillRing(ctx, geo.apex, i === 0 ? 0 : ordered[i - 1]!.r, ordered[i]!.r, ordered[i]!.color, this.props.backgroundOpacity, geo.start, geo.end)
    }
    for (const entry of shown) {
      ctx.save()
      applyStroke(ctx, levelStroke(this.style, entry.level, entry.color))
      ctx.beginPath()
      ctx.arc(geo.apex.x, geo.apex.y, entry.r, geo.start, geo.end)
      ctx.stroke()
      ctx.restore()
      if (this.props.showLevels) {
        // Labels sit along the wedge's bisector, just past each arc.
        const r = entry.r + 9
        paintLabel(ctx, String(entry.level.value), { x: geo.apex.x + Math.cos(geo.bisector) * r, y: geo.apex.y + Math.sin(geo.bisector) * r }, { ...this.style, textColor: entry.color }, { align: 'center' })
      }
    }
    for (const ray of this.rays(geo)) paintTrend(ctx, this.style, this.props, ray)
  }

  /** The third handle stands at the end of the second ray: that ray runs as long as the first, at
   *  the third anchor's angle, so the anchor's own distance from the apex paints nothing and a
   *  handle at it would float off the ray's end as the first ray changes length. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points = super.getControlPoints(viewport)
    const geo = this.geometry(viewport)
    if (!geo) return points
    const end = this.rays(geo)[1]![1]!
    return points.map((point) => (point.index === 2 ? { ...point, ...end } : point))
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const geo = this.geometry(viewport)
    if (!geo) return false
    const d = Math.hypot(point.x - geo.apex.x, point.y - geo.apex.y)
    const angle = Math.atan2(point.y - geo.apex.y, point.x - geo.apex.x)
    const rel = (((angle - geo.start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    if (rel <= geo.end - geo.start + 0.05 && this.props.levels.some((l) => l.visible && Math.abs(d - geo.radius * l.value) <= hitTolerance(l.width ?? this.style.lineWidth))) return true
    return this.rays(geo).some((ray) => hitsTrend(point, this.props, ray))
  }
}

/** A pitchfan's median and levels: the median from the first point through the middle of the other
 *  two in a stroke of its own, rays through each level's point on either side of it, and the bands
 *  between rays. */
export type PitchfanProps = {
  medianColor: string
  medianWidth: number
  medianStyle: LineStyle
  levels: FibLevel[]
  fillBackground: boolean
  backgroundOpacity: number
}

const FORK_LEVELS: readonly [number, string, boolean][] = [
  [0.25, '#ffb74d', false],
  [0.382, '#81c784', false],
  [0.5, '#00bcd4', true],
  [0.618, '#089981', false],
  [0.75, '#00bcd4', false],
  [1, '#2962ff', true],
  [1.5, '#9c27b0', false],
  [1.75, '#e91e63', false],
  [2, '#f77c80', false],
]

/** Fan of rays from the pitchfork origin through the fork's level points. */
export class Pitchfan extends Drawing<PitchfanProps> {
  readonly type = 'pitchfan'

  protected override defaultProps(): PitchfanProps {
    return { medianColor: '#f23645', medianWidth: 2, medianStyle: 'solid', levels: strokedLevels(FORK_LEVELS, 2), fillBackground: true, backgroundOpacity: 0.2 }
  }

  protected override upgradeProps(props: Partial<PitchfanProps>): Partial<PitchfanProps> {
    const known = knownProps(props, this.defaultProps())
    // The median stands on its own, so a level at zero draws nothing more.
    if (Array.isArray(known.levels)) known.levels = known.levels.filter((l) => l.value !== 0)
    return known
  }

  requiredAnchors(): number {
    return 3
  }

  /** The ray from the origin through a point, to the pane's edge. */
  protected rayThrough(origin: Point, through: Point, viewport: Viewport): { a: Point; b: Point } {
    return { a: origin, b: extendSegment(origin, through, viewport.width, viewport.height, false, true).b }
  }

  /** The median and each visible level's two rays, one on either side of the median. */
  protected fan(viewport: Viewport): { median: { a: Point; b: Point }; rays: { level: FibLevel; color: string; side: 1 | -1; a: Point; b: Point }[] } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    const mid = midpoint(p2, p3)
    if (mid.x === p1.x && mid.y === p1.y) return null
    const rays: { level: FibLevel; color: string; side: 1 | -1; a: Point; b: Point }[] = []
    this.props.levels.forEach((level, i) => {
      if (!level.visible || level.value === 0) return
      for (const side of [1, -1] as const) {
        const k = level.value * side
        rays.push({ level, color: fibLevelColor(level, i), side, ...this.rayThrough(p1, { x: mid.x + (p3.x - mid.x) * k, y: mid.y + (p3.y - mid.y) * k }, viewport) })
      }
    })
    return { median: this.rayThrough(p1, mid, viewport), rays }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const fan = this.fan(viewport)
    if (!fan) return
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      for (const side of [1, -1] as const) {
        const ordered = fan.rays.filter((r) => r.side === side).sort((a, b) => a.level.value - b.level.value)
        let inner = fan.median
        for (const ray of ordered) {
          ctx.save()
          ctx.fillStyle = withAlpha(ray.color, this.props.backgroundOpacity)
          ctx.beginPath()
          ctx.moveTo(ray.a.x, ray.a.y)
          ctx.lineTo(inner.b.x, inner.b.y)
          ctx.lineTo(ray.b.x, ray.b.y)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
          inner = ray
        }
      }
    }
    for (const ray of fan.rays) {
      ctx.save()
      applyStroke(ctx, levelStroke(this.style, ray.level, ray.color))
      strokeSegment(ctx, ray.a, ray.b)
      ctx.restore()
    }
    ctx.save()
    applyStroke(ctx, { ...this.style, lineColor: this.props.medianColor, lineWidth: this.props.medianWidth, lineStyle: this.props.medianStyle })
    strokeSegment(ctx, fan.median.a, fan.median.b)
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const fan = this.fan(viewport)
    if (!fan) return false
    if (distanceToSegment(point, fan.median.a, fan.median.b) <= hitTolerance(this.props.medianWidth)) return true
    return fan.rays.some((ray) => distanceToSegment(point, ray.a, ray.b) <= hitTolerance(ray.level.width ?? this.style.lineWidth))
  }
}

/** A speed resistance fan: rays from its first point through each price division of the box's far
 *  edge and each time division of its far side, the bands between rays, a grid at the divisions in
 *  a stroke of its own, and each division's labels. */
export type FibSpeedFanProps = BoxLevelsProps & {
  fillBackground: boolean
  backgroundOpacity: number
  grid: boolean
  gridColor: string
  gridWidth: number
  gridStyle: LineStyle
}

/** Fan rays from the first anchor through ratio points of the spanned box's far edge. */
export class FibSpeedFan extends Drawing<FibSpeedFanProps> {
  readonly type = 'fib_speed_resist_fan'

  protected override defaultProps(): FibSpeedFanProps {
    return {
      priceLevels: boxDivisions(),
      timeLevels: boxDivisions(),
      showLeftLabels: true,
      showRightLabels: true,
      showTopLabels: true,
      showBottomLabels: true,
      fillBackground: true,
      backgroundOpacity: 0.2,
      grid: true,
      gridColor: 'rgba(21, 56, 153, 0.8)',
      gridWidth: 1,
      gridStyle: 'solid',
      reverse: false,
    }
  }

  protected override upgradeProps(props: Partial<FibSpeedFanProps>): Partial<FibSpeedFanProps> {
    return knownProps(upgradeBoxLevels(props), this.defaultProps())
  }

  requiredAnchors(): number {
    return 2
  }

  protected box(viewport: Viewport): LevelBox | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b || a.x === b.x || a.y === b.y) return null
    return levelBox(a, b, this.props.reverse)
  }

  /** The fan's rays: a price division's through the far edge at its height, a time division's
   *  through the far side at its place, each run to the pane's edge. */
  protected rays(box: LevelBox, viewport: Viewport): { level: FibLevel; color: string; kind: 'price' | 'time'; a: Point; b: Point }[] {
    const out: { level: FibLevel; color: string; kind: 'price' | 'time'; a: Point; b: Point }[] = []
    const ray = (through: Point): { a: Point; b: Point } => ({ a: box.origin, b: extendSegment(box.origin, through, viewport.width, viewport.height, false, true).b })
    this.props.priceLevels.forEach((level, i) => {
      if (level.visible) out.push({ level, color: fibLevelColor(level, i), kind: 'price', ...ray({ x: box.far.x, y: priceY(box, level.value) }) })
    })
    this.props.timeLevels.forEach((level, i) => {
      if (level.visible) out.push({ level, color: fibLevelColor(level, i), kind: 'time', ...ray({ x: timeX(box, level.value), y: box.far.y }) })
    })
    return out
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const box = this.box(viewport)
    if (!box) return
    const rays = this.rays(box, viewport)
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      for (const kind of ['price', 'time'] as const) {
        const ordered = rays.filter((r) => r.kind === kind).sort((p, q) => p.level.value - q.level.value)
        for (let i = 1; i < ordered.length; i++) {
          ctx.save()
          ctx.fillStyle = withAlpha(ordered[i]!.color, this.props.backgroundOpacity)
          ctx.beginPath()
          ctx.moveTo(box.origin.x, box.origin.y)
          ctx.lineTo(ordered[i - 1]!.b.x, ordered[i - 1]!.b.y)
          ctx.lineTo(ordered[i]!.b.x, ordered[i]!.b.y)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }
      }
    }
    if (this.props.grid) {
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: this.props.gridColor, lineWidth: this.props.gridWidth, lineStyle: this.props.gridStyle })
      for (const level of this.props.priceLevels) if (level.visible) strokeSegment(ctx, { x: box.left, y: priceY(box, level.value) }, { x: box.right, y: priceY(box, level.value) })
      for (const level of this.props.timeLevels) if (level.visible) strokeSegment(ctx, { x: timeX(box, level.value), y: box.top }, { x: timeX(box, level.value), y: box.bottom })
      ctx.restore()
    }
    for (const r of rays) {
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: r.color })
      strokeSegment(ctx, r.a, r.b)
      ctx.restore()
    }
    paintBoxLabels(ctx, this.style, this.props, box, fibLevelColor)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    if (!box) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.rays(box, viewport).some((r) => distanceToSegment(point, r.a, r.b) <= tolerance)
  }
}

/** Which way a fib spiral winds out from its first point. */
export type FibSpiralProps = {
  /** Wind counterclockwise on the pane rather than clockwise. */
  counterclockwise: boolean
}

/** Golden-ratio spiral wound from the first anchor out through the second. */
export class FibSpiral extends Drawing<FibSpiralProps> {
  readonly type = 'fib_spiral'

  protected override defaultProps(): FibSpiralProps {
    return { counterclockwise: false }
  }

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
    // The pane's y runs down, so a growing angle turns clockwise on the pane.
    const turn = this.props.counterclockwise ? -1 : 1
    const points: Point[] = []
    // Wind 2.5 turns inward and 1 turn outward around the anchor pair.
    for (let theta = -Math.PI * 5; theta <= Math.PI * 2; theta += Math.PI / 24) {
      const r = target * Math.exp(growth * theta)
      if (r < 0.5) continue
      points.push({ x: p1.x + Math.cos(baseAngle + turn * theta) * r, y: p1.y + Math.sin(baseAngle + turn * theta) * r })
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

