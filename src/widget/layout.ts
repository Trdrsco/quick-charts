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
import { arrangementOf, type Arrangement, type PaneRect } from '../layoutGrid'
import { dividersOf, moveDivider, validGeometry, type PaneDivider } from './layoutGeometry'
import type { LayoutBody, LayoutMeta, ResourceRef } from '../resources'
import type { LayoutEvent, SaveConflictInfo } from './events'
import { openResourceController, ResourceRollbackError, type OpenResource, type ResourceLoadOutcome, type ResourceRemoveOutcome, type ResourceSaveOutcome } from '../openResource'
import { ResourceAbortError, type ChartSaveLoadAdapter } from '../resources'
import type { ChartI18n } from '../i18n'
import type { ChartHandle } from './chart'
import { chartRangeMirror } from './ranges'
import type { ChartStyleId } from './styles'
import type { IndicatorInstance } from './options'
import type { CompareEntry } from '../compare'
import { chartRecoveryReceipt, parseChartContent } from './saveLoad'
import { symbolNames } from '../symbolLabel'
import { fallbackArrangement, LAYOUT_SYNC_KEYS } from './arrangements'

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
  /** True while the layout holds content that could not be put back: a body failed part-way and so
   *  did the undo. Saving is refused until a load lands. */
  notSaving(): boolean
  /** Save under `name`. Answers `not-saving` while the layout is not saving; a copy is let through
   *  and leaves the layout it is bound to standing whole, but the layout still saves nowhere else. */
  save(name: string, opts?: { asNew?: boolean; signal?: AbortSignal }): Promise<ResourceSaveOutcome<LayoutMeta>>
  /** Open a saved layout: its content, every nested chart's blob included, is read and applied
   *  FIRST, and only a layout that took it becomes the open layout. Content this build cannot read
   *  comes back as `invalid`, refused before a tile moves; an id the store does not hold comes back
   *  as `not-found`, a store that could not be reached as `unavailable`, and a load abandoned
   *  before it landed as `cancelled`. On every one of them the tiles on screen and the save binding
   *  are as they were. */
  load(id: string, signal?: AbortSignal): Promise<ResourceLoadOutcome<LayoutBody>>
  remove(signal?: AbortSignal): Promise<ResourceRemoveOutcome>
  detach(): void
}

/** The layout surface a host drives, reached as `widget.layout`. */
export interface LayoutApi {
  arrangement(): string
  /** Re-tile. Surviving charts keep their state; new charts clone pane 0's safe presentation;
   *  excess charts are torn down. An arrangement the widget does not offer is ignored. */
  setArrangement(code: string): void
  /** The index of the active chart. */
  active(): number
  setActive(index: number): void
  sync(): LayoutSyncFlags
  /** Set sync switches. A switch the widget does not offer keeps its value. */
  setSync(partial: Partial<LayoutSyncFlags>): void
  /** The chart standing alone, or null while every chart is tiled. Presentation, not content: a
   *  maximize is a way of LOOKING at a layout, so it rides no blob and a re-tile clears it. */
  maximized(): number | null
  /** Stand one chart alone, or `null` to put its siblings back where they were. Their charts, their
   *  subscriptions and their state are kept throughout. */
  setMaximized(index: number | null): void
  /** The whole layout as ONE opaque content blob (arrangement, sync flags, every chart's content). */
  serialize(): { content: string }
  /** Apply a whole layout blob. Throws on content this build cannot read, having changed nothing:
   *  the version, the arrangement code and every nested chart's blob are read before a tile moves.
   *  A chart that then refuses what it was handed anyway is an internal error, and the layout is
   *  re-tiled from the content it held. Where that re-tiling fails too, the layout holds neither
   *  content and stops saving, which `saveLoad.notSaving()` reports. */
  restore(content: string): void
  saveLoad: LayoutSaveLoadApi
}

