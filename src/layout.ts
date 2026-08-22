// The multi-chart LAYOUT host: N widget panes tiled by an arrangement code, one ACTIVE pane, and
// the five reference sync contracts (docs/chart-layouts-corpus.md §2.2, verbatim):
//   symbol     "Symbol changes on all charts within the layout"
//   interval   "Interval changes on all charts within the layout"
//   crosshair  "Crosshair is synced across all charts within the layout"
//   time       "When a chart is clicked, all charts within the layout display the same point of time"
//   dateRange  "Date range changes on all charts within the layout"
// Symbol/interval/date-range REPLAY a change onto every pane; crosshair mirrors continuously; time
// fires on click, centering every pane on the clicked moment. The whole layout serializes as ONE
// content blob — the reference's own storage shape for a multi-chart layout.
import { arrangementOf, type Arrangement } from './layoutGrid'
import { createChart, type ChartWidgetApi } from './host'
import type { ChartWidgetOptions } from './widget'

export interface LayoutSyncFlags {
  symbol: boolean
  interval: boolean
  crosshair: boolean
  time: boolean
  dateRange: boolean
}

const SYNC_OFF: LayoutSyncFlags = { symbol: false, interval: false, crosshair: false, time: false, dateRange: false }

export interface ChartLayoutOptions {
  /** The element the layout tiles. It becomes position:relative; panes are absolute children. */
  container: HTMLElement
  /** Everything the panes share (datafeed, theme, storage, …). Per-pane container/symbol/timeframe
   *  are the layout's to manage. NOTE: options that write sticky per-device state (the widget's
   *  last-symbol/timeframe keys) are shared across panes last-writer-wins — a layout's real state
   *  lives in its serialized blob, not those keys. */
  base: Omit<ChartWidgetOptions, 'container' | 'symbol' | 'timeframe'>
  /** Starting arrangement code (default 's'). Unknown codes throw — a host picks from the catalog. */
  arrangement?: string
  /** Per-pane starting symbol/timeframe, index-aligned to the arrangement's panes. */
  panes?: { symbol?: string; timeframe?: string }[]
  sync?: Partial<LayoutSyncFlags>
  /** Outline color the active pane wears (any CSS color). */
  accent?: string
  events?: {
    onActivePane?: (index: number) => void
    /** Anything a host would save changed: arrangement, sync flags, a pane's symbol/timeframe. */
    onChange?: () => void
  }
}

export interface ChartLayoutApi {
  arrangement(): string
  /** Re-tile to another arrangement. Surviving panes keep their charts; new panes clone the
   *  active pane's symbol/timeframe; excess panes are torn down. */
  setArrangement(code: string): void
  panes(): readonly ChartWidgetApi[]
  activePane(): number
  setActivePane(index: number): void
  sync(): LayoutSyncFlags
  setSync(partial: Partial<LayoutSyncFlags>): void
  /** The whole layout as ONE opaque content blob (arrangement + sync + every pane's content). */
  serialize(): { content: string }
  restore(content: string): void
  remove(): void
}

const LAYOUT_CONTENT_V = 1

