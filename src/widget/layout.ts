// The multi-chart layout: N charts tiled by an arrangement code, one ACTIVE chart, and five
// synchronization contracts:
//
//   symbol     a symbol change lands on every chart in the layout
//   interval   a timeframe change lands on every chart in the layout
//   crosshair  the crosshair is mirrored across every chart in the layout
//   time       clicking a chart shows the same moment on every chart in the layout
//   dateRange  a visible-range change lands on every chart in the layout
//
// Symbol, interval and date range REPLAY a change onto every chart; crosshair mirrors
// continuously; time fires on click, centering every chart on the clicked moment. The whole layout
// serializes as ONE content blob.
//
// A widget always has a layout, even when it shows one chart. That is what lets `widget.charts()`
// and `widget.activeChart()` mean the same thing at every arrangement, and it is why there is no
// separate layout constructor to keep in step with this one.
import { arrangementOf, type Arrangement } from '../layoutGrid'
import type { LayoutBody, LayoutMeta } from '../resources'
import { openResourceController, type OpenResource, type ResourceLoadOutcome, type ResourceRemoveOutcome, type ResourceSaveOutcome } from '../openResource'
import type { ChartSaveLoadAdapter } from '../resources'
import type { ChartI18n } from '../i18n'
import type { ChartHandle } from './chart'

/** Which changes replay across the layout. All off by default. */
export interface LayoutSyncFlags {
  symbol: boolean
  interval: boolean
  crosshair: boolean
  time: boolean
  dateRange: boolean
}

const SYNC_OFF: LayoutSyncFlags = { symbol: false, interval: false, crosshair: false, time: false, dateRange: false }

/** The layout's save/load surface: the same open-resource rule the chart applies to a saved chart,
 *  over the layouts family. A layout is its own resource, separate from the charts inside it, and
 *  it conflicts separately. */
