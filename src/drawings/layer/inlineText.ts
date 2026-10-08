// Which drawings type their words on the chart, and under which rules, and which open their
// settings on a double-click: the registry states it per tool, and the gestures and the layer both
// ask here.
import { toolRegistry, type InlineTextRules } from '../../internal/drawings/index'

/** The rules a drawing's tool types its words on the chart under, or null for a tool that types
 *  them in an editor box of their own. */
export const inlineTextRules = (drawing: { type: string } | null | undefined): InlineTextRules | null =>
  (drawing && toolRegistry.get(drawing.type)?.inlineText) || null

/** Whether a double-click on the drawing opens its settings. */
export const settingsOnDoubleClick = (drawing: { type: string } | null | undefined): boolean =>
  !!drawing && toolRegistry.get(drawing.type)?.settingsOnDoubleClick === true
