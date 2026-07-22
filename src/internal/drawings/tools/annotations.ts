import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment } from '../core/geometry'
import {
  applyStroke,
  fillPaint,
  formatPrice,
  measureTextBlock,
  paintTextBlock,
  withAlpha,
} from '../render/canvas'

export type TextProps = {
  text: string
}

/** Free text blocks additionally carry their alignment. */
export type TextBlockProps = TextProps & {
  align: 'left' | 'center'
}

function inBox(p: Point, box: { x: number; y: number; width: number; height: number }, pad = 2): boolean {
  return (
    p.x >= box.x - pad && p.x <= box.x + box.width + pad && p.y >= box.y - pad && p.y <= box.y + box.height + pad
  )
}

/** Free-floating text pinned to a chart point. */
export class TextLabel extends Drawing<TextBlockProps> {
  readonly type: string = 'text'

  protected override defaultProps(): TextBlockProps {
    return { text: '', align: 'left' }
  }

  requiredAnchors(): number {
    return 1
  }

  /** The box the text occupies; anchor is its top-left. */
  protected box(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.props.text || ' ', this.style)
    return { x: p.x, y: p.y, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    paintTextBlock(ctx, this.props.text || ' ', p, this.style, {
      background: fillPaint(this.style) ?? undefined,
      align: this.props.align,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    return !!box && inBox(point, box)
  }
}

/** Text in a filled note card with a border. */
export class Note extends TextLabel {
  override readonly type: string = 'note'

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    paintTextBlock(ctx, this.props.text || ' ', p, this.style, {
      background: fillPaint(this.style) ?? undefined,
      borderColor: this.style.lineColor,
      align: this.props.align,
    })
  }
}

/** Note variant with a speech-bubble tail pointing at the anchor. */
export class Comment extends TextLabel {
  override readonly type = 'comment'

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    // Bubble sits above-right of the anchor; the tail drops back to the anchor point.
    const top = { x: p.x + 10, y: p.y - 14 - measureTextBlock(this.props.text || ' ', this.style).height - 12 }
    const bubble = fillPaint(this.style) ?? 'transparent'
    const box = paintTextBlock(ctx, this.props.text || ' ', top, this.style, {
      background: bubble,
      borderColor: this.style.lineColor,
    })
    ctx.save()
    ctx.fillStyle = bubble
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(box.x + 8, box.y + box.height)
    ctx.lineTo(p.x, p.y)
    ctx.lineTo(box.x + 24, box.y + box.height)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  override testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const { height } = measureTextBlock(this.props.text || ' ', this.style)
    const top = { x: p.x + 10, y: p.y - 14 - height - 12 }
    const { width } = measureTextBlock(this.props.text || ' ', this.style)
    return inBox(point, { x: top.x, y: top.y, width: width + 12, height: height + 12 })
  }
}

/**
 * Text box tethered to a target point: anchor 1 is what the callout points at, anchor 2 is
 * where the box sits — both stay draggable.
 */
export class Callout extends Drawing<TextProps> {
  readonly type: string = 'callout'

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  requiredAnchors(): number {
    return 2
  }

  /** What the box displays; variants prepend computed lines (e.g. the target price). */
  protected bodyText(): string {
    return this.props.text
  }

