// @vitest-environment happy-dom
// The drawing layer end to end over a fake renderer: every placement shape, the transient tools,
// the cursor's select, move and resize, the locks, the clipboard, the inline text session, the
// documents, and the keyboard door. The renderer is `fakeChart`, whose conversions are exact
// arithmetic, so each assertion names where a press landed in price and time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachDrawings, type DrawingsHandle, type DrawingsWorkflow } from '../../src/drawings'
import { memorySaveLoadAdapter } from '../../src/resources'
import { DRAWING_CONTEXT_VERSION, liveDrawingEntries, type DrawingResourceContext } from '../../src/drawings/document'
import { click, drag, fakeChart, pointer, type FakeChart } from './fakeChart'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Rig {
  fake: FakeChart
  container: HTMLElement
  handle: DrawingsHandle
  workflow: DrawingsWorkflow
  events: { tools: (string | null)[]; selections: (string | null)[]; changes: number; texts: unknown[]; conflicts: unknown[] }
}

function rig(options: { documents?: Parameters<typeof attachDrawings>[0]['documents']; templates?: Parameters<typeof attachDrawings>[0]['templates']; chartId?: string; execute?: (command: string) => boolean; symbol?: string } = {}): Rig {
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

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}

beforeEach(() => {
  rigs = []
})
afterEach(() => {
  for (const r of rigs) {
    r.handle.destroy()
    r.container.remove()
  }
  vi.useRealTimers()
})

