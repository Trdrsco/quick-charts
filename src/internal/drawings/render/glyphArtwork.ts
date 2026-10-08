// Decoded glyph artwork, keyed by the URL a glyph source produced. Shared across drawings on purpose:
// two charts pointing at the same asset set reuse one decode, and two pointing at different ones
// cannot collide.

const glyphImages = new Map<string, HTMLImageElement | 'loading' | 'failed'>()

/** The artwork at a URL, decoded, or null while it loads or after it failed to; `onLoad` runs once
 *  the load this call started lands, so the drawing that asked paints it. */
export function glyphArtwork(url: string, onLoad: () => void): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  const cached = glyphImages.get(url)
  if (cached instanceof HTMLImageElement) return cached
  if (cached === undefined) {
    glyphImages.set(url, 'loading')
    const image = new Image()
    image.onload = () => {
      glyphImages.set(url, image)
      onLoad()
    }
    image.onerror = () => glyphImages.set(url, 'failed')
    image.src = url
  }
  return null
}
