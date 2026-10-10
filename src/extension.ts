// The chart's EXTENSION SEAM: how a host's own code draws on the chart, contributes to its
// menu, and survives a save/load round trip — without the chart learning anything about what that
// code is for. The contract carries prices, times, bars, the pane's own geometry and its palette,
// in chart words only, and whatever a host builds over this seam keeps its own meaning in the host.
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
import { blanks, type HideState } from './drawings/hideModel'
import type { CanvasTheme } from './theme/renderer'
import type { MarkPainters } from './markPainters'

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

/** The chart an extension is attached to, read-only. It answers what is on screen, and a host
 *  steers the chart through the widget it already holds. */
export interface ChartExtensionChart {
  /** Same value as `pane().id` — the chart and its pane are one thing to an extension. */
  id: string
  symbol(): string
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
  /** The feed's last reported status for the charted symbol ('live', 'no-data', a backend code),
   *  or null before the subscription has said anything. An overlay that prices something against
   *  the last bar reads this first: a bar the feed is not calling live is history, not a mark. */
  feedStatus(): string | null
}

/** Where a menu was raised, in the chart's own terms. */
export interface ChartExtensionMenuContext {
  /** The level the pointer landed on. */
  price: number
  /** That level through the chart's formatter — use it so a contributed row reads like a built-in one. */
  priceText: string
  /** The charted symbol as the feed names it: what an action on the market is sent for. */
  symbol: string
  /** The symbol's title from its symbology (`BTC / USDC` for a pair, the feed's short name, or
   *  the bare ticker): what a row that names the market prints. */
  name: string
  timeframe: string
  /** Viewport coordinates of the press. */
  clientX: number
  clientY: number
  /** The table the press landed on, and whether a cell of it is being typed in; absent where it
   *  landed on none. A press on a drawing raises that drawing's own menu, which carries the rows a
   *  host contributes here in the places the chart's menu gives them. */
  table?: { cell: boolean }
}

/** One filled or stroked shape of a contributed glyph, on the menu's own 28-unit grid. Path data
 *  and a closed set of paint values are the whole vocabulary: a contribution carries no markup, no
 *  attribute passthrough, no URL and nowhere to hang a handler, so an icon is a drawing and can
 *  never be a behaviour. The chart builds it as elements and writes only the attributes this
 *  contract names. */
export interface ChartExtensionIconPath {
  /** SVG path data, up to 2048 characters, every number in it finite. Only path-data characters
   *  are accepted; a value holding anything else is dropped and that shape is not drawn. */
  d: string
  /** `solid` paints the shape in the current text colour (the default); `outline` strokes its
   *  edge in that colour instead. No other value exists, so a glyph can never name a colour of its
   *  own, a gradient, or a resource to load. */
  paint?: 'solid' | 'outline'
  /** The stroke width for an `outline` shape, in grid units: above 0 and up to 8. Default 1. */
  width?: number
  /** `evenodd` for a shape drawn with holes in it. */
  rule?: 'nonzero' | 'evenodd'
}

/** An inert vector glyph an extension contributes for its own row. The chart draws it in the same
 *  icon gutter as its built-in glyphs, in the current text colour, so a contributed row is
 *  indistinguishable from a built-in one at the glass. The chart names no glyph vocabulary of its
 *  own here: what a host's rows mean is the host's business. */
export interface ChartExtensionIcon {
  /** Up to 8 shapes, drawn in order. A glyph with none, or with more than that, draws nothing and
   *  the row reads exactly as a row that contributed no glyph at all. */
  paths: readonly ChartExtensionIconPath[]
}

/** A row an extension adds to the chart's context menu. It carries its own action: the chart routes
 *  nothing, so a contributed row cannot collide with a built-in id. */
export interface ChartExtensionMenuItem {
  id: string
  label: string
  shortcut?: string
  checked?: boolean
  /** The row's glyph. Omitted leaves the gutter empty and the label still aligned. */
  icon?: ChartExtensionIcon
  /** Where the row sits. `level` (the default) is an action on the price the pointer landed on and
   *  joins the group under Copy price and Paste; `view` is a switch over what the chart shows and
   *  joins the group under the remove rows. */
  group?: 'level' | 'view'
  run(): void
}

/** A layer an extension draws that the drawing toolbar's eye can blank. It joins the eye's menu
 *  after the chart's own layers and before "Hide all", which blanks it too, and it wears the
 *  layer's own two marks on the eye while it is the chosen subject. */
