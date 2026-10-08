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
import { DatePriceRange, DateRange, Measure, PriceRange } from './tools/measurement'
import { DisjointChannel, FlatTopBottom, ParallelChannel } from './tools/channels'
import { InsidePitchfork, ModifiedSchiffPitchfork, Pitchfork, SchiffPitchfork } from './tools/pitchforks'
import {
  FibArcs,
  FibChannel,
  FibCircles,
  FibExtension,
  FibRetracement,
  FibSpeedFan,
  FibSpiral,
  FibTimeExtension,
  FibTimeZone,
  FibWedge,
  Pitchfan,
} from './tools/fibonacci'
import { GannBox, GannFan, GannSquare, GannSquareFixed } from './tools/gann'
import { Forecast, LongPosition, Sector, ShortPosition } from './tools/forecasting'
import { Brush, Highlighter, PathLine, Polyline } from './tools/freehand'
import { ArrowMarker, Pin, PriceNote, Signpost } from './tools/annotations'
import { TableNote } from './tools/table'
import { AbcdPattern, CypherPattern, HeadAndShoulders, ThreeDrivesPattern, TrianglePattern, XabcdPattern } from './tools/patterns'
import {
  ElliottCorrection,
  ElliottDoubleCombo,
  ElliottImpulse,
  ElliottTriangle,
  ElliottTripleCombo,
} from './tools/elliott'
import { CyclicLines, SineLine, TimeCycles } from './tools/cycles'
import { BarsPattern, GhostFeed, RegressionTrend } from './tools/bars'
import { AnchoredVolumeProfile, AnchoredVwap, FixedRangeVolumeProfile } from './tools/volume'
import { ContentCard, GlyphMark, IconMark, ImageNote, StickerMark } from './tools/content'

