import type { Anchor, DrawingStyle, Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { distanceToSegment, extendSegment } from '../core/geometry'
import { applyStroke, paintLabel, strokeSegment, withAlpha } from '../render/canvas'
import { endSavedLook, savedLevels, type SavedLook } from '../core/savedLook'
import { boxDivisions, levelBox, paintBoxLabels, priceY, timeX, upgradeBoxLevels, type BoxLevelsProps, type LevelBox } from './boxLevels'
import { fibLevelColor, type FibLevel } from './fibonacci'

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
  /** One fill over the whole box in this color, under its bands and divisions; null for none. */
  tint: string | null
}

/** The levels a format-2 gann box, square or fixed square save that names none divided by. */
const SAVED_BOX_LEVELS: readonly FibLevel[] = [0, 0.25, 0.382, 0.5, 0.618, 0.75, 1].map((value) => ({ value, visible: true }))

/** Levels in the colors format 2 gave them: each shown level the palette's color for its place
 *  among the shown ones. */
function savedLevelColors(levels: readonly FibLevel[]): FibLevel[] {
  let shown = 0
  return levels.map((level, i) => ({ ...level, color: level.color ?? fibLevelColor(level, level.visible ? shown++ : i) }))
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
      tint: null,
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

  /** A format-2 box counted its divisions from its first corner, divided both its sides by one set of
   *  levels in the colors format 2 gave them, labelled them before its left side alone, and drew a
   *  tint of its stroke's color at 5% over the box in place of bands. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const levels = savedLevelColors(Array.isArray(saved.levels) ? savedLevels(saved) : SAVED_BOX_LEVELS)
    const labels = saved.showLabels !== false
    this._props = {
      ...this._props,
      priceLevels: levels,
      timeLevels: levels.map((l) => ({ ...l })),
      reverse: true,
      showLeftLabels: labels,
      showRightLabels: false,
      showTopLabels: false,
      showBottomLabels: false,
      fillPriceBackground: false,
      fillTimeBackground: false,
      tint: saved.background === false ? null : withAlpha(this._style.lineColor, 0.05),
    }
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
    if (props.tint) {
      ctx.fillStyle = props.tint
      ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top)
    }
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

/** A gann square's line: shown or not, in its color at its width. */
export type GannLine = { visible: boolean; color: string; width: number }

/** A gann square's fan line or arc, at a ratio of the square's unit: `x` units along its time side
 *  for `y` along its price side. */
export type GannRatioLine = GannLine & { x: number; y: number }

/** A gann square's lines: a grid of six lines across it and down it at its fifths, fan lines from
 *  its first corner at their ratios, arcs about that corner as long as their ratios, the bands
 *  between neighbouring arcs, and which corner it counts from. */
export type GannSquareProps = {
  levels: GannLine[]
  fans: GannRatioLine[]
  arcs: GannRatioLine[]
  fillBackground: boolean
  backgroundOpacity: number
  /** Count from the second corner rather than the first. */
  reverse: boolean
  /** A format-2 square's box levels, labels and tint, painted as format 2 did until the square's
   *  settings change. */
  savedLook: SavedLook
}

/** A gann square held to a price per bar: its price side spans `scaleRatio` for every bar its time
 *  side spans, a ratio taken from the pane when it is first drawn so it opens square. Its price and
 *  bar ranges and their ratio read under it, in the drawing's text size, weight and slant, while
 *  `showLabels` is on. */
export type GannRatioSquareProps = GannSquareProps & {
  scaleRatio: number | null
  showLabels: boolean
}

const line = (color: string, visible: boolean): GannLine => ({ visible, color, width: 2 })
const ratio = (x: number, y: number, color: string, visible: boolean): GannRatioLine => ({ x, y, visible, color, width: 2 })

/** The six grid lines, from the first corner's edges to the far ones. */
const SQUARE_LEVELS = (): GannLine[] => ['#808080', '#ff9800', '#00bcd4', '#4caf50', '#089981', '#808080'].map((c) => line(c, true))

/** The eleven fan lines, flattest first: 2x1, 1x1 and 1x2 shown. */
const SQUARE_FANS = (): GannRatioLine[] => [
  ratio(8, 1, '#b39ddb', false),
  ratio(5, 1, '#f23645', false),
  ratio(4, 1, '#808080', false),
  ratio(3, 1, '#ff9800', false),
  ratio(2, 1, '#00bcd4', true),
  ratio(1, 1, '#4caf50', true),
  ratio(1, 2, '#089981', true),
  ratio(1, 3, '#089981', false),
  ratio(1, 4, '#2962ff', false),
  ratio(1, 5, '#9575cd', false),
  ratio(1, 8, '#b39ddb', false),
]

/** The eleven arcs, nearest first, every one shown. */
const SQUARE_ARCS = (): GannRatioLine[] => [
  ratio(1, 0, '#ff9800', true),
  ratio(1, 1, '#ff9800', true),
  ratio(1.5, 0, '#ff9800', true),
  ratio(2, 0, '#00bcd4', true),
  ratio(2, 1, '#00bcd4', true),
  ratio(3, 0, '#4caf50', true),
  ratio(3, 1, '#4caf50', true),
  ratio(4, 0, '#089981', true),
  ratio(4, 1, '#089981', true),
  ratio(5, 0, '#2962ff', true),
  ratio(5, 1, '#2962ff', true),
]

const SQUARE_PROPS = (): GannSquareProps => ({ levels: SQUARE_LEVELS(), fans: SQUARE_FANS(), arcs: SQUARE_ARCS(), fillBackground: true, backgroundOpacity: 0.2, reverse: false, savedLook: null })

/** A gann ratio as its row and its label write it: so many units along the time side for so many
 *  along the price side. */
export const gannRatioText = (r: { x: number; y: number }): string => `${r.x}x${r.y}`

/** Whether a saved set of square lines has the shape a square reads: each a color and a width. */
const isSquareLines = (lines: unknown): boolean => Array.isArray(lines) && lines.every((l) => typeof l?.color === 'string' && typeof l?.width === 'number')

/** The props a saved square keeps: the ones it reads in the shape it reads them, and its background
 *  switch under its earlier name. */
function squareProps<P extends GannSquareProps>(saved: Partial<P>, defaults: P): Partial<P> {
  const from = saved as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(defaults)) {
    if (!(key in from)) continue
    if ((key === 'levels' || key === 'fans' || key === 'arcs') && !isSquareLines(from[key])) continue
    out[key] = from[key]
  }
  if (typeof from.background === 'boolean' && !('fillBackground' in from)) out.fillBackground = from.background
  return out as Partial<P>
}

