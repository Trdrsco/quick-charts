export type {
  Anchor,
  ControlPoint,
  DrawingEvent,
  DrawingEventCallback,
  DrawingEventType,
  DrawingOptions,
  DrawingState,
  DrawingStyle,
  IDrawing,
  LineStyle,
  Point,
  PriceFormatPort,
  SerializedDrawing,
  ToolCategory,
  Viewport,
} from './core/types'
export { DEFAULT_OPTIONS, DEFAULT_STYLE, SERIAL_VERSION } from './core/types'

export { Drawing, viewportOf } from './core/drawing'
export { DrawingManager } from './core/manager'
export type { TimeframeBucket, TimeframeContext, TimeframeVisibility, VisibilityPreset, VisibilityRange } from './core/visibility'
export { DEFAULT_VISIBILITY, normalizeVisibility, parseTimeframeContext, visibilityPreset, visibleAt } from './core/visibility'
export type { GlyphSourcePort } from './core/types'
export type { MagnetMode, OhlcBar } from './core/magnet'
export { magnetSnap, snapToBar } from './core/magnet'
export {
  distanceToLine,
  distanceToSegment,
  extendSegment,
  midpoint,
  angleOf,
  segmentTextAngle,
} from './core/geometry'

export { alphaOf, withAlpha } from './render/canvas'
export { cachedImageBitmap, primeImageBitmap } from './render/imageCache'

export { ToolRegistry, toolRegistry, TOOL_CATEGORIES } from './registry'
export type { InlineTextRules, ToolDefinition } from './registry'
export type { TextBlock, TextDraft, TextEditFrame, TextLine } from './core/textEntry'
export { parseDrawingsStore, serializeDrawingsStore, restoreDrawings } from './store'

export * from './tools/lines'
export * from './tools/shapes'
export * from './tools/annotations'
export * from './tools/measurement'
export * from './tools/channels'
export * from './tools/pitchforks'
export * from './tools/fibonacci'
export * from './tools/gann'
export * from './tools/forecasting'
export { Brush, Highlighter, PathLine, Polyline } from './tools/freehand'
export * from './tools/table'
export * from './tools/patterns'
export * from './tools/elliott'
export * from './tools/cycles'
export * from './tools/bars'
export * from './tools/volume'
export * from './tools/content'
export type { BarPriceSource, BarSource, SourceBar, VolumeBin } from './core/bars'
export { BAR_PRICE_SOURCES, barsInRange, linearRegression, volumeProfile } from './core/bars'
