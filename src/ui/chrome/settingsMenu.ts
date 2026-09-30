// The chart settings menu: appearance (the seven series and background colors), display (grid
// lines, session shading), the price scale's four modes, and the theme's two modes. Appearance
// edits run through `chart.appearance.apply`, the runtime layer of the appearance ladder; the
// scale modes and the theme modes are their own commands.
import type { ChartMessageKey } from '../../i18n'
import type { ChartOverrides } from '../../overrides'
import { SCALE_MODE_OPTIONS } from '../../scaleMode'
import { THEME_MODES } from '../../theme/schema'
import { activeChart, commandLabel, type ChromeContext } from './context'
import type { ResolvedUi } from '../../widget/planes'
import { fieldRow, switchRow } from './dialog'
import { button, name } from './dom'
import { ICONS } from '../controls/icons'
import { createColorControl, readColor, type ColorControlHandle } from '../controls/color'
import { openInlinePanel } from '../controls/inlinePanel'
import { menuHeading, menuItem, menuSeparator, openMenu, toggleMenu, type MenuHandle } from './menu'

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

/** The menu reads the feature plane for one thing: whether its Theme section is present. */
export interface SettingsMenuDeps extends ChromeContext {
  ui: Pick<ResolvedUi, 'settingsTheme'>
}

export function mountSettingsMenu(deps: SettingsMenuDeps): SettingsMenuHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  let menu: MenuHandle | null = null
  // The color controls this menu's body currently holds. A rebuild and a close both retire them,
  // so an open palette never outlives the row that opened it.
  const controls: ColorControlHandle[] = []
  const retireControls = (): void => {
    for (const control of controls) control.destroy()
    controls.length = 0
  }
  const trigger = button({ label: t()('settings.menu'), icon: deps.icons.glyph(ICONS.settings), className: 'qc-toolbar-button', onClick: () => toggleMenu(trigger, open) })
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
        retireControls()
        const chart = activeChart(deps)
        const appearance = chart.appearance().appearance
        const canApply = deps.commands.available('chart.appearance.apply')
        body.appendChild(menuHeading(t()('settings.sectionAppearance')))
        for (const row of COLOR_ROWS) {
          const label = t()(row.label)
          const value = appearance[row.leaf]
          // The same palette and custom editor the drawing surfaces use, opened as a disclosure
          // inside this menu. A value in a notation the control does not read keeps its
          // declaration and simply shows as it stands until a pick replaces it.
          const control: ColorControlHandle = createColorControl(t(), {
            label,
            value,
            opacity: readColor(value)?.alpha ?? 1,
            disabled: !canApply,
            closeOnPick: true,
            onPick: (color) => {
              control.update(color)
              apply({ [row.leaf]: color })
            },
            openPanel: (anchor, content, onClosed) => openInlinePanel(anchor, content, anchor.closest('.qc-settings-row') ?? anchor, () => {
              onClosed()
              handle.reposition()
            }),
          })
          controls.push(control)
          body.appendChild(fieldRow(label, control.element, { className: 'qc-settings-row' }))
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
        // Reset defaults sits below the scale section, where the baseline put it: it undoes the
        // rows above it (the colors, the display toggles and the scale mode) and nothing else. The
        // viewport has its own verb, and neither the theme nor the host's brand values are the
        // viewer's to reset.
        body.appendChild(menuSeparator())
        body.appendChild(
          menuItem({
            text: commandLabel(deps, 'chart.appearance.reset'),
            disabled: !deps.commands.available('chart.appearance.reset'),
            onSelect: () => {
              deps.commands.execute('chart.appearance.reset')
              handle.refresh()
            },
          }),
        )
        // The separator, the heading and the mode rows stand or fall together, so a host that
        // carries the theme choice in its own settings gets a menu that ends on Reset defaults
        // rather than on a rule with nothing under it.
        if (deps.ui.settingsTheme) {
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
        }
      },
      onClose: () => {
        retireControls()
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
