// The drawing plane: the layer, its rail, and the narrowed surface a host drives it through.
//
// The public surface is a REAL subset of the layer's handle, not a type-level narrowing: symbol
// and timeframe flow, the tick grid, the price formatter and teardown stay chart-owned, so a host
// cannot desync the layer from the bars under it. An untyped consumer must not find them either,
// which is why the object below is built by hand rather than spread.
import { attachDrawings, type DrawingsEvents, type DrawingsHandle } from '../drawings'
import { mountDrawingsRail, type DrawingsRail } from '../drawingsRail'
import type { ISeriesApi, IChartApi, SeriesType } from 'lightweight-charts'
import type { FeedBar } from '../datafeed'
import type { ChartI18n } from '../i18n'
import type { ChartSaveLoadAdapter, ResourceRef } from '../resources'
import type { AccessPolicy } from './options'

/** The drawing surface a host drives. */
export type ChartDrawingsApi = Omit<DrawingsHandle, 'setSymbol' | 'setTimeframe' | 'setTick' | 'setPriceFormatter' | 'destroy'>

export interface DrawingsLayer {
  /** The narrowed public surface, or null when the drawings feature is off. */
  api: ChartDrawingsApi | null
  /** The full handle the chart itself drives. Null with the feature off. */
  handle: DrawingsHandle | null
  /** Follow a symbol switch. */
  setSymbol(symbol: string): void
  setTimeframe(timeframe: string): void
  /** Push the chart's tick grid and price formatter, after a resolve or a language switch. */
  setPricing(tick: number | null, format: (price: number) => string): void
  destroy(): void
}

export interface DrawingsDeps {
  chart: IChartApi
  series: ISeriesApi<SeriesType>
  /** The gesture box the layer draws into. */
  container: HTMLElement
  /** The inert chrome subtree the rail mounts into. */
  chrome: HTMLElement
  symbol: string
  timeframe: string
  bars(): readonly FeedBar[]
  resources: ChartSaveLoadAdapter | null
  i18n: ChartI18n
  /** Whether the layer exists at all, and whether its rail is shown. */
  enabled: boolean
  rail: boolean
  access?: AccessPolicy
  /** A refused write the layer made on its own. */
  onSaveConflict(info: { symbol: string; current: ResourceRef | null; message: string }): void
  /** The armed tool or the selection changed. */
  onChange(kind: 'tool' | 'selection', id: string | null): void
}

export function attachDrawingsPlane(deps: DrawingsDeps): DrawingsLayer {
  if (!deps.enabled) {
    return {
      api: null,
      handle: null,
      setSymbol: () => undefined,
      setTimeframe: () => undefined,
      setPricing: () => undefined,
      destroy: () => undefined,
    }
  }

  // The rail wires to the layer's events through a mutable events object: the layer needs its
  // events at construction and the rail needs the layer's handle, so filling the object after both
  // exist resolves the cycle without holding state for it.
  const events: DrawingsEvents = {}
  const handle = attachDrawings({
    chart: deps.chart,
    series: deps.series,
    container: deps.container,
    symbol: deps.symbol,
    timeframe: deps.timeframe,
    resources: deps.resources ? (scope) => deps.resources!.drawings(scope) : undefined,
    bars: deps.bars,
    events,
  })
  events.onSaveConflict = ({ symbol, current }) =>
    deps.onSaveConflict({ symbol, current, message: deps.i18n.t(current ? 'host.saveConflict' : 'host.saveNotFound') })

  let rail: DrawingsRail | null = null
  if (deps.rail) rail = mountDrawingsRail(deps.chrome, handle, deps.i18n)
  events.onToolChange = (type) => {
    rail?.syncTool(type)
    deps.onChange('tool', type)
  }
  events.onSelectionChange = (id) => {
    rail?.syncSelection(id)
    deps.onChange('selection', id)
  }

  /** A tool the access policy refuses is never armed, whichever door asked for it. */
  const permitted = (tool: string | null): boolean => {
    if (tool === null || !deps.access?.drawingTool) return true
    try {
      return deps.access.drawingTool(tool) !== false
    } catch {
      return false
    }
  }

  return {
    handle,
    api: {
      armTool: (type) => {
        if (permitted(type)) handle.armTool(type)
      },
      activeTool: () => handle.activeTool(),
      hasSelection: () => handle.hasSelection(),
      deleteSelected: () => handle.deleteSelected(),
      clearAll: () => handle.clearAll(),
      count: () => handle.count(),
      export: () => handle.export(),
      restore: (list) => handle.restore(list),
    },
    setSymbol: (symbol) => handle.setSymbol(symbol),
    setTimeframe: (timeframe) => handle.setTimeframe(timeframe),
    setPricing: (tick, format) => {
      handle.setTick(tick)
      handle.setPriceFormatter(format)
    },
    destroy() {
      rail?.destroy()
      rail = null
      handle.destroy()
    },
  }
}
