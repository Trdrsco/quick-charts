import type { DrawingStyle, LineStyle, Point } from '../core/types'

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

/** Stroke a polyline through the given points. */
export function strokePolyline(ctx: CanvasRenderingContext2D, points: readonly Point[]): void {
  if (points.length < 2) return
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  ctx.stroke()
}

/** The CSS font string for a drawing's text channel. */
export function fontOf(style: DrawingStyle): string {
  const weight = style.bold ? '600 ' : ''
  const slant = style.italic ? 'italic ' : ''
  return `${slant}${weight}${style.fontSize}px ui-sans-serif, system-ui, sans-serif`
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

/** Measure a text block (newline-aware) without a live rendering context. */
export function measureTextBlock(
  text: string,
  style: DrawingStyle,
): { width: number; height: number; lineHeight: number } {
  const lines = text.split('\n')
  const lineHeight = Math.round(style.fontSize * 1.35)
  if (!measurer && typeof document !== 'undefined') {
    measurer = document.createElement('canvas').getContext('2d')
  }
  let width = 0
  if (measurer) {
    measurer.font = fontOf(style)
    for (const line of lines) width = Math.max(width, measurer.measureText(line).width)
  } else {
    for (const line of lines) width = Math.max(width, line.length * style.fontSize * 0.6)
  }
  return { width, height: lines.length * lineHeight, lineHeight }
}

export interface TextBlockOptions {
  background?: string
  borderColor?: string
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
      ctx.lineWidth = 1
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

/** Price formatted to a sensible tick precision for labels and stats. */
export function formatPrice(value: number): string {
  const abs = Math.abs(value)
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 3 : 5
  return value.toFixed(decimals)
}

const HANDLE_RADIUS = 4.5

/** Paint the anchor handles for a selected/editing drawing. */
export function paintHandles(
  ctx: CanvasRenderingContext2D,
  points: readonly Point[],
  accent: string,
): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.lineWidth = 1.5
  for (const p of points) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, HANDLE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = accent
    ctx.stroke()
  }
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
