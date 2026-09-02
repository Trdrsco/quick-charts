import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'

import type {
  DrawingEvent,
  DrawingEventCallback,
  DrawingEventType,
  IDrawing,
  Point,
  PriceFormatPort,
  SerializedDrawing,
  Viewport,
} from './types'
import type { AnyDrawing } from './drawing'
import { viewportOf } from './drawing'
import type { IntervalContext } from './visibility'
import type { BarSource } from './bars'

/**
 * The drawing model for one chart: an ordered store of drawings attached to a series, with
 * selection, top-most hit-testing, and serialization. Deliberately input-free — pointer and
 * keyboard handling live in the host app, which calls into this model. Attaching is what makes
 * a drawing render (drawings are series primitives).
 */
export class DrawingManager {
  private readonly _drawings = new Map<string, AnyDrawing>()
  private _order: string[] = [] // insertion order; later = painted and hit-tested on top
  private _selectedId: string | null = null
  private _chart: IChartApi | null = null
  private _series: ISeriesApi<SeriesType> | null = null
  private _intervalContext: IntervalContext = null
  private _allHidden = false
  private _barSource: BarSource | null = null
  private _tickSize: number | null = null
  private _priceFormat: PriceFormatPort | null = null
  private readonly _listeners = new Map<DrawingEventType, Set<DrawingEventCallback>>()

  /** Host bar feed, broadcast to every drawing (data-driven tools read it at paint time). */
  setBarSource(source: BarSource | null): void {
    this._barSource = source
    for (const drawing of this._drawings.values()) drawing.setBarSource(source)
  }

  /** The symbol's smallest price move, broadcast to every drawing (tick-denominated readouts). */
  setTickSize(tick: number | null): void {
    this._tickSize = tick
    for (const drawing of this._drawings.values()) drawing.setTickSize(tick)
  }

  /** The symbol's price formatter, broadcast to every drawing: the one port every label, pill
   *  and readout writes prices through. The host resolves it from the symbol's declared format. */
  setPriceFormatter(format: PriceFormatPort | null): void {
    this._priceFormat = format
    for (const drawing of this._drawings.values()) drawing.setPriceFormatter(format)
  }

  /** Broadcast the chart's interval so per-interval visibility rules apply. */
  setIntervalContext(context: IntervalContext): void {
    this._intervalContext = context
    for (const drawing of this._drawings.values()) drawing.setIntervalContext(context)
  }

  /** Chart-wide hide-all: every drawing (and its axis pills) disappears until toggled back. */
  setAllHidden(hidden: boolean): void {
    this._allHidden = hidden
    for (const drawing of this._drawings.values()) drawing.setGlobalHidden(hidden)
  }

  allHidden(): boolean {
    return this._allHidden
  }

  attach(chart: IChartApi, series: ISeriesApi<SeriesType>): void {
    if (this._chart) this.detach()
    this._chart = chart
    this._series = series
    for (const id of this._order) {
      const drawing = this._drawings.get(id)
      if (drawing) series.attachPrimitive(drawing)
    }
  }

  detach(): void {
    if (this._series) {
      for (const drawing of this._drawings.values()) {
        try {
          this._series.detachPrimitive(drawing)
        } catch {
          /* series already disposed */
        }
      }
    }
    this._chart = null
    this._series = null
  }

  isAttached(): boolean {
    return this._chart !== null
  }

  // ============ Store ============

  add(drawing: IDrawing): void {
    if (this._drawings.has(drawing.id)) return
    // Every IDrawing is a Drawing subclass (the registry only makes those); the store needs the
    // class type because attaching requires the series-primitive surface.
    const concrete = drawing as AnyDrawing
    concrete.setIntervalContext(this._intervalContext)
    concrete.setGlobalHidden(this._allHidden)
    concrete.setBarSource(this._barSource)
    concrete.setTickSize(this._tickSize)
    concrete.setPriceFormatter(this._priceFormat)
    this._drawings.set(concrete.id, concrete)
    this._order.push(concrete.id)
    this._series?.attachPrimitive(concrete)
    this.emit('drawing:added', { drawingId: concrete.id, drawing: concrete })
  }

  remove(id: string): void {
    const drawing = this._drawings.get(id)
    if (!drawing) return
    if (this._selectedId === id) this.deselect()
    if (this._series) {
      try {
        this._series.detachPrimitive(drawing)
      } catch {
        /* series already disposed */
      }
    }
    this._drawings.delete(id)
    this._order = this._order.filter((d) => d !== id)
    this.emit('drawing:removed', { drawingId: id })
  }

  get(id: string): IDrawing | undefined {
    return this._drawings.get(id)
  }

  /** All drawings in insertion order (bottom-most first). */
  all(): IDrawing[] {
    return this._order
      .map((id) => this._drawings.get(id))
      .filter((d): d is AnyDrawing => !!d)
  }

  clear(): void {
    this.deselect()
    if (this._series) {
      for (const drawing of this._drawings.values()) {
        try {
          this._series.detachPrimitive(drawing)
        } catch {
          /* series already disposed */
        }
      }
    }
    this._drawings.clear()
    this._order = []
    this.emit('drawing:cleared', {})
  }

  // ============ Selection ============

