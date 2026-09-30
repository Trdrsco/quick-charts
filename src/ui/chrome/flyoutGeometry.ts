// The measured widths of the chrome's anchored flyouts, in CSS pixels. One table, because a width
// is the only geometry a panel cannot express in the scoped stylesheet: the menu primitive writes
// it inline so the panel can be measured against its anchor before it is placed. Every other
// dimension (row height, padding, ceiling, grid cell) belongs to a recipe in
// `src/styles/components`, where the theme's tokens reach it.
//
// Internal to the package: the chrome reads it, the public surface does not carry it.
export const FLYOUT_WIDTH = {
  /** The grouped timeframe list with its custom-timeframe footer. */
  timeframe: 192,
  /** The chart-style list, its 40px rows grouped by family. */
  chartStyle: 270,
  /** The thirteen-row arrangement grid over the sync switches. */
  arrangement: 428,
  /** The saved-layouts menu. */
  layouts: 197,
  layoutsSort: 234,
  /** The zone list in the bottom bar, opening upward, with its check column. */
  timezone: 251,
  /** The session choices beside it. */
  session: 176,
  /** The replay row's starting-point choices, opening upward. */
  replayStart: 177,
  /** The replay row's update-interval list. The speed list opens at the same width and grows to fit
   *  its rates. */
  replayInterval: 196,
} as const
