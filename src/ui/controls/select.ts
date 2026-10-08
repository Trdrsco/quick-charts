// The chevron a select field wears: the 18px mark in a slot at the end of the field's box, drawn
// through the widget's resolver so a host's drawing for the chevron stands here as it stands in every
// other control that means the same. A native select keeps its own list and its own keyboard, and the
// slot takes no pointer, so a press on the chevron opens the select beneath it. A list button lays
// the slot out after its face, and the slot's mark turns while the list is open.
import type { IconResolver } from '../icons/resolver'

/** The chevron's slot, hidden from assistive technology: the field it ends carries the name. */
export function selectChevron(icons: IconResolver): HTMLSpanElement {
  const slot = document.createElement('span')
  slot.className = 'qc-select-chevron'
  slot.setAttribute('aria-hidden', 'true')
  slot.appendChild(icons.icon('chevronDown18', 18))
  return slot
}

/** A native select in its field box, with the chevron at the end of the box. */
export function selectField(select: HTMLSelectElement, icons: IconResolver): HTMLSpanElement {
  const box = document.createElement('span')
  box.className = 'qc-select'
  box.append(select, selectChevron(icons))
  return box
}
