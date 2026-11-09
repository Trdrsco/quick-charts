// @vitest-environment happy-dom
// The name bubble on a mounted widget: one bubble in the widget's layer over its root, the layer
// and every bar a page mounts in its own frame, each marked `data-qc-tips`; and no element the chart
// draws carries a native title, so the browser's own tooltip never doubles the bubble.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed } from '../../src/datafeed'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { TIP_DELAY, tipText } from '../../src/ui/chrome/tips'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const feed: ChartDatafeed = {
  search: async () => ({ hits: [{ symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'futures' }, { symbol: 'NQ', name: 'Nasdaq', exchange: 'CME', type: 'futures' }], hasMore: false }),
  resolve: async (symbol) => ({
    ticker: symbol,
    name: symbol,
    description: 'E-mini S&P 500',
    exchange: 'CME',
    listedExchange: 'CME',
    type: 'futures',
    supportedResolutions: [],
    timezone: 'America/Chicago',
    session: '1700-1600:23456',
    subsessions: [
      { id: 'regular', session: '0830-1515' },
      { id: 'extended', session: '1700-1600' },
    ],
    dataStatus: 'streaming',
    volumePrecision: 0,
    format: { pricescale: 100, minmov: 25 },
  }),
  history: async () => ({ bars: Array.from({ length: 30 }, (_, i) => ({ t: 1_700_000_000 + i * 60, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 })), noData: false }),
  subscribeBars: () => () => undefined,
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** A widget whose top bar and drawing toolbar a page mounted in frames of its own. */
async function mount(): Promise<{ widget: ChartWidget; container: HTMLElement; toolbar: HTMLElement; drawing: HTMLElement }> {
  const container = document.createElement('div')
  const toolbar = document.createElement('header')
  const drawing = document.createElement('aside')
  document.body.append(toolbar, drawing, container)
  const widget = createChart({ container, toolbarContainer: toolbar, drawingToolbarContainer: drawing, datafeed: feed, symbol: 'ES', timeframe: '1m' })
  mounted.push(widget)
  await settle()
  await settle()
  return { widget, container, toolbar, drawing }
}

describe('the bubble on a mounted widget', () => {
  it('marks the root, the layer and every bar the page mounts outside the root, and stands one bubble in the layer', async () => {
    const { container, toolbar, drawing } = await mount()
    const root = container.querySelector<HTMLElement>('.qc-root')!
    const layer = document.querySelector<HTMLElement>('.qc-layer')!
    expect(root.hasAttribute('data-qc-tips')).toBe(true)
    expect(layer.hasAttribute('data-qc-tips')).toBe(true)
    expect(toolbar.querySelector('.qc-toolbar-host')!.hasAttribute('data-qc-tips')).toBe(true)
    expect(drawing.querySelector('.qc-drawing-toolbar-host')!.hasAttribute('data-qc-tips')).toBe(true)
    expect(drawing.querySelector('[data-role="drawing-toolbar"]')!.closest('[data-qc-tips]')).not.toBeNull()
    expect(layer.querySelectorAll(':scope > .qc-tip')).toHaveLength(1)
  })

  it('leaves no native title on any element the chart draws, its dialogs and menus included', async () => {
    const { widget } = await mount()
    const titled = (): string[] => [...document.querySelectorAll('[title]')].map((element) => `${element.tagName.toLowerCase()}.${element.getAttribute('class') ?? ''}: ${element.getAttribute('title')}`)
    expect(titled()).toEqual([])
    for (const command of ['chart.indicators.open', 'chart.compare.open', 'chart.settings.open', 'chart.symbol.search']) {
      widget.commands.execute(command)
      await settle()
      expect(titled(), command).toEqual([])
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await settle()
    }
  })

  it('names the top bar, drawing toolbar and bottom bar controls in their bubble words', async () => {
    const { toolbar, drawing, container } = await mount()
    const tipOf = (selector: string, root: ParentNode): string | null => tipText(root.querySelector<HTMLElement>(selector)!)
    expect(tipOf('.qc-symbol-pill', toolbar)).toBe('Search symbol')
    expect(tipOf('[aria-label="Compare or add symbol"]', toolbar)).toBe('Compare symbols')
    expect(tipOf('[data-qc-label="last"]', toolbar)).toBe('Indicators and strategies')
    expect(tipOf('.qc-tf-caret', toolbar)).toBe('Chart interval')
    expect(tipOf('.qc-tf-chip', toolbar)).toBe('1 minute')
    expect(tipOf('[aria-label="Chart image"]', toolbar)).toBe('Take a snapshot')
    expect(tipOf('[aria-label="Magnet"]', drawing)).toBe('Magnet mode snaps drawings placed near price bars to the closest OHLC value')
    expect(tipOf('[aria-label="Cursor menu"]', drawing)).toBe('Cursors')
    expect(tipOf('.qc-range-chip', container)).toBe('1 day in 1 minute intervals')
    // The factory trading hours are the regular ones, named for an electronic day in its own words.
    expect(tipOf('.qc-session-trigger', container)).toBe('Regular trading hours')
    expect(tipOf('.qc-tz-trigger', container)).toBe('Timezone')
  })

  it('raises nothing on a picker filter chip, whose words already say it, and the chip carries no title', async () => {
    const { widget } = await mount()
    widget.commands.execute('chart.indicators.open')
    await settle()
    const chip = document.querySelector<HTMLButtonElement>('[data-picker-kind]')
    expect(chip).not.toBeNull()
    if (chip) {
      expect(chip.hasAttribute('title')).toBe(false)
      expect(tipText(chip)).toBeNull()
      chip.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }))
      await new Promise((resolve) => setTimeout(resolve, TIP_DELAY + 20))
      expect(document.querySelector<HTMLElement>('.qc-tip')!.hidden).toBe(true)
    }
    // The chips stand whether or not the strip shows, and an indicator row's name raises none.
    const rowName = document.querySelector<HTMLElement>('.qc-picker-name')!
    expect(rowName.hasAttribute('data-no-tip')).toBe(true)
    expect(tipText(rowName)).toBeNull()
    const star = document.querySelector<HTMLElement>('.qc-picker-star')!
    expect(tipText(star)).toBe('Add to favorites')
  })
})
