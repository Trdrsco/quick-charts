// Words a line carries: where they stand along and across it, and the invitation a selected line
// without words shows where they would stand. A line's words turn with it, so every place here is a
// point on the pane, the angle the words turn by about it, and how they align there.
import type { DrawingStyle, Point } from '../core/types'
import { fontOf, withAlpha } from './canvas'

/** Where a line's words stand: the point their middle line meets, turned by `angle` about it, and
 *  which end of the words, or their middle, stands on the point. */
export interface WordsPlace {
  x: number
  y: number
  angle: number
  align: 'left' | 'center' | 'right'
}

/** How far the middle of a line's words stands off the line when they stand above or below it:
 *  half their size and four pixels more. */
export const wordsOffset = (fontSize: number): number => fontSize / 2 + 4

/** The invitation's plus and the room between it and its words, by the words' size: a plus
 *  `fontSize / 2 + 5` across, `fontSize / 2 - 3` before the words. */
const plusSize = (fontSize: number): number => fontSize / 2 + 5
const plusGap = (fontSize: number): number => fontSize / 2 - 3

/** Where a point a distance along and across a place's turned axes stands on the pane. */
export function placeAt(place: WordsPlace, along: number, across: number): Point {
  const cos = Math.cos(place.angle)
  const sin = Math.sin(place.angle)
  return { x: place.x + along * cos - across * sin, y: place.y + along * sin + across * cos }
}

/** The region the invitation covers: its middle, the angle it turns by and its half sizes. */
export interface InvitationRegion {
  cx: number
  cy: number
  angle: number
  halfW: number
  halfH: number
}

/**
 * Paint the invitation a selected line without words shows where its words would stand: a plus,
 * then the placeholder words, both in the line's text color at half strength and in its type. The
 * pair aligns on the place as the words would. A pair that does not turn stands its plus on the
 * pixel grid, so its two strokes read one pixel wide.
 */
export function paintInvitation(ctx: CanvasRenderingContext2D, words: string, place: WordsPlace, style: DrawingStyle, measure: (line: string) => number): InvitationRegion {
  const size = style.fontSize
  const plus = plusSize(size)
  const gap = plusGap(size)
  const width = plus + gap + measure(words)
  const left = place.align === 'left' ? 0 : place.align === 'right' ? -width : -width / 2
  const ink = withAlpha(style.textColor, 0.5)
  ctx.save()
  ctx.setLineDash([])
  ctx.translate(place.x, place.y)
  if (place.angle) ctx.rotate(place.angle)
  ctx.font = fontOf(style)
  ctx.fillStyle = ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(words, left + plus + gap, 0)
  // The plus stands half a pixel above the words' middle; level, on the grid.
  let px = left + plus / 2
  let py = -0.5
  if (!place.angle) {
    px = Math.round(place.x + px - 0.5) + 0.5 - place.x
    py = Math.round(place.y - 1) + 0.5 - place.y
  }
  ctx.strokeStyle = ink
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  ctx.moveTo(px - plus / 2, py)
  ctx.lineTo(px + plus / 2, py)
  ctx.moveTo(px, py - plus / 2)
  ctx.lineTo(px, py + plus / 2)
  ctx.stroke()
  ctx.restore()
  const middle = placeAt(place, left + width / 2, 0)
  return { cx: middle.x, cy: middle.y, angle: place.angle, halfW: width / 2 + 2, halfH: size / 2 + 2 }
}

/** Whether a pane point falls inside a turned region. */
export function inRegion(point: Point, r: InvitationRegion): boolean {
  const dx = point.x - r.cx
  const dy = point.y - r.cy
  const cos = Math.cos(-r.angle)
  const sin = Math.sin(-r.angle)
  return Math.abs(dx * cos - dy * sin) <= r.halfW && Math.abs(dx * sin + dy * cos) <= r.halfH
}
