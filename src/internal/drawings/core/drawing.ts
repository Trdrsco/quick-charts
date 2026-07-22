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

import type {
  Anchor,
  ControlPoint,
  DrawingOptions,
  DrawingState,
  DrawingStyle,
  IDrawing,
  Point,
  SerializedDrawing,
  Viewport,
} from './types'
import { DEFAULT_OPTIONS, DEFAULT_STYLE } from './types'
import type { IntervalContext } from './visibility'
import { normalizeVisibility, visibleAt } from './visibility'
import type { BarSource, SourceBar } from './bars'
import { DrawingPaneView } from '../render/pane-view'

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

  // The time scale can't address whitespace outside the data (timeToCoordinate/coordinateToTime
  // go null there), but logical coordinates can. Anchors beyond the last bar — a projection into
  // empty future space — extrapolate through logical index space using the trailing bar interval.
  // Numeric (unix-seconds) times only; other time shapes keep the strict mapping.
  const data = series.data()
  const last = data.length > 0 ? data[data.length - 1] : null
  const prev = data.length > 1 ? data[data.length - 2] : null
  const lastTime = last && typeof last.time === 'number' ? last.time : null
  const interval =
    lastTime !== null && prev && typeof prev.time === 'number' && lastTime > prev.time ? lastTime - prev.time : null
  const lastIndex = data.length - 1

  const logicalOfTime = (time: Time): number | null => {
    const x = ts.timeToCoordinate(time)
    if (x !== null) {
      const logical = ts.coordinateToLogical(x)
      if (logical !== null) return logical
    }
    if (lastTime === null || interval === null || typeof time !== 'number') return null
    return lastIndex + (time - lastTime) / interval
  }
  const timeOfLogicalIndex = (logical: number): Time | null => {
    const x = ts.logicalToCoordinate(logical as Parameters<typeof ts.logicalToCoordinate>[0])
    if (x !== null) {
      const time = ts.coordinateToTime(x)
      if (time !== null) return time
    }
    if (lastTime === null || interval === null) return null
    return (lastTime + (logical - lastIndex) * interval) as Time
  }

  return {
    width,
    height,
    xOf: (time) => {
      const direct = ts.timeToCoordinate(time)
      if (direct !== null) return direct
      const logical = logicalOfTime(time)
      if (logical === null) return null
      return ts.logicalToCoordinate(logical as Parameters<typeof ts.logicalToCoordinate>[0])
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
export abstract class Drawing<P extends Record<string, unknown> = Record<string, never>>
  implements IDrawing, ISeriesPrimitive<Time>
{
  readonly id: string
  abstract readonly type: string

  protected _anchors: Anchor[]
  protected _style: DrawingStyle
  protected _options: DrawingOptions
  protected _props: P
  protected _state: DrawingState = 'normal'
  private _intervalContext: IntervalContext = null
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
    this._anchors = anchors.map((a) => ({ ...a }))
    this._style = { ...DEFAULT_STYLE, ...style }
    this._options = normalizeOptions(options)
    this._props = { ...this.defaultProps(), ...props }
    this._paneViews = [new DrawingPaneView(this)]
  }

  /** Tool-specific defaults. Must not read instance fields (runs during construction). */
  protected defaultProps(): P {
    return {} as P
  }

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

  setIntervalContext(context: IntervalContext): void {
    this._intervalContext = context
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

  isVisibleNow(): boolean {
    return !this._globalHidden && this._options.visible && visibleAt(this._options.visibility, this._intervalContext)
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

  abstract testHit(point: Point, viewport: Viewport): boolean

  // ============ Serialization ============

  toJSON(): SerializedDrawing {
    const props = this._props as Record<string, unknown>
    return {
      v: 2,
      id: this.id,
      type: this.type,
      anchors: this._anchors.map((a) => ({ ...a })),
      style: { ...this._style },
      options: { ...this._options },
      ...(Object.keys(props).length > 0 ? { props: { ...props } } : {}),
    }
  }

  fromJSON(data: SerializedDrawing): void {
    this._anchors = data.anchors.map((a) => ({ ...a }))
    this._style = { ...DEFAULT_STYLE, ...data.style }
    this._options = normalizeOptions(data.options)
    this._props = { ...this.defaultProps(), ...(data.props as Partial<P> | undefined) }
    this.requestUpdate()
  }
}
