import type { Time } from 'lightweight-charts'

import type { ISeriesPrimitiveAxisView } from 'lightweight-charts'
import type { DrawingStyle, LineStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barPrice, barsInRange, volumeProfile, volumeText } from '../core/bars'
import type { BarPriceSource, SourceBar, VolumeBin } from '../core/bars'
import { distanceToSegment } from '../core/geometry'
import { alphaOf, applyStroke, dashPattern, fillPaint, paintLabel, withAlpha } from '../render/canvas'
import { AxisLabel } from '../render/axis-view'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** Bars from the anchor's time to the newest bar. */
function barsFrom(all: readonly SourceBar[], from: Time): SourceBar[] {
  const start = Number(from)
  if (!Number.isFinite(start)) return []
  return all.filter((bar) => Number(bar.time) >= start)
}

/** A VWAP band line's stroke: shown or not, its color, width and style. */
export type VwapLine = { visible: boolean; color: string; width: number; style: LineStyle }

/** An anchored VWAP's inputs and its bands' strokes. */
export type AnchoredVwapProps = {
  /** The price of each bar the average weighs by its volume. */
  source: BarPriceSource
  /** How far a band stands off the average: in volume-weighted standard deviations, or in percents
   *  of the average. */
  bandsMode: 'stdev' | 'percent'
  /** The three bands' multipliers, and which of the bands are calculated. */
  bandMultipliers: number[]
  bandsOn: boolean[]
  /** Each band's upper and lower line, the first band first. */
  upperBands: VwapLine[]
  lowerBands: VwapLine[]
  /** The first band's body, in the drawing's fill. */
  fillBackground: boolean
  /** The average's latest value read on the price scale. */
  showPriceLabel: boolean
}

const vwapLine = (color: string): VwapLine => ({ visible: true, color, width: 1, style: 'solid' })
const BAND_COLORS = ['#4caf50', '#808000', '#00897b']

/** The average and its bands at one bar. */
type VwapSample = { time: SourceBar['time']; vwap: number; upper: (number | null)[]; lower: (number | null)[] }

/**
 * Anchored VWAP: the volume-weighted average of the chosen price of every bar since the anchor,
 * drawn as a line that extends live as bars arrive, with up to three bands standing off it by
 * standard deviations or percents.
 */
export class AnchoredVwap extends Drawing<AnchoredVwapProps> {
  readonly type = 'anchored_vwap'

  protected override defaultProps(): AnchoredVwapProps {
    return {
      source: 'hlc3',
      bandsMode: 'stdev',
      bandMultipliers: [1, 2, 3],
      bandsOn: [true, false, false],
      upperBands: BAND_COLORS.map(vwapLine),
      lowerBands: BAND_COLORS.map(vwapLine),
      fillBackground: true,
      showPriceLabel: false,
    }
  }

  requiredAnchors(): number {
    return 1
  }

  /** The average and its calculated bands, bar by bar from the anchor. */
  protected series(): VwapSample[] {
    const anchor = this.anchors[0]
    if (!anchor) return []
    const run = barsFrom(this.bars(), anchor.time)
    const p = this.props
    let sumPV = 0
    let sumPPV = 0
    let sumV = 0
    const out: VwapSample[] = []
    for (const bar of run) {
      const volume = bar.volume ?? 0
      const price = barPrice(bar, p.source)
      sumPV += price * volume
      sumPPV += price * price * volume
      sumV += volume
      if (sumV <= 0) continue
      const vwap = sumPV / sumV
      const deviation = Math.sqrt(Math.max(0, sumPPV / sumV - vwap * vwap))
      const offsets = p.bandMultipliers.map((k, i) => (p.bandsOn[i] ? (p.bandsMode === 'percent' ? (vwap * k) / 100 : deviation * k) : null))
      out.push({ time: bar.time, vwap, upper: offsets.map((o) => (o === null ? null : vwap + o)), lower: offsets.map((o) => (o === null ? null : vwap - o)) })
    }
    return out
  }

