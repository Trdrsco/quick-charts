import type { DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fillPaint, fontOf, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

const PROFIT = '#089981'
const LOSS = '#f23645'

export type PositionProps = {
  /** Account equity the risk figure is taken from. */
  accountSize: number
  /** Risk per trade, as a percent of the account or a money amount (per `riskDisplay`). */
  risk: number
  riskDisplay: 'percent' | 'money'
  /** Contract/lot granularity — quantity is expressed in lots of this size. */
  lotSize: number
  /** Caps the position at the account's buying power: qty ≤ account × leverage / entry. */
  leverage: number
  showPrices: boolean
  /** Compact stats mode — the tags shrink to their essentials. */
  compact: boolean
}

/** Everything the three tags read, derived once per paint. */
type PositionStats = {
  qty: number
  ratio: number
  tpOffset: number
  tpPercent: number
  slOffset: number
  slPercent: number
  amountAtTp: number
  amountAtSl: number
  /** Money PnL at the box's state (open tracks price, closed locks to the touched level). */
  pnl: number
  closed: boolean
}

/**
 * Trade plan visual: anchor 1 = entry (its time is the box's left edge), anchor 2 = target
 * (its time sets the right edge), anchor 3 = stop. The profit zone paints green with its
 * target/amount tag, the risk zone red with its stop/amount tag, and the entry line carries
 * PnL · quantity · risk/reward. Quantity is the lesser of the risk budget over the stop
 * distance and the leveraged account's buying power.
 */
export class LongPosition extends Drawing<PositionProps> {
  readonly type: string = 'long_position'

  protected override defaultProps(): PositionProps {
    return { accountSize: 1000, risk: 25, riskDisplay: 'percent', lotSize: 1, leverage: 1, showPrices: true, compact: false }
  }

  requiredAnchors(): number {
    return 3
  }

  protected isShort(): boolean {
    return false
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

  protected stats(): PositionStats | null {
    const [entry, target, stop] = this.anchors
    if (!entry || !target || !stop) return null
    const { accountSize, risk, riskDisplay, leverage } = this.props
    const lot = this.props.lotSize > 0 ? this.props.lotSize : 1
    const short = this.isShort()

    const tpOffset = Math.abs(target.price - entry.price)
    const slOffset = Math.abs(entry.price - stop.price)
    const riskSize = riskDisplay === 'percent' ? (accountSize * risk) / 100 : risk
    // Qty = min(QtyRisk, QtyLvg): the risk budget over the stop distance, capped by what the
    // leveraged account can carry at the entry price. Point value is 1 (prices are per unit).
    const qtyRisk = slOffset > 0 ? riskSize / slOffset / lot : 0
    const qtyLvg = entry.price > 0 ? (accountSize * Math.max(1, leverage)) / entry.price / lot : 0
    const qty = Math.max(0, Math.min(qtyRisk, qtyLvg))

    const amountAtTp = accountSize + tpOffset * qty * lot
    const amountAtSl = accountSize - slOffset * qty * lot
    const ratio = slOffset > 0 ? tpOffset / slOffset : 0

    // PnL over the box's span: closed at ±offset once the target/stop is touched by a bar inside
    // the box, else open against the latest close at (or after) the right edge.
    const sign = short ? -1 : 1
    const bars = this.bars()
    const from = Math.min(Number(entry.time), Number(target.time))
    const to = Math.max(Number(entry.time), Number(target.time))
    let pnl = 0
    let closed = false
    let lastClose: number | null = null
    for (const bar of bars) {
      const t = Number(bar.time)
      if (t < from) continue
      if (t > to) break
      lastClose = bar.close
      const hitTp = short ? bar.low <= target.price : bar.high >= target.price
      const hitSl = short ? bar.high >= stop.price : bar.low <= stop.price
      if (hitSl) {
        pnl = -slOffset * qty * lot
        closed = true
        break
      }
      if (hitTp) {
        pnl = tpOffset * qty * lot
        closed = true
        break
      }
    }
    if (!closed) {
      // The box may sit in the future (no bars inside): open PnL tracks the last known close.
      const reference = lastClose ?? (bars.length ? bars[bars.length - 1].close : null)
      pnl = reference == null ? 0 : sign * (reference - entry.price) * qty * lot
    }

    return {
      qty,
      ratio,
      tpOffset,
      tpPercent: entry.price !== 0 ? (tpOffset / entry.price) * 100 : 0,
      slOffset,
      slPercent: entry.price !== 0 ? (slOffset / entry.price) * 100 : 0,
      amountAtTp,
      amountAtSl,
      pnl,
      closed,
    }
  }

  /** "offset (pct%) ticks" — the level readout shared by the target and stop tags. */
  private levelText(offset: number, percent: number): string {
    const tick = this.tickSize()
    const ticks = tick && tick > 0 ? `, ${Math.round(offset / tick)}` : ''
    return `${this.formatPrice(offset)} (${percent.toFixed(2)}%)${ticks}`
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const z = this.zones(viewport)
    if (!z) return
    const [entry, target, stop] = this.anchors
    ctx.save()
    ctx.fillStyle = withAlpha(PROFIT, 0.2)
    ctx.fillRect(z.left, Math.min(z.entryY, z.targetY), z.right - z.left, Math.abs(z.targetY - z.entryY))
    ctx.fillStyle = withAlpha(LOSS, 0.2)
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

    const s = this.stats()
    if (!s) return
    const mid = (z.left + z.right) / 2
    const white = { ...this.style, textColor: '#ffffff' }
    const qtyText = s.qty >= 100 ? s.qty.toFixed(0) : s.qty.toFixed(2)
    const pnlLabel = s.closed ? 'Closed PnL' : 'Open PnL'
    const entryText = this.props.compact
      ? `${this.formatPrice(s.pnl)} · ${qtyText} · ${s.ratio.toFixed(2)}`
      : `${pnlLabel}: ${this.formatPrice(s.pnl)}, Qty: ${qtyText}, Risk/Reward Ratio: ${s.ratio.toFixed(2)}`
    const targetText = this.props.compact
      ? this.levelText(s.tpOffset, s.tpPercent)
      : `Target: ${this.levelText(s.tpOffset, s.tpPercent)}, Amount: ${this.formatPrice(s.amountAtTp)}`
    const stopText = this.props.compact
      ? this.levelText(s.slOffset, s.slPercent)
      : `Stop: ${this.levelText(s.slOffset, s.slPercent)}, Amount: ${this.formatPrice(s.amountAtSl)}`

    paintLabel(ctx, targetText, { x: mid, y: z.targetY }, white, { align: 'center', background: PROFIT })
    paintLabel(ctx, stopText, { x: mid, y: z.stopY }, white, { align: 'center', background: LOSS })
    paintLabel(ctx, entryText, { x: mid, y: z.entryY }, white, { align: 'center', background: '#585858' })

    if (this.props.showPrices) {
      paintLabel(ctx, this.formatPrice(target.price), { x: z.right + 6, y: z.targetY }, { ...this.style, textColor: PROFIT })
      paintLabel(ctx, this.formatPrice(stop.price), { x: z.right + 6, y: z.stopY }, { ...this.style, textColor: LOSS })
      paintLabel(ctx, this.formatPrice(entry.price), { x: z.right + 6, y: z.entryY }, this.style)
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

/** Identical structure to the long position; the PnL direction flips with the side. */
export class ShortPosition extends LongPosition {
  override readonly type = 'short_position'

  protected override isShort(): boolean {
    return true
  }
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
    paintPill(ctx, this.formatPrice(a.price), { x: p1.x, y: p1.y + (up ? 16 : -16) }, this.style, {
      text: p.sourceTextColor,
      back: p.sourceBackColor,
      border: p.sourceBorderColor,
    })
    paintPill(ctx, this.formatPrice(b.price), { x: p2.x, y: p2.y + (up ? -16 : 16) }, this.style, {
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
