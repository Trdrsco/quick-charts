import type { DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fillPaint, fontOf, formatPrice, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

const PROFIT = '#089981'
const LOSS = '#f23645'

export type PositionProps = {
  /** Account equity the risk figure is taken from. */
  accountSize: number
  /** Risk per trade, as a percent of the account or a money amount (per `riskDisplay`). */
  risk: number
  riskDisplay: 'percent' | 'money'
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
    return { accountSize: 10000, risk: 1, riskDisplay: 'percent', showPrices: true }
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

    // Quantity derives from the risk budget over the stop distance (the trade-plan convention).
    const riskMoney = this.props.riskDisplay === 'percent' ? (this.props.accountSize * this.props.risk) / 100 : this.props.risk
    const stopDistance = Math.abs(entry.price - stop.price)
    const qty = stopDistance > 0 ? riskMoney / stopDistance : 0
    const reward = Math.abs(target.price - entry.price) * qty
    const ratio = stopDistance > 0 ? Math.abs(target.price - entry.price) / stopDistance : 0
    const mid = (z.left + z.right) / 2
    paintLabel(
      ctx,
      `RR ${ratio.toFixed(2)}  ·  Qty ${qty.toFixed(qty >= 100 ? 0 : 2)}  ·  +${formatPrice(reward)} / -${formatPrice(riskMoney)}`,
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

/** Bordered label pill (source/target/verdict boxes); returns its painted bounds. */
function paintPill(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  style: DrawingStyle,
  colors: { text: string; back: string; border?: string },
): { x: number; y: number; width: number; height: number } {
  ctx.save()
  ctx.font = fontOf(style)
  ctx.setLineDash([])
  const width = ctx.measureText(text).width + 12
  const height = style.fontSize + 10
  const box = { x: at.x - width / 2, y: at.y - height / 2, width, height }
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 4)
  ctx.fillStyle = colors.back
  ctx.fill()
  if (colors.border) {
    ctx.strokeStyle = colors.border
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.fillStyle = colors.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, at.x, at.y)
  ctx.restore()
  return box
}

export type ForecastProps = {
  sourceTextColor: string
  sourceBackColor: string
  sourceBorderColor: string
  targetTextColor: string
  targetBackColor: string
  targetBorderColor: string
  successTextColor: string
  successBackColor: string
  failureTextColor: string
  failureBackColor: string
}

/**
 * Position forecast: entry (source) and exit (target) anchors set a projected move and its
 * duration. As bars arrive the idea resolves itself — Success when price touches the target
 * before the target time, Failure once that time passes untouched.
 */
export class Forecast extends Drawing<ForecastProps> {
  readonly type = 'forecast'

  protected override defaultProps(): ForecastProps {
    return {
      sourceTextColor: '#ffffff',
      sourceBackColor: '#2962ff',
      sourceBorderColor: '#2962ff',
      targetTextColor: '#ffffff',
      targetBackColor: PROFIT,
      targetBorderColor: PROFIT,
      successTextColor: '#ffffff',
      successBackColor: PROFIT,
      failureTextColor: '#ffffff',
      failureBackColor: LOSS,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  /** Success once a bar inside the window touches the target; Failure when time runs out. */
  private verdict(): 'Success' | 'Failure' | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const start = Math.min(Number(a.time), Number(b.time))
    const end = Math.max(Number(a.time), Number(b.time))
    const up = b.price >= a.price
    let latest = -Infinity
    for (const bar of this.bars()) {
      const t = Number(bar.time)
      latest = Math.max(latest, t)
      if (t <= start || t > end) continue
      if (up ? bar.high >= b.price : bar.low <= b.price) return 'Success'
    }
    return latest > end ? 'Failure' : null
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return
    const [a, b] = this.anchors
    applyStroke(ctx, this.style)
    strokeSegment(ctx, p1, p2)
    paintArrowHead(ctx, p1, p2, this.style)
    const p = this.props
    const up = b.price >= a.price
    paintPill(ctx, formatPrice(a.price), { x: p1.x, y: p1.y + (up ? 16 : -16) }, this.style, {
      text: p.sourceTextColor,
      back: p.sourceBackColor,
      border: p.sourceBorderColor,
    })
    paintPill(ctx, formatPrice(b.price), { x: p2.x, y: p2.y + (up ? -16 : 16) }, this.style, {
      text: p.targetTextColor,
      back: p.targetBackColor,
      border: p.targetBorderColor,
    })
    const verdict = this.verdict()
    if (verdict) {
      const win = verdict === 'Success'
      paintPill(ctx, verdict, { x: p2.x, y: p2.y + (up ? -40 : 40) }, this.style, {
        text: win ? p.successTextColor : p.failureTextColor,
        back: win ? p.successBackColor : p.failureBackColor,
      })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2) return false
    return distanceToSegment(point, p1, p2) <= Math.max(6, this.style.lineWidth / 2 + 4)
  }
}

/**
 * Sector: a wedge projecting price forward — origin, a horizontal point in the future, and a
 * third point at the estimated price. The arc between the two far points closes the slice.
 */
export class Sector extends Drawing {
  readonly type = 'sector'

  requiredAnchors(): number {
    return 3
  }

  /** Arc samples from anchor 2 to anchor 3, radius blending between the two legs. */
  private arc(viewport: Viewport): { origin: Point; p2: Point; p3: Point; samples: Point[] } | null {
    const [origin, p2, p3] = this.anchorPixels(viewport)
    if (!origin || !p2 || !p3) return null
    const r2 = Math.hypot(p2.x - origin.x, p2.y - origin.y)
    const r3 = Math.hypot(p3.x - origin.x, p3.y - origin.y)
    const a2 = Math.atan2(p2.y - origin.y, p2.x - origin.x)
    const a3 = Math.atan2(p3.y - origin.y, p3.x - origin.x)
    let sweep = a3 - a2
    if (sweep > Math.PI) sweep -= Math.PI * 2
    if (sweep < -Math.PI) sweep += Math.PI * 2
    const steps = 32
    const samples: Point[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const angle = a2 + sweep * t
      const radius = r2 + (r3 - r2) * t
      samples.push({ x: origin.x + Math.cos(angle) * radius, y: origin.y + Math.sin(angle) * radius })
    }
    return { origin, p2, p3, samples }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const arc = this.arc(viewport)
    if (!arc) return
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(arc.origin.x, arc.origin.y)
    for (const s of arc.samples) ctx.lineTo(s.x, s.y)
    ctx.closePath()
    const fill = fillPaint(this.style)
    if (fill) {
      ctx.fillStyle = fill
      ctx.fill()
    }
    applyStroke(ctx, this.style)
    ctx.stroke()
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const arc = this.arc(viewport)
    if (!arc) return false
    const tolerance = Math.max(6, this.style.lineWidth / 2 + 4)
    if (distanceToSegment(point, arc.origin, arc.samples[0]) <= tolerance) return true
    if (distanceToSegment(point, arc.origin, arc.samples[arc.samples.length - 1]) <= tolerance) return true
    for (let i = 0; i < arc.samples.length - 1; i++) {
      if (distanceToSegment(point, arc.samples[i], arc.samples[i + 1]) <= tolerance) return true
    }
    return false
  }
}
