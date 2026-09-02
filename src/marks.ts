// Neutral marks: the host-supplied chart data contract for a note about a moment.
//
// A mark says nothing about an account, an order or a fill. Its color is a semantic theme role
// rather than a literal, its text is the host's own words, and the chart neither interprets nor
// acts on it. Execution marks are `@trdrs/chart-trading`'s, over the extension seam, and never
// these.
//
// The two families answer different questions. A BAR mark sits on a bar, above or below it, and
// carries a letter or a short label. A TIME-SCALE mark sits under the axis and marks a session, an
// event or a boundary.
//
// This module is self-contained by the same rule as `datafeed.ts`: the contract must never drag a
// renderer or a backend into the chart's dependency surface.

/** The theme roles a mark may wear. A host names a meaning and the mode resolves the color, so a
 *  mark stays readable when the viewer switches to light. */
export type MarkColorRole = 'neutral' | 'up' | 'down' | 'info' | 'warning' | 'positive' | 'negative'

/** Where a bar mark sits relative to its bar. */
export type MarkPlacement = 'above' | 'below'

/** The glyph a bar mark draws. */
export type MarkShape = 'circle' | 'square' | 'arrowUp' | 'arrowDown'

/** One mark on a bar. */
export interface BarMark {
  /** Stable within one symbol and window, so a refetch replaces rather than duplicates. */
  id: string
  /** Epoch SECONDS at the bar's bucket open, the same clock every bar uses. */
  time: number
  color: MarkColorRole
  /** The letter or two the glyph carries. */
  text?: string
  /** The longer words a host would show beside the mark. Carried, never drawn by the chart. */
  label?: string
  shape?: MarkShape
  placement?: MarkPlacement
}

/** One mark under the time scale. */
export interface TimescaleMark {
  id: string
  /** Epoch SECONDS. */
  time: number
  color: MarkColorRole
  label?: string
}
