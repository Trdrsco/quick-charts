// The plus beside the crosshair's price label: painted in the renderer's top layer, the layer it
// paints the crosshair and its label in, at the crosshair's height, on the label's own rows, flush
// against the plot's edge, in the label's fill and ink; and nowhere while the setting, the crosshair
// or its label is off.
import { CrosshairMode, type ISeriesApi, type SeriesType } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { attachScalePlus, crosshairLabelHeight, hoverFill, labelFill, labelInk, scalePlusBitmapBox, type ScalePlusBox } from '../../src/widget/scalePlus'

interface Call {
  op: string
  args: unknown[]
  fill: string
  stroke: string
}

/** A 2D context that records what is drawn, with the paint each call was made in. */
function recordingContext(): { context: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 1 }
  const stack: (typeof state)[] = []
  const record = (op: string) => (...args: unknown[]) => void calls.push({ op, args, fill: state.fillStyle, stroke: state.strokeStyle })
  const context = {
    get fillStyle() { return state.fillStyle },
    set fillStyle(v: string) { state.fillStyle = v },
    get strokeStyle() { return state.strokeStyle },
    set strokeStyle(v: string) { state.strokeStyle = v },
    get lineWidth() { return state.lineWidth },
    set lineWidth(v: number) { state.lineWidth = v },
    save: () => void stack.push({ ...state }),
    restore: () => void Object.assign(state, stack.pop()),
    beginPath: record('beginPath'),
    roundRect: record('roundRect'),
    fill: record('fill'),
    arc: record('arc'),
    stroke: record('stroke'),
    fillRect: record('fillRect'),
  }
  return { context: context as unknown as CanvasRenderingContext2D, calls }
}

interface PaneViewLike {
  zOrder(): string
  renderer(): { draw(target: unknown): void }
}
interface PrimitiveLike {
  paneViews(): PaneViewLike[]
  hitTest(x: number, y: number): { cursorStyle?: string } | null
  attached?(param: { requestUpdate: () => void }): void
}

function fakeSeries() {
  const primitives: PrimitiveLike[] = []
  const api = {
    attachPrimitive: (p: PrimitiveLike) => {
      primitives.push(p)
      p.attached?.({ requestUpdate: () => undefined })
    },
    detachPrimitive: (p: PrimitiveLike) => {
      const at = primitives.indexOf(p)
      if (at >= 0) primitives.splice(at, 1)
    },
  }
  return { api: api as unknown as ISeriesApi<SeriesType>, primitives }
}

const LABEL = '#3d3d3d'

function setup(options: { side?: 'left' | 'right'; enabled?: boolean; look?: Record<string, unknown> } = {}) {
  const look: Record<string, unknown> = options.look ?? {
    crosshair: { mode: CrosshairMode.Normal, horzLine: { labelVisible: true, labelBackgroundColor: LABEL } },
    layout: { fontSize: 12 },
  }
  const series = fakeSeries()
  let enabled = options.enabled ?? true
  const placed: (ScalePlusBox | null)[] = []
  const layer = attachScalePlus({
    chart: { options: () => look },
    series: () => series.api,
    enabled: () => enabled,
    side: () => options.side ?? 'right',
    placed: (box) => void placed.push(box),
  })
  /** One paint of the renderer's top layer, on a pane of the given size. */
  const paint = (pane = { width: 1122, height: 891 }, ratio = 1) => {
    const { context, calls } = recordingContext()
    const view = series.primitives[0]!.paneViews()[0]!
    view.renderer().draw({
      useBitmapCoordinateSpace: <T>(f: (scope: unknown) => T): T =>
        f({ context, bitmapSize: { width: pane.width * ratio, height: pane.height * ratio }, mediaSize: pane, horizontalPixelRatio: ratio, verticalPixelRatio: ratio }),
    })
    return calls
  }
  return { layer, series, placed, paint, look, setEnabled: (on: boolean) => (enabled = on) }
}

