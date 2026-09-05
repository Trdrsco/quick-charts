// A stand-in for the renderer's `createChart`, so one chart instance can be driven end to end
// under happy-dom, which has no canvas. It answers every renderer call the chart's planes make
// with the smallest honest value (an empty range, a zero coordinate, a 300px pane) and records
// what was asked of it: the series that exist, the data each holds, and the options it received.
// The enums and series markers stay the real module's; only `createChart` is replaced, so every
// module-scope table built from a renderer enum is the real one.
import type { IChartApi } from 'lightweight-charts'

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
  /** Every options object the chart itself was handed, in order. */
  chartOptions: Record<string, unknown>[]
  /** The visible logical range the chart reports; a test moves it and fires the subscribers. */
  logicalRange: { from: number; to: number } | null
  fireLogicalRange(): void
  removed: boolean
}

const seriesKind = (type: unknown): string => {
  if (type && typeof type === 'object' && 'type' in type) return String((type as { type: unknown }).type)
  return String(type)
}

export function fakeRenderer(): FakeRenderer {
  const series: FakeSeries[] = []
  const chartOptions: Record<string, unknown>[] = []
  const logicalSubs = new Set<(range: unknown) => void>()
  const timeSubs = new Set<(range: unknown) => void>()
  const state: FakeRenderer = {
    chart: null as unknown as IChartApi,
    series,
    chartOptions,
    logicalRange: null,
    fireLogicalRange: () => {
      for (const cb of logicalSubs) cb(state.logicalRange)
    },
    removed: false,
  }
  const seriesApis = new Map<object, FakeSeries>()
  const apiOf = new Map<FakeSeries, object>()
  const makePane = (index: number) => ({
    paneIndex: () => index,
    getHeight: () => 300,
    setHeight: () => undefined,
    getHTMLElement: () => document.createElement('div'),
    getSeries: () => series.filter((s) => s.paneIndex === index).map((s) => apiOf.get(s)),
  })
  const priceScale = () => ({
    applyOptions: () => undefined,
    options: () => ({ borderVisible: false, borderColor: '#000000' }),
    width: () => 0,
  })
  const timeScale = {
    subscribeVisibleLogicalRangeChange: (cb: (range: unknown) => void) => void logicalSubs.add(cb),
    unsubscribeVisibleLogicalRangeChange: (cb: (range: unknown) => void) => void logicalSubs.delete(cb),
    subscribeVisibleTimeRangeChange: (cb: (range: unknown) => void) => void timeSubs.add(cb),
    unsubscribeVisibleTimeRangeChange: (cb: (range: unknown) => void) => void timeSubs.delete(cb),
    subscribeSizeChange: () => undefined,
    unsubscribeSizeChange: () => undefined,
    getVisibleLogicalRange: () => state.logicalRange,
    setVisibleLogicalRange: (range: { from: number; to: number }) => {
      state.logicalRange = range
    },
    getVisibleRange: () => null,
    setVisibleRange: () => undefined,
    fitContent: () => undefined,
    options: () => ({ barSpacing: 8, rightOffset: 4 }),
    applyOptions: () => undefined,
    scrollPosition: () => 0,
    scrollToPosition: () => undefined,
    scrollToRealTime: () => undefined,
    timeToCoordinate: () => null,
    coordinateToTime: () => null,
    logicalToCoordinate: () => null,
    coordinateToLogical: () => null,
    timeToIndex: () => null,
    width: () => 0,
    height: () => 0,
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
      createPriceLine: (opts: unknown) => {
        const line = { applyOptions: () => undefined, options: () => opts }
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
      coordinateToPrice: () => null,
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
    removePane: () => undefined,
    addPane: () => makePane(1),
    subscribeCrosshairMove: () => undefined,
    unsubscribeCrosshairMove: () => undefined,
    subscribeClick: () => undefined,
    unsubscribeClick: () => undefined,
    subscribeDblClick: () => undefined,
    unsubscribeDblClick: () => undefined,
    applyOptions: (next: Record<string, unknown>) => void chartOptions.push(next),
    options: () => ({ layout: {}, timeScale: { barSpacing: 8 } }),
    setCrosshairPosition: () => undefined,
    clearCrosshairPosition: () => undefined,
    takeScreenshot: () => document.createElement('canvas'),
    chartElement: () => document.createElement('div'),
    paneSize: () => ({ width: 0, height: 0 }),
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

export function createFakeChart(): IChartApi {
  const renderer = fakeRenderer()
  renderers.push(renderer)
  return renderer.chart
}

export const lastRenderer = (): FakeRenderer => {
  const last = renderers[renderers.length - 1]
  if (!last) throw new Error('no chart was created')
  return last
}
