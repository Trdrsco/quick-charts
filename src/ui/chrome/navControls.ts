// The on-chart navigation cluster: zoom out, zoom in, scroll back, scroll forward, reset. Five
// buttons over the chart's own view commands, floating at the bottom of the pane and shown while
// the pointer is over the chart or the keyboard is in the cluster. Every press is a command, so a
// refused verb renders disabled and does nothing.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CommandRegistry } from '../../widget/commands'
import { button, h, name, setDisabled, stopPointer } from './dom'
import { ICONS } from './icons'

export interface NavControlsDeps {
  /** The chart's chrome subtree. */
  chrome: HTMLElement
  commands: CommandRegistry
  i18n: ChartI18n
}

/** The five verbs, in order, each with its glyph and the catalog key of its name. */
const CONTROLS: readonly { id: string; icon: string; label: ChartMessageKey }[] = [
  { id: 'chart.view.zoomOut', icon: ICONS.zoomOut, label: 'range.zoomOut' },
  { id: 'chart.view.zoomIn', icon: ICONS.zoomIn, label: 'range.zoomIn' },
  { id: 'chart.view.scrollLeft', icon: ICONS.chevronLeft, label: 'range.scrollLeft' },
  { id: 'chart.view.scrollRight', icon: ICONS.chevronRight, label: 'range.scrollRight' },
  { id: 'chart.view.reset', icon: ICONS.reset, label: 'range.reset' },
]

export function mountNavControls(deps: NavControlsDeps): { destroy(): void } {
  const t = deps.i18n.t
  const group = h('div', { class: 'qc-overlay qc-nav', role: 'group', 'aria-label': t('chrome.navigation') })
  stopPointer(group)
  const buttons = new Map<string, HTMLButtonElement>()
  for (const control of CONTROLS) {
    const b = button({ label: t(control.label), icon: control.icon, iconSize: 18, className: 'qc-nav-button', onClick: () => deps.commands.execute(control.id) })
    buttons.set(control.id, b)
    group.appendChild(b)
  }
  const sync = (): void => {
    for (const [id, b] of buttons) setDisabled(b, !deps.commands.available(id))
  }
  const relabel = (): void => {
    for (const control of CONTROLS) name(buttons.get(control.id)!, t(control.label))
    group.setAttribute('aria-label', t('chrome.navigation'))
  }
  sync()
  const offCommands = deps.commands.onChange(sync)
  const offStrings = deps.i18n.onChange(relabel)
  deps.chrome.appendChild(group)
  return {
    destroy() {
      offCommands()
      offStrings()
      group.remove()
    },
  }
}
