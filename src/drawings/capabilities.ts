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
  'sector',
  'text',
  'note',
  'comment',
  'callout',
  'table',
  'arc',
  'brush',
])

/** No stroke channel at all (glyph/image marks; ghost feed and the volume profiles carry their
 *  own color props; the text tool's ink is its text channel) — no color/width/line-style
 *  controls. */
export const NO_STROKE: ReadonlySet<string> = new Set([
  'emoji',
  'sticker',
  'image',
  'ghost_feed',
  'fixed_range_volume_profile',
  'anchored_volume_profile',
  'text',
])

/** Stroke color applies but width/line-style don't (sized by their own geometry or fixed ink,
 *  or the color paints a border whose thickness is fixed). */
export const NO_LINE_DECOR: ReadonlySet<string> = new Set([
  'arrow_marker',
  'bars_pattern',
  'icon',
  'arrow_up',
  'arrow_down',
  'callout',
  'comment',
  'note',
  'table',
])

/** Annotation text tools: no Style tab at all — color/size/weight/background/border live on the
 *  Text tab (border applies where the tool draws one). */
export const NO_STYLE_TAB: ReadonlySet<string> = new Set(['text', 'note', 'comment', 'callout'])

/** Tools whose floating bar carries a font-size control (their ink is type, not lines). */
export const FONT_TOOLS: ReadonlySet<string> = new Set(['text', 'note', 'comment', 'callout', 'table'])

/** Pattern/wave tools with circled vertex labels — the Style tab gets a Label styling row. */
export const LABELED_PATTERNS: ReadonlySet<string> = new Set([
  'xabcd_pattern',
  'cypher_pattern',
  'abcd_pattern',
  'triangle_pattern',
  'head_and_shoulders',
  'three_drives',
  'elliott_impulse_wave',
  'elliott_correction',
  'elliott_triangle_wave',
  'elliott_double_combo',
  'elliott_triple_combo',
])

/** Prop keys a tool carries (via a shared props type) but whose paint ignores them — their rows
 *  stay hidden so the modal never shows a control that does nothing. */
export const INERT_PROPS: Record<string, readonly string[]> = {
  fib_timezone: ['showPrices', 'reverse', 'extendLeft', 'background'],
  fib_trend_time: ['showPrices', 'reverse', 'extendLeft', 'background'],
  fib_speed_resist_arcs: ['showPrices', 'reverse', 'extendLeft'],
  fib_circles: ['showPrices', 'reverse', 'extendLeft'],
}

/** Tools whose anchors are time-only — the Coordinates tab hides the price field. */
export const BAR_ONLY_COORDS: ReadonlySet<string> = new Set([
  'vertical_line',
  'regression_trend',
  'fixed_range_volume_profile',
  'anchored_volume_profile',
])

/** Width applies but the stroke is always solid — no line-style control (marker ink). */
export const NO_DASH: ReadonlySet<string> = new Set(['highlighter'])

/** Prop keys that belong on a separate Inputs tab: what a drawing computes with, kept apart from
 *  how it looks.
 *  A tool listed here gets the Inputs tab; unlisted props stay on Style. */
export const INPUT_PROPS: Record<string, readonly string[]> = {
  fixed_range_volume_profile: ['rowsLayout', 'rowSize', 'volume', 'valueAreaVolume', 'extendRight'],
  anchored_volume_profile: ['rowsLayout', 'rowSize', 'volume', 'valueAreaVolume'],
  ghost_feed: ['averageHL', 'variance'],
  long_position: ['accountSize', 'risk', 'riskDisplay', 'lotSize', 'leverage', 'compact'],
  short_position: ['accountSize', 'risk', 'riskDisplay', 'lotSize', 'leverage', 'compact'],
  regression_trend: ['upperDeviation', 'lowerDeviation', 'useUpper', 'useLower', 'source'],
}
