import type { SeriesAttachedParameter, Time } from 'lightweight-charts'

import type { Anchor, ControlPoint, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { barAt } from '../core/bars'
import { distanceToSegment, midpoint, segmentTextAngle } from '../core/geometry'
import { applyStroke, fillPaint, fontOf, inkOn, lineMeasure, measureTextBlock, paintLabel, paintTextBlock, strokeSegment, withAlpha, wrapText } from '../render/canvas'
import { endSavedLook, type SavedLook } from '../core/savedLook'
import type { TextBlock, TextEditFrame } from '../core/textEntry'
import { paintTextEntry, paintWordsFrame } from '../render/textEntry'
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

/** How a block's words stand in it: from its left, or centered where a save carries a centered
 *  alignment, which the block's pages do not offer. */
function wordsAlign(props: Readonly<Record<string, unknown>>): 'left' | 'center' {
  return props.align === 'center' ? 'center' : 'left'
}

/** A comment saved with an alignment of its words drops it: a comment's words read from its left. */
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
  /** A format-2 text's look, its words six pixels into a box rounded at four, painted as format 2
   *  did until the text's settings change. */
  savedLook: SavedLook
}

/** How far a text's words stand in from its point, and how much room its box keeps past the words
 *  across and down. */
const TEXT_INSET = 2
const TEXT_ROOM = 5
/** The pixel a caret after the last word takes, which a box with words keeps for it. */
const CARET_ROOM = 1
/** The alpha the placeholder paints at, and the frame while an edit holds no words. */
const EMPTY_ALPHA = 0.4

/** Where a text's words stand and the box they make. */
interface TextPlace {
  /** The first line box's top-left. */
  x: number
  y: number
  lineHeight: number
  /** The width the lines align within. */
  width: number
  align: 'left' | 'center'
  block: TextBlock
  /** The placeholder in lines, where it shows. */
  placeholder: TextBlock | null
  wrapWidth: number | null
  box: Box
}

/**
 * Free text at a chart point: the point is its box's top-left, and the words stand two pixels in,
 * one line to each `fontSize` pixels. The box takes the widest line, the pixel a caret after it
 * takes, and five pixels more across and down. An empty text shows its placeholder at 40%. While
 * selected a two pixel frame stands just outside the box in the words' color, at 40% while an
 * edit shows the placeholder; the text has no handles, and a drag anywhere on it moves it.
 */
export class TextLabel extends Drawing<TextBoxProps> {
  readonly type: string = 'text'

  protected override defaultProps(): TextBoxProps {
    return { text: '', fillBackground: false, drawBorder: false, wordWrap: false, wordWrapWidth: 200, savedLook: null }
  }

  /** A format-2 text showed its background wherever its fill did, its words six pixels into a box
   *  rounded at four at a line height of 1.35; it paints so until its settings change. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, fillBackground: true, savedLook: {} }
  }

  override applyProps(patch: Partial<TextBoxProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 1
  }

  protected place(viewport: Viewport): TextPlace | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const wrapWidth = this.props.wordWrap ? this.props.wordWrapWidth : null
    const { block, placeholder } = this.shownWords(lineMeasure(this.style), wrapWidth)
    const shown = placeholder ?? block
    const align = wordsAlign(this.props)
    if (this.props.savedLook) {
      const lineHeight = Math.round(this.style.fontSize * 1.35)
      const width = wrapWidth ?? shown.width
      return {
        x: p.x + 6,
        y: p.y + 6,
        lineHeight,
        width,
        align,
        block,
        placeholder,
        wrapWidth,
        box: { x: p.x, y: p.y, width: width + 12, height: shown.lines.length * lineHeight + 12 },
      }
    }
    const x = Math.round(p.x)
    const y = Math.round(p.y)
    const lineHeight = this.style.fontSize
    const words = wrapWidth ?? (placeholder ? placeholder.width : block.width + CARET_ROOM)
    return {
      x: x + TEXT_INSET,
      y: y + TEXT_INSET,
      lineHeight,
      width: placeholder ? placeholder.width : (wrapWidth ?? block.width),
      align,
      block,
      placeholder,
      wrapWidth,
      box: { x, y, width: Math.floor(words) + TEXT_ROOM, height: shown.lines.length * lineHeight + TEXT_ROOM },
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const at = this.place(viewport)
    if (!at) return
    const draft = this.textDraft
    const background = this.props.fillBackground ? (fillPaint(this.style) ?? undefined) : undefined
    const borderColor = this.props.drawBorder ? this.style.lineColor : undefined
    if (this.props.savedLook && !draft) {
      const text = this.props.text || ' '
      paintTextBlock(ctx, this.props.wordWrap ? wrapText(text, this.style, this.props.wordWrapWidth) : text, at.box, this.style, { background, borderColor, align: at.align })
    } else {
      if (background || borderColor) {
        ctx.save()
        ctx.setLineDash([])
        ctx.beginPath()
        if (this.props.savedLook) ctx.roundRect(at.box.x, at.box.y, at.box.width, at.box.height, 4)
        else ctx.rect(at.box.x, at.box.y, at.box.width, at.box.height)
        if (background) {
          ctx.fillStyle = background
          ctx.fill()
        }
        if (borderColor) {
          ctx.strokeStyle = borderColor
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.restore()
      }
      paintTextEntry(ctx, {
        x: at.x,
        y: at.y,
        width: at.width,
        lineHeight: at.lineHeight,
        font: fontOf(this.style),
        color: this.style.textColor,
        align: at.align,
        block: at.block,
        placeholder: at.placeholder ? { block: at.placeholder, alpha: EMPTY_ALPHA } : null,
        draft,
        measure: lineMeasure(this.style),
      })
    }
    if (this.state === 'selected' || this.state === 'editing') paintWordsFrame(ctx, at.box, this.style.textColor, draft && at.placeholder ? EMPTY_ALPHA : 1)
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const at = this.place(viewport)
    if (!at) return null
    return {
      x: at.x,
      y: at.y,
      width: at.width,
      lines: (at.placeholder ?? at.block).lines.length,
      lineHeight: at.lineHeight,
      font: fontOf(this.style),
      align: at.align,
      wrapWidth: at.wrapWidth,
      angle: 0,
    }
  }

  /** No handles: the frame says the text is selected, and a drag anywhere on it moves it. */
  override getControlPoints(_viewport: Viewport): ControlPoint[] {
    return []
  }

