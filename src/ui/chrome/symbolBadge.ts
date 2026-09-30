// The neutral fallback shared by legend and search. It never parses a routing ticker, guesses a
// provider, or fetches app-relative artwork. A logo needs the approved neutral asset contract;
// until that exists, a decorative monogram accompanies the complete supplied display identity.
import { h } from './dom'

export function createSymbolBadge(displayName: string): { element: HTMLElement; set(name: string): void } {
  const element = h('span', { class: 'qc-symbol-badge', 'aria-hidden': 'true' })
  const set = (name: string): void => { element.textContent = Array.from(name.trim()).slice(0, 2).join('').toUpperCase() }
  set(displayName)
  return { element, set }
}
