// A stand-in for the renderer's `createChart`, so one chart instance can be driven end to end
// under happy-dom, which has no canvas. It answers every renderer call the chart's planes make
// with the smallest honest value (an empty range, a zero coordinate, a 300px pane) and records
// what was asked of it: the series that exist, the data each holds, and the options it received.
// The enums and series markers stay the real module's; only `createChart` is replaced, so every
// module-scope table built from a renderer enum is the real one.
import type { IChartApi } from 'lightweight-charts'

/** What a vertical pixel reads as on every fake series, for a test that presses the plot at a level.
 *  Absent, no pixel reads as a price, which is what a renderer before its first paint answers. */
let readPrice: ((y: number) => number | null) | null = null
export function fakePriceAt(read: ((y: number) => number | null) | null): void {
  readPrice = read
}

export interface FakeSeries {
  kind: string
  options: Record<string, unknown>
  data: unknown[]
  paneIndex: number
  primitives: unknown[]
  priceLines: unknown[]
}

export interface FakeRenderer {
  chart: IChartApi
  series: FakeSeries[]
  /** The options the chart was created with. */
  created: Record<string, unknown>
  /** Every options object the chart itself was handed, in order. */
  chartOptions: Record<string, unknown>[]
  /** The visible logical range the chart reports; a test moves it and fires the subscribers. */
  logicalRange: { from: number; to: number } | null
  /** Every logical-range write, so tests can distinguish maintenance from viewer movement. */
  logicalWrites: { from: number; to: number }[]
  /** The visible timestamp range the renderer reports to date-range synchronization. */
  timeRange: { from: number; to: number } | null
  /** The renderer's current horizontal spacing. */
  barSpacing: number
  /** The scroll position: bars between the newest bar and the right edge. It rests at the right
   *  offset, and a write through the time scale moves it; a test reports the move with
   *  `fireLogicalRange`, as it does for the range itself. */
  scroll: number
  /** The main pane's plot size; zero until a test lays one out. */
  plotSize: { width: number; height: number }
  /** Reports the time scale as resized, the way a price scale growing a digit does. */
  fireSize(): void
  /** The width each price scale reports, so chrome that insets past one can be tested. */
  scaleWidths: { left: number; right: number }
  /** The options each price scale holds, as the chart wrote them; `autoScale` is whether it frames. */
  priceScaleOptions: Record<string, Record<string, unknown>>
  /** The price range each scale was set to by hand, which it then answers as its visible range. */
  priceRanges: Record<string, { from: number; to: number }>
  fireLogicalRange(): void
  fireTimeRange(): void
  paneHeights: Record<number, number>
  /** The primitives attached to each pane, such as a text watermark. */
  panePrimitives: Record<number, unknown[]>
  /** Every options object the time scale was handed after the chart was created, in order. */
  timeScaleOptions: Record<string, unknown>[]
  /** A crosshair report. Pass `x` when the surface under test reads the POINTER position rather
   *  than the bar the renderer snapped to, and `y` for its height (0 when absent). */
  fireCrosshair(time: number | null, x?: number, y?: number): void
  fireClick(time: number | null): void
  removed: boolean
}

/** The time axis's band below the plot, as the real renderer reports it on a default scale. */
const AXIS_HEIGHT = 30

const seriesKind = (type: unknown): string => {
  if (type && typeof type === 'object' && 'type' in type) return String((type as { type: unknown }).type)
  return String(type)
}

