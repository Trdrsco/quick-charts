import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint } from '../core/geometry'
import { applyStroke, dashPattern, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

/** One retracement/extension level. Color falls back to the shared palette by position. */
export type FibLevel = {
  value: number
  visible: boolean
  color?: string
  /** Custom per-level caption, prefixed to the ratio in the level's label. */
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

const RETRACEMENT_LEVELS: FibLevel[] = [
  { value: 0, visible: true },
  { value: 0.236, visible: true },
  { value: 0.382, visible: true },
  { value: 0.5, visible: true },
  { value: 0.618, visible: true },
  { value: 0.786, visible: true },
  { value: 1, visible: true },
  { value: 1.618, visible: true },
  { value: 2.618, visible: true },
  { value: 3.618, visible: true },
  { value: 4.236, visible: true },
]

const EXTENSION_LEVELS: FibLevel[] = [
  { value: 0, visible: true },
  { value: 0.382, visible: true },
  { value: 0.618, visible: true },
  { value: 1, visible: true },
  { value: 1.382, visible: true },
  { value: 1.618, visible: true },
  { value: 2.618, visible: true },
  { value: 3.618, visible: false },
  { value: 4.236, visible: false },
]

const CHANNEL_LEVELS: FibLevel[] = [
  { value: 0, visible: true },
  { value: 0.25, visible: true },
  { value: 0.382, visible: true },
  { value: 0.5, visible: true },
  { value: 0.618, visible: true },
  { value: 0.75, visible: true },
  { value: 1, visible: true },
  { value: 1.618, visible: false },
  { value: 2.618, visible: false },
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

/** Horizontal retracement levels between two swing points (level 0 at the second anchor). */
export class FibRetracement extends Drawing<FibProps> {
  readonly type: string = 'fib_retracement'

  protected override defaultProps(): FibProps {
    return fibDefaults(RETRACEMENT_LEVELS)
  }

  requiredAnchors(): number {
    return 2
  }

  /** Price at a ratio (0 = second anchor, 1 = first; reverse swaps). */
  protected priceAt(value: number): number {
    const [a, b] = this.anchors
    const [from, to] = this.props.reverse ? [a, b] : [b, a]
    return from.price + (to.price - from.price) * value
  }

  protected span(viewport: Viewport): { minX: number; maxX: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    return {
      minX: this.props.extendLeft ? 0 : Math.min(pa.x, pb.x),
      maxX: this.props.extendRight ? viewport.width : Math.max(pa.x, pb.x),
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.anchors.length < 2) return
    const span = this.span(viewport)
    if (!span) return
    const visible = this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible)
      .map((e) => ({ ...e, y: viewport.yOf(this.priceAt(e.level.value)) }))
      .filter((e): e is typeof e & { y: number } => e.y !== null)
      .sort((a, b) => a.y - b.y)

    if (this.props.background) {
      for (let i = 0; i < visible.length - 1; i++) {
        ctx.fillStyle = withAlpha(visible[i + 1].color, 0.07)
        ctx.fillRect(span.minX, visible[i].y, span.maxX - span.minX, visible[i + 1].y - visible[i].y)
      }
    }
    for (const entry of visible) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = entry.color
      strokeSegment(ctx, { x: span.minX, y: entry.y }, { x: span.maxX, y: entry.y })
      ctx.restore()
      const parts: string[] = []
      if (entry.level.text) parts.push(entry.level.text)
      if (this.props.showLevels) parts.push(String(entry.level.value))
      if (this.props.showPrices) parts.push(`(${this.formatPrice(this.priceAt(entry.level.value))})`)
      if (parts.length) {
        paintLabel(ctx, parts.join(' '), { x: span.minX - 6, y: entry.y }, { ...this.style, textColor: entry.color }, { align: 'right' })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    if (this.anchors.length < 2) return false
    const span = this.span(viewport)
    if (!span) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    if (point.x < span.minX - tolerance || point.x > span.maxX + tolerance) return false
    for (const [i, level] of this.props.levels.entries()) {
      void i
      if (!level.visible) continue
      const y = viewport.yOf(this.priceAt(level.value))
      if (y !== null && Math.abs(point.y - y) <= tolerance) return true
    }
    return false
  }
}

/** Extension levels projected from a third point by the first swing's price delta. */
export class FibExtension extends FibRetracement {
  override readonly type = 'fib_trend_ext'

  protected override defaultProps(): FibProps {
    return fibDefaults(EXTENSION_LEVELS)
  }

  override requiredAnchors(): number {
    return 3
  }

  protected override priceAt(value: number): number {
    const [a, b, c] = this.anchors
    const delta = (b.price - a.price) * (this.props.reverse ? -1 : 1)
    return c.price + delta * value
  }

  protected override span(viewport: Viewport): { minX: number; maxX: number } | null {
    const [pa, pb, pc] = this.anchorPixels(viewport)
    if (!pa || !pb || !pc) return null
    return {
      minX: this.props.extendLeft ? 0 : pc.x,
      maxX: this.props.extendRight ? viewport.width : pc.x + Math.max(40, Math.abs(pb.x - pa.x)),
    }
  }

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.anchors.length < 3) return
    super.paint(ctx, viewport)
    // The defining swing, drawn faintly so the projection's source stays visible.
    const [pa, pb, pc] = this.anchorPixels(viewport)
    if (!pa || !pb || !pc) return
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.5
    ctx.setLineDash(dashPattern('dashed', this.style.lineWidth))
    strokeSegment(ctx, pa, pb)
    strokeSegment(ctx, pb, pc)
    ctx.restore()
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    if (this.anchors.length < 3) return false
    return super.testHit(point, viewport)
  }
}

/** Parallel channel whose offset repeats at ratio multiples. */
export class FibChannel extends Drawing<FibProps> {
  readonly type = 'fib_channel'

  protected override defaultProps(): FibProps {
    return fibDefaults(CHANNEL_LEVELS)
  }

  requiredAnchors(): number {
    return 3
  }

  protected lines(viewport: Viewport): { level: FibLevel; color: string; a: Point; b: Point }[] {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return []
    const slopeT = (p3.x - p1.x) / ((p2.x - p1.x) || 1)
    const dy = p3.y - (p1.y + (p2.y - p1.y) * slopeT)
    const { extendLeft, extendRight } = this.props
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible)
      .map((e) => {
        const a = { x: p1.x, y: p1.y + dy * e.level.value }
        const b = { x: p2.x, y: p2.y + dy * e.level.value }
        const seg = extendLeft || extendRight ? extendSegment(a, b, viewport.width, viewport.height, extendLeft, extendRight) : { a, b }
        return { ...e, ...seg }
      })
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const lines = this.lines(viewport)
    if (this.props.background) {
      for (let i = 0; i < lines.length - 1; i++) {
        ctx.fillStyle = withAlpha(lines[i + 1].color, 0.06)
        ctx.beginPath()
        ctx.moveTo(lines[i].a.x, lines[i].a.y)
        ctx.lineTo(lines[i].b.x, lines[i].b.y)
        ctx.lineTo(lines[i + 1].b.x, lines[i + 1].b.y)
        ctx.lineTo(lines[i + 1].a.x, lines[i + 1].a.y)
        ctx.closePath()
        ctx.fill()
      }
    }
    for (const line of lines) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = line.color
      strokeSegment(ctx, line.a, line.b)
      ctx.restore()
      if (this.props.showLevels || this.props.showPrices || line.level.text) {
        const price = viewport.priceAt(line.a.y)
        const parts = [
          line.level.text || null,
          this.props.showLevels ? String(line.level.value) : null,
          this.props.showPrices && price !== null ? `(${this.formatPrice(price)})` : null,
        ].filter((s): s is string => s !== null)
        paintLabel(ctx, parts.join(' '), { x: line.a.x - 6, y: line.a.y }, { ...this.style, textColor: line.color }, { align: 'right' })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.lines(viewport).some((line) => distanceToSegment(point, line.a, line.b) <= tolerance)
  }
}

/** Vertical lines at Fibonacci-sequence multiples of the base interval. */
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
