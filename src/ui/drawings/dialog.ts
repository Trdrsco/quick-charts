// The frame a drawing dialog stands in. The modal shell every chrome surface opens owns the scrim,
// the centring, the focus trap, Escape, the modal motion and giving focus back to whatever had it;
// this adds the two
// things a drawing dialog needs on top, and nothing else: a header the viewer can drag, so a dialog
// never hides the drawing it is editing, and a body and footer the caller fills.
import { dialogTitle, openDialog as openModal } from '../chrome/dialog'
import { closeOverlays } from '../controls/overlays'
import { el, ownPointer } from './dom'
import type { IconResolver } from '../icons/resolver'

export interface DialogOptions {
  /** The chrome subtree the dialog mounts into. */
  container: HTMLElement
  /** The accessible name, and the header's text unless `heading` says otherwise. */
  title: string
  /** The header's text, where it differs from the accessible name. */
  heading?: string
  /** The close control's accessible name. */
  closeLabel: string
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** A stable role name for tests and hosts, written as `data-role`. */
  role: string
  width?: number
  /** Whether the backdrop dims what stands behind the dialog, and whether the dialog opens and
   *  closes on the modal motion. Both on unless the surface turns them off. */
  veil?: boolean
  motion?: boolean
  /** The dialog has begun closing and takes no more input, before its exit motion finishes. */
  onClosing?(): void
  /** The dialog has left the page. */
  onClose?(): void
}

export interface DialogHandle {
  /** The header: the heading, then the close control. */
  header: HTMLElement
  /** The heading's own element, for a caller that relabels it. */
  heading: HTMLElement
  /** The body the caller fills. */
  body: HTMLElement
  /** The footer the caller fills, in reading order. */
  footer: HTMLElement
  /** The box itself, for a caller that sizes or classes it. */
  box: HTMLElement
  /** Where the dialog's own lists and panels stand: the backdrop the box stands on, which covers
   *  the viewport, so a list may hang past the box's edge. */
  layer: HTMLElement
  /** Close with the modal motion, or at once with `animate: false`. */
  close(options?: { animate?: boolean }): void
}

/** Let the header carry the box. The offset is remembered for the dialog's own life only. */
function dragBy(header: HTMLElement, box: HTMLElement): () => void {
  let dragging: { dx: number; dy: number } | null = null
  header.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button, input')) return
    const rect = box.getBoundingClientRect()
    dragging = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    event.preventDefault()
  })
  const onMove = (event: PointerEvent): void => {
    if (!dragging) return
    const x = Math.max(0, Math.min(event.clientX - dragging.dx, window.innerWidth - box.offsetWidth))
    const y = Math.max(0, Math.min(event.clientY - dragging.dy, window.innerHeight - box.offsetHeight))
    box.style.position = 'fixed'
    box.style.left = `${Math.round(x)}px`
    box.style.top = `${Math.round(y)}px`
  }
  const onUp = (): void => {
    dragging = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  return () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
}

export function openDialog(options: DialogOptions): DialogHandle {
  const body = el('div', { class: 'qc-drawing-dialog-body' })
  const footer = el('div', { class: 'qc-drawing-dialog-footer' })
  let box: HTMLElement | null = null
  let closeBox: () => void = () => undefined
  const header = dialogTitle(options.heading ?? options.title, options.closeLabel, () => closeBox(), options.icons)
  header.classList.add('qc-drawing-dialog-header')
  const heading = header.querySelector<HTMLElement>('.qc-title')!
  heading.classList.add('qc-drawing-dialog-title')
  let stopDrag: () => void = () => undefined
  const modal = openModal({
    host: options.container,
    label: options.title,
    className: 'qc-drawing-dialog',
    role: options.role,
    ...(options.width === undefined ? {} : { width: options.width }),
    ...(options.veil === undefined ? {} : { veil: options.veil }),
    ...(options.motion === undefined ? {} : { motion: options.motion }),
    build(element, dialog) {
      box = element
      closeBox = () => dialog.close()
      ownPointer(element)
      stopDrag = dragBy(header, element)
      element.append(header, body, footer)
    },
    // The drag and whatever the dialog opened over itself (a palette, a menu, a template prompt) go
    // as the dialog begins to close, so nothing answers the viewer from a box that no longer takes
    // input and no document listener outlives the box it belonged to.
    onClosing: () => {
      stopDrag()
      if (box) closeOverlays(box)
      if (box?.parentElement) closeOverlays(box.parentElement)
      options.onClosing?.()
    },
    onClose: () => options.onClose?.(),
  })
  return { header, heading, body, footer, box: modal.element, layer: modal.element.parentElement ?? modal.element, close: modal.close }
}
