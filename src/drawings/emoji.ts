// Twemoji graphics: copyright Twitter, Inc and other contributors, CC-BY 4.0.
// https://github.com/jdecked/twemoji · https://creativecommons.org/licenses/by/4.0/
//
// The artwork is a chunk of its own, fetched the first time the chart is asked for an emoji, so a
// chart that never shows one never downloads it. Until it arrives every emoji draws as text, and
// each surface that drew one hears once when it lands. A chunk that fails to load leaves the text.
import { isEmojiGlyph } from './glyphs'

let drawings: Readonly<Record<string, string>> | null = null
let artwork: Promise<void> | null = null
const arrivals = new Set<() => void>()
const urls = new Map<string, string>()
const MAX_URLS = 96

/** Fetches the bundled artwork once and resolves when it has arrived. */
export function loadBundledArtwork(): Promise<void> {
  artwork ??= import('./emoji-artwork.json').then((module) => {
    drawings = module.default
    const waiting = [...arrivals]
    arrivals.clear()
    for (const then of waiting) then()
  })
  return artwork
}

/** Runs `then` once, when the bundled artwork arrives; never when it already has. Returns the
 *  cancel a surface calls as it goes. */
export function onBundledArtwork(then: () => void): () => void {
  if (drawings) return () => undefined
  arrivals.add(then)
  return () => arrivals.delete(then)
}

/** The chart's bundled artwork, shared by its picker and drawing layer: null draws the glyph as
 *  text, which is how text icons keep their ink and how an emoji draws until the artwork arrives. */
export function bundledGlyphSource(glyph: string): string | null {
  if (!isEmojiGlyph(glyph)) return null
  if (!drawings) {
    loadBundledArtwork().catch(() => undefined)
    return null
  }
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
