// @vitest-environment happy-dom
// What a drawing's own lock protects, and what it does not. The lock pins the object where it
// stands: nothing may move it, reshape it, retype its text, erase it under the eraser or duplicate
// it out from under a drag, and it still selects, because selecting is the way back to unlocking
// it. A deliberate delete or duplicate the viewer asked for by name still acts, so the toolbar
// button, the menu row and the key never say they did something they did not do. Lock all is the
// other lock: it suspends the whole chart, including those deliberate actions and anything new
// arriving on a paste.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { drag, click } from './fakeChart'
import { rig, type Rig } from './layerRig'

let rigs: Rig[] = []
const make = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = rig(options)
  rigs.push(r)
  return r
}
/** One rectangle, locked, selected. */
const lockedRectangle = (options?: Parameters<typeof rig>[0]): Rig => {
  const r = make(options)
  r.handle.armTool('rectangle')
  drag(r.container, [10, 10], [100, 100])
  r.handle.setLocked(true)
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

describe('a drawing pinned down by its own lock', () => {
  it('still selects under the pointer, which is the only way back to unlocking it', () => {
    const r = lockedRectangle()
    click(r.container, 300, 300)
    expect(r.handle.hasSelection()).toBe(false)
    click(r.container, 10, 55) // the left edge; a rectangle without a fill takes hits on its edges
    expect(r.handle.selected()?.locked).toBe(true)
  })

  it('takes a deliberate delete from the toolbar or the menu', () => {
    const r = lockedRectangle()
    r.handle.deleteSelected()
    expect(r.handle.count()).toBe(0)
  })

  it('takes a deliberate delete from the keyboard, through the door it was given', () => {
    const ran: string[] = []
    const r = lockedRectangle({ execute: (command) => (ran.push(command), true) })
    r.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    expect(ran).toEqual(['chart.drawings.deleteSelected'])
    // The door ran the verb, so the layer's own action is what the command would have executed.
    r.handle.deleteSelected()
    expect(r.handle.count()).toBe(0)
  })

  it('takes a deliberate clone, and the copy is free to move', () => {
    const r = lockedRectangle()
    r.handle.clone()
    expect(r.handle.count()).toBe(2)
    expect(r.handle.export()[1]?.options?.locked).toBe(true)
    expect(r.handle.selected()?.id).toBe(r.handle.export()[1]!.id)
  })

  it('copies and pastes, as it always did', () => {
    const r = lockedRectangle()
    r.handle.copy()
    expect(r.handle.canPaste()).toBe(true)
    expect(r.handle.paste()).toBe(true)
    expect(r.handle.count()).toBe(2)
  })

  it('refuses an inline text edit, and takes one as soon as the lock comes off', () => {
    // The editor mounts on the next tick, past the gesture that asked for it.
    vi.useFakeTimers()
    const r = make()
    r.handle.armTool('trend_line')
    drag(r.container, [10, 10], [100, 100])
    r.handle.setLocked(true)
    r.handle.editSelectedText()
    vi.runAllTimers()
    expect(r.events.texts).toHaveLength(0)

    r.handle.setLocked(false)
    r.handle.editSelectedText()
    vi.runAllTimers()
    expect(r.events.texts).toHaveLength(1)
  })

  it('refuses a move, a reshape, an eraser press and a modifier-drag duplicate', () => {
    const r = lockedRectangle()
    const before = r.handle.export()[0]!
    drag(r.container, [10, 55], [110, 155])
    expect(r.handle.export()[0]?.anchors).toEqual(before.anchors)

    drag(r.container, [10, 10], [40, 40])
    expect(r.handle.export()[0]?.anchors).toEqual(before.anchors)

    drag(r.container, [10, 55], [110, 55], { ctrlKey: true })
    expect(r.handle.count()).toBe(1)

    r.handle.armTool('eraser')
    click(r.container, 10, 55)
    expect(r.handle.count()).toBe(1)
  })
})

describe('lock all, over every drawing at once', () => {
  it('refuses the deliberate delete and clone as well, and takes the selection away', () => {
    const r = lockedRectangle()
    r.handle.setLocked(false)
    r.handle.setAllLocked(true)
    expect(r.handle.hasSelection()).toBe(false)

    r.handle.select(r.handle.export()[0]!.id)
    r.handle.deleteSelected()
    r.handle.clone()
    expect(r.handle.count()).toBe(1)

    r.handle.setAllLocked(false)
    r.handle.select(r.handle.export()[0]!.id)
    r.handle.clone()
    expect(r.handle.count()).toBe(2)
  })
})

describe('lock all, over the drawings that are not there yet', () => {
  it('refuses a paste while it holds, and takes the same one once it is released', () => {
    const r = lockedRectangle()
    r.handle.setLocked(false)
    r.handle.copy()
    r.handle.setAllLocked(true)
    expect(r.handle.paste()).toBe(false)
    expect(r.handle.count()).toBe(1)

    r.handle.setAllLocked(false)
    expect(r.handle.paste()).toBe(true)
    expect(r.handle.count()).toBe(2)
  })
})

describe('the sweep', () => {
  it('spares a locked drawing unless it is asked to take it', () => {
    const r = lockedRectangle()
    r.handle.armTool('rectangle')
    drag(r.container, [200, 10], [300, 100])
    expect(r.handle.counts()).toEqual({ total: 2, locked: 1 })

    r.handle.clearAll()
    expect(r.handle.count()).toBe(1)
    r.handle.clearAll(true)
    expect(r.handle.count()).toBe(0)
  })
})
