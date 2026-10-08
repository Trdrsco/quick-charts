import type { Anchor, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import { applyStroke, fontOf, withAlpha } from '../render/canvas'

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A shaded pattern's background switch: off, the shaded legs keep their fill's color and opacity
 *  for when it is switched back on. */
export type PatternProps = {
  fillBackground: boolean
}

/**
 * Shared body of the pattern/wave tools: a polyline through every anchor with a lettered (or
 * numbered) pill at each vertex, the letters in the drawing's label ink, size, weight and slant.
 * Subclasses supply the label sequence and any extra ink. A pattern is read by its letters and
 * carries no words of its own.
 */
export abstract class LabeledPolyline<P extends Record<string, unknown> = Record<string, never>> extends Drawing<P> {
  protected abstract labels(): readonly string[]

  /** Words a saved pattern carries are not read: the pattern's letters are its words. */
  protected override upgradeProps(props: Partial<P>): Partial<P> {
    if (!('text' in props)) return props
    const { text: _text, ...rest } = props as Partial<P> & { text?: unknown }
    void _text
    return rest as Partial<P>
  }

  protected points(viewport: Viewport): (Point | null)[] {
    return this.anchorPixels(viewport)
  }

  /** Whether the shaded legs paint: while the background is switched on and its fill shows. */
  protected shaded(): boolean {
    return (this.props as { fillBackground?: boolean }).fillBackground !== false && this.style.fillOpacity > 0
  }

  /** Whether the line through the vertices paints: a wave count can stand on its labels alone. */
  protected showsLine(): boolean {
    return true
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.points(viewport).filter((p): p is Point => !!p)
    if (points.length < 2) return
    if (this.showsLine()) {
      applyStroke(ctx, this.style)
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
      ctx.stroke()
    }
    this.paintExtras(ctx, points, viewport)
    this.paintLabels(ctx, points)
  }

  /** The placement preview is the pattern itself: the zigzag grows labeled leg by leg. */
  override paintConstruction(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this.paint(ctx, viewport)
  }

  protected paintExtras(_ctx: CanvasRenderingContext2D, _points: Point[], _viewport: Viewport): void {}

  /** Each vertex's letter in a pill that grows with the letters' size, standing off the line on the
   *  side away from the leg that reaches it. */
  protected paintLabels(ctx: CanvasRenderingContext2D, points: Point[]): void {
    const labels = this.labels()
    const radius = Math.max(9, Math.round(this.style.fontSize * 0.75))
    ctx.save()
    ctx.setLineDash([])
    ctx.font = fontOf(this.style)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < points.length && i < labels.length; i++) {
      if (!labels[i]) continue // an unlabeled vertex (a pattern's starting point)
      const p = points[i]
      // Place the pill away from the line: above when the vertex is a local high, below otherwise.
      const prev = points[i - 1] ?? points[i + 1]
      const dy = prev && prev.y > p.y ? -(radius + 5) : radius + 5
      const cy = p.y + dy
      ctx.fillStyle = withAlpha('#1b1f27', 0.95)
      ctx.beginPath()
      ctx.arc(p.x, cy, radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = this.style.lineColor
      ctx.lineWidth = 1
      ctx.stroke()
      // The letters take the text channel, so their color and type are set apart from the line.
      ctx.fillStyle = this.style.textColor
      ctx.fillText(labels[i], p.x, cy + 0.5)
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const points = this.points(viewport).filter((p): p is Point => !!p)
    const tolerance = hitTolerance(this.style.lineWidth)
    for (let i = 0; i < points.length - 1; i++) {
      if (distanceToSegment(point, points[i], points[i + 1]) <= tolerance) return true
    }
    return false
  }
}

/** Fill the triangle spanned by three points with the drawing's background channel. */
function fillTriangle(
  ctx: CanvasRenderingContext2D,
  style: { fillColor: string; fillOpacity: number },
  a: Point,
  b: Point,
  c: Point,
): void {
  ctx.save()
  ctx.fillStyle = withAlpha(style.fillColor, style.fillOpacity)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(c.x, c.y)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** Five-point harmonic (X A B C D) with the two classic triangles shaded. */
export class XabcdPattern extends LabeledPolyline<PatternProps> {
  readonly type: string = 'xabcd_pattern'

  protected override defaultProps(): PatternProps {
    return { fillBackground: true }
  }

  requiredAnchors(): number {
    return 5
  }

  protected labels(): readonly string[] {
    return ['X', 'A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (!this.shaded()) return
    if (points.length >= 3) fillTriangle(ctx, this.style, points[0], points[1], points[2])
    if (points.length >= 5) fillTriangle(ctx, this.style, points[2], points[3], points[4])
  }
}

/** Cypher: same five-point construction, its own identity for defaults/recognition. */
export class CypherPattern extends XabcdPattern {
  override readonly type = 'cypher_pattern'
}

/**
 * Three drives: a start point, three with-trend drives (1, 2, 3) separated by two retracements (A,
 * C), and the reversal that completes the pattern. Symmetry of the drives and retracements is the
 * pattern's whole premise; the tool labels the swing points.
 */
export class ThreeDrivesPattern extends LabeledPolyline {
  readonly type = 'three_drives'

  requiredAnchors(): number {
    return 7
  }

  /** A three drives saved on six points, without the reversal, completes with one: as far past the
   *  third drive as the second retracement ran before it, back to that retracement's price. */
  protected override upgradeAnchors(anchors: Anchor[]): Anchor[] {
    if (anchors.length !== 6) return anchors
    const [c, drive] = [anchors[4]!, anchors[5]!]
    if (typeof c.time !== 'number' || typeof drive.time !== 'number') return anchors
    return [...anchors, { time: (drive.time + (drive.time - c.time)) as Anchor['time'], price: c.price }]
  }

  protected labels(): readonly string[] {
    return ['', '1', 'A', '2', 'C', '3', '']
  }
}

/** Four-point AB=CD pattern with its two guide diagonals. */
export class AbcdPattern extends LabeledPolyline {
  readonly type = 'abcd_pattern'

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length >= 4) {
      // The AC / BD guide diagonals, dashed.
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.setLineDash([4, 4])
      ctx.globalAlpha = 0.55
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      ctx.lineTo(points[2].x, points[2].y)
      ctx.moveTo(points[1].x, points[1].y)
      ctx.lineTo(points[3].x, points[3].y)
      ctx.stroke()
      ctx.restore()
    }
  }
}

/** Four-point triangle pattern: the zigzag plus its two converging boundary lines. */
export class TrianglePattern extends LabeledPolyline<PatternProps> {
  readonly type = 'triangle_pattern'

  protected override defaultProps(): PatternProps {
    return { fillBackground: true }
  }

  requiredAnchors(): number {
    return 4
  }

  protected labels(): readonly string[] {
    return ['A', 'B', 'C', 'D']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 4) return
    // Boundaries connect the alternating swing points (A→C and B→D), extended to D's time.
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    ctx.lineTo(points[2].x, points[2].y)
    ctx.moveTo(points[1].x, points[1].y)
    ctx.lineTo(points[3].x, points[3].y)
    ctx.stroke()
    ctx.restore()
    if (this.shaded()) fillTriangle(ctx, this.style, points[0], points[1], points[2])
  }
}

/** Seven-point head & shoulders with the neckline and shaded shoulders/head. */
export class HeadAndShoulders extends LabeledPolyline<PatternProps> {
  readonly type = 'head_and_shoulders'

  protected override defaultProps(): PatternProps {
    return { fillBackground: true }
  }

  requiredAnchors(): number {
    return 7
  }

  protected labels(): readonly string[] {
    // Left shoulder, head, right shoulder over the classic seven pivots.
    return ['', 'LS', '', 'H', '', 'RS', '']
  }

  protected override paintExtras(ctx: CanvasRenderingContext2D, points: Point[]): void {
    if (points.length < 7) return
    // Neckline through the two troughs framing the head, extended across the pattern.
    ctx.save()
    applyStroke(ctx, this.style)
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[2].y + (points[0].x - points[2].x) * ((points[4].y - points[2].y) / ((points[4].x - points[2].x) || 1)))
    ctx.lineTo(points[6].x, points[2].y + (points[6].x - points[2].x) * ((points[4].y - points[2].y) / ((points[4].x - points[2].x) || 1)))
    ctx.stroke()
    ctx.restore()
    if (!this.shaded()) return
    fillTriangle(ctx, this.style, points[0], points[1], points[2])
    fillTriangle(ctx, this.style, points[2], points[3], points[4])
    fillTriangle(ctx, this.style, points[4], points[5], points[6])
  }
}
