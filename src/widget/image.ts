// Client image capture: what the trader is looking at, as one PNG, composed in the browser and
// never sent anywhere.
//
// The canvas screenshot alone drops the on-canvas legend, so a shared picture would lack the one
// thing a recipient needs: which market and which timeframe it shows. The composition therefore
// draws a header strip ABOVE the bitmap, never over the bars, and captions each chart of a layout
// with its own identity.
//
// The layout arithmetic is pure and testable on its own; the canvas work below it is a thin
// painter over that arithmetic. Nothing here uploads, shares or stores: `capture` answers a blob,
// and what a host does with it is the host's business.
import type { ImageOptions } from './options'

/** The header strip's height, in CSS pixels. */
export const IMAGE_HEADER_H = 28

/** One text run at logical (CSS-pixel) coordinates. */
export interface ImageTextRun {
  x: number
  y: number
  text: string
  /** A resolved CSS color from the active theme. The composition never picks a color of its own. */
  color: string
  align: 'left' | 'right'
}

/** What the header names. */
export interface ImageHeader {
  symbol: string
  timeframe: string
  /** The mark the header carries at its right edge, or null to write none. */
  attribution: string | null
  /** A note beside the identity, such as who serves the data. Null writes none. */
  note?: string | null
  /** The ground the strip and the letterboxing are painted on. */
  background: string
  /** Ink for the identity run. */
  ink: string
  /** Ink for the attribution run. */
  inkMuted: string
}

/** One chart's bitmap and where that chart sits in the layout's unit square. */
export interface ImageTile {
  canvas: HTMLCanvasElement
  rect: { x: number; y: number; w: number; h: number }
  /** What the chart shows on screen. The image must not rename its own charts. */
  symbol: string
  timeframe: string
}

/** Where the note starts: after the identity run plus one space. An approximate character advance,
 *  because the PURE layout must be deterministic while the painter uses the canvas's real metrics. */
function noteAnchor(identity: string): number {
  return 10 + Math.round(identity.length * 7.2) + 8
}

/** The header runs for a single chart at a given logical width. */
export function imageHeaderRuns(header: ImageHeader, width: number): ImageTextRun[] {
  const identity = `${header.symbol} · ${header.timeframe}`
  const runs: ImageTextRun[] = [{ x: 10, y: 18, text: identity, color: header.ink, align: 'left' }]
  if (header.note) runs.push({ x: noteAnchor(identity), y: 18, text: header.note, color: header.inkMuted, align: 'left' })
  if (header.attribution) runs.push({ x: width - 10, y: 18, text: header.attribution, color: header.inkMuted, align: 'right' })
  return runs
}

/** The header runs for a LAYOUT. Each chart captions itself below, so the strip carries only the
 *  note and the mark. */
export function imageLayoutHeaderRuns(header: ImageHeader, width: number): ImageTextRun[] {
  const runs: ImageTextRun[] = []
  if (header.note) runs.push({ x: 10, y: 18, text: header.note, color: header.inkMuted, align: 'left' })
  if (header.attribution) runs.push({ x: width - 10, y: 18, text: header.attribution, color: header.inkMuted, align: 'right' })
  return runs
}

/** Each chart's caption, at logical coordinates already offset past the header. A chart's identity
 *  lives in DOM the screenshot cannot see, so without these a multi-chart image would be several
 *  unlabeled charts. */
export function imageTileRuns(
  tiles: readonly ImageTile[],
  width: number,
  height: number,
  headerH: number,
  ink: string,
): ImageTextRun[] {
  return tiles.map((tile) => ({
    x: Math.round(tile.rect.x * width) + 10,
    y: headerH + Math.round(tile.rect.y * height) + 18,
    text: `${tile.symbol} · ${tile.timeframe}`,
    color: ink,
    align: 'left' as const,
  }))
}

/** The pixel scale a set of tiles was captured at: each bitmap is its own CSS box at the display's
 *  pixel ratio, so any tile recovers it. */
export function tileScale(first: ImageTile, logicalWidth: number): number {
  const denominator = first.rect.w * logicalWidth
  return denominator > 0 ? first.canvas.width / denominator : 1
}

