// The `quickcharts/drawings` API-surface pin, the same contract as the root's: the subpath's public
// RUNTIME surface as { name: typeof }. A diff here is a SemVer event to decide consciously, never
// noise to appease. Type-only exports are erased at runtime and cannot be pinned here; the
// clean-room consumer compiles against the shipped declarations and is their gate.
//
// The pin is also the boundary proof. The internal drawing seam exports far more than this: the
// `Drawing` base class, the `DrawingManager`, the pane views, the mutable `ToolRegistry`, and every
// one of the 90 tool classes. None of them are here, and the second test says so by name.
import { describe, expect, it } from 'vitest'
import * as api from '../src/drawings/index'
import * as seam from '../src/internal/drawings/index'

const SURFACE: Record<string, string> = {
  // The catalog, as a read-only view. `drawingTools` replaces the seam's mutable registry: a
  // consumer reads tools and constructs through it, and cannot register one.
  drawingTools: 'object',
  TOOL_CATEGORIES: 'object',

  // The drawing's own defaults, and the alpha channel of a style colour.
  DEFAULT_OPTIONS: 'object',
  DEFAULT_STYLE: 'object',
  alphaOf: 'function',
  withAlpha: 'function',

  // Persistence: the store codec.
  parseDrawingsStore: 'function',
  serializeDrawingsStore: 'function',
  restoreDrawings: 'function',

  // Additive (minor): the drawings document — where one lives, what it holds, and the pure rules
  // a host needs to read or merge one itself.
  DRAWING_CONTEXT_VERSION: 'number',
  DRAWING_DOCUMENT_VERSION: 'number',
  drawingContextKey: 'function',
  emptyDrawingDocument: 'function',
  liveDrawingEntries: 'function',
  liveDrawingGroups: 'function',
  mergeDrawingDocuments: 'function',
  parseDrawingDocument: 'function',
  reviseDrawingDocument: 'function',
  sameDrawingContext: 'function',

  // Per-interval visibility.
  DEFAULT_VISIBILITY: 'object',
  normalizeVisibility: 'function',
  parseIntervalContext: 'function',
  visibilityPreset: 'function',
  visibleAt: 'function',

  // The magnet: the snap itself, and the policy around it.
  magnetSnap: 'function',
  snapToBar: 'function',
  chooseMagnetStrength: 'function',
  magnetActive: 'function',
  MAGNET_LABELS: 'object',
  MAGNET_STRENGTHS: 'object',
  toggleMagnet: 'function',

  // The rail's structure.
  ARROW_TYPES: 'object',
  BRUSH_TYPES: 'object',
  CARD_TYPES: 'object',
  GLYPH_TYPES: 'object',
  RAIL_PLAN: 'object',
  buildRailGroups: 'function',
  groupOfTool: 'function',
  railFaceOf: 'function',
  rememberRailTool: 'function',

  // What the eye blanks: chart-owned drawings and indicators only.
  blanks: 'function',
  chooseHideMode: 'function',
  DEFAULT_HIDE_STATE: 'object',
  HIDE_LABELS: 'object',
  HIDE_ORDER: 'object',
  hideRowActive: 'function',
  toggleHide: 'function',

  // The pointer.
  CURSOR_LABELS: 'object',
  CURSOR_MODES: 'object',
  cursorButtonArmed: 'function',
  isTransientTool: 'function',
  toolAfterPlacement: 'function',
  TRANSIENT_LABELS: 'object',
  TRANSIENT_TOOLS: 'object',
  transientSurvives: 'function',

  // Locks, and what a sweep takes.
  editRefused: 'function',
  removableDrawings: 'function',
  removeRows: 'function',

  // Favorites.
  clampFavoritesPosition: 'function',
  DEFAULT_FAVORITES: 'object',
  favoritesBarShown: 'function',
  isFavorite: 'function',
  MAX_FAVORITE_TOOLS: 'number',
  pruneFavorites: 'function',
  toggleFavorite: 'function',

  // Copying and typing.
  cancelText: 'function',
  CLONE_OFFSET_PX: 'number',
  commitText: 'function',
  opensTextEditor: 'function',

  // Standing choices, persisted through ChartStorage by the widget.
  DEFAULT_DRAWING_PREFERENCES: 'object',
  DRAWING_PREFERENCES_KEY: 'string',
  parseDrawingPreferences: 'function',
  serializeDrawingPreferences: 'function',

  // Defaults and named templates over the revisioned resource contract.
  DEFAULT_PRESET_NAME: 'string',
  decodePreset: 'function',
  DrawingTemplates: 'function',

  // The host's assets.
  checkImageFile: 'function',
  fitScale: 'function',
  fittedSize: 'function',
  IMAGE_ACCEPT: 'string',
  IMAGE_ERROR_MESSAGES: 'object',
  IMAGE_MAX_BYTES: 'number',
  IMAGE_MAX_EDGE: 'number',
  IMAGE_TYPES: 'object',
  primeImageBitmap: 'function',

  // What a tool's settings offer.
  BAR_ONLY_COORDS: 'object',
  FILLABLE: 'object',
  FONT_TOOLS: 'object',
  INERT_PROPS: 'object',
  INPUT_PROPS: 'object',
  LABELED_PATTERNS: 'object',
  NO_DASH: 'object',
  NO_LINE_DECOR: 'object',
  NO_STROKE: 'object',
  NO_STYLE_TAB: 'object',
}

describe('quickcharts/drawings API surface pin', () => {
  it('exports exactly the pinned names', () => {
    expect(Object.keys(api).sort()).toEqual(Object.keys(SURFACE).sort())
  })

  it('every export keeps its pinned runtime type', () => {
    for (const [name, kind] of Object.entries(SURFACE)) {
      expect(typeof (api as Record<string, unknown>)[name], name).toBe(kind)
    }
  })

  it('publishes a SUBSET of the internal seam, and keeps the model and the tool classes inside', () => {
    for (const name of ['Drawing', 'DrawingManager', 'ToolRegistry', 'toolRegistry', 'viewportOf', 'TrendLine', 'FibRetracement'])
      expect(Object.keys(api), name).not.toContain(name)
    expect(Object.keys(api).length).toBeLessThan(Object.keys(seam).length)
  })

  it('offers no door for a host-authored tool: contribution belongs to the access-policy plane', () => {
    expect(Object.keys(api).some((n) => /register/i.test(n))).toBe(false)
    expect(api.drawingTools).not.toHaveProperty('register')
    expect(Object.isFrozen(api.drawingTools)).toBe(true)
  })

  it('hands back frozen tool rows, so a consumer cannot edit the catalog through one', () => {
    const tool = api.drawingTools.get('trend_line')!
    expect(Object.isFrozen(tool)).toBe(true)
    expect(api.drawingTools.all()).toHaveLength(90)
  })
})
