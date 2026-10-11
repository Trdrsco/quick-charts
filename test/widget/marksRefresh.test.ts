// @vitest-environment happy-dom
// A host asks for the marks again: through the chart handle, the command and an extension's context,
// each one fetch of both families over the window the chart holds, and none from a chart that draws
// no marks.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { ChartExtensionContext } from '../../src/extension'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  document.body.replaceChildren()
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 60 * (index + 1), o: 10, h: 11, l: 9, c: 10, v: 1 }))
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** A feed that serves both mark families and counts every ask. */
function countingFeed(): { datafeed: ChartDatafeed; asks: { bar: number; axis: number } } {
  const asks = { bar: 0, axis: 0 }
  const datafeed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => null,
    history: async () => ({ bars, noData: false }),
    subscribeBars: () => () => undefined,
    marks: async () => {
      asks.bar++
      return []
    },
    timescaleMarks: async () => {
      asks.axis++
      return [{ id: 'a', time: 600, color: 'info', icon: 'mark.bolt' }]
    },
  }
  return { datafeed, asks }
}

async function mount(datafeed: ChartDatafeed, options: Partial<ChartWidgetOptions> = {}): Promise<ChartWidget> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', ...options })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return widget
}

describe('asking for the marks again', () => {
  it('fetches both families again when the host calls the chart handle', async () => {
    const { datafeed, asks } = countingFeed()
    const widget = await mount(datafeed)
    const before = { ...asks }
    expect(before.axis).toBeGreaterThan(0)
    widget.activeChart().refreshMarks()
    await settle()
    expect(asks).toEqual({ bar: before.bar + 1, axis: before.axis + 1 })
  })

  it('fetches them again through the command, which is available while the chart draws marks', async () => {
    const { datafeed, asks } = countingFeed()
    const widget = await mount(datafeed)
    const before = asks.axis
    expect(widget.commands.available('chart.marks.refresh')).toBe(true)
    widget.commands.execute('chart.marks.refresh')
    await settle()
    expect(asks.axis).toBe(before + 1)
  })

  it('fetches them again when an extension asks through its context, and not once it is detached', async () => {
    const { datafeed, asks } = countingFeed()
    let context: ChartExtensionContext | null = null
    const widget = await mount(datafeed, {
      extensions: [
        {
          id: 'settings-row',
          attach(ctx) {
            context = ctx
            return { detach: () => undefined }
          },
        },
      ],
    })
    const before = asks.axis
    context!.refreshMarks()
    await settle()
    expect(asks.axis).toBe(before + 1)
    widget.dispose()
    context!.refreshMarks()
    await settle()
    expect(asks.axis).toBe(before + 1)
  })

  it('asks nothing from a chart that draws no marks, whose command is unavailable', async () => {
    const { datafeed, asks } = countingFeed()
    const widget = await mount(datafeed, { marks: false })
    widget.activeChart().refreshMarks()
    await settle()
    expect(asks).toEqual({ bar: 0, axis: 0 })
    expect(widget.commands.available('chart.marks.refresh')).toBe(false)
  })
})
