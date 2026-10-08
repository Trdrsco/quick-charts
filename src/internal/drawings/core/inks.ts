// The chart's own inks a drawing paints with where its tool takes no color of its own, read from
// the chart's theme: a selection handle's ring and its center, words written in the chart's ink,
// and a quiet edge.
import { LIGHT_THEME } from '../../../theme/palettes'
import type { SemanticTheme } from '../../../theme/schema'

export interface DrawingInks {
  /** A selection handle's ring. */
  handleRing: string
  /** A selection handle's center: the chart's ground, so the handle covers what it stands on. */
  handleCenter: string
  /** Words a drawing writes in the chart's own ink. */
  text: string
  /** A quiet edge, such as a signpost plate's outline. */
  edge: string
}

/** A theme's inks for drawings. */
export function drawingInksOf(theme: Pick<SemanticTheme, 'drawing.selected' | 'drawing.handle' | 'drawing.text' | 'canvas.paneBorder'>): DrawingInks {
  return { handleRing: theme['drawing.selected'], handleCenter: theme['drawing.handle'], text: theme['drawing.text'], edge: theme['canvas.paneBorder'] }
}

/** The inks of a drawing no host gave a theme: the built-in light theme's. */
export const DEFAULT_INKS: DrawingInks = drawingInksOf(LIGHT_THEME)
