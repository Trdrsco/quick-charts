// The chart settings dialog: a settings room with a section rail, a scrollable
// page and a fixed action row. Changes preview on the chart while the dialog is open; Cancel, the
// close button, Escape and the backdrop all restore the state the viewer opened it with.
import type { ChartMessageKey } from '../../i18n'
import type { ChartSettings, PartialChartSettings } from '../../settings/schema'
import { SCALE_MODE_OPTIONS, type ScaleMode } from '../../scaleMode'
import { THEME_MODES, type ThemeMode } from '../../theme/schema'
import { activeChart, commandLabel, shows, type ChromeContext } from './context'
import type { ResolvedUi } from '../../widget/planes'
import { dialogTitle, fieldRow, openDialog, switchRow, type DialogHandle } from './dialog'
import { button, h, name, setDisabled } from './dom'
import { ICONS, STYLE_ICONS, type Glyph } from '../controls/icons'
import { createColorControl, readColor, type ColorControlHandle } from '../controls/color'
import { openInlinePanel } from '../controls/inlinePanel'
import { menuHeading } from './menu'

type SettingsPage = 'appearance' | 'display' | 'scale' | 'theme'

/** The colors the menu edits, in row order, and where each lives in the settings tree. */
const COLOR_ROWS: readonly { read: (s: ChartSettings) => string; write: (color: string) => PartialChartSettings; label: ChartMessageKey }[] = [
  { read: (s) => s.canvas.background, write: (color) => ({ canvas: { background: color } }), label: 'settings.background' },
  { read: (s) => s.candles.upColor, write: (color) => ({ candles: { upColor: color } }), label: 'settings.upCandles' },
  { read: (s) => s.candles.downColor, write: (color) => ({ candles: { downColor: color } }), label: 'settings.downCandles' },
  { read: (s) => s.candles.borderUpColor, write: (color) => ({ candles: { borderUpColor: color } }), label: 'settings.upBorders' },
  { read: (s) => s.candles.borderDownColor, write: (color) => ({ candles: { borderDownColor: color } }), label: 'settings.downBorders' },
  { read: (s) => s.candles.wickUpColor, write: (color) => ({ candles: { wickUpColor: color } }), label: 'settings.upWicks' },
  { read: (s) => s.candles.wickDownColor, write: (color) => ({ candles: { wickDownColor: color } }), label: 'settings.downWicks' },
]

const TOGGLE_ROWS: readonly { read: (s: ChartSettings) => boolean; write: (on: boolean) => PartialChartSettings; label: ChartMessageKey }[] = [
  { read: (s) => s.canvas.verticalGrid, write: (on) => ({ canvas: { verticalGrid: on, horizontalGrid: on } }), label: 'settings.gridLines' },
  { read: (s) => s.symbol.session !== 'regular', write: (on) => ({ symbol: { session: on ? 'extended' : 'regular' } }), label: 'settings.sessionShading' },
]

/** The leaves this menu edits, as they stood when it opened: what Cancel puts back. */
const editedLeaves = (s: ChartSettings): PartialChartSettings => ({
  canvas: { background: s.canvas.background, verticalGrid: s.canvas.verticalGrid, horizontalGrid: s.canvas.horizontalGrid },
  candles: {
    upColor: s.candles.upColor,
    downColor: s.candles.downColor,
    borderUpColor: s.candles.borderUpColor,
    borderDownColor: s.candles.borderDownColor,
    wickUpColor: s.candles.wickUpColor,
    wickDownColor: s.candles.wickDownColor,
  },
  symbol: { session: s.symbol.session },
})

