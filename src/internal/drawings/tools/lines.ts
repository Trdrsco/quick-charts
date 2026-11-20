import type { ISeriesPrimitiveAxisView, Time } from 'lightweight-charts'

import type { ControlPoint, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { angleOf, distanceToSegment, extendSegment, midpoint, segmentTextAngle } from '../core/geometry'
import { endSavedLook, type SavedLook } from '../core/savedLook'
import type { TextBlock, TextEditFrame } from '../core/textEntry'
import { applyStroke, fontOf, inkOn, lineMeasure, paintArrowHead, paintLabel, strokeSegment, withAlpha } from '../render/canvas'
import { AxisLabel } from '../render/axis-view'
import { inRegion, paintInvitation, placeAt, wordsOffset, type InvitationRegion, type WordsPlace } from '../render/lineWords'
import { paintStatsBox, STATS_FONT_SIZE, statsBoxAt, type StatsRow } from '../render/statsBox'
import { paintTextEntry } from '../render/textEntry'

export type LineEnd = 'normal' | 'arrow'

/** Where a line's stats stand along it: near its left end, at its middle, near its right end, or
 *  near the right end unless the pane leaves no room there, then near the left. */
export type StatsPosition = 'left' | 'center' | 'right' | 'auto'

/** Where a label stands across what carries it: above it, on it, or below it. A box's label stands
 *  above it, inside it, or below it. */
export type TextVAlign = 'top' | 'middle' | 'bottom'

/** Where a label stands along what carries it. */
export type TextHAlign = 'left' | 'center' | 'right'

/** The two-point line family's full option set. Tool identity = these defaults. */
export type TrendLineProps = {
  /** The line's words, typed on the chart or in the settings' Text tab. */
  text: string
  extendLeft: boolean
  extendRight: boolean
  leftEnd: LineEnd
  rightEnd: LineEnd
  /** Marker at the segment's midpoint. */
  middlePoint: boolean
  /** Price pill beside each end point. */
  showPriceLabels: boolean
  /** Stats readout items (price delta, percent change, the change counted in the symbol's smallest
   *  price move, bar count, span, length on the pane, slope angle). The count shows only where the
   *  chart knows that move. */
  showPriceRange: boolean
  showPercentChange: boolean
  showPipsChange: boolean
  showBarsRange: boolean
  showDateTimeRange: boolean
  showDistance: boolean
  showAngle: boolean
  statsPosition: StatsPosition
  /** The stats show whether or not the line is selected. Off, they show while it is. */
  alwaysShowStats: boolean
  /** Where the label stands across the line and along it. */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
  /** A format-2 line's look, its ends, words and stats painted as format 2 did until its settings
   *  change. */
  savedLook: SavedLook
}

const LINE_PROPS: TrendLineProps = {
  text: '',
  extendLeft: false,
  extendRight: false,
  leftEnd: 'normal',
  rightEnd: 'normal',
  middlePoint: false,
  showPriceLabels: false,
  showPriceRange: false,
  showPercentChange: false,
  showPipsChange: false,
  showBarsRange: false,
  showDateTimeRange: false,
  showDistance: false,
  showAngle: false,
  statsPosition: 'right',
  alwaysShowStats: false,
  textVAlign: 'top',
  textHAlign: 'center',
  savedLook: null,
}

/** How a format-2 label stood across a line it rode: its offset from the line and the edge of the
 *  text that offset is measured to. */
const ACROSS: Record<TextVAlign, { y: number; baseline: 'bottom' | 'middle' | 'top' }> = {
  top: { y: -4, baseline: 'bottom' },
  middle: { y: 0, baseline: 'middle' },
  bottom: { y: 4, baseline: 'top' },
}

/** How far a level's words stand in from the end of the pane they align to. */
const LEVEL_WORDS_INSET = 7

/** Where a level line's square handle stands along it: nine tenths of the way across the pane. */
const LEVEL_HANDLE_AT = 0.9

function hitTolerance(lineWidth: number): number {
  return Math.max(6, lineWidth / 2 + 4)
}

/** A coordinate a line of a width strokes on so it lands on whole pixels: a pixel's middle for an
 *  odd width, a pixel's edge for an even one. */
function crisp(v: number, width: number): number {
  return Math.round(v) + (Math.round(width) % 2 === 1 ? 0.5 : 0)
}

/** The open head a line's arrow end wears at its tip: two strokes back from the tip at 45 degrees
 *  either side of the line, `5 + 2.5 x width` along and across it, laid into the path being built. */
function openHead(ctx: CanvasRenderingContext2D, from: Point, tip: Point, lineWidth: number): void {
  const length = Math.hypot(tip.x - from.x, tip.y - from.y)
  if (!(length > 0)) return
  const ux = (tip.x - from.x) / length
  const uy = (tip.y - from.y) / length
  const size = 5 + 2.5 * lineWidth
  ctx.moveTo(tip.x - size * ux - size * uy, tip.y - size * uy + size * ux)
  ctx.lineTo(tip.x, tip.y)
  ctx.lineTo(tip.x - size * ux + size * uy, tip.y - size * uy - size * ux)
}

/** A count written with its thousands grouped. */
function grouped(n: number): string {
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `-${digits}` : digits
}

/** A span of time written in its two largest units. */
function spanText(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

/** A block of words laid on a place: its box's top-left and width, before the place's turn. */
interface WordsBox {
  left: number
  top: number
  width: number
  lines: number
}

/** Where a block of words stands about the point it is placed on: aligned along at its end or
 *  middle, and its rows growing away from the line it rides, so the row nearest the line keeps its
 *  place as more are typed. */
function wordsBox(place: WordsPlace, block: TextBlock, lineHeight: number, across: TextVAlign): WordsBox {
  const lines = Math.max(1, block.lines.length)
  const width = block.width
  const left = place.align === 'left' ? 0 : place.align === 'right' ? -width : -width / 2
  const first = -lineHeight / 2 - 1
  const top = across === 'top' ? first - (lines - 1) * lineHeight : across === 'bottom' ? first : first - ((lines - 1) * lineHeight) / 2
  return { left, top, width, lines }
}

/**
 * The words a line family member carries and types on the chart. Every line lays them out the same
 * way about the place its own geometry gives them: the selected line without words invites them
 * there with a plus and its placeholder at half strength, an open edit paints its draft there, and
 * the editor's field is laid over that place, turned with the words.
 */
abstract class LineWords<P extends Record<string, unknown> & { text: string }> extends Drawing<P> {
  /** Where the words stand, or null where they cannot. */
  protected abstract wordsPlace(viewport: Viewport): WordsPlace | null

  /** Which way the words' lines grow away from what carries them. */
  protected abstract wordsAcross(): TextVAlign

  /** Whether the line invites words while it is selected without any. */
  protected invites(): boolean {
    return true
  }

  protected wordsBlock(): { block: TextBlock; placeholder: TextBlock | null } {
    return this.shownWords(lineMeasure(this.style))
  }

  /** Paint the words, or an open edit's draft with its placeholder at half strength while it is
   *  empty. */
  protected paintWords(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const draft = this.textDraft
    if (!draft && this.props.text === '') return
    const place = this.wordsPlace(viewport)
    if (!place) return
    const { block, placeholder } = this.wordsBlock()
    const shown = draft ? (placeholder ?? block) : block
    const box = wordsBox(place, shown, this.style.fontSize, this.wordsAcross())
    ctx.save()
    ctx.translate(place.x, place.y)
    if (place.angle) ctx.rotate(place.angle)
    paintTextEntry(ctx, {
      x: box.left,
      y: box.top,
      width: box.width,
      lineHeight: this.style.fontSize,
      font: fontOf(this.style),
      color: this.style.textColor,
      align: place.align,
      block,
      placeholder: draft && placeholder ? { block: placeholder, alpha: 0.5 } : null,
      draft,
      measure: lineMeasure(this.style),
    })
    ctx.restore()
  }

  override textFrame(viewport: Viewport): TextEditFrame | null {
    const place = this.wordsPlace(viewport)
    if (!place) return null
    const { block, placeholder } = this.wordsBlock()
    const shown = placeholder ?? block
    const box = wordsBox(place, shown, this.style.fontSize, this.wordsAcross())
    const at = placeAt(place, box.left, box.top)
    return { x: at.x, y: at.y, width: box.width, lines: box.lines, lineHeight: this.style.fontSize, font: fontOf(this.style), align: place.align, wrapWidth: null, angle: place.angle }
  }

  /** The region the words cover, turned with them; null without words. */
  protected wordsRegion(viewport: Viewport): InvitationRegion | null {
    if (this.props.text === '' && !this.textDraft) return null
    const place = this.wordsPlace(viewport)
    if (!place) return null
    const { block, placeholder } = this.wordsBlock()
    const shown = this.textDraft && placeholder ? placeholder : block
    const lineHeight = this.style.fontSize
    const box = wordsBox(place, shown, lineHeight, this.wordsAcross())
    const middle = placeAt(place, box.left + box.width / 2, box.top + (box.lines * lineHeight) / 2)
    return { cx: middle.x, cy: middle.y, angle: place.angle, halfW: box.width / 2 + 2, halfH: (box.lines * lineHeight) / 2 + 2 }
  }

  override wordsAt(point: Point, viewport: Viewport): boolean {
    const region = this.wordsRegion(viewport)
    return !!region && inRegion(point, region)
  }

  /** The selected line without words invites them where they would stand. */
  override paintTextHint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this.noteTextHint(null)
    if (this.state !== 'selected' || this.textEditing || this.props.text !== '' || !this.invites()) return
    const place = this.wordsPlace(viewport)
    if (!place) return
    this.noteTextHint(paintInvitation(ctx, this.textPlaceholder(), place, this.style, lineMeasure(this.style)))
  }

  /** Over its words or its invitation the selected line reads as words, and over a handle as the
   *  handle it is. */
  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    const handle = this.handleCursor(point, viewport)
    if (handle) return handle
    if (this.state === 'selected' && (this.wordsAt(point, viewport) || this.hitTextHint(point))) return 'text'
    return null
  }

  /** The cursor a handle under a point wears, or null where none is. */
  protected handleCursor(point: Point, viewport: Viewport): string | null {
    const near = this.getControlPoints(viewport).some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= 6.5)
    return near ? this.handleCursorName() : null
  }

  protected handleCursorName(): string {
    return 'default'
  }

  /** The line's handles show in their thin form while the pointer rests on it. */
  override handlesOnHover(): boolean {
    return true
  }

  /** A press on the words or the invitation of the selected line lands on the line. */
  protected hitWords(point: Point, viewport: Viewport): boolean {
    if (this.wordsAt(point, viewport)) return true
    return this.state === 'selected' && this.hitTextHint(point)
  }
}

