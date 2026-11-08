// @vitest-environment happy-dom
// What the indicator settings session leans on in the plane: a preview drawn in place of the held
// instance while the chart's content keeps it, the timeframes an instance draws on, the viewer's
// saved default an instance added with nothing of its own opens with, the legend readout of the
// inputs that apply, and the overrides a saved record carries.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { DEFAULT_VISIBILITY } from '../../src/internal/drawings/index'
import { attachIndicatorsPlane, createIndicatorCatalog, indicatorDrawsOn, indicatorInputsOf, type IndicatorDefaults } from '../../src/widget/indicators'
import { parseIndicatorDefault } from '../../src/widget/saveLoad'
import type { IndicatorDefinition } from '../../src/widget/options'
import type { CanvasTheme } from '../../src/theme/renderer'
import type { FeedBar } from '../../src/datafeed'
import { fakeRenderer } from './rendererFake'

const builtIn = (id: string): IndicatorDefinition => BUILT_IN_INDICATORS.find((definition) => definition.id === id)!

const BARS: FeedBar[] = Array.from({ length: 60 }, (_, i) => ({ t: 1_700_000_000 + i * 60, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1000 }))

function plane(options: { timeframe?: () => string; defaults?: IndicatorDefaults } = {}) {
  return attachIndicatorsPlane({
    chart: fakeRenderer().chart,
    candleSeries: () => null,
    bars: () => BARS,
    i18n: createChartI18n(),
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    formatKey: () => 'test',
    minMove: () => 0.01,
    canvas: () => ({ neutral: '#888' }) as unknown as CanvasTheme,
    disposed: () => false,
    onChips: () => undefined,
    onEvent: () => undefined,
    catalog: createIndicatorCatalog(),
    ...options,
  })
}

describe('the settings session in the plane', () => {
  it('draws a preview in place of the held instance and keeps the held one in the content', () => {
    const indicators = plane()
    indicators.add({ id: 'sma-1', definition: builtIn('sma'), inputs: { period: 5 } })
    const held = indicators.list()[0]!
    indicators.preview('sma-1', { ...held, overrides: { display: { inputsInStatusLine: false } } })
    expect(indicators.list()[0]).toBe(held)
    expect(indicators.chips()[0]!.inputs).toBeUndefined()
    indicators.preview('sma-1', null)
    expect(indicators.chips()[0]!.inputs).toBe('(5, Close, 0, None)')
    indicators.destroy()
  })

  it('draws an instance only on the timeframes its visibility keeps, and keeps its row on the others', () => {
    let timeframe = '1m'
    const indicators = plane({ timeframe: () => timeframe })
    const hoursOnly = { ...DEFAULT_VISIBILITY, ticks: false, seconds: { on: false, from: 1, to: 59 }, minutes: { on: false, from: 1, to: 59 }, days: { on: false, from: 1, to: 366 }, weeks: { on: false, from: 1, to: 52 }, months: { on: false, from: 1, to: 12 } }
    indicators.add({ id: 'sma-1', definition: builtIn('sma'), overrides: { visibility: hoursOnly } })
    expect(indicators.chips()[0]).toMatchObject({ value: null, hidden: false })
    timeframe = '4h'
    indicators.recompute()
    expect(indicators.chips()[0]!.value).not.toBeNull()
    expect(indicatorDrawsOn(indicators.list()[0]!, 'not a timeframe')).toBe(true)
    indicators.destroy()
  })

  it('opens an instance added with nothing of its own on the saved default, and leaves one that states its own', () => {
    const store = new Map<string, { inputs?: Record<string, number> }>([['sma', { inputs: { period: 50 } }]])
    const defaults: IndicatorDefaults = { read: (id) => store.get(id) ?? null, write: (id, value) => void store.set(id, value) }
    const indicators = plane({ defaults })
    indicators.add({ id: 'sma-1', definition: builtIn('sma') })
    indicators.add({ id: 'sma-2', definition: builtIn('sma'), inputs: { period: 9 } })
    expect(indicators.list().map((i) => i.inputs?.period)).toEqual([50, 9])
    indicators.destroy()
  })

  it('reads out the inputs that apply, leaving out a switch and an input that follows another', () => {
    expect(indicatorInputsOf({ id: 'sma-1', definition: builtIn('sma') })).toBe('(20, Close, 0, None)')
    expect(indicatorInputsOf({ id: 'sma-1', definition: builtIn('sma'), inputs: { smoothingLine: 2 } })).toBe('(20, Close, 0, EMA, 14)')
    expect(indicatorInputsOf({ id: 'vol-1', definition: builtIn('volume'), inputs: { showMa: 1 } })).toBe('(20, None)')
  })

  it('reads a visibility the way a saved chart does, and refuses a range outside its unit', () => {
    const visibility = { ...DEFAULT_VISIBILITY, hours: { on: true, from: 2, to: 4 } }
    expect(parseIndicatorDefault({ inputs: { period: 30 }, overrides: { visibility } })).toEqual({ inputs: { period: 30 }, overrides: { visibility } })
    expect(parseIndicatorDefault({ overrides: { visibility: { hours: { on: true, from: 0, to: 30 } } } })).toBeNull()
    expect(parseIndicatorDefault('not a record')).toBeNull()
  })
})
