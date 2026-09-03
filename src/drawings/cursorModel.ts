// What the pointer is doing on the chart: the cursor glyph, the two TRANSIENT tools, and whether
// arming a tool survives the drawing it just made.
//
// Measure and Zoom arm from the toolbar exactly like a drawing tool, but nothing they place is kept:
// the readout lives until the next gesture and the zoom box disappears into the range it set. They
// are therefore not drawings with a "temporary" flag; they are pointer modes with a shape, which is
// why they are modelled here and not in the tool catalog.
import type { ChartMessageKey } from '../i18n/en'

/** The pointer's own glyph over the chart. */
export type CursorMode = 'cross' | 'dot' | 'arrow'

export const CURSOR_MODES: readonly CursorMode[] = ['cross', 'dot', 'arrow']

export const CURSOR_LABELS: Readonly<Record<CursorMode, ChartMessageKey>> = {
  cross: 'drawing.cursorCross',
  dot: 'drawing.cursorDot',
  arrow: 'drawing.cursorArrow',
}

/** The armed pointer tools that place nothing permanent. The eraser removes on click and stays
 *  armed; measure and zoom draw a two-anchor shape that is discarded once it has done its work. */
export type TransientTool = 'eraser' | 'measure' | 'zoom'

export const TRANSIENT_TOOLS: readonly TransientTool[] = ['eraser', 'measure', 'zoom']

export const TRANSIENT_LABELS: Readonly<Record<TransientTool, ChartMessageKey>> = {
  eraser: 'drawing.cursorEraser',
  measure: 'drawing.measure',
  zoom: 'drawing.zoomIn',
}

/** Whether an armed tool id is a transient rather than a catalog tool. `null` (nothing armed) is
 *  not a transient. */
export function isTransientTool(tool: string | null): tool is TransientTool {
  return tool !== null && (TRANSIENT_TOOLS as readonly string[]).includes(tool)
}

/** Whether a lingering measure readout or zoom box survives the gesture starting now. It survives
 *  only while the same transient stays armed, which is what lets a second measure replace the
 *  first without the readout flickering away in between. */
export function transientSurvives(tool: string | null): boolean {
  return tool === 'measure' || tool === 'zoom'
}

/** What stays armed after a placement completes. Stay-in-drawing-mode keeps the tool so a trader
 *  can draw a run of the same shape; without it the toolbar falls back to the cursor. A transient is
 *  never released by its own completion: the eraser keeps erasing and measure keeps measuring
 *  until Escape or the cursor button releases it. */
export function toolAfterPlacement(tool: string | null, stayInDrawingMode: boolean): string | null {
  if (isTransientTool(tool)) return tool
  return stayInDrawingMode ? tool : null
}

/** Which toolbar buttons look armed. The cursor button is the resting state, and it also owns the
 *  eraser, so it reads as armed while the eraser is. */
export function cursorButtonArmed(tool: string | null): boolean {
  return tool === null || tool === 'eraser'
}