export interface ChartExtensionHideLayer {
  /** Unique within one chart; the mode the hide command names for this layer. */
  id: string
  /** The row's wording in both states, in the extension's own language. */
  label: { hide: string; show: string }
  /** The eye's mark while this layer is the subject: shown, and struck through when blanked. */
  icon: { shown: ChartExtensionIcon; hidden: ChartExtensionIcon }
  /** Blank or restore the layer. Called with the current state at contribution, and again on
   *  every change to what the eye is doing. */
  apply(hidden: boolean): void
}

/** The chart's side of a contributed layer: read whether it is blanked and flip it, through the
 *  same eye the drawing toolbar drives, so a switch on the extension's own surface and the eye
 *  agree. */
export interface ChartExtensionHideLayerHandle {
  hidden(): boolean
  setHidden(hidden: boolean): void
  /** Withdraw the layer from the eye. Detach withdraws it either way. */
  remove(): void
}

/** Builds an extension's context menu rows. The chart calls it on every raise with that moment's
 *  context, so the rows can depend on the level that was pressed. An empty list contributes nothing
 *  and costs nothing. */
export type ChartExtensionMenuBuilder = (context: ChartExtensionMenuContext) => readonly ChartExtensionMenuItem[]

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
  /** The widget's layer on the document body, themed as the root is. A popover that must stand
   *  over every pane and over whatever the page stacks around the widget mounts HERE, at viewport
   *  coordinates; the context menu does the same. */
  layer: HTMLElement
  /** The chart's effective canvas palette: the mode's resolved theme under the chart settings
   *  in effect, projected onto the values a canvas draws with. */
  theme(): CanvasTheme
  formatter(): ChartPriceFormatter
  /** The name symbology gives the charted market, for a surface that prints it; `chart.symbol()`
   *  stays the ticker an action is sent for. */
  symbolTitle(): string
  /** The host's mark painters: the same value the legend and the search rows paint with, so a
   *  surface that names a market paints it the same way rather than shipping artwork of its own.
   *  A painter is null where the host lent none, and then a surface writes the name alone. Each
   *  receives the element to paint into and the size of the box, and answers the disposer that
   *  empties it. */
  painters: MarkPainters
  series: ChartExtensionSeries
  pane(): ChartExtensionPane
  onThemeChange(callback: (theme: CanvasTheme) => void): () => void
  onSymbolChange(callback: (symbol: string) => void): () => void
  onTimeframeChange(callback: (timeframe: string) => void): () => void
  /** The painted bar series changed: a load, a page back, a live update, a replay step. */
  onBars(callback: (bars: readonly FeedBar[]) => void): () => void
  onReplayChange(callback: (state: ChartExtensionReplayState) => void): () => void
  /** The chart was resized, or re-tiled by the widget's layout. */
  onPaneChange(callback: (pane: ChartExtensionPane) => void): () => void
  /** Whether this chart is the widget's active chart: the one its keyboard, its toolbar and a host's
   *  actions address. A sole chart is active. */
  active(): boolean
  /** The chart became the active chart, or stopped being it. */
  onActiveChange(callback: (active: boolean) => void): () => void
  /** The chart is going away. Fires before the handle's own `detach()`. */
  onDispose(callback: () => void): () => void
  contributeContextMenu(build: ChartExtensionMenuBuilder): () => void
  contributeCommands(commands: readonly ChartExtensionCommand[]): () => void
  contributeHideLayer(layer: ChartExtensionHideLayer): ChartExtensionHideLayerHandle
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
  layer: HTMLElement
  symbol(): string
  symbolTitle(): string
  painters: MarkPainters
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
  feedStatus(): string | null
  theme(): CanvasTheme
  formatter(): ChartPriceFormatter
  pane(): ChartExtensionPane
  active(): boolean
  series: ChartExtensionSeries
  /** Register one contributed command with the chart's own command registry, and answer its
   *  unregister. There is exactly one registry, so a contributed command is reachable from the
   *  same menu, keyboard and host-automation surfaces as a built-in verb, and is refused by the same
   *  access policy. */
  registerCommand(command: ChartExtensionCommand): () => void
  /** What the drawing toolbar's eye is doing, and the one writer that changes it. A contributed
   *  layer's handle reads and flips through these, so it can never disagree with the eye. */
  hideState(): HideState
  setHide(state: HideState): void
  /** The set of contributed layers changed: the eye re-lists them and re-applies its state. */
  hideLayersChanged(): void
}

