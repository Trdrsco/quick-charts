// The session plane: the shading under the bars, the market status the legend's dot shows, and the
// active subsession the chart filters intraday bars by.
//
// All three read ONE model, built from the symbol's own session facts rather than guessed from its
// type. An unresolved symbol shades nothing and shows no status: an unknown market is not a 24/7
// claim any more than it is an exchange-hours one.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { createSessionBands, type SessionBandsPrimitive } from '../sessions'
import {
  DEFAULT_SUBSESSION,
  hasExtendedHours,
  marketStatus,
  parseSessionModel,
  sessionStateAt,
  subsessionBarFilter,
  type ActiveSubsession,
  type MarketStatus,
  type SessionModel,
  type SessionState,
} from '../sessionModel'
import { isIntradayTimeframe } from '../timeframe'
import type { DataStatus, SymbolInfo } from '../symbology'
import type { SemanticTheme } from '../theme/schema'

/** The session plane over one chart. */
export interface SessionLayer {
  /** The symbol's session model, or null while it is unresolved. */
  model(): SessionModel | null
  /** The session state right now, or null with no model. */
  state(): SessionState | null
  /** The market status a host surface renders: the state, what is next, and how live the data is.
   *  Null until the symbol resolves. */
  status(nowSecs?: number): MarketStatus | null
  /** Whether this symbol trades outside regular hours at all. A symbol that does not makes the
   *  subsession choice meaningless, which is what a picker needs to know before offering it. */
  extended(): boolean
  /** Which subsession the chart is showing. */
  subsession(): ActiveSubsession
  setSubsession(active: ActiveSubsession): void
  /** The filter intraday bars pass to be shown under the active subsession, or null when every bar
   *  is shown. A daily or larger bar spans whole sessions, so it is never filtered. */
  barFilter(timeframe: string): ((epochSecs: number) => boolean) | null
  /** Adopt a resolved symbol's session facts and repaint. */
  adopt(info: SymbolInfo | null): void
  /** Forget the model: a symbol switch invalidates it. */
  reset(): void
  /** Repaint the bands. Nothing in the chart invalidates the pane when the model or a setting
   *  changes, so the caller pokes it. */
  refresh(): void
  destroy(): void
}

export interface SessionDeps {
  chart: IChartApi
  series(): ISeriesApi<SeriesType>
  /** Whether the shading is on: the feature flag and the appearance leaf, read live. */
  enabled(): boolean
  timeframe(): string
  theme(): SemanticTheme
  /** How live the feed says the symbol's data is; the status carries it. */
  dataStatus(): DataStatus | null
  /** The subsession the viewer last chose, from the preference plane. */
  initialSubsession: ActiveSubsession
  /** The viewer changed the subsession, so the chart can persist it and repaint. */
  onSubsession(active: ActiveSubsession): void
}

export function attachSession(deps: SessionDeps): SessionLayer {
  let model: SessionModel | null = null
  let active: ActiveSubsession = deps.initialSubsession
  let bands: SessionBandsPrimitive | null = null
  const series = deps.series()

  bands = createSessionBands(
    deps.chart,
    series,
    deps.enabled,
    () => model,
    () => isIntradayTimeframe(deps.timeframe()),
    deps.theme,
  )
  series.attachPrimitive(bands as never)

  const layer: SessionLayer = {
    model: () => model,
    state: () => (model ? sessionStateAt(model, Math.floor(Date.now() / 1000)) : null),
    status(nowSecs) {
      const status = deps.dataStatus()
      if (!model || !status) return null
      return marketStatus(model, status, nowSecs ?? Math.floor(Date.now() / 1000))
    },
    extended: () => (model ? hasExtendedHours(model) : false),
    subsession: () => active,
    setSubsession(next) {
      // A symbol with no extended hours has ONE subsession, so a choice against it would be a
      // setting the chart cannot honor.
      if (next === active || (next === 'extended' && !layer.extended())) return
      active = next
      deps.onSubsession(next)
      bands?.refresh()
    },
    barFilter(timeframe) {
      if (!model || !isIntradayTimeframe(timeframe)) return null
      return subsessionBarFilter(model, active)
    },
    adopt(info) {
      if (!info) return
      model = parseSessionModel(info)
      // A symbol that never trades outside regular hours cannot hold an extended choice.
      if (active === 'extended' && !layer.extended()) active = DEFAULT_SUBSESSION
      bands?.refresh()
    },
    reset() {
      model = null
      bands?.refresh()
    },
    refresh() {
      bands?.refresh()
    },
    destroy() {
      if (!bands) return
      try {
        series.detachPrimitive(bands as never)
      } catch {
        /* the series went down first */
      }
      bands = null
    },
  }
  return layer
}
