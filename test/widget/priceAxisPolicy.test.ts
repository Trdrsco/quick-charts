// @vitest-environment happy-dom
// The price axis is either FRAMING itself from the bars on screen or HOLDING the bounds a viewer
// stretched it to, and which of the two it is belongs to the saved chart. That policy is not the
// scale mode: regular, logarithmic, percent and indexed each frame either way, and moving one never
// moves the other. What is deliberately absent is the pair of prices the axis currently spans: the
// exact bounds are this device's view of this market, and a saved chart states the choice, not the
// pixels.
//
// The renderer's own price scale is the truth read here, because a drag on the axis is what turns
// framing off and no event announces it.
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { parseChartContent } from '../../src/widget/saveLoad'

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

const mount = (arrangement = 's') => {
  const container = document.createElement('div')
  document.body.append(container)
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement } })
  mounted.push(widget)
  return widget
}

type Chart = ReturnType<ReturnType<typeof mount>['charts']>[number]

/** The policy a chart would save right now. */
const policyOf = (chart: Chart): string | undefined => parseChartContent(chart.saveLoad.serialize().content).priceAxis

/** This chart's own blob, as it would read had the viewer stretched the axis before saving: the
 *  policy alone, with no bounds. Stretching the axis is a renderer gesture and the policy is no
 *  public verb, so a saved chart is how a manual axis travels. */
const manualBlobOf = (chart: Chart): string =>
  JSON.stringify({ ...(JSON.parse(chart.saveLoad.serialize().content) as Record<string, unknown>), axis: 'manual' })

describe('the price-axis policy rides the saved chart', () => {
  it('carries a manual chart into a fresh auto chart, and an auto chart back over a manual one', () => {
    const widget = mount()
    const chart = widget.charts()[0]!
    expect(policyOf(chart)).toBe('auto')

    const manual = manualBlobOf(chart)
    const auto = chart.saveLoad.serialize().content

    chart.saveLoad.restore(manual)
    expect(policyOf(chart)).toBe('manual')

    // And the reverse: a blob saved while the axis framed itself starts it framing again.
    chart.saveLoad.restore(auto)
    expect(policyOf(chart)).toBe('auto')
  })

  it('states the policy and never the bounds', () => {
    const widget = mount()
    const chart = widget.charts()[0]!
    const saved = JSON.parse(chart.saveLoad.serialize().content) as Record<string, unknown>
    expect(saved.axis).toBe('auto')
    for (const key of Object.keys(saved)) expect(key).not.toMatch(/price|top|bottom|minValue|maxValue|bounds/i)
  })

  it('is independent of the scale mode in both directions', () => {
    const widget = mount()
    const chart = widget.charts()[0]!
    chart.saveLoad.restore(manualBlobOf(chart))

    for (const mode of ['log', 'percent', 'indexed', 'normal'] as const) {
      chart.setScaleMode(mode)
      expect(chart.scaleMode()).toBe(mode)
      // A mode is how the axis maps price to pixels; the policy is whether it re-frames at all.
      expect(policyOf(chart)).toBe('manual')
    }

    // Reset frames the view again; it is not a way to leave a logarithmic axis.
    chart.saveLoad.restore(manualBlobOf(chart))
    chart.setScaleMode('log')
    expect(policyOf(chart)).toBe('manual')
    chart.reset()
    expect(policyOf(chart)).toBe('auto')
    expect(chart.scaleMode()).toBe('log')
  })

  it('survives a style change, which moves presentation and not framing', () => {
    const widget = mount()
    const chart = widget.charts()[0]!
    chart.saveLoad.restore(manualBlobOf(chart))
    for (const style of ['bars', 'line', 'area', 'baseline', 'candles'] as const) {
      chart.setStyle(style)
      expect(policyOf(chart)).toBe('manual')
    }
  })

  it('makes the widget want a save when the policy moves, and not while a load is applying one', async () => {
    const widget = mount()
    const chart = widget.charts()[0]!
    let saveNeeded = 0
    widget.on('saveNeeded', () => {
      saveNeeded++
    })
    // Applying a saved chart is hydration, not an edit: it is the load that is authoritative, and
    // nothing about it should ask the host to save what it just read.
    chart.saveLoad.restore(manualBlobOf(chart))
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(saveNeeded).toBe(0)

    // A viewer moving the policy is an edit, and the host is told the chart is worth saving again.
    chart.reset()
    expect(policyOf(chart)).toBe('auto')
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(saveNeeded).toBeGreaterThan(0)
  })

  it('holds one policy per tile in a two-chart layout', () => {
    const widget = mount('2h')
    const [first, second] = widget.charts()
    expect(policyOf(first!)).toBe('auto')
    expect(policyOf(second!)).toBe('auto')

    first!.saveLoad.restore(manualBlobOf(first!))
    expect(policyOf(first!)).toBe('manual')
    // The tile beside it was not stretched and is still framing itself.
    expect(policyOf(second!)).toBe('auto')

    second!.reset()
    expect(policyOf(first!)).toBe('manual')
    expect(policyOf(second!)).toBe('auto')
  })
})