  /** An empty text shows its placeholder in its own box, so it needs no hint above it. */
  override paintTextHint(): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    return !!at && inBox(point, at.box)
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

/** A note's label, and a format-2 save's look. */
export type NoteProps = LabelBoxProps & {
  /** A format-2 note's look, its label's top-left on its second point, painted as format 2 did
   *  until the note's settings change. */
  savedLook: SavedLook
}

/** How far a note's words stand in from its box's left and top edges, the room the box keeps past
 *  them across and down, the radius of its corners and of the dot on the point it notes, and the
 *  shadow it casts. */
const NOTE_PAD_LEFT = 8
const NOTE_PAD_TOP = 6
const NOTE_ROOM_ACROSS = 16
const NOTE_ROOM_DOWN = 12
const NOTE_RADIUS = 4
const NOTE_DOT = 3.5
const NOTE_SHADOW = { color: 'rgba(0, 0, 0, 0.5)', blur: 6, offsetY: 2 }

/**
 * Note: a label tied to the point it notes. The first point is what it notes, marked by a dot in
 * the drawing's stroke color; the second is where the label stands, the left edge of its box
 * centred on it. A one pixel line in the stroke color runs between them while they part. The box
 * is the drawing's fill with corners rounded at 4 and a soft shadow under it, its words 8px in and
 * 6px down on lines `fontSize` tall, so it is its widest line and 16px wide and 12px more than its
 * lines tall, growing evenly up and down. Selected, it shows a handle on each point; a drag on the
 * box moves the label alone, a drag on the line moves the whole note, and a click on the box of the
 * selected note types.
 */
export class Note extends Drawing<NoteProps> {
  readonly type = 'note'

  protected override defaultProps(): NoteProps {
    return { ...LABEL_BOX, savedLook: null }
  }

  /** A note saved on one point keeps that point and gains its label there, the label's top-left on
   *  the point as the note was drawn, until the label is moved off it. */
  protected override upgradeAnchors(anchors: Anchor[]): Anchor[] {
    return anchors.length === 1 ? [anchors[0]!, { ...anchors[0]! }] : anchors
  }

