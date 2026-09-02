// Chart-root fullscreen: the widget's own element fills the screen, and the host application's
// shell is never taken over.
//
// The distinction is the whole point. Fit-to-container is layout and belongs to the host's CSS;
// this is the browser's Fullscreen API, applied to the widget root (or to an explicit target the
// host names). `active()` reflects what the document says rather than what we last asked for, so
// the viewer pressing Escape is the same event as the widget exiting.
import type { FullscreenOptions } from './options'

/** The widget's fullscreen surface. */
export interface FullscreenApi {
  enter(): Promise<void>
  exit(): Promise<void>
  toggle(): Promise<void>
  /** True while the target is the document's fullscreen element. */
  active(): boolean
}

export interface FullscreenHandle {
  api: FullscreenApi
  /** Whether the Fullscreen API is usable at all here. */
  available(): boolean
  dispose(): void
}

/** Create the fullscreen plane over one target element. `onChange` fires for every transition the
 *  document reports, including the browser's own exit. */
export function createFullscreen(
  root: HTMLElement,
  options: FullscreenOptions | undefined,
  onChange: (active: boolean) => void,
): FullscreenHandle {
  const target = options?.target ?? root
  const doc: (Document & { fullscreenEnabled?: boolean }) | undefined = typeof document === 'undefined' ? undefined : document
  const available = (): boolean => !!doc && (doc.fullscreenEnabled === true || typeof target.requestFullscreen === 'function')
  const active = (): boolean => !!doc && doc.fullscreenElement === target

  let last = active()
  const onDocumentChange = (): void => {
    const now = active()
    if (now === last) return
    last = now
    onChange(now)
  }
  doc?.addEventListener('fullscreenchange', onDocumentChange)

  const api: FullscreenApi = {
    async enter() {
      if (!available() || active() || typeof target.requestFullscreen !== 'function') return
      try {
        await target.requestFullscreen()
      } catch {
        // A refusal (no user gesture, a policy, a nested document) leaves the chart where it is.
        // The state is read from the document, so nothing needs unwinding.
      }
    },
    async exit() {
      if (!doc || doc.fullscreenElement !== target) return
      try {
        await doc.exitFullscreen()
      } catch {
        /* likewise */
      }
    },
    async toggle() {
      if (active()) await api.exit()
      else await api.enter()
    },
    active,
  }

  return {
    api,
    available,
    dispose() {
      doc?.removeEventListener('fullscreenchange', onDocumentChange)
    },
  }
}