describe('placing a fixed tool', () => {
  it('press, drag, release places a two-anchor line at the pressed and released points', () => {
    const { fake, container, handle } = make()
    handle.armTool('trend_line')
    drag(container, [100, 100], [300, 200])
    const [d] = handle.export()
    expect(d?.type).toBe('trend_line')
    expect(d?.anchors.map((a) => Number(a.time))).toEqual([fake.timeAt(100), fake.timeAt(300)])
    expect(d?.anchors.map((a) => a.price)).toEqual([fake.priceAt(100), fake.priceAt(200)])
    expect(handle.hasSelection()).toBe(true) // a fresh drawing lands selected
    expect(handle.activeTool()).toBeNull() // and the tool releases
  })

  it('click then click places the same line, the second click fixing the end', () => {
    const { container, handle } = make()
    handle.armTool('trend_line')
    click(container, 100, 100)
    expect(handle.count()).toBe(0) // still a draft
    click(container, 300, 200)
    expect(handle.count()).toBe(1)
  })

  it('a one-anchor tool lands on the press', () => {
    const { fake, container, handle } = make()
    handle.armTool('horizontal_line')
    container.dispatchEvent(pointer('pointerdown', 50, 120))
    expect(handle.count()).toBe(1)
    expect(handle.export()[0]?.anchors[0]?.price).toBe(fake.priceAt(120))
  })

  it('stay in drawing mode keeps the tool armed after a placement', () => {
    const { container, handle, workflow } = make()
    workflow.stayInDrawingMode = true
    handle.armTool('rectangle')
    drag(container, [10, 10], [60, 60])
    expect(handle.activeTool()).toBe('rectangle')
    drag(container, [110, 10], [160, 60])
    expect(handle.count()).toBe(2)
  })

  it('an instant position tool lands whole from one press with a 1:1 plan', () => {
    const { fake, container, handle } = make()
    handle.armTool('long_position')
    container.dispatchEvent(pointer('pointerdown', 200, 200))
    const [d] = handle.export()
    expect(d?.type).toBe('long_position')
    expect(d?.anchors).toHaveLength(3)
    const [entry, target, stop] = d!.anchors
    expect(entry!.price).toBe(fake.priceAt(200))
    expect(target!.price).toBeGreaterThan(entry!.price)
    expect(stop!.price).toBeLessThan(entry!.price)
    expect(target!.price - entry!.price).toBeCloseTo(entry!.price - stop!.price, 6)
    expect(handle.hasSelection()).toBe(true)
  })

  it('a multipoint tool adds a point per click and a double-click ends the run', () => {
    const { container, handle } = make()
    handle.armTool('path')
    click(container, 10, 10)
    click(container, 60, 40)
    click(container, 110, 20)
    click(container, 110, 20) // the doubled click
    container.dispatchEvent(new MouseEvent('dblclick', { clientX: 110, clientY: 20, bubbles: true }))
    const [d] = handle.export()
    expect(d?.type).toBe('path')
    expect(d?.anchors).toHaveLength(3)
    expect(handle.activeTool()).toBeNull()
  })

  it('a freehand tool captures the drag as a stroke and drops a strayed click', () => {
    const { container, handle } = make()
    handle.armTool('brush')
    container.dispatchEvent(pointer('pointerdown', 10, 10))
    for (let i = 1; i <= 10; i++) window.dispatchEvent(pointer('pointermove', 10 + i * 8, 10 + i * 4))
    window.dispatchEvent(pointer('pointerup', 90, 50))
    expect(handle.export()[0]?.anchors.length).toBeGreaterThan(5)
    handle.armTool('brush')
    click(container, 200, 200)
    expect(handle.count()).toBe(1) // the click left nothing
  })

  it('shift holds a two-point placement to 45 degree rays', () => {
    const { fake, container, handle } = make()
    handle.armTool('trend_line')
    container.dispatchEvent(pointer('pointerdown', 100, 100, { shiftKey: true }))
    window.dispatchEvent(pointer('pointermove', 200, 130, { shiftKey: true }))
    window.dispatchEvent(pointer('pointerup', 200, 130, { shiftKey: true }))
    const [a, b] = handle.export()[0]!.anchors
    // The end snapped onto the horizontal ray: same price as the start, at the moved distance.
    expect(b!.price).toBeCloseTo(a!.price, 6)
    expect(fake.xOf(Number(b!.time))).toBeCloseTo(100 + Math.hypot(100, 30), 3)
  })

  it('the magnet pulls a placed anchor onto the bar', () => {
    const { fake, container, handle, workflow } = make()
    workflow.magnet = 'strong'
    handle.armTool('horizontal_line')
    const bar = fake.series.data()[5] as { close: number; time: unknown }
    container.dispatchEvent(pointer('pointerdown', 50, fake.yOf(bar.close) + 2))
    expect(handle.export()[0]?.anchors[0]?.price).toBe(bar.close)
  })

  it('a text-bearing tool opens the inline editor as it lands, and an empty commit removes it', async () => {
    vi.useFakeTimers()
    const { container, handle, events } = make()
    handle.armTool('text')
    container.dispatchEvent(pointer('pointerdown', 100, 100))
    expect(handle.count()).toBe(1)
    vi.runAllTimers()
    const session = handle.textEdit()
    expect(session?.fresh).toBe(true)
    expect(events.texts).toHaveLength(1)
    handle.commitText('   ')
    expect(handle.count()).toBe(0)
    expect(handle.textEdit()).toBeNull()
  })

  it('a committed text lands on the drawing, and cancelling an existing edit keeps it', () => {
    vi.useFakeTimers()
    const { container, handle } = make()
    handle.armTool('text')
    container.dispatchEvent(pointer('pointerdown', 100, 100))
    vi.runAllTimers()
    handle.commitText('Breakout')
    expect(handle.export()[0]?.props?.text).toBe('Breakout')
    handle.editSelectedText()
    vi.runAllTimers()
    expect(handle.textEdit()?.fresh).toBe(false)
    handle.cancelText()
    expect(handle.export()[0]?.props?.text).toBe('Breakout')
  })

  it('refuses an unknown tool loudly and arms every registered tool', () => {
    const { handle } = make()
    expect(() => handle.armTool('not-a-tool')).toThrow(/unknown tool/)
    for (const type of ['brush', 'path', 'long_position', 'content_card', 'measure', 'zoom', 'eraser']) expect(() => handle.armTool(type)).not.toThrow()
  })

  it('a placed drawing takes the tool default the presets remember', async () => {
    const adapter = memorySaveLoadAdapter()
    const { container, handle } = make({ templates: adapter.templates('drawing') })
    handle.armTool('rectangle')
    drag(container, [10, 10], [60, 60])
    handle.updateStyle({ lineWidth: 4 })
    await settle()
    handle.armTool('rectangle')
    drag(container, [110, 10], [160, 60])
    expect(handle.export()[1]?.style.lineWidth).toBe(4)
  })
})

