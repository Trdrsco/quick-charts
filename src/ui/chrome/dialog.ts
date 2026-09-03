// The modal dialog every chrome surface opens: the symbol search, the indicator picker, the
// indicator settings, the saved-layouts browser, the replay date picker. One primitive, so each of
// them traps focus, closes and restores focus the same way.
//
// A dialog is a scrim over the whole viewport with a box centered in it, mounted inside the
// widget's overlay host so the package stylesheet reaches it. It carries `role="dialog"` and
// `aria-modal`, names itself, traps Tab inside its own focusables, closes on Escape and on a press
// on the scrim, and returns focus to whatever had it before it opened.
import { focusables, glyph, h, stopPointer } from './dom'
import { ICONS } from './icons'

export interface DialogHandle {
  element: HTMLElement
  close(): void
  open(): boolean
}

export interface DialogOptions {
  host: HTMLElement
  /** The accessible name. The surface renders its own visible title. */
  label: string
  className?: string
  /** A stable `data-role` a host test can find the dialog by. */
  role?: string
  /** The box's width in CSS pixels; the stylesheet clamps it to the viewport. */
  width?: number
  /** Fill the box. */
  build(body: HTMLElement, dialog: DialogHandle): void
  /** The control that takes focus on open. Default the first focusable. */
  initialFocus?(body: HTMLElement): HTMLElement | null
  onClose?(): void
}

export function openDialog(options: DialogOptions): DialogHandle {
  const scrim = h('div', { class: 'qc-scrim qc-dialog-scrim' })
  const box = h('div', { class: `qc-overlay qc-dialog${options.className ? ` ${options.className}` : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': options.label, 'data-role': options.role })
  if (options.width) box.style.width = `${options.width}px`
  stopPointer(box)
  scrim.appendChild(box)

  let isOpen = true
  const previouslyFocused = document.activeElement as HTMLElement | null

  const close = (): void => {
    if (!isOpen) return
    isOpen = false
    document.removeEventListener('keydown', onKey, true)
    scrim.remove()
    options.onClose?.()
    previouslyFocused?.focus?.()
  }

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    // The trap: Tab past the last control wraps to the first, and Shift+Tab before the first wraps
    // to the last, so the keyboard never leaves the dialog while it is up.
    const list = focusables(box)
    if (list.length === 0) {
      event.preventDefault()
      return
    }
    const first = list[0]!
    const last = list[list.length - 1]!
    const active = document.activeElement as HTMLElement | null
    if (event.shiftKey && (active === first || !box.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !box.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  scrim.addEventListener('mousedown', (event) => {
    if (event.target === scrim) close()
  })

  const handle: DialogHandle = { element: box, close, open: () => isOpen }
  options.build(box, handle)
  options.host.appendChild(scrim)
  document.addEventListener('keydown', onKey, true)
  const target = options.initialFocus?.(box) ?? focusables(box)[0] ?? null
  target?.focus()
  return handle
}

/** A dialog's title row: the heading and the close control. */
export function dialogTitle(text: string, closeLabel: string, onClose: () => void): HTMLElement {
  const closeButton = h('button', { type: 'button', class: 'qc-button qc-dialog-close', 'aria-label': closeLabel, title: closeLabel }, glyph(ICONS.close, { size: 18 }))
  closeButton.addEventListener('click', onClose)
  return h('div', { class: 'qc-dialog-title' }, h('span', { class: 'qc-title' }, text), closeButton)
}

export interface SwitchOptions {
  label: string
  checked: boolean
  disabled?: boolean
  onChange(next: boolean): void
}

/** A switch: a button with `role="switch"` whose state is `aria-checked`, painted as a track and
 *  a knob by its recipe. Space and Enter toggle it, as a button's click does. */
export function switchControl(options: SwitchOptions): HTMLButtonElement {
  const el = h('button', { type: 'button', class: 'qc-switch', role: 'switch', 'aria-checked': String(options.checked), 'aria-label': options.label })
  el.appendChild(h('span', { class: 'qc-switch-knob' }))
  if (options.disabled) {
    el.disabled = true
    el.setAttribute('aria-disabled', 'true')
  }
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-checked') !== 'true'
    el.setAttribute('aria-checked', String(next))
    options.onChange(next)
  })
  return el
}

/** A row that carries a label and a switch, the whole row toggling. */
export function switchRow(options: SwitchOptions & { hint?: string }): HTMLElement {
  const control = switchControl(options)
  const row = h('div', { class: 'qc-switch-row', ...(options.hint ? { title: options.hint } : {}) }, h('span', { class: 'qc-switch-label' }, options.label), control)
  row.addEventListener('click', (event) => {
    if (event.target !== control && !control.contains(event.target as Node)) control.click()
  })
  return row
}

export interface TabsOptions {
  tabs: readonly { id: string; label: string }[]
  value: string
  label: string
  onChange(id: string): void
}

/** A tab list with arrow-key movement and `aria-selected`; the surface swaps the panel. */
export function tabList(options: TabsOptions): { element: HTMLElement; set(id: string): void } {
  const element = h('div', { class: 'qc-tabs', role: 'tablist', 'aria-label': options.label })
  const buttons = new Map<string, HTMLButtonElement>()
  const set = (id: string): void => {
    for (const [tabId, b] of buttons) {
      const selected = tabId === id
      b.setAttribute('aria-selected', String(selected))
      b.setAttribute('tabindex', selected ? '0' : '-1')
    }
  }
  for (const tab of options.tabs) {
    const b = h('button', { type: 'button', class: 'qc-tab', role: 'tab', 'aria-selected': 'false', tabindex: '-1' }, tab.label)
    b.addEventListener('click', () => {
      set(tab.id)
      options.onChange(tab.id)
    })
    buttons.set(tab.id, b)
    element.appendChild(b)
  }
  element.addEventListener('keydown', (event) => {
    const ids = options.tabs.map((t) => t.id)
    const current = ids.findIndex((id) => buttons.get(id) === document.activeElement)
    let next = -1
    if (event.key === 'ArrowRight') next = (current + 1) % ids.length
    else if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ids.length - 1
    if (next < 0) return
    event.preventDefault()
    const id = ids[next]!
    set(id)
    buttons.get(id)?.focus()
    options.onChange(id)
  })
  set(options.value)
  return { element, set }
}

/** A labeled field row inside a panel: the label text, then the control. */
export function fieldRow(label: string, control: HTMLElement, options: { className?: string } = {}): HTMLElement {
  return h('label', { class: `qc-field-row${options.className ? ` ${options.className}` : ''}` }, h('span', { class: 'qc-field-label' }, label), control)
}
