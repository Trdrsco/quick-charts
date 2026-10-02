// The chart-style picker: one button wearing the active style's glyph, opening a menu of the styles
// the widget offers. Every style, when the host named no list, groups by family; a list the host
// named keeps the host's order, with a rule wherever the family changes. Each row is the style's own
// command, so the current style reads as checked and a refused style renders disabled.
import type { ChartStyleId, OfferedChartStyles } from '../../widget/styles'
import { activeChart, commandLabel, shows, type ChromeContext } from './context'
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

const FAMILY_OF = new Map<ChartStyleId, number>(STYLE_MENU_GROUPS.flatMap((group, family) => group.map((style) => [style, family] as const)))

/** The menu's groups for what the widget offers: the families as above for every style, or the
 *  host's list in its own order, split where two neighbors belong to different families. */
export function styleMenuGroups(offered: OfferedChartStyles): readonly (readonly ChartStyleId[])[] {
  if (!offered.named) return STYLE_MENU_GROUPS
  const groups: ChartStyleId[][] = []
  for (const style of offered.list) {
    const last = groups.at(-1)
    if (last && FAMILY_OF.get(last[0]!) === FAMILY_OF.get(style)) last.push(style)
    else groups.push([style])
  }
  return groups
}

export interface StylePickerHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export function mountStylePicker(deps: ChromeContext): StylePickerHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  const groups = styleMenuGroups(deps.styles)
  const trigger = button({ label: t()('chrome.chartStyle'), icon: deps.icons.glyph(STYLE_ICONS.candles), className: 'qc-toolbar-button', onClick: () => toggleMenu(trigger, open) })
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  const listedStyle = (style: ChartStyleId, active: ChartStyleId): boolean => style === active || shows(deps, `chart.style.${style}`)

  const open = (): void => {
    const current = activeChart(deps).style()
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('chrome.chartStyle'),
      className: 'qc-style-menu',
      width: FLYOUT_WIDTH.chartStyle,
      initialIndex: Math.max(0, groups.flat().filter((style) => listedStyle(style, current)).indexOf(current)),
      build(body, handle) {
        const active = activeChart(deps).style()
        // The chosen style is always listed. A style the host hides because its policy refuses it
        // is not, and a group left with none draws no rule.
        let drawn = 0
        groups.forEach((group) => {
          const listed = group.filter((style) => listedStyle(style, active))
          if (listed.length === 0) return
          if (drawn++ > 0) body.appendChild(menuSeparator())
          for (const style of listed) {
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
    // With every other style hidden there is nothing to choose, so the picker is not drawn.
    trigger.hidden = !groups.flat().some((other) => other !== style && listedStyle(other, style))
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
