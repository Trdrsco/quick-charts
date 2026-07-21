import type {
  IChartApi,
  ISeriesApi,
  IPrimitivePaneView,
  ISeriesPrimitive,
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
import { DrawingPaneView } from '../render/pane-view'

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
  return {
    width,
    height,
    xOf: (time) => ts.timeToCoordinate(time),
    yOf: (price) => series.priceToCoordinate(price),
    timeAt: (x) => ts.coordinateToTime(x),
    priceAt: (y) => series.coordinateToPrice(y),
    barsBetween: (a, b) => {
      const xa = ts.timeToCoordinate(a)
      const xb = ts.timeToCoordinate(b)
      if (xa === null || xb === null) return null
      const la = ts.coordinateToLogical(xa)
      const lb = ts.coordinateToLogical(xb)
      if (la === null || lb === null) return null
      return lb - la
    },
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
    this._options = { ...DEFAULT_OPTIONS, ...options }
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

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this._options.visible) return null
    const viewport = this.getViewport()
    if (!viewport) return null
    if (!this.testHit({ x, y }, viewport)) return null
    return {
      cursorStyle: this._options.locked ? 'default' : 'pointer',
      externalId: this.id,
      zOrder: 'normal',
    }
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
    this._options = { ...this._options, ...patch }
    this.requestUpdate()
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
    this._options = { ...DEFAULT_OPTIONS, ...data.options }
    this._props = { ...this.defaultProps(), ...(data.props as Partial<P> | undefined) }
    this.requestUpdate()
  }
}
