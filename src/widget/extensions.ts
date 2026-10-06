// The extension plane: everything an extension can reach, in the chart's own terms.
//
// The chart never hands out its renderer instance, so an extension can only do what these
// capabilities express, and the chart can take back everything it gave. A contributed command goes
// into the chart's ONE command registry with `scope: 'chart'`, which is what makes it reachable
// from the same menu, keyboard and automation surfaces as a built-in verb and refusable by the same
// access policy.
import type { CreatePriceLineOptions, IChartApi, IPriceLine, ISeriesApi, SeriesType, UTCTimestamp } from 'lightweight-charts'
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
import type { HideState } from '../drawings/hideModel'
import { pointerLock } from '../pointerInput'
import type { CanvasTheme } from '../theme/renderer'
import type { CommandRegistry, CommandSpec } from './commands'
import type { MarkPainters } from '../markPainters'

export interface ExtensionsPlane {
  host: ChartExtensionHost
  /** The pane geometry an extension reads, and what the resize observer reports. */
  pane(): ChartExtensionPane
  /** The visible series was replaced (a style switch): every extension price line is created
   *  again on the new one, with the options it last held. */
  visibleSeriesReplaced(): void
  destroy(): void
}

export interface ExtensionsDeps {
  chartId: string
  chart: IChartApi
  /** The long-lived series on the main price scale that primitives bind to and conversions read
   *  through; it survives a style switch. */
  series(): ISeriesApi<SeriesType>
  /** The series the style paints, the only one the renderer draws a price line on: a line on a
   *  hidden series is a line nobody sees. Replaced on a style switch. */
  visible(): ISeriesApi<SeriesType>
  /** The gesture box, and the chrome subtree above it. */
  gestures: HTMLElement
  chrome: HTMLElement
  /** The widget's body-level layer, for popovers that stand over every pane. */
  layer: HTMLElement
  symbol(): string
  symbolTitle(): string
  /** The host's mark painters, as the widget resolved them. */
  painters: MarkPainters
  timeframe(): string
  bars(): readonly FeedBar[]
  replay(): ChartExtensionReplayState
  feedStatus(): string | null
  theme(): CanvasTheme
  formatter(): ChartPriceFormatter
  /** Whether this chart is the widget's active chart. */
  active(): boolean
  /** Whether the chart's view moves by hand: a released lock gives back only the navigation it has. */
  navigable: boolean
  commands: CommandRegistry
  extensions: readonly ChartExtension[]
  disposed(): boolean
  /** Sets the one touch-action write the chart makes, when an extension locks pan and zoom. */
  setTouchAction(value: string): void
  /** The drawing toolbar's eye, for the layers extensions contribute to it. */
  hideState(): HideState
  setHide(state: HideState): void
  hideLayersChanged(): void
}

export function attachExtensionsPlane(deps: ExtensionsDeps): ExtensionsPlane {
  const pane = (): ChartExtensionPane => ({ id: deps.chartId, width: deps.gestures.clientWidth, height: deps.gestures.clientHeight })

  /** Every extension price line still standing: the options it holds, and the series it is on. */
  const priceLines = new Set<{ options: CreatePriceLineOptions; line: IPriceLine; on: ISeriesApi<SeriesType> }>()

  const series: ChartExtensionSeries = {
    createPriceLine(opts) {
      const on = deps.visible()
      const record = { options: { ...opts }, line: on.createPriceLine(opts), on }
      priceLines.add(record)
      return {
        update: (next) => {
          if (deps.disposed()) return
          Object.assign(record.options, next)
          record.line.applyOptions(next)
        },
        remove: () => {
          priceLines.delete(record)
          if (deps.disposed()) return
          try {
            record.on.removePriceLine(record.line)
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
      const state = pointerLock(locked, deps.navigable)
      deps.chart.applyOptions({ handleScroll: state.handleScroll, handleScale: state.handleScale })
      deps.setTouchAction(state.touchAction)
    },
  }
  // The renderer opens in the released state through the same rule: pan, wheel zoom and axis
  // scaling on, and its own pinch off, because the chart drives the pinch itself.
  series.lockPanZoom(false)

  const host = createExtensionHost(
    {
      chartId: deps.chartId,
      container: deps.gestures,
      overlay: deps.chrome,
      layer: deps.layer,
      symbol: deps.symbol,
      symbolTitle: deps.symbolTitle,
      painters: deps.painters,
      timeframe: deps.timeframe,
      bars: deps.bars,
      replay: deps.replay,
      feedStatus: deps.feedStatus,
      theme: deps.theme,
      formatter: deps.formatter,
      pane,
      active: deps.active,
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
      hideState: deps.hideState,
      setHide: deps.setHide,
      hideLayersChanged: deps.hideLayersChanged,
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
    visibleSeriesReplaced() {
      if (deps.disposed()) return
      const on = deps.visible()
      for (const record of priceLines) {
        if (record.on === on) continue
        record.on = on
        record.line = on.createPriceLine(record.options)
      }
    },
    destroy() {
      observer?.disconnect()
      observer = null
      host.detach()
    },
  }
}
