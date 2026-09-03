// The top bar: the symbol pill, the compare door, the timeframe picker, the style picker, the
// indicators button, the replay button, then the layout setup menu, the saved-layouts menu, the
// settings menu, fullscreen and the image menu. Every control is present by feature flag and acts
// through the command registry; the bar re-reads the active chart on every change it hears.
import type { ChartSaveLoadAdapter } from '../../resources'
import type { ChartStorage } from '../../storage'
import type { AccessPolicy, ChartPreferences } from '../../widget/options'
import type { ResolvedFeatures } from '../../widget/planes'
import { activeChart, commandLabel, type ChromeContext } from './context'
import { button, glyph, h, name, setDisabled, stopPointer } from './dom'
import { ICONS } from './icons'
import { openIndicatorPicker } from './indicatorPicker'
import { mountLayoutSetup, type LayoutSetupHandle } from './layoutSetup'
import { mountLayoutsMenu, type LayoutsMenuHandle } from './layoutsMenu'
import { menuItem, openMenu, type MenuHandle } from './menu'
import { createTimeframeStore } from './preferences'
import { mountSettingsMenu, type SettingsMenuHandle } from './settingsMenu'
import { mountStylePicker, type StylePickerHandle } from './stylePicker'
import { mountTimeframePicker, type TimeframePickerHandle } from './timeframePicker'

export interface TopBarDeps extends ChromeContext {
  features: ResolvedFeatures
  storage: ChartStorage
  preferences: Partial<ChartPreferences>
  saveLoad: ChartSaveLoadAdapter | null
  access?: AccessPolicy
  /** The viewer's layout autosave switch, as the widget holds it. */
  autosave: { get(): boolean }
  /** Open the search dialog in search mode for the active chart. */
  openSearch(): void
  notify(kind: 'info' | 'error', text: string): void
}

export interface TopBarHandle {
  element: HTMLElement
  sync(): void
  /** Viewer state changed: the saved-layouts menu marks the layout dirty. */
  changed(): void
  destroy(): void
}

/** A plain pair reads without its slash on the pill ('BTCUSD'); anything else, including a spread
 *  expression whose operators are its identity, stays as written. */
export function pillSymbol(symbol: string): string {
  return /^[A-Za-z][A-Za-z0-9.]*\/[A-Za-z][A-Za-z0-9.]*$/.test(symbol) ? symbol.replace('/', '') : symbol
}

const separator = (): HTMLElement => h('span', { class: 'qc-separator qc-separator--vertical', role: 'separator' })

