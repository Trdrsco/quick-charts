// @vitest-environment happy-dom
// The chrome's composition: what mounting puts around the charts, which feature flags remove which
// surface, the reading direction on the root, the doors it fills, the notices it raises from the
// event maps, and a clean teardown that closes every open overlay with its listeners and timers.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountChrome, readingDirection } from '../../src/ui/chrome/mount'
import { emptyDoors } from '../../src/ui/chrome/doors'
import { openOverlayCount } from '../../src/ui/chrome/overlays'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import type { ChartDatafeed } from '../../src/datafeed'
import type { FeatureConfig } from '../../src/widget/options'
import { fakeWidget, settle } from './harness'

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

function mount(options: { features?: FeatureConfig; locale?: string } = {}) {
  const i18n = createChartI18n(options.locale ?? 'en')
  const w = fakeWidget({ features: options.features, i18n })
  const root = document.createElement('div')
  const panes = document.createElement('div')
  panes.className = 'qc-panes'
  root.appendChild(panes)
  document.body.appendChild(root)
  const doors = emptyDoors()
  const chrome = mountChrome({ root, panes, widget: w.widget, i18n, features: w.features, storage: memoryChartStorage(), preferences: {}, saveLoad: null, datafeed, feedConfig: () => ({ classes: ['future'] }), autosave: w.autosave, doors })
  cleanup.push(() => (chrome.dispose(), w.dispose()))
  return { w, root, panes, doors, chrome, i18n }
}

describe('the chrome composition', () => {
  it('puts the top bar before the charts, the notices and the bottom bar after, and the overlay layer last', () => {
    const { root, panes } = mount()
    const classes = [...root.children].map((el) => el.className)
    expect(classes).toEqual(['qc-topbar', 'qc-panes', 'qc-toasts', 'qc-bottombar', 'qc-overlays'])
    // The charts grid is the layout's to tile: nothing the chrome mounts lives inside it, so a
    // host reading its children reads the charts and only the charts.
    expect(panes.children.length).toBe(0)
  })

  it('removes the bars and the notices when their features are off', () => {
    const { root } = mount({ features: { topBar: false, bottomBar: false, toasts: false } })
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

  it('leaves the search door inert when symbol search is off, but keeps compare', () => {
    const { w, doors, root } = mount({ features: { symbolSearch: false } })
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
    expect(openOverlayCount(overlays)).toBe(2)
    expect(adds.filter((t) => t === 'keydown').length).toBeGreaterThanOrEqual(2)
    chrome.dispose()
    expect(openOverlayCount(overlays)).toBe(0)
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
