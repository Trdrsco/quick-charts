// Which chart a drawing belongs to, and how two copies of one document meet.
//
// A drawing made while sync is on carries no scope and lives in the symbol's SHARED document, the
// one every chart of that symbol reads. A drawing made while sync is off carries this chart's id
// and lives in the chart-bound document the resource contract keys by `{ symbol, chartId }`. The
// switch governs NEW drawings only: one that exists never changes hands, so flipping it strands
// nothing.
//
// Two charts of one symbol each hold a copy of the shared document. When a write is refused
// because the other chart wrote first, the stored document wins for every drawing it holds and
// this chart's own additions follow it, so neither chart's work is lost and the next write lands
// over the merge.
import type { SerializedDrawing } from '@trdrs/chart-drawings'

/** Whether a stored row is this chart's to show: shared (no scope), or bound to this chart. A row
 *  bound to another chart is foreign and never paints here. */
export function ownsDrawing(row: { scope?: string }, chartId: string | undefined): boolean {
  return row.scope === undefined || row.scope === chartId
}

/** The scope a NEW drawing takes: this chart's id while sync is off, else none. Without a chart
 *  id there is nothing to bind to, and the drawing is shared whatever the switch says. */
export function scopeForNew(chartId: string | undefined, syncAcrossPanes: boolean): string | undefined {
  return syncAcrossPanes ? undefined : chartId
}

/** Merge the document another surface wrote first with this surface's own list. The stored rows
 *  win by identity and keep the stored order; rows only this surface holds are appended, because
 *  they are work the other surface never saw. A row this surface deleted comes back when the
 *  other surface still holds it, which is the honest outcome of two surfaces disagreeing. */
export function mergeStoredDrawings(stored: readonly SerializedDrawing[], mine: readonly SerializedDrawing[]): SerializedDrawing[] {
  const seen = new Set(stored.map((d) => d.id))
  return [...stored, ...mine.filter((d) => !seen.has(d.id))]
}
