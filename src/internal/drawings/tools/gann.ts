import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, extendSegment } from '../core/geometry'
import { applyStroke, paintLabel, strokeSegment, withAlpha } from '../render/canvas'
import { boxDivisions, levelBox, paintBoxLabels, priceY, timeX, upgradeBoxLevels, type BoxLevelsProps, type LevelBox } from './boxLevels'
import { fibLevelColor, type FibLevel } from './fibonacci'

export type GannProps = {
  levels: FibLevel[]
  showLabels: boolean
  background: boolean
}

const BOX_FRACTIONS: FibLevel[] = [
  { value: 0, visible: true },
  { value: 0.25, visible: true },
  { value: 0.382, visible: true },
  { value: 0.5, visible: true },
  { value: 0.618, visible: true },
  { value: 0.75, visible: true },
  { value: 1, visible: true },
]

/** The classic fan ratios (price units per time unit). */
const FAN_RATIOS = [8, 4, 3, 2, 1, 1 / 2, 1 / 3, 1 / 4, 1 / 8]

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A gann box: price divisions across the box and time divisions down it, each in its own color, the
 *  bands between price divisions and between time divisions each switched and faded on its own, the
 *  box's angles in a color of their own, and each division's labels. */
export type GannBoxProps = BoxLevelsProps & {
  fillPriceBackground: boolean
  priceBackgroundOpacity: number
  fillTimeBackground: boolean
  timeBackgroundOpacity: number
  angles: boolean
  anglesColor: string
}

/** Box spanned by two corners with ratio lines dividing both axes. */
export class GannBox extends Drawing<GannBoxProps> {
  readonly type: string = 'gannbox'

  protected override defaultProps(): GannBoxProps {
    return {
      priceLevels: boxDivisions(),
      timeLevels: boxDivisions(),
      showLeftLabels: true,
      showRightLabels: true,
      showTopLabels: true,
      showBottomLabels: true,
      fillPriceBackground: true,
      priceBackgroundOpacity: 0.2,
      fillTimeBackground: true,
      timeBackgroundOpacity: 0.2,
      angles: false,
      anglesColor: '#9c9c9c',
      reverse: false,
    }
  }

  protected override upgradeProps(props: Partial<GannBoxProps>): Partial<GannBoxProps> {
    const saved = upgradeBoxLevels(props) as Partial<GannBoxProps> & { background?: unknown; showLabels?: unknown }
    const out: Record<string, unknown> = {}
    const defaults = this.defaultProps()
    for (const key of Object.keys(defaults)) if (key in saved) out[key] = (saved as Record<string, unknown>)[key]
    // A box saved with one set of levels and one background divided both sides by those levels and
    // shaded the whole box: it reads them as its price and time divisions and both its bands.
    if (Array.isArray(saved.priceLevels) && !('timeLevels' in saved)) out.timeLevels = saved.priceLevels.map((l) => ({ ...l }))
    if (typeof saved.background === 'boolean' && !('fillPriceBackground' in saved)) out.fillPriceBackground = out.fillTimeBackground = saved.background
    if (typeof saved.showLabels === 'boolean' && !('showLeftLabels' in saved)) out.showLeftLabels = out.showRightLabels = out.showTopLabels = out.showBottomLabels = saved.showLabels
    return out as Partial<GannBoxProps>
  }

  requiredAnchors(): number {
    return 2
  }

  protected box(viewport: Viewport): LevelBox | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return levelBox(a, b, this.props.reverse)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const box = this.box(viewport)
    if (!box) return
    const { props } = this
    // The bands: between neighbouring price divisions across the box, and between neighbouring time
    // divisions down it, each band in the color of the division that closes it.
    const bands = (levels: FibLevel[], opacity: number, at: (v: number) => number, rect: (p: number, q: number) => [number, number, number, number]): void => {
      const shown = levels.map((level, i) => ({ level, color: fibLevelColor(level, i) })).filter((e) => e.level.visible).sort((p, q) => p.level.value - q.level.value)
      for (let i = 1; i < shown.length; i++) {
        ctx.fillStyle = withAlpha(shown[i]!.color, opacity)
        ctx.fillRect(...rect(at(shown[i - 1]!.level.value), at(shown[i]!.level.value)))
      }
    }
    if (props.fillPriceBackground && props.priceBackgroundOpacity > 0) bands(props.priceLevels, props.priceBackgroundOpacity, (v) => priceY(box, v), (p, q) => [box.left, Math.min(p, q), box.right - box.left, Math.abs(q - p)])
    if (props.fillTimeBackground && props.timeBackgroundOpacity > 0) bands(props.timeLevels, props.timeBackgroundOpacity, (v) => timeX(box, v), (p, q) => [Math.min(p, q), box.top, Math.abs(q - p), box.bottom - box.top])
    props.priceLevels.forEach((level, i) => {
      if (!level.visible) return
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: fibLevelColor(level, i) })
      strokeSegment(ctx, { x: box.left, y: priceY(box, level.value) }, { x: box.right, y: priceY(box, level.value) })
      ctx.restore()
    })
    props.timeLevels.forEach((level, i) => {
      if (!level.visible) return
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: fibLevelColor(level, i) })
      strokeSegment(ctx, { x: timeX(box, level.value), y: box.top }, { x: timeX(box, level.value), y: box.bottom })
      ctx.restore()
    })
    if (props.angles) {
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: props.anglesColor })
      strokeSegment(ctx, { x: box.left, y: box.top }, { x: box.right, y: box.bottom })
      strokeSegment(ctx, { x: box.left, y: box.bottom }, { x: box.right, y: box.top })
      ctx.restore()
    }
    paintBoxLabels(ctx, this.style, props, box, fibLevelColor)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    if (!box) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    const inX = point.x >= box.left - tolerance && point.x <= box.right + tolerance
    const inY = point.y >= box.top - tolerance && point.y <= box.bottom + tolerance
    if (!inX || !inY) return false
    if (this.props.priceLevels.some((l) => l.visible && Math.abs(point.y - priceY(box, l.value)) <= tolerance)) return true
    if (this.props.timeLevels.some((l) => l.visible && Math.abs(point.x - timeX(box, l.value)) <= tolerance)) return true
    if (!this.props.angles) return false
    return distanceToSegment(point, { x: box.left, y: box.top }, { x: box.right, y: box.bottom }) <= tolerance || distanceToSegment(point, { x: box.left, y: box.bottom }, { x: box.right, y: box.top }) <= tolerance
  }
}

