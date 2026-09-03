// The floating menu every chrome picker opens: one primitive, so the timeframe list, the style
// picker, the layout grid, the settings panel and the timezone list all open, position, close and
// take the keyboard the same way.
//
// A menu is anchored to the control that opened it and positioned in viewport coordinates, clamped
// so a chart at the window's edge never raises a panel that runs off it. It mounts inside the
// widget's own overlay host, because the package stylesheet is scoped to the widget root and a
// panel parented anywhere else would resolve none of its own custom properties.
//
// The keyboard model: focus lands on the first row (or the row the surface names) when the menu
// opens; arrow keys, Home and End move among rows with wraparound; Escape closes and returns focus
// to the control that opened it; Tab closes and lets focus move on; a press outside closes. Rows
// are roving-tabindex items, so a menu is one tab stop.
import { armRoving, focusItem, h, isRtl, items, roveFocus, stopPointer } from './dom'

export interface MenuHandle {
  element: HTMLElement
  /** Close the menu, tear it down, and return focus to its anchor. */
  close(): void
  /** Whether the menu is still open. */
  open(): boolean
  /** Re-run the builder over an emptied body: what a surface calls when its model changed. Focus
   *  stays on the row at the same index where one exists. */
  refresh(): void
  /** Re-clamp the panel to the viewport: what a surface calls after its body grew. */
  reposition(): void
}

export interface MenuOptions {
  /** The overlay host the panel mounts into. */
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
  /** Fill the body. Called on open and again on `refresh`. */
  build(body: HTMLElement, menu: MenuHandle): void
  onClose?(): void
}

const VIEWPORT_MARGIN = 8

export function openMenu(options: MenuOptions): MenuHandle {
  const { anchor } = options
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
  const body = h('div', { class: 'qc-menu-body' })
  element.appendChild(body)

  let isOpen = true
  const previouslyFocused = document.activeElement as HTMLElement | null

  const close = (): void => {
    if (!isOpen) return
    isOpen = false
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('keydown', onDocumentKey, true)
    window.removeEventListener('resize', reposition)
    anchor.setAttribute('aria-expanded', 'false')
    element.remove()
    options.onClose?.()
    // Focus goes back where it came from, which is the anchor unless something else took it
    // while the menu was up.
    const target = document.activeElement === document.body || document.activeElement === null || element.contains(document.activeElement) ? anchor : previouslyFocused
    target?.focus()
  }

  const reposition = (): void => {
    if (!isOpen) return
    const a = anchor.getBoundingClientRect()
    element.style.left = '0px'
    element.style.top = '0px'
    const box = element.getBoundingClientRect()
    const alignEnd = (options.align ?? 'start') === (rtl ? 'start' : 'end')
    let left = alignEnd ? a.right - box.width : a.left
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - box.width - VIEWPORT_MARGIN))
    const below = (options.placement ?? 'down') === 'down'
    let top = below ? a.bottom + 4 : a.top - box.height - 4
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - box.height - VIEWPORT_MARGIN))
    element.style.left = `${Math.round(left)}px`
    element.style.top = `${Math.round(top)}px`
  }

  const onOutside = (event: PointerEvent): void => {
    const target = event.target as Node | null
    if (!target || element.contains(target) || anchor.contains(target)) return
    close()
  }
  const onDocumentKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
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
      const list = items(element)
      if (list.length === 0) return
      if (current >= 0 && document.activeElement && !element.contains(document.activeElement)) return
      armRoving(element, Math.max(0, Math.min(current, list.length - 1)))
      if (current >= 0) list[Math.min(current, list.length - 1)]?.focus()
      reposition()
    },
    reposition,
  }

  options.build(body, handle)
  options.host.appendChild(element)
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
    ...(options.label ? { 'aria-label': options.label } : {}),
    ...(role === 'menuitemradio' || role === 'menuitemcheckbox' ? { 'aria-checked': String(options.checked === true) } : {}),
    ...(role === 'option' ? { 'aria-selected': String(options.checked === true) } : {}),
  })
  if (options.disabled) {
    row.disabled = true
    row.setAttribute('aria-disabled', 'true')
  }
  const cell = h('span', { class: 'qc-menu-icon' })
  if (options.icon) cell.appendChild(options.icon)
  row.appendChild(cell)
  row.appendChild(h('span', { class: 'qc-menu-label' }, options.text))
  if (options.hint !== undefined) row.appendChild(h('span', { class: 'qc-menu-hint' }, options.hint))
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
