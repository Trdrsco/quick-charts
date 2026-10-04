// @vitest-environment happy-dom
// A finger's drag that moves the price, for a host that asks for it: a drag on the main pane's plot
// that sets off mostly vertically releases the price scale's framing at the renderer's own first drag
// move, so the renderer moves the price with it; a sideways or diagonal start, a hold, a drag on a
// scale or another pane, a lock and a second finger release nothing; and the chart offers it only
// when the host turns it on.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachVerticalDrag } from '../../src/widget/verticalDrag'
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

/** A chart whose main pane's plot runs from x 0 to 540 and y 0 to 300, beside a right price scale,
 *  above a second pane; its axis frames itself until released. */
function rig() {
  const state = { framing: true, released: 0, handleScroll: pointerLock(false).handleScroll as boolean | object, now: 1_000 }
  const target = document.createElement('div')
  const chart = {
    options: () => ({ handleScroll: state.handleScroll }),
    chartElement: () => target,
    priceScale: () => ({ width: () => 0 }),
    timeScale: () => ({ width: () => 540 }),
    panes: () => [{ getHeight: () => 300 }, { getHeight: () => 120 }],
  } as unknown as IChartApi
  vi.spyOn(performance, 'now').mockImplementation(() => state.now)
  const drag = attachVerticalDrag({
    chart,
    target,
    framing: () => state.framing,
    release: () => {
      state.released++
      state.framing = false
    },
  })
  detach = () => drag.destroy()
  const fire = (type: string, ...points: [number, number][]): void => {
    const touches = points.map(([clientX, clientY], identifier) => ({ clientX, clientY, identifier }))
    target.dispatchEvent(Object.assign(new Event(type), { touches, changedTouches: touches }))
  }
  return { state, fire }
}

describe('a drag that moves the price', () => {
  it('releases the framing at the renderer’s first drag move when it sets off mostly vertically', () => {
    const r = rig()
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [200, 153])
    expect(r.state.released).toBe(0)
    r.fire('touchmove', [201, 156])
    expect(r.state.released).toBe(1)
    // Judged once: the rest of the drag decides nothing more.
    r.fire('touchmove', [260, 160])
    expect(r.state.released).toBe(1)
  })

  it('keeps the bars framed when the drag sets off sideways, or too diagonally to tell', () => {
    const r = rig()
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [206, 151])
    r.fire('touchmove', [200, 220])
    expect(r.state.released).toBe(0)
    r.fire('touchend')
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [203, 154])
    expect(r.state.released).toBe(0)
  })

  it('leaves a hold to the crosshair, and a drag on a scale or another pane to the renderer', () => {
    const r = rig()
    r.fire('touchstart', [200, 150])
    r.state.now += RENDERER_LONG_TAP_MS
    r.fire('touchmove', [200, 160])
    expect(r.state.released).toBe(0)
    r.fire('touchend')
    // On the right price scale, and on the pane below the main one.
    r.fire('touchstart', [560, 150])
    r.fire('touchmove', [560, 160])
    r.fire('touchend')
    r.fire('touchstart', [200, 360])
    r.fire('touchmove', [200, 370])
    expect(r.state.released).toBe(0)
  })

  it('releases nothing while a lock holds the pointer, for two fingers, or once the framing is off', () => {
    const r = rig()
    r.state.handleScroll = pointerLock(true).handleScroll
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [200, 160])
    expect(r.state.released).toBe(0)
    r.state.handleScroll = pointerLock(false).handleScroll
    r.fire('touchstart', [200, 150], [260, 150])
    r.fire('touchmove', [200, 160], [260, 160])
    expect(r.state.released).toBe(0)
    r.state.framing = false
    r.fire('touchstart', [200, 150])
    r.fire('touchmove', [200, 160])
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
  async function verticalDrag(touch?: { verticalDrag?: boolean }): Promise<FakeRenderer> {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', ...(touch ? { touch } : {}) })
    mounted.push(widget)
    await widget.ready()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const renderer = renderers[0] as FakeRenderer
    renderer.plotSize = { width: 540, height: 300 }
    const gestures = container.querySelector('.qc-gestures')!
    const fire = (type: string, x: number, y: number): void => {
      const touches = [{ clientX: x, clientY: y, identifier: 0 }]
      gestures.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { touches, changedTouches: touches }))
    }
    fire('touchstart', 200, 100)
    fire('touchmove', 200, 110)
    return renderer
  }

  it('is off unless the host turns it on: a vertical drag leaves the price scale framing itself', async () => {
    const renderer = await verticalDrag()
    expect(renderer.priceScaleOptions.right?.autoScale).not.toBe(false)
  })

  it('on, a vertical drag releases the main price scale as a drag on the scale does', async () => {
    const renderer = await verticalDrag({ verticalDrag: true })
    expect(renderer.priceScaleOptions.right?.autoScale).toBe(false)
  })
})
