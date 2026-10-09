// Painting words a drawing takes in place: its words or its placeholder, and while an inline edit
// is open, the selection's wash behind the words, the composing run's underline and the caret.
// The drawing decides where its words stand; this paints them there, the same way for every tool
// that types on the chart.
import { caretPlace, lineLeft, runSpans, type TextBlock, type TextDraft } from '../core/textEntry'

/** The wash behind selected words: white at a fifth, laid under the words so they keep their own
 *  color. */
export const SELECTION_WASH = 'rgba(255, 255, 255, 0.2)'

/** How wide the caret is, centred on its place. */
export const CARET_WIDTH = 2

/** A block of words as it paints: its first line's box, its line height, its type and color, and
 *  the width its lines align within. */
export interface TextEntryPaint {
  x: number
  y: number
  width: number
  lineHeight: number
  font: string
  color: string
  align: 'left' | 'center' | 'right'
  /** The words in lines. */
  block: TextBlock
  /** The placeholder in lines, and the alpha it paints at, shown in place of the words; null where
   *  it does not show. */
  placeholder: { block: TextBlock; alpha: number } | null
  /** The draft an open inline edit shows, or null. */
  draft: TextDraft | null
  measure: (line: string) => number
}

/** Where a line's middle stands, from its box's top: half a line down and a pixel more, which is
 *  where its words paint with a middle baseline. */
export const lineMiddle = (lineHeight: number): number => lineHeight / 2 + 1

/** How tall the caret stands in a line: as tall as the words' type, or the line where that is
 *  shorter. */
const caretHeight = (font: string, lineHeight: number): number => Math.min(lineHeight, Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || lineHeight)

/** Paint a block of words, or its placeholder, and while an edit is open on it, its selection,
 *  composing run and caret. The pixels a run covers start at the pixel edge nearest its start and
 *  run through the pixel its end reaches; the composing run is underlined on its lines' last row of
 *  pixels; the caret is two pixels wide on its place and as tall as the type, standing in the
 *  middle of its line, in the words' color. */
export function paintTextEntry(ctx: CanvasRenderingContext2D, p: TextEntryPaint): void {
  const draft = p.draft
  const shown = p.placeholder ? p.placeholder.block : p.block
  const lineTop = (i: number): number => p.y + i * p.lineHeight
  const left = (block: TextBlock, i: number): number => p.x + lineLeft(block, i, p.align, p.width)
  ctx.save()
  ctx.setLineDash([])
  // The words run left to right as the field over them does, whatever direction the page reads in.
  ctx.direction = 'ltr'
  if (draft && draft.selectionStart !== draft.selectionEnd && !p.placeholder) {
    ctx.fillStyle = SELECTION_WASH
    for (const span of runSpans(p.block, draft.selectionStart, draft.selectionEnd, p.measure)) {
      const from = Math.round(left(p.block, span.line) + span.x0)
      const to = Math.ceil(left(p.block, span.line) + span.x1)
      if (to > from) ctx.fillRect(from, lineTop(span.line), to - from, p.lineHeight)
    }
  }
  ctx.font = p.font
  ctx.fillStyle = p.color
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const alpha = ctx.globalAlpha
  if (p.placeholder) ctx.globalAlpha = alpha * p.placeholder.alpha
  shown.lines.forEach((l, i) => {
    if (l.text === '') return
    ctx.fillText(l.text, left(shown, i), lineTop(i) + lineMiddle(p.lineHeight))
  })
  ctx.globalAlpha = alpha
  if (draft?.composition && !p.placeholder) {
    for (const span of runSpans(p.block, draft.composition.start, draft.composition.end, p.measure)) {
      const from = Math.round(left(p.block, span.line) + span.x0)
      const to = Math.ceil(left(p.block, span.line) + span.x1)
      if (to > from) ctx.fillRect(from, lineTop(span.line) + p.lineHeight - 1, to - from, 1)
    }
  }
  if (draft?.caret && draft.selectionStart === draft.selectionEnd) {
    const at = caretPlace(p.block, draft.selectionEnd, p.measure)
    const tall = caretHeight(p.font, p.lineHeight)
    ctx.fillRect(Math.round(left(p.block, at.line) + at.x) - CARET_WIDTH / 2, lineTop(at.line) + Math.round((p.lineHeight - tall) / 2), CARET_WIDTH, tall)
  }
  ctx.restore()
}

/** A selected drawing's frame around its words: a band two pixels wide just outside the box, in
 *  the given color at the given alpha. */
export function paintWordsFrame(ctx: CanvasRenderingContext2D, box: { x: number; y: number; width: number; height: number }, color: string, alpha: number): void {
  ctx.save()
  ctx.setLineDash([])
  ctx.globalAlpha = ctx.globalAlpha * alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.strokeRect(box.x - 1, box.y - 1, box.width + 2, box.height + 2)
  ctx.restore()
}