let nextSettingsId = 0

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
  const settingsId = ++nextSettingsId
  let dialog: DialogHandle | null = null
  let content: HTMLElement | null = null
  /** The open dialog's reset control, which reads the policy as the pages do. */
  let reset: HTMLButtonElement | null = null
  let activePage: SettingsPage = 'appearance'
  let committed = false
  let initial: { settings: PartialChartSettings; scale: ScaleMode; theme: ThemeMode } | null = null

  const controls: ColorControlHandle[] = []
  const retireControls = (): void => {
    for (const control of controls) control.destroy()
    controls.length = 0
  }

  const trigger = button({
    label: t()('settings.menu'),
    icon: deps.icons.glyph(ICONS.settings),
    className: 'qc-toolbar-button',
    onClick: () => {
      if (dialog) {
        if (dialog.open()) dialog.close()
        return
      }
      open()
    },
  })
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')

  const apply = (partial: PartialChartSettings): void => {
    deps.commands.execute('chart.settings.apply', { settings: partial })
  }

  const refresh = (): void => {
    if (!dialog?.open() || !content) return
    if (reset) {
      reset.hidden = !shows(deps, 'chart.settings.reset')
      setDisabled(reset, !deps.commands.available('chart.settings.reset'))
    }
    retireControls()
    content.replaceChildren()
    buildContent(content)
  }

  // The appearance and display pages edit through one command; a host that hides what its policy
  // refuses leaves both pages out when it refuses that command.
  const pageDefinitions = (): readonly { id: SettingsPage; label: string; icon: Glyph }[] => [
    ...(shows(deps, 'chart.settings.apply')
      ? [
          { id: 'appearance' as const, label: t()('settings.sectionAppearance'), icon: STYLE_ICONS.candles },
          { id: 'display' as const, label: t()('settings.sectionDisplay'), icon: ICONS.template },
        ]
      : []),
    { id: 'scale', label: t()('settings.sectionScale'), icon: ICONS.ruler },
    ...(deps.ui.settingsTheme ? [{ id: 'theme' as const, label: t()('settings.sectionTheme'), icon: ICONS.settings }] : []),
  ]

  const showPage = (page: SettingsPage, focus = false): void => {
    activePage = page
    refresh()
    if (focus) content?.querySelector<HTMLButtonElement>(`[data-settings-page="${page}"]`)?.focus()
  }

  const buildAppearancePage = (panel: HTMLElement): void => {
    const settings = activeChart(deps).settings()
    const canApply = deps.commands.available('chart.settings.apply')
    panel.appendChild(menuHeading(t()('settings.sectionAppearance')))
    for (const row of COLOR_ROWS) {
      const label = t()(row.label)
      const value = row.read(settings)
      const control: ColorControlHandle = createColorControl(t(), {
        label,
        value,
        opacity: readColor(value)?.alpha ?? 1,
        disabled: !canApply,
        closeOnPick: true,
        onPick: (color) => {
          control.update(color)
          apply(row.write(color))
        },
        openPanel: (anchor, palette, onClosed) => openInlinePanel(anchor, palette, anchor.closest('.qc-settings-row') ?? anchor, onClosed),
      })
      controls.push(control)
      panel.appendChild(fieldRow(label, control.element, { className: 'qc-settings-row' }))
    }
  }

  const buildDisplayPage = (panel: HTMLElement): void => {
    const settings = activeChart(deps).settings()
    const canApply = deps.commands.available('chart.settings.apply')
    panel.appendChild(menuHeading(t()('settings.sectionDisplay')))
    for (const row of TOGGLE_ROWS) {
      panel.appendChild(switchRow({ label: t()(row.label), checked: row.read(settings), disabled: !canApply, onChange: (on) => apply(row.write(on)) }))
    }
  }

  const choice = (label: string, checked: boolean, disabled: boolean, onSelect: () => void): HTMLButtonElement => {
    const row = h('button', {
      type: 'button',
      class: 'qc-chart-settings-choice',
      role: 'radio',
      'aria-checked': String(checked),
      disabled,
    }, h('span', { class: 'qc-chart-settings-radio', 'aria-hidden': 'true' }), h('span', { class: 'qc-chart-settings-choice-label' }, label))
    row.addEventListener('click', onSelect)
    return row
  }

  const buildScalePage = (panel: HTMLElement): void => {
    const scale = activeChart(deps).scaleMode()
    panel.appendChild(menuHeading(t()('settings.sectionScale')))
    const group = h('div', { class: 'qc-chart-settings-choices', role: 'radiogroup', 'aria-label': t()('settings.sectionScale') })
    for (const option of SCALE_MODE_OPTIONS) {
      const id = `chart.scale.${option.id}`
      if (option.id !== scale && !shows(deps, id)) continue
      group.appendChild(choice(commandLabel(deps, id), option.id === scale, option.id !== scale && !deps.commands.available(id), () => {
        deps.commands.execute(id)
        refresh()
      }))
    }
    panel.appendChild(group)
  }

  const buildThemePage = (panel: HTMLElement): void => {
    const mode = deps.widget.theme.mode()
    panel.appendChild(menuHeading(t()('settings.sectionTheme')))
    const group = h('div', { class: 'qc-chart-settings-choices', role: 'radiogroup', 'aria-label': t()('settings.sectionTheme') })
    for (const themeMode of THEME_MODES) {
      const id = `widget.theme.${themeMode}`
      if (themeMode !== mode && !shows(deps, id)) continue
      group.appendChild(choice(commandLabel(deps, id), themeMode === mode, themeMode !== mode && !deps.commands.available(id), () => {
        deps.commands.execute(id)
        refresh()
      }))
    }
    panel.appendChild(group)
  }

  const buildContent = (body: HTMLElement): void => {
    const pages = pageDefinitions()
    if (!pages.some((page) => page.id === activePage)) activePage = pages[0]!.id
    const panelId = `qc-chart-settings-panel-${settingsId}`
    const selectedTabId = `qc-chart-settings-tab-${settingsId}-${activePage}`
    const nav = h('div', { class: 'qc-chart-settings-nav', role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t()('settings.menu') })
    const panel = h('section', { id: panelId, class: 'qc-chart-settings-panel', role: 'tabpanel', 'aria-labelledby': selectedTabId, tabindex: '0' })

    pages.forEach((page, index) => {
      const selected = page.id === activePage
      const tab = h('button', {
        id: `qc-chart-settings-tab-${settingsId}-${page.id}`,
        type: 'button',
        class: 'qc-chart-settings-nav-item',
        role: 'tab',
        'aria-selected': String(selected),
        'aria-controls': panelId,
        tabindex: selected ? '0' : '-1',
        'data-settings-page': page.id,
      }, deps.icons.glyph(page.icon, { size: 20 }), h('span', {}, page.label))
      tab.addEventListener('click', () => showPage(page.id, true))
      tab.addEventListener('keydown', (event) => {
        let next = index
        if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % pages.length
        else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + pages.length) % pages.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = pages.length - 1
        else return
        event.preventDefault()
        showPage(pages[next]!.id, true)
      })
      nav.appendChild(tab)
    })

    if (activePage === 'appearance') buildAppearancePage(panel)
    else if (activePage === 'display') buildDisplayPage(panel)
    else if (activePage === 'scale') buildScalePage(panel)
    else buildThemePage(panel)

    body.append(nav, panel)
  }

  const restoreInitialState = (): void => {
    if (!initial) return
    const chart = activeChart(deps)
    deps.commands.execute('chart.settings.apply', { settings: initial.settings })
    if (chart.scaleMode() !== initial.scale) deps.commands.execute(`chart.scale.${initial.scale}`)
    if (deps.ui.settingsTheme && deps.widget.theme.mode() !== initial.theme) deps.commands.execute(`widget.theme.${initial.theme}`)
  }

  const open = (): void => {
    const chart = activeChart(deps)
    activePage = pageDefinitions()[0]!.id
    committed = false
    initial = {
      settings: editedLeaves(chart.settings()),
      scale: chart.scaleMode(),
      theme: deps.widget.theme.mode(),
    }
    dialog = openDialog({
      host: deps.overlays,
      label: t()('settings.menu'),
      className: 'qc-settings-menu qc-chart-settings-dialog',
      width: 750,
      build(box, handle) {
        content = h('div', { class: 'qc-dialog-body qc-chart-settings-body' })
        const footer = h('div', { class: 'qc-chart-settings-footer' })
        reset = button({
          label: commandLabel(deps, 'chart.settings.reset'),
          text: commandLabel(deps, 'chart.settings.reset'),
          className: 'qc-chart-settings-reset',
          disabled: !deps.commands.available('chart.settings.reset'),
          onClick: () => {
            deps.commands.execute('chart.settings.reset')
            refresh()
          },
        })
        const actions = h('div', { class: 'qc-chart-settings-actions' })
        actions.append(
          button({ label: t()('drawing.cancel'), text: t()('drawing.cancel'), className: 'qc-chart-settings-cancel', onClick: () => handle.close() }),
          button({
            label: t()('drawing.ok'),
            text: t()('drawing.ok'),
            className: 'qc-button--primary qc-chart-settings-ok',
            onClick: () => {
              committed = true
              handle.close()
            },
          }),
        )
        reset.hidden = !shows(deps, 'chart.settings.reset')
        footer.append(reset, actions)
        box.append(dialogTitle(t()('drawing.settings'), t()('layouts.close'), () => handle.close(), deps.icons), content, footer)
        buildContent(content)
      },
      initialFocus: (box) => box.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]'),
      onClosing: () => {
        trigger.setAttribute('aria-expanded', 'false')
        if (!committed) restoreInitialState()
      },
      onClose: () => {
        retireControls()
        content = null
        reset = null
        dialog = null
        initial = null
        trigger.setAttribute('aria-expanded', 'false')
      },
    })
    trigger.setAttribute('aria-expanded', 'true')
  }

  const sync = (): void => {
    name(trigger, t()('settings.menu'))
    refresh()
  }
  sync()
  return {
    element: trigger,
    sync,
    destroy() {
      dialog?.close({ animate: false })
      trigger.remove()
    },
  }
}
