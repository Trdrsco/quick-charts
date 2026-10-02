// @vitest-environment happy-dom
// The range presets a host offers, on a widget mounted the way a host mounts it. A host that names
// no list gets all nine in their own order; a list it names is the whole set, in its order, so a
// preset left out has no command, the open-ended setter ignores its key, and the bottom bar draws
// no button for it. An empty list offers no preset and leaves the rest of the bar. A list the host
// got wrong is a setup error from createChart.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { RANGE_PRESETS } from '../../src/ranges'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 1_700_000_000 + index * 60, o: 100 + index, h: 101 + index, l: 99 + index, c: 100 + index, v: 10 }))
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
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
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

const rangeCommands = (widget: ChartWidget): string[] =>
  widget.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.range.') && id !== 'chart.range.set')
const chips = (container: HTMLElement): string[] => [...container.querySelectorAll('.qc-bottombar .qc-range-chip')].map((chip) => chip.textContent ?? '')

describe('ranges: setup', () => {
  it('is a setup error for a non-list, a key that names no preset and a repeated key', () => {
    expect(() => mount({ ranges: '1D' as never })).toThrow(TypeError)
    expect(() => mount({ ranges: ['1D', '2D'] })).toThrow(/"2D", which is not a range preset/)
    expect(() => mount({ ranges: ['1d'] })).toThrow(/"1d"/)
    expect(() => mount({ ranges: [1 as never] })).toThrow(TypeError)
    expect(() => mount({ ranges: ['YTD', '1Y', 'YTD'] })).toThrow(/"YTD" more than once/)
    // Checked with the bottom bar off: a list the host got wrong is wrong either way.
    expect(() => mount({ ranges: ['2D'], ui: { bottomBar: false } })).toThrow(TypeError)
  })

  it('offers all nine in their own order when omitted, as before', async () => {
    const { widget, container } = mount()
    await settle()
    expect(chips(container)).toEqual(RANGE_PRESETS.map((preset) => preset.key))
    expect(rangeCommands(widget)).toEqual(RANGE_PRESETS.map((preset) => `chart.range.${preset.key}`))
  })
})

describe('the range presets a widget offers', () => {
  it('are the list the host names, in its order: the chips and the commands follow it', async () => {
    const { widget, container } = mount({ ranges: ['1Y', '1D', 'YTD'] })
    await settle()
    expect(chips(container)).toEqual(['1Y', '1D', 'YTD'])
    expect(rangeCommands(widget).sort()).toEqual(['chart.range.1D', 'chart.range.1Y', 'chart.range.YTD'])
    expect(widget.commands.execute('chart.range.5D').kind).toBe('unknown')
  })

  it('frame from a chip and the setter, and the setter ignores a key left out', async () => {
    const { widget, container } = mount({ ranges: ['1D', '5D'] })
    await settle()
    const chart = widget.activeChart()
    // The setter runs once the chart shows a window.
    chart.setVisibleRange({ from: bars[10]!.t, to: bars[30]!.t })
    expect(widget.commands.execute('chart.range.set', '1M').kind).toBe('ok')
    expect(chart.rangePreset()).toBeNull()
    expect(chart.timeframe()).toBe('1m')
    widget.commands.execute('chart.range.set', '5D')
    expect(chart.rangePreset()).toBe('5D')
    expect(chart.timeframe()).toBe('5m')
    container.querySelector<HTMLButtonElement>('.qc-range-chip')!.click()
    expect(chart.rangePreset()).toBe('1D')
  })

  it('offer none with an empty list, and keep the clock, the timezone picker and an explicit window', async () => {
    const { widget, container } = mount({ ranges: [] })
    await settle()
    expect(chips(container)).toEqual([])
    expect(rangeCommands(widget)).toEqual([])
    expect(container.querySelector('.qc-bottombar')).not.toBeNull()
    expect(container.querySelector('.qc-bottombar .qc-tz-trigger')).not.toBeNull()
    expect(container.querySelector('.qc-bottombar .qc-clock')).not.toBeNull()
    const chart = widget.activeChart()
    chart.setVisibleRange({ from: bars[5]!.t, to: bars[35]!.t })
    expect(widget.commands.execute('chart.range.set', '1D').kind).toBe('ok')
    expect(chart.rangePreset()).toBeNull()
    expect(widget.commands.execute('chart.range.set', { from: bars[10]!.t, to: bars[30]!.t }).kind).toBe('ok')
    expect(chart.visibleRange()).toEqual({ from: bars[10]!.t, to: bars[30]!.t })
  })

  it('stand apart from ui.bottomBar: false, which removes the bar and leaves the offered commands', async () => {
    const { widget, container } = mount({ ranges: ['1D'], ui: { bottomBar: false } })
    await settle()
    expect(container.querySelector('.qc-bottombar')).toBeNull()
    expect(rangeCommands(widget)).toEqual(['chart.range.1D'])
  })
})
