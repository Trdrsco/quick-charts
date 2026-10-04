// @vitest-environment happy-dom
// The chart as a canvas under the finger, for a host that asks for it: a one-finger drag on the plot
// in any direction releases the main price scale's framing at the renderer's own first drag move,
// and two fingers landing release it before a pinch moves the zoom; a hold, a drag on a scale, a lock
// and an already released scale release nothing. The return to the live edge frames the bars again,
// and the chart offers all of it only when the host turns it on.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachFreePan } from '../../src/widget/freePan'
import { pointerLock, RENDERER_LONG_TAP_MS } from '../../src/pointerInput'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { renderers, type FakeRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

let detach: (() => void) | null = null
const mounted: { dispose(): void }[] = []
afterEach(() => {
  detach?.()
  detach = null
  for (const widget of mounted.splice(0)) widget.dispose()
  renderers.splice(0)
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

/** A chart 600 wide and 450 tall: a plot from x 0 to 540 beside a 60px right price scale, and from
 *  y 0 to 420 above a 30px time scale; its main price scale frames itself until released. */
function rig() {
  const state = {
    framing: true,
    released: 0,
    handleScroll: pointerLock(false).handleScroll as boolean | object,
    handleScale: pointerLock(false).handleScale as object,
    now: 1_000,
  }
  const target = document.createElement('div')
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 600, bottom: 450, width: 600, height: 450, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  const chart = {
    options: () => ({ handleScroll: state.handleScroll, handleScale: state.handleScale }),
    chartElement: () => target,
    priceScale: () => ({ width: () => 0 }),
    timeScale: () => ({ width: () => 540, height: () => 30 }),
  } as unknown as IChartApi
  vi.spyOn(performance, 'now').mockImplementation(() => state.now)
  const pan = attachFreePan({
    chart,
    target,
    framing: () => state.framing,
    release: () => {
      state.released++
      state.framing = false
    },
  })
  detach = () => pan.destroy()
  const fire = (type: string, ...points: [number, number][]): void => {
    const touches = points.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier }))
    target.dispatchEvent(Object.assign(new Event(type), { touches, changedTouches: touches }))
  }
  return { state, fire }
}

describe('a drag on a chart placed by hand', () => {
  it('releases the framing at the renderer’s first drag move, whichever way it sets off', () => {
    for (const to of [[206, 150], [194, 150], [200, 156], [204, 153]] as [number, number][]) {
      const r = rig()
      r.fire('touchstart', [200, 150])
      r.fire('touchmove', [202, 151])
      expect(r.state.released, `${to}`).toBe(0)
      r.fire('touchmove', to)
      expect(r.state.released, `${to}`).toBe(1)
      detach!()
      detach = null
    }
  })

  it('releases it on any pane of the plot, since the main pane would re-frame as the time moves', () => {
    const r = rig()
    r.fire('touchstart', [200, 380])
    r.fire('touchmove', [210, 380])
    expect(r.state.released).toBe(1)
  })

  it('releases it as two fingers land, before a pinch moves the zoom', () => {
    const r = rig()
    r.fire('touchstart', [200, 150], [300, 150])
    expect(r.state.released).toBe(1)
  })

  it('leaves a hold to the crosshair, and a drag on a scale to the renderer', () => {
    const r = rig()
    r.fire('touchstart', [200, 150])
    r.state.now += RENDERER_LONG_TAP_MS
    r.fire('touchmove', [210, 150])
    r.fire('touchend')
    // On the right price scale, and on the time scale.
    r.fire('touchstart', [570, 150])
    r.fire('touchmove', [570, 160])
    r.fire('touchend')
    r.fire('touchstart', [200, 440])
    r.fire('touchmove', [210, 440])
    expect(r.state.released).toBe(0)
  })

  it('releases nothing while a lock holds the pointer, or once the framing is already off', () => {
    const r = rig()
    r.state.handleScroll = pointerLock(true).handleScroll
    r.state.handleScale = pointerLock(true).handleScale
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [210, 150])
    r.fire('touchstart', [200, 150], [300, 150])
    expect(r.state.released).toBe(0)
    r.state.handleScroll = pointerLock(false).handleScroll
    r.state.framing = false
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [210, 150])
    expect(r.state.released).toBe(0)
  })
})

describe('the touch option', () => {
  const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100, v: 1 })
  const feed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
    history: async () => ({ bars: Array.from({ length: 50 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }),
    subscribeBars: () => () => undefined,
  }
  async function mount(touch?: { freePan?: boolean }) {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', ...(touch ? { touch } : {}) })
    mounted.push(widget)
    await widget.ready()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const renderer = renderers[0] as FakeRenderer
    renderer.plotSize = { width: 540, height: 300 }
    vi.spyOn(renderer.chart.chartElement(), 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 600, bottom: 450, width: 600, height: 450, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    const gestures = container.querySelector('.qc-gestures')!
    /** A sideways drag on the plot: the very pan that re-framed the price before. */
    const pan = (): void => {
      for (const [type, x] of [['touchstart', 200], ['touchmove', 212]] as const) {
        const touches = [{ clientX: x, clientY: 100, identifier: 0 }]
        gestures.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches, changedTouches: touches }))
      }
    }
    return { chart: widget.activeChart(), renderer, pan }
  }

  it('is off unless the host turns it on: a pan leaves the price scale framing the bars on screen', async () => {
    const { renderer, pan } = await mount()
    pan()
    expect(renderer.priceScaleOptions.right?.autoScale).not.toBe(false)
  })

  it('on, a sideways pan releases the main price scale, and the way back to now frames it again', async () => {
    const { chart, renderer, pan } = await mount({ freePan: true })
    pan()
    expect(renderer.priceScaleOptions.right?.autoScale).toBe(false)
    // A saved chart states the policy the viewer reached by hand.
    expect(JSON.parse(chart.saveLoad.serialize().content).axis).toBe('manual')
    chart.goLive()
    expect(renderer.priceScaleOptions.right?.autoScale).toBe(true)
  })

  it('off, the way back to now leaves a price scale the viewer stretched as it stands', async () => {
    const { chart, renderer } = await mount()
    renderer.chart.priceScale('right').applyOptions({ autoScale: false })
    chart.goLive()
    expect(renderer.priceScaleOptions.right?.autoScale).toBe(false)
  })
})
