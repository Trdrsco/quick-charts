// The chart's EXTENSION SEAM: how code that is not the chart draws on the chart, contributes to its
// menu, and survives a save/load round trip — without the chart learning anything about what that
// code is for. The contract carries prices, times, bars, the pane's own geometry and its palette.
// It carries no account, no position, no order, no execution, no money: a chart that knew those
// would be a trading product wearing a chart's name, and the trading product is a separate organ
// over its own seam.
//
// The lifecycle is deliberately four moves — attach, observe, contribute, detach — because every
// extra move is a way for a host to leak. Two rules make it safe rather than merely small:
//
//   Capability handles, not the renderer. An extension receives price/coordinate conversions, a
//   price-line factory and a primitive mount, never the underlying chart object. Everything it
//   creates through them is TRACKED, so `detach()` takes the drawing down whether or not the
//   extension remembered to. A raw instance would make that impossible to promise.
//
//   A dead context is inert, never explosive. After detach every method is a no-op that returns a
//   neutral value: subscriptions never fire, mutations do nothing, reads answer with the last known
//   truth. An extension torn down mid-flight (a layout re-tile landing in the middle of its async
//   work) cannot throw into the chart's own teardown path.
import type { CreatePriceLineOptions, ISeriesPrimitive, PriceLineOptions, Time } from 'lightweight-charts'
import type { FeedBar } from './datafeed'
import type { ResolvedTheme } from './host'

/** Price display as an extension reads it — the chart's own formatter, so an overlay's label and the
 *  axis beside it can never disagree about what a number looks like. */
export interface ChartPriceFormatter {
  format(price: number): string
  /** Decimal places the format is currently using. */
  precision(): number
}

/** A horizontal level an extension put on the series. Removed for it at detach. */
export interface ChartExtensionPriceLine {
  update(options: Partial<PriceLineOptions>): void
  remove(): void
}

/** The series capabilities an extension draws through. Every factory here returns a handle the
 *  chart also holds: whatever an extension leaves behind comes down with it. */
export interface ChartExtensionSeries {
  createPriceLine(options: CreatePriceLineOptions): ChartExtensionPriceLine
  /** Mount a renderer on the main series; the returned function detaches it. */
  attachPrimitive(primitive: ISeriesPrimitive<Time>): () => void
  /** Price to pixels down from the plot's top edge, or null when the price is off-scale. */
  priceToY(price: number): number | null
  /** Pixels to price, or null before the scale has data. */
  yToPrice(y: number): number | null
  /** Feed seconds to pixels across from the plot's left edge, or null outside the visible range. */
  timeToX(timeSeconds: number): number | null
  /** Pixels to feed seconds, or null outside the visible range. */
  xToTime(x: number): number | null
  /** Drawable width in px: the container less the price scale. An overlay canvas ends here. */
  plotWidth(): number
  /** Suspend the chart's own pan, zoom, pinch and axis scaling for the length of an extension's
   *  drag, and restore them after. Left locked at detach, the chart unlocks itself. */
  lockPanZoom(locked: boolean): void
}

/** The chart pane an extension is attached to: which one, and how big it is right now. */
export interface ChartExtensionPane {
  /** Stable for the pane's life. Two panes of one layout never share it. */
  id: string
  width: number
  height: number
}

/** Bar replay, as a neutral view state: which bar of how many is being shown. */
export interface ChartExtensionReplayState {
  active: boolean
  cursor: number
  total: number
}

/** The chart an extension is attached to, read-only. It answers what is on screen; it does not let
 *  an extension steer the chart, because a host that wants to steer already holds the widget. */
export interface ChartExtensionChart {
  /** Same value as `pane().id` — the chart and its pane are one thing to an extension. */
  id: string
  symbol(): string
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
}

/** Where a menu was raised, in the chart's own terms. */
export interface ChartExtensionMenuContext {
  /** The level the pointer landed on. */
  price: number
  /** That level through the chart's formatter — use it so a contributed row reads like a built-in one. */
  priceText: string
  symbol: string
  timeframe: string
  /** Viewport coordinates of the press. */
  clientX: number
  clientY: number
}

