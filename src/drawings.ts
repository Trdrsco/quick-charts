// The widget's drawing layer: DrawingManager (state + pixels, from @trdrs/chart-drawings) mounted
// behind a framework-free pointer/keyboard binding and ChartStorage persistence. The package owns
// the model and this host owns the input, deliberately MINIMAL: fixed-anchor tools without text —
// press-drag-release or click…click placement, drag-to-move (rigid whole-bar translation),
// anchor-handle resize, select/deselect, Delete/Escape. Freehand strokes, multipoint runs, instant
// position tools and text editing need richer chrome and are refused loudly by armTool rather than
// half-supported. Persistence speaks the drawings package's shared store codec, so a store written
// here loads in any other host of that codec (and vice versa).
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import {
  DrawingManager,
  parseDrawingsStore,
  parseIntervalContext,
  restoreDrawings,
  serializeDrawingsStore,
  toolRegistry,
  viewportOf,
} from '@trdrs/chart-drawings'
import type { Anchor, IDrawing, SerializedDrawing, SourceBar } from '@trdrs/chart-drawings'
import type { ChartStorage } from './storage'
import { localStorageChartStorage } from './storage'
import type { FeedBar } from './datafeed'

/** Pixels of pointer travel that turn the opening press into a drag (vs a click…click placement). */
const PLACE_DRAG_PX = 6
/** Pixels of travel before a grab counts as a move (an unmoved grab mutates nothing). */
const MOVE_EPSILON_PX = 2
/** Grab radius around an anchor handle — generous, independent of the small visual dot. */
const HANDLE_GRAB_PX = 11

const DEFAULT_STORE_KEY = 'trdrs.chart.widget.drawings.v1'

let idSeq = 0
const nextId = () => `dww-${idSeq++}-${Date.now() % 1e9}`

export interface DrawingsEvents {
  /** The armed tool changed (null = cursor). Fired by armTool and by auto-disarm after placement. */
  onToolChange?: (type: string | null) => void
  /** The selection changed (null = nothing selected). */
  onSelectionChange?: (id: string | null) => void
}

export interface AttachDrawingsOptions {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** The chart's mount element — pointer events bind here, and it receives focus on interaction so
   *  Delete/Escape stay scoped to this widget instead of the whole page. */
  container: HTMLElement
  symbol: string
  /** Timeframe token ('5m', '1d', …) — drives per-interval drawing visibility. */
  timeframe?: string
  /** Where the store document lives. Defaults to the browser's localStorage. */
  storage?: ChartStorage
  /** Storage key for the store document. One key = one drawings surface. */
  storageKey?: string
  /** Bar reader for data-driven drawings (a restored anchored VWAP still computes). */
  bars?: () => readonly FeedBar[]
  events?: DrawingsEvents
}

/** The running drawing layer a host holds. */
export interface DrawingsHandle {
  /** Arm a registry tool for placement, or null for the cursor. Throws for a tool this minimal
   *  host cannot place faithfully (freehand/multipoint/instant placement, text-bearing tools). */
  armTool(type: string | null): void
  activeTool(): string | null
  hasSelection(): boolean
  deleteSelected(): void
  /** Remove every drawing for the CURRENT symbol (locked ones included — the host asked). */
  clearAll(): void
  /** Live drawings on the current symbol. */
  count(): number
  setSymbol(symbol: string): void
  setTimeframe(tf: string): void
  /** The symbol's smallest price move (tick-denominated readouts on measure-style drawings); null
   *  while the symbol is unresolved. */
  setTick(tick: number | null): void
  /** The symbol's price formatter: every drawing label, pill and readout writes prices through it.
   *  Null returns the layer to the drawings package's declared stand-in. */
  setPriceFormatter(format: ((price: number) => string) | null): void
  /** Serialize the current symbol's drawings (the persistence wire format). */
  export(): SerializedDrawing[]
  /** Replace the current symbol's drawings from serialized form. */
  restore(list: readonly SerializedDrawing[]): void
  destroy(): void
}

/** A tool this host can place: fixed anchors, no text session. Everything else needs chrome this
 *  minimal binding does not have, and refusing loudly beats a tool that half-works. */
