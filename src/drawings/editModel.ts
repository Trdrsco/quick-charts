// Two edit workflows whose rules are decisions rather than geometry: copying a drawing, and
// typing into one.
//
// CLONE AND PASTE both land a copy BESIDE its source rather than under it, because a copy that
// lands exactly on the original is invisible and the trader drags what they think is the copy while
// the original sits underneath. The offset is stated once here, in pixels, and converted to the
// chart's own time by the caller that has a viewport.
//
// TEXT is the workflow where an empty commit means two different things. On a drawing the trader
// just placed, empty means "I changed my mind" and the placement is undone: there is no such thing
// as a blank note nobody asked for. On a drawing that already carries text, empty means "clear it",
// and the drawing stays. Getting that backwards leaves a chart littered with empty labels or eats
// a note somebody meant to blank.

/** How far right a clone or a paste lands from its source, in CSS pixels. */
export const CLONE_OFFSET_PX = 24

/** What a text edit is attached to: one drawing, optionally one cell of a table. */
export interface TextEditTarget {
  id: string
  /** Set for a table cell; absent when the edit is the drawing's own text. */
  cell?: { row: number; col: number }
  /** The edit opened as part of placing this drawing, rather than on an existing one. */
  fresh: boolean
}

/** What committing a text edit does. */
export type TextCommit =
  | { kind: 'apply'; text: string }
  | { kind: 'apply-cell'; row: number; col: number; text: string }
  /** A fresh placement committed empty: undo the placement, and write no history entry. */
  | { kind: 'discard' }

/** Resolve a commit. Whitespace is trimmed first, so a note of nothing but spaces is a blank one. */
export function commitText(target: TextEditTarget, value: string): TextCommit {
  const text = value.trim()
  if (target.cell) return { kind: 'apply-cell', row: target.cell.row, col: target.cell.col, text }
  if (!text && target.fresh) return { kind: 'discard' }
  return { kind: 'apply', text }
}

/** What cancelling does. A fresh placement is removed, because cancelling the text of a drawing
 *  that only exists to carry text cancels the drawing. An existing one keeps what it had. */
export function cancelText(target: TextEditTarget): { kind: 'remove' } | { kind: 'keep' } {
  return target.fresh ? { kind: 'remove' } : { kind: 'keep' }
}

/** Whether placing this tool opens the text editor straight away. */
export const opensTextEditor = (tool: { hasText?: boolean } | undefined): boolean => !!tool?.hasText