  /** A format-2 note showed its background and its border, the border in its stroke color, its
   *  label's top-left on its second point; it paints so until its settings change. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, fillBackground: true, drawBorder: true, borderColor: this._style.lineColor, savedLook: {} }
  }

  override applyProps(patch: Partial<NoteProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 2
  }

  /** The label's box and its words, and the two points. */
  protected place(viewport: Viewport): (WordsPlace & { target: Point; label: Point }) | null {
    const [noted, at] = this.anchors
    const target = noted && this.anchorToPixel(noted, viewport)
    const label = at && this.anchorToPixel(at, viewport)
    if (!target || !label) return null
    const { block, placeholder } = this.shownWords(lineMeasure(this.style))
    const shown = placeholder ?? block
    if (this.props.savedLook) {
      const lineHeight = Math.round(this.style.fontSize * 1.35)
      const box = { x: label.x, y: label.y, width: shown.width + 12, height: shown.lines.length * lineHeight + 12 }
      return { box, x: box.x + 6, y: box.y + 6, lineHeight, block, placeholder, target, label }
    }
    const lineHeight = this.style.fontSize
    const width = Math.round(shown.width) + NOTE_ROOM_ACROSS
    const height = shown.lines.length * lineHeight + NOTE_ROOM_DOWN
    const box = { x: Math.round(label.x), y: Math.round(label.y - height / 2), width, height }
    return { box, x: box.x + NOTE_PAD_LEFT, y: box.y + NOTE_PAD_TOP, lineHeight, block, placeholder, target, label }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const at = this.place(viewport)
    if (!at) return
    const draft = this.textDraft
    const background = this.props.fillBackground ? (fillPaint(this.style) ?? undefined) : undefined
    const borderColor = this.props.drawBorder ? this.props.borderColor : undefined
    if (this.props.savedLook) {
      // The line shows while the label stands off its point.
      const edge = edgeToward(at.box, at.target)
      if (edge.x !== at.target.x || edge.y !== at.target.y) {
        ctx.save()
        applyStroke(ctx, { ...this.style, lineWidth: 1, lineStyle: 'solid' })
        strokeSegment(ctx, at.target, edge)
        ctx.restore()
      }
      if (!draft) {
        paintTextBlock(ctx, this.props.text || ' ', at.box, this.style, { background, borderColor, align: wordsAlign(this.props) })
        return
      }
    } else {
      const tx = Math.round(at.target.x)
      const ty = Math.round(at.target.y)
      const lx = Math.round(at.label.x)
      const ly = Math.round(at.label.y)
      ctx.save()
      ctx.setLineDash([])
      if (tx !== lx || ty !== ly) {
        // The line rides its points' pixels, so a level line is one pixel tall.
        ctx.strokeStyle = this.style.lineColor
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(tx + 0.5, ty + 0.5)
        ctx.lineTo(lx + 0.5, ly + 0.5)
        ctx.stroke()
      }
      ctx.fillStyle = this.style.lineColor
      ctx.beginPath()
      ctx.arc(tx, ty, NOTE_DOT, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (background || borderColor) {
      ctx.save()
      ctx.setLineDash([])
      ctx.beginPath()
      if (this.props.savedLook) ctx.roundRect(at.box.x, at.box.y, at.box.width, at.box.height, 4)
      else ctx.roundRect(at.box.x, at.box.y, at.box.width, at.box.height, NOTE_RADIUS)
      if (background) {
        if (!this.props.savedLook) {
          ctx.shadowColor = NOTE_SHADOW.color
          ctx.shadowBlur = NOTE_SHADOW.blur
          ctx.shadowOffsetY = NOTE_SHADOW.offsetY
        }
        ctx.fillStyle = background
        ctx.fill()
        ctx.shadowColor = 'transparent'
      }
      if (borderColor) {
        ctx.strokeStyle = borderColor
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.restore()
    }
    paintTextEntry(ctx, {
      x: at.x,
      y: at.y,
      width: (at.placeholder ?? at.block).width,
      lineHeight: at.lineHeight,
      font: fontOf(this.style),
      color: this.style.textColor,
      align: this.props.savedLook ? wordsAlign(this.props) : 'left',
      block: at.block,
      placeholder: at.placeholder ? { block: at.placeholder, alpha: PLACEHOLDER_ALPHA } : null,
      draft,
      measure: lineMeasure(this.style),
    })
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const at = this.place(viewport)
    return at ? wordsFrame(at, fontOf(this.style), this.props.savedLook ? wordsAlign(this.props) : 'left') : null
  }

  /** A drag on the box moves the label alone; the line and the dot move the whole note. */
  override grabbedAnchors(point: Point, viewport: Viewport): number[] | null {
    const at = this.place(viewport)
    return at && inBox(point, at.box) ? [1] : null
  }

  /** The words are the box's. */
  override wordsAt(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    return !!at && inBox(point, at.box)
  }

  /** An empty note shows its placeholder in its own box, so it needs no hint above it. */
  override paintTextHint(): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    if (!at) return false
    if (inBox(point, at.box)) return true
    if (Math.hypot(point.x - at.target.x, point.y - at.target.y) <= NOTE_DOT + 3) return true
    const edge = this.props.savedLook ? edgeToward(at.box, at.target) : at.label
    return distanceToSegment(point, at.target, edge) <= 6
  }
}

/** A comment's words, and a format-2 save's look. */
export type CommentProps = TextProps & {
  /** A format-2 comment's look, a box above and to the right of its point with a tail down to it,
   *  painted as format 2 did until the comment's settings change. */
  savedLook: SavedLook
}

/** How far a comment's words stand in from its bubble's edges, the radius of the bubble's three
 *  round corners, and the near-square corner on its point. */
const COMMENT_PAD = 13
const COMMENT_RADIUS = 21
const COMMENT_POINT_CORNER = 2
/** The alpha the placeholder of a drawing that types in a box of its own paints at. */
const PLACEHOLDER_ALPHA = 0.5

/** Where a drawing's words stand in their box: the first line's box, the line height, the words
 *  and the placeholder in lines. */
interface WordsPlace {
  box: Box
  x: number
  y: number
  lineHeight: number
  block: TextBlock
  placeholder: TextBlock | null
}

/** The frame an editor lays its field over, for words placed in a box. */
function wordsFrame(at: WordsPlace, font: string, align: 'left' | 'center' = 'left', width = (at.placeholder ?? at.block).width): TextEditFrame {
  return { x: at.x, y: at.y, width, lines: (at.placeholder ?? at.block).lines.length, lineHeight: at.lineHeight, font, align, wrapWidth: null, angle: 0 }
}

/**
 * Comment: words in a bubble whose bottom-left corner is the point it comments on. The bubble is
 * the drawing's fill bordered in its stroke color, its other three corners rounded at 21 whatever
 * its size; its words stand 13px in from every edge on lines `fontSize` tall, and it grows right
 * with its widest line and up with each line, the corner on the point never moving. An empty
 * comment shows its placeholder at half strength. Selected, it shows one handle, on its point, and
 * a press on it types.
 */
export class Comment extends Drawing<CommentProps> {
  readonly type = 'comment'

  protected override defaultProps(): CommentProps {
    return { text: '', savedLook: null }
  }

  protected override upgradeProps(props: Partial<CommentProps>): Partial<CommentProps> {
    return withoutAlign(props)
  }

  /** A format-2 comment was a box above and to the right of its point, a tail dropping to it; it
   *  paints so until its settings change. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, savedLook: {} }
  }

  override applyProps(patch: Partial<CommentProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 1
  }

  /** The bubble and its words: the bubble's pixels run from the one left of the point to the one
   *  below it. A saved look stands its box above and to the right of the point. */
  protected place(viewport: Viewport): (WordsPlace & { point: Point }) | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { block, placeholder } = this.shownWords(lineMeasure(this.style))
    const shown = placeholder ?? block
    if (this.props.savedLook) {
      const lineHeight = Math.round(this.style.fontSize * 1.35)
      const width = shown.width + 12
      const height = shown.lines.length * lineHeight + 12
      const box = { x: p.x + 10, y: p.y - 14 - height, width, height }
      return { box, x: box.x + 6, y: box.y + 6, lineHeight, block, placeholder, point: p }
    }
    const lineHeight = this.style.fontSize
    const width = Math.round(shown.width) + COMMENT_PAD * 2
    const height = shown.lines.length * lineHeight + COMMENT_PAD * 2
    const box = { x: Math.round(p.x) - 1, y: Math.round(p.y) + 1 - height, width, height }
    return { box, x: box.x + COMMENT_PAD, y: box.y + COMMENT_PAD, lineHeight, block, placeholder, point: p }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const at = this.place(viewport)
    if (!at) return
    const draft = this.textDraft
    const fill = fillPaint(this.style) ?? 'transparent'
    if (this.props.savedLook && !draft) {
      const box = paintTextBlock(ctx, this.props.text || ' ', at.box, this.style, { background: fill, borderColor: this.style.lineColor })
      this.paintSavedTail(ctx, box, at.point, fill)
      return
    }
    ctx.save()
    ctx.setLineDash([])
    ctx.fillStyle = fill
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.beginPath()
    if (this.props.savedLook) ctx.roundRect(at.box.x, at.box.y, at.box.width, at.box.height, 4)
    // The border's pixel rides the bubble's edge, so the path stands half a pixel in.
    else ctx.roundRect(at.box.x + 0.5, at.box.y + 0.5, at.box.width - 1, at.box.height - 1, [COMMENT_RADIUS, COMMENT_RADIUS, COMMENT_RADIUS, COMMENT_POINT_CORNER])
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    if (this.props.savedLook) this.paintSavedTail(ctx, at.box, at.point, fill)
    const measure = lineMeasure(this.style)
    paintTextEntry(ctx, {
      x: at.x,
      y: at.y,
      width: (at.placeholder ?? at.block).width,
      lineHeight: at.lineHeight,
      font: fontOf(this.style),
      color: this.style.textColor,
      align: 'left',
      block: at.block,
      placeholder: at.placeholder ? { block: at.placeholder, alpha: PLACEHOLDER_ALPHA } : null,
      draft,
      measure,
    })
  }

  /** A format-2 comment's tail, from its box down to its point. */
  private paintSavedTail(ctx: CanvasRenderingContext2D, box: Box, point: Point, fill: string): void {
    ctx.save()
    ctx.fillStyle = fill
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(box.x + 8, box.y + box.height)
    ctx.lineTo(point.x, point.y)
    ctx.lineTo(box.x + 24, box.y + box.height)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const at = this.place(viewport)
    return at ? wordsFrame(at, fontOf(this.style)) : null
  }

  /** An empty comment shows its placeholder in its own bubble, so it needs no hint above it. */
  override paintTextHint(): void {}

  /** Over a selected comment the pointer reads as typing, which a press there does. */
  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    const at = this.place(viewport)
    return this.state === 'selected' && at && inBox(point, at.box, 0) ? 'text' : null
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    return !!at && inBox(point, at.box)
  }
}

/** A callout's words, whether they wrap and at what width, its border's width, and a format-2
 *  save's look. */
export type CalloutProps = TextProps & {
  wordWrap: boolean
  wordWrapWidth: number
  /** The box's border at this width; null takes the drawing's stroke width. */
  borderWidth: number | null
  /** A format-2 callout's look, its box's top-left on its second point and a line tying the box to
   *  its first, painted as format 2 did until the callout's settings change. */
  savedLook: SavedLook
}

/** How far a callout's words stand in from its box's left edge, how far its first line's box
 *  stands under its top (which sets a line's tallest letters 10px under it), the room the box keeps
 *  past the words across and down, the radius of its corners, and how far its tail's root runs
 *  each way along the box from the middle of a side, or from a corner. */
const CALLOUT_PAD_LEFT = 10
const CALLOUT_LINE_TOP = 9
const CALLOUT_ROOM = 20
const CALLOUT_RADIUS = 6
const CALLOUT_TAIL = 8

type BoxSide = 'top' | 'right' | 'bottom' | 'left'
type BoxCorner = 'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'

/** A callout's tail: where it leaves the box, the two points of its root on the box's outline in
 *  the order a clockwise walk round the box meets them, and its tip. */
interface CalloutTail {
  root: BoxSide | BoxCorner
  from: Point
  to: Point
  tip: Point
}

/** The tail from a box to a tip: from the middle of the side the tip lies beyond, its root 8px
 *  each way along it, or from the corner the tip lies beyond both sides of, its root 8px along each
 *  side from the corner. A tip inside the box has no tail. */
function calloutTail(box: Box, tip: Point): CalloutTail | null {
  const l = box.x
  const t = box.y
  const r = box.x + box.width
  const b = box.y + box.height
  const across = tip.x < l ? 'left' : tip.x > r ? 'right' : null
  const down = tip.y < t ? 'top' : tip.y > b ? 'bottom' : null
  const k = Math.min(CALLOUT_RADIUS, box.width / 2, box.height / 2)
  const w = Math.max(0, Math.min(CALLOUT_TAIL, box.width / 2 - k, box.height / 2 - k))
  const c = Math.min(CALLOUT_TAIL, box.width, box.height)
  const cx = l + box.width / 2
  const cy = t + box.height / 2
  const tail = (root: BoxSide | BoxCorner, from: Point, to: Point): CalloutTail => ({ root, from, to, tip })
  if (down === 'top' && across === 'left') return tail('top-left', { x: l, y: t + c }, { x: l + c, y: t })
  if (down === 'top' && across === 'right') return tail('top-right', { x: r - c, y: t }, { x: r, y: t + c })
  if (down === 'bottom' && across === 'right') return tail('bottom-right', { x: r, y: b - c }, { x: r - c, y: b })
  if (down === 'bottom' && across === 'left') return tail('bottom-left', { x: l + c, y: b }, { x: l, y: b - c })
  if (down === 'top') return tail('top', { x: cx - w, y: t }, { x: cx + w, y: t })
  if (down === 'bottom') return tail('bottom', { x: cx + w, y: b }, { x: cx - w, y: b })
  if (across === 'right') return tail('right', { x: r, y: cy - w }, { x: r, y: cy + w })
  if (across === 'left') return tail('left', { x: l, y: cy + w }, { x: l, y: cy - w })
  return null
}

/** Trace a callout's box with its corners rounded at 6 and its tail let into its outline: one path
 *  that one stroke and one fill cover. */
function traceCallout(ctx: CanvasRenderingContext2D, box: Box, tail: CalloutTail | null): void {
  const l = box.x
  const t = box.y
  const r = box.x + box.width
  const b = box.y + box.height
  const k = Math.min(CALLOUT_RADIUS, box.width / 2, box.height / 2)
  const at = tail?.root
  const out = (): void => {
    ctx.lineTo(tail!.from.x, tail!.from.y)
    ctx.lineTo(tail!.tip.x, tail!.tip.y)
    ctx.lineTo(tail!.to.x, tail!.to.y)
  }
  // The walk starts just past the top-left corner, or where a tail from that corner meets the top.
  if (at === 'top-left') ctx.moveTo(tail!.to.x, tail!.to.y)
  else ctx.moveTo(l + k, t)
  if (at === 'top') out()
  if (at === 'top-right') out()
  else ctx.arcTo(r, t, r, t + k, k)
  if (at === 'right') out()
  if (at === 'bottom-right') out()
  else ctx.arcTo(r, b, r - k, b, k)
  if (at === 'bottom') out()
  if (at === 'bottom-left') out()
  else ctx.arcTo(l, b, l, b - k, k)
  if (at === 'left') out()
  if (at === 'top-left') out()
  else ctx.arcTo(l, t, l + k, t, k)
  ctx.closePath()
}

/** Whether a point lies in the triangle a tail makes. */
function inTail(p: Point, tail: CalloutTail): boolean {
  const side = (a: Point, b: Point): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  const d1 = side(tail.from, tail.tip)
  const d2 = side(tail.tip, tail.to)
  const d3 = side(tail.to, tail.from)
  return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)
}

