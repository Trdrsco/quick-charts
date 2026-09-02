// The 23 built-in indicator definitions: one manifest model for every built-in (typed inputs plus
// declared plots, levels and fills) and a pure compute over the math beside it. A chart's settings
// surface, legend and plot walker all generate from the manifest, so no built-in carries UI code.
//
// Conventions the definitions follow:
// - Input keys ARE the instance's stored keys (`period` plus params), so a persisted instance feeds
//   straight in; a missing key falls back to the manifest default. The labels a settings surface
//   shows live in `inputTitles`.
// - A source input is an enum over PRICE_SOURCES: the index is the stored value, the same way a
//   script's source input serializes.
// - The PRIMARY plot declares no color: it takes the instance's color. Secondary plots (signal
//   lines, +DI/-DI, smoothed companions, flip arrows) declare their palette accents.
// - Compute returns per-plot arrays aligned 1:1 to the bars, NaN in the warm-up (the walker maps
//   NaN to whitespace, so gapped plots break cleanly), reading bar times from `bars[i].t`.
import { atr, adx, cci, donchian, hma, keltner, mfi, momentum, obv, psar, roc, stochRsi, supertrend, vwap, vwma, williamsR, VWAP_ANCHORS } from './advanced'
import { bollinger, ema, macd, PRICE_SOURCES, rsi, sma, stochastic, volume, type PriceSource } from './basic'
import type { BuiltInIndicator, IndicatorCategory, IndicatorManifest, ManifestInput, PlotArrays } from './manifest'
import { BAND_BACKGROUND, DOWN, LEVEL, OSCILLATOR_BACKGROUND, SIGNAL, SMOOTHED, UP, VOLUME_SMOOTHED } from './palette'
import { maArr, shiftArr, smaArr, type MaType } from './primitives'
import { toCandles, type Candle, type IndicatorBar } from './types'

type Inputs = Readonly<Record<string, number>>

const int = (defval: number, min = 1, max = 5000): ManifestInput => ({ kind: 'int', default: defval, min, max })
const float = (defval: number, min?: number, max?: number): ManifestInput => ({
  kind: 'float',
  default: defval,
  ...(min !== undefined ? { min } : {}),
  ...(max !== undefined ? { max } : {}),
})
const enumOf = (options: readonly string[], defval = 0): ManifestInput => ({ kind: 'enum', default: defval, options })
const source = (defval = 0): ManifestInput => ({ kind: 'enum', default: defval, options: PRICE_SOURCES })

const sourceOf = (inputs: Inputs, key = 'source'): PriceSource | undefined => (inputs[key] != null ? PRICE_SOURCES[inputs[key]!] : undefined)

/** One line plot taking the instance color at the given width. */
const line = (lineWidth = 2) => ({ kind: 'line' as const, lineWidth })

/** The MA-smoothing companion input pair: 'None' leaves the companion plot empty (all-NaN reads as whitespace). */
const SMOOTHING_TYPES = ['None', 'SMA', 'EMA', 'RMA', 'WMA'] as const
const SMOOTHING_MA: readonly (MaType | null)[] = [null, 'sma', 'ema', 'rma', 'wma']
const smoothingInputs = (): IndicatorManifest['inputs'] => ({
  smoothingLine: enumOf(SMOOTHING_TYPES, 0),
  smoothingLength: int(14, 1, 5000),
})
const SMOOTHING_TITLES = { smoothingLine: 'Smoothing Line', smoothingLength: 'Smoothing Length' } as const
const smoothedPlot = { kind: 'line' as const, lineWidth: 1, color: SMOOTHED }

/** Apply the selected smoothing MA over a computed series (index 0 = 'None' reads all-NaN). */
function smoothSeries(values: readonly number[], typeIdx: number, length: number): number[] {
  const type = SMOOTHING_MA[typeIdx] ?? null
  return type ? maArr(values, length, type) : new Array(values.length).fill(NaN)
}

/** The MACD oscillator and signal families, in the manifest's option order. */
const MACD_MA_TYPES = ['EMA', 'SMA'] as const
const macdMaOf = (idx: number): MaType => (idx === 1 ? 'sma' : 'ema')

function manifest(
  id: string,
  tag: string,
  pane: 'overlay' | 'pane',
  category: IndicatorCategory,
  inputs: IndicatorManifest['inputs'],
  plots: IndicatorManifest['plots'],
  extra?: Partial<Pick<IndicatorManifest, 'needsVolume' | 'levels' | 'fills'>>,
): IndicatorManifest {
  return { id, tag, pane, category, inputs, plots, ...extra }
}

