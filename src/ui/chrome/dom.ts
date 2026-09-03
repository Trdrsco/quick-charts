// The DOM helpers every chrome surface builds with. Framework-neutral on purpose: a surface is a
// function over `document.createElement`, and the only things shared between surfaces are the
// handful of shapes below, so a button in the top bar and a button in a dialog are made the same
// way and read the same way to a screen reader.
//
// Every visual comes from a `.qc-*` recipe in the package stylesheet; nothing here writes a color
// or a size. The one style a helper ever sets inline is calculated geometry, which is the
// stylesheet contract's own exception.

/** What `h` accepts as a child: an element, text, or nothing at all. */
export type Child = Node | string | null | undefined | false

/** Attribute values `h` writes. `true` writes the attribute with an empty value, `false`, null and
 *  undefined write nothing, and a number is written as its text. */
export type Attrs = Readonly<Record<string, string | number | boolean | null | undefined>>

/** Build one element: its attributes, then its children in order. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue
    if (key === 'class') element.className = String(value)
    else element.setAttribute(key, value === true ? '' : String(value))
  }
  append(element, ...children)
  return element
}

/** Append children, skipping the empties, so a conditional child reads as `cond && node`. */
export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
}

/** Replace every child with the given ones. */
export function replace(parent: HTMLElement, ...children: Child[]): void {
  parent.replaceChildren()
  append(parent, ...children)
}

/** An inline SVG glyph from a body string. The body is package-authored markup (see icons.ts), which
 *  is what makes the innerHTML write safe. Hidden from assistive technology: the control it sits in
 *  carries the accessible name. */
export function glyph(body: string, options: { size?: number; viewBox?: string; className?: string } = {}): HTMLElement {
  const size = options.size ?? 28
  const span = h('span', { class: `qc-icon${options.className ? ` ${options.className}` : ''}`, 'aria-hidden': 'true' })
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="${options.viewBox ?? '0 0 28 28'}" fill="none" aria-hidden="true">${body}</svg>`
  return span
}

/** Write a control's accessible name: what a screen reader speaks and what a hover shows. */
export function name(element: HTMLElement, label: string): void {
  element.setAttribute('aria-label', label)
  element.title = label
}

export interface ButtonOptions {
  /** The accessible name. Always present: an icon-only control is otherwise nameless. */
  label: string
  /** Visible text. Omitted for an icon-only control. */
  text?: string
  /** A glyph body from icons.ts. */
  icon?: string
  iconSize?: number
  className?: string
  /** Whether the control reads as pressed (a toggle) rather than merely enabled. */
  pressed?: boolean
  disabled?: boolean
  onClick?(event: MouseEvent): void
}

/** One button, named, typed, and painted by its recipe. Text and icon both optional, so the same
 *  helper makes an icon button, a text button, or a chip carrying both. */
export function button(options: ButtonOptions): HTMLButtonElement {
  const element = h('button', { type: 'button', class: `qc-button${options.className ? ` ${options.className}` : ''}` })
  name(element, options.label)
  if (options.icon) element.appendChild(glyph(options.icon, { size: options.iconSize }))
  if (options.text !== undefined) element.appendChild(h('span', { class: 'qc-button-text' }, options.text))
  if (options.pressed !== undefined) element.setAttribute('aria-pressed', String(options.pressed))
  setDisabled(element, options.disabled === true)
  if (options.onClick) element.addEventListener('click', options.onClick)
  return element
}

/** Disable a control the way a menu row and a toolbar button both must: the native attribute, so
 *  it leaves the tab order and takes no click, and the aria state, so the reason survives. */
export function setDisabled(element: HTMLElement, disabled: boolean): void {
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement) element.disabled = disabled
  if (disabled) element.setAttribute('aria-disabled', 'true')
  else element.removeAttribute('aria-disabled')
}

/** Update a button's visible text and accessible name together. */
export function retext(element: HTMLElement, label: string, text?: string): void {
  name(element, label)
  const textNode = element.querySelector('.qc-button-text')
  if (textNode && text !== undefined) textNode.textContent = text
}

/** Keep a chrome surface's presses to itself. The chrome layer overlays the gesture box, whose
 *  drag layers bind capture-phase handlers; a surface that let its presses bubble would start a
 *  pan under a click. */
export function stopPointer(element: HTMLElement): void {
  for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel'] as const) {
    element.addEventListener(type, (event) => event.stopPropagation())
  }
}

/** The elements inside `root` a keyboard can land on, in document order. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const all = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
  return [...all].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1' && !el.hidden && el.getAttribute('aria-hidden') !== 'true')
}

/** The keyboard-reachable rows of a list: everything marked as an item that is neither disabled nor
 *  hidden. The mark is what a roving focus walks, so a heading or a separator is never landed on. */
export function items(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[data-qc-item]')].filter((el) => !el.hasAttribute('disabled') && !el.hidden)
}

/** Move focus among items by arrow keys, Home and End, with wraparound. Returns true when the key
 *  was one of those, so the caller can stop the event. */
export function roveFocus(root: HTMLElement, event: KeyboardEvent, orientation: 'vertical' | 'horizontal' | 'both' = 'vertical'): boolean {
  const list = items(root)
  if (list.length === 0) return false
  const vertical = orientation !== 'horizontal'
  const horizontal = orientation !== 'vertical'
  const next = (vertical && event.key === 'ArrowDown') || (horizontal && event.key === 'ArrowRight')
  const previous = (vertical && event.key === 'ArrowUp') || (horizontal && event.key === 'ArrowLeft')
  const current = list.indexOf(document.activeElement as HTMLElement)
  let target: number
  if (next) target = current < 0 ? 0 : (current + 1) % list.length
  else if (previous) target = current < 0 ? list.length - 1 : (current - 1 + list.length) % list.length
  else if (event.key === 'Home') target = 0
  else if (event.key === 'End') target = list.length - 1
  else return false
  focusItem(list, target)
  return true
}

/** Give one item the tab stop and the focus, and take the stop from the rest: roving tabindex. */
export function focusItem(list: readonly HTMLElement[], index: number): void {
  list.forEach((el, i) => el.setAttribute('tabindex', i === index ? '0' : '-1'))
  list[index]?.focus()
}

/** Arm a list for roving focus: every item takes the negative tab stop and one keeps the stop. */
export function armRoving(root: HTMLElement, activeIndex = 0): void {
  const list = items(root)
  list.forEach((el, i) => el.setAttribute('tabindex', i === activeIndex ? '0' : '-1'))
}

/** Whether the reading direction of an element resolves right to left. */
export function isRtl(element: Element): boolean {
  return (element.closest('[dir]')?.getAttribute('dir') ?? getComputedStyle(element).direction) === 'rtl'
}
