// Drawing the neutral marks: the bar markers the renderer already understands, and a small
// primitive that ticks the time scale. The data contract they draw is `src/marks.ts`; nothing here
// interprets a mark, it only paints one.
import type { IChartApi, ISeriesApi, SeriesMarker, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import { createSeriesMarkers, type ISeriesMarkersPluginApi } from 'lightweight-charts'
import type { SemanticTheme } from '../theme/schema'
import type { BarMark, MarkColorRole, TimescaleMark } from '../marks'

/** The role a mark's color resolves through. */
function markColor(theme: SemanticTheme, role: MarkColorRole): string {
  switch (role) {
    case 'up':
      return theme['series.up']
    case 'down':
      return theme['series.down']
    case 'info':
      return theme['status.info']
    case 'warning':
      return theme['status.warning']
    case 'positive':
      return theme['status.positive']
    case 'negative':
      return theme['status.negative']
    case 'neutral':
    default:
      return theme['series.neutral']
  }
}

/** Project neutral marks onto the renderer's own marker shape. Pure, so the mapping is testable
 *  without a chart. */
export function markersOf(marks: readonly BarMark[], theme: SemanticTheme): SeriesMarker<Time>[] {
  return [...marks]
    .sort((a, b) => a.time - b.time)
    .map((mark) => ({
      time: mark.time as UTCTimestamp,
      position: mark.placement === 'below' ? ('belowBar' as const) : ('aboveBar' as const),
      color: markColor(theme, mark.color),
      shape: mark.shape ?? 'circle',
      text: mark.text,
    }))
}

/** A primitive that draws the time-scale marks as small ticks along the bottom of the plot area.
 *  The renderer reads its marks and its theme through getters, so a refetch or a mode switch only
 *  has to poke it. */
export interface TimescaleMarksPrimitive {
  paneViews(): unknown[]
  attached(param: { requestUpdate?: () => void }): void
  detached(): void
  refresh(): void
}

/** The tick's radius in CSS pixels, and how far above the pane's bottom edge it sits. */
const TIMESCALE_MARK_R = 3
const TIMESCALE_MARK_INSET = 6

export function createTimescaleMarks(
  chart: IChartApi,
  marks: () => readonly TimescaleMark[],
  theme: () => SemanticTheme,
): TimescaleMarksPrimitive {
  const renderer = {
    draw(target: unknown) {
      const list = marks()
      if (list.length === 0) return
      const t = target as {
        useBitmapCoordinateSpace: (
          fn: (scope: {
            context: CanvasRenderingContext2D
            bitmapSize: { width: number; height: number }
            horizontalPixelRatio: number
            verticalPixelRatio: number
          }) => void,
        ) => void
      }
      t.useBitmapCoordinateSpace((scope) => {
        const ts = chart.timeScale()
        const palette = theme()
        const y = scope.bitmapSize.height - TIMESCALE_MARK_INSET * scope.verticalPixelRatio
        const r = TIMESCALE_MARK_R * scope.horizontalPixelRatio
        for (const mark of list) {
          const x = ts.timeToCoordinate(mark.time as Time)
          if (x == null) continue
          scope.context.beginPath()
          scope.context.arc(x * scope.horizontalPixelRatio, y, r, 0, Math.PI * 2)
          scope.context.fillStyle = markColor(palette, mark.color)
          scope.context.fill()
        }
      })
    },
  }
  // A pane view's zOrder is a METHOD in this renderer, not a property.
  let requestUpdate: (() => void) | null = null
  return {
    paneViews() {
      return [{ zOrder: () => 'top' as const, renderer: () => renderer }]
    },
    attached(param) {
      requestUpdate = param?.requestUpdate ?? null
    },
    detached() {
      requestUpdate = null
    },
    refresh() {
      requestUpdate?.()
    },
  }
}

/** The marks plane over one chart. */
export interface MarksLayer {
  /** Fetch and draw both families for a window. A feed that serves neither draws neither. */
  refresh(window: { from: number; to: number } | null): void
  /** Re-color what is drawn for a new theme, without re-fetching. */
  repaint(): void
  /** Clear what is drawn (a symbol or timeframe switch). */
  clear(): void
  destroy(): void
}

/** What the marks plane reads. */
export interface MarksDeps {
  chart: IChartApi
  series(): ISeriesApi<SeriesType>
  symbol(): string
  timeframe(): string
  theme(): SemanticTheme
  /** The feed's bar-mark reader, or null when it serves none. */
  fetchBarMarks: ((symbol: string, from: number, to: number, resolution: string) => Promise<readonly BarMark[]>) | null
  /** The feed's time-scale-mark reader, or null when it serves none. */
  fetchTimescaleMarks: ((symbol: string, from: number, to: number, resolution: string) => Promise<readonly TimescaleMark[]>) | null
  /** True once the chart is down; every async landing checks it. */
  disposed(): boolean
}

export function attachMarks(deps: MarksDeps): MarksLayer {
  let plugin: ISeriesMarkersPluginApi<Time> | null = null
  let bars: readonly BarMark[] = []
  let axis: readonly TimescaleMark[] = []
  /** Increments on every clear and every refresh, so a page that lands late paints nothing. */
  let generation = 0

  const axisPrimitive = createTimescaleMarks(deps.chart, () => axis, deps.theme)
  deps.series().attachPrimitive(axisPrimitive as never)

  const applyBars = (): void => {
    if (deps.disposed()) return
    const markers = markersOf(bars, deps.theme())
    if (!plugin) plugin = createSeriesMarkers(deps.series(), markers)
    else plugin.setMarkers(markers)
  }

  return {
    refresh(window) {
      const mine = ++generation
      if (!window) {
        bars = []
        axis = []
        applyBars()
        axisPrimitive.refresh()
        return
      }
      const symbol = deps.symbol()
      const resolution = deps.timeframe()
      if (deps.fetchBarMarks) {
        void deps
          .fetchBarMarks(symbol, window.from, window.to, resolution)
          .then((marks) => {
            if (deps.disposed() || mine !== generation) return
            bars = marks
            applyBars()
          })
          .catch(() => {
            /* marks are an enhancement; a refusal leaves the bars alone */
          })
      }
      if (deps.fetchTimescaleMarks) {
        void deps
          .fetchTimescaleMarks(symbol, window.from, window.to, resolution)
          .then((marks) => {
            if (deps.disposed() || mine !== generation) return
            axis = marks
            axisPrimitive.refresh()
          })
          .catch(() => {
            /* likewise */
          })
      }
    },
    repaint() {
      applyBars()
      axisPrimitive.refresh()
    },
    clear() {
      generation++
      bars = []
      axis = []
      applyBars()
      axisPrimitive.refresh()
    },
    destroy() {
      generation++
      bars = []
      axis = []
      try {
        plugin?.setMarkers([])
      } catch {
        /* the series went down first */
      }
      plugin = null
      try {
        deps.series().detachPrimitive(axisPrimitive as never)
      } catch {
        /* likewise */
      }
    },
  }
}
