import type { DrawingStyle, LineStyle, Point } from '../core/types'
import { DARK_THEME } from '../../../theme/palettes'

/** Dash pattern for a line style, scaled so dashes stay legible at any width. */
export function dashPattern(style: LineStyle, width: number): number[] {
  switch (style) {
    case 'dashed':
      return [Math.max(4, width * 3), Math.max(3, width * 2)]
    case 'dotted':
      return [Math.max(1, width), Math.max(2, width * 2)]
    default:
      return []
  }
}

/** Apply the stroke channel (color, width, dash) of a drawing's style. */
export function applyStroke(ctx: CanvasRenderingContext2D, style: DrawingStyle): void {
  ctx.strokeStyle = style.lineColor
  ctx.lineWidth = style.lineWidth
  ctx.setLineDash(dashPattern(style.lineStyle, style.lineWidth))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

/** Stroke the segment a→b with the current stroke settings. */
export function strokeSegment(ctx: CanvasRenderingContext2D, a: Point, b: Point): void {
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

/** The family drawings paint their words in: the chart's own font stack, the one the built-in themes
 *  give the chrome and the scales. */
export const DRAWING_FONT_FAMILY = DARK_THEME['text.fontFamily']

/** The CSS font string for a drawing's text channel. */
export function fontOf(style: DrawingStyle): string {
  const weight = style.bold ? '600 ' : ''
  const slant = style.italic ? 'italic ' : ''
  return `${slant}${weight}${style.fontSize}px ${DRAWING_FONT_FAMILY}`
}

export interface LabelOptions {
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  /** Padded pill behind the text; omit for bare text. */
  background?: string
  padding?: number
}

/** Paint a single-line text label; returns its painted bounds (for hit-testing). */
export function paintLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  at: Point,
  style: DrawingStyle,
  opts: LabelOptions = {},
): { x: number; y: number; width: number; height: number } {
  const { align = 'left', baseline = 'middle', background, padding = 4 } = opts
  ctx.save()
  ctx.font = fontOf(style)
  ctx.textAlign = align
  ctx.textBaseline = baseline
  const metrics = ctx.measureText(text)
  const width = metrics.width
  const height = style.fontSize + 2
  const left = align === 'right' ? at.x - width : align === 'center' ? at.x - width / 2 : at.x
  const top = baseline === 'bottom' ? at.y - height : baseline === 'top' ? at.y : at.y - height / 2
  if (background) {
    ctx.fillStyle = background
    ctx.beginPath()
    ctx.roundRect(left - padding, top - padding, width + padding * 2, height + padding * 2, 4)
    ctx.fill()
  }
  ctx.fillStyle = style.textColor
  ctx.setLineDash([])
  ctx.fillText(text, at.x, at.y)
  ctx.restore()
  return { x: left - padding, y: top - padding, width: width + padding * 2, height: height + padding * 2 }
}

/** Filled arrow head at `tip`, oriented along `from`→`tip`. Scales with line width. */
export function paintArrowHead(
  ctx: CanvasRenderingContext2D,
  from: Point,
  tip: Point,
  style: DrawingStyle,
): void {
  const angle = Math.atan2(tip.y - from.y, tip.x - from.x)
  const size = 4 + style.lineWidth * 2.5
  ctx.save()
  ctx.fillStyle = style.lineColor
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(tip.x - size * Math.cos(angle - Math.PI / 6), tip.y - size * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(tip.x - size * Math.cos(angle + Math.PI / 6), tip.y - size * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

let measurer: CanvasRenderingContext2D | null = null

/** How wide a line of words reads in a style's type, measured without a live rendering context. */
export function lineMeasure(style: DrawingStyle): (line: string) => number {
  if (!measurer && typeof document !== 'undefined') {
    measurer = document.createElement('canvas').getContext('2d')
  }
  const m = measurer
  if (!m) return (line) => line.length * style.fontSize * 0.6
  const font = fontOf(style)
  // The measurer is shared, so each measure states its own type.
  return (line) => {
    if (m.font !== font) m.font = font
    return m.measureText(line).width
  }
}

/** Measure a text block (newline-aware) without a live rendering context. */
export function measureTextBlock(
  text: string,
  style: DrawingStyle,
): { width: number; height: number; lineHeight: number } {
  const lines = text.split('\n')
  const lineHeight = Math.round(style.fontSize * 1.35)
  const measure = lineMeasure(style)
  let width = 0
  for (const line of lines) width = Math.max(width, measure(line))
  return { width, height: lines.length * lineHeight, lineHeight }
}

/** The words broken into lines no wider than `width` pixels in the style's type: each line breaks
 *  at its spaces, and a word wider than the width breaks where it must. */
export function wrapText(text: string, style: DrawingStyle, width: number): string {
  if (!(width > 0)) return text
  const measure = lineMeasure(style)
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const joined = line ? `${line} ${word}` : word
      if (measure(joined) <= width) {
        line = joined
        continue
      }
      if (line) lines.push(line)
      let rest = word
      while (rest.length > 1 && measure(rest) > width) {
        let cut = rest.length - 1
        while (cut > 1 && measure(rest.slice(0, cut)) > width) cut--
        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines.join('\n')
}

/** The ink that reads on a color: black on a light one, white on a dark one, parted where the two
 *  contrast with it equally. */
export function inkOn(color: string): string {
  const m = withAlpha(color, 1).match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)/)
  if (!m) return '#ffffff'
  const [r, g, b] = [m[1], m[2], m[3]].map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#ffffff'
}

export interface TextBlockOptions {
  background?: string
  borderColor?: string
  /** The border's width; 1 unless given. */
  borderWidth?: number
  padding?: number
  align?: 'left' | 'center'
}

/** Paint a (possibly multi-line) text block anchored at its top-left; returns painted bounds. */
export function paintTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  topLeft: Point,
  style: DrawingStyle,
  opts: TextBlockOptions = {},
): { x: number; y: number; width: number; height: number } {
  const { background, borderColor, padding = 6, align = 'left' } = opts
  const { width, height, lineHeight } = measureTextBlock(text, style)
  const box = {
    x: topLeft.x,
    y: topLeft.y,
    width: width + padding * 2,
    height: height + padding * 2,
  }
  ctx.save()
  ctx.setLineDash([])
  if (background || borderColor) {
    ctx.beginPath()
    ctx.roundRect(box.x, box.y, box.width, box.height, 4)
    if (background) {
      ctx.fillStyle = background
      ctx.fill()
    }
    if (borderColor) {
      ctx.strokeStyle = borderColor
      ctx.lineWidth = opts.borderWidth ?? 1
      ctx.stroke()
    }
  }
  ctx.font = fontOf(style)
  ctx.fillStyle = style.textColor
  ctx.textBaseline = 'top'
  ctx.textAlign = align
  const textX = align === 'center' ? box.x + box.width / 2 : box.x + padding
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], textX, box.y + padding + i * lineHeight)
  }
  ctx.restore()
  return box
}

