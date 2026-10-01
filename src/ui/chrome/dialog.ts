// The modal dialog every chrome surface opens: the symbol search, the indicator picker, the
// indicator settings, the saved-layouts browser, the replay date picker. One primitive, so each of
// them traps focus, closes and restores focus the same way.
//
// A dialog is a scrim over the layer it mounts into with a box centered in it, so the package
// stylesheet reaches it and a host ancestor's transform changes nothing. It carries
// `role="dialog"` and `aria-modal`, names itself, traps Tab inside its own focusables, closes on
// Escape and on a press on the scrim, returns focus to whatever had it before it opened, and
// registers with its host so the host's owner can close it at teardown.
import { h, stopPointer } from './dom'
import { focusables } from '../controls/dom'
import { layerFor } from '../controls/layer'
import { ICONS, SEARCH_EMPTY_MARK } from '../controls/icons'
import { trackOverlay } from '../controls/overlays'
import { ownsEscape, pushEscapeOwner } from '../controls/escape'
import type { IconResolver } from '../icons/resolver'

export interface DialogHandle {
  element: HTMLElement
  close(options?: { animate?: boolean }): void
  open(): boolean
}

export interface DialogOptions {
  host: HTMLElement
  /** The accessible name. The surface renders its own visible title. */
  label: string
  className?: string
  /** A class on the modal backdrop, for a surface-specific entrance and exit. */
  scrimClassName?: string
  /** Keep the surface mounted for this long while its exit animation runs. */
  exitMs?: number
  /** A stable `data-role` a host test can find the dialog by. */
  role?: string
  /** What the box is to a reader. A question that must be answered before anything else can happen
   *  is an alert; everything else is an ordinary dialog. */
  ariaRole?: 'dialog' | 'alertdialog'
  /** The box's width in CSS pixels; the stylesheet clamps it to the layer. */
  width?: number
  /** Fill the box. */
  build(body: HTMLElement, dialog: DialogHandle): void
  /** The control that takes focus on open. Default the first focusable. */
  initialFocus?(body: HTMLElement): HTMLElement | null
  /** The dialog has begun closing and is no longer interactive, before any exit motion finishes. */
  onClosing?(): void
  onClose?(): void
}

