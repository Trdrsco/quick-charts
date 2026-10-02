// The floating menu every chrome picker opens: one primitive, so the timeframe list, the style
// picker, the layout grid, the settings panel and the timezone list all open, position, close and
// take the keyboard the same way.
//
// A menu is anchored to the control that opened it and positioned in the coordinates of the host
// it mounts into, clamped inside that host so a chart at the window's edge never raises a panel
// that runs off it. It mounts inside the widget's own layer (or a chart's chrome subtree), because
// the package stylesheet is scoped to the widget root, and it is positioned absolutely rather than
// fixed, so a host ancestor with a transform or a filter changes nothing.
//
// The keyboard model: focus lands on the first row (or the row the surface names) when the menu
// opens; arrow keys, Home and End move among rows with wraparound; Escape closes and returns focus
// to the control that opened it; Tab closes and lets focus move on; a press outside closes. Rows
// are roving-tabindex items, so a menu is one tab stop. Every open menu registers with its host so
// the host's owner can close it at teardown.
import { armRoving, focusItem, h, items, roveFocus, stopPointer } from './dom'
import { isRtl } from '../controls/dom'
import { trackOverlay } from '../controls/overlays'
import { ownsEscape, pushEscapeOwner } from '../controls/escape'

export interface MenuHandle {
  element: HTMLElement
  /** Close the menu, tear it down, and return focus to its anchor. */
  close(): void
  /** Whether the menu is still open. */
  open(): boolean
  /** Re-run the builder over an emptied body: what a surface calls when its model changed. Focus
   *  stays on the row at the same index where one exists. */
  refresh(): void
  /** Re-clamp the panel inside its host: what a surface calls after its body grew. */
  reposition(): void
}

export interface MenuOptions {
  /** The layer the panel mounts into. Coordinates are computed against its box. */
  host: HTMLElement
  /** The control that opened the menu. It gets `aria-expanded`, and focus returns to it. */
  anchor: HTMLElement
  /** The accessible name of the panel. */
  label: string
  /** The panel's role. A picker of rows is a menu; a flat choice list is a listbox; a panel of
   *  mixed controls (switches, fields) is a dialog. */
  role?: 'menu' | 'listbox' | 'dialog'
  className?: string
  /** The panel's width in CSS pixels. Calculated geometry, so it is the one inline write. */
  width?: number
  /** Which edge of the anchor the panel aligns to, in reading direction. */
  align?: 'start' | 'end'
  /** Whether the panel opens below the anchor or above it. */
  placement?: 'down' | 'up'
  /** Which row takes focus on open. Default the first. */
  initialIndex?: number
  /** Fill the scrolling body. Called on open and again on `refresh`. */
  build(body: HTMLElement, menu: MenuHandle): void
  /** Fill the region pinned below the scroll. Rebuilt with the body. */
  footer?(footer: HTMLElement, menu: MenuHandle): void
  onClose?(): void
}

const HOST_MARGIN = 8
const byAnchor = new WeakMap<HTMLElement, MenuHandle>()

/** User activation toggles; programmatic opening and refreshing remain separate operations. */
export function toggleMenu(anchor: HTMLElement, open: () => void): void {
  const current = byAnchor.get(anchor)
  if (current?.open()) current.close()
  else open()
}

