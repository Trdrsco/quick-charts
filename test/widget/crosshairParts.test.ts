// @vitest-environment happy-dom
// The crosshair's parts: `ui.crosshair` draws the crosshair or not, and an object names which of its
// parts it draws. Off, the crosshair draws neither its lines nor its labels; `horizontal: false`
// leaves one vertical line through the bar under the pointer, `labels: false` writes nothing on the
// scales, and `solid: true` draws the lines solid where they are dashed by default. A crosshair the
// host hid stays hidden when bar replay hands back the one it took away while it asked a question.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrosshairMode, LineStyle } from 'lightweight-charts'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { FeatureConfig, UiConfig } from '../../src/widget/options'
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

async function mount(planes: { ui?: UiConfig; features?: FeatureConfig } = {}): Promise<{ widget: ChartWidget; renderer: FakeRenderer }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', ...planes })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return { widget, renderer: lastRenderer() }
}

interface CrosshairLine {
  visible?: boolean
  labelVisible?: boolean
  style?: LineStyle
}

/** The crosshair the renderer was created with. */
const createdCrosshair = (renderer: FakeRenderer): { mode: CrosshairMode; vertLine: CrosshairLine; horzLine: CrosshairLine } =>
  renderer.created.crosshair as never

/** The crosshair's parts as the chart resolves them. */
const parts = (ui?: UiConfig, features?: FeatureConfig): boolean[] => {
  const resolved = resolveUi(ui, resolveFeatures(features))
  return [resolved.crosshair, resolved.crosshairHorizontal, resolved.crosshairLabels, resolved.crosshairSolid]
}

describe('resolving the crosshair', () => {
  it('draws both lines and their labels, dashed, by default', () => {
    expect(parts()).toEqual([true, true, true, false])
    expect(parts({ crosshair: true })).toEqual([true, true, true, false])
  })

  it('draws none of its parts when the host hides it, or turns the crosshair off', () => {
    expect(parts({ crosshair: false })).toEqual([false, false, false, false])
    expect(parts({ crosshair: { solid: true } }, { crosshair: false })).toEqual([false, false, false, false])
  })

  it('hides only the parts an object names, and draws solid lines only when it names them', () => {
    expect(parts({ crosshair: { horizontal: false } })).toEqual([true, false, true, false])
    expect(parts({ crosshair: { labels: false } })).toEqual([true, true, false, false])
    expect(parts({ crosshair: { solid: true } })).toEqual([true, true, true, true])
    expect(parts({ crosshair: { solid: false } })).toEqual([true, true, true, false])
  })

  it('refuses a part the crosshair does not have', () => {
    expect(() => resolveUi({ crosshair: { vertical: false } } as never, resolveFeatures())).toThrow('ui.crosshair.vertical is not an option of ui.crosshair')
    expect(() => resolveUi({ crosshair: { solid: 'yes' } } as never, resolveFeatures())).toThrow('ui.crosshair.solid must be true or false')
  })
})

describe('a mounted chart', () => {
  it('creates the renderer with both lines labelled and dashed by default', async () => {
    const crosshair = createdCrosshair((await mount()).renderer)
    expect(crosshair.mode).toBe(CrosshairMode.Normal)
    expect(crosshair.vertLine).toEqual({ labelVisible: true })
    expect(crosshair.horzLine).toEqual({ visible: true, labelVisible: true })
  })

  it('draws one vertical line, unlabelled and solid, when the host names those parts', async () => {
    const crosshair = createdCrosshair((await mount({ ui: { crosshair: { horizontal: false, labels: false, solid: true } } })).renderer)
    expect(crosshair.mode).toBe(CrosshairMode.Normal)
    expect(crosshair.vertLine).toEqual({ labelVisible: false, style: LineStyle.Solid })
    expect(crosshair.horzLine).toEqual({ visible: false, labelVisible: false, style: LineStyle.Solid })
  })

  it('draws no crosshair when the host hides it', async () => {
    expect(createdCrosshair((await mount({ ui: { crosshair: false } })).renderer).mode).toBe(CrosshairMode.Hidden)
  })

  it('keeps a hidden crosshair hidden when bar replay hands the crosshair back', async () => {
    /** Every crosshair mode the chart applied after creating the renderer. */
    const applied = (renderer: FakeRenderer): CrosshairMode[] =>
      renderer.chartOptions.flatMap((options) => {
        const crosshair = options.crosshair as { mode?: CrosshairMode } | undefined
        return crosshair?.mode === undefined ? [] : [crosshair.mode]
      })
    /** Replay asks where to begin, which takes the crosshair away, and leaving hands it back. */
    const askAndLeave = (widget: ChartWidget): void => {
      expect(widget.commands.execute('chart.replay.start').kind).toBe('ok')
      expect(widget.commands.execute('chart.replay.exit').kind).toBe('ok')
    }

    const hidden = await mount({ ui: { crosshair: false } })
    askAndLeave(hidden.widget)
    expect(applied(hidden.renderer)).toEqual([CrosshairMode.Hidden, CrosshairMode.Hidden])

    const shown = await mount()
    askAndLeave(shown.widget)
    expect(applied(shown.renderer)).toEqual([CrosshairMode.Hidden, CrosshairMode.Normal])
  })
})
