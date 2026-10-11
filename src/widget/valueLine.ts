// A single-value line the renderer's own line cannot draw: a line stroked with a vertical gradient
// (the line and step line styles' factory look), and the part of a baseline below its base level
// when that part is a different width from the part above it.
//
// It is a primitive on the style series and reads that series' own points, so it draws exactly the
// bars the series holds, scrolls and scales with it, and needs no data of its own. The series keeps
// its scale, its last-value label and its crosshair marker; the line itself is drawn here.
import type { ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { ChartStrokeStyle } from '../settings/schema'
import { strokeDash } from '../sessions'

/** What the primitive strokes. */
export interface ValueLineStroke {
  /** One color, or a vertical gradient from `top` at the highest point on screen to `bottom` at the
   *  lowest. */
  color: string | { top: string; bottom: string }
  width: number
  style: ChartStrokeStyle
  /** Draw each move as a horizontal run then a vertical step, as the step line does. */
  steps: boolean
  /** Draw only the part of the line below the series' base level. */
  belowBase?: boolean
  /** The strength the line is drawn at, 0 to 1: a style morph fades it in or out. */
  alpha?: number
}

export interface ValueLinePrimitive {
  paneViews(): unknown[]
  attached(param: { series?: ISeriesApi<SeriesType>; requestUpdate?: () => void }): void
  detached(): void
  refresh(): void
}

interface Scope {
  context: CanvasRenderingContext2D
  bitmapSize: { width: number; height: number }
  horizontalPixelRatio: number
  verticalPixelRatio: number
}

interface ChartLike {
  timeScale(): { timeToCoordinate(time: Time): number | null; getVisibleRange(): { from: Time; to: Time } | null }
}

/** The points a stroke runs through, in media pixels: one per bar of the series that the time and
 *  price scales can place, within the visible time range and one bar either side of it, so the line
 *  runs off both edges rather than stopping short of them. */
export function valueLinePoints(
  data: readonly { time: Time; value?: number }[],
  range: { from: number; to: number } | null,
  x: (time: Time) => number | null,
  y: (value: number) => number | null,
): { x: number; y: number }[] {
  let from = 0
  let to = data.length - 1
  if (range) {
    const first = data.findIndex((row) => (row.time as number) >= range.from)
    if (first < 0) return []
    let last = first
    while (last + 1 < data.length && (data[last + 1]!.time as number) <= range.to) last++
    from = Math.max(0, first - 1)
    to = Math.min(data.length - 1, last + 1)
  }
  const points: { x: number; y: number }[] = []
  for (let i = from; i <= to; i++) {
    const row = data[i]
    if (!row || typeof row.value !== 'number') continue
    const px = x(row.time)
    const py = y(row.value)
    if (px === null || py === null) continue
    points.push({ x: px, y: py })
  }
  return points
}

const visibleSeconds = (range: { from: Time; to: Time } | null): { from: number; to: number } | null =>
  range && typeof range.from === 'number' && typeof range.to === 'number' ? { from: range.from, to: range.to } : null

export function createValueLine(chart: ChartLike, stroke: () => ValueLineStroke | null): ValueLinePrimitive {
  let series: ISeriesApi<SeriesType> | null = null
  let requestUpdate: (() => void) | null = null
  const renderer = {
    draw(target: { useBitmapCoordinateSpace(fn: (scope: Scope) => void): void }) {
      const line = stroke()
      const s = series
      if (!line || !s) return
      const points = valueLinePoints(
        s.data() as { time: Time; value?: number }[],
        visibleSeconds(chart.timeScale().getVisibleRange()),
        (time) => chart.timeScale().timeToCoordinate(time),
        (value) => s.priceToCoordinate(value),
      )
      if (points.length === 0) return
      let baseY: number | null = null
      if (line.belowBase) {
        const base = (s.options() as { baseValue?: { price?: number } }).baseValue?.price
        baseY = typeof base === 'number' ? s.priceToCoordinate(base) : null
        if (baseY === null) return
      }
      target.useBitmapCoordinateSpace((scope) => {
        const { context: ctx, horizontalPixelRatio: h, verticalPixelRatio: v } = scope
        ctx.save()
        ctx.globalAlpha = Math.min(1, Math.max(0, line.alpha ?? 1))
        if (baseY !== null) {
          ctx.beginPath()
          ctx.rect(0, baseY * v, scope.bitmapSize.width, scope.bitmapSize.height - baseY * v)
          ctx.clip()
        }
        if (typeof line.color === 'string') ctx.strokeStyle = line.color
        else {
          const ys = points.map((p) => p.y)
          const top = Math.min(...ys) * v
          const bottom = Math.max(...ys) * v
          if (bottom - top < 1) ctx.strokeStyle = line.color.top
          else {
            const gradient = ctx.createLinearGradient(0, top, 0, bottom)
            gradient.addColorStop(0, line.color.top)
            gradient.addColorStop(1, line.color.bottom)
            ctx.strokeStyle = gradient
          }
        }
        ctx.lineWidth = Math.max(1, line.width * h)
        ctx.lineJoin = 'round'
        ctx.lineCap = 'butt'
        ctx.setLineDash(strokeDash(line.style, line.width).map((length) => length * h))
        ctx.beginPath()
        points.forEach((point, i) => {
          const px = point.x * h
          const py = point.y * v
          if (i === 0) ctx.moveTo(px, py)
          else {
            if (line.steps) ctx.lineTo(px, points[i - 1]!.y * v)
            ctx.lineTo(px, py)
          }
        })
        ctx.stroke()
        ctx.restore()
      })
    },
  }
  return {
    // A pane view's zOrder is a method in lightweight-charts v5.
    paneViews: () => [{ zOrder: () => 'normal' as const, renderer: () => renderer }],
    attached(param) {
      series = param?.series ?? null
      requestUpdate = param?.requestUpdate ?? null
    },
    detached() {
      series = null
      requestUpdate = null
    },
    refresh() {
      requestUpdate?.()
    },
  }
}