export function openMenu(options: MenuOptions): MenuHandle {
  const { anchor, host } = options
  const previous = byAnchor.get(anchor)
  const rtl = isRtl(anchor)
  const role = options.role ?? 'menu'
  const element = h('div', {
    class: `qc-overlay qc-menu-panel${options.className ? ` ${options.className}` : ''}`,
    role,
    'aria-label': options.label,
    ...(role === 'dialog' ? { 'aria-modal': 'false' } : {}),
  })
  if (options.width) element.style.width = `${options.width}px`
  stopPointer(element)
  // The menu owns the scroll region: a refresh replaces its children, never the element, so where a
  // reader scrolled to survives a redraw.
  const body = h('div', { class: 'qc-menu-body' })
  element.appendChild(body)
  const footer = options.footer ? h('div', { class: 'qc-menu-footer' }) : null
  if (footer) element.appendChild(footer)

  let isOpen = true
  const previouslyFocused = document.activeElement as HTMLElement | null
  const escape = pushEscapeOwner()

  let untrack: () => void = () => undefined
  const close = (): void => {
    if (!isOpen) return
    isOpen = false
    escape.release()
    const ownedAnchor = byAnchor.get(anchor) === handle
    if (ownedAnchor) byAnchor.delete(anchor)
    untrack()
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onDocumentKey, true)
    window.removeEventListener('resize', reposition)
    if (ownedAnchor) anchor.setAttribute('aria-expanded', 'false')
    element.remove()
    options.onClose?.()
    // A close callback may synchronously open a newer lifetime for this anchor. That newer owner
    // keeps both its truthful expanded state and the focus it just placed inside its panel.
    if (byAnchor.get(anchor)?.open()) return
    // Focus goes back where it came from, which is the anchor unless something else took it
    // while the menu was up.
    const target = document.activeElement === document.body || document.activeElement === null || element.contains(document.activeElement) ? anchor : previouslyFocused
    target?.focus()
  }

  /** Place the panel in the host's coordinates, against the anchor, clamped inside the host. */
  const reposition = (): void => {
    if (!isOpen) return
    const a = anchor.getBoundingClientRect()
    const bounds = host.getBoundingClientRect()
    const below = (options.placement ?? 'down') === 'down'
    // A list opening upward may stand as tall as the room above its anchor, and no taller, so a long
    // one fills that room and scrolls without ever covering the control that opened it.
    if (!below) element.style.maxHeight = `${Math.max(0, Math.floor(a.top - bounds.top - HOST_MARGIN - 2))}px`
    element.style.left = '0px'
    element.style.top = '0px'
    const box = element.getBoundingClientRect()
    const alignEnd = (options.align ?? 'start') === (rtl ? 'start' : 'end')
    let left = (alignEnd ? a.right - box.width : a.left) - bounds.left
    left = Math.max(HOST_MARGIN, Math.min(left, Math.max(HOST_MARGIN, bounds.width - box.width - HOST_MARGIN)))
    let top = (below ? a.bottom + 2 : a.top - box.height - 2) - bounds.top
    top = Math.max(HOST_MARGIN, Math.min(top, Math.max(HOST_MARGIN, bounds.height - box.height - HOST_MARGIN)))
    element.style.left = `${Math.round(left)}px`
    element.style.top = `${Math.round(top)}px`
  }

  const onOutside = (event: PointerEvent): void => {
    const target = event.target as Node | null
    if (!target || element.contains(target) || anchor.contains(target)) return
    close()
  }
  const onDocumentKey = (event: KeyboardEvent): void => {
    // A control the panel expanded in place owns Escape while it is open, so the first press
    // closes that control and the next one closes the menu.
    if (event.key === 'Escape' && ownsEscape(escape.token)) {
      event.stopPropagation()
      event.preventDefault()
      close()
    }
  }

  element.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      close()
      return
    }
    // A text field inside the panel keeps its own arrow keys.
    const target = event.target as HTMLElement | null
    const typing = target instanceof HTMLInputElement && target.type !== 'checkbox' && target.type !== 'radio'
    if (typing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End')) return
    if (roveFocus(element, event, 'both')) {
      event.preventDefault()
      event.stopPropagation()
    }
  })

  const handle: MenuHandle = {
    element,
    close,
    open: () => isOpen,
    refresh() {
      if (!isOpen) return
      const current = items(element).indexOf(document.activeElement as HTMLElement)
      body.replaceChildren()
      options.build(body, handle)
      if (footer && options.footer) {
        footer.replaceChildren()
        options.footer(footer, handle)
      }
      const list = items(element)
      if (list.length === 0) return
      if (current >= 0 && document.activeElement && !element.contains(document.activeElement)) return
      armRoving(element, Math.max(0, Math.min(current, list.length - 1)))
      if (current >= 0) list[Math.min(current, list.length - 1)]?.focus()
      reposition()
    },
    reposition,
  }

  // This call becomes the anchor owner before retiring the previous lifetime. A close callback may
  // reenter `openMenu`; because that call is newer, it replaces this still-opening handle. Each
  // caller keeps its own handle and cleanup instead of borrowing the winner's lifetime.
  byAnchor.set(anchor, handle)
  previous?.close()
  if (!isOpen || byAnchor.get(anchor) !== handle) return handle
  options.build(body, handle)
  if (footer && options.footer) options.footer(footer, handle)
  if (!isOpen || byAnchor.get(anchor) !== handle) return handle
  host.appendChild(element)
  untrack = trackOverlay(host, close, () => handle.refresh())
  anchor.setAttribute('aria-expanded', 'true')
  reposition()
  const list = items(element)
  const first = Math.max(0, Math.min(options.initialIndex ?? 0, list.length - 1))
  if (list.length > 0) {
    armRoving(element, first)
    focusItem(list, first)
    list[first]?.scrollIntoView?.({ block: 'nearest' })
  } else {
    // A panel of fields: the first focusable control takes the keyboard.
    const focusable = element.querySelector<HTMLElement>('input, button, select, textarea, [tabindex="0"]')
    focusable?.focus()
  }
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('keydown', onDocumentKey, true)
  window.addEventListener('resize', reposition)
  return handle
}

