import { symbolNames } from '../../symbolLabel'
// The top bar: the symbol pill, the compare door, the timeframe picker, the style picker, the
// indicators button, the replay button, undo and redo, then the layout setup menu, the
// saved-layouts menu, the settings menu, fullscreen and the image menu. Every control is present by
// feature flag and acts through the command registry; the bar re-reads the active chart on every
// change it hears. The saved-layouts menu stands only over a layouts store; without one, its
// Download chart data row joins the image menu.
import type { ChartSaveLoadAdapter } from '../../resources'
import type { ChartStorage } from '../../storage'
import type { ChartPreferences } from '../../widget/options'
import { HISTORY_CHANGE_LABELS, type HistoryChange } from '../../widget/history'
import type { LayoutModelState } from '../../widget/layout'
import type { ResolvedUi } from '../../widget/planes'
import { activeChart, commandLabel, shows, type ChromeContext } from './context'
import { button, h, name, setDisabled, stopPointer, tidyRules } from './dom'
import { ICONS } from '../controls/icons'
import { FLYOUT_WIDTH } from './flyoutGeometry'
import { mountLayoutSetup, type LayoutSetupHandle } from './layoutSetup'
import { mountLayoutsMenu, type LayoutsMenuHandle } from './layoutsMenu'
import type { LayoutCatalog } from './layoutCatalog'
import type { LayoutDialogs } from './layoutDialogs'
import type { LayoutChanges } from '../../widget/layoutChanges'
import { menuItem, openMenu, toggleMenu, type MenuHandle } from './menu'
import { createTimeframeStore, type LayoutListStore } from './preferences'
import { mountSettingsMenu, type SettingsMenuHandle } from './settingsMenu'
import { mountStylePicker, type StylePickerHandle } from './stylePicker'
import { mountTimeframePicker, type TimeframePickerHandle } from './timeframePicker'

export interface TopBarDeps extends ChromeContext {
  /** Which of the bar's controls render. */
  ui: ResolvedUi
  storage: ChartStorage
  preferences: Partial<ChartPreferences>
  saveLoad: ChartSaveLoadAdapter | null
  /** The viewer's layout autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  /** The chrome's saved-layout dialogs, its listing of the saved layouts (null when the host saves
   *  none), the viewer's starred layouts, and whether the open layout holds unwritten changes: all of
   *  them outlive this bar, which only presents them. */
  layoutDialogs: LayoutDialogs
  layoutCatalog: LayoutCatalog | null
  layoutListing: LayoutListStore
  layoutChanges: LayoutChanges
  /** Open the search dialog in search mode for the active chart. */
  openSearch(): void
  notify(kind: 'info' | 'error', text: string): void
}

/** The places a host may stand a control of its own in the top bar, in reading order. A name says
 *  which group the slot FOLLOWS, so a control placed there leads the group after it: `afterIndicators`
 *  is between the indicators rule and bar replay. Every slot exists on every bar, whatever the
 *  interface leaves standing, so a host never has to ask whether its place was built. */
export const TOP_BAR_SLOTS = ['start', 'afterSymbol', 'afterTimeframe', 'afterStyle', 'afterIndicators', 'afterReplay', 'afterHistory', 'afterLayouts', 'end'] as const

export type TopBarSlot = (typeof TOP_BAR_SLOTS)[number]

export interface TopBarHandle {
  element: HTMLElement
  /** One host slot by name. */
  slot(name: TopBarSlot): HTMLElement
  sync(): void
  layoutChanged(state: LayoutModelState): void
  destroy(): void
}

const separator = (): HTMLElement => h('span', { class: 'qc-separator qc-separator--vertical', role: 'separator' })

