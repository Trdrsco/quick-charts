// A line's stats box: a rounded grey box of up to three rows, its price move, its span and its
// angle, each led by a small mark of what it reads. The marks are drawn here from lines and one arc,
// in the box's own ink.
import type { Point } from '../core/types'

/** The box's ground, rounded at four, and the ink its rows and marks are in. */
export const STATS_GROUND = 'rgba(70, 70, 70, 0.9)'
export const STATS_INK = '#ffffff'
const MARK_INK = '#f9f9f9'
/** The size the rows read at. */
export const STATS_FONT_SIZE = 12

/** The box's rhythm: eight pixels above and below its rows, a row every 26 pixels, a mark centred
 *  21 pixels in, the words 42 pixels in, and 13 pixels after the widest row. */
const PAD_Y = 8
const ROW = 26
const MARK_X = 21
const WORDS_X = 42
const PAD_END = 13

/** What a row reads: the price move, the span, or the angle. */
export type StatsRow = { kind: 'price' | 'span' | 'angle'; text: string }

/** Where the box stands: its top-left on the pane. */
export interface StatsBox {
  x: number
  y: number
  width: number
  height: number
}

/** The box a set of rows takes, its top-left at a point. */
export function statsBoxAt(at: Point, rows: readonly StatsRow[], measure: (text: string) => number): StatsBox {
  const widest = rows.reduce((w, r) => Math.max(w, measure(r.text)), 0)
  return { x: at.x, y: at.y, width: Math.round(WORDS_X + widest + PAD_END), height: PAD_Y * 2 + rows.length * ROW }
}

/** Paint the box and its rows, each led by its mark. */
export function paintStatsBox(ctx: CanvasRenderingContext2D, box: StatsBox, rows: readonly StatsRow[], font: string): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.fillStyle = STATS_GROUND
  ctx.beginPath()
  ctx.roundRect(box.x, box.y, box.width, box.height, 4)
  ctx.fill()
  ctx.font = font
  ctx.textAlign = 'start'
  ctx.textBaseline = 'middle'
  rows.forEach((row, i) => {
    const middle = box.y + PAD_Y + ROW / 2 + i * ROW
    paintMark(ctx, row.kind, box.x + MARK_X, middle)
    ctx.fillStyle = STATS_INK
    ctx.fillText(row.text, box.x + WORDS_X, middle)
  })
  ctx.restore()
}

/** A row's mark, about its centre: a price move is a double arrow between two levels, a span a
 *  double arrow between two bars, an angle two rays from a corner with an arc between them. */
function paintMark(ctx: CanvasRenderingContext2D, kind: StatsRow['kind'], cx: number, cy: number): void {
  ctx.strokeStyle = MARK_INK
  ctx.lineWidth = 1
  ctx.lineCap = 'butt'
  ctx.lineJoin = 'miter'
  ctx.beginPath()
  if (kind === 'price') {
    for (const dy of [-6.5, 6.5]) {
      ctx.moveTo(cx - 6, cy + dy)
      ctx.lineTo(cx + 5, cy + dy)
    }
    ctx.moveTo(cx - 0.5, cy - 5)
    ctx.lineTo(cx - 0.5, cy + 5)
    for (const s of [-1, 1]) {
      ctx.moveTo(cx - 3, cy + s * 2)
      ctx.lineTo(cx - 0.5, cy + s * 4.5)
      ctx.lineTo(cx + 2, cy + s * 2)
    }
  } else if (kind === 'span') {
    for (const x of [-7.5, 5.5]) {
      ctx.rect(cx + x, cy - 3.5, 2, 8)
      ctx.moveTo(cx + x + 1, cy - 6)
      ctx.lineTo(cx + x + 1, cy - 4)
      ctx.moveTo(cx + x + 1, cy + 5)
      ctx.lineTo(cx + x + 1, cy + 7)
    }
    ctx.moveTo(cx - 3.5, cy + 0.5)
    ctx.lineTo(cx + 3.5, cy + 0.5)
    for (const s of [-1, 1]) {
      ctx.moveTo(cx + s, cy - 2)
      ctx.lineTo(cx + s * 3.5, cy + 0.5)
      ctx.lineTo(cx + s, cy + 3)
    }
  } else {
    const corner = { x: cx - 5.5, y: cy + 5.5 }
    const ray = (64.7 * Math.PI) / 180
    ctx.moveTo(cx - 6, corner.y)
    ctx.lineTo(cx + 6, corner.y)
    ctx.moveTo(corner.x, corner.y)
    ctx.lineTo(corner.x + 12.5 * Math.cos(ray), corner.y - 12.5 * Math.sin(ray))
    ctx.moveTo(corner.x + 7, corner.y)
    ctx.arc(corner.x, corner.y, 7, 0, -ray, true)
  }
  ctx.stroke()
}