/** A row an extension adds to the chart's level menu. It carries its own action: the chart routes
 *  nothing, so a contributed row cannot collide with a built-in id. */
export interface ChartExtensionMenuItem {
  id: string
  label: string
  shortcut?: string
  checked?: boolean
  run(): void
}

/** Asked on every raise, so rows can depend on the level that was pressed. Returning an empty list
 *  contributes nothing and costs nothing. */
export type ChartExtensionMenuProvider = (context: ChartExtensionMenuContext) => readonly ChartExtensionMenuItem[]

/** A named action an extension offers the host. The minimal shape: an id, a label, whether it can
 *  run now, and how to run it. */
export interface ChartExtensionCommand {
  id: string
  label: string
  /** Omitted reads as always available. */
  available?(): boolean
  execute(): void
}

/** Everything an extension is handed at attach. Every `on…` returns its own unsubscribe; the chart
 *  drops the rest at detach either way. */
export interface ChartExtensionContext {
  chart: ChartExtensionChart
  /** The chart's gesture box — the element the canvas fills. An overlay canvas parents here and
   *  sizes to it. Pointer handlers here compete with the chart's own; take pointer capture. */
  container: HTMLElement
  /** The chrome layer above the gesture box: inert by default, each interactive piece opting back
   *  in with pointer-events. Popovers, cards and editors mount HERE — the gesture box swallows
   *  their clicks. */
  overlay: HTMLElement
  /** The chart's effective palette: the resolved theme with any applied appearance overrides on top. */
  theme(): ResolvedTheme
  formatter(): ChartPriceFormatter
  series: ChartExtensionSeries
  pane(): ChartExtensionPane
  onThemeChange(callback: (theme: ResolvedTheme) => void): () => void
  onSymbolChange(callback: (symbol: string) => void): () => void
  onTimeframeChange(callback: (timeframe: string) => void): () => void
  /** The painted bar series changed: a load, a page back, a live update, a replay step. */
  onBars(callback: (bars: readonly FeedBar[]) => void): () => void
  onReplayChange(callback: (state: ChartExtensionReplayState) => void): () => void
  /** The pane was resized or re-tiled by a layout host. */
  onPaneChange(callback: (pane: ChartExtensionPane) => void): () => void
  /** The chart is going away. Fires before the handle's own `detach()`. */
  onDispose(callback: () => void): () => void
  contributeContextMenu(provider: ChartExtensionMenuProvider): () => void
  contributeCommands(commands: readonly ChartExtensionCommand[]): () => void
}

/** What an extension gives back at attach. `detach` is required; the two state methods are the
 *  opt-in for anything the viewer would expect a saved chart to bring back. */
export interface ChartExtensionHandle {
  /** Viewer state to store in the chart's save blob, under this extension's id. Anything
   *  JSON-serializable. Return undefined to store nothing. */
  serialize?(): unknown
  /** Apply state a previous `serialize()` produced. Never called with another extension's state. */
  restore?(state: unknown): void
  detach(): void
}

/** When the chart re-attaches an extension.
 *  - `chart` (default): one attachment for the pane's life. Symbol changes arrive through
 *    `onSymbolChange`, and the extension decides what of its own state survives them.
 *  - `symbol`: the chart detaches and re-attaches on every symbol switch, so a market-scoped
 *    overlay cannot carry one market's drawing onto another's bars by forgetting to clear it. */
export type ChartExtensionScope = 'chart' | 'symbol'

/** The unit a host adds to a chart. `id` names it in the save blob and must be unique within one
 *  chart; a second registration of an id is ignored rather than allowed to overwrite the first. */
export interface ChartExtension {
  id: string
  scope?: ChartExtensionScope
  attach(context: ChartExtensionContext): ChartExtensionHandle
}

/** What the widget supplies so the extension host can build a context. The widget owns every one of
 *  these; the host owns the fan-out, the tracking and the teardown. */
export interface ChartExtensionHostDeps {
  chartId: string
  container: HTMLElement
  overlay: HTMLElement
  symbol(): string
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
  theme(): ResolvedTheme
  formatter(): ChartPriceFormatter
  pane(): ChartExtensionPane
  series: ChartExtensionSeries
}

