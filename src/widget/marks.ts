// Drawing the neutral marks: the bar markers the renderer already understands, and a primitive that
// draws the time-scale marks along the foot of the pane, each a glyph in a ring or a small dot, with
// the line a mark names through the pane. The data contract they draw is `src/marks.ts`; nothing
// here interprets a mark, it only paints one.
import type { IChartApi, ISeriesApi, Logical, LogicalRange, SeriesMarker, SeriesType, Time, UTCTimestamp } from 'lightweight-charts'
import { createSeriesMarkers, type ISeriesMarkersPluginApi } from 'lightweight-charts'
import type { FeedBar } from '../datafeed'
import type { SemanticTheme, ThemeMode } from '../theme/schema'
import { paintableColor } from '../settings/color'
import { MARK_ICONS } from '../ui/controls/icons'
import type { IconResolver } from '../ui/icons/resolver'
import type { BarMark, MarkColor, MarkColorRole, MarkIconId, MarkLineStyle, TimescaleMark } from '../marks'

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

/** A primitive that draws the time-scale marks along the foot of the pane, the lines they name
 *  through the pane under the bars, and the hover line of the one under the pointer or held by a
 *  press. The renderers read the marks and the theme through getters, so a refetch or a mode switch
 *  only has to poke it. */
export interface TimescaleMarksPrimitive {
  paneViews(): unknown[]
  attached(param: { requestUpdate?: () => void }): void
  detached(): void
  refresh(): void
  /** Where the pointer is over the pane, in its CSS pixels, or null when it left: the mark under it
   *  is hovered. */
  point(at: PanePoint | null): void
  /** A press on the pane, from a finger or a pen: a press on a mark holds it as hovered, and a press
   *  anywhere else lets go of the one held. Answers whether it landed on a mark. */
  press(at: PanePoint | null): boolean
}

/** A point in the pane's own CSS pixels, from its top left corner. */
export interface PanePoint {
  x: number
  y: number
}

/** The hovered mark as it stands this frame: its middle across, and the top of its shape. */
export interface HoveredMark {
  mark: TimescaleMark
  x: number
  top: number
}

/** A glyph mark's ring box in CSS pixels, and how far its foot stands above the pane's bottom edge,
 *  just clear of the time scale. */
export const MARK_RING_SIZE = 21
const MARK_RING_FOOT = 2
/** The ring's line width. */
const MARK_RING_WIDTH = 1.5
/** A mark without a glyph: a dot of this radius, this far above the pane's bottom edge, which takes
 *  the pointer this far around it. */
const MARK_DOT_R = 3
const MARK_DOT_INSET = 6
const MARK_DOT_REACH = 6
/** The dash pattern of each line style a mark draws, at one pixel wide: a dash 5px drawn and 6px
 *  clear, and a dot 1px drawn and 4px clear. A hovered mark's line is dashed. */
const MARK_LINE_DASH: Readonly<Record<MarkLineStyle, readonly number[]>> = { solid: [], dashed: [5, 6], dotted: [1, 4] }
const MARK_HOVER_DASH = MARK_LINE_DASH.dashed
/** How strongly a hovered ring's inside takes the mark's color over the background. */
const MARK_HOVER_TINT = 0.15

/** The line style a mark names, or null where it names none the chart draws. */
const lineOf = (mark: TimescaleMark): MarkLineStyle | null => {
  const style = mark.line && typeof mark.line === 'object' ? mark.line.style : null
  return typeof style === 'string' && Object.hasOwn(MARK_LINE_DASH, style) ? style : null
}

/** One vertical line in a color and a dash, a CSS pixel wide, at a CSS x from the top of a bitmap
 *  down to `bottom` in its device pixels. */
function strokeDown(scope: BitmapScope, x: number, color: string, dash: readonly number[], bottom: number): void {
  const ctx = scope.context
  const width = Math.max(1, Math.round(scope.horizontalPixelRatio))
  // A line of odd pixel width sits on a pixel's center, so it is crisp rather than smeared.
  const at = Math.round(x * scope.horizontalPixelRatio) + (width % 2 ? 0.5 : 0)
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dash.map((length) => length * scope.verticalPixelRatio))
  ctx.beginPath()
  ctx.moveTo(at, 0)
  ctx.lineTo(at, bottom)
  ctx.stroke()
  ctx.restore()
}

