// A panel a row expands in place, inside the surface that owns it. The chart settings menu and the
// indicator settings dialog open the color palette this way rather than as a second floating
// overlay: a popover raised over a menu is a stack a person has to dismiss twice, and a press
// inside it would read as a press outside the menu and take the menu down with it. Expanding
// inside the surface keeps one overlay, one dismissal and one focus path.
import { el } from '../drawings/dom'
import { ownsEscape, pushEscapeOwner } from './escape'

/** Open `content` directly after `after`, owned by `anchor`. Escape closes it and returns focus to
 *  the anchor while the surface around it stays open. Returns the close, which the surface runs at
 *  teardown; `onClosed` reports every close, including the surface's own. */
export function openInlinePanel(anchor: HTMLElement, content: HTMLElement, after: HTMLElement, onClosed: () => void): () => void {
  const wrap = el('div', { class: 'qc-inline-panel' }, content)
  after.after(wrap)
  anchor.setAttribute('aria-expanded', 'true')
  const escape = pushEscapeOwner()
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    escape.release()
    document.removeEventListener('keydown', onKey, true)
    wrap.remove()
    anchor.setAttribute('aria-expanded', 'false')
    onClosed()
  }
  function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !ownsEscape(escape.token)) return
    event.stopPropagation()
    event.preventDefault()
    close()
    anchor.focus({ preventScroll: true })
  }
  document.addEventListener('keydown', onKey, true)
  return close
}