describe('the transient tools', () => {
  it('measure draws a readout that stays armed and clears on the next gesture', () => {
    const { container, handle } = make()
    handle.armTool('measure')
    drag(container, [100, 100], [300, 150])
    expect(handle.count()).toBe(0) // never a kept drawing
    expect(handle.activeTool()).toBe('measure')
    handle.armTool(null)
    expect(handle.activeTool()).toBeNull()
  })

  it('zoom sets the visible range to the dragged box', () => {
    const { fake, container, handle } = make()
    handle.armTool('zoom')
    drag(container, [100, 50], [300, 150])
    expect(fake.visibleRange).toEqual({ from: fake.timeAt(100), to: fake.timeAt(300) })
    expect(handle.count()).toBe(0)
  })

  it('the eraser removes what it presses and stays armed', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    handle.armTool('eraser')
    container.dispatchEvent(pointer('pointerdown', 10, 55))
    expect(handle.count()).toBe(0)
    expect(handle.activeTool()).toBe('eraser')
  })
})

describe('the cursor', () => {
  it('selects, moves by whole bars, and reshapes by an anchor handle', () => {
    const { fake, container, handle } = make()
    handle.armTool('trend_line')
    drag(container, [100, 100], [300, 200])
    handle.deselect()
    click(container, 200, 150) // mid-segment
    expect(handle.hasSelection()).toBe(true)
    drag(container, [200, 150], [230, 170]) // a move of three bars and twenty pixels
    const moved = handle.export()[0]!.anchors
    expect(fake.xOf(Number(moved[0]!.time))).toBe(130)
    expect(moved[0]!.price).toBe(fake.priceAt(120))
    drag(container, [330, 220], [400, 220]) // grab the end handle and pull it right
    expect(fake.xOf(Number(handle.export()[0]!.anchors[1]!.time))).toBe(400)
  })

  it('a press on empty chart deselects, and lock-all clears the selection and refuses edits', () => {
    const { container, handle, events } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    click(container, 300, 300)
    expect(handle.hasSelection()).toBe(false)
    click(container, 10, 55) // the left edge; a rectangle without a fill takes hits on its edges
    expect(handle.hasSelection()).toBe(true)
    handle.setAllLocked(true)
    expect(handle.hasSelection()).toBe(false)
    click(container, 10, 55)
    expect(handle.hasSelection()).toBe(false)
    handle.armTool('trend_line')
    drag(container, [200, 200], [300, 300])
    expect(handle.count()).toBe(1) // placement refused under lock-all
    expect(events.changes).toBeGreaterThan(0)
  })

  it("a locked drawing selects but refuses a move, and the layer's delete refuses it too", () => {
    const { fake, container, handle } = make()
    handle.armTool('trend_line')
    drag(container, [100, 100], [300, 200])
    handle.setLocked(true)
    expect(handle.selected()?.locked).toBe(true)
    drag(container, [200, 150], [230, 170])
    expect(fake.xOf(Number(handle.export()[0]!.anchors[0]!.time))).toBe(100)
    handle.deleteSelected()
    expect(handle.count()).toBe(1)
    handle.setLocked(false)
    handle.deleteSelected()
    expect(handle.count()).toBe(0)
  })

  it('a Ctrl-drag duplicates and moves the copy; an unmoved Ctrl-press leaves nothing', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    drag(container, [10, 55], [110, 55], { ctrlKey: true })
    expect(handle.count()).toBe(2)
    click(container, 10, 55, { ctrlKey: true })
    expect(handle.count()).toBe(2)
  })

  it('a Command-drag duplicates as a Control-drag does, so the hint the platform shows is the gesture it has', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    drag(container, [10, 55], [110, 55], { metaKey: true })
    expect(handle.count()).toBe(2)
    click(container, 10, 55, { metaKey: true })
    expect(handle.count()).toBe(2)
  })

  it('reports the drawing under the resting pointer', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    handle.deselect()
    container.dispatchEvent(pointer('pointermove', 10, 55))
    expect(handle.hovered()).toBe(handle.export()[0]!.id)
    container.dispatchEvent(pointer('pointermove', 300, 300))
    expect(handle.hovered()).toBeNull()
    container.dispatchEvent(pointer('pointermove', 10, 55))
    container.dispatchEvent(pointer('pointerleave', 10, 55))
    expect(handle.hovered()).toBeNull()
  })
})

