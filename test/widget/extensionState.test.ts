// @vitest-environment happy-dom
// An extension's saved state reaches the layout's own save path: a word from the extension marks
// the open layout unsaved and an autosave writes it, through the one debounced save-needed every
// change on the chart raises. Restoring saved content says nothing, and a chart that is gone says
// nothing. Real widget, layout and save owners; only the renderer and the ports are fakes.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { memorySaveLoadAdapter } from '../../src/resources'
import type { ChartExtension, ChartExtensionContext } from '../../src/extension'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

let widget: ChartWidget | undefined
afterEach(() => {
  widget?.dispose()
  widget = undefined
  vi.useRealTimers()
  document.body.replaceChildren()
})

/** An extension that keeps a list of levels on each chart it attaches to. Its state is the list;
 *  an add says the state changed, and so does a restore, which the chart must not hear. */
function levelsExtension() {
  const charts = new Map<string, { ctx: ChartExtensionContext; add(price: number): void; levels(): number[] }>()
  const extension: ChartExtension = {
    id: 'levels',
    attach(ctx) {
      let levels: number[] = []
      charts.set(ctx.chart.id, {
        ctx,
        add(price) {
          levels = [...levels, price]
          ctx.stateChanged()
        },
        levels: () => levels,
      })
      return {
        serialize: () => levels,
        restore(state) {
          levels = Array.isArray(state) ? state.filter((price): price is number => typeof price === 'number') : []
          ctx.stateChanged()
        },
        detach() {},
      }
    },
  }
  return { extension, charts, of: (id: string) => charts.get(id)! }
}

function mount(extensions: ChartExtension[], adapter = memorySaveLoadAdapter()) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  widget = createChart({
    container,
    saveLoad: adapter,
    extensions,
    symbol: 'ES',
    timeframe: '1m',
    features: { drawings: false, replay: false, sessions: false },
    ui: { legend: false, contextMenu: false, navigation: false },
    datafeed: { search: async () => ({ hits: [], hasMore: false }), resolve: async () => null, history: async () => ({ bars: [], noData: true }), subscribeBars: () => () => undefined },
  })
  return { w: widget, adapter }
}

const dirty = (): string | undefined => document.querySelector<HTMLElement>('.qc-layouts-name')?.dataset.qcDirty

/** The extension's state in each chart of a saved layout row. */
async function savedLevels(adapter: ReturnType<typeof memorySaveLoadAdapter>, id: string): Promise<unknown[]> {
  const row = await adapter.layouts.load(id)
  const layout = JSON.parse(row!.body.content) as { charts: { content: string }[] }
  return layout.charts.map((chart) => (JSON.parse(chart.content) as { ext: Record<string, unknown> }).ext.levels)
}

/** A widget with its layout saved under a name and nothing left to write. */
async function savedLayout(extensions: ChartExtension[]) {
  vi.useFakeTimers()
  const mounted = mount(extensions)
  await vi.advanceTimersByTimeAsync(1_100)
  expect((await mounted.w.layout.saveLoad.save('Desk', { asNew: true })).kind).toBe('ok')
  await vi.advanceTimersByTimeAsync(1_100)
  expect(dirty()).toBe('false')
  const saveNeeded = vi.fn()
  mounted.w.on('saveNeeded', saveNeeded)
  return { ...mounted, saveNeeded, id: mounted.w.layout.saveLoad.current()!.ref.id }
}

describe('an extension says its saved state changed', () => {
  it('marks the open layout unsaved once the debounce settles, a burst raising one save-needed', async () => {
    const levels = levelsExtension()
    const { w, saveNeeded } = await savedLayout([levels.extension])
    const chart = levels.of(w.activeChart().id)
    chart.add(10)
    chart.add(20)
    chart.add(30)
    await vi.advanceTimersByTimeAsync(900)
    expect(saveNeeded).not.toHaveBeenCalled()
    expect(dirty()).toBe('false')
    await vi.advanceTimersByTimeAsync(200)
    expect(saveNeeded).toHaveBeenCalledTimes(1)
    expect(dirty()).toBe('true')
  })

  it('an autosave writes the layout once after the debounce, carrying the new state', async () => {
    const levels = levelsExtension()
    const { w, adapter, saveNeeded, id } = await savedLayout([levels.extension])
    expect(w.commands.execute('widget.layout.autosave', true).kind).toBe('ok')
    await vi.advanceTimersByTimeAsync(0)
    const update = vi.spyOn(adapter.layouts, 'update')
    const chart = levels.of(w.activeChart().id)
    chart.add(10)
    chart.add(20)
    chart.add(30)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(saveNeeded).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
    expect(await savedLevels(adapter, id)).toEqual([[10, 20, 30]])
    expect(dirty()).toBe('false')
    // Nothing further to write: the layout stays saved.
    await vi.advanceTimersByTimeAsync(2_000)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('a word said while saved content is restored writes nothing', async () => {
    const levels = levelsExtension()
    const { w, adapter, saveNeeded, id } = await savedLayout([levels.extension])
    expect(w.commands.execute('widget.layout.autosave', true).kind).toBe('ok')
    // A row holding other levels, put back through a load and through a host's own restore.
    const content = (await adapter.layouts.load(id))!.body.content
    const layout = JSON.parse(content) as { charts: { content: string }[] }
    const chartContent = JSON.parse(layout.charts[0]!.content) as Record<string, unknown>
    layout.charts[0]!.content = JSON.stringify({ ...chartContent, ext: { levels: [5, 6] } })
    const other = await adapter.layouts.create({ name: 'Other', content: JSON.stringify(layout) })
    if (other.kind !== 'ok') throw new Error('the memory store refused a create')
    const update = vi.spyOn(adapter.layouts, 'update')
    expect((await w.layout.saveLoad.load(other.ref.id)).kind).toBe('ok')
    expect(levels.of(w.activeChart().id).levels()).toEqual([5, 6])
    w.activeChart().saveLoad.restore(JSON.stringify({ ...chartContent, ext: { levels: [7] } }))
    expect(levels.of(w.activeChart().id).levels()).toEqual([7])
    await vi.advanceTimersByTimeAsync(2_000)
    expect(saveNeeded).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(dirty()).toBe('false')
  })

  it('a chart that is gone, or a widget that is disposed, ignores the word', async () => {
    const levels = levelsExtension()
    const { w, adapter, saveNeeded } = await savedLayout([levels.extension])
    expect(w.commands.execute('widget.layout.autosave', true).kind).toBe('ok')
    w.layout.setArrangement('2h')
    await vi.advanceTimersByTimeAsync(1_100)
    const [kept, dropped] = w.charts().map((chart) => levels.of(chart.id))
    w.layout.setArrangement('s')
    await vi.advanceTimersByTimeAsync(1_100)
    saveNeeded.mockClear()
    const update = vi.spyOn(adapter.layouts, 'update')
    expect(() => dropped!.add(1)).not.toThrow()
    await vi.advanceTimersByTimeAsync(1_100)
    expect(saveNeeded).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    w.dispose()
    expect(() => kept!.add(2)).not.toThrow()
    await vi.advanceTimersByTimeAsync(1_100)
    expect(saveNeeded).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})