/** A format-2 box between two corners: a tint of the stroke's color at 5% over it where its
 *  background showed, each shown level dividing both its sides in the color format 2 gave it, and
 *  each level's ratio before its left side where its labels showed. */
function paintSavedBox(ctx: CanvasRenderingContext2D, style: Readonly<DrawingStyle>, look: NonNullable<SavedLook>, a: Point, b: Point): void {
  const levels = savedLevels(look).filter((l) => l.visible)
  if (look.background !== false) {
    ctx.save()
    ctx.fillStyle = withAlpha(style.lineColor, 0.05)
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    ctx.restore()
  }
  for (const [i, level] of levels.entries()) {
    const color = fibLevelColor(level, i)
    ctx.save()
    applyStroke(ctx, style)
    ctx.strokeStyle = color
    const y = a.y + (b.y - a.y) * level.value
    strokeSegment(ctx, { x: a.x, y }, { x: b.x, y })
    const x = a.x + (b.x - a.x) * level.value
    strokeSegment(ctx, { x, y: a.y }, { x, y: b.y })
    ctx.restore()
    if (look.showLabels !== false) paintLabel(ctx, String(level.value), { x: Math.min(a.x, b.x) - 6, y }, { ...style, textColor: color }, { align: 'right' })
  }
}

/** Whether a point is on a format-2 box's divisions. */
function hitsSavedBox(point: Point, tolerance: number, look: NonNullable<SavedLook>, a: Point, b: Point): boolean {
  const inX = point.x >= Math.min(a.x, b.x) - tolerance && point.x <= Math.max(a.x, b.x) + tolerance
  const inY = point.y >= Math.min(a.y, b.y) - tolerance && point.y <= Math.max(a.y, b.y) + tolerance
  if (!inX || !inY) return false
  return savedLevels(look).some((l) => l.visible && (Math.abs(point.y - (a.y + (b.y - a.y) * l.value)) <= tolerance || Math.abs(point.x - (a.x + (b.x - a.x) * l.value)) <= tolerance))
}

