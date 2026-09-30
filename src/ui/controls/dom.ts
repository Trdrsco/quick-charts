// The two DOM questions every surface asks: what in here can take the keyboard, and which way does
// this element read. Both the chrome and the drawing surfaces need them, and an answer that differs
// between the two would put a dialog's focus trap and a menu's out of step.

/** Everything inside `root` a hand or the keyboard can reach: not disabled, not taken out of the
 *  tab order, not hidden from sight or from a reader. */
export function focusables(root: HTMLElement): HTMLElement[] {
  const nodes = root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]')
  return [...nodes].filter((n) => !n.hasAttribute('disabled') && n.tabIndex >= 0 && !n.hidden && n.getAttribute('aria-hidden') !== 'true')
}

/** Which way the element reads, by the nearest declared direction and the computed one after it.
 *  A document without a layout engine answers left to right rather than throwing. */
export function isRtl(node: Element): boolean {
  const dir = node.closest<HTMLElement>('[dir]')?.getAttribute('dir') ?? (typeof getComputedStyle === 'function' ? getComputedStyle(node).direction : 'ltr')
  return dir === 'rtl'
}
