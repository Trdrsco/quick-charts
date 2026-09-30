// The saved-chart blob's appearance field, which is the difference between a chart that follows the
// app's theme and one frozen at the look it happened to have the first time it autosaved. The
// format functions are pure over their arguments, so the contract is testable without a chart.
import { describe, expect, it } from 'vitest'
import { CHART_CONTENT_VERSION, parseChartContent, serializeChartContent, type ChartContent } from '../../src/widget/saveLoad'

const base: ChartContent = {
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '1m',
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  appearance: {},
  compares: [],
  ext: {},
}

describe('saved chart content: appearance', () => {
  it('carries an empty authored layer for a chart nobody restyled', () => {
    const parsed = parseChartContent(serializeChartContent(base))
    expect(parsed.appearance).toEqual({})
    expect(parsed.symbol).toBe('BINANCE:BTCUSDT')
  })

  it('states an empty choice set outright, so a body that states none is an incomplete one', () => {
    expect(JSON.parse(serializeChartContent({ ...base, appearance: {} })).appearance).toEqual({})
  })

  it('round-trips the leaves a viewer picked, and only those', () => {
    const parsed = parseChartContent(serializeChartContent({ ...base, appearance: { upColor: '#112233' } }))
    expect(parsed.appearance).toEqual({ upColor: '#112233' })
  })

  it('drops the appearance of a resolved-tree blob, whose leaves do not say who chose them', () => {
    const legacy = JSON.stringify({
      v: 3,
      symbol: 'BINANCE:BTCUSDT',
      tf: '5m',
      style: 'candles',
      scale: 'normal',
      appearance: { background: '#ece7c0', upColor: '#26a69a', downColor: '#ffa726' },
      compares: [],
      ext: {},
    })
    const parsed = parseChartContent(legacy)
    expect(parsed.appearance).toBeUndefined()
    // Everything else the blob states still restores, and a format that carried no instance list
    // reads back as a chart with no studies rather than as a refusal.
    expect(parsed.timeframe).toBe('5m')
    expect(parsed.indicators).toEqual([])
  })

  it('refuses a version this build does not know', () => {
    expect(() => parseChartContent(JSON.stringify({ v: CHART_CONTENT_VERSION + 1 }))).toThrow(/unsupported chart content version/)
    expect(() => parseChartContent(JSON.stringify({ v: 2 }))).toThrow(/unsupported chart content version/)
  })
})