/** The host's drawing of a mark glyph as a bitmap of `size` device pixels in one color: undefined
 *  where the host draws none, so the chart's own glyph stands, and null while it is loading. */
export type MarkArt = (id: MarkIconId, color: string, size: number) => CanvasImageSource | null | undefined

/** What the time-scale marks draw from. */
export interface TimescaleMarksDeps {
  chart: IChartApi
  marks(): readonly TimescaleMark[]
  /** Where a mark's time stands on the time scale, as a logical index (`markSlot`), or null where
   *  it stands on nothing. */
  slotOf(time: number): number | null
  theme(): SemanticTheme
  mode(): ThemeMode
  /** The chart's background at the foot of the pane, which a ring's inside shows. */
  background(): string
  /** The host's drawings of the mark glyphs; absent, the chart draws its own. */
  art?: MarkArt
  /** The hovered mark changed or moved, or none is hovered now. Called while a frame is drawn. */
  hovered?(mark: HoveredMark | null): void
}

/** The bitmap space a pane renderer draws in. */
interface BitmapScope {
  context: CanvasRenderingContext2D
  bitmapSize: { width: number; height: number }
  horizontalPixelRatio: number
  verticalPixelRatio: number
}

/** One mark where it stands this frame, in the pane's CSS pixels. */
interface Placed {
  mark: TimescaleMark
  x: number
  color: string
  glyph: MarkIconId | null
  /** The box that takes the pointer, and the top of the drawn shape. */
  left: number
  right: number
  top: number
  bottom: number
  shapeTop: number
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

/** Where a time-scale mark's time stands on the time scale, as a logical index: on the bar whose
 *  bucket holds it, which runs from the bar's open for one bar interval and never past the next
 *  bar; on the next bar when it falls between bars (a session gap, a weekend); and past the last
 *  bar, while `future` allows it, at the slot it falls in, counted in bar intervals from the last
 *  bar. Null where it stands on nothing: before the first bar, or past the last one without an
 *  interval or with the future closed. Without an interval a bar's bucket is its open alone.
 *  `bars` ascend, and `indexOf` answers a bar's own logical index. */
export function markSlot(time: number, bars: readonly { t: number }[], interval: number | null, indexOf: (time: number) => number | null, future: boolean): number | null {
  const count = bars.length
  if (count === 0 || !Number.isFinite(time) || time < bars[0]!.t) return null
  // The last bar that opens at or before the time.
  let low = 0
  let high = count - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (bars[middle]!.t <= time) low = middle
    else high = middle - 1
  }
  const bar = bars[low]!
  const next = bars[low + 1]
  const ends = interval === null ? bar.t + 1 : Math.min(bar.t + interval, next?.t ?? Infinity)
  if (time < ends) return indexOf(bar.t)
  if (next) return indexOf(next.t)
  if (!future || interval === null || !(interval > 0)) return null
  const last = indexOf(bar.t)
  return last === null ? null : last + Math.floor((time - bar.t) / interval)
}

/** Whether a mark names a glyph the chart draws. */
const glyphOf =(mark: TimescaleMark): MarkIconId | null => (typeof mark.icon === 'string' && Object.hasOwn(MARK_ICONS, mark.icon) ? mark.icon : null)

/** The mark under a point: the last drawn, which stands on top, whose box holds it. */
function markAt(placed: readonly Placed[], at: PanePoint): Placed | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i]!
    if (at.x >= p.left && at.x <= p.right && at.y >= p.top && at.y <= p.bottom) return p
  }
  return null
}