/**
 * Callout: words in a box with a tail to what they speak of. The first point is the tail's tip and
 * the second the middle of the box's right edge, the box standing to its left, centred on it up and
 * down. The words stand 10px in from the box's left on lines `fontSize` tall, so the box is its
 * widest line, or the wrap width while wrap is on, and 20px wide, and 20px more than its lines tall.
 * The tail leaves the box from the middle of the side its tip lies beyond, or from the corner it
 * lies beyond both sides of. Box and tail are one shape in the drawing's fill, bordered in its
 * stroke color, the border stroked under the fill so its outer half shows. An empty callout shows
 * its placeholder at half strength. Selected, it shows a handle on each point; a drag on the box
 * moves the box alone, and a click on the box of the selected callout types.
 */
export class Callout extends Drawing<CalloutProps> {
  readonly type: string = 'callout'

  protected override defaultProps(): CalloutProps {
    return { text: '', wordWrap: false, wordWrapWidth: 200, borderWidth: null, savedLook: null }
  }

  /** A format-2 callout stood its box's top-left on its second point, tied to its first by a line,
   *  and bordered the box at 1px; it paints so until its settings change. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, borderWidth: 1, savedLook: {} }
  }

  override applyProps(patch: Partial<CalloutProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 2
  }

  /** The box, the words in it, and the tail's tip. */
  protected place(viewport: Viewport): (WordsPlace & { tip: Point; wrapWidth: number | null }) | null {
    const [pointed, boxed] = this.anchors
    const tip = pointed && this.anchorToPixel(pointed, viewport)
    const at = boxed && this.anchorToPixel(boxed, viewport)
    if (!tip || !at) return null
    const wrapWidth = this.props.wordWrap ? this.props.wordWrapWidth : null
    const { block, placeholder } = this.shownWords(lineMeasure(this.style), wrapWidth)
    const shown = placeholder ?? block
    if (this.props.savedLook) {
      const lineHeight = Math.round(this.style.fontSize * 1.35)
      const box = { x: at.x, y: at.y, width: (wrapWidth ?? shown.width) + 12, height: shown.lines.length * lineHeight + 12 }
      return { box, x: box.x + 6, y: box.y + 6, lineHeight, block, placeholder, tip, wrapWidth }
    }
    const lineHeight = this.style.fontSize
    const width = (wrapWidth ?? shown.width) + CALLOUT_ROOM
    const height = shown.lines.length * lineHeight + CALLOUT_ROOM
    const box = { x: at.x - width, y: at.y - height / 2, width, height }
    return { box, x: box.x + CALLOUT_PAD_LEFT, y: box.y + CALLOUT_LINE_TOP, lineHeight, block, placeholder, tip, wrapWidth }
  }

