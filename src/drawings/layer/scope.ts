// Which chart a drawing belongs to inside a SHARED document.
//
// The drawing-resource context already decides who can see a document at all: a chart-local
// context is one chart's own, and nothing in it is ever foreign. Inside a layout-shared or
// symbol-global document, several charts write one document, and this is what keeps them apart: a
// drawing made while sync is on carries no scope and every chart of that document paints it; a
// drawing made while sync is off carries this chart's id and only this chart paints it. The switch
// governs NEW drawings only: one that exists never changes hands, so flipping it strands nothing.
//
// How two copies of one document meet is the document's own rule, in `drawings/document.ts`.

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
