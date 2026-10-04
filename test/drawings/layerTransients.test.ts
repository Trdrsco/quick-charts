// @vitest-environment happy-dom
// Measure and Zoom: the two tools that keep nothing. Each one runs ONCE. The action completes on
// the release of a drag or on the second click, and the tool disarms there whatever Stay in
// Drawing Mode says, because the viewer asked to measure this, not to keep measuring. Disarming
// hands the chart its own pan and zoom back, so the next drag navigates. The measure readout stays
// on screen until that next gesture, and Escape clears it too. Neither tool ever leaves a drawing
// behind.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { click, drag, pointer } from './fakeChart'
import { rig, type Rig } from './layerRig'

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}
/** Whether the chart's own navigation is free, as the last lock the layer applied left it. */
const navigable = (r: Rig): boolean => {
  const last = r.fake.applied[r.fake.applied.length - 1]
  return last?.handleScroll === true && (last?.handleScale as { mouseWheel?: boolean } | undefined)?.mouseWheel === true
}
const escape = (r: Rig): void => {
  r.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
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

describe('measure', () => {
  it('disarms on the release of its drag, gives the chart back its navigation, and keeps nothing', () => {
    const r = make()
    r.handle.armTool('measure')
    expect(navigable(r)).toBe(false)
    drag(r.container, [100, 100], [300, 200])
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
    expect(r.handle.export()).toEqual([])
  })

  it('disarms on the second click of a click, move, click', () => {
    const r = make()
    r.handle.armTool('measure')
    click(r.container, 100, 100)
    expect(r.handle.activeTool()).toBe('measure')
    window.dispatchEvent(pointer('pointermove', 200, 150))
    click(r.container, 300, 200)
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
    expect(r.handle.export()).toEqual([])
  })

  it('disarms even with stay in drawing mode on, because one measurement is what was asked for', () => {
    const r = make()
    r.workflow.stayInDrawingMode = true
    r.handle.armTool('measure')
    drag(r.container, [100, 100], [300, 200])
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
  })

  it('leaves the readout up until the next gesture, which navigates rather than measuring again', () => {
    const r = make()
    r.handle.armTool('measure')
    drag(r.container, [100, 100], [300, 200])
    r.container.dispatchEvent(pointer('pointermove', 200, 150))
    expect(r.handle.hovered()).not.toBeNull()

    drag(r.container, [50, 300], [80, 320])
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
    r.container.dispatchEvent(pointer('pointermove', 200, 150))
    expect(r.handle.hovered()).toBeNull()
    expect(r.handle.export()).toEqual([])
  })

  it('clears a readout left standing when Escape is pressed after the tool disarmed', () => {
    const r = make()
    r.handle.armTool('measure')
    drag(r.container, [100, 100], [300, 200])
    escape(r)
    r.container.dispatchEvent(pointer('pointermove', 200, 150))
    expect(r.handle.hovered()).toBeNull()
  })

  it('runs the cancel verb through its door for an open placement and a completed readout', () => {
    const ran: string[] = []
    let r!: Rig
    r = make({
      execute: (command) => {
        ran.push(command)
        r.handle.armTool(null)
        return true
      },
    })
    r.handle.armTool('measure')
    click(r.container, 100, 100)
    escape(r)
    expect(ran).toEqual(['chart.drawings.cancel'])

    // The readout is layer-owned paint, but Cancel remains one command whichever surface invokes
    // it, so access policy and availability cannot disagree with the keyboard path.
    r.handle.armTool('measure')
    drag(r.container, [100, 100], [300, 200])
    escape(r)
    expect(ran).toEqual(['chart.drawings.cancel', 'chart.drawings.cancel'])
    r.container.dispatchEvent(pointer('pointermove', 200, 150))
    expect(r.handle.hovered()).toBeNull()
  })
})

describe('zoom', () => {
  it('sets the visible range to the box it dragged, then disarms and unlocks', () => {
    const r = make()
    r.handle.armTool('zoom')
    drag(r.container, [100, 100], [300, 200])
    expect(r.fake.visibleRange).toEqual({ from: r.fake.timeAt(100), to: r.fake.timeAt(300) })
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
    expect(r.handle.export()).toEqual([])
  })

  it('disarms and unlocks after a box too small to be a range, leaving the chart alone', () => {
    const r = make()
    r.handle.armTool('zoom')
    drag(r.container, [100, 100], [102, 140])
    expect(r.fake.visibleRange).toBeNull()
    expect(r.handle.activeTool()).toBeNull()
    expect(navigable(r)).toBe(true)
    expect(r.handle.export()).toEqual([])
  })

  it('leaves no box behind for the next gesture to trip over', () => {
    const r = make()
    r.handle.armTool('zoom')
    drag(r.container, [100, 100], [300, 200])
    r.container.dispatchEvent(pointer('pointermove', 200, 150))
    expect(r.handle.hovered()).toBeNull()
  })
})
