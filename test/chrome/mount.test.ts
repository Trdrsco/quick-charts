// @vitest-environment happy-dom
// The chrome's composition: what mounting puts around the charts, which feature flags remove which
// surface, the reading direction on the root, the doors it fills, the notices it raises from the
// event maps, and a clean teardown that closes every open overlay with its listeners and timers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountChrome } from '../../src/ui/chrome/mount'
import { readingDirection } from '../../src/i18n'
import { emptyDoors } from '../../src/ui/chrome/doors'
import { openOverlays } from '../../src/ui/controls/overlays'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import { LIGHT_THEME } from '../../src/theme/palettes'
import type { ChartDatafeed } from '../../src/datafeed'
import type { FeatureConfig, UiConfig } from '../../src/widget/options'
import { fakeWidget, settle } from './harness'
import { resolveMarkPainters } from '../../src/markPainters'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: [], noData: true }),
  subscribeBars: () => () => undefined,
}

function mount(options: { features?: FeatureConfig; ui?: UiConfig; locale?: string; toolbarContainer?: HTMLElement } = {}) {
  const i18n = createChartI18n(options.locale ?? 'en')
  const w = fakeWidget({ features: options.features, ui: options.ui, i18n })
  const root = document.createElement('div')
  const panes = document.createElement('div')
  panes.className = 'qc-panes'
  root.appendChild(panes)
  document.body.appendChild(root)
  const doors = emptyDoors()
  const layer = document.body.appendChild(document.createElement('div'))
  const chrome = mountChrome({ root, layer, toolbarContainer: options.toolbarContainer, panes, widget: w.widget, i18n, features: w.features, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, datafeed, feedConfig: () => ({ classes: ['future'] }), autosave: w.autosave, layoutChanges: w.layoutChanges, icons: w.icons, styles: w.ctx.styles, timeframes: w.ctx.timeframes, layouts: w.ctx.layouts, doors, painters: resolveMarkPainters({}) })
  cleanup.push(() => (chrome.dispose(), w.dispose()))
  return { w, root, panes, doors, chrome, i18n, layer }
}

