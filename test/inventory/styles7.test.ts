// @vitest-environment happy-dom
// The seven main-series styles as release inventory: candles, hollow candles, bars, line, area, baseline
// and step line. The registry, the two predicates every consumer branches on, the series options each style
// paints with, and the command each style is reached through: one block per fact, so a style added or
// dropped, or a style that stopped being a command, is a readable failure. The switch itself, and what
// it preserves, is proved on a mounted widget by the conformance suite.
import { LineStyle, LineType } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { canvasTheme, CHART_STYLES, chartSettingsDefaults, coerceChartStyle, createChartI18n, isChartStyle, valueShaped, type ChartStyleId } from '../../src/index'
import { previousCloseColors, styleOptions, type StylePaint } from '../../src/widget/styles'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { fakeWidget } from '../chrome/harness'
import fixture from './ids.fixture.json'

/** Picker order. */
const ORDER: readonly ChartStyleId[] = ['candles', 'hollow', 'bars', 'line', 'area', 'baseline', 'stepline']

/** The English name each style's command wears, in picker order. */
const NAMES = ['Candles', 'Hollow candles', 'Bars', 'Line', 'Area', 'Baseline', 'Step line']

const paint = (mode: 'light' | 'dark'): StylePaint => ({
  settings: chartSettingsDefaults(BUILT_IN_THEMES[mode]),
  canvas: canvasTheme(BUILT_IN_THEMES[mode]),
  title: '',
  priceScale: true,
})

describe('the seven styles', () => {
  it('are these seven, in picker order, and the fixture agrees', () => {
    expect([...CHART_STYLES]).toEqual(ORDER)
    expect([...CHART_STYLES].sort()).toEqual(fixture.registries.styles)
  })

  it('recognize themselves and nothing else, and an unknown value coerces to candles', () => {
    for (const style of CHART_STYLES) {
      expect(isChartStyle(style)).toBe(true)
      expect(coerceChartStyle(style)).toBe(style)
    }
    for (const raw of ['renko', 'CANDLES', '', 3, null, undefined]) {
      expect(isChartStyle(raw), String(raw)).toBe(false)
      expect(coerceChartStyle(raw), String(raw)).toBe('candles')
    }
  })

  it('split into four value-shaped and three bar-shaped styles, the one predicate every consumer reads', () => {
    expect(CHART_STYLES.filter(valueShaped)).toEqual(['line', 'area', 'baseline', 'stepline'])
    expect(CHART_STYLES.filter((s) => !valueShaped(s))).toEqual(['candles', 'hollow', 'bars'])
  })
})