/** The contributed commands a host can see and run. The widget kernel grows this registry in
 *  place, under this name. */
export interface CommandRegistry {
  /** Every contributed command that is available right now. */
  list(): readonly ChartExtensionCommand[]
  /** Run one by id. False when nothing carries that id, or it is not available, or it threw. */
  execute(id: string): boolean
}

/** The widget's half of the seam: attach the configured extensions, push the chart's changes at
 *  them, collect what they contribute, and take everything down exactly once. */
export interface ChartExtensionHost {
  symbolChanged(symbol: string): void
  timeframeChanged(timeframe: string): void
  barsChanged(bars: readonly FeedBar[]): void
  replayChanged(state: ChartExtensionReplayState): void
  themeChanged(theme: ResolvedTheme): void
  paneChanged(pane: ChartExtensionPane): void
  /** Rows every attached extension offers for this level, in registration order. */
  menuItems(context: ChartExtensionMenuContext): readonly ChartExtensionMenuItem[]
  commands: CommandRegistry
  /** Viewer state by extension id — the widget nests this under one key of its save blob. */
  serialize(): Record<string, unknown>
  restore(state: unknown): void
  /** Live subscriptions across every attached extension. The leak pin reads it: attach then detach
   *  must return to zero. */
  subscriberCount(): number
  detach(): void
}

/** One attachment's callback sets, one per lane the chart pushes on. */
interface Lanes {
  theme: Set<(theme: ResolvedTheme) => void>
  symbol: Set<(symbol: string) => void>
  timeframe: Set<(timeframe: string) => void>
  bars: Set<(bars: readonly FeedBar[]) => void>
  replay: Set<(state: ChartExtensionReplayState) => void>
  pane: Set<(pane: ChartExtensionPane) => void>
  dispose: Set<() => void>
}

/** One attached extension and everything the chart is holding on its behalf. */
interface Attached {
  extension: ChartExtension
  handle: ChartExtensionHandle
  /** Flipped at detach: every context method reads it and stands down. */
  live: boolean
  lanes: Lanes
  menuProviders: Set<ChartExtensionMenuProvider>
  commands: Map<string, ChartExtensionCommand>
  priceLines: Set<ChartExtensionPriceLine>
  primitives: Set<() => void>
  /** True while this extension holds the chart's pan/zoom lock, so the chart can hand it back. */
  locked: boolean
}

/** Fire a callback set without letting one subscriber's throw stop the others or reach the chart. */
function fanOut<T>(subscribers: Set<(value: T) => void>, value: T): void {
  for (const callback of [...subscribers]) {
    try {
      callback(value)
    } catch {
      /* an extension's own failure is its own — the chart carries on */
    }
  }
}

const newLanes = (): Lanes => ({
  theme: new Set(),
  symbol: new Set(),
  timeframe: new Set(),
  bars: new Set(),
  replay: new Set(),
  pane: new Set(),
  dispose: new Set(),
})

const laneSizes = (lanes: Lanes): number =>
  lanes.theme.size + lanes.symbol.size + lanes.timeframe.size + lanes.bars.size + lanes.replay.size + lanes.pane.size + lanes.dispose.size

const clearLanes = (lanes: Lanes): void => {
  lanes.theme.clear()
  lanes.symbol.clear()
  lanes.timeframe.clear()
  lanes.bars.clear()
  lanes.replay.clear()
  lanes.pane.clear()
  lanes.dispose.clear()
}

