// @vitest-environment happy-dom
// The viewer's own choices about saving are not layout content. Switching autosave keeps the choice
// in the host's store and raises no save-needed, so it neither dirties the layout nor rebuilds an
// open layouts menu; a change to the chart itself still raises one.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memorySaveLoadAdapter } from '../../src/resources'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { fakeRenderer, lastRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

void fakeRenderer
void lastRenderer

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}
const QUIET = {
  features: { drawings: false, replay: false, sessions: false, compare: false },
  ui: { contextMenu: false, navigation: false, topBar: false, bottomBar: false, toasts: false },
} as const

const mounted: ChartWidget[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

function mountWidget(storage: ChartStorage): ChartWidget {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', ...QUIET, storage, saveLoad: memorySaveLoadAdapter() })
  mounted.push(widget)
  return widget
}

describe('the viewer choosing whether to autosave', () => {
  it('keeps the choice and raises no save-needed, where a chart change still raises one', async () => {
    vi.useFakeTimers()
    const storage = memoryChartStorage()
    const widget = mountWidget(storage)
    await vi.advanceTimersByTimeAsync(2000)
    const needed = vi.fn()
    widget.on('saveNeeded', needed)
    widget.commands.execute('widget.layout.autosave', false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(storage.get('quickcharts.layoutAutosave.v1')).toBe('false')
    expect(needed).not.toHaveBeenCalled()
    widget.activeChart().applySettings({ candles: { upColor: '#ffffff' } })
    await vi.advanceTimersByTimeAsync(2000)
    expect(needed).toHaveBeenCalledTimes(1)
  })
})