/** A square's frame: its sides, the corner it counts from and the one across from it, and its unit,
 *  a fifth of each side. */
type SquareFrame = { origin: Point; ux: number; uy: number; left: number; right: number; top: number; bottom: number }

/** The square's arcs nearest first, each with its radius in units. */
const shownArcs = (arcs: readonly GannRatioLine[]): { arc: GannRatioLine; r: number }[] =>
  arcs
    .filter((a) => a.visible)
    .map((arc) => ({ arc, r: Math.hypot(arc.x, arc.y) }))
    .filter((a) => a.r > 0)
    .sort((p, q) => p.r - q.r)

/** A gann square: a grid at fifths, fan lines and arcs from its first corner, all inside the square,
 *  and the bands between its arcs. */
export abstract class GannSquareBase<P extends GannSquareProps> extends Drawing<P> {
  requiredAnchors(): number {
    return 2
  }

  /** A format-2 square was a box divided both ways by one set of levels, with a tint and its levels'
   *  ratios before it. It paints so until its settings change. */
  protected override keepSavedLook(saved: Readonly<Record<string, unknown>>): void {
    const look = {
      levels: Array.isArray(saved.levels) ? saved.levels : SAVED_BOX_LEVELS,
      showLabels: saved.showLabels !== false,
      background: saved.background !== false,
    }
    this._props = { ...this._props, savedLook: look }
  }

  override applyProps(patch: Partial<P>): void {
    super.applyProps(endSavedLook(patch))
  }

  /** The box a saved look divides: the two corners, the fixed square's squared. */
  protected savedBox(viewport: Viewport): { a: Point; b: Point } | null {
    return this.corners(viewport)
  }

  /** What a saved look draws over its box beside its divisions. */
  protected paintSavedExtras(_ctx: CanvasRenderingContext2D, _a: Point, _b: Point): void {}

