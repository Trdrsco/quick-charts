import type { Time } from 'lightweight-charts'

import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barsInRange, impliedTick, volumeProfile } from '../core/bars'
import type { SourceBar } from '../core/bars'
import { distanceToSegment } from '../core/geometry'
import { alphaOf, applyStroke, dashPattern, paintLabel, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** Bars from the anchor's time to the newest bar. */
function barsFrom(all: readonly SourceBar[], from: Time): SourceBar[] {
  const start = Number(from)
  if (!Number.isFinite(start)) return []
  return all.filter((bar) => Number(bar.time) >= start)
}

/**
 * Anchored VWAP: the volume-weighted average price of every bar since the anchor, drawn as a
 * stepped line that extends live as bars arrive.
 */
export class AnchoredVwap extends Drawing {
  readonly type = 'anchored_vwap'

  requiredAnchors(): number {
    return 1
  }

  protected samples(viewport: Viewport): Point[] | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const run = barsFrom(this.bars(), anchor.time)
    if (!run.length) return null
    let cumulativePV = 0
    let cumulativeVolume = 0
    const out: Point[] = []
    for (const bar of run) {
      const volume = bar.volume ?? 0
      const typical = (bar.high + bar.low + bar.close) / 3
      cumulativePV += typical * volume
      cumulativeVolume += volume
      if (cumulativeVolume <= 0) continue
      const x = viewport.xOf(bar.time)
      const y = viewport.yOf(cumulativePV / cumulativeVolume)
      if (x !== null && y !== null) out.push({ x, y })
    }
    return out.length >= 2 ? out : null
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.samples(viewport)
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
    if (!samples) {
      if (p) {
        paintLabel(ctx, 'VWAP needs volume data', { x: p.x + 8, y: p.y - 12 }, this.style, {
          background: withAlpha('#1b1f27', 0.92),
        })
      }
      return
    }
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(samples[0].x, samples[0].y)
    for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y)
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const samples = this.samples(viewport)
    if (!samples) {
      const anchor = this.anchors[0]
      const p = anchor ? this.anchorToPixel(anchor, viewport) : null
      return !!p && Math.hypot(point.x - p.x, point.y - p.y) <= 10
    }
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < samples.length - 1; i++) {
      if (distanceToSegment(point, samples[i], samples[i + 1]) <= tolerance) return true
    }
    return false
  }
}

export type ProfileProps = {
  /** 'number' sizes the histogram by total row count; 'ticks' by price ticks per row. */
  rowsLayout: 'number' | 'ticks'
  rowSize: number
  /** 'updown' splits each row by up/down bars, 'total' paints one bar, 'delta' their difference. */
  volume: 'updown' | 'total' | 'delta'
  /** Percentage of total volume the value area highlights (0 hides it). */
  valueAreaVolume: number
  upColor: string
  downColor: string
  valueAreaUpColor: string
  valueAreaDownColor: string
  /** Histogram width as a percentage of the range box. */
  widthPercent: number
  /** Which edge the histogram grows from. */
  placement: 'left' | 'right'
  pocVisible: boolean
  pocColor: string
  pocWidth: number
  pocStyle: 'solid' | 'dashed' | 'dotted'
  vahVisible: boolean
  vahColor: string
  vahWidth: number
  vahStyle: 'solid' | 'dashed' | 'dotted'
  valVisible: boolean
  valColor: string
  valWidth: number
  valStyle: 'solid' | 'dashed' | 'dotted'
  /** Running point-of-control / value-area polylines, computed bar by bar across the range. */
  developingPoc: boolean
  developingVa: boolean
}

const PROFILE_PROPS: ProfileProps = {
  rowsLayout: 'number',
  rowSize: 24,
  volume: 'updown',
  valueAreaVolume: 70,
  upColor: '#089981',
  downColor: '#f23645',
  valueAreaUpColor: '#089981',
  valueAreaDownColor: '#f23645',
  widthPercent: 30,
  placement: 'left',
  pocVisible: true,
  pocColor: '#f23645',
  pocWidth: 2,
  pocStyle: 'solid',
  vahVisible: true,
  vahColor: '#787b86',
  vahWidth: 1,
  vahStyle: 'dashed',
  valVisible: true,
  valColor: '#787b86',
  valWidth: 1,
  valStyle: 'dashed',
  developingPoc: false,
  developingVa: false,
}

