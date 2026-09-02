// The built-in indicators at the chart's boundary (public-chart-library-boundary-plan.md: 23
// built-ins in the day-one catalog). Every one is a widget IndicatorDefinition as shipped: its
// manifest walks through the package pipeline with the defaults alone, its catalog keys resolve
// through the chart's own catalog, and the registry order is pinned by id.
import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import { BUILT_IN_INDICATORS, buildManifestPlots, createChartI18n, manifestInputDefaults, type FeedBar, type IndicatorDefinition } from '../src/index'
import { en } from '../src/i18n/en'

const N = 120
const BASE = 1_700_000_000
const bars: FeedBar[] = Array.from({ length: N }, (_, i) => {
  const c = 100 + 10 * Math.sin(i / 5) + i * 0.1
  const o = i === 0 ? c : 100 + 10 * Math.sin((i - 1) / 5) + (i - 1) * 0.1
  return { t: BASE + i * 60, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 100 + i }
})
const times = bars.map((b) => b.t as UTCTimestamp)

const IDS = [
  'sma', 'ema', 'hma', 'vwma',
  'bollinger', 'donchian', 'keltner', 'supertrend', 'psar',
  'rsi', 'macd', 'stochastic', 'stochrsi', 'adx', 'atr', 'cci', 'williams', 'roc', 'momentum',
  'volume', 'vwap', 'obv', 'mfi',
] as const

describe('the 23 built-in indicators the chart ships', () => {
  it('pins the registry by id, in picker order', () => {
    expect(BUILT_IN_INDICATORS.map((d) => d.id)).toEqual([...IDS])
    expect(BUILT_IN_INDICATORS.length).toBe(23)
  })

  it('is a plain IndicatorDefinition list (compile-time proof) with a unique id and tag each', () => {
    const definitions: readonly IndicatorDefinition[] = BUILT_IN_INDICATORS
    expect(definitions.length).toBe(23)
    expect(new Set(BUILT_IN_INDICATORS.map((d) => d.id)).size).toBe(23)
    expect(new Set(BUILT_IN_INDICATORS.map((d) => d.tag)).size).toBe(23)
  })

  it('resolves every name and description through the chart catalog, in English and after a language switch', async () => {
    const i18n = createChartI18n()
    for (const d of BUILT_IN_INDICATORS) {
      expect(d.nameKey in en, d.nameKey).toBe(true)
      expect(d.descriptionKey in en, d.descriptionKey).toBe(true)
      expect(i18n.t(d.nameKey).length).toBeGreaterThan(0)
      expect(i18n.t(d.descriptionKey).length).toBeGreaterThan(0)
    }
    expect(i18n.t(BUILT_IN_INDICATORS[0]!.nameKey)).toBe('Simple Moving Average')
    await i18n.setLocale('de')
    expect(i18n.t(BUILT_IN_INDICATORS[0]!.nameKey).length).toBeGreaterThan(0)
  })

  it('carries no English name on the manifest: the catalog key and the tag are the identity', () => {
    for (const d of BUILT_IN_INDICATORS) {
      expect((d.manifest as { name?: string }).name).toBeUndefined()
      expect(d.tag).toMatch(/^[A-Z%][A-Z]*$/)
    }
  })

  /** Inputs that ENABLE a default-off primary plot (the volume MA ships with showMa = 'No'). */
  const ENABLING_INPUTS: Record<string, Record<string, number>> = { volume: { showMa: 1 } }

  it.each(IDS)('%s computes and walks through the widget pipeline', (id) => {
    const definition = BUILT_IN_INDICATORS.find((d) => d.id === id)!
    const channels = definition.compute(bars, { ...manifestInputDefaults(definition.manifest), ...(ENABLING_INPUTS[id] ?? {}) })
    const built = buildManifestPlots({ manifest: definition.manifest, plots: channels }, times, id, '#2196f3')
    expect(built.placement).toBe(definition.manifest.pane === 'pane' ? 'pane' : 'overlay')
    // Every declared plot key materializes as a plot, in declaration order.
    expect(built.plots.map((p) => p.key)).toEqual(Object.keys(definition.manifest.plots))
    // The primary plot carries finite values once past its warmup (the series is long enough for
    // every built-in's default lookback).
    const primary = built.plots[0]
    if (primary && (primary.type === 'line' || primary.type === 'area')) {
      const finite = primary.data.filter((p) => typeof (p as { value?: unknown }).value === 'number').length
      expect(finite, `${id} primary plot has no finite values`).toBeGreaterThan(0)
    }
  })

  it('walks the Volume companions onto the volume band and the RSI background between its limit levels', () => {
    const volume = BUILT_IN_INDICATORS.find((d) => d.id === 'volume')!
    const volumeBuilt = buildManifestPlots(
      { manifest: volume.manifest, plots: volume.compute(bars, { ...manifestInputDefaults(volume.manifest), showMa: 1 }) },
      times,
      'volume',
      '#2196f3',
    )
    expect(volumeBuilt.plots.map((p) => p.scale)).toEqual(['volume', 'volume'])

    const rsi = BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')!
    const rsiBuilt = buildManifestPlots({ manifest: rsi.manifest, plots: rsi.compute(bars, manifestInputDefaults(rsi.manifest)) }, times, 'rsi', '#2196f3')
    expect(rsiBuilt.levels?.map((l) => [l.key, l.price])).toEqual([
      ['upper', 70],
      ['middle', 50],
      ['lower', 30],
    ])
    const background = rsiBuilt.fills?.find((f) => f.key === 'background')
    expect(background?.upperData?.length).toBe(N)
    expect((background?.upperData?.[0] as { value: number }).value).toBe(70)
    expect((background?.lowerData?.[0] as { value: number }).value).toBe(30)
  })
})
