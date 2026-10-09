// @vitest-environment happy-dom
// The line tools under the pointer, end to end through the layer over the fake renderer: two clicks
// place a line, its second point following the pointer between them and a right-click between them
// taking it back; a press on a handle moves only its point, on an unselected line too, which it
// selects; a level line's square handle stands nine tenths of the way across or down the pane and
// sets both of its point's coordinates; a click on the invitation of a selected line types its words
// there; and a double-click on a line opens its settings.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISeriesPrimitive, Time } from 'lightweight-charts'
import { viewportOf, type IDrawing } from '../../src/internal/drawings/index'
import { click, drag, pointer } from './fakeChart'
import { rig, type Rig } from './layerRig'

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

/** Every drawing the layer attaches to the chart, a placement's draft included. */
function attached(r: Rig): IDrawing[] {
  const seen: IDrawing[] = []
  const series = r.fake.series as unknown as { attachPrimitive(p: ISeriesPrimitive<Time>): void }
  series.attachPrimitive = (p) => void seen.push(p as unknown as IDrawing)
  return seen
}

/** Paint one frame of a drawing over the fake chart, as the chart would before the next press. */
function paintFrame(r: Rig, drawing: IDrawing): void {
  const live = drawing as IDrawing & { getViewport(): unknown; paneViews(): readonly { renderer(): { draw(target: unknown): void } | null }[] }
  live.getViewport = () => viewportOf(r.fake.chart, r.fake.series)
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => (p === 'measureText' ? (text: string) => ({ width: text.length * 8.4 }) : () => undefined),
    set: () => true,
  })
  live.paneViews()[0]!.renderer()!.draw({ useMediaCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => void) => fn({ context: ctx, mediaSize: { width: 1000, height: 400 } }) })
}

/** A trend line placed with two clicks from one point to another, selected as it lands. */
function placeLine(r: Rig, from: [number, number], to: [number, number]): IDrawing {
  r.handle.armTool('trend_line')
  click(r.container, from[0], from[1])
  click(r.container, to[0], to[1])
  return r.handle.selectedDrawing()!
}

const pixels = (r: Rig, d: IDrawing): number[][] => d.anchors.map((a) => [r.fake.xOf(Number(a.time)), r.fake.yOf(a.price)])

describe('placing a line', () => {
  it('takes two clicks: between them its first point is ringed and its second follows the pointer', () => {
    const r = make()
    const seen = attached(r)
    r.handle.armTool('trend_line')
    click(r.container, 100, 100)
    window.dispatchEvent(pointer('pointermove', 300, 200))
    const draft = seen[0]!
    expect(pixels(r, draft)).toEqual([
      [100, 100],
      [300, 200],
    ])
    // The line shows as it will stand, its first point's handle up and none on the point under the
    // pointer.
    expect(draft.state).toBe('editing')
    const vp = viewportOf(r.fake.chart, r.fake.series)!
    expect(draft.getControlPoints(vp).map((p) => p.index)).toEqual([0])
    click(r.container, 300, 200)
    expect(r.handle.count()).toBe(1)
    expect(r.handle.selectedDrawing()?.id).toBe(draft.id)
    expect(draft.state).toBe('selected')
    expect(draft.getControlPoints(vp).map((p) => p.index)).toEqual([0, 1])
    expect(r.handle.activeTool()).toBeNull()
  })

  it('takes the half-placed line back on a right-click between the clicks, puts the tool down and keeps the menu shut', () => {
    const r = make()
    r.handle.armTool('trend_line')
    click(r.container, 100, 100)
    window.dispatchEvent(pointer('pointermove', 300, 200))
    r.container.dispatchEvent(pointer('pointerdown', 300, 200, { button: 2 }))
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    r.container.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    expect(r.handle.counts().total).toBe(0)
    expect(r.handle.activeTool()).toBeNull()
  })
})

