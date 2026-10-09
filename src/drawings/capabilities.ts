// Per-tool SETTINGS CAPABILITY sets: one place to answer "does this tool have a fill?", "does it
// have a stroke at all?", and "which of its props deserve a control?".
//
// These are facts about what a tool paints, so they belong beside the tools rather than inside the
// surface that renders their controls. A settings dialog and a floating bar reading the same sets
// cannot disagree about whether a tool has a background, and a tool that gains a fill gains its
// control everywhere at once.

/** Tools whose paint has a fillable region — they get the Background color/opacity controls. */
export const FILLABLE: ReadonlySet<string> = new Set([
  'rectangle',
  'rotated_rectangle',
  'ellipse',
  'circle',
  'triangle',
  'polyline',
  'parallel_channel',
  'flat_top_bottom',
  'disjoint_channel',
  'price_range',
  'date_range',
  'date_and_price_range',
  'xabcd_pattern',
  'cypher_pattern',
  'triangle_pattern',
  'head_and_shoulders',
  'time_cycles',
  'comment',
  'callout',
  'price_label',
  'table',
  'arc',
  'brush',
  'curve',
  'double_curve',
])

/** No stroke channel at all: the glyph and image marks, the ghost feed and the volume profiles,
 *  which carry their own colors, the positions, and the text tool, whose ink is its words. No
 *  color, width or line style control. */
export const NO_STROKE: ReadonlySet<string> = new Set([
  'emoji',
  'sticker',
  'image',
  'ghost_feed',
  'fixed_range_volume_profile',
  'anchored_volume_profile',
  'text',
  'long_position',
  'short_position',
])

/** Stroke color applies but width/line-style don't (sized by their own geometry or fixed ink,
 *  or the color paints a border whose thickness is fixed). */
export const NO_LINE_DECOR: ReadonlySet<string> = new Set([
  'arrow_marker',
  'bars_pattern',
  'icon',
  'arrow_up',
  'arrow_down',
  'price_label',
  'comment',
  'note',
  'table',
  'signpost',
])

/** Tools with no Style tab: the text tools whose words are the whole drawing, the words' look, their
 *  background and their border on their Text tab, and the emoji and the sticker, whose only setting
 *  is their visibility. */
export const NO_STYLE_TAB: ReadonlySet<string> = new Set(['text', 'comment', 'callout', 'emoji', 'sticker'])

/** Tools that write words of their own and carry none of the viewer's: a plan's target, P&L and
 *  stop tags. Their bar offers the text colour, because those words take it, and nothing that
 *  belongs to a free label: no font size, and no invitation on the canvas to add text. */
export const OWN_WORDS_TOOLS: ReadonlySet<string> = new Set(['long_position', 'short_position'])

/** Tools whose floating bar carries a font-size control (their ink is type, not lines). */
export const FONT_TOOLS: ReadonlySet<string> = new Set(['text', 'note', 'comment', 'callout', 'table', 'price_label', 'signpost'])

/** The chart patterns, whose letters stand in pills: their Style page carries a Label row for the
 *  letters' color, size, weight and slant. */
export const LABELED_PATTERNS: ReadonlySet<string> = new Set(['xabcd_pattern', 'cypher_pattern', 'abcd_pattern', 'triangle_pattern', 'head_and_shoulders', 'three_drives'])

const SAVED_LOOK = ['savedLook'] as const
const FIB_LABELS = ['bandsByPane', 'wordsInLabels', 'labelsAtStart'] as const
const FORK = ['shadedBands'] as const
const CHANNEL = ['textAtStart'] as const
const PATTERN = ['pillRadius'] as const
const WAVE = ['pillRadius', 'labelPills'] as const
const PROFILE = ['outline'] as const
const METER = ['labelTextStyle'] as const

/** The props that keep a version 2 save's look as it was saved, where its tool's pages offer no
 *  control for it. They are the drawing's own: its tool's remembered default and the templates
 *  saved from it leave them out. */
export const SAVED_LOOK_PROPS: Record<string, readonly string[]> = {
  regression_trend: ['bodyColor'],
  parallel_channel: CHANNEL,
  flat_top_bottom: CHANNEL,
  disjoint_channel: CHANNEL,
  fib_retracement: FIB_LABELS,
  fib_trend_ext: FIB_LABELS,
  fib_channel: FIB_LABELS,
  fib_circles: ['roundPercents'],
  fib_speed_resist_fan: SAVED_LOOK,
  pitchfan: SAVED_LOOK,
  pitchfork: FORK,
  schiff_pitchfork: FORK,
  schiff_pitchfork_modified: FORK,
  inside_pitchfork: FORK,
  gannbox: ['tint'],
  gannbox_square: SAVED_LOOK,
  gannbox_fixed: SAVED_LOOK,
  xabcd_pattern: PATTERN,
  cypher_pattern: PATTERN,
  abcd_pattern: PATTERN,
  triangle_pattern: PATTERN,
  head_and_shoulders: PATTERN,
  three_drives: PATTERN,
  elliott_impulse_wave: WAVE,
  elliott_correction: WAVE,
  elliott_triangle_wave: WAVE,
  elliott_double_combo: WAVE,
  elliott_triple_combo: WAVE,
  bars_pattern: ['candles'],
  fixed_range_volume_profile: PROFILE,
  anchored_volume_profile: PROFILE,
  callout: ['borderWidth', ...SAVED_LOOK],
  price_label: SAVED_LOOK,
  pin: SAVED_LOOK,
  flag: SAVED_LOOK,
  arrow_up: SAVED_LOOK,
  arrow_down: SAVED_LOOK,
  arrow_marker: SAVED_LOOK,
  text: SAVED_LOOK,
  comment: SAVED_LOOK,
  note: SAVED_LOOK,
  price_note: SAVED_LOOK,
  signpost: SAVED_LOOK,
  price_range: METER,
  date_range: METER,
  date_and_price_range: ['extendLeft', 'extendRight', ...METER],
}