  /** A format-2 callout's words, wrapped as format 2 wrapped them. */
  private savedWords(): string {
    const text = this.props.text || ' '
    return this.props.wordWrap ? wrapText(text, this.style, this.props.wordWrapWidth) : text
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const at = this.place(viewport)
    if (!at) return
    const draft = this.textDraft
    const fill = fillPaint(this.style) ?? 'transparent'
    const borderWidth = this.props.borderWidth ?? this.style.lineWidth
    if (this.props.savedLook) {
      ctx.save()
      applyStroke(ctx, { ...this.style, lineStyle: 'solid' })
      strokeSegment(ctx, at.tip, edgeToward(at.box, at.tip))
      ctx.restore()
      if (!draft) {
        paintTextBlock(ctx, this.savedWords(), at.box, this.style, { background: fill, borderColor: this.style.lineColor, borderWidth })
        return
      }
      ctx.save()
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.roundRect(at.box.x, at.box.y, at.box.width, at.box.height, 4)
      ctx.fillStyle = fill
      ctx.fill()
      if (borderWidth > 0) {
        ctx.strokeStyle = this.style.lineColor
        ctx.lineWidth = borderWidth
        ctx.stroke()
      }
      ctx.restore()
    } else {
      ctx.save()
      ctx.setLineDash([])
      ctx.beginPath()
      traceCallout(ctx, at.box, calloutTail(at.box, at.tip))
      // The border goes under the fill, which covers its inner half.
      if (borderWidth > 0) {
        ctx.strokeStyle = this.style.lineColor
        ctx.lineWidth = borderWidth
        ctx.stroke()
      }
      ctx.fillStyle = fill
      ctx.fill()
      ctx.restore()
    }
    paintTextEntry(ctx, {
      x: at.x,
      y: at.y,
      width: at.wrapWidth ?? (at.placeholder ?? at.block).width,
      lineHeight: at.lineHeight,
      font: fontOf(this.style),
      color: this.style.textColor,
      align: 'left',
      block: at.block,
      placeholder: at.placeholder ? { block: at.placeholder, alpha: PLACEHOLDER_ALPHA } : null,
      draft,
      measure: lineMeasure(this.style),
    })
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const at = this.place(viewport)
    if (!at) return null
    return { ...wordsFrame(at, fontOf(this.style), 'left', at.wrapWidth ?? (at.placeholder ?? at.block).width), wrapWidth: at.wrapWidth }
  }