export function placeableByWidget(type: string): boolean {
  const def = toolRegistry.get(type)
  return !!def && (def.placement ?? 'fixed') === 'fixed' && !def.hasText
}

interface Draft {
  drawing: IDrawing
  required: number
  placed: number
  downX: number
  downY: number
  /** The opening press is still undecided: release-in-place = click…click, travel = drag. */
  pendingDrag: boolean
}

interface Drag {
  mode: 'move' | 'anchor'
  drawing: IDrawing
  anchorIndex: number | null
  grabX: number
  grabY: number
  origPixels: ({ x: number; y: number } | null)[]
  /** Anchor bar indices at grab — a move translates every anchor by the SAME whole-bar count, so
   *  handles never wobble apart on independent per-anchor time rounding. */
  origLogicals: (number | null)[]
  moved: boolean
}

export function attachDrawings(options: AttachDrawingsOptions): DrawingsHandle {
  const { chart, series, container } = options
  const storage: ChartStorage = options.storage ?? localStorageChartStorage
  const storeKey = options.storageKey ?? DEFAULT_STORE_KEY
  const events = options.events ?? {}

  const manager = new DrawingManager()
  manager.attach(chart, series)
  manager.setIntervalContext(parseIntervalContext(options.timeframe ?? ''))

  // Data feed for data-driven drawings, memoized by (length, last bar time) so live ticks refresh
  // it without rebuilding the array on every paint.
  if (options.bars) {
    const read = options.bars
    let cacheKey = ''
    let cached: readonly SourceBar[] = []
    manager.setBarSource(() => {
      const bars = read()
      const key = `${bars.length}:${bars.length ? bars[bars.length - 1]!.t : ''}`
      if (key === cacheKey) return cached
      cached = bars.map((b) => ({ time: b.t as Time, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))
      cacheKey = key
      return cached
    })
  }

  // The store document: every symbol's serialized drawings. Hydrated once; the current symbol's
  // live objects sit in the manager and re-serialize into the document on persist.
  const doc: Record<string, SerializedDrawing[]> = parseDrawingsStore(storage.get(storeKey))
  let symbol = options.symbol
  let destroyed = false
  let armed: string | null = null
  let draft: Draft | null = null
  let drag: Drag | null = null

  const syncDoc = () => {
    const bucket = manager.export().filter((d) => d.id !== draft?.drawing.id)
    if (bucket.length) doc[symbol] = bucket
    else delete doc[symbol]
  }

  // Writes are debounced onto idle time (an image-bearing store stringifies megabytes — never do
  // that inside a pointer gesture) and flushed on pagehide/destroy so a scheduled write survives
  // the tab closing under it.
  let writePending = false
  const writeNow = () => {
    writePending = false
    syncDoc()
    storage.set(storeKey, serializeDrawingsStore(doc))
  }
  const persist = () => {
    if (writePending) return
    writePending = true
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => writePending && writeNow(), { timeout: 1000 })
    else setTimeout(() => writePending && writeNow(), 200)
  }
  const flush = () => {
    if (writePending) writeNow()
  }
  window.addEventListener('pagehide', flush)

  const importSymbol = (sym: string) => {
    for (const d of restoreDrawings(doc[sym] ?? [])) {
      try {
        manager.add(d)
      } catch {
        /* skip a drawing the series refuses */
      }
    }
  }
  importSymbol(symbol)

  const selectionChanged = () => events.onSelectionChange?.(manager.selected()?.id ?? null)
  const offs = [manager.on('drawing:selected', selectionChanged), manager.on('drawing:deselected', selectionChanged)]

  const setArmed = (type: string | null) => {
    if (armed === type) return
    armed = type
    // Pan/zoom freeze while a tool is armed: a drag must draw, not scroll the chart.
    chart.applyOptions({ handleScroll: !type, handleScale: !type })
    events.onToolChange?.(type)
  }

  const cancelDraft = () => {
    if (!draft) return
    manager.remove(draft.drawing.id)
    draft = null
  }

  const localXY = (e: PointerEvent | MouseEvent) => {
    const rect = container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const anchorAt = (x: number, y: number): Anchor | null => {
    const vp = viewportOf(chart, series)
    if (!vp) return null
    const price = vp.priceAt(y)
    const time = vp.timeAt(x)
    if (price == null || time == null) return null
    return { time, price }
  }

  /** Nearest anchor handle of the selected drawing within the grab radius. */
  const anchorHit = (drawing: IDrawing, x: number, y: number): number | null => {
    const vp = viewportOf(chart, series)
    if (!vp) return null
    let best: number | null = null
    let bestD = HANDLE_GRAB_PX
    for (const cp of drawing.getControlPoints(vp)) {
      const d = Math.hypot(cp.x - x, cp.y - y)
      if (d <= bestD) {
        bestD = d
        best = cp.index
      }
    }
    return best
  }

  const freezePan = (frozen: boolean) => chart.applyOptions({ handleScroll: !frozen, handleScale: !frozen })

  const startDrag = (mode: Drag['mode'], drawing: IDrawing, anchorIndex: number | null, x: number, y: number) => {
    const vp = viewportOf(chart, series)
    if (!vp) return
    drag = {
      mode,
      drawing,
      anchorIndex,
      grabX: x,
      grabY: y,
      origPixels: drawing.anchors.map((a) => drawing.anchorToPixel(a, vp)),
      origLogicals: drawing.anchors.map((a) => vp.logicalOf(a.time)),
      moved: false,
    }
    freezePan(true)
  }

  const completePlacement = (d: Draft) => {
    draft = null
    // Bar-capturing tools snapshot their range the moment placement completes, before persisting.
    if (toolRegistry.get(d.drawing.type)?.capturesBars) (d.drawing as unknown as { capture?: () => void }).capture?.()
    setArmed(null)
    manager.select(d.drawing.id)
    persist()
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    container.focus({ preventScroll: true })
    const { x, y } = localXY(e)

    // ---- Armed tool: place ----
    if (armed) {
      if (draft) return // mid-placement — the matching release advances the anchor
      const anchor = anchorAt(x, y)
      const def = toolRegistry.get(armed)
      if (!anchor || !def) return
      const required = Math.max(1, def.anchors || 1)
      const initial = required === 1 ? [{ ...anchor }] : [{ ...anchor }, { ...anchor }]
      const drawing = toolRegistry.create(armed, nextId(), initial)
      if (!drawing) return
      manager.add(drawing)
      if (required === 1) {
        completePlacement({ drawing, required, placed: 1, downX: x, downY: y, pendingDrag: false })
        return
      }
      draft = { drawing, required, placed: 1, downX: x, downY: y, pendingDrag: true }
      return
    }

    // ---- Cursor: select / move / resize ----
    const selected = manager.selected()
    if (selected && !selected.options.locked) {
      const ai = anchorHit(selected, x, y)
      if (ai !== null) {
        startDrag('anchor', selected, ai, x, y)
        return
      }
    }
    const hit = manager.hitTest({ x, y })
    if (hit) {
      if (!selected || selected.id !== hit.id) manager.select(hit.id)
      if (!hit.options.locked) startDrag('move', hit, null, x, y)
      return
    }
    manager.deselect()
  }

  const onMove = (e: PointerEvent) => {
    const { x, y } = localXY(e)

    if (drag) {
      if (!drag.moved && Math.abs(x - drag.grabX) + Math.abs(y - drag.grabY) > MOVE_EPSILON_PX) drag.moved = true
      const vp = viewportOf(chart, series)
      if (!vp) return
      if (drag.mode === 'anchor' && drag.anchorIndex !== null) {
        const anchor = anchorAt(x, y)
        if (anchor) drag.drawing.updateAnchor(drag.anchorIndex, anchor)
        return
      }
      // Rigid translation: one whole-bar shift for every anchor. Quantizing each anchor's pixel to
      // a time independently lets them round to different bars mid-drag — the "handles float off
      // the drawing" wobble.
      const dx = x - drag.grabX
      const dy = y - drag.grabY
      const ts = chart.timeScale()
      const la = ts.coordinateToLogical(0)
      const lb = ts.coordinateToLogical(120)
      const spacing = la !== null && lb !== null && lb !== la ? 120 / (lb - la) : null
      const dxBars = spacing ? Math.round(dx / spacing) : 0
      for (let i = 0; i < drag.origPixels.length; i++) {
        const op = drag.origPixels[i]
        if (!op) continue
        const ol = drag.origLogicals[i]
        const t = ol !== null && spacing !== null ? vp.timeOfLogical(ol + dxBars) : vp.timeAt(op.x + dx)
        const price = vp.priceAt(op.y + dy)
        if (t != null && price != null) drag.drawing.updateAnchor(i, { time: t, price })
      }
      return
    }

    if (draft) {
      const anchor = anchorAt(x, y)
      if (anchor) draft.drawing.updateAnchor(draft.drawing.anchors.length - 1, anchor)
    }
  }

  const onUp = (e: PointerEvent) => {
    if (drag) {
      const done = drag
      drag = null
      freezePan(!!armed) // an armed tool keeps the chart frozen; the cursor releases it
      if (done.moved) persist() // an unmoved grab changed nothing
      return
    }

    if (!draft) return
    const { x, y } = localXY(e)
    const anchor = anchorAt(x, y)
    const lastIndex = draft.drawing.anchors.length - 1
    if (anchor) draft.drawing.updateAnchor(lastIndex, anchor)
    const moved = Math.abs(x - draft.downX) + Math.abs(y - draft.downY) > PLACE_DRAG_PX
    if (draft.pendingDrag && !moved) {
      // The opening press released in place is a CLICK: keep tracking; the next click fixes the end.
      draft.pendingDrag = false
      return
    }
    draft.placed += 1
    if (draft.placed >= draft.required) {
      completePlacement(draft)
    } else {
      const next = anchor ?? draft.drawing.anchors[lastIndex]!
      draft.drawing.appendAnchor({ ...next })
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (!draft && !armed) return
      cancelDraft()
      setArmed(null)
      e.stopPropagation()
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = manager.selected()
      if (!sel) return
      manager.remove(sel.id)
      persist()
    }
  }

  // The press starts on the container, but move/release bind to the WINDOW: a drag that leaves the
  // chart keeps tracking, and the release is never lost outside (losing it would strand a frozen
  // pan and a half-moved drawing). Keys bind to the CONTAINER (focused on pointerdown), never the
  // window: an embedded widget must not swallow the host page's Delete/Escape. tabIndex -1 =
  // focusable by click/script only.
  if (!container.hasAttribute('tabindex')) container.tabIndex = -1
  container.style.outline = 'none'
  container.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  container.addEventListener('keydown', onKey)

  return {
    armTool(type: string | null) {
      if (destroyed) return
      if (type !== null) {
        const def = toolRegistry.get(type)
        if (!def) throw new Error(`drawings: unknown tool type '${type}'`)
        if (!placeableByWidget(type)) {
          throw new Error(`drawings: tool '${type}' is not placeable by this host (supported: fixed-anchor tools without text)`)
        }
      }
      cancelDraft()
      setArmed(type)
    },
    activeTool: () => armed,
    hasSelection: () => manager.selected() !== null,
    deleteSelected() {
      const sel = manager.selected()
      if (!sel) return
      manager.remove(sel.id)
      persist()
    },
    clearAll() {
      cancelDraft()
      manager.clear()
      persist()
    },
    count: () => manager.all().length,
    setSymbol(next: string) {
      if (destroyed || next === symbol) return
      cancelDraft()
      syncDoc()
      manager.deselect()
      manager.clear()
      symbol = next
      importSymbol(next)
      persist()
    },
    setTimeframe(tf: string) {
      manager.setIntervalContext(parseIntervalContext(tf))
    },
    setTick(tick: number | null) {
      manager.setTickSize(tick)
    },
    setPriceFormatter(format) {
      manager.setPriceFormatter(format)
    },
    export: () => manager.export().filter((d) => d.id !== draft?.drawing.id),
    restore(list: readonly SerializedDrawing[]) {
      cancelDraft()
      manager.clear()
      for (const d of restoreDrawings(list)) {
        try {
          manager.add(d)
        } catch {
          /* skip a drawing the series refuses */
        }
      }
      persist()
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      cancelDraft()
      flush()
      offs.forEach((off) => off())
      container.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      container.removeEventListener('keydown', onKey)
      window.removeEventListener('pagehide', flush)
      try {
        manager.detach()
      } catch {
        /* chart already removed */
      }
    },
  }
}