export function mountTopBar(deps: TopBarDeps): TopBarHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const { ui, commands } = deps
  const element = h('div', { class: 'qc-topbar', role: 'toolbar', 'aria-label': t()('chrome.topBar') })
  stopPointer(element)
  const start = h('div', { class: 'qc-topbar-start' })
  const end = h('div', { class: 'qc-topbar-end' })
  element.append(start, end)
  const disposers: (() => void)[] = []
  const syncers: (() => void)[] = []

  // ── The host's slots ────────────────────────────────────────────────────────────────────────
  // A pass-through box at each group boundary. The chart keeps the bar's composition — what order
  // its own controls stand in, where the rules fall, what rhythm they keep — and the host decides
  // only WHAT stands at a boundary. A control dropped in wears the bar's own button recipe and is
  // then indistinguishable from a built-in, which is the point: a service the chart does not
  // implement should not look like it was bolted on beside the chart.
  //
  // Every slot is built whatever the interface shows, so a host composing a door never has to reason
  // about which of the chart's own groups happen to be switched on. An empty slot has no width, no
  // padding and no ink, so a bar full of them looks exactly like a bar with none.
  const slots = new Map<TopBarSlot, HTMLElement>()
  const slot = (name: TopBarSlot): HTMLElement => {
    const box = h('span', { class: 'qc-topbar-slot', 'data-qc-slot': name })
    slots.set(name, box)
    return box
  }

  // ── The symbol pill and the compare door ────────────────────────────────────────────────────
  start.appendChild(slot('start'))
  let pill: HTMLButtonElement | null = null
  if (ui.symbolPill) {
    pill = button({ label: t()('chrome.symbolSearch'), text: '', className: 'qc-symbol-pill', onClick: () => deps.openSearch() })
    pill.setAttribute('aria-haspopup', 'dialog')
    start.appendChild(pill)
  }
  let compareDoor: HTMLButtonElement | null = null
  if (ui.compareButton) {
    compareDoor = button({ label: t()('chrome.compare'), icon: deps.icons.glyph(ICONS.comparePlus), className: 'qc-toolbar-button', onClick: () => commands.execute('chart.compare.open') })
    compareDoor.setAttribute('aria-haspopup', 'dialog')
    start.appendChild(compareDoor)
  }
  if ((pill || compareDoor) && (ui.timeframePicker || ui.stylePicker || ui.indicatorsButton || ui.replayButton || ui.historyButtons)) start.appendChild(separator())
  start.appendChild(slot('afterSymbol'))

  // ── The timeframe picker ────────────────────────────────────────────────────────────────────
  let timeframes: TimeframePickerHandle | null = null
  if (ui.timeframePicker) {
    const store = createTimeframeStore(deps.storage, deps.preferences, deps.timeframes)
    timeframes = mountTimeframePicker({
      ...deps,
      store,
      restrictions: () => {
        const caps = deps.widget.capabilities()
        return { supportedResolutions: caps.symbolResolutions, resolutions: caps.resolutions }
      },
    })
    start.appendChild(timeframes.element)
    if (ui.stylePicker || ui.indicatorsButton || ui.replayButton || ui.historyButtons) start.appendChild(separator())
    syncers.push(() => timeframes!.sync())
    disposers.push(() => timeframes!.destroy())
  }
  start.appendChild(slot('afterTimeframe'))

  // ── The style picker ────────────────────────────────────────────────────────────────────────
  let styles: StylePickerHandle | null = null
  if (ui.stylePicker) {
    styles = mountStylePicker(deps)
    start.appendChild(styles.element)
    if (ui.indicatorsButton || ui.replayButton || ui.historyButtons) start.appendChild(separator())
    syncers.push(() => styles!.sync())
    disposers.push(() => styles!.destroy())
  }
  start.appendChild(slot('afterStyle'))

  // ── Indicators ──────────────────────────────────────────────────────────────────────────────
  let indicators: HTMLButtonElement | null = null
  if (ui.indicatorsButton) {
    indicators = button({ label: t()('chrome.indicators'), text: t()('chrome.indicators'), icon: deps.icons.glyph(ICONS.indicators), className: 'qc-toolbar-button', onClick: () => commands.execute('chart.indicators.open') })
    indicators.setAttribute('aria-haspopup', 'dialog')
    // The last label to go: what a viewer adds to the chart is the bar's most-reached control, so
    // it keeps its word until the row has no room for any.
    indicators.dataset.qcLabel = 'last'
    start.appendChild(indicators)
    // The header's rule: Indicators closes the group that changes WHAT the chart
    // shows, and the transport group that follows it stands behind its own rule. A separator is
    // drawn only where something follows it, so a switched-off feature leaves no rule hanging.
    if (ui.replayButton || ui.historyButtons) start.appendChild(separator())
  }
  // The head of the transport group: what a host service that WATCHES the market belongs beside,
  // such as price alerts.
  start.appendChild(slot('afterIndicators'))

  // ── Replay ──────────────────────────────────────────────────────────────────────────────────
  let replay: HTMLButtonElement | null = null
  if (ui.replayButton) {
    replay = button({
      label: t()('chrome.replay'),
      // The chip says the short word; the accessible name says which replay it is.
      text: t()('chrome.replayChip'),
      icon: deps.icons.glyph(ICONS.replay),
      className: 'qc-toolbar-button',
      pressed: false,
      // Arming counts as being IN replay, so the second press leaves rather than re-asking the
      // question the transport is already showing.
      onClick: () => commands.execute(activeChart(deps).replay.phase() !== 'off' ? 'chart.replay.exit' : 'chart.replay.start'),})
    replay.dataset.qcLabel = 'drop'
    // Replay is a mode the chart stays in, not one interval chosen among several, so its "on"
    // reads at full emphasis rather than as the quiet wash a chosen chip wears.
    replay.dataset.qcMode = 'held'
    start.appendChild(replay)
    if (ui.historyButtons) start.appendChild(separator())
  }
  start.appendChild(slot('afterReplay'))

  // ── Undo and redo ───────────────────────────────────────────────────────────────────────────
  // The pair stands flush, behind the rule the group before it drew: one step back and one step
  // forward are one gesture read left to right, and a rule between them would read as two groups.
  let undo: HTMLButtonElement | null = null
  let redo: HTMLButtonElement | null = null
  if (ui.historyButtons) {
    undo = button({ label: commandLabel(deps, 'chart.history.undo'), icon: deps.icons.glyph(ICONS.undo), className: 'qc-toolbar-button', onClick: () => commands.execute('chart.history.undo') })
    redo = button({ label: commandLabel(deps, 'chart.history.redo'), icon: deps.icons.glyph(ICONS.redo), className: 'qc-toolbar-button', onClick: () => commands.execute('chart.history.redo') })
    start.append(undo, redo)
  }
  start.appendChild(slot('afterHistory'))

  // ── Layouts ─────────────────────────────────────────────────────────────────────────────────
  let layoutSetup: LayoutSetupHandle | null = null
  let layoutsMenu: LayoutsMenuHandle | null = null
  if (ui.layoutSetup) {
    layoutSetup = mountLayoutSetup(deps)
    end.append(layoutSetup.element)
    syncers.push(() => layoutSetup!.sync())
    disposers.push(() => layoutSetup!.destroy())
  }
  if (ui.savedLayouts) {
    layoutsMenu = mountLayoutsMenu({ ...deps, catalog: deps.layoutCatalog, autosave: deps.autosave, notify: deps.notify, listing: deps.layoutListing, dialogs: deps.layoutDialogs, changes: deps.layoutChanges })
    end.append(layoutsMenu.element)
    syncers.push(() => layoutsMenu!.sync())
    disposers.push(() => layoutsMenu!.destroy())
  }
  if ((layoutSetup || layoutsMenu) && (ui.settingsMenu || ui.fullscreenButton || ui.imageMenu)) end.appendChild(separator())
  end.appendChild(slot('afterLayouts'))
  // Download chart data lives in the saved-layouts menu. A host that saves no layouts has no such
  // menu, so the row joins the image menu, which then exports the chart as a picture or as data.
  const dataInImageMenu = !deps.widget.capabilities().saveLoad.layouts

  // ── Settings, fullscreen, image ─────────────────────────────────────────────────────────────
  let settings: SettingsMenuHandle | null = null
  if (ui.settingsMenu) {
    settings = mountSettingsMenu(deps)
    end.appendChild(settings.element)
    syncers.push(() => settings!.sync())
    disposers.push(() => settings!.destroy())
  }
  let fullscreen: HTMLButtonElement | null = null
  if (ui.fullscreenButton) {
    fullscreen = button({ label: commandLabel(deps, 'widget.fullscreen.enter'), icon: deps.icons.glyph(ICONS.fullscreen), className: 'qc-toolbar-button', pressed: false, onClick: () => commands.execute('widget.fullscreen.toggle') })
    end.appendChild(fullscreen)
  }
  let image: HTMLButtonElement | null = null
  let imageMenu: MenuHandle | null = null
  if (ui.imageMenu) {
    image = button({ label: t()('chrome.image'), icon: deps.icons.glyph(ICONS.camera), className: 'qc-toolbar-button', onClick: () => toggleMenu(image!, openImageMenu) })
    image.setAttribute('aria-haspopup', 'menu')
    image.setAttribute('aria-expanded', 'false')
    end.appendChild(image)
  }
  end.appendChild(slot('end'))
  /** The image menu's rows, by the command each runs, as a host that hides what its policy refuses
   *  draws them. */
  const imageRows = (): string[] => ['widget.image.download', 'widget.image.copy', ...(dataInImageMenu ? ['chart.data.download'] : [])].filter((id) => shows(deps, id))
  const openImageMenu = (): void => {
    imageMenu = openMenu({
      host: deps.overlays,
      anchor: image!,
      label: t()('chrome.image'),
      className: 'qc-image-menu',
      // With the data row it opens as wide as the saved-layouts menu that otherwise holds the row.
      width: dataInImageMenu ? FLYOUT_WIDTH.layouts : 168,
      align: 'end',
      build(body, handle) {
        const drawn = imageRows()
        if (drawn.includes('widget.image.download')) body.appendChild(
          menuItem({
            text: commandLabel(deps, 'widget.image.download'),
            icon: deps.icons.glyph(ICONS.download),
            disabled: !commands.available('widget.image.download'),
            onSelect: () => {
              handle.close()
              commands.execute('widget.image.download')
            },
          }),
        )
        // Copy is a registry verb like download: disabled where the browser cannot put an image on
        // the clipboard or the policy refuses. Its outcome (a refused copy falling back to a
        // download) reports through the widget's `image` event, which the chrome turns into a notice.
        if (drawn.includes('widget.image.copy')) body.appendChild(
          menuItem({
            text: commandLabel(deps, 'widget.image.copy'),
            icon: deps.icons.glyph(ICONS.copy),
            disabled: !commands.available('widget.image.copy'),
            onSelect: () => {
              handle.close()
              commands.execute('widget.image.copy')
            },
          }),
        )
        // The active chart's loaded bars as a file, where no saved-layouts menu carries the row. A
        // chart-scoped command, so the access policy refuses it here as it would anywhere, and a
        // chart holding no bars leaves the row disabled.
        if (drawn.includes('chart.data.download')) {
          body.appendChild(
            menuItem({
              text: t()('layouts.downloadDataRow'),
              icon: deps.icons.glyph(ICONS.download),
              disabled: !commands.available('chart.data.download'),
              onSelect: () => {
                handle.close()
                commands.execute('chart.data.download')
              },
            }),
          )
        }
      },
      onClose: () => {
        imageMenu = null
      },
    })
  }

  /** Reword the visible chip on a control that carries one, so a language change rewrites the bar
   *  in place rather than leaving the word it was built with. */
  const label = (control: HTMLButtonElement, text: string): void => {
    const node = control.querySelector('.qc-button-text')
    if (node) node.textContent = text
  }

  /** How many of its labels the row can seat. Measured rather than guessed at a width: this bar
   *  belongs to whatever box the host gives it, and a number picked against one viewport says
   *  nothing about a chart mounted half that wide.
   *
   *  Labels leave in order, and only as far as the room runs out: first the ones that may go, and
   *  then, for a box narrow enough to need it, the last one standing. A label kept past the point
   *  where the row can hold it costs more than it says, because the controls beside it are the
   *  ones that go under the edge. */
  const fitLabels = (): void => {
    const overflows = (): boolean => element.scrollWidth > element.clientWidth
    element.dataset.qcLabels = 'all'
    if (!overflows()) return
    element.dataset.qcLabels = 'last'
    if (!overflows()) return
    element.dataset.qcLabels = 'none'
  }

  /** Name a history control after the step it would move: the verb's own name with the change
   *  written into it, or the plain verb when there is no step to name. */
  const named = (control: HTMLButtonElement, change: HistoryChange | null, carrier: 'history.undoNamed' | 'history.redoNamed', id: string): void => {
    name(control, change ? t()(carrier, { change: t()(HISTORY_CHANGE_LABELS[change]) }) : commandLabel(deps, id))
  }

  const sync = (): void => {
    const chart = activeChart(deps)
    element.setAttribute('aria-label', t()('chrome.topBar'))
    if (pill) {
      const text = pill.querySelector('.qc-button-text')
      if (text) text.textContent = symbolNames(chart.symbolInfo() ?? chart.symbol()).mark
      name(pill, `${t()('chrome.symbolSearch')}: ${t()('chrome.activeChart', { symbol: chart.symbol(), timeframe: chart.timeframe() })}`)
      pill.hidden = !shows(deps, 'chart.symbol.set')
      setDisabled(pill, !commands.available('chart.symbol.set') || !deps.widget.capabilities().search)
    }
    if (compareDoor) {
      name(compareDoor, t()('chrome.compare'))
      compareDoor.hidden = !shows(deps, 'chart.compare.open')
      setDisabled(compareDoor, !commands.available('chart.compare.open'))
    }
    if (indicators) {
      name(indicators, t()('chrome.indicators'))
      label(indicators, t()('chrome.indicators'))
      indicators.hidden = !shows(deps, 'chart.indicators.open')
      setDisabled(indicators, !commands.available('chart.indicators.open'))
    }
    if (replay) {
      const on = chart.replay.phase() !== 'off'
      name(replay, t()('chrome.replay'))
      label(replay, t()('chrome.replayChip'))
      replay.setAttribute('aria-pressed', String(on))
      replay.hidden = !shows(deps, on ? 'chart.replay.exit' : 'chart.replay.start')
      setDisabled(replay, !commands.available(on ? 'chart.replay.exit' : 'chart.replay.start'))
    }
    if (undo && redo) {
      // A step that has a word says the word: "Undo timeframe change" tells a viewer what they are
      // about to get back, where a bare "Undo" makes them find out by pressing it. With nothing to
      // take back the control falls back to the verb's own name rather than a stale word.
      named(undo, chart.history.undoChange(), 'history.undoNamed', 'chart.history.undo')
      named(redo, chart.history.redoChange(), 'history.redoNamed', 'chart.history.redo')
      undo.hidden = !shows(deps, 'chart.history.undo')
      redo.hidden = !shows(deps, 'chart.history.redo')
      setDisabled(undo, !commands.available('chart.history.undo'))
      setDisabled(redo, !commands.available('chart.history.redo'))
    }
    if (fullscreen) {
      const active = deps.widget.fullscreen.active()
      name(fullscreen, commandLabel(deps, active ? 'widget.fullscreen.exit' : 'widget.fullscreen.enter'))
      fullscreen.setAttribute('aria-pressed', String(active))
      fullscreen.querySelector('.qc-icon')?.replaceWith(deps.icons.glyph(active ? ICONS.exitFullscreen : ICONS.fullscreen))
      fullscreen.hidden = !shows(deps, 'widget.fullscreen.toggle')
      setDisabled(fullscreen, !commands.available('widget.fullscreen.toggle'))
    }
    if (image) {
      name(image, t()('chrome.image'))
      // The menu is live by its first row, which is Download image unless the host hides it; with
      // every row hidden the menu is not drawn.
      const drawn = imageRows()
      image.hidden = drawn.length === 0
      if (image.hidden) imageMenu?.close()
      setDisabled(image, !commands.available(drawn[0] ?? 'widget.image.download'))
      imageMenu?.refresh()
    }
    for (const s of syncers) s()
    // A group the host's policy emptied takes its rule with it.
    for (const row of [start, end]) tidyRules(row, (child) => !child.hidden && (!child.classList.contains('qc-topbar-slot') || child.childElementCount > 0))
    // A reworded bar is a differently wide bar: a language whose word for replay is longer can
    // cost the row the labels the last one fitted.
    fitLabels()
  }

  const offStrings = deps.i18n.onChange(sync)
  sync()
  // The row re-fits its labels whenever the host resizes it, which is the only thing that changes
  // how much room it has. Toggling a label changes the CONTENT width, never this box, so the
  // observer cannot feed itself.
  const fit = new ResizeObserver(fitLabels)
  fit.observe(element)
  disposers.push(() => fit.disconnect())
  // A control a host stands in a slot, or takes out, changes what the row has to seat, so the row
  // re-fits then too, and a host's words give way in the same order the bar's own do.
  const seat = new MutationObserver(fitLabels)
  for (const box of slots.values()) seat.observe(box, { childList: true })
  disposers.push(() => seat.disconnect())
  // A CONTROL THAT TAKES FOCUS IS BROUGHT INTO VIEW. The bar scrolls sideways when the host's row is
  // narrower than its contents, and a browser does not scroll a scroller for a programmatic or
  // sequential focus of a child that is already "visible" to it — so tabbing to the last control
  // put it under the row's edge, reachable by keyboard and unreadable on screen.
  const revealFocused = (e: FocusEvent): void => {
    const target = e.target
    if (target instanceof HTMLElement && element.scrollWidth > element.clientWidth) {
      target.scrollIntoView({ inline: 'nearest', block: 'nearest' })
    }
  }
  element.addEventListener('focusin', revealFocused)

  return {
    element,
    slot: (name) => slots.get(name)!,
    sync,
    layoutChanged: (state) => layoutSetup?.sync(state),
    destroy() {
      element.removeEventListener('focusin', revealFocused)
      offStrings()
      imageMenu?.close()
      for (const d of disposers) d()
      element.remove()
    },
  }
}
