// quickcharts/drawings — the public drawing API.
//
// Drawings are the one part of the chart with enough surface of its own to earn a subpath: a
// catalog of 89 tools, a persistence codec, per-timeframe visibility, the magnet, and the product
// models a toolbar is built from. A host that never draws never imports any of it, and one that
// does gets it under a name that says what it is.
//
// This is a DELIBERATE SUBSET of the internal drawing source module. The drawing classes, the
// manager, the renderer and the mutable registry stay inside the library: a consumer reads the
// catalog, restores through the codec, and drives the workflow through the models here. A host
// chooses among the catalog's tools through `drawingTools` and the access policy.
//
// The sibling `../drawings.ts` is the library's own attach layer over the same source module. It is
// internal, and the widget mounts it; nothing here re-exports it.

// ── The catalog ─────────────────────────────────────────────────────────────────────────────────
export { drawingTools, TOOL_CATEGORIES } from './tools'
export type { DrawingTool, DrawingToolCatalog, DrawingPlacement } from './tools'

// ── The drawing itself ──────────────────────────────────────────────────────────────────────────
export type {
  Anchor,
  ControlPoint,
  DrawingOptions,
  DrawingState,
  DrawingStyle,
  IDrawing,
  LineStyle,
  Point,
  SerializedDrawing,
  TextDraft,
  TextEditFrame,
  ToolCategory,
  Viewport,
} from '../internal/drawings/index'
export { DEFAULT_OPTIONS, DEFAULT_STYLE } from '../internal/drawings/index'
// A drawing style's colour carries its own alpha, so reading and rewriting that channel is part of
// working with one rather than a general colour utility.
export { alphaOf, withAlpha } from '../internal/drawings/index'

// ── Persistence ─────────────────────────────────────────────────────────────────────────────────
export { parseDrawingsStore, restoreDrawings, serializeDrawingsStore } from './store'
// Where a drawings document lives and what it holds, from the chart's revisioned resource
// contract. The context and the document are the resource contract's, not a second pair: a
// drawings document is one of the four saved entities.
export type { ResourceRef, ResourceStore, TemplateBody, TemplateMeta, WriteOutcome } from '../resources'
export type {
  ChartLocalDrawingContext,
  DrawingContextKind,
  DrawingEntry,
  DrawingGroup,
  DrawingResourceContext,
  DrawingTombstone,
  DrawingsBody,
  LayoutSharedDrawingContext,
  SymbolGlobalDrawingContext,
} from './document'
export {
  DRAWING_CONTEXT_VERSION,
  DRAWING_DOCUMENT_VERSION,
  drawingContextKey,
  emptyDrawingDocument,
  liveDrawingEntries,
  liveDrawingGroups,
  mergeDrawingDocuments,
  parseDrawingDocument,
  reviseDrawingDocument,
  sameDrawingContext,
} from './document'

// ── Per-timeframe visibility ────────────────────────────────────────────────────────────────────
export type { TimeframeBucket, TimeframeContext, TimeframeVisibility, VisibilityPreset, VisibilityRange } from '../internal/drawings/index'
export { DEFAULT_VISIBILITY, normalizeVisibility, parseTimeframeContext, visibilityPreset, visibleAt } from '../internal/drawings/index'

// ── The magnet ──────────────────────────────────────────────────────────────────────────────────
export { magnetSnap, snapToBar } from '../internal/drawings/index'
export type { OhlcBar } from '../internal/drawings/index'
export { chooseMagnetStrength, magnetActive, MAGNET_LABELS, MAGNET_STRENGTHS, toggleMagnet } from './magnetModel'
export type { MagnetMode } from './magnetModel'