  /** A run of values along the samples, on the pane. */
  private points(samples: readonly VwapSample[], value: (s: VwapSample) => number | null, viewport: Viewport): Point[] {
    const out: Point[] = []
    for (const s of samples) {
      const v = value(s)
      if (v === null) continue
      const x = viewport.xOf(s.time)
      const y = viewport.yOf(v)
      if (x !== null && y !== null) out.push({ x, y })
    }
    return out
  }

  private readonly _axisViews = [
    new AxisLabel({
      coordinate: () => {
        const viewport = this.getViewport()
        const last = this.series().at(-1)
        return viewport && last ? viewport.yOf(last.vwap) : null
      },
      text: () => {
        const last = this.series().at(-1)
        return last ? this.formatPrice(last.vwap) : ''
      },
      color: () => withAlpha(this.style.lineColor, 1),
      visible: () => this.props.showPriceLabel && this.isVisibleNow(),
    }),
  ]

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.series()
    const anchor = this.anchors[0]
    const p = anchor ? this.anchorToPixel(anchor, viewport) : null
    if (p) {
      ctx.save()
      ctx.setLineDash([])
      ctx.fillStyle = this.style.lineColor
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    const line = this.points(samples, (s) => s.vwap, viewport)
    if (line.length < 2) {
      if (p) {
        paintLabel(ctx, 'VWAP needs volume data', { x: p.x + 8, y: p.y - 12 }, this.style, {
          background: withAlpha('#1b1f27', 0.92),
        })
      }
      return
    }
    const props = this.props
    // The first band's body, between its upper and lower lines.
    const fill = props.fillBackground && props.bandsOn[0] ? fillPaint(this.style) : null
    if (fill) {
      const upper = this.points(samples, (s) => s.upper[0] ?? null, viewport)
      const lower = this.points(samples, (s) => s.lower[0] ?? null, viewport)
      if (upper.length > 1 && lower.length > 1) {
        ctx.save()
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.moveTo(upper[0]!.x, upper[0]!.y)
        for (const point of upper.slice(1)) ctx.lineTo(point.x, point.y)
        for (const point of [...lower].reverse()) ctx.lineTo(point.x, point.y)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
    const stroke = (points: Point[], style: Readonly<DrawingStyle>): void => {
      if (points.length < 2) return
      ctx.save()
      applyStroke(ctx, style)
      ctx.beginPath()
      ctx.moveTo(points[0]!.x, points[0]!.y)
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.restore()
    }
    for (let i = 0; i < props.bandMultipliers.length; i++) {
      for (const [bands, side] of [
        [props.upperBands, 'upper'],
        [props.lowerBands, 'lower'],
      ] as const) {
        const band = bands[i]
        if (!band?.visible || !props.bandsOn[i]) continue
        stroke(this.points(samples, (s) => s[side][i] ?? null, viewport), { ...this.style, lineColor: band.color, lineWidth: band.width, lineStyle: band.style })
      }
    }
    stroke(line, this.style)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const line = this.points(this.series(), (s) => s.vwap, viewport)
    if (line.length < 2) {
      const anchor = this.anchors[0]
      const p = anchor ? this.anchorToPixel(anchor, viewport) : null
      return !!p && Math.hypot(point.x - p.x, point.y - p.y) <= 10
    }
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < line.length - 1; i++) {
      if (distanceToSegment(point, line[i]!, line[i + 1]!) <= tolerance) return true
    }
    return false
  }
}

/**
 * Running POC/VAH/VAL per bar, computed incrementally over the range's fixed price extent in
 * one pass over the bars, O(rows) work per bar, so a 5k-bar range stays cheap. Sampled points
 * come back in price space; the caller maps them to pixels per paint.
 */
function developingLevels(
  range: readonly SourceBar[],
  rows: number,
  vaShare: number,
): { poc: { time: SourceBar['time']; price: number }[]; vah: { time: SourceBar['time']; price: number }[]; val: { time: SourceBar['time']; price: number }[] } | null {
  const withVolume = range.filter((b) => typeof b.volume === 'number' && b.volume > 0)
  if (withVolume.length < 2 || rows < 1) return null
  let min = Infinity
  let max = -Infinity
  for (const bar of withVolume) {
    min = Math.min(min, bar.low)
    max = Math.max(max, bar.high)
  }
  if (!(max > min)) return null
  const height = (max - min) / rows
  const bins = new Array<number>(rows).fill(0)
  const out = {
    poc: [] as { time: SourceBar['time']; price: number }[],
    vah: [] as { time: SourceBar['time']; price: number }[],
    val: [] as { time: SourceBar['time']; price: number }[],
  }
  let total = 0
  for (const bar of withVolume) {
    const lowBin = Math.max(0, Math.min(rows - 1, Math.floor((bar.low - min) / height)))
    const highBin = Math.max(0, Math.min(rows - 1, Math.floor((bar.high - min) / height)))
    const share = (bar.volume as number) / (highBin - lowBin + 1)
    for (let i = lowBin; i <= highBin; i++) bins[i] += share
    total += bar.volume as number
    let pocIndex = 0
    for (let i = 1; i < rows; i++) if (bins[i] > bins[pocIndex]) pocIndex = i
    out.poc.push({ time: bar.time, price: min + (pocIndex + 0.5) * height })
    if (vaShare > 0) {
      let low = pocIndex
      let high = pocIndex
      let covered = bins[pocIndex]
      while (covered < total * vaShare && (low > 0 || high < rows - 1)) {
        const below = low > 0 ? bins[low - 1] : -1
        const above = high < rows - 1 ? bins[high + 1] : -1
        if (above >= below) covered += bins[++high]
        else covered += bins[--low]
      }
      out.vah.push({ time: bar.time, price: min + (high + 1) * height })
      out.val.push({ time: bar.time, price: min + low * height })
    }
  }
  return out
}

/** A profile line's stroke: shown or not, its color, width and style. */
type ProfileLine = { visible: boolean; color: string; width: number; style: LineStyle }

export type ProfileProps = {
  /** 'number' sizes the histogram by total row count; 'ticks' by price ticks per row. */
  rowsLayout: 'number' | 'ticks'
  rowSize: number
  /** 'updown' splits each row by up/down bars, 'total' paints one bar, 'delta' their difference. */
  volume: 'updown' | 'total' | 'delta'
  /** Percentage of total volume the value area holds (0 holds none). */
  valueAreaVolume: number
  /** The histogram itself. */
  showProfile: boolean
  /** Each row's volume written beside it, in its own color. */
  showValues: boolean
  valuesColor: string
  /** Histogram width as a percentage of the range box. */
  widthPercent: number
  /** Which edge the histogram grows from. */
  placement: 'left' | 'right'
  /** The rows outside the value area, and inside it, as given, opacity and all. */
  upColor: string
  downColor: string
  valueAreaUpColor: string
  valueAreaDownColor: string
  /** The value area's high and low and the point of control, each across the range in a stroke of
   *  its own. */
  vahVisible: boolean
  vahColor: string
  vahWidth: number
  vahStyle: LineStyle
  valVisible: boolean
  valColor: string
  valWidth: number
  valStyle: LineStyle
  pocVisible: boolean
  pocColor: string
  pocWidth: number
  pocStyle: LineStyle
  /** The running point of control and value area, walked bar by bar across the range, each in a
   *  stroke of its own. */
  developingPoc: boolean
  developingPocColor: string
  developingPocWidth: number
  developingPocStyle: LineStyle
  developingVa: boolean
  developingVaColor: string
  developingVaWidth: number
  developingVaStyle: LineStyle
  /** The range box's background. */
  boxColor: string
  /** The point of control and the value area's shown bounds read on the price scale. */
  showLabelsOnPriceScale: boolean
}

/** The profile's levels: its rows, its point of control and its value area's bounds. */
type ProfileLevels = { bins: VolumeBin[]; pocIndex: number; low: number; high: number; vaShare: number }

/** Shared volume-by-price histogram body; subclasses define the bar range and the x-span. */
abstract class VolumeProfileBase<P extends ProfileProps & Record<string, unknown>> extends Drawing<P> {
  protected abstract range(): SourceBar[]
  protected abstract span(viewport: Viewport): { x1: number; x2: number } | null

