// Words typed on the chart. A drawing that takes its words in place paints them itself as they are
// typed: the words so far, the caret, the selection and the placeholder all stand on the canvas,
// in the drawing's own type, while an invisible field laid exactly over them takes the keys. The
// field is the source of the words and the selection; the drawing is where they are seen.
//
// This module is the part every such drawing shares: what the field reports (the draft), where
// the words stand (the frame the field is laid over), and how a block of words falls into lines
// with each line keeping its place in the words, so a caret offset or a selection becomes a point
// on the canvas.

/** What an inline edit shows on the chart, as the field reports it: the words typed so far, the
 *  selection, the run an input method is composing, and whether the caret is lit. */
export interface TextDraft {
  /** The words as they stand in the field. */
  value: string
  /** The selection as offsets into `value`; equal offsets are a caret. */
  selectionStart: number
  selectionEnd: number
  /** The run an input method is composing, as offsets into `value`, or null. */
  composition: { start: number; end: number } | null
  /** Whether the caret paints: the field has the focus and the blink is in its lit half. */
  caret: boolean
}

/** Where a drawing's words stand on the pane, which is where an inline editor lays its field. */
export interface TextEditFrame {
  /** The first line's top-left, in pane-local CSS pixels. */
  x: number
  y: number
  /** The widest line's width. */
  width: number
  /** How many lines the words take. */
  lines: number
  lineHeight: number
  /** The CSS font the words paint in. */
  font: string
  align: 'left' | 'center' | 'right'
  /** The width the words wrap at, or null when each line runs its own length. */
  wrapWidth: number | null
  /** Radians the words turn about their top-left. */
  angle: number
}

/** One line of a block of words: its text, where it starts and ends in the words (the line break
 *  and a space the line wrapped at are in neither line), and its width. */
export interface TextLine {
  text: string
  start: number
  end: number
  width: number
}

/** A block of words in lines, and its widest line's width. */
export interface TextBlock {
  lines: TextLine[]
  width: number
}

/** Lay words out in lines: one per line break and, given a wrap width, broken at the space before
 *  a word that would run past it, a word wider than the width breaking where it must. Every line
 *  keeps its offsets into the words, so the layout answers where any offset stands. */
export function layoutTextBlock(text: string, measure: (line: string) => number, wrapWidth: number | null = null): TextBlock {
  const lines: TextLine[] = []
  let from = 0
  for (const paragraph of text.split('\n')) {
    if (wrapWidth === null || !(wrapWidth > 0)) lines.push(line(text, from, from + paragraph.length, measure))
    else wrapParagraph(text, from, from + paragraph.length, measure, wrapWidth, lines)
    from += paragraph.length + 1
  }
  return { lines, width: lines.reduce((widest, l) => Math.max(widest, l.width), 0) }
}

function line(text: string, start: number, end: number, measure: (line: string) => number): TextLine {
  const words = text.slice(start, end)
  return { text: words, start, end, width: measure(words) }
}

function wrapParagraph(text: string, start: number, end: number, measure: (line: string) => number, width: number, out: TextLine[]): void {
  let lineStart = start
  let lineEnd = start
  let at = start
  while (at <= end) {
    const space = text.indexOf(' ', at)
    const wordEnd = space === -1 || space > end ? end : space
    if (measure(text.slice(lineStart, wordEnd)) <= width) {
      lineEnd = wordEnd
    } else {
      if (lineEnd > lineStart) {
        out.push(line(text, lineStart, lineEnd, measure))
        lineStart = at
      }
      // A word wider than the width breaks where it must, keeping at least one character a line.
      while (wordEnd - lineStart > 1 && measure(text.slice(lineStart, wordEnd)) > width) {
        let cut = wordEnd - 1
        while (cut > lineStart + 1 && measure(text.slice(lineStart, cut)) > width) cut--
        out.push(line(text, lineStart, cut, measure))
        lineStart = cut
      }
      lineEnd = wordEnd
    }
    at = wordEnd + 1
  }
  out.push(line(text, lineStart, lineEnd, measure))
}

/** Which line an offset stands on: the first line it does not pass the end of. An offset at a
 *  wrap point stands at the end of the line before it. */
export function lineOf(block: TextBlock, offset: number): number {
  for (let i = 0; i < block.lines.length; i++) {
    const l = block.lines[i]!
    if (offset <= l.end) return i
    const next = block.lines[i + 1]
    if (next && offset < next.start) return i
  }
  return Math.max(0, block.lines.length - 1)
}

/** Where a caret at an offset stands: its line, and its distance from the line's start. */
export function caretPlace(block: TextBlock, offset: number, measure: (line: string) => number): { line: number; x: number } {
  const index = lineOf(block, offset)
  const l = block.lines[index]
  if (!l) return { line: 0, x: 0 }
  const within = Math.max(0, Math.min(offset, l.end) - l.start)
  return { line: index, x: within === 0 ? 0 : measure(l.text.slice(0, within)) }
}

/** The stretch of each line a run of the words covers, from the line's start: one span per line
 *  the run reaches, empty lines inside the run included. */
export function runSpans(block: TextBlock, start: number, end: number, measure: (line: string) => number): { line: number; x0: number; x1: number }[] {
  const from = Math.min(start, end)
  const to = Math.max(start, end)
  if (from === to) return []
  const spans: { line: number; x0: number; x1: number }[] = []
  block.lines.forEach((l, i) => {
    if (to < l.start || from > l.end) return
    if (to === l.start && l.end > l.start) return
    const a = Math.max(from, l.start) - l.start
    const b = Math.min(to, l.end) - l.start
    spans.push({ line: i, x0: a === 0 ? 0 : measure(l.text.slice(0, a)), x1: b === 0 ? 0 : measure(l.text.slice(0, b)) })
  })
  return spans
}

/** Where a line stands across its block for an alignment, from the block's left. */
export function lineLeft(block: TextBlock, index: number, align: 'left' | 'center' | 'right', width = block.width): number {
  const l = block.lines[index]
  if (!l || align === 'left') return 0
  return align === 'center' ? (width - l.width) / 2 : width - l.width
}
