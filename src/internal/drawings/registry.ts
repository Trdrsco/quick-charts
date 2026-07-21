import type { Anchor, DrawingOptions, DrawingStyle, SerializedDrawing, ToolCategory } from './core/types'
import type { AnyDrawing, Drawing } from './core/drawing'

import {
  Arrow,
  CrossLine,
  ExtendedLine,
  HorizontalLine,
  HorizontalRay,
  InfoLine,
  Ray,
  TrendAngle,
  TrendLine,
  VerticalLine,
} from './tools/lines'
import {
  Arc,
  Circle,
  Curve,
  DoubleCurve,
  Ellipse,
  Rectangle,
  RotatedRectangle,
  Triangle,
} from './tools/shapes'
import {
  ArrowMarkDown,
  ArrowMarkUp,
  Callout,
  Comment,
  FlagMark,
  Note,
  PriceLabel,
  TextLabel,
} from './tools/annotations'
import { DatePriceRange, DateRange, PriceRange } from './tools/measurement'

export interface ToolDefinition {
  type: string
  name: string
  category: ToolCategory
  /** Anchor count that completes placement. */
  anchors: number
  /** Default style overrides for new drawings of this tool (e.g. a highlighter's fill). */
  style?: Partial<DrawingStyle>
  /** Tool renders user text — the host opens its text editor right after placement. */
  hasText?: boolean
  create(
    id: string,
    anchors?: Anchor[],
    style?: Partial<DrawingStyle>,
    options?: Partial<DrawingOptions>,
    props?: Record<string, unknown>,
  ): AnyDrawing
}

interface ToolMeta {
  type: string
  name: string
  category: ToolCategory
  anchors: number
  style?: Partial<DrawingStyle>
  hasText?: boolean
}

/** Bind a tool class to its metadata (typed props cast happens exactly once, here). */
function tool<P extends Record<string, unknown>>(
  Ctor: new (
    id: string,
    anchors?: Anchor[],
    style?: Partial<DrawingStyle>,
    options?: Partial<DrawingOptions>,
    props?: Partial<P>,
  ) => Drawing<P>,
  meta: ToolMeta,
): ToolDefinition {
  return {
    ...meta,
    create: (id, anchors, style, options, props) =>
      new Ctor(id, anchors, style, options, props as Partial<P> | undefined) as AnyDrawing,
  }
}

/** Display order of categories in the toolbar rail. */
export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  'lines',
  'channels',
  'pitchforks',
  'fibonacci',
  'gann',
  'patterns',
  'elliott',
  'forecasting',
  'measurement',
  'shapes',
  'annotation',
  'content',
]

