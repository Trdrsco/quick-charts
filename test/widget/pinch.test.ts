// @vitest-environment happy-dom
// Pinch zoom that follows the fingers: the bars spread exactly as far as the fingers do, the point
// under their midpoint stays under it on every frame as the midpoint travels, a lock on the pointer
// holds the pinch off, and a pan the first finger began before the second landed stays a pan.
//
// The time scale here is the renderer's own in miniature: a write reaches it only on its next frame,
// as the renderer queues one, while a read answers with what the last frame applied. So a pinch that
// read its own writes back would be caught here, landing off the fingers between frames.
import { afterEach, describe, expect, it } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachPinch } from '../../src/widget/pinch'
import { pointerLock } from '../../src/pointerInput'

/** The plot's width, the newest bar's index, and the renderer's least and greatest spacing. */
const WIDTH = 600
const LAST = 999
const MIN = 0.5
const MAX = 50

/** A time scale with the renderer's mapping: a visible logical range `from`..`to` draws
 *  `WIDTH / (to - from + 1)` pixels to a bar (clamped to its bounds) with `to` standing `scroll`
 *  bars past the newest bar, and a pixel `x` falls on bar `to + 0.5 - (WIDTH - 1 - x) / spacing`. */
function scaleModel() {
  const state = { spacing: 8, scroll: 4, handleScale: pointerLock(false).handleScale as object }
  const queued: { from: number; to: number }[] = []
  const element = document.createElement('div')
  const right = (): number => LAST + state.scroll
  const chart = {
    options: () => ({ handleScale: state.handleScale }),
    chartElement: () => element,
    priceScale: () => ({ width: () => 0 }),
    timeScale: () => ({
      width: () => WIDTH,
      options: () => ({ barSpacing: state.spacing, minBarSpacing: MIN, maxBarSpacing: MAX }),
      getVisibleLogicalRange: () => ({ from: right() - WIDTH / state.spacing + 1, to: right() }),
      setVisibleLogicalRange: (range: { from: number; to: number }) => void queued.push({ ...range }),
      scrollPosition: () => state.scroll,
    }),
  }
  /** The renderer's next frame: every queued write applied in order. */
  const frame = (): void => {
    for (const range of queued.splice(0)) {
      state.spacing = Math.min(MAX, Math.max(MIN, WIDTH / (range.to - range.from + 1)))
      state.scroll = range.to - LAST
    }
  }
  /** Where a pixel falls on the bars now, fractionally: the point a finger touches. */
  const barAt = (x: number): number => right() + 0.5 - (WIDTH - 1 - x) / state.spacing
  return { state, element, chart: chart as unknown as IChartApi, frame, barAt, queued }
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
  it('spreads the bars exactly as far as the fingers spread, on the frame after the first move', () => {
    const p = pinchOn()
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    p.frame()
    expect(p.state.spacing).toBeCloseTo(16, 9)
    p.fire('touchmove', 275, 325)
    p.frame()
    expect(p.state.spacing).toBeCloseTo(4, 9)
  })

  it('keeps the point under the fingers under them on every frame, however many moves a frame carries', () => {
    const p = pinchOn()
    p.fire('touchstart', 203, 297)
    const pinched = p.barAt(250)
    // Moves arrive faster than frames: several land before each frame applies.
    const path: [number, number][] = [[198, 302], [190, 310], [170, 330], [150, 360], [140, 380], [160, 400], [200, 420], [240, 430]]
    for (let i = 0; i < path.length; i += 2) {
      p.fire('touchmove', ...path[i]!)
      p.fire('touchmove', ...path[i + 1]!)
      p.frame()
      const [a, b] = path[i + 1]!
      expect(p.barAt((a + b) / 2)).toBeCloseTo(pinched, 9)
    }
  })

  it('writes the spacing and the scroll as one range per move, and never reads its writes back', () => {
    const p = pinchOn()
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 240, 360)
    p.fire('touchmove', 230, 370)
    expect(p.queued).toHaveLength(2)
    // Without a frame between them, the second move is still computed from the start, not from the
    // first move's unapplied write: applying both lands where the second alone would.
    const both = p.queued.at(-1)!
    p.frame()
    expect(p.state.scroll).toBeCloseTo(both.to - LAST, 9)
  })

  it('holds the point at the renderer’s limit, where the spacing stops growing', () => {
    const p = pinchOn()
    p.fire('touchstart', 290, 310)
    const pinched = p.barAt(300)
    p.fire('touchmove', 0, 600)
    p.frame()
    expect(p.state.spacing).toBe(MAX)
    expect(p.barAt(300)).toBeCloseTo(pinched, 9)
  })

  it('moves nothing while a lock holds the pointer, and stops where it stands when one is taken', () => {
    const p = pinchOn()
    p.state.handleScale = pointerLock(true).handleScale
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    p.frame()
    expect(p.state.spacing).toBe(8)
    p.state.handleScale = pointerLock(false).handleScale
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    p.frame()
    const stood = p.state.spacing
    p.state.handleScale = pointerLock(true).handleScale
    p.fire('touchmove', 100, 500)
    p.frame()
    expect(p.state.spacing).toBe(stood)
  })

  it('leaves a pan to the renderer when the first finger moved before the second landed', () => {
    const p = pinchOn()
    p.fire('touchstart', 200)
    p.fire('touchmove', 210)
    p.fire('touchstart', 210, 310)
    p.fire('touchmove', 160, 360)
    p.frame()
    expect(p.state.spacing).toBe(8)
    // Both fingers up and down again: a fresh gesture pinches.
    p.fire('touchend')
    p.fire('touchstart', 210)
    p.fire('touchstart', 210, 310)
    p.fire('touchmove', 160, 360)
    p.frame()
    expect(p.state.spacing).toBeCloseTo(16, 9)
  })

  it('stops listening when it is taken down', () => {
    const p = pinchOn()
    detach!()
    detach = null
    p.fire('touchstart', 250, 350)
    p.fire('touchmove', 200, 400)
    p.frame()
    expect(p.state.spacing).toBe(8)
  })
})
