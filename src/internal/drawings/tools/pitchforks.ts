import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, midpoint } from '../core/geometry'
import { applyStroke, strokeSegment, withAlpha } from '../render/canvas'

/** One additional line set at ±value of the fork's half-width (1 = the tines through p2/p3). */
export type ForkLevel = {
  value: number
  visible: boolean
  /** Per-set line color; the drawing's stroke color when omitted. */
  color?: string
}

export type ForkVariant = 'original' | 'schiff' | 'modified_schiff' | 'inside'

export type PitchforkProps = {
  /** Which fork construction the median uses — switchable in place. */
  variant: ForkVariant
  /** Extend all lines left as well as right. */
  extendLines: boolean
  levels: ForkLevel[]
  /** Background fill between visible line pairs. */
  background: boolean
}

const DEFAULT_LEVELS: ForkLevel[] = [
  { value: 0.25, visible: false },
  { value: 0.5, visible: true },
  { value: 0.75, visible: false },
  { value: 1, visible: true },
  { value: 1.5, visible: false },
  { value: 2, visible: false },
]

interface ForkGeometry {
  /** Where the median line begins (the fork's handle end). */
  origin: Point
  /** Midpoint of the p2→p3 segment — every level line is anchored relative to it. */
  mid: Point
  /** Direction of all fork lines (origin → mid). */
  dir: Point
  /** Half-width vector (mid → p3); level k passes through mid ± k·halfWidth. */
  halfWidth: Point
}

/**
 * The pitchfork family. All variants share one parametric fork — a median through `mid(p2,p3)`
 * plus level lines offset by multiples of the half-width — and differ only in where the median
 * originates.
 */
export class Pitchfork extends Drawing<PitchforkProps> {
  readonly type: string = 'pitchfork'

  /** The construction seeded at creation; the prop switches it in place afterwards. */
  protected defaultVariant(): ForkVariant {
    return 'original'
  }

  protected override defaultProps(): PitchforkProps {
    return {
      variant: this.defaultVariant(),
      extendLines: false,
      levels: DEFAULT_LEVELS.map((l) => ({ ...l })),
      background: true,
    }
  }

  requiredAnchors(): number {
    return 3
  }

  protected fork(viewport: Viewport): ForkGeometry | null {
    const [p1, p2, p3] = this.anchorPixels(viewport)
    if (!p1 || !p2 || !p3) return null
    const mid = midpoint(p2, p3)
    const variant = this.props.variant
    const origin =
      variant === 'schiff'
        ? midpoint(p1, p2)
        : variant === 'modified_schiff'
          ? { x: p1.x, y: (p1.y + p2.y) / 2 }
          : variant === 'inside'
            ? mid
            : p1
    // The inside fork has no handle: it emanates from the tine segment, aimed away from p1.
    const dir = variant === 'inside' ? { x: mid.x - p1.x, y: mid.y - p1.y } : { x: mid.x - origin.x, y: mid.y - origin.y }
    if (dir.x === 0 && dir.y === 0) return null
    return { origin, mid, dir, halfWidth: { x: p3.x - mid.x, y: p3.y - mid.y } }
  }

  /** A fork line through `at`, running along the fork direction to the pane edge(s). */
  protected lineThrough(fork: ForkGeometry, at: Point, viewport: Viewport): { a: Point; b: Point } {
    // Scale the direction so the far end always clears the pane regardless of zoom.
    const reach = (viewport.width + viewport.height) / Math.hypot(fork.dir.x, fork.dir.y)
    const b = { x: at.x + fork.dir.x * reach, y: at.y + fork.dir.y * reach }
    const a = this.props.extendLines ? { x: at.x - fork.dir.x * reach, y: at.y - fork.dir.y * reach } : at
    return { a, b }
  }

  protected levelPoint(fork: ForkGeometry, value: number): Point {
    return { x: fork.mid.x + fork.halfWidth.x * value, y: fork.mid.y + fork.halfWidth.y * value }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const fork = this.fork(viewport)
    if (!fork) return
    const visible = this.props.levels.filter((l) => l.visible && l.value > 0)

    if (this.props.background && visible.length > 0) {
      // Fill between each adjacent pair of visible level lines, mirrored above and below.
      const sorted = [...visible].sort((a, b) => a.value - b.value)
      const bands: [number, number][] = []
      let prev = 0
      for (const l of sorted) {
        bands.push([prev, l.value])
        prev = l.value
      }
      ctx.save()
      for (let i = 0; i < bands.length; i++) {
        const [from, to] = bands[i]
        const alpha = 0.06 + 0.03 * (bands.length - i)
        ctx.fillStyle = withAlpha(this.style.lineColor, alpha)
        for (const sign of [1, -1]) {
          const lineA = this.lineThrough(fork, this.levelPoint(fork, from * sign), viewport)
          const lineB = this.lineThrough(fork, this.levelPoint(fork, to * sign), viewport)
          ctx.beginPath()
          ctx.moveTo(lineA.a.x, lineA.a.y)
          ctx.lineTo(lineA.b.x, lineA.b.y)
          ctx.lineTo(lineB.b.x, lineB.b.y)
          ctx.lineTo(lineB.a.x, lineB.a.y)
          ctx.closePath()
          ctx.fill()
        }
      }
      ctx.restore()
    }

    applyStroke(ctx, this.style)
    // Median: handle from the origin to mid, then onward along the fork.
    const median = this.lineThrough(fork, fork.mid, viewport)
    strokeSegment(ctx, this.props.extendLines ? median.a : fork.origin, median.b)
    // Level lines above and below, each set in its own color when one is chosen.
    for (const level of visible) {
      ctx.save()
      applyStroke(ctx, this.style)
      if (level.color) ctx.strokeStyle = level.color
      for (const sign of [1, -1]) {
        const line = this.lineThrough(fork, this.levelPoint(fork, level.value * sign), viewport)
        strokeSegment(ctx, line.a, line.b)
      }
      ctx.restore()
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const fork = this.fork(viewport)
    if (!fork) return false
    const tolerance = Math.max(6, this.style.lineWidth / 2 + 4)
    const median = this.lineThrough(fork, fork.mid, viewport)
    if (distanceToSegment(point, this.props.extendLines ? median.a : fork.origin, median.b) <= tolerance) return true
    for (const level of this.props.levels) {
      if (!level.visible || level.value <= 0) continue
      for (const sign of [1, -1]) {
        const line = this.lineThrough(fork, this.levelPoint(fork, level.value * sign), viewport)
        if (distanceToSegment(point, line.a, line.b) <= tolerance) return true
      }
    }
    return false
  }
}

/** Median origin at the full midpoint (time and price) of p1→p2. */
export class SchiffPitchfork extends Pitchfork {
  override readonly type = 'schiff_pitchfork'

  protected override defaultVariant(): ForkVariant {
    return 'schiff'
  }
}

/** Median origin shifted half the p1→p2 price distance, at p1's time. */
export class ModifiedSchiffPitchfork extends Pitchfork {
  override readonly type = 'schiff_pitchfork_modified'

  protected override defaultVariant(): ForkVariant {
    return 'modified_schiff'
  }
}

/** No handle: the fork emanates from the p2→p3 segment itself, aimed away from p1. */
export class InsidePitchfork extends Pitchfork {
  override readonly type = 'inside_pitchfork'

  protected override defaultVariant(): ForkVariant {
    return 'inside'
  }
}
