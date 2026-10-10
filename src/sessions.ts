// Session shading, session breaks and the session colors, over the symbol's own session model
// (sessionModel.ts). Two consumers: the SESSION BANDS primitive, which shades every stretch of the
// visible chart that is not regular hours and draws a line where each session starts, and the
// legend's market-status dot, which wears the state's color. Both
// read what the feed said about the symbol and nothing else: a symbol whose model is not known
// draws nothing, and a continuous market never bands.
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { sessionStateAt, type SessionModel, type SessionState } from './sessionModel'
import type { ChartStrokeStyle } from './settings/schema'
import type { SemanticTheme, ThemeRoleId } from './theme/schema'
import { zoneClock } from './timezones'

/** The session's name in English — what a host renders when it shows status text of its own. The
 *  widget's catalog carries the same five under `session.<state>`, keyed by these very names, so a
 *  host reading the catalog and a host reading this table always say the same thing. */
export const SESSION_LABEL: Readonly<Record<SessionState, string>> = {
  pre: 'Pre-market',
  open: 'Market open',
  extended: 'Extended hours',
  after: 'After-hours',
  closed: 'Market closed',
}

/** The semantic theme role a session state's status marker wears. A consumer resolves the role
 *  against the theme in effect, so the marker follows light or dark and a host's custom palette
 *  instead of carrying a color of its own. */
export const SESSION_DOT: Readonly<Record<SessionState, ThemeRoleId>> = {
  pre: 'status.sessionPreMarket',
  open: 'status.sessionOpen',
  extended: 'status.sessionExtended',
  after: 'status.sessionAfterHours',
  closed: 'status.sessionClosed',
}

/** The role each shaded stretch takes. Regular hours are the unshaded ground, which is why `open`
 *  has no entry here. */
const BAND_ROLE: Readonly<Record<Exclude<SessionState, 'open'>, ThemeRoleId>> = {
  pre: 'scale.sessionPreMarket',
  extended: 'scale.sessionExtended',
  after: 'scale.sessionAfterHours',
  closed: 'scale.sessionClosed',
}

/** The dash pattern a stroke style draws with at a line width, in the same proportions the
 *  renderer's own lines use for the same settings: a dash and its gap six widths each, a dot one
 *  width with a gap of four. */
export function strokeDash(style: ChartStrokeStyle, width: number): number[] {
  if (style === 'dashed') return [6 * width, 6 * width]
  if (style === 'dotted') return [width, 4 * width]
  return []
}

/** The minutes a trading day reaches back before its own calendar midnight: a session that opens the
 *  previous evening (`1700F-1600`) belongs to the day it closes on, so its evening counts toward the
 *  next date. Zero for a session that starts on its own day. */
function sessionDayReach(model: SessionModel): number {
  let earliest = 0
  const schedules = [model.regular, ...model.extended.map((stretch) => stretch.schedule)]
  for (const schedule of schedules) for (const day of schedule.week) for (const segment of day) earliest = Math.min(earliest, segment.start)
  return -earliest
}

/** The bar times among `times` (ascending) that open a new trading day: each bar whose trading day,
 *  read in the exchange zone, differs from the bar before it. The first bar opens nothing, because
 *  the day before it is not on screen. */
export function sessionBreakTimes(model: SessionModel, times: readonly number[]): number[] {
  const reach = sessionDayReach(model) * 60
  const dayOf = (time: number): number => {
    const clock = zoneClock(model.timezone, new Date((time + reach) * 1000))
    return clock.year * 10_000 + clock.month * 100 + clock.day
  }
  const breaks: number[] = []
  let previous: number | null = null
  for (const time of times) {
    const day = dayOf(time)
    if (previous !== null && day !== previous) breaks.push(time)
    previous = day
  }
  return breaks
}

/** How the bands look under the chart settings: the shading of each stretch outside regular hours
 *  (null leaves it clear) and the line at each session's start (null draws none). The closed
 *  stretch keeps its theme role. */
export interface SessionLook {
  pre: string | null
  after: string | null
  extended: string | null
  breaks: { color: string; width: number; style: ChartStrokeStyle } | null
}

/** A series primitive that shades every non-regular-hours stretch of the visible chart and draws a
 *  vertical line where each trading day starts. Bars are read back from the price series (no
 *  second feed), classified under the symbol's CURRENT session model, merged into runs, and drawn as
 *  full-height rects UNDER the main series (zOrder bottom). Re-renders with every chart paint, so it
 *  tracks pan/zoom for free. An UNKNOWN model (null) draws nothing: drawing nothing is the only
 *  honest render before the symbol resolves. A continuous market never bands (it is always open),
 *  though its days still break. Both render on INTRADAY timeframes only: a daily or larger bar spans
 *  whole sessions, so classifying its single timestamp would shade entire days by whichever session
 *  that instant fell in, and every bar would start a day. */