describe('moving a line', () => {
  it('moves only the point of the handle a press lands on, and an unselected line too, which the press selects', () => {
    const r = make()
    const line = placeLine(r, [100, 100], [300, 200])
    r.handle.deselect()
    drag(r.container, [100, 100], [120, 130])
    expect(r.handle.selectedDrawing()?.id).toBe(line.id)
    expect(pixels(r, line)).toEqual([
      [120, 130],
      [300, 200],
    ])
    drag(r.container, [300, 200], [280, 170])
    expect(pixels(r, line)).toEqual([
      [120, 130],
      [280, 170],
    ])
  })

  it('moves both points by a drag on its body', () => {
    const r = make()
    const line = placeLine(r, [100, 100], [300, 200])
    r.handle.deselect()
    drag(r.container, [200, 150], [240, 120])
    expect(pixels(r, line)).toEqual([
      [140, 70],
      [340, 170],
    ])
  })

  it('stands a horizontal line’s square handle nine tenths of the way across, and a drag of it sets the level and the time under it', () => {
    const r = make()
    r.handle.armTool('horizontal_line')
    r.container.dispatchEvent(pointer('pointerdown', 50, 120))
    window.dispatchEvent(pointer('pointerup', 50, 120))
    const level = r.handle.selectedDrawing()!
    const vp = viewportOf(r.fake.chart, r.fake.series)!
    expect(level.getControlPoints(vp)).toEqual([{ index: 0, x: 900, y: 120 }])
    r.handle.deselect()
    drag(r.container, [900, 120], [910, 140])
    expect(r.handle.selectedDrawing()?.id).toBe(level.id)
    expect(pixels(r, level)).toEqual([[910, 140]])
  })

  it('stands a vertical line’s square handle nine tenths of the way down, and a drag of it sets the time and the price under it', () => {
    const r = make()
    r.handle.armTool('vertical_line')
    r.container.dispatchEvent(pointer('pointerdown', 400, 100))
    window.dispatchEvent(pointer('pointerup', 400, 100))
    const time = r.handle.selectedDrawing()!
    const vp = viewportOf(r.fake.chart, r.fake.series)!
    expect(time.getControlPoints(vp)).toEqual([{ index: 0, x: 400, y: 360 }])
    drag(r.container, [400, 360], [420, 380])
    expect(pixels(r, time)).toEqual([[420, 380]])
  })
})

describe('a line’s words', () => {
  it('are typed on the chart from a click on the invitation of the selected line, and Escape keeps them and the line selected', () => {
    vi.useFakeTimers()
    const r = make()
    const line = placeLine(r, [100, 200], [300, 200])
    paintFrame(r, line)
    // The invitation stands centred on the line's middle, its words' middle 11px above the line.
    click(r.container, 200, 189)
    vi.runOnlyPendingTimers()
    const session = r.handle.textEdit()!
    expect(session.id).toBe(line.id)
    expect(session.inline?.frame()).toMatchObject({ angle: 0, lineHeight: 14, align: 'center', lines: 1 })
    r.handle.commitText('Hi')
    expect(line.props.text).toBe('Hi')
    expect(r.handle.selectedDrawing()?.id).toBe(line.id)
    // A click beside the words only keeps the line selected; one on them types again.
    click(r.container, 120, 200)
    vi.runOnlyPendingTimers()
    expect(r.handle.textEdit()).toBeNull()
    click(r.container, 200, 189)
    vi.runOnlyPendingTimers()
    expect(r.handle.textEdit()?.id).toBe(line.id)
  })

  it('are never invited on an unselected line, and a click there selects nothing', () => {
    vi.useFakeTimers()
    const r = make()
    const line = placeLine(r, [100, 200], [300, 200])
    r.handle.deselect()
    paintFrame(r, line)
    click(r.container, 200, 189)
    vi.runOnlyPendingTimers()
    expect(r.handle.textEdit()).toBeNull()
    expect(r.handle.hasSelection()).toBe(false)
  })
})

describe('a double-click on a line', () => {
  it('opens its settings, the line selected', () => {
    const commands: string[] = []
    const r = make({ execute: (command) => (commands.push(command), true) })
    for (const [tool, at] of [
      ['trend_line', [100, 200]],
      ['horizontal_ray', [100, 250]],
      ['cross_line', [500, 300]],
    ] as const) {
      r.handle.armTool(tool)
      click(r.container, at[0], at[1])
      if (tool === 'trend_line') click(r.container, 300, 200)
      r.handle.deselect()
    }
    r.container.dispatchEvent(new MouseEvent('dblclick', { clientX: 200, clientY: 200, bubbles: true }))
    expect(commands).toEqual(['chart.drawings.settings'])
    expect(r.handle.selectedDrawing()?.type).toBe('trend_line')
    r.container.dispatchEvent(new MouseEvent('dblclick', { clientX: 700, clientY: 250, bubbles: true }))
    expect(r.handle.selectedDrawing()?.type).toBe('horizontal_ray')
    r.container.dispatchEvent(new MouseEvent('dblclick', { clientX: 500, clientY: 50, bubbles: true }))
    expect(r.handle.selectedDrawing()?.type).toBe('cross_line')
    expect(commands).toHaveLength(3)
  })
})
