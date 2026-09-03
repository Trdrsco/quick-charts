// @vitest-environment happy-dom
// A widget mounted the way a host mounts it, through createChart, with a layout of more than one
// chart. The layout builds its first charts synchronously inside its own construction, and every
// chart mounts the drawing toolbar during its own; the toolbar's sync switch exists only past one
// chart, so the count it reads has to be honest before the layout exists and follow the layout
// after: a chart added or removed through the layout api shows or hides the switch on the charts
// that remain. lightweight-charts paints into canvases happy-dom cannot draw, so the 2D context is
// a recording stub; nothing here reads a pixel.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'

beforeAll(() => {
  // Properties written are read back as written (the library normalizes a color by writing it to
  // fillStyle and reading it back); every method is a no-op with the shape its caller expects.
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
  // The library normalizes a color by reading it back from a computed style, which happy-dom does
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

const toolbars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-role="drawing-toolbar"]')]
const syncOf = (toolbar: HTMLElement) => toolbar.querySelector<HTMLButtonElement>('button[aria-label="Sync drawings across the layout"]')

describe('the drawing toolbar in a layout, mounted through createChart', () => {
  it('constructs with a two-chart layout and shows the sync switch on both charts', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2h' } })
    mounted.push(widget)
    expect(widget.charts()).toHaveLength(2)
    const rails = toolbars(container)
    expect(rails).toHaveLength(2)
    expect(rails.map((r) => syncOf(r) !== null)).toEqual([true, true])
  })

  it('shows no switch on one chart, and the switch follows charts added and removed through the layout', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' })
    mounted.push(widget)
    expect(toolbars(container)).toHaveLength(1)
    expect(syncOf(toolbars(container)[0]!)).toBeNull()
    widget.layout.setArrangement('2v')
    expect(widget.charts()).toHaveLength(2)
    expect(toolbars(container).map((r) => syncOf(r) !== null)).toEqual([true, true])
    widget.layout.setArrangement('s')
    expect(widget.charts()).toHaveLength(1)
    expect(toolbars(container)).toHaveLength(1)
    expect(syncOf(toolbars(container)[0]!)).toBeNull()
  })
})
