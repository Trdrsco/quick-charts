// The chart settings' factory values in each mode, the ladder that layers partials over them, the
// reading every stored or supplied partial goes through, and the precision a price is written at.
import { describe, expect, it } from 'vitest'
import {
  CHART_SETTINGS_SECTIONS,
  chartSettingsDefaults,
  colorWithAlpha,
  layerChartSettings,
  mergePartialChartSettings,
  readPartialChartSettings,
} from '../../src/settings/defaults'
import { formatAtPrecision } from '../../src/settings/precision'
import { CHART_DATE_FORMATS } from '../../src/settings/schema'
import { CHART_FACTORY_COLORS, DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'

const dark = chartSettingsDefaults(DARK_THEME)
const light = chartSettingsDefaults(LIGHT_THEME)

describe('the factory values', () => {
  it('change with the mode in six canvas colors only', () => {
    expect([dark.canvas.background, light.canvas.background]).toEqual(['#0f0f0f', '#ffffff'])
    expect([dark.canvas.verticalGridColor, light.canvas.verticalGridColor]).toEqual(['rgba(242, 242, 242, 0.2)', 'rgba(46, 46, 46, 0.2)'])
    expect([dark.canvas.horizontalGridColor, light.canvas.horizontalGridColor]).toEqual(['rgba(242, 242, 242, 0.2)', 'rgba(46, 46, 46, 0.2)'])
    expect([dark.canvas.watermarkColor, light.canvas.watermarkColor]).toEqual(['rgba(80, 83, 94, 0.3)', 'rgba(80, 83, 94, 0.2)'])
    expect([dark.canvas.scaleTextColor, light.canvas.scaleTextColor]).toEqual(['#b8b8b8', '#0f0f0f'])
    expect([dark.canvas.scaleLineColor, light.canvas.scaleLineColor]).toEqual(['rgba(242, 242, 242, 0)', 'rgba(46, 46, 46, 0)'])
    const varies = new Set(['background', 'backgroundBottom', 'verticalGridColor', 'horizontalGridColor', 'watermarkColor', 'scaleTextColor', 'scaleLineColor'])
    for (const section of CHART_SETTINGS_SECTIONS) {
      for (const [leaf, value] of Object.entries(dark[section])) {
        if (section === 'canvas' && varies.has(leaf)) continue
        expect((light[section] as Record<string, unknown>)[leaf], `${section}.${leaf}`).toEqual(value)
      }
    }
  })

  it('hold the reference factory look', () => {
    expect(dark.candles).toEqual({
      colorOnPreviousClose: false,
      body: true,
      upColor: '#089981',
      downColor: '#f23645',
      borders: true,
      borderUpColor: '#089981',
      borderDownColor: '#f23645',
      wick: true,
      wickUpColor: '#089981',
      wickDownColor: '#f23645',
    })
    expect(dark.bars).toEqual({ colorOnPreviousClose: false, hlcBars: false, upColor: '#089981', downColor: '#f23645', thinBars: true })
    expect(dark.line).toEqual({ priceSource: 'close', colorType: 'gradient', color: '#2962ff', gradientTopColor: '#d500f9', gradientBottomColor: '#00bce5', lineStyle: 'solid', lineWidth: 2 })
    expect(dark.stepLine).toEqual(dark.line)
    expect(dark.area).toEqual({ priceSource: 'close', lineColor: '#2962ff', lineStyle: 'solid', lineWidth: 2, topColor: 'rgba(41, 98, 255, 0.28)', bottomColor: 'rgba(41, 98, 255, 0)' })
    expect(dark.baseline).toEqual({
      priceSource: 'close',
      topLineColor: '#089981',
      topLineWidth: 2,
      topFillColor1: 'rgba(8, 153, 129, 0.28)',
      topFillColor2: 'rgba(8, 153, 129, 0.05)',
      bottomLineColor: '#f23645',
      bottomLineWidth: 2,
      bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
      bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
      baseLevelPercentage: 50,
    })
    expect(dark.symbol).toEqual({
      session: 'regular',
      preMarketColor: 'rgba(255, 152, 0, 0.08)',
      postMarketColor: 'rgba(41, 98, 255, 0.08)',
      nightColor: 'rgba(213, 0, 249, 0.08)',
      precision: 'default',
    })
    expect(dark.statusLine).toMatchObject({ logo: true, title: true, titleSource: 'name', chartValues: true, barChange: true, volume: false, lastDayChange: false, background: true, backgroundOpacity: 50 })
    expect(dark.priceLabels).toMatchObject({ noOverlappingLabels: true, plusButton: true, countdown: true, symbolValue: true, symbolLine: true, symbolLineColor: null, symbolLineWidth: 1 })
    expect(dark.timeScale).toEqual({ dayOfWeek: true, dateFormat: "dd MMM 'yy", hoursFormat: '24', keepLeftEdge: false })
    expect(dark.canvas).toMatchObject({
      backgroundType: 'solid',
      verticalGridStyle: 'dotted',
      crosshairColor: '#9c9c9c',
      crosshairStyle: 'dashed',
      crosshairWidth: 1,
      watermarkReplay: true,
      scaleTextSize: 12,
      navigationButtons: 'hover',
      marginTop: 10,
      marginBottom: 8,
      marginRight: 10,
    })
    expect(dark.events).toEqual({ sessionBreaks: false, sessionBreaksColor: CHART_FACTORY_COLORS.sessionBreaks, sessionBreaksStyle: 'dashed', sessionBreaksWidth: 1 })
  })

  it('follow a host custom palette for every color a role governs', () => {
    const custom = chartSettingsDefaults({ ...DARK_THEME, 'canvas.background': '#101820', 'series.up': '#00ff00' })
    expect(custom.canvas.background).toBe('#101820')
    expect(custom.candles.upColor).toBe('#00ff00')
    expect(custom.baseline.topFillColor1).toBe('rgba(0, 255, 0, 0.28)')
  })

  it('offer nineteen date formats', () => {
    expect(CHART_DATE_FORMATS).toHaveLength(19)
    expect(new Set(CHART_DATE_FORMATS).size).toBe(19)
  })
})

describe('the ladder', () => {
  it('layers partials over a tree leaf by leaf, later ones winning, and ignores a leaf the tree lacks', () => {
    const out = layerChartSettings(dark, { candles: { upColor: '#111111' } }, { candles: { upColor: '#222222', downColor: '#333333' } }, { nope: { a: 1 } } as never)
    expect(out.candles.upColor).toBe('#222222')
    expect(out.candles.downColor).toBe('#333333')
    expect(out.candles.wickUpColor).toBe(dark.candles.wickUpColor)
    expect('nope' in out).toBe(false)
    // The base is not touched.
    expect(dark.candles.upColor).toBe('#089981')
  })

  it('merges two partials, the second winning', () => {
    expect(mergePartialChartSettings({ canvas: { marginTop: 1, marginBottom: 2 } }, { canvas: { marginTop: 3 }, symbol: { session: 'extended' } })).toEqual({
      canvas: { marginTop: 3, marginBottom: 2 },
      symbol: { session: 'extended' },
    })
  })
})

describe('reading a partial', () => {
  it('keeps each leaf whose value its leaf can hold, and reports the rest', () => {
    const read = readPartialChartSettings({
      candles: { upColor: '#123456', downColor: 'not a color', body: 'yes' },
      canvas: { marginTop: 12, marginRight: Number.NaN, crosshairStyle: 'wavy', navigationButtons: 'always' },
      symbol: { session: 'allHours', precision: '1/32' },
      priceLabels: { symbolLineColor: null, highLowColor: '#abc' },
      priceScale: { priceToBarRatio: null },
      timeScale: { dateFormat: 'MMM d, yyyy', hoursFormat: '13' },
    })
    expect(read.settings).toEqual({
      candles: { upColor: '#123456' },
      canvas: { marginTop: 12, navigationButtons: 'always' },
      symbol: { session: 'allHours', precision: '1/32' },
      priceLabels: { symbolLineColor: null, highLowColor: '#abc' },
      priceScale: { priceToBarRatio: null },
      timeScale: { dateFormat: 'MMM d, yyyy' },
    })
    expect(read.rejected).toEqual(['candles.downColor', 'candles.body', 'canvas.marginRight', 'canvas.crosshairStyle', 'timeScale.hoursFormat'])
  })

  it('reads nothing from a value that is not a record, and ignores sections and leaves this build does not know', () => {
    expect(readPartialChartSettings(null)).toEqual({ settings: {}, rejected: [] })
    expect(readPartialChartSettings([1, 2])).toEqual({ settings: {}, rejected: [] })
    expect(readPartialChartSettings({ later: { a: 1 }, canvas: { laterLeaf: true }, candles: 'no' })).toEqual({ settings: {}, rejected: [] })
  })

  it('takes a color test from its caller', () => {
    expect(readPartialChartSettings({ candles: { upColor: 'red' } }, () => true).settings).toEqual({ candles: { upColor: 'red' } })
    expect(readPartialChartSettings({ candles: { upColor: 'red' } }).rejected).toEqual(['candles.upColor'])
  })
})

describe('the written price format', () => {
  const format = { pricescale: 100, minmov: 25 }

  it('is the symbol format by default, a decimal count, or a counted fraction', () => {
    expect(formatAtPrecision(format, 'default')).toBe(format)
    expect(formatAtPrecision(format, '0')).toEqual({ pricescale: 1, minmov: 1 })
    expect(formatAtPrecision(format, '3')).toEqual({ pricescale: 1000, minmov: 1 })
    expect(formatAtPrecision(format, '1/320')).toEqual({ pricescale: 320, minmov: 1, fractional: true })
  })
})

describe('a color at an opacity', () => {
  it('reads hex and rgb, and leaves anything else as it was', () => {
    expect(colorWithAlpha('#2962ff', 0.28)).toBe('rgba(41, 98, 255, 0.28)')
    expect(colorWithAlpha('rgba(1, 2, 3, 0.9)', 0.5)).toBe('rgba(1, 2, 3, 0.5)')
    expect(colorWithAlpha('red', 0.5)).toBe('red')
  })
})
