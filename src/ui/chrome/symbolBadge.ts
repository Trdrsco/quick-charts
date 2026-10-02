// The neutral fallback shared by legend and search: a decorative monogram of the display name the
// host supplied, drawn beside that whole name.
import { h } from './dom'

export function createSymbolBadge(displayName: string): { element: HTMLElement; set(name: string): void } {
  const element = h('span', { class: 'qc-symbol-badge', 'aria-hidden': 'true' })
  const set = (name: string): void => { element.textContent = Array.from(name.trim()).slice(0, 2).join('').toUpperCase() }
  set(displayName)
  return { element, set }
}
