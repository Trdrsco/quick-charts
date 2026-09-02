// The host's asset port: where the image-backed tools get their pictures, and where the glyph
// marks get their artwork.
//
// Two tools need a byte payload the chart cannot invent. The Image note holds a picture the trader
// picked, and the emoji and sticker marks draw vendored artwork because platform emoji fonts cannot
// be trusted on a canvas (Windows draws no flag glyphs at all). Both were reached through ambient
// globals: a module-level glyph hook set once per process, and an intake function that read a file
// and produced its own English error text. Neither survives a library a stranger embeds twice on
// one page with two different asset sets.
//
// So both are one explicit port the host supplies per instance. The library owns the RULES — what
// a picture may be, how large, and what a rejection is called — and the host owns the bytes.
import type { ChartMessageKey } from '../i18n/en'

/** What the intake accepts. Stated here because it is a product rule, not a host preference: a
 *  drawing is persisted with its picture inline, so an unbounded image is an unbounded saved chart. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
/** Longest edge, in pixels. A larger picture is downscaled rather than refused. */
export const IMAGE_MAX_EDGE = 2000
export const IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png']
/** The `accept` attribute for a file input, kept beside the types it mirrors. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png'

/** Why an intake failed. A CODE, not a sentence: the host renders it through the catalog, so the
 *  reason reaches a trader in their own language and no English lives in the port. */
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
  /** A data URL sized within the caps. */
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
   *  library's rules it applies. */
  intakeImage(file: File): Promise<ImageIntakeResult>
  /** Artwork for one emoji or sticker glyph, as a URL the canvas can draw, or null to fall back to
   *  drawing the glyph as text. Icon marks always stay text: their ink is tinted by the stroke
   *  color, which artwork cannot carry. */
  glyphSource(glyph: string): string | null
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
