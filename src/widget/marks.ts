// Drawing the neutral marks: the bar markers the renderer already understands, and a small
// primitive that ticks the time scale. The data contract they draw is `src/marks.ts`; nothing here
// interprets a mark, it only paints one.
import type { IChartApi, ISeriesApi, SeriesMarker, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import { createSeriesMarkers, type ISeriesMarkersPluginApi } from 'lightweight-charts'
import type { SemanticTheme, ThemeMode } from '../theme/schema'
import { paintableColor } from '../settings/color'
import type { BarMark, MarkColor, MarkColorRole, TimescaleMark } from '../marks'

/** The color each theme role resolves through. */
const ROLE_COLOR: Readonly<Record<MarkColorRole, (theme: SemanticTheme) => string>> = {
  neutral: (theme) => theme['series.neutral'],
  up: (theme) => theme['series.up'],
  down: (theme) => theme['series.down'],
  info: (theme) => theme['status.info'],
  warning: (theme) => theme['status.warning'],
  positive: (theme) => theme['status.positive'],
  negative: (theme) => theme['status.negative'],
}

/** Whether a host's color can be painted, remembered per value so a repaint asks once. */
const readable = new Map<string, boolean>()
function canPaint(value: unknown): value is string {
  if (typeof value !== 'string') return false
  let known = readable.get(value)
  if (known === undefined) {
    if (readable.size >= 256) readable.clear()
    known = paintableColor(value)
    readable.set(value, known)
  }
  return known
}

/** The color a mark wears in a mode: a role through the theme, or the pair's color for the mode.
 *  A pair counts only when both of its colors can be painted, so a mark never reads in one mode
 *  and fails in the other. Anything else, a single literal color among it, wears `neutral`. */
export function markColor(color: MarkColor, theme: SemanticTheme, mode: ThemeMode): string {
  if (typeof color === 'string') return (Object.hasOwn(ROLE_COLOR, color) ? ROLE_COLOR[color as MarkColorRole] : ROLE_COLOR.neutral)(theme)
  if (color && typeof color === 'object' && canPaint(color.light) && canPaint(color.dark)) return mode === 'light' ? color.light : color.dark
  return ROLE_COLOR.neutral(theme)
}

/** Project neutral marks onto the renderer's own marker shape. Pure, so the mapping is testable
 *  without a chart. */
export function markersOf(marks: readonly BarMark[], theme: SemanticTheme, mode: ThemeMode): SeriesMarker<Time>[] {
  return [...marks]
    .sort((a, b) => a.time - b.time)
    .map((mark) => ({
      time: mark.time as UTCTimestamp,
      position: mark.placement === 'below' ? ('belowBar' as const) : ('aboveBar' as const),
      color: markColor(mark.color, theme, mode),
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
  mode: () => ThemeMode,
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
          scope.context.fillStyle = markColor(mark.color, palette, mode())
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
  /** Re-color what is drawn for a new theme or mode, without re-fetching. */
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
  /** The mode in effect, which picks a color pair's side. */
  mode(): ThemeMode
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

  const axisPrimitive = createTimescaleMarks(deps.chart, () => axis, deps.theme, deps.mode)
  deps.series().attachPrimitive(axisPrimitive as never)

  const applyBars = (): void => {
    if (deps.disposed()) return
    const markers = markersOf(bars, deps.theme(), deps.mode())
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
