import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, formatPrice, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

const PROFIT = '#089981'
const LOSS = '#f23645'

export type PositionProps = {
  /** Traded quantity used for the money figures. */
  quantity: number
  showPrices: boolean
}

/**
 * Trade plan visual: anchor 1 = entry (its time is the box's left edge), anchor 2 = target
 * (its time sets the right edge), anchor 3 = stop. Profit zone paints green, risk zone red,
 * with the risk/reward stats at the entry line.
 */
export class LongPosition extends Drawing<PositionProps> {
  readonly type: string = 'long_position'

  protected override defaultProps(): PositionProps {
    return { quantity: 1, showPrices: true }
  }

  requiredAnchors(): number {
    return 3
  }

  protected zones(viewport: Viewport): {
    left: number
    right: number
    entryY: number
    targetY: number
    stopY: number
  } | null {
    const [entry, target, stop] = this.anchorPixels(viewport)
    if (!entry || !target || !stop) return null
    const left = Math.min(entry.x, target.x)
    const right = Math.max(entry.x, target.x)
    if (right - left < 2) return null
    return { left, right, entryY: entry.y, targetY: target.y, stopY: stop.y }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const z = this.zones(viewport)
    if (!z) return
    const [entry, target, stop] = this.anchors
    ctx.save()
    ctx.fillStyle = withAlpha(PROFIT, 0.12)
    ctx.fillRect(z.left, Math.min(z.entryY, z.targetY), z.right - z.left, Math.abs(z.targetY - z.entryY))
    ctx.fillStyle = withAlpha(LOSS, 0.12)
    ctx.fillRect(z.left, Math.min(z.entryY, z.stopY), z.right - z.left, Math.abs(z.stopY - z.entryY))
    ctx.restore()

    ctx.save()
    applyStroke(ctx, this.style)
    ctx.strokeStyle = PROFIT
    strokeSegment(ctx, { x: z.left, y: z.targetY }, { x: z.right, y: z.targetY })
    ctx.strokeStyle = LOSS
    strokeSegment(ctx, { x: z.left, y: z.stopY }, { x: z.right, y: z.stopY })
    ctx.strokeStyle = this.style.lineColor
    strokeSegment(ctx, { x: z.left, y: z.entryY }, { x: z.right, y: z.entryY })
    ctx.restore()

    const qty = this.props.quantity
    const reward = Math.abs(target.price - entry.price) * qty
    const risk = Math.abs(entry.price - stop.price) * qty
    const ratio = risk > 0 ? reward / risk : 0
    const mid = (z.left + z.right) / 2
    paintLabel(
      ctx,
      `RR ${ratio.toFixed(2)}  ·  +${formatPrice(reward)} / -${formatPrice(risk)}`,
      { x: mid, y: z.entryY },
      this.style,
      { align: 'center', background: withAlpha('#1b1f27', 0.92) },
    )
    if (this.props.showPrices) {
      paintLabel(ctx, formatPrice(target.price), { x: z.right + 6, y: z.targetY }, { ...this.style, textColor: PROFIT })
      paintLabel(ctx, formatPrice(stop.price), { x: z.right + 6, y: z.stopY }, { ...this.style, textColor: LOSS })
      paintLabel(ctx, formatPrice(entry.price), { x: z.right + 6, y: z.entryY }, this.style)
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const z = this.zones(viewport)
    if (!z) return false
    const top = Math.min(z.entryY, z.targetY, z.stopY)
    const bottom = Math.max(z.entryY, z.targetY, z.stopY)
    return point.x >= z.left - 4 && point.x <= z.right + 4 && point.y >= top - 4 && point.y <= bottom + 4
  }
}

/** Identical structure to the long position; the label semantics flip with the anchors. */
export class ShortPosition extends LongPosition {
  override readonly type = 'short_position'
}

/** Projected move: the first swing (anchors 1–2) mirrored onto anchor 3, drawn as a band. */
export class Projection extends Drawing {
  readonly type = 'projection'

  requiredAnchors(): number {
    return 3
  }

  protected quad(viewport: Viewport): { p1: Point; p2: Point; p3: Point; p4: Point } | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    return { p1, p2, p3, p4: { x: p3.x + (p2.x - p1.x), y: p3.y + (p2.y - p1.y) } }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const q = this.quad(viewport)
    if (!q) return
    ctx.save()
    ctx.fillStyle = withAlpha(this.style.lineColor, 0.1)
    ctx.beginPath()
    ctx.moveTo(q.p1.x, q.p1.y)
    ctx.lineTo(q.p2.x, q.p2.y)
    ctx.lineTo(q.p4.x, q.p4.y)
    ctx.lineTo(q.p3.x, q.p3.y)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    applyStroke(ctx, this.style)
    strokeSegment(ctx, q.p1, q.p2)
    strokeSegment(ctx, q.p3, q.p4)
    paintArrowHead(ctx, q.p3, q.p4, this.style)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const q = this.quad(viewport)
    if (!q) return false
    const tolerance = Math.max(6, this.style.lineWidth / 2 + 4)
    return (
      distanceToSegment(point, q.p1, q.p2) <= tolerance || distanceToSegment(point, q.p3, q.p4) <= tolerance
    )
  }
}

/** Forecast arrow: a projected path from now into the future with its delta readout. */
export class Forecast extends Drawing {
  readonly type = 'forecast'

  requiredAnchors(): number {
    return 2
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    const [a, b] = this.anchors
    applyStroke(ctx, this.style)
    strokeSegment(ctx, p1, p2)
    paintArrowHead(ctx, p1, p2, this.style)
    const dPrice = b.price - a.price
    const bars = viewport.barsBetween(a.time, b.time)
    const up = dPrice >= 0
    const parts = [
      `${up ? '+' : ''}${formatPrice(dPrice)}`,
      bars === null ? null : `${Math.round(bars)} bars`,
    ].filter((s): s is string => s !== null)
    paintLabel(ctx, parts.join('  ·  '), { x: p2.x, y: p2.y + (up ? -16 : 16) }, { ...this.style, textColor: up ? PROFIT : LOSS }, {
      align: 'center',
      background: withAlpha('#1b1f27', 0.92),
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    return distanceToSegment(point, p1, p2) <= Math.max(6, this.style.lineWidth / 2 + 4)
  }
}