  protected rowCount(range: readonly SourceBar[]): number {
    const size = Math.max(1, this.props.rowSize)
    if (this.props.rowsLayout === 'ticks') {
      let min = Infinity
      let max = -Infinity
      for (const bar of range) {
        min = Math.min(min, bar.low)
        max = Math.max(max, bar.high)
      }
      if (!(max > min)) return 24
      // Tick rows need the symbol's tick; without one the profile keeps its default row count.
      const tick = this.tickSize()
      if (tick === null) return 24
      const rows = Math.ceil((max - min) / (tick * size))
      return Math.max(1, Math.min(400, rows))
    }
    return Math.max(1, Math.min(400, Math.round(size)))
  }

  /** The rows, the point of control, and the value area grown from it toward the heavier neighbour
   *  until it holds its share of the volume: the trading-profile convention. */
  protected levels(range: readonly SourceBar[]): ProfileLevels | null {
    const bins = volumeProfile(range, this.rowCount(range))
    if (!bins) return null
    const pocIndex = bins.reduce((best, bin, i) => (bin.volume > bins[best]!.volume ? i : best), 0)
    const vaShare = Math.max(0, Math.min(100, this.props.valueAreaVolume)) / 100
    const total = bins.reduce((s, b) => s + b.volume, 0)
    let low = pocIndex
    let high = pocIndex
    let covered = bins[pocIndex]!.volume
    while (vaShare > 0 && covered < total * vaShare && (low > 0 || high < bins.length - 1)) {
      const below = low > 0 ? bins[low - 1]!.volume : -1
      const above = high < bins.length - 1 ? bins[high + 1]!.volume : -1
      if (above >= below) covered += bins[++high]!.volume
      else covered += bins[--low]!.volume
    }
    return { bins, pocIndex, low, high, vaShare }
  }

