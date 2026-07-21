import type { Time } from 'lightweight-charts'
import type { IntervalContext, IntervalVisibility } from './visibility'
import { DEFAULT_VISIBILITY } from './visibility'

/** A point the drawing is pinned to, in chart coordinates. */
export interface Anchor {
  time: Time
  price: number
}

/** A point in pane-local CSS pixels. */
export interface Point {
  x: number
  y: number
}

export type LineStyle = 'solid' | 'dashed' | 'dotted'

/**
 * The shared visual vocabulary every tool paints with. `style` is HOW a drawing is painted
 * (what the floating toolbar edits generically); a tool's `props` are WHAT it is (levels,
 * extension flags, text content, …); `options` are lifecycle flags. All style fields are
 * required — constructors merge defaults so tools never carry `?? fallback` chains.
 */
export interface DrawingStyle {
  lineColor: string
  lineWidth: number
  lineStyle: LineStyle
  /** Fill paint for tools with a fillable region; fill shows only while `fillOpacity > 0`. */
  fillColor: string
  fillOpacity: number
  /** Text channel for tools that render text (labels, notes, callouts). */
  textColor: string
  fontSize: number
  bold: boolean
  italic: boolean
}

export const DEFAULT_STYLE: DrawingStyle = {
  lineColor: '#4c98fb',
  lineWidth: 2,
  lineStyle: 'solid',
  fillColor: '#4c98fb',
  fillOpacity: 0,
  textColor: '#e5e7eb',
  fontSize: 13,
  bold: false,
  italic: false,
}

/** Lifecycle flags, uniform across tools. Higher `zIndex` hit-tests (and later paints) on top. */
export interface DrawingOptions {
  visible: boolean
  locked: boolean
  zIndex: number
  /** Which chart intervals the drawing shows on (independent of the manual `visible` switch). */
  visibility: IntervalVisibility
}

export const DEFAULT_OPTIONS: DrawingOptions = {
  visible: true,
  locked: false,
  zIndex: 0,
  visibility: DEFAULT_VISIBILITY,
}

/**
 * Wire/persistence format. `props` carries the tool-specific payload — every tool round-trips
 * its COMPLETE state through this shape (the schema exists so nothing is ever dropped on save).
 */
export interface SerializedDrawing {
  v: 2
  id: string
  type: string
  anchors: Anchor[]
  style: DrawingStyle
  options: DrawingOptions
  props?: Record<string, unknown>
}

export type DrawingState = 'normal' | 'hovered' | 'selected' | 'editing'

/**
 * Pane-local coordinate conversions handed to paint/hit-test code. Width/height are the pane's
 * CSS-pixel size (never a container fallback — extension math depends on the real pane box).
 */
export interface Viewport {
  width: number
  height: number
  xOf(time: Time): number | null
  yOf(price: number): number | null
  timeAt(x: number): Time | null
  priceAt(y: number): number | null
  /** Bar-index distance between two times (fractional; null when either falls outside data). */
  barsBetween(a: Time, b: Time): number | null
}

/** A draggable handle over an anchor, in pane-local CSS pixels. */
export interface ControlPoint {
  index: number
  x: number
  y: number
}

export interface IDrawing {
  readonly id: string
  readonly type: string
  anchors: readonly Anchor[]
  style: Readonly<DrawingStyle>
  options: Readonly<DrawingOptions>
  state: DrawingState

  setAnchors(anchors: Anchor[]): void
  updateAnchor(index: number, anchor: Anchor): void
  appendAnchor(anchor: Anchor): void
  removeAnchor(index: number): void
  updateStyle(patch: Partial<DrawingStyle>): void
  updateOptions(patch: Partial<DrawingOptions>): void
  setState(state: DrawingState): void

  /** The tool-specific payload (typed per tool; empty object for tools without one). */
  readonly props: Readonly<Record<string, unknown>>
  applyProps(patch: Record<string, unknown>): void

  /** True once the drawing has its full anchor set (placement complete, all values finite). */
  isValid(): boolean

  /** The chart's current interval (the manager broadcasts it on timeframe changes). */
  setIntervalContext(context: IntervalContext): void
  /** Chart-wide hide-all switch (transient view state — never serialized). */
  setGlobalHidden(hidden: boolean): void
  /** Manual `visible` switch AND hide-all AND the per-interval rule, combined. */
  isVisibleNow(): boolean

  testHit(point: Point, viewport: Viewport): boolean
  getControlPoints(viewport: Viewport): ControlPoint[]
  anchorToPixel(anchor: Anchor, viewport: Viewport): Point | null

  getViewport(): Viewport | null
  requestUpdate(): void
  toJSON(): SerializedDrawing
}

export type ToolCategory =
  | 'lines'
  | 'channels'
  | 'pitchforks'
  | 'fibonacci'
  | 'gann'
  | 'patterns'
  | 'elliott'
  | 'forecasting'
  | 'measurement'
  | 'shapes'
  | 'annotation'
  | 'content'

export type DrawingEventType =
  | 'drawing:added'
  | 'drawing:removed'
  | 'drawing:selected'
  | 'drawing:deselected'
  | 'drawing:cleared'

export interface DrawingEvent {
  type: DrawingEventType
  drawingId?: string
  drawing?: IDrawing
}

export type DrawingEventCallback = (event: DrawingEvent) => void
