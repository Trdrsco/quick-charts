// How the legend gives way when the pane runs out of room. This module DECIDES; the legend writes
// the answer onto its root as state the stylesheet keys on, and the stylesheet does the hiding.
//
// The cascade has three steps, in this order:
//
//   1. The reading WRAPS whole. The header is a wrapping flex row, so the four O/H/L/C marks and
//      the change drop under the identity as one 24px band, still complete. No decision is needed
//      for this step; it is the header recipe.
//   2. The reading COMPACTS to close and change. A reading wider than the line it was given cannot
//      wrap its way out of trouble, so the open, high and low stand down and the close carries the
//      bar alone. A close-only chart style (line, area, baseline, step line) paints no open, high
//      or low in the first place, so it reads compact from the start without measuring anything.
//   3. The pane goes SLIM and sheds context. Under `SLIM_WIDTH` the venue leaves the header. The
//      interval stays: one chart of a layout has no other place to say what interval it is on.
//
// Step 2 LATCHES. Hiding three marks makes the reading narrower, which would make it fit, which
// would bring them back, which would overflow again: a measurement that acts on its own result
// oscillates. So the compact answer records the pane width it was taken at and holds until the
// pane grows `COMPACT_RELEASE` past it, which is a real change in the room available rather than
// the echo of its own cure. A new market clears the latch outright, because a new market's digits
// are a fresh measurement.

/** The pane width under which the header sheds its venue. */
export const SLIM_WIDTH = 600

/** How much wider than the width it compacted at a pane must grow before the full reading is tried
 *  again. Below this the growth could be the compaction's own doing. */
export const COMPACT_RELEASE = 80

/** What the legend measured this frame. Widths are CSS pixels off the live DOM. */
export interface LegendFitInput {
  /** The plot the legend lives over. This is what "narrow" is measured against. */
  paneWidth: number
  /** The reading's own width. */
  quoteWidth: number
  /** The width the legend has to give the reading on one line. */
  legendWidth: number
  /** The chart style paints close-only bars, so the reading has no open, high or low to show. */
  valueShaped: boolean
}

/** The legend's standing answer. `compactAt` is the pane width the latch was taken at. */
export interface LegendFit {
  compact: boolean
  compactAt: number
  slim: boolean
}

export const INITIAL_LEGEND_FIT: LegendFit = { compact: false, compactAt: 0, slim: false }

/** The next standing answer, given the last one and a fresh measurement. Pure: the same pair always
 *  gives the same result, and nothing here touches the DOM. */
export function nextLegendFit(previous: LegendFit, input: LegendFitInput): LegendFit {
  const slim = input.paneWidth > 0 && input.paneWidth < SLIM_WIDTH
  // A close-only style is not a latch. It is simply what the chart paints, so it neither records a
  // width nor has to be released; it answers compact for as long as the style stands.
  if (input.valueShaped) return { compact: true, compactAt: previous.compactAt, slim }
  if (previous.compact) {
    return input.paneWidth > previous.compactAt + COMPACT_RELEASE
      ? { compact: false, compactAt: 0, slim }
      : { compact: true, compactAt: previous.compactAt, slim }
  }
  // The one-pixel allowance is the measurement's own rounding, not a margin of taste.
  const overflows = input.legendWidth > 0 && input.quoteWidth > input.legendWidth - 1
  return overflows
    ? { compact: true, compactAt: input.paneWidth, slim }
    : { compact: false, compactAt: 0, slim }
}

export function sameLegendFit(a: LegendFit, b: LegendFit): boolean {
  return a.compact === b.compact && a.compactAt === b.compactAt && a.slim === b.slim
}
