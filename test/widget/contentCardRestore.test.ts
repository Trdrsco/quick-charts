// @vitest-environment happy-dom
// A save that carries a content card. The catalog holds no content card, yet a saved chart, a
// layout, a drawings document or a drawing list written by a chart that drew one still carries it.
// Each loads without it, and quietly: the card is skipped as a drawing of any type the catalog does
// not hold is, nothing throws and no notice is shown, and every drawing beside it loads exactly as
// it was saved. The next save writes the chart without it, while a drawings document keeps it as it
// was written, unread, and names it unreadable when it is applied.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { DRAWING_CONTEXT_VERSION, DRAWING_DOCUMENT_VERSION, liveDrawingEntries, type DrawingResourceContext } from '../../src/drawings/document'
import { drawingTools, parseDrawingsStore, restoreDrawings, serializeDrawingsStore, type IDrawing, type SerializedDrawing } from '../../src/drawings/index'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 1_700_000_000 + index * 60, o: 100 + index, h: 101 + index, l: 99 + index, c: 100 + index, v: 10 }))
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function mount(saveLoad: ReturnType<typeof memorySaveLoadAdapter>, options: Partial<ChartWidgetOptions> = {}): ChartWidget {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', saveLoad, features: { sessions: false, compare: false }, ui: { toasts: true }, ...options })
  mounted.push(widget)
  return widget
}

const anchors = [
  { time: bars[10]!.t as never, price: 110 },
  { time: bars[30]!.t as never, price: 130 },
]

/** A trend line and a rectangle, and between them a content card as a chart that drew one saved
 *  it: one anchor, the default style, and its text and link. */
function savedDrawings(): [line: SerializedDrawing, card: SerializedDrawing, box: SerializedDrawing] {
  const line = drawingTools.create('trend_line', 'line', anchors)!.toJSON()
  const box = drawingTools.create('rectangle', 'box', anchors)!.toJSON()
  const card = { ...drawingTools.create('text', 'card', [anchors[0]!])!.toJSON(), type: 'content_card', props: { text: 'Quarterly results', url: '' } }
  return [line, card, box]
}

/** A chart's saved content with its drawings replaced. */
function withDrawings(content: string, drawings: readonly SerializedDrawing[]): string {
  return JSON.stringify({ ...(JSON.parse(content) as Record<string, unknown>), drawings })
}

const drawingsOf = (content: string): SerializedDrawing[] => (JSON.parse(content) as { drawings: SerializedDrawing[] }).drawings

describe('a save that carries a content card', () => {
  it('restores a drawing list without it, and every other drawing as it was saved', () => {
    const [line, card, box] = savedDrawings()
    expect(drawingTools.has('content_card')).toBe(false)
    expect(drawingTools.restore(card)).toBeNull()
    const store = parseDrawingsStore(serializeDrawingsStore({ ES: [line, card, box] }))
    let restored: IDrawing[] = []
    expect(() => (restored = restoreDrawings(store['ES'] ?? []))).not.toThrow()
    expect(restored.map((drawing) => drawing.toJSON())).toEqual([line, box])
  })

  it('loads a saved chart without it, quietly, and the next save writes the chart without it', async () => {
    const adapter = memorySaveLoadAdapter()
    const widget = mount(adapter)
    await settle()
    const chart = widget.activeChart()
    const [line, card, box] = savedDrawings()
    const content = withDrawings(chart.saveLoad.serialize().content, [line, card, box])
    const saved = await adapter.charts.create({ name: 'Earnings', symbol: 'ES', timeframe: '1m', content })
    if (saved.kind !== 'ok') throw new Error('the memory adapter refused the save')

    expect((await chart.saveLoad.load(saved.ref.id)).kind).toBe('ok')
    await settle()
    expect(chart.drawings!.export()).toEqual([line, box])
    expect(chart.saveLoad.notSaving()).toBe(false)
    expect(document.querySelector('.qc-toast')).toBeNull()
    expect(drawingsOf(chart.saveLoad.serialize().content)).toEqual([line, box])
  })

  it('loads a layout without it, and the next save writes the layout without it', async () => {
    const widget = mount(memorySaveLoadAdapter())
    await settle()
    const [line, card, box] = savedDrawings()
    const layout = JSON.parse(widget.layout.serialize().content) as { charts: { content: string }[] }
    layout.charts[0]!.content = withDrawings(layout.charts[0]!.content, [line, card, box])

    expect(() => widget.layout.restore(JSON.stringify(layout))).not.toThrow()
    await settle()
    expect(widget.activeChart().drawings!.export()).toEqual([line, box])
    expect(document.querySelector('.qc-toast')).toBeNull()
    const next = JSON.parse(widget.layout.serialize().content) as { charts: { content: string }[] }
    expect(drawingsOf(next.charts[0]!.content)).toEqual([line, box])
  })

  it('loads a drawings document without it', async () => {
    const adapter = memorySaveLoadAdapter()
    const [line, card, box] = savedDrawings()
    const context: DrawingResourceContext = { version: DRAWING_CONTEXT_VERSION, kind: 'symbol-global', symbol: 'ES' }
    const entries = [line, card, box].map((row) => ({ id: row.id, source: 'main', pane: 'main', type: row.type, state: row }))
    const stored = await adapter.drawings(context).create({ version: DRAWING_DOCUMENT_VERSION, context, revision: 1, entries, groups: [], tombstones: [] })
    expect(stored.kind).toBe('ok')

    const widget = mount(adapter, { drawingPersistence: { mode: 'separate', scope: 'symbol-global' } })
    await settle()
    expect(widget.activeChart().drawings!.export()).toEqual([line, box])
    expect(document.querySelector('.qc-toast')).toBeNull()
  })

  it('names it unreadable when a drawings document is reloaded, and a write keeps it in the document as it was written', async () => {
    const adapter = memorySaveLoadAdapter()
    const [line, card, box] = savedDrawings()
    const context: DrawingResourceContext = { version: DRAWING_CONTEXT_VERSION, kind: 'symbol-global', symbol: 'ES' }
    const entries = [line, card, box].map((row) => ({ id: row.id, source: 'main', pane: 'main', type: row.type, state: row }))
    const store = adapter.drawings(context)
    expect((await store.create({ version: DRAWING_DOCUMENT_VERSION, context, revision: 1, entries, groups: [], tombstones: [] })).kind).toBe('ok')

    const widget = mount(adapter, { drawingPersistence: { mode: 'separate', scope: 'symbol-global' } })
    await settle()
    const chart = widget.activeChart()
    expect(await chart.drawingResources!.reload()).toEqual({ kind: 'ok', applied: 2, rejected: [{ id: 'card', reason: 'unreadable' }] })
    expect(chart.drawings!.export()).toEqual([line, box])

    // The viewer clears the chart: the line and the rectangle are deleted, and the card, which the
    // chart never drew, stays in the document as it was written.
    chart.drawings!.clearAll(true)
    await new Promise((resolve) => setTimeout(resolve, 250))
    await settle()
    const written = (await store.load((await store.list())[0]!.id))!.body
    expect(liveDrawingEntries(written)).toEqual([entries[1]])
    expect(written.tombstones.map((tombstone) => tombstone.id).sort()).toEqual(['box', 'line'])
  })
})