export interface ToolDefinition {
  type: string
  name: string
  category: ToolCategory
  /** Anchor count that completes placement. */
  anchors: number
  /** Default style overrides for new drawings of this tool (e.g. a highlighter's fill). */
  style?: Partial<DrawingStyle>
  /** Tool renders the viewer's text — the host opens its text editor right after placement. */
  hasText?: boolean
  /** How anchors are gathered: drag-captured stroke, or click-to-add points (double-click ends).
   *  Omitted = the fixed `anchors` count. */
  placement?: 'freehand' | 'multipoint' | 'instant'
  /** Tool snapshots the bars between its anchors when placement completes (the host triggers
   *  the drawing's `capture()`). */
  capturesBars?: boolean
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
  placement?: 'freehand' | 'multipoint' | 'instant'
  capturesBars?: boolean
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

/** A line tool's factory look: a 2px stroke and its words in one blue, the words at 14px. */
const LINE_LOOK: Partial<DrawingStyle> = { lineColor: '#2962ff', lineWidth: 2, lineStyle: 'solid', textColor: '#2962ff', fontSize: 14 }

/** A shape's factory look in one hue: a 2px border, a background of the same hue at a fifth, and
 *  its words in the hue at 14px. */
const shapeLook = (hue: string): Partial<DrawingStyle> => ({ lineColor: hue, lineWidth: 2, lineStyle: 'solid', fillColor: hue, fillOpacity: 0.2, textColor: hue, fontSize: 14 })

/** A pattern's factory look: a 2px border in its hue and its letters white at 12px, and where it
 *  shades its legs, a background of the hue at fifteen percent. */
const patternLook = (hue: string, shaded: boolean): Partial<DrawingStyle> => ({
  lineColor: hue,
  lineWidth: 2,
  lineStyle: 'solid',
  textColor: '#ffffff',
  fontSize: 12,
  ...(shaded ? { fillColor: hue, fillOpacity: 0.15 } : {}),
})

/** A leveled fib's factory look: its levels drawn solid at 2px, their labels at 12px. */
const FIB_LOOK: Partial<DrawingStyle> = { lineWidth: 2, lineStyle: 'solid', fontSize: 12 }

/** A channel's look: its sides, its body at a fifth and its words in its hue, the sides 2px and the
 *  words 14px. */
const channelLook = (hue: string): Partial<DrawingStyle> => ({ lineColor: hue, lineWidth: 2, lineStyle: 'solid', fillColor: hue, fillOpacity: 0.2, textColor: hue, fontSize: 14 })

/** A range meter's look: its arrows in their color at 2px over a blue span at fifteen percent, the
 *  viewer's words blue at 12px. */
const meterLook = (line: string): Partial<DrawingStyle> => ({ lineColor: line, lineWidth: 2, lineStyle: 'solid', fillColor: '#2962ff', fillOpacity: 0.15, textColor: '#2962ff', fontSize: 12 })

/** A wave count's look: its line and its labels in one color, the line 2px and solid. */
const waveLook = (color: string): Partial<DrawingStyle> => ({ lineColor: color, lineWidth: 2, lineStyle: 'solid' })

/** Display order of categories in the drawing toolbar. */
export const TOOL_CATEGORIES: readonly ToolCategory[] = [
  'lines',
  'channels',
  'pitchforks',
  'fibonacci',
  'gann',
  'patterns',
  'elliott',
  'cycles',
  'forecasting',
  'volume',
  'measurement',
  'shapes',
  'annotation',
  'content',
]

const DEFINITIONS: ToolDefinition[] = [
  // Lines
  tool(TrendLine, { type: 'trend_line', name: 'Trend line', category: 'lines', anchors: 2, style: LINE_LOOK }),
  tool(Ray, { type: 'ray', name: 'Ray', category: 'lines', anchors: 2, style: LINE_LOOK }),
  tool(InfoLine, { type: 'info_line', name: 'Info line', category: 'lines', anchors: 2, style: LINE_LOOK }),
  tool(ExtendedLine, { type: 'extended', name: 'Extended line', category: 'lines', anchors: 2, style: LINE_LOOK }),
  tool(TrendAngle, { type: 'trend_angle', name: 'Trend angle', category: 'lines', anchors: 2, style: { ...LINE_LOOK, fontSize: 12 } }),
  tool(HorizontalLine, { type: 'horizontal_line', name: 'Horizontal line', category: 'lines', anchors: 1, style: { ...LINE_LOOK, fontSize: 12 } }),
  tool(HorizontalRay, { type: 'horizontal_ray', name: 'Horizontal ray', category: 'lines', anchors: 1, style: { ...LINE_LOOK, fontSize: 12 } }),
  tool(VerticalLine, { type: 'vertical_line', name: 'Vertical line', category: 'lines', anchors: 1, style: LINE_LOOK }),
  tool(CrossLine, { type: 'cross_line', name: 'Cross line', category: 'lines', anchors: 1, style: LINE_LOOK }),
  tool(Arrow, { type: 'arrow', name: 'Arrow', category: 'lines', anchors: 2, style: LINE_LOOK }),

  // Shapes
  tool(Rectangle, { type: 'rectangle', name: 'Rectangle', category: 'shapes', anchors: 2, style: shapeLook('#9c27b0') }),
  tool(RotatedRectangle, { type: 'rotated_rectangle', name: 'Rotated rectangle', category: 'shapes', anchors: 3, style: shapeLook('#4caf50') }),
  tool(Ellipse, { type: 'ellipse', name: 'Ellipse', category: 'shapes', anchors: 3, style: shapeLook('#f23645') }),
  tool(Circle, { type: 'circle', name: 'Circle', category: 'shapes', anchors: 2, style: shapeLook('#ff9800') }),
  tool(Triangle, { type: 'triangle', name: 'Triangle', category: 'shapes', anchors: 3, style: shapeLook('#089981') }),
  tool(Arc, { type: 'arc', name: 'Arc', category: 'shapes', anchors: 3, style: shapeLook('#e91e63') }),
  tool(Curve, { type: 'curve', name: 'Curve', category: 'shapes', anchors: 3, style: shapeLook('#2962ff') }),
  tool(DoubleCurve, { type: 'double_curve', name: 'Double curve', category: 'shapes', anchors: 4, style: shapeLook('#673ab7') }),

  // Channels
  tool(RegressionTrend, { type: 'regression_trend', name: 'Regression trend', category: 'channels', anchors: 2, style: { lineWidth: 1, lineStyle: 'solid' } }),
  tool(ParallelChannel, { type: 'parallel_channel', name: 'Parallel channel', category: 'channels', anchors: 3, style: channelLook('#2962ff') }),
  tool(FlatTopBottom, { type: 'flat_top_bottom', name: 'Flat top/bottom', category: 'channels', anchors: 3, style: channelLook('#ff9800') }),
  tool(DisjointChannel, { type: 'disjoint_channel', name: 'Disjoint channel', category: 'channels', anchors: 4, style: channelLook('#089981') }),

  // Fibonacci
  tool(FibRetracement, { type: 'fib_retracement', name: 'Fib retracement', category: 'fibonacci', anchors: 2, style: FIB_LOOK }),
  tool(FibExtension, { type: 'fib_trend_ext', name: 'Trend-based fib extension', category: 'fibonacci', anchors: 3, style: FIB_LOOK }),
  tool(FibChannel, { type: 'fib_channel', name: 'Fib channel', category: 'fibonacci', anchors: 3, style: FIB_LOOK }),
  tool(FibTimeZone, { type: 'fib_timezone', name: 'Fib time zone', category: 'fibonacci', anchors: 2, style: FIB_LOOK }),
  tool(FibSpeedFan, { type: 'fib_speed_resist_fan', name: 'Fib speed resistance fan', category: 'fibonacci', anchors: 2, style: FIB_LOOK }),
  tool(FibTimeExtension, { type: 'fib_trend_time', name: 'Trend-based fib time', category: 'fibonacci', anchors: 3, style: FIB_LOOK }),
  tool(FibCircles, { type: 'fib_circles', name: 'Fib circles', category: 'fibonacci', anchors: 2, style: FIB_LOOK }),
  tool(FibSpiral, { type: 'fib_spiral', name: 'Fib spiral', category: 'fibonacci', anchors: 2, style: { lineColor: '#00bcd4', lineWidth: 2, lineStyle: 'solid' } }),
  tool(FibArcs, { type: 'fib_speed_resist_arcs', name: 'Fib speed resistance arcs', category: 'fibonacci', anchors: 2, style: FIB_LOOK }),
  tool(FibWedge, { type: 'fib_wedge', name: 'Fib wedge', category: 'fibonacci', anchors: 3, style: FIB_LOOK }),
  tool(Pitchfan, { type: 'pitchfan', name: 'Pitchfan', category: 'fibonacci', anchors: 3, style: FIB_LOOK }),

  // Pitchforks
  tool(Pitchfork, { type: 'pitchfork', name: 'Pitchfork', category: 'pitchforks', anchors: 3, style: FIB_LOOK }),
  tool(SchiffPitchfork, { type: 'schiff_pitchfork', name: 'Schiff pitchfork', category: 'pitchforks', anchors: 3, style: FIB_LOOK }),
  tool(ModifiedSchiffPitchfork, { type: 'schiff_pitchfork_modified', name: 'Modified Schiff pitchfork', category: 'pitchforks', anchors: 3, style: FIB_LOOK }),
  tool(InsidePitchfork, { type: 'inside_pitchfork', name: 'Inside pitchfork', category: 'pitchforks', anchors: 3, style: FIB_LOOK }),

  // Gann
  tool(GannBox, { type: 'gannbox', name: 'Gann box', category: 'gann', anchors: 2, style: { lineColor: 'rgba(21, 56, 153, 0.8)', lineWidth: 2, lineStyle: 'solid', fontSize: 12 } }),
  tool(GannSquare, { type: 'gannbox_square', name: 'Gann square', category: 'gann', anchors: 2, style: FIB_LOOK }),
  tool(GannSquareFixed, { type: 'gannbox_fixed', name: 'Gann square fixed', category: 'gann', anchors: 2 }),
  tool(GannFan, { type: 'gannbox_fan', name: 'Gann fan', category: 'gann', anchors: 2 }),

  // Patterns
  tool(XabcdPattern, { type: 'xabcd_pattern', name: 'XABCD pattern', category: 'patterns', anchors: 5, style: patternLook('#2962ff', true) }),
  tool(CypherPattern, { type: 'cypher_pattern', name: 'Cypher pattern', category: 'patterns', anchors: 5, style: patternLook('#2962ff', true) }),
  tool(AbcdPattern, { type: 'abcd_pattern', name: 'ABCD pattern', category: 'patterns', anchors: 4, style: patternLook('#089981', false) }),
  tool(ThreeDrivesPattern, { type: 'three_drives', name: 'Three drives pattern', category: 'patterns', anchors: 7, style: patternLook('#673ab7', false) }),
  tool(TrianglePattern, { type: 'triangle_pattern', name: 'Triangle pattern', category: 'patterns', anchors: 4, style: patternLook('#673ab7', true) }),
  tool(HeadAndShoulders, { type: 'head_and_shoulders', name: 'Head and shoulders', category: 'patterns', anchors: 7, style: patternLook('#089981', true) }),

  // Elliott waves
  tool(ElliottImpulse, { type: 'elliott_impulse_wave', name: 'Elliott impulse (12345)', category: 'elliott', anchors: 6, style: waveLook('#3d85c6') }),
  tool(ElliottCorrection, { type: 'elliott_correction', name: 'Elliott correction (ABC)', category: 'elliott', anchors: 4, style: waveLook('#3d85c6') }),
  tool(ElliottTriangle, { type: 'elliott_triangle_wave', name: 'Elliott triangle (ABCDE)', category: 'elliott', anchors: 6, style: waveLook('#ff9800') }),
  tool(ElliottDoubleCombo, { type: 'elliott_double_combo', name: 'Elliott double combo (WXY)', category: 'elliott', anchors: 4, style: waveLook('#6aa84f') }),
  tool(ElliottTripleCombo, { type: 'elliott_triple_combo', name: 'Elliott triple combo (WXYXZ)', category: 'elliott', anchors: 6, style: waveLook('#6aa84f') }),

  // Cycles
  tool(CyclicLines, { type: 'cyclic_lines', name: 'Cyclic lines', category: 'cycles', anchors: 2, style: { lineColor: '#80ccdb', lineWidth: 2, lineStyle: 'solid' } }),
  tool(TimeCycles, { type: 'time_cycles', name: 'Time cycles', category: 'cycles', anchors: 2, style: { lineColor: '#159980', lineWidth: 2, lineStyle: 'solid', fillColor: '#6aa84f', fillOpacity: 0.5 } }),
  tool(SineLine, { type: 'sine_line', name: 'Sine line', category: 'cycles', anchors: 2, style: { lineColor: '#159980', lineWidth: 2, lineStyle: 'solid' } }),

  // Forecasting & positions
  tool(LongPosition, { type: 'long_position', name: 'Long position', category: 'forecasting', anchors: 3, placement: 'instant', style: { lineColor: '#808080', lineWidth: 1, lineStyle: 'solid', textColor: '#ffffff', fontSize: 12 } }),
  tool(ShortPosition, { type: 'short_position', name: 'Short position', category: 'forecasting', anchors: 3, placement: 'instant', style: { lineColor: '#808080', lineWidth: 1, lineStyle: 'solid', textColor: '#ffffff', fontSize: 12 } }),
  tool(Forecast, { type: 'forecast', name: 'Position forecast', category: 'forecasting', anchors: 2, style: { lineColor: '#2962ff', lineWidth: 2, lineStyle: 'solid' } }),
  tool(Sector, { type: 'sector', name: 'Sector', category: 'forecasting', anchors: 3, style: { lineColor: '#9c9c9c', lineWidth: 2, lineStyle: 'solid' } }),
  tool(BarsPattern, { type: 'bars_pattern', name: 'Bars pattern', category: 'forecasting', anchors: 2, capturesBars: true, style: { lineColor: '#2962ff' } }),
  tool(GhostFeed, { type: 'ghost_feed', name: 'Ghost feed', category: 'forecasting', anchors: 2, capturesBars: true }),

  // Volume
  tool(AnchoredVwap, { type: 'anchored_vwap', name: 'Anchored VWAP', category: 'volume', anchors: 1, style: { lineColor: '#1e88e5', lineWidth: 1, lineStyle: 'solid', fillColor: '#4caf50', fillOpacity: 0.05 } }),
  tool(FixedRangeVolumeProfile, { type: 'fixed_range_volume_profile', name: 'Fixed range volume profile', category: 'volume', anchors: 2 }),
  tool(AnchoredVolumeProfile, { type: 'anchored_volume_profile', name: 'Anchored volume profile', category: 'volume', anchors: 1 }),

  // Content
  tool(ImageNote, { type: 'image', name: 'Image', category: 'content', anchors: 1 }),
  tool(ContentCard, { type: 'content_card', name: 'Content card', category: 'content', anchors: 1, hasText: true }),
  tool(GlyphMark, { type: 'emoji', name: 'Emoji', category: 'content', anchors: 1 }),
  tool(StickerMark, { type: 'sticker', name: 'Sticker', category: 'content', anchors: 1 }),
  tool(IconMark, { type: 'icon', name: 'Icon', category: 'content', anchors: 1, style: { lineColor: '#2962ff' } }),

  // Annotation
  tool(TextLabel, { type: 'text', name: 'Text', category: 'annotation', anchors: 1, hasText: true, style: { textColor: '#2962ff', fontSize: 14, fillColor: '#2962ff', fillOpacity: 0.25, lineColor: '#707070' } }),
  tool(Note, { type: 'note', name: 'Note', category: 'annotation', anchors: 2, hasText: true, style: { lineColor: '#dbdbdb', textColor: '#dbdbdb', fontSize: 14, fillColor: '#2e2e2e', fillOpacity: 1 } }),
  tool(Comment, { type: 'comment', name: 'Comment', category: 'annotation', anchors: 1, hasText: true, style: { textColor: '#ffffff', fontSize: 16, fillColor: '#2962ff', fillOpacity: 1, lineColor: '#2962ff' } }),
  tool(Callout, { type: 'callout', name: 'Callout', category: 'annotation', anchors: 2, hasText: true, style: { textColor: '#ffffff', fontSize: 14, fillColor: '#0097a7', fillOpacity: 0.7, lineColor: '#0097a7', lineWidth: 2 } }),
  tool(PriceLabel, { type: 'price_label', name: 'Price label', category: 'annotation', anchors: 1, style: { textColor: '#ffffff', fontSize: 14, bold: true, fillColor: '#2962ff', fillOpacity: 1, lineColor: '#2962ff' } }),
  tool(ArrowMarkUp, { type: 'arrow_up', name: 'Arrow mark up', category: 'annotation', anchors: 1, style: { lineColor: '#089981', textColor: '#089981', fontSize: 14 } }),
  tool(ArrowMarkDown, { type: 'arrow_down', name: 'Arrow mark down', category: 'annotation', anchors: 1, style: { lineColor: '#cc2f3c', textColor: '#cc2f3c', fontSize: 14 } }),
  tool(ArrowMarker, { type: 'arrow_marker', name: 'Arrow marker', category: 'annotation', anchors: 2, style: { lineColor: '#1e53e5', textColor: '#1e53e5', fontSize: 16, bold: true } }),
  tool(FlagMark, { type: 'flag', name: 'Flag mark', category: 'annotation', anchors: 1, style: { lineColor: '#2962ff' } }),
  tool(PriceNote, { type: 'price_note', name: 'Price note', category: 'annotation', anchors: 2, hasText: true, style: { lineColor: '#2962ff', textColor: '#2962ff', fontSize: 14 } }),
  tool(Pin, { type: 'pin', name: 'Pin', category: 'annotation', anchors: 1, hasText: true, style: { lineColor: '#2962ff', textColor: '#dbdbdb', fontSize: 14, fillColor: '#2e2e2e', fillOpacity: 1 } }),
  tool(Signpost, { type: 'signpost', name: 'Signpost', category: 'annotation', anchors: 1, hasText: true, style: { lineColor: '#2962ff', fontSize: 12 } }),
  tool(TableNote, { type: 'table', name: 'Table', category: 'annotation', anchors: 1, style: { fillColor: '#0f0f0f', fillOpacity: 1, lineColor: '#575757', textColor: '#dbdbdb', fontSize: 14 } }),

  // Brushes & multi-point shapes
  tool(Brush, { type: 'brush', name: 'Brush', category: 'shapes', anchors: 2, placement: 'freehand', style: { lineColor: '#00bcd4', lineWidth: 2, lineStyle: 'solid', fillColor: '#00bcd4', fillOpacity: 0.5 } }),
  tool(Highlighter, { type: 'highlighter', name: 'Highlighter', category: 'shapes', anchors: 2, placement: 'freehand', style: { lineColor: 'rgba(242, 54, 69, 0.2)', lineWidth: 20 } }),
  tool(PathLine, { type: 'path', name: 'Path', category: 'shapes', anchors: 2, placement: 'multipoint', style: { lineColor: '#2962ff', lineWidth: 2, lineStyle: 'solid' } }),
  tool(Polyline, { type: 'polyline', name: 'Polyline', category: 'shapes', anchors: 2, placement: 'multipoint', style: shapeLook('#00bcd4') }),

  // Measurement
  tool(PriceRange, { type: 'price_range', name: 'Price range', category: 'measurement', anchors: 2, style: meterLook('rgba(79, 87, 107, 1)') }),
  tool(DateRange, { type: 'date_range', name: 'Date range', category: 'measurement', anchors: 2, style: meterLook('#2962ff') }),
  tool(DatePriceRange, { type: 'date_and_price_range', name: 'Date and price range', category: 'measurement', anchors: 2, style: meterLook('#2962ff') }),
  tool(Measure, { type: 'measure', name: 'Measure', category: 'measurement', anchors: 2 }),
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