describe('the selection edits', () => {
  it('clone lands a copy beside the source and selects it; copy and paste do the same across layers', () => {
    const a = make()
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    const original = a.handle.export()[0]!
    a.handle.clone()
    expect(a.handle.count()).toBe(2)
    const copy = a.handle.export()[1]!
    expect(copy.id).not.toBe(original.id)
    expect(a.fake.xOf(Number(copy.anchors[0]!.time))).toBe(a.fake.xOf(Number(original.anchors[0]!.time)) + 24)
    expect(a.handle.selected()?.id).toBe(copy.id)
    a.handle.select(original.id)
    a.handle.copy()
    const b = make({ symbol: 'NQ' })
    expect(b.handle.canPaste()).toBe(true)
    expect(b.handle.paste()).toBe(true)
    expect(b.handle.export()[0]?.type).toBe('rectangle')
  })

  it('restacks, hides, and applies a visibility preset', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    handle.armTool('rectangle')
    drag(container, [20, 20], [110, 110])
    expect(handle.stackPosition()).toEqual({ atFront: true, atBack: false })
    handle.sendToBack()
    expect(handle.stackPosition()).toEqual({ atFront: false, atBack: true })
    handle.bringForward()
    expect(handle.stackPosition().atFront).toBe(true)
    handle.setVisibilityPreset('current-only')
    const visibility = handle.export().find((d) => d.id === handle.selected()!.id)!.options.visibility
    expect(visibility.minutes).toEqual({ on: true, from: 5, to: 5 })
    expect(visibility.hours.on).toBe(false)
    handle.hideSelected()
    expect(handle.hasSelection()).toBe(false)
    expect(handle.count()).toBe(2)
  })

  it('restyles through updateStyle and updateProps, and counts locked drawings for the sweep', () => {
    const { container, handle } = make()
    handle.armTool('trend_line')
    drag(container, [100, 100], [300, 200])
    handle.updateStyle({ lineColor: 'rgba(1, 2, 3, 1)', lineWidth: 3 })
    expect(handle.selected()).toMatchObject({ lineColor: 'rgba(1, 2, 3, 1)', lineWidth: 3, hasText: true, hasCells: false })
    handle.updateProps({ extendLeft: true })
    expect(handle.export()[0]?.props?.extendLeft).toBe(true)
    handle.setLocked(true)
    handle.armTool('trend_line')
    drag(container, [100, 300], [300, 350])
    expect(handle.counts()).toEqual({ total: 2, locked: 1 })
    handle.clearAll()
    expect(handle.counts()).toEqual({ total: 1, locked: 1 })
    handle.clearAll(true)
    expect(handle.count()).toBe(0)
  })

  it('places a picture centred in view and blanks every drawing on the eye', () => {
    const { container, handle } = make()
    handle.placeImage({ dataUrl: 'data:image/png;base64,AA', width: 800, height: 400, opacity: 0.5 })
    const [d] = handle.export()
    expect(d?.type).toBe('image')
    expect(d?.props?.width).toBe(360)
    expect(d?.props?.opacity).toBe(0.5)
    handle.setAllHidden(true)
    expect(handle.allHidden()).toBe(true)
    expect(handle.hasSelection()).toBe(false)
    click(container, 500, 200) // a hidden drawing takes no hit
    expect(handle.hasSelection()).toBe(false)
  })
})

describe('the keyboard', () => {
  it('runs Delete, Escape, copy and paste through the door it was given, and never itself', () => {
    const ran: string[] = []
    const { container, handle } = make({ execute: (command) => (ran.push(command), true) })
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(handle.count()).toBe(1) // the door decides; the layer did not delete on its own
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true }))
    handle.armTool('trend_line')
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(ran).toEqual(['chart.drawings.deleteSelected', 'chart.drawings.copy', 'chart.drawings.cancel'])
  })

  it('standalone, the keys act directly and stay out of a text field', () => {
    const { container, handle } = make()
    handle.armTool('rectangle')
    drag(container, [10, 10], [100, 100])
    const input = document.createElement('input')
    container.appendChild(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(handle.count()).toBe(1)
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    expect(handle.count()).toBe(0)
    handle.armTool('trend_line')
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(handle.activeTool()).toBeNull()
  })
})