  /** The prices the point of control and the value area's bounds stand at. */
  protected levelPrices(): { poc: number; vah: number | null; val: number | null } | null {
    const l = this.levels(this.range())
    if (!l) return null
    const poc = l.bins[l.pocIndex]!
    return {
      poc: (poc.priceLow + poc.priceHigh) / 2,
      vah: l.vaShare > 0 ? l.bins[l.high]!.priceHigh : null,
      val: l.vaShare > 0 ? l.bins[l.low]!.priceLow : null,
    }
  }

  private readonly _axisViews = (['poc', 'vah', 'val'] as const).map(
    (key) =>
      new AxisLabel({
        coordinate: () => {
          const viewport = this.getViewport()
          const price = this.levelPrices()?.[key]
          return viewport && price !== null && price !== undefined ? viewport.yOf(price) : null
        },
        text: () => {
          const price = this.levelPrices()?.[key]
          return price === null || price === undefined ? '' : this.formatPrice(price)
        },
        color: () => withAlpha(this.props[`${key}Color`] as string, 1),
        visible: () => this.props.showLabelsOnPriceScale && this.props[`${key}Visible`] === true && this.isVisibleNow(),
      }),
  )

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const span = this.span(viewport)
    if (!span) return
    const range = this.range()
    const p = this.props
    // The range box's background, as given, opacity and all.
    if (alphaOf(p.boxColor) > 0) {
      ctx.save()
      ctx.fillStyle = p.boxColor
      ctx.fillRect(span.x1, 0, span.x2 - span.x1, viewport.height)
      ctx.restore()
    }
    const l = this.levels(range)
    if (!l) {
      paintLabel(ctx, 'profile needs volume data', { x: (span.x1 + span.x2) / 2, y: 16 }, this.style, {
        align: 'center',
        background: withAlpha('#1b1f27', 0.92),
      })
      return
    }
    const { bins, pocIndex, low, high, vaShare } = l
    const maxVolume = Math.max(...bins.map((b) => b.volume))
    if (maxVolume <= 0) return
    const maxWidth = ((span.x2 - span.x1) * Math.max(5, Math.min(100, p.widthPercent))) / 100
    const fromRight = p.placement === 'right'

