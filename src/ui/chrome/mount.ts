// The default chrome's composition: the overlay layer, the top bar, the bottom bar, the notices,
// the doors the charts knock on, and the subscriptions that keep every surface reading the active
// chart. Mounted by the widget once its charts exist. The widget-level surfaces consume the widget
// through the public handle, the command registry and the event maps; the kernel in turn imports
// the chrome's per-chart surfaces (the navigation cluster and market-status popup) and knocks on
// the doors contract for the widget-owned replay row, so the two are one package with two
// directions of import.
import type { ChartDatafeed, DatafeedConfig } from '../../datafeed'
import { readingDirection, type ChartI18n } from '../../i18n'
import type { ChartSaveLoadAdapter } from '../../resources'
import type { ChartStorage } from '../../storage'
import type { ChartHandle } from '../../widget/chart'
import type { ChartWidget } from '../../widget/create'
import { paintThemeRoot } from '../../widget/theme'
import { attachShortcuts } from '../../widget/shortcuts'
import type { AccessPolicy, ChartPreferences, SearchDisplayOptions, SearchScope } from '../../widget/options'
import type { ResolvedFeatures, ResolvedUi } from '../../widget/planes'
import { mountBottomBar, type BottomBarHandle } from './bottomBar'
import { bindPanelHost } from '../drawings/overlays'
import { shows, type ChromeContext } from './context'
import type { ChromeDoors, ReplayTransportTarget } from './doors'
import { h } from './dom'
import { closeOverlays } from '../controls/overlays'
import { openIndicatorSettings } from './indicatorSettings'
import { openIndicatorPicker } from './indicatorPicker'
import type { DialogHandle } from './dialog'
import type { IndicatorPickerSource } from '../../widget/indicatorPicker'
import { openSearchDialog } from './searchDialog'
import { createSearchSessionOwner } from '../../search'
import { mountToasts, type ToastsHandle } from './toasts'
import { createLayoutCatalog } from './layoutCatalog'
import { mountLayoutDialogs } from './layoutDialogs'
import { createToolbarButton, type ToolbarButton, type ToolbarButtonOptions } from './hostControls'
import type { IconResolver } from '../icons/resolver'
import { createLayoutListStore } from './preferences'
import type { LayoutChanges } from '../../widget/layoutChanges'
import { mountTopBar, type TopBarHandle, type TopBarSlot } from './topBar'
import { mountReplayTransport, type ReplayTransportHandle } from './replayBar'
import type { MarkPainters } from '../../markPainters'
import type { OfferedChartStyles } from '../../widget/styles'
import type { OfferedTimeframes } from '../../widget/timeframes'
import type { OfferedLayouts } from '../../widget/arrangements'
import type { OfferedIndicators } from '../../widget/offeredIndicators'

export interface ChromeDeps {
  root: HTMLElement
  /** The widget's own layer on the document body, painted as the root is: where an external rail's
   *  flyouts stand, so nothing the host stacks beside the widget can cover them. */
  layer: HTMLElement
  toolbarContainer?: HTMLElement
  drawingToolbarContainer?: HTMLElement
  mountDrawingToolbar?(chart: ChartHandle, container: HTMLElement | null): void
  /** The charts grid the bars sit around and the notices float over. */
  panes: HTMLElement
  widget: ChartWidget
  i18n: ChartI18n
  features: ResolvedFeatures
  /** Which of the chart's own controls render. */
  ui: ResolvedUi
  /** Where the viewer's own choices about the chrome live: favorite and custom intervals, starred
   *  layouts and indicators, the layouts' sort. None of them is layout content, so a write here
   *  never marks the layout changed. */
  storage: ChartStorage
  preferences: Partial<ChartPreferences>
  saveLoad: ChartSaveLoadAdapter | null
  datafeed: ChartDatafeed
  feedConfig(): DatafeedConfig | null
  classNames?: Readonly<Record<string, string>>
  scope?: () => SearchScope | null
  /** How the symbol search offers its classes and its spread operators. */
  searchDisplay?: SearchDisplayOptions
  access?: AccessPolicy
  /** The built-in indicators the widget offers. */
  builtInIndicators?: OfferedIndicators
  /** The host's mark painters, passed to every surface that names a market or a source. */
  painters: MarkPainters
  indicatorPicker?: IndicatorPickerSource
  /** The viewer's layout autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  /** Whether the open layout holds unwritten changes, which the saved-layouts menu shows. */
  layoutChanges: LayoutChanges
  /** Draws every glyph the chrome draws: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** The main-series styles the widget offers. */
  styles: OfferedChartStyles
  /** The timeframes the widget offers. */
  timeframes: OfferedTimeframes
  /** The arrangements and sync switches the widget offers. */
  layouts: OfferedLayouts
  /** The doors the charts already hold. Filled in place. */
  doors: ChromeDoors
}

