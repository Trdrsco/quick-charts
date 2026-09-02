// The widget's drawing layer: DrawingManager (state + pixels, from @trdrs/chart-drawings) mounted
// behind a framework-free pointer/keyboard binding and the adapter's drawings resource. The
// package owns the model and this host owns the input, deliberately MINIMAL: fixed-anchor tools
// without text — press-drag-release or click…click placement, drag-to-move (rigid whole-bar
// translation), anchor-handle resize, select/deselect, Delete/Escape. Freehand strokes, multipoint
// runs, instant position tools and text editing need richer chrome and are refused loudly by
// armTool rather than half-supported.
//
// Persistence is ONE revisioned document per symbol in the host's drawings family: read once per
// symbol activation, written through at the revision it was read at, and never written over a
// newer revision (a refused write keeps the on-screen state, adopts the current ref for the next
// write, and reports the conflict). A document's content is the drawings package's serialized
// list, so a document written here loads in any other host of that codec. Without a resource
// port the layer keeps every symbol's drawings in memory for the page.
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { DrawingManager, magnetSnap, parseIntervalContext, restoreDrawings, toolRegistry, viewportOf } from '@trdrs/chart-drawings'
import type { Anchor, GlyphSourcePort, IDrawing, SerializedDrawing, SourceBar } from '@trdrs/chart-drawings'
import type { DrawingsBody, DrawingsMeta, ResourceRef, ResourceStore } from './resources'
import type { FeedBar } from './datafeed'
import { editRefused, toolAfterPlacement, type CursorMode, type MagnetMode } from './drawings/index'

/** What each cursor mode paints over the chart. The dot has no CSS keyword of its own, so it is
 *  a 5px ring drawn inline; the trailing keyword is the fallback while the data URI parses. */
const CURSOR_CSS: Record<CursorMode, string> = {
  cross: 'crosshair',
  arrow: 'default',
  dot: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Ccircle cx='5' cy='5' r='3.4' fill='none' stroke='%23e5e7eb' stroke-width='1.4'/%3E%3C/svg%3E") 5 5, crosshair`,
}

/** Pixels of pointer travel that turn the opening press into a drag (vs a click…click placement). */
const PLACE_DRAG_PX = 6
/** Pixels of travel before a grab counts as a move (an unmoved grab mutates nothing). */
const MOVE_EPSILON_PX = 2
/** Grab radius around an anchor handle — generous, independent of the small visual dot. */
const HANDLE_GRAB_PX = 11

let idSeq = 0
const nextId = () => `dww-${idSeq++}-${Date.now() % 1e9}`

export interface DrawingsEvents {
  /** The armed tool changed (null = cursor). Fired by armTool and by auto-disarm after placement. */
  onToolChange?: (type: string | null) => void
  /** The selection changed (null = nothing selected). */
  onSelectionChange?: (id: string | null) => void
  /** A write of a symbol's document was refused: the stored document moved on (`current` is the
   *  ref that stands now) or vanished (null). The layer keeps its on-screen drawings and writes at
   *  the adopted ref on the next edit; the host decides what to tell the trader. */
  onSaveConflict?: (info: { symbol: string; current: ResourceRef | null }) => void
}

/** The standing workflow choices this layer CONSULTS. It owns none of them: a host holds them in
 *  its `DrawingPreferences` record and the models on `quickcharts/drawings` decide what each
 *  control does to them, so a rail and this layer cannot disagree about what "weak magnet" or
 *  "lock all" means. The layer reads them at the moment each one matters, which is why this is a
 *  getter rather than a set of setters: there is no second copy to keep in step.
 *
 *  Drawing VISIBILITY is deliberately not here. Blanking is `setAllHidden` on the model, the eye
 *  that drives it reaches indicators as well, and neither belongs to a minimal placement binding;
 *  it arrives when this layer becomes the full drawing surface. */
