// @vitest-environment happy-dom
// A flick's coast: one finger lifting while the view still moves lets it coast on in the same
// direction, slow smoothly and come to rest, never faster than the cap and never far; a finger that
// stopped before it lifted, a crosshair scrub that panned nothing, and two fingers throw nothing; and
// a touch stops the coast where it stands. Driven in the renderer's own order: each move reaches the
// gesture box first, and the renderer, listening on the document, applies it after.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachFling, type Fling } from '../../src/widget/fling'
import { FLING_MAX_PX_PER_MS, FLING_REST_PX_PER_MS } from '../../src/pointerInput'

const SPACING = 8

let fling: Fling | null = null
afterEach(() => {
  fling?.destroy()
  fling = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function rig() {
  const view = { scroll: 4 }
  const target = document.createElement('div')
  const chart = {
    timeScale: () => ({
      options: () => ({ barSpacing: SPACING }),
      scrollPosition: () => view.scroll,
      scrollToPosition: (position: number) => {
        view.scroll = position
      },
    }),
  } as unknown as IChartApi
  let now = 1_000
  const due = new Map<number, FrameRequestCallback>()
  let next = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    due.set(++next, callback)
    return next
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => due.delete(id))
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  fling = attachFling({ chart, target })

  const fire = (type: string, fingers: number): void => {
    const touches = Array.from({ length: fingers }, (_, identifier) => ({ clientX: 100, clientY: 100, identifier }))
    target.dispatchEvent(Object.assign(new Event(type), { touches, changedTouches: touches }))
  }
  return {
    view,
    fire,
    /** One move of one finger at a moment: the gesture box hears it, then the renderer moves the
     *  view by `bars`. */
    move(at: number, bars: number, fingers = 1) {
      now = at
      fire('touchmove', fingers)
      view.scroll += bars
    },
    at(t: number) {
      now = t
    },
    /** Run the coast frame by frame at 60 frames a second, and answer how far each frame moved. */
    coast(): number[] {
      const steps: number[] = []
      for (let i = 0; i < 400 && due.size > 0; i++) {
        now += 16
        const before = view.scroll
        const run = [...due.values()]
        due.clear()
        for (const callback of run) callback(now)
        steps.push(view.scroll - before)
      }
      return steps
    },
    pending: () => due.size,
  }
}

/** A drag back through history: the view moves `bars` every 16ms for `moves` moves. */
function drag(r: ReturnType<typeof rig>, bars: number, moves = 6, from = 1_000): number {
  r.at(from)
  r.fire('touchstart', 1)
  let t = from
  for (let i = 0; i < moves; i++) {
    t += 16
    r.move(t, bars)
  }
  return t
}

describe('a flick', () => {
  it('coasts on in its own direction, slows smoothly, and comes to rest', () => {
    const r = rig()
    // Half a pixel a millisecond back through history: a gentle flick.
    const end = drag(r, -1)
    r.at(end + 5)
    r.fire('touchend', 0)
    const lifted = r.view.scroll
    const steps = r.coast()
    expect(steps.length).toBeGreaterThan(10)
    expect(steps.every((step) => step < 0)).toBe(true)
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i]!)).toBeLessThan(Math.abs(steps[i - 1]!))
    expect(Math.abs(steps.at(-1)!) * SPACING).toBeLessThan(FLING_REST_PX_PER_MS * 16)
    expect(r.view.scroll).toBeLessThan(lifted)
    expect(r.pending()).toBe(0)
  })

  it('leaves the finger no faster than the cap, and coasts no further than the cap allows', () => {
    const r = rig()
    // Twenty pixels a millisecond: a wild throw.
    const end = drag(r, -40)
    r.at(end + 5)
    r.fire('touchend', 0)
    const lifted = r.view.scroll
    const steps = r.coast()
    // The first frame moves under the capped speed for its 16ms.
    expect(Math.abs(steps[0]!) * SPACING).toBeLessThanOrEqual(FLING_MAX_PX_PER_MS * 16)
    // At most about 400 pixels in all: the cap over the decay.
    expect(Math.abs(r.view.scroll - lifted) * SPACING).toBeLessThan(400)
  })

  it('throws nothing when the finger stood still before it lifted', () => {
    const r = rig()
    const end = drag(r, -2)
    r.at(end + 200)
    r.fire('touchend', 0)
    expect(r.pending()).toBe(0)
  })

  it('throws nothing when the finger scrubbed the crosshair and the view never moved', () => {
    const r = rig()
    const end = drag(r, 0)
    r.at(end + 5)
    r.fire('touchend', 0)
    expect(r.pending()).toBe(0)
  })

  it('throws nothing for two fingers, even when one lifts first', () => {
    const r = rig()
    r.at(1_000)
    r.fire('touchstart', 2)
    r.move(1_016, -3, 2)
    r.move(1_032, -3, 2)
    r.fire('touchend', 1)
    r.move(1_048, -3, 1)
    r.at(1_050)
    r.fire('touchend', 0)
    expect(r.pending()).toBe(0)
  })

  it('stops where it stands for a touch, or when told to', () => {
    const r = rig()
    let end = drag(r, -2)
    r.at(end + 5)
    r.fire('touchend', 0)
    expect(r.pending()).toBe(1)
    r.fire('touchstart', 1)
    expect(r.pending()).toBe(0)
    end = drag(r, -2, 6, end + 100)
    r.at(end + 5)
    r.fire('touchend', 0)
    expect(r.pending()).toBe(1)
    fling!.stop()
    expect(r.pending()).toBe(0)
  })
})