export function createChartLayout(options: ChartLayoutOptions): ChartLayoutApi {
  const container = options.container
  const accent = options.accent ?? '#2962ff'
  let removed = false
  let flags: LayoutSyncFlags = { ...SYNC_OFF, ...(options.sync ?? {}) }
  let active = 0
  /** True while the bus replays a change onto sibling panes — their event echoes are dropped, so
   *  a symbol change fans out once instead of every pane re-broadcasting the same move. */
  let applying = false

  const prevPosition = container.style.position
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'

  interface Pane {
    el: HTMLElement
    api: ChartWidgetApi
    unsubs: (() => void)[]
  }
  const panes: Pane[] = []

  const arr0 = arrangementOf(options.arrangement ?? 's')
  if (!arr0) throw new Error(`unknown arrangement code ${String(options.arrangement)}`)
  let arrangement: Arrangement = arr0

  const notifyChange = () => options.events?.onChange?.()

  const place = (el: HTMLElement, i: number) => {
    const r = arrangement.rects[i]!
    // Half-pixel insets leave a 1px seam between panes — the container's background is the divider.
    el.style.position = 'absolute'
    el.style.left = `calc(${r.x * 100}% + 0.5px)`
    el.style.top = `calc(${r.y * 100}% + 0.5px)`
    el.style.width = `calc(${r.w * 100}% - 1px)`
    el.style.height = `calc(${r.h * 100}% - 1px)`
  }

  const paintActive = () => {
    for (let i = 0; i < panes.length; i++) {
      // The outline only means something with a sibling to be active AGAINST.
      panes[i]!.el.style.outline = i === active && panes.length > 1 ? `1px solid ${accent}` : 'none'
      panes[i]!.el.style.outlineOffset = '-1px'
      panes[i]!.el.style.zIndex = i === active ? '1' : '0'
    }
  }

  const setActive = (index: number) => {
    if (removed || index === active || index < 0 || index >= panes.length) return
    active = index
    paintActive()
    options.events?.onActivePane?.(index)
  }

  /** Fan a mirror out to every pane but the source, with echoes suppressed. */
  const fanOut = (source: number, apply: (api: ChartWidgetApi) => void) => {
    if (applying) return
    applying = true
    try {
      for (let i = 0; i < panes.length; i++) if (i !== source) apply(panes[i]!.api)
    } finally {
      applying = false
    }
  }

  const wireSync = (pane: Pane, index: () => number) => {
    const { api } = pane
    pane.unsubs.push(
      api.sync.onCrosshair((t) => {
        if (flags.crosshair) fanOut(index(), (other) => other.sync.setCrosshair(t))
      }),
      api.sync.onTimeClick((t) => {
        // The contract centers EVERY chart on the clicked moment, the clicked one included.
        if (flags.time && !applying) {
          applying = true
          try {
            for (const p of panes) p.api.sync.centerOn(t)
          } finally {
            applying = false
          }
        }
      }),
      api.sync.onVisibleRange((r) => {
        if (flags.dateRange) fanOut(index(), (other) => other.sync.setVisibleRange(r))
      }),
    )
  }

  const createPane = (init?: { symbol?: string; timeframe?: string }): Pane => {
    const el = document.createElement('div')
    container.appendChild(el)
    const pane: Pane = { el, api: null as unknown as ChartWidgetApi, unsubs: [] }
    const index = () => panes.indexOf(pane)
    const baseEvents = options.base.events ?? {}
    pane.api = createChart({
      ...options.base,
      container: el,
      ...(init?.symbol ? { symbol: init.symbol } : {}),
      ...(init?.timeframe ? { timeframe: init.timeframe } : {}),
      events: {
        ...baseEvents,
        onSymbolChange: (s) => {
          baseEvents.onSymbolChange?.(s)
          if (flags.symbol) fanOut(index(), (other) => other.setSymbol(s))
          notifyChange()
        },
        onTimeframeChange: (tf) => {
          baseEvents.onTimeframeChange?.(tf)
          if (flags.interval) fanOut(index(), (other) => other.setTimeframe(tf))
          notifyChange()
        },
      },
    })
    wireSync(pane, index)
    const onDown = () => setActive(index())
    el.addEventListener('pointerdown', onDown, true)
    pane.unsubs.push(() => el.removeEventListener('pointerdown', onDown, true))
    return pane
  }

  const destroyPane = (pane: Pane) => {
    for (const u of pane.unsubs) u()
    pane.api.remove()
    pane.el.remove()
  }

  const applyArrangement = (next: Arrangement) => {
    arrangement = next
    const cloneFrom = panes[active]?.api
    while (panes.length > next.count) destroyPane(panes.pop()!)
    while (panes.length < next.count)
      panes.push(
        createPane(cloneFrom ? { symbol: cloneFrom.symbol(), timeframe: cloneFrom.timeframe() } : options.panes?.[panes.length]),
      )
    for (let i = 0; i < panes.length; i++) place(panes[i]!.el, i)
    if (active >= panes.length) active = panes.length - 1
    paintActive()
  }

  // Initial build.
  for (let i = 0; i < arrangement.count; i++) {
    panes.push(createPane(options.panes?.[i]))
    place(panes[i]!.el, i)
  }
  paintActive()

  const api: ChartLayoutApi = {
    arrangement: () => arrangement.code,
    setArrangement(code) {
      if (removed || code === arrangement.code) return
      const next = arrangementOf(code)
      if (!next) throw new Error(`unknown arrangement code ${code}`)
      applyArrangement(next)
      notifyChange()
    },
    panes: () => panes.map((p) => p.api),
    activePane: () => active,
    setActivePane: (i) => setActive(i),
    sync: () => ({ ...flags }),
    setSync(partial) {
      if (removed) return
      flags = { ...flags, ...partial }
      notifyChange()
    },
    serialize() {
      return {
        content: JSON.stringify({
          v: LAYOUT_CONTENT_V,
          arrangement: arrangement.code,
          sync: flags,
          active,
          panes: panes.map((p) => {
            const s = p.api.saveLoad.serialize()
            return { symbol: s.symbol, tf: s.timeframe, content: s.content }
          }),
        }),
      }
    },
    restore(content) {
      if (removed) return
      const c = JSON.parse(content) as {
        v?: unknown
        arrangement?: unknown
        sync?: unknown
        active?: unknown
        panes?: unknown
      }
      if (c.v !== LAYOUT_CONTENT_V) throw new Error(`unsupported layout content version ${String(c.v)}`)
      const next = typeof c.arrangement === 'string' ? arrangementOf(c.arrangement) : null
      if (next) applyArrangement(next)
      if (c.sync && typeof c.sync === 'object') flags = { ...SYNC_OFF, ...(c.sync as Partial<LayoutSyncFlags>) }
      const savedPanes = Array.isArray(c.panes) ? (c.panes as { symbol?: unknown; tf?: unknown; content?: unknown }[]) : []
      // Replay each pane's blob with the bus muted — a restore is placement, never a sync event.
      applying = true
      try {
        for (let i = 0; i < panes.length; i++) {
          const saved = savedPanes[i]
          if (!saved) continue
          if (typeof saved.content === 'string') panes[i]!.api.saveLoad.restore(saved.content)
          else {
            if (typeof saved.symbol === 'string' && saved.symbol) panes[i]!.api.setSymbol(saved.symbol)
            if (typeof saved.tf === 'string' && saved.tf) panes[i]!.api.setTimeframe(saved.tf)
          }
        }
      } finally {
        applying = false
      }
      if (typeof c.active === 'number' && c.active >= 0 && c.active < panes.length) {
        active = c.active
        paintActive()
      }
    },
    remove() {
      if (removed) return
      removed = true
      while (panes.length) destroyPane(panes.pop()!)
      container.style.position = prevPosition
    },
  }
  return api
}
