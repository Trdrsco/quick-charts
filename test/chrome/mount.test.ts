// @vitest-environment happy-dom
// The chrome's composition: what mounting puts around the charts, which feature flags remove which
// surface, the reading direction on the root, the doors it fills, the notices it raises from the
// event maps, and a clean teardown.
import { afterEach, describe, expect, it } from 'vitest'
import { mountChrome, readingDirection } from '../../src/ui/chrome/mount'
import { emptyDoors } from '../../src/ui/chrome/doors'
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
  const chrome = mountChrome({ root, panes, widget: w.widget, i18n, features: w.features, storage: memoryChartStorage(), preferences: {}, saveLoad: null, datafeed, feedConfig: () => ({ classes: ['future'] }), doors })
  cleanup.push(() => (chrome.dispose(), w.dispose()))
  return { w, root, panes, doors, chrome, i18n }
}

describe('the chrome composition', () => {
  it('puts the top bar before the charts, the bottom bar after, the overlay layer last, and the notices over the charts', () => {
    const { root, panes } = mount()
    const classes = [...root.children].map((el) => el.className)
    expect(classes).toEqual(['qc-topbar', 'qc-panes', 'qc-bottombar', 'qc-overlays'])
    expect(panes.querySelector('.qc-toasts')).not.toBeNull()
  })

  it('removes the bars and the notices when their features are off', () => {
    const { root, panes } = mount({ features: { topBar: false, bottomBar: false, toasts: false } })
    expect([...root.children].map((el) => el.className)).toEqual(['qc-panes', 'qc-overlays'])
    expect(panes.querySelector('.qc-toasts')).toBeNull()
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

  it('raises a notice for a feed that cannot serve the symbol and for a refused save', () => {
    const { w, panes } = mount()
    w.chart.events.emit('feedStatus', 'feed_unavailable')
    w.chart.events.emit('feedStatus', 'live')
    w.events.emit('saveConflict', { family: 'chart', current: null, message: 'Saved elsewhere since you opened it.' })
    const texts = [...panes.querySelectorAll('.qc-toast-text')].map((t) => t.textContent)
    expect(texts).toEqual(['No data for ES from this feed.', 'Saved elsewhere since you opened it.'])
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
})
