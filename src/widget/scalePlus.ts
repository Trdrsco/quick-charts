// The plus beside the crosshair's price label on the main price scale, painted by the renderer in
// the pass that paints the label it is joined to.
//
// A primitive on the main series draws it on the plot side of the scale's edge, at the crosshair's
// height: a square as tall as the label, flush against the plot's edge so only the scale's border
// stands between the two, in the label's own fill with the label's ink for its ringed plus. The
// renderer paints the crosshair, its label and this primitive's top layer from the one crosshair it
// holds, in one frame, so the plus and the label can never stand apart.
//
// The renderer keeps no label geometry for a primitive to read, so the label's rows are worked out
// here by the renderer's own rule: the scale's text size with the label's padding above and below,
// centred on the crosshair's pixel row. The fill and the ink come from the renderer's own options,
// the colour the chart hands it for the crosshair's label, so the plus wears whatever the label
// wears. Each draw reports the box it painted, which is where the chrome stands its hit target and
// where a press counts as a press of the plus.
import { CrosshairMode, type IPrimitivePaneRenderer, type IPrimitivePaneView, type ISeriesApi, type ISeriesPrimitive, type PrimitiveHoveredItem, type SeriesType, type Time } from 'lightweight-charts'
import { parseCssColor } from '../theme/color'

/** The plus's box in the main pane's own CSS pixels, and the crosshair's height it stands at. */
export interface ScalePlusBox {
  left: number
  top: number
  width: number
  height: number
  /** The crosshair's height on the pane: the label's middle. */
  y: number
}

/** The renderer's options the plus reads: the crosshair's mode and price label, and the scale's
 *  text size, as the renderer holds them. */
interface RendererLook {
  crosshair?: { mode?: number; horzLine?: { labelVisible?: boolean; labelBackgroundColor?: string } }
  layout?: { fontSize?: number }
}

export interface ScalePlusDeps {
  /** The renderer, whose live options say how it paints the crosshair's label. */
  chart: { options(): unknown }
  /** The main series, which carries the primitive. */
  series(): ISeriesApi<SeriesType>
  /** Whether the plus shows at all: the setting, and a menu for it to open. */
  enabled(): boolean
  /** The side of the plot the main price scale stands on. */
  side(): 'left' | 'right'
  /** Each draw's box, or null when the draw painted no plus. */
  placed(box: ScalePlusBox | null): void
}

export interface ScalePlusLayer {
  /** Where the pointer stands on the main pane, from its top left, or null while the crosshair is
   *  off the main pane's plot. Read by the next paint, the one that moves the crosshair there. */
  setPointer(point: { x: number; y: number } | null): void
  /** The box the last paint drew, or null when it drew none. */
  box(): ScalePlusBox | null
  /** Paint again: a setting the plus reads changed. */
  refresh(): void
  /** Move to the series a style switch put in the previous one's place. */
  seriesChanged(previous: ISeriesApi<SeriesType>): void
  destroy(): void
}

/** The crosshair label's height at a text size: the text and the renderer's padding above and below
 *  it, 21px at 12px. */
export const crosshairLabelHeight = (fontSize: number): number => fontSize + ((2 * 2.5) / 12) * fontSize + ((2 * 2) / 12) * fontSize

/** The plus's box in bitmap pixels, on the rows the renderer gives the crosshair's label at a height
 *  `y`, square at the label's height and flush against the plot's edge on the scale's side. */
export function scalePlusBitmapBox(
  y: number,
  pane: { width: number },
  side: 'left' | 'right',
  fontSize: number,
  ratio: { horizontal: number; vertical: number },
): { left: number; top: number; width: number; height: number } {
  const label = crosshairLabelHeight(fontSize)
  // The renderer's own rows: an even tick of the crosshair's line, the label's height matched to its
  // parity, and the middle on the crosshair's pixel row.
  const tick = Math.max(1, Math.floor(ratio.vertical))
  let height = Math.round(label * ratio.vertical)
  if (height % 2 !== tick % 2) height += 1
  const middle = Math.round(y * ratio.vertical) - Math.floor(ratio.vertical * 0.5)
  const top = Math.floor(middle + tick / 2 - height / 2)
  const width = Math.round(label * ratio.horizontal)
  return { left: side === 'right' ? pane.width - width : 0, top, width, height }
}

/** The glyph inside the box, measured on the 21px square a 12px label makes and scaled with it: a
 *  ring 1px wide at a radius of 7.5 and a plus 7px across, both through the box's middle. */
const GLYPH = { box: 21, ring: 7.5, arm: 3.5, stroke: 1 }
/** The corner radius on the plot side, the radius the renderer rounds its own labels by. */
const RADIUS = 2
/** How far the hover fill moves from the label's fill toward its ink. */
const HOVER = 0.2

/** The label's fill as the renderer paints it: the colour without its alpha. */
export function labelFill(color: string): string {
  const rgba = parseCssColor(color)
  return rgba ? `rgb(${rgba.r}, ${rgba.g}, ${rgba.b})` : color
}

/** The ink the renderer writes on a label of this fill: black on a light fill and white on a dark
 *  one, by the renderer's own grey weighting. */