/** The shape of a drawing's selection handles: the round one most drawings show, a rounded square,
 *  or the small thin ring a mark shows on its point. */
export type HandleShape = 'circle' | 'square' | 'small'

/** The point of a list nearest a mouse, by its place in the list, within a reach; null for none. */
export function hoveredIndex(points: readonly Point[], pointer: Point | null, reach: number): number | null {
  if (!pointer) return null
  let best: number | null = null
  let bestD = reach
  points.forEach((p, i) => {
    const d = Math.hypot(p.x - pointer.x, p.y - pointer.y)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** The halo round a handle under the pointer, in its ring ink at 20% and 3px wide: a ring on a
 *  radius of 8 round a round handle, a square 16px across with corners rounded at 4.8 round a square
 *  one. */
const HANDLE_HALO = { radius: 8, half: 8, corner: 4.8, width: 3, alpha: 0.2 }

/** Paint a drawing's handles, one on each point's pixel, filled with the chart's ground so a handle
 *  covers what it stands on. Selected, a round handle is a ring of radius 5.5, 2px wide; a square
 *  one is 11px across with corners rounded at 3.3, its ring 2px wide; a small one is a ring of
 *  radius 3.5, 1px wide; and a round or square one under the pointer stands in a halo. The thin form
 *  a hovered drawing shows is a ring of radius 6, or a square 12px across, 1px wide. */
export function paintHandles(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  inks: { ring: string; center: string },
  shape: HandleShape = 'circle',
  hovered: number | null = null,
  form: 'selected' | 'thin' = 'selected',
): void {
  ctx.save()
  ctx.setLineDash([])
  points.forEach((p, i) => {
    const x = Math.round(p.x) + 0.5
    const y = Math.round(p.y) + 0.5
    if (i === hovered && shape !== 'small' && form === 'selected') {
      ctx.globalAlpha = HANDLE_HALO.alpha
      ctx.strokeStyle = inks.ring
      ctx.lineWidth = HANDLE_HALO.width
      ctx.beginPath()
      if (shape === 'square') ctx.roundRect(x - HANDLE_HALO.half, y - HANDLE_HALO.half, HANDLE_HALO.half * 2, HANDLE_HALO.half * 2, HANDLE_HALO.corner)
      else ctx.arc(x, y, HANDLE_HALO.radius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    const thin = form === 'thin'
    ctx.fillStyle = inks.center
    ctx.strokeStyle = inks.ring
    ctx.beginPath()
    if (shape === 'square') {
      const half = thin ? 6 : 5.5
      ctx.lineWidth = thin ? 1 : 2
      ctx.roundRect(x - half, y - half, half * 2, half * 2, 3.3)
    } else if (shape === 'small') {
      ctx.lineWidth = 1
      ctx.arc(x, y, 3.5, 0, Math.PI * 2)
    } else {
      ctx.lineWidth = thin ? 1 : 2
      ctx.arc(x, y, thin ? 6 : 5.5, 0, Math.PI * 2)
    }
    ctx.fill()
    ctx.stroke()
  })
  ctx.restore()
}

/** Square scale grips (emoji/image corners) for a selected drawing. */
export function paintResizeGrips(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  accent: string,
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 1.5
  for (const p of points) {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = accent
    ctx.beginPath()
    ctx.rect(p.x - 3.5, p.y - 3.5, 7, 7)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

/** Fill color string with the style's fill opacity applied. */
export function fillPaint(style: DrawingStyle): string | null {
  if (style.fillOpacity <= 0) return null
  return withAlpha(style.fillColor, style.fillOpacity)
}

/** The alpha carried by a color value (rgba's 4th component); opaque formats report 1. */
export function alphaOf(color: string): number {
  const m = color.trim().match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)$/i)
  if (!m) return 1
  const a = Number(m[1])
  return Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1
}

/** Apply an alpha to a #rgb/#rrggbb/rgb()/rgba() color. Unknown formats pass through. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const hex = color.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
    const n = parseInt(full, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
  }
  const rgb = color.trim().match(/^rgba?\(([^)]+)\)$/i)
  if (rgb) {
    const parts = rgb[1].split(',').map((s) => s.trim())
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${a})`
  }
  return color
}
