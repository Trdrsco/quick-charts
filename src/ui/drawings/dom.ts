// The small DOM vocabulary the drawing surfaces share: building elements, keeping presses out of
// the gesture layers, roving keyboard focus over a row of controls, a menu's own keyboard, a
// dialog's focus trap and restoration, and placing a floating panel inside the chart root.
//
// Nothing here is a component. Each helper does one thing to real elements, so every surface stays
// readable as the DOM it builds.

type Child = Node | string | null | undefined | false

/** Build an element with attributes and children in one call. `class` is the class list, `text`
 *  is the text content, `on` binds listeners, and any other key is an attribute. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | number | boolean | undefined | Record<string, EventListener>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === false) continue
    if (typeof value === 'object') {
      if (key === 'on') for (const [type, listener] of Object.entries(value)) node.addEventListener(type, listener)
    } else if (key === 'class') node.className = String(value)
    else if (key === 'text') node.textContent = String(value)
    else if (key === 'html') node.innerHTML = String(value)
    else node.setAttribute(key, value === true ? '' : String(value))
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    node.append(child)
  }
  return node
}

/** A button of the chart's own chrome: never a form submitter, always named. */
export function button(props: { class?: string; label: string; title?: string; html?: string; text?: string; onClick?: (event: MouseEvent) => void; pressed?: boolean; disabled?: boolean }): HTMLButtonElement {
  const b = el('button', {
    type: 'button',
    class: props.class ?? 'qc-button',
    'aria-label': props.label,
    title: props.title ?? props.label,
    ...(props.html !== undefined ? { html: props.html } : {}),
    ...(props.text !== undefined ? { text: props.text } : {}),
    ...(props.pressed !== undefined ? { 'aria-pressed': String(props.pressed) } : {}),
  })
  if (props.disabled) b.disabled = true
  if (props.onClick) b.addEventListener('click', props.onClick)
  return b
}

/** Keep a surface's presses to itself. The chrome layer is inert and each control opts back in, but
 *  the drag layers under it bind capture-phase handlers on the gesture box: a surface that lives in
 *  the chrome subtree is safe, and this stops the bubble so a press on a panel never reaches a
 *  chart handler either. */
export function ownPointer(node: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'mousedown', 'dblclick'] as const) {
    node.addEventListener(type, (e) => e.stopPropagation())
  }
}

/** The elements inside a root that take focus in tab order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
  return [...nodes].filter((n) => !n.hasAttribute('disabled') && n.tabIndex >= 0 && !n.hidden && n.getAttribute('aria-hidden') !== 'true')
}

/** Roving focus over a set of controls: one tab stop, arrows move between them, Home and End
 *  jump. The set is read at every press, so controls that come and go are always current. */
export function rovingFocus(root: HTMLElement, items: () => HTMLElement[], orientation: 'horizontal' | 'vertical' | 'both' = 'both'): () => void {
  const sync = (active: HTMLElement | null): void => {
    const list = items()
    for (const item of list) item.tabIndex = item === active ? 0 : -1
    if (!active && list[0]) list[0].tabIndex = 0
  }
  const onKey = (e: KeyboardEvent): void => {
    const list = items()
    if (list.length === 0) return
    const at = list.indexOf(document.activeElement as HTMLElement)
    const next = orientation !== 'vertical' && (e.key === 'ArrowRight' || (orientation === 'horizontal' && e.key === 'ArrowDown'))
    const prev = orientation !== 'vertical' && (e.key === 'ArrowLeft' || (orientation === 'horizontal' && e.key === 'ArrowUp'))
    const down = orientation !== 'horizontal' && e.key === 'ArrowDown'
    const up = orientation !== 'horizontal' && e.key === 'ArrowUp'
    let target: HTMLElement | undefined
    if (next || down) target = list[(at + 1 + list.length) % list.length]
    else if (prev || up) target = list[(at - 1 + list.length) % list.length]
    else if (e.key === 'Home') target = list[0]
    else if (e.key === 'End') target = list[list.length - 1]
    if (!target) return
    e.preventDefault()
    sync(target)
    target.focus()
  }
  const onFocus = (e: FocusEvent): void => {
    const target = e.target as HTMLElement
    if (items().includes(target)) sync(target)
  }
  root.addEventListener('keydown', onKey)
  root.addEventListener('focusin', onFocus)
  sync(null)
  return () => {
    root.removeEventListener('keydown', onKey)
    root.removeEventListener('focusin', onFocus)
  }
}

