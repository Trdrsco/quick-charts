// The chart settings menu: appearance (the seven series and background colors), display (grid
// lines, session shading), the price scale's four modes, and the theme's two modes. Appearance
// edits run through `chart.appearance.apply`, the runtime layer of the appearance ladder; the
// scale modes and the theme modes are their own commands.
import type { ChartMessageKey } from '../../i18n'
import type { ChartOverrides } from '../../overrides'
import { SCALE_MODE_OPTIONS } from '../../scaleMode'
import { THEME_MODES } from '../../theme/schema'
import { activeChart, commandLabel, type ChromeContext } from './context'
import { fieldRow, switchRow } from './dialog'
import { button, h, name } from './dom'
import { ICONS } from './icons'
import { hexOf } from './indicatorSettings'
import { menuHeading, menuItem, menuSeparator, openMenu, type MenuHandle } from './menu'

type ColorLeaf = 'background' | 'upColor' | 'downColor' | 'borderUpColor' | 'borderDownColor' | 'wickUpColor' | 'wickDownColor'

/** The appearance colors the menu edits, in row order. */
const COLOR_ROWS: readonly { leaf: ColorLeaf; label: ChartMessageKey }[] = [
  { leaf: 'background', label: 'settings.background' },
  { leaf: 'upColor', label: 'settings.upCandles' },
  { leaf: 'downColor', label: 'settings.downCandles' },
  { leaf: 'borderUpColor', label: 'settings.upBorders' },
  { leaf: 'borderDownColor', label: 'settings.downBorders' },
  { leaf: 'wickUpColor', label: 'settings.upWicks' },
  { leaf: 'wickDownColor', label: 'settings.downWicks' },
]

const TOGGLE_ROWS: readonly { leaf: 'grid' | 'sessions'; label: ChartMessageKey }[] = [
  { leaf: 'grid', label: 'settings.gridLines' },
  { leaf: 'sessions', label: 'settings.sessionShading' },
]

export interface SettingsMenuHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export function mountSettingsMenu(deps: ChromeContext): SettingsMenuHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  const trigger = button({ label: t()('settings.menu'), icon: ICONS.settings, className: 'qc-toolbar-button', onClick: () => open() })
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')

  const apply = (partial: Partial<ChartOverrides['appearance']>): void => {
    deps.commands.execute('chart.appearance.apply', { appearance: partial })
  }

  const open = (): void => {
    menu = openMenu({
      host: deps.overlays,
      anchor: trigger,
      label: t()('settings.menu'),
      role: 'dialog',
      className: 'qc-settings-menu',
      width: 280,
      align: 'end',
      build(body, handle) {
        const chart = activeChart(deps)
        const appearance = chart.appearance().appearance
        const canApply = deps.commands.available('chart.appearance.apply')
        body.appendChild(menuHeading(t()('settings.sectionAppearance')))
        for (const row of COLOR_ROWS) {
          const hex = hexOf(appearance[row.leaf])
          const input = h('input', { type: 'color', class: 'qc-field qc-color-field', 'aria-label': t()(row.label), ...(hex ? { value: hex } : {}), ...(canApply ? {} : { disabled: true }) })
          input.addEventListener('input', () => apply({ [row.leaf]: input.value }))
          body.appendChild(fieldRow(t()(row.label), input, { className: 'qc-settings-row' }))
        }
        body.appendChild(menuSeparator())
        body.appendChild(menuHeading(t()('settings.sectionDisplay')))
        for (const row of TOGGLE_ROWS) {
          body.appendChild(switchRow({ label: t()(row.label), checked: appearance[row.leaf], disabled: !canApply, onChange: (on) => apply({ [row.leaf]: on }) }))
        }
        body.appendChild(menuSeparator())
        body.appendChild(menuHeading(t()('settings.sectionScale')))
        const scale = chart.scaleMode()
        for (const option of SCALE_MODE_OPTIONS) {
          const id = `chart.scale.${option.id}`
          body.appendChild(
            menuItem({
              text: commandLabel(deps, id),
              role: 'menuitemradio',
              checked: option.id === scale,
              disabled: option.id !== scale && !deps.commands.available(id),
              onSelect: () => {
                deps.commands.execute(id)
                handle.refresh()
              },
            }),
          )
        }
        body.appendChild(menuSeparator())
        body.appendChild(menuHeading(t()('settings.sectionTheme')))
        const mode = deps.widget.theme.mode()
        for (const themeMode of THEME_MODES) {
          const id = `widget.theme.${themeMode}`
          body.appendChild(
            menuItem({
              text: commandLabel(deps, id),
              role: 'menuitemradio',
              checked: themeMode === mode,
              disabled: themeMode !== mode && !deps.commands.available(id),
              onSelect: () => {
                deps.commands.execute(id)
                handle.refresh()
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
    name(trigger, t()('settings.menu'))
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
