// A chart and series pair the drawing layer can be attached to without a renderer: a linear time
// scale (one bar per `spacing` pixels from the left edge), a linear price scale over the pane, and
// the handful of renderer calls the layer and the drawing seam make. Every conversion is exact
// arithmetic, so a test can say where a press lands in price and time.
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'

export interface FakeChartOptions {
  bars?: number
  spacing?: number
  width?: number
  height?: number
  /** The price at the top and the bottom of the pane. */
  top?: number
  bottom?: number
  startTime?: number
  step?: number
}

export interface FakeChart {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** Every `applyOptions` call the layer made, so a test can see the pan lock move. */
  applied: Record<string, unknown>[]
  /** The last visible range a zoom set. */
  visibleRange: { from: number; to: number } | null
  /** The pixel a time sits at, and the pixel a price sits at. */
  xOf(time: number): number
  yOf(price: number): number
  priceAt(y: number): number
  timeAt(x: number): number
}

export function fakeChart(options: FakeChartOptions = {}): FakeChart {
  const bars = options.bars ?? 100
  const spacing = options.spacing ?? 10
  const width = options.width ?? bars * spacing
  const height = options.height ?? 400
  const top = options.top ?? 200
  const bottom = options.bottom ?? 100
  const startTime = options.startTime ?? 1_000_000
  const step = options.step ?? 60
  const data = Array.from({ length: bars }, (_, i) => {
    const close = 150 + Math.sin(i / 7) * 20
    return { time: (startTime + i * step) as Time, open: close - 2, high: close + 5, low: close - 5, close }
  })
  const applied: Record<string, unknown>[] = []
  const state: FakeChart = {
    chart: null as unknown as IChartApi,
    series: null as unknown as ISeriesApi<SeriesType>,
    applied,
    visibleRange: null,
    xOf: (time) => ((time - startTime) / step) * spacing,
    yOf: (price) => ((top - price) / (top - bottom)) * height,
    priceAt: (y) => top - (y / height) * (top - bottom),
    timeAt: (x) => startTime + (x / spacing) * step,
  }
  const timeScale = {
    width: () => width,
    options: () => ({ barSpacing: spacing }),
    coordinateToLogical: (x: number) => x / spacing,
    logicalToCoordinate: (l: number) => (Number.isInteger(l) && l >= 0 && l < bars ? l * spacing : Number.isInteger(l) ? l * spacing : 0),
    timeToCoordinate: (t: Time) => {
      const i = (Number(t) - startTime) / step
      return Number.isInteger(i) && i >= 0 && i < bars ? i * spacing : null
    },
    coordinateToTime: (x: number) => {
      const l = x / spacing
      return Number.isInteger(l) && l >= 0 && l < bars ? ((startTime + l * step) as Time) : null
    },
    setVisibleRange: (range: { from: Time; to: Time }) => {
      state.visibleRange = { from: Number(range.from), to: Number(range.to) }
    },
    scrollPosition: () => 0,
    scrollToPosition: () => undefined,
    applyOptions: () => undefined,
  }
  state.chart = {
    timeScale: () => timeScale,
    paneSize: () => ({ width, height }),
    applyOptions: (o: Record<string, unknown>) => {
      applied.push(o)
    },
    priceScale: () => ({ width: () => 0, applyOptions: () => undefined }),
    panes: () => [],
    remove: () => undefined,
  } as unknown as IChartApi
  state.series = {
    data: () => data,
    priceToCoordinate: (p: number) => state.yOf(p),
    coordinateToPrice: (y: number) => state.priceAt(y),
    dataByIndex: (i: number) => data[Math.max(0, Math.min(bars - 1, i))] ?? null,
    attachPrimitive: () => undefined,
    detachPrimitive: () => undefined,
    applyOptions: () => undefined,
  } as unknown as ISeriesApi<SeriesType>
  return state
}

/** A pointer event at a pane-local point. The container reports a zero rect in the test document,
 *  so client and local coordinates coincide. */
export function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, ...init })
}

/** One press-drag-release from a to b, through the real handlers. */
export function drag(target: HTMLElement, from: [number, number], to: [number, number], init: PointerEventInit = {}): void {
  target.dispatchEvent(pointer('pointerdown', from[0], from[1], init))
  window.dispatchEvent(pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, init))
  window.dispatchEvent(pointer('pointermove', to[0], to[1], init))
  window.dispatchEvent(pointer('pointerup', to[0], to[1], init))
}

/** One click: press and release in place. */
export function click(target: HTMLElement, x: number, y: number, init: PointerEventInit = {}): void {
  target.dispatchEvent(pointer('pointerdown', x, y, init))
  window.dispatchEvent(pointer('pointerup', x, y, init))
}