/** Trap Tab inside a dialog and restore focus to the opener when it closes. */
export function trapFocus(root: HTMLElement): () => void {
  const opener = document.activeElement as HTMLElement | null
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Tab') return
    const list = focusables(root)
    if (list.length === 0) {
      e.preventDefault()
      return
    }
    const first = list[0]!
    const last = list[list.length - 1]!
    const active = document.activeElement
    if (e.shiftKey && (active === first || !root.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !root.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }
  root.addEventListener('keydown', onKey)
  return () => {
    root.removeEventListener('keydown', onKey)
    if (opener && opener.isConnected) opener.focus({ preventScroll: true })
  }
}

/** Close a floating panel on a press outside it (and outside the control that opened it), or on
 *  Escape. Bound on the document in the capture phase, so a press the chart swallows still counts. */
export function dismissOnOutside(panel: HTMLElement, anchor: HTMLElement | null, close: () => void): () => void {
  const onDown = (e: Event): void => {
    const target = e.target as Node
    if (panel.contains(target) || (anchor && anchor.contains(target))) return
    close()
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('keydown', onKey, true)
  return () => {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('keydown', onKey, true)
  }
}

/** Whether the chart reads right to left, from the root's own direction. */
export function isRtl(node: HTMLElement): boolean {
  const dir = node.closest<HTMLElement>('[dir]')?.getAttribute('dir') ?? (typeof getComputedStyle === 'function' ? getComputedStyle(node).direction : 'ltr')
  return dir === 'rtl'
}

/** Place a floating panel inside the chart's chrome box beside its anchor: to the inline end of
 *  the anchor for `side`, below it for `below`, clamped so the panel stays within the box and
 *  flipping to the other side when there is no room. Sizes are measured after the panel is in
 *  the DOM; the position is the one inline write, because a position is calculated geometry. */
export function placePanel(panel: HTMLElement, anchor: HTMLElement, box: HTMLElement, mode: 'side' | 'below', gap = 4): void {
  const b = box.getBoundingClientRect()
  const a = anchor.getBoundingClientRect()
  const w = panel.offsetWidth
  const h = panel.offsetHeight
  const rtl = isRtl(box)
  let left: number
  let top: number
  if (mode === 'side') {
    left = rtl ? a.left - b.left - w - gap : a.right - b.left + gap
    if (left + w > b.width) left = a.left - b.left - w - gap
    if (left < 0) left = Math.max(0, rtl ? a.right - b.left + gap : 0)
    top = a.top - b.top
    if (top + h > b.height) top = Math.max(0, b.height - h)
  } else {
    left = rtl ? a.right - b.left - w : a.left - b.left
    left = Math.max(0, Math.min(left, b.width - w))
    top = a.bottom - b.top + gap
    if (top + h > b.height) top = Math.max(0, a.top - b.top - h - gap)
  }
  panel.style.left = `${Math.round(left)}px`
  panel.style.top = `${Math.round(top)}px`
  panel.style.maxHeight = `${Math.max(120, b.height - top - 4)}px`
}

/** A menu's own keyboard: arrows move over its rows, Home and End jump, Escape is the caller's.
 *  Rows are read at every press, so a rebuilt menu needs no rebinding. */
export function menuKeys(menu: HTMLElement, rows: () => HTMLElement[]): () => void {
  return rovingFocus(menu, rows, 'vertical')
}

/** The first row of a menu takes focus when it opens, so the keyboard lands on the choices. */
export function focusFirst(root: HTMLElement): void {
  focusables(root)[0]?.focus({ preventScroll: true })
}
