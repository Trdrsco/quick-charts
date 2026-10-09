import type { DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barsInRange, volumeText } from '../core/bars'
import { applyStroke, fillPaint, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'

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

/** What a range meter reads and how: the stats its label reads (a meter offers the ones its axes
 *  measure), its span's background, its label's words and background, and the viewer's own words. */
export type RangeMeterProps = {
  /** The viewer's own words, at the span's middle, in the drawing's text style. */
  text: string
  showPriceRange: boolean
  showPercentChange: boolean
  showPipsChange: boolean
  showBarsRange: boolean
  showDateTimeRange: boolean
  showVolume: boolean
  /** The span's background, in the drawing's fill. */
  fillBackground: boolean
  /** The stats label's words: their color and size. */
  labelColor: string
  labelFontSize: number
  /** The stats label's background. */
  fillLabelBackground: boolean
  labelBackgroundColor: string
  /** The stats label takes the drawing's text weight and slant. */
  labelTextStyle: boolean
}

/** A price range runs its span on to the pane's left or right edge. */
export type PriceRangeProps = RangeMeterProps & { extendLeft: boolean; extendRight: boolean }
/** A date range runs its span on to the pane's top or bottom. */
export type DateRangeProps = RangeMeterProps & { extendTop: boolean; extendBottom: boolean }
/** A date and price range draws its span's border on a switch, in a stroke of its own, and runs its
 *  span on to the pane's left and right edges where a save carries that, which its pages do not
 *  offer. */
export type DatePriceRangeProps = RangeMeterProps & { drawBorder: boolean; borderColor: string; borderWidth: number; extendLeft: boolean; extendRight: boolean }

const METER_PROPS: RangeMeterProps = {
  text: '',
  showPriceRange: false,
  showPercentChange: false,
  showPipsChange: false,
  showBarsRange: false,
  showDateTimeRange: false,
  showVolume: false,
  fillBackground: true,
  labelColor: '#ffffff',
  labelFontSize: 12,
  fillLabelBackground: true,
  labelBackgroundColor: 'rgba(46, 46, 46, 0.4)',
  labelTextStyle: false,
}

/** The props a meter keeps from a save: its stats under their earlier names, and its one extension
 *  as both of the sides it runs on to, where it runs on at all. */
function upgradeMeter<P extends RangeMeterProps>(props: Partial<P>, sides: readonly (keyof P)[]): Partial<P> {
  const saved = props as Partial<P> & { showPriceDelta?: boolean; showPercent?: boolean; showBars?: boolean; showTimeSpan?: boolean; extend?: boolean }
  const out: Record<string, unknown> = { ...saved }
  const renamed: [string, string][] = [
    ['showPriceDelta', 'showPriceRange'],
    ['showPercent', 'showPercentChange'],
    ['showBars', 'showBarsRange'],
    ['showTimeSpan', 'showDateTimeRange'],
  ]
  for (const [from, to] of renamed) {
    if (from in out) {
      if (!(to in out)) out[to] = out[from]
      delete out[from]
    }
  }
  if ('extend' in out) {
    if (out.extend === true) for (const side of sides) if (!(side in out)) out[side as string] = true
    delete out.extend
  }
  return out as Partial<P>
}

/** Shared skeleton for the range meters: shaded span, measuring arrows and the stats label. */
abstract class RangeMeter<P extends RangeMeterProps> extends Drawing<P> {
  requiredAnchors(): number {
    return 2
  }

  protected pixels(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return { a, b }
  }

  /** The hint sits at the span's center, which is where the text itself renders. */
  protected override textHintPlacement(points: Point[]): { x: number; y: number; angle: number } {
    const [a, b] = points
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: 0 } : super.textHintPlacement(points)
  }

  /** The span as it is shaded: the box between the points, run on as the meter extends. */
  protected span(a: Point, b: Point, _viewport: Viewport): { x: number; y: number; width: number; height: number } {
    return box(a, b)
  }

  protected stats(viewport: Viewport): string[] {
    const [a, b] = this.anchors
    if (!a || !b) return []
    const out: string[] = []
    if (this.measuresPrice()) {
      const dPrice = b.price - a.price
      const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
      const tick = this.tickSize()
      const parts: string[] = []
      if (this.props.showPriceRange) parts.push(`${dPrice >= 0 ? '+' : ''}${this.formatPrice(dPrice)}`)
      if (this.props.showPercentChange) parts.push(`(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`)
      // A change in pips needs the host's tick; without one it is left out.
      if (this.props.showPipsChange && tick && tick > 0) parts.push(String(Math.round(dPrice / tick)))
      if (parts.length) out.push(parts.join(' '))
    }
    if (this.measuresTime()) {
      if (this.props.showBarsRange) {
        const bars = viewport.barsBetween(a.time, b.time)
        if (bars !== null) out.push(`${Math.round(bars)} bars`)
      }
      if (this.props.showDateTimeRange) {
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

  /** The span's border, where the meter draws one. */
  protected paintBorder(_ctx: CanvasRenderingContext2D, _r: { x: number; y: number; width: number; height: number }): void {}

  /** A format-2 meter shaded its span in its stroke color at its fill's opacity, 8% at the least,
   *  read no price moves, and wrote its stats in its own text style on a dark plate at 92%. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    const s = this._style
    this._style = { ...s, fillColor: s.lineColor, fillOpacity: Math.max(0.08, s.fillOpacity) }
    this._props = {
      ...this._props,
      fillBackground: true,
      showPipsChange: false,
      labelColor: s.textColor,
      labelFontSize: s.fontSize,
      fillLabelBackground: true,
      labelBackgroundColor: withAlpha('#1b1f27', 0.92),
      labelTextStyle: true,
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const px = this.pixels(viewport)
    if (!px) return
    const { a, b } = px
    const r = this.span(a, b, viewport)
    const fill = this.props.fillBackground !== false ? fillPaint(this.style) : null
    if (fill) {
      ctx.save()
      ctx.fillStyle = fill
      ctx.fillRect(r.x, r.y, r.width, r.height)
      ctx.restore()
    }
    this.paintBorder(ctx, r)
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
      const label = box(a, b)
      const plain = !this.props.labelTextStyle
      const ink: DrawingStyle = { ...this.style, textColor: this.props.labelColor, fontSize: this.props.labelFontSize, ...(plain ? { bold: false, italic: false } : {}) }
      paintLabel(ctx, stats.join('  ·  '), { x: label.x + label.width / 2, y: label.y + label.height + 16 }, ink, {
        align: 'center',
        ...(this.props.fillLabelBackground !== false ? { background: this.props.labelBackgroundColor } : {}),
      })
    }
    if (this.props.text) {
      const middle = box(a, b)
      paintLabel(ctx, this.props.text, { x: middle.x + middle.width / 2, y: middle.y + middle.height / 2 }, this.style, { align: 'center' })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const px = this.pixels(viewport)
    if (!px) return false
    return inBox(point, box(px.a, px.b))
  }
}

/** Vertical meter: price delta and % between two levels. */
export class PriceRange extends RangeMeter<PriceRangeProps> {
  readonly type = 'price_range'

  protected override defaultProps(): PriceRangeProps {
    return { ...METER_PROPS, showPriceRange: true, showPercentChange: true, showPipsChange: true, showVolume: true, extendLeft: false, extendRight: false }
  }

  protected override upgradeProps(props: Partial<PriceRangeProps>): Partial<PriceRangeProps> {
    return upgradeMeter(props, ['extendLeft', 'extendRight'])
  }

  protected override span(a: Point, b: Point, viewport: Viewport): { x: number; y: number; width: number; height: number } {
    const r = box(a, b)
    const left = this.props.extendLeft ? 0 : r.x
    const right = this.props.extendRight ? viewport.width : r.x + r.width
    return { x: left, y: r.y, width: right - left, height: r.height }
  }

  protected measuresPrice(): boolean {
    return true
  }

  protected measuresTime(): boolean {
    return false
  }
}

/** Horizontal meter: bar count and time span between two times. */
export class DateRange extends RangeMeter<DateRangeProps> {
  readonly type = 'date_range'

  protected override defaultProps(): DateRangeProps {
    return { ...METER_PROPS, showBarsRange: true, showDateTimeRange: true, showVolume: true, extendTop: false, extendBottom: false }
  }

  protected override upgradeProps(props: Partial<DateRangeProps>): Partial<DateRangeProps> {
    return upgradeMeter(props, ['extendTop', 'extendBottom'])
  }

  protected override span(a: Point, b: Point, viewport: Viewport): { x: number; y: number; width: number; height: number } {
    const r = box(a, b)
    const top = this.props.extendTop ? 0 : r.y
    const bottom = this.props.extendBottom ? viewport.height : r.y + r.height
    return { x: r.x, y: top, width: r.width, height: bottom - top }
  }

  protected measuresPrice(): boolean {
    return false
  }

  protected measuresTime(): boolean {
    return true
  }
}

/** Combined meter: price and time deltas of the spanned box. */
export class DatePriceRange extends RangeMeter<DatePriceRangeProps> {
  readonly type = 'date_and_price_range'

  protected override defaultProps(): DatePriceRangeProps {
    return {
      ...METER_PROPS,
      showPriceRange: true,
      showPercentChange: true,
      showPipsChange: true,
      showBarsRange: true,
      showDateTimeRange: true,
      showVolume: true,
      drawBorder: false,
      borderColor: '#2962ff',
      borderWidth: 1,
      extendLeft: false,
      extendRight: false,
    }
  }

  protected override upgradeProps(props: Partial<DatePriceRangeProps>): Partial<DatePriceRangeProps> {
    return upgradeMeter(props, ['extendLeft', 'extendRight'])
  }

  protected override span(a: Point, b: Point, viewport: Viewport): { x: number; y: number; width: number; height: number } {
    const r = box(a, b)
    const left = this.props.extendLeft ? 0 : r.x
    const right = this.props.extendRight ? viewport.width : r.x + r.width
    return { x: left, y: r.y, width: right - left, height: r.height }
  }

  protected override paintBorder(ctx: CanvasRenderingContext2D, r: { x: number; y: number; width: number; height: number }): void {
    if (!this.props.drawBorder) return
    ctx.save()
    applyStroke(ctx, { ...this.style, lineColor: this.props.borderColor, lineWidth: this.props.borderWidth, lineStyle: 'solid' })
    ctx.strokeRect(r.x, r.y, r.width, r.height)
    ctx.restore()
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
    // The tick count rides only on a host-stated tick; without one the readout omits it.
    const tick = this.tickSize()
    const ticks = tick !== null && tick > 0 ? Math.round(Math.abs(dPrice) / tick) : 0
    const parts = [`${this.formatPrice(dPrice)} (${pct.toFixed(2)}%)`]
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
