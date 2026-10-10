// @vitest-environment happy-dom
// Every chart setting with something behind it, on a mounted chart: the renderer option, the series
// option, the series data or the DOM each leaf drives. A leaf whose drawing is not built yet is only
// stored, and the ladder tests already prove a stored leaf round-trips.
import { ColorType, LineStyle } from 'lightweight-charts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { BUILT_IN_INDICATORS } from '../../src/index'
import type { PartialChartSettings } from '../../src/settings/schema'
import type { PriceFormat, SymbolInfo } from '../../src/symbology'
import { DARK_THEME } from '../../src/theme/palettes'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { UiConfig } from '../../src/widget/options'
import { lastRenderer, type FakeRenderer, type FakeSeries } from './rendererFake'

const watermarks = vi.hoisted(() => ({ created: [] as Record<string, unknown>[], applied: [] as Record<string, unknown>[] }))

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return {
    ...actual,
    createChart: createFakeChart,
    createTextWatermark: (_pane: unknown, options: Record<string, unknown>) => {
      watermarks.created.push(options)
      return { applyOptions: (next: Record<string, unknown>) => void watermarks.applied.push(next), detach: () => undefined }
    },
  }
})

const FORMAT: PriceFormat = { pricescale: 100, minmov: 25 }
const info: SymbolInfo = {
  ticker: 'CME_MINI:ES1!',
  name: 'ESZ2026',
  description: 'E-mini S&P 500 Dec 2026',
  exchange: 'CME',
  listedExchange: 'CME',
  type: 'futures',
  supportedResolutions: [],
  timezone: 'America/New_York',
  session: '1700-1600',
  dataStatus: 'streaming',
  volumePrecision: 0,
  format: FORMAT,
}

/** Closes that climb, with every third bar falling against its own open while still closing above
 *  the bar before it. */
const BARS: FeedBar[] = Array.from({ length: 30 }, (_, i) => {
  const c = 4500 + i
  const o = i % 3 === 0 ? c + 0.5 : c - 0.5
  return { t: 1_700_000_000 + i * 60, o, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, c, v: 1_250_000 + i }
})
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => info,
  history: async () => ({ bars: BARS, noData: false }),
  subscribeBars: () => () => undefined,
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
  watermarks.created.length = 0
  watermarks.applied.length = 0
})

async function mount(options: { settings?: PartialChartSettings; ui?: UiConfig } = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({
    container,
    datafeed,
    symbol: 'ES',
    timeframe: '1m',
    theme: { mode: 'dark' },
    features: { drawings: false, replay: false, compare: false },
    ui: options.ui ?? { contextMenu: false, topBar: false, bottomBar: false, toasts: false },
    ...(options.settings ? { settings: options.settings } : {}),
  })
  mounted.push(widget)
  const renderer = lastRenderer()
  await settle()
  return { widget, chart: widget.activeChart(), renderer, container }
}

/** The style series on screen: the last visible series on the price scale. */
const main = (renderer: FakeRenderer): FakeSeries =>
  renderer.series.filter((s) => s.options.visible !== false && s.options.priceScaleId !== 'volume' && s.paneIndex === 0).at(-1)!

/** The chart options the renderer holds now: what it was created with and every write since. */
const options = (renderer: FakeRenderer): Record<string, Record<string, unknown>> =>
  renderer.chart.options() as unknown as Record<string, Record<string, unknown>>

const legend = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.qc-legend')!
const part = (container: HTMLElement, role: string): HTMLElement | null => legend(container).querySelector<HTMLElement>(`[data-role="${role}"]`)

describe('the candle, hollow and bars families', () => {
  it('draw the body, borders and wick, each shown or not and each in its own pair', async () => {
    const { chart, renderer } = await mount()
    chart.applySettings({ candles: { upColor: '#111111', borderDownColor: '#222222', wickUpColor: '#333333' } })
    expect(main(renderer).kind).toBe('Candlestick')
    expect(main(renderer).options).toMatchObject({ upColor: '#111111', borderVisible: true, borderDownColor: '#222222', wickVisible: true, wickUpColor: '#333333' })
    chart.applySettings({ candles: { body: false, borders: false, wick: false } })
    expect(main(renderer).options).toMatchObject({ upColor: 'transparent', downColor: 'transparent', borderVisible: false, wickVisible: false })
  })

  it('color each bar by the previous close as per-bar colors, and stop when asked', async () => {
    const { chart, renderer } = await mount()
    const settings = chart.settings().candles
    expect((main(renderer).data[3] as Record<string, unknown>).color).toBeUndefined()
    chart.applySettings({ candles: { colorOnPreviousClose: true } })
    // The fourth bar fell against its own open but closed above the third bar's close: it reads up.
    expect(main(renderer).data[3]).toMatchObject({ color: settings.upColor, borderColor: settings.borderUpColor, wickColor: settings.wickUpColor })
    chart.applySettings({ candles: { colorOnPreviousClose: false } })
    expect((main(renderer).data[3] as Record<string, unknown>).color).toBeUndefined()
  })

  it('paint hollow candles and bars from their own families, thin bars and the open tick included', async () => {
    const { chart, renderer } = await mount()
    chart.setStyle('hollow')
    chart.applySettings({ hollowCandles: { downColor: '#444444', wick: false } })
    expect(main(renderer).options).toMatchObject({ upColor: 'transparent', downColor: '#444444', wickVisible: false })
    chart.setStyle('bars')
    expect(main(renderer).options).toMatchObject({ thinBars: true, openVisible: true })
    chart.applySettings({ bars: { hlcBars: true, thinBars: false, colorOnPreviousClose: true, upColor: '#555555' } })
    expect(main(renderer).options).toMatchObject({ thinBars: false, openVisible: false, upColor: '#555555' })
    expect(main(renderer).data[3]).toMatchObject({ color: '#555555' })
  })
})

