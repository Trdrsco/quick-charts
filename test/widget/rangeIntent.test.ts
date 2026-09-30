// @vitest-environment happy-dom
// ML04 range origin: public navigation publishes once; layout mirrors and click-centering stay
// silent even when the renderer reports after its setter returns.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { renderers } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100, v: 1 })
const feed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 20 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const nextFrame = (): Promise<void> => new Promise((resolve) => window.requestAnimationFrame(() => resolve()))

afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  renderers.splice(0)
  document.body.replaceChildren()
})

describe('range intent and mirror origin', () => {
  it('owns one coalesced mirror render, releases a same-range write with no report, and preserves later intent', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v', sync: { dateRange: true } } })
    mounted.push(widget)
    await widget.ready()
    await settle()
    const [first, second] = widget.charts()
    const [, secondRenderer] = renderers
    const firstSeen: { from: number; to: number }[] = []
    const secondSeen: { from: number; to: number }[] = []
    first!.sync.onVisibleRange((range) => firstSeen.push(range))
    second!.sync.onVisibleRange((range) => secondSeen.push(range))

    vi.spyOn(secondRenderer!.chart.timeScale(), 'setVisibleRange').mockImplementation((range) => {
      secondRenderer!.timeRange = { from: range.from as number, to: range.to as number }
    })
    first!.setVisibleRange({ from: 100, to: 200 })
    expect(firstSeen).toEqual([{ from: 100, to: 200 }])
    expect(secondSeen).toEqual([])
    first!.setVisibleRange({ from: 120, to: 220 })
    secondRenderer!.fireTimeRange()
    expect(secondSeen).toEqual([])

    // LWC keeps only the last ApplyRange invalidation in one render frame. Once that frame has
    // passed, an unrelated renderer report is visible rather than consumed by a stale counter.
    await nextFrame()
    secondRenderer!.timeRange = { from: 230, to: 330 }
    secondRenderer!.fireTimeRange()
    expect(secondSeen).toEqual([{ from: 230, to: 330 }])

    // Mirroring the range already on the target produces no LWC callback. The ownership still
    // retires with its render frame, so the next independent report is not swallowed.
    first!.setVisibleRange({ from: 230, to: 330 })
    await nextFrame()
    secondRenderer!.timeRange = { from: 240, to: 340 }
    secondRenderer!.fireTimeRange()
    expect(secondSeen).toEqual([{ from: 230, to: 330 }, { from: 240, to: 340 }])

    first!.setVisibleRange({ from: 250, to: 350 })
    second!.setVisibleRange({ from: 300, to: 450 })
    secondRenderer!.fireTimeRange()
    expect(secondSeen.at(-1)).toEqual({ from: 300, to: 450 })
    expect(firstSeen).toEqual([
      { from: 100, to: 200 }, { from: 120, to: 220 }, { from: 230, to: 330 }, { from: 250, to: 350 },
    ])
  })

  it('publishes logical range, Reset and Go live intents and mirrors each accepted time range once', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v', sync: { dateRange: true } } })
    mounted.push(widget)
    await widget.ready()
    await settle()
    const [first, second] = widget.charts()
    const [renderer] = renderers
    const seen: { from: number; to: number }[] = []
    first!.sync.onVisibleRange((range) => seen.push(range))
    second!.sync.onVisibleRange((range) => seen.push(range))
    const publish = (range: { from: number; to: number }) => {
      renderer!.timeRange = range
      renderer!.fireTimeRange()
    }
    vi.spyOn(renderer!.chart.timeScale(), 'setVisibleLogicalRange').mockImplementation((range) => {
      renderer!.logicalRange = range
      publish({ from: 10, to: 20 })
    })
    vi.spyOn(renderer!.chart.timeScale(), 'fitContent').mockImplementation(() => publish({ from: 30, to: 40 }))
    vi.spyOn(renderer!.chart.timeScale(), 'scrollToRealTime').mockImplementation(() => publish({ from: 50, to: 60 }))
    first!.setLogicalRange({ from: -5, to: 15 })
    first!.reset()
    first!.goLive()
    expect(seen).toEqual([{ from: 10, to: 20 }, { from: 30, to: 40 }, { from: 50, to: 60 }])
  })

  it('centers every pane with its own span and publishes no click-generated mirror', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v', sync: { time: true } } })
    mounted.push(widget)
    await widget.ready()
    await settle()
    const [first, second] = widget.charts()
    const [a, b] = renderers
    a!.timeRange = { from: 0, to: 100 }
    b!.timeRange = { from: 0, to: 240 }
    const seen: unknown[] = []
    first!.sync.onVisibleRange((range) => seen.push(range))
    second!.sync.onVisibleRange((range) => seen.push(range))
    a!.fireClick(1_000)
    expect(a!.timeRange).toEqual({ from: 950, to: 1_050 })
    expect(b!.timeRange).toEqual({ from: 880, to: 1_120 })
    expect(seen).toEqual([])

    b!.timeRange = null
    a!.fireClick(2_000)
    expect(a!.timeRange).toEqual({ from: 1_950, to: 2_050 })
    expect(b!.timeRange).toBeNull()
    expect(seen).toEqual([])
  })
})
