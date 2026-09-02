// The bar shapes the indicator math reads. `IndicatorBar` is the chart's own bar (short keys, the
// shape every datafeed serves); `Candle` is the long-keyed view the formulas read so they stay
// legible. toCandles() bridges the two once per compute; every indicator takes Candle[] and
// returns arrays aligned 1:1 to the input, NaN through the lookback head.

/** A chart bar: epoch seconds plus OHLCV. Structurally the chart's `FeedBar`. */
export interface IndicatorBar {
  readonly t: number
  readonly o: number
  readonly h: number
  readonly l: number
  readonly c: number
  readonly v: number
}

export interface Candle {
  /** Epoch seconds; the anchor-aware computes (VWAP) bucket on it. */
  readonly time: number
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
  readonly volume: number
}

/** The long-keyed candles for a run of chart bars. */
export function toCandles(bars: readonly IndicatorBar[]): Candle[] {
  return bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
}

export interface MacdResult {
  macd: number[]
  signal: number[]
  histogram: number[]
}

export interface BandsResult {
  upper: number[]
  middle: number[]
  lower: number[]
}

export interface StochResult {
  k: number[]
  d: number[]
}

export interface AdxResult {
  adx: number[]
  plusDI: number[]
  minusDI: number[]
}

export interface SupertrendResult {
  trend: number[]
  up: number[]
  down: number[]
  dir: number[] // +1 uptrend, -1 downtrend (NaN in the warm-up)
}