export function openDialog(options: DialogOptions): DialogHandle {
  const scrim = h('div', { class: `qc-scrim qc-dialog-scrim${options.scrimClassName ? ` ${options.scrimClassName}` : ''}` })
  const box = h('div', { class: `qc-overlay qc-dialog${options.className ? ` ${options.className}` : ''}`, role: options.ariaRole ?? 'dialog', 'aria-modal': 'true', 'aria-label': options.label, 'data-role': options.role })
  if (options.width) box.style.width = `${options.width}px`
  stopPointer(box)
  scrim.appendChild(box)
  if (options.exitMs) scrim.dataset.state = 'opening'

  let isOpen = true
  const previouslyFocused = document.activeElement as HTMLElement | null
  const escape = pushEscapeOwner()

  let untrack: () => void = () => undefined
  let removed = false
  let exitTimer: ReturnType<typeof setTimeout> | null = null
  const remove = (): void => {
    if (removed) return
    removed = true
    if (exitTimer !== null) clearTimeout(exitTimer)
    scrim.remove()
    options.onClose?.()
  }
  const close = (closeOptions?: { animate?: boolean }): void => {
    // Teardown or a replacement can overtake an exit already in flight. In that case the caller
    // asking for no animation means "finish now", not "start closing again".
    if (!isOpen) {
      if (closeOptions?.animate === false) remove()
      return
    }
    isOpen = false
    options.onClosing?.()
    escape.release()
    untrack()
    document.removeEventListener('keydown', onKey, true)
    previouslyFocused?.focus?.()
    const reduceMotion = document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    if (closeOptions?.animate === false || !options.exitMs || reduceMotion) {
      remove()
      return
    }
    // The dialog stops being interactive and leaves the accessibility tree at once; only its
    // pixels remain for the short exit. `animationend` is the normal path, with a timer for hidden
    // tabs and renderers that do not deliver animation events.
    scrim.dataset.state = 'closing'
    scrim.style.pointerEvents = 'none'
    box.inert = true
    box.removeAttribute('role')
    box.removeAttribute('aria-modal')
    box.setAttribute('aria-hidden', 'true')
    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === box) remove()
    }
    box.addEventListener('animationend', onAnimationEnd, { once: true })
    exitTimer = setTimeout(remove, options.exitMs + 50)
  }

  const onKey = (event: KeyboardEvent): void => {
    // A control a row expanded in place owns Escape while it is open: the first press closes that
    // control, the next closes the dialog.
    if (event.key === 'Escape' && ownsEscape(escape.token)) {
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
  // The widget's body-level layer where there is one, so nothing the page stacks beside or above
  // the widget can paint over a question that must be answered; the host itself where a root was
  // built without a layer.
  ;(layerFor(options.host) ?? options.host).appendChild(scrim)
  if (options.exitMs) {
    // Commit the visible start frame now rather than waiting on rAF, which a hidden tab may pause.
    // The next style change can then transition without ever leaving a dialog permanently hidden.
    scrim.getBoundingClientRect()
    scrim.dataset.state = 'open'
  }
  untrack = trackOverlay(options.host, close)
  document.addEventListener('keydown', onKey, true)
  const target = options.initialFocus?.(box) ?? focusables(box)[0] ?? null
  target?.focus()
  return handle
}

/** A dialog's title row: the heading and the close control. */
export function dialogTitle(text: string, closeLabel: string, onClose: () => void, icons: IconResolver): HTMLElement {
  const closeButton = h('button', { type: 'button', class: 'qc-button qc-dialog-close', 'aria-label': closeLabel, title: closeLabel }, icons.glyph(ICONS.dialogClose, { size: 18 }))
  closeButton.addEventListener('click', onClose)
  return h('div', { class: 'qc-dialog-title' }, h('span', { class: 'qc-title' }, text), closeButton)
}

/** What a list shows in place of its rows when nothing matched: the drawing over the line that
 *  says so, centred where the rows would have stood. The symbol search and the layouts browser
 *  both say it this way, so a trader meets one answer rather than two. */
export function emptyState(text: string, icons: IconResolver): HTMLElement {
  return h(
    'div',
    { class: 'qc-empty' },
    icons.glyph(SEARCH_EMPTY_MARK, { size: 120, className: 'qc-empty-art' }),
    h('div', { class: 'qc-empty-text' }, text),
  )
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
  /** A prefix for the tab and panel ids, unique within the document. */
  id: string
  /** The one panel every tab controls. It takes an id and is labelled by the selected tab. */
  panel: HTMLElement
  onChange(id: string): void
}

/** A tab list with arrow-key movement and `aria-selected`; each tab controls the panel and the
 *  selected tab labels it. The surface swaps the panel's content. */
export function tabList(options: TabsOptions): { element: HTMLElement; set(id: string): void } {
  const element = h('div', { class: 'qc-tabs', role: 'tablist', 'aria-label': options.label })
  const panelId = `${options.id}-panel`
  options.panel.id = panelId
  const buttons = new Map<string, HTMLButtonElement>()
  const set = (id: string): void => {
    for (const [tabId, b] of buttons) {
      const selected = tabId === id
      b.setAttribute('aria-selected', String(selected))
      b.setAttribute('tabindex', selected ? '0' : '-1')
      if (selected) options.panel.setAttribute('aria-labelledby', b.id)
    }
  }
  for (const tab of options.tabs) {
    const b = h('button', { type: 'button', class: 'qc-tab', role: 'tab', id: `${options.id}-tab-${tab.id}`, 'aria-controls': panelId, 'aria-selected': 'false', tabindex: '-1' }, tab.label)
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
