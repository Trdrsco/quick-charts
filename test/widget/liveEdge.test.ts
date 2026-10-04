// @vitest-environment happy-dom
// The way back to the live edge, end to end through one chart: the return glides there on an easing
// curve without touching the zoom, steps in first from far back, and stops where it stands for a
// press; and the chart reads whether the view sits back from the edge and reports each change once.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { renderers, type FakeRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100, v: 1 })
const feed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 400 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  renderers.splice(0)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

/** One chart over the fake renderer, showing twenty bars and resting at its live edge. */
async function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m' })
  mounted.push(widget)
  await widget.ready()
  await settle()
  const renderer = renderers[0] as FakeRenderer
  renderer.logicalRange = { from: 380, to: 400 }
  renderer.scroll = 4
  return { widget, chart: widget.activeChart(), renderer, container }
}

/** Frames the test steps by hand, on a clock it moves. */
function frames() {
  let now = 1_000
  const due = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    due.set(++next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => due.delete(id))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  return {
    step(ms: number) {
      now += ms
      const run = [...due.values()]
      due.clear()
      for (const callback of run) callback(now)
    },
    pending: () => due.size,
  }
}

describe('the way back to the live edge', () => {
  it('reads a view scrolled back as away, once, and the glide home as returned from its first frame', async () => {
    const { chart, renderer } = await mount()
    const heard: boolean[] = []
    chart.on('liveEdge', (away) => heard.push(away))
    expect(chart.awayFromLiveEdge()).toBe(false)
    chart.scroll(-30)
    renderer.fireLogicalRange()
    chart.scroll(-5)
    renderer.fireLogicalRange()
    expect(heard).toEqual([true])
    expect(chart.awayFromLiveEdge()).toBe(true)

    const clock = frames()
    chart.goLive()
    expect(heard).toEqual([true, false])
    expect(chart.awayFromLiveEdge()).toBe(false)
    const path: number[] = []
    for (let i = 0; i < 60 && clock.pending() > 0; i++) {
      clock.step(16)
      path.push(renderer.scroll)
    }
    // It eases: the early frames cover more ground than the late ones, and it lands exactly home.
    expect(renderer.scroll).toBe(4)
    expect(path[1]! - path[0]!).toBeGreaterThan(path[path.length - 1]! - path[path.length - 2]!)
    expect(heard).toEqual([true, false])
    // Sideways only: the zoom is the spacing, and nothing wrote it.
    expect(renderer.barSpacing).toBe(8)
  })

  it('steps in to a width and a half first from far back, so it reads the same from any distance', async () => {
    const { chart, renderer } = await mount()
    chart.scroll(-200)
    const clock = frames()
    chart.goLive()
    // Twenty bars wide: from more than two widths back it starts thirty bars short of home.
    expect(renderer.scroll).toBe(4 - 30)
    for (let i = 0; i < 60 && clock.pending() > 0; i++) clock.step(16)
    expect(renderer.scroll).toBe(4)
  })

  it('stops where it stands for a press, and reads as away again while still short of the edge', async () => {
    const { chart, renderer, container } = await mount()
    const heard: boolean[] = []
    chart.on('liveEdge', (away) => heard.push(away))
    chart.scroll(-30)
    renderer.fireLogicalRange()
    const clock = frames()
    chart.goLive()
    clock.step(16)
    clock.step(16)
    const stood = renderer.scroll
    container.querySelector('.qc-gestures')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0 }))
    expect(heard).toEqual([true, false, true])
    clock.step(200)
    expect(renderer.scroll).toBe(stood)
    expect(clock.pending()).toBe(0)
  })

  it('goes home in one step when the viewer asked for reduced motion', async () => {
    const { chart, renderer } = await mount()
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList)
    const heard: boolean[] = []
    chart.on('liveEdge', (away) => heard.push(away))
    chart.scroll(-30)
    renderer.fireLogicalRange()
    chart.goLive()
    expect(renderer.scroll).toBe(4)
    // No glide to report on, so the renderer's own report of the move is what brings the answer.
    renderer.fireLogicalRange()
    expect(heard).toEqual([true, false])
  })
})
