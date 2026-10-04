// @vitest-environment happy-dom
// A finger held still on a scale raises the chart's context menu; held on the plot, it is the
// crosshair's, and the plane raises nothing. Driven through the plane's own touch listeners.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LONG_PRESS_MS } from '../../src/pointerInput'
import { attachPointerPlane, type PointerPlane } from '../../src/widget/pointer'

let plane: PointerPlane | null = null
let raised: [number, number][] = []
const gestures = document.createElement('div')

/** One finger pressed at a viewport point and held past the hold's time. */
function hold(x: number, y: number) {
  const touch = { clientX: x, clientY: y, identifier: 1, target: gestures }
  gestures.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [touch], changedTouches: [touch] }))
  vi.advanceTimersByTime(LONG_PRESS_MS + 10)
}

beforeEach(() => {
  vi.useFakeTimers()
  raised = []
  plane = attachPointerPlane({
    gestures,
    toolArmed: () => false,
    disposed: () => false,
    raiseAt: (x, y) => {
      raised.push([x, y])
    },
    plotArea: () => ({ left: 40, right: 340, bottom: 500 }),
  })
})

afterEach(() => {
  plane?.destroy()
  vi.useRealTimers()
})

describe('a finger held still', () => {
  it('on the plot leaves the menu shut, the crosshair taking the hold', () => {
    hold(200, 250)
    expect(raised).toEqual([])
  })

  it('on the price scale or the time scale raises the menu where it rests', () => {
    hold(360, 250)
    hold(200, 520)
    expect(raised).toEqual([
      [360, 250],
      [200, 520],
    ])
  })
})
