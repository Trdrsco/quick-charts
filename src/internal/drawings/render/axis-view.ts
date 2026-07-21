import type { ISeriesPrimitiveAxisView } from 'lightweight-charts'

export interface AxisLabelSource {
  coordinate(): number | null
  text(): string
  color(): string
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
    return '#ffffff'
  }

  backColor(): string {
    return this._source.color()
  }

  visible(): boolean {
    return this._source.visible() && this._source.coordinate() !== null
  }
}
