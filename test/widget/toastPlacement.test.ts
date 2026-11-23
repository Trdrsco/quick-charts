// @vitest-environment happy-dom
// Where a real widget's notices stand: over its charts by default, in the corner `toastPlacement`
// names, or in a space of the host's anywhere on the page, where a notice the chart says then
// appears and from which the widget's own child leaves at dispose, the host's element staying.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChartI18n } from '../../src/i18n'
import { serializeChartContent } from '../../src/widget/saveLoad'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { ChartWidgetOptions } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  document.body.replaceChildren()
})

const bars: FeedBar[] = Array.from({ length: 20 }, (_, index) => ({ t: 60 * (index + 1), o: 10, h: 11, l: 9, c: 10, v: 1 }))
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
}

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const saveLoad = memorySaveLoadAdapter()
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', saveLoad, ...options })
  widgets.push(widget)
  return { widget, container, saveLoad }
}

/** Load a saved chart naming an indicator this widget does not know, which the chart says it could
 *  not carry: a notice the chart raises on its own. */
async function sayANotice(widget: ChartWidget, saveLoad: ReturnType<typeof memorySaveLoadAdapter>): Promise<string> {
  const content = serializeChartContent({ symbol: 'ES', timeframe: '5m', style: 'candles', scale: 'normal', priceAxis: 'auto', indicators: [{ id: 'gone-1', definition: 'not-installed' }], settings: {}, compares: [], panes: ['main'], drawings: [], ext: {} })
  const saved = await saveLoad.charts.create({ name: 'Old', symbol: 'ES', timeframe: '5m', content })
  if (saved.kind !== 'ok') throw new Error('unreachable')
  await widget.activeChart().saveLoad.load(saved.ref.id)
  return createChartI18n().t('toast.indicatorsNotCarried', { count: 1 })
}

describe('where the notices stand', () => {
  it('stand over the charts by default, at the middle of their bottom edge', async () => {
    const { widget, container, saveLoad } = mount()
    const region = container.querySelector<HTMLElement>('.qc-toasts')!
    expect(region.previousElementSibling?.classList.contains('qc-panes')).toBe(true)
    expect(region.dataset.qcPlacement).toBe('bottom')
    const text = await sayANotice(widget, saveLoad)
    expect(region.querySelector('.qc-toast-text')?.textContent).toBe(text)
  })

  it('stand over the charts from their top edge for a top placement', () => {
    const { container } = mount({ toastPlacement: 'top-right' })
    const region = container.querySelector<HTMLElement>('.qc-toasts')!
    expect(region.previousElementSibling?.classList.contains('qc-topbar')).toBe(true)
    expect(region.nextElementSibling?.classList.contains('qc-panes')).toBe(true)
    expect(region.dataset.qcPlacement).toBe('top-right')
  })

  it("stand in a host's space outside the chart, themed, where the chart's notices appear, and leave it at dispose", async () => {
    const page = document.body.appendChild(document.createElement('aside'))
    const kept = page.appendChild(document.createElement('span'))
    const { widget, container, saveLoad } = mount({ toastContainer: page, toastPlacement: 'bottom-right' })
    expect(container.querySelector('.qc-toasts')).toBeNull()
    const space = page.querySelector<HTMLElement>('.qc-toasts-host')!
    expect(space.getAttribute('data-qc-theme')).toBe(widget.theme.mode())
    expect(space.style.getPropertyValue('--qc-text-primary')).toBe(widget.theme.get()['text.primary'])
    const region = space.querySelector<HTMLElement>('.qc-toasts')!
    expect(region.dataset.qcPlacement).toBe('bottom-right')
    const text = await sayANotice(widget, saveLoad)
    expect([...page.querySelectorAll('.qc-toast-text')].map((node) => node.textContent)).toEqual([text])
    expect(container.querySelector('.qc-toast')).toBeNull()
    widget.theme.setMode(widget.theme.mode() === 'dark' ? 'light' : 'dark')
    expect(space.getAttribute('data-qc-theme')).toBe(widget.theme.mode())
    widget.dispose()
    expect(page.querySelector('.qc-toasts-host')).toBeNull()
    expect([...page.children]).toEqual([kept])
  })

  it('mounts no stack anywhere when the notices are hidden', () => {
    const page = document.body.appendChild(document.createElement('aside'))
    const { container } = mount({ toastContainer: page, ui: { toasts: false } })
    expect(page.children).toHaveLength(0)
    expect(container.querySelector('.qc-toasts')).toBeNull()
  })

  it('refuses a placement it does not have', () => {
    expect(() => mount({ toastPlacement: 'middle' as never })).toThrow('toastPlacement "middle" is not one of top-left, top, top-right, bottom-left, bottom, bottom-right')
  })
})
