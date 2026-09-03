// The 23 built-in indicators as release inventory (public-chart-library-boundary-plan.md PCL-5 extraction
// ledger: "Move exactly the shipped manifests, math, defaults, plots, settings, and tests"; PCL-6 "Prove
// ... 23 built-in indicators" and "indicator plot families"). builtInIndicators.test.ts proves the catalog
// names and one walk; this file pins the registry itself: picker order, the four categories, every plot
// family the manifests declare, and that each definition computes channels aligned to the bars and walks
// through the one rendering pipeline into the placement its manifest names.
import type { UTCTimestamp } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { BUILT_IN_INDICATORS, buildManifestPlots, createChartI18n, manifestInputDefaults, type BuiltInIndicator, type FeedBar } from '../../src/index'
import fixture from './ids.fixture.json'

/** Picker order: moving averages, bands and channels, oscillators, volume. */
const ORDER = [
  'sma',
  'ema',
  'hma',
  'vwma',
  'bollinger',
  'donchian',
  'keltner',
  'supertrend',
  'psar',
  'rsi',
  'macd',
  'stochastic',
  'stochrsi',
  'adx',
  'atr',
  'cci',
  'williams',
  'roc',
  'momentum',
  'volume',
  'vwap',
  'obv',
  'mfi',
]

/** The four categories and their members, in picker order. */
const CATEGORIES = {
  ma: ['sma', 'ema', 'hma', 'vwma'],
  band: ['bollinger', 'donchian', 'keltner', 'supertrend', 'psar'],
  osc: ['rsi', 'macd', 'stochastic', 'stochrsi', 'adx', 'atr', 'cci', 'williams', 'roc', 'momentum'],
  vol: ['volume', 'vwap', 'obv', 'mfi'],
}

/** The plot families the built-ins exercise, by id. A family with no member is listed empty on purpose:
 *  the walker supports it, and the day-one catalog uses no such plot. */
const FAMILIES = {
  histogram: ['macd'],
  area: [] as string[],
  marker: ['supertrend'],
  levels: ['rsi', 'stochastic', 'stochrsi', 'cci', 'williams', 'roc', 'momentum', 'mfi'],
  fills: ['bollinger', 'donchian', 'keltner', 'rsi', 'stochastic', 'stochrsi', 'cci', 'williams', 'mfi'],
  volumeScale: ['volume'],
  pane: ['rsi', 'macd', 'stochastic', 'stochrsi', 'adx', 'atr', 'cci', 'williams', 'roc', 'momentum', 'obv', 'mfi'],
  overlay: ['sma', 'ema', 'hma', 'vwma', 'bollinger', 'donchian', 'keltner', 'supertrend', 'psar', 'volume', 'vwap'],
  needsVolume: ['vwma', 'volume', 'vwap', 'obv', 'mfi'],
}

const PLOT_KINDS = ['line', 'histogram', 'area', 'marker']

const bars: FeedBar[] = Array.from({ length: 120 }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 5) + i * 0.1
  const o = i === 0 ? c : 100 + 10 * Math.sin((i - 1) / 5) + (i - 1) * 0.1
  return { t: 1_700_000_000 + i * 60, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 100 + (i % 7) * 10 }
})
const times = bars.map((b) => b.t as UTCTimestamp)

const walk = (d: BuiltInIndicator) => buildManifestPlots({ manifest: d.manifest, plots: d.compute(bars, manifestInputDefaults(d.manifest)) }, times, d.id, '#4c98fb')

