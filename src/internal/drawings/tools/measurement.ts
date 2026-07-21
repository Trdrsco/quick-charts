import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { applyStroke, formatPrice, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

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

/** Shared skeleton for the range meters: shaded span + measuring arrow + stats pill. */
abstract class RangeMeter extends Drawing {
  requiredAnchors(): number {
    return 2
  }

  protected pixels(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return { a, b }
  }

  protected paintSpan(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
    const r = box(a, b)
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
      out.push(`${dPrice >= 0 ? '+' : ''}${formatPrice(dPrice)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`)
    }
    if (this.measuresTime()) {
      const bars = viewport.barsBetween(a.time, b.time)
      if (bars !== null) out.push(`${Math.round(bars)} bars`)
      const secs = Number(b.time) - Number(a.time)
      if (Number.isFinite(secs) && secs !== 0) out.push(spanText(Math.abs(secs)))
    }
    return out
  }

  protected abstract measuresPrice(): boolean
  protected abstract measuresTime(): boolean

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const px = this.pixels(viewport)
    if (!px) return
    const { a, b } = px
    this.paintSpan(ctx, a, b)
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

  protected measuresPrice(): boolean {
    return true
  }

  protected measuresTime(): boolean {
    return true
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
