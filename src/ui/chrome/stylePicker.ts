// The chart-style picker: one button wearing the active style's glyph, opening a menu of the seven
// styles grouped by family. Each row is the style's own command, so the current style reads as
// checked and a refused style renders disabled.
import type { ChartStyleId } from '../../widget/styles'
import { activeChart, commandLabel, type ChromeContext } from './context'
import { button, name } from './dom'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { STYLE_ICONS } from '../controls/icons'
import { menuItem, menuSeparator, openMenu, toggleMenu, type MenuHandle } from './menu'

/** The menu's families, each under a rule: the bars, the lines, and the filled areas. */
const STYLE_MENU_GROUPS: readonly (readonly ChartStyleId[])[] = [
  ['bars', 'candles', 'hollow'],
  ['line', 'stepline'],
  ['area', 'baseline'],
]

export interface StylePickerHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export function mountStylePicker(deps: ChromeContext): StylePickerHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  const trigger = button({ label: t()('chrome.chartStyle'), icon: deps.icons.glyph(STYLE_ICONS.candles), className: 'qc-toolbar-button', onClick: () => toggleMenu(trigger, open) })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  const open = (): void => {
    const current = activeChart(deps).style()
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('chrome.chartStyle'),
      className: 'qc-style-menu',
      width: FLYOUT_WIDTH.chartStyle,
      initialIndex: Math.max(0, STYLE_MENU_GROUPS.flat().indexOf(current)),
      build(body, handle) {
        const active = activeChart(deps).style()
        STYLE_MENU_GROUPS.forEach((group, gi) => {
          if (gi > 0) body.appendChild(menuSeparator())
          for (const style of group) {
            const id = `chart.style.${style}`
            body.appendChild(
              menuItem({
                text: commandLabel(deps, id),
                // The style marks are pictorial, drawn to fill the icon grid rather than to sit in a
                // control, so they wear their full size in a row. An action glyph beside them does not.
                icon: deps.icons.glyph(STYLE_ICONS[style]),
                role: 'menuitemradio',
                checked: style === active,
                disabled: style !== active && !deps.commands.available(id),
                onSelect: () => {
                  handle.close()
                  deps.commands.execute(id)
                },
              }),
            )
          }
        })
      },
      onClose: () => {
        menu = null
      },
    })
  }

  const sync = (): void => {
    const style: ChartStyleId = activeChart(deps).style()
    trigger.querySelector('.qc-icon')?.replaceWith(deps.icons.glyph(STYLE_ICONS[style]))
    name(trigger, `${t()('chrome.chartStyle')}: ${commandLabel(deps, `chart.style.${style}`)}`)
    menu?.refresh()
  }
  sync()
  return {
    element: trigger,
    sync,
    destroy() {
      menu?.close()
      trigger.remove()
    },
  }
}
