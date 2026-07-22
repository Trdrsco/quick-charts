import type { Time } from 'lightweight-charts'

import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barsInRange, volumeProfile } from '../core/bars'
import type { SourceBar } from '../core/bars'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, paintLabel, withAlpha } from '../render/canvas'

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
  rows: number
  /** Share of total volume the value area covers (VAH/VAL bounds); 0 hides it. */
  valueArea: number
}

/** Volume-by-price histogram over the two anchors' time range, drawn inside the range box. */
export class FixedRangeVolumeProfile extends Drawing<ProfileProps> {
  readonly type: string = 'fixed_range_volume_profile'

  protected override defaultProps(): ProfileProps {
    return { rows: 24, valueArea: 0.7 }
  }

  requiredAnchors(): number {
    return 2
  }

  protected range(): SourceBar[] {
    const [a, b] = this.anchors
    if (!a || !b) return []
    return barsInRange(this.bars(), a.time, b.time)
  }

  protected span(viewport: Viewport): { x1: number; x2: number } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    return { x1: Math.min(pa.x, pb.x), x2: Math.max(pa.x, pb.x) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const span = this.span(viewport)
    if (!span) return
    const bins = volumeProfile(this.range(), Math.max(4, Math.min(80, this.props.rows)))
    // The range frame.
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.5
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
    const maxWidth = (span.x2 - span.x1) * 0.85
    const pocIndex = bins.reduce((best, bin, i) => (bin.volume > bins[best].volume ? i : best), 0)
    const poc = bins[pocIndex]

    // Value area: expand from the POC toward the heavier neighbor until it holds the target
    // share of total volume — the trading-profile convention.
    const vaShare = Math.max(0, Math.min(0.95, this.props.valueArea))
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
      const width = (bin.volume / maxVolume) * maxWidth
      const inValueArea = vaShare > 0 && i >= low && i <= high
      ctx.fillStyle = withAlpha(this.style.lineColor, bin === poc ? 0.55 : inValueArea ? 0.38 : 0.2)
      ctx.fillRect(span.x1, Math.min(y1, y2), width, Math.max(1, Math.abs(y2 - y1) - 1))
    }
    // Point of control across the whole range, plus the value-area bounds.
    const pocY = viewport.yOf((poc.priceLow + poc.priceHigh) / 2)
    if (pocY !== null) {
      ctx.strokeStyle = withAlpha(this.style.lineColor, 0.9)
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(span.x1, pocY)
      ctx.lineTo(span.x2, pocY)
      ctx.stroke()
    }
    if (vaShare > 0) {
      const vahY = viewport.yOf(bins[high].priceHigh)
      const valY = viewport.yOf(bins[low].priceLow)
      ctx.strokeStyle = withAlpha(this.style.lineColor, 0.6)
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      for (const y of [vahY, valY]) {
        if (y === null) continue
        ctx.beginPath()
        ctx.moveTo(span.x1, y)
        ctx.lineTo(span.x2, y)
        ctx.stroke()
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

/** Volume profile from the anchor's time to the newest bar. */
export class AnchoredVolumeProfile extends FixedRangeVolumeProfile {
  override readonly type = 'anchored_volume_profile'

  override requiredAnchors(): number {
    return 1
  }

  protected override range(): SourceBar[] {
    const anchor = this.anchors[0]
    if (!anchor) return []
    return barsFrom(this.bars(), anchor.time)
  }

  protected override span(viewport: Viewport): { x1: number; x2: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const x = viewport.xOf(anchor.time)
    if (x === null) return null
    return { x1: x, x2: viewport.width }
  }
}
