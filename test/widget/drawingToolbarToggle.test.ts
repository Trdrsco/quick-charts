// @vitest-environment happy-dom
// The pill that tucks the drawing toolbar away, over real widgets: a press flips the boxes that make
// room for the toolbar, the choice is remembered through storage, a toolbar the page mounts outside
// the widget follows the same answer, and the flag removes it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { UiConfig } from '../../src/widget/options'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'

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
const datafeed = (): ChartDatafeed => ({
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
})
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function mount(options: { ui?: UiConfig; storage?: ChartStorage; drawingToolbarContainer?: HTMLElement } = {}): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', ...options })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return container
}

const pillIn = (root: ParentNode): HTMLButtonElement | null => root.querySelector<HTMLButtonElement>('[data-role="drawing-toolbar-toggle"]')

describe('the drawing toolbar toggle', () => {
  it('tucks the toolbar away and brings it back, moving both planes with it', async () => {
    const storage = memoryChartStorage()
    const container = await mount({ storage })
    const pill = pillIn(container)!
    const chrome = container.querySelector<HTMLElement>('.qc-chrome')!
    const gestures = container.querySelector<HTMLElement>('.qc-gestures')!
    expect(pill.getAttribute('aria-label')).toBe('Hide drawing tools')
    expect(pill.getAttribute('aria-expanded')).toBe('true')
    expect(chrome.dataset.qcDrawingToolbar).toBe('true')

    pill.click()
    expect(chrome.dataset.qcDrawingToolbar).toBe('collapsed')
    expect(gestures.dataset.qcDrawingToolbar).toBe('collapsed')
    expect(pill.getAttribute('aria-expanded')).toBe('false')
    expect(pill.getAttribute('aria-label')).toBe('Show drawing tools')
    expect(storage.get('quickcharts.drawingToolbarCollapsed.v1')).toBe('true')
    // The pill rides the toolbar it stands at the edge of.
    expect(pill.parentElement?.classList.contains('qc-drawing-toolbar')).toBe(true)

    pill.click()
    expect(chrome.dataset.qcDrawingToolbar).toBe('true')
    expect(storage.get('quickcharts.drawingToolbarCollapsed.v1')).toBe('false')
  })

  it('opens tucked away when the viewer left it that way', async () => {
    const container = await mount({ storage: memoryChartStorage({ 'quickcharts.drawingToolbarCollapsed.v1': 'true' }) })
    const chrome = container.querySelector<HTMLElement>('.qc-chrome')!
    expect(chrome.dataset.qcDrawingToolbar).toBe('collapsed')
    expect(pillIn(container)!.getAttribute('aria-expanded')).toBe('false')
  })

  it('stands beside a toolbar the page mounts outside the widget', async () => {
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    const container = await mount({ drawingToolbarContainer: outside })
    const surface = outside.querySelector<HTMLElement>('.qc-drawing-toolbar-host')!
    expect(pillIn(container)).toBeNull()
    const pill = pillIn(surface)!
    expect(surface.dataset.qcDrawingToolbar).toBe('true')
    pill.click()
    expect(surface.dataset.qcDrawingToolbar).toBe('collapsed')
    // The chart's own planes keep no column for an outside toolbar, so they carry no state.
    expect(container.querySelector<HTMLElement>('.qc-chrome')!.dataset.qcDrawingToolbar).toBeUndefined()
  })

  it('comes out as the pointer nears it beside the toolbar', async () => {
    const container = await mount()
    const pill = pillIn(container)!
    // happy-dom lays nothing out: the toolbar and the pill both stand at the origin.
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 20, clientY: 0, bubbles: true }))
    expect(pill.hasAttribute('data-qc-near')).toBe(true)
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 900, clientY: 0, bubbles: true }))
    expect(pill.hasAttribute('data-qc-near')).toBe(false)
  })

  it('is left out when the host turns it off, and with the toolbar', async () => {
    expect(pillIn(await mount({ ui: { drawingToolbarToggle: false } }))).toBeNull()
    expect(pillIn(await mount({ ui: { drawingToolbar: false } }))).toBeNull()
  })
})