export function fakeRenderer(): FakeRenderer {
  const series: FakeSeries[] = []
  const chartOptions: Record<string, unknown>[] = []
  const logicalSubs = new Set<(range: unknown) => void>()
  const timeSubs = new Set<(range: unknown) => void>()
  const crosshairSubs = new Set<(param: unknown) => void>()
  const clickSubs = new Set<(param: unknown) => void>()
  const sizeSubs = new Set<() => void>()
  const chartElement = document.createElement('div')
  const state: FakeRenderer = {
    chart: null as unknown as IChartApi,
    series,
    created: {},
    chartOptions,
    logicalRange: null,
    logicalWrites: [],
    timeRange: null,
    barSpacing: 8,
    scroll: 4,
    plotSize: { width: 0, height: 0 },
    fireSize: () => {
      for (const cb of sizeSubs) cb()
    },
    scaleWidths: { left: 0, right: 0 },
    priceScaleOptions: {},
    priceRanges: {},
    fireLogicalRange: () => {
      for (const cb of logicalSubs) cb(state.logicalRange)
    },
    fireTimeRange: () => {
      for (const cb of timeSubs) cb(state.timeRange)
    },
    removed: false,
    paneHeights: {},
    panePrimitives: {},
    timeScaleOptions: [],
    fireCrosshair: (time, x, y) => {
      const point = x === undefined ? {} : { point: { x, y: y ?? 0 } }
      for (const cb of crosshairSubs) cb(time === null ? { ...point } : { time, ...point })
    },
    fireClick: (time) => {
      for (const cb of clickSubs) cb(time === null ? {} : { time })
    },
  }
  const seriesApis = new Map<object, FakeSeries>()
  const apiOf = new Map<FakeSeries, object>()
  const paneElements = new Map<number, HTMLElement>()
  /** Stand every pane at a new index, as the renderer's own reordering does: a pane takes its
   *  series, its height, its element and its primitives with it. `to` maps each old index to its new
   *  one. */
  const reorder = (to: (index: number) => number): void => {
    for (const item of series) item.paneIndex = to(item.paneIndex)
    const heights = Object.entries(state.paneHeights).map(([index, height]) => [to(Number(index)), height] as const)
    state.paneHeights = Object.fromEntries(heights)
    const elements = [...paneElements].map(([index, element]) => [to(index), element] as const)
    paneElements.clear()
    for (const [index, element] of elements) paneElements.set(index, element)
    const primitives = Object.entries(state.panePrimitives).map(([index, list]) => [to(Number(index)), list] as const)
    state.panePrimitives = Object.fromEntries(primitives)
  }
  const paneCount = (): number => Math.max(1, ...series.map((s) => s.paneIndex + 1))
  const makePane = (index: number) => ({
    paneIndex: () => index,
    moveTo: (target: number) => {
      if (target === index || target < 0 || target >= paneCount()) return
      reorder((at) => {
        if (at === index) return target
        if (index < target && at > index && at <= target) return at - 1
        if (target < index && at >= target && at < index) return at + 1
        return at
      })
    },
    getHeight: () => state.paneHeights[index] ?? 300,
    setHeight: (height: number) => { state.paneHeights[index] = height },
    getHTMLElement: () => {
      if (!paneElements.has(index)) paneElements.set(index, document.createElement('div'))
      return paneElements.get(index)!
    },
    getSeries: () => series.filter((s) => s.paneIndex === index).map((s) => apiOf.get(s)),
    attachPrimitive: (primitive: unknown) => void (state.panePrimitives[index] ??= []).push(primitive),
    detachPrimitive: (primitive: unknown) => {
      state.panePrimitives[index] = (state.panePrimitives[index] ?? []).filter((p) => p !== primitive)
    },
  })
  // One object per scale id, held for the renderer's lifetime: the real renderer answers the same
  // scale each time, so a test may replace a method on it and the chart sees the replacement.
  const priceScales = new Map<string, ReturnType<typeof makePriceScale>>()
  const priceScale = (id?: string) => {
    const key = id ?? 'right'
    let scale = priceScales.get(key)
    if (!scale) { scale = makePriceScale(id); priceScales.set(key, scale) }
    return scale
  }
  const makePriceScale = (id?: string) => ({
    applyOptions: (next: Record<string, unknown>) => {
      const key = id ?? 'right'
      state.priceScaleOptions[key] = { ...state.priceScaleOptions[key], ...next }
      // A scale that frames itself again lets go of a range set by hand.
      if (next.autoScale === true) delete state.priceRanges[key]
    },
    options: () => ({ borderVisible: false, borderColor: '#000000', autoScale: true, ...state.priceScaleOptions[id ?? 'right'] }),
    // The framed price range: null until a series on this scale holds data, then the span of that
    // data, the way the real renderer answers once it has rendered a frame.
    // Setting a range by hand stops the scale framing itself, as the renderer does.
    setVisibleRange: (range: { from: number; to: number }) => {
      const key = id ?? 'right'
      state.priceScaleOptions[key] = { ...state.priceScaleOptions[key], autoScale: false }
      state.priceRanges[key] = { ...range }
    },
    getVisibleRange: () => {
      const held = state.priceRanges[id ?? 'right']
      if (held) return { ...held }
      const rows = series.filter((s) => s.options.priceScaleId !== 'volume').flatMap((s) => s.data as { high?: number; low?: number; value?: number; close?: number }[])
      const highs = rows.map((r) => r.high ?? r.value ?? r.close).filter((v): v is number => typeof v === 'number')
      const lows = rows.map((r) => r.low ?? r.value ?? r.close).filter((v): v is number => typeof v === 'number')
      return highs.length ? { from: Math.min(...lows), to: Math.max(...highs) } : null
    },
    // A REAL width per side, so chrome that has to stay inside the plot can be tested against a
    // scale appearing beside it. A test moves these; the real renderer measures its own labels.
    width: () => state.scaleWidths[id === 'left' ? 'left' : 'right'],
  })
  const timeScale = {
    subscribeVisibleLogicalRangeChange: (cb: (range: unknown) => void) => void logicalSubs.add(cb),
    unsubscribeVisibleLogicalRangeChange: (cb: (range: unknown) => void) => void logicalSubs.delete(cb),
    subscribeVisibleTimeRangeChange: (cb: (range: unknown) => void) => void timeSubs.add(cb),
    unsubscribeVisibleTimeRangeChange: (cb: (range: unknown) => void) => void timeSubs.delete(cb),
    subscribeSizeChange: (cb: () => void) => void sizeSubs.add(cb),
    unsubscribeSizeChange: (cb: () => void) => void sizeSubs.delete(cb),
    getVisibleLogicalRange: () => state.logicalRange,
    setVisibleLogicalRange: (range: { from: number; to: number }) => {
      state.logicalRange = range
      state.logicalWrites.push({ ...range })
      // The real renderer can publish a transient null while rebuilding its logical points, then
      // report the bounded range. Both notifications are synchronous to this fake's caller.
      for (const cb of logicalSubs) cb(null)
      for (const cb of logicalSubs) cb(state.logicalRange)
    },
    getVisibleRange: () => state.timeRange,
    setVisibleRange: (range: { from: number; to: number }) => {
      state.timeRange = { ...range }
      for (const cb of timeSubs) cb(state.timeRange)
    },
    fitContent: () => undefined,
    options: () => ({ barSpacing: state.barSpacing, rightOffset: 4 }),
    applyOptions: (options: { barSpacing?: number }) => {
      state.timeScaleOptions.push({ ...options })
      if (options.barSpacing !== undefined) state.barSpacing = options.barSpacing
    },
    scrollPosition: () => state.scroll,
    scrollToPosition: (position: number) => {
      state.scroll = position
    },
    scrollToRealTime: () => undefined,
    timeToCoordinate: (time: number) => {
      const index = timeScale.timeToIndex(time)
      return index === null || !state.logicalRange ? null : (index - state.logicalRange.from) * state.barSpacing
    },
    coordinateToTime: () => null,
    logicalToCoordinate: (logical: number) => (state.logicalRange ? (logical - state.logicalRange.from) * state.barSpacing : null),
    coordinateToLogical: () => null,
    // Lightweight Charts has one logical timeline shared by every series. Rebuild that effective
    // union from the currently painted rows so prepend tests exercise comparison-only timestamps
    // and duplicate timestamps the same way the real renderer does.
    timeToIndex: (time: number) => {
      const timeline = [...new Set(series.flatMap((s) => s.data.map((row) => Number((row as { time?: unknown }).time)).filter(Number.isFinite)))].sort((a, b) => a - b)
      const index = timeline.indexOf(Number(time))
      return index < 0 ? null : index
    },
    width: () => state.plotSize.width,
    // A REAL band, because chrome that has to stay clear of the time axis measures it here. Zero
    // would let a recipe that covers the axis pass.
    height: () => AXIS_HEIGHT,
  }
  const addSeries = (type: unknown, options: Record<string, unknown> = {}, paneIndex = 0) => {
    const record: FakeSeries = { kind: seriesKind(type), options: { ...options }, data: [], paneIndex, primitives: [], priceLines: [] }
    series.push(record)
    const api = {
      setData: (data: unknown[]) => {
        record.data = data
      },
      update: (point: unknown) => {
        record.data = [...record.data, point]
      },
      data: () => record.data,
      applyOptions: (next: Record<string, unknown>) => Object.assign(record.options, next),
      options: () => record.options,
      priceScale,
      attachPrimitive: (p: unknown) => void record.primitives.push(p),
      detachPrimitive: (p: unknown) => {
        record.primitives = record.primitives.filter((x) => x !== p)
      },
      createPriceLine: (opts: Record<string, unknown>) => {
        // The line's options as the renderer holds them: what it was created with and every write
        // since, merged.
        const held = { ...opts }
        const line = { applyOptions: (next: Record<string, unknown>) => void Object.assign(held, next), options: () => held }
        record.priceLines.push(line)
        return line
      },
      removePriceLine: (line: unknown) => {
        record.priceLines = record.priceLines.filter((x) => x !== line)
      },
      getPane: () => makePane(record.paneIndex),
      moveToPane: (index: number) => {
        record.paneIndex = index
      },
      priceToCoordinate: () => null,
      coordinateToPrice: (y: number) => readPrice?.(y) ?? null,
      dataByIndex: () => null,
      seriesType: () => record.kind,
      priceFormatter: () => ({ format: (n: number) => String(n) }),
      markers: () => [],
      setMarkers: () => undefined,
    }
    seriesApis.set(api, record)
    apiOf.set(record, api)
    return api
  }
  const chart = {
    addSeries,
    removeSeries: (api: object) => {
      const record = seriesApis.get(api)
      if (!record) return
      seriesApis.delete(api)
      series.splice(series.indexOf(record), 1)
    },
    priceScale,
    timeScale: () => timeScale,
    panes: () => Array.from({ length: Math.max(1, ...series.map((s) => s.paneIndex + 1)) }, (_, i) => makePane(i)),
    removePane: (index: number) => {
      for (const item of series) if (item.paneIndex > index) item.paneIndex--
      const maximum = Math.max(index, ...Object.keys(state.paneHeights).map(Number), ...paneElements.keys())
      paneElements.get(index)?.remove()
      for (let at = index; at <= maximum; at++) {
        const height = state.paneHeights[at + 1]
        if (height === undefined) delete state.paneHeights[at]
        else state.paneHeights[at] = height
        const element = paneElements.get(at + 1)
        if (element) paneElements.set(at, element)
        else paneElements.delete(at)
      }
    },
    addPane: () => makePane(1),
    swapPanes: (first: number, second: number) => {
      reorder((at) => (at === first ? second : at === second ? first : at))
    },
    subscribeCrosshairMove: (cb: (param: unknown) => void) => void crosshairSubs.add(cb),
    unsubscribeCrosshairMove: (cb: (param: unknown) => void) => void crosshairSubs.delete(cb),
    subscribeClick: (cb: (param: unknown) => void) => void clickSubs.add(cb),
    unsubscribeClick: (cb: (param: unknown) => void) => void clickSubs.delete(cb),
    subscribeDblClick: () => undefined,
    unsubscribeDblClick: () => undefined,
    applyOptions: (next: Record<string, unknown>) => void chartOptions.push(next),
    // What the chart was created with and every option it applied since, in order, the way the
    // renderer answers its own options.
    options: () => Object.assign({ layout: {}, timeScale: { barSpacing: 8 } }, state.created, ...chartOptions),
    setCrosshairPosition: () => undefined,
    clearCrosshairPosition: () => undefined,
    takeScreenshot: () => document.createElement('canvas'),
    chartElement: () => chartElement,
    paneSize: () => ({ ...state.plotSize }),
    resize: () => undefined,
    autoSizeActive: () => true,
    remove: () => {
      state.removed = true
    },
  }
  state.chart = chart as unknown as IChartApi
  return state
}

/** Every fake the mocked `createChart` handed out, oldest first. A test file installs the mock at
 *  its top level (`vi.mock` is hoisted only there) and reads the chart it just mounted from the
 *  end of this list:
 *
 *      vi.mock('lightweight-charts', async (importOriginal) => {
 *        const actual = await importOriginal<typeof import('lightweight-charts')>()
 *        const { createFakeChart } = await import('./rendererFake')
 *        return { ...actual, createChart: createFakeChart }
 *      })
 */
export const renderers: FakeRenderer[] = []

export function createFakeChart(_element?: HTMLElement, options?: Record<string, unknown>): IChartApi {
  const renderer = fakeRenderer()
  renderer.created = options ?? {}
  renderers.push(renderer)
  return renderer.chart
}

export const lastRenderer = (): FakeRenderer => {
  const last = renderers[renderers.length - 1]
  if (!last) throw new Error('no chart was created')
  return last
}
