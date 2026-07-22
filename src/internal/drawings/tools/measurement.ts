import type { DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barsInRange, impliedTick } from '../core/bars'
import { applyStroke, formatPrice, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

/** Compact volume readout (12.4M style). */
function volumeText(volume: number): string {
  if (volume >= 1e9) return `${(volume / 1e9).toFixed(2)}B`
  if (volume >= 1e6) return `${(volume / 1e6).toFixed(2)}M`
  if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`
  return String(Math.round(volume))
}

function box(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

function inBox(p: Point, r: { x: number; y: number; width: number; height: number }, pad = 4): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.width + pad && p.y >= r.y - pad && p.y <= r.y + r.height + pad
}

export type RangeMeterProps = {
  /** Stats readout toggles; a meter only surfaces the ones its axes measure. */
  showPriceDelta: boolean
  showPercent: boolean
  showBars: boolean
  showTimeSpan: boolean
  showVolume: boolean
  /** Stretch the shaded span across the axis the meter doesn't measure. */
  extend: boolean
}

/** Shared skeleton for the range meters: shaded span + measuring arrow + stats pill. */
abstract class RangeMeter extends Drawing<RangeMeterProps> {
  requiredAnchors(): number {
    return 2
  }

  protected pixels(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return { a, b }
  }

  protected paintSpan(ctx: CanvasRenderingContext2D, a: Point, b: Point, viewport: Viewport): void {
    let r = box(a, b)
    if (this.props.extend) {
      // A price meter extends across time; a time meter extends across price.
      r = this.measuresPrice()
        ? { x: 0, y: r.y, width: viewport.width, height: r.height }
        : { x: r.x, y: 0, width: r.width, height: viewport.height }
    }
    ctx.save()
    ctx.fillStyle = withAlpha(this.style.lineColor, Math.max(0.08, this.style.fillOpacity))
    ctx.fillRect(r.x, r.y, r.width, r.height)
    ctx.restore()
  }

  protected stats(viewport: Viewport): string[] {
    const [a, b] = this.anchors
    if (!a || !b) return []
    const out: string[] = []
    if (this.measuresPrice()) {
      const dPrice = b.price - a.price
      const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
      const parts: string[] = []
      if (this.props.showPriceDelta) parts.push(`${dPrice >= 0 ? '+' : ''}${formatPrice(dPrice)}`)
      if (this.props.showPercent) parts.push(`(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`)
      if (parts.length) out.push(parts.join(' '))
    }
    if (this.measuresTime()) {
      if (this.props.showBars) {
        const bars = viewport.barsBetween(a.time, b.time)
        if (bars !== null) out.push(`${Math.round(bars)} bars`)
      }
      if (this.props.showTimeSpan) {
        const secs = Number(b.time) - Number(a.time)
        if (Number.isFinite(secs) && secs !== 0) out.push(spanText(Math.abs(secs)))
      }
      if (this.props.showVolume) {
        const range = barsInRange(this.bars(), a.time, b.time)
        const total = range.reduce((sum, bar) => sum + (bar.volume ?? 0), 0)
        if (total > 0) out.push(`Vol ${volumeText(total)}`)
      }
    }
    return out
  }

  protected abstract measuresPrice(): boolean
  protected abstract measuresTime(): boolean

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const px = this.pixels(viewport)
    if (!px) return
    const { a, b } = px
    this.paintSpan(ctx, a, b, viewport)
    applyStroke(ctx, this.style)
    if (this.measuresPrice()) {
      const x = (a.x + b.x) / 2
      strokeSegment(ctx, { x, y: a.y }, { x, y: b.y })
      paintArrowHead(ctx, { x, y: a.y }, { x, y: b.y }, this.style)
    }
    if (this.measuresTime()) {
      const y = this.measuresPrice() ? Math.max(a.y, b.y) : (a.y + b.y) / 2
      strokeSegment(ctx, { x: a.x, y }, { x: b.x, y })
      paintArrowHead(ctx, { x: a.x, y }, { x: b.x, y }, this.style)
    }
    const stats = this.stats(viewport)
    if (stats.length) {
      const r = box(a, b)
      paintLabel(ctx, stats.join('  ·  '), { x: r.x + r.width / 2, y: r.y + r.height + 16 }, this.style, {
        align: 'center',
        background: withAlpha('#1b1f27', 0.92),
      })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const px = this.pixels(viewport)
    if (!px) return false
    return inBox(point, box(px.a, px.b))
  }
}

/** Vertical meter: price delta and % between two levels. */
export class PriceRange extends RangeMeter {
  readonly type = 'price_range'

  protected override defaultProps(): RangeMeterProps {
    return { showPriceDelta: true, showPercent: true, showBars: false, showTimeSpan: false, showVolume: false, extend: false }
  }

  protected measuresPrice(): boolean {
    return true
  }

  protected measuresTime(): boolean {
    return false
  }
}

/** Horizontal meter: bar count and time span between two times. */
export class DateRange extends RangeMeter {
  readonly type = 'date_range'

  protected override defaultProps(): RangeMeterProps {
    return { showPriceDelta: false, showPercent: false, showBars: true, showTimeSpan: true, showVolume: true, extend: false }
  }

  protected measuresPrice(): boolean {
    return false
  }

  protected measuresTime(): boolean {
    return true
  }
}

/** Combined meter: price and time deltas of the spanned box. */
export class DatePriceRange extends RangeMeter {
  readonly type = 'date_and_price_range'

  protected override defaultProps(): RangeMeterProps {
    return { showPriceDelta: true, showPercent: true, showBars: true, showTimeSpan: true, showVolume: true, extend: false }
  }

  protected measuresPrice(): boolean {
    return true
  }

  protected measuresTime(): boolean {
    return true
  }
}

const MEASURE_UP = '#2962ff'
const MEASURE_DOWN = '#f23645'

/**
 * The measure action's readout: a direction-colored zone (blue measuring up, red down) with a
 * vertical arrow spanning it, a horizontal arrow at mid-height, and a solid pill above/below
 * carrying `Δprice (Δ%) Δticks` over `bars, duration`.
 */
export class Measure extends Drawing {
  readonly type = 'measure'

  requiredAnchors(): number {
    return 2
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    const [a, b] = this.anchors
    if (!pa || !pb || !a || !b) return
    const up = b.price >= a.price
    const color = up ? MEASURE_UP : MEASURE_DOWN
    const r = box(pa, pb)
    if (r.width < 1 && r.height < 1) return
    const arrowStyle: DrawingStyle = { ...this.style, lineColor: color, lineWidth: 1.5 }

    ctx.save()
    ctx.setLineDash([])
    ctx.fillStyle = withAlpha(color, 0.18)
    ctx.fillRect(r.x, r.y, r.width, r.height)

    // The cross: price arrow spanning the zone toward the move's direction, time arrow at
    // mid-height toward the drag's direction.
    const cx = r.x + r.width / 2
    const cy = r.y + r.height / 2
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    if (r.height >= 8) {
      const from = { x: cx, y: up ? r.y + r.height : r.y }
      const to = { x: cx, y: up ? r.y : r.y + r.height }
      strokeSegment(ctx, from, to)
      paintArrowHead(ctx, from, to, arrowStyle)
    }
    if (r.width >= 8) {
      const rightward = pb.x >= pa.x
      const from = { x: rightward ? r.x : r.x + r.width, y: cy }
      const to = { x: rightward ? r.x + r.width : r.x, y: cy }
      strokeSegment(ctx, from, to)
      paintArrowHead(ctx, from, to, arrowStyle)
    }

    // The data pill: solid direction color, white text, two centered lines.
    const dPrice = b.price - a.price
    const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
    const tick = impliedTick(this.bars())
    const ticks = tick > 0 ? Math.round(Math.abs(dPrice) / tick) : 0
    const parts = [`${formatPrice(dPrice)} (${pct.toFixed(2)}%)`]
    if (ticks > 0 && Number.isFinite(ticks)) parts[0] += ` ${ticks}`
    const bars = viewport.barsBetween(a.time, b.time)
    const secs = Math.abs(Number(b.time) - Number(a.time))
    const line2: string[] = []
    if (bars !== null) line2.push(`${Math.abs(Math.round(bars))} bars`)
    if (Number.isFinite(secs) && secs > 0) line2.push(spanText(secs))
    const lines = line2.length ? [parts[0], line2.join(', ')] : [parts[0]]

    ctx.font = `600 ${this.style.fontSize}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const lineH = Math.round(this.style.fontSize * 1.35)
    const textW = Math.max(...lines.map((l) => ctx.measureText(l).width))
    const pillW = textW + 20
    const pillH = lines.length * lineH + 10
    const pillX = Math.max(4, Math.min(cx - pillW / 2, viewport.width - pillW - 4))
    const pillY = up ? Math.max(4, r.y - pillH - 10) : Math.min(viewport.height - pillH - 4, r.y + r.height + 10)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.roundRect(pillX, pillY, pillW, pillH, 4)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], pillX + pillW / 2, pillY + 5 + lineH * i + lineH / 2)
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return false
    return inBox(point, box(pa, pb))
  }
}

/** Human span like "2d 4h" / "3h 12m" / "45s" from a duration in seconds. */
function spanText(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
  return `${s}s`
}