export interface MenuItemOptions {
  /** The visible text. */
  text: string
  /** An accessible name that differs from the text, such as a longer sentence. */
  label?: string
  /** A glyph body. */
  icon?: HTMLElement
  /** Secondary text at the row's end, such as a shortcut or a note. */
  hint?: string
  /** The shortcut the hint shows, in `aria-keyshortcuts` terms (`Control+S`, `.`). A row given one
   *  is named by its words alone, and assistive technology reads the shortcut from here. */
  keys?: string
  /** A second line under the text, such as when a saved item was last written. */
  description?: string
  /** The row's role. A radio row reads its `checked`; a plain row does not. */
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox' | 'option'
  checked?: boolean
  disabled?: boolean
  className?: string
  onSelect?(): void
}

/** One row of a menu: a button that is a roving item, carrying its role and state. */
export function menuItem(options: MenuItemOptions): HTMLButtonElement {
  const role = options.role ?? 'menuitem'
  const row = h('button', {
    type: 'button',
    class: `qc-menu-row${options.className ? ` ${options.className}` : ''}`,
    role,
    'data-qc-item': '',
    tabindex: '-1',
    ...(options.label ? { 'aria-label': options.label } : options.keys ? { 'aria-label': options.text } : {}),
    ...(options.keys ? { 'aria-keyshortcuts': options.keys } : {}),
    ...(role === 'menuitemradio' || role === 'menuitemcheckbox' ? { 'aria-checked': String(options.checked === true) } : {}),
    ...(role === 'option' ? { 'aria-selected': String(options.checked === true) } : {}),
  })
  if (options.disabled) {
    row.disabled = true
    row.setAttribute('aria-disabled', 'true')
  }
  const cell = h('span', { class: 'qc-menu-icon' })
  if (options.icon) {
    row.classList.add('qc-menu-row--marked')
    cell.appendChild(options.icon)
  }
  row.appendChild(cell)
  const label = h('span', { class: 'qc-menu-label' }, options.text)
  row.appendChild(options.description === undefined ? label : h('span', { class: 'qc-menu-text' }, label, h('span', { class: 'qc-menu-description' }, options.description)))
  if (options.hint !== undefined) row.appendChild(h('span', { class: 'qc-menu-hint', ...(options.keys ? { 'aria-hidden': 'true' } : {}) }, options.hint))
  if (options.onSelect) row.addEventListener('click', () => options.onSelect?.())
  return row
}

/** A group heading inside a menu. */
export function menuHeading(text: string): HTMLElement {
  return h('div', { class: 'qc-menu-heading', role: 'presentation' }, text)
}

/** A rule between groups. */
export function menuSeparator(): HTMLElement {
  return h('div', { class: 'qc-separator', role: 'separator' })
}