// ── The toolbar's structure ─────────────────────────────────────────────────────────────────────
export {
  ARROW_TYPES,
  BRUSH_TYPES,
  buildDrawingToolbarGroups,
  CARD_TYPES,
  DRAWING_TOOLBAR_PLAN,
  drawingToolbarFaceOf,
  GLYPH_TYPES,
  groupOfTool,
  rememberDrawingToolbarTool,
} from './drawingToolbarModel'
export type { DrawingToolbarGroup, DrawingToolbarSection } from './drawingToolbarModel'

// ── What the eye blanks ─────────────────────────────────────────────────────────────────────────
export { blanks, CHART_HIDE_LAYERS, chooseHideMode, DEFAULT_HIDE_STATE, HIDE_LABELS, hideOrder, hideRowActive, isBuiltInHideMode, toggleHide } from './hideModel'
export type { BuiltInHideMode, HideMode, HideState } from './hideModel'

// ── The pointer ─────────────────────────────────────────────────────────────────────────────────
export {
  cursorButtonArmed,
  CURSOR_LABELS,
  CURSOR_MODES,
  isTransientTool,
  toolAfterPlacement,
  TRANSIENT_LABELS,
  TRANSIENT_TOOLS,
  transientSurvives,
} from './cursorModel'
export type { CursorMode, TransientTool } from './cursorModel'

// ── What a sweep takes ──────────────────────────────────────────────────────────────────────────
// What a lock refuses is the library's own policy and stays inside it: a host locks and unlocks
// through the drawing commands and reads what they answer.
export { removableDrawings, removeRows } from './lockModel'
export type { DrawingCounts, RemoveRow } from './lockModel'

// ── Favorites ───────────────────────────────────────────────────────────────────────────────────
export {
  clampFavoritesPosition,
  DEFAULT_FAVORITES,
  favoritesBarShown,
  isFavorite,
  MAX_FAVORITE_TOOLS,
  pruneFavorites,
  toggleFavorite,
} from './favoritesModel'
export type { FavoritesPort, FavoritesPosition, FavoritesState } from './favoritesModel'

// ── Copying and typing ──────────────────────────────────────────────────────────────────────────
export { cancelText, CLONE_OFFSET_PX, commitText, opensTextEditor } from './editModel'
export type { TextCommit, TextEditTarget } from './editModel'

// ── Standing choices ────────────────────────────────────────────────────────────────────────────
export {
  DEFAULT_DRAWING_PREFERENCES,
  DRAWING_PREFERENCES_KEY,
  parseDrawingPreferences,
  serializeDrawingPreferences,
} from './preferences'
export type { DrawingPreferences } from './preferences'

// ── Defaults and named templates ────────────────────────────────────────────────────────────────
export { DEFAULT_PRESET_NAME, decodePreset, DrawingTemplates } from './templates'
export type { ToolPreset, ToolTemplate } from './templates'

// ── The host's assets ───────────────────────────────────────────────────────────────────────────
export {
  checkImageFile,
  fitScale,
  fittedSize,
  IMAGE_ACCEPT,
  IMAGE_ERROR_MESSAGES,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_EDGE,
  IMAGE_TYPES,
} from './assets'
export type { DrawingAssetPort, ImageAsset, ImageIntakeError, ImageIntakeResult } from './assets'
// A host that has already decoded a picture hands the bitmap over, so the drawing paints on its
// first frame instead of starting a second decode after the click that placed it.
export { primeImageBitmap } from '../internal/drawings/index'
// The glyph half of the asset port, as the drawing model receives it.
export type { GlyphSourcePort } from '../internal/drawings/index'

// ── What a tool's settings offer ────────────────────────────────────────────────────────────────
export {
  BAR_ONLY_COORDS,
  FILLABLE,
  FONT_TOOLS,
  INERT_PROPS,
  INPUT_PROPS,
  LABELED_PATTERNS,
  NO_COORDINATES_TAB,
  NO_DASH,
  NO_LINE_DECOR,
  NO_STROKE,
  NO_STYLE_TAB,
  PRICE_ONLY_COORDS,
} from './capabilities'