export interface LayoutSaveLoadApi {
  current(): OpenResource | null
  save(name: string, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<LayoutMeta>>
  load(id: string, signal?: AbortSignal): Promise<ResourceLoadOutcome<LayoutBody>>
  remove(signal?: AbortSignal): Promise<ResourceRemoveOutcome>
  detach(): void
}

/** The layout surface a host drives, reached as `widget.layout`. */
export interface LayoutApi {
  arrangement(): string
  /** Re-tile. Surviving charts keep their state; new charts clone the active chart's symbol and
   *  timeframe; excess charts are torn down. */
  setArrangement(code: string): void
  /** The index of the active chart. */
  active(): number
  setActive(index: number): void
  sync(): LayoutSyncFlags
  setSync(partial: Partial<LayoutSyncFlags>): void
  /** The whole layout as ONE opaque content blob (arrangement, sync flags, every chart's content). */
  serialize(): { content: string }
  restore(content: string): void
  saveLoad: LayoutSaveLoadApi
}

const LAYOUT_CONTENT_VERSION = 1

/** One tiled chart: the element it fills, its handle, and the subscriptions the bus holds on it. */
export interface LayoutSlot {
  element: HTMLElement
  handle: ChartHandle
  unsubscribes: (() => void)[]
}

export interface LayoutDeps {
  /** The element the charts tile. */
  container: HTMLElement
  adapter: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  arrangement?: string
  charts?: { symbol?: string; timeframe?: string }[]
  sync?: Partial<LayoutSyncFlags>
  /** Build one chart into a fresh element. The widget owns construction; the layout owns
   *  placement, so it also owns the chart's PLACE: `index` is the tile the chart is built for,
   *  which is the only chart identity that survives a re-tile and a reload. */
  createChart(element: HTMLElement, init: { symbol?: string; timeframe?: string } | undefined, index: number): ChartHandle
  /** Tear one chart down. */
  destroyChart(handle: ChartHandle): void
  /** The active chart changed. */
  onActive(handle: ChartHandle): void
  /** Anything a host would save changed: the arrangement, a sync flag, a chart's symbol or
   *  timeframe. */
  onChange(): void
}

export interface LayoutPlane {
  api: LayoutApi
  /** Every chart, in tile order. */
  handles(): readonly ChartHandle[]
  /** Every slot, for the image plane's tiles. */
  slots(): readonly LayoutSlot[]
  /** The arrangement's unit-square rectangles, index-aligned to the slots. */
  rects(): readonly { x: number; y: number; w: number; h: number }[]
  activeHandle(): ChartHandle | null
  destroy(): void
}

export function createLayoutPlane(deps: LayoutDeps): LayoutPlane {
  const slots: LayoutSlot[] = []
  let flags: LayoutSyncFlags = { ...SYNC_OFF, ...(deps.sync ?? {}) }
  let active = 0
  let removed = false
  /** True while the bus replays a change onto sibling charts. Their echoes are dropped, so a symbol
   *  change fans out once instead of every chart re-broadcasting the same move. */
  let applying = false

  const first = arrangementOf(deps.arrangement ?? 's')
  if (!first) throw new Error(`unknown arrangement code ${String(deps.arrangement)}`)
  let arrangement: Arrangement = first

  const openLayout = openResourceController<LayoutMeta, LayoutBody>({
    store: () => deps.adapter?.layouts ?? null,
    t: () => deps.i18n.t,
  })

  const place = (element: HTMLElement, index: number): void => {
    const r = arrangement.rects[index]!
    // Half-pixel insets leave a 1px seam between charts; the container's ground is the divider.
    element.style.left = `calc(${r.x * 100}% + 0.5px)`
    element.style.top = `calc(${r.y * 100}% + 0.5px)`
    element.style.width = `calc(${r.w * 100}% - 1px)`
    element.style.height = `calc(${r.h * 100}% - 1px)`
  }

  const paintActive = (): void => {
    for (let i = 0; i < slots.length; i++) {
      // The active ring only means something with a sibling to be active AGAINST.
      slots[i]!.element.dataset.qcActive = i === active && slots.length > 1 ? 'true' : 'false'
    }
  }

  /** What the layout is POINTED AT, as opposed to what any of it is charting: one chart, and the
   *  market that chart holds. The two are different things, which is why activating another chart
   *  disturbs no chart. Reported for every way it can move — activating another chart, the active
   *  chart changing symbol, a re-tile that drops the active chart, a restore — because a market
   *  that moves in silence strands a host on the last one. Repeats are dropped. */
  let lastActive: string | null = null
  const activeKey = (): string | null => {
    const handle = slots[active]?.handle
    return handle ? `${handle.id}:${handle.symbol()}` : null
  }
  const emitActive = (): void => {
    const handle = slots[active]?.handle
    const key = activeKey()
    if (removed || !handle || key === null || key === lastActive) return
    lastActive = key
    deps.onActive(handle)
  }

  const setActive = (index: number): void => {
    if (removed || index === active || index < 0 || index >= slots.length) return
    active = index
    paintActive()
    emitActive()
  }

  /** Fan a mirror out to every chart but the source, with echoes suppressed. */
  const fanOut = (source: number, apply: (handle: ChartHandle) => void): void => {
    if (applying) return
    applying = true
    try {
      for (let i = 0; i < slots.length; i++) if (i !== source) apply(slots[i]!.handle)
    } finally {
      applying = false
    }
  }

  const wire = (slot: LayoutSlot, index: () => number): void => {
    const { handle } = slot
    slot.unsubscribes.push(
      handle.sync.onCrosshair((t) => {
        if (flags.crosshair) fanOut(index(), (other) => other.sync.setCrosshair(t))
      }),
      handle.sync.onTimeClick((t) => {
        // The contract centers EVERY chart on the clicked moment, the clicked one included.
        if (flags.time && !applying) {
          applying = true
          try {
            for (const s of slots) s.handle.setVisibleRange(centeredOn(s.handle, t))
          } finally {
            applying = false
          }
        }
      }),
      handle.sync.onVisibleRange((range) => {
        if (flags.dateRange) fanOut(index(), (other) => other.setVisibleRange(range))
      }),
      handle.on('symbol', (s) => {
        if (flags.symbol) fanOut(index(), (other) => other.setSymbol(s))
        deps.onChange()
        // A replay onto charts is placement, not the active market moving: a restore mutes the bus
        // for its whole sweep and reports once, at the end, with the chart it lands on.
        if (!applying) emitActive()
      }),
      handle.on('timeframe', () => {
        if (flags.interval) fanOut(index(), (other) => other.setTimeframe(handle.timeframe()))
        deps.onChange()
      }),
    )
  }

  /** A window of the chart's current span, centered on a moment. */
  const centeredOn = (handle: ChartHandle, time: number): { from: number; to: number } => {
    const current = handle.visibleRange()
    const span = current ? current.to - current.from : 0
    return { from: time - span / 2, to: time + span / 2 }
  }

  const createSlot = (init?: { symbol?: string; timeframe?: string }): LayoutSlot => {
    const element = document.createElement('div')
    element.className = 'qc-pane'
    deps.container.appendChild(element)
    const slot: LayoutSlot = { element, handle: null as unknown as ChartHandle, unsubscribes: [] }
    const index = (): number => slots.indexOf(slot)
    // The slot is pushed by the caller, so its place is the length the list stands at now.
    slot.handle = deps.createChart(element, init, slots.length)
    wire(slot, index)
    const onDown = (): void => setActive(index())
    element.addEventListener('pointerdown', onDown, true)
    slot.unsubscribes.push(() => element.removeEventListener('pointerdown', onDown, true))
    return slot
  }

  const destroySlot = (slot: LayoutSlot): void => {
    for (const unsubscribe of slot.unsubscribes) unsubscribe()
    deps.destroyChart(slot.handle)
    slot.element.remove()
  }

  const applyArrangement = (next: Arrangement): void => {
    arrangement = next
    const cloneFrom = slots[active]?.handle
    while (slots.length > next.count) destroySlot(slots.pop()!)
    while (slots.length < next.count)
      slots.push(createSlot(cloneFrom ? { symbol: cloneFrom.symbol(), timeframe: cloneFrom.timeframe() } : deps.charts?.[slots.length]))
    for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    if (active >= slots.length) active = slots.length - 1
    paintActive()
    emitActive()
  }

  // Initial build. What the layout opens pointed at is STATE, not a change, so the first value is
  // recorded rather than reported.
  for (let i = 0; i < arrangement.count; i++) {
    slots.push(createSlot(deps.charts?.[i]))
    place(slots[i]!.element, i)
  }
  paintActive()
  lastActive = activeKey()

  const api: LayoutApi = {
    arrangement: () => arrangement.code,
    setArrangement(code) {
      if (removed || code === arrangement.code) return
      const next = arrangementOf(code)
      if (!next) throw new Error(`unknown arrangement code ${code}`)
      applyArrangement(next)
      deps.onChange()
    },
    active: () => active,
    setActive: (index) => setActive(index),
    sync: () => ({ ...flags }),
    setSync(partial) {
      if (removed) return
      flags = { ...flags, ...partial }
      deps.onChange()
    },
    serialize() {
      return {
        content: JSON.stringify({
          v: LAYOUT_CONTENT_VERSION,
          arrangement: arrangement.code,
          sync: flags,
          active,
          charts: slots.map((slot) => {
            const s = slot.handle.saveLoad.serialize()
            return { symbol: s.symbol, tf: s.timeframe, content: s.content }
          }),
        }),
      }
    },
    restore(content) {
      if (removed) return
      const c = JSON.parse(content) as { v?: unknown; arrangement?: unknown; sync?: unknown; active?: unknown; charts?: unknown }
      if (c.v !== LAYOUT_CONTENT_VERSION) throw new Error(`unsupported layout content version ${String(c.v)}`)
      const next = typeof c.arrangement === 'string' ? arrangementOf(c.arrangement) : null
      if (next) applyArrangement(next)
      if (c.sync && typeof c.sync === 'object') flags = { ...SYNC_OFF, ...(c.sync as Partial<LayoutSyncFlags>) }
      const saved = Array.isArray(c.charts) ? (c.charts as { symbol?: unknown; tf?: unknown; content?: unknown }[]) : []
      // Replay each chart's blob with the bus muted: a restore is placement, never a sync event.
      applying = true
      try {
        for (let i = 0; i < slots.length; i++) {
          const entry = saved[i]
          if (!entry) continue
          if (typeof entry.content === 'string') slots[i]!.handle.saveLoad.restore(entry.content)
          else {
            if (typeof entry.symbol === 'string' && entry.symbol) slots[i]!.handle.setSymbol(entry.symbol)
            if (typeof entry.tf === 'string' && entry.tf) slots[i]!.handle.setTimeframe(entry.tf)
          }
        }
      } finally {
        applying = false
      }
      if (typeof c.active === 'number' && c.active >= 0 && c.active < slots.length) {
        active = c.active
        paintActive()
      }
      // Placement stays silent on the sync bus, but the active chart is not chrome: restoring a
      // layout puts a different market under it, and a host that is not told keeps the one it left.
      emitActive()
    },
    saveLoad: {
      current: () => openLayout.current(),
      detach: () => openLayout.detach(),
      save: (name, opts) => openLayout.save({ name, content: api.serialize().content }, opts),
      async load(id, signal) {
        const outcome = await openLayout.load(id, signal)
        if (outcome.kind === 'ok' && !removed) api.restore(outcome.body.content)
        return outcome
      },
      remove: (signal) => openLayout.remove(signal),
    },
  }

  return {
    api,
    handles: () => slots.map((s) => s.handle),
    slots: () => slots,
    rects: () => arrangement.rects,
    activeHandle: () => slots[active]?.handle ?? null,
    destroy() {
      if (removed) return
      removed = true
      while (slots.length) destroySlot(slots.pop()!)
    },
  }
}
