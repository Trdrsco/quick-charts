import type { IPrimitivePaneRenderer, IPrimitivePaneView, ISeriesPrimitiveAxisView, PrimitivePaneViewZOrder } from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface AxisLabelSource {
  coordinate(): number | null
  text(): string
  color(): string
  /** The ink its words are in: white unless given. */
  textColor?(): string
  visible(): boolean
}

/** A pill on the price/time axis (a drawing's level marker). */
export class AxisLabel implements ISeriesPrimitiveAxisView {
  private readonly _source: AxisLabelSource

  constructor(source: AxisLabelSource) {
    this._source = source
  }

  coordinate(): number {
    return this._source.coordinate() ?? -1_000_000
  }

  text(): string {
    return this._source.text()
  }

  textColor(): string {
    return this._source.textColor?.() ?? '#ffffff'
  }

  backColor(): string {
    return this._source.color()
  }

  visible(): boolean {
    return this._source.visible() && this._source.coordinate() !== null
  }
}

/** What a band on an axis spans: the coordinates of the points it runs between, along the axis,
 *  and its color; null where no band shows. */
export interface AxisBandSource {
  span(): { coordinates: readonly number[]; color: string } | null
}

/**
 * The band a selected drawing lays on an axis across the span of its points. On the price axis it
 * runs over the rows strictly between its outermost points' rows, or over the one row above them
 * where none stand between; on the time axis from its leftmost point's column through its
 * rightmost, at least one column wide. It spans the axis across, under the axis's words.
 */
export class AxisBandView implements IPrimitivePaneView, IPrimitivePaneRenderer {
  private readonly _source: AxisBandSource
  private readonly _axis: 'price' | 'time'

  constructor(source: AxisBandSource, axis: 'price' | 'time') {
    this._source = source
    this._axis = axis
  }

  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom'
  }

  renderer(): IPrimitivePaneRenderer {
    return this
  }

  draw(target: CanvasRenderingTarget2D): void {
    const span = this._source.span()
    if (!span || span.coordinates.length === 0) return
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      paintAxisBand(ctx, this._axis, span.coordinates, span.color, mediaSize)
    })
  }
}

/** Paint an axis band over a span of coordinates, in an axis box of a size. */
export function paintAxisBand(ctx: CanvasRenderingContext2D, axis: 'price' | 'time', coordinates: readonly number[], color: string, size: { width: number; height: number }): void {
  const low = Math.min(...coordinates)
  const high = Math.max(...coordinates)
  ctx.save()
  ctx.fillStyle = color
  if (axis === 'price') {
    const top = Math.round(low) + 1
    const bottom = Math.round(high) - 1
    if (bottom > top) ctx.fillRect(1, top, size.width, bottom - top)
    else ctx.fillRect(1, Math.round(high) - 1, size.width, 1)
  } else {
    const left = Math.floor(low)
    ctx.fillRect(left, 0, Math.max(1, Math.ceil(high) - left), size.height)
  }
  ctx.restore()
}
