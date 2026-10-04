// A flick's coast. One finger panning the chart and lifting while still moving lets the view coast on
// and come to rest, the way a native list settles. The renderer's own momentum is off, and the chart
// drives this calmer one itself by the rules in the pointer input module.
//
// The speed is the view's own: the renderer's scroll position, sampled as the drag moves it. So only
// a drag that panned throws anything; a finger scrubbing the crosshair, a pinch, or a drag a drawing
// holds moves no scroll position and coasts nothing.
//
// The renderer applies each move of a one-finger drag from a listener on the document, which hears
// the move after this one does. So the position read at a move is the one the PREVIOUS move left, and
// is credited to that move's time; the position read as the finger lifts is the last move's.
import type { IChartApi } from 'lightweight-charts'
import { flingSpeed, flingStep, FLING_REST_PX_PER_MS, FLING_SAMPLE_MS } from '../pointerInput'

export interface FlingDeps {
  chart: IChartApi
  /** The box the finger lands on: the renderer's own. */
  target: HTMLElement
}

export interface Fling {
  /** End the coast where it stands: what every other way of moving the view does first. */
  stop(): void
  destroy(): void
}

export function attachFling(deps: FlingDeps): Fling {
  const scale = () => deps.chart.timeScale()
  /** The view's place through the drag, each credited to the move that put it there. */
  let samples: { t: number; position: number }[] = []
  /** The time of the move whose result the next reading will show, or null before the first move. */
  let movedAt: number | null = null
  let oneFinger = false
  let frame: number | null = null

  const stop = (): void => {
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
    frame = null
  }
  const record = (t: number): void => {
    samples.push({ t, position: scale().scrollPosition() })
    while (samples.length > 2 && samples[0]!.t < t - 2 * FLING_SAMPLE_MS) samples.shift()
  }
  const coast = (speed: number): void => {
    if (typeof requestAnimationFrame !== 'function') return
    let last = performance.now()
    let travelling = speed
    const step = (now: number): void => {
      if (frame === null) return
      const s = scale()
      const next = flingStep(travelling, Math.max(0, now - last))
      last = now
      travelling = next.speed
      s.scrollToPosition(s.scrollPosition() + next.moved, false)
      if (Math.abs(travelling) * s.options().barSpacing < FLING_REST_PX_PER_MS) {
        frame = null
        return
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
  }

  const onStart = (event: TouchEvent): void => {
    stop()
    samples = []
    movedAt = null
    oneFinger = event.touches.length === 1
    if (oneFinger) record(performance.now())
  }
  const onMove = (event: TouchEvent): void => {
    if (event.touches.length !== 1) oneFinger = false
    if (!oneFinger) return
    if (movedAt !== null) record(movedAt)
    movedAt = performance.now()
  }
  const onEnd = (event: TouchEvent): void => {
    const thrown = oneFinger && event.touches.length === 0
    oneFinger = false
    if (!thrown) return
    if (movedAt !== null) record(movedAt)
    const spacing = scale().options().barSpacing
    const speed = flingSpeed(samples, performance.now(), spacing)
    samples = []
    movedAt = null
    if (Math.abs(speed) * spacing >= FLING_REST_PX_PER_MS) coast(speed)
  }
  const onCancel = (): void => {
    oneFinger = false
    samples = []
    movedAt = null
  }

  deps.target.addEventListener('touchstart', onStart, { passive: true })
  deps.target.addEventListener('touchmove', onMove, { passive: true })
  deps.target.addEventListener('touchend', onEnd, { passive: true })
  deps.target.addEventListener('touchcancel', onCancel, { passive: true })
  return {
    stop,
    destroy() {
      stop()
      deps.target.removeEventListener('touchstart', onStart)
      deps.target.removeEventListener('touchmove', onMove)
      deps.target.removeEventListener('touchend', onEnd)
      deps.target.removeEventListener('touchcancel', onCancel)
    },
  }
}
