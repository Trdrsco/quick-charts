// A host's own control, made by the chart as one of its own.
//
// A service the chart does not implement still belongs in its top bar, and it should read as one of
// the bar's controls rather than something bolted on beside it. So the chart makes the button: it
// wears the bar's own recipe, so it keeps the bar's height, rhythm, hover, pressed and open states,
// and it gives up its visible words with the bar's other quiet labels when the row runs out of room.
// The recipe's classes stay the chart's; a host never writes them. The host decides what the control
// says, what it draws and what a press does, places it in a slot, and takes it out again. Its glyph
// is drawn through the widget's resolver, so it follows the reading direction as the chart's own do.
import type { ChartIconFactory } from '../icons/contract'
import type { IconResolver } from '../icons/resolver'
import { button, h, name, setDisabled } from './dom'

/** A control the host stands in the top bar. */
export interface ToolbarButtonOptions {
  /** The accessible name, which also shows on hover. The host's own words, in its own language. */
  label: string
  /** Words beside the glyph. The bar takes them away before its own last label when the row is too
   *  narrow for every label, and leaves the glyph and the name. Omit for a glyph-only control. */
  text?: string
  /** The control's glyph, drawn on the bar's icon box, and drawn again when a language turns the
   *  widget's reading direction around. */
  icon?: ChartIconFactory
  /** Present makes the control a toggle that announces whether it is on. */
  pressed?: boolean
  disabled?: boolean
  /** The control opens a menu or a dialog of the host's own: it announces the popup, and whether
   *  that popup is open is the host's to say through `update`. */
  popup?: 'menu' | 'dialog'
  onClick(event: MouseEvent): void
}

/** What a host may change on a control it stood in the bar. A field left out keeps its value. */
export interface ToolbarButtonState {
  label?: string
  text?: string
  /** A new glyph, or null for none. */
  icon?: ChartIconFactory | null
  pressed?: boolean
  disabled?: boolean
  /** Whether the popup the control opens is open. */
  expanded?: boolean
}

export interface ToolbarButton {
  /** The control. The host places it in a top-bar slot and removes it when it is done with it. */
  readonly element: HTMLButtonElement
  update(state: ToolbarButtonState): void
}

/** The bar's icon box: every control in the bar draws its glyph on it. */
const ICON_BOX = 28

export function createToolbarButton(options: ToolbarButtonOptions, icons: IconResolver): ToolbarButton {
  const element = button({
    label: options.label,
    ...(options.text !== undefined ? { text: options.text } : {}),
    className: 'qc-toolbar-button',
    ...(options.pressed !== undefined ? { pressed: options.pressed } : {}),
    disabled: options.disabled === true,
    onClick: (event) => options.onClick(event),
  })
  // Words a host adds leave first: the bar's own last label outlasts them.
  if (options.text !== undefined) element.dataset.qcLabel = 'drop'
  if (options.popup) {
    element.setAttribute('aria-haspopup', options.popup)
    element.setAttribute('aria-expanded', 'false')
  }

  const paint = (factory: ChartIconFactory | null | undefined): void => {
    element.querySelector(':scope > .qc-icon')?.remove()
    if (!factory) return
    const drawn = icons.draw(factory, { width: ICON_BOX, height: ICON_BOX }, 'toolbarButton')
    if (drawn) element.prepend(h('span', { class: 'qc-icon', 'aria-hidden': 'true' }, drawn))
  }
  paint(options.icon)

  return {
    element,
    update(state) {
      if (state.label !== undefined) name(element, state.label)
      if (state.text !== undefined) {
        let words = element.querySelector<HTMLElement>(':scope > .qc-button-text')
        if (!words) {
          words = element.appendChild(h('span', { class: 'qc-button-text' }))
          element.dataset.qcLabel = 'drop'
        }
        words.textContent = state.text
      }
      if (state.icon !== undefined) paint(state.icon)
      if (state.pressed !== undefined) element.setAttribute('aria-pressed', String(state.pressed))
      if (state.disabled !== undefined) setDisabled(element, state.disabled)
      if (state.expanded !== undefined && element.hasAttribute('aria-haspopup')) element.setAttribute('aria-expanded', String(state.expanded))
    },
  }
}
