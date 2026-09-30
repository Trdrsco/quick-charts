// The frame a drawing dialog stands in. The modal shell every chrome surface opens owns the scrim,
// the centring, the focus trap, Escape and giving focus back to whatever had it; this adds the two
// things a drawing dialog needs on top, and nothing else: a header the trader can drag, so a dialog
// never hides the drawing it is editing, and a body and footer the caller fills.
import { dialogTitle, openDialog as openModal } from '../chrome/dialog'
import { closeOverlays } from '../controls/overlays'
import { el, ownPointer } from './dom'
import type { IconResolver } from '../icons/resolver'

export interface DialogOptions {
  /** The chrome subtree the dialog mounts into. */
  container: HTMLElement
  /** The accessible name and the header's text. */
  title: string
  /** The close control's accessible name. */
  closeLabel: string
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** A stable role name for tests and hosts, written as `data-role`. */
  role: string
  width?: number
  onClose?(): void
}

export interface DialogHandle {
  /** The body the caller fills. */
  body: HTMLElement
  /** The footer the caller fills, in reading order. */
  footer: HTMLElement
  /** The box itself, for a caller that sizes or classes it. */
  box: HTMLElement
  close(): void
}

/** Let the header carry the box. The offset is remembered for the dialog's own life only. */
function dragBy(header: HTMLElement, box: HTMLElement): () => void {
  let dragging: { dx: number; dy: number } | null = null
  header.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button')) return
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
  let stopDrag: () => void = () => undefined
  const modal = openModal({
    host: options.container,
    label: options.title,
    className: 'qc-drawing-dialog',
    role: options.role,
    ...(options.width === undefined ? {} : { width: options.width }),
    build(element, dialog) {
      box = element
      ownPointer(element)
      const header = dialogTitle(options.title, options.closeLabel, () => dialog.close(), options.icons)
      header.classList.add('qc-drawing-dialog-header')
      header.querySelector('.qc-title')?.classList.add('qc-drawing-dialog-title')
      stopDrag = dragBy(header, element)
      element.append(header, body, footer)
    },
    onClose: () => {
      stopDrag()
      // Whatever the dialog opened over itself (a palette, a menu) goes with it, so no document
      // listener outlives the box it belonged to.
      if (box) closeOverlays(box)
      options.onClose?.()
    },
  })
  return { body, footer, box: modal.element, close: modal.close }
}
