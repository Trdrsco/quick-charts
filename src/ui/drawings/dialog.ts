// The modal shell every drawing dialog stands in: a scrim over the chart, a titled box the trader
// can drag by its header, a close affordance, Escape, a focus trap, and focus back on the control
// that opened it when it closes. It mounts into the chart's own chrome subtree, because the
// package stylesheet is scoped to the chart root and a box parented anywhere else would resolve
// none of its own custom properties.
import { button, el, ownPointer, trapFocus } from './dom'
import { iconSvg } from './icons'

export interface DialogOptions {
  /** The chrome subtree the dialog mounts into. */
  container: HTMLElement
  /** The accessible name and the header's text. */
  title: string
  /** The close control's accessible name. */
  closeLabel: string
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

export function openDialog(options: DialogOptions): DialogHandle {
  const backdrop = el('div', { class: 'qc-scrim qc-dialog-backdrop qc-drawing-dialog-backdrop' })
  const box = el('div', { class: 'qc-overlay qc-dialog qc-drawing-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title, 'data-role': options.role })
  if (options.width) box.style.width = `min(${options.width}px, calc(100% - 16px))`
  ownPointer(box)

  const header = el('div', { class: 'qc-drawing-dialog-header' })
  const title = el('span', { class: 'qc-title qc-drawing-dialog-title', text: options.title })
  const closeButton = button({ class: 'qc-dialog-op', label: options.closeLabel, html: iconSvg('close', 18), onClick: () => close() })
  header.append(title, closeButton)
  const body = el('div', { class: 'qc-drawing-dialog-body' })
  const footer = el('div', { class: 'qc-drawing-dialog-footer' })
  box.append(header, body, footer)
  backdrop.appendChild(box)

  // The header drags the box, so a dialog never hides the drawing it is editing. The offset is
  // remembered for the dialog's own life only.
  let dragging: { dx: number; dy: number } | null = null
  header.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = box.getBoundingClientRect()
    dragging = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    e.preventDefault()
  })
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return
    const host = backdrop.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - host.left - dragging.dx, host.width - box.offsetWidth))
    const y = Math.max(0, Math.min(e.clientY - host.top - dragging.dy, host.height - box.offsetHeight))
    box.style.position = 'absolute'
    box.style.left = `${Math.round(x)}px`
    box.style.top = `${Math.round(y)}px`
  }
  const onUp = (): void => {
    dragging = null
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)

  let closed = false
  const untrap = trapFocus(box)
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  box.addEventListener('keydown', onKey)
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close()
  })

  const close = (): void => {
    if (closed) return
    closed = true
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    untrap()
    backdrop.remove()
    options.onClose?.()
  }

  options.container.appendChild(backdrop)
  return { body, footer, box, close }
}