describe('the plus beside the crosshair label', () => {
  it('sits on the label rows the renderer gives a crosshair at a height, square and flush against the plot edge', () => {
    // The reference's 12px label at a pointer 398px down: rows 388 to 408, the plus 21px across.
    expect(crosshairLabelHeight(12)).toBe(21)
    expect(scalePlusBitmapBox(398, { width: 1122 }, 'right', 12, { horizontal: 1, vertical: 1 })).toEqual({ left: 1101, top: 388, width: 21, height: 21 })
    expect(scalePlusBitmapBox(398, { width: 1122 }, 'left', 12, { horizontal: 1, vertical: 1 })).toEqual({ left: 0, top: 388, width: 21, height: 21 })
    // At twice the pixels the rows double and keep the crosshair line's parity.
    expect(scalePlusBitmapBox(398, { width: 2244 }, 'right', 12, { horizontal: 2, vertical: 2 })).toEqual({ left: 2202, top: 775, width: 42, height: 42 })
  })

  it('paints in the top layer, the one the renderer paints the crosshair and its label in, at the crosshair height', () => {
    const { layer, series, paint, placed } = setup()
    expect(series.primitives[0]!.paneViews()[0]!.zOrder()).toBe('top')
    layer.setPointer({ x: 822, y: 398 })
    const calls = paint()
    const box = calls.find((call) => call.op === 'roundRect')!
    expect(box.args).toEqual([1101, 388, 21, 21, [2, 0, 0, 2]])
    // The same paint reports the box it drew, which the hit target stands on.
    expect(placed.at(-1)).toEqual({ left: 1101, top: 388, width: 21, height: 21, y: 398 })
    expect(layer.box()).toEqual(placed.at(-1))
    // The next crosshair move is drawn by the next paint, and only by it.
    layer.setPointer({ x: 822, y: 421 })
    expect(placed.at(-1)!.y).toBe(398)
    paint()
    expect(placed.at(-1)).toEqual({ left: 1101, top: 411, width: 21, height: 21, y: 421 })
  })

  it('wears the label fill and draws a ringed plus in the label ink through its middle', () => {
    const { layer, paint } = setup()
    layer.setPointer({ x: 822, y: 398 })
    const calls = paint()
    const fill = calls.find((call) => call.op === 'fill')!
    expect(fill.fill).toBe('rgb(61, 61, 61)')
    const ring = calls.find((call) => call.op === 'arc')!
    expect(ring.args.slice(0, 3)).toEqual([1111.5, 398.5, 7.5])
    expect(calls.find((call) => call.op === 'stroke')!.stroke).toBe('white')
    // The plus: 7px across and 1px thick, crisp on the pixel grid through the middle pixel.
    expect(calls.filter((call) => call.op === 'fillRect').map((call) => [call.args, call.fill])).toEqual([
      [[1108, 398, 7, 1], 'white'],
      [[1111, 395, 1, 7], 'white'],
    ])
  })

  it('takes the hover fill under the pointer and names a pointer cursor to the renderer', () => {
    const { layer, series, paint } = setup()
    layer.setPointer({ x: 1110, y: 398 })
    expect(paint().find((call) => call.op === 'fill')!.fill).toBe('rgb(99, 99, 99)')
    expect(series.primitives[0]!.hitTest(1110, 398)).toMatchObject({ cursorStyle: 'pointer' })
    // The renderer asks with the pointer it is about to paint the plus under, whatever its height.
    expect(series.primitives[0]!.hitTest(1110, 440)).toMatchObject({ cursorStyle: 'pointer' })
    expect(series.primitives[0]!.hitTest(1090, 398)).toBeNull()
  })

  it('mirrors beside a left scale', () => {
    const { layer, paint } = setup({ side: 'left' })
    layer.setPointer({ x: 300, y: 398 })
    expect(paint().find((call) => call.op === 'roundRect')!.args).toEqual([0, 388, 21, 21, [0, 2, 2, 0]])
  })

  it('paints nothing while the setting is off, the crosshair is off the plot, or the renderer draws no label', () => {
    const { layer, paint, placed, setEnabled, look } = setup()
    layer.setPointer({ x: 822, y: 398 })
    setEnabled(false)
    expect(paint()).toEqual([])
    expect(placed.at(-1)).toBeNull()
    setEnabled(true)
    layer.setPointer(null)
    expect(paint()).toEqual([])
    expect(placed.at(-1)).toBeNull()
    layer.setPointer({ x: 822, y: 398 })
    ;(look.crosshair as { mode: number }).mode = CrosshairMode.Hidden
    expect(paint()).toEqual([])
    ;(look.crosshair as { mode: number }).mode = CrosshairMode.Normal
    ;(look.crosshair as { horzLine: { labelVisible: boolean } }).horzLine.labelVisible = false
    expect(paint()).toEqual([])
    expect(placed.at(-1)).toBeNull()
  })

  it('moves to the series a style switch puts in place, and leaves on teardown', () => {
    const first = fakeSeries()
    const second = fakeSeries()
    let current = first.api
    const placed: (ScalePlusBox | null)[] = []
    const layer = attachScalePlus({ chart: { options: () => ({}) }, series: () => current, enabled: () => true, side: () => 'right', placed: (box) => void placed.push(box) })
    expect(first.primitives).toHaveLength(1)
    // The chart's series accessor answers the new series once the switch is made.
    current = second.api
    layer.seriesChanged(first.api)
    expect(first.primitives).toHaveLength(0)
    expect(second.primitives).toHaveLength(1)
    layer.destroy()
    expect(second.primitives).toHaveLength(0)
    expect(placed.at(-1)).toBeNull()
  })

  it('reads its fill, ink and hover as the renderer reads the label colour', () => {
    expect(labelFill('#3d3d3d')).toBe('rgb(61, 61, 61)')
    expect(labelFill('rgba(61, 61, 61, 0.5)')).toBe('rgb(61, 61, 61)')
    expect(labelInk('#3d3d3d')).toBe('white')
    expect(labelInk('#dbdbdb')).toBe('black')
    expect(hoverFill('#3d3d3d')).toBe('rgb(99, 99, 99)')
    expect(hoverFill('#dbdbdb')).toBe('rgb(176, 176, 176)')
  })
})