describe('the chrome composition', () => {
  it('mounts one toolbar in host space, follows theme and locale, and preserves host content at dispose', async () => {
    const host = document.createElement('header')
    const owned = document.createElement('button')
    host.appendChild(owned)
    document.body.appendChild(host)
    const { root, w, i18n, chrome } = mount({ toolbarContainer: host })
    expect(root.querySelector('.qc-topbar')).toBeNull()
    expect(host.querySelectorAll('.qc-topbar')).toHaveLength(1)
    const surface = host.querySelector<HTMLElement>('[data-qc-theme]')!
    expect(surface.getAttribute('data-qc-theme')).toBe('dark')
    w.widget.theme.setMode('light')
    expect(surface.getAttribute('data-qc-theme')).toBe('light')
    expect(surface.style.getPropertyValue('--qc-text-primary')).toBe(LIGHT_THEME['text.primary'])
    await i18n.setLocale('ar')
    expect(surface.getAttribute('dir')).toBe('rtl')
    const before = surface.getAttribute('style')
    chrome.dispose()
    expect([...host.children]).toEqual([owned])
    expect(host.hasAttribute('data-qc-theme')).toBe(false)
    w.widget.theme.setMode('dark')
    expect(surface.getAttribute('style')).toBe(before)
  })

  it('opens an external top bar\'s menus in the widget\'s layer, fixed to the viewport, and closes them at dispose', () => {
    const host = document.createElement('header')
    document.body.appendChild(host)
    const { root, layer, chrome } = mount({ toolbarContainer: host })
    host.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!.click()
    const barLayer = layer.querySelector<HTMLElement>(':scope > .qc-overlays')!
    expect(barLayer.querySelector('[role="menu"]')).not.toBeNull()
    expect(root.querySelector('[role="menu"]')).toBeNull()
    chrome.dispose()
    expect(document.querySelector('[role="menu"]')).toBeNull()
    expect(barLayer.isConnected).toBe(false)
  })

  it('leaves host toolbar space untouched when the top bar is hidden', () => {
    const host = document.createElement('div')
    const { chrome } = mount({ toolbarContainer: host, ui: { topBar: false } })
    expect(host.children).toHaveLength(0)
    chrome.dispose()
    expect(host.children).toHaveLength(0)
  })

  it('dispatches toolbar shortcuts through the registry and releases the listener on disposal', () => {
    const host = document.createElement('div')
    const { w, chrome } = mount({ toolbarContainer: host })
    let calls = 0
    w.widget.commands.register({
      id: 'chart.view.reset', scope: 'chart', label: 'command.viewReset', shortcut: 'Alt+KeyR',
      available: () => true,
      execute: () => { calls++ },
    })
    const button = host.querySelector('button')!
    const press = () => button.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', altKey: true, bubbles: true, cancelable: true }))
    expect(press()).toBe(false)
    expect(calls).toBe(1)
    chrome.dispose()
    expect(press()).toBe(true)
    expect(calls).toBe(1)
  })

  it('puts the top bar before the charts, the notices and the bottom bar after, and the overlay layer last', () => {
    const { root, panes } = mount()
    const classes = [...root.children].map((el) => el.className)
    expect(classes).toEqual(['qc-topbar', 'qc-panes', 'qc-toasts', 'qc-bottombar', 'qc-overlays'])
    // The charts grid is the layout's to tile: nothing the chrome mounts lives inside it, so a
    // host reading its children reads the charts and only the charts.
    expect(panes.children.length).toBe(0)
  })

  it('removes the bars and the notices when they are hidden', () => {
    const { root } = mount({ ui: { topBar: false, bottomBar: false, toasts: false } })
    expect([...root.children].map((el) => el.className)).toEqual(['qc-panes', 'qc-overlays'])
    expect(root.querySelector('.qc-toasts')).toBeNull()
  })

  it('writes the reading direction on the root and flips it with the language', async () => {
    const { root, i18n } = mount()
    expect(root.getAttribute('dir')).toBe('ltr')
    await i18n.setLocale('ar')
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(readingDirection(createChartI18n('he_IL'))).toBe('rtl')
    expect(readingDirection({ ...createChartI18n(), dir: undefined })).toBe('ltr')
  })

  it('fills the doors: search opens the dialog for the requested chart and settings opens for a held instance', () => {
    const { w, doors, root } = mount()
    doors.openSearch({ mode: 'search', chart: w.chart.handle })
    expect(root.querySelector('[role="dialog"][aria-label="Symbol search"]')).not.toBeNull()
    expect(doors.openIndicatorSettings(w.chart.handle, 'missing')).toBe(false)
  })

  it('routes committed layout state to only its own chrome and releases that private door', () => {
    const first = mount()
    const second = mount()
    const state = {
      arrangement: '2v', geometry: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
      sync: { symbol: false, interval: true, crosshair: false, time: false, dateRange: false }, active: 0, maximized: 0,
    } as const
    first.doors.layoutChanged(state)
    expect(first.root.querySelector('[aria-label="Layout setup: 2 rows"]')).not.toBeNull()
    expect(second.root.querySelector('[aria-label="Layout setup: Single chart"]')).not.toBeNull()
    first.chrome.dispose()
    first.doors.layoutChanged({ ...state, arrangement: '4', maximized: null })
    expect(first.root.querySelector('.qc-topbar')).toBeNull()
    expect(second.root.querySelector('[aria-label="Layout setup: Single chart"]')).not.toBeNull()
  })

  it('leaves the search door inert when the search dialog is hidden, but keeps compare', () => {
    const { w, doors, root } = mount({ ui: { symbolSearch: false } })
    doors.openSearch({ mode: 'search', chart: w.chart.handle })
    expect(root.querySelector('[role="dialog"]')).toBeNull()
    doors.openSearch({ mode: 'compare', chart: w.chart.handle })
    expect(root.querySelector('[role="dialog"][aria-label="Compare symbols"]')).not.toBeNull()
  })

  it('raises a notice for a feed that cannot serve the symbol, a refused save, and a refused image copy', () => {
    const { w, root } = mount()
    w.chart.events.emit('feedStatus', 'feed_unavailable')
    w.chart.events.emit('feedStatus', 'live')
    w.events.emit('saveConflict', { family: 'chart', current: null, message: 'Saved elsewhere since you opened it.' })
    w.events.emit('image', { kind: 'copyFallback' })
    w.events.emit('image', { kind: 'copied' })
    const texts = [...root.querySelectorAll('.qc-toast-text')].map((t) => t.textContent)
    expect(texts).toEqual(['No data for ES from this feed.', 'Saved elsewhere since you opened it.', 'Could not copy the image. Saved a file instead.'])
  })

  it('follows the active chart: a symbol change re-reads the pill after the debounce', async () => {
    const { w, root } = mount()
    w.chart.handle.setSymbol('NQ')
    await settle()
    expect(root.querySelector('.qc-symbol-pill .qc-button-text')!.textContent).toBe('NQ')
  })

  it('tears everything down and leaves the root bare', () => {
    const { root, chrome } = mount()
    chrome.dispose()
    expect([...root.children].map((el) => el.className)).toEqual(['qc-panes'])
    expect(root.hasAttribute('dir')).toBe(false)
  })

  it('a sync queued by an event just before dispose never runs: nothing reads the widget or the DOM after teardown', async () => {
    const { w, root, chrome } = mount()
    const bars = [...root.querySelectorAll('.qc-topbar, .qc-bottombar')]
    // The event queues the debounced sync; the dispose lands before the microtask runs.
    w.chart.handle.setSymbol('NQ')
    chrome.dispose()
    // A disposed widget has no charts to answer with, which is exactly what the queued sync
    // would have asked it for.
    const activeChart = vi.spyOn(w.widget, 'activeChart').mockImplementation(() => {
      throw new Error('the widget has no charts')
    })
    const observed: string[] = []
    const observer = new MutationObserver((records) => observed.push(...records.map((r) => r.type)))
    for (const bar of bars) observer.observe(bar, { subtree: true, childList: true, attributes: true, characterData: true })
    await settle()
    observer.disconnect()
    expect(activeChart).not.toHaveBeenCalled()
    expect(observed).toEqual([])
    // Events after the dispose are equally inert: the subscriptions came down with it.
    w.chart.handle.setTimeframe('5m')
    w.events.emit('theme', LIGHT_THEME, 'light')
    await settle()
    expect(activeChart).not.toHaveBeenCalled()
    expect(observed).toEqual([])
  })

  it('disposing with a dialog and a menu open closes both: no document listener and no timer survives', () => {
    vi.useFakeTimers()
    const adds: string[] = []
    const removes: string[] = []
    const originalAdd = Document.prototype.addEventListener
    const originalRemove = Document.prototype.removeEventListener
    const onAdd = vi.spyOn(document, 'addEventListener').mockImplementation(function (this: Document, type: string, ...rest: unknown[]) {
      adds.push(type)
      return (originalAdd as (...a: unknown[]) => void).call(this, type, ...rest)
    } as never)
    const onRemove = vi.spyOn(document, 'removeEventListener').mockImplementation(function (this: Document, type: string, ...rest: unknown[]) {
      removes.push(type)
      return (originalRemove as (...a: unknown[]) => void).call(this, type, ...rest)
    } as never)
    cleanup.push(() => {
      onAdd.mockRestore()
      onRemove.mockRestore()
      vi.useRealTimers()
    })
    const { w, doors, root, chrome } = mount()
    const overlays = root.querySelector<HTMLElement>('.qc-overlays')!
    root.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!.click()
    doors.openSearch({ mode: 'search', chart: w.chart.handle })
    expect(openOverlays(overlays)).toBe(2)
    expect(adds.filter((t) => t === 'keydown').length).toBeGreaterThanOrEqual(2)
    chrome.dispose()
    expect(openOverlays(overlays)).toBe(0)
    expect(document.querySelector('[role="dialog"], [role="menu"]')).toBeNull()
    // Every document listener the overlays and the clock bound was unbound, and no timer stands.
    for (const type of new Set(adds)) expect(removes.filter((t) => t === type).length, type).toBe(adds.filter((t) => t === type).length)
    expect(vi.getTimerCount()).toBe(0)
    // A stale Escape reaches the host now, rather than a closed dialog.
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.body.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(false)
  })
})
