// @vitest-environment happy-dom
// The chart settings dialog over a real widget: the open command reaches it with the top bar
// hidden, its rows write through the chart's own settings commands, Cancel puts the chart back,
// an extension's page joins the rail, and a saved template comes back through the widget's store.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../../src/widget/create'
import { memorySaveLoadAdapter } from '../../../src/resources'
import type { ChartDatafeed, FeedBar } from '../../../src/datafeed'
import type { ChartExtension } from '../../../src/extension'
import type { UiConfig } from '../../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('../../widget/rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  document.body.replaceChildren()
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 60 * (index + 1), o: 10 + index, h: 11 + index, l: 9 + index, c: 10 + index, v: index + 1 }))
const datafeed = (): ChartDatafeed => ({
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
})
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function mount(options: { ui?: UiConfig; extensions?: ChartExtension[] } = {}): Promise<ChartWidget> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', saveLoad: memorySaveLoadAdapter(), ...options })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return widget
}

const dialog = (): HTMLElement | null => document.querySelector<HTMLElement>('.qc-chart-settings-dialog:not([aria-hidden="true"])')

describe('the chart settings dialog over a real widget', () => {
  it('opens from its command with the top bar hidden, writes through the chart, and Cancel puts it back', async () => {
    const widget = await mount({ ui: { topBar: false } })
    const chart = widget.activeChart()
    expect(widget.commands.execute('chart.settings.open', { page: 'canvas' }).kind).toBe('ok')
    const box = dialog()!
    expect(box.querySelector('[aria-selected="true"]')!.getAttribute('data-settings-page')).toBe('canvas')
    expect(chart.settings().canvas.verticalGrid).toBe(true)
    box.querySelector<HTMLInputElement>('[data-row="verticalGrid"] input[type="checkbox"]')!.click()
    expect(chart.settings().canvas.verticalGrid).toBe(false)
    box.querySelector<HTMLButtonElement>('.qc-chart-settings-footer .qc-drawing-cancel')!.click()
    expect(chart.settings().canvas.verticalGrid).toBe(true)
    expect(JSON.parse(chart.saveLoad.serialize().content).settings).toEqual({})
  })

  it('keeps what Ok confirms in the chart\'s saved content', async () => {
    const widget = await mount()
    const chart = widget.activeChart()
    widget.commands.execute('chart.settings.open', { page: 'canvas' })
    dialog()!.querySelector<HTMLInputElement>('[data-row="horizontalGrid"] input[type="checkbox"]')!.click()
    dialog()!.querySelector<HTMLButtonElement>('.qc-chart-settings-footer .qc-button--primary')!.click()
    expect(chart.settings().canvas.horizontalGrid).toBe(false)
    expect(JSON.parse(chart.saveLoad.serialize().content).settings).toEqual({ canvas: { horizontalGrid: false } })
  })

  it('lists the page an attached extension contributes, and builds it with the chart\'s form', async () => {
    const extension: ChartExtension = {
      id: 'host',
      attach(context) {
        context.contributeSettings({
          place: { page: { id: 'trading', label: 'Trading', icon: () => () => undefined, after: 'canvas' } },
          build: (form) => form.check({ id: 'marks', label: 'Execution marks', checked: true, onChange: () => undefined }),
        })
        return { detach: () => undefined }
      },
    }
    const widget = await mount({ extensions: [extension] })
    widget.commands.execute('chart.settings.open', { page: 'trading' })
    const box = dialog()!
    expect([...box.querySelectorAll('.qc-chart-settings-nav-item')].map((tab) => tab.textContent)).toEqual(['Symbol', 'Status line', 'Scales and lines', 'Canvas', 'Trading', 'Events'])
    expect(box.querySelector('[data-row="marks"] .qc-drawing-toggle')!.textContent).toBe('Execution marks')
  })

  it('draws every page for every style from the chart\'s own settings', async () => {
    const widget = await mount()
    const chart = widget.activeChart()
    widget.commands.execute('chart.settings.open')
    for (const style of ['candles', 'hollow', 'bars', 'line', 'area', 'baseline', 'stepline'] as const) {
      chart.setStyle(style)
      for (const page of ['symbol', 'statusLine', 'scales', 'canvas', 'events']) {
        dialog()!.querySelector<HTMLButtonElement>(`.qc-chart-settings-nav-item[data-settings-page="${page}"]`)!.click()
        const rows = dialog()!.querySelectorAll('.qc-chart-settings-panel > [data-row]:not([data-row=""])')
        expect(rows.length, `${style} ${page}`).toBeGreaterThan(0)
      }
    }
    // The date formats read as their samples, the weekday first while the labels carry it.
    dialog()!.querySelector<HTMLButtonElement>('.qc-chart-settings-nav-item[data-settings-page="scales"]')!.click()
    expect(dialog()!.querySelector('[data-row="dateFormat"] .qc-drawing-select-value')!.textContent).toMatch(/^Mon 29 Sep .97$/)
  })

  it('applies the defaults from the Template menu through the chart\'s reset', async () => {
    const widget = await mount()
    const chart = widget.activeChart()
    chart.applySettings({ canvas: { marginTop: 25 } })
    widget.commands.execute('chart.settings.open')
    dialog()!.querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
    ;[...document.querySelectorAll<HTMLButtonElement>('.qc-chart-settings-template-menu [role="menuitem"]')].find((row) => row.textContent === 'Apply defaults')!.click()
    expect(chart.settings().canvas.marginTop).toBe(10)
  })
})