export interface SessionBandsPrimitive {
  paneViews(): unknown[]
  attached(param: { requestUpdate?: () => void }): void
  detached(): void
  /** Repaint now. The primitive reads `enabled`/`model`/`intraday` through getters and NOTHING in
   *  the chart invalidates the pane when one of them changes: the host pokes it here when the
   *  session model resolves or a setting flips, or bands appear only on the next incidental
   *  repaint (on a quiet market: never). */
  refresh(): void
}

interface BitmapScope {
  context: CanvasRenderingContext2D
  bitmapSize: { width: number; height: number }
  horizontalPixelRatio: number
  verticalPixelRatio?: number
}

export function createSessionBands(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  /** Whether the stretches outside regular hours are shaded. */
  enabled: () => boolean,
  model: () => SessionModel | null,
  intraday: () => boolean,
  /** The theme in effect. Read at draw time, so a mode switch repaints the bands with the pane. */
  theme: () => SemanticTheme,
  /** The colors and the session breaks the chart settings ask for. Without it each stretch wears
   *  its theme role and no break is drawn. */
  look?: () => SessionLook,
): SessionBandsPrimitive {
  const shadeOf = (state: Exclude<SessionState, 'open'>): string | null => {
    if (state === 'closed' || !look) return theme()[BAND_ROLE[state]]
    return look()[state]
  }
  const renderer = {
    draw(target: unknown) {
      const m = model()
      if (!intraday() || m === null) return
      const shade = enabled() && !m.continuous
      const breaks = look?.().breaks ?? null
      if (!shade && !breaks) return
      const t = target as { useBitmapCoordinateSpace: (fn: (scope: BitmapScope) => void) => void }
      t.useBitmapCoordinateSpace((scope) => {
        // REAL bars only: the future-whitespace horizon (right-margin drawing) must not paint
        // session bands into empty space past the last candle.
        const data = (series.data() as { time: Time; close?: number; value?: number }[]).filter(
          (b) => typeof b.close === 'number' || typeof b.value === 'number',
        )
        if (data.length < 2) return
        const ts = chart.timeScale()
        const range = ts.getVisibleRange()
        if (!range) return
        const visible = data
          .map((bar) => bar.time as number)
          .filter((time) => time >= (range.from as number) - 86_400 && time <= (range.to as number) + 86_400)
        if (shade) drawBands(scope, visible)
        if (breaks) drawBreaks(scope, visible, breaks)
      })

      function drawBands(scope: BitmapScope, times: readonly number[]): void {
        const ts = chart.timeScale()
        const barW = ts.options().barSpacing
        // Merge consecutive same-state bars into runs (visible window only, with 1-bar slack).
        let runStart: number | null = null
        let runState: SessionState | null = null
        const flush = (endTime: number) => {
          if (runStart == null || runState == null || runState === 'open') {
            runStart = null
            return
          }
          const fill = shadeOf(runState)
          const x1 = ts.timeToCoordinate(runStart as Time)
          const x2 = ts.timeToCoordinate(endTime as Time)
          if (fill === null || (x1 == null && x2 == null)) {
            runStart = null
            return
          }
          const r = scope.horizontalPixelRatio
          const left = ((x1 ?? -barW) - barW / 2) * r
          const right = ((x2 ?? scope.bitmapSize.width / r + barW) + barW / 2) * r
          scope.context.fillStyle = fill
          scope.context.fillRect(left, 0, right - left, scope.bitmapSize.height)
          runStart = null
        }
        let prevTime = 0
        for (const time of times) {
          const s = sessionStateAt(m!, time)
          if (s !== runState) {
            if (runState != null) flush(prevTime)
            runStart = time
            runState = s
          }
          prevTime = time
        }
        if (runState != null) flush(prevTime)
      }

      function drawBreaks(scope: BitmapScope, times: readonly number[], stroke: NonNullable<SessionLook['breaks']>): void {
        const ts = chart.timeScale()
        const h = scope.horizontalPixelRatio
        const v = scope.verticalPixelRatio ?? h
        const ctx = scope.context
        const width = Math.max(1, Math.round(stroke.width * h))
        ctx.save()
        ctx.strokeStyle = stroke.color
        ctx.lineWidth = width
        ctx.setLineDash(strokeDash(stroke.style, stroke.width).map((length) => length * v))
        ctx.beginPath()
        for (const time of sessionBreakTimes(m!, times)) {
          const x = ts.timeToCoordinate(time as Time)
          if (x == null) continue
          // A line of odd pixel width sits on a pixel's center, so it is crisp rather than smeared.
          const at = Math.round(x * h) + (width % 2 ? 0.5 : 0)
          ctx.moveTo(at, 0)
          ctx.lineTo(at, scope.bitmapSize.height)
        }
        ctx.stroke()
        ctx.restore()
      }
    },
  }
  // NOTE: in lightweight-charts v5 a pane view's zOrder is a METHOD: a plain property makes the
  // library call a string and crash every chart paint (which unmounts the whole app).
  let requestUpdate: (() => void) | null = null
  return {
    paneViews() {
      return [{ zOrder: () => 'bottom' as const, renderer: () => renderer }]
    },
    attached(param: { requestUpdate?: () => void }) {
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
