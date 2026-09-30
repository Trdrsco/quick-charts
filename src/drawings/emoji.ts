// Twemoji graphics: copyright Twitter, Inc and other contributors, CC-BY 4.0.
// https://github.com/jdecked/twemoji · https://creativecommons.org/licenses/by/4.0/
import artwork from './emoji-artwork.json'
import { isEmojiGlyph } from './glyphs'

const drawings: Readonly<Record<string, string>> = artwork
const urls = new Map<string, string>()
const MAX_URLS = 96

/** The chart's bundled artwork, shared by its picker and drawing layer. Text icons keep their ink. */
export function bundledGlyphSource(glyph: string): string | null {
  if (!isEmojiGlyph(glyph)) return null
  const points = [...glyph].map(ch => ch.codePointAt(0)!)
  const stem = (points.includes(0x200d) ? points : points.filter(p => p !== 0xfe0f)).map(p => p.toString(16)).join('-')
  const cached = urls.get(stem)
  if (cached) return cached
  const svg = drawings[stem]
  if (!svg) return null
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  urls.set(stem, url)
  if (urls.size > MAX_URLS) urls.delete(urls.keys().next().value!)
  return url
}