/**
 * Running POC/VAH/VAL per bar, computed incrementally over the range's fixed price extent —
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
      const tick = this.tickSize() ?? impliedTick(range)
      const rows = Math.ceil((max - min) / (tick * size))
      return Math.max(1, Math.min(400, rows))
    }
    return Math.max(1, Math.min(400, Math.round(size)))
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const span = this.span(viewport)
    if (!span) return
    const range = this.range()
    const bins = volumeProfile(range, this.rowCount(range))
    // The range frame. The profile has no generic stroke channel — frame, POC, and value-area
    // bounds paint in fixed chrome colors; the histogram colors are the tool's own props.
    ctx.save()
    ctx.strokeStyle = withAlpha('#787b86', 0.5)
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.strokeRect(span.x1, 0, span.x2 - span.x1, viewport.height)
    ctx.restore()
    if (!bins) {
      paintLabel(ctx, 'profile needs volume data', { x: (span.x1 + span.x2) / 2, y: 16 }, this.style, {
        align: 'center',
        background: withAlpha('#1b1f27', 0.92),
      })
      return
    }
    const maxVolume = Math.max(...bins.map((b) => b.volume))
    if (maxVolume <= 0) return
    const maxWidth = ((span.x2 - span.x1) * Math.max(5, Math.min(100, this.props.widthPercent))) / 100
    const fromRight = this.props.placement === 'right'
    const pocIndex = bins.reduce((best, bin, i) => (bin.volume > bins[best].volume ? i : best), 0)
    const poc = bins[pocIndex]

    // Value area: expand from the POC toward the heavier neighbor until it holds the target
    // share of total volume — the trading-profile convention.
    const vaShare = Math.max(0, Math.min(95, this.props.valueAreaVolume)) / 100
    const total = bins.reduce((s, b) => s + b.volume, 0)
    let low = pocIndex
    let high = pocIndex
    let covered = poc.volume
    while (vaShare > 0 && covered < total * vaShare && (low > 0 || high < bins.length - 1)) {
      const below = low > 0 ? bins[low - 1].volume : -1
      const above = high < bins.length - 1 ? bins[high + 1].volume : -1
      if (above >= below) {
        high++
        covered += bins[high].volume
      } else {
        low--
        covered += bins[low].volume
      }
    }

    ctx.save()
    ctx.setLineDash([])
    for (const [i, bin] of bins.entries()) {
      const y1 = viewport.yOf(bin.priceHigh)
      const y2 = viewport.yOf(bin.priceLow)
      if (y1 === null || y2 === null) continue
      const top = Math.min(y1, y2)
      const rowH = Math.max(1, Math.abs(y2 - y1) - 1)
      const inValueArea = vaShare > 0 && i >= low && i <= high
      // Structural dim outside the value area, multiplied by any alpha the color itself carries.
      const dim = inValueArea ? 0.8 : 0.3
      const upBase = inValueArea ? this.props.valueAreaUpColor : this.props.upColor
      const downBase = inValueArea ? this.props.valueAreaDownColor : this.props.downColor
      const upPaint = withAlpha(upBase, dim * alphaOf(upBase))
      const downPaint = withAlpha(downBase, dim * alphaOf(downBase))
      // Rows grow from the chosen edge; a right placement mirrors every rect.
      const rect = (offset: number, w: number) => {
        if (fromRight) ctx.fillRect(span.x2 - offset - w, top, w, rowH)
        else ctx.fillRect(span.x1 + offset, top, w, rowH)
      }
      if (this.props.volume === 'updown') {
        const upW = (bin.upVolume / maxVolume) * maxWidth
        const downW = (bin.downVolume / maxVolume) * maxWidth
        ctx.fillStyle = upPaint
        rect(0, upW)
        ctx.fillStyle = downPaint
        rect(upW, downW)
      } else if (this.props.volume === 'delta') {
        const delta = bin.upVolume - bin.downVolume
        ctx.fillStyle = delta >= 0 ? upPaint : downPaint
        rect(0, (Math.abs(delta) / maxVolume) * maxWidth)
      } else {
        ctx.fillStyle = upPaint
        rect(0, (bin.volume / maxVolume) * maxWidth)
      }
    }
    // Point of control across the whole range, plus the value-area bounds — each its own channel.
    const boundary = (y: number | null, visible: boolean, color: string, width: number, dash: 'solid' | 'dashed' | 'dotted') => {
      if (y === null || !visible) return
      ctx.strokeStyle = withAlpha(color, 0.9 * alphaOf(color))
      ctx.lineWidth = width
      ctx.setLineDash(dashPattern(dash, width))
      ctx.beginPath()
      ctx.moveTo(span.x1, y)
      ctx.lineTo(span.x2, y)
      ctx.stroke()
    }
    const p = this.props
    boundary(viewport.yOf((poc.priceLow + poc.priceHigh) / 2), p.pocVisible, p.pocColor, p.pocWidth, p.pocStyle)
    if (vaShare > 0) {
      boundary(viewport.yOf(bins[high].priceHigh), p.vahVisible, p.vahColor, p.vahWidth, p.vahStyle)
      boundary(viewport.yOf(bins[low].priceLow), p.valVisible, p.valColor, p.valWidth, p.valStyle)
    }
    // Developing lines: the running POC/VA walked bar by bar across the range.
    if (p.developingPoc || p.developingVa) {
      const levels = developingLevels(range, this.rowCount(range), vaShare)
      if (levels) {
        const polyline = (points: { time: SourceBar['time']; price: number }[], color: string) => {
          ctx.strokeStyle = withAlpha(color, 0.7 * alphaOf(color))
          ctx.lineWidth = 1
          ctx.setLineDash([2, 2])
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
        if (p.developingPoc) polyline(levels.poc, p.pocColor)
        if (p.developingVa) {
          polyline(levels.vah, p.vahColor)
          polyline(levels.val, p.valColor)
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
  /** Keep building through every bar right of the range — new bars join the profile live. */
  extendRight: boolean
}

/** Volume-by-price histogram over the two anchors' time range, drawn inside the range box. */
export class FixedRangeVolumeProfile extends VolumeProfileBase<FixedProfileProps> {
  readonly type = 'fixed_range_volume_profile'

  protected override defaultProps(): FixedProfileProps {
    return { ...PROFILE_PROPS, extendRight: false }
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
    return { ...PROFILE_PROPS }
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
