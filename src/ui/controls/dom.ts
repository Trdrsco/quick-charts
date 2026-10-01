// The two DOM questions every surface asks: what in here can take the keyboard, and which way does
// this element read. Both the chrome and the drawing surfaces need them, and an answer that differs
// between the two would put a dialog's focus trap and a menu's out of step.

/** Everything inside `root` a hand or the keyboard can reach: not disabled, not taken out of the
 *  tab order, not hidden from sight or from a reader, and not inside a hidden group. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
  return [...nodes].filter((n) => !n.hasAttribute('disabled') && n.tabIndex >= 0 && !hiddenWithin(n, root) && n.getAttribute('aria-hidden') !== 'true')
}

/** Whether the element, or a group between it and `root`, is hidden. */
function hiddenWithin(node: HTMLElement, root: HTMLElement): boolean {
  for (let el: HTMLElement | null = node; el && el !== root; el = el.parentElement) if (el.hidden) return true
  return false
}

/** Which way the element reads, by the nearest declared direction and the computed one after it.
 *  A document without a layout engine answers left to right rather than throwing. */
export function isRtl(node: Element): boolean {
  const dir = node.closest<HTMLElement>('[dir]')?.getAttribute('dir') ?? (typeof getComputedStyle === 'function' ? getComputedStyle(node).direction : 'ltr')
  return dir === 'rtl'
}
