// The chart-style picker: one button wearing the active style's glyph, opening a menu of the seven
// styles in CHART_STYLES order. Each row is the style's own command, so the current style reads as
// checked and a refused style renders disabled.
import { CHART_STYLES, type ChartStyleId } from '../../widget/styles'
import { activeChart, commandLabel, type ChromeContext } from './context'
import { button, glyph, name } from './dom'
import { STYLE_ICONS } from './icons'
import { menuItem, openMenu, type MenuHandle } from './menu'

export interface StylePickerHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export function mountStylePicker(deps: ChromeContext): StylePickerHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  const trigger = button({ label: t()('chrome.chartStyle'), icon: STYLE_ICONS.candles, className: 'qc-toolbar-button', onClick: () => open() })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  const open = (): void => {
    const current = activeChart(deps).style()
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('chrome.chartStyle'),
      width: 180,
      initialIndex: Math.max(0, CHART_STYLES.indexOf(current)),
      build(body, handle) {
        const active = activeChart(deps).style()
        for (const style of CHART_STYLES) {
          const id = `chart.style.${style}`
          body.appendChild(
            menuItem({
              text: commandLabel(deps, id),
              icon: glyph(STYLE_ICONS[style], { size: 18 }),
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
      },
      onClose: () => {
        menu = null
      },
    })
  }

  const sync = (): void => {
    const style: ChartStyleId = activeChart(deps).style()
    trigger.querySelector('.qc-icon')?.replaceWith(glyph(STYLE_ICONS[style]))
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
