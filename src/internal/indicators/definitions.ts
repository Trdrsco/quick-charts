// The 23 built-in indicator definitions: one manifest model for every built-in (typed inputs plus
// declared plots, levels and fills) and a pure compute over the math beside it. A chart's settings
// surface, legend and plot walker all generate from the manifest, so no built-in carries UI code.
//
// Conventions the definitions follow:
// - Input keys ARE the instance's stored keys (`period` plus params), so a persisted instance feeds
//   straight in; a missing key falls back to the manifest default. Each input carries the title a
//   settings surface labels it with, and the inputs that belong together share a group.
// - A source input is an enum over PRICE_SOURCES: the index is the stored value, the same way any
//   manifest's source input serializes, and its options are the words the settings surface writes.
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

/** What an input says about itself beyond its value: its title, its group, its step, and the input
 *  it follows. */
type Described = Pick<ManifestInput, 'title' | 'group' | 'step' | 'enabledWhen'>

const int = (defval: number, min: number, max: number, about: Described): ManifestInput => ({ kind: 'int', default: defval, min, max, ...about })
const float = (defval: number, min: number, max: number, about: Described): ManifestInput => ({ kind: 'float', default: defval, min, max, step: 0.1, ...about })
const enumOf = (options: readonly string[], defval: number, about: Described): ManifestInput => ({ kind: 'enum', default: defval, options, ...about })
const bool = (defval: 0 | 1, about: Described): ManifestInput => ({ kind: 'bool', default: defval, ...about })

/** The words each of PRICE_SOURCES reads as, in its order. */
const SOURCE_TITLES = ['Close', 'Open', 'High', 'Low', '(H + L)/2', '(H + L + C)/3', '(O + H + L + C)/4'] as const
const source = (defval = 0, group?: string): ManifestInput => ({ kind: 'enum', default: defval, options: SOURCE_TITLES, title: 'Source', ...(group ? { group } : {}) })

const sourceOf = (inputs: Inputs, key = 'source'): PriceSource | undefined => (inputs[key] != null ? PRICE_SOURCES[inputs[key]!] : undefined)

/** One line plot taking the instance color at the given width. */
const line = (title: string, lineWidth = 2) => ({ kind: 'line' as const, lineWidth, title })

/** The MA-smoothing companion input pair: 'None' leaves the companion plot empty (all-NaN reads as
 *  whitespace), and the length applies under every other type. */
const SMOOTHING_TYPES = ['None', 'SMA', 'EMA', 'SMMA (RMA)', 'WMA'] as const
const SMOOTHING_MA: readonly (MaType | null)[] = [null, 'sma', 'ema', 'rma', 'wma']
const smoothingInputs = (): IndicatorManifest['inputs'] => ({
  smoothingLine: enumOf(SMOOTHING_TYPES, 0, { title: 'Type', group: 'Smoothing' }),
  smoothingLength: int(14, 1, 5000, { title: 'Length', group: 'Smoothing', enabledWhen: { input: 'smoothingLine', values: [1, 2, 3, 4] } }),
})
const smoothedPlot = (title: string) => ({ kind: 'line' as const, lineWidth: 1, color: SMOOTHED, title })

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

/** Reference lines (overbought, oversold, zero): quiet dashed levels, each with its title. */
const levelsOf = (entries: Record<string, readonly [price: number, title: string]>): NonNullable<IndicatorManifest['levels']> =>
  Object.fromEntries(Object.entries(entries).map(([k, [price, title]]) => [k, { price, color: LEVEL, lineStyle: 'dashed' as const, title }]))

/** The oscillator band background: a fill between the upper and lower LIMIT LEVELS; the walker
 *  builds constant edges from the level prices. */
const hlinesBackground = (title = 'Background') => ({ background: { between: ['upper', 'lower'] as const, color: OSCILLATOR_BACKGROUND, title } })

/** A channel's three edges and the background between its outer two. */
const channelPlots = (basisWidth: number) => ({ upper: line('Upper', 1), basis: { kind: 'line' as const, lineWidth: basisWidth, lineStyle: 'dashed' as const, title: 'Basis' }, lower: line('Lower', 1) })
const channelFill = { fills: { background: { between: ['upper', 'lower'] as const, color: BAND_BACKGROUND, title: 'Background' } } }

/** The offset input shared by the MA family and Donchian. */
const offsetInput = (): ManifestInput => int(0, -500, 500, { title: 'Offset' })

/** The manifest's titles by key, for the definitions' `inputTitles` and `plotTitles`. */
const titlesOf = (entries: Readonly<Record<string, { readonly title?: string }>> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(entries ?? {}).flatMap(([key, spec]) => (spec.title ? [[key, spec.title]] : [])))

