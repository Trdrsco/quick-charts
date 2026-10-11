// @vitest-environment happy-dom
// A row an extension places in the pane's legend: where it stands, in what order, that it takes the
// pointer and the status line's backdrop, and that taking it out, or detaching, gives the element
// back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed } from '../src/datafeed'
import type { ChartExtension, ChartExtensionContext } from '../src/extension'
import type { SymbolInfo } from '../src/symbology'
import { createChart, type ChartWidget } from '../src/widget/create'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./widget/rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const info: SymbolInfo = {
  ticker: 'ES',
  name: 'ES',
  description: 'E-mini',
  exchange: 'CME',
  listedExchange: 'CME',
  type: 'futures',
  supportedResolutions: [],
  timezone: 'Etc/UTC',
  session: '24x7',
  dataStatus: 'streaming',
  volumePrecision: 0,
  format: { pricescale: 100, minmov: 1 },
}

const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => info,
  history: async () => ({ bars: [{ t: 1_700_000_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }], noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

function mount(extensions: ChartExtension[]) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({
    container,
    datafeed,
    symbol: 'ES',
    timeframe: '1m',
    theme: { mode: 'dark' },
    features: { drawings: false, replay: false, compare: false },
    ui: { contextMenu: false, topBar: false, bottomBar: false, toasts: false },
    extensions,
  })
  mounted.push(widget)
  return { widget, container }
}

const slotted = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll<HTMLElement>('.qc-legend-slots > .qc-legend-slot')].map((slot) => slot.firstElementChild as HTMLElement)

describe('a contributed legend row', () => {
  it('stands under the reading and above the indicator rows, in its rank', () => {
    const rows = { a: document.createElement('div'), b: document.createElement('div'), c: document.createElement('div') }
    let context: ChartExtensionContext | null = null
    const { container } = mount([
      {
        id: 'rows',
        attach: (ctx) => {
          context = ctx
          ctx.contributeLegendRow({ element: rows.a })
          ctx.contributeLegendRow({ element: rows.b, rank: -1 })
          return { detach: () => undefined }
        },
      },
    ])
    expect(slotted(container)).toEqual([rows.b, rows.a])
    const slots = container.querySelector<HTMLElement>('.qc-legend-slots')!
    expect(slots.hidden).toBe(false)
    // Between the header and the indicator rows.
    expect(slots.previousElementSibling?.classList.contains('qc-legend-header')).toBe(true)
    expect(slots.nextElementSibling?.classList.contains('qc-legend-rows')).toBe(true)
    const remove = context!.contributeLegendRow({ element: rows.c, rank: -1 })
    expect(slotted(container)).toEqual([rows.b, rows.c, rows.a])
    remove()
    expect(slotted(container)).toEqual([rows.b, rows.a])
    expect(rows.c.isConnected).toBe(false)
    remove()
    expect(slotted(container)).toEqual([rows.b, rows.a])
  })

  it('takes the pointer: a press on its controls reaches them and not the chart', () => {
    const element = document.createElement('div')
    const button = document.createElement('button')
    element.appendChild(button)
    const pressed = vi.fn()
    button.addEventListener('click', pressed)
    const { container } = mount([{ id: 'row', attach: (ctx) => (ctx.contributeLegendRow({ element }), { detach: () => undefined }) }])
    const chartHeard = vi.fn()
    container.addEventListener('pointerdown', chartHeard)
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    button.click()
    expect(pressed).toHaveBeenCalledOnce()
    // The legend keeps the press from the chart's gestures under it.
    expect(chartHeard).not.toHaveBeenCalled()
    expect(element.closest('.qc-legend-slot')).not.toBeNull()
  })

  it('wears the status line backdrop, and leaves with its extension', () => {
    const element = document.createElement('div')
    const { widget, container } = mount([{ id: 'row', attach: (ctx) => (ctx.contributeLegendRow({ element }), { detach: () => undefined }) }])
    const legend = container.querySelector<HTMLElement>('.qc-legend')!
    expect(legend.style.getPropertyValue('--qcd-legend-backdrop')).toBe('rgba(15, 15, 15, 0.5)')
    expect(slotted(container)).toEqual([element])
    widget.dispose()
    mounted.length = 0
    expect(element.isConnected).toBe(false)
  })

  it('stays put when the indicator rows collapse', () => {
    const element = document.createElement('div')
    const { container } = mount([{ id: 'row', attach: (ctx) => (ctx.contributeLegendRow({ element }), { detach: () => undefined }) }])
    const legend = container.querySelector<HTMLElement>('.qc-legend')!
    container.querySelector<HTMLButtonElement>('[data-role="legend-collapse"]')!.click()
    expect(legend.dataset.rowsCollapsed).toBe('true')
    expect(element.isConnected).toBe(true)
    expect(container.querySelector<HTMLElement>('.qc-legend-slots')!.hidden).toBe(false)
  })
})