export interface DrawingsWorkflow {
  /** How hard an anchor pulls to a bar's OHLC values while it is placed or dragged. */
  magnet: MagnetMode
  /** The rail's lock-all mode: editing is suspended across the layer, new drawings included,
   *  without touching any drawing's own flag. */
  allLocked: boolean
  /** A placed tool stays armed for the next drawing. */
  stayInDrawingMode: boolean
  /** The pointer glyph over the chart. */
  cursor: CursorMode
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
  /** Where a symbol's drawings document lives: the adapter's drawings family for that scope.
   *  Absent, the layer keeps its documents in memory for the page. */
  resources?: (scope: { symbol: string }) => ResourceStore<DrawingsMeta, DrawingsBody>
  /** Bar reader for data-driven drawings (a restored anchored VWAP still computes). */
  bars?: () => readonly FeedBar[]
  /** Where glyph artwork comes from, from the host's drawing asset port. Per layer, so two charts
   *  in one document may be handed different asset sets. */
  glyphSource?: GlyphSourcePort
  /** The standing workflow choices, read live. Absent, the layer runs on the defaults: no magnet,
   *  nothing locked, a placed tool released, a crosshair. */
  workflow?: () => DrawingsWorkflow
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
  const events = options.events ?? {}

  const manager = new DrawingManager()
  if (options.glyphSource) manager.setGlyphSource(options.glyphSource)
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

  // The session cache: every symbol's serialized drawings, so switching away and back never
  // refetches. The current symbol's live objects sit in the manager and re-serialize into the
  // cache on persist.
  const doc: Record<string, SerializedDrawing[]> = {}
  let symbol = options.symbol
  let destroyed = false
  let armed: string | null = null
  let draft: Draft | null = null
  let drag: Drag | null = null
  // The four workflow inputs. They are HELD here and applied by the pointer path; the policies that
  // decide what a control does to them live on quickcharts/drawings, so a host driving its own rail
  // and this layer cannot disagree about what "weak magnet" or "lock all" means.
  const DEFAULT_WORKFLOW: DrawingsWorkflow = { magnet: 'off', allLocked: false, stayInDrawingMode: false, cursor: 'cross' }
  const workflow = (): DrawingsWorkflow => options.workflow?.() ?? DEFAULT_WORKFLOW

  const syncDoc = () => {
    const bucket = manager.export().filter((d) => d.id !== draft?.drawing.id)
    if (bucket.length) doc[symbol] = bucket
    else delete doc[symbol]
  }

  // ── The drawings resource. `refs` holds the ref each symbol's stored document was last seen at
  // (null = known absent); `touched` names the symbols the trader edited this session, so a
  // hydration that lands after an edit never replaces in-hand work; `epoch` drops a hydration that
  // lands for a symbol switched away from. Writes for one layer run in series, so two edits can
  // never race each other into a conflict of the layer's own making.
  const storeFor = options.resources ? (sym: string) => options.resources!({ symbol: sym }) : null
  const refs = new Map<string, ResourceRef | null>()
  const touched = new Set<string>()
  let epoch = 0
  let writeChain: Promise<void> = Promise.resolve()
  const parseList = (content: string): SerializedDrawing[] => {
    try {
      const parsed: unknown = JSON.parse(content)
      return Array.isArray(parsed) ? (parsed as SerializedDrawing[]) : []
    } catch {
      return []
    }
  }

  const importSymbol = (sym: string) => {
    for (const d of restoreDrawings(doc[sym] ?? [])) {
      try {
        manager.add(d)
      } catch {
        /* skip a drawing the series refuses */
      }
    }
  }

  /** Write the cache's document for one symbol at the ref it is held at: an update at that ref, a
   *  create when none is stored, a remove when the document emptied. A refused write adopts the
   *  current ref and reports; a transport failure leaves the cache as the truth for the next edit. */
  const upload = (sym: string): void => {
    if (!storeFor) return
    const store = storeFor(sym)
    const list = doc[sym] ?? []
    writeChain = writeChain
      .then(async () => {
        const ref = refs.get(sym)
        if (ref === undefined) return // not hydrated yet: the hydration that lands uploads a touched symbol
        if (list.length === 0) {
          if (!ref) return
          const gone = await store.remove(ref)
          if (gone.kind === 'ok') refs.set(sym, null)
          else if (gone.kind === 'conflict') {
            refs.set(sym, gone.current)
            events.onSaveConflict?.({ symbol: sym, current: gone.current })
          } else refs.set(sym, null)
          return
        }
        const body: DrawingsBody = { content: JSON.stringify(list) }
        const outcome = ref ? await store.update(ref, body) : await store.create(body)
        if (outcome.kind === 'ok') refs.set(sym, outcome.ref)
        else if (outcome.kind === 'conflict') {
          refs.set(sym, outcome.current)
          events.onSaveConflict?.({ symbol: sym, current: outcome.current })
        } else {
          refs.set(sym, null)
          events.onSaveConflict?.({ symbol: sym, current: null })
        }
      })
      .catch(() => {
        /* transport failure: the cache holds the truth and the next edit retries */
      })
  }

