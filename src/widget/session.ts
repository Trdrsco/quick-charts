// The session plane: the shading under the bars and the line at each session's start, the market
// status the legend's marks show, the trading-hours choices the symbol offers, and the subsession
// the chart's trading-hours setting filters intraday bars by.
//
// All three read ONE model, built from the symbol's own session facts rather than guessed from its
// type. An unresolved symbol shades nothing and shows no status: an unknown market is not a 24/7
// claim any more than it is an exchange-hours one.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import { createSessionBands, type SessionBandsPrimitive, type SessionLook } from '../sessions'
import {
  hasExtendedHours,
  marketStatus,
  parseSessionModel,
  subsessionBarFilter,
  tradingHoursOptions,
  type ActiveSubsession,
  type MarketStatus,
  type SessionModel,
  type TradingHoursOption,
} from '../sessionModel'
import type { ChartSessionHours } from '../settings/schema'
import { isIntradayTimeframe } from '../timeframe'
import type { DataStatus, SymbolInfo } from '../symbology'
import type { SemanticTheme } from '../theme/schema'

/** The session plane over one chart. */
export interface SessionLayer {
  /** The symbol's session model, or null while it is unresolved. */
  model(): SessionModel | null
  /** The market status a host surface renders: the state, what is next, and how live the data is.
   *  Null until the symbol resolves. */
  status(nowSecs?: number): MarketStatus | null
  /** Whether this symbol trades outside regular hours at all. A symbol that does not makes the
   *  subsession choice meaningless, which is what a picker needs to know before offering it. */
  extended(): boolean
  /** The trading-hours choices the symbol offers, in a picker's order: none while it is unresolved
   *  or has nothing to choose. */
  options(): readonly TradingHoursOption[]
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
  /** Whether the shading is on: the feature flag and the trading-hours setting, read live. */
  enabled(): boolean
  /** The colors and session breaks the chart settings ask for, read at draw time. */
  look(): SessionLook
  timeframe(): string
  theme(): SemanticTheme
  /** How live the feed says the symbol's data is; the status carries it. */
  dataStatus(): DataStatus | null
  /** The subsession the trading-hours setting shows bars for, read live. */
  subsession(): ActiveSubsession
  /** The trading-hours setting itself, which tells 24 hours from extended hours. */
  hours(): ChartSessionHours
  /** The viewer chose a subsession: the chart writes it into its trading-hours setting, which
   *  repaints the bars and the bands. */
  setSubsession(active: ActiveSubsession): void
}

export function attachSession(deps: SessionDeps): SessionLayer {
  let model: SessionModel | null = null
  let bands: SessionBandsPrimitive | null = null
  const series = deps.series()

  bands = createSessionBands(
    deps.chart,
    series,
    deps.enabled,
    () => model,
    () => isIntradayTimeframe(deps.timeframe()),
    deps.theme,
    deps.look,
  )
  series.attachPrimitive(bands as never)

  const layer: SessionLayer = {
    model: () => model,
    status(nowSecs) {
      const status = deps.dataStatus()
      if (!model || !status) return null
      return marketStatus(model, status, nowSecs ?? Math.floor(Date.now() / 1000))
    },
    extended: () => (model ? hasExtendedHours(model) : false),
    options: () => tradingHoursOptions(model),
    subsession: () => deps.subsession(),
    setSubsession(next) {
      // A symbol with no extended hours has ONE subsession, so a choice against it would be a
      // setting the chart cannot honor. Extended hours chosen under 24 hours is a change.
      if (next === deps.hours() || (next === 'extended' && !layer.extended())) return
      deps.setSubsession(next)
      bands?.refresh()
    },
    barFilter(timeframe) {
      if (!model || !isIntradayTimeframe(timeframe)) return null
      // A symbol that never trades outside regular hours shows every bar whatever the setting says.
      return subsessionBarFilter(model, deps.subsession())
    },
    adopt(info) {
      if (!info) return
      model = parseSessionModel(info)
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
