import type { SeriesAttachedParameter, Time } from 'lightweight-charts'

import type { Anchor, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barAt } from '../core/bars'
import { distanceToSegment, midpoint, segmentTextAngle } from '../core/geometry'
import { applyStroke, fillPaint, inkOn, measureTextBlock, paintLabel, paintTextBlock, strokeSegment, wrapText } from '../render/canvas'
import { glyphArtwork } from '../render/glyphArtwork'
import type { TextHAlign, TextVAlign } from './lines'

export type TextProps = {
  text: string
}

type Box = { x: number; y: number; width: number; height: number }

function inBox(p: Point, box: Box, pad = 2): boolean {
  return p.x >= box.x - pad && p.x <= box.x + box.width + pad && p.y >= box.y - pad && p.y <= box.y + box.height + pad
}

/** The point on a box's edge nearest a target: where a line to the target leaves the box. */
function edgeToward(box: Box, target: Point): Point {
  return { x: Math.max(box.x, Math.min(target.x, box.x + box.width)), y: Math.max(box.y, Math.min(target.y, box.y + box.height)) }
}

/** A text block saved with an alignment of its words drops it: a block reads from its left. */
function withoutAlign<P>(props: Partial<P>): Partial<P> {
  const saved = props as Partial<P> & { align?: unknown }
  if (!('align' in saved)) return props
  const { align: _align, ...rest } = saved
  void _align
  return rest as Partial<P>
}

/** A text block's background and border, each switched on its own, and whether its words wrap. */
export type TextBoxProps = TextProps & {
  /** The box's background, in the drawing's fill. */
  fillBackground: boolean
  /** The box's border, in the drawing's stroke color. */
  drawBorder: boolean
  /** Whether the words wrap at `wordWrapWidth` pixels; off, each line runs its own length. */
  wordWrap: boolean
  wordWrapWidth: number
}

/** Free text at a chart point, the point its box's top-left. */
export class TextLabel extends Drawing<TextBoxProps> {
  readonly type: string = 'text'

  protected override defaultProps(): TextBoxProps {
    return { text: '', fillBackground: false, drawBorder: false, wordWrap: false, wordWrapWidth: 200 }
  }

  /** A text saved with an alignment of its words reads from its left, its background showing
   *  wherever its fill does, as such a text was drawn. */
  protected override upgradeProps(props: Partial<TextBoxProps>): Partial<TextBoxProps> {
    if (!('align' in props)) return props
    return { fillBackground: true, ...withoutAlign(props) }
  }

  requiredAnchors(): number {
    return 1
  }

  /** The words as the box reads them, wrapped while wrap is on. */
  protected words(): string {
    const text = this.props.text || ' '
    return this.props.wordWrap ? wrapText(text, this.style, this.props.wordWrapWidth) : text
  }