/** Reference lines (overbought, oversold, zero): quiet dashed levels. */
const levelsOf = (entries: Record<string, number>): NonNullable<IndicatorManifest['levels']> =>
  Object.fromEntries(Object.entries(entries).map(([k, price]) => [k, { price, color: LEVEL, lineStyle: 'dashed' as const }]))

/** The oscillator band background: a fill between the upper and lower LIMIT LEVELS; the walker
 *  builds constant edges from the level prices. */
const hlinesBackground = { background: { between: ['upper', 'lower'] as const, color: OSCILLATOR_BACKGROUND } }

const BAND_TITLES = { upper: 'Upper', basis: 'Basis', lower: 'Lower', background: 'Background' } as const
const LIMIT_TITLES = { upper: 'Upper band', lower: 'Lower band', background: 'Background' } as const

/** The offset input shared by the MA family and Donchian. */
const offsetInput = (): ManifestInput => int(0, -500, 500)

/** A definition over the long-keyed candles: the one bridge from chart bars to the math. */
function define(
  def: Omit<BuiltInIndicator, 'compute'> & { compute: (candles: readonly Candle[], inputs: Inputs) => PlotArrays },
): BuiltInIndicator {
  const { compute, ...rest } = def
  return {
    ...rest,
    compute: (bars: readonly IndicatorBar[], inputs: Inputs) => compute(toCandles(bars), inputs),
  }
}

// ── The volume instance: the histogram itself is the chart's own series (the instance's presence
// toggles it, and its bar coloring reads the colorPrevClose input); the companion Volume MA and
// Smoothed MA plots render here, pinned to the volume band's own scale.
export const volumeIndicator = define({
  id: 'volume',
  nameKey: 'indicator.volumeName',
  descriptionKey: 'indicator.volumeDescription',
  tag: 'VOL',
  category: 'vol',
  manifest: manifest(
    'volume',
    'VOL',
    'overlay',
    'vol',
    { showMa: enumOf(['No', 'Yes'], 0), maLength: int(20, 1, 5000), colorPrevClose: enumOf(['No', 'Yes'], 0), ...smoothingInputs() },
    {
      volumeMa: { kind: 'line', lineWidth: 1, color: SMOOTHED, scale: 'volume' },
      smoothedMa: { kind: 'line', lineWidth: 1, color: VOLUME_SMOOTHED, scale: 'volume' },
    },
    { needsVolume: true },
  ),
  plotTitles: { volumeMa: 'Volume MA', smoothedMa: 'Smoothed MA' },
  inputTitles: { showMa: 'Show MA', maLength: 'MA Length', colorPrevClose: 'Color Based On Previous Close', ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const volumes = volume(candles)
    const volumeMa = p.showMa === 1 ? smaArr(volumes, p.maLength) : new Array(candles.length).fill(NaN)
    return { volumeMa, smoothedMa: smoothSeries(volumes, p.smoothingLine, p.smoothingLength) }
  },
})

// ── Moving averages ────────────────────────────────────────────────────────────
export const smaIndicator = define({
  id: 'sma',
  nameKey: 'indicator.smaName',
  descriptionKey: 'indicator.smaDescription',
  tag: 'SMA',
  category: 'ma',
  manifest: manifest(
    'sma',
    'SMA',
    'overlay',
    'ma',
    { period: int(20, 1, 5000), source: source(), offset: offsetInput(), ...smoothingInputs() },
    { sma: line(), smoothedMa: smoothedPlot },
  ),
  plotTitles: { sma: 'SMA', smoothedMa: 'Smoothed MA' },
  inputTitles: { period: 'Length', source: 'Source', offset: 'Offset', ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const ma = shiftArr(sma(candles, p.period, sourceOf(p)), p.offset)
    return { sma: ma, smoothedMa: smoothSeries(ma, p.smoothingLine, p.smoothingLength) }
  },
})

export const emaIndicator = define({
  id: 'ema',
  nameKey: 'indicator.emaName',
  descriptionKey: 'indicator.emaDescription',
  tag: 'EMA',
  category: 'ma',
  manifest: manifest(
    'ema',
    'EMA',
    'overlay',
    'ma',
    { period: int(14, 1, 5000), source: source(), offset: offsetInput(), ...smoothingInputs() },
    { ema: line(), smoothedMa: smoothedPlot },
  ),
  plotTitles: { ema: 'EMA', smoothedMa: 'Smoothed MA' },
  inputTitles: { period: 'Length', source: 'Source', offset: 'Offset', ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const ma = shiftArr(ema(candles, p.period, sourceOf(p)), p.offset)
    return { ema: ma, smoothedMa: smoothSeries(ma, p.smoothingLine, p.smoothingLength) }
  },
})