  /** Read a symbol's stored document once. The stored copy replaces the cache (and the screen, when
   *  the symbol is still up) unless the trader edited the symbol meanwhile, in which case the
   *  in-hand work stays and goes up at the ref just learned. */
  const hydrate = (sym: string): void => {
    if (!storeFor || refs.has(sym)) return
    const store = storeFor(sym)
    const myEpoch = epoch
    void (async () => {
      try {
        const row = (await store.list())[0]
        const found = row ? await store.load(row.id) : null
        if (destroyed) return
        refs.set(sym, found ? found.ref : null)
        if (touched.has(sym)) {
          upload(sym)
          return
        }
        if (!found) return
        doc[sym] = parseList(found.body.content)
        if (myEpoch === epoch && sym === symbol) {
          manager.deselect()
          manager.clear()
          importSymbol(sym)
        }
      } catch {
        /* the layer keeps what it has; the next activation asks again */
      }
    })()
  }

  // Writes are debounced onto idle time (an image-bearing document stringifies megabytes — never do
  // that inside a pointer gesture) and flushed on pagehide/destroy so a scheduled write survives
  // the tab closing under it.
  let writePending = false
  const writeNow = () => {
    writePending = false
    syncDoc()
    upload(symbol)
  }
  const persist = () => {
    touched.add(symbol)
    if (writePending) return
    writePending = true
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => writePending && writeNow(), { timeout: 1000 })
    else setTimeout(() => writePending && writeNow(), 200)
  }
  const flush = () => {
    if (writePending) writeNow()
  }
  window.addEventListener('pagehide', flush)

  importSymbol(symbol)
  hydrate(symbol)

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
    // The magnet pulls FIRST: a snapped anchor is the bar's own OHLC value, exact rather than
    // whatever price the pixel happened to land on. Weak returns null when nothing is near enough,
    // and the raw pointer position stands.
    const snapped = magnetSnap(chart, series, { x, y }, workflow().magnet)
    if (snapped) return snapped
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
    // Stay-in-drawing-mode keeps the tool for a run of the same shape; without it the rail falls
    // back to the cursor. The model answers, so the rule is stated once.
    setArmed(toolAfterPlacement(armed, workflow().stayInDrawingMode))
    manager.select(d.drawing.id)
    persist()
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    // Lock-all suspends the whole layer, new drawings included, and clears any selection so the
    // settings surfaces cannot offer an edit that would be refused.
    const locked = workflow().allLocked
    if (locked && !draft) {
      manager.deselect()
      return
    }
    // The pointer glyph follows the cursor mode; set on the press so a mode change reaches the
    // element without the layer holding a second copy of the preference.
    container.style.cursor = CURSOR_CSS[workflow().cursor]
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
    // Both locks answer through one predicate: the rail's lock-all mode, and the drawing's own
    // flag. Selecting is deliberately still allowed on a locked drawing, so it can be unlocked.
    const selected = manager.selected()
    if (selected && !editRefused('resize', selected.options, locked)) {
      const ai = anchorHit(selected, x, y)
      if (ai !== null) {
        startDrag('anchor', selected, ai, x, y)
        return
      }
    }
    const hit = manager.hitTest({ x, y })
    if (hit) {
      if (editRefused('select', hit.options, locked)) return
      if (!selected || selected.id !== hit.id) manager.select(hit.id)
      if (!editRefused('move', hit.options, locked)) startDrag('move', hit, null, x, y)
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
      if (!sel || editRefused('delete', sel.options, workflow().allLocked)) return
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
      flush() // the old symbol's pending edit goes up before the switch
      syncDoc()
      manager.deselect()
      manager.clear()
      symbol = next
      epoch++
      importSymbol(next)
      hydrate(next)
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
