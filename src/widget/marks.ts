// Drawing the neutral marks: the bar markers the renderer already understands, and a primitive that
// draws the time-scale marks along the foot of the pane, each a glyph in a ring or a small dot. The
// data contract they draw is `src/marks.ts`; nothing here interprets a mark, it only paints one.
import type { IChartApi, ISeriesApi, SeriesMarker, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import { createSeriesMarkers, type ISeriesMarkersPluginApi } from 'lightweight-charts'
import type { SemanticTheme, ThemeMode } from '../theme/schema'
import { paintableColor } from '../settings/color'
import { MARK_ICONS } from '../ui/controls/icons'
import type { IconResolver } from '../ui/icons/resolver'
import type { BarMark, MarkColor, MarkColorRole, MarkIconId, TimescaleMark } from '../marks'

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

/** A glyph mark's ring box in CSS pixels, and how far its foot stands above the pane's bottom edge,
 *  just clear of the time scale. */
export const MARK_RING_SIZE = 21
const MARK_RING_FOOT = 2
/** The ring's line width. */
const MARK_RING_WIDTH = 1.5
/** A mark without a glyph: a dot of this radius, this far above the pane's bottom edge. */
const MARK_DOT_R = 3
const MARK_DOT_INSET = 6

/** The host's drawing of a mark glyph as a bitmap of `size` device pixels in one color: undefined
 *  where the host draws none, so the chart's own glyph stands, and null while it is loading. */
export type MarkArt = (id: MarkIconId, color: string, size: number) => CanvasImageSource | null | undefined

/** What the time-scale marks draw from. */
export interface TimescaleMarksDeps {
  chart: IChartApi
  marks(): readonly TimescaleMark[]
  theme(): SemanticTheme
  mode(): ThemeMode
  /** The chart's background at the foot of the pane, which a ring's inside shows. */
  background(): string
  /** The host's drawings of the mark glyphs; absent, the chart draws its own. */
  art?: MarkArt
}

/** The bitmap space a pane renderer draws in. */
interface BitmapScope {
  context: CanvasRenderingContext2D
  bitmapSize: { width: number; height: number }
  horizontalPixelRatio: number
  verticalPixelRatio: number
}

/** Each mark glyph's outline as a canvas path, made the first time it is drawn. */
const glyphPaths = new Map<MarkIconId, Path2D>()
function glyphPath(id: MarkIconId): Path2D {
  let path = glyphPaths.get(id)
  if (!path) {
    path = new Path2D(MARK_ICONS[id].path.d)
    glyphPaths.set(id, path)
  }
  return path
}

/** Whether a mark names a glyph the chart draws. */
const glyphOf = (mark: TimescaleMark): MarkIconId | null => (typeof mark.icon === 'string' && Object.hasOwn(MARK_ICONS, mark.icon) ? mark.icon : null)

export function createTimescaleMarks(deps: TimescaleMarksDeps): TimescaleMarksPrimitive {
  const { chart } = deps

  /** One glyph mark: the ring in the mark's color around the chart's background, and the glyph,
   *  the host's drawing where it gave one and the chart's own otherwise. */
  const drawRing = (scope: BitmapScope, x: number, color: string, id: MarkIconId): void => {
    const ctx = scope.context
    const h = scope.horizontalPixelRatio
    const v = scope.verticalPixelRatio
    const top = scope.bitmapSize.height / v - MARK_RING_FOOT - MARK_RING_SIZE
    const left = x - MARK_RING_SIZE / 2
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(x * h, (top + MARK_RING_SIZE / 2) * v, ((MARK_RING_SIZE - MARK_RING_WIDTH) / 2) * h, ((MARK_RING_SIZE - MARK_RING_WIDTH) / 2) * v, 0, 0, Math.PI * 2)
    ctx.fillStyle = deps.background()
    ctx.fill()
    ctx.lineWidth = MARK_RING_WIDTH * h
    ctx.strokeStyle = color
    ctx.stroke()
    const art = deps.art?.(id, color, Math.round(MARK_RING_SIZE * h))
    if (art === undefined) {
      ctx.translate(left * h, top * v)
      ctx.scale(h, v)
      ctx.fillStyle = color
      ctx.fill(glyphPath(id), MARK_ICONS[id].path.rule ?? 'nonzero')
    } else if (art !== null) {
      ctx.drawImage(art, left * h, top * v, MARK_RING_SIZE * h, MARK_RING_SIZE * v)
    }
    ctx.restore()
  }

  /** One mark without a glyph: the small dot near the foot of the pane. */
  const drawDot = (scope: BitmapScope, x: number, color: string): void => {
    const ctx = scope.context
    ctx.beginPath()
    ctx.arc(x * scope.horizontalPixelRatio, scope.bitmapSize.height - MARK_DOT_INSET * scope.verticalPixelRatio, MARK_DOT_R * scope.horizontalPixelRatio, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  const renderer = {
    draw(target: unknown) {
      const list = deps.marks()
      if (list.length === 0) return
      ;(target as { useBitmapCoordinateSpace(fn: (scope: BitmapScope) => void): void }).useBitmapCoordinateSpace((scope) => {
        const ts = chart.timeScale()
        const palette = deps.theme()
        const mode = deps.mode()
        const width = scope.bitmapSize.width / scope.horizontalPixelRatio
        for (const mark of list) {
          const x = ts.timeToCoordinate(mark.time as Time)
          if (x == null || x < -MARK_RING_SIZE || x > width + MARK_RING_SIZE) continue
          const color = markColor(mark.color, palette, mode)
          const id = glyphOf(mark)
          if (id) drawRing(scope, x, color, id)
          else drawDot(scope, x, color)
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

/** The host's drawings of the mark glyphs, as bitmaps the canvas draws: each drawn through the icon
 *  resolver once for a color and a size, in that color as its ink, and handed out once it has
 *  loaded. A glyph the host draws none for, or whose drawing failed, answers undefined, so the
 *  chart's own stands. */
export function hostMarkArt(icons: IconResolver, loaded: () => void): MarkArt {
  const held = new Map<string, { image: HTMLImageElement | null; ready: boolean }>()
  return (id, color, size) => {
    const key = `${id} ${color} ${size}`
    let entry = held.get(key)
    if (!entry) {
      if (held.size >= 64) held.clear()
      const drawing = icons.host(id, { width: MARK_RING_SIZE, height: MARK_RING_SIZE })
      const record: { image: HTMLImageElement | null; ready: boolean } = { image: null, ready: false }
      entry = record
      held.set(key, record)
      if (drawing) {
        drawing.setAttribute('width', String(size))
        drawing.setAttribute('height', String(size))
        drawing.setAttribute('color', color)
        const image = new Image()
        image.onload = () => {
          record.ready = true
          loaded()
        }
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(drawing))}`
        record.image = image
      }
    }
    if (!entry.image) return undefined
    return entry.ready ? entry.image : null
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
  /** The chart's background at the foot of the pane, which a glyph mark's ring shows inside. */
  background(): string
  /** Draws the host's artwork for a mark glyph where the host gave one. */
  icons?: IconResolver
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

  const axisPrimitive: TimescaleMarksPrimitive = createTimescaleMarks({
    chart: deps.chart,
    marks: () => axis,
    theme: deps.theme,
    mode: deps.mode,
    background: deps.background,
    ...(deps.icons ? { art: hostMarkArt(deps.icons, () => axisPrimitive.refresh()) } : {}),
  })
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