/** The look a selected line marks its points on the axes with: the accent's pill, white words. */
const pointLabel = (drawing: Drawing<Record<string, unknown>>, coordinate: () => number | null, text: () => string, shown: () => boolean): AxisLabel =>
  new AxisLabel({
    coordinate,
    text,
    color: () => drawing.inks().accent,
    textColor: () => '#ffffff',
    visible: shown,
  })

/**
 * Two-anchor straight line. The whole family (trend line, ray, extended line, arrow, info line,
 * trend angle) is this geometry under different prop defaults and decorations.
 */
export class TrendLine extends LineWords<TrendLineProps> {
  readonly type: string = 'trend_line'

  private readonly _priceViews: readonly ISeriesPrimitiveAxisView[] = [0, 1].map((i) =>
    pointLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const viewport = this.getViewport()
        const anchor = this.anchors[i]
        return viewport && anchor ? viewport.yOf(anchor.price) : null
      },
      () => this.formatPrice(this.anchors[i]?.price ?? 0),
      () => this.marksAxes() && !!this.anchors[i],
    ),
  )

  private readonly _timeViews: readonly ISeriesPrimitiveAxisView[] = [0, 1].map((i) =>
    pointLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const viewport = this.getViewport()
        const anchor = this.anchors[i]
        return viewport && anchor ? viewport.xOf(anchor.time) : null
      },
      () => this.formatTime(this.anchors[i]?.time),
      () => this.marksAxes() && !!this.anchors[i],
    ),
  )

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS }
  }

  override applyProps(patch: Partial<TrendLineProps>): void {
    super.applyProps(endSavedLook(patch))
  }

  requiredAnchors(): number {
    return 2
  }

  /** The selected line marks its points' prices and times on the axes. */
  protected marksAxes(): boolean {
    return (this.state === 'selected' || this.state === 'editing') && this.isVisibleNow()
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._priceViews
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._timeViews
  }

  protected override axisSpans(): { prices: readonly number[] | null; times: readonly Time[] | null } {
    return { prices: this.anchors.map((a) => a.price), times: this.anchors.map((a) => a.time) }
  }

  /** While its second point is being placed, the point following the pointer shows no handle. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const points = super.getControlPoints(viewport)
    return this.state === 'editing' ? points.filter((p) => p.index < this.anchors.length - 1) : points
  }

  /** The words ride the segment's slope at its middle or at the end they align to, above, on or
   *  below it. */
  protected wordsPlace(viewport: Viewport): WordsPlace | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const angle = segmentTextAngle(pa, pb)
    // Left and right are the screen's: the end nearer the left edge is the left one, whichever
    // anchor it is.
    const [left, right] = pa.x <= pb.x ? [pa, pb] : [pb, pa]
    const along = this.props.textHAlign
    const at = along === 'left' ? left : along === 'right' ? right : midpoint(pa, pb)
    const across = this.props.textVAlign === 'top' ? -wordsOffset(this.style.fontSize) : this.props.textVAlign === 'bottom' ? wordsOffset(this.style.fontSize) : 0
    const p = placeAt({ x: at.x, y: at.y, angle, align: along }, 0, across)
    return { x: p.x, y: p.y, angle, align: along }
  }

  protected wordsAcross(): TextVAlign {
    return this.props.textVAlign
  }

  /** The on-screen segment after extension, the shared basis for painting and hit-testing. */
  protected segment(viewport: Viewport): { a: Point; b: Point } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const { extendLeft, extendRight } = this.props
    if (!extendLeft && !extendRight) return { a: pa, b: pb }
    return extendSegment(pa, pb, viewport.width, viewport.height, extendLeft, extendRight)
  }

  /** A format-2 line showed its stats whether or not it was selected and counted no price moves; a
   *  stats position counted its left and right from the first point, and a save naming none stood
   *  them at the middle. Its ends, words and stats paint as format 2 painted them. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const position = (saved.statsPosition ?? 'center') as StatsPosition
    const [a, b] = this._anchors
    const flipped = !!a && !!b && Number(b.time) < Number(a.time)
    const statsPosition: StatsPosition = flipped && position === 'left' ? 'right' : flipped && position === 'right' ? 'left' : position
    this._props = { ...this._props, statsPosition, alwaysShowStats: true, showPipsChange: false, savedLook: {} }
  }

  /** The stats stand while the line is selected or edited, or always where the viewer asked. */
  protected statsShown(): boolean {
    return this.props.alwaysShowStats || this.state !== 'normal'
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const seg = this.segment(viewport)
    if (!seg) return
    if (this.props.savedLook) {
      this.paintSavedLook(ctx, viewport, seg)
      return
    }
    // One path: an arrow end's open head, then the shaft from end to end.
    applyStroke(ctx, this.style)
    ctx.beginPath()
    if (this.props.rightEnd === 'arrow') openHead(ctx, seg.a, seg.b, this.style.lineWidth)
    if (this.props.leftEnd === 'arrow') openHead(ctx, seg.b, seg.a, this.style.lineWidth)
    ctx.moveTo(seg.a.x, seg.a.y)
    ctx.lineTo(seg.b.x, seg.b.y)
    ctx.stroke()
    this.paintMarks(ctx, viewport)
    this.paintWords(ctx, viewport)
    this.paintStats(ctx, viewport)
    this.paintDecorations(ctx, viewport)
  }

  /** The midpoint marker and the end price pills, as their props ask. */
  private paintMarks(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    if (this.props.middlePoint) {
      const mid = midpoint(pa, pb)
      ctx.save()
      ctx.setLineDash([])
      ctx.fillStyle = this.style.lineColor
      ctx.beginPath()
      ctx.arc(mid.x, mid.y, Math.max(2.5, this.style.lineWidth), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
    if (this.props.showPriceLabels) {
      const [a, b] = this.anchors
      paintLabel(ctx, this.formatPrice(a.price), { x: pa.x - 8, y: pa.y }, this.style, { align: 'right', background: withAlpha(this.style.lineColor, 0.2) })
      paintLabel(ctx, this.formatPrice(b.price), { x: pb.x + 8, y: pb.y }, this.style, { background: withAlpha(this.style.lineColor, 0.2) })
    }
  }

  /** The stats box: rows of the price move, the span and the angle, each led by its mark, standing
   *  off the point along the line the stats position names, below and right of a line that rises
   *  and above and right of one that falls. */
  private paintStats(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (!this.statsShown()) return
    const rows = this.statsRows(viewport)
    if (rows.length === 0) return
    const at = this.statsPoint(viewport)
    if (!at) return
    const type: DrawingStyle = { ...this.style, fontSize: STATS_FONT_SIZE, bold: false, italic: false }
    const sized = statsBoxAt({ x: 0, y: 0 }, rows, lineMeasure(type))
    const box = { ...sized, x: Math.round(at.point.x + 12), y: Math.round(at.rising ? at.point.y + 11 : at.point.y - 11 - sized.height) }
    paintStatsBox(ctx, box, rows, fontOf(type))
  }

  /** Where the stats stand along the line, and whether it rises left to right. */
  private statsPoint(viewport: Viewport): { point: Point; rising: boolean } | null {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return null
    const [left, right] = pa.x <= pb.x ? [pa, pb] : [pb, pa]
    const toRight = (f: number): Point => ({ x: left.x + (right.x - left.x) * f, y: left.y + (right.y - left.y) * f })
    const place = this.props.statsPosition
    const t = place === 'left' ? 0.12 : place === 'center' ? 0.5 : place === 'auto' && toRight(0.88).x > viewport.width * 0.85 ? 0.12 : 0.88
    return { point: toRight(t), rising: right.y <= left.y }
  }

  /** The stats rows: the price move with its percent and its count of the symbol's smallest moves;
   *  the bars and the time it spans with its length on the pane; and its angle. A row whose items
   *  are all off is left out. */
  protected statsRows(viewport: Viewport): StatsRow[] {
    const [a, b] = this.anchors
    if (!a || !b) return []
    const rows: StatsRow[] = []
    const dPrice = b.price - a.price
    const price: string[] = []
    if (this.props.showPriceRange) price.push(this.formatPrice(dPrice))
    if (this.props.showPercentChange) {
      const pct = (a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0).toFixed(2)
      price.push(price.length ? `(${pct}%)` : `${pct}%`)
    }
    let priceRow = price.join(' ')
    // The count rides only on a host-stated move; without one the row omits it.
    const tick = this.tickSize()
    if (this.props.showPipsChange && tick !== null && tick > 0) {
      const moves = grouped(Math.round(dPrice / tick))
      priceRow = priceRow ? `${priceRow}, ${moves}` : moves
    }
    if (priceRow) rows.push({ kind: 'price', text: priceRow })
    const span: string[] = []
    if (this.props.showBarsRange) {
      const bars = viewport.barsBetween(a.time, b.time)
      if (bars !== null) span.push(`${Math.round(bars)} bars`)
    }
    if (this.props.showDateTimeRange) {
      const secs = Math.abs(Number(b.time) - Number(a.time))
      if (Number.isFinite(secs) && secs > 0) span.push(span.length ? `(${spanText(secs)})` : spanText(secs))
    }
    let spanRow = span.join(' ')
    const [pa, pb] = this.anchorPixels(viewport)
    if (this.props.showDistance && pa && pb) {
      const distance = `distance: ${Math.round(Math.hypot(pb.x - pa.x, pb.y - pa.y))} px`
      spanRow = spanRow ? `${spanRow}, ${distance}` : distance
    }
    if (spanRow) rows.push({ kind: 'span', text: spanRow })
    if (this.props.showAngle && pa && pb) rows.push({ kind: 'angle', text: `${((-angleOf(pa, pb) * 180) / Math.PI).toFixed(1)}°` })
    return rows
  }

  /** Extra ink beyond the shared prop set: the family variants override. */
  protected paintDecorations(_ctx: CanvasRenderingContext2D, _viewport: Viewport): void {}

  testHit(point: Point, viewport: Viewport): boolean {
    const seg = this.segment(viewport)
    if (!seg) return false
    return distanceToSegment(point, seg.a, seg.b) <= hitTolerance(this.style.lineWidth) || this.hitWords(point, viewport)
  }

  // ============ The format-2 look ============

  /** A format-2 line: filled arrow heads, its words on a label across it, and its stats on a pill. */
  private paintSavedLook(ctx: CanvasRenderingContext2D, viewport: Viewport, seg: { a: Point; b: Point }): void {
    applyStroke(ctx, this.style)
    strokeSegment(ctx, seg.a, seg.b)
    if (this.props.leftEnd === 'arrow') paintArrowHead(ctx, seg.b, seg.a, this.style)
    if (this.props.rightEnd === 'arrow') paintArrowHead(ctx, seg.a, seg.b, this.style)
    this.paintMarks(ctx, viewport)
    const [pa, pb] = this.anchorPixels(viewport)
    if (pa && pb) {
      const textAngle = segmentTextAngle(pa, pb)
      const [left, right] = pa.x <= pb.x ? [pa, pb] : [pb, pa]
      if (this.textDraft) this.paintWords(ctx, viewport)
      else if (this.props.text) {
        const along = this.props.textHAlign
        const at = along === 'left' ? left : along === 'right' ? right : midpoint(pa, pb)
        const across = ACROSS[this.props.textVAlign] ?? ACROSS.top
        ctx.save()
        ctx.translate(at.x, at.y)
        ctx.rotate(textAngle)
        paintLabel(ctx, this.props.text, { x: 0, y: across.y }, this.style, { align: along === 'left' ? 'left' : along === 'right' ? 'right' : 'center', baseline: across.baseline })
        ctx.restore()
      }
      const stats = this.statsShown() ? this.savedStatsText(viewport) : null
      if (stats) {
        const place = this.props.statsPosition
        const toRight = (f: number): Point => ({ x: left.x + (right.x - left.x) * f, y: left.y + (right.y - left.y) * f })
        const t = place === 'left' ? 0.12 : place === 'center' ? 0.5 : place === 'auto' && toRight(0.88).x > viewport.width * 0.85 ? 0.12 : 0.88
        const at = toRight(t)
        // The stats pill drops below its usual perch when a label already sits above the line
        // where it stands.
        const crowded = !!this.props.text && this.props.textVAlign === 'top' && ((place === 'center' && this.props.textHAlign === 'center') || (t === 0.12 && this.props.textHAlign === 'left') || (t === 0.88 && this.props.textHAlign === 'right'))
        ctx.save()
        ctx.translate(at.x, at.y)
        ctx.rotate(textAngle)
        paintLabel(ctx, stats, { x: 0, y: crowded ? -32 : -14 }, this.style, { align: 'center', background: withAlpha('#1b1f27', 0.92) })
        ctx.restore()
      }
    }
    this.paintDecorations(ctx, viewport)
  }

  /** A format-2 line's stats on one line: signed moves, the bars, the span and the angle. */
  private savedStatsText(viewport: Viewport): string | null {
    const [a, b] = this.anchors
    if (!a || !b) return null
    const parts: string[] = []
    const dPrice = b.price - a.price
    if (this.props.showPriceRange) parts.push(`${dPrice >= 0 ? '+' : ''}${this.formatPrice(dPrice)}`)
    if (this.props.showPercentChange) {
      const pct = a.price !== 0 ? (dPrice / Math.abs(a.price)) * 100 : 0
      parts.push(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`)
    }
    if (this.props.showPipsChange) {
      const tick = this.tickSize()
      if (tick !== null && tick > 0) {
        const moves = Math.round(dPrice / tick)
        parts.push(`${moves >= 0 ? '+' : ''}${moves}`)
      }
    }
    if (this.props.showBarsRange) {
      const bars = viewport.barsBetween(a.time, b.time)
      if (bars !== null) parts.push(`${Math.round(bars)} bars`)
    }
    if (this.props.showDateTimeRange) {
      const secs = Math.abs(Number(b.time) - Number(a.time))
      if (Number.isFinite(secs) && secs > 0) parts.push(spanText(secs))
    }
    if (this.props.showAngle) {
      const [pa, pb] = this.anchorPixels(viewport)
      if (pa && pb) parts.push(`${(-angleOf(pa, pb) * (180 / Math.PI)).toFixed(0)}°`)
    }
    return parts.length ? parts.join('  ·  ') : null
  }
}

export class Ray extends TrendLine {
  override readonly type = 'ray'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, extendRight: true }
  }
}

export class ExtendedLine extends TrendLine {
  override readonly type = 'extended'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, extendLeft: true, extendRight: true }
  }
}

/** A line with an open head at its second point. Selected, its whole body reads as its words. */
export class Arrow extends TrendLine {
  override readonly type = 'arrow'

  protected override defaultProps(): TrendLineProps {
    return { ...LINE_PROPS, rightEnd: 'arrow' }
  }

  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    return super.cursorAt(point, viewport) ?? (this.state === 'selected' ? 'text' : null)
  }
}

/** Trend line whose identity is the full measurement readout. */
export class InfoLine extends TrendLine {
  override readonly type = 'info_line'

  protected override defaultProps(): TrendLineProps {
    return {
      ...LINE_PROPS,
      showPriceRange: true,
      showPercentChange: true,
      showPipsChange: true,
      showBarsRange: true,
      showDateTimeRange: true,
      showDistance: true,
      showAngle: true,
      statsPosition: 'center',
      alwaysShowStats: true,
    }
  }

  /** A format-2 info line that named no percent change or span showed neither, and no distance. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    super.keepSavedLook(saved)
    const props: Partial<TrendLineProps> = { showDistance: false }
    if (!('showPercentChange' in saved)) props.showPercentChange = false
    if (!('showDateTimeRange' in saved)) props.showDateTimeRange = false
    this._props = { ...this._props, ...props }
  }
}

/** Trend line that reports its slope: a dotted level 50px long from its first point, an arc of
 *  radius 50 swept from the level to the line, and the angle to one place beyond the arc. Its pages
 *  offer no ends and no label, since the angle is its reading; a save that carries them draws
 *  them. */
export class TrendAngle extends TrendLine {
  override readonly type = 'trend_angle'

  protected override invites(): boolean {
    return false
  }

  protected override paintDecorations(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const [pa, pb] = this.anchorPixels(viewport)
    if (!pa || !pb) return
    if (this.props.savedLook) {
      this.paintSavedAngle(ctx, pa, pb)
      return
    }
    const angle = angleOf(pa, pb)
    ctx.save()
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.setLineDash([1, 2])
    ctx.beginPath()
    ctx.moveTo(pa.x, pa.y)
    ctx.lineTo(pa.x + 50, pa.y)
    ctx.arc(pa.x, pa.y, 50, 0, angle, angle < 0)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = fontOf(this.style)
    ctx.fillStyle = this.style.lineColor
    ctx.textAlign = 'start'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${((-angle * 180) / Math.PI).toFixed(1)}°`, pa.x + 58.5, pa.y + 1)
    ctx.restore()
  }

  /** A format-2 trend angle's mark: a short dotted level and arc, the angle on a pill. */
  private paintSavedAngle(ctx: CanvasRenderingContext2D, pa: Point, pb: Point): void {
    const angle = angleOf(pa, pb)
    const angleDeg = -angle * (180 / Math.PI)
    const radius = Math.min(36, Math.hypot(pb.x - pa.x, pb.y - pa.y) / 2)
    if (radius > 8) {
      ctx.save()
      applyStroke(ctx, this.style)
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(pa.x, pa.y)
      ctx.lineTo(pa.x + radius + 12, pa.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(pa.x, pa.y, radius, 0, angle, angle < 0)
      ctx.stroke()
      ctx.restore()
    }
    paintLabel(ctx, `${angleDeg.toFixed(0)}°`, { x: pa.x + radius + 18, y: pa.y }, this.style, { background: withAlpha('#1b1f27', 0.92) })
  }
}

export type HorizontalLineProps = {
  /** The line's words. */
  text: string
  /** Price pill on the axis at the line's level. */
  showPrice: boolean
  /** Where the label stands across the line and along it. */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
}

/** A level's own pill on an axis, in its line's color: shown while its prop asks, or while the
 *  level is selected, then in the accent's pill. */
const levelLabel = (drawing: Drawing<Record<string, unknown>>, coordinate: () => number | null, text: () => string, own: () => boolean): AxisLabel => {
  const selected = (): boolean => drawing.state === 'selected' || drawing.state === 'editing'
  const color = (): string => (own() ? drawing.style.lineColor : drawing.inks().accent)
  return new AxisLabel({
    coordinate,
    text,
    color,
    textColor: () => inkOn(color()),
    visible: () => (own() || selected()) && drawing.isVisibleNow(),
  })
}

/** Full-width horizontal line at one price, its square handle nine tenths of the way across the
 *  pane: dragging it sets the level and the time under it. */
export class HorizontalLine extends LineWords<HorizontalLineProps> {
  readonly type: string = 'horizontal_line'

  private readonly _axisViews: readonly ISeriesPrimitiveAxisView[] = [
    levelLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        return anchor && viewport ? viewport.yOf(anchor.price) : null
      },
      () => this.formatPrice(this.anchors[0]?.price ?? 0),
      () => this.props.showPrice,
    ),
  ]

  protected override defaultProps(): HorizontalLineProps {
    return { text: '', showPrice: true, textVAlign: 'middle', textHAlign: 'center' }
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  protected override axisSpans(): { prices: readonly number[] | null; times: readonly Time[] | null } {
    return { prices: this.anchors.slice(0, 1).map((a) => a.price), times: null }
  }

  requiredAnchors(): number {
    return 1
  }

  override handleShape(): 'square' | 'circle' {
    return 'square'
  }

  protected override handleCursorName(): string {
    return 'ns-resize'
  }

  /** The square handle stands nine tenths of the way across the pane at the level. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const y = this.levelY(viewport)
    return y === null ? [] : [{ index: 0, x: viewport.width * LEVEL_HANDLE_AT, y }]
  }

  /** The level's height on the pane, or null off the scale. */
  protected levelY(viewport: Viewport): number | null {
    const y = viewport.yOf(this.anchors[0]?.price ?? NaN)
    return y === null || !Number.isFinite(y) ? null : y
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const level = this.levelY(viewport)
    if (level === null) return
    const y = crisp(level, this.style.lineWidth)
    applyStroke(ctx, this.style)
    ctx.lineCap = this.levelCap()
    ctx.lineJoin = 'miter'
    strokeSegment(ctx, { x: this.leftEdge(viewport), y }, { x: viewport.width, y })
    this.paintWords(ctx, viewport)
  }

  /** The cap the line's ends wear: square across the pane's edges, round at a ray's point. */
  protected levelCap(): CanvasLineCap {
    return 'butt'
  }

  /** The words stand above, on or below the drawn line, in from its left end, at its middle, or in
   *  from the pane's right edge. */
  protected wordsPlace(viewport: Viewport): WordsPlace | null {
    const level = this.levelY(viewport)
    if (level === null) return null
    const y = crisp(level, this.style.lineWidth)
    const start = this.leftEdge(viewport)
    const along = this.props.textHAlign
    const x = along === 'left' ? start + LEVEL_WORDS_INSET : along === 'right' ? viewport.width - LEVEL_WORDS_INSET : (start + viewport.width) / 2
    const across = this.props.textVAlign === 'top' ? -wordsOffset(this.style.fontSize) : this.props.textVAlign === 'bottom' ? wordsOffset(this.style.fontSize) : 0
    return { x, y: y + across, angle: 0, align: along }
  }

  protected wordsAcross(): TextVAlign {
    return this.props.textVAlign
  }

  /** Where the line starts; the ray variant starts at its anchor. */
  protected leftEdge(_viewport: Viewport): number {
    return 0
  }

  /** A format-2 line's label stood above its left side. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textVAlign: 'top', textHAlign: 'left' }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const y = this.levelY(viewport)
    if (y === null) return false
    const onLine = point.x >= this.leftEdge(viewport) - 4 && Math.abs(point.y - y) <= hitTolerance(this.style.lineWidth)
    return onLine || this.hitWords(point, viewport)
  }
}

/** Horizontal line from its anchor rightward, its round handle on its point. A selected ray
 *  invites no words: they are typed in its settings. */
export class HorizontalRay extends HorizontalLine {
  override readonly type = 'horizontal_ray'

  private readonly _rayTimeViews: readonly ISeriesPrimitiveAxisView[] = [
    pointLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        return anchor && viewport ? viewport.xOf(anchor.time) : null
      },
      () => this.formatTime(this.anchors[0]?.time),
      () => (this.state === 'selected' || this.state === 'editing') && this.isVisibleNow(),
    ),
  ]

  protected override defaultProps(): HorizontalLineProps {
    return { text: '', showPrice: true, textVAlign: 'bottom', textHAlign: 'center' }
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._rayTimeViews
  }

  protected override axisSpans(): { prices: readonly number[] | null; times: readonly Time[] | null } {
    const anchor = this.anchors[0]
    return { prices: anchor ? [anchor.price] : null, times: anchor ? [anchor.time] : null }
  }

  override handleShape(): 'square' | 'circle' {
    return 'circle'
  }

  protected override handleCursorName(): string {
    return 'default'
  }

  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const anchor = this.anchors[0]
    const p = anchor ? this.anchorToPixel(anchor, viewport) : null
    return p ? [{ index: 0, x: p.x, y: p.y }] : []
  }

  protected override invites(): boolean {
    return false
  }

  protected override levelCap(): CanvasLineCap {
    return 'round'
  }

  protected override leftEdge(viewport: Viewport): number {
    const anchor = this.anchors[0]
    if (!anchor) return 0
    const p = this.anchorToPixel(anchor, viewport)
    return p ? p.x : 0
  }
}