describe('the 23 built-in indicators', () => {
  it('are these, in picker order, and the fixture agrees', () => {
    expect(BUILT_IN_INDICATORS.map((d) => d.id)).toEqual(ORDER)
    expect(BUILT_IN_INDICATORS.map((d) => d.id).sort()).toEqual(fixture.registries.indicators)
  })

  it('fall into the four categories, each in picker order', () => {
    const grouped: Record<string, string[]> = {}
    for (const d of BUILT_IN_INDICATORS) (grouped[d.category] ??= []).push(d.id)
    expect(grouped).toEqual(CATEGORIES)
  })

  it('exercise exactly these plot families', () => {
    const census: Record<keyof typeof FAMILIES, string[]> = { histogram: [], area: [], marker: [], levels: [], fills: [], volumeScale: [], pane: [], overlay: [], needsVolume: [] }
    for (const d of BUILT_IN_INDICATORS) {
      const spec = walk(d)
      for (const p of spec.plots) if (p.type !== 'line' && !census[p.type].includes(d.id)) census[p.type].push(d.id)
      if (spec.levels?.length) census.levels.push(d.id)
      if (spec.fills?.length) census.fills.push(d.id)
      if (Object.values(d.manifest.plots).some((p) => p.scale === 'volume')) census.volumeScale.push(d.id)
      census[spec.placement].push(d.id)
      if (d.manifest.needsVolume) census.needsVolume.push(d.id)
    }
    expect(census).toEqual(FAMILIES)
  })

  for (const d of BUILT_IN_INDICATORS) {
    describe(d.id, () => {
      it('carries its identity on the manifest and names itself through the catalog', () => {
        const t = createChartI18n().t
        // The seam's manifest carries the identity beside the chart's manifest grammar.
        const seamManifest = d.manifest as { id?: string; tag?: string }
        expect(seamManifest.id).toBe(d.id)
        expect(seamManifest.tag).toBe(d.tag)
        expect(d.tag.length).toBeGreaterThan(0)
        expect(t(d.nameKey)).not.toBe(d.nameKey)
        expect(t(d.nameKey).length).toBeGreaterThan(0)
        expect(t(d.descriptionKey)).not.toBe(d.descriptionKey)
        expect(t(d.descriptionKey).length).toBeGreaterThan(0)
      })

      it('defaults every input inside its own bounds', () => {
        const defaults = manifestInputDefaults(d.manifest)
        for (const [key, spec] of Object.entries(d.manifest.inputs ?? {})) {
          expect(defaults[key], key).toBe(spec.default)
          if (spec.min !== undefined) expect(spec.default, key).toBeGreaterThanOrEqual(spec.min)
          if (spec.max !== undefined) expect(spec.default, key).toBeLessThanOrEqual(spec.max)
          if (spec.kind === 'enum') expect(spec.options?.length ?? 0, key).toBeGreaterThan(spec.default)
        }
      })

      it('computes one channel per declared plot, aligned to the bars, and is warm on its main plot', () => {
        // An optional plot (a smoothing line that is off by default) is a channel of nulls until its
        // input turns it on; the definition's main plot has to carry values once past its warmup.
        const channels = d.compute(bars, manifestInputDefaults(d.manifest))
        const warm: string[] = []
        for (const key of Object.keys(d.manifest.plots)) {
          const channel = channels[key]
          expect(channel, key).toBeDefined()
          expect(channel!.length, key).toBe(bars.length)
          if (channel!.some((v) => typeof v === 'number' && Number.isFinite(v))) warm.push(key)
        }
        // The Volume built-in is the one whose every plot is an optional companion: its bars are the
        // chart's own volume band, and its two averages ride that band only when switched on.
        const companionsOnly = Object.values(d.manifest.plots).every((p) => p.scale === 'volume')
        if (companionsOnly) {
          expect(d.id).toBe('volume')
          return
        }
        expect(warm.length, 'no plot carries a value').toBeGreaterThan(0)
        expect(warm, 'the first declared plot is the main one and must be warm').toContain(Object.keys(d.manifest.plots)[0])
      })

      it('walks into the placement its manifest names, every plot from a known family', () => {
        const spec = walk(d)
        expect(spec.placement).toBe(d.manifest.pane)
        expect(spec.unavailable).toBeUndefined()
        expect(spec.plots.map((p) => p.key).sort()).toEqual(Object.keys(d.manifest.plots).sort())
        for (const p of spec.plots) {
          expect(PLOT_KINDS, p.key).toContain(p.type)
          expect(p.data.length, p.key).toBeGreaterThan(0)
        }
        expect((spec.levels ?? []).length).toBe(Object.keys(d.manifest.levels ?? {}).length)
        expect((spec.fills ?? []).length).toBe(Object.keys(d.manifest.fills ?? {}).length)
      })
    })
  }
})
