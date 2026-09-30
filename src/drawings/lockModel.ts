// What a lock refuses, and what the remove menu takes.
//
// Two locks act at once and they are not the same thing. The toolbar's LOCK ALL is a mode that
// suspends the chart: it refuses every edit, the deliberate Delete and Clone included, without
// changing any drawing. A DRAWING's own lock is a trader pinning one object down: it refuses a
// move, a resize, a text edit, the eraser and a modifier-drag duplicate, and lets Delete and Clone
// act, because a trader who names a locked drawing and asks for either has asked for exactly that.
// One predicate holds that matrix, so no surface has to remember which lock answers which edit.
//
// The matrix is the library's own and stays inside it. Nothing on the public subpath names it: a
// host locks and unlocks through the drawing commands and reads what they answer, so the policy
// can be sharpened here without a consumer having reproduced it.
//
// The remove menu is here for the same reason: its counts are a lock question. A sweep spares
// locked drawings unless the standing preference says otherwise, so what the menu offers to take
// and what it says it will take are one calculation.
import type { ChartMessageKey } from '../i18n/en'

/** Every edit a lock is asked about. `place` and `paste` bring a new drawing and so have no target
 *  of their own; the rest act on one.
 *
 *  `delete` and `clone` are the DELIBERATE actions a trader names from the toolbar, the menu or a
 *  key. `erase` and `cloneDrag` are the gestures that would do the same thing by accident: the
 *  eraser sweeping over a drawing, and a modifier-drag pulling a copy out of it. They are separate
 *  edits because a lock answers them differently. */
type DrawingEdit = 'select' | 'move' | 'resize' | 'delete' | 'editText' | 'clone' | 'erase' | 'cloneDrag' | 'place' | 'paste'

/** What a drawing's OWN lock refuses: everything that would change the object where it stands, or
 *  take it away under a gesture aimed at the chart rather than at it.
 *
 *  Selecting is deliberately absent, because a locked drawing stays reachable so it can be
 *  inspected, restyled and unlocked, which is the only way back. So are `delete` and `clone`: a
 *  trader who selects a locked drawing and presses Delete, or picks Clone from its menu, has named
 *  that one object and asked for exactly this. Refusing there leaves a button that says it acted
 *  and did not. */
const LOCKED_REFUSES: readonly DrawingEdit[] = ['move', 'resize', 'editText', 'erase', 'cloneDrag']

/** The one lock question every surface asks.
 *
 *  Two locks act at once. `allLocked` is the toolbar's mode and it suspends editing across the whole
 *  chart, new drawings included, without changing any drawing's own flag. A drawing's `locked`
 *  refuses only the edits that would change it. `target` is null for an edit that has no drawing
 *  yet. */
export function editRefused(edit: DrawingEdit, target: { locked: boolean } | null, allLocked: boolean): boolean {
  if (allLocked) return true
  return !!target && target.locked && LOCKED_REFUSES.includes(edit)
}

/** Live tally the remove menu counts from. */
export interface DrawingCounts {
  total: number
  locked: number
}

/** How many drawings a sweep would actually take. A locked drawing survives unless the standing
 *  "always remove locked" preference is on, and the menu's row shows THIS number rather than the
 *  total, so the count and the outcome cannot disagree. */
export function removableDrawings(counts: DrawingCounts, includeLocked: boolean): number {
  return includeLocked ? counts.total : counts.total - counts.locked
}

/** One row the remove menu offers. Rows whose count is zero are never built, so the menu never
 *  offers a no-op, and the combined row appears only when both kinds are present. */
export interface RemoveRow {
  id: 'drawings' | 'indicators' | 'both'
  /** The carrier message; its slots are filled with counted phrases by the surface that renders it. */
  label: ChartMessageKey
  drawings: number
  indicators: number
}

/** The remove menu's rows for the current tallies. An empty array means there is nothing to take,
 *  and the surface says so rather than showing a menu of dead rows. */
export function removeRows(counts: DrawingCounts, indicators: number, includeLocked: boolean): RemoveRow[] {
  const drawings = removableDrawings(counts, includeLocked)
  const rows: RemoveRow[] = []
  if (drawings > 0) rows.push({ id: 'drawings', label: 'drawing.removeItems', drawings, indicators: 0 })
  if (indicators > 0) rows.push({ id: 'indicators', label: 'drawing.removeItems', drawings: 0, indicators })
  if (drawings > 0 && indicators > 0) rows.push({ id: 'both', label: 'drawing.removeBoth', drawings, indicators })
  return rows
}
