// The drawing tools a widget offers: every tool when the host names no list, or exactly the host's
// list. A tool outside the offered set stays off this chart for CREATING drawings: no
// control draws it, every door that would arm it refuses, and no copy of a drawing of it is made.
// Drawings of it that are already on the chart are untouched: they render, select, edit, lock, hide
// and delete exactly as any other drawing does, so a chart never strands what a viewer cannot make.
//
// The eraser is always offered. It removes drawings and creates none, and a viewer must always be
// able to remove what is on the chart, so a list neither needs to name it nor can leave it out.
import { drawingTools } from '../drawings/tools'
import { TRANSIENT_TOOLS } from '../drawings/cursorModel'

/** The tools a widget offers, or null when the host names no list and every tool is offered. */
export type OfferedDrawingTools = ReadonlySet<string> | null

/** Whether an id names a tool a list may name: a registered tool or one of the transient tools
 *  (eraser, measure, zoom). */
function isDrawingToolId(id: unknown): id is string {
  return typeof id === 'string' && (drawingTools.has(id) || (TRANSIENT_TOOLS as readonly string[]).includes(id))
}

const TAKES = 'it takes the types drawingTools.all() lists, zoom and eraser'

/** Validate the host's `drawingTools` option. An empty list, an id that names no tool and a
 *  repeated id are setup errors: nothing a host passes is substituted. A list that offers no tool
 *  that creates a drawing (`['eraser']`, `['measure']`) is valid: it is a chart whose viewers keep
 *  what is on it and make nothing new. */
export function resolveOfferedDrawingTools(list: readonly unknown[] | undefined): OfferedDrawingTools {
  if (list === undefined) return null
  if (!Array.isArray(list)) throw new TypeError(`drawingTools must be a list of drawing tool types; ${TAKES}`)
  if (list.length === 0) throw new TypeError(`drawingTools must name at least one drawing tool type; ${TAKES}`)
  const seen = new Set<string>()
  for (const id of list) {
    if (!isDrawingToolId(id)) throw new TypeError(`drawingTools names ${JSON.stringify(id) ?? String(id)}, which is not a drawing tool type; ${TAKES}`)
    if (seen.has(id)) throw new TypeError(`drawingTools names "${id}" more than once`)
    seen.add(id)
  }
  return seen
}

/** Whether the widget offers a tool. Null is the cursor and the eraser removes, so neither is ever
 *  left out. */
export function drawingToolOffered(offered: OfferedDrawingTools, tool: string | null): boolean {
  return offered === null || tool === null || tool === 'eraser' || offered.has(tool)
}
