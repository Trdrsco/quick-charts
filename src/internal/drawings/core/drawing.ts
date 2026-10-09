import type {
  IChartApi,
  ISeriesApi,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  PrimitiveHoveredItem,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts'
import { PriceScaleMode } from 'lightweight-charts'

import type {
  Anchor,
  ControlPoint,
  DrawingOptions,
  DrawingState,
  DrawingStyle,
  IDrawing,
  Point,
  GlyphSourcePort,
  PriceFormatPort,
  SerializedDrawing,
  Viewport,
} from './types'
import { DEFAULT_OPTIONS, DEFAULT_STYLE, SERIAL_VERSION } from './types'
import type { TimeframeContext } from './visibility'
import { normalizeVisibility, visibleAt } from './visibility'
import type { BarSource, SourceBar } from './bars'
import { layoutTextBlock, type TextBlock, type TextDraft, type TextEditFrame } from './textEntry'
import { DEFAULT_INKS, type DrawingInks } from './inks'
import { DrawingPaneView } from '../render/pane-view'
import type { HandleShape } from '../render/canvas'
import { drawing as englishWords } from '../../../i18n/en/drawing'

function normalizeOptions(patch: Partial<DrawingOptions>): DrawingOptions {
  return { ...DEFAULT_OPTIONS, ...patch, visibility: normalizeVisibility(patch.visibility) }
}

/** Any concrete drawing, prop shape erased — the store/registry currency. */
export type AnyDrawing = Drawing<Record<string, unknown>>


/** Build a Viewport over a chart + series pair. Null while either is unusable (torn down). */
export function viewportOf(chart: IChartApi, series: ISeriesApi<SeriesType>): Viewport | null {
  let width: number
  let height: number
  try {
    width = chart.timeScale().width()
    height = chart.paneSize().height
  } catch {
    return null
  }
  if (width <= 0 || height <= 0) return null
  const ts = chart.timeScale()

  // ── time ⇄ logical ⇄ x, grounded in the library's MEASURED contract ──
  // Two live measurements define what the time scale can be trusted with:
  //   (1) `timeToCoordinate` resolves only times that exist as bars of the CURRENT grid. An anchor
  //       placed on a finer timeframe (17:30 on an hourly chart) answers null.
  //   (2) `logicalToCoordinate` is exact for INTEGER indices inside the data — even thousands of
  //       pixels off-screen (index 0 answered -11448.34px while scrolled far right, and the slope
  //       between any two in-range integers equals the live barSpacing to full precision) — but
  //       answers 0, the pane's left edge, for EVERY fractional logical and for any integer outside
  //       the data. The visible logical range's endpoints are continuous scroll positions,
  //       fractional in every real frame, so calibrating a linear map from them reads two poisoned
  //       zeros and disables the map — which made every between-bars anchor (i.e. every drawing
  //       after a timeframe switch) paint nothing.
  // So the library is consulted only where it is exact — bar times, integer in-range indices, the
  // live barSpacing — and every fractional mapping is computed from the series data directly.
  const data = series.data()
  const lastIndex = data.length - 1
  const numTime = (i: number): number | null => {
    const t = data[i]?.time
    return typeof t === 'number' ? t : null
  }
  const firstTime = data.length > 0 ? numTime(0) : null
  const lastTime = data.length > 0 ? numTime(lastIndex) : null
  // Leading/trailing bar steps extrapolate beyond the loaded range: past the last bar is a
  // projection into empty future space, before the first is unloaded history.
  const prevTime = numTime(lastIndex - 1)
  const trailStep = lastTime !== null && prevTime !== null && lastTime > prevTime ? lastTime - prevTime : null
  const secondTime = numTime(1)
  const leadStep = firstTime !== null && secondTime !== null && secondTime > firstTime ? secondTime - firstTime : null

  const logicalOfTime = (time: Time): number | null => {
    // A time that IS a bar of the current grid takes the library's exact mapping. This also covers
    // non-numeric Time shapes, which the data math below cannot address.
    const x = ts.timeToCoordinate(time)
    if (x !== null) {
      const logical = ts.coordinateToLogical(x)
      if (logical !== null) return logical
    }
    if (typeof time !== 'number' || firstTime === null || lastTime === null) return null
    if (time >= lastTime) return trailStep === null ? lastIndex : lastIndex + (time - lastTime) / trailStep
    if (time <= firstTime) return leadStep === null ? 0 : (time - firstTime) / leadStep
    // Between bars: binary-search the straddling pair and interpolate inside it. Bar steps are
    // NOT uniform (session gaps), so proportional placement within the one straddling pair is the
    // only mapping that keeps a finer-grid anchor in place — counting bars at a fixed step from
    // either end would shift it by every gap in between.
    let lo = 0
    let hi = lastIndex
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      const tm = numTime(mid)
      if (tm === null) return null
      if (tm <= time) lo = mid
      else hi = mid
    }
    const tLo = numTime(lo)
    const tHi = numTime(hi)
    if (tLo === null || tHi === null || tHi <= tLo) return null
    return lo + (time - tLo) / (tHi - tLo)
  }

  // The inverse, from the same data: fractional logicals interpolate between their neighbouring
  // bars' times, out-of-range logicals extrapolate on the edge step. Never routed through
  // `logicalToCoordinate` — a fractional input there answers 0, and `coordinateToTime(0)` then
  // returns the LEFT EDGE bar's time: a silently wrong answer rather than a null.
  const timeOfLogicalIndex = (logical: number): Time | null => {
    if (firstTime === null || lastTime === null) return null
    if (logical >= lastIndex) return trailStep === null ? (lastTime as Time) : ((lastTime + (logical - lastIndex) * trailStep) as Time)
    if (logical <= 0) return leadStep === null ? (firstTime as Time) : ((firstTime + logical * leadStep) as Time)
    const i = Math.floor(logical)
    const tLo = numTime(i)
    const tHi = numTime(i + 1)
    if (tLo === null || tHi === null) return null
    return (tLo + (logical - i) * (tHi - tLo)) as Time
  }

  // logical → x: ONE trustworthy point (integer index 0, exact at any scroll position) plus the
  // live barSpacing; the x axis is linear by construction. Declines only when the chart is empty.
  let xAtLogical: (logical: number) => number | null = () => null
  if (data.length > 0) {
    const x0 = ts.logicalToCoordinate(0 as Parameters<typeof ts.logicalToCoordinate>[0])
    const barSpacing = ts.options().barSpacing
    if (x0 !== null && barSpacing > 0) xAtLogical = (logical) => x0 + logical * barSpacing
  }

  // The price scale's mode: a scale that cannot answer is read as linear.
  let logScale = false
  try {
    logScale = series.priceScale().options().mode === PriceScaleMode.Logarithmic
  } catch {
    logScale = false
  }

  return {
    width,
    height,
    logScale,
    xOf: (time) => {
      const direct = ts.timeToCoordinate(time)
      if (direct !== null) return direct
      const logical = logicalOfTime(time)
      if (logical === null) return null
      return xAtLogical(logical)
    },
    yOf: (price) => series.priceToCoordinate(price),
    timeAt: (x) => {
      const direct = ts.coordinateToTime(x)
      if (direct !== null) return direct
      const logical = ts.coordinateToLogical(x)
      if (logical === null) return null
      return timeOfLogicalIndex(logical)
    },
    priceAt: (y) => series.coordinateToPrice(y),
    barsBetween: (a, b) => {
      const la = logicalOfTime(a)
      const lb = logicalOfTime(b)
      if (la === null || lb === null) return null
      return lb - la
    },
    logicalOf: logicalOfTime,
    timeOfLogical: timeOfLogicalIndex,
  }
}

