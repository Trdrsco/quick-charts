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
  SerializedDrawing,
  ToolCategory,
  Viewport,
} from './core/types'
export { DEFAULT_OPTIONS, DEFAULT_STYLE } from './core/types'

export { Drawing, viewportOf } from './core/drawing'
export { DrawingManager } from './core/manager'
export type { IntervalBucket, IntervalContext, IntervalVisibility, VisibilityRange } from './core/visibility'
export { DEFAULT_VISIBILITY, normalizeVisibility, parseIntervalContext, visibleAt } from './core/visibility'
export {
  distanceToLine,
  distanceToSegment,
  extendSegment,
  midpoint,
  angleOf,
} from './core/geometry'

export { ToolRegistry, toolRegistry, TOOL_CATEGORIES } from './registry'
export type { ToolDefinition } from './registry'

export * from './tools/lines'
export * from './tools/shapes'
export * from './tools/annotations'
export * from './tools/measurement'
export * from './tools/channels'
export * from './tools/pitchforks'
export * from './tools/fibonacci'
export * from './tools/gann'
export * from './tools/forecasting'
export * from './tools/freehand'
export * from './tools/table'
