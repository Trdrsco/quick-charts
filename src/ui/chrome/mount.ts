// The default chrome's composition: the overlay layer, the top bar, the bottom bar, the notices,
// the doors the charts knock on, and the subscriptions that keep every surface reading the active
// chart. Mounted by the widget once its charts exist. The widget-level surfaces consume the widget
// through the public handle, the command registry and the event maps; the kernel in turn imports
// the chrome's per-chart surfaces (the navigation cluster, the replay transport, the market-status
// popup) and the doors contract, so the two are one package with two directions of import.
import type { ChartDatafeed, DatafeedConfig } from '../../datafeed'
import type { ChartI18n } from '../../i18n'
import { BUILT_IN_LOCALES } from '../../i18n/runtime'
import type { ChartSaveLoadAdapter } from '../../resources'
import type { ChartStorage } from '../../storage'
import type { ChartHandle } from '../../widget/chart'
import type { ChartWidget } from '../../widget/create'
import type { AccessPolicy, ChartPreferences } from '../../widget/options'
import type { ResolvedFeatures } from '../../widget/planes'
import { mountBottomBar, type BottomBarHandle } from './bottomBar'
import type { ChromeContext } from './context'
import type { ChromeDoors } from './doors'
import { h } from './dom'
import { closeOverlays } from './overlays'
import { openIndicatorSettings } from './indicatorSettings'
import { openSearchDialog } from './searchDialog'
import { mountToasts, type ToastsHandle } from './toasts'
import { mountTopBar, type TopBarHandle } from './topBar'

export interface ChromeDeps {
  root: HTMLElement
  /** The charts grid the bars sit around and the notices float over. */
  panes: HTMLElement
  widget: ChartWidget
  i18n: ChartI18n
  features: ResolvedFeatures
  storage: ChartStorage
  preferences: Partial<ChartPreferences>
  saveLoad: ChartSaveLoadAdapter | null
  datafeed: ChartDatafeed
  feedConfig(): DatafeedConfig | null
  classNames?: Readonly<Record<string, string>>
  access?: AccessPolicy
  /** The viewer's layout autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  /** The doors the charts already hold. Filled in place. */
  doors: ChromeDoors
}

export interface ChromeHandle {
  dispose(): void
}

/** The reading direction the language resolves to: the adapter's own answer, else the built-in
 *  inventory's, else left to right. */
export function readingDirection(i18n: ChartI18n): 'ltr' | 'rtl' {
  const own = i18n.dir?.()
  if (own) return own
  return BUILT_IN_LOCALES.find((l) => l.code === i18n.locale())?.dir ?? 'ltr'
}

/** The feed statuses the chart itself has words for. Any other code is the feed's own and is left
 *  to the host's `feedStatus` subscription. */
const FEED_NOTICES: Readonly<Record<string, 'toast.feedUnavailable' | 'toast.feedNoData'>> = {
  feed_unavailable: 'toast.feedUnavailable',
  'no-data': 'toast.feedNoData',
}

export function mountChrome(deps: ChromeDeps): ChromeHandle {
  const { root, widget, i18n, features } = deps
  const overlays = h('div', { class: 'qc-overlays' })
  root.appendChild(overlays)
  const ctx: ChromeContext = { i18n, commands: widget.commands, overlays, widget }
  const disposers: (() => void)[] = []

  root.setAttribute('dir', readingDirection(i18n))
  disposers.push(i18n.onChange(() => root.setAttribute('dir', readingDirection(i18n))))

  // The notices sit right after the charts grid, never inside it: the grid holds only the charts.
  const toasts: ToastsHandle | null = features.toasts ? mountToasts(deps.panes, { i18n }) : null
  const notify = (kind: 'info' | 'error', text: string): void => toasts?.push(kind, text)

  // ── The doors. The charts held this object before the chrome existed; filling it in place is
  // what makes their knocks land here from now on.
  deps.doors.openSearch = (request) => {
    if (request.mode !== 'compare' && !features.symbolSearch && !request.onPick) return
    if (request.mode === 'compare' && !features.compare) return
    openSearchDialog({
      host: overlays,
      i18n,
      datafeed: deps.datafeed,
      commands: widget.commands,
      recents: widget.recents,
      classes: () => deps.feedConfig()?.classes ?? null,
      classNames: deps.classNames,
      curated: request.chart.compare.symbols(),
      request,
    })
  }
  deps.doors.openIndicatorSettings = (chart, instanceId) => {
    if (!features.indicators) return false
    const instance = chart.indicators.get().find((i) => i.id === instanceId)
    if (!instance) return false
    openIndicatorSettings({ ...ctx, chart, instance })
    return true
  }

  // ── The bars ─────────────────────────────────────────────────────────────────────────────────
  let topBar: TopBarHandle | null = null
  if (features.topBar) {
    topBar = mountTopBar({
      ...ctx,
      features,
      storage: deps.storage,
      preferences: deps.preferences,
      saveLoad: deps.saveLoad,
      access: deps.access,
      autosave: deps.autosave,
      openSearch: () => deps.doors.openSearch({ mode: 'search', chart: widget.activeChart() }),
      notify,
    })
    root.insertBefore(topBar.element, deps.panes)
    disposers.push(() => topBar!.destroy())
  }
  let bottomBar: BottomBarHandle | null = null
  if (features.bottomBar) {
    bottomBar = mountBottomBar(ctx)
    root.insertBefore(bottomBar.element, overlays)
    disposers.push(() => bottomBar!.destroy())
  }

  // ── Following the active chart. One sync re-reads everything from it; it runs on activation,
  // on every event the chart reports, and on any change to the registry. Chart subscriptions move
  // with the active chart, so a background pane never repaints the bars.
  let pending = false
  const sync = (): void => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
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
      chart.on('style', sync),
      chart.on('scaleMode', sync),
      chart.on('timezone', sync),
      chart.on('subsession', sync),
      chart.on('replay', sync),
      chart.on('dataLoaded', sync),
      chart.on('indicator', sync),
      chart.on('compare', sync),
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
    widget.on('saveNeeded', () => topBar?.changed()),
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
    dispose() {
      for (const off of disposers.splice(0)) off()
      // Every dialog and menu still open in the layer closes here, taking its document listeners
      // with it; a bare remove would leave them bound to a detached panel.
      closeOverlays(overlays)
      toasts?.destroy()
      overlays.remove()
      root.removeAttribute('dir')
    },
  }
}