const DEFINITIONS: ToolDefinition[] = [
  // Lines
  tool(TrendLine, { type: 'trend_line', name: 'Trend line', category: 'lines', anchors: 2 }),
  tool(Ray, { type: 'ray', name: 'Ray', category: 'lines', anchors: 2 }),
  tool(InfoLine, { type: 'info_line', name: 'Info line', category: 'lines', anchors: 2 }),
  tool(ExtendedLine, { type: 'extended', name: 'Extended line', category: 'lines', anchors: 2 }),
  tool(TrendAngle, { type: 'trend_angle', name: 'Trend angle', category: 'lines', anchors: 2 }),
  tool(HorizontalLine, { type: 'horizontal_line', name: 'Horizontal line', category: 'lines', anchors: 1 }),
  tool(HorizontalRay, { type: 'horizontal_ray', name: 'Horizontal ray', category: 'lines', anchors: 1 }),
  tool(VerticalLine, { type: 'vertical_line', name: 'Vertical line', category: 'lines', anchors: 1 }),
  tool(CrossLine, { type: 'cross_line', name: 'Cross line', category: 'lines', anchors: 1 }),
  tool(Arrow, { type: 'arrow', name: 'Arrow', category: 'lines', anchors: 2 }),

  // Shapes
  tool(Rectangle, { type: 'rectangle', name: 'Rectangle', category: 'shapes', anchors: 2 }),
  tool(RotatedRectangle, { type: 'rotated_rectangle', name: 'Rotated rectangle', category: 'shapes', anchors: 3 }),
  tool(Ellipse, { type: 'ellipse', name: 'Ellipse', category: 'shapes', anchors: 3 }),
  tool(Circle, { type: 'circle', name: 'Circle', category: 'shapes', anchors: 2 }),
  tool(Triangle, { type: 'triangle', name: 'Triangle', category: 'shapes', anchors: 3 }),
  tool(Arc, { type: 'arc', name: 'Arc', category: 'shapes', anchors: 3 }),
  tool(Curve, { type: 'curve', name: 'Curve', category: 'shapes', anchors: 3 }),
  tool(DoubleCurve, { type: 'double_curve', name: 'Double curve', category: 'shapes', anchors: 4 }),

  // Annotation
  tool(TextLabel, { type: 'text', name: 'Text', category: 'annotation', anchors: 1, hasText: true }),
  tool(Note, { type: 'note', name: 'Note', category: 'annotation', anchors: 1, hasText: true }),
  tool(Comment, { type: 'comment', name: 'Comment', category: 'annotation', anchors: 1, hasText: true }),
  tool(Callout, { type: 'callout', name: 'Callout', category: 'annotation', anchors: 2, hasText: true }),
  tool(PriceLabel, { type: 'price_label', name: 'Price label', category: 'annotation', anchors: 1 }),
  tool(ArrowMarkUp, { type: 'arrow_up', name: 'Arrow mark up', category: 'annotation', anchors: 1 }),
  tool(ArrowMarkDown, { type: 'arrow_down', name: 'Arrow mark down', category: 'annotation', anchors: 1 }),
  tool(FlagMark, { type: 'flag', name: 'Flag mark', category: 'annotation', anchors: 1 }),

  // Measurement
  tool(PriceRange, { type: 'price_range', name: 'Price range', category: 'measurement', anchors: 2 }),
  tool(DateRange, { type: 'date_range', name: 'Date range', category: 'measurement', anchors: 2 }),
  tool(DatePriceRange, { type: 'date_and_price_range', name: 'Date and price range', category: 'measurement', anchors: 2 }),
]

/**
 * The tool registry: type → metadata + factory. The toolbar lists it, placement creates through
 * it, and persistence restores through it.
 */
export class ToolRegistry {
  private readonly _tools = new Map<string, ToolDefinition>()

  constructor(definitions: readonly ToolDefinition[]) {
    for (const definition of definitions) this._tools.set(definition.type, definition)
  }

  register(definition: ToolDefinition): void {
    this._tools.set(definition.type, definition)
  }

  get(type: string): ToolDefinition | undefined {
    return this._tools.get(type)
  }

  has(type: string): boolean {
    return this._tools.has(type)
  }

  all(): ToolDefinition[] {
    return Array.from(this._tools.values())
  }

  byCategory(category: ToolCategory): ToolDefinition[] {
    return this.all().filter((t) => t.category === category)
  }

  /** New drawing with the tool's default style under the given overrides. */
  create(
    type: string,
    id: string,
    anchors: Anchor[],
    styleOverrides?: Partial<DrawingStyle>,
  ): AnyDrawing | null {
    const definition = this._tools.get(type)
    if (!definition) return null
    return definition.create(id, anchors, { ...definition.style, ...styleOverrides })
  }

  /** Rebuild a drawing from its serialized form; null for unknown types or malformed data. */
  restore(data: SerializedDrawing): AnyDrawing | null {
    const definition = this._tools.get(data.type)
    if (!definition || !Array.isArray(data.anchors)) return null
    try {
      return definition.create(data.id, data.anchors, data.style, data.options, data.props)
    } catch {
      return null
    }
  }
}

export const toolRegistry = new ToolRegistry(DEFINITIONS)