/** Compose one or many chart bitmaps into a single canvas under one header. Null when there is
 *  nothing to draw. */
export function composeImage(
  tiles: readonly ImageTile[],
  header: ImageHeader,
  logicalWidth: number,
  logicalHeight: number,
  options?: ImageOptions,
): HTMLCanvasElement | null {
  const first = tiles[0]
  if (!first || logicalWidth <= 0 || logicalHeight <= 0) return null
  const scale = tileScale(first, logicalWidth)
  const drawHeader = options?.header !== false
  const headerPx = drawHeader ? Math.round(IMAGE_HEADER_H * scale) : 0
  const out = document.createElement('canvas')
  out.width = Math.round(logicalWidth * scale)
  out.height = Math.round(logicalHeight * scale) + headerPx
  const ctx = out.getContext('2d')
  if (!ctx) return first.canvas // no 2d context; ship the chart bitmap rather than nothing
  ctx.fillStyle = header.background
  ctx.fillRect(0, 0, out.width, out.height)
  for (const tile of tiles) {
    ctx.drawImage(
      tile.canvas,
      Math.round(tile.rect.x * logicalWidth * scale),
      headerPx + Math.round(tile.rect.y * logicalHeight * scale),
      Math.round(tile.rect.w * logicalWidth * scale),
      Math.round(tile.rect.h * logicalHeight * scale),
    )
  }
  if (!drawHeader) return out
  ctx.font = `500 ${Math.round(13 * scale)}px ${'system-ui, sans-serif'}`
  ctx.textBaseline = 'alphabetic'
  const runs =
    tiles.length === 1
      ? imageHeaderRuns(header, logicalWidth)
      : [...imageLayoutHeaderRuns(header, logicalWidth), ...imageTileRuns(tiles, logicalWidth, logicalHeight, IMAGE_HEADER_H, header.ink)]
  for (const run of runs) {
    ctx.fillStyle = run.color
    ctx.textAlign = run.align
    ctx.fillText(run.text, Math.round(run.x * scale), Math.round(run.y * scale))
  }
  return out
}

/** A canvas as a PNG blob. */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

/** The widget's image surface. */
export interface ImageApi {
  /** The chart, or the whole layout, as one PNG. Rejects when there is nothing to draw. */
  capture(): Promise<Blob>
  /** Capture and hand the viewer a file. */
  download(name?: string): Promise<void>
  /** Capture and put the image on the clipboard. False when the browser cannot. */
  copy(): Promise<boolean>
}

/** What the image plane needs from the widget: the tiles to draw and the ink to draw them in. */
export interface ImageDeps {
  tiles(): readonly ImageTile[]
  /** The widget's logical size, in CSS pixels. */
  size(): { width: number; height: number }
  header(): Omit<ImageHeader, 'symbol' | 'timeframe'> & { symbol: string; timeframe: string }
  options?: ImageOptions
}

/** The default download filename: the chart's identity and the moment it was taken. */
export function imageFileName(symbol: string, timeframe: string, at: Date = new Date()): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = symbol.replace(/[^A-Za-z0-9._-]+/g, '-') || 'chart'
  return `${safe}-${timeframe}-${stamp}.png`
}

export function createImageApi(deps: ImageDeps): ImageApi {
  const compose = (): HTMLCanvasElement | null => {
    const size = deps.size()
    return composeImage(deps.tiles(), deps.header(), size.width, size.height, deps.options)
  }
  const capture = async (): Promise<Blob> => {
    const canvas = compose()
    if (!canvas) throw new Error('nothing to capture')
    const blob = await canvasToBlob(canvas)
    if (!blob) throw new Error('image encoding failed')
    return blob
  }
  return {
    capture,
    async download(name) {
      const blob = await capture()
      const header = deps.header()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name ?? imageFileName(header.symbol, header.timeframe)
      link.click()
      // Revoking on the next task lets the click's own navigation start first.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    },
    async copy() {
      if (typeof ClipboardItem === 'undefined' || typeof navigator === 'undefined' || typeof navigator.clipboard?.write !== 'function') return false
      try {
        const blob = await capture()
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        return true
      } catch {
        return false
      }
    },
  }
}