  protected box(viewport: Viewport): Box | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.words(), this.style)
    return { x: p.x, y: p.y, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const box = this.box(viewport)
    if (!box) return
    paintTextBlock(ctx, this.words(), box, this.style, {
      background: this.props.fillBackground ? (fillPaint(this.style) ?? undefined) : undefined,
      borderColor: this.props.drawBorder ? this.style.lineColor : undefined,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    return !!box && inBox(point, box)
  }
}

/** A label's background in the drawing's fill and its border in a color of its own, each switched
 *  on its own. */
export type LabelBoxProps = TextProps & {
  fillBackground: boolean
  drawBorder: boolean
  borderColor: string
}

const LABEL_BOX: LabelBoxProps = { text: '', fillBackground: true, drawBorder: false, borderColor: '#4a4a4a' }

/** Where a note's label stands from a point it shares, in pixels: to the right and up. */
const LABEL_OFFSET = { x: 20, y: 40 }

/**
 * Note: a label tied to the point it notes. The first point is what it notes and the second where
 * its label stands, the label's top-left; a line in the drawing's stroke color runs between them.
 */
export class Note extends Drawing<LabelBoxProps> {
  readonly type = 'note'

  protected override defaultProps(): LabelBoxProps {
    return { ...LABEL_BOX }
  }

  /** A note saved on one point keeps that point and gains its label there, until a pane stands the
   *  label off it. */
  protected override upgradeAnchors(anchors: Anchor[]): Anchor[] {
    return anchors.length === 1 ? [anchors[0]!, { ...anchors[0]! }] : anchors
  }

  /** A note whose label stands on its point, as one saved on a single point does, stands the label
   *  up and to the right of the point once it is on a pane, so the two are told apart and the line
   *  between them shows. The point itself stays. */
  override attached(params: SeriesAttachedParameter<Time>): void {
    super.attached(params)
    const [point, label] = this.anchors
    const viewport = this.getViewport()
    if (!point || !label || !viewport || label.time !== point.time || label.price !== point.price) return
    const p = this.anchorToPixel(point, viewport)
    const price = p ? viewport.priceAt(p.y - LABEL_OFFSET.y) : null
    if (!p || price === null) return
    this._anchors[1] = { time: viewport.timeAt(p.x + LABEL_OFFSET.x) ?? point.time, price }
  }

  /** A note saved with an alignment of its words reads from its left inside its background and its
   *  border, as such a note was drawn. */
  protected override upgradeProps(props: Partial<LabelBoxProps>): Partial<LabelBoxProps> {
    if (!('align' in props)) return props
    return { fillBackground: true, drawBorder: true, ...withoutAlign(props) }
  }

  requiredAnchors(): number {
    return 2
  }

  protected label(viewport: Viewport): Box | null {
    const at = this.anchors[1]
    if (!at) return null
    const p = this.anchorToPixel(at, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.props.text || ' ', this.style)
    return { x: p.x, y: p.y, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    const label = this.label(viewport)
    if (!target || !label) return
    ctx.save()
    applyStroke(ctx, { ...this.style, lineWidth: 1, lineStyle: 'solid' })
    strokeSegment(ctx, target, edgeToward(label, target))
    ctx.restore()
    paintTextBlock(ctx, this.props.text || ' ', label, this.style, {
      background: this.props.fillBackground ? (fillPaint(this.style) ?? undefined) : undefined,
      borderColor: this.props.drawBorder ? this.props.borderColor : undefined,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const label = this.label(viewport)
    if (label && inBox(point, label)) return true
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    return !!target && !!label && distanceToSegment(point, target, edgeToward(label, target)) <= 6
  }
}

/** Comment: words in a bubble whose tail drops to the point it comments on, the bubble in the
 *  drawing's fill and bordered in its stroke color. */
export class Comment extends Drawing<TextProps> {
  readonly type = 'comment'

  protected override defaultProps(): TextProps {
    return { text: '' }
  }

  protected override upgradeProps(props: Partial<TextProps>): Partial<TextProps> {
    return withoutAlign(props)
  }

  requiredAnchors(): number {
    return 1
  }

  /** The bubble stands above and to the right of its point. */
  protected bubble(viewport: Viewport): { box: Box; point: Point } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.props.text || ' ', this.style)
    return { box: { x: p.x + 10, y: p.y - 14 - height - 12, width: width + 12, height: height + 12 }, point: p }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const b = this.bubble(viewport)
    if (!b) return
    const fill = fillPaint(this.style) ?? 'transparent'
    const box = paintTextBlock(ctx, this.props.text || ' ', b.box, this.style, { background: fill, borderColor: this.style.lineColor })
    ctx.save()
    ctx.fillStyle = fill
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(box.x + 8, box.y + box.height)
    ctx.lineTo(b.point.x, b.point.y)
    ctx.lineTo(box.x + 24, box.y + box.height)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const b = this.bubble(viewport)
    return !!b && inBox(point, b.box)
  }
}

/** A callout's words wrap at a width while wrap is on. */
export type CalloutProps = TextProps & {
  wordWrap: boolean
  wordWrapWidth: number
}

/**
 * Callout: a box tied to a target. The first point is what it points at and the second where the box
 * stands; the tether and the box's border take the drawing's stroke at its width, the box its fill.
 */
export class Callout extends Drawing<CalloutProps> {
  readonly type: string = 'callout'

  protected override defaultProps(): CalloutProps {
    return { text: '', wordWrap: false, wordWrapWidth: 200 }
  }

  requiredAnchors(): number {
    return 2
  }

  protected words(): string {
    const text = this.props.text || ' '
    return this.props.wordWrap ? wrapText(text, this.style, this.props.wordWrapWidth) : text
  }

  protected boxAt(viewport: Viewport): Box | null {
    const at = this.anchors[1]
    if (!at) return null
    const p = this.anchorToPixel(at, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.words(), this.style)
    return { x: p.x, y: p.y, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    const box = this.boxAt(viewport)
    if (!target || !box) return
    ctx.save()
    applyStroke(ctx, { ...this.style, lineStyle: 'solid' })
    strokeSegment(ctx, target, edgeToward(box, target))
    ctx.restore()
    paintTextBlock(ctx, this.words(), box, this.style, {
      background: fillPaint(this.style) ?? undefined,
      borderColor: this.style.lineColor,
      borderWidth: this.style.lineWidth,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.boxAt(viewport)
    if (box && inBox(point, box)) return true
    const target = this.anchors[0] && this.anchorToPixel(this.anchors[0], viewport)
    return !!target && !!box && distanceToSegment(point, target, edgeToward(box, target)) <= Math.max(6, this.style.lineWidth / 2 + 4)
  }
}

/** Price label: its point's price in a pill whose tail points at it, the pill in the drawing's fill
 *  and bordered in its stroke color, the price in its text style. */
export class PriceLabel extends Drawing {
  readonly type = 'price_label'

  requiredAnchors(): number {
    return 1
  }

  protected box(viewport: Viewport): Box | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.formatPrice(anchor.price), this.style)
    return { x: p.x + 12, y: p.y - (height + 12) / 2, width: width + 12, height: height + 12 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    const box = this.box(viewport)
    if (!p || !box) return
    ctx.save()
    ctx.fillStyle = fillPaint(this.style) ?? 'transparent'
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    // The tail to the exact price, then the pill.
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
    paintTextBlock(ctx, this.formatPrice(anchor.price), { x: box.x, y: box.y }, this.style)
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
    // A chevron arrow: its tip at the anchor, its body running away from the price it marks.
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
      const { width, height } = measureTextBlock(this.props.text, this.style)
      paintTextBlock(ctx, this.props.text, { x: p.x - (width + 12) / 2, y: up ? p.y + size * 2 + 4 : p.y - size * 2 - 4 - height - 12 }, this.style)
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const size = 7 + this.style.lineWidth * 2
    const up = this.direction() === 'up'
    const box = up ? { x: p.x - size, y: p.y, width: size * 2, height: size * 2 } : { x: p.x - size, y: p.y - size * 2, width: size * 2, height: size * 2 }
    return inBox(point, box, 4)
  }
}

/** Upward arrow mark, its tip at the anchor's price. */
export class ArrowMarkUp extends ArrowMark {
  readonly type = 'arrow_up'

  protected direction(): MarkDirection {
    return 'up'
  }
}

/** Downward arrow mark, its tip at the anchor's price. */
export class ArrowMarkDown extends ArrowMark {
  readonly type = 'arrow_down'

  protected direction(): MarkDirection {
    return 'down'
  }
}

/** How a label stands across a line it rides: its offset from the line and the edge of the text
 *  that offset is measured to. */
const ACROSS: Record<TextVAlign, { y: number; baseline: 'bottom' | 'middle' | 'top' }> = {
  top: { y: -4, baseline: 'bottom' },
  middle: { y: 0, baseline: 'middle' },
  bottom: { y: 4, baseline: 'top' },
}

/** A price note's words and their place along its line, and its tag: the tag's words' color, size,
 *  weight and slant, its background and its border. */
export type PriceNoteProps = TextProps & {
  /** Where the words stand across the line (above it, on it, below it) and along it. */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
  labelTextColor: string
  labelFontSize: number
  labelBold: boolean
  labelItalic: boolean
  labelBackgroundColor: string
  labelBorderColor: string
}

/**
 * Price note: a line from a price to its tag. The first point is the price and the second the
 * line's other end, where the tag reading the first point's price stands; the words ride the line.
 */
export class PriceNote extends Drawing<PriceNoteProps> {
  readonly type = 'price_note'

  protected override defaultProps(): PriceNoteProps {
    return {
      text: '',
      textVAlign: 'top',
      textHAlign: 'center',
      labelTextColor: '#ffffff',
      labelFontSize: 12,
      labelBold: false,
      labelItalic: false,
      labelBackgroundColor: '#2962ff',
      labelBorderColor: '#2962ff',
    }
  }

  requiredAnchors(): number {
    return 2
  }

  /** The tag's words in its own text style. */
  protected tagStyle(): DrawingStyle {
    const p = this.props
    return { ...this.style, textColor: p.labelTextColor, fontSize: p.labelFontSize, bold: p.labelBold, italic: p.labelItalic }
  }

  /** The tag at the line's second end, on the side away from the first. */
  protected tag(viewport: Viewport): { box: Box; text: string } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    const price = this.anchors[0]
    if (!pa || !pb || !price) return null
    const text = this.formatPrice(price.price)
    const { width, height } = measureTextBlock(text, this.tagStyle())
    const w = width + 12
    const h = height + 8
    return { box: { x: pb.x >= pa.x ? pb.x : pb.x - w, y: pb.y - h / 2, width: w, height: h }, text }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    ctx.save()
    applyStroke(ctx, { ...this.style, lineWidth: 1, lineStyle: 'solid' })
    strokeSegment(ctx, pa, pb)
    ctx.restore()
    const tag = this.tag(viewport)
    if (tag) {
      ctx.save()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.roundRect(tag.box.x, tag.box.y, tag.box.width, tag.box.height, 4)
      ctx.fillStyle = this.props.labelBackgroundColor
      ctx.fill()
      ctx.strokeStyle = this.props.labelBorderColor
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.restore()
      paintLabel(ctx, tag.text, { x: tag.box.x + tag.box.width / 2, y: tag.box.y + tag.box.height / 2 }, this.tagStyle(), { align: 'center', baseline: 'middle' })
    }
    if (this.props.text) {
      // The words ride the line's slope; left and right are the screen's.
      const [left, right] = pa.x <= pb.x ? [pa, pb] : [pb, pa]
      const along = this.props.textHAlign
      const at = along === 'left' ? left : along === 'right' ? right : midpoint(pa, pb)
      const across = ACROSS[this.props.textVAlign] ?? ACROSS.top
      ctx.save()
      ctx.translate(at.x, at.y)
      ctx.rotate(segmentTextAngle(pa, pb))
      paintLabel(ctx, this.props.text, { x: 0, y: across.y }, this.style, { align: along === 'left' ? 'left' : along === 'right' ? 'right' : 'center', baseline: across.baseline })
      ctx.restore()
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return false
    if (distanceToSegment(point, pa, pb) <= 6) return true
    const tag = this.tag(viewport)
    return !!tag && inBox(point, tag.box)
  }
}

/** Pin: a marker at a chart point in the drawing's stroke color, its words in a box under it. */
export class Pin extends Drawing<LabelBoxProps> {
  readonly type = 'pin'

  protected override defaultProps(): LabelBoxProps {
    return { ...LABEL_BOX }
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
    // A teardrop: a round head and a tapered stem down to the point.
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
        background: this.props.fillBackground ? (fillPaint(this.style) ?? undefined) : undefined,
        borderColor: this.props.drawBorder ? this.props.borderColor : undefined,
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

/** A signpost's plate: whether it leads with an emoji, the emoji, and how far it stands from its
 *  bar. */
export type SignpostProps = TextProps & {
  showImage: boolean
  emoji: string
  /** How far the plate stands from its bar, in percent of the pane's height: above the bar's high,
   *  or below its low where it is negative. Null until the signpost is first stood on a pane, where
   *  the point it was placed at sets it. */
  position: number | null
}

/**
 * Signpost: a plate on a pole, planted on a bar. The pole stands on the bar's high, or on its low
 * for a plate below the bar, and the plate stands its position's share of the pane's height away,
 * so it keeps its height over the bar as the price scale moves. The plate is the drawing's stroke
 * color, its words in white or black, whichever reads on it.
 */
export class Signpost extends Drawing<SignpostProps> {
  readonly type = 'signpost'

  protected override defaultProps(): SignpostProps {
    return { text: '', showImage: false, emoji: '🙂', position: null }
  }

  requiredAnchors(): number {
    return 1
  }

  /** A signpost first stood on a pane takes its position from the point it was placed at. */
  override attached(params: SeriesAttachedParameter<Time>): void {
    super.attached(params)
    const anchor = this.anchors[0]
    const viewport = this.getViewport()
    if (this.props.position !== null || !anchor || !viewport) return
    const stood = this.standAt(anchor, viewport)
    if (!stood) return
    this._props = { ...this._props, position: stood.position }
    this._anchors[0] = stood.anchor
  }

  /** A point the plate is moved to, as the signpost holds it: its foot on the bar there, the high
   *  unless the point is below the bar's low, and the share of the pane's height between the foot
   *  and the point. A point with no bar under it is its own foot. */
  protected standAt(point: Anchor, viewport: Viewport): { anchor: Anchor; position: number } | null {
    const y = viewport.yOf(point.price)
    if (y === null || !(viewport.height > 0)) return null
    const bar = barAt(this.bars(), point.time)
    const highY = bar ? viewport.yOf(bar.high) : null
    const lowY = bar ? viewport.yOf(bar.low) : null
    if (!bar || highY === null || lowY === null) return { anchor: { time: point.time, price: point.price }, position: 0 }
    if (y > lowY) return { anchor: { time: point.time, price: bar.low }, position: -((y - lowY) / viewport.height) * 100 }
    return { anchor: { time: point.time, price: bar.high }, position: (Math.max(0, highY - y) / viewport.height) * 100 }
  }

  /** Where the foot and the plate stand on the pane. */
  protected stand(viewport: Viewport, anchor: Anchor | undefined = this.anchors[0]): { foot: Point; plate: Point; above: boolean } | null {
    if (!anchor) return null
    const x = viewport.xOf(anchor.time)
    if (x === null) return null
    const position = this.props.position
    if (position === null) {
      const y = viewport.yOf(anchor.price)
      return y === null ? null : { foot: { x, y }, plate: { x, y }, above: true }
    }
    const bar = barAt(this.bars(), anchor.time)
    const footY = viewport.yOf(bar ? (position >= 0 ? bar.high : bar.low) : anchor.price)
    if (footY === null) return null
    return { foot: { x, y: footY }, plate: { x, y: footY - (position / 100) * viewport.height }, above: position >= 0 }
  }

  /** The handle stands where the plate meets its pole. */
  override anchorToPixel(anchor: Anchor, viewport: Viewport): Point | null {
    return this.stand(viewport, anchor)?.plate ?? null
  }

  /** A move of the plate stands it over the bar under the point, the point's height away. A move
   *  that keeps the foot's price, as typing a bar does, keeps the plate's height over the new bar. */
  override updateAnchor(index: number, anchor: Anchor): void {
    const current = this.anchors[0]
    const viewport = this.getViewport()
    if (index !== 0 || !current) {
      super.updateAnchor(index, anchor)
      return
    }
    const position = this.props.position
    if (anchor.price === current.price && position !== null) {
      const bar = barAt(this.bars(), anchor.time)
      super.updateAnchor(0, { time: anchor.time, price: bar ? (position >= 0 ? bar.high : bar.low) : anchor.price })
      return
    }
    const stood = viewport ? this.standAt(anchor, viewport) : null
    if (!stood) {
      super.updateAnchor(0, anchor)
      return
    }
    this._props = { ...this._props, position: stood.position }
    super.updateAnchor(0, stood.anchor)
  }

  /** The plate's box, its contents' sizes and its pole's ends. */
  protected plate(viewport: Viewport): { box: Box; foot: Point; top: Point; emoji: number; words: { width: number; height: number } } | null {
    const stand = this.stand(viewport)
    if (!stand) return null
    const emoji = this.props.showImage && this.props.emoji ? Math.round(this.style.fontSize * 1.4) : 0
    const words = this.props.text ? measureTextBlock(this.props.text, this.style) : { width: 0, height: 0 }
    const gap = emoji && words.width ? 4 : 0
    const width = Math.max(8, emoji + gap + words.width) + 12
    const height = Math.max(emoji, words.height || Math.round(this.style.fontSize * 1.35)) + 8
    const box = { x: stand.plate.x - width / 2, y: stand.above ? stand.plate.y - height : stand.plate.y, width, height }
    return { box, foot: stand.foot, top: stand.plate, emoji, words }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const plate = this.plate(viewport)
    if (!plate) return
    const { box } = plate
    const color = this.style.lineColor
    ctx.save()
    ctx.setLineDash([])
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(plate.foot.x, plate.foot.y)
    ctx.lineTo(plate.top.x, plate.top.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(plate.foot.x, plate.foot.y, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, box.width, box.height, 4)
    ctx.fill()
    ctx.restore()
    let x = box.x + 6
    if (plate.emoji) {
      const y = box.y + (box.height - plate.emoji) / 2
      const url = this.glyphUrl(this.props.emoji)
      const art = url ? glyphArtwork(url, () => this.requestUpdate()) : null
      if (art) ctx.drawImage(art, x, y, plate.emoji, plate.emoji)
      else {
        ctx.save()
        ctx.font = `${plate.emoji}px ui-sans-serif, system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#000000'
        ctx.fillText(this.props.emoji, x, y)
        ctx.restore()
      }
      x += plate.emoji + 4
    }
    if (this.props.text) {
      paintTextBlock(ctx, this.props.text, { x, y: box.y + (box.height - plate.words.height) / 2 }, { ...this.style, textColor: inkOn(color) }, { padding: 0 })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const plate = this.plate(viewport)
    if (!plate) return false
    return inBox(point, plate.box) || distanceToSegment(point, plate.foot, plate.top) <= 5
  }
}

/**
 * Fat arrow between two anchors: the tip sits at the first, the tail sizes and aims it. Dragging the
 * tail grows the arrow or turns it to point another way. The words sit at the butt end, clear of the
 * arrow's body.
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
    // The tip at the origin; the head, then the shaft running toward the tail along +x.
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

  /** The hint sits at the butt end where the words paint, never over the arrow's body. */
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

/** Flag mark: a flag on a short pole at a chart point, in the drawing's stroke color. */
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
