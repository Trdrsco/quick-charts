// The accent colors the built-in manifests declare for their secondary plots, levels and fills.
// A primary plot declares no color and takes the instance's own; everything else reads one of
// these. They are the one place a theme-shaped literal lives in this seam, kept together so the
// chart's token schema can map each to a semantic role.

/** Signal and companion lines (MACD signal, %D). */
export const SIGNAL = '#f5a623'
/** Up-trend and positive-histogram hue (+DI, Supertrend up, Buy flip). */
export const UP = '#26a69a'
/** Down-trend and negative-histogram hue (-DI, Supertrend down, Sell flip). */
export const DOWN = '#f23645'
/** Reference levels (overbought, oversold, zero): a quiet dashed gray. */
export const LEVEL = '#787B86'
/** The smoothed-MA companion line on the MA, RSI, CCI and OBV definitions. */
export const SMOOTHED = '#f5a623'
/** The Volume definition's Smoothed MA, distinct from its Volume MA on the same band. */
export const VOLUME_SMOOTHED = '#8b7cf6'
/** An oscillator's background tint between its limit levels. */
export const OSCILLATOR_BACKGROUND = 'rgba(126, 87, 194, 0.08)'
/** A channel's background tint between its edges. */
export const BAND_BACKGROUND = 'rgba(33, 150, 243, 0.06)'
