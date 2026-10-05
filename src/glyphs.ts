// The glyph picker's data on its own: the `@trdrs/quickcharts/glyphs` entry. A host that offers the
// chart's emoji and icons in a picker of its own, a native view among them, reads the same lists the
// chart's picker shows, each category with the catalog key of its heading, and arms the glyph tools
// with them through the chart's commands.
//
// Platform-neutral on purpose: nothing reachable from here names a window, a document or a DOM type,
// so the entry loads anywhere JavaScript runs.
export { EMOJI_CATEGORIES, ICON_CATEGORIES, isEmojiGlyph } from './drawings/glyphs'
export type { GlyphCategory, GlyphHeading } from './drawings/glyphs'
