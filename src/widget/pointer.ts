// Touch input the chart owns at every width: one finger held still raises the same level menu a
// right-click does, so an embedder gets press-and-hold without writing any of it.
//
// The gesture stands down while a drawing tool is armed (the press IS the drawing gesture) and the
// moment a second finger lands (that is a pinch, which is navigation). The rules themselves live
// in `pointerInput.ts`; this module is the wiring.
import { longPressArms, longPressCancels, LONG_PRESS_MS } from '../pointerInput'

export interface PointerPlane {
  /** Cancel an armed press. Called at teardown, so a chart removed mid-press fires nothing. */
  cancel(): void
  destroy(): void
}

export interface PointerDeps {
  /** The gesture box the listeners bind to. */
  gestures: HTMLElement
  /** Whether a drawing tool is armed right now. */
  toolArmed(): boolean
  /** True once the chart is down. */
  disposed(): boolean
  /** Raise the level menu at a viewport point. */
  raiseAt(clientX: number, clientY: number): void
}

export function attachPointerPlane(deps: PointerDeps): PointerPlane {
  let hold: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
  const cancel = (): void => {
    if (!hold) return
    clearTimeout(hold.timer)
    hold = null
  }

  const onStart = (e: TouchEvent): void => {
    cancel()
    if (!longPressArms({ touches: e.touches.length, toolArmed: deps.toolArmed() })) return
    const touch = e.touches[0]
    if (!touch) return
    const { clientX: x, clientY: y } = touch
    hold = {
      x,
      y,
      timer: setTimeout(() => {
        hold = null
        if (!deps.disposed()) deps.raiseAt(x, y)
      }, LONG_PRESS_MS),
    }
  }
  const onMove = (e: TouchEvent): void => {
    const held = hold
    if (!held) return
    const touch = e.touches[0]
    if (!touch || longPressCancels({ touches: e.touches.length, fromX: held.x, fromY: held.y, x: touch.clientX, y: touch.clientY })) cancel()
  }

  deps.gestures.addEventListener('touchstart', onStart, { passive: true })
  deps.gestures.addEventListener('touchmove', onMove, { passive: true })
  deps.gestures.addEventListener('touchend', cancel, { passive: true })
  deps.gestures.addEventListener('touchcancel', cancel, { passive: true })

  return {
    cancel,
    destroy() {
      cancel()
      deps.gestures.removeEventListener('touchstart', onStart)
      deps.gestures.removeEventListener('touchmove', onMove)
      deps.gestures.removeEventListener('touchend', cancel)
      deps.gestures.removeEventListener('touchcancel', cancel)
    },
  }
}