  /** A drag on the box moves the box alone; one on the tail moves the whole callout. */
  override grabbedAnchors(point: Point, viewport: Viewport): number[] | null {
    const at = this.place(viewport)
    return at && inBox(point, at.box) ? [1] : null
  }

  /** The words are the box's. */
  override wordsAt(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    return !!at && inBox(point, at.box)
  }

  /** An empty callout shows its placeholder in its own box, so it needs no hint above it. */
  override paintTextHint(): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    const at = this.place(viewport)
    if (!at) return false
    if (inBox(point, at.box)) return true
    if (this.props.savedLook) return distanceToSegment(point, at.tip, edgeToward(at.box, at.tip)) <= Math.max(6, this.style.lineWidth / 2 + 4)
    const tail = calloutTail(at.box, at.tip)
    if (!tail) return false
    return inTail(point, tail) || distanceToSegment(point, tail.from, tail.tip) <= 4 || distanceToSegment(point, tail.to, tail.tip) <= 4
  }
}

/** Price label: its point's price in a pill whose tail points at it, the pill in the drawing's fill
 *  and bordered in its stroke color, the price in its text style. */
export class PriceLabel extends Drawing {
  readonly type = 'price_label'

  requiredAnchors(): number {
    return 1
  }

  /** A format-2 price label filled its pill in its stroke color at 18%. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._style = { ...this._style, fillColor: this._style.lineColor, fillOpacity: 0.18 }
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
  /** A format-2 note's look, a box reading the price over the words, tied to the price, painted as
   *  format 2 did until the note's settings change. */
  savedLook: SavedLook
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
      savedLook: null,
    }
  }

  /** A format-2 price note was a box at its second point reading the first point's price over its
   *  words, in the drawing's fill, bordered in its stroke color and tied to the price in its stroke.
   *  It paints so until its settings change, and its tag's present props take the box's colors and
   *  type. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    const s = this._style
    this._props = {
      ...this._props,
      labelTextColor: s.textColor,
      labelFontSize: s.fontSize,
      labelBold: s.bold,
      labelItalic: s.italic,
      labelBackgroundColor: fillPaint(s) ?? withAlpha(s.lineColor, 0),
      labelBorderColor: s.lineColor,
      savedLook: {},
    }
  }

  override applyProps(patch: Partial<PriceNoteProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  /** A saved look's box: at the second point, reading the first point's price over the words. */
  protected savedBox(viewport: Viewport): { box: Box; text: string; target: Point } | null {
    const [price, at] = this.anchors
    const target = price && this.anchorToPixel(price, viewport)
    const p = at && this.anchorToPixel(at, viewport)
    if (!price || !target || !p) return null
    const value = this.formatPrice(price.price)
    const text = this.props.text ? `${value}\n${this.props.text}` : value
    const { width, height } = measureTextBlock(text || ' ', this.style)
    return { box: { x: p.x, y: p.y, width: width + 12, height: height + 12 }, text, target }
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
    if (this.props.savedLook) {
      const saved = this.savedBox(viewport)
      if (!saved) return
      applyStroke(ctx, this.style)
      strokeSegment(ctx, saved.target, edgeToward(saved.box, saved.target))
      paintTextBlock(ctx, saved.text || ' ', saved.box, this.style, { background: fillPaint(this.style) ?? undefined, borderColor: this.style.lineColor })
      return
    }
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
    if (this.props.savedLook) {
      const saved = this.savedBox(viewport)
      return !!saved && (inBox(point, saved.box) || distanceToSegment(point, saved.target, edgeToward(saved.box, saved.target)) <= 6)
    }
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

  /** A format-2 pin set its words on a dark plate at 95% with no border. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._style = { ...this._style, fillColor: '#1b1f27', fillOpacity: 0.95 }
    this._props = { ...this._props, fillBackground: true, drawBorder: false }
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
  /** A format-2 signpost's look, a dark plate over a stem planted at its point, painted as format 2
   *  did until the signpost's settings change. */
  savedLook: SavedLook
}