  /** The two corners the square stands between, on the pane. */
  protected corners(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b || a.x === b.x || a.y === b.y) return null
    return { a, b }
  }

  protected frame(viewport: Viewport): SquareFrame | null {
    const c = this.corners(viewport)
    if (!c) return null
    const [origin, far] = this.props.reverse ? [c.b, c.a] : [c.a, c.b]
    return {
      origin,
      ux: (far.x - origin.x) / 5,
      uy: (far.y - origin.y) / 5,
      left: Math.min(c.a.x, c.b.x),
      right: Math.max(c.a.x, c.b.x),
      top: Math.min(c.a.y, c.b.y),
      bottom: Math.max(c.a.y, c.b.y),
    }
  }

  /** A point of the square: `x` units along its time side and `y` along its price side from the
   *  corner it counts from. */
  protected at(f: SquareFrame, x: number, y: number): Point {
    return { x: f.origin.x + f.ux * x, y: f.origin.y + f.uy * y }
  }

  /** A fan line's end: where its ratio meets the square's far sides. */
  protected fanEnd(f: SquareFrame, fan: GannRatioLine): Point {
    const scale = 5 / Math.max(fan.x, fan.y)
    return this.at(f, fan.x * scale, fan.y * scale)
  }

  /** Trace an arc about the square's first corner: an ellipse through its ratio's length on both
   *  sides, which the square's own edges cut to a quarter. */
  protected traceArc(ctx: CanvasRenderingContext2D, f: SquareFrame, r: number, back = false): void {
    ctx.ellipse(f.origin.x, f.origin.y, Math.abs(f.ux) * r, Math.abs(f.uy) * r, 0, back ? Math.PI * 2 : 0, back ? 0 : Math.PI * 2, back)
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    if (this.props.savedLook) {
      const box = this.savedBox(viewport)
      if (!box) return
      paintSavedBox(ctx, this.style, this.props.savedLook, box.a, box.b)
      this.paintSavedExtras(ctx, box.a, box.b)
      return
    }
    const f = this.frame(viewport)
    if (!f) return
    const { props } = this
    ctx.save()
    ctx.beginPath()
    ctx.rect(f.left, f.top, f.right - f.left, f.bottom - f.top)
    ctx.clip()
    const arcs = shownArcs(props.arcs)
    if (props.fillBackground && props.backgroundOpacity > 0) {
      // Each band reaches from the arc inside it out to its own arc, in its own arc's color.
      arcs.forEach(({ arc, r }, i) => {
        ctx.fillStyle = withAlpha(arc.color, props.backgroundOpacity)
        ctx.beginPath()
        this.traceArc(ctx, f, r)
        if (i > 0) this.traceArc(ctx, f, arcs[i - 1]!.r, true)
        ctx.fill()
      })
    }
    for (const { arc, r } of arcs) {
      applyStroke(ctx, { ...this.style, lineColor: arc.color, lineWidth: arc.width, lineStyle: 'solid' })
      ctx.beginPath()
      this.traceArc(ctx, f, r)
      ctx.stroke()
    }
    props.levels.forEach((level, i) => {
      if (!level.visible) return
      applyStroke(ctx, { ...this.style, lineColor: level.color, lineWidth: level.width, lineStyle: 'solid' })
      const p = this.at(f, i, i)
      strokeSegment(ctx, { x: f.left, y: p.y }, { x: f.right, y: p.y })
      strokeSegment(ctx, { x: p.x, y: f.top }, { x: p.x, y: f.bottom })
    })
    for (const fan of props.fans) {
      if (!fan.visible || Math.max(fan.x, fan.y) <= 0) continue
      applyStroke(ctx, { ...this.style, lineColor: fan.color, lineWidth: fan.width, lineStyle: 'solid' })
      strokeSegment(ctx, f.origin, this.fanEnd(f, fan))
    }
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const tolerance = hitTolerance(this.style.lineWidth)
    if (this.props.savedLook) {
      const box = this.savedBox(viewport)
      return !!box && (hitsSavedBox(point, tolerance, this.props.savedLook, box.a, box.b) || this.hitsSavedExtras(point, tolerance, box.a, box.b))
    }
    const f = this.frame(viewport)
    if (!f) return false
    if (point.x < f.left - tolerance || point.x > f.right + tolerance || point.y < f.top - tolerance || point.y > f.bottom + tolerance) return false
    for (const [i, level] of this.props.levels.entries()) {
      if (!level.visible) continue
      const p = this.at(f, i, i)
      if (Math.abs(point.y - p.y) <= tolerance || Math.abs(point.x - p.x) <= tolerance) return true
    }
    for (const fan of this.props.fans) {
      if (fan.visible && Math.max(fan.x, fan.y) > 0 && distanceToSegment(point, f.origin, this.fanEnd(f, fan)) <= tolerance) return true
    }
    // An arc is an ellipse about the first corner: a point is on it where its distance in units is
    // the arc's length.
    const ux = Math.abs(f.ux) || 1
    const uy = Math.abs(f.uy) || 1
    const units = Math.hypot((point.x - f.origin.x) / ux, (point.y - f.origin.y) / uy)
    return shownArcs(this.props.arcs).some(({ r }) => Math.abs(units - r) <= tolerance / Math.min(ux, uy))
  }

  /** Whether a point is on what a saved look draws beside its divisions. */
  protected hitsSavedExtras(_point: Point, _tolerance: number, _a: Point, _b: Point): boolean {
    return false
  }
}

/** Gann square: a square in price per bar, its second corner held at the ratio's price for the bars
 *  between its corners, reading its ranges and ratio under it. */
export class GannSquare extends GannSquareBase<GannRatioSquareProps> {
  readonly type = 'gannbox_square'

  protected override defaultProps(): GannRatioSquareProps {
    return { ...SQUARE_PROPS(), scaleRatio: null, showLabels: true }
  }

  protected override upgradeProps(props: Partial<GannRatioSquareProps>): Partial<GannRatioSquareProps> {
    return squareProps(props, this.defaultProps())
  }

  override setAnchors(anchors: Anchor[]): void {
    super.setAnchors(anchors)
    this.holdRatio()
  }

  override updateAnchor(index: number, anchor: Anchor): void {
    super.updateAnchor(index, anchor)
    this.holdRatio()
  }

