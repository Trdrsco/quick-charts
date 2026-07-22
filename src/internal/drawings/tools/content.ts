import type { Point, Viewport } from '../core/types'
import { Drawing } from '../core/drawing'
import { measureTextBlock, paintTextBlock, withAlpha } from '../render/canvas'

function inBox(p: Point, box: { x: number; y: number; width: number; height: number }, pad = 3): boolean {
  return (
    p.x >= box.x - pad && p.x <= box.x + box.width + pad && p.y >= box.y - pad && p.y <= box.y + box.height + pad
  )
}

export type ImageProps = {
  /** Data-URL payload (kept small by the host's picker); empty = placeholder frame. */
  dataUrl: string
  width: number
  /** 0..1 paint opacity. */
  opacity: number
}

/** User image pinned to a chart point (anchor = top-left). */
export class ImageNote extends Drawing<ImageProps> {
  readonly type = 'image'

  private _bitmap: HTMLImageElement | null = null
  private _loadedFrom = ''

  protected override defaultProps(): ImageProps {
    return { dataUrl: '', width: 160, opacity: 1 }
  }

  requiredAnchors(): number {
    return 1
  }

  protected frame(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const width = Math.max(24, this.props.width)
    const ratio = this._bitmap && this._bitmap.naturalWidth > 0 ? this._bitmap.naturalHeight / this._bitmap.naturalWidth : 0.66
    return { x: p.x, y: p.y, width, height: width * ratio }
  }

  private ensureBitmap(): void {
    const source = this.props.dataUrl
    if (!source || source === this._loadedFrom || typeof Image === 'undefined') return
    this._loadedFrom = source
    const image = new Image()
    image.onload = () => {
      this._bitmap = image
      this.requestUpdate()
    }
    image.src = source
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    this.ensureBitmap()
    const f = this.frame(viewport)
    if (!f) return
    if (this._bitmap && this.props.dataUrl) {
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, this.props.opacity))
      ctx.drawImage(this._bitmap, f.x, f.y, f.width, f.height)
      ctx.restore()
      if (this.state === 'selected' || this.state === 'editing') {
        ctx.save()
        ctx.strokeStyle = this.style.lineColor
        ctx.lineWidth = 1
        ctx.setLineDash([])
        ctx.strokeRect(f.x, f.y, f.width, f.height)
        ctx.restore()
      }
      return
    }
    // Placeholder until an image is chosen in settings.
    ctx.save()
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = this.style.lineColor
    ctx.lineWidth = 1
    ctx.strokeRect(f.x, f.y, f.width, f.height)
    ctx.setLineDash([])
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = this.style.lineColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('image — pick in settings', f.x + f.width / 2, f.y + f.height / 2)
    ctx.restore()
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const f = this.frame(viewport)
    return !!f && inBox(point, f)
  }
}

export type ContentCardProps = {
  text: string
  url: string
}

/** Quote/link card: body text with the source URL as its footer. */
export class ContentCard extends Drawing<ContentCardProps> {
  readonly type = 'content_card'

  protected override defaultProps(): ContentCardProps {
    return { text: '', url: '' }
  }

  requiredAnchors(): number {
    return 1
  }

  protected body(): string {
    const text = this.props.text || ' '
    return this.props.url ? `${text}\n${this.props.url}` : text
  }

  protected box(viewport: Viewport): { x: number; y: number; width: number; height: number } | null {
    const anchor = this.anchors[0]
    if (!anchor) return null
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return null
    const { width, height } = measureTextBlock(this.body(), this.style)
    return { x: p.x, y: p.y, width: Math.max(140, width + 16), height: height + 16 }
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    paintTextBlock(ctx, this.body(), p, this.style, {
      background: withAlpha('#1b1f27', 0.95),
      borderColor: this.style.lineColor,
      padding: 8,
    })
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const box = this.box(viewport)
    return !!box && inBox(point, box)
  }
}

export type GlyphProps = {
  /** The rendered character(s) — an emoji, sticker glyph, or symbol. */
  glyph: string
  size: number
}