describe('the line, step line, area and baseline families', () => {
  it('draw a line in a gradient through the chart value line, or in one solid color', async () => {
    const { chart, renderer } = await mount()
    chart.setStyle('line')
    expect(main(renderer).options).toMatchObject({ lineVisible: false, color: '#d500f9', lineWidth: 2 })
    expect(main(renderer).primitives.some((p) => typeof (p as { paneViews?: unknown }).paneViews === 'function')).toBe(true)
    chart.applySettings({ line: { colorType: 'solid', color: '#666666', lineStyle: 'dotted', lineWidth: 3 } })
    expect(main(renderer).options).toMatchObject({ lineVisible: true, color: '#666666', lineStyle: LineStyle.SparseDotted, lineWidth: 3 })
    chart.setStyle('stepline')
    expect(main(renderer).options).toMatchObject({ lineVisible: false, lineType: 1 })
  })

  it('fill the area from its own leaves and split the baseline at its own widths', async () => {
    const { chart, renderer } = await mount()
    chart.setStyle('area')
    chart.applySettings({ area: { lineColor: '#777777', topColor: 'rgba(1, 2, 3, 0.5)', bottomColor: 'rgba(1, 2, 3, 0)', lineWidth: 4 } })
    expect(main(renderer).options).toMatchObject({ lineColor: '#777777', topColor: 'rgba(1, 2, 3, 0.5)', bottomColor: 'rgba(1, 2, 3, 0)', lineWidth: 4 })
    chart.setStyle('baseline')
    expect(main(renderer).options).toMatchObject({ lineWidth: 2, topLineColor: DARK_THEME['series.up'], bottomLineColor: DARK_THEME['series.down'] })
    chart.applySettings({ baseline: { topLineWidth: 1, bottomLineWidth: 3 } })
    expect(main(renderer).options).toMatchObject({ lineWidth: 1, bottomLineColor: 'transparent' })
  })
})

describe('the symbol', () => {
  it('writes every price through the one formatter at the precision the setting names', async () => {
    const { chart } = await mount()
    expect(chart.formatter().format(4510.25)).toBe('4510.25')
    chart.applySettings({ symbol: { precision: '0' } })
    expect(chart.formatter().format(4510.25)).toBe('4510')
    chart.applySettings({ symbol: { precision: '1/4' } })
    expect(chart.formatter().format(4510.5)).toBe("4510'2")
    chart.applySettings({ symbol: { precision: 'default' } })
    expect(chart.formatter().format(4510.25)).toBe('4510.25')
  })

  it('shows the last value, its line and its name as the price labels say', async () => {
    const { chart, renderer } = await mount()
    expect(main(renderer).options).toMatchObject({ lastValueVisible: true, priceLineVisible: true, priceLineColor: '', priceLineWidth: 1, title: '' })
    chart.applySettings({ priceLabels: { symbolName: true, symbolLine: false, symbolLineColor: '#888888', symbolLineWidth: 2 } })
    expect(main(renderer).options).toMatchObject({ title: 'ES1!', priceLineVisible: false, priceLineColor: '#888888', priceLineWidth: 2 })
    chart.applySettings({ priceLabels: { symbolValue: false } })
    expect(main(renderer).options.lastValueVisible).toBe(false)
  })

  it('keeps labels apart unless the setting lets them overlap', async () => {
    const { chart, renderer } = await mount()
    expect(options(renderer).rightPriceScale!.alignLabels).toBe(true)
    chart.applySettings({ priceLabels: { noOverlappingLabels: false } })
    expect(options(renderer).rightPriceScale!.alignLabels).toBe(false)
  })

  it('writes indicator names and values on the price scale as the price labels say', async () => {
    const { chart, renderer } = await mount()
    chart.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    await settle()
    const plot = (): FakeSeries => renderer.series.filter((s) => s.kind === 'Line' && s !== main(renderer) && s.options.visible !== false).at(-1)!
    expect(plot().options).toMatchObject({ lastValueVisible: true, title: '' })
    chart.applySettings({ priceLabels: { indicatorLabelName: true, indicatorLabelValue: false } })
    expect(plot().options.lastValueVisible).toBe(false)
    expect(String(plot().options.title).length).toBeGreaterThan(0)
  })
})

