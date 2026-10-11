// @vitest-environment happy-dom
// The Baseline style's base is a SCREEN level: half the pane's height, re-derived as the price scale
// moves under it. Two halves are proved here. The decision ("write, and what price") is pure and is
// tested exhaustively; the wiring is tested on a fake series and a fake frame clock, because
// happy-dom paints no pane and the library's coordinate conversions answer nothing there. The last
// block mounts a real widget to prove the transient level never reaches saved content.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { baselinePriceToWrite, baselineSplitCoordinate, createBaselineLevel, BASELINE_DRIFT_PX } from '../../src/widget/baselineLevel'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'

describe('where the split sits', () => {
  it('is half the pane height, and nothing at all in a pane with no height yet', () => {
    expect(baselineSplitCoordinate(400)).toBe(200)
    expect(baselineSplitCoordinate(301)).toBe(150.5)
    for (const height of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) expect(baselineSplitCoordinate(height), String(height)).toBeNull()
  })

  it('stands at the base level setting, as a percentage of the height from the foot, held to the pane', () => {
    expect(baselineSplitCoordinate(400, 25)).toBe(300)
    expect(baselineSplitCoordinate(400, 100)).toBe(0)
    expect(baselineSplitCoordinate(400, 140)).toBe(0)
    expect(baselineSplitCoordinate(400, -5)).toBe(400)
    expect(baselineSplitCoordinate(400, Number.NaN)).toBe(200)
    expect(baselinePriceToWrite({ height: 400, percent: 25, heldCoordinate: null, priceAt: (y) => 1000 - y })).toBe(700)
  })
})

describe('the write decision', () => {
  const priceAt = (coordinate: number): number => 1000 - coordinate

  it('takes the price under the half-height line when the series holds no level', () => {
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: null, priceAt })).toBe(800)
  })

  it('leaves a level already on its line alone, and rewrites one that has drifted half a pixel', () => {
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: 200, priceAt })).toBeNull()
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: 200 + BASELINE_DRIFT_PX / 2, priceAt })).toBeNull()
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: 200 - BASELINE_DRIFT_PX, priceAt })).toBe(800)
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: 260, priceAt })).toBe(800)
  })

  it('writes nothing when the pane has no height or the scale places no price', () => {
    expect(baselinePriceToWrite({ height: 0, heldCoordinate: null, priceAt })).toBeNull()
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: null, priceAt: () => null })).toBeNull()
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: null, priceAt: () => Number.NaN })).toBeNull()
    expect(baselinePriceToWrite({ height: 400, heldCoordinate: Number.NaN, priceAt })).toBe(800)
  })
})

/** A series that answers coordinates off one linear scale, the way a price scale does. */
function fakeSeries(scale: { top: number }) {
  const writes: number[] = []
  let held: { type: string; price: number } | undefined
  return {
    writes,
    held: () => held,
    api: {
      options: () => ({ baseValue: held }),
      priceToCoordinate: (price: number) => scale.top - price,
      coordinateToPrice: (coordinate: number) => scale.top - coordinate,
      applyOptions: (options: { baseValue: { type: 'price'; price: number } }) => {
        held = options.baseValue
        writes.push(options.baseValue.price)
      },
    },
  }
}

describe('following the style', () => {
  it('writes the price under half the pane height, and holds still while nothing moves', () => {
    const pane = { height: 400 }
    const series = fakeSeries({ top: 1000 })
    const frames: (() => void)[] = []
    const level = createBaselineLevel({ paneHeight: () => pane.height, frame: (tick) => frames.push(tick), cancel: () => undefined })
    level.follow(series.api as never)
    expect(series.writes).toEqual([800])
    expect(series.held()).toEqual({ type: 'price', price: 800 })
    frames.at(-1)!()
    expect(series.writes).toEqual([800])
  })

  it('re-derives after the scale moves and after the pane is resized', () => {
    const pane = { height: 400 }
    const scale = { top: 1000 }
    const series = fakeSeries(scale)
    const frames: (() => void)[] = []
    const level = createBaselineLevel({ paneHeight: () => pane.height, frame: (tick) => frames.push(tick), cancel: () => undefined })
    level.follow(series.api as never)
    // The visible range scrolled: the same screen line is over a different price now.
    scale.top = 1100
    frames.at(-1)!()
    expect(series.writes).toEqual([800, 900])
    // The same chart loaded into a shorter tile of a multi-chart layout.
    pane.height = 200
    frames.at(-1)!()
    expect(series.writes).toEqual([800, 900, 1000])
  })

  it('stops on a switch away from baseline and on disposal, and cancels its frame', () => {
    const series = fakeSeries({ top: 1000 })
    const frames: (() => void)[] = []
    const cancelled: number[] = []
    const level = createBaselineLevel({
      paneHeight: () => 400,
      frame: (tick) => {
        frames.push(tick)
        return frames.length
      },
      cancel: (handle) => cancelled.push(handle),
    })
    level.follow(series.api as never)
    const pending = frames.at(-1)!
    level.follow(null)
    expect(cancelled).toHaveLength(1)
    pending()
    expect(series.writes).toEqual([800])
    level.follow(series.api as never)
    level.destroy()
    frames.at(-1)!()
    level.sync()
    expect(series.writes).toEqual([800])
  })

  it('says nothing when the chart is torn down under it', () => {
    const series = fakeSeries({ top: 1000 })
    const level = createBaselineLevel({
      paneHeight: () => {
        throw new Error('chart removed')
      },
      frame: () => 1,
      cancel: () => undefined,
    })
    expect(() => level.follow(series.api as never)).not.toThrow()
    expect(series.writes).toEqual([])
    level.destroy()
  })
})

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

describe('the level a baseline chart is wearing', () => {
  it('is never saved: the serialized content carries the style and no base value', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' })
    mounted.push(widget)
    const chart = widget.activeChart()
    chart.setStyle('baseline')
    expect(chart.style()).toBe('baseline')
    const content = chart.saveLoad.serialize().content
    expect(content).not.toContain('baseValue')
    expect(JSON.parse(content).style).toBe('baseline')
    chart.setStyle('candles')
    expect(chart.saveLoad.serialize().content).not.toContain('baseValue')
  })
})