export function createExtensionHost(deps: ChartExtensionHostDeps, extensions: readonly ChartExtension[] = []): ChartExtensionHost {
  const attached: Attached[] = []
  let hostLive = true

  const detachOne = (record: Attached): void => {
    if (!record.live) return
    record.live = false
    // The extension's own teardown first, while its handles still work, then the sweep for
    // everything it did not take down itself.
    try {
      record.handle.detach()
    } catch {
      /* a failing teardown must not strand the sweep below */
    }
    for (const line of [...record.priceLines]) {
      try {
        line.remove()
      } catch {
        /* the series may already be gone */
      }
    }
    record.priceLines.clear()
    for (const detachPrimitive of [...record.primitives]) {
      try {
        detachPrimitive()
      } catch {
        /* likewise */
      }
    }
    record.primitives.clear()
    if (record.locked) {
      record.locked = false
      try {
        deps.series.lockPanZoom(false)
      } catch {
        /* mid-teardown */
      }
    }
    clearLanes(record.lanes)
    record.menuProviders.clear()
    record.commands.clear()
  }

  const attachOne = (extension: ChartExtension, at?: number): void => {
    if (!hostLive) return
    // One id, one attachment: a duplicate would share the save-blob key with the original and
    // silently overwrite its viewer state.
    if (attached.some((a) => a.extension.id === extension.id)) return
    const record: Attached = {
      extension,
      handle: { detach: () => {} },
      live: true,
      lanes: newLanes(),
      menuProviders: new Set(),
      commands: new Map(),
      priceLines: new Set(),
      primitives: new Set(),
      locked: false,
    }

    /** Subscribe once and unsubscribe idempotently; inert the moment this extension is gone. */
    const subscribe = <T>(set: Set<(value: T) => void>, callback: (value: T) => void): (() => void) => {
      if (!record.live) return () => {}
      set.add(callback)
      return () => {
        set.delete(callback)
      }
    }

    const series: ChartExtensionSeries = {
      createPriceLine(options) {
        if (!record.live) return { update: () => {}, remove: () => {} }
        const line = deps.series.createPriceLine(options)
        const tracked: ChartExtensionPriceLine = {
          update: (next) => {
            if (record.live) line.update(next)
          },
          remove: () => {
            if (!record.priceLines.delete(tracked)) return
            line.remove()
          },
        }
        record.priceLines.add(tracked)
        return tracked
      },
      attachPrimitive(primitive) {
        if (!record.live) return () => {}
        const detachPrimitive = deps.series.attachPrimitive(primitive)
        const tracked = (): void => {
          if (!record.primitives.delete(tracked)) return
          detachPrimitive()
        }
        record.primitives.add(tracked)
        return tracked
      },
      priceToY: (price) => (record.live ? deps.series.priceToY(price) : null),
      yToPrice: (y) => (record.live ? deps.series.yToPrice(y) : null),
      timeToX: (time) => (record.live ? deps.series.timeToX(time) : null),
      xToTime: (x) => (record.live ? deps.series.xToTime(x) : null),
      plotWidth: () => (record.live ? deps.series.plotWidth() : 0),
      lockPanZoom(locked) {
        if (!record.live) return
        record.locked = locked
        deps.series.lockPanZoom(locked)
      },
    }

    const context: ChartExtensionContext = {
      chart: {
        id: deps.chartId,
        symbol: () => deps.symbol(),
        timeframe: () => deps.timeframe(),
        bars: () => deps.bars(),
        replay: () => deps.replay(),
      },
      container: deps.container,
      overlay: deps.overlay,
      theme: () => deps.theme(),
      formatter: () => deps.formatter(),
      series,
      pane: () => deps.pane(),
      onThemeChange: (callback) => subscribe(record.lanes.theme, callback),
      onSymbolChange: (callback) => subscribe(record.lanes.symbol, callback),
      onTimeframeChange: (callback) => subscribe(record.lanes.timeframe, callback),
      onBars: (callback) => subscribe(record.lanes.bars, callback),
      onReplayChange: (callback) => subscribe(record.lanes.replay, callback),
      onPaneChange: (callback) => subscribe(record.lanes.pane, callback),
      onDispose(callback) {
        if (!record.live) return () => {}
        record.lanes.dispose.add(callback)
        return () => {
          record.lanes.dispose.delete(callback)
        }
      },
      contributeContextMenu(provider) {
        if (!record.live) return () => {}
        record.menuProviders.add(provider)
        return () => {
          record.menuProviders.delete(provider)
        }
      },
      contributeCommands(commands) {
        if (!record.live) return () => {}
        const added: string[] = []
        for (const command of commands) {
          if (record.commands.has(command.id)) continue
          record.commands.set(command.id, command)
          added.push(command.id)
        }
        return () => {
          for (const id of added) record.commands.delete(id)
        }
      },
    }

    // An extension that throws while attaching gets nothing: no record, no subscriptions, no save
    // slot, and nothing it drew or locked before throwing stays on the chart. The chart never
    // learns why, and never fails to mount because of it.
    try {
      record.handle = extension.attach(context)
    } catch {
      detachOne(record)
      return
    }
    attached.splice(at ?? attached.length, 0, record)
  }

  const liveRecords = (): Attached[] => attached.filter((record) => record.live)

  for (const extension of extensions) attachOne(extension)

  const host: ChartExtensionHost = {
    symbolChanged(symbol) {
      if (!hostLive) return
      // A symbol-scoped extension is rebuilt rather than told: the whole reason for declaring the
      // scope is that nothing it holds is valid on another market.
      for (const record of [...attached]) {
        if (record.extension.scope !== 'symbol') continue
        const extension = record.extension
        detachOne(record)
        const at = attached.indexOf(record)
        if (at !== -1) attached.splice(at, 1)
        attachOne(extension, at === -1 ? undefined : at)
      }
      // A re-attached extension reads the new symbol from its context; only the chart-scoped ones
      // are told, and a re-attachment keeps its slot so contributed rows keep their order.
      for (const record of liveRecords()) {
        if (record.extension.scope !== 'symbol') fanOut(record.lanes.symbol, symbol)
      }
    },
    timeframeChanged(timeframe) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.timeframe, timeframe)
    },
    barsChanged(bars) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.bars, bars)
    },
    replayChanged(state) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.replay, state)
    },
    themeChanged(theme) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.theme, theme)
    },
    paneChanged(pane) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.pane, pane)
    },
    menuItems(context) {
      if (!hostLive) return []
      const rows: ChartExtensionMenuItem[] = []
      for (const record of liveRecords()) {
        for (const provider of [...record.menuProviders]) {
          try {
            rows.push(...provider(context))
          } catch {
            /* a provider that throws contributes nothing, and the menu still opens */
          }
        }
      }
      return rows
    },
    commands: {
      list() {
        if (!hostLive) return []
        const out: ChartExtensionCommand[] = []
        for (const record of liveRecords()) {
          for (const command of record.commands.values()) if (command.available?.() !== false) out.push(command)
        }
        return out
      },
      execute(id) {
        if (!hostLive) return false
        for (const record of liveRecords()) {
          const command = record.commands.get(id)
          if (!command || command.available?.() === false) continue
          try {
            command.execute()
          } catch {
            return false
          }
          return true
        }
        return false
      },
    },
    serialize() {
      const out: Record<string, unknown> = {}
      for (const record of liveRecords()) {
        if (!record.handle.serialize) continue
        try {
          const state = record.handle.serialize()
          if (state !== undefined) out[record.extension.id] = state
        } catch {
          /* an extension that cannot describe itself simply saves nothing */
        }
      }
      return out
    },
    restore(state) {
      if (!hostLive || !state || typeof state !== 'object') return
      const byId = state as Record<string, unknown>
      for (const record of liveRecords()) {
        // Namespaced by id, so one extension can neither read nor corrupt another's slot.
        if (!record.handle.restore || !Object.hasOwn(byId, record.extension.id)) continue
        try {
          record.handle.restore(byId[record.extension.id])
        } catch {
          /* a blob this version cannot read leaves the extension at its defaults */
        }
      }
    },
    subscriberCount() {
      let total = 0
      for (const record of liveRecords()) total += laneSizes(record.lanes)
      return total
    },
    detach() {
      if (!hostLive) return
      hostLive = false
      for (const record of [...attached]) {
        if (!record.live) continue
        // Dispose fires while the context is still live: a subscriber's last read must answer.
        for (const callback of [...record.lanes.dispose]) {
          try {
            callback()
          } catch {
            /* an extension's own failure is its own — the chart carries on */
          }
        }
        detachOne(record)
      }
      attached.length = 0
    },
  }
  return host
}
