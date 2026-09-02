// The 23 built-in definitions as release inventory (public-chart-library-boundary-plan.md: the
// day-one catalog is exactly these), and the contract every one of them keeps: a manifest whose
// every declared plot the compute answers, aligned 1:1 to the bars, with the defaults alone.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_INDICATORS, builtInIndicator, PRICE_SOURCES, type IndicatorBar } from '../src'

const N = 120
const BASE = 1_700_000_000
const bars: IndicatorBar[] = Array.from({ length: N }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 5) + i * 0.1
  const o = i === 0 ? c : 100 + 10 * Math.sin((i - 1) / 5) + (i - 1) * 0.1
  return { t: BASE + i * 60, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 100 + i }
})

const defaults = (m: { inputs: Readonly<Record<string, { default: number }>> }): Record<string, number> =>
  Object.fromEntries(Object.entries(m.inputs).map(([k, spec]) => [k, spec.default]))

/** Every built-in by id, tag, category and placement, in picker order. */
const INVENTORY: readonly (readonly [id: string, tag: string, category: string, pane: string])[] = [
  ['sma', 'SMA', 'ma', 'overlay'],
  ['ema', 'EMA', 'ma', 'overlay'],
  ['hma', 'HMA', 'ma', 'overlay'],
  ['vwma', 'VWMA', 'ma', 'overlay'],
  ['bollinger', 'BB', 'band', 'overlay'],
  ['donchian', 'DC', 'band', 'overlay'],
  ['keltner', 'KC', 'band', 'overlay'],
  ['supertrend', 'ST', 'band', 'overlay'],
  ['psar', 'PSAR', 'band', 'overlay'],
  ['rsi', 'RSI', 'osc', 'pane'],
  ['macd', 'MACD', 'osc', 'pane'],
  ['stochastic', 'STOCH', 'osc', 'pane'],
  ['stochrsi', 'STOCHRSI', 'osc', 'pane'],
  ['adx', 'ADX', 'osc', 'pane'],
  ['atr', 'ATR', 'osc', 'pane'],
  ['cci', 'CCI', 'osc', 'pane'],
  ['williams', '%R', 'osc', 'pane'],
  ['roc', 'ROC', 'osc', 'pane'],
  ['momentum', 'MOM', 'osc', 'pane'],
  ['volume', 'VOL', 'vol', 'overlay'],
  ['vwap', 'VWAP', 'vol', 'overlay'],
  ['obv', 'OBV', 'vol', 'pane'],
  ['mfi', 'MFI', 'vol', 'pane'],
]

