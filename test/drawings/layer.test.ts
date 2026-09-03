// @vitest-environment happy-dom
// The drawing layer end to end over a fake renderer: every placement shape, the transient tools,
// the cursor's select, move and resize, the locks, the clipboard, the inline text session, the
// documents, and the keyboard door. The renderer is `fakeChart`, whose conversions are exact
// arithmetic, so each assertion names where a press landed in price and time.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachDrawings, type DrawingsHandle, type DrawingsWorkflow } from '../../src/drawings'
import { memorySaveLoadAdapter } from '../../src/resources'
import { click, drag, fakeChart, pointer, type FakeChart } from './fakeChart'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

interface Rig {
  fake: FakeChart
  container: HTMLElement
  handle: DrawingsHandle
  workflow: DrawingsWorkflow
  events: { tools: (string | null)[]; selections: (string | null)[]; changes: number; texts: unknown[]; conflicts: unknown[] }
}

function rig(options: { resources?: Parameters<typeof attachDrawings>[0]['resources']; templates?: Parameters<typeof attachDrawings>[0]['templates']; chartId?: string; execute?: (command: string) => boolean; symbol?: string } = {}): Rig {
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
    ...(options.resources ? { resources: options.resources } : {}),
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
  it('persists per symbol, hydrates on activation, and keeps a chart-bound drawing to its chart', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const a = make({ resources: (scope) => adapter.drawings(scope), chartId: 'chart-1' })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    a.workflow.syncAcrossPanes = false
    a.handle.armTool('trend_line')
    drag(a.container, [100, 100], [300, 200])
    expect(a.handle.export().map((d) => d.scope)).toEqual([undefined, 'chart-1'])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    expect((await adapter.drawings({ symbol: 'ES' }).list()).length).toBe(1)
    expect((await adapter.drawings({ symbol: 'ES', chartId: 'chart-1' }).list()).length).toBe(1)
    // A second chart of the same symbol sees the shared rectangle and not the bound line.
    const b = make({ resources: (scope) => adapter.drawings(scope), chartId: 'chart-2' })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.export().map((d) => d.type)).toEqual(['rectangle'])
    // Switching away and back keeps each symbol's own drawings.
    a.handle.setSymbol('NQ')
    expect(a.handle.count()).toBe(0)
    a.handle.setSymbol('ES')
    expect(a.handle.count()).toBe(2)
  })

  it('merges the stored document over its own on a refused write, and tells the host', async () => {
    vi.useFakeTimers()
    const adapter = memorySaveLoadAdapter()
    const store = adapter.drawings({ symbol: 'ES' })
    const a = make({ resources: (scope) => adapter.drawings(scope) })
    a.handle.armTool('rectangle')
    drag(a.container, [10, 10], [100, 100])
    await vi.advanceTimersByTimeAsync(300)
    const b = make({ resources: (scope) => adapter.drawings(scope) })
    await vi.advanceTimersByTimeAsync(0)
    expect(b.handle.count()).toBe(1)
    // Another surface writes first.
    const row = (await store.list())[0]!
    const found = (await store.load(row.id))!
    await store.update(found.ref, { content: JSON.stringify([...JSON.parse(found.body.content), { ...a.handle.export()[0]!, id: 'other' }]) })
    a.handle.armTool('trend_line')
    drag(a.container, [100, 100], [300, 200])
    await vi.advanceTimersByTimeAsync(300)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    const ids = a.handle.export().map((d) => d.id)
    expect(ids).toContain('other')
    expect(ids).toHaveLength(3)
    expect(a.events.conflicts).toHaveLength(1)
    const stored = JSON.parse((await store.load(row.id))!.body.content) as { id: string }[]
    expect(stored.map((d) => d.id)).toEqual(ids)
  })
})