  override applyProps(patch: Partial<GannRatioSquareProps>): void {
    super.applyProps(patch)
    if ('scaleRatio' in patch) this.holdRatio()
  }

  /** A format-2 square crossed its box corner to corner. */
  protected override paintSavedExtras(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
    ctx.save()
    applyStroke(ctx, this.style)
    strokeSegment(ctx, a, b)
    strokeSegment(ctx, { x: a.x, y: b.y }, { x: b.x, y: a.y })
    ctx.restore()
  }

  protected override hitsSavedExtras(point: Point, tolerance: number, a: Point, b: Point): boolean {
    return distanceToSegment(point, a, b) <= tolerance || distanceToSegment(point, { x: a.x, y: b.y }, { x: b.x, y: a.y }) <= tolerance
  }

  /** The price per bar the pane shows a square at now: the price a run of bars as wide as the
   *  square's time side spans when stood upright from its first corner. */
  private paneRatio(viewport: Viewport, a: Anchor, b: Anchor, bars: number): number | null {
    const pa = this.anchorToPixel(a, viewport)
    const pb = this.anchorToPixel(b, viewport)
    if (!pa || !pb) return null
    const up = viewport.priceAt(pa.y - Math.abs(pb.x - pa.x))
    return up === null ? null : Math.abs(up - a.price) / Math.abs(bars)
  }

  /** Hold the second corner on the ratio: at its own bar, as far above or below the first corner as
   *  the ratio sets for the bars between them. A square first drawn before it has a ratio takes the
   *  pane's, so it opens square. */
  private holdRatio(): void {
    // A format-2 square spans its corners freely while it paints as format 2 did.
    if (this.props.savedLook) return
    const viewport = this.getViewport()
    const [a, b] = this.anchors
    if (!viewport || !a || !b) return
    const bars = viewport.barsBetween(a.time, b.time)
    if (bars === null || bars === 0) return
    let perBar = this.props.scaleRatio
    if (perBar === null || !(perBar > 0)) {
      perBar = this.paneRatio(viewport, a, b, bars)
      if (perBar === null || !(perBar > 0)) return
      super.applyProps({ scaleRatio: perBar })
    }
    const price = a.price + (b.price < a.price ? -1 : 1) * perBar * Math.abs(bars)
    if (price !== b.price) super.updateAnchor(1, { ...b, price })
  }

  override paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    super.paint(ctx, viewport)
    if (!this.props.showLabels || this.props.savedLook) return
    const f = this.frame(viewport)
    const [a, b] = this.anchors
    const bars = a && b ? viewport.barsBetween(a.time, b.time) : null
    if (!f || !a || !b || bars === null || bars === 0) return
    const range = Math.abs(b.price - a.price)
    const perBar = Number((range / Math.abs(bars)).toFixed(7))
    const text = `${this.formatPrice(range)}, ${Math.round(Math.abs(bars))} bars, ${perBar}`
    const ink = this.props.levels[0]?.color ?? this.style.lineColor
    paintLabel(ctx, text, { x: (f.left + f.right) / 2, y: f.bottom + 4 }, { ...this.style, textColor: ink }, { align: 'center', baseline: 'top' })
  }
}

/** Gann square fixed: a square on the pane whatever its scale, the longer drag setting both sides. */
export class GannSquareFixed extends GannSquareBase<GannSquareProps> {
  readonly type = 'gannbox_fixed'

  protected override defaultProps(): GannSquareProps {
    return SQUARE_PROPS()
  }

  protected override upgradeProps(props: Partial<GannSquareProps>): Partial<GannSquareProps> {
    return squareProps(props, this.defaultProps())
  }

  protected override corners(viewport: Viewport): { a: Point; b: Point } | null {
    const [a, b] = this.anchorPixels(viewport)
    if (!a || !b) return null
    const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    if (size === 0) return null
    return { a, b: { x: a.x + Math.sign(b.x - a.x || 1) * size, y: a.y + Math.sign(b.y - a.y || 1) * size } }
  }
}

/** A gann fan's settings: its rays at their price-to-time ratios, each in its own stroke, the bands
 *  between neighbouring rays, and each ray's ratio read at its end. */