describe('what each style paints with', () => {
  const dark = paint('dark')
  const s = dark.settings

  it('candles take the candle family whole: body, borders and wick, each shown and each in its own pair', () => {
    expect(styleOptions('candles', dark)).toMatchObject({
      upColor: s.candles.upColor,
      downColor: s.candles.downColor,
      borderVisible: true,
      borderUpColor: s.candles.borderUpColor,
      borderDownColor: s.candles.borderDownColor,
      wickVisible: true,
      wickUpColor: s.candles.wickUpColor,
      wickDownColor: s.candles.wickDownColor,
    })
    const off = { ...dark, settings: { ...s, candles: { ...s.candles, body: false, borders: false, wick: false } } }
    expect(styleOptions('candles', off)).toMatchObject({ upColor: 'transparent', downColor: 'transparent', borderVisible: false, wickVisible: false })
  })

  it('hollow candles outline a rising body and fill a falling one from their own family', () => {
    expect(styleOptions('hollow', dark)).toMatchObject({
      upColor: 'transparent',
      downColor: s.hollowCandles.downColor,
      borderVisible: true,
      borderUpColor: s.hollowCandles.borderUpColor,
      borderDownColor: s.hollowCandles.borderDownColor,
      wickVisible: true,
      wickUpColor: s.hollowCandles.wickUpColor,
      wickDownColor: s.hollowCandles.wickDownColor,
    })
  })

  it('bars carry the direction pair, thin bars and the open tick unless only high, low and close are drawn', () => {
    expect(styleOptions('bars', dark)).toMatchObject({ upColor: s.bars.upColor, downColor: s.bars.downColor, thinBars: true, openVisible: true })
    const hlc = { ...dark, settings: { ...s, bars: { ...s.bars, hlcBars: true, thinBars: false } } }
    expect(styleOptions('bars', hlc)).toMatchObject({ openVisible: false, thinBars: false })
  })

  it('line and step line draw a gradient through their own primitive, or one solid line, step line with steps', () => {
    for (const mode of ['light', 'dark'] as const) {
      const p = paint(mode)
      expect(styleOptions('line', p)).toMatchObject({ color: '#d500f9', lineVisible: false, lineWidth: 2, lineStyle: LineStyle.Solid })
      expect(styleOptions('stepline', p)).toMatchObject({ lineVisible: false, lineType: LineType.WithSteps })
      const solid = { ...p, settings: { ...p.settings, line: { ...p.settings.line, colorType: 'solid' as const, lineStyle: 'dashed' as const, lineWidth: 3 } } }
      expect(styleOptions('line', solid)).toMatchObject({ color: '#2962ff', lineVisible: true, lineWidth: 3, lineStyle: LineStyle.LargeDashed })
    }
  })

  it('area and baseline take their own families, the baseline with one line width per half', () => {
    expect(styleOptions('area', dark)).toMatchObject({ lineColor: '#2962ff', lineWidth: 2, topColor: 'rgba(41, 98, 255, 0.28)', bottomColor: 'rgba(41, 98, 255, 0)' })
    const baseline = styleOptions('baseline', dark)
    expect(baseline).toMatchObject({ topLineColor: s.baseline.topLineColor, bottomLineColor: s.baseline.bottomLineColor, lineWidth: 2 })
    for (const key of ['topFillColor1', 'topFillColor2', 'bottomFillColor1', 'bottomFillColor2']) expect(String(baseline[key]), key).toMatch(/^rgba\(/)
    // Halves of different widths: the series strokes the upper half and leaves the lower to the
    // chart's own line.
    const split = { ...dark, settings: { ...s, baseline: { ...s.baseline, topLineWidth: 1, bottomLineWidth: 4 } } }
    expect(styleOptions('baseline', split)).toMatchObject({ lineWidth: 1, bottomLineColor: 'transparent' })
  })

  it('every style carries the symbol last-value label, its dotted line and its name from the price labels', () => {
    for (const style of CHART_STYLES) {
      expect(styleOptions(style, dark), style).toMatchObject({
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: '',
        priceLineWidth: 1,
        priceLineStyle: LineStyle.SparseDotted,
        title: '',
      })
    }
    const labels = { ...s.priceLabels, symbolName: true, symbolValue: false, symbolLine: false, symbolLineColor: '#123456', symbolLineWidth: 3 }
    const named = { ...dark, title: 'ES1!', settings: { ...s, priceLabels: labels } }
    expect(styleOptions('candles', named)).toMatchObject({ title: 'ES1!', lastValueVisible: false, priceLineVisible: false, priceLineColor: '#123456', priceLineWidth: 3 })
    expect(styleOptions('candles', { ...dark, priceScale: false })).toMatchObject({ lastValueVisible: false, priceLineVisible: false })
  })

  it('colors candles and bars by the previous close only when their family asks for it', () => {
    expect(previousCloseColors('candles', s)).toBeNull()
    const on = { ...s, candles: { ...s.candles, colorOnPreviousClose: true }, bars: { ...s.bars, colorOnPreviousClose: true } }
    const candle = previousCloseColors('candles', on)!
    // Up against the previous close though it fell against its own open, and down the other way.
    expect(candle({ o: 110, c: 105 }, { c: 100 })).toEqual({ color: s.candles.upColor, borderColor: s.candles.borderUpColor, wickColor: s.candles.wickUpColor })
    expect(candle({ o: 90, c: 95 }, { c: 100 })).toEqual({ color: s.candles.downColor, borderColor: s.candles.borderDownColor, wickColor: s.candles.wickDownColor })
    // The first bar has no previous close and reads by its own open.
    expect(candle({ o: 90, c: 95 }, undefined).color).toBe(s.candles.upColor)
    expect(previousCloseColors('bars', on)!({ o: 110, c: 105 }, { c: 100 })).toEqual({ color: s.bars.upColor })
    expect(previousCloseColors('hollow', on)).toBeNull()
    expect(previousCloseColors('line', on)).toBeNull()
  })
})

describe('each style is a chart command', () => {
  it('registers chart.style.<id> for all seven, chart-scoped and labeled from the catalog', () => {
    const w = fakeWidget()
    try {
      const t = createChartI18n().t
      for (const [i, style] of CHART_STYLES.entries()) {
        const spec = w.commands.list().find((s) => s.id === `chart.style.${style}`)
        expect(spec, style).toBeDefined()
        expect(spec!.scope).toBe('chart')
        expect(t(spec!.label)).toBe(NAMES[i])
      }
    } finally {
      w.dispose()
    }
  })

  it('switches the chart through the registry, and the current style reads as unavailable', () => {
    const w = fakeWidget()
    try {
      expect(w.commands.execute('chart.style.candles').kind).toBe('unavailable')
      expect(w.commands.execute('chart.style.line').kind).toBe('ok')
      expect(w.chart.state.style).toBe('line')
      expect(w.chart.calls).toContain('style:line')
      expect(w.commands.execute('chart.style.line').kind).toBe('unavailable')
    } finally {
      w.dispose()
    }
  })
})