export function createTimescaleMarks(deps: TimescaleMarksDeps): TimescaleMarksPrimitive {
  const { chart } = deps
  /** The pointer over the pane, and the mark a press holds. */
  let pointer: PanePoint | null = null
  let held: string | null = null
  /** Where the marks stood in the last frame, which a press is judged against. */
  let placed: Placed[] = []
  /** What the last frame reported as hovered. */
  let reported: HoveredMark | null = null

  const report = (next: HoveredMark | null): void => {
    if (reported === next || (reported && next && reported.mark === next.mark && reported.x === next.x && reported.top === next.top)) return
    reported = next
    deps.hovered?.(next)
  }

  /** Where each mark stands in a pane of a height, the ones off its width left out. */
  const place = (list: readonly TimescaleMark[], width: number, height: number): Placed[] => {
    const ts = chart.timeScale()
    const palette = deps.theme()
    const mode = deps.mode()
    const out: Placed[] = []
    for (const mark of list) {
      const slot = deps.slotOf(mark.time)
      const x = slot === null ? null : ts.logicalToCoordinate(slot as Logical)
      // A mark past the view on either side is not drawn.
      if (x == null || x < -MARK_RING_SIZE || x > width + MARK_RING_SIZE) continue
      const color = markColor(mark.color, palette, mode)
      const glyph = glyphOf(mark)
      if (glyph) {
        const top = height - MARK_RING_FOOT - MARK_RING_SIZE
        out.push({ mark, x, color, glyph, left: x - MARK_RING_SIZE / 2, right: x + MARK_RING_SIZE / 2, top, bottom: top + MARK_RING_SIZE, shapeTop: top })
      } else {
        const y = height - MARK_DOT_INSET
        out.push({ mark, x, color, glyph, left: x - MARK_DOT_REACH, right: x + MARK_DOT_REACH, top: y - MARK_DOT_REACH, bottom: y + MARK_DOT_REACH, shapeTop: y - MARK_DOT_R })
      }
    }
    return out
  }

  /** The hovered mark among those placed: the one a press holds, else the one under the pointer. */
  const hoveredOf = (list: readonly Placed[]): Placed | null => {
    if (held !== null) {
      const one = list.find((p) => p.mark.id === held)
      if (one) return one
    }
    return pointer ? markAt(list, pointer) : null
  }

  /** A hovered mark's line: dashed in its color from the top of the pane down to its shape. */
  const drawHoverLine = (scope: BitmapScope, p: Placed): void => strokeDown(scope, p.x, p.color, MARK_HOVER_DASH, p.shapeTop * scope.verticalPixelRatio)

  /** The lines the marks name, each through the whole pane at its mark's time, under the bars. */
  const lines = {
    draw(target: unknown) {
      const list = deps.marks().filter((mark) => lineOf(mark) !== null)
      if (list.length === 0) return
      ;(target as { useBitmapCoordinateSpace(fn: (scope: BitmapScope) => void): void }).useBitmapCoordinateSpace((scope) => {
        const ts = chart.timeScale()
        const palette = deps.theme()
        const mode = deps.mode()
        const width = scope.bitmapSize.width / scope.horizontalPixelRatio
        for (const mark of list) {
          const slot = deps.slotOf(mark.time)
          const x = slot === null ? null : ts.logicalToCoordinate(slot as Logical)
          if (x == null || x < 0 || x > width) continue
          strokeDown(scope, x, markColor(mark.color, palette, mode), MARK_LINE_DASH[lineOf(mark)!], scope.bitmapSize.height)
        }
      })
    },
  }

  /** One glyph mark: the ring in the mark's color around the chart's background, tinted with its
   *  color while hovered, and the glyph, the host's drawing where it gave one and the chart's own
   *  otherwise. */
  const drawRing = (scope: BitmapScope, p: Placed, id: MarkIconId, hovered: boolean): void => {
    const ctx = scope.context
    const h = scope.horizontalPixelRatio
    const v = scope.verticalPixelRatio
    const radius = (MARK_RING_SIZE - MARK_RING_WIDTH) / 2
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(p.x * h, (p.top + MARK_RING_SIZE / 2) * v, radius * h, radius * v, 0, 0, Math.PI * 2)
    ctx.fillStyle = deps.background()
    ctx.fill()
    if (hovered) {
      ctx.globalAlpha = MARK_HOVER_TINT
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.globalAlpha = 1
    }
    ctx.lineWidth = MARK_RING_WIDTH * h
    ctx.strokeStyle = p.color
    ctx.stroke()
    const art = deps.art?.(id, p.color, Math.round(MARK_RING_SIZE * h))
    if (art === undefined) {
      ctx.translate(p.left * h, p.top * v)
      ctx.scale(h, v)
      ctx.fillStyle = p.color
      ctx.fill(glyphPath(id), MARK_ICONS[id].path.rule ?? 'nonzero')
    } else if (art !== null) {
      ctx.drawImage(art, p.left * h, p.top * v, MARK_RING_SIZE * h, MARK_RING_SIZE * v)
    }
    ctx.restore()
  }

  /** One mark without a glyph: the small dot near the foot of the pane. */
  const drawDot = (scope: BitmapScope, p: Placed): void => {
    const ctx = scope.context
    ctx.beginPath()
    ctx.arc(p.x * scope.horizontalPixelRatio, (p.shapeTop + MARK_DOT_R) * scope.verticalPixelRatio, MARK_DOT_R * scope.horizontalPixelRatio, 0, Math.PI * 2)
    ctx.fillStyle = p.color
    ctx.fill()
  }

  const renderer = {
    draw(target: unknown) {
      const list = deps.marks()
      if (list.length === 0) {
        placed = []
        report(null)
        return
      }
      ;(target as { useBitmapCoordinateSpace(fn: (scope: BitmapScope) => void): void }).useBitmapCoordinateSpace((scope) => {
        placed = place(list, scope.bitmapSize.width / scope.horizontalPixelRatio, scope.bitmapSize.height / scope.verticalPixelRatio)
        const hovered = hoveredOf(placed)
        // The line runs under the marks, so the hovered one stands over its foot.
        if (hovered) drawHoverLine(scope, hovered)
        for (const p of placed) {
          if (p.glyph) drawRing(scope, p, p.glyph, p === hovered)
          else drawDot(scope, p)
        }
        report(hovered ? { mark: hovered.mark, x: hovered.x, top: hovered.shapeTop } : null)
      })
    },
  }
  // A pane view's zOrder is a METHOD in this renderer, not a property.
  let requestUpdate: (() => void) | null = null
  return {
    paneViews() {
      return [
        { zOrder: () => 'bottom' as const, renderer: () => lines },
        { zOrder: () => 'top' as const, renderer: () => renderer },
      ]
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
    point(at) {
      if (!at && !pointer) return
      pointer = at
      requestUpdate?.()
    },
    press(at) {
      const hit = at ? markAt(placed, at) : null
      const next = hit ? hit.mark.id : null
      if (next !== held) {
        held = next
        requestUpdate?.()
      }
      return hit !== null
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
  /** Fetch and draw both families over the loaded bars' window. The time-scale marks are asked for
   *  past it too, as far as the view reaches into the empty space after the last bar. A feed that
   *  serves neither draws neither. */
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
  /** The bars the chart paints, ascending: the time-scale marks stand on these. */
  painted(): readonly FeedBar[]
  /** The timeframe's bar interval in seconds, or null for a timeframe with no fixed one. */
  interval(): number | null
  /** Whether bar replay holds the chart: no mark stands past the last bar it paints. */
  replaying(): boolean
  /** Draws the host's artwork for a mark glyph where the host gave one. */
  icons?: IconResolver
  /** The box the chart's canvases fill, whose pointer hovers a time-scale mark and whose press holds
   *  one, and the chrome layer over it that a hovered mark's words stand in. Both share one origin. */
  gestures?: HTMLElement
  overlay?: HTMLElement
  /** How far the main pane stands in from the gesture box's left edge: the left price scale's width. */
  paneLeft?(): number
  /** The feed's bar-mark reader, or null when it serves none. */
  fetchBarMarks: ((symbol: string, from: number, to: number, resolution: string) => Promise<readonly BarMark[]>) | null
  /** The feed's time-scale-mark reader, or null when it serves none. */
  fetchTimescaleMarks: ((symbol: string, from: number, to: number, resolution: string) => Promise<readonly TimescaleMark[]>) | null
  /** True once the chart is down; every async landing checks it. */
  disposed(): boolean
}

/** How long the view rests before a move that reaches past the time-scale marks already asked for
 *  asks for more, so a drag asks once rather than on every frame. */
const VIEW_SETTLE_MS = 200

export function attachMarks(deps: MarksDeps): MarksLayer {
  const ts = deps.chart.timeScale()
  let plugin: ISeriesMarkersPluginApi<Time> | null = null
  let bars: readonly BarMark[] = []
  let axis: readonly TimescaleMark[] = []
  /** The loaded bars' window the last refresh named, and the end of the window the time-scale marks
   *  were last asked for. */
  let loaded: { from: number; to: number } | null = null
  let asked = -Infinity
  /** Each family increments on every clear and every ask of its own, so an answer that lands late
   *  paints nothing. */
  let barAsk = 0
  let axisAsk = 0
  let settle: ReturnType<typeof setTimeout> | null = null

  /** Where a time stands on the time scale, by the bars the chart paints. */
  const slotOf = (time: number): number | null =>
    markSlot(
      time,
      deps.painted(),
      deps.interval(),
      (barTime) => {
        const index = ts.timeToIndex(barTime as Time, false)
        return index === null ? null : (index as number)
      },
      !deps.replaying(),
    )

  /** How far the view reaches past the last painted bar, as the end of the last slot in view, with
   *  `ahead` more slots after it. Null when the view stops at or before the last bar, or no slot
   *  past it can be named. */
  const reach = (ahead: number): number | null => {
    const painted = deps.painted()
    const last = painted[painted.length - 1]
    const interval = deps.interval()
    const view: LogicalRange | null = ts.getVisibleLogicalRange()
    if (!last || !view || interval === null || !(interval > 0) || deps.replaying()) return null
    const index = ts.timeToIndex(last.t as Time, false)
    if (index === null || view.to <= (index as number)) return null
    return last.t + (Math.ceil(view.to - (index as number)) + 1 + ahead) * interval - 1
  }

  const paneLeft = (): number => deps.paneLeft?.() ?? 0
  // A hovered mark's words, on the tooltip fill above it, made the first time a mark with words is
  // hovered. A mark without words shows its line alone.
  let tip: HTMLElement | null = null
  const showTip = (hovered: HoveredMark | null): void => {
    const overlay = deps.overlay
    if (!overlay) return
    const words = hovered?.mark.label
    if (!hovered || typeof words !== 'string' || words === '') {
      if (tip) tip.hidden = true
      return
    }
    if (!tip) {
      tip = overlay.ownerDocument.createElement('div')
      tip.className = 'qc-mark-tooltip'
      tip.setAttribute('role', 'tooltip')
      overlay.append(tip)
    }
    tip.textContent = words
    tip.hidden = false
    // Centred over the mark, 4px above its shape, and kept 4px inside the chart's box.
    const width = tip.offsetWidth
    const room = overlay.clientWidth
    const centre = paneLeft() + hovered.x
    const left = room > 0 ? Math.max(4, Math.min(centre - width / 2, room - width - 4)) : centre - width / 2
    tip.style.left = `${Math.round(left)}px`
    tip.style.top = `${Math.round(hovered.top - 4)}px`
  }

  const axisPrimitive: TimescaleMarksPrimitive = createTimescaleMarks({
    chart: deps.chart,
    marks: () => axis,
    slotOf,
    theme: deps.theme,
    mode: deps.mode,
    background: deps.background,
    ...(deps.icons ? { art: hostMarkArt(deps.icons, () => axisPrimitive.refresh()) } : {}),
    hovered: showTip,
  })
  deps.series().attachPrimitive(axisPrimitive as never)

  // The pointer hovers a mark, and a finger or a pen holds one with a press, as a pointer hovers it.
  const local = (event: PointerEvent): PanePoint => {
    const box = deps.gestures!.getBoundingClientRect()
    return { x: event.clientX - box.left - paneLeft(), y: event.clientY - box.top }
  }
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return
    // A drag moves the chart, and a mark it passes over is not hovered.
    axisPrimitive.point(event.buttons ? null : local(event))
  }
  const onLeave = (): void => axisPrimitive.point(null)
  const onDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') return
    axisPrimitive.press(local(event))
  }
  deps.gestures?.addEventListener('pointermove', onMove, { passive: true })
  deps.gestures?.addEventListener('pointerleave', onLeave, { passive: true })
  deps.gestures?.addEventListener('pointerdown', onDown, { passive: true })

  const applyBars = (): void => {
    if (deps.disposed()) return
    const markers = markersOf(bars, deps.theme(), deps.mode())
    if (!plugin) plugin = createSeriesMarkers(deps.series(), markers)
    else plugin.setMarkers(markers)
  }

  const stopSettle = (): void => {
    if (settle !== null) clearTimeout(settle)
    settle = null
  }

  /** Ask for the time-scale marks over the loaded window, on past the last bar as far as the view
   *  reaches and as many slots again as the view spans, so a live bar or a short scroll asks
   *  nothing new. */
  const askAxis = (): void => {
    stopSettle()
    if (!deps.fetchTimescaleMarks || !loaded) return
    const mine = ++axisAsk
    const view = ts.getVisibleLogicalRange()
    const span = view ? Math.max(1, Math.ceil(view.to - view.from)) : 0
    const to = Math.max(loaded.to, reach(span) ?? -Infinity)
    asked = to
    void deps
      .fetchTimescaleMarks(deps.symbol(), loaded.from, to, deps.timeframe())
      .then((marks) => {
        if (deps.disposed() || mine !== axisAsk) return
        axis = marks
        axisPrimitive.refresh()
      })
      .catch(() => {
        /* marks are an enhancement; a refusal leaves the bars alone */
      })
  }

  // A view that reaches past what was asked for asks again once it rests.
  const onView = (): void => {
    if (!loaded || !deps.fetchTimescaleMarks || settle !== null || deps.disposed()) return
    const edge = reach(0)
    if (edge === null || edge <= asked) return
    settle = setTimeout(() => {
      settle = null
      if (!deps.disposed()) askAxis()
    }, VIEW_SETTLE_MS)
  }
  ts.subscribeVisibleLogicalRangeChange(onView)

  return {
    refresh(window) {
      loaded = window
      const mine = ++barAsk
      if (!window) {
        axisAsk++
        stopSettle()
        asked = -Infinity
        bars = []
        axis = []
        applyBars()
        axisPrimitive.refresh()
        return
      }
      if (deps.fetchBarMarks) {
        void deps
          .fetchBarMarks(deps.symbol(), window.from, window.to, deps.timeframe())
          .then((marks) => {
            if (deps.disposed() || mine !== barAsk) return
            bars = marks
            applyBars()
          })
          .catch(() => {
            /* likewise */
          })
      }
      askAxis()
    },
    repaint() {
      applyBars()
      axisPrimitive.refresh()
    },
    clear() {
      barAsk++
      axisAsk++
      stopSettle()
      loaded = null
      asked = -Infinity
      bars = []
      axis = []
      applyBars()
      axisPrimitive.press(null)
      axisPrimitive.refresh()
    },
    destroy() {
      barAsk++
      axisAsk++
      stopSettle()
      loaded = null
      bars = []
      axis = []
      try {
        ts.unsubscribeVisibleLogicalRangeChange(onView)
      } catch {
        /* the renderer went down first */
      }
      deps.gestures?.removeEventListener('pointermove', onMove)
      deps.gestures?.removeEventListener('pointerleave', onLeave)
      deps.gestures?.removeEventListener('pointerdown', onDown)
      tip?.remove()
      try {
        plugin?.setMarkers([])
      } catch {
        /* likewise */
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
