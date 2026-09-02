// The extension plane: everything an extension can reach, in the chart's own terms.
//
// The chart never hands out its renderer instance, so an extension can only do what these
// capabilities express, and the chart can take back everything it gave. A contributed command goes
// into the chart's ONE command registry with `scope: 'chart'`, which is what makes it reachable
// from the same menu, keyboard and operator surfaces as a built-in verb and refusable by the same
// access policy.
import type { IChartApi, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
import {
  createExtensionHost,
  type ChartExtension,
  type ChartExtensionHost,
  type ChartExtensionPane,
  type ChartExtensionReplayState,
  type ChartExtensionSeries,
  type ChartPriceFormatter,
} from '../extension'
import type { FeedBar } from '../datafeed'
import { pointerLock } from '../pointerInput'
import type { CanvasTheme } from '../theme/renderer'
import type { CommandRegistry, CommandSpec } from './commands'

export interface ExtensionsPlane {
  host: ChartExtensionHost
  /** The pane geometry an extension reads, and what the resize observer reports. */
  pane(): ChartExtensionPane
  destroy(): void
}

export interface ExtensionsDeps {
  chartId: string
  chart: IChartApi
  /** The main series an extension draws price lines and primitives against. */
  series(): ISeriesApi<SeriesType>
  /** The gesture box, and the chrome subtree above it. */
  gestures: HTMLElement
  chrome: HTMLElement
  symbol(): string
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
  feedStatus(): string | null
  theme(): CanvasTheme
  formatter(): ChartPriceFormatter
  commands: CommandRegistry
  extensions: readonly ChartExtension[]
  disposed(): boolean
  /** Sets the one touch-action write the chart makes, when an extension locks pan and zoom. */
  setTouchAction(value: string): void
}

export function attachExtensionsPlane(deps: ExtensionsDeps): ExtensionsPlane {
  const pane = (): ChartExtensionPane => ({ id: deps.chartId, width: deps.gestures.clientWidth, height: deps.gestures.clientHeight })

  const series: ChartExtensionSeries = {
    createPriceLine(opts) {
      const line = deps.series().createPriceLine(opts)
      return {
        update: (next) => {
          if (!deps.disposed()) line.applyOptions(next)
        },
        remove: () => {
          if (deps.disposed()) return
          try {
            deps.series().removePriceLine(line)
          } catch {
            /* the series went down first */
          }
        },
      }
    },
    attachPrimitive(primitive) {
      const target = deps.series()
      target.attachPrimitive(primitive)
      return () => {
        try {
          target.detachPrimitive(primitive)
        } catch {
          /* likewise */
        }
      }
    },
    priceToY: (price) => (deps.disposed() ? null : deps.series().priceToCoordinate(price)),
    yToPrice: (y) => (deps.disposed() ? null : deps.series().coordinateToPrice(y)),
    timeToX: (timeSeconds) => (deps.disposed() ? null : deps.chart.timeScale().timeToCoordinate(timeSeconds as UTCTimestamp)),
    xToTime: (x) => {
      if (deps.disposed()) return null
      const t = deps.chart.timeScale().coordinateToTime(x)
      return typeof t === 'number' ? t : null
    },
    plotWidth: () => {
      if (deps.disposed()) return 0
      try {
        return deps.gestures.clientWidth - deps.chart.priceScale('right').width()
      } catch {
        return deps.gestures.clientWidth
      }
    },
    lockPanZoom: (locked) => {
      if (deps.disposed()) return
      // ONE rule for every in-chart drag: navigation and the container's touch action move
      // together, so a released gesture cannot leave the chart half-frozen.
      const state = pointerLock(locked)
      deps.chart.applyOptions({ handleScroll: state.handleScroll, handleScale: state.handleScale })
      deps.setTouchAction(state.touchAction)
    },
  }

  const host = createExtensionHost(
    {
      chartId: deps.chartId,
      container: deps.gestures,
      overlay: deps.chrome,
      symbol: deps.symbol,
      timeframe: deps.timeframe,
      bars: deps.bars,
      replay: deps.replay,
      feedStatus: deps.feedStatus,
      theme: deps.theme,
      formatter: deps.formatter,
      pane,
      series,
      registerCommand(command) {
        const spec: CommandSpec = {
          id: command.id,
          scope: 'chart',
          // A contribution owns its own words, so it names itself; the catalog key below is the
          // fallback a surface uses when it will not read literal text.
          label: 'command.extension',
          labelText: command.label,
          available: () => command.available?.() !== false,
          execute: () => command.execute(),
        }
        return deps.commands.register(spec)
      },
    },
    deps.extensions,
  )

  // The pane lane: a layout re-tile and a window resize both reach an overlay the same way.
  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => {
      if (!deps.disposed()) host.paneChanged(pane())
    })
    observer.observe(deps.gestures)
  }

  return {
    host,
    pane,
    destroy() {
      observer?.disconnect()
      observer = null
      host.detach()
    },
  }
}
