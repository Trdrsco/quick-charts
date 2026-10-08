// Which drawings type their words on the chart, and under which rules: the registry states it per
// tool, and the gestures and the layer both ask here.
import { toolRegistry, type InlineTextRules } from '../../internal/drawings/index'

/** The rules a drawing's tool types its words on the chart under, or null for a tool that types
 *  them in an editor box of their own. */
export const inlineTextRules = (drawing: { type: string } | null | undefined): InlineTextRules | null =>
  (drawing && toolRegistry.get(drawing.type)?.inlineText) || null