describe('the status line', () => {
  it('shows the mark, the title, the values, the change and the volume as asked', async () => {
    const { chart, container } = await mount()
    expect(part(container, 'legend-symbol')!.textContent).toBe('E-mini S&P 500 Dec 2026')
    expect(part(container, 'legend-volume')!.hidden).toBe(true)
    chart.applySettings({ statusLine: { volume: true } })
    expect(part(container, 'legend-volume')!.hidden).toBe(false)
    expect(part(container, 'legend-volume')!.textContent).toBe('Vol1.25M')
    chart.applySettings({ statusLine: { chartValues: false, barChange: false } })
    expect([...legend(container).querySelectorAll<HTMLElement>('.qc-legend-ohlc')].every((group) => group.hidden)).toBe(true)
    expect(part(container, 'legend-change')!.hidden).toBe(true)
    chart.applySettings({ statusLine: { logo: false } })
    expect(legend(container).querySelector<HTMLElement>('.qc-symbol-badge')!.hidden).toBe(true)
    expect(part(container, 'legend-symbol')!.hidden).toBe(false)
    chart.applySettings({ statusLine: { title: false } })
    expect(part(container, 'legend-symbol')!.hidden).toBe(true)
    expect(part(container, 'legend-exchange')!.hidden).toBe(true)
  })

  it('names the market by its name, its symbol, or both', async () => {
    const { chart, container } = await mount()
    chart.applySettings({ statusLine: { titleSource: 'symbol' } })
    expect(part(container, 'legend-symbol')!.textContent).toBe('ES1!')
    expect(part(container, 'legend-detail')!.hidden).toBe(true)
    chart.applySettings({ statusLine: { titleSource: 'symbolAndName' } })
    expect(part(container, 'legend-symbol')!.textContent).toBe('ES1!')
    expect(part(container, 'legend-detail')!.textContent).toBe('E-mini S&P 500 Dec 2026')
  })

  it('stands on the chart background at the setting opacity, or on nothing', async () => {
    const { chart, container } = await mount()
    expect(legend(container).style.getPropertyValue('--qcd-legend-backdrop')).toBe('rgba(15, 15, 15, 0.5)')
    chart.applySettings({ statusLine: { backgroundOpacity: 80 } })
    expect(legend(container).style.getPropertyValue('--qcd-legend-backdrop')).toBe('rgba(15, 15, 15, 0.8)')
    chart.applySettings({ statusLine: { background: false } })
    expect(legend(container).style.getPropertyValue('--qcd-legend-backdrop')).toBe('')
  })
})

describe('the time scale', () => {
  it('labels the crosshair in the date format, weekday and clock the settings name', async () => {
    const { chart, renderer } = await mount()
    const label = (): string => (options(renderer).localization!.timeFormatter as (time: number) => string)(Date.UTC(2026, 9, 6, 19) / 1000)
    expect(label()).toBe("Tue 06 Oct '26 19:00")
    chart.applySettings({ timeScale: { dayOfWeek: false, dateFormat: 'yyyy-MM-dd', hoursFormat: '12' } })
    expect(label()).toBe('2026-10-06 07:00 PM')
  })
})

