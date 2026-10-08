import type { LineStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barPrice, barsInRange, linearRegression, type BarPriceSource, type SourceBar } from '../core/bars'
import { distanceToSegment, extendSegment } from '../core/geometry'
import { alphaOf, applyStroke, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A regression line's stroke: shown or not, its color, width and style. */
type RegressionLine = { show: boolean; color: string; width: number; style: LineStyle }

/** A regression trend's inputs and its lines' strokes. */
export type RegressionProps = {
  /** How many standard deviations the upper band stands from the line; the lower band's count is
   *  signed, so a band below the line is a negative count. */
  upperDeviation: number
  lowerDeviation: number
  useUpper: boolean
  useLower: boolean
  /** The price of each bar the line is fitted through. */
  source: BarPriceSource
  /** The line through the bars and the two bands, each shown or not in a stroke of its own. */
  baseLine: boolean
  baseColor: string
  baseWidth: number
  baseStyle: LineStyle
  upLine: boolean
  upColor: string
  upWidth: number
  upStyle: LineStyle
  downLine: boolean
  downColor: string
  downWidth: number
  downStyle: LineStyle
  /** Run the line and the bands on past both ends, to the pane's edges. */
  extendLines: boolean
  /** Read the correlation of the bars with the line under its end. */
  showPearsons: boolean
}

const REGRESSION_PROPS: RegressionProps = {
  upperDeviation: 2,
  lowerDeviation: -2,
  useUpper: true,
  useLower: true,
  source: 'close',
  baseLine: true,
  baseColor: 'rgba(242, 54, 69, 0.3)',
  baseWidth: 1,
  baseStyle: 'dashed',
  upLine: true,
  upColor: 'rgba(41, 98, 255, 0.3)',
  upWidth: 2,
  upStyle: 'solid',
  downLine: true,
  downColor: 'rgba(41, 98, 255, 0.3)',
  downWidth: 2,
  downStyle: 'solid',
  extendLines: false,
  showPearsons: true,
}

/** The body between the line and each band, in the band's color at this share of its opacity. */
const BAND_BODY = 0.3

/**
 * Regression trend: least-squares line over the chosen price of the bars between the two anchors,
 * with bands a set number of standard deviations from it. Recomputes live as bars arrive.
 */
export class RegressionTrend extends Drawing<RegressionProps> {
  readonly type = 'regression_trend'

  protected override defaultProps(): RegressionProps {
    return { ...REGRESSION_PROPS }
  }

  /** A trend saved before its lines had strokes of their own counted its lower deviation down from
   *  the line. */
  protected override upgradeProps(props: Partial<RegressionProps>): Partial<RegressionProps> {
    if ('baseLine' in props || typeof props.lowerDeviation !== 'number') return props
    return { ...props, lowerDeviation: -props.lowerDeviation }
  }

  requiredAnchors(): number {
    return 2
  }

  /** The fit over the bars between the anchors, and its correlation with them. */
  protected fit(): { range: SourceBar[]; slope: number; intercept: number; sigma: number; pearson: number } | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const range = barsInRange(this.bars(), a.time, b.time)
    const fit = linearRegression(range, this.props.source)
    if (!fit) return null
    return { range, ...fit, pearson: pearsonOf(range, this.props.source) }
  }

  protected lines(viewport: Viewport): { base: [Point, Point]; upper?: [Point, Point]; lower?: [Point, Point]; pearson: number } | null {
    const fit = this.fit()
    if (!fit) return null
    const first = fit.range[0]!
    const last = fit.range[fit.range.length - 1]!
    const lineAt = (offset: number): [Point, Point] | null => {
      const y1 = viewport.yOf(fit.intercept + offset)
      const y2 = viewport.yOf(fit.intercept + fit.slope * (fit.range.length - 1) + offset)
      const x1 = viewport.xOf(first.time)
      const x2 = viewport.xOf(last.time)
      if (y1 === null || y2 === null || x1 === null || x2 === null) return null
      const a = { x: x1, y: y1 }
      const b = { x: x2, y: y2 }
      if (!this.props.extendLines) return [a, b]
      const run = extendSegment(a, b, viewport.width, viewport.height, true, true)
      return [run.a, run.b]
    }
    const base = lineAt(0)
    if (!base) return null
    return {
      base,
      upper: this.props.useUpper ? (lineAt(fit.sigma * this.props.upperDeviation) ?? undefined) : undefined,
      lower: this.props.useLower ? (lineAt(fit.sigma * this.props.lowerDeviation) ?? undefined) : undefined,
      pearson: fit.pearson,
    }
  }

  /** The strokes of the line and its two bands, as the props set them. */
  protected strokes(): { base: RegressionLine; up: RegressionLine; down: RegressionLine } {
    const p = this.props
    return {
      base: { show: p.baseLine, color: p.baseColor, width: p.baseWidth, style: p.baseStyle },
      up: { show: p.upLine, color: p.upColor, width: p.upWidth, style: p.upStyle },
      down: { show: p.downLine, color: p.downColor, width: p.downWidth, style: p.downStyle },
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const lines = this.lines(viewport)
    if (!lines) {
      this.paintUnavailable(ctx, viewport)
      return
    }
    const strokes = this.strokes()
    const body = (band: [Point, Point] | undefined, color: string): void => {
      if (!band) return
      ctx.save()
      ctx.fillStyle = withAlpha(color, alphaOf(color) * BAND_BODY)
      ctx.beginPath()
      ctx.moveTo(lines.base[0].x, lines.base[0].y)
      ctx.lineTo(lines.base[1].x, lines.base[1].y)
      ctx.lineTo(band[1].x, band[1].y)
      ctx.lineTo(band[0].x, band[0].y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    body(lines.upper, strokes.up.color)
    body(lines.lower, strokes.down.color)
    const draw = (line: [Point, Point] | undefined, stroke: RegressionLine): void => {
      if (!line || !stroke.show) return
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: stroke.color, lineWidth: stroke.width, lineStyle: stroke.style })
      strokeSegment(ctx, line[0], line[1])
      ctx.restore()
    }
    draw(lines.upper, strokes.up)
    draw(lines.lower, strokes.down)
    draw(lines.base, strokes.base)
    if (this.props.showPearsons && Number.isFinite(lines.pearson)) {
      // The correlation reads under the lowest line's end, in the base line's hue.
      const end = (lines.lower ?? lines.base)[1]
      paintLabel(ctx, lines.pearson.toFixed(4), { x: end.x, y: end.y + 4 }, { ...this.style, textColor: withAlpha(strokes.base.color, 1) }, { align: 'center', baseline: 'top' })
    }
  }

  protected paintUnavailable(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.5
    strokeSegment(ctx, pa, pb)
    ctx.restore()
    paintLabel(ctx, 'no bar data in range', { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 12 }, this.style, {
      align: 'center',
      background: withAlpha('#1b1f27', 0.92),
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const lines = this.lines(viewport)
    if (!lines) {
      const [pa, pb] = this.anchorPixels(viewport)
      return !!pa && !!pb && distanceToSegment(point, pa, pb) <= hitTolerance(this.style.lineWidth)
    }
    const strokes = this.strokes()
    const parts: [[Point, Point] | undefined, RegressionLine][] = [
      [lines.base, strokes.base],
      [lines.upper, strokes.up],
      [lines.lower, strokes.down],
    ]
    return parts.some(([line, stroke]) => !!line && stroke.show && distanceToSegment(point, line[0], line[1]) <= hitTolerance(stroke.width))
  }
}

/** The correlation of the bars' chosen price with their order, from -1 to 1. */
function pearsonOf(bars: readonly SourceBar[], source: BarPriceSource): number {
  const n = bars.length
  if (n < 2) return Number.NaN
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < n; i++) {
    sumX += i
    sumY += barPrice(bars[i]!, source)
  }
  const meanX = sumX / n
  const meanY = sumY / n
  let covariance = 0
  let varX = 0
  let varY = 0
  for (let i = 0; i < n; i++) {
    const dx = i - meanX
    const dy = barPrice(bars[i]!, source) - meanY
    covariance += dx * dy
    varX += dx * dx
    varY += dy * dy
  }
  return varX > 0 && varY > 0 ? covariance / Math.sqrt(varX * varY) : Number.NaN
}

/** A captured bar (relative form) inside a bars-pattern/ghost-feed payload. */
export type CapturedBar = {
  o: number
  h: number
  l: number
  c: number
}

export type BarsPatternProps = {
  /** OHLC snapshot captured at placement — the pattern stays as drawn while it moves. */
  bars: CapturedBar[]
  /** Reflect the pattern vertically (price axis). */
  mirrored: boolean
  /** Reflect the pattern horizontally (time axis). */
  flipped: boolean
  /** `hl` paints each bar's high-low range and `oc` its open-close range; a price paints the
   *  pattern as a line through it. */
  mode: BarsPatternMode
}

/** The ways a bars pattern paints its bars, in the order its Mode list offers them. */
export const BARS_PATTERN_MODES = ['hl', 'oc', 'close', 'open', 'high', 'low', 'hl2'] as const
export type BarsPatternMode = (typeof BARS_PATTERN_MODES)[number]

export type GhostFeedProps = {
  /** Average candle high-low span in price units; 0 = auto-seed from recent bars at placement. */
  averageHL: number
  /** Wobble amplitude as a percentage of the average span (0..100). */
  variance: number
  upColor: string
  downColor: string
  borderUpColor: string
  borderDownColor: string
  wickColor: string
  drawBorder: boolean
  drawWick: boolean
  /** 0..100; candles paint at (100 − transparency)% opacity. */
  transparency: number
}

/**
 * Shared base for tools that snapshot the OHLC run between their anchors at placement and
 * repaint it wherever the drawing is dragged (prices shift with the first anchor).
 */
export abstract class CapturedBarsDrawing<P extends { bars: CapturedBar[] } & Record<string, unknown>> extends Drawing<P> {
  requiredAnchors(): number {
    return 2
  }

  /** Captured at placement by the host: the OHLC run between the anchors. */
  capture(): void {
    const [a, b] = this.anchors
    if (!a || !b) return
    const range = barsInRange(this.bars(), a.time, b.time)
    if (!range.length) return
    this.applyProps({
      bars: range.map((bar) => ({ o: bar.open, h: bar.high, l: bar.low, c: bar.close })),
    } as unknown as Partial<P>)
  }

  protected frame(viewport: Viewport): { x1: number; x2: number; baseY: number; scale: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb || this.props.bars.length === 0) return null
    // Price-to-pixel scale from the viewport at the first anchor's price.
    const yAtBase = viewport.yOf(this.anchors[0].price)
    const yAtBasePlus = viewport.yOf(this.anchors[0].price + 1)
    if (yAtBase === null || yAtBasePlus === null) return null
    const scale = yAtBasePlus - yAtBase // px per +1 price (negative in screen space)
    return { x1: Math.min(pa.x, pb.x), x2: Math.max(pa.x, pb.x), baseY: pa.y, scale }
  }

  protected paintPlaceholder(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.setLineDash([4, 4])
    ctx.globalAlpha = 0.5
    ctx.strokeRect(Math.min(pa.x, pb.x), Math.min(pa.y, pb.y), Math.abs(pb.x - pa.x), Math.max(12, Math.abs(pb.y - pa.y)))
    ctx.restore()
  }
}

/** Bars pattern: the captured run repainted as sticks (or a source line), in the stroke color. */
export class BarsPattern extends CapturedBarsDrawing<BarsPatternProps> {
  readonly type: string = 'bars_pattern'

  protected override defaultProps(): BarsPatternProps {
    return { bars: [], mirrored: false, flipped: false, mode: 'hl' }
  }

  /** A pattern saved painting candle sticks paints its bars' ranges. */
  protected override upgradeProps(props: Partial<BarsPatternProps>): Partial<BarsPatternProps> {
    return (props.mode as string | undefined) === 'bars' ? { ...props, mode: 'hl' } : props
  }

  private priceOf(bar: CapturedBar): number {
    const { mode } = this.props
    if (mode === 'open') return bar.o
    if (mode === 'high') return bar.h
    if (mode === 'low') return bar.l
    if (mode === 'hl2') return (bar.h + bar.l) / 2
    return bar.c
  }

  /** Bars in paint order (flip reverses time) with the y mapper (mirror negates price offsets). */
  private sequence(f: { baseY: number; scale: number }): { seq: CapturedBar[]; yAt: (v: number) => number } {
    const seq = this.props.flipped ? [...this.props.bars].reverse() : this.props.bars
    const base = seq[0].c
    const sign = this.props.mirrored ? -1 : 1
    return { seq, yAt: (v: number) => f.baseY + (v - base) * f.scale * sign }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) {
      this.paintPlaceholder(ctx, viewport)
      return
    }
    const { seq, yAt } = this.sequence(f)
    const width = (f.x2 - f.x1) / seq.length

    // The whole style surface is the one color, its opacity riding in it, with no width or dash.
    if (this.props.mode !== 'hl' && this.props.mode !== 'oc') {
      ctx.save()
      ctx.setLineDash([])
      ctx.strokeStyle = this.style.lineColor
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < seq.length; i++) {
        const x = f.x1 + width * (i + 0.5)
        const y = yAt(this.priceOf(seq[i]))
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.restore()
      return
    }

    // Each bar its range as a bar: high to low, or open to close.
    const bodyW = Math.max(1.5, Math.min(9, width * 0.6))
    const oc = this.props.mode === 'oc'
    ctx.save()
    ctx.fillStyle = this.style.lineColor
    for (let i = 0; i < seq.length; i++) {
      const bar = seq[i]!
      const cx = f.x1 + width * (i + 0.5)
      const y1 = yAt(oc ? bar.o : bar.h)
      const y2 = yAt(oc ? bar.c : bar.l)
      ctx.fillRect(cx - bodyW / 2, Math.min(y1, y2), bodyW, Math.max(1, Math.abs(y2 - y1)))
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) {
      const [pa, pb] = this.anchorPixels(viewport)
      if (!pa || !pb) return false
      return point.x >= Math.min(pa.x, pb.x) && point.x <= Math.max(pa.x, pb.x) && Math.abs(point.y - pa.y) <= 24
    }
    const { seq, yAt } = this.sequence(f)
    let minY = Infinity
    let maxY = -Infinity
    for (const bar of seq) {
      minY = Math.min(minY, yAt(bar.h), yAt(bar.l))
      maxY = Math.max(maxY, yAt(bar.h), yAt(bar.l))
    }
    return point.x >= f.x1 - 4 && point.x <= f.x2 + 4 && point.y >= minY - 4 && point.y <= maxY + 4
  }
}

