import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, strokeSegment } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** Vertical lines repeating rightward at the interval the two anchors span. */
export class CyclicLines extends Drawing {
  readonly type = 'cyclic_lines'

  requiredAnchors(): number {
    return 2
  }

  protected xs(viewport: Viewport): number[] {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return []
    const step = b.x - a.x
    if (Math.abs(step) < 2) return []
    const out: number[] = []
    for (let x = a.x; x >= -step && x <= viewport.width + Math.abs(step); x += Math.abs(step)) {
      out.push(x)
      if (out.length > 200) break
    }
    return out.filter((x) => x >= 0 && x <= viewport.width)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    applyStroke(ctx, this.style)
    for (const x of this.xs(viewport)) strokeSegment(ctx, { x, y: 0 }, { x, y: viewport.height })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.xs(viewport).some((x) => Math.abs(point.x - x) <= tolerance)
  }
}

/** Repeating semicircle arcs along the anchors' baseline — one hump per cycle. */
export class TimeCycles extends Drawing {
  readonly type = 'time_cycles'

  requiredAnchors(): number {
    return 2
  }

  protected geometry(viewport: Viewport): { y: number; startX: number; step: number } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    const step = Math.abs(b.x - a.x)
    if (step < 4) return null
    return { y: a.y, startX: Math.min(a.x, b.x), step }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const geo = this.geometry(viewport)
    if (!geo) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    let count = 0
    for (let x = geo.startX; x <= viewport.width && count < 200; x += geo.step, count++) {
      ctx.moveTo(x + geo.step, geo.y)
      ctx.arc(x + geo.step / 2, geo.y, geo.step / 2, 0, Math.PI, true)
    }
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const geo = this.geometry(viewport)
    if (!geo) return false
    if (point.x < geo.startX) return false
    const radius = geo.step / 2
    const within = (point.x - geo.startX) % geo.step
    const cx = point.x - within + radius
    const distance = Math.hypot(point.x - cx, point.y - geo.y)
    return point.y <= geo.y + 2 && Math.abs(distance - radius) <= hitTolerance(this.style.lineWidth)
  }
}

/** Sine wave: the anchors set half a period and the amplitude. */
export class SineLine extends Drawing {
  readonly type = 'sine_line'

  requiredAnchors(): number {
    return 2
  }

  protected samples(viewport: Viewport): Point[] | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    const half = b.x - a.x
    if (Math.abs(half) < 2) return null
    const amplitude = b.y - a.y
    const period = Math.abs(half) * 2
    const out: Point[] = []
    for (let x = 0; x <= viewport.width; x += Math.max(2, period / 48)) {
      const phase = ((x - a.x) / half) * Math.PI * 0.5
      out.push({ x, y: a.y + Math.sin(phase) * amplitude })
    }
    return out
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const samples = this.samples(viewport)
    if (!samples || samples.length < 2) return
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(samples[0].x, samples[0].y)
    for (let i = 1; i < samples.length; i++) ctx.lineTo(samples[i].x, samples[i].y)
    ctx.stroke()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const samples = this.samples(viewport)
    if (!samples) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < samples.length - 1; i++) {
      if (distanceToSegment(point, samples[i], samples[i + 1]) <= tolerance) return true
    }
    return false
  }
}