describe('the documents', () => {
  /** A layout-shared port over one adapter: two charts of one layout write one document per symbol. */
  const sharedPort = (adapter: ReturnType<typeof memorySaveLoadAdapter>) => ({
    context: (symbol: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'layout-shared', layoutId: 'desk', symbol }),
    store: (context: DrawingResourceContext) => adapter.drawings(context),
  })
  const localPort = (adapter: ReturnType<typeof memorySaveLoadAdapter>, chartId: string) => ({
    context: (symbol: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'chart-local', layoutId: 'desk', chartId, symbol }),
    store: (context: DrawingResourceContext) => adapter.drawings(context),
  })
  const documentOf = async (adapter: ReturnType<typeof memorySaveLoadAdapter>, context: DrawingResourceContext) => {
    const store = adapter.drawings(context)
    const row = (await store.list())[0]
    return row ? (await store.load(row.id))! : null
  }

  it('writes one document per context, hydrates on activation, and keeps a chart-bound drawing to its chart', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: sharedPort(adapter), chartId: 'chart-1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    a.workflow.syncAcrossPanes = false
    a.handle.armTool('trend_line')
    drag(a.container, [100, 100], [300, 200])
    expect(a.handle.export().map((d) => d.scope)).toEqual([undefined, 'chart-1'])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    const stored = await documentOf(adapter, sharedPort(adapter).context('ES'))
    expect(stored?.body.entries.map((e) => e.type)).toEqual(['rectangle', 'trend_line'])
    // Every entry names what it is drawn on, so a restore checks it rather than assuming it.
    expect(stored?.body.entries.every((e) => e.source === 'main' && e.pane === 'main')).toBe(true)
    // A second chart of the same layout reads the same document: it shows the shared rectangle and
    // not the line bound to chart-1.
    const b = make({ documents: sharedPort(adapter), chartId: 'chart-2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.export().map((d) => d.type)).toEqual(['rectangle'])
    // Switching away and back keeps each symbol's own drawings.
    a.handle.setSymbol('NQ')
    expect(a.handle.count()).toBe(0)
    a.handle.setSymbol('ES')
    expect(a.handle.count()).toBe(2)
  })

  it('keeps a chart-local document to its own chart', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: localPort(adapter, 'c1'), chartId: 'c1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    const b = make({ documents: localPort(adapter, 'c2'), chartId: 'c2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.count()).toBe(0)
    expect(await documentOf(adapter, localPort(adapter, 'c2').context('ES'))).toBeNull()
  })

  it('merges the stored document over its own on a refused write, and tells the host', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const context = sharedPort(adapter).context('ES')
    const store = adapter.drawings(context)
    const a = make({ documents: sharedPort(adapter) })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await vi.advanceTimersByTimeAsync(300)
    const b = make({ documents: sharedPort(adapter) })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.count()).toBe(1)
    // Another surface writes first.
    const found = (await documentOf(adapter, context))!
    const mine = a.handle.export()[0]!
    await store.update(found.ref, {
      ...found.body,
      revision: found.body.revision + 1,
      entries: [...found.body.entries, { id: 'other', source: 'main', pane: 'main', type: mine.type, state: { ...mine, id: 'other' } }],
    })
    a.handle.armTool('trend_line')
    drag(a.container, [100, 100], [300, 200])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    const ids = a.handle.export().map((d) => d.id)
    expect(ids).toContain('other')
    expect(ids).toHaveLength(3)
    expect(a.events.conflicts).toHaveLength(1)
    const after = (await documentOf(adapter, context))!
    expect(liveDrawingEntries(after.body).map((e) => e.id)).toEqual(ids)
  })

  it('never brings back a drawing this chart deleted, even when the other surface still holds it', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const context = sharedPort(adapter).context('ES')
    const store = adapter.drawings(context)
    const a = make({ documents: sharedPort(adapter) })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    const before = (await documentOf(adapter, context))!
    // The trader deletes it here...
    a.handle.select(a.handle.export()[0]!.id)
    a.handle.deleteSelected()
    // ...while another surface, which still shows it, writes first.
    await store.update(before.ref, { ...before.body, revision: before.body.revision + 1 })
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(a.handle.count()).toBe(0)
    const after = (await documentOf(adapter, context))!
    expect(liveDrawingEntries(after.body)).toEqual([])
    expect(after.body.tombstones).toHaveLength(1)
  })
})

