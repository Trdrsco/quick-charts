// Neutral marks: the host-supplied chart data contract for a note about a moment.
//
// A mark is a note about a moment. Its color stays readable in both modes: it is a semantic theme
// role, which the mode resolves, or a pair of colors the host chose, one for each mode. A single
// color for both modes is not a mark color, because a color chosen for one background can vanish
// on the other. The text is the host's own words, and the chart draws the mark as given. A host
// draws marks of its own through the extension seam.
//
// The two families answer different questions. A BAR mark sits on a bar, above or below it, and
// carries a letter or a short label. A TIME-SCALE mark stands at the foot of the pane and marks a
// session, an event or a boundary: a small dot, or a glyph from the icon catalog in a ring of its
// color, with a line through the pane when it names one. Hovered, or pressed with a finger or a pen,
// it runs a dashed line up the pane and shows its label in a tooltip. It may stand at a time after
// the last bar, in the empty space the view shows there, which is how a moment still to come is
// drawn; the chart asks for the time-scale marks over that space too.
//
// This module is self-contained by the same rule as `datafeed.ts`: the contract must never drag a
// renderer or a backend into the chart's dependency surface.

/** The theme roles a mark may wear. A host names a meaning and the mode resolves the color, so a
 *  mark stays readable when the viewer switches to light. */
export type MarkColorRole = 'neutral' | 'up' | 'down' | 'info' | 'warning' | 'positive' | 'negative'

/** A mark color of the host's own, one CSS color for each mode: the chart wears the one for the
 *  mode in effect, so the host chooses a color readable on each background. */
export interface MarkColorPair {
  light: string
  dark: string
}

/** A mark's color: a theme role, or a pair of colors with one for each mode. A single literal color
 *  is refused, and a color the chart cannot read paints in the `neutral` role. */
export type MarkColor = MarkColorRole | MarkColorPair

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
  color: MarkColor
  /** The letter or two the glyph carries. */
  text?: string
  /** The longer words a host would show beside the mark. Carried, never drawn by the chart. */
  label?: string
  shape?: MarkShape
  placement?: MarkPlacement
}

/** The glyphs a time-scale mark may wear, by their ids in the icon catalog. Each is named for its
 *  shape, and what it means on a chart is the host's to say. */
export type MarkIconId = 'mark.bolt' | 'mark.flag' | 'mark.star' | 'mark.clock' | 'mark.exclamation'

/** How a time-scale mark's line is stroked: dashed is 5px drawn and 6px clear, dotted 1px drawn
 *  and 4px clear. */
export type MarkLineStyle = 'solid' | 'dashed' | 'dotted'

/** A line through the whole pane at a time-scale mark's time. */
export interface MarkLine {
  style: MarkLineStyle
}

/** One mark under the time scale. */
export interface TimescaleMark {
  id: string
  /** Epoch SECONDS. The mark stands on the bar whose bucket holds this time, on the next bar when
   *  it falls between bars (a session gap, a weekend), and after the last bar at the slot it falls
   *  in, counting the timeframe's bar interval on from the last bar. Bar replay draws none after
   *  the last bar it shows. */
  time: number
  color: MarkColor
  /** The words the mark's tooltip shows while it is hovered or pressed. Without them, a hovered
   *  mark shows its line alone. */
  label?: string
  /** The glyph the mark wears: drawn inside a 21px ring in the mark's color, the ring's foot just
   *  above the time scale and its inside the chart's background. Without one, or with an id the
   *  chart does not draw, the mark is a small dot near the foot of the pane. */
  icon?: MarkIconId
  /** A 1px line in the mark's color through the whole pane at its time, drawn always and under the
   *  bars, as a boundary is. Without one, the mark draws a line only while it is hovered. */
  line?: MarkLine
}
