// Session shading and the session colors, over the symbol's own session model (sessionModel.ts).
// Two consumers: the SESSION BANDS primitive, which shades every stretch of the visible chart that
// is not regular hours, and the legend's market-status dot, which wears the state's color. Both
// read what the feed said about the symbol and nothing else: a symbol whose model is not known
// draws nothing, and a continuous market never bands.
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { sessionStateAt, type SessionModel, type SessionState } from './sessionModel'
import type { SemanticTheme, ThemeRoleId } from './theme/schema'

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

/** A series primitive that shades every non-regular-hours stretch of the visible chart. Bars are
 *  read back from the price series (no second feed), classified under the symbol's CURRENT session
 *  model, merged into runs, and drawn as full-height rects UNDER the candles (zOrder bottom).
 *  Re-renders with every chart paint, so it tracks pan/zoom for free. An UNKNOWN model (null)
 *  never bands: drawing nothing is the only honest render before the symbol resolves. A continuous
 *  market never bands (it is always open), and bands render on INTRADAY intervals only: a daily or
 *  larger bar spans whole sessions, so classifying its single timestamp would shade entire days by
 *  whichever session that instant fell in. */
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

export function createSessionBands(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  enabled: () => boolean,
  model: () => SessionModel | null,
  intraday: () => boolean,
  /** The theme in effect. Read at draw time, so a mode switch repaints the bands with the pane. */
  theme: () => SemanticTheme,
): SessionBandsPrimitive {
  const renderer = {
    draw(target: unknown) {
      const m = model()
      if (!enabled() || !intraday() || m === null || m.continuous) return
      const t = target as {
        useBitmapCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D; bitmapSize: { width: number; height: number }; horizontalPixelRatio: number }) => void) => void
      }
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
        const barW = ts.options().barSpacing
        // Merge consecutive same-state bars into runs (visible window only, with 1-bar slack).
        let runStart: number | null = null
        let runState: SessionState | null = null
        const flush = (endTime: number) => {
          if (runStart == null || runState == null || runState === 'open') {
            runStart = null
            return
          }
          const x1 = ts.timeToCoordinate(runStart as Time)
          const x2 = ts.timeToCoordinate(endTime as Time)
          if (x1 == null && x2 == null) {
            runStart = null
            return
          }
          const r = scope.horizontalPixelRatio
          const left = ((x1 ?? -barW) - barW / 2) * r
          const right = ((x2 ?? scope.bitmapSize.width / r + barW) + barW / 2) * r
          scope.context.fillStyle = theme()[BAND_ROLE[runState]]
          scope.context.fillRect(left, 0, right - left, scope.bitmapSize.height)
          runStart = null
        }
        let prevTime = 0
        for (const bar of data) {
          const time = bar.time as number
          if (time < (range.from as number) - 86_400 || time > (range.to as number) + 86_400) continue
          const s = sessionStateAt(m, time)
          if (s !== runState) {
            if (runState != null) flush(prevTime)
            runStart = time
            runState = s
          }
          prevTime = time
        }
        if (runState != null) flush(prevTime)
      })
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
