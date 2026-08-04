import { describe, expect, it } from 'vitest'
import type { UTCTimestamp } from 'lightweight-charts'
import {
  applyPlotOverrides,
  buildManifestPlots,
  effectivePlotColor,
  indicatorHidden,
  latestPlotValue,
  manifestInputDefaults,
  overriddenManifest,
  type IndicatorManifest,
} from '../src/indicatorModel'

const times = [60, 120, 180].map((t) => t as UTCTimestamp)

const MANIFEST: IndicatorManifest = {
  pane: 'pane',
  inputs: { period: { kind: 'int', default: 14, min: 1 }, source: { kind: 'enum', default: 0, options: ['close', 'open'] } },
  plots: {
    main: { kind: 'line', lineWidth: 2 },
    hist: { kind: 'histogram', up: '#0f0', down: '#f00' },
    zone: { kind: 'area', base: 50 },
    events: { kind: 'marker', shape: 'arrow-up', location: 'below', text: 'B' },
  },
  levels: { upper: { price: 70, lineStyle: 'dashed' }, lower: { price: 30 } },
  fills: { background: { between: ['upper', 'lower'], color: 'rgba(1,2,3,0.1)' } },
}

describe('buildManifestPlots — the one walker', () => {
  it('walks every plot kind, gaps null/NaN to whitespace, and signs histogram colors', () => {
    const built = buildManifestPlots(
      {
        manifest: MANIFEST,
        plots: { main: [1, null, 3], hist: [5, -5, NaN], zone: [55, 45, 50], events: [null, 1, null] },
      },
      times,
      'Test',
      '#abc',
    )
    expect(built.placement).toBe('pane')
    expect(built.plots.map((p) => p.type)).toEqual(['line', 'histogram', 'area', 'marker'])
    // Line gaps: whitespace (no value) keeps the axis intact.
    expect(built.plots[0]!.data).toEqual([
      { time: 60, value: 1 },
      { time: 120 },
      { time: 180, value: 3 },
    ])
    // Histogram: sign-colored, NaN dropped entirely (histograms carry no whitespace points).
    expect(built.plots[1]!.data).toEqual([
      { time: 60, value: 5, color: '#0f0' },
      { time: 120, value: -5, color: '#f00' },
    ])
    // The undeclared-color plots take the instance's fallback color.
    expect(built.plots[0]!.color).toBe('#abc')
    // Levels and fills come through keyed.
    expect(built.levels).toEqual([
      { key: 'upper', price: 70, color: undefined, lineStyle: 'dashed' },
      { key: 'lower', price: 30, color: undefined, lineStyle: undefined },
    ])
    expect(built.fills?.[0]).toMatchObject({ key: 'background', upper: 'upper', lower: 'lower', color: 'rgba(1,2,3,0.1)' })
  })

  it('emits sparse shade points and gates barColors to overlay placement', () => {
    const paneRun = { manifest: MANIFEST, plots: { main: [1, 2, 3] }, shadeColors: [null, '#111', null], barColors: ['#222', null, null] }
    const pane = buildManifestPlots(paneRun, times, 't', '#abc')
    expect(pane.shade).toEqual([{ time: 120, color: '#111' }])
    expect(pane.barColors).toBeUndefined() // pane-placed indicators never recolor the candles

    const overlay = buildManifestPlots({ ...paneRun, manifest: { ...MANIFEST, pane: 'overlay' } }, times, 't', '#abc')
    expect(overlay.barColors).toEqual([{ time: 60, color: '#222' }])
  })
})

describe('override layering', () => {
  it('overriddenManifest folds style overrides into declared specs and keeps identity fields', () => {
    const merged = overriddenManifest(MANIFEST, {
      plots: { main: { color: '#123', lineWidth: 3 }, hist: { up: '#0ff' } },
      levels: { upper: { price: 80 } },
      fills: { background: { color: '#000' } },
    })
    expect(merged.plots.main).toMatchObject({ color: '#123', lineWidth: 3 })
    expect(merged.plots.hist).toMatchObject({ up: '#0ff', down: '#f00' })
    expect(merged.levels?.upper?.price).toBe(80)
    expect(merged.fills?.background?.color).toBe('#000')
    expect(overriddenManifest(MANIFEST, undefined)).toBe(MANIFEST) // no overrides → same reference
  })

  it('applyPlotOverrides gates visibility and carries precision/display', () => {
    const built = buildManifestPlots({ manifest: MANIFEST, plots: { main: [1, 2, 3] } }, times, 't', '#abc')
    const out = applyPlotOverrides(built, {
      plots: { main: { visible: false } },
      levels: { upper: { visible: false } },
      fills: { background: { visible: false } },
      precision: 4,
      display: { labelsOnPriceScale: false },
    })
    expect(out.plots[0]!.visible).toBe(false)
    expect(out.levels?.map((l) => l.key)).toEqual(['lower'])
    expect(out.fills).toEqual([])
    expect(out.precision).toBe(4)
    expect(out.display?.labelsOnPriceScale).toBe(false)
  })

  it('the small reads agree with the model', () => {
    expect(manifestInputDefaults(MANIFEST)).toEqual({ period: 14, source: 0 })
    expect(effectivePlotColor(MANIFEST, 'main', undefined, '#abc')).toBe('#abc')
    expect(effectivePlotColor(MANIFEST, 'main', { plots: { main: { color: '#f0f' } } }, '#abc')).toBe('#f0f')
    expect(indicatorHidden({ display: { hidden: true } })).toBe(true)
    expect(indicatorHidden(undefined)).toBe(false)
    expect(latestPlotValue([{ time: 1, value: 2 }, { time: 2 }])).toBe(2)
    expect(latestPlotValue([])).toBeNull()
  })
})