/** A definition over the long-keyed candles: the one bridge from chart bars to the math. */
function define(
  def: Omit<BuiltInIndicator, 'compute' | 'plotTitles' | 'inputTitles'> & { compute: (candles: readonly Candle[], inputs: Inputs) => PlotArrays },
): BuiltInIndicator {
  const { compute, ...rest } = def
  const { inputs, plots, levels, fills } = def.manifest
  return {
    ...rest,
    plotTitles: { ...titlesOf(plots), ...titlesOf(levels), ...titlesOf(fills) },
    inputTitles: titlesOf(inputs),
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
    {
      showMa: bool(0, { title: 'Show MA' }),
      maLength: int(20, 1, 5000, { title: 'MA Length', enabledWhen: { input: 'showMa', values: [1] } }),
      colorPrevClose: bool(0, { title: 'Color based on previous close' }),
      ...smoothingInputs(),
    },
    {
      volumeMa: { kind: 'line', lineWidth: 1, color: SMOOTHED, scale: 'volume', title: 'Volume MA' },
      smoothedMa: { kind: 'line', lineWidth: 1, color: VOLUME_SMOOTHED, scale: 'volume', title: 'Smoothed MA' },
    },
    { needsVolume: true },
  ),
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
    { period: int(20, 1, 5000, { title: 'Length' }), source: source(), offset: offsetInput(), ...smoothingInputs() },
    { sma: line('MA'), smoothedMa: smoothedPlot('SMA-based MA') },
  ),
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
    { period: int(14, 1, 5000, { title: 'Length' }), source: source(), offset: offsetInput(), ...smoothingInputs() },
    { ema: line('EMA'), smoothedMa: smoothedPlot('EMA-based MA') },
  ),
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
  manifest: manifest('hma', 'HMA', 'overlay', 'ma', { period: int(16, 2, 5000, { title: 'Length' }) }, { hma: line('HMA') }),
  compute: (candles, p) => ({ hma: hma(candles, p.period) }),
})

export const vwmaIndicator = define({
  id: 'vwma',
  nameKey: 'indicator.vwmaName',
  descriptionKey: 'indicator.vwmaDescription',
  tag: 'VWMA',
  category: 'ma',
  manifest: manifest('vwma', 'VWMA', 'overlay', 'ma', { period: int(20, 1, 5000, { title: 'Length' }), source: source() }, { vwma: line('VWMA') }, { needsVolume: true }),
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
    { period: int(20, 1, 5000, { title: 'Length' }), stdDev: float(2, 0.1, 50, { title: 'StdDev' }) },
    channelPlots(2),
    channelFill,
  ),
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
  manifest: manifest('donchian', 'DC', 'overlay', 'band', { period: int(20, 1, 5000, { title: 'Length' }), offset: offsetInput() }, channelPlots(1), channelFill),
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
    {
      period: int(20, 1, 5000, { title: 'Length' }),
      multiplier: float(2, 0.1, 50, { title: 'Multiplier' }),
      bandsStyle: enumOf(['Average True Range', 'Range'], 0, { title: 'Bands Style' }),
      atrPeriod: int(10, 1, 5000, { title: 'ATR Length' }),
    },
    channelPlots(1),
    channelFill,
  ),
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
    { period: int(10, 1, 5000, { title: 'ATR Length' }), multiplier: float(3, 0.1, 50, { title: 'Factor', step: 0.01 }) },
    {
      up: { kind: 'line', lineWidth: 2, color: UP, title: 'Up Trend' },
      down: { kind: 'line', lineWidth: 2, color: DOWN, title: 'Down Trend' },
      upArrow: { kind: 'marker', shape: 'arrow-up', location: 'absolute', color: UP, title: 'Buy signal' },
      downArrow: { kind: 'marker', shape: 'arrow-down', location: 'absolute', color: DOWN, title: 'Sell signal' },
    },
  ),
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
    {
      start: float(0.02, 0.001, 1, { title: 'Start', step: 0.01 }),
      step: float(0.02, 0.001, 1, { title: 'Increment', step: 0.01 }),
      max: float(0.2, 0.01, 1, { title: 'Max value', step: 0.01 }),
    },
    { psar: { kind: 'line', dots: true, title: 'PSAR' } },
  ),
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
    { period: int(14, 2, 5000, { title: 'RSI Length', group: 'RSI Settings' }), source: source(0, 'RSI Settings'), ...smoothingInputs() },
    { rsi: line('RSI'), smoothedMa: smoothedPlot('RSI-based MA') },
    { levels: levelsOf({ upper: [70, 'RSI Upper Band'], middle: [50, 'RSI Middle Band'], lower: [30, 'RSI Lower Band'] }), fills: hlinesBackground('RSI Background Fill') },
  ),
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
      source: source(),
      fast: int(12, 1, 5000, { title: 'Fast length' }),
      slow: int(26, 1, 5000, { title: 'Slow length' }),
      signal: int(9, 1, 5000, { title: 'Signal length' }),
      oscMaType: enumOf(MACD_MA_TYPES, 0, { title: 'Oscillator MA type' }),
      signalMaType: enumOf(MACD_MA_TYPES, 0, { title: 'Signal MA type' }),
    },
    { histogram: { kind: 'histogram', up: UP, down: DOWN, title: 'Histogram' }, macd: line('MACD'), signal: { kind: 'line', lineWidth: 1, color: SIGNAL, title: 'Signal line' } },
  ),
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
    { k: int(14, 1, 5000, { title: '%K Length' }), smooth: int(3, 1, 5000, { title: '%K Smoothing' }), d: int(3, 1, 5000, { title: '%D Smoothing' }) },
    { k: line('%K'), d: { kind: 'line', lineWidth: 1, color: SIGNAL, title: '%D' } },
    { levels: levelsOf({ upper: [80, 'Upper Band'], lower: [20, 'Lower Band'] }), fills: hlinesBackground() },
  ),
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
    {
      k: int(3, 1, 5000, { title: 'K' }),
      d: int(3, 1, 5000, { title: 'D' }),
      rsiPeriod: int(14, 2, 5000, { title: 'RSI Length' }),
      stochPeriod: int(14, 1, 5000, { title: 'Stochastic Length' }),
    },
    { k: line('K'), d: { kind: 'line', lineWidth: 1, color: SIGNAL, title: 'D' } },
    { levels: levelsOf({ upper: [80, 'Upper Band'], lower: [20, 'Lower Band'] }), fills: hlinesBackground() },
  ),
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
    { adxSmoothing: int(14, 1, 5000, { title: 'ADX Smoothing' }), period: int(14, 1, 5000, { title: 'DI Length' }) },
    { adx: line('ADX'), plusDI: { kind: 'line', lineWidth: 1, color: UP, title: '+DI' }, minusDI: { kind: 'line', lineWidth: 1, color: DOWN, title: '-DI' } },
  ),
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
  manifest: manifest('atr', 'ATR', 'pane', 'osc', { period: int(14, 1, 5000, { title: 'Length' }) }, { atr: line('ATR') }),
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
    { period: int(20, 1, 5000, { title: 'Length' }), source: source(5), ...smoothingInputs() },
    { cci: line('CCI'), smoothedMa: smoothedPlot('CCI-based MA') },
    { levels: levelsOf({ upper: [100, 'Upper Band'], lower: [-100, 'Lower Band'] }), fills: hlinesBackground() },
  ),
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
    { period: int(14, 1, 5000, { title: 'Length' }) },
    { williams: line('%R') },
    { levels: levelsOf({ upper: [-20, 'Upper Band'], lower: [-80, 'Lower Band'] }), fills: hlinesBackground() },
  ),
  compute: (candles, p) => ({ williams: williamsR(candles, p.period) }),
})