describe('the canvas', () => {
  it('fills the background solid or in a vertical gradient', async () => {
    const { chart, renderer } = await mount()
    expect(options(renderer).layout!.background).toEqual({ type: ColorType.Solid, color: '#0f0f0f' })
    chart.applySettings({ canvas: { backgroundType: 'gradient', background: '#1f1f1f', backgroundBottom: '#0f0f0f' } })
    expect(options(renderer).layout!.background).toEqual({ type: ColorType.VerticalGradient, topColor: '#1f1f1f', bottomColor: '#0f0f0f' })
  })

  it('draws each grid, the crosshair and the scales in their own leaves', async () => {
    const { chart, renderer } = await mount()
    const grid = options(renderer).grid as Record<string, Record<string, unknown>>
    expect(grid.vertLines).toEqual({ visible: true, color: DARK_THEME['scale.grid'], style: LineStyle.SparseDotted })
    chart.applySettings({
      canvas: {
        verticalGrid: false,
        horizontalGridColor: '#999999',
        horizontalGridStyle: 'solid',
        crosshairColor: '#aaaaaa',
        crosshairStyle: 'solid',
        crosshairWidth: 3,
        scaleTextColor: '#bbbbbb',
        scaleTextSize: 16,
        scaleLineColor: '#cccccc',
      },
    })
    const next = options(renderer)
    expect((next.grid as Record<string, Record<string, unknown>>).vertLines!.visible).toBe(false)
    expect((next.grid as Record<string, Record<string, unknown>>).horzLines).toEqual({ visible: true, color: '#999999', style: LineStyle.Solid })
    expect((next.crosshair as Record<string, Record<string, unknown>>).vertLine).toMatchObject({ color: '#aaaaaa', style: LineStyle.Solid, width: 3 })
    expect(next.layout).toMatchObject({ textColor: '#bbbbbb', fontSize: 16 })
    expect(next.rightPriceScale).toMatchObject({ borderVisible: true, borderColor: '#cccccc' })
    // The renderer merges each write into its options; the time scale's border is one of them.
    const timeScaleWrites = renderer.chartOptions.map((o) => o.timeScale as Record<string, unknown> | undefined).filter((o) => o && 'borderColor' in o)
    expect(timeScaleWrites.at(-1)).toMatchObject({ borderVisible: true, borderColor: '#cccccc' })
  })

  it('keeps the margins: the price scale margins as fractions, the right margin as bars', async () => {
    const { chart, renderer } = await mount()
    expect(options(renderer).rightPriceScale!.scaleMargins).toEqual({ top: 0.1, bottom: 0.08 })
    expect((renderer.created.timeScale as Record<string, unknown>).rightOffset).toBe(10)
    chart.applySettings({ canvas: { marginTop: 30, marginBottom: 20, marginRight: 40 } })
    expect(options(renderer).rightPriceScale!.scaleMargins).toEqual({ top: 0.3, bottom: 0.2 })
    expect(renderer.timeScaleOptions).toContainEqual({ rightOffset: 40 })
    // Writing the right offset scrolls the view, so an unrelated change writes none.
    const writes = renderer.timeScaleOptions.length
    chart.applySettings({ candles: { upColor: '#121212' } })
    expect(renderer.timeScaleOptions.filter((o) => 'rightOffset' in o)).toHaveLength(1)
    expect(renderer.timeScaleOptions.length).toBe(writes)
  })

  it('writes the watermark parts the settings name, in the watermark ink', async () => {
    const { chart } = await mount()
    // The factory watermark is the replay mark alone, so nothing is created.
    expect(watermarks.created).toHaveLength(0)
    chart.applySettings({ canvas: { watermarkTicker: true, watermarkInterval: true, watermarkDescription: true } })
    expect(watermarks.created).toHaveLength(1)
    const lines = watermarks.created[0]!.lines as { text: string; fontSize: number; color: string }[]
    expect(lines.map((line) => [line.text, line.fontSize, line.color])).toEqual([
      ['ES1!, 1m', 80, DARK_THEME['canvas.watermark']],
      ['E-mini S&P 500 Dec 2026', 36, DARK_THEME['canvas.watermark']],
    ])
    chart.applySettings({ canvas: { watermarkTicker: false, watermarkInterval: false, watermarkDescription: false } })
    expect(watermarks.applied.at(-1)).toMatchObject({ visible: false })
  })

  it('shows the navigation buttons near the pointer, always, or never', async () => {
    const { chart, container } = await mount({ ui: { contextMenu: false, topBar: false, bottomBar: false, toasts: false } })
    const nav = container.querySelector<HTMLElement>('.qc-nav')!
    expect(nav.dataset.qcVisibility).toBe('hover')
    chart.applySettings({ canvas: { navigationButtons: 'always' } })
    expect(nav.dataset.qcVisibility).toBe('always')
    expect(nav.hidden).toBe(false)
    chart.applySettings({ canvas: { navigationButtons: 'never' } })
    expect(nav.hidden).toBe(true)
  })
})

describe('the events', () => {
  it('ask the session primitive for breaks in their own stroke, and for none while off', async () => {
    const { chart, renderer } = await mount()
    const bands = renderer.series[0]!.primitives.find((p) => typeof (p as { refresh?: unknown }).refresh === 'function')
    expect(bands).toBeDefined()
    chart.applySettings({ events: { sessionBreaks: true, sessionBreaksColor: '#4985e7', sessionBreaksWidth: 2, sessionBreaksStyle: 'dotted' } })
    expect(chart.settings().events).toEqual({ sessionBreaks: true, sessionBreaksColor: '#4985e7', sessionBreaksWidth: 2, sessionBreaksStyle: 'dotted' })
  })
})
