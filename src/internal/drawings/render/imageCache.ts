// Decoded bitmaps, shared between whoever chose the picture and the drawing that paints it.
//
// A data URL is not a bitmap: handing one to an <img> costs a base64 parse plus a decode, and that
// work happens asynchronously. So a freshly placed image used to appear a beat AFTER the click that
// placed it, even though the picker had already decoded the identical payload a moment earlier to
// show its preview. Priming the result here means the drawing finds a ready bitmap and paints it on
// the very first frame.
//
// Keyed by the data URL itself, which is exactly the identity that matters: the same payload is the
// same picture, and two drawings sharing one image share one decode.

const cache = new Map<string, HTMLImageElement>()

/** Bitmaps are megabytes of decoded pixels, so the map is bounded and evicts oldest-first. Well
 *  above any realistic number of images on one chart, low enough that it cannot become a leak. */
const MAX_ENTRIES = 24

export function primeImageBitmap(key: string, image: HTMLImageElement): void {
  if (!key) return
  if (cache.has(key)) cache.delete(key) // re-insert so it counts as most recently used
  cache.set(key, image)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next()
    if (oldest.done) break
    cache.delete(oldest.value)
  }
}

/** A bitmap already decoded for this payload, or null when it has to be loaded the slow way. */
export function cachedImageBitmap(key: string): HTMLImageElement | null {
  if (!key) return null
  const hit = cache.get(key)
  if (!hit) return null
  // A cached element that never finished decoding is no use to a synchronous paint.
  return hit.complete && hit.naturalWidth > 0 ? hit : null
}
