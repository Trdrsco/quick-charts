// The public view of the drawing tool catalog.
//
// The internal seam registers its 90 tools in one mutable registry whose entries carry a factory
// that builds a live drawing object. Neither the mutability nor the factory belongs on a public
// surface: a consumer reads the catalog to build a picker and restores drawings through the codec,
// and the drawing classes themselves are implementation. So this module publishes a READ-ONLY view
// over the registry and a `DrawingTool` shape that stops at metadata.
//
// There is deliberately no host registration door. A host-authored tool would need the seam's
// `Drawing` base class, which is not public, and host tool contribution belongs behind the
// access-policy plane rather than a bare `register`. Publishing a door nobody can walk through is
// the kind of dead API this sprint deletes.
import { toolRegistry, TOOL_CATEGORIES, type ToolCategory, type SerializedDrawing, type IDrawing, type Anchor, type DrawingStyle } from '../internal/drawings/index'

export { TOOL_CATEGORIES }

/** How a tool gathers the anchors that complete a placement. Absent means the fixed `anchors`
 *  count: the host collects exactly that many points. */
export type DrawingPlacement = 'freehand' | 'multipoint' | 'instant'

/** One tool in the catalog, as a consumer reads it: identity, grouping, and the facts a picker or
 *  a placement loop needs. The factory that builds the drawing stays inside the library. */
export interface DrawingTool {
  /** The stable id a serialized drawing carries and a preference is keyed by. */
  readonly type: string
  /** The English fallback name. Localized display goes through `toolName` on the root entrypoint. */
  readonly name: string
  readonly category: ToolCategory
  /** Anchor count that completes placement when `placement` is absent. */
  readonly anchors: number
  /** Style overrides every new drawing of this tool starts with. */
  readonly style?: Partial<DrawingStyle>
  /** The tool renders user text, so a host opens its text editor once placement completes. */
  readonly hasText?: boolean
  readonly placement?: DrawingPlacement
  /** The tool snapshots the bars between its anchors when placement completes. */
  readonly capturesBars?: boolean
}

const readOnly = (definition: {
  type: string
  name: string
  category: ToolCategory
  anchors: number
  style?: Partial<DrawingStyle>
  hasText?: boolean
  placement?: DrawingPlacement
  capturesBars?: boolean
}): DrawingTool => Object.freeze({ ...definition })

/** The catalog: read access to the registered tools, plus the two constructors persistence needs.
 *  Nothing here mutates the catalog. */
export interface DrawingToolCatalog {
  /** One tool by type, or undefined when nothing is registered under it. */
  get(type: string): DrawingTool | undefined
  has(type: string): boolean
  /** Every registered tool, in registration order. */
  all(): DrawingTool[]
  /** The tools of one category, in registration order. */
  byCategory(category: ToolCategory): DrawingTool[]
  /** A new drawing of `type` at `anchors`, under the tool's default style and the given overrides.
   *  Null when the type is not registered. */
  create(type: string, id: string, anchors: Anchor[], style?: Partial<DrawingStyle>): IDrawing | null
  /** One serialized drawing rebuilt, or null for an unknown type or malformed data. */
  restore(data: SerializedDrawing): IDrawing | null
}

const catalog: DrawingToolCatalog = {
  get(type) {
    const definition = toolRegistry.get(type)
    return definition ? readOnly(definition) : undefined
  },
  has(type) {
    return toolRegistry.has(type)
  },
  all() {
    return toolRegistry.all().map(readOnly)
  },
  byCategory(category) {
    return toolRegistry.byCategory(category).map(readOnly)
  },
  create(type, id, anchors, style) {
    return toolRegistry.create(type, id, anchors, style)
  },
  restore(data) {
    return toolRegistry.restore(data)
  },
}

/** The library's tool catalog. Frozen: the view itself cannot be extended with a registration door
 *  at runtime either. */
export const drawingTools: DrawingToolCatalog = Object.freeze(catalog)