/** How far a signpost's post stops short of its bar, the room its plate keeps past its words across
 *  and down, its corners' radius, and its post's ink. */
const POST_GAP = 4
const PLATE_ROOM_ACROSS = 18
const PLATE_ROOM_DOWN = 11
const PLATE_RADIUS = 6
const POST_INK = '#808080'

/**
 * Signpost: a plate on a post, planted on a bar. The plate's bottom-centre is the signpost's
 * point, standing its position's share of the pane's height above the bar's high or below its low,
 * so it keeps its height over the bar as the price scale moves. A one pixel post runs from four
 * pixels off the bar to the plate. The plate is an outline in the chart's edge ink with corners
 * rounded at 6, its words centred in the chart's text ink on lines a quarter taller than their
 * size, so it is its widest line and 18px wide and 11px more than its lines tall, growing up. With
 * its emoji shown, the plate is the drawing's stroke color and leads with the emoji. Selected, it
 * shows a square handle on its point, which moves the plate up and down over its bar.
 */
export class Signpost extends Drawing<SignpostProps> {
  readonly type = 'signpost'

  protected override defaultProps(): SignpostProps {
    return { text: '', showImage: false, emoji: '🙂', position: null, savedLook: null }
  }

  requiredAnchors(): number {
    return 1
  }

