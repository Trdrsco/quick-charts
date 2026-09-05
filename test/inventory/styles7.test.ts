// @vitest-environment happy-dom
// The seven main-series styles as release inventory: candles, hollow candles, bars, line, area, baseline
// and step line. The registry, the two predicates every consumer branches on, the series options each style
// paints with, and the command each style is reached through: one block per fact, so a style added or
// dropped, or a style that stopped being a command, is a readable failure. The switch itself, and what
// it preserves, is proved on a mounted widget by the conformance suite.
import { LineType } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { canvasTheme, CHART_STYLES, coerceChartStyle, createChartI18n, DEFAULT_OVERRIDES, isChartStyle, valueShaped, type ChartStyleId } from '../../src/index'
import { styleOptions, type StylePaint } from '../../src/widget/styles'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { fakeWidget } from '../chrome/harness'
import fixture from './ids.fixture.json'

/** Picker order. */
const ORDER: readonly ChartStyleId[] = ['candles', 'hollow', 'bars', 'line', 'area', 'baseline', 'stepline']

/** The English name each style's command wears, in picker order. */
const NAMES = ['Candles', 'Hollow candles', 'Bars', 'Line', 'Area', 'Baseline', 'Step line']

const paint = (mode: 'light' | 'dark'): StylePaint => ({
  appearance: DEFAULT_OVERRIDES.appearance,
  canvas: canvasTheme(BUILT_IN_THEMES[mode]),
  candleBorders: false,
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

  it('candles take the appearance anatomy whole, borders off until a host names one', () => {
    expect(styleOptions('candles', dark)).toEqual({
      upColor: dark.appearance.upColor,
      downColor: dark.appearance.downColor,
      borderVisible: false,
      borderUpColor: dark.appearance.borderUpColor,
      borderDownColor: dark.appearance.borderDownColor,
      wickUpColor: dark.appearance.wickUpColor,
      wickDownColor: dark.appearance.wickDownColor,
    })
    expect(styleOptions('candles', { ...dark, candleBorders: true }).borderVisible).toBe(true)
  })

  it('hollow candles outline a rising body and fill a falling one, borders always on', () => {
    expect(styleOptions('hollow', dark)).toMatchObject({
      upColor: 'transparent',
      downColor: dark.appearance.downColor,
      borderVisible: true,
      borderUpColor: dark.appearance.upColor,
      borderDownColor: dark.appearance.downColor,
      wickUpColor: dark.appearance.upColor,
      wickDownColor: dark.appearance.downColor,
    })
  })

  it('bars carry the direction pair alone', () => {
    expect(styleOptions('bars', dark)).toEqual({ upColor: dark.appearance.upColor, downColor: dark.appearance.downColor })
  })

  it('line and step line draw one undirected line in the mode neutral ink, step line with steps', () => {
    for (const mode of ['light', 'dark'] as const) {
      const p = paint(mode)
      expect(styleOptions('line', p)).toEqual({ color: p.canvas.neutral, lineWidth: 2 })
      expect(styleOptions('stepline', p)).toEqual({ color: p.canvas.neutral, lineWidth: 2, lineType: LineType.WithSteps })
    }
  })

  it('area fades the up color and baseline fades both directions, from the appearance ladder', () => {
    const area = styleOptions('area', dark)
    expect(area.lineColor).toBe(dark.appearance.upColor)
    expect(String(area.topColor)).toMatch(/^rgba\(/)
    expect(String(area.bottomColor)).toMatch(/^rgba\(/)
    const baseline = styleOptions('baseline', dark)
    expect(baseline.topLineColor).toBe(dark.appearance.upColor)
    expect(baseline.bottomLineColor).toBe(dark.appearance.downColor)
    for (const key of ['topFillColor1', 'topFillColor2', 'bottomFillColor1', 'bottomFillColor2']) expect(String(baseline[key]), key).toMatch(/^rgba\(/)
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