export const hmaIndicator = define({
  id: 'hma',
  nameKey: 'indicator.hmaName',
  descriptionKey: 'indicator.hmaDescription',
  tag: 'HMA',
  category: 'ma',
  manifest: manifest('hma', 'HMA', 'overlay', 'ma', { period: int(16, 2, 5000) }, { hma: line() }),
  plotTitles: { hma: 'HMA' },
  inputTitles: { period: 'Length' },
  compute: (candles, p) => ({ hma: hma(candles, p.period) }),
})

export const vwmaIndicator = define({
  id: 'vwma',
  nameKey: 'indicator.vwmaName',
  descriptionKey: 'indicator.vwmaDescription',
  tag: 'VWMA',
  category: 'ma',
  manifest: manifest('vwma', 'VWMA', 'overlay', 'ma', { period: int(20, 1, 5000), source: source() }, { vwma: line() }, { needsVolume: true }),
  plotTitles: { vwma: 'VWMA' },
  inputTitles: { period: 'Length', source: 'Source' },
  compute: (candles, p) => ({ vwma: vwma(candles, p.period, sourceOf(p)) }),
})

// ── Bands and channels ─────────────────────────────────────────────────────────
export const bollingerIndicator = define({
  id: 'bollinger',
  nameKey: 'indicator.bollingerName',
  descriptionKey: 'indicator.bollingerDescription',
  tag: 'BB',
  category: 'band',
  manifest: manifest(
    'bollinger',
    'BB',
    'overlay',
    'band',
    { period: int(20, 1, 5000), stdDev: float(2, 0.1, 50) },
    { upper: line(1), basis: { kind: 'line', lineWidth: 2, lineStyle: 'dashed' }, lower: line(1) },
    { fills: { background: { between: ['upper', 'lower'], color: BAND_BACKGROUND } } },
  ),
  plotTitles: BAND_TITLES,
  inputTitles: { period: 'Length', stdDev: 'StdDev' },
  compute: (candles, p) => {
    const r = bollinger(candles, p.period, p.stdDev)
    return { upper: r.upper, basis: r.middle, lower: r.lower }
  },
})

export const donchianIndicator = define({
  id: 'donchian',
  nameKey: 'indicator.donchianName',
  descriptionKey: 'indicator.donchianDescription',
  tag: 'DC',
  category: 'band',
  manifest: manifest(
    'donchian',
    'DC',
    'overlay',
    'band',
    { period: int(20, 1, 5000), offset: offsetInput() },
    { upper: line(1), basis: { kind: 'line', lineWidth: 1, lineStyle: 'dashed' }, lower: line(1) },
    { fills: { background: { between: ['upper', 'lower'], color: BAND_BACKGROUND } } },
  ),
  plotTitles: BAND_TITLES,
  inputTitles: { period: 'Length', offset: 'Offset' },
  compute: (candles, p) => {
    const r = donchian(candles, p.period)
    return { upper: shiftArr(r.upper, p.offset), basis: shiftArr(r.middle, p.offset), lower: shiftArr(r.lower, p.offset) }
  },
})

export const keltnerIndicator = define({
  id: 'keltner',
  nameKey: 'indicator.keltnerName',
  descriptionKey: 'indicator.keltnerDescription',
  tag: 'KC',
  category: 'band',
  manifest: manifest(
    'keltner',
    'KC',
    'overlay',
    'band',
    { period: int(20, 1, 5000), atrPeriod: int(10, 1, 5000), multiplier: float(2, 0.1, 50), bandsStyle: enumOf(['True Range', 'High-Low'], 0) },
    { upper: line(1), basis: { kind: 'line', lineWidth: 1, lineStyle: 'dashed' }, lower: line(1) },
    { fills: { background: { between: ['upper', 'lower'], color: BAND_BACKGROUND } } },
  ),
  plotTitles: BAND_TITLES,
  inputTitles: { period: 'Length', atrPeriod: 'ATR Length', multiplier: 'Multiplier', bandsStyle: 'Bands Style' },
  compute: (candles, p) => {
    const r = keltner(candles, p.period, p.atrPeriod, p.multiplier, p.bandsStyle === 1 ? 'high-low' : 'true-range')
    return { upper: r.upper, basis: r.middle, lower: r.lower }
  },
})