export type GannFanProps = {
  levels: FibLevel[]
  fillBackground: boolean
  backgroundOpacity: number
  showLabels: boolean
}

/** The nine fan ratios, price units per time unit, flattest first. */
const FAN_LEVELS = (): FibLevel[] =>
  (
    [
      [1 / 8, '#ff9800'],
      [1 / 4, '#089981'],
      [1 / 3, '#4caf50'],
      [1 / 2, '#089981'],
      [1, '#00bcd4'],
      [2, '#2962ff'],
      [3, '#9c27b0'],
      [4, '#e91e63'],
      [8, '#f23645'],
    ] as const
  ).map(([value, color]) => ({ value, visible: true, color, width: 2, style: 'solid' }))

/** A fan ratio as its row and its label write it: 1/8 to 8/1. */
export const fanRatioText = (value: number): string => (value >= 1 ? `${Math.round(value)}/1` : `1/${Math.round(1 / value)}`)

/** The 1/8 to 8/1 fan rays from an origin, scaled by the drag's price and time spans. */
export class GannFan extends Drawing<GannFanProps> {
  readonly type = 'gannbox_fan'

  protected override defaultProps(): GannFanProps {
    return { levels: FAN_LEVELS(), fillBackground: true, backgroundOpacity: 0.2, showLabels: true }
  }

  /** A fan saved with its background switch as `background` reads it as `fillBackground`. */
  protected override upgradeProps(props: Partial<GannFanProps>): Partial<GannFanProps> {
    const from = props as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(this.defaultProps())) if (key in from) out[key] = from[key]
    if (typeof from.background === 'boolean' && !('fillBackground' in from)) out.fillBackground = from.background
    return out as Partial<GannFanProps>
  }

  /** A format-2 fan drew no bands and its rays in the colors format 2 gave them. */
  protected override keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {
    this._props = { ...this._props, levels: savedLevelColors(this._props.levels), fillBackground: false }
  }

  requiredAnchors(): number {
    return 2
  }

  protected rays(viewport: Viewport): { level: FibLevel; color: string; a: Point; b: Point }[] {
    const [p1, p2] = this.anchorPixels(viewport)
    if (!p1 || !p2 || p1.x === p2.x || p1.y === p2.y) return []
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    return this.props.levels
      .map((level, i) => ({ level, color: fibLevelColor(level, i) }))
      .filter((e) => e.level.visible && e.level.value > 0)
      .map((e) => ({ ...e, a: p1, b: extendSegment(p1, { x: p1.x + dx, y: p1.y + dy * e.level.value }, viewport.width, viewport.height, false, true).b }))
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const rays = this.rays(viewport)
    if (this.props.fillBackground && this.props.backgroundOpacity > 0) {
      // Each band reaches from the flatter ray beside it to its own, in its own ray's color.
      const ordered = [...rays].sort((p, q) => p.level.value - q.level.value)
      for (let i = 1; i < ordered.length; i++) {
        ctx.save()
        ctx.fillStyle = withAlpha(ordered[i]!.color, this.props.backgroundOpacity)
        ctx.beginPath()
        ctx.moveTo(ordered[i]!.a.x, ordered[i]!.a.y)
        ctx.lineTo(ordered[i - 1]!.b.x, ordered[i - 1]!.b.y)
        ctx.lineTo(ordered[i]!.b.x, ordered[i]!.b.y)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
    }
    for (const ray of rays) {
      ctx.save()
      applyStroke(ctx, { ...this.style, lineColor: ray.color, lineWidth: ray.level.width ?? this.style.lineWidth, lineStyle: ray.level.style ?? this.style.lineStyle })
      strokeSegment(ctx, ray.a, ray.b)
      ctx.restore()
      if (this.props.showLabels) paintLabel(ctx, fanRatioText(ray.level.value), { x: ray.b.x - 8, y: ray.b.y }, { ...this.style, textColor: ray.color }, { align: 'right' })
    }
  }

  testHit(point: Point, viewport: Viewport): boolean {
    return this.rays(viewport).some((ray) => distanceToSegment(point, ray.a, ray.b) <= hitTolerance(ray.level.width ?? this.style.lineWidth))
  }
}