/** The widget's half of the seam: attach the configured extensions, push the chart's changes at
 *  them, collect what they contribute, and take everything down exactly once. */
export interface ChartExtensionHost {
  symbolChanged(symbol: string): void
  timeframeChanged(timeframe: string): void
  barsChanged(bars: readonly FeedBar[]): void
  replayChanged(state: ChartExtensionReplayState): void
  themeChanged(theme: CanvasTheme): void
  paneChanged(pane: ChartExtensionPane): void
  activeChanged(active: boolean): void
  /** Rows every attached extension offers for this level, in registration order. */
  menuItems(context: ChartExtensionMenuContext): readonly ChartExtensionMenuItem[]
  /** The layers every attached extension offers the eye, in contribution order. */
  hideLayers(): readonly ChartExtensionHideLayer[]
  /** Viewer state by extension id — the widget nests this under one key of its save blob. */
  serialize(): Record<string, unknown>
  /** Apply opaque state as usual, and report whether all registered saved state round-tripped.
   *  Internal recovery evidence, not validation of an extension's arbitrary private state. */
  restore(state: unknown): boolean
  /** Live subscriptions across every attached extension. The leak pin reads it: attach then detach
   *  must return to zero. */
  subscriberCount(): number
  detach(): void
}

/** One attachment's callback sets, one per lane the chart pushes on. */
interface Lanes {
  theme: Set<(theme: CanvasTheme) => void>
  symbol: Set<(symbol: string) => void>
  timeframe: Set<(timeframe: string) => void>
  bars: Set<(bars: readonly FeedBar[]) => void>
  replay: Set<(state: ChartExtensionReplayState) => void>
  pane: Set<(pane: ChartExtensionPane) => void>
  active: Set<(active: boolean) => void>
  dispose: Set<() => void>
}

/** One attached extension and everything the chart is holding on its behalf. */
interface Attached {
  extension: ChartExtension
  handle: ChartExtensionHandle
  /** Flipped at detach: every context method reads it and stands down. */
  live: boolean
  lanes: Lanes
  menuBuilders: Set<ChartExtensionMenuBuilder>
  /** The layers this extension offered the eye, by id. */
  hideLayers: Map<string, ChartExtensionHideLayer>
  /** The unregister the chart's command registry answered for each command this extension
   *  contributed, so a detach takes its verbs out of the one registry with it. */
  commands: Map<string, () => void>
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
  active: new Set(),
  dispose: new Set(),
})

const laneSizes = (lanes: Lanes): number =>
  lanes.theme.size + lanes.symbol.size + lanes.timeframe.size + lanes.bars.size + lanes.replay.size + lanes.pane.size + lanes.active.size + lanes.dispose.size

const clearLanes = (lanes: Lanes): void => {
  lanes.active.clear()
  lanes.theme.clear()
  lanes.symbol.clear()
  lanes.timeframe.clear()
  lanes.bars.clear()
  lanes.replay.clear()
  lanes.pane.clear()
  lanes.dispose.clear()
}

/** Compare normalized JSON trees without giving object insertion order semantic meaning. The
 *  extension's serializer supplies the state vocabulary; this is not another extension schema. */
