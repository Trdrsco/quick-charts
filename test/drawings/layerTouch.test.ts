// @vitest-environment happy-dom
// A finger draws as well as a pointer does. A touch takes a drawing it lands near, grabs a handle
// from a thumb's width away, lets a tap wobble without drawing a stub, brings a placement's end to
// its second touch at once, moves a drawing only once it sets off, shows the point it places or
// drags through the crosshair, and ends cleanly when the browser takes it away. A mouse doing the
// same keeps its exact behavior.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { click, drag, pointer } from './fakeChart'
import { rig, type Rig } from './layerRig'

const TOUCH = { pointerType: 'touch' } as const

let rigs: Rig[] = []
const make = (): Rig => {
  const r = rig()
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
})

/** A trend line from (100, 100) to (300, 200), drawn by a mouse and left unselected. */
function line(r: Rig): string {
  r.handle.armTool('trend_line')
  drag(r.container, [100, 100], [300, 200])
  click(r.container, 900, 20)
  return r.handle.export()[0]!.id
}

describe('a touch on a drawing', () => {
  it("takes a line it lands within a thumb's reach of, where a mouse there misses", () => {
    const r = make()
    const id = line(r)
    // 12px under the line at x 200: outside a pointer's band, inside a finger's.
    click(r.container, 200, 162)
    expect(r.events.selections.at(-1)).toBeNull()
    click(r.container, 200, 162, TOUCH)
    expect(r.events.selections.at(-1)).toBe(id)
  })

  it("grabs a handle from a thumb's width away", () => {
    const r = make()
    line(r)
    click(r.container, 200, 150)
    const before = r.handle.export()[0]!.anchors[0]!
    // 16px right of the first handle: a mouse there grabs nothing, a finger drags the handle.
    drag(r.container, [116, 100], [116, 60])
    expect(r.handle.export()[0]!.anchors[0]).toEqual(before)
    click(r.container, 200, 150)
    drag(r.container, [116, 100], [116, 60], TOUCH)
    expect(r.handle.export()[0]!.anchors[0]!.price).toBeCloseTo(r.fake.priceAt(60), 6)
  })

  it('moves a drawing only once the finger clearly sets off', () => {
    const r = make()
    line(r)
    click(r.container, 200, 150)
    const at = r.handle.export()[0]!.anchors
    const changes = r.events.changes
    r.container.dispatchEvent(pointer('pointerdown', 200, 150, TOUCH))
    window.dispatchEvent(pointer('pointermove', 203, 152, TOUCH))
    window.dispatchEvent(pointer('pointerup', 203, 152, TOUCH))
    expect(r.handle.export()[0]!.anchors).toEqual(at)
    expect(r.events.changes).toBe(changes)
    drag(r.container, [200, 150], [240, 150], TOUCH)
    expect(r.handle.export()[0]!.anchors).not.toEqual(at)
  })

  it("claims a touch that took a drawing from the page's scroll, and leaves one on empty chart to it", () => {
    const r = make()
    line(r)
    const begin = (x: number, y: number): boolean => {
      r.container.dispatchEvent(pointer('pointerdown', x, y, TOUCH))
      const start = new Event('touchstart', { bubbles: true, cancelable: true })
      r.container.dispatchEvent(start)
      window.dispatchEvent(pointer('pointerup', x, y, TOUCH))
      return start.defaultPrevented
    }
    expect(begin(200, 150)).toBe(true)
    expect(begin(900, 20)).toBe(false)
  })

  it('ends a grab the browser takes away where it stands, and gives the chart its navigation back', () => {
    const r = make()
    line(r)
    r.container.dispatchEvent(pointer('pointerdown', 200, 150, TOUCH))
    window.dispatchEvent(pointer('pointermove', 260, 150, TOUCH))
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerType: 'touch' }))
    const stood = r.handle.export()[0]!.anchors
    window.dispatchEvent(pointer('pointermove', 320, 150, TOUCH))
    expect(r.handle.export()[0]!.anchors).toEqual(stood)
    expect(r.fake.applied.at(-1)).toMatchObject({ handleScroll: true, handleScale: { mouseWheel: true, pinch: false } })
  })
})

describe('a touch placing a drawing', () => {
  it('lets a tap wobble without drawing a stub, where a mouse moving as far draws one', () => {
    const r = make()
    r.handle.armTool('trend_line')
    r.container.dispatchEvent(pointer('pointerdown', 100, 100))
    window.dispatchEvent(pointer('pointerup', 108, 100))
    expect(r.handle.count()).toBe(1)
    r.handle.armTool('trend_line')
    r.container.dispatchEvent(pointer('pointerdown', 400, 100, TOUCH))
    window.dispatchEvent(pointer('pointerup', 408, 100, TOUCH))
    expect(r.handle.count()).toBe(1)
  })

  it("brings the line's end to the second touch at once, and lands it there", () => {
    const r = make()
    r.handle.armTool('trend_line')
    click(r.container, 100, 100, TOUCH)
    r.container.dispatchEvent(pointer('pointerdown', 300, 200, TOUCH))
    expect(r.fake.crosshair.at(-1)).toMatchObject({ price: r.fake.priceAt(200) })
    window.dispatchEvent(pointer('pointerup', 300, 200, TOUCH))
    expect(r.handle.count()).toBe(1)
    expect(r.handle.export()[0]!.anchors[1]!.price).toBeCloseTo(r.fake.priceAt(200), 6)
  })

  it('shows the point under the finger through the crosshair, and clears it as the finger lifts', () => {
    const r = make()
    r.handle.armTool('trend_line')
    drag(r.container, [100, 100], [300, 200], TOUCH)
    const shown = r.fake.crosshair.filter((point) => point !== null)
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.at(-1)!.price).toBeCloseTo(r.fake.priceAt(200), 6)
    expect(r.fake.crosshair.at(-1)).toBeNull()
  })

  it('leaves the crosshair to the mouse, which shows its own pointer', () => {
    const r = make()
    r.handle.armTool('trend_line')
    drag(r.container, [100, 100], [300, 200])
    expect(r.fake.crosshair).toEqual([])
  })
})