describe('the low-level document operations', () => {
  const port = (adapter: ReturnType<typeof memorySaveLoadAdapter>) => ({
    context: (symbol: string): DrawingResourceContext => ({ version: DRAWING_CONTEXT_VERSION, kind: 'chart-local', layoutId: 'desk', chartId: 'c1', symbol }),
    store: (context: DrawingResourceContext) => adapter.drawings(context),
  })

  it('refuses every verb in combined mode, because there is no separate document to reach', async () => {
    const { handle } = make()
    expect(handle.documents.context()).toBeNull()
    expect(await handle.documents.get()).toEqual({ kind: 'refused', reason: 'combined-mode' })
    expect(await handle.documents.reload()).toEqual({ kind: 'refused', reason: 'combined-mode' })
    const document = { version: 1 as const, context: { version: 1 as const, kind: 'symbol-global' as const, symbol: 'ES' }, revision: 1, entries: [], groups: [], tombstones: [] }
    expect(handle.documents.apply(document)).toEqual({ kind: 'refused', reason: 'combined-mode' })
  })

  it('gets the stored document without touching the chart, and reloads it back onto the chart', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: port(adapter), chartId: 'c1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await settle()
    await settle()
    const read = await a.handle.documents.get()
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') return
    expect(read.document.entries).toHaveLength(1)
    expect(a.handle.documents.context()).toEqual(port(adapter).context('ES'))

    // A second chart reloads the same document onto itself.
    const b = make({ documents: port(adapter), chartId: 'c1' })
    b.handle.clearAll(true)
    const applied = await b.handle.documents.reload()
    expect(applied).toEqual({ kind: 'ok', applied: 1, rejected: [] })
    expect(b.handle.count()).toBe(1)
  })

  it('writes at the ref a document was applied with, instead of creating a second one', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: port(adapter), chartId: 'c1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await new Promise((resolve) => setTimeout(resolve, 250)) // every write of the first chart lands
    await settle()
    a.handle.destroy()

    const b = make({ documents: port(adapter), chartId: 'c1' })
    const read = await b.handle.documents.get()
    expect(read.kind).toBe('ok')
    if (read.kind !== 'ok') return
    // The ref the read stood at rides the apply, so the next write is an update at that revision.
    expect(b.handle.documents.apply(read.document, read.ref)).toMatchObject({ kind: 'ok', applied: 1 })
    b.handle.armTool('trend_line')
    drag(b.container, [100, 100], [300, 200])
    await new Promise((resolve) => setTimeout(resolve, 250)) // the debounced write
    await settle()
    expect(b.events.conflicts).toEqual([])
    const store = adapter.drawings(port(adapter).context('ES'))
    const rows = await store.list()
    expect(rows).toHaveLength(1)
    expect((await store.load(rows[0]!.id))!.body.entries.map((e) => e.type)).toEqual(['rectangle', 'trend_line'])
  })

  it('refuses a document written for another context', () => {
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: port(adapter), chartId: 'c1' })
    const foreign = {
      version: 1 as const,
      context: { version: 1 as const, kind: 'chart-local' as const, layoutId: 'desk', chartId: 'c2', symbol: 'ES' },
      revision: 3,
      entries: [{ id: 'x', source: 'main', pane: 'main', type: 'rectangle', state: { id: 'x', type: 'rectangle' } }],
      groups: [],
      tombstones: [],
    }
    expect(a.handle.documents.apply(foreign)).toEqual({ kind: 'refused', reason: 'context-mismatch' })
    expect(a.handle.count()).toBe(0)
  })

  it('names every entry it cannot attach and applies the rest', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: port(adapter), chartId: 'c1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await settle()
    const good = a.handle.export()[0]!
    a.handle.clearAll(true)
    const document = {
      version: 1 as const,
      context: port(adapter).context('ES'),
      revision: 5,
      entries: [
        { id: good.id, source: 'main', pane: 'main', type: good.type, state: good },
        { id: 'orphan', source: 'rsi-14', pane: 'main', type: 'rectangle', state: { ...good, id: 'orphan' } },
        { id: 'no-pane', source: 'main', pane: 'rsi-14', type: 'rectangle', state: { ...good, id: 'no-pane' } },
        { id: 'grouped', source: 'main', pane: 'main', type: 'rectangle', state: { ...good, id: 'grouped' }, group: 'gone' },
        { id: 'junk', source: 'main', pane: 'main', type: 'rectangle', state: null },
      ],
      groups: [],
      tombstones: [{ kind: 'group' as const, id: 'gone', at: 4 }],
    }
    const outcome = a.handle.documents.apply(document)
    expect(outcome.kind).toBe('ok')
    if (outcome.kind !== 'ok') return
    expect(outcome.applied).toBe(1)
    expect([...outcome.rejected].sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'grouped', reason: 'deleted-group' },
      { id: 'junk', reason: 'unreadable' },
      { id: 'no-pane', reason: 'missing-pane' },
      { id: 'orphan', reason: 'missing-source' },
    ])
    expect(a.handle.count()).toBe(1)
  })

  it('refuses a drawing that belongs to a pane this layer does not draw in, instead of moving it', () => {
    const adapter = memorySaveLoadAdapter()
    const fake = fakeChart()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const handle = attachDrawings({
      chart: fake.chart,
      series: fake.series,
      container,
      symbol: 'ES',
      chartId: 'c1',
      documents: port(adapter),
      surface: { sources: () => ['main', 'rsi-14'], panes: () => ['main', 'rsi-14'] },
    })
    const outcome = handle.documents.apply({
      version: 1,
      context: port(adapter).context('ES'),
      revision: 1,
      entries: [{ id: 'in-study', source: 'rsi-14', pane: 'rsi-14', type: 'rectangle', state: { id: 'in-study', type: 'rectangle' } }],
      groups: [],
      tombstones: [],
    })
    expect(outcome).toEqual({ kind: 'ok', applied: 0, rejected: [{ id: 'in-study', reason: 'foreign-pane' }] })
    expect(handle.count()).toBe(0)
    handle.destroy()
    container.remove()
  })

  it('keeps a row it never drew when the trader draws one it does, instead of burying it', async () => {
    const adapter = memorySaveLoadAdapter()
    const fake = fakeChart()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const handle = attachDrawings({
      chart: fake.chart,
      series: fake.series,
      container,
      symbol: 'ES',
      chartId: 'c1',
      documents: port(adapter),
      surface: { sources: () => ['main', 'rsi-14'], panes: () => ['main', 'rsi-14'] },
    })
    // A row this layer does not draw: the study pane's, applied by the host and refused by this
    // layer, so it is in the document and never on this screen.
    const study = { id: 'in-study', source: 'rsi-14', pane: 'rsi-14', type: 'rectangle', state: { id: 'in-study', type: 'rectangle' } }
    handle.documents.apply({ version: 1, context: port(adapter).context('ES'), revision: 1, entries: [study], groups: [], tombstones: [] })
    handle.armTool('trend_line')
    drag(container, [100, 100], [300, 200])
    await settle()
    await settle()
    const store = adapter.drawings(port(adapter).context('ES'))
    const row = (await store.list())[0]!
    const stored = (await store.load(row.id))!
    // The trader's line joins the document; the study pane's row survives it, byte for byte, and
    // nothing is buried. A deletion here would take a drawing the trader can still see.
    expect(stored.body.tombstones).toEqual([])
    expect(stored.body.entries.map((e) => [e.id, e.source, e.pane])).toEqual([
      ['in-study', 'rsi-14', 'rsi-14'],
      [handle.export()[0]!.id, 'main', 'main'],
    ])
    expect(stored.body.entries[0]).toEqual(study)
    handle.destroy()
    container.remove()
  })

  it('drops an answer for the symbol that just left rather than landing it on the one that arrived', async () => {
    const adapter = memorySaveLoadAdapter()
    const a = make({ documents: port(adapter), chartId: 'c1' })
    const pending = a.handle.documents.reload()
    a.handle.setSymbol('NQ')
    expect(await pending).toEqual({ kind: 'refused', reason: 'stale' })
  })
})
