// @trdrs/chart-indicators: the Quick Charts built-in indicators. Pure, dependency-free source the
// chart bundles into the one quickcharts artifact: 23 manifest-plus-compute definitions in one
// ordered registry, and the indicator math they compute with (Candle[] in, arrays aligned 1:1 to
// the input out, NaN through the lookback head). Rendering, settings and localization are the
// chart's; this seam holds no DOM, storage, clock or module-level state.
export type {
  BuiltInIndicator,
  IndicatorCategory,
  IndicatorManifest,
  ManifestFill,
  ManifestInput,
  ManifestLevel,
  ManifestPlot,
  PlotArrays,
} from './manifest'
export { BUILT_IN_INDICATORS, builtInIndicator } from './registry'
export type { AdxResult, BandsResult, Candle, IndicatorBar, MacdResult, StochResult, SupertrendResult } from './types'
export { toCandles } from './types'
export { emaArr, maArr, rmaArr, shiftArr, smaArr, wmaArr, type MaType } from './primitives'
export { bollinger, ema, macd, PRICE_SOURCES, priceOf, rsi, sma, stochastic, volume, type MacdOptions, type PriceSource } from './basic'
export {
  adx,
  atr,
  cci,
  donchian,
  hasRealVolume,
  hma,
  keltner,
  mfi,
  momentum,
  obv,
  psar,
  roc,
  stochRsi,
  supertrend,
  trueRange,
  vwap,
  vwapAnchorBucket,
  VWAP_ANCHORS,
  vwma,
  williamsR,
  type KeltnerBands,
  type VwapAnchor,
} from './advanced'