export const supertrendIndicator = define({
  id: 'supertrend',
  nameKey: 'indicator.supertrendName',
  descriptionKey: 'indicator.supertrendDescription',
  tag: 'ST',
  category: 'band',
  manifest: manifest(
    'supertrend',
    'ST',
    'overlay',
    'band',
    { period: int(10, 1, 5000), multiplier: float(3, 0.1, 50) },
    {
      up: { kind: 'line', lineWidth: 2, color: UP },
      down: { kind: 'line', lineWidth: 2, color: DOWN },
      upArrow: { kind: 'marker', shape: 'arrow-up', location: 'absolute', color: UP },
      downArrow: { kind: 'marker', shape: 'arrow-down', location: 'absolute', color: DOWN },
    },
  ),
  plotTitles: { up: 'Up trend', down: 'Down trend', upArrow: 'Buy signal', downArrow: 'Sell signal' },
  inputTitles: { period: 'ATR Length', multiplier: 'Factor' },
  compute: (candles, p) => {
    const r = supertrend(candles, p.period, p.multiplier)
    // Flip markers anchor on the new trend's line value at the flip bar.
    const upArrow: number[] = new Array(candles.length).fill(NaN)
    const downArrow: number[] = new Array(candles.length).fill(NaN)
    for (let i = 1; i < candles.length; i++) {
      if (r.dir[i] === 1 && r.dir[i - 1] === -1) upArrow[i] = r.trend[i]!
      if (r.dir[i] === -1 && r.dir[i - 1] === 1) downArrow[i] = r.trend[i]!
    }
    return { up: r.up, down: r.down, upArrow, downArrow }
  },
})

export const psarIndicator = define({
  id: 'psar',
  nameKey: 'indicator.psarName',
  descriptionKey: 'indicator.psarDescription',
  tag: 'PSAR',
  category: 'band',
  manifest: manifest(
    'psar',
    'PSAR',
    'overlay',
    'band',
    { start: float(0.02, 0.001, 1), step: float(0.02, 0.001, 1), max: float(0.2, 0.01, 1) },
    { psar: { kind: 'line', dots: true } },
  ),
  plotTitles: { psar: 'PSAR' },
  inputTitles: { start: 'Start', step: 'Increment', max: 'Maximum' },
  compute: (candles, p) => ({ psar: psar(candles, p.step, p.max, p.start) }),
})