function sameJsonState(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && sameJsonState(a[key], b[key]))
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
    record.menuBuilders.clear()
    if (record.hideLayers.size) {
      record.hideLayers.clear()
      notifyHideLayers()
    }
    for (const unregister of record.commands.values()) unregister()
    record.commands.clear()
  }

  /** The eye re-lists its subjects. Told after the record changed, never during a sweep the chart
   *  is already making, and a chart mid-teardown hears nothing. */
  const notifyHideLayers = (): void => {
    if (!hostLive) return
    try {
      deps.hideLayersChanged()
    } catch {
      /* the eye's own failure is its own */
    }
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
      menuBuilders: new Set(),
      hideLayers: new Map(),
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
        feedStatus: () => deps.feedStatus(),
      },
      container: deps.container,
      overlay: deps.overlay,
      layer: deps.layer,
      theme: () => deps.theme(),
      formatter: () => deps.formatter(),
      symbolTitle: () => deps.symbolTitle(),
      painters: deps.painters,
      series,
      pane: () => deps.pane(),
      active: () => deps.active(),
      onThemeChange: (callback) => subscribe(record.lanes.theme, callback),
      onSymbolChange: (callback) => subscribe(record.lanes.symbol, callback),
      onTimeframeChange: (callback) => subscribe(record.lanes.timeframe, callback),
      onBars: (callback) => subscribe(record.lanes.bars, callback),
      onReplayChange: (callback) => subscribe(record.lanes.replay, callback),
      onPaneChange: (callback) => subscribe(record.lanes.pane, callback),
      onActiveChange: (callback) => subscribe(record.lanes.active, callback),
      onDispose(callback) {
        if (!record.live) return () => {}
        record.lanes.dispose.add(callback)
        return () => {
          record.lanes.dispose.delete(callback)
        }
      },
      contributeContextMenu(build) {
        if (!record.live) return () => {}
        record.menuBuilders.add(build)
        return () => {
          record.menuBuilders.delete(build)
        }
      },
      contributeCommands(commands) {
        if (!record.live) return () => {}
        const added: string[] = []
        for (const command of commands) {
          if (record.commands.has(command.id)) continue
          record.commands.set(command.id, deps.registerCommand(command))
          added.push(command.id)
        }
        return () => {
          for (const id of added) {
            record.commands.get(id)?.()
            record.commands.delete(id)
          }
        }
      },
      contributeHideLayer(layer) {
        // A dead context, a second layer under one id, or an id the chart's own layers already
        // hold, gets a handle that reads "shown" and changes nothing.
        const taken = !record.live || record.hideLayers.has(layer.id) || attached.some((a) => a.live && a.hideLayers.has(layer.id)) || layer.id === 'drawings' || layer.id === 'indicators' || layer.id === 'all'
        if (taken) return { hidden: () => false, setHidden: () => {}, remove: () => {} }
        record.hideLayers.set(layer.id, layer)
        notifyHideLayers()
        const held = (): boolean => record.live && record.hideLayers.get(layer.id) === layer
        return {
          hidden: () => held() && blanks(deps.hideState(), layer.id),
          setHidden(hidden) {
            if (!held()) return
            // Blanking points the eye at this layer; restoring releases it from whatever subject
            // was blanking it, this layer or all.
            deps.setHide({ mode: layer.id, on: hidden })
          },
          remove() {
            if (!held()) return
            record.hideLayers.delete(layer.id)
            notifyHideLayers()
          },
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
    activeChanged(active) {
      if (!hostLive) return
      for (const record of liveRecords()) fanOut(record.lanes.active, active)
    },
    menuItems(context) {
      if (!hostLive) return []
      const rows: ChartExtensionMenuItem[] = []
      for (const record of liveRecords()) {
        for (const build of [...record.menuBuilders]) {
          try {
            rows.push(...build(context))
          } catch {
            /* a builder that throws contributes nothing, and the menu still opens */
          }
        }
      }
      return rows
    },
    hideLayers() {
      if (!hostLive) return []
      return liveRecords().flatMap((record) => [...record.hideLayers.values()])
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
      if (!hostLive || !state || typeof state !== 'object' || Array.isArray(state)) return false
      const byId = state as Record<string, unknown>
      let complete = true
      for (const record of liveRecords()) {
        // Namespaced by id, so one extension can neither read nor corrupt another's slot.
        const supplied = Object.hasOwn(byId, record.extension.id)
        try {
          // Snapshot before handing opaque state to a callback that could mutate its argument.
          const expected = supplied ? JSON.stringify(byId[record.extension.id]) : undefined
          if (record.handle.restore && supplied) record.handle.restore(byId[record.extension.id])
          // A stateful owner must actually accept its own complete serialized namespace. A void
          // callback alone proves nothing: it can silently ignore invalid leaves or patch only
          // part of the old state. JSON normalization preserves toJSON/undefined semantics, while
          // structural comparison permits reordered keys. Unknown ids remain ignored.
          const actual = record.handle.serialize ? JSON.stringify(record.handle.serialize()) : undefined
          if (actual !== undefined || record.handle.restore) {
            if (!supplied || !record.handle.restore || expected === undefined || actual === undefined || !sameJsonState(JSON.parse(expected), JSON.parse(actual))) complete = false
          }
        } catch {
          // Normal restore remains tolerant, but a failed callback or serializer cannot certify
          // recovery or a rollback. Stateful extensions without both methods cannot prove it.
          complete = false
        }
      }
      return complete
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