export function labelInk(color: string): 'black' | 'white' {
  const rgba = parseCssColor(color)
  if (!rgba) return 'white'
  return 0.199 * rgba.r + 0.687 * rgba.g + 0.114 * rgba.b > 160 ? 'black' : 'white'
}

/** The plus's fill under the pointer: the label's fill a fifth of the way toward its ink. */
export function hoverFill(color: string): string {
  const rgba = parseCssColor(color)
  if (!rgba) return color
  const toward = labelInk(color) === 'black' ? 0 : 255
  const step = (channel: number): number => channel + Math.trunc((toward - channel) * HOVER)
  return `rgb(${step(rgba.r)}, ${step(rgba.g)}, ${step(rgba.b)})`
}

interface BitmapScope {
  context: CanvasRenderingContext2D
  bitmapSize: { width: number; height: number }
  horizontalPixelRatio: number
  verticalPixelRatio: number
}

export function attachScalePlus(deps: ScalePlusDeps): ScalePlusLayer {
  let disposed = false
  let requestUpdate: (() => void) | null = null
  let pointer: { x: number; y: number } | null = null
  let drawn: ScalePlusBox | null = null

  const paint = (scope: BitmapScope): ScalePlusBox | null => {
    const look = deps.chart.options() as RendererLook
    const label = look.crosshair?.horzLine
    if (disposed || pointer === null || !deps.enabled()) return null
    // Where the renderer draws no crosshair label, there is nothing to stand beside.
    if (look.crosshair?.mode === CrosshairMode.Hidden || label?.labelVisible === false || !label?.labelBackgroundColor) return null
    const { context: ctx, horizontalPixelRatio: h, verticalPixelRatio: v } = scope
    const side = deps.side()
    const fontSize = look.layout?.fontSize ?? 12
    const bitmap = scalePlusBitmapBox(pointer.y, { width: scope.bitmapSize.width }, side, fontSize, { horizontal: h, vertical: v })
    const box: ScalePlusBox = { left: bitmap.left / h, top: bitmap.top / v, width: bitmap.width / h, height: bitmap.height / v, y: pointer.y }
    // The plus stands on the pointer's own row, so the pointer is on it wherever it is in its column.
    const hovered = pointer.x >= box.left && pointer.x < box.left + box.width
    const color = label.labelBackgroundColor
    ctx.save()
    // Rounded on the plot side, square where it meets the label.
    const r = RADIUS * h
    ctx.fillStyle = hovered ? hoverFill(color) : labelFill(color)
    ctx.beginPath()
    ctx.roundRect(bitmap.left, bitmap.top, bitmap.width, bitmap.height, side === 'right' ? [r, 0, 0, r] : [0, r, r, 0])
    ctx.fill()
    // The ringed plus, centred, in the label's ink.
    const scale = bitmap.height / GLYPH.box
    const cx = bitmap.left + bitmap.width / 2
    const cy = bitmap.top + bitmap.height / 2
    const stroke = Math.max(1, Math.round(GLYPH.stroke * h))
    const arm = GLYPH.arm * scale
    const ink = labelInk(color)
    ctx.strokeStyle = ink
    ctx.fillStyle = ink
    ctx.lineWidth = stroke
    ctx.beginPath()
    ctx.arc(cx, cy, GLYPH.ring * scale, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillRect(Math.round(cx - arm), Math.round(cy - stroke / 2), Math.round(arm * 2), stroke)
    ctx.fillRect(Math.round(cx - stroke / 2), Math.round(cy - arm), stroke, Math.round(arm * 2))
    ctx.restore()
    return box
  }

  const renderer: IPrimitivePaneRenderer = {
    draw(target) {
      drawn = target.useBitmapCoordinateSpace((scope) => paint(scope as BitmapScope)) ?? null
      deps.placed(drawn)
    },
  }
  // The top layer is the one the renderer paints with the crosshair, every time the crosshair moves.
  const view: IPrimitivePaneView = { zOrder: () => 'top', renderer: () => renderer }
  const hit: PrimitiveHoveredItem = { cursorStyle: 'pointer', externalId: 'qc-scale-plus', zOrder: 'top' }
  const primitive: ISeriesPrimitive<Time> = {
    attached(param) {
      requestUpdate = param.requestUpdate
    },
    detached() {
      requestUpdate = null
    },
    paneViews: () => [view],
    // The renderer asks with the pointer the crosshair is moving to, before it paints the plus there:
    // the plus stands on the crosshair's own row, so a pointer in its column is on it.
    hitTest(x) {
      const box = drawn
      return box && x >= box.left && x < box.left + box.width ? hit : null
    },
  }
  deps.series().attachPrimitive(primitive)

  return {
    setPointer(point) {
      pointer = point
    },
    box: () => drawn,
    refresh() {
      requestUpdate?.()
    },
    seriesChanged(previous) {
      try {
        previous.detachPrimitive(primitive)
      } catch {
        /* the renderer already released the prior style series */
      }
      deps.series().attachPrimitive(primitive)
    },
    destroy() {
      if (disposed) return
      disposed = true
      try {
        deps.series().detachPrimitive(primitive)
      } catch {
        /* the renderer already released the visible series */
      }
      requestUpdate = null
      drawn = null
      deps.placed(null)
    },
  }
}
