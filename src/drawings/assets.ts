// Host image intake and an optional replacement for the chart's bundled emoji artwork.
import type { ChartMessageKey } from '../i18n/en'

/** What the intake accepts. Stated here because it is a product rule, not a host preference: a
 *  drawing is persisted with its picture inline, so an unbounded image is an unbounded saved chart. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
/** Longest edge, in pixels. A larger picture is downscaled rather than refused. */
export const IMAGE_MAX_EDGE = 2000
/** The pictures the intake takes: a JPG, a PNG or a WEBP. A WEBP is stored re-encoded, as a PNG or a
 *  JPEG, so a saved chart opens in every browser. */
export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']
/** The `accept` attribute for a file input, kept beside the types it mirrors. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp'

/** Why an intake failed. A CODE, not a sentence: the host renders it through the catalog, so the
 *  reason reaches a viewer in their own language and no English lives in the port. */
export type ImageIntakeError = 'wrong-type' | 'too-large' | 'unreadable' | 'undecodable'

/** The catalog message each code says. `too-large` carries the picked file's size in its slot. */
export const IMAGE_ERROR_MESSAGES: Readonly<Record<ImageIntakeError, ChartMessageKey>> = {
  'wrong-type': 'drawing.imageErrorType',
  'too-large': 'drawing.imageErrorSize',
  unreadable: 'drawing.imageErrorRead',
  undecodable: 'drawing.imageErrorDecode',
}

/** A picture that is ready to store on a drawing. */
export interface ImageAsset {
  /** A PNG or JPEG data URL sized within the caps, whatever the picked file was. */
  dataUrl: string
  width: number
  height: number
  /** The picture was larger than the edge cap and had to be resampled. */
  downscaled: boolean
}

export type ImageIntakeResult = { ok: true; asset: ImageAsset } | { ok: false; error: ImageIntakeError; bytes?: number }

/** What the host supplies so the image and glyph tools can draw. */
export interface DrawingAssetPort {
  /** Validate a picked file and turn it into a payload within the caps, or say why it cannot be
   *  used. The host owns the decode and the resample; `checkImageFile` and `fitScale` below are the
   *  library's rules it applies. The stored `dataUrl` is always a PNG or a JPEG, whatever the picked
   *  file was, so a saved chart opens everywhere: a WEBP is decoded and re-encoded on a canvas, as a
   *  PNG where it has transparency and a JPEG otherwise. */
  intakeImage(file: File): Promise<ImageIntakeResult>
  /** Optional replacement for the bundled Twemoji artwork. Artwork for one emoji or sticker glyph, as a URL the canvas can draw, or null to fall back to
   *  drawing the glyph as text. Icon marks always stay text: their ink is tinted by the stroke
   *  color, which artwork cannot carry. */
  glyphSource?(glyph: string): string | null
}

/** Type and size gate, pure so it needs no DOM and no real file. */
export function checkImageFile(file: { type: string; size: number }): { error: ImageIntakeError; bytes?: number } | null {
  if (!IMAGE_TYPES.includes(file.type)) return { error: 'wrong-type' }
  if (file.size > IMAGE_MAX_BYTES) return { error: 'too-large', bytes: file.size }
  return null
}

/** The scale that brings a picture inside the edge cap. 1 when it already fits, so a small picture
 *  is never resampled and never loses a pixel it did not have to. */
export function fitScale(width: number, height: number, maxEdge = IMAGE_MAX_EDGE): number {
  const longest = Math.max(width, height)
  return longest > maxEdge ? maxEdge / longest : 1
}

/** The pixel size a picture is resampled to. */
export function fittedSize(width: number, height: number, maxEdge = IMAGE_MAX_EDGE): { width: number; height: number } {
  const scale = fitScale(width, height, maxEdge)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
