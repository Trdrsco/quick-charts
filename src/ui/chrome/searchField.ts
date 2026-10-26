// The field every search dialog opens on: the magnifier, the value, and the strip of trailing
// controls, with no box drawn around them. The symbol search and the indicator picker build it here,
// so the two read and behave as one field.
import { ICONS } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'
import { button, h, type Child } from './dom'

/** The field around `input`, its trailing controls in the order a hand reaches for them. */
export function searchField(icons: IconResolver, input: HTMLInputElement, ...trailing: Child[]): HTMLElement {
  return h('div', { class: 'qc-search-field' }, icons.glyph(ICONS.search, { size: 28, className: 'qc-search-magnifier' }), input, h('span', { class: 'qc-search-actions-field' }, ...trailing))
}

/** The clear mark at the head of the trailing strip: a 24px cell that empties the field. */
export function searchClear(icons: IconResolver, label: string, onClear: () => void): HTMLButtonElement {
  return button({ label, icon: icons.glyph(ICONS.clear, { size: 18 }), className: 'qc-search-op', onClick: onClear })
}