  select(id: string): void {
    const drawing = this._drawings.get(id)
    if (!drawing || this._selectedId === id) return
    if (this._selectedId) this._drawings.get(this._selectedId)?.setState('normal')
    drawing.setState('selected')
    this._selectedId = id
    this.emit('drawing:selected', { drawingId: id, drawing })
  }

  deselect(): void {
    if (!this._selectedId) return
    const id = this._selectedId
    this._drawings.get(id)?.setState('normal')
    this._selectedId = null
    this.emit('drawing:deselected', { drawingId: id })
  }

  selected(): IDrawing | null {
    return (this._selectedId && this._drawings.get(this._selectedId)) || null
  }

  // ============ Stacking ============

  /** Paint above everything else (and hit-test first, since hit order follows zIndex). */
  bringToFront(id: string): void {
    const drawing = this._drawings.get(id)
    if (!drawing) return
    const top = Math.max(0, ...this.all().map((d) => d.options.zIndex))
    drawing.updateOptions({ zIndex: top + 1 })
    this.restack()
  }

  sendToBack(id: string): void {
    const drawing = this._drawings.get(id)
    if (!drawing) return
    const bottom = Math.min(0, ...this.all().map((d) => d.options.zIndex))
    drawing.updateOptions({ zIndex: bottom - 1 })
    this.restack()
  }

  /** One step up in the paint order — swap with the neighbour directly above (no-op at the
   *  front). Every step RENUMBERS the whole stack to a dense 0..n-1 sequence: repeated
   *  to-front/to-back extremes otherwise drift zIndexes apart until "one step" and "adjacent
   *  number" stop meaning the same thing. */
  bringForward(id: string): void {
    this.stepStack(id, +1)
  }

  /** One step down in the paint order — swap with the neighbour directly below (no-op at the back). */
  sendBackward(id: string): void {
    this.stepStack(id, -1)
  }

  private stepStack(id: string, dir: 1 | -1): void {
    const sorted = this.visualOrder()
    const at = sorted.findIndex((d) => d.id === id)
    if (at < 0 || at + dir < 0 || at + dir >= sorted.length) return
    const other = sorted[at + dir]!
    sorted[at + dir] = sorted[at]!
    sorted[at] = other
    sorted.forEach((d, i) => {
      if (d.options.zIndex !== i) d.updateOptions({ zIndex: i })
    })
    this.restack()
  }

  /** Where a drawing sits in the paint order — menus disable the moves that cannot apply
   *  (a drawing already at the back has nothing below it to step behind). */
  stackPosition(id: string): { atFront: boolean; atBack: boolean } {
    const sorted = this.visualOrder()
    const at = sorted.findIndex((d) => d.id === id)
    return { atFront: at < 0 || at === sorted.length - 1, atBack: at <= 0 }
  }

  /** The paint order, bottom first: (zIndex, insertion) — the ONE sort restack keys off too. */
  private visualOrder(): AnyDrawing[] {
    return this._order
      .map((oid) => this._drawings.get(oid))
      .filter((d): d is AnyDrawing => !!d)
      .sort((a, b) => a.options.zIndex - b.options.zIndex)
  }

  /** Re-attach primitives so PAINT order follows (zIndex, insertion) — the chart paints
   *  primitives in attach order, so stacking changes must re-key that order. */
  private restack(): void {
    if (!this._series) return
    const sorted = this.visualOrder()
    for (const drawing of sorted) {
      try {
        this._series.detachPrimitive(drawing)
        this._series.attachPrimitive(drawing)
      } catch {
        /* series disposed mid-restack */
      }
    }
  }

  // ============ Hit testing ============

  getViewport(): Viewport | null {
    if (!this._chart || !this._series) return null
    return viewportOf(this._chart, this._series)
  }

  /**
   * Top-most visible drawing at a pane point: higher zIndex wins, then later insertion.
   * The selected drawing is tried first so a stacked selection stays grabbable.
   */
  hitTest(point: Point): IDrawing | null {
    const viewport = this.getViewport()
    if (!viewport) return null
    const sel = this.selected()
    if (sel && sel.isVisibleNow() && sel.testHit(point, viewport)) return sel
    const byTopmost = [...this._order].reverse().map((id) => this._drawings.get(id))
    byTopmost.sort((a, b) => (b?.options.zIndex ?? 0) - (a?.options.zIndex ?? 0))
    for (const drawing of byTopmost) {
      if (!drawing || !drawing.isVisibleNow()) continue
      if (drawing.testHit(point, viewport)) return drawing
    }
    return null
  }

  // ============ Serialization ============

  export(): SerializedDrawing[] {
    return this.all().map((d) => d.toJSON())
  }

  // ============ Events ============

  on(event: DrawingEventType, callback: DrawingEventCallback): () => void {
    let set = this._listeners.get(event)
    if (!set) {
      set = new Set()
      this._listeners.set(event, set)
    }
    set.add(callback)
    return () => {
      set.delete(callback)
    }
  }

  private emit(type: DrawingEventType, data: Omit<DrawingEvent, 'type'>): void {
    const listeners = this._listeners.get(type)
    if (!listeners) return
    const event: DrawingEvent = { type, ...data }
    for (const callback of listeners) callback(event)
  }
}