/** Prop keys a tool carries that its pages do not set: a trend angle's shared line keys, which it
 *  draws only as a save carries them; a table's cells and header band, which stand on the chart and
 *  in a save; and the props that keep a version 2 save's look as it was saved. */
export const INERT_PROPS: Record<string, readonly string[]> = {
  trend_angle: ['text', 'leftEnd', 'rightEnd', 'showDateTimeRange', 'showAngle'],
  table: ['cells', 'headerRow'],
  ...SAVED_LOOK_PROPS,
}

/** Tools whose points are drawn from their shape rather than typed: a turned box, an arc, an
 *  ellipse, a polygon of any count of points, a fib wedge, a flat top/bottom, a disjoint channel, a
 *  sector, a bars pattern, a position, an anchored VWAP, a text, a table, the strokes, the glyphs
 *  and an image have no Coordinates tab: a position's points are its entry, target and stop prices
 *  on its Inputs page. */
export const NO_COORDINATES_TAB: ReadonlySet<string> = new Set(['rotated_rectangle', 'arc', 'polyline', 'ellipse', 'fib_wedge', 'flat_top_bottom', 'disjoint_channel', 'sector', 'bars_pattern', 'long_position', 'short_position', 'anchored_vwap', 'text', 'table', 'brush', 'highlighter', 'path', 'emoji', 'sticker', 'icon', 'image'])

/** Tools that span every bar at one price: the Coordinates tab hides the bar field. */
export const PRICE_ONLY_COORDS: ReadonlySet<string> = new Set(['horizontal_line'])

/** Tools whose anchors are time-only — the Coordinates tab hides the price field. */
export const BAR_ONLY_COORDS: ReadonlySet<string> = new Set([
  'vertical_line',
  'regression_trend',
  'fixed_range_volume_profile',
  'anchored_volume_profile',
])

/** Width applies but the stroke is always solid — no line-style control (marker ink). */
/** A colour a tool paints that is none of the three every drawing may have. A plan paints two
 *  zones, and a reader tells them apart by what the glyph says as much as by where it sits, so a
 *  channel names its own mark. The pick writes the tool's own PROP, not the shared style. */
export interface ToolColorChannel {
  /** The prop the pick writes. */
  prop: string
  /** The mark the button wears, from the settings bar's own glyph set. */
  icon: 'pencil16' | 'bucket' | 'textTee'
  /** The catalog key naming it. */
  label: string
}

/** The extra colours a tool offers, in the order its bar shows them. A tool absent here offers
 *  only the stroke, fill and text every drawing may carry. */
export const TOOL_COLOR_CHANNELS: Record<string, readonly ToolColorChannel[]> = {
  long_position: [
    { prop: 'profitColor', icon: 'bucket', label: 'drawing.profitColor' },
    { prop: 'stopColor', icon: 'bucket', label: 'drawing.stopColor' },
  ],
  short_position: [
    { prop: 'profitColor', icon: 'bucket', label: 'drawing.profitColor' },
    { prop: 'stopColor', icon: 'bucket', label: 'drawing.stopColor' },
  ],
}

export const NO_DASH: ReadonlySet<string> = new Set(['highlighter', 'brush', 'price_range', 'date_range', 'date_and_price_range', 'callout'])

/** Prop keys that belong on a separate Inputs tab: what a drawing computes with, kept apart from
 *  how it looks.
 *  A tool listed here gets the Inputs tab; unlisted props stay on Style. */
export const INPUT_PROPS: Record<string, readonly string[]> = {
  fixed_range_volume_profile: ['rowsLayout', 'rowSize', 'volume', 'valueAreaVolume', 'extendRight'],
  anchored_volume_profile: ['rowsLayout', 'rowSize', 'volume', 'valueAreaVolume'],
  ghost_feed: ['averageHL', 'variance'],
  long_position: ['accountSize', 'risk', 'riskDisplay', 'lotSize', 'leverage', 'qtyPrecision'],
  short_position: ['accountSize', 'risk', 'riskDisplay', 'lotSize', 'leverage', 'qtyPrecision'],
  regression_trend: ['upperDeviation', 'lowerDeviation', 'useUpper', 'useLower', 'source'],
  anchored_vwap: ['source', 'bandsMode', 'bandMultipliers', 'bandsOn'],
}
