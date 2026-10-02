// @vitest-environment happy-dom
// Viewer state Quick Charts 1.x saved opens in this build. The fixture is what 1.3.0 wrote: a
// layout whose timeframe sync switch is named `interval`, and a drawing preference record whose
// per-group toolbar tools sit under `railTools`. Each is read under its 1.x name where the current
// name is absent, and the next write states the current name alone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import saved from '../fixtures/saved-1.x.json'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { drawingTools, parseDrawingPreferences, serializeDrawingPreferences } from '../../src/drawings/index'
import { memoryChartStorage } from '../../src/storage'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '5m', features: { replay: false, sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

/** The sync switches the 1.x layout states, under the names this build uses. */
const SAVED_SYNC = { symbol: false, timeframe: true, crosshair: true, time: false, dateRange: false }
/** The per-group toolbar tools the 1.x record states. */
const SAVED_TOOLBAR_TOOLS = { trend: 'ray', 'fib-gann': 'fib_channel' }

describe('a layout Quick Charts 1.x saved', () => {
  it('names its timeframe sync switch interval', () => {
    expect(JSON.parse(saved.layout).sync).toEqual({ symbol: false, interval: true, crosshair: true, time: false, dateRange: false })
  })

  it('opens with every switch as it was saved', async () => {
    const { widget } = mount()
    widget.layout.restore(saved.layout)
    await settle()
    expect(widget.layout.arrangement()).toBe('2h')
    expect(widget.charts().map((chart) => chart.symbol())).toEqual(['ES', 'NQ'])
    expect(widget.layout.sync()).toEqual(SAVED_SYNC)
  })

  it('replays a timeframe change across its charts, as the saved switch says', async () => {
    const { widget } = mount()
    widget.layout.restore(saved.layout)
    await settle()
    widget.charts()[0]!.setTimeframe('15m')
    await settle()
    expect(widget.charts().map((chart) => chart.timeframe())).toEqual(['15m', '15m'])
  })

  it('saves again under the current switch name alone', async () => {
    const { widget } = mount()
    widget.layout.restore(saved.layout)
    await settle()
    const sync = JSON.parse(widget.layout.serialize().content).sync as Record<string, unknown>
    expect(sync).toEqual(SAVED_SYNC)
    expect(Object.keys(sync)).not.toContain('interval')
  })

  it('reads the current name over the 1.x one when a blob states both', async () => {
    const both = JSON.parse(saved.layout) as { sync: Record<string, boolean> }
    both.sync = { ...both.sync, timeframe: false, interval: true }
    const { widget } = mount()
    widget.layout.restore(JSON.stringify(both))
    await settle()
    expect(widget.layout.sync().timeframe).toBe(false)
  })

  it('takes the 1.x name from saved content alone: a caller setting interval moves no switch and saves none', async () => {
    const { widget } = mount({ layout: { arrangement: '2h' } })
    await settle()
    expect(widget.commands.execute('widget.layout.setSync', { interval: true }).kind).toBe('ok')
    expect(widget.layout.sync()).toEqual({ symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false })
    expect(Object.keys(JSON.parse(widget.layout.serialize().content).sync)).toEqual(['symbol', 'timeframe', 'crosshair', 'time', 'dateRange'])
  })
})

describe('a drawing preference record Quick Charts 1.x saved', () => {
  it('reads its per-group toolbar tools from railTools', () => {
    const read = parseDrawingPreferences(saved.drawingPreferences.value)
    expect(read.drawingToolbarTools).toEqual(SAVED_TOOLBAR_TOOLS)
    expect(read.cursor).toBe('dot')
  })

  it('writes them back under drawingToolbarTools alone', () => {
    const written = JSON.parse(serializeDrawingPreferences(parseDrawingPreferences(saved.drawingPreferences.value))) as Record<string, unknown>
    expect(written.drawingToolbarTools).toEqual(SAVED_TOOLBAR_TOOLS)
    expect(Object.keys(written)).not.toContain('railTools')
  })

  it('opens a chart from its storage, faces the trend group with the saved tool, and the next write states the current name', async () => {
    const { key, value } = saved.drawingPreferences
    const storage = memoryChartStorage({ [key]: value })
    const { widget, container } = mount({ storage })
    await settle()
    const chart = widget.activeChart()
    expect(chart.drawingPreferences().drawingToolbarTools).toEqual(SAVED_TOOLBAR_TOOLS)
    const trendFace = container.querySelector<HTMLButtonElement>('button[aria-label="Trend tools menu"]')!.closest('.qc-drawing-cell')!.querySelector<HTMLButtonElement>('.qc-drawing-toolbar-button')!
    expect(trendFace.getAttribute('aria-label')).toBe(drawingTools.get('ray')!.name)
    chart.setDrawingPreferences({ ...chart.drawingPreferences(), cursor: 'arrow' })
    const stored = JSON.parse(storage.get(key)!) as Record<string, unknown>
    expect(stored.drawingToolbarTools).toEqual(SAVED_TOOLBAR_TOOLS)
    expect(Object.keys(stored)).not.toContain('railTools')
  })
})
