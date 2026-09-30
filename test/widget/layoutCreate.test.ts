// @vitest-environment happy-dom
// Creating a layout: one chart on the market and interval on screen, with none of the open layout's
// studies, saved under the name it was given, while the layout that was open keeps what it saved.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memorySaveLoadAdapter } from '../../src/resources'
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
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('creating a layout', () => {
  it('starts one chart on the market on screen, saves it by its name, and leaves the open layout as saved', async () => {
    const saveLoad = memorySaveLoadAdapter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '5m', ...QUIET, saveLoad, layout: { arrangement: '2v' } })
    mounted.push(widget)
    await settle()
    const sma = BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!
    widget.activeChart().indicators.add({ id: 'sma-1', definition: sma })
    await widget.layout.saveLoad.save('Desk')
    const desk = widget.layout.saveLoad.current()!.ref
    expect(widget.commands.available('widget.layout.create')).toBe(true)

    widget.commands.execute('widget.layout.create', 'Swing')
    await settle()
    const open = widget.layout.saveLoad.current()!
    expect(open.name).toBe('Swing')
    expect(open.ref.id).not.toBe(desk.id)
    expect(widget.layout.arrangement()).toBe('s')
    expect(widget.charts()).toHaveLength(1)
    expect(widget.activeChart().symbol()).toBe('ES')
    expect(widget.activeChart().timeframe()).toBe('5m')
    expect(widget.activeChart().indicators.get()).toEqual([])

    // The layout that was open still holds its two charts and its study.
    const kept = await saveLoad.layouts.load(desk.id)
    expect(kept).not.toBeNull()
    const content = JSON.parse(kept!.body.content) as { charts: { content: string }[] }
    expect(content.charts).toHaveLength(2)
    expect(content.charts.some((c) => (JSON.parse(c.content) as { indicators: unknown[] }).indicators.length === 1)).toBe(true)
  })

  it('needs a name', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '5m', ...QUIET, saveLoad: memorySaveLoadAdapter() })
    mounted.push(widget)
    await settle()
    widget.commands.execute('widget.layout.create', '   ')
    await settle()
    expect(widget.layout.saveLoad.current()).toBeNull()
  })
})