export interface ChromeHandle {
  /** One of the top bar's host slots, or null when the bar is hidden. */
  topBarSlot(name: TopBarSlot): HTMLElement | null
  /** A control of the host's own, made as one of the bar's. */
  toolbarButton(options: ToolbarButtonOptions): ToolbarButton
  /** The host's access policy may answer differently: the bars and the replay transport read it
   *  again now, rather than on the next change to the active chart. */
  refreshAccess(): void
  dispose(): void
}

/** The feed statuses the chart itself has words for. Any other code is the feed's own and is left
 *  to the host's `feedStatus` subscription. */
const FEED_NOTICES: Readonly<Record<string, 'toast.feedUnavailable' | 'toast.feedNoData'>> = {
  feed_unavailable: 'toast.feedUnavailable',
  'no-data': 'toast.feedNoData',
}

export function mountChrome(deps: ChromeDeps): ChromeHandle {
  const { root, widget, i18n, features, ui } = deps
  const overlays = h('div', { class: 'qc-overlays' })
  root.appendChild(overlays)
  const ctx: ChromeContext = { i18n, commands: widget.commands, overlays, widget, icons: deps.icons, styles: deps.styles, timeframes: deps.timeframes, layouts: deps.layouts, access: deps.access, builtInIndicators: deps.builtInIndicators }
  const disposers: (() => void)[] = []
  let disposed = false
  let searchDialog: DialogHandle | null = null
  let searchOwner = createSearchSessionOwner(deps.datafeed, { pageSize: 50 })
  const prefetchSearch = (): void => { if (ui.symbolSearch || features.compare) searchOwner.prefetch() }
  prefetchSearch()
  disposers.push(() => { searchDialog?.close({ animate: false }); searchOwner.dispose(); deps.doors.openSearch = () => undefined })
  disposers.push(i18n.onChange(() => {
    // A locale replacement is not a viewer dismissing the surface: retire the old-language dialog
    // before the new one can open, rather than leaving two localized copies crossing in the layer.
    searchDialog?.close({ animate: false })
    searchOwner.dispose()
    searchOwner = createSearchSessionOwner(deps.datafeed, { pageSize: 50 })
    prefetchSearch()
  }))

  // The layer reads in the widget's direction too: what stands in it is the widget's own chrome.
  const writeDirection = (): void => {
    root.setAttribute('dir', readingDirection(i18n))
    deps.layer.setAttribute('dir', readingDirection(i18n))
  }
  writeDirection()
  disposers.push(i18n.onChange(writeDirection))

  // The notices sit right after the charts grid, never inside it: the grid holds only the charts.
  const toasts: ToastsHandle | null = ui.toasts ? mountToasts(deps.panes, { i18n, icons: deps.icons }) : null
  const notify = (kind: 'info' | 'error', text: string): void => toasts?.push(kind, text)

  // One in-flow transport represents one explicit replay-entry owner, not every replay running in
  // the layout. Activating or starting another chart cannot retarget it. A concurrent chart keeps
  // its own public replay API and active-chart top-bar command; after the owner leaves there is no
  // automatic transfer to a replay that was already running.
  let replayOwner: ReplayTransportTarget | null = null
  let replayBar: ReplayTransportHandle | null = null
  const replayWasUp = new WeakMap<ChartHandle, boolean>()
  const releaseReplayRow = (animate = true): void => {
    replayBar?.destroy({ animate })
    replayBar = null
    replayOwner = null
  }
  deps.doors.replayChanged = (target) => {
    // ARMING is already replay: the transport is the thing that ASKS where to begin, so the row is
    // up from the moment the question is put rather than from the moment it is answered. Reading
    // the phase, not the running flag, is also what keeps the row STILL while a viewer picks a
    // different bar — a cursor move is not an exit and a re-entry.
    const up = target.chart.replay.phase() !== 'off'
    const entered = up && replayWasUp.get(target.chart) !== true
    replayWasUp.set(target.chart, up)
    if (replayOwner && replayOwner.chart.id !== target.chart.id) return
    if (!up) {
      if (replayOwner?.chart.id === target.chart.id) releaseReplayRow()
      return
    }
    if (!replayOwner && entered && ui.replayTransport) {
      replayOwner = target
      replayBar = mountReplayTransport({ chrome: overlays, i18n, icons: deps.icons, commands: target.commands, handle: target.chart, bars: target.bars, intraday: target.intraday, shown: (id) => shows(ctx, id) })
      // The one placement: a sibling of the charts grid, so the row reserves its own height in the
      // root's column between the grid and the bottom range and timezone band. The transport is
      // never a child of the overlay layer, and no recipe positions it over a pane.
      deps.panes.after(replayBar.element)
      replayBar.enter()
    }
    replayBar?.sync()
  }
  disposers.push(() => {
    deps.doors.replayChanged = () => undefined
    releaseReplayRow(false)
  })
  deps.doors.notify = notify
  let indicatorDialog: DialogHandle | null = null
  deps.doors.showIndicatorPicker = (initialCollection) => {
    if (!ui.indicatorPicker || indicatorDialog?.open()) return
    indicatorDialog = openIndicatorPicker({ ...ctx, storage: deps.storage, indicatorPicker: deps.indicatorPicker, initialCollection })
  }
  disposers.push(() => { indicatorDialog?.close(); deps.doors.showIndicatorPicker = () => undefined })

  // ── The doors. The charts held this object before the chrome existed; filling it in place is
  // what makes their knocks land here from now on.
  deps.doors.openSearch = (request) => {
    if (disposed) return
    if (request.mode !== 'compare' && !ui.symbolSearch && !request.onPick) return
    if (request.mode === 'compare' && !features.compare) return
    // Replacing one search mode with another is one surface changing contents, not a dismissal.
    // Remove the old instance immediately so its rows never overlap the new dialog during entry.
    searchDialog?.close({ animate: false })
    searchDialog = openSearchDialog({
      host: overlays,
      i18n,
      icons: deps.icons,
      search: searchOwner.create(),
      onClose: (dialog) => { if (searchDialog === dialog) searchDialog = null },
      commands: widget.commands,
      recents: widget.recents,
      classes: () => deps.feedConfig()?.classes ?? null,
      classNames: deps.classNames,
      scope: deps.scope,
      display: deps.searchDisplay,
      painters: deps.painters,
      curated: request.chart?.compare.symbols() ?? [],
      request,
    })
  }
  deps.doors.openIndicatorSettings = (chart, instanceId) => {
    if (!ui.indicatorSettings) return false
    const instance = chart.indicators.get().find((i) => i.id === instanceId)
    if (!instance) return false
    openIndicatorSettings({ ...ctx, chart, instance })
    return true
  }

  // ── The bars ─────────────────────────────────────────────────────────────────────────────────
  if (deps.drawingToolbarContainer && ui.drawingToolbar) {
    const surface = h('div', { class: 'qc-drawing-toolbar-host' })
    paintThemeRoot(surface, widget.theme.mode(), widget.theme.get())
    surface.setAttribute('dir', readingDirection(i18n))
    deps.drawingToolbarContainer.appendChild(surface)
    // The rail lives outside the widget, so its flyouts do too: they stand in the widget's layer on
    // the document body, over whatever the host stacks beside the widget (a dock below the chart),
    // placed beside the physical trigger and kept within the viewport, whichever chart tile owns
    // the active command scope.
    const releasePanelHost = bindPanelHost(surface, deps.layer)
    let active = widget.activeChart()
    deps.mountDrawingToolbar?.(active, surface)
    const shortcuts = attachShortcuts({ root: surface, commands: widget.commands })
    disposers.push(
      widget.on('activeChart', (chart) => {
        if (active === chart) return
        deps.mountDrawingToolbar?.(active, null)
        active = chart
        deps.mountDrawingToolbar?.(active, surface)
      }),
      () => deps.mountDrawingToolbar?.(active, null),
      () => shortcuts.dispose(),
      widget.theme.onChange((theme, mode) => paintThemeRoot(surface, mode, theme)),
      i18n.onChange(() => surface.setAttribute('dir', readingDirection(i18n))),
      () => surface.remove(),
      // A flyout still open in the layer closes with the rail, taking its document listeners.
      () => closeOverlays(deps.layer),
      releasePanelHost,
    )
  }
  // ── The saved-layout dialogs. The chrome's own, whatever bars are drawn: a first save asks its name
  // and `widget.layout.open` lists the saved layouts from every door, the top bar's menu among them.
  // Both read one catalog of the store, listed as the chrome mounts, so they open on rows in hand.
  const layoutStore = deps.saveLoad?.layouts ?? null
  const layoutCatalog = layoutStore ? createLayoutCatalog({ store: layoutStore, widget }) : null
  const layoutListing = createLayoutListStore(deps.storage)
  const layoutDialogs = mountLayoutDialogs({ ...ctx, catalog: layoutCatalog, listing: layoutListing, notify })
  disposers.push(() => layoutDialogs.destroy(), () => layoutCatalog?.destroy())

  let topBar: TopBarHandle | null = null
  // A top bar the page mounts outside the widget stands wherever the page put it, so its menus and
  // dialogs open in the widget's layer on the document body rather than inside the widget's own
  // box: fixed to the viewport, a menu drops from its control over whatever the page placed around
  // the chart, instead of being held inside a box the page may clip.
  const barOverlays = ui.topBar && deps.toolbarContainer ? deps.layer.appendChild(h('div', { class: 'qc-overlays' })) : overlays
  if (barOverlays !== overlays) {
    disposers.push(() => {
      closeOverlays(barOverlays)
      barOverlays.remove()
    })
  }
  if (ui.topBar) {
    topBar = mountTopBar({
      ...ctx,
      overlays: barOverlays,
      ui,
      storage: deps.storage,
      preferences: deps.preferences,
      saveLoad: deps.saveLoad,
      autosave: deps.autosave,
      layoutDialogs,
      layoutCatalog,
      layoutListing,
      layoutChanges: deps.layoutChanges,
      openSearch: () => deps.doors.openSearch({ mode: 'search', chart: widget.activeChart() }),
      notify,
    })
    if (deps.toolbarContainer) {
      // The host supplies space, never chart markup. This sibling surface has the same theme
      // and reading direction as the chart, without styling or clearing the host's element.
      const surface = h('div', { class: 'qc-toolbar-host' })
      paintThemeRoot(surface, widget.theme.mode(), widget.theme.get())
      surface.setAttribute('dir', readingDirection(i18n))
      surface.appendChild(topBar.element)
      deps.toolbarContainer.appendChild(surface)
      const shortcuts = attachShortcuts({ root: surface, commands: widget.commands })
      disposers.push(
        () => shortcuts.dispose(),
        widget.theme.onChange((theme, mode) => paintThemeRoot(surface, mode, theme)),
        i18n.onChange(() => surface.setAttribute('dir', readingDirection(i18n))),
        () => surface.remove(),
      )
    } else {
      root.insertBefore(topBar.element, deps.panes)
    }
    disposers.push(() => topBar!.destroy())
  }
  deps.doors.layoutChanged = (state) => topBar?.layoutChanged(state)
  // The save command asks for a name through here, so a never-saved layout meets the SAME prompt
  // whichever door asked: the menu's Save row, the toolbar link, the keyboard or a host's control.
  deps.doors.nameLayout = () => {
    layoutDialogs.nameLayout()
    return true
  }
  deps.doors.openLayouts = () => layoutDialogs.openLayouts()
  disposers.push(() => { deps.doors.layoutChanged = () => undefined; deps.doors.nameLayout = () => false; deps.doors.openLayouts = () => false })
  let bottomBar: BottomBarHandle | null = null
  if (ui.bottomBar) {
    bottomBar = mountBottomBar(ctx)
    root.insertBefore(bottomBar.element, overlays)
    disposers.push(() => bottomBar!.destroy())
  }

  // ── Following the active chart. One sync re-reads everything from it; it runs on activation,
  // on every event the chart reports, and on any change to the registry. Chart subscriptions move
  // with the active chart, so a background pane never repaints the bars. The sync is deferred to a
  // microtask, so a dispose can land between the event and the read; the queued run checks the
  // flag first, because the bars it would refresh are gone and the widget it would read may have
  // no charts left to answer with.
  let pending = false
  const sync = (): void => {
    if (pending || disposed) return
    pending = true
    queueMicrotask(() => {
      pending = false
      if (disposed) return
      topBar?.sync()
      bottomBar?.sync()
    })
  }
  let chartSubscriptions: (() => void)[] = []
  const follow = (chart: ChartHandle): void => {
    for (const off of chartSubscriptions) off()
    chartSubscriptions = [
      chart.on('symbol', sync),
      chart.on('timeframe', sync),
      chart.on('rangePreset', sync),
      chart.on('style', sync),
      chart.on('scaleMode', sync),
      chart.on('timezone', sync),
      chart.on('subsession', sync),
      chart.on('replay', sync),
      chart.on('dataLoaded', sync),
      chart.on('indicator', sync),
      chart.on('compare', sync),
      // Whether a step can be taken back is not derivable from any other lane: the registry reports
      // registrations and shortcuts, never availability, so the history says so itself.
      chart.on('history', sync),
      chart.on('feedStatus', (status) => {
        const key = FEED_NOTICES[status]
        if (key) notify('error', i18n.t(key, { symbol: chart.symbol() }))
      }),
    ]
  }
  follow(widget.activeChart())
  disposers.push(
    widget.on('activeChart', (chart) => {
      follow(chart)
      sync()
    }),
    widget.commands.onChange(sync),
    widget.on('fullscreen', sync),
    widget.on('theme', sync),
    widget.on('saveConflict', (info) => notify('error', info.message)),
    widget.on('image', (event) => {
      if (event.kind === 'copyFallback') notify('info', i18n.t('toast.imageCopyFallback'))
      else if (event.kind === 'failed') notify('error', i18n.t('toast.imageFailed'))
    }),
    () => {
      for (const off of chartSubscriptions) off()
      chartSubscriptions = []
    },
  )

  return {
    topBarSlot: (name) => topBar?.slot(name) ?? null,
    toolbarButton: (options) => createToolbarButton(options, deps.icons),
    refreshAccess() {
      if (disposed) return
      topBar?.sync()
      bottomBar?.sync()
      replayBar?.sync()
    },
    dispose() {
      disposed = true
      for (const off of disposers.splice(0)) off()
      // Every dialog and menu still open in the layer closes here, taking its document listeners
      // with it; a bare remove would leave them bound to a detached panel.
      closeOverlays(overlays)
      toasts?.destroy()
      overlays.remove()
      root.removeAttribute('dir')
      deps.layer.removeAttribute('dir')
    },
  }
}
