// @vitest-environment happy-dom
// A chart that holds its view: with `features.navigation` off no hand moves the view. The renderer
// takes no drag, wheel, pinch or scale gesture, a released in-chart lock gives none of them back, the
// chart's own pinch is not attached, the zoom and scroll commands are unavailable and the navigation
// cluster is not drawn, while the chart still frames itself on the live edge and fits its bars.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { FeatureConfig } from '../../src/widget/options'
import { pointerLock, scalingOpen } from '../../src/pointerInput'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import { lastRenderer, renderers, type FakeRenderer } from './rendererFake'

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

async function mount(features?: FeatureConfig): Promise<{ widget: ChartWidget; container: HTMLElement; renderer: FakeRenderer }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', ...(features ? { features } : {}) })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return { widget, container, renderer: lastRenderer() }
}

/** The renderer's navigation flags as it holds them now: what it was created with and every write since. */
const navigationOf = (renderer: FakeRenderer): { handleScroll: unknown; handleScale: unknown } => {
  const options = renderer.chart.options() as unknown as { handleScroll: unknown; handleScale: unknown }
  return { handleScroll: options.handleScroll, handleScale: options.handleScale }
}

const VIEW_STEPS = ['chart.view.zoomIn', 'chart.view.zoomOut', 'chart.view.scrollLeft', 'chart.view.scrollRight']

describe('the lock a drag applies', () => {
  it('gives back no navigation to a chart that holds its view', () => {
    expect(pointerLock(false, false)).toEqual({
      handleScroll: false,
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false, axisDoubleClickReset: false },
      touchAction: '',
    })
    expect(pointerLock(true, false)).toEqual(pointerLock(true))
    expect(pointerLock(false, true)).toEqual(pointerLock(false))
  })
})

describe('resolving the planes', () => {
  it('moves the view by hand unless the host turns navigation off', () => {
    expect(resolveFeatures().navigation).toBe(true)
    expect(resolveFeatures({ navigation: false }).navigation).toBe(false)
  })

  it('draws no navigation cluster over a view that does not move, whatever ui says', () => {
    expect(resolveUi(undefined, resolveFeatures()).navigation).toBe(true)
    expect(resolveUi(undefined, resolveFeatures({ navigation: false })).navigation).toBe(false)
    expect(resolveUi({ navigation: true }, resolveFeatures({ navigation: false })).navigation).toBe(false)
  })
})

describe('a mounted chart that holds its view', () => {
  it('hands the renderer no gesture, and the released lock gives none back', async () => {
    const held = await mount({ navigation: false })
    expect([held.renderer.created.handleScroll, held.renderer.created.handleScale]).toEqual([false, false])
    const now = navigationOf(held.renderer)
    expect(now.handleScroll).toBe(false)
    expect(scalingOpen(now.handleScale as never)).toBe(false)

    const moving = await mount()
    expect([moving.renderer.created.handleScroll, moving.renderer.created.handleScale]).toEqual([true, true])
    const released = navigationOf(moving.renderer)
    expect(released.handleScroll).toBe(true)
    expect(scalingOpen(released.handleScale as never)).toBe(true)
  })

  it('takes no zoom or scroll command, and still fits its bars and goes back to the live edge', async () => {
    const { widget, renderer } = await mount({ navigation: false })
    for (const id of VIEW_STEPS) {
      expect(widget.commands.available(id), id).toBe(false)
      expect(widget.commands.execute(id).kind, id).toBe('unavailable')
    }
    expect(renderer.barSpacing).toBe(8)
    expect(widget.commands.available('chart.view.reset')).toBe(true)
    expect(widget.commands.available('chart.view.goLive')).toBe(true)

    const moving = await mount()
    for (const id of VIEW_STEPS) expect(moving.widget.commands.available(id), id).toBe(true)
  })

  it('draws no navigation cluster', async () => {
    expect((await mount({ navigation: false })).container.querySelector('.qc-nav')).toBeNull()
    expect((await mount()).container.querySelector('.qc-nav')).not.toBeNull()
  })

  it('does not pinch', async () => {
    /** Two fingers landing on the plot and spreading apart. */
    const pinch = (container: HTMLElement, renderer: FakeRenderer): number => {
      renderer.plotSize = { width: 540, height: 300 }
      renderer.logicalRange = { from: 10, to: 40 }
      const writes = renderer.logicalWrites.length
      const gestures = container.querySelector<HTMLElement>('.qc-gestures')!
      const fire = (type: string, ...xs: number[]): void => {
        const touches = xs.map((clientX, identifier) => ({ clientX, clientY: 100, identifier }))
        gestures.dispatchEvent(Object.assign(new Event(type), { touches, changedTouches: touches }))
      }
      fire('touchstart', 250, 350)
      fire('touchmove', 200, 400)
      fire('touchend')
      return renderer.logicalWrites.length - writes
    }
    const held = await mount({ navigation: false })
    expect(pinch(held.container, held.renderer)).toBe(0)
    const moving = await mount()
    expect(pinch(moving.container, moving.renderer)).toBeGreaterThan(0)
  })
})