  /** A format-2 signpost was a dark plate bordered in its stroke color over a stem from its point,
   *  a dot at its foot. It paints so until its settings change, its point where it was saved. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, savedLook: {} }
  }

  override applyProps(patch: Partial<SignpostProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  /** A saved look's plate: above the point, the stem's height over it. */
  protected savedPlate(viewport: Viewport): { box: Box; p: Point } | null {
    const anchor = this.anchors[0]
    const p = anchor && super.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.props.text || ' ', this.style)
    return { box: { x: p.x - (width + 12) / 2, y: p.y - 34 - height, width: width + 12, height: height + 12 }, p }
  }

  protected paintSavedLook(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const plate = this.savedPlate(viewport)
    if (!plate) return
    const { box, p } = plate
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
    paintTextBlock(ctx, this.props.text || ' ', { x: box.x, y: box.y }, this.style, { background: withAlpha('#1b1f27', 0.95), borderColor: this.style.lineColor })
  }

  /** A signpost first stood on a pane takes its position from the point it was placed at. */
  override attached(params: SeriesAttachedParameter<Time>): void {
    super.attached(params)
    const anchor = this.anchors[0]
    const viewport = this.getViewport()
    if (this.props.savedLook || this.props.position !== null || !anchor || !viewport) return
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

  /** The handle stands where the plate meets its pole, or at the point while the saved look stands. */
  override anchorToPixel(anchor: Anchor, viewport: Viewport): Point | null {
    if (this.props.savedLook) return super.anchorToPixel(anchor, viewport)
    return this.stand(viewport, anchor)?.plate ?? null
  }

  /** A move of the plate stands it over the bar under the point, the point's height away. A move
   *  that keeps the foot's price, as typing a bar does, keeps the plate's height over the new bar. */
  override updateAnchor(index: number, anchor: Anchor): void {
    const current = this.anchors[0]
    const viewport = this.getViewport()
    if (index !== 0 || !current || this.props.savedLook) {
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

  /** The plate's box and its words, its emoji, and its post's column and ends. */
  protected plate(viewport: Viewport): { box: Box; words: WordsPlace; emoji: { x: number; y: number; size: number } | null; post: { x: number; from: number; to: number } | null } | null {
    const stand = this.stand(viewport)
    if (!stand) return null
    const { block, placeholder } = this.shownWords(lineMeasure(this.style))
    const shown = placeholder ?? block
    const lineHeight = Math.round(this.style.fontSize * 1.25)
    const emoji = this.props.showImage && this.props.emoji ? Math.round(this.style.fontSize * 1.4) : 0
    const gap = emoji && shown.width ? 4 : 0
    const content = emoji + gap + shown.width
    const textHeight = shown.lines.length * lineHeight
    const inner = Math.max(emoji, textHeight)
    const width = Math.round(content + PLATE_ROOM_ACROSS)
    const height = inner + PLATE_ROOM_DOWN
    const ax = Math.round(stand.plate.x)
    const ay = Math.round(stand.plate.y)
    // The plate's bottom row is its point's.
    const box = { x: ax - Math.floor(width / 2), y: ay - height + 1, width, height }
    const start = ax - content / 2
    const top = box.y + PLATE_ROOM_DOWN / 2
    const words = { box, x: start + emoji + gap, y: top + (inner - textHeight) / 2, lineHeight, block, placeholder }
    const footY = Math.round(stand.foot.y)
    const span = stand.above ? { from: ay + 1, to: footY - POST_GAP + 1 } : { from: footY + POST_GAP, to: box.y }
    return {
      box,
      words,
      emoji: emoji ? { x: start, y: top + (inner - emoji) / 2, size: emoji } : null,
      post: span.to > span.from ? { x: ax + 0.5, ...span } : null,
    }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.props.savedLook && !this.textDraft) {
      this.paintSavedLook(ctx, viewport)
      return
    }
    const plate = this.plate(viewport)
    if (!plate) return
    const { box, words } = plate
    const inks = this.inks()
    const filled = !!plate.emoji
    ctx.save()
    ctx.setLineDash([])
    ctx.lineWidth = 1
    if (plate.post) {
      ctx.strokeStyle = POST_INK
      ctx.beginPath()
      ctx.moveTo(plate.post.x, plate.post.from)
      ctx.lineTo(plate.post.x, plate.post.to)
      ctx.stroke()
    }
    // The outline's pixel rides the plate's edge, so the path stands half a pixel in.
    ctx.beginPath()
    ctx.roundRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1, PLATE_RADIUS)
    if (filled) {
      ctx.fillStyle = this.style.lineColor
      ctx.fill()
    }
    ctx.strokeStyle = filled ? this.style.lineColor : inks.edge
    ctx.stroke()
    ctx.restore()
    if (plate.emoji) {
      const { x, y, size } = plate.emoji
      const url = this.glyphUrl(this.props.emoji)
      const art = url ? glyphArtwork(url, () => this.requestUpdate()) : null
      if (art) ctx.drawImage(art, x, y, size, size)
      else {
        ctx.save()
        ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillStyle = '#000000'
        ctx.fillText(this.props.emoji, x, y)
        ctx.restore()
      }
    }
    paintTextEntry(ctx, {
      x: words.x,
      y: words.y,
      width: (words.placeholder ?? words.block).width,
      lineHeight: words.lineHeight,
      font: fontOf(this.style),
      color: filled ? inkOn(this.style.lineColor) : inks.text,
      align: 'center',
      block: words.block,
      placeholder: words.placeholder ? { block: words.placeholder, alpha: PLACEHOLDER_ALPHA } : null,
      draft: this.textDraft,
      measure: lineMeasure(this.style),
    })
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const plate = this.plate(viewport)
    return plate ? wordsFrame(plate.words, fontOf(this.style), 'center') : null
  }

  /** The signpost's handle is square. */
  override handleShape(): 'circle' | 'square' {
    return 'square'
  }

  /** Its handle moves the plate up and down over its bar: the bar stays. */
  override dragAnchorTo(index: number, anchor: Anchor): void {
    const current = this.anchors[index]
    this.updateAnchor(index, current && !this.props.savedLook ? { time: current.time, price: anchor.price } : anchor)
  }

  /** The words are the plate's. */
  override wordsAt(point: Point, viewport: Viewport): boolean {
    if (this.props.savedLook) return this.testHit(point, viewport)
    const plate = this.plate(viewport)
    return !!plate && inBox(point, plate.box)
  }

  /** Over the plate of a selected signpost the pointer reads as typing, which a press there does. */
  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    return this.state === 'selected' && this.wordsAt(point, viewport) ? 'text' : null
  }

  /** An empty signpost shows its placeholder on its own plate, so it needs no hint above it. */
  override paintTextHint(): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    if (this.props.savedLook) {
      const saved = this.savedPlate(viewport)
      return !!saved && inBox(point, saved.box)
    }
    const plate = this.plate(viewport)
    if (!plate) return false
    if (inBox(point, plate.box)) return true
    return !!plate.post && Math.abs(point.x - plate.post.x) <= 5 && point.y >= plate.post.from - 2 && point.y <= plate.post.to + 2
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
