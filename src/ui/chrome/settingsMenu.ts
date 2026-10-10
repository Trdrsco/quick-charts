// The top bar's settings control: the gear that opens the chart settings dialog and closes it again,
// as Cancel does. The dialog itself is the chrome's, so the `chart.settings.open` command reaches the
// same one whether or not the bar shows the gear.
import { type ChromeContext } from './context'
import { button, name } from './dom'
import { ICONS } from '../controls/icons'
import type { ChartSettingsDialog } from '../settings/dialog'

export interface SettingsMenuHandle {
  element: HTMLButtonElement
  sync(): void
  destroy(): void
}

export interface SettingsMenuDeps extends ChromeContext {
  /** The chrome's chart settings dialog, which the gear opens. */
  settingsDialog: ChartSettingsDialog
}

export function mountSettingsMenu(deps: SettingsMenuDeps): SettingsMenuHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const trigger = button({
    label: t()('settings.menu'),
    icon: deps.icons.glyph(ICONS.settings),
    className: 'qc-toolbar-button',
    onClick: () => deps.settingsDialog.toggle(),
  })
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', String(deps.settingsDialog.isOpen()))
  const stop = deps.settingsDialog.onToggle((open) => trigger.setAttribute('aria-expanded', String(open)))
  return {
    element: trigger,
    sync() {
      name(trigger, t()('settings.menu'))
    },
    destroy() {
      stop()
      trigger.remove()
    },
  }
}
