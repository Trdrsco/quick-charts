import type { DrawingStyle, LineStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, midpoint } from '../core/geometry'
import { applyStroke, strokeSegment, withAlpha } from '../render/canvas'
import { fibLevelColor, type FibLevel } from './fibonacci'

/** One pair of fork lines set at ±value of the fork's half-width (1 = the tines through p2/p3), in
 *  its own color, and its own width and style where it carries them. */
export type ForkLevel = FibLevel

export type ForkVariant = 'original' | 'schiff' | 'modified_schiff' | 'inside'

export type PitchforkProps = {
  /** Which fork construction the median uses, switchable in place. */
  variant: ForkVariant
  /** Extend all lines back past the fork's start as well as onward. */
  extendLines: boolean
  /** The median's own stroke. */
  medianColor: string
  medianWidth: number
  medianStyle: LineStyle
  levels: ForkLevel[]
  /** The bands between neighbouring line pairs, each in the color of the outer pair, at
   *  `backgroundOpacity`. Switched off, the bands keep their opacity for when they return. */
  fillBackground: boolean
  backgroundOpacity: number
  /** The bands in the drawing's stroke color instead, the outermost at 9% and each one inward 3%
   *  more. */
  shadedBands: boolean
}

/** The nine line pairs a pitchfork offers: the half and the tines shown, seven more to switch on. */
const FORK_LEVELS: readonly [number, string, boolean][] = [
  [0.25, '#ffb74d', false],
  [0.382, '#81c784', false],
  [0.5, '#089981', true],
  [0.618, '#089981', false],
  [0.75, '#00bcd4', false],
  [1, '#2962ff', true],
  [1.5, '#9c27b0', false],
  [1.75, '#e91e63', false],
  [2, '#f77c80', false],
]

interface ForkGeometry {
  /** Where the median line begins (the fork's handle end). */
  origin: Point
  /** Midpoint of the p2→p3 segment, which every level line is placed from. */
  mid: Point
  /** Direction of all fork lines (origin → mid). */
  dir: Point
  /** Half-width vector (mid → p3); level k passes through mid ± k·halfWidth. */
  halfWidth: Point
}

/** A level's stroke: its own color, and its own width and style where it carries them. */
const levelStroke = (style: Readonly<DrawingStyle>, level: ForkLevel, color: string): DrawingStyle => ({
  ...style,
  lineColor: color,
  lineWidth: level.width ?? style.lineWidth,
  lineStyle: level.style ?? style.lineStyle,
})

/**
 * The pitchfork family. All variants share one parametric fork (a median through `mid(p2,p3)`
 * plus level lines offset by multiples of the half-width) and differ only in where the median
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
      medianColor: '#f23645',
      medianWidth: 2,
      medianStyle: 'solid',
      levels: FORK_LEVELS.map(([value, color, visible]) => ({ value, visible, color, width: 2, style: 'solid' })),
      fillBackground: true,
      backgroundOpacity: 0.2,
      shadedBands: false,
    }
  }

  /** A fork saved with its background switch as `background` reads it as `fillBackground`. */
  protected override upgradeProps(props: Partial<PitchforkProps>): Partial<PitchforkProps> {
    const saved = props as Partial<PitchforkProps> & { background?: unknown }
    if (!('background' in saved)) return props
    const { background, ...rest } = saved
    return 'fillBackground' in rest ? rest : { ...rest, fillBackground: background !== false }
  }

  /** A format-2 fork drew its median and its lines in its own stroke, a line in its own color where
   *  it carried one, and its bands in that stroke's color shaded by depth. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    const { lineColor, lineWidth, lineStyle } = this._style
    const levels = this._props.levels.map((l): ForkLevel => ({ ...l, color: l.color ?? lineColor, width: lineWidth, style: lineStyle }))
    this._props = { ...this._props, medianColor: lineColor, medianWidth: lineWidth, medianStyle: lineStyle, levels, shadedBands: true }
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

  /** The visible line pairs, closest to the median first, each with its color. */
  protected shownLevels(): { level: ForkLevel; color: string }[] {
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible && e.level.value > 0)
      .sort((p, q) => p.level.value - q.level.value)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const fork = this.fork(viewport)
    if (!fork) return
    const shown = this.shownLevels()

    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      // Fill between each pair of neighbouring lines on either side of the median, in the color of
      // the outer one.
      ctx.save()
      for (const sign of [1, -1]) {
        let inner = 0
        for (const [i, entry] of shown.entries()) {
          ctx.fillStyle = this.props.shadedBands ? withAlpha(this.style.lineColor, 0.06 + 0.03 * (shown.length - i)) : withAlpha(entry.color, this.props.backgroundOpacity)
          const lineA = this.lineThrough(fork, this.levelPoint(fork, inner * sign), viewport)
          const lineB = this.lineThrough(fork, this.levelPoint(fork, entry.level.value * sign), viewport)
          ctx.beginPath()
          ctx.moveTo(lineA.a.x, lineA.a.y)
          ctx.lineTo(lineA.b.x, lineA.b.y)
          ctx.lineTo(lineB.b.x, lineB.b.y)
          ctx.lineTo(lineB.a.x, lineB.a.y)
          ctx.closePath()
          ctx.fill()
          inner = entry.level.value
        }
      }
      ctx.restore()
    }

    // Level lines above and below, each pair in its own stroke.
    for (const entry of shown) {
      ctx.save()
      applyStroke(ctx, levelStroke(this.style, entry.level, entry.color))
      for (const sign of [1, -1]) {
        const line = this.lineThrough(fork, this.levelPoint(fork, entry.level.value * sign), viewport)
        strokeSegment(ctx, line.a, line.b)
      }
      ctx.restore()
    }
    // The median, in its own stroke: from the origin to mid, then onward along the fork.
    ctx.save()
    applyStroke(ctx, { ...this.style, lineColor: this.props.medianColor, lineWidth: this.props.medianWidth, lineStyle: this.props.medianStyle })
    const median = this.lineThrough(fork, fork.mid, viewport)
    strokeSegment(ctx, this.props.extendLines ? median.a : fork.origin, median.b)
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const fork = this.fork(viewport)
    if (!fork) return false
    const median = this.lineThrough(fork, fork.mid, viewport)
    if (distanceToSegment(point, this.props.extendLines ? median.a : fork.origin, median.b) <= Math.max(6, this.props.medianWidth / 2 + 4)) return true
    for (const { level } of this.shownLevels()) {
      const tolerance = Math.max(6, (level.width ?? this.style.lineWidth) / 2 + 4)
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
