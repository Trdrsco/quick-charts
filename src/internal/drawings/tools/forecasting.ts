import type { ControlPoint, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { moneyText } from '../core/money'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fillPaint, fontOf, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

/** The hues a position opens its two zones in, until the viewer says otherwise. */
const PROFIT = '#089981'
const LOSS = '#f23645'
/** How solid a zone's wash opens. The bars have to stay readable through it. */
const ZONE_ALPHA = 0.2

/** The stats a position can read, in the order its Stats list offers them: at the target its price,
 *  percent and tick offsets, the account's amount and the profit; on the entry the open or closed
 *  P&L, the quantity and the risk/reward ratio; at the stop the same five as at the target. */
export const POSITION_STATS = [
  'tpPriceOffset',
  'tpPercentOffset',
  'tpTickOffset',
  'tpAmount',
  'tpPL',
  'openClosePL',
  'qty',
  'riskRewardRatio',
  'slPriceOffset',
  'slPercentOffset',
  'slTickOffset',
  'slAmount',
  'slPL',
] as const
export type PositionStat = (typeof POSITION_STATS)[number]

/** How a position writes its quantity: as it reads best, in whole lots, or to one to ten decimals. */
export const QTY_PRECISIONS = ['default', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] as const
export type QtyPrecision = (typeof QTY_PRECISIONS)[number]

export type PositionProps = {
  /** Account equity the risk figure is taken from. */
  accountSize: number
  /** Risk per trade, as a percent of the account or an amount in the symbol's currency (per
   *  `riskDisplay`). */
  risk: number
  riskDisplay: 'percent' | 'money'
  /** Contract/lot granularity: quantity is expressed in lots of this size. */
  lotSize: number
  /** Caps the position at the account's buying power: qty ≤ account × leverage / entry. */
  leverage: number
  /** How the quantity is written. */
  qtyPrecision: QtyPrecision
  /** The reward zone's background: the band between entry and target, painted as given, opacity
   *  and all. Its rule and its label take the same hue at full strength. */
  profitColor: string
  /** The risk zone's background, the same three places below the entry. */
  stopColor: string
  /** Each level's price beside the box. */
  showPrices: boolean
  /** The stats the tags read, in the Stats list's order. */
  stats: PositionStat[]
  /** Compact stats mode: the tags read their figures without their words. */
  compact: boolean
  /** The tags show at rest as well as while the position is hovered or selected. */
  alwaysShowStats: boolean
}

/** The stats a new position reads: all but the profit and loss at the target and the stop. */
const DEFAULT_STATS: readonly PositionStat[] = POSITION_STATS.filter((stat) => stat !== 'tpPL' && stat !== 'slPL')

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
 * Trade plan visual: anchor 1 = entry (its time is the box's left edge), anchor 2 = target (its
 * time sets the right edge), anchor 3 = stop. The profit zone paints green with its target tag, the
 * risk zone red with its stop tag, and the entry line carries the P&L, the quantity and the
 * risk/reward ratio, each as the Stats list chooses. Quantity is the lesser of the risk budget over
 * the stop distance and the leveraged account's buying power.
 */
export class LongPosition extends Drawing<PositionProps> {
  readonly type: string = 'long_position'

  protected override defaultProps(): PositionProps {
    return {
      accountSize: 1000,
      risk: 25,
      riskDisplay: 'percent',
      lotSize: 1,
      leverage: 10000,
      qtyPrecision: 'default',
      profitColor: withAlpha(PROFIT, ZONE_ALPHA),
      stopColor: withAlpha(LOSS, ZONE_ALPHA),
      showPrices: true,
      stats: [...DEFAULT_STATS],
      compact: false,
      alwaysShowStats: false,
    }
  }

  /** A format-2 position showed its tags whether or not it was selected; compact, its target and
   *  stop tags read their offsets alone; and a save naming no leverage carried none. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const stats = saved.compact === true ? DEFAULT_STATS.filter((stat) => stat !== 'tpAmount' && stat !== 'slAmount') : [...DEFAULT_STATS]
    this._props = { ...this._props, stats, alwaysShowStats: true, ...('leverage' in saved ? {} : { leverage: 1 }) }
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
      const reference = lastClose ?? (bars.length ? bars[bars.length - 1]!.close : null)
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

  /** The quantity as the position's precision writes it. */
  protected qtyText(qty: number): string {
    const precision = this.props.qtyPrecision
    if (precision === 'default') return qty >= 100 ? qty.toFixed(0) : qty.toFixed(2)
    return qty.toFixed(Number(precision))
  }

  /** A level's tag: its offset as a price, a percent and ticks, then its amount and its P&L, each as
   *  the Stats list chooses, with their words unless the stats are compact. Ticks need the host's
   *  tick; without one they are left out. */
  private levelTag(side: 'tp' | 'sl', offset: number, percent: number, amount: number, pl: number): string {
    const shown = (stat: string): boolean => (this.props.stats as readonly string[]).includes(stat)
    const compact = this.props.compact
    const tick = this.tickSize()
    const head: string[] = []
    if (shown(`${side}PriceOffset`)) head.push(this.formatPrice(offset))
    if (shown(`${side}PercentOffset`)) head.push(`(${percent.toFixed(2)}%)`)
    if (shown(`${side}TickOffset`) && tick && tick > 0) head.push(String(Math.round(offset / tick)))
    const parts: string[] = []
    if (head.length) parts.push(compact ? head.join(' ') : `${side === 'tp' ? 'Target' : 'Stop'}: ${head.join(' ')}`)
    if (shown(`${side}Amount`)) parts.push(compact ? moneyText(amount) : `Amount: ${moneyText(amount)}`)
    if (shown(`${side}PL`)) parts.push(compact ? moneyText(pl) : `P&L: ${moneyText(pl)}`)
    return parts.join(compact ? ' · ' : ', ')
  }

  /** The entry's tag: the open or closed P&L, the quantity and the risk/reward ratio, as chosen. */
  private entryTag(s: PositionStats): string {
    const shown = (stat: PositionStat): boolean => this.props.stats.includes(stat)
    const compact = this.props.compact
    const parts: string[] = []
    if (shown('openClosePL')) parts.push(compact ? moneyText(s.pnl) : `${s.closed ? 'Closed P&L' : 'Open P&L'}: ${moneyText(s.pnl)}`)
    if (shown('qty')) parts.push(compact ? this.qtyText(s.qty) : `Qty: ${this.qtyText(s.qty)}`)
    if (shown('riskRewardRatio')) parts.push(compact ? s.ratio.toFixed(2) : `Risk/Reward Ratio: ${s.ratio.toFixed(2)}`)
    return parts.join(compact ? ' · ' : ', ')
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const z = this.zones(viewport)
    if (!z) return
    const [entry, target, stop] = this.anchors
    ctx.save()
    const profitInk = withAlpha(this.props.profitColor, 1)
    const stopInk = withAlpha(this.props.stopColor, 1)
    ctx.fillStyle = this.props.profitColor
    ctx.fillRect(z.left, Math.min(z.entryY, z.targetY), z.right - z.left, Math.abs(z.targetY - z.entryY))
    ctx.fillStyle = this.props.stopColor
    ctx.fillRect(z.left, Math.min(z.entryY, z.stopY), z.right - z.left, Math.abs(z.stopY - z.entryY))
    ctx.restore()

    ctx.save()
    applyStroke(ctx, this.style)
    ctx.strokeStyle = profitInk
    strokeSegment(ctx, { x: z.left, y: z.targetY }, { x: z.right, y: z.targetY })
    ctx.strokeStyle = stopInk
    strokeSegment(ctx, { x: z.left, y: z.stopY }, { x: z.right, y: z.stopY })
    ctx.strokeStyle = this.style.lineColor
    strokeSegment(ctx, { x: z.left, y: z.entryY }, { x: z.right, y: z.entryY })
    ctx.restore()

    const s = this.stats()
    if (s && (this.props.alwaysShowStats || this.state !== 'normal')) {
      // The P&L and the amounts at target and stop are MONEY, written by the money stand-in; the
      // level offsets are prices on the symbol's grid and go through the price port.
      const mid = (z.left + z.right) / 2
      const targetText = this.levelTag('tp', s.tpOffset, s.tpPercent, s.amountAtTp, s.tpOffset * s.qty * (this.props.lotSize > 0 ? this.props.lotSize : 1))
      const stopText = this.levelTag('sl', s.slOffset, s.slPercent, s.amountAtSl, -s.slOffset * s.qty * (this.props.lotSize > 0 ? this.props.lotSize : 1))
      const entryText = this.entryTag(s)
      // The three tags are written in the drawing's text colour, which is what the bar's text
      // control sets: the plan's words are the only text it has.
      if (targetText) paintLabel(ctx, targetText, { x: mid, y: z.targetY }, this.style, { align: 'center', background: profitInk })
      if (stopText) paintLabel(ctx, stopText, { x: mid, y: z.stopY }, this.style, { align: 'center', background: stopInk })
      if (entryText) paintLabel(ctx, entryText, { x: mid, y: z.entryY }, this.style, { align: 'center', background: '#585858' })
    }

    if (this.props.showPrices) {
      paintLabel(ctx, this.formatPrice(target!.price), { x: z.right + 6, y: z.targetY }, { ...this.style, textColor: profitInk })
      paintLabel(ctx, this.formatPrice(stop!.price), { x: z.right + 6, y: z.stopY }, { ...this.style, textColor: stopInk })
      // Each price beside the plan is written in its own level's ink, the entry's in the entry line's:
      // the text colour belongs to the tags alone.
      paintLabel(ctx, this.formatPrice(entry!.price), { x: z.right + 6, y: z.entryY }, { ...this.style, textColor: this.style.lineColor })
    }
  }

  /** The stop's handle stands on the box's far edge beside the target's, where the stop's level is
   *  painted: the box's edges are the entry's time and the target's, and the stop's own time paints
   *  nothing, so a handle at it would stay behind as the box's width changes. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points = super.getControlPoints(viewport)
    const edge = points.find((point) => point.index === 1)
    return edge ? points.map((point) => (point.index === 2 ? { ...point, x: edge.x } : point)) : points
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
 * duration. As bars arrive the idea resolves itself: Success when price touches the target before
 * the target time, Failure once that time passes untouched.
 */
export class Forecast extends Drawing<ForecastProps> {
  readonly type = 'forecast'

  protected override defaultProps(): ForecastProps {
    return {
      sourceTextColor: '#ffffff',
      sourceBackColor: 'rgba(41, 98, 255, 0.9)',
      sourceBorderColor: '#2962ff',
      targetTextColor: '#ffffff',
      targetBackColor: '#2962ff',
      targetBorderColor: '#2962ff',
      successTextColor: '#ffffff',
      successBackColor: '#4caf50',
      failureTextColor: '#ffffff',
      failureBackColor: LOSS,
    }
  }

  /** A format-2 forecast that named none of these colors drew its source tag blue, its target tag
   *  and its success green. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const earlier: Partial<ForecastProps> = { sourceBackColor: '#2962ff', targetBackColor: PROFIT, targetBorderColor: PROFIT, successBackColor: PROFIT }
    const missing = Object.fromEntries(Object.entries(earlier).filter(([key]) => !(key in saved)))
    this._props = { ...this._props, ...missing }
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

/** A sector's two backgrounds, one for each half of the slice, and whether they fill. */
export type SectorProps = {
  /** The half of the slice toward its second point. */
  color1: string
  /** The half toward its third point. */
  color2: string
  fillBackground: boolean
}

/**
 * Sector: a wedge projecting price forward from an origin, a horizontal point in the future and a
 * third point at the estimated price. The arc between the two far points closes the slice, and the
 * ray through the arc's middle parts its two backgrounds.
 */
export class Sector extends Drawing<SectorProps> {
  readonly type = 'sector'

  protected override defaultProps(): SectorProps {
    return { color1: 'rgba(41, 98, 255, 0.2)', color2: 'rgba(156, 39, 176, 0.2)', fillBackground: true }
  }

  /** A format-2 sector filled its slice in its background, one color across both halves. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    const fill = fillPaint(this._style)
    this._props = fill ? { ...this._props, color1: fill, color2: fill, fillBackground: true } : { ...this._props, fillBackground: false }
  }

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
    if (this.props.fillBackground !== false) {
      const middle = Math.floor(arc.samples.length / 2)
      const half = (from: number, to: number, color: string): void => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(arc.origin.x, arc.origin.y)
        for (let i = from; i <= to; i++) ctx.lineTo(arc.samples[i]!.x, arc.samples[i]!.y)
        ctx.closePath()
        ctx.fill()
      }
      // Halves of one color fill as one slice, with no seam between them.
      if (this.props.color1 === this.props.color2) half(0, arc.samples.length - 1, this.props.color1)
      else {
        half(0, middle, this.props.color1)
        half(middle, arc.samples.length - 1, this.props.color2)
      }
    }
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(arc.origin.x, arc.origin.y)
    for (const s of arc.samples) ctx.lineTo(s.x, s.y)
    ctx.closePath()
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