    ctx.save()
    ctx.setLineDash([])
    for (const [i, bin] of bins.entries()) {
      const y1 = viewport.yOf(bin.priceHigh)
      const y2 = viewport.yOf(bin.priceLow)
      if (y1 === null || y2 === null) continue
      const top = Math.min(y1, y2)
      const rowH = Math.max(1, Math.abs(y2 - y1) - 1)
      const inValueArea = vaShare > 0 && i >= low && i <= high
      const upPaint = inValueArea ? p.valueAreaUpColor : p.upColor
      const downPaint = inValueArea ? p.valueAreaDownColor : p.downColor
      // Rows grow from the chosen edge; a right placement mirrors every rect.
      const rect = (offset: number, w: number) => {
        if (fromRight) ctx.fillRect(span.x2 - offset - w, top, w, rowH)
        else ctx.fillRect(span.x1 + offset, top, w, rowH)
      }
      let width = 0
      if (p.showProfile) {
        if (p.volume === 'updown') {
          const upW = (bin.upVolume / maxVolume) * maxWidth
          const downW = (bin.downVolume / maxVolume) * maxWidth
          ctx.fillStyle = upPaint
          rect(0, upW)
          ctx.fillStyle = downPaint
          rect(upW, downW)
          width = upW + downW
        } else if (p.volume === 'delta') {
          const delta = bin.upVolume - bin.downVolume
          ctx.fillStyle = delta >= 0 ? upPaint : downPaint
          width = (Math.abs(delta) / maxVolume) * maxWidth
          rect(0, width)
        } else {
          ctx.fillStyle = upPaint
          width = (bin.volume / maxVolume) * maxWidth
          rect(0, width)
        }
      }
      if (p.showValues) {
        const value = p.volume === 'delta' ? bin.upVolume - bin.downVolume : bin.volume
        const at = { x: fromRight ? span.x2 - width - 4 : span.x1 + width + 4, y: top + rowH / 2 }
        paintLabel(ctx, volumeText(value), at, { ...this.style, textColor: p.valuesColor }, { align: fromRight ? 'right' : 'left' })
      }
    }
    // The point of control across the whole range, and the value area's bounds, each its own stroke.
    const level = (y: number | null, line: ProfileLine) => {
      if (y === null || !line.visible) return
      ctx.strokeStyle = line.color
      ctx.lineWidth = line.width
      ctx.setLineDash(dashPattern(line.style, line.width))
      ctx.beginPath()
      ctx.moveTo(span.x1, y)
      ctx.lineTo(span.x2, y)
      ctx.stroke()
    }
    const poc = bins[pocIndex]!
    level(viewport.yOf((poc.priceLow + poc.priceHigh) / 2), { visible: p.pocVisible, color: p.pocColor, width: p.pocWidth, style: p.pocStyle })
    if (vaShare > 0) {
      level(viewport.yOf(bins[high]!.priceHigh), { visible: p.vahVisible, color: p.vahColor, width: p.vahWidth, style: p.vahStyle })
      level(viewport.yOf(bins[low]!.priceLow), { visible: p.valVisible, color: p.valColor, width: p.valWidth, style: p.valStyle })
    }
    // The developing lines: the running point of control and value area walked bar by bar.
    if (p.developingPoc || p.developingVa) {
      const developing = developingLevels(range, this.rowCount(range), vaShare)
      if (developing) {
        const polyline = (points: { time: SourceBar['time']; price: number }[], line: ProfileLine) => {
          ctx.strokeStyle = line.color
          ctx.lineWidth = line.width
          ctx.setLineDash(dashPattern(line.style, line.width))
          ctx.beginPath()
          let started = false
          for (const point of points) {
            const x = viewport.xOf(point.time)
            const y = viewport.yOf(point.price)
            if (x === null || y === null) continue
            if (started) ctx.lineTo(x, y)
            else ctx.moveTo(x, y)
            started = true
          }
          if (started) ctx.stroke()
        }
        if (p.developingPoc) polyline(developing.poc, { visible: true, color: p.developingPocColor, width: p.developingPocWidth, style: p.developingPocStyle })
        if (p.developingVa) {
          const va = { visible: true, color: p.developingVaColor, width: p.developingVaWidth, style: p.developingVaStyle }
          polyline(developing.vah, va)
          polyline(developing.val, va)
        }
      }
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const span = this.span(viewport)
    if (!span) return false
    return point.x >= span.x1 - 4 && point.x <= span.x2 + 4
  }
}

export type FixedProfileProps = ProfileProps & {
  /** Keep building through every bar right of the range: new bars join the profile live. */
  extendRight: boolean
}

/** Volume-by-price histogram over the two anchors' time range, drawn inside the range box. */
export class FixedRangeVolumeProfile extends VolumeProfileBase<FixedProfileProps> {
  readonly type = 'fixed_range_volume_profile'

