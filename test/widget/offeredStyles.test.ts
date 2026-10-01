// @vitest-environment happy-dom
// The styles a host offers, on a widget mounted the way a host mounts it. A host that names no list
// gets every style; a list it names is the whole set its charts can wear, so a style left out has no
// command, and a saved layout or a stored preference that names one opens on the first offered
// style. A list or an opening style the host got wrong is a setup error from createChart.
// lightweight-charts paints into canvases happy-dom cannot draw, so the 2D context is a recording
// stub; nothing here reads a pixel.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memoryChartStorage } from '../../src/storage'
import { CHART_STYLES, type ChartStyleId } from '../../src/widget/styles'
import type { ChartWidgetOptions } from '../../src/widget/options'

beforeAll(() => {
  const written: Record<PropertyKey, unknown> = {}
  const context = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_target, key) => {
      if (key in written) return written[key]
      if (key === 'measureText') return () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      if (key === 'canvas') return document.createElement('canvas')
      return () => undefined
    },
    set: (_target, key, value) => {
      written[key] = value
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement['getContext']
  // The renderer normalizes a color by reading it back from a computed style, which happy-dom does
  // not resolve to rgb(); the reading resolves a hex or named color the way a browser would.
  const NAMED: Record<string, string> = { white: 'rgb(255, 255, 255)', black: 'rgb(0, 0, 0)', transparent: 'rgba(0, 0, 0, 0)' }
  const rgbOf = (raw: string): string | null => {
    if (raw.startsWith('rgb')) return raw
    if (NAMED[raw]) return NAMED[raw]!
    const hex = raw.match(/^#([0-9a-f]{3,8})$/i)?.[1]
    if (!hex) return null
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return full.length === 8 ? 'rgba(' + n(0) + ', ' + n(2) + ', ' + n(4) + ', ' + n(6) / 255 + ')' : 'rgb(' + n(0) + ', ' + n(2) + ', ' + n(4) + ')'
  }
  const computed = window.getComputedStyle.bind(window)
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const style = computed(element, pseudo)
    const rgb = rgbOf((element as HTMLElement).style?.color ?? '')
    return rgb ? new Proxy(style, { get: (target, key) => (key === 'color' ? rgb : Reflect.get(target, key)) }) : style
  }) as typeof window.getComputedStyle
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})

const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100.5, v: 10 })
const datafeed: ChartDatafeed = {
  config: async () => ({ resolutions: ['1m', '5m'] }) as never,
  search: async () => ({ items: [], total: 0 }) as never,
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m', '5m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 20 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }) as never,
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.dispose()
  document.body.replaceChildren()
})

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', ...options })
  mounted.push(widget)
  return { widget, container }
}

const styleCommands = (widget: ReturnType<typeof createChart>): string[] =>
  widget.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.style.'))

const pickerRows = (container: HTMLElement): string[] => {
  container.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!.click()
  return [...document.querySelectorAll('.qc-style-menu [role="menuitemradio"]')].map((row) => row.textContent ?? '')
}

describe('the styles a widget offers', () => {
  it('are every style when the host names none: seven commands and the picker grouped by family', () => {
    const { widget, container } = mount()
    expect(styleCommands(widget)).toEqual(CHART_STYLES.map((style) => `chart.style.${style}`))
    expect(widget.activeChart().style()).toBe('candles')
    expect(pickerRows(container)).toEqual(['Bars', 'Candles', 'Hollow candles', 'Line', 'Step line', 'Area', 'Baseline'])
  })

  it('are the list the host names, in its order: the picker, the commands and the opening style follow it', () => {
    const { widget, container } = mount({ styles: ['area', 'candles', 'line'], style: 'line' })
    expect(styleCommands(widget)).toEqual(['chart.style.area', 'chart.style.candles', 'chart.style.line'])
    expect(widget.activeChart().style()).toBe('line')
    expect(pickerRows(container)).toEqual(['Area', 'Candles', 'Line'])
    expect(widget.commands.execute('chart.style.bars').kind).toBe('unknown')
    expect(widget.activeChart().style()).toBe('line')
  })

  it('leave no picker for a single style, and the chart opens on it', () => {
    const { widget, container } = mount({ styles: ['baseline'] })
    expect(container.querySelector('button[aria-label^="Chart style"]')).toBeNull()
    expect(widget.activeChart().style()).toBe('baseline')
    expect(styleCommands(widget)).toEqual(['chart.style.baseline'])
  })

  it('stand apart from ui.topBar.styles, which hides the picker and leaves the offered commands', () => {
    const { widget, container } = mount({ styles: ['candles', 'line'], ui: { topBar: { styles: false } } })
    expect(container.querySelector('button[aria-label^="Chart style"]')).toBeNull()
    expect(widget.commands.execute('chart.style.line').kind).toBe('ok')
    expect(widget.activeChart().style()).toBe('line')
    expect(widget.commands.execute('chart.style.area').kind).toBe('unknown')
  })

  it('make setStyle ignore a style the widget does not offer', () => {
    const { widget } = mount({ styles: ['line', 'area'] })
    const chart = widget.activeChart()
    chart.setStyle('candles')
    expect(chart.style()).toBe('line')
    chart.setStyle('area')
    expect(chart.style()).toBe('area')
  })

  it('open a saved layout that names a style left out on the first offered style, and restore the rest', () => {
    const source = mount()
    source.widget.activeChart().setStyle('bars')
    source.widget.activeChart().setTimeframe('5m')
    const saved = source.widget.layout.serialize().content
    const { widget } = mount({ styles: ['area', 'line'], style: 'line' })
    widget.layout.restore(saved)
    expect(widget.activeChart().style()).toBe('area')
    expect(widget.activeChart().timeframe()).toBe('5m')
  })

  it('open a stored or preferred style that is left out on the first offered style', () => {
    const stored = mount({ styles: ['line', 'area'], storage: memoryChartStorage({ 'quickcharts.style.v1': 'bars' }) })
    expect(stored.widget.activeChart().style()).toBe('line')
    const preferred = mount({ styles: ['area', 'line'], preferences: { style: 'hollow' } })
    expect(preferred.widget.activeChart().style()).toBe('area')
    const kept = mount({ styles: ['line', 'area'], storage: memoryChartStorage({ 'quickcharts.style.v1': 'area' }) })
    expect(kept.widget.activeChart().style()).toBe('area')
  })
})

describe('a styles option the host got wrong', () => {
  const refuse = (options: Partial<ChartWidgetOptions>, message: string): void => {
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => mounted.push(createChart({ container, datafeed, ...options }))).toThrow(message)
    expect(container.childElementCount).toBe(0)
  }

  it('is an empty list', () => refuse({ styles: [] }, 'styles must name at least one chart style'))
  it('is an id outside the vocabulary', () => refuse({ styles: ['candles', 'renko' as ChartStyleId] }, 'styles names "renko", which is not a chart style'))
  it('is a repeated id', () => refuse({ styles: ['line', 'area', 'line'] }, 'styles names "line" more than once'))
  it('is an opening style outside the list', () => refuse({ styles: ['line', 'area'], style: 'candles' }, 'style "candles" is not one of the offered styles: line, area'))
  it('is an opening style outside the vocabulary', () => refuse({ style: 'renko' as ChartStyleId }, 'style "renko" is not one of the offered styles'))
})