/**
 * Ghost feed: projected candles sketched from the first anchor toward the second — any
 * direction, including empty future space. One candle per bar slot; sizes come from the
 * average-span and variance inputs (auto-seeded from the trailing bars at placement); the
 * wobble is deterministic, so the same drawing always sketches the same candles.
 */
export class GhostFeed extends Drawing<GhostFeedProps> {
  readonly type = 'ghost_feed'

  protected override defaultProps(): GhostFeedProps {
    return {
      averageHL: 0,
      variance: 50,
      upColor: '#ACE5DC',
      downColor: '#FAA1A4',
      borderUpColor: '#089981',
      borderDownColor: '#F23645',
      wickColor: '#808080',
      drawBorder: true,
      drawWick: true,
      transparency: 50,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  /** Placement hook: seed the average candle span from the trailing bars (only while auto). */
  capture(): void {
    if (this.props.averageHL > 0) return
    const recent = this.bars().slice(-20)
    if (!recent.length) return
    const avg = recent.reduce((sum, bar) => sum + Math.abs(bar.high - bar.low), 0) / recent.length
    if (avg > 0) this.applyProps({ averageHL: avg } as Partial<GhostFeedProps>)
  }

  /** Candle span in price units — the auto fallback keys off the anchor price. */
  private span(): number {
    if (this.props.averageHL > 0) return this.props.averageHL
    const price = Math.abs(this.anchors[0]?.price ?? 0)
    return price > 0 ? price * 0.005 : 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [a, b] = this.anchors
    const [pa, pb] = this.anchorPixels(viewport)
    if (!a || !b || !pa || !pb) return
    const rawCount = viewport.barsBetween(a.time, b.time)
    const count = Math.max(1, Math.min(500, Math.round(Math.abs(rawCount ?? (pb.x - pa.x) / 8))))
    const width = (pb.x - pa.x) / count
    if (!Number.isFinite(width) || Math.abs(width) < 0.5) return
    const avg = this.span()
    const wobbleAmp = avg * (Math.max(0, this.props.variance) / 100)
    const alpha = Math.max(0, Math.min(1, 1 - this.props.transparency / 100))
    const drift = (b.price - a.price) / count
    const bodyW = Math.max(1.5, Math.min(9, Math.abs(width) * 0.6))
    let price = a.price
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = 1
    for (let i = 0; i < count; i++) {
      // Deterministic wobble seeded by the index (stable across repaints).
      const w1 = Math.sin(i * 2.399963)
      const w2 = Math.sin(i * 2.399963 + 1.7)
      const open = price
      const close = open + drift + w1 * wobbleAmp * 0.6
      const high = Math.max(open, close) + Math.abs(w2) * avg * 0.35
      const low = Math.min(open, close) - Math.abs(w1) * avg * 0.35
      const cx = pa.x + width * (i + 0.5)
      const ys = { o: viewport.yOf(open), h: viewport.yOf(high), l: viewport.yOf(low), c: viewport.yOf(close) }
      if (ys.o !== null && ys.h !== null && ys.l !== null && ys.c !== null) {
        const up = close >= open
        // The tool-wide opacity multiplies any alpha a color value carries of its own.
        const paint = (c: string) => withAlpha(c, alpha * alphaOf(c))
        if (this.props.drawWick) {
          ctx.strokeStyle = paint(this.props.wickColor)
          ctx.beginPath()
          ctx.moveTo(cx, ys.h)
          ctx.lineTo(cx, ys.l)
          ctx.stroke()
        }
        const top = Math.min(ys.o, ys.c)
        const bodyH = Math.max(1, Math.abs(ys.c - ys.o))
        ctx.fillStyle = paint(up ? this.props.upColor : this.props.downColor)
        ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH)
        if (this.props.drawBorder) {
          ctx.strokeStyle = paint(up ? this.props.borderUpColor : this.props.borderDownColor)
          ctx.strokeRect(cx - bodyW / 2, top, bodyW, bodyH)
        }
      }
      price = close
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return false
    const minX = Math.min(pa.x, pb.x)
    const maxX = Math.max(pa.x, pb.x)
    const minY = Math.min(pa.y, pb.y) - 20
    const maxY = Math.max(pa.y, pb.y) + 20
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
  }
}
