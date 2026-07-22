import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barsInRange, linearRegression } from '../core/bars'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

export type RegressionProps = {
  upperDeviation: number
  lowerDeviation: number
  useUpper: boolean
  useLower: boolean
  source: 'close' | 'open' | 'hl2' | 'hlc3'
}

/**
 * Regression trend: least-squares line over the closes between the two anchors, with bands a
 * configurable number of standard deviations away. Recomputes live as bars arrive.
 */
export class RegressionTrend extends Drawing<RegressionProps> {
  readonly type = 'regression_trend'

  protected override defaultProps(): RegressionProps {
    return { upperDeviation: 2, lowerDeviation: 2, useUpper: true, useLower: true, source: 'close' }
  }

  requiredAnchors(): number {
    return 2
  }

  protected lines(viewport: Viewport): { base: [Point, Point]; upper?: [Point, Point]; lower?: [Point, Point] } | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const range = barsInRange(this.bars(), a.time, b.time)
    const fit = linearRegression(range, this.props.source)
    if (!fit) return null
    const first = range[0]
    const last = range[range.length - 1]
    const lineAt = (offset: number): [Point, Point] | null => {
      const y1 = viewport.yOf(fit.intercept + offset)
      const y2 = viewport.yOf(fit.intercept + fit.slope * (range.length - 1) + offset)
      const x1 = viewport.xOf(first.time)
      const x2 = viewport.xOf(last.time)
      if (y1 === null || y2 === null || x1 === null || x2 === null) return null
      return [
        { x: x1, y: y1 },
        { x: x2, y: y2 },
      ]
    }
    const base = lineAt(0)
    if (!base) return null
    return {
      base,
      upper: this.props.useUpper ? (lineAt(fit.sigma * this.props.upperDeviation) ?? undefined) : undefined,
      lower: this.props.useLower ? (lineAt(-fit.sigma * this.props.lowerDeviation) ?? undefined) : undefined,
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const lines = this.lines(viewport)
    if (!lines) {
      this.paintUnavailable(ctx, viewport)
      return
    }
    if (lines.upper && lines.lower) {
      ctx.save()
      ctx.fillStyle = withAlpha(this.style.lineColor, 0.08)
      ctx.beginPath()
      ctx.moveTo(lines.upper[0].x, lines.upper[0].y)
      ctx.lineTo(lines.upper[1].x, lines.upper[1].y)
      ctx.lineTo(lines.lower[1].x, lines.lower[1].y)
      ctx.lineTo(lines.lower[0].x, lines.lower[0].y)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
    }
    applyStroke(ctx, this.style)
    strokeSegment(ctx, lines.base[0], lines.base[1])
    for (const band of [lines.upper, lines.lower]) {
      if (!band) continue
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.globalAlpha = 0.7
      strokeSegment(ctx, band[0], band[1])
      ctx.restore()
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
    const tolerance = hitTolerance(this.style.lineWidth)
    if (!lines) {
      const [pa, pb] = this.anchorPixels(viewport)
      return !!pa && !!pb && distanceToSegment(point, pa, pb) <= tolerance
    }
    for (const line of [lines.base, lines.upper, lines.lower]) {
      if (line && distanceToSegment(point, line[0], line[1]) <= tolerance) return true
    }
    return false
  }
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
  /** 'bars' paints candle sticks; a price source paints the pattern as a line through it. */
  mode: 'bars' | 'open' | 'high' | 'low' | 'close' | 'hl2'
}

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
    return { bars: [], mirrored: false, flipped: false, mode: 'bars' }
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

    // The whole style surface is the one color (opacity riding in it) — no width/dash channel.
    if (this.props.mode !== 'bars') {
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

    const bodyW = Math.max(1.5, Math.min(9, width * 0.6))
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = this.style.lineColor
    ctx.fillStyle = this.style.lineColor
    ctx.lineWidth = 1
    for (let i = 0; i < seq.length; i++) {
      const bar = seq[i]
      const cx = f.x1 + width * (i + 0.5)
      const yO = yAt(bar.o)
      const yC = yAt(bar.c)
      ctx.beginPath()
      ctx.moveTo(cx, yAt(bar.h))
      ctx.lineTo(cx, yAt(bar.l))
      ctx.stroke()
      ctx.fillRect(cx - bodyW / 2, Math.min(yO, yC), bodyW, Math.max(1, Math.abs(yC - yO)))
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
        if (this.props.drawWick) {
          ctx.strokeStyle = withAlpha(this.props.wickColor, alpha)
          ctx.beginPath()
          ctx.moveTo(cx, ys.h)
          ctx.lineTo(cx, ys.l)
          ctx.stroke()
        }
        const top = Math.min(ys.o, ys.c)
        const bodyH = Math.max(1, Math.abs(ys.c - ys.o))
        ctx.fillStyle = withAlpha(up ? this.props.upColor : this.props.downColor, alpha)
        ctx.fillRect(cx - bodyW / 2, top, bodyW, bodyH)
        if (this.props.drawBorder) {
          ctx.strokeStyle = withAlpha(up ? this.props.borderUpColor : this.props.borderDownColor, alpha)
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