export const rocIndicator = define({
  id: 'roc',
  nameKey: 'indicator.rocName',
  descriptionKey: 'indicator.rocDescription',
  tag: 'ROC',
  category: 'osc',
  manifest: manifest('roc', 'ROC', 'pane', 'osc', { period: int(12, 1, 5000, { title: 'Length' }), source: source() }, { roc: line('ROC') }, { levels: levelsOf({ zero: [0, 'Zero Line'] }) }),
  compute: (candles, p) => ({ roc: roc(candles, p.period, sourceOf(p)) }),
})

export const momentumIndicator = define({
  id: 'momentum',
  nameKey: 'indicator.momentumName',
  descriptionKey: 'indicator.momentumDescription',
  tag: 'MOM',
  category: 'osc',
  manifest: manifest('momentum', 'MOM', 'pane', 'osc', { period: int(10, 1, 5000, { title: 'Length' }), source: source() }, { momentum: line('MOM') }, { levels: levelsOf({ zero: [0, 'Zero Line'] }) }),
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
    { anchorPeriod: enumOf(['Session', 'Week', 'Month'], 0, { title: 'Anchor Period', group: 'VWAP Settings' }), source: source(5, 'VWAP Settings') },
    { vwap: line('VWAP') },
    { needsVolume: true },
  ),
  compute: (candles, p) => ({ vwap: vwap(candles, VWAP_ANCHORS[p.anchorPeriod] ?? 'session', sourceOf(p) ?? 'hlc3') }),
})

export const obvIndicator = define({
  id: 'obv',
  nameKey: 'indicator.obvName',
  descriptionKey: 'indicator.obvDescription',
  tag: 'OBV',
  category: 'vol',
  manifest: manifest('obv', 'OBV', 'pane', 'vol', { ...smoothingInputs() }, { obv: line('OBV'), smoothedMa: smoothedPlot('OBV-based MA') }, { needsVolume: true }),
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
    { period: int(14, 1, 5000, { title: 'Length' }) },
    { mfi: line('MFI') },
    { needsVolume: true, levels: levelsOf({ upper: [80, 'Overbought'], lower: [20, 'Oversold'] }), fills: hlinesBackground() },
  ),
  compute: (candles, p) => ({ mfi: mfi(candles, p.period) }),
})