// ── Oscillators and volatility ─────────────────────────────────────────────────
export const rsiIndicator = define({
  id: 'rsi',
  nameKey: 'indicator.rsiName',
  descriptionKey: 'indicator.rsiDescription',
  tag: 'RSI',
  category: 'osc',
  manifest: manifest(
    'rsi',
    'RSI',
    'pane',
    'osc',
    { period: int(14, 2, 5000), source: source(), ...smoothingInputs() },
    { rsi: line(), smoothedMa: smoothedPlot },
    { levels: levelsOf({ upper: 70, middle: 50, lower: 30 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { rsi: 'RSI', smoothedMa: 'Smoothed MA', upper: 'Upper band', middle: 'Middle band', lower: 'Lower band', background: 'Background' },
  inputTitles: { period: 'RSI Length', source: 'Source', ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const r = rsi(candles, p.period, sourceOf(p))
    return { rsi: r, smoothedMa: smoothSeries(r, p.smoothingLine, p.smoothingLength) }
  },
})

export const macdIndicator = define({
  id: 'macd',
  nameKey: 'indicator.macdName',
  descriptionKey: 'indicator.macdDescription',
  tag: 'MACD',
  category: 'osc',
  manifest: manifest(
    'macd',
    'MACD',
    'pane',
    'osc',
    {
      fast: int(12, 1, 5000),
      slow: int(26, 1, 5000),
      source: source(),
      signal: int(9, 1, 5000),
      oscMaType: enumOf(MACD_MA_TYPES, 0),
      signalMaType: enumOf(MACD_MA_TYPES, 0),
    },
    { histogram: { kind: 'histogram', up: UP, down: DOWN }, macd: line(), signal: { kind: 'line', lineWidth: 1, color: SIGNAL } },
  ),
  plotTitles: { histogram: 'Histogram', macd: 'MACD', signal: 'Signal' },
  inputTitles: { fast: 'Fast Length', slow: 'Slow Length', source: 'Source', signal: 'Signal Smoothing', oscMaType: 'Oscillator MA Type', signalMaType: 'Signal Line MA Type' },
  compute: (candles, p) => {
    const r = macd(candles, {
      fast: p.fast,
      slow: p.slow,
      signal: p.signal,
      source: sourceOf(p) ?? 'close',
      oscMaType: macdMaOf(p.oscMaType),
      signalMaType: macdMaOf(p.signalMaType),
    })
    return { histogram: r.histogram, macd: r.macd, signal: r.signal }
  },
})

export const stochasticIndicator = define({
  id: 'stochastic',
  nameKey: 'indicator.stochasticName',
  descriptionKey: 'indicator.stochasticDescription',
  tag: 'STOCH',
  category: 'osc',
  manifest: manifest(
    'stochastic',
    'STOCH',
    'pane',
    'osc',
    { k: int(14, 1, 5000), smooth: int(3, 1, 5000), d: int(3, 1, 5000) },
    { k: line(), d: { kind: 'line', lineWidth: 1, color: SIGNAL } },
    { levels: levelsOf({ upper: 80, lower: 20 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { k: '%K', d: '%D', ...LIMIT_TITLES },
  inputTitles: { k: '%K Length', smooth: '%K Smoothing', d: '%D Smoothing' },
  compute: (candles, p) => {
    const r = stochastic(candles, p.k, p.smooth, p.d)
    return { k: r.k, d: r.d }
  },
})

export const stochrsiIndicator = define({
  id: 'stochrsi',
  nameKey: 'indicator.stochrsiName',
  descriptionKey: 'indicator.stochrsiDescription',
  tag: 'STOCHRSI',
  category: 'osc',
  manifest: manifest(
    'stochrsi',
    'STOCHRSI',
    'pane',
    'osc',
    { rsiPeriod: int(14, 2, 5000), stochPeriod: int(14, 1, 5000), k: int(3, 1, 5000), d: int(3, 1, 5000) },
    { k: line(), d: { kind: 'line', lineWidth: 1, color: SIGNAL } },
    { levels: levelsOf({ upper: 80, lower: 20 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { k: '%K', d: '%D', ...LIMIT_TITLES },
  inputTitles: { rsiPeriod: 'RSI Length', stochPeriod: 'Stochastic Length', k: '%K Smoothing', d: '%D Smoothing' },
  compute: (candles, p) => {
    const r = stochRsi(candles, p.rsiPeriod, p.stochPeriod, p.k, p.d)
    return { k: r.k, d: r.d }
  },
})

export const adxIndicator = define({
  id: 'adx',
  nameKey: 'indicator.adxName',
  descriptionKey: 'indicator.adxDescription',
  tag: 'ADX',
  category: 'osc',
  manifest: manifest(
    'adx',
    'ADX',
    'pane',
    'osc',
    { period: int(14, 1, 5000), adxSmoothing: int(14, 1, 5000) },
    { adx: line(), plusDI: { kind: 'line', lineWidth: 1, color: UP }, minusDI: { kind: 'line', lineWidth: 1, color: DOWN } },
  ),
  plotTitles: { adx: 'ADX', plusDI: '+DI', minusDI: '−DI' },
  inputTitles: { period: 'DI Length', adxSmoothing: 'ADX Smoothing' },
  compute: (candles, p) => {
    const r = adx(candles, p.period, p.adxSmoothing)
    return { adx: r.adx, plusDI: r.plusDI, minusDI: r.minusDI }
  },
})

export const atrIndicator = define({
  id: 'atr',
  nameKey: 'indicator.atrName',
  descriptionKey: 'indicator.atrDescription',
  tag: 'ATR',
  category: 'osc',
  manifest: manifest('atr', 'ATR', 'pane', 'osc', { period: int(14, 1, 5000) }, { atr: line() }),
  plotTitles: { atr: 'ATR' },
  inputTitles: { period: 'Length' },
  compute: (candles, p) => ({ atr: atr(candles, p.period) }),
})

export const cciIndicator = define({
  id: 'cci',
  nameKey: 'indicator.cciName',
  descriptionKey: 'indicator.cciDescription',
  tag: 'CCI',
  category: 'osc',
  manifest: manifest(
    'cci',
    'CCI',
    'pane',
    'osc',
    { period: int(20, 1, 5000), source: source(5), ...smoothingInputs() },
    { cci: line(), smoothedMa: smoothedPlot },
    { levels: levelsOf({ upper: 100, lower: -100 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { cci: 'CCI', smoothedMa: 'Smoothed MA', ...LIMIT_TITLES },
  inputTitles: { period: 'Length', source: 'Source', ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const r = cci(candles, p.period, sourceOf(p))
    return { cci: r, smoothedMa: smoothSeries(r, p.smoothingLine, p.smoothingLength) }
  },
})

export const williamsIndicator = define({
  id: 'williams',
  nameKey: 'indicator.williamsName',
  descriptionKey: 'indicator.williamsDescription',
  tag: '%R',
  category: 'osc',
  manifest: manifest(
    'williams',
    '%R',
    'pane',
    'osc',
    { period: int(14, 1, 5000) },
    { williams: line() },
    { levels: levelsOf({ upper: -20, lower: -80 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { williams: '%R', ...LIMIT_TITLES },
  inputTitles: { period: 'Length' },
  compute: (candles, p) => ({ williams: williamsR(candles, p.period) }),
})

export const rocIndicator = define({
  id: 'roc',
  nameKey: 'indicator.rocName',
  descriptionKey: 'indicator.rocDescription',
  tag: 'ROC',
  category: 'osc',
  manifest: manifest('roc', 'ROC', 'pane', 'osc', { period: int(12, 1, 5000), source: source() }, { roc: line() }, { levels: levelsOf({ zero: 0 }) }),
  plotTitles: { roc: 'ROC', zero: 'Zero line' },
  inputTitles: { period: 'Length', source: 'Source' },
  compute: (candles, p) => ({ roc: roc(candles, p.period, sourceOf(p)) }),
})

export const momentumIndicator = define({
  id: 'momentum',
  nameKey: 'indicator.momentumName',
  descriptionKey: 'indicator.momentumDescription',
  tag: 'MOM',
  category: 'osc',
  manifest: manifest('momentum', 'MOM', 'pane', 'osc', { period: int(10, 1, 5000), source: source() }, { momentum: line() }, { levels: levelsOf({ zero: 0 }) }),
  plotTitles: { momentum: 'Momentum', zero: 'Zero line' },
  inputTitles: { period: 'Length', source: 'Source' },
  compute: (candles, p) => ({ momentum: momentum(candles, p.period, sourceOf(p)) }),
})

// ── Volume ─────────────────────────────────────────────────────────────────────
export const vwapIndicator = define({
  id: 'vwap',
  nameKey: 'indicator.vwapName',
  descriptionKey: 'indicator.vwapDescription',
  tag: 'VWAP',
  category: 'vol',
  manifest: manifest(
    'vwap',
    'VWAP',
    'overlay',
    'vol',
    { anchorPeriod: enumOf(['Session', 'Week', 'Month'], 0), source: source(5) },
    { vwap: line() },
    { needsVolume: true },
  ),
  plotTitles: { vwap: 'VWAP' },
  inputTitles: { anchorPeriod: 'Anchor Period', source: 'Source' },
  compute: (candles, p) => ({ vwap: vwap(candles, VWAP_ANCHORS[p.anchorPeriod] ?? 'session', sourceOf(p) ?? 'hlc3') }),
})

export const obvIndicator = define({
  id: 'obv',
  nameKey: 'indicator.obvName',
  descriptionKey: 'indicator.obvDescription',
  tag: 'OBV',
  category: 'vol',
  manifest: manifest('obv', 'OBV', 'pane', 'vol', { ...smoothingInputs() }, { obv: line(), smoothedMa: smoothedPlot }, { needsVolume: true }),
  plotTitles: { obv: 'OBV', smoothedMa: 'Smoothed MA' },
  inputTitles: { ...SMOOTHING_TITLES },
  compute: (candles, p) => {
    const r = obv(candles)
    return { obv: r, smoothedMa: smoothSeries(r, p.smoothingLine, p.smoothingLength) }
  },
})

export const mfiIndicator = define({
  id: 'mfi',
  nameKey: 'indicator.mfiName',
  descriptionKey: 'indicator.mfiDescription',
  tag: 'MFI',
  category: 'vol',
  manifest: manifest(
    'mfi',
    'MFI',
    'pane',
    'vol',
    { period: int(14, 1, 5000) },
    { mfi: line() },
    { needsVolume: true, levels: levelsOf({ upper: 80, lower: 20 }), fills: { ...hlinesBackground } },
  ),
  plotTitles: { mfi: 'MFI', ...LIMIT_TITLES },
  inputTitles: { period: 'Length' },
  compute: (candles, p) => ({ mfi: mfi(candles, p.period) }),
})