export type VerticalLineProps = {
  /** The line's words. */
  text: string
  /** Timestamp pill on the time axis. */
  showTime: boolean
  /** Where the label stands along the line (top, middle, bottom of the pane) and across it (to its
   *  left, on it, to its right). */
  textVAlign: TextVAlign
  textHAlign: TextHAlign
  /** Whether the label reads across the line or runs up it. */
  textOrientation: 'horizontal' | 'vertical'
}

/** Full-height vertical line at one time, its square handle nine tenths of the way down the pane:
 *  dragging it sets the time and the price under it. */
export class VerticalLine extends LineWords<VerticalLineProps> {
  readonly type = 'vertical_line'

  private readonly _timeViews: readonly ISeriesPrimitiveAxisView[] = [
    levelLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        return anchor && viewport ? viewport.xOf(anchor.time) : null
      },
      () => this.formatTime(this.anchors[0]?.time),
      () => this.props.showTime,
    ),
  ]

  protected override defaultProps(): VerticalLineProps {
    return { text: '', showTime: true, textVAlign: 'middle', textHAlign: 'center', textOrientation: 'vertical' }
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._timeViews
  }

  protected override axisSpans(): { prices: readonly number[] | null; times: readonly Time[] | null } {
    return { prices: null, times: this.anchors.slice(0, 1).map((a) => a.time) }
  }

  requiredAnchors(): number {
    return 1
  }

  override handleShape(): 'square' | 'circle' {
    return 'square'
  }

  protected override handleCursorName(): string {
    return 'ew-resize'
  }

  /** The square handle stands on the line nine tenths of the way down the pane. */
  override getControlPoints(viewport: Viewport): ControlPoint[] {
    const x = this.timeX(viewport)
    return x === null ? [] : [{ index: 0, x, y: viewport.height * LEVEL_HANDLE_AT }]
  }

  private timeX(viewport: Viewport): number | null {
    const anchor = this.anchors[0]
    return anchor ? viewport.xOf(anchor.time) : null
  }

  /** A format-2 line's label read across it, to its right at the top of the pane. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, textOrientation: 'horizontal', textVAlign: 'top', textHAlign: 'right' }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const time = this.timeX(viewport)
    if (time === null) return
    const x = crisp(time, this.style.lineWidth)
    applyStroke(ctx, this.style)
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    strokeSegment(ctx, { x, y: 0 }, { x, y: viewport.height })
    this.paintWords(ctx, viewport)
  }

  /** The words stand at the top, the middle or the bottom of the pane, to the line's left, on it or
   *  to its right. Running up the line they turn a quarter left, so the line's top is where they
   *  end; reading across it they stand level. */
  protected wordsPlace(viewport: Viewport): WordsPlace | null {
    const time = this.timeX(viewport)
    if (time === null) return null
    const x = crisp(time, this.style.lineWidth)
    const { textVAlign: along, textHAlign: across, textOrientation } = this.props
    const off = wordsOffset(this.style.fontSize)
    if (textOrientation === 'horizontal') {
      const y = along === 'top' ? off : along === 'bottom' ? viewport.height - off : viewport.height / 2
      const at = across === 'left' ? x - 4 : across === 'right' ? x + 4 : x
      return { x: at, y, angle: 0, align: across === 'left' ? 'right' : across === 'right' ? 'left' : 'center' }
    }
    const y = along === 'top' ? LEVEL_WORDS_INSET : along === 'bottom' ? viewport.height - LEVEL_WORDS_INSET : viewport.height / 2
    const at = across === 'left' ? x - off : across === 'right' ? x + off : x
    return { x: at, y, angle: -Math.PI / 2, align: along === 'top' ? 'right' : along === 'bottom' ? 'left' : 'center' }
  }

  protected wordsAcross(): TextVAlign {
    if (this.props.textOrientation === 'horizontal') return this.props.textVAlign === 'top' ? 'bottom' : this.props.textVAlign === 'bottom' ? 'top' : 'middle'
    return this.props.textHAlign === 'left' ? 'top' : this.props.textHAlign === 'right' ? 'bottom' : 'middle'
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const time = this.timeX(viewport)
    if (time === null) return false
    return Math.abs(point.x - time) <= hitTolerance(this.style.lineWidth) || this.hitWords(point, viewport)
  }
}