let glyphImageUrl: ((glyph: string) => string | null) | null = null
const glyphImages = new Map<string, HTMLImageElement | 'loading' | 'failed'>()

/**
 * Host-registered emoji artwork source (a vendored image set): platform emoji fonts can't be
 * trusted on canvas (Windows draws no flag glyphs at all), so emoji/sticker marks draw the
 * host's images when a source is registered. Icon marks always stay text — the stroke tint
 * must carry over.
 */
export function setGlyphImageSource(resolve: ((glyph: string) => string | null) | null): void {
  glyphImageUrl = resolve
  glyphImages.clear()
}

/** Shared body of the emoji/sticker/icon tools: one glyph rendered at a point. */
export class GlyphMark extends Drawing<GlyphProps> {
  readonly type: string = 'emoji'

  protected override defaultProps(): GlyphProps {
    return { glyph: '😀', size: 28 }
  }

  requiredAnchors(): number {
    return 1
  }

  protected radius(): number {
    return Math.max(10, this.props.size) / 2 + 4
  }

  /** Icon marks tint with the stroke color; emoji/sticker marks carry their own artwork. */
  protected tintsWithStroke(): boolean {
    return false
  }

  private glyphImage(): HTMLImageElement | null {
    if (this.tintsWithStroke() || !glyphImageUrl || typeof Image === 'undefined') return null
    const url = glyphImageUrl(this.props.glyph)
    if (!url) return null
    const cached = glyphImages.get(url)
    if (cached instanceof HTMLImageElement) return cached
    if (cached === undefined) {
      glyphImages.set(url, 'loading')
      const image = new Image()
      image.onload = () => {
        glyphImages.set(url, image)
        this.requestUpdate()
      }
      image.onerror = () => glyphImages.set(url, 'failed')
      image.src = url
    }
    return null
  }

  paint(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const size = Math.max(10, this.props.size)
    const image = this.glyphImage()
    if (image) {
      ctx.drawImage(image, p.x - size / 2, p.y - size / 2, size, size)
      return
    }
    ctx.save()
    ctx.font = `${size}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Icons render in the drawing hue; emoji/stickers carry their own colors.
    ctx.fillStyle = this.style.lineColor
    ctx.fillText(this.props.glyph || '?', p.x, p.y)
    ctx.restore()
  }

  /** Scale grips at the glyph's bounding-box corners. */
  override resizeHandles(viewport: Viewport): Point[] {
    const anchor = this.anchors[0]
    if (!anchor) return []
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return []
    const r = this.radius()
    return [
      { x: p.x - r, y: p.y - r },
      { x: p.x + r, y: p.y - r },
      { x: p.x + r, y: p.y + r },
      { x: p.x - r, y: p.y + r },
    ]
  }

  override resizeTo(_handleIndex: number, point: Point, viewport: Viewport): void {
    const anchor = this.anchors[0]
    if (!anchor) return
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return
    const r = Math.max(Math.abs(point.x - p.x), Math.abs(point.y - p.y))
    this.applyProps({ size: Math.max(10, Math.min(160, Math.round((r - 4) * 2))) } as Partial<GlyphProps>)
  }

  testHit(point: Point, viewport: Viewport): boolean {
    const anchor = this.anchors[0]
    if (!anchor) return false
    const p = this.anchorToPixel(anchor, viewport)
    if (!p) return false
    const r = this.radius()
    return Math.abs(point.x - p.x) <= r && Math.abs(point.y - p.y) <= r
  }
}

export class StickerMark extends GlyphMark {
  override readonly type = 'sticker'

  protected override defaultProps(): GlyphProps {
    return { glyph: '👍', size: 44 }
  }
}

export class IconMark extends GlyphMark {
  override readonly type = 'icon'

  protected override defaultProps(): GlyphProps {
    return { glyph: '★', size: 24 }
  }

  protected override tintsWithStroke(): boolean {
    return true
  }
}