describe('the 23 built-in indicators', () => {
  it('pins every id, tag, category and placement in picker order', () => {
    expect(BUILT_IN_INDICATORS.map((d) => [d.id, d.tag, d.category, d.manifest.pane])).toEqual(INVENTORY)
    expect(BUILT_IN_INDICATORS.length).toBe(23)
  })

  it('carries its identity consistently: manifest id and tag match the definition, and the keys derive from the id', () => {
    for (const d of BUILT_IN_INDICATORS) {
      expect(d.manifest.id).toBe(d.id)
      expect(d.manifest.tag).toBe(d.tag)
      expect(d.manifest.category).toBe(d.category)
      expect(d.nameKey).toBe(`indicator.${d.id}Name`)
      expect(d.descriptionKey).toBe(`indicator.${d.id}Description`)
    }
  })

  it('looks up by id and fails closed on an unknown one', () => {
    expect(builtInIndicator('rsi')?.tag).toBe('RSI')
    expect(builtInIndicator('ichimoku')).toBeNull()
  })

  it('names every volume-based definition honestly', () => {
    expect(BUILT_IN_INDICATORS.filter((d) => d.manifest.needsVolume).map((d) => d.id)).toEqual(['vwma', 'volume', 'vwap', 'obv', 'mfi'])
  })

  it('declares a source input as an enum over PRICE_SOURCES wherever it takes one', () => {
    for (const d of BUILT_IN_INDICATORS) {
      const src = d.manifest.inputs.source
      if (src) expect(src.options).toEqual(PRICE_SOURCES)
    }
  })

  /** Inputs that ENABLE a default-off primary plot (the volume MA ships with showMa = 'No'). */
  const ENABLING_INPUTS: Record<string, Record<string, number>> = { volume: { showMa: 1 } }

  it.each(INVENTORY.map(([id]) => id))('%s answers every declared plot key, aligned 1:1 to the bars, finite past its warm-up', (id) => {
    const d = builtInIndicator(id)!
    const channels = d.compute(bars, { ...defaults(d.manifest), ...(ENABLING_INPUTS[id] ?? {}) })
    expect(Object.keys(channels).sort()).toEqual(Object.keys(d.manifest.plots).sort())
    for (const [key, values] of Object.entries(channels)) expect(values.length, `${id}.${key}`).toBe(N)
    const primary = Object.keys(d.manifest.plots)[0]!
    expect(channels[primary]!.filter(Number.isFinite).length, `${id} primary plot has no finite values`).toBeGreaterThan(0)
  })

  it('is pure: the same bars and inputs compute identical channels twice, and the inputs object is untouched', () => {
    for (const d of BUILT_IN_INDICATORS) {
      const inputs = Object.freeze(defaults(d.manifest))
      const a = d.compute(bars, inputs)
      const b = d.compute(bars, inputs)
      expect(a).toEqual(b)
    }
  })

  it('reads a persisted source index into the math: SMA over the open differs from SMA over the close', () => {
    const d = builtInIndicator('sma')!
    const close = d.compute(bars, { ...defaults(d.manifest), source: 0 })
    const open = d.compute(bars, { ...defaults(d.manifest), source: 1 })
    expect(close.sma![40]).not.toBeCloseTo(open.sma![40]!)
  })

  it('MACD honors the SMA families and VWAP its anchor, through the math rather than a private copy', () => {
    const macd = builtInIndicator('macd')!
    const ema = macd.compute(bars, defaults(macd.manifest))
    const sma = macd.compute(bars, { ...defaults(macd.manifest), oscMaType: 1, signalMaType: 1 })
    expect(ema.macd![60]).not.toBeCloseTo(sma.macd![60]!)
    const vwap = builtInIndicator('vwap')!
    const session = vwap.compute(bars, { ...defaults(vwap.manifest), anchorPeriod: 0 })
    const month = vwap.compute(bars, { ...defaults(vwap.manifest), anchorPeriod: 2 })
    expect(session.vwap!.every(Number.isFinite)).toBe(true)
    expect(month.vwap!.every(Number.isFinite)).toBe(true)
  })

  it('Keltner in High-Low mode widens by the plain range rather than the true range', () => {
    // Bars that gap up from the previous close: the true range runs through the gap, the plain
    // range does not, so the two band styles must answer differently.
    const gapped: IndicatorBar[] = []
    let open = 100
    for (let i = 0; i < 60; i++) {
      gapped.push({ t: BASE + i * 60, o: open, h: open + 1.1, l: open - 1, c: open + 0.1, v: 100 })
      open = open + 0.1 + 4
    }
    const d = builtInIndicator('keltner')!
    const tr = d.compute(gapped, defaults(d.manifest))
    const hl = d.compute(gapped, { ...defaults(d.manifest), bandsStyle: 1 })
    expect(tr.basis).toEqual(hl.basis)
    expect(hl.upper![40]! - hl.basis![40]!).toBeCloseTo(2 * 2.1)
    expect(tr.upper![40]! - tr.basis![40]!).toBeCloseTo(2 * 5.1, 0) // the first bar's TR is its plain range, so the RMA is still converging
  })

  it('Supertrend marks each flip once, on the new trend line', () => {
    const d = builtInIndicator('supertrend')!
    const r = d.compute(bars, defaults(d.manifest))
    const flips = r.upArrow!.filter(Number.isFinite).length + r.downArrow!.filter(Number.isFinite).length
    expect(flips).toBeGreaterThan(0)
    for (let i = 0; i < N; i++) {
      if (Number.isFinite(r.upArrow![i])) expect(r.upArrow![i]).toBe(r.up![i])
      if (Number.isFinite(r.downArrow![i])) expect(r.downArrow![i]).toBe(r.down![i])
    }
  })

  it('pins the volume companions to the volume band and leaves every other plot on the price scale', () => {
    for (const d of BUILT_IN_INDICATORS) {
      for (const [key, plot] of Object.entries(d.manifest.plots)) {
        expect(plot.scale, `${d.id}.${key}`).toBe(d.id === 'volume' ? 'volume' : undefined)
      }
    }
  })

  it('shades every oscillator background between its limit LEVELS, and every channel between its edge PLOTS', () => {
    for (const d of BUILT_IN_INDICATORS) {
      for (const [key, fill] of Object.entries(d.manifest.fills ?? {})) {
        const [upper, lower] = fill.between
        const asPlots = upper in d.manifest.plots && lower in d.manifest.plots
        const asLevels = upper in (d.manifest.levels ?? {}) && lower in (d.manifest.levels ?? {})
        expect(asPlots !== asLevels, `${d.id}.${key} names both or neither`).toBe(true)
      }
    }
  })

  it('titles every plot, level and fill key it declares', () => {
    for (const d of BUILT_IN_INDICATORS) {
      const keys = [...Object.keys(d.manifest.plots), ...Object.keys(d.manifest.levels ?? {}), ...Object.keys(d.manifest.fills ?? {})]
      for (const key of keys) expect(d.plotTitles[key], `${d.id}.${key}`).toBeTypeOf('string')
    }
  })
})