  protected override defaultProps(): FixedProfileProps {
    return {
      rowsLayout: 'number',
      rowSize: 200,
      volume: 'updown',
      valueAreaVolume: 100,
      showProfile: true,
      showValues: false,
      valuesColor: '#424242',
      widthPercent: 30,
      placement: 'left',
      upColor: 'rgba(41, 98, 255, 0)',
      downColor: 'rgba(251, 192, 45, 0)',
      valueAreaUpColor: 'rgba(149, 152, 161, 0.35)',
      valueAreaDownColor: 'rgba(149, 152, 161, 0.35)',
      vahVisible: false,
      vahColor: '#2962ff',
      vahWidth: 2,
      vahStyle: 'solid',
      valVisible: false,
      valColor: '#2962ff',
      valWidth: 2,
      valStyle: 'solid',
      pocVisible: true,
      pocColor: 'rgba(244, 67, 54, 0.35)',
      pocWidth: 1,
      pocStyle: 'solid',
      developingPoc: false,
      developingPocColor: '#f44336',
      developingPocWidth: 1,
      developingPocStyle: 'solid',
      developingVa: false,
      developingVaColor: '#2962ff',
      developingVaWidth: 1,
      developingVaStyle: 'solid',
      boxColor: 'rgba(55, 166, 239, 0)',
      showLabelsOnPriceScale: true,
      extendRight: true,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  protected range(): SourceBar[] {
    const [a, b] = this.anchors
    if (!a || !b) return []
    if (this.props.extendRight) {
      return barsFrom(this.bars(), Number(a.time) <= Number(b.time) ? a.time : b.time)
    }
    return barsInRange(this.bars(), a.time, b.time)
  }

  protected span(viewport: Viewport): { x1: number; x2: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const x1 = Math.min(pa.x, pb.x)
    return { x1, x2: this.props.extendRight ? viewport.width : Math.max(pa.x, pb.x) }
  }
}

/** Volume profile from the anchor's time to the newest bar. */
export class AnchoredVolumeProfile extends VolumeProfileBase<ProfileProps> {
  readonly type = 'anchored_volume_profile'

  protected override defaultProps(): ProfileProps {
    return {
      rowsLayout: 'number',
      rowSize: 24,
      volume: 'updown',
      valueAreaVolume: 70,
      showProfile: true,
      showValues: false,
      valuesColor: '#dbdbdb',
      widthPercent: 30,
      placement: 'right',
      upColor: 'rgba(38, 198, 218, 0.5)',
      downColor: 'rgba(236, 64, 122, 0.5)',
      valueAreaUpColor: 'rgba(38, 198, 218, 0.75)',
      valueAreaDownColor: 'rgba(236, 64, 122, 0.75)',
      vahVisible: false,
      vahColor: '#dbdbdb',
      vahWidth: 2,
      vahStyle: 'solid',
      valVisible: false,
      valColor: '#dbdbdb',
      valWidth: 2,
      valStyle: 'solid',
      pocVisible: true,
      pocColor: '#dbdbdb',
      pocWidth: 2,
      pocStyle: 'solid',
      developingPoc: false,
      developingPocColor: '#dbdbdb',
      developingPocWidth: 1,
      developingPocStyle: 'solid',
      developingVa: false,
      developingVaColor: '#00bcd4',
      developingVaWidth: 1,
      developingVaStyle: 'solid',
      boxColor: 'rgba(38, 198, 218, 0.05)',
      showLabelsOnPriceScale: true,
    }
  }

  requiredAnchors(): number {
    return 1
  }

  protected range(): SourceBar[] {
    const anchor = this.anchors[0]
    if (!anchor) return []
    return barsFrom(this.bars(), anchor.time)
  }

  protected span(viewport: Viewport): { x1: number; x2: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const x = viewport.xOf(anchor.time)
    if (x === null) return null
    return { x1: x, x2: viewport.width }
  }
}