export type CrossLineProps = {
  /** Price pill on the axis at the cross's level. */
  showPrice: boolean
  /** Timestamp pill on the time axis at the cross's time. */
  showTime: boolean
}

/** Crosshair pinned to one point: a horizontal and a vertical line through the anchor, its round
 *  handle on the crossing. */
export class CrossLine extends Drawing<CrossLineProps> {
  readonly type = 'cross_line'

  private readonly _axisViews: readonly ISeriesPrimitiveAxisView[] = [
    levelLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        return anchor && viewport ? viewport.yOf(anchor.price) : null
      },
      () => this.formatPrice(this.anchors[0]?.price ?? 0),
      () => this.props.showPrice,
    ),
  ]

  private readonly _timeViews: readonly ISeriesPrimitiveAxisView[] = [
    levelLabel(
      this as unknown as Drawing<Record<string, unknown>>,
      () => {
        const anchor = this.anchors[0]
        const viewport = this.getViewport()
        return anchor && viewport ? viewport.xOf(anchor.time) : null
      },
      () => this.formatTime(this.anchors[0]?.time),
      () => this.props.showTime,
    ),
  ]

  protected override defaultProps(): CrossLineProps {
    return { showPrice: true, showTime: true }
  }

  protected override axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._axisViews
  }

  protected override timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return this._timeViews
  }

  protected override axisSpans(): { prices: readonly number[] | null; times: readonly Time[] | null } {
    const anchor = this.anchors[0]
    return { prices: anchor ? [anchor.price] : null, times: anchor ? [anchor.time] : null }
  }

  requiredAnchors(): number {
    return 1
  }

  override handlesOnHover(): boolean {
    return true
  }

  protected override cursorAt(point: Point, viewport: Viewport): string | null {
    return this.getControlPoints(viewport).some((p) => Math.hypot(p.x - point.x, p.y - point.y) <= 6.5) ? 'default' : null
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const width = this.style.lineWidth
    applyStroke(ctx, this.style)
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    strokeSegment(ctx, { x: 0, y: crisp(p.y, width) }, { x: viewport.width, y: crisp(p.y, width) })
    strokeSegment(ctx, { x: crisp(p.x, width), y: 0 }, { x: crisp(p.x, width), y: viewport.height })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const tolerance = hitTolerance(this.style.lineWidth)
    return Math.abs(point.y - p.y) <= tolerance || Math.abs(point.x - p.x) <= tolerance
  }
}