  protected boxAt(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const boxAnchor = this.anchors[1]
    if (!boxAnchor) return null
    const p = this.anchorToPixel(boxAnchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.bodyText() || ' ', this.style)
    return { x: p.x, y: p.y, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    const box = this.boxAt(viewport)
    if (!target || !box) return
    // Tether from the box edge nearest the target.
    const edge = {
      x: Math.max(box.x, Math.min(target.x, box.x + box.width)),
      y: Math.max(box.y, Math.min(target.y, box.y + box.height)),
    }
    applyStroke(ctx, this.style)
    ctx.beginPath()
    ctx.moveTo(target.x, target.y)
    ctx.lineTo(edge.x, edge.y)
    ctx.stroke()
    paintTextBlock(ctx, this.bodyText() || ' ', { x: box.x, y: box.y }, this.style, {
      background: fillPaint(this.style) ?? undefined,
      borderColor: this.style.lineColor,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.boxAt(viewport)
    if (box && inBox(point, box)) return true
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    if (!target || !box) return false
    const edge = {
      x: Math.max(box.x, Math.min(target.x, box.x + box.width)),
      y: Math.max(box.y, Math.min(target.y, box.y + box.height)),
    }
    return distanceToSegment(point, target, edge) <= 6
  }
}

/** Pill showing the anchor's price, with a pointer tail at the exact level. */
export class PriceLabel extends Drawing {
  readonly type = 'price_label'

  requiredAnchors(): number {
    return 1
  }

  protected box(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(formatPrice(anchor.price), this.style)
    return { x: p.x + 12, y: p.y - (height + 12) / 2, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    const box = this.box(viewport)
    if (!p || !box) return
    ctx.save()
    ctx.fillStyle = withAlpha(this.style.lineColor, 0.18)
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    // Pointer tail to the exact price point, then the pill.
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(box.x, box.y + box.height / 2 - 5)
    ctx.lineTo(box.x, box.y + box.height / 2 + 5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, box.width, box.height, 4)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    paintTextBlock(ctx, formatPrice(anchor.price), { x: box.x, y: box.y }, this.style)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    return !!box && inBox(point, box)
  }
}

type MarkDirection = 'up' | 'down'

abstract class ArrowMark extends Drawing<TextProps> {
  protected abstract direction(): MarkDirection

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const size = 7 + this.style.lineWidth * 2
    const up = this.direction() === 'up'
    const sign = up ? 1 : -1
    ctx.save()
    ctx.fillStyle = this.style.lineColor
    ctx.setLineDash([])
    ctx.beginPath()
    // Chevron arrow: tip at the anchor, body extending away from the price it marks.
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x - size, p.y + sign * size)
    ctx.lineTo(p.x - size / 2, p.y + sign * size)
    ctx.lineTo(p.x - size / 2, p.y + sign * size * 2)
    ctx.lineTo(p.x + size / 2, p.y + sign * size * 2)
    ctx.lineTo(p.x + size / 2, p.y + sign * size)
    ctx.lineTo(p.x + size, p.y + sign * size)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    if (this.props.text) {
      const { width } = measureTextBlock(this.props.text, this.style)
      paintTextBlock(
        ctx,
        this.props.text,
        { x: p.x - (width + 12) / 2, y: up ? p.y + size * 2 + 4 : p.y - size * 2 - 4 - measureTextBlock(this.props.text, this.style).height - 12 },
        this.style,
      )
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const size = 7 + this.style.lineWidth * 2
    const up = this.direction() === 'up'
    const box = up
      ? { x: p.x - size, y: p.y, width: size * 2, height: size * 2 }
      : { x: p.x - size, y: p.y - size * 2, width: size * 2, height: size * 2 }
    return inBox(point, box, 4)
  }
}

/** Upward arrow mark (tip at the anchor price). */
export class ArrowMarkUp extends ArrowMark {
  readonly type = 'arrow_up'

  protected direction(): MarkDirection {
    return 'up'
  }
}

/** Downward arrow mark (tip at the anchor price). */
export class ArrowMarkDown extends ArrowMark {
  readonly type = 'arrow_down'

  protected direction(): MarkDirection {
    return 'down'
  }
}

/** Callout variant whose body leads with the target's exact price. */
export class PriceNote extends Callout {
  override readonly type = 'price_note'

  protected override bodyText(): string {
    const target = this.anchors[0]
    const price = target ? formatPrice(target.price) : ''
    return this.props.text ? `${price}\n${this.props.text}` : price
  }
}

/** Map pin at a chart point, with its note text beneath when present. */
export class Pin extends Drawing<TextProps> {
  readonly type = 'pin'

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const r = 7
    ctx.save()
    ctx.setLineDash([])
    ctx.fillStyle = this.style.lineColor
    // Teardrop: circle head + tapered stem down to the anchor point.
    ctx.beginPath()
    ctx.arc(p.x, p.y - r * 2, r, Math.PI * 0.85, Math.PI * 0.15)
    ctx.lineTo(p.x, p.y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(p.x, p.y - r * 2, r / 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    if (this.props.text) {
      const { width } = measureTextBlock(this.props.text, this.style)
      paintTextBlock(ctx, this.props.text, { x: p.x - (width + 12) / 2, y: p.y + 6 }, this.style, {
        background: withAlpha('#1b1f27', 0.95),
      })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    return inBox(point, { x: p.x - 9, y: p.y - 24, width: 18, height: 26 }, 3)
  }
}

/** Signpost: a label on a stem planted at the anchor. */
export class Signpost extends Drawing<TextProps> {
  readonly type = 'signpost'

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  requiredAnchors(): number {
    return 1
  }

  protected box(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.props.text || ' ', this.style)
    return { x: p.x - (width + 12) / 2, y: p.y - 34 - height, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    const box = this.box(viewport)
    if (!p || !box) return
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x, box.y + box.height)
    ctx.stroke()
    ctx.fillStyle = this.style.lineColor
    ctx.beginPath()
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    paintTextBlock(ctx, this.props.text || ' ', { x: box.x, y: box.y }, this.style, {
      background: withAlpha('#1b1f27', 0.95),
      borderColor: this.style.lineColor,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    return !!box && inBox(point, box)
  }
}

/**
 * Fat arrow between two anchors: the tip sits at the first, the tail sizes and aims it — drag
 * the tail to grow the arrow or flip it to point the other way. Text sits at the butt end,
 * clear of the arrow body.
 */
export class ArrowMarker extends Drawing<TextProps> {
  readonly type = 'arrow_marker'

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  requiredAnchors(): number {
    return 2
  }

  private geometry(viewport: Viewport): { tip: Point; tail: Point; len: number; w: number; angle: number } | null {
    const [tip, tail] = this.anchorPixels(viewport)
    if (!tip || !tail) return null
    const len = Math.max(18, Math.hypot(tail.x - tip.x, tail.y - tip.y))
    const w = Math.max(8, Math.min(46, len * 0.34))
    return { tip, tail, len, w, angle: Math.atan2(tail.y - tip.y, tail.x - tip.x) }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const g = this.geometry(viewport)
    if (!g) return
    ctx.save()
    ctx.setLineDash([])
    ctx.translate(g.tip.x, g.tip.y)
    ctx.rotate(g.angle)
    ctx.fillStyle = this.style.lineColor
    ctx.beginPath()
    // Tip at the origin; head then shaft running toward the tail along +x.
    ctx.moveTo(0, 0)
    ctx.lineTo(g.w, -g.w)
    ctx.lineTo(g.w, -g.w / 2)
    ctx.lineTo(g.len, -g.w / 2)
    ctx.lineTo(g.len, g.w / 2)
    ctx.lineTo(g.w, g.w / 2)
    ctx.lineTo(g.w, g.w)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    if (this.props.text) {
      const { width, height } = measureTextBlock(this.props.text, this.style)
      const boxW = width + 12
      const boxH = height + 12
      const above = g.tail.y <= g.tip.y
      const y = above ? g.tail.y - boxH - 8 : g.tail.y + 8
      paintTextBlock(ctx, this.props.text, { x: g.tail.x - boxW / 2, y }, this.style)
    }
  }

  /** The hint sits at the butt end where the text will render — never over the arrow body. */
  protected override textHintPlacement(points: Point[]): { x: number; y: number; angle: number } {
    const tip = points[0]
    const tail = points[1] ?? tip
    const above = tail.y <= tip.y
    return { x: tail.x, y: above ? tail.y - 18 : tail.y + 18, angle: 0 }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const g = this.geometry(viewport)
    if (!g) return false
    const dx = point.x - g.tip.x
    const dy = point.y - g.tip.y
    const cos = Math.cos(-g.angle)
    const sin = Math.sin(-g.angle)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    return rx >= -4 && rx <= g.len + 4 && Math.abs(ry) <= g.w + 4
  }
}

/** Flag pin at a chart point. */
export class FlagMark extends Drawing {
  readonly type = 'flag'

  requiredAnchors(): number {
    return 1
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const height = 22
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x, p.y - height)
    ctx.stroke()
    ctx.fillStyle = this.style.lineColor
    ctx.beginPath()
    ctx.moveTo(p.x, p.y - height)
    ctx.lineTo(p.x + 16, p.y - height + 5)
    ctx.lineTo(p.x, p.y - height + 10)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    return inBox(point, { x: p.x - 4, y: p.y - 24, width: 24, height: 26 })
  }
}
