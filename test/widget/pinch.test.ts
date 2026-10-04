// @vitest-environment happy-dom
// Pinch zoom that follows the fingers: the bars spread exactly as far as the fingers do, the bar
// under their midpoint stays under it as the midpoint travels, a lock on the pointer holds the pinch
// off, and a pan the first finger began before the second landed stays a pan. Driven through the
// gesture box's own touch listeners over a time scale that maps bars to pixels as the renderer does.
import { afterEach, describe, expect, it } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachPinch } from '../../src/widget/pinch'
import { pointerLock } from '../../src/pointerInput'

/** The plot's width, the newest bar's index, and the renderer's least and greatest spacing. */
const WIDTH = 600
const LAST = 999
const MIN = 0.5
const MAX = 50

/** A time scale that maps bars to pixels as the renderer's own does: bar `i`'s centre stands at
 *  `WIDTH - (LAST + scroll - i + 0.5) * spacing - 1`, a pixel answers with the whole bar it falls in
 *  (rounded up, as the renderer rounds), the spacing it is given is clamped, and the chart's lock
 *  reads from the options the pointer lock writes. */
function scaleModel() {
  const state = { spacing: 8, scroll: 4, handleScale: pointerLock(false).handleScale as object }
  const element = document.createElement('div')
  const chart = {
    options: () => ({ handleScale: state.handleScale }),
    chartElement: () => element,
    priceScale: () => ({ width: () => 0 }),
    timeScale: () => ({
      options: () => ({ barSpacing: state.spacing }),
      applyOptions: (next: { barSpacing?: number }) => {
        if (next.barSpacing !== undefined) state.spacing = Math.min(MAX, Math.max(MIN, next.barSpacing))
      },
      scrollPosition: () => state.scroll,
      scrollToPosition: (position: number) => {
        state.scroll = position
      },
      logicalToCoordinate: (index: number) => WIDTH - (LAST + state.scroll - index + 0.5) * state.spacing - 1,
      coordinateToLogical: (x: number) => Math.ceil(barAt(x)),
    }),
  }
  /** Where a pixel falls on the bars now, fractionally: the point a finger touches. */
  const barAt = (x: number): number => LAST + state.scroll + 0.5 - (WIDTH - 1 - x) / state.spacing
  return { state, element, chart: chart as unknown as IChartApi, barAt }
}

let detach: (() => void) | null = null
afterEach(() => {
  detach?.()
  detach = null
})

function pinchOn() {
  const model = scaleModel()
  const pinch = attachPinch({ chart: model.chart, target: model.element })
  detach = () => pinch.destroy()
  /** A touch event carrying fingers at these x positions, all at one height. */
  const fire = (type: string, ...xs: number[]): void => {
    const touches = xs.map((clientX, identifier) => ({ clientX, clientY: 100, identifier }))
    model.element.dispatchEvent(Object.assign(new Event(type), { touches, changedTouches: touches }))
  }
  return { ...model, fire }
}

describe('a pinch', () => {
  it('spreads the bars exactly as far as the fingers spread, and narrows them the same way', () => {
    const p = pinchOn()
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    expect(p.state.spacing).toBeCloseTo(16, 6)
    p.fire('touchmove', 275, 325)
    expect(p.state.spacing).toBeCloseTo(4, 6)
  })

  it('keeps the bar under the fingers’ midpoint under it as the midpoint travels', () => {
    const p = pinchOn()
    p.fire('touchstart', 200, 300)
    const pinched = p.barAt(250)
    p.fire('touchmove', 300, 500)
    expect(p.barAt(400)).toBeCloseTo(pinched, 6)
    p.fire('touchmove', 100, 160)
    expect(p.barAt(130)).toBeCloseTo(pinched, 6)
  })

  it('holds the midpoint at the renderer’s limit, where the spacing stops growing', () => {
    const p = pinchOn()
    p.fire('touchstart', 290, 310)
    const pinched = p.barAt(300)
    p.fire('touchmove', 0, 600)
    expect(p.state.spacing).toBe(MAX)
    expect(p.barAt(300)).toBeCloseTo(pinched, 6)
  })

  it('moves nothing while a lock holds the pointer, and stops where it stands when one is taken', () => {
    const p = pinchOn()
    p.state.handleScale = pointerLock(true).handleScale
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    expect(p.state.spacing).toBe(8)
    p.state.handleScale = pointerLock(false).handleScale
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    const stood = p.state.spacing
    p.state.handleScale = pointerLock(true).handleScale
    p.fire('touchmove', 100, 500)
    expect(p.state.spacing).toBe(stood)
  })

  it('leaves a pan to the renderer when the first finger moved before the second landed', () => {
    const p = pinchOn()
    p.fire('touchstart', 200)
    p.fire('touchmove', 210)
    p.fire('touchstart', 210, 310)
    p.fire('touchmove', 160, 360)
    expect(p.state.spacing).toBe(8)
    // Both fingers up and down again: a fresh gesture pinches.
    p.fire('touchend')
    p.fire('touchstart', 210)
    p.fire('touchstart', 210, 310)
    p.fire('touchmove', 160, 360)
    expect(p.state.spacing).toBeCloseTo(16, 6)
  })

  it('stops listening when it is taken down', () => {
    const p = pinchOn()
    detach!()
    detach = null
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    expect(p.state.spacing).toBe(8)
  })
})