/**
 * Base class for every drawing tool: a lightweight-charts series primitive holding anchors
 * (chart coordinates), shared style, lifecycle options, and a typed tool-specific `props` bag.
 *
 * Deliberate non-features:
 * - No `autoscaleInfo`. Drawings are annotations — they must never stretch the price scale,
 *   so the primitive simply does not implement it.
 * - No DOM listeners. Input (placement, dragging, selection gestures) belongs to the host app;
 *   this class owns state, geometry, and pixels.
 *
 * Subclasses implement `paint` (canvas, CSS-pixel space) and `testHit`, and override
 * `defaultProps` when they carry tool-specific state. `props` round-trips through
 * `toJSON`/`fromJSON` in full — a tool's serialized form IS its complete state.
 */
/** What a drawing writes when no host formatter has been injected: cents, a DECLARED stand-in
 *  for an unhosted drawing. A host always injects the symbol's formatter; this is never a rule
 *  that reads precision off the price. */
const UNRESOLVED_PRICE_TEXT: PriceFormatPort = (price) => price.toFixed(2)

export abstract class Drawing<P extends Record<string, unknown> = Record<string, never>>
  implements IDrawing, ISeriesPrimitive<Time>
{
  readonly id: string
  /** Set when this drawing belongs to ONE surface; undefined when every surface showing the symbol
   *  shares it. Opaque here — the host assigns and compares it. */
  scope?: string
  abstract readonly type: string

  protected _anchors: Anchor[]
  protected _style: DrawingStyle
  protected _options: DrawingOptions
  protected _props: P
  protected _state: DrawingState = 'normal'
  private _timeframeContext: TimeframeContext = null
  private _globalHidden = false
  private _barSource: BarSource | null = null

  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType> | null = null
  private _requestUpdate: (() => void) | null = null
  private readonly _paneViews: IPrimitivePaneView[]

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<DrawingOptions> = {},
    props: Partial<P> = {},
  ) {
    this.id = id
    this._anchors = this.upgradeAnchors(anchors.map((a) => ({ ...a })))
    this._style = { ...DEFAULT_STYLE, ...style }
    this._options = normalizeOptions(options)
    this._props = { ...this.defaultProps(), ...this.upgradeProps(props) }
    this._paneViews = [new DrawingPaneView(this)]
  }

  /** Tool-specific defaults. Must not read instance fields (runs during construction). */
  protected defaultProps(): P {
    return {} as P
  }

  /** Saved props as this tool reads them now: a tool that renamed a prop maps the name it was saved
   *  under to the one it reads, so a drawing saved before keeps its setting. Must not read instance
   *  fields (runs during construction). */
  protected upgradeProps(props: Partial<P>): Partial<P> {
    return props
  }

  /** Saved anchors as this tool reads them now: a tool that gained a point completes a drawing saved
   *  without it, so the drawing keeps its shape. Must not read instance fields (runs during
   *  construction). */
  protected upgradeAnchors(anchors: Anchor[]): Anchor[] {
    return anchors
  }

  /** A preset's props as this tool reads them: a remembered default or a template written by an
   *  earlier format names its setup under the keys and meanings that format read, and the tool reads
   *  them as it reads a save's. */
  presetProps(props: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return { ...this.upgradeProps({ ...props } as Partial<P>) } as Record<string, unknown>
  }

  /** Paint a save from an earlier format as it painted: the registry calls this once, as it restores
   *  a save whose `v` is below the present format, after the props are upgraded. */
  holdSavedLook(saved: SerializedDrawing): void {
    this.keepSavedLook((saved.props ?? {}) as Readonly<Record<string, unknown>>)
    this.requestUpdate()
  }

  /** A tool whose factory values, prop meanings or paint rules differ from the ones format 2 painted
   *  with writes, from the props the save carries (`saved`, as written) and the style it restored
   *  with, the values that paint the save as it painted. */
  protected keepSavedLook(_saved: Readonly<Record<string, unknown>>): void {}

  // ============ ISeriesPrimitive ============

  attached(params: SeriesAttachedParameter<Time>): void {
    this._chart = params.chart
    this._series = params.series
    this._requestUpdate = params.requestUpdate
  }

  detached(): void {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.axisViews()
  }

  timeAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.timeViews()
  }

  /** Axis pills this drawing contributes (a horizontal line's price marker); default none. */
  protected axisViews(): readonly ISeriesPrimitiveAxisView[] {
    return []
  }

  /** Time-axis pills (a vertical line's timestamp marker); default none. */
  protected timeViews(): readonly ISeriesPrimitiveAxisView[] {
    return []
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this.isVisibleNow()) return null
    const viewport = this.getViewport()
    if (!viewport) return null
    if (!this.testHit({ x, y }, viewport)) return null
    return {
      cursorStyle: this._options.locked ? 'default' : (this.cursorAt({ x, y }, viewport) ?? 'pointer'),
      externalId: this.id,
      zOrder: 'normal',
    }
  }

  /** Position-specific hover cursor (a table divider's col-resize); null = the default pointer. */
  protected cursorAt(_point: Point, _viewport: Viewport): string | null {
    return null
  }

  // ============ State ============

  get anchors(): readonly Anchor[] {
    return this._anchors
  }

  get style(): Readonly<DrawingStyle> {
    return this._style
  }

  get options(): Readonly<DrawingOptions> {
    return this._options
  }

  get props(): Readonly<P> {
    return this._props
  }

  get state(): DrawingState {
    return this._state
  }

  set state(value: DrawingState) {
    this.setState(value)
  }

  setAnchors(anchors: Anchor[]): void {
    this._anchors = anchors.map((a) => ({ ...a }))
    this.requestUpdate()
  }

  updateAnchor(index: number, anchor: Anchor): void {
    if (index < 0 || index >= this._anchors.length) return
    this._anchors[index] = { ...anchor }
    this.requestUpdate()
  }

  /** Grow the anchor set (freehand strokes, multi-point paths). */
  appendAnchor(anchor: Anchor): void {
    this._anchors.push({ ...anchor })
    this.requestUpdate()
  }

  removeAnchor(index: number): void {
    if (index < 0 || index >= this._anchors.length) return
    this._anchors.splice(index, 1)
    this.requestUpdate()
  }

  updateStyle(patch: Partial<DrawingStyle>): void {
    this._style = { ...this._style, ...patch }
    this.requestUpdate()
  }

  updateOptions(patch: Partial<DrawingOptions>): void {
    this._options = {
      ...this._options,
      ...patch,
      visibility: patch.visibility ? normalizeVisibility(patch.visibility) : this._options.visibility,
    }
    this.requestUpdate()
  }

  setTimeframeContext(context: TimeframeContext): void {
    this._timeframeContext = context
    this.requestUpdate()
  }

  /** Chart-wide hide-all switch (transient view state — never serialized). */
  setGlobalHidden(hidden: boolean): void {
    this._globalHidden = hidden
    this.requestUpdate()
  }

  /** Host bar feed for data-driven tools (regression, profiles, VWAP, bar patterns). */
  setBarSource(source: BarSource | null): void {
    this._barSource = source
    this.requestUpdate()
  }

  protected bars(): readonly SourceBar[] {
    return this._barSource?.() ?? []
  }

  private _tickSize: number | null = null

  /** The symbol's smallest price move; a tick-denominated readout is omitted without it rather
   *  than inferred from the data. */
  setTickSize(tick: number | null): void {
    this._tickSize = tick && tick > 0 ? tick : null
    this.requestUpdate()
  }

  /** The symbol's tick as the host stated it, or null without one. */
  getTickSize(): number | null {
    return this.tickSize()
  }

  private _currencyCode: string | null = null

  /** The currency the symbol is quoted in, the unit an amount is written in. */
  setCurrencyCode(code: string | null): void {
    this._currencyCode = code && code.trim() ? code.trim() : null
    this.requestUpdate()
  }

  /** The currency the symbol is quoted in, or null where the host states none. */
  getCurrencyCode(): string | null {
    return this._currencyCode
  }

  protected tickSize(): number | null {
    return this._tickSize
  }

  private _priceFormat: PriceFormatPort | null = null

  /** The symbol's price formatter, from the host. */
  setPriceFormatter(format: PriceFormatPort | null): void {
    this._priceFormat = format
    this.requestUpdate()
  }

  /** A price as the symbol writes it: every label, pill and readout comes through here. */
  protected formatPrice(price: number): string {
    return (this._priceFormat ?? UNRESOLVED_PRICE_TEXT)(price)
  }

  private _glyphSource: GlyphSourcePort | null = null

  /** The host's glyph artwork source. Per instance, not per process: two charts on one page may
   *  be handed different asset sets, and a module-level hook could only ever hold one. */
  setGlyphSource(source: GlyphSourcePort | null): void {
    this._glyphSource = source
    this.requestUpdate()
  }

  /** The artwork URL for a glyph, or null to draw it as text. */
  protected glyphUrl(glyph: string): string | null {
    return this._glyphSource ? this._glyphSource(glyph) : null
  }

  isVisibleNow(): boolean {
    return !this._globalHidden && this._options.visible && visibleAt(this._options.visibility, this._timeframeContext)
  }

  applyProps(patch: Partial<P>): void {
    this._props = { ...this._props, ...patch }
    this.requestUpdate()
  }

  setState(state: DrawingState): void {
    if (this._state === state) return
    this._state = state
    this.requestUpdate()
  }

  requestUpdate(): void {
    this._requestUpdate?.()
  }

  // ============ Geometry ============

  getViewport(): Viewport | null {
    if (!this._chart || !this._series) return null
    return viewportOf(this._chart, this._series)
  }

  anchorToPixel(anchor: Anchor, viewport: Viewport): Point | null {
    const x = viewport.xOf(anchor.time)
    const y = viewport.yOf(anchor.price)
    if (x === null || y === null) return null
    return { x, y }
  }

  /** Anchor pixels in order; entries are null while an anchor is outside the loaded range. */
  protected anchorPixels(viewport: Viewport): (Point | null)[] {
    return this._anchors.map((a) => this.anchorToPixel(a, viewport))
  }

  getControlPoints(viewport: Viewport): ControlPoint[] {
    const points: ControlPoint[] = []
    for (let i = 0; i < this._anchors.length; i++) {
      const p = this.anchorToPixel(this._anchors[i], viewport)
      if (p) points.push({ index: i, x: p.x, y: p.y })
    }
    return points
  }

  isValid(): boolean {
    return (
      this._anchors.length >= this.requiredAnchors() &&
      this._anchors.every((a) => Number.isFinite(a.price))
    )
  }

  /** Anchor count that completes placement. */
  abstract requiredAnchors(): number

  /** Paint the drawing. CSS-pixel coordinate space; the shared pane view sets the transform. */
  abstract paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void

  /**
   * Mid-placement preview, painted while the anchor set is still short of `requiredAnchors`.
   * Default: a dashed construction polyline through the anchors placed so far — the finished
   * geometry only appears once every point exists (a fib projection draws its trend leg first).
   */
  paintConstruction(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const points = this.anchorPixels(viewport).filter((p): p is Point => !!p)
    if (points.length < 2) return
    ctx.save()
    ctx.strokeStyle = this._style.lineColor
    ctx.lineWidth = Math.max(1, this._style.lineWidth - 0.5)
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
    ctx.stroke()
    ctx.restore()
  }

  /**
   * Extra grab points beyond the anchors (an emoji's scale corners). Dragging one routes to
   * `resizeTo`. Default: none.
   */
  resizeHandles(_viewport: Viewport): Point[] {
    return []
  }

  resizeTo(_handleIndex: number, _point: Point, _viewport: Viewport): void {}

  private _textHint: { cx: number; cy: number; angle: number; halfW: number; halfH: number } | null = null

  /** An inline text editor is open on this drawing (transient view state — never serialized). */
  textEditing = false

  /**
   * "+ Add text" hint above a selected text-capable drawing that has no text yet. Pressing the
   * painted region routes to the inline text editor. Two-point drawings ride the segment's angle
   * (the hint sits along a sloped trend line); everything else sits level above the bounds.
   * Painted as UI chrome (fixed muted paint), not with the drawing's own text style.
   */
  /** The hint label's CENTER: level above the drawing's bounds by default. Tools whose text
   *  rides their own geometry override — a trend line's hint slopes with the segment, a
   *  rectangle's sits dead-center in the box, an arrow marker's at the butt end. Two corner
   *  anchors are NOT a segment (a box tool's hint must stay level). */
  protected textHintPlacement(points: Point[]): { x: number; y: number; angle: number } {
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: Math.max(12, Math.min(...points.map((p) => p.y)) - 16),
      angle: 0,
    }
  }

  paintTextHint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this._textHint = null
    if (this.textEditing) return
    // The invitation belongs to a tool that DECLARES a label. A stored drawing may carry a text
    // key its tool no longer has, and a stray key is not a channel.
    if (!('text' in (this.defaultProps() as Record<string, unknown>))) return
    const text = (this._props as Record<string, unknown>).text
    if (typeof text !== 'string' || text !== '') return
    const points = this.anchorPixels(viewport).filter((p): p is Point => !!p)
    if (points.length === 0) return
    const { x: mx, y: my, angle } = this.textHintPlacement(points)
    const label = '+ Add text'
    ctx.save()
    ctx.translate(mx, my)
    ctx.rotate(angle)
    ctx.font = '12px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(178, 181, 190, 0.95)'
    ctx.fillText(label, 0, 0)
    const width = ctx.measureText(label).width
    ctx.restore()
    this._textHint = {
      cx: mx,
      cy: my,
      angle,
      halfW: width / 2 + 6,
      halfH: 10,
    }
  }

  hitTextHint(point: Point): boolean {
    const r = this._textHint
    if (!r) return false
    const dx = point.x - r.cx
    const dy = point.y - r.cy
    const cos = Math.cos(-r.angle)
    const sin = Math.sin(-r.angle)
    const rx = dx * cos - dy * sin
    const ry = dx * sin + dy * cos
    return Math.abs(rx) <= r.halfW && Math.abs(ry) <= r.halfH
  }

  textHintAnchor(): { x: number; y: number; angle: number } | null {
    const r = this._textHint
    return r ? { x: r.cx, y: r.cy, angle: r.angle } : null
  }

  // ============ Words typed on the chart ============

  private _textDraft: TextDraft | null = null
  private _onTextFrame: ((frame: TextEditFrame | null) => void) | null = null
  private _textFrameKey: string | null = null
  private _placeholder: (() => string) | null = null

  /** The draft an open inline edit shows on this drawing (transient view state, never serialized):
   *  a tool that types on the chart paints these words, their selection and the caret in place of
   *  its committed words. */
  get textDraft(): TextDraft | null {
    return this._textDraft
  }

  /** Show an inline edit's draft, or end it with null. `onFrame` hears where the words stand each
   *  time a repaint moves them, until the edit ends. */
  setTextDraft(draft: TextDraft | null, onFrame?: (frame: TextEditFrame | null) => void): void {
    this._textDraft = draft
    if (onFrame) this._onTextFrame = onFrame
    if (!draft) {
      this._onTextFrame = null
      this._textFrameKey = null
    }
    this.requestUpdate()
  }

  /** Where this drawing's words stand, for an editor laid over them; null for a tool that does not
   *  type on the chart. */
  textFrame(_viewport: Viewport): TextEditFrame | null {
    return null
  }

  /** After each paint: an open edit hears where the words stand whenever that moved. */
  noteTextFrame(viewport: Viewport): void {
    if (!this._onTextFrame || !this._textDraft) return
    const frame = this.textFrame(viewport)
    const key = JSON.stringify(frame)
    if (key === this._textFrameKey) return
    this._textFrameKey = key
    this._onTextFrame(frame)
  }

  /** Where the words an empty drawing shows come from: the host's catalog, read as it paints. */
  setTextPlaceholder(source: (() => string) | null): void {
    this._placeholder = source
    this.requestUpdate()
  }

  /** The words an empty drawing shows: the host's, or the catalog's English where none is set. */
  protected textPlaceholder(): string {
    return this._placeholder?.() ?? englishWords['drawing.addText']
  }

  private _inks: (() => DrawingInks) | null = null

  /** Where the chart's own inks come from: the host's theme, read as the drawing paints. */
  setInks(source: (() => DrawingInks) | null): void {
    this._inks = source
    this.requestUpdate()
  }

  /** The chart's own inks: the host theme's, or the built-in light theme's where none is set. */
  inks(): DrawingInks {
    return this._inks?.() ?? DEFAULT_INKS
  }

  /** The shape of this drawing's selection handles. */
  handleShape(): HandleShape {
    return 'circle'
  }

  private _hovered = false
  private _hoveredHandle: number | null = null

  /** Whether the pointer rests on this drawing (transient view state, never serialized). */
  get hovered(): boolean {
    return this._hovered
  }

  setHovered(on: boolean): void {
    if (this._hovered === on) return
    this._hovered = on
    this.requestUpdate()
  }

  /** The handle the pointer rests on, by its point's index, or null (transient view state, never
   *  serialized). */
  get hoveredHandle(): number | null {
    return this._hoveredHandle
  }

  setHoveredHandle(index: number | null): void {
    if (this._hoveredHandle === index) return
    this._hoveredHandle = index
    this.requestUpdate()
  }

  /** The anchors a drag that grabs this drawing at a point moves: null for all of them, as a drag
   *  of the whole drawing does. */
  grabbedAnchors(_point: Point, _viewport: Viewport): number[] | null {
    return null
  }

  /** Whether a point is on this drawing's words, where a click on the selected drawing types. */
  wordsAt(point: Point, viewport: Viewport): boolean {
    return this.testHit(point, viewport)
  }

  /** Move an anchor by its handle: to the point, unless the tool holds a handle to a line. */
  dragAnchorTo(index: number, anchor: Anchor): void {
    this.updateAnchor(index, anchor)
  }

  /** The words this drawing shows, in lines: the open edit's draft or the committed words. The
   *  placeholder stands in their place only while both are empty, so words emptied during an edit
   *  show nothing until the edit ends. */
  protected shownWords(measure: (line: string) => number, wrapWidth: number | null = null): { block: TextBlock; placeholder: TextBlock | null } {
    const own = (this._props as Record<string, unknown>).text
    const committed = typeof own === 'string' ? own : ''
    const value = this._textDraft?.value ?? committed
    return {
      block: layoutTextBlock(value, measure, wrapWidth),
      placeholder: value === '' && committed === '' ? layoutTextBlock(this.textPlaceholder(), measure) : null,
    }
  }

  abstract testHit(point: Point, viewport: Viewport): boolean

  // ============ Serialization ============

  toJSON(): SerializedDrawing {
    const props = this._props as Record<string, unknown>
    return {
      v: SERIAL_VERSION,
      id: this.id,
      type: this.type,
      anchors: this._anchors.map((a) => ({ ...a })),
      style: { ...this._style },
      options: { ...this._options },
      ...(Object.keys(props).length > 0 ? { props: { ...props } } : {}),
      ...(this.scope === undefined ? {} : { scope: this.scope }),
    }
  }

  fromJSON(data: SerializedDrawing): void {
    this._anchors = this.upgradeAnchors(data.anchors.map((a) => ({ ...a })))
    this._style = { ...DEFAULT_STYLE, ...data.style }
    this._options = normalizeOptions(data.options)
    this._props = { ...this.defaultProps(), ...this.upgradeProps((data.props ?? {}) as Partial<P>) }
    this.scope = data.scope
    if (!(data.v >= SERIAL_VERSION)) this.keepSavedLook((data.props ?? {}) as Readonly<Record<string, unknown>>)
    this.requestUpdate()
  }
}
