// @vitest-environment happy-dom
// The saved-chart blob's settings field, which is the difference between a chart that follows the
// host's theme and one frozen at the look it happened to have the first time it autosaved, and the
// reader that upgrades the format before it. The format functions are pure over their arguments,
// so the contract is testable without a chart.
import { describe, expect, it } from 'vitest'
import { CHART_CONTENT_VERSION, parseChartContent, serializeChartContent, type ChartContent } from '../../src/widget/saveLoad'

const base: ChartContent = {
  symbol: 'BINANCE:BTCUSDT',
  timeframe: '1m',
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  settings: {},
  compares: [],
  ext: {},
}

/** A blob of the format before this one: its viewer's look was an `appearance` partial. */
const appearanceBlob = (appearance: unknown): string =>
  JSON.stringify({ v: 4, symbol: 'ES', tf: '5m', style: 'candles', scale: 'normal', axis: 'auto', indicators: [], appearance, compares: [], ext: {} })

describe('saved chart content: settings', () => {
  it('is format 5', () => {
    expect(CHART_CONTENT_VERSION).toBe(5)
    expect(JSON.parse(serializeChartContent(base)).v).toBe(5)
  })

  it('carries an empty authored record for a chart nobody restyled', () => {
    const parsed = parseChartContent(serializeChartContent(base))
    expect(parsed.settings).toEqual({})
    expect(parsed.settingsRejected).toEqual([])
    expect(parsed.symbol).toBe('BINANCE:BTCUSDT')
  })

  it('states an empty choice set outright, so a body that states none is an incomplete one', () => {
    expect(JSON.parse(serializeChartContent({ ...base, settings: {} })).settings).toEqual({})
    expect(parseChartContent(JSON.stringify({ ...JSON.parse(serializeChartContent(base)), settings: undefined })).settings).toBeUndefined()
  })

  it('round-trips the leaves a viewer picked, and only those', () => {
    const parsed = parseChartContent(serializeChartContent({ ...base, settings: { candles: { upColor: '#112233' }, timeScale: { hoursFormat: '12' } } }))
    expect(parsed.settings).toEqual({ candles: { upColor: '#112233' }, timeScale: { hoursFormat: '12' } })
  })

  it('reports a leaf it cannot hold and ignores one this build does not know', () => {
    const blob = JSON.stringify({
      ...JSON.parse(serializeChartContent(base)),
      settings: { candles: { upColor: 'not-a-color', downColor: '#010203' }, canvas: { marginTop: 'ten', laterLeaf: 1 }, laterSection: { a: 1 } },
    })
    const parsed = parseChartContent(blob)
    expect(parsed.settings).toEqual({ candles: { downColor: '#010203' } })
    expect(parsed.settingsRejected).toEqual(['candles.upColor', 'canvas.marginTop'])
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
    expect(parsed.settings).toBeUndefined()
    // Everything else the blob states still restores, and a format that carried no instance list
    // reads back as a chart with no indicators rather than as a refusal.
    expect(parsed.timeframe).toBe('5m')
    expect(parsed.indicators).toEqual([])
  })

  it('refuses a version this build does not know', () => {
    expect(() => parseChartContent(JSON.stringify({ v: CHART_CONTENT_VERSION + 1 }))).toThrow(/unsupported chart content version/)
    expect(() => parseChartContent(JSON.stringify({ v: 2 }))).toThrow(/unsupported chart content version/)
  })
})

describe('the upgrade from the appearance format', () => {
  it('reads the up and down pair into every style the pair colored, borders and wicks into the candles', () => {
    const parsed = parseChartContent(
      appearanceBlob({ upColor: '#26a69a', downColor: '#ffa726', borderUpColor: '#000000', borderDownColor: '#111111', wickUpColor: '#222222', wickDownColor: '#333333' }),
    )
    expect(parsed.settingsRejected).toEqual([])
    expect(parsed.settings).toEqual({
      candles: {
        upColor: '#26a69a',
        downColor: '#ffa726',
        borderUpColor: '#000000',
        borderDownColor: '#111111',
        wickUpColor: '#222222',
        wickDownColor: '#333333',
      },
      hollowCandles: {
        upColor: '#26a69a',
        downColor: '#ffa726',
        borderUpColor: '#26a69a',
        borderDownColor: '#ffa726',
        wickUpColor: '#26a69a',
        wickDownColor: '#ffa726',
      },
      bars: { upColor: '#26a69a', downColor: '#ffa726' },
      baseline: {
        topLineColor: '#26a69a',
        topFillColor1: 'rgba(38, 166, 154, 0.28)',
        topFillColor2: 'rgba(38, 166, 154, 0.05)',
        bottomLineColor: '#ffa726',
        bottomFillColor1: 'rgba(255, 167, 38, 0.05)',
        bottomFillColor2: 'rgba(255, 167, 38, 0.28)',
      },
    })
  })

  it('reads the background, the grid, the countdown and the session shading into their sections', () => {
    const parsed = parseChartContent(appearanceBlob({ background: '#ece7c0', grid: false, countdown: false, sessions: true }))
    expect(parsed.settings).toEqual({
      canvas: { background: '#ece7c0', verticalGrid: false, horizontalGrid: false },
      priceLabels: { countdown: false },
      symbol: { session: 'extended' },
    })
  })

  it('leaves the trading hours to the theme when the old shading was off, and upgrades an empty record to an empty one', () => {
    expect(parseChartContent(appearanceBlob({ sessions: false })).settings).toEqual({})
    expect(parseChartContent(appearanceBlob({})).settings).toEqual({})
  })

  it('reports an old leaf whose value no new leaf can hold, and treats a missing record as missing', () => {
    const parsed = parseChartContent(appearanceBlob({ background: 'not-a-color', grid: 'yes' }))
    expect(parsed.settings).toEqual({})
    expect(parsed.settingsRejected).toEqual(['canvas.background', 'canvas.verticalGrid', 'canvas.horizontalGrid'])
    expect(parseChartContent(appearanceBlob(undefined)).settings).toBeUndefined()
  })

  it('keeps every other field of the old blob', () => {
    const parsed = parseChartContent(appearanceBlob({ upColor: '#26a69a' }))
    expect(parsed.symbol).toBe('ES')
    expect(parsed.timeframe).toBe('5m')
    expect(parsed.priceAxis).toBe('auto')
  })
})
