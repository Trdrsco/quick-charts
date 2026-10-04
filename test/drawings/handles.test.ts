// @vitest-environment happy-dom
// Every handle stands where its drawing paints the thing it moves. A handle whose anchor's time the
// drawing does not paint (a position's stop, a flat side, a wedge's second ray, an ellipse's
// vertical radius) stands on the drawing all the same, so it never stays behind as the drawing's
// other handles move it.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../src/drawings/tools'
import { viewportOf } from '../../src/internal/drawings/index'
import type { Anchor } from '../../src/internal/drawings/index'
import { drag, fakeChart, pointer } from './fakeChart'
import { rig, type Rig } from './layerRig'

const fake = fakeChart()
const vp = viewportOf(fake.chart, fake.series)!
const at = (x: number, y: number): Anchor => ({ time: vp.timeAt(x)!, price: vp.priceAt(y)! })

/** The drawing's handles by index, after `index` moves to the pixel given. */
function handlesAfter(type: string, anchors: Anchor[], index: number, to: [number, number]) {
  const drawing = drawingTools.create(type, 'd', anchors)!
  drawing.updateAnchor(index, at(...to))
  const points = Object.fromEntries(drawing.getControlPoints(vp).map((point) => [point.index, point]))
  return { drawing, points }
}

describe('a handle whose time the drawing does not paint', () => {
  for (const type of ['long_position', 'short_position']) {
    it(`stands on ${type}'s far edge with the target as the box's width changes`, () => {
      const { drawing, points } = handlesAfter(type, [at(200, 200), at(400, 120), at(400, 280)], 1, [520, 120])
      expect(points[2]!.x).toBeCloseTo(points[1]!.x, 6)
      expect(points[2]!.x).toBeCloseTo(520, 6)
      expect(drawing.testHit({ x: points[2]!.x, y: points[2]!.y }, vp)).toBe(true)
    })
  }

  it("stands at the flat side's end as the sloped side moves", () => {
    const { drawing, points } = handlesAfter('flat_top_bottom', [at(200, 100), at(400, 160), at(300, 260)], 1, [520, 140])
    expect(points[2]).toMatchObject({ x: points[1]!.x, y: 260 })
    expect(drawing.testHit({ x: points[2]!.x, y: points[2]!.y }, vp)).toBe(true)
  })

  it("stands at the end of the wedge's second ray as the first ray changes length", () => {
    const { drawing, points } = handlesAfter('fib_wedge', [at(200, 200), at(300, 200), at(200, 100)], 1, [250, 200])
    // The first ray is now 50px long, and the second runs as long at its own angle.
    expect(Math.hypot(points[2]!.x - 200, points[2]!.y - 200)).toBeCloseTo(50, 6)
    expect(points[2]!.x).toBeCloseTo(200, 6)
    expect(drawing.testHit({ x: points[2]!.x, y: points[2]!.y }, vp)).toBe(true)
  })

  it('stands on the ellipse at its centre as the diameter moves', () => {
    const { drawing, points } = handlesAfter('ellipse', [at(200, 200), at(400, 200), at(300, 150)], 1, [600, 200])
    expect(points[2]).toMatchObject({ x: 400, y: 150 })
    expect(drawing.testHit({ x: points[2]!.x, y: points[2]!.y }, vp)).toBe(true)
  })
})

describe("a position's stop handle in the chart", () => {
  let r: Rig | null = null
  afterEach(() => {
    r?.handle.destroy()
    r?.container.remove()
    r = null
  })

  it('is grabbed where it stands after the box widens, and moves the stop', () => {
    r = rig()
    r.handle.armTool('long_position')
    r.container.dispatchEvent(pointer('pointerdown', 200, 200))
    window.dispatchEvent(pointer('pointerup', 200, 200))
    const [entry, target, stop] = r.handle.export()[0]!.anchors
    const targetX = fake.xOf(Number(target!.time))
    const stopY = fake.yOf(stop!.price)
    // Widen the box by its target handle, then press the stop's handle on the new far edge.
    drag(r.container, [targetX, fake.yOf(target!.price)], [targetX + 120, fake.yOf(target!.price)])
    drag(r.container, [targetX + 120, stopY], [targetX + 120, stopY + 40])
    const after = r.handle.export()[0]!.anchors
    expect(Number(after[1]!.time)).toBeGreaterThan(Number(target!.time))
    expect(after[2]!.price).toBeCloseTo(fake.priceAt(stopY + 40), 6)
    expect(after[0]).toEqual(entry)
  })
})