const LAYOUT_CONTENT_VERSION = 2
const validEntityNamespace = (value: string): boolean =>
  /^(?:layout:(?:[A-Za-z0-9_.!~*'()-]|%[0-9A-F]{2})+|session:[a-z0-9-]+)$/.test(value)

/** Complete private presentation state, emitted only after a layout commit. */
export interface LayoutModelState {
  arrangement: string
  geometry: readonly PaneRect[]
  sync: LayoutSyncFlags
  active: number
  maximized: number | null
}

/** One tiled chart: the element it fills, its handle, and the subscriptions the bus holds on it. */
export interface LayoutSlot {
  /** Durable identity of the chart entity occupying this slot. It is content, never an ordinal. */
  entityId: string
  element: HTMLElement
  handle: ChartHandle
  unsubscribes: (() => void)[]
}

interface ChartPresentationTemplate {
  symbol?: string
  timeframe?: string
  style?: ChartStyleId
  indicators?: readonly IndicatorInstance[]
  compares?: readonly CompareEntry[]
}

const cloneIndicators = (instances: readonly IndicatorInstance[]): IndicatorInstance[] => instances.map((instance) => ({
  ...instance,
  inputs: instance.inputs ? { ...instance.inputs } : undefined,
  overrides: instance.overrides ? JSON.parse(JSON.stringify(instance.overrides)) as IndicatorInstance['overrides'] : undefined,
}))

const cloneTemplate = (template: ChartPresentationTemplate): ChartPresentationTemplate => ({
  ...template,
  indicators: template.indicators ? cloneIndicators(template.indicators) : undefined,
  compares: template.compares?.map((entry) => ({ ...entry })),
})

export interface LayoutDeps {
  /** The element the charts tile. */
  container: HTMLElement
  adapter: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  arrangement?: string
  charts?: { symbol?: string; timeframe?: string }[]
  sync?: Partial<LayoutSyncFlags>
  /** Build one chart into a fresh element. The widget owns construction; the layout owns
   *  placement and supplies the durable entity identity carried by layout content. */
  createChart(element: HTMLElement, init: ChartPresentationTemplate | undefined, index: number, entityId: string): ChartHandle
  /** Rebind a surviving instance when authoritative saved content names another chart entity. */
  rebindChart?(handle: ChartHandle, entityId: string): void
  /** Capture-phase pane entry, before that pane's drawing gesture consumes the pointer. */
  beforePointer?(handle: ChartHandle): void
  /** The timeframe a restored chart opens on for the token its layout names: the token when the
   *  widget offers it, else the widget's first offered timeframe. Absent, the token as named. */
  timeframeOf?(token: string): string
  /** The arrangement codes the widget offers, in the host's order. Absent, every arrangement. */
  arrangements?: readonly string[]
  /** The sync switches the viewer may change. Absent, every switch. The others keep the value
   *  `sync` gives them. */
  syncOffered?: readonly (keyof LayoutSyncFlags)[]
  /** Stable document seed when the host has one. Absent means this widget's identities are session-only. */
  identitySeed?: string
  /** Tear one chart down. */
  destroyChart(handle: ChartHandle): void
  /** The active chart changed. */
  onActive(handle: ChartHandle): void
  /** Anything a host would save changed: the arrangement, a sync flag, a chart's symbol or
   *  timeframe. */
  onChange(): void
  onCommitted?: (state: LayoutModelState) => void
  beginHydration?: () => () => void
  onResource?: (event: LayoutEvent) => void
  onRefusal?: (event: SaveConflictInfo) => void
}

export interface LayoutPlane {
  api: LayoutApi
  canSave(): boolean
  /** The browser's quoted revision, including rows other than the open layout. */
  removeResource(ref: ResourceRef): Promise<ResourceRemoveOutcome>
  /** Every chart, in tile order. */
  handles(): readonly ChartHandle[]
  /** Every slot, for the image plane's tiles. */
  slots(): readonly LayoutSlot[]
  /** The arrangement's unit-square rectangles, index-aligned to the slots. */
  rects(): readonly { x: number; y: number; w: number; h: number }[]
  activeHandle(): ChartHandle | null
  /** The active tile fills the layout, or gives it back. */
  toggleMaximize(): void
  /** Whether a tile fills the layout now. */
  maximized(): boolean
  /** Start a new layout from one chart's content: re-tile to one chart, restore `content` into it,
   *  then re-tile to the arrangement the widget opens a one-chart layout on, whose other panes clone
   *  that chart as any re-tile clones pane 0. Nothing a restore carried survives it. */
  startNew(content: string): void
  destroy(): void
}

/** One chart entry of layout content, as the content holds it. */
interface LayoutChartEntry {
  id: string
  symbol?: unknown
  tf?: unknown
  content?: unknown
}

/** What a restore carries when the saved arrangement is not offered and the arrangement shown holds
 *  fewer charts: the saved arrangement, its geometry, and the saved charts past the ones shown, kept
 *  exactly as they were read. */
interface CarriedLayout {
  arrangement: string
  geometry: PaneRect[]
  charts: LayoutChartEntry[]
}

export function createLayoutPlane(deps: LayoutDeps): LayoutPlane {
  const slots: LayoutSlot[] = []
  let flags: LayoutSyncFlags = { ...SYNC_OFF, ...(deps.sync ?? {}) }
  /** The switches the viewer may not change, and the value each holds: the host's own. */
  const fixedSync: readonly (keyof LayoutSyncFlags)[] = deps.syncOffered ? LAYOUT_SYNC_KEYS.filter((key) => !deps.syncOffered!.includes(key)) : []
  const fixedFlags: LayoutSyncFlags = { ...flags }
  const holdFixed = (next: LayoutSyncFlags): LayoutSyncFlags => {
    for (const key of fixedSync) next[key] = fixedFlags[key]
    return next
  }
  const offersArrangement = (code: string): boolean => !deps.arrangements || deps.arrangements.includes(code)
  /** The saved charts a restore could not show, carried into every serialize until a re-tile. */
  let carried: CarriedLayout | null = null
  let active = 0
  let removed = false
  /** True while the bus replays a change onto sibling charts. Their echoes are dropped, so a symbol
   *  change fans out once instead of every chart re-broadcasting the same move. */
  let applying = false

  const first = arrangementOf(deps.arrangement ?? 's')
  if (!first) throw new Error(`unknown arrangement code ${String(deps.arrangement)}`)
  let arrangement: Arrangement = first
  let rects: PaneRect[] = first.rects.map((rect) => ({ ...rect }))
  let maximized: number | null = null
  let recoveries: (() => void)[] = []
  let complete = false
  let entityNamespace = deps.identitySeed
    ? `layout:${encodeURIComponent(deps.identitySeed)}`
    : `session:${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`
  let nextEntity = 1
  const allocateEntity = (): string => `${entityNamespace}:chart:${nextEntity++}`

  const openLayout = openResourceController<LayoutMeta, LayoutBody>({
    store: () => deps.adapter?.layouts ?? null,
    t: () => deps.i18n.t,
    blocked: () => slots.some((slot) => slot.handle.saveLoad.notSaving()),
    disposed: () => removed,
    committed: () => {
      if (!complete) return false
      for (const recover of recoveries) recover()
      return true
    },
    changed: (kind, resource) => {
      if (!removed) deps.onResource?.({ kind, id: resource?.ref.id ?? null, name: kind === 'saved' || kind === 'loaded' ? resource!.name : null })
    },
  })
  const report = <T extends { kind: string; message?: string }>(outcome: T): T => {
    if (!removed && outcome.message) deps.onRefusal?.({ family: 'layout', current: 'current' in outcome ? outcome.current as ResourceRef : null, message: outcome.message })
    return outcome
  }

  const state = (): LayoutModelState => ({ arrangement: arrangement.code, geometry: rects.map((r) => ({ ...r })), sync: { ...flags }, active, maximized })
  const emitCommitted = (): void => { if (!removed) deps.onCommitted?.(state()) }

  const place = (element: HTMLElement, index: number): void => {
    const r = maximized === null ? rects[index]! : { x: 0, y: 0, w: 1, h: 1 }
    element.hidden = maximized !== null && maximized !== index
    // Half-pixel insets leave a 1px seam between charts; the container's ground is the divider.
    element.style.left = `calc(${r.x * 100}% + 0.5px)`
    element.style.top = `calc(${r.y * 100}% + 0.5px)`
    element.style.width = `calc(${r.w * 100}% - 1px)`
    element.style.height = `calc(${r.h * 100}% - 1px)`
    // The active ring rounds ONLY the corners that meet the surrounding card's own rounded ones:
    // the outer TOP corners. Every interior corner, and both bottom corners, stay square, so a
    // tile against a neighbour reads as one continuous seam rather than a floating pill. A
    // maximized tile takes the whole area and therefore wears both top corners.
    element.dataset.qcCornerTl = r.x === 0 && r.y === 0 ? 'true' : 'false'
    element.dataset.qcCornerTr = r.x + r.w === 1 && r.y === 0 ? 'true' : 'false'
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
    if (maximized !== null) {
      maximized = index
      for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    }
    paintActive()
    emitActive()
    if (!applying) deps.onChange()
    emitCommitted()
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
    slot.unsubscribes.push(handle.sync.onCrosshair((t) => {
        if (flags.crosshair) fanOut(index(), (other) => other.sync.setCrosshair(t))
      }))
    slot.unsubscribes.push(handle.sync.onTimeClick((t) => {
        // The contract centers EVERY chart on the clicked moment, the clicked one included.
        if (flags.time && !applying) {
          applying = true
          try {
            for (const s of slots) {
              const range = centeredOn(s.handle, t)
              if (range) chartRangeMirror(s.handle)?.setVisibleRange(range)
            }
          } finally {
            applying = false
          }
        }
      }))
    slot.unsubscribes.push(handle.sync.onVisibleRange((range) => {
        if (flags.dateRange) fanOut(index(), (other) => chartRangeMirror(other)?.setVisibleRange(range))
      }))
    slot.unsubscribes.push(handle.on('symbol', (s) => {
        if (flags.symbol) fanOut(index(), (other) => other.setSymbol(s))
        // Placement is not a change a host saves: a restore and the rollback that undoes a refused
        // one both mute the bus for their whole sweep, so a load that lands changes nothing a host
        // has not already got saved, and a load that is refused reports nothing at all.
        if (!applying) deps.onChange()
        // A replay onto charts is not the active market moving either: a restore reports once, at
        // the end, with the chart it lands on.
        if (!applying) emitActive()
      }))
    slot.unsubscribes.push(handle.on('timeframe', () => {
        if (flags.interval) fanOut(index(), (other) => other.setTimeframe(handle.timeframe()))
        if (!applying) deps.onChange()
      }))
  }

  /** A window of the chart's current span, centered on a moment. */
  const centeredOn = (handle: ChartHandle, time: number): { from: number; to: number } | null => {
    const current = handle.visibleRange()
    if (!current) return null
    const span = current.to - current.from
    return { from: time - span / 2, to: time + span / 2 }
  }

  const createSlot = (init?: ChartPresentationTemplate, entityId = allocateEntity()): LayoutSlot => {
    const element = document.createElement('div')
    element.className = 'qc-pane'
    deps.container.appendChild(element)
    const slot: LayoutSlot = { entityId, element, handle: null as unknown as ChartHandle, unsubscribes: [] }
    const index = (): number => slots.indexOf(slot)
    // The slot is pushed by the caller, so its place is the length the list stands at now.
    let built = false
    try {
      slot.handle = deps.createChart(element, init, slots.length, entityId)
      built = true
      wire(slot, index)
      // Keyboard focus selects the same command owner as pointer entry. A button activated by
      // Enter/Space sends no pointerdown, and must not act on the previously selected tile.
      const activate = (event?: Event): void => {
        const i = index()
        if (event?.type === 'pointerdown') deps.beforePointer?.(slot.handle)
        setActive(i)
        if (event?.type === 'pointerdown' && (event as PointerEvent).altKey && slots.length > 1) toggleMaximize(i)
      }
      element.addEventListener('pointerdown', activate, true)
      element.addEventListener('focusin', activate, true)
      slot.unsubscribes.push(() => element.removeEventListener('pointerdown', activate, true), () => element.removeEventListener('focusin', activate, true))
      return slot
    } catch (error) {
      for (const unsubscribe of slot.unsubscribes) {
        try { unsubscribe() } catch { /* preserve the construction refusal */ }
      }
      try {
        if (built) deps.destroyChart(slot.handle)
      } catch { /* preserve the construction refusal */ }
      try { element.remove() } catch { /* preserve the construction refusal */ }
      throw error
    }
  }

  const destroySlot = (slot: LayoutSlot): void => {
    let failure: unknown
    for (const unsubscribe of slot.unsubscribes) {
      try { unsubscribe() } catch (error) { failure ??= error }
    }
    try { deps.destroyChart(slot.handle) } catch (error) { failure ??= error }
    try { slot.element.remove() } catch (error) { failure ??= error }
    if (failure) throw failure
  }

  /** Pane 0's safe presentation, read and deep-copied whole: what a new pane clones. */
  const templateOf = (handle: ChartHandle): ChartPresentationTemplate => ({
    symbol: handle.symbol(),
    timeframe: handle.timeframe(),
    style: handle.style(),
    indicators: cloneIndicators(handle.indicators.get()),
    compares: handle.compare.list().map((entry) => ({ ...entry })),
  })

  /** Re-tile to `next`, building `build` panes of it: all of them, unless a restore fills the rest
   *  itself. */
  const applyArrangement = (next: Arrangement, cloneNew = true, identities?: readonly string[], build = next.count): unknown => {
    cancelDrag?.()
    // A retile can destroy an unsafe child's controller. Keep that provenance on the containing
    // resource before any slot goes; recreating its partial snapshot is not a recovery. Only a
    // complete committed outer load may clear this latch, including after a successful rollback.
    if (slots.some((slot) => slot.handle.saveLoad.notSaving())) openLayout.stopSaving()
    const priorArrangement = arrangement
    const priorRects = rects
    const priorMaximized = maximized
    const priorIds = slots.map((slot) => slot.entityId)
    const cloneFrom = cloneNew ? slots[0]?.handle : undefined
    // Read and deep-copy the whole source before committing any layout field. A host-defined
    // indicator object may carry throwing accessors; refusing that snapshot leaves tiling intact.
    const template = cloneFrom ? templateOf(cloneFrom) : undefined
    arrangement = next
    rects = next.rects.map((rect) => ({ ...rect }))
    maximized = null
    // A removed child cannot be reconstructed after teardown starts. Teardown is therefore a
    // terminal best-effort boundary, not a fallible part of the content transaction: every
    // unsubscribe, instance dispose and element removal still runs, and a cleanup exception cannot
    // leave arrangement fields claiming a count the slot list no longer has.
    let cleanupFailure: unknown
    while (slots.length > build) {
      try { destroySlot(slots.pop()!) } catch (error) { cleanupFailure ??= error }
    }
    const added: LayoutSlot[] = []
    try {
      while (slots.length < build) {
        const slot = createSlot(template ? cloneTemplate(template) : deps.charts?.[slots.length], identities?.[slots.length])
        slots.push(slot)
        added.push(slot)
      }
      if (identities) {
        for (let i = 0; i < slots.length; i++) {
          const identity = identities[i]!
          if (slots[i]!.entityId !== identity) {
            deps.rebindChart?.(slots[i]!.handle, identity)
            slots[i]!.entityId = identity
          }
        }
      }
    } catch (error) {
      while (added.length > 0) {
        const slot = added.pop()!
        slots.pop()
        try {
          destroySlot(slot)
        } catch {
          // Preserve the construction refusal and continue retiring every provisional tile.
        }
      }
      arrangement = priorArrangement
      rects = priorRects
      maximized = priorMaximized
      for (let i = 0; i < slots.length; i++) {
        const identity = priorIds[i]
        if (identity && slots[i]!.entityId !== identity) {
          try { deps.rebindChart?.(slots[i]!.handle, identity); slots[i]!.entityId = identity } catch { /* preserve the original refusal */ }
        }
      }
      for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
      throw error
    }
    for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    if (active >= slots.length) active = slots.length - 1
    paintActive()
    emitActive()
    return cleanupFailure
  }

  const toggleMaximize = (index: number): void => {
    if (removed || index < 0 || index >= slots.length || slots.length < 2) return
    cancelDrag?.()
    maximized = maximized === index ? null : index
    active = index
    for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    paintActive()
    paintDividers()
    emitActive()
    emitCommitted()
  }

  let dividerElements: HTMLElement[] = []
  const clearDividers = (): void => { for (const element of dividerElements) element.remove(); dividerElements = [] }
  const paintDividers = (): void => {
    clearDividers()
    if (removed || maximized !== null) return
    for (const divider of dividersOf(rects)) {
      const element = document.createElement('div')
      element.className = 'qc-layout-divider'
      element.dataset.qcAxis = divider.axis
      const half = 3
      if (divider.axis === 'v') {
        element.style.left = `calc(${divider.pos * 100}% - ${half}px)`
        element.style.top = `${divider.span[0] * 100}%`
        element.style.width = `${half * 2}px`
        element.style.height = `${(divider.span[1] - divider.span[0]) * 100}%`
      } else {
        element.style.left = `${divider.span[0] * 100}%`
        element.style.top = `calc(${divider.pos * 100}% - ${half}px)`
        element.style.width = `${(divider.span[1] - divider.span[0]) * 100}%`
        element.style.height = `${half * 2}px`
      }
      element.addEventListener('pointerdown', (event) => startDividerDrag(event, divider, element))
      deps.container.appendChild(element)
      dividerElements.push(element)
    }
  }

  let cancelDrag: (() => void) | null = null
  const startDividerDrag = (event: PointerEvent, divider: PaneDivider, element: HTMLElement): void => {
    if (event.button !== 0 || cancelDrag) return
    event.preventDefault()
    const bounds = deps.container.getBoundingClientRect()
    const base = rects.map((r) => ({ ...r }))
    let changed = false
    let finishing = false
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== event.pointerId) return
      const dimension = divider.axis === 'v' ? bounds.width : bounds.height
      if (dimension <= 0) return
      const point = divider.axis === 'v' ? next.clientX - bounds.left : next.clientY - bounds.top
      const pixelMin = Math.min(0.2, Math.max(0.02, 48 / dimension))
      const moved = moveDivider(base, divider, point / dimension, pixelMin)
      if (!moved) return
      rects = moved
      changed = true
      for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    }
    const clean = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', commit)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      element.removeEventListener('lostpointercapture', cancel)
      cancelDrag = null
    }
    const cancel = (): void => { if (finishing) return; rects = base; clean(); for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i); paintDividers() }
    const commit = (next: PointerEvent): void => {
      if (next.pointerId !== event.pointerId) return
      finishing = true
      clean()
      paintDividers()
      if (changed) { deps.onChange(); emitCommitted() }
    }
    cancelDrag = cancel
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', commit)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    element.addEventListener('lostpointercapture', cancel)
    element.setPointerCapture?.(event.pointerId)
  }

  // Initial build. What the layout opens pointed at is STATE, not a change, so the first value is
  // recorded rather than reported.
  for (let i = 0; i < arrangement.count; i++) {
    slots.push(createSlot(deps.charts?.[i]))
    place(slots[i]!.element, i)
  }
  paintActive()
  paintDividers()
  lastActive = activeKey()

  /** One layout blob, read whole: the version, the arrangement code and EVERY nested chart's
   *  content, so a layout this build cannot read is refused before a single tile moves. Reading it
   *  is the only refusal a structurally valid blob can meet: re-tiling destroys and rebuilds
   *  charts, and a refusal after that can only put the content back, never the instances. */
  interface LayoutPlan {
    arrangement: Arrangement
    geometry: PaneRect[]
    sync: LayoutSyncFlags
    active: number
    identity: { namespace: string; next: number }
    charts: LayoutChartEntry[]
  }

  const readLayoutContent = (content: string): LayoutPlan => {
    const c = JSON.parse(content) as { v?: unknown; identity?: unknown; arrangement?: unknown; geometry?: unknown; sync?: unknown; active?: unknown; charts?: unknown }
    if (c.v !== LAYOUT_CONTENT_VERSION) throw new Error(`unsupported layout content version ${String(c.v)}`)
    if (!Array.isArray(c.charts)) throw new Error('invalid layout charts')
    const identity = c.identity as { namespace?: unknown; next?: unknown } | null
    if (!identity || typeof identity.namespace !== 'string' || !validEntityNamespace(identity.namespace) || !Number.isSafeInteger(identity.next) || (identity.next as number) < 1)
      throw new Error('invalid layout chart identity allocator')
    const charts = c.charts as { id?: unknown; symbol?: unknown; tf?: unknown; content?: unknown }[]
    const ids = new Set<string>()
    for (const entry of charts) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.startsWith(`${identity.namespace}:chart:`) || ids.has(entry.id)) throw new Error('invalid layout chart identity')
      const ordinal = Number(entry.id.slice(`${identity.namespace}:chart:`.length))
      if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal >= (identity.next as number)) throw new Error('invalid layout chart identity')
      ids.add(entry.id)
    }
    for (const entry of charts) if (entry && typeof entry.content === 'string') parseChartContent(entry.content)
    // A code this build does not carry is refused here rather than ignored at apply time: the
    // arrangement decides how many charts stand, so taking the rest of the blob under the tiling it
    // happens to have would be a layout nobody saved.
    const arrangement = typeof c.arrangement === 'string' ? arrangementOf(c.arrangement) : null
    if (!arrangement) throw new Error(`unknown arrangement code ${String(c.arrangement)}`)
    if (charts.length !== arrangement.count) throw new Error('layout chart count does not match arrangement')
    if (!validGeometry(c.geometry, arrangement.rects)) throw new Error('invalid layout geometry')
    const sync = c.sync && typeof c.sync === 'object' ? c.sync as Record<string, unknown> : null
    const keys = LAYOUT_SYNC_KEYS
    if (!sync || keys.some((key) => typeof sync[key] !== 'boolean')) throw new Error('invalid layout sync flags')
    if (!Number.isInteger(c.active) || (c.active as number) < 0 || (c.active as number) >= charts.length) throw new Error('invalid active chart')
    return {
      arrangement,
      identity: { namespace: identity.namespace, next: identity.next as number },
      geometry: (c.geometry as PaneRect[]).map((rect) => ({ ...rect })),
      sync: Object.fromEntries(keys.map((key) => [key, sync[key]])) as unknown as LayoutSyncFlags,
      active: c.active as number,
      charts: charts as LayoutPlan['charts'],
    }
  }

  const applyLayoutContent = (plan: LayoutPlan): void => {
    recoveries = []
    complete = false
    // A saved arrangement the widget does not offer opens on the offered one with the most charts
    // not above its count, else the one with the fewest. The saved charts past the ones shown are
    // carried whole, so a save of this layout still holds them; extra panes clone the first chart,
    // as any re-tile clones pane 0.
    const shown = offersArrangement(plan.arrangement.code) ? plan.arrangement : arrangementOf(fallbackArrangement(plan.arrangement.count, deps.arrangements!))!
    const kept = Math.min(shown.count, plan.charts.length)
    const entries = plan.charts.slice(0, kept)
    // Saved children carry their own complete content. Do not provisionally clone pane 0 here:
    // that would start its compare/feed work before the saved child replaces it.
    const cleanupFailure = applyArrangement(shown, false, entries.map((entry) => entry.id), kept)
    carried = kept < plan.charts.length ? { arrangement: plan.arrangement.code, geometry: plan.geometry.map((rect) => ({ ...rect })), charts: plan.charts.slice(kept) } : null
    entityNamespace = plan.identity.namespace
    nextEntity = plan.identity.next
    rects = (shown === plan.arrangement ? plan.geometry : shown.rects).map((rect) => ({ ...rect }))
    flags = holdFixed({ ...plan.sync })
    // Replay each chart's blob with the bus muted: a restore is placement, never a sync event.
    applying = true
    try {
      for (let i = 0; i < slots.length; i++) {
        const entry = entries[i]
        if (!entry) continue
        if (typeof entry.content === 'string') {
          const child = slots[i]!.handle.saveLoad
          child.restore(entry.content)
          const recover = chartRecoveryReceipt(child)
          if (recover) recoveries.push(recover)
        } else {
          if (typeof entry.symbol === 'string' && entry.symbol) slots[i]!.handle.setSymbol(entry.symbol)
          if (typeof entry.tf === 'string' && entry.tf) slots[i]!.handle.setTimeframe(deps.timeframeOf?.(entry.tf) ?? entry.tf)
        }
      }
      if (slots.length < shown.count) {
        const template = templateOf(slots[0]!.handle)
        while (slots.length < shown.count) slots.push(createSlot(cloneTemplate(template)))
      }
    } finally {
      applying = false
    }
    active = plan.active < kept ? plan.active : 0
    maximized = null
    for (let i = 0; i < slots.length; i++) place(slots[i]!.element, i)
    paintActive()
    paintDividers()
    // Placement stays silent on the sync bus, but the active chart is not chrome: restoring a
    // layout puts a different market under it, and a host that is not told keeps the one it left.
    emitActive()
    complete =
      slots.length === shown.count &&
      recoveries.length === kept
    // The candidate is coherent before teardown failure is surfaced. The outer restore catches
    // this and runs its ordinary content rollback, so a failed shrink never reports a load success.
    if (cleanupFailure) throw cleanupFailure
  }

  /** A re-tile the viewer or the host asked for: the layout is now the one they chose, so nothing a
   *  restore carried rides it any further. */
  const retile = (next: Arrangement): void => {
    carried = null
    const cleanupFailure = applyArrangement(next)
    paintDividers()
    deps.onChange()
    emitCommitted()
    if (cleanupFailure) throw cleanupFailure
  }

  const api: LayoutApi = {
    arrangement: () => arrangement.code,
    setArrangement(code) {
      if (removed || code === arrangement.code) return
      const next = arrangementOf(code)
      if (!next) throw new Error(`unknown arrangement code ${code}`)
      if (!offersArrangement(code)) return
      retile(next)
    },
    active: () => active,
    setActive: (index) => setActive(index),
    maximized: () => maximized,
    setMaximized(index) {
      if (removed) return
      if (index === null) {
        if (maximized !== null) toggleMaximize(maximized)
        return
      }
      if (index < 0 || index >= slots.length || index === maximized) return
      if (maximized !== null) toggleMaximize(maximized)
      toggleMaximize(index)
    },
    sync: () => ({ ...flags }),
    setSync(partial) {
      if (removed) return
      // A switch the viewer may not change keeps its value; a call that names only such switches
      // changes nothing and reports nothing.
      if (fixedSync.length > 0 && Object.keys(partial).every((key) => fixedSync.includes(key as keyof LayoutSyncFlags))) return
      flags = holdFixed({ ...flags, ...partial })
      deps.onChange()
      emitCommitted()
    },
    serialize() {
      const charts: LayoutChartEntry[] = slots.map((slot) => {
        const s = slot.handle.saveLoad.serialize()
        return { id: slot.entityId, symbol: s.symbol, tf: s.timeframe, content: s.content }
      })
      // A layout carrying saved charts it does not show writes the saved arrangement and geometry
      // with every chart: the shown ones as they are now, the rest exactly as they were read.
      return {
        content: JSON.stringify({
          v: LAYOUT_CONTENT_VERSION,
          arrangement: carried ? carried.arrangement : arrangement.code,
          geometry: carried ? carried.geometry : rects,
          sync: flags,
          active,
          identity: { namespace: entityNamespace, next: nextEntity },
          charts: carried ? [...charts, ...carried.charts] : charts,
        }),
      }
    },
    restore(content) {
      if (removed) return
      const plan = readLayoutContent(content)
      // What the tiles hold now, read before any of them moves: a layout is re-tiled to be
      // restored, and destroying a chart is not something a later refusal can undo by itself.
      const held = api.serialize().content
      const endHydration = deps.beginHydration?.()
      try {
        applyLayoutContent(plan)
        emitCommitted()
      } catch (error) {
        // Reading the blob proves it can be read, not that a chart takes every part of it, which
        // only an internal error can now refuse. A failure that late puts the layout back on the
        // CONTENT it held, by re-tiling from it: the charts standing after this are new instances
        // with new ids, and the active chart is announced again. The caller sees the original
        // refusal.
        try {
          applyLayoutContent(readLayoutContent(held))
        } catch (rollback) {
          // The layout is on neither content now. That is a different answer from a clean refusal
          // and it is reported as one, rather than left for the viewer to notice; and until the
          // layout holds a whole content again, nothing it shows is written anywhere.
          openLayout.stopSaving()
          throw new ResourceRollbackError(error, rollback)
        }
        throw error
      } finally {
        endHydration?.()
      }
    },
    saveLoad: {
      current: () => openLayout.current(),
      notSaving: () => openLayout.notSaving(),
      detach: () => openLayout.detach(),
      // The active chart's market, written as the toolbar writes it, and its timeframe ride every
      // save, so a listing can say what the layout shows without opening it. A chart that holds no
      // symbol yet states neither.
      save: (name, opts) => {
        const shown = slots[active]?.handle
        const symbol = shown?.symbol() ? symbolNames(shown.symbolInfo() ?? shown.symbol()).mark : ''
        const timeframe = shown?.timeframe() ?? ''
        const facts = { ...(symbol ? { symbol } : {}), ...(symbol && timeframe ? { timeframe } : {}) }
        return openLayout.save({ name, ...facts, content: api.serialize().content }, opts).then(report)
      },
      load: (id, signal) =>
        openLayout.load(id, signal, (body) => {
          // A layout torn down while the store was answering has no tiles to restore onto, so the
          // load is cancelled rather than refused, and it binds nothing either way.
          if (removed) throw new ResourceAbortError('the layout was disposed during the load')
          api.restore(body.content)
        }).then(report),
      remove: (signal) => openLayout.remove(signal).then(report),
    },
  }

  return {
    api,
    canSave: () => !removed && !openLayout.loading(),
    removeResource: (ref) => openLayout.remove(undefined, ref).then(report),
    handles: () => slots.map((s) => s.handle),
    slots: () => maximized === null ? slots : [slots[maximized]!],
    rects: () => maximized === null ? rects : [{ x: 0, y: 0, w: 1, h: 1 }],
    activeHandle: () => slots[active]?.handle ?? null,
    /** The active tile fills the layout, or gives it back. Private presentation, not content: the
     *  same toggle the Alt gesture and the Alt+Enter chord already run, so an on-chart control is a
     *  third door onto one behavior rather than a second implementation of it. */
    toggleMaximize: () => toggleMaximize(active),
    maximized: () => maximized !== null,
    startNew(content) {
      if (removed) return
      const single = arrangementOf('s')!
      if (arrangement.code !== single.code) retile(single)
      else if (carried) {
        carried = null
        deps.onChange()
      }
      slots[0]!.handle.saveLoad.restore(content)
      const opening = deps.arrangements ? arrangementOf(fallbackArrangement(1, deps.arrangements))! : single
      if (opening.code !== arrangement.code) retile(opening)
    },
    destroy() {
      if (removed) return
      removed = true
      cancelDrag?.()
      clearDividers()
      while (slots.length) destroySlot(slots.pop()!)
    },
  }
}
