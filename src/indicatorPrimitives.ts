// Canvas painters for the indicator render channels lightweight-charts has no native series for:
// band fills between two plots and per-bar pane background shading. Both are ISeriesPrimitives
// attached to an existing series in the indicator's pane — they read the pane's own coordinate
// spaces, so they work identically on overlay and oscillator panes, and they draw at zOrder
// 'bottom' (the fixed stack: shading → fills → plots → levels → markers).
import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'
import type { PlotPoint } from './indicatorModel'

/** Structural slice of fancy-canvas's CanvasRenderingTarget2D (not importable directly under pnpm
 *  isolation — lightweight-charts owns the dependency). */
interface RenderTarget {
  useMediaCoordinateSpace<T>(f: (scope: { context: CanvasRenderingContext2D; mediaSize: { width: number; height: number } }) => T): T
}

interface PaneView {
  renderer(): { draw(target: RenderTarget): void } | null
  zOrder?(): 'bottom' | 'normal' | 'top'
}

const valueAt = (p: PlotPoint | undefined): number | null => {
  const v = (p as { value?: unknown } | undefined)?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Fill the area between two aligned plot-point arrays, segment by segment, honoring per-bar color
 *  overrides (null = that bar is not filled). Attached to the UPPER edge's series so price
 *  coordinates come from the right scale. */
export class FillBetweenPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private series: ISeriesApi<SeriesType> | null = null
  private requestUpdate: (() => void) | null = null
  private upper: readonly PlotPoint[] = []
  private lower: readonly PlotPoint[] = []
  private colors: readonly (string | null)[] | undefined
  private color = 'rgba(38, 166, 154, 0.13)'

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart
    this.series = param.series as ISeriesApi<SeriesType>
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.series = null
    this.requestUpdate = null
  }

  setData(upper: readonly PlotPoint[], lower: readonly PlotPoint[], color: string, colors?: readonly (string | null)[]): void {
    this.upper = upper
    this.lower = lower
    this.color = color
    this.colors = colors
    this.requestUpdate?.()
  }

  paneViews(): readonly PaneView[] {
    return [
      {
        zOrder: () => 'bottom' as const,
        renderer: () => ({
          draw: (target: RenderTarget) => {
            const chart = this.chart
            const series = this.series
            if (!chart || !series) return
            const ts = chart.timeScale()
            target.useMediaCoordinateSpace(({ context }) => {
              const n = Math.min(this.upper.length, this.lower.length)
              for (let i = 0; i + 1 < n; i++) {
                const segColor = this.colors ? this.colors[i] : this.color
                if (!segColor) continue
                const u0 = valueAt(this.upper[i])
                const u1 = valueAt(this.upper[i + 1])
                const l0 = valueAt(this.lower[i])
                const l1 = valueAt(this.lower[i + 1])
                if (u0 === null || u1 === null || l0 === null || l1 === null) continue
                const x0 = ts.timeToCoordinate(this.upper[i]!.time)
                const x1 = ts.timeToCoordinate(this.upper[i + 1]!.time)
                if (x0 === null || x1 === null) continue
                const yu0 = series.priceToCoordinate(u0)
                const yu1 = series.priceToCoordinate(u1)
                const yl0 = series.priceToCoordinate(l0)
                const yl1 = series.priceToCoordinate(l1)
                if (yu0 === null || yu1 === null || yl0 === null || yl1 === null) continue
                context.beginPath()
                context.moveTo(x0, yu0)
                context.lineTo(x1, yu1)
                context.lineTo(x1, yl1)
                context.lineTo(x0, yl0)
                context.closePath()
                context.fillStyle = segColor
                context.fill()
              }
            })
          },
        }),
      },
    ]
  }
}

/** Full-height per-bar background tint for the pane the host series lives in ($shade — sessions,
 *  regimes). Sparse input: only shaded bars are passed. */
export class ShadePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null
  private requestUpdate: (() => void) | null = null
  private points: readonly { time: UTCTimestamp; color: string }[] = []

  attached(param: SeriesAttachedParameter<Time>): void {
    this.chart = param.chart
    this.requestUpdate = param.requestUpdate
  }

  detached(): void {
    this.chart = null
    this.requestUpdate = null
  }

  setData(points: readonly { time: UTCTimestamp; color: string }[]): void {
    this.points = points
    this.requestUpdate?.()
  }

  paneViews(): readonly PaneView[] {
    return [
      {
        zOrder: () => 'bottom' as const,
        renderer: () => ({
          draw: (target: RenderTarget) => {
            const chart = this.chart
            if (!chart || this.points.length === 0) return
            const ts = chart.timeScale()
            const spacing = ts.options().barSpacing
            target.useMediaCoordinateSpace(({ context, mediaSize }) => {
              for (const p of this.points) {
                const x = ts.timeToCoordinate(p.time)
                if (x === null) continue
                context.fillStyle = p.color
                context.fillRect(x - spacing / 2, 0, spacing, mediaSize.height)
              }
            })
          },
        }),
      },
    ]
  }
}