export function mountTopBar(deps: TopBarDeps): TopBarHandle {
  const t = (): ChromeContext['i18n']['t'] => deps.i18n.t
  const { features, commands } = deps
  const element = h('div', { class: 'qc-topbar', role: 'toolbar', 'aria-label': t()('chrome.topBar') })
  stopPointer(element)
  const start = h('div', { class: 'qc-topbar-start' })
  const end = h('div', { class: 'qc-topbar-end' })
  element.append(start, end)
  const disposers: (() => void)[] = []
  const syncers: (() => void)[] = []

  // ── The symbol pill and the compare door ────────────────────────────────────────────────────
  let pill: HTMLButtonElement | null = null
  if (features.symbolSearch) {
    pill = button({ label: t()('chrome.symbolSearch'), text: '', className: 'qc-symbol-pill', onClick: () => deps.openSearch() })
    pill.setAttribute('aria-haspopup', 'dialog')
    start.appendChild(pill)
  }
  let compareDoor: HTMLButtonElement | null = null
  if (features.compare) {
    compareDoor = button({ label: t()('chrome.compare'), icon: ICONS.comparePlus, className: 'qc-toolbar-button', onClick: () => commands.execute('chart.compare.open') })
    compareDoor.setAttribute('aria-haspopup', 'dialog')
    start.appendChild(compareDoor)
  }
  if (pill || compareDoor) start.appendChild(separator())

  // ── The timeframe picker ────────────────────────────────────────────────────────────────────
  let timeframes: TimeframePickerHandle | null = null
  if (features.timeframes) {
    const store = createTimeframeStore(deps.storage, deps.preferences)
    timeframes = mountTimeframePicker({
      ...deps,
      store,
      restrictions: () => {
        const caps = deps.widget.capabilities()
        return { supportedResolutions: caps.symbolResolutions, resolutions: caps.resolutions }
      },
    })
    start.appendChild(timeframes.element)
    syncers.push(() => timeframes!.sync())
    disposers.push(() => timeframes!.destroy())
  }

  // ── The style picker ────────────────────────────────────────────────────────────────────────
  let styles: StylePickerHandle | null = null
  if (features.chartStyles) {
    styles = mountStylePicker(deps)
    start.appendChild(styles.element)
    syncers.push(() => styles!.sync())
    disposers.push(() => styles!.destroy())
  }

  // ── Indicators ──────────────────────────────────────────────────────────────────────────────
  let indicators: HTMLButtonElement | null = null
  if (features.indicators) {
    indicators = button({ label: t()('chrome.indicators'), icon: ICONS.indicators, className: 'qc-toolbar-button', onClick: () => openIndicatorPicker({ ...deps, access: deps.access }) })
    indicators.setAttribute('aria-haspopup', 'dialog')
    start.appendChild(indicators)
  }

  // ── Replay ──────────────────────────────────────────────────────────────────────────────────
  let replay: HTMLButtonElement | null = null
  if (features.replay) {
    replay = button({
      label: t()('chrome.replay'),
      icon: ICONS.replay,
      className: 'qc-toolbar-button',
      pressed: false,
      onClick: () => commands.execute(activeChart(deps).replay.state().on ? 'chart.replay.exit' : 'chart.replay.start'),
    })
    start.appendChild(replay)
  }

  // ── Layouts ─────────────────────────────────────────────────────────────────────────────────
  let layoutSetup: LayoutSetupHandle | null = null
  let layoutsMenu: LayoutsMenuHandle | null = null
  if (features.layouts) {
    layoutSetup = mountLayoutSetup(deps)
    layoutsMenu = mountLayoutsMenu({ ...deps, store: deps.saveLoad?.layouts ?? null, autosave: deps.autosave, notify: deps.notify })
    end.append(layoutSetup.element, layoutsMenu.element, separator())
    syncers.push(() => layoutSetup!.sync(), () => layoutsMenu!.sync())
    disposers.push(() => layoutSetup!.destroy(), () => layoutsMenu!.destroy())
  }

  // ── Settings, fullscreen, image ─────────────────────────────────────────────────────────────
  let settings: SettingsMenuHandle | null = null
  if (features.settings) {
    settings = mountSettingsMenu(deps)
    end.appendChild(settings.element)
    syncers.push(() => settings!.sync())
    disposers.push(() => settings!.destroy())
  }
  let fullscreen: HTMLButtonElement | null = null
  if (features.fullscreen) {
    fullscreen = button({ label: commandLabel(deps, 'widget.fullscreen.enter'), icon: ICONS.fullscreen, className: 'qc-toolbar-button', pressed: false, onClick: () => commands.execute('widget.fullscreen.toggle') })
    end.appendChild(fullscreen)
  }
  let image: HTMLButtonElement | null = null
  let imageMenu: MenuHandle | null = null
  if (features.image) {
    image = button({ label: t()('chrome.image'), icon: ICONS.camera, className: 'qc-toolbar-button', onClick: () => openImageMenu() })
    image.setAttribute('aria-haspopup', 'menu')
    image.setAttribute('aria-expanded', 'false')
    end.appendChild(image)
  }
  const openImageMenu = (): void => {
    imageMenu = openMenu({
      host: deps.overlays,
      anchor: image!,
      label: t()('chrome.image'),
      width: 200,
      align: 'end',
      build(body, handle) {
        body.appendChild(
          menuItem({
            text: commandLabel(deps, 'widget.image.download'),
            icon: glyph(ICONS.download, { size: 18 }),
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
        body.appendChild(
          menuItem({
            text: commandLabel(deps, 'widget.image.copy'),
            icon: glyph(ICONS.copy, { size: 18 }),
            disabled: !commands.available('widget.image.copy'),
            onSelect: () => {
              handle.close()
              commands.execute('widget.image.copy')
            },
          }),
        )
      },
      onClose: () => {
        imageMenu = null
      },
    })
  }

  const sync = (): void => {
    const chart = activeChart(deps)
    element.setAttribute('aria-label', t()('chrome.topBar'))
    if (pill) {
      const text = pill.querySelector('.qc-button-text')
      if (text) text.textContent = pillSymbol(chart.symbol())
      name(pill, `${t()('chrome.symbolSearch')}: ${t()('chrome.activeChart', { symbol: chart.symbol(), timeframe: chart.timeframe() })}`)
      setDisabled(pill, !commands.available('chart.symbol.set') || !deps.widget.capabilities().search)
    }
    if (compareDoor) {
      name(compareDoor, t()('chrome.compare'))
      setDisabled(compareDoor, !commands.available('chart.compare.open'))
    }
    if (indicators) {
      name(indicators, t()('chrome.indicators'))
      setDisabled(indicators, !commands.available('chart.indicators.add'))
    }
    if (replay) {
      const on = chart.replay.state().on
      name(replay, t()('chrome.replay'))
      replay.setAttribute('aria-pressed', String(on))
      setDisabled(replay, !commands.available(on ? 'chart.replay.exit' : 'chart.replay.start'))
    }
    if (fullscreen) {
      const active = deps.widget.fullscreen.active()
      name(fullscreen, commandLabel(deps, active ? 'widget.fullscreen.exit' : 'widget.fullscreen.enter'))
      fullscreen.setAttribute('aria-pressed', String(active))
      fullscreen.querySelector('.qc-icon')?.replaceWith(glyph(active ? ICONS.exitFullscreen : ICONS.fullscreen))
      setDisabled(fullscreen, !commands.available('widget.fullscreen.toggle'))
    }
    if (image) {
      name(image, t()('chrome.image'))
      setDisabled(image, !commands.available('widget.image.download'))
      imageMenu?.refresh()
    }
    for (const s of syncers) s()
  }

  const offStrings = deps.i18n.onChange(sync)
  sync()
  return {
    element,
    sync,
    changed: () => layoutsMenu?.changed(),
    destroy() {
      offStrings()
      imageMenu?.close()
      for (const d of disposers) d()
      element.remove()
    },
  }
}