/** A box spanned by two corners with ratio lines dividing both axes, the body of the gann squares. */
export abstract class GannLevelBox extends Drawing<GannProps> {

  protected override defaultProps(): GannProps {
    return { levels: BOX_FRACTIONS.map((l) => ({ ...l })), showLabels: true, background: true }
  }

  requiredAnchors(): number {
    return 2
  }

  protected frame(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    return { a, b }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const f = this.frame(viewport)
    if (!f) return
    const { a, b } = f
    const visible = this.props.levels.filter((l) => l.visible)
    if (this.props.background) {
      ctx.save()
      ctx.fillStyle = withAlpha(this.style.lineColor, 0.05)
      ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
      ctx.restore()
    }
    for (const [i, level] of visible.entries()) {
      const color = fibLevelColor(level, i)
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = color
      // Horizontal division…
      const y = a.y + (b.y - a.y) * level.value
      strokeSegment(ctx, { x: a.x, y }, { x: b.x, y })
      // …and the matching vertical division.
      const x = a.x + (b.x - a.x) * level.value
      strokeSegment(ctx, { x, y: a.y }, { x, y: b.y })
      ctx.restore()
      if (this.props.showLabels) {
        paintLabel(ctx, String(level.value), { x: Math.min(a.x, b.x) - 6, y }, { ...this.style, textColor: color }, { align: 'right' })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    if (!f) return false
    const { a, b } = f
    const tolerance = hitTolerance(this.style.lineWidth)
    const inX = point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance
    const inY = point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance
    if (!inX || !inY) return false
    for (const level of this.props.levels) {
      if (!level.visible) continue
      const y = a.y + (b.y - a.y) * level.value
      if (inX && Math.abs(point.y - y) <= tolerance) return true
      const x = a.x + (b.x - a.x) * level.value
      if (inY && Math.abs(point.x - x) <= tolerance) return true
    }
    return false
  }
}

/** Gann square: the box plus its corner-to-corner diagonals. */
export class GannSquare extends GannLevelBox {
  override readonly type = 'gannbox_square'

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    super.paint(ctx, viewport)
    const f = this.frame(viewport)
    if (!f) return
    const { a, b } = f
    ctx.save()
    applyStroke(ctx, this.style)
    strokeSegment(ctx, a, b)
    strokeSegment(ctx, { x: a.x, y: b.y }, { x: b.x, y: a.y })
    ctx.restore()
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    if (super.testHit(point, viewport)) return true
    const f = this.frame(viewport)
    if (!f) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return (
      distanceToSegment(point, f.a, f.b) <= tolerance ||
      distanceToSegment(point, { x: f.a.x, y: f.b.y }, { x: f.b.x, y: f.a.y }) <= tolerance
    )
  }
}

/** Gann square from a single origin: a square grid sized by one price/time unit. */
export class GannSquareFixed extends GannLevelBox {
  override readonly type = 'gannbox_fixed'

  override requiredAnchors(): number {
    return 2
  }

  protected override frame(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    // Fixed variant squares the frame: the larger drag axis sets both dimensions.
    const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    return {
      a,
      b: { x: a.x + Math.sign(b.x - a.x || 1) * size, y: a.y + Math.sign(b.y - a.y || 1) * size },
    }
  }
}

/** The 1x1…8x1 fan rays from an origin, scaled by the drag vector's unit. */
export class GannFan extends Drawing<GannProps> {
  readonly type = 'gannbox_fan'

  protected override defaultProps(): GannProps {
    return {
      levels: FAN_RATIOS.map((value) => ({ value, visible: true })),
      showLabels: true,
      background: false,
    }
  }

  requiredAnchors(): number {
    return 2
  }

  protected rays(viewport: Viewport): { ratio: number; color: string; a: Point; b: Point }[] {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2 || p1.x === p2.x || p1.y === p2.y) return []
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    return this.props.levels
      .filter((l) => l.visible)
      .map((l, i) => {
        const through = { x: p1.x + dx, y: p1.y + dy * l.value }
        const seg = extendSegment(p1, through, viewport.width, viewport.height, false, true)
        return { ratio: l.value, color: fibLevelColor(l, i), a: p1, b: seg.b }
      })
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    for (const ray of this.rays(viewport)) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.strokeStyle = ray.color
      strokeSegment(ctx, ray.a, ray.b)
      ctx.restore()
      if (this.props.showLabels) {
        const label = ray.ratio >= 1 ? `${ray.ratio}/1` : `1/${Math.round(1 / ray.ratio)}`
        paintLabel(ctx, label, { x: ray.b.x - 8, y: ray.b.y }, { ...this.style, textColor: ray.color }, { align: 'right' })
      }
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    return this.rays(viewport).some((ray) => distanceToSegment(point, ray.a, ray.b) <= tolerance)
  }
}
