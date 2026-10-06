// @vitest-environment happy-dom
// A chart with no price scale: `ui.priceScale: false` hides the scale at the plot's right, so the
// bars span the chart's whole width, and the last price draws no line across the plot and no label,
// on the series the chart opens with and on every series a style change puts in its place. The
// scale is shown by default.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { UiConfig } from '../../src/widget/options'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import { lastRenderer, renderers, type FakeRenderer, type FakeSeries } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  renderers.splice(0)
  document.body.replaceChildren()
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 60 * (index + 1), o: 10 + index, h: 11 + index, l: 9 + index, c: 10 + index, v: index + 1 }))
const datafeed = (): ChartDatafeed => ({
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
})
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function mount(ui?: UiConfig): Promise<{ widget: ChartWidget; renderer: FakeRenderer }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', ...(ui ? { ui } : {}) })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return { widget, renderer: lastRenderer() }
}

/** The one series of a kind on the chart: the series a style draws its bars or closes in. */
const seriesOf = (renderer: FakeRenderer, kind: string): FakeSeries => {
  const found = renderer.series.filter((s) => s.kind === kind)
  expect(found, kind).toHaveLength(1)
  return found[0]!
}

/** Whether the last price draws its line across the plot and its label on the scale. */
const lastPrice = (series: FakeSeries): { line: boolean; label: boolean } => ({
  line: series.options.priceLineVisible !== false,
  label: series.options.lastValueVisible !== false,
})

const scaleShown = (renderer: FakeRenderer): unknown => (renderer.created.rightPriceScale as { visible?: unknown }).visible

describe('resolving the planes', () => {
  it('shows the price scale unless the host hides it', () => {
    expect(resolveUi(undefined, resolveFeatures()).priceScale).toBe(true)
    expect(resolveUi({ priceScale: true }, resolveFeatures()).priceScale).toBe(true)
    expect(resolveUi({ priceScale: false }, resolveFeatures()).priceScale).toBe(false)
  })
})

describe('a mounted chart', () => {
  it('shows its price scale and the last price on it by default', async () => {
    const { renderer } = await mount()
    expect(scaleShown(renderer)).toBe(true)
    expect(lastPrice(seriesOf(renderer, 'Candlestick'))).toEqual({ line: true, label: true })
  })

  it('hides the scale, and the last price draws no line and no label', async () => {
    const { renderer } = await mount({ priceScale: false })
    expect(scaleShown(renderer)).toBe(false)
    expect(lastPrice(seriesOf(renderer, 'Candlestick'))).toEqual({ line: false, label: false })
  })

  it('keeps the last price off the series a style change puts in place', async () => {
    const { widget, renderer } = await mount({ priceScale: false })
    expect(widget.commands.execute('chart.style.area').kind).toBe('ok')
    expect(renderer.series.some((s) => s.kind === 'Candlestick')).toBe(false)
    expect(lastPrice(seriesOf(renderer, 'Area'))).toEqual({ line: false, label: false })

    const shown = await mount()
    expect(shown.widget.commands.execute('chart.style.area').kind).toBe('ok')
    expect(lastPrice(seriesOf(shown.renderer, 'Area'))).toEqual({ line: true, label: true })
  })
})
