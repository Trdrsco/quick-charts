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
}

/**
 * Bars pattern: a snapshot of the bars between the anchors at placement, repainted as candles
 * wherever the drawing is dragged (prices shift with the first anchor).
 */
export class BarsPattern extends Drawing<BarsPatternProps> {
  readonly type: string = 'bars_pattern'

  protected override defaultProps(): BarsPatternProps {
    return { bars: [] }
  }

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
    } as Partial<BarsPatternProps>)
  }

  protected frame(viewport: Viewport): { x1: number; x2: number; baseY: number; scale: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    const captured = this.props.bars
    if (!pa || !pb || captured.length === 0) return null
    // Price-to-pixel scale from the viewport at the first anchor's price.
    const yAtBase = viewport.yOf(this.anchors[0].price)
    const yAtBasePlus = viewport.yOf(this.anchors[0].price + 1)
    if (yAtBase === null || yAtBasePlus === null) return null
    const scale = yAtBasePlus - yAtBase // px per +1 price (negative in screen space)
    return { x1: Math.min(pa.x, pb.x), x2: Math.max(pa.x, pb.x), baseY: pa.y, scale }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    const captured = this.props.bars
    if (!f) {
      this.paintPlaceholder(ctx, viewport)
      return
    }
    const base = captured[0].c
    const width = (f.x2 - f.x1) / captured.length
    const bodyW = Math.max(1.5, Math.min(9, width * 0.6))
    ctx.save()
    ctx.setLineDash([])
    for (let i = 0; i < captured.length; i++) {
      const bar = captured[i]
      const cx = f.x1 + width * (i + 0.5)
      const yO = f.baseY + (bar.o - base) * f.scale
      const yH = f.baseY + (bar.h - base) * f.scale
      const yL = f.baseY + (bar.l - base) * f.scale
      const yC = f.baseY + (bar.c - base) * f.scale
      const up = bar.c >= bar.o
      const color = withAlpha(up ? '#4c98fb' : '#f23645', 0.75)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx, yH)
      ctx.lineTo(cx, yL)
      ctx.stroke()
      const top = Math.min(yO, yC)
      ctx.fillRect(cx - bodyW / 2, top, bodyW, Math.max(1, Math.abs(yC - yO)))
    }
    ctx.restore()
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

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) {
      const [pa, pb] = this.anchorPixels(viewport)
      if (!pa || !pb) return false
      return point.x >= Math.min(pa.x, pb.x) && point.x <= Math.max(pa.x, pb.x) && Math.abs(point.y - pa.y) <= 24
    }
    const captured = this.props.bars
    const base = captured[0].c
    let minY = Infinity
    let maxY = -Infinity
    for (const bar of captured) {
      minY = Math.min(minY, f.baseY + (bar.h - base) * f.scale, f.baseY + (bar.l - base) * f.scale)
      maxY = Math.max(maxY, f.baseY + (bar.h - base) * f.scale, f.baseY + (bar.l - base) * f.scale)
    }
    return point.x >= f.x1 - 4 && point.x <= f.x2 + 4 && point.y >= minY - 4 && point.y <= maxY + 4
  }
}

/**
 * Ghost feed: sketched future bars. The captured run seeds the bar sizes; the projection walks
 * deterministically from the first anchor toward the second (same seed → same sketch).
 */
export class GhostFeed extends BarsPattern {
  override readonly type = 'ghost_feed'

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [a, b] = this.anchors
    const captured = this.props.bars
    if (!a || !b || captured.length === 0) {
      this.paintPlaceholder(ctx, viewport)
      return
    }
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    const count = Math.max(4, Math.min(120, captured.length))
    const width = (pb.x - pa.x) / count
    if (!Number.isFinite(width) || Math.abs(width) < 0.5) return
    // Average captured bar span sets the sketch volatility.
    const avgSpan = captured.reduce((s, bar) => s + Math.abs(bar.h - bar.l), 0) / captured.length
    const yOf = (price: number) => viewport.yOf(price)
    const drift = (b.price - a.price) / count
    let price = a.price
    ctx.save()
    ctx.setLineDash([])
    ctx.globalAlpha = 0.55
    for (let i = 0; i < count; i++) {
      // Deterministic wobble seeded by the index (stable across repaints).
      const wobble = Math.sin(i * 2.399963) * avgSpan * 0.6
      const open = price
      const close = price + drift + wobble * 0.4
      const high = Math.max(open, close) + Math.abs(wobble) * 0.5
      const low = Math.min(open, close) - Math.abs(wobble) * 0.5
      const cx = pa.x + width * (i + 0.5)
      const ys = { o: yOf(open), h: yOf(high), l: yOf(low), c: yOf(close) }
      if (ys.o !== null && ys.h !== null && ys.l !== null && ys.c !== null) {
        const up = close >= open
        const color = withAlpha(up ? '#4c98fb' : '#f23645', 0.8)
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx, ys.h)
        ctx.lineTo(cx, ys.l)
        ctx.stroke()
        const bodyW = Math.max(1.5, Math.min(9, Math.abs(width) * 0.6))
        ctx.fillRect(cx - bodyW / 2, Math.min(ys.o, ys.c), bodyW, Math.max(1, Math.abs(ys.c - ys.o)))
      }
      price = close
    }
    ctx.restore()
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return false
    const minX = Math.min(pa.x, pb.x)
    const maxX = Math.max(pa.x, pb.x)
    const minY = Math.min(pa.y, pb.y) - 20
    const maxY = Math.max(pa.y, pb.y) + 20
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
  }
}
