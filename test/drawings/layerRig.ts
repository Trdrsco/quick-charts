// One attached drawing layer over the fake renderer, with the events it reported: what every layer
// test drives. The rig is a helper rather than a fixture, so each test names the workflow, the
// document port and the chart identity it needs and reads the layer's own handle for the rest.
import { attachDrawings, type DrawingsHandle, type DrawingsWorkflow } from '../../src/drawings'
import { DRAWING_CONTEXT_VERSION, type DrawingResourceContext } from '../../src/drawings/document'
import type { memorySaveLoadAdapter } from '../../src/resources'
import { fakeChart, type FakeChart } from './fakeChart'

export interface Rig {
  fake: FakeChart
  container: HTMLElement
  handle: DrawingsHandle
  workflow: DrawingsWorkflow
  events: { tools: (string | null)[]; selections: (string | null)[]; changes: number; texts: unknown[]; conflicts: unknown[] }
}

export interface RigOptions {
  documents?: Parameters<typeof attachDrawings>[0]['documents']
  templates?: Parameters<typeof attachDrawings>[0]['templates']
  chartId?: string
  execute?: (command: string) => boolean
  symbol?: string
  /** Whether the host has taken the pointer over for a gesture of its own. */
  pointerSuppressed?: () => boolean
}

export function rig(options: RigOptions = {}): Rig {
  const fake = fakeChart()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const workflow: DrawingsWorkflow = { magnet: 'off', stayInDrawingMode: false, cursor: 'cross', syncAcrossPanes: true }
  const events: Rig['events'] = { tools: [], selections: [], changes: 0, texts: [], conflicts: [] }
  const handle = attachDrawings({
    chart: fake.chart,
    series: fake.series,
    container,
    symbol: options.symbol ?? 'ES',
    timeframe: '5m',
    workflow: () => workflow,
    ...(options.documents ? { documents: options.documents } : {}),
    ...(options.templates ? { templates: options.templates } : {}),
    ...(options.chartId ? { chartId: options.chartId } : {}),
    ...(options.execute ? { execute: options.execute } : {}),
    ...(options.pointerSuppressed ? { pointerSuppressed: options.pointerSuppressed } : {}),
    events: {
      onToolChange: (type) => events.tools.push(type),
      onSelectionChange: (id) => events.selections.push(id),
      onChange: () => events.changes++,
      onTextEdit: (session) => events.texts.push(session),
      onSaveConflict: (info) => events.conflicts.push(info),
    },
  })
  return { fake, container, handle, workflow, events }
}

type Adapter = ReturnType<typeof memorySaveLoadAdapter>

/** A layout-shared port over one adapter: two charts of one layout write one document per symbol. */
export const sharedPort = (adapter: Adapter) => ({
  context: (symbol: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'layout-shared', layoutId: 'desk', symbol }),
  store: (context: DrawingResourceContext) => adapter.drawings(context),
})

export const localPort = (adapter: Adapter, chartId: string) => ({
  context: (symbol: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'chart-local', layoutId: 'desk', chartId, symbol }),
  store: (context: DrawingResourceContext) => adapter.drawings(context),
})

export const documentOf = async (adapter: Adapter, context: DrawingResourceContext) => {
  const store = adapter.drawings(context)
  const row = (await store.list())[0]
  return row ? (await store.load(row.id))! : null
}
