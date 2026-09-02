// The session plane: the shading under the bars, and the market-status the legend's dot shows.
//
// Both read the SAME model, resolved from the symbol rather than guessed from its type. An
// unresolved symbol shades nothing and shows no dot: an unknown market is not a 24/7 claim any
// more than it is a CME one.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'
import {
  createSessionBands,
  isIntradayTf,
  knownMarketKind,
  sessionOf,
  setHolidayCalendar,
  type MaybeMarketKind,
  type MarketSession,
  type SessionBandsPrimitive,
} from '../sessions'
import type { SymbolInfo } from '../symbology'
import type { SemanticTheme } from '../theme/schema'

/** The session plane over one chart. */
export interface SessionLayer {
  /** The market's model, or null while the symbol is unresolved. */
  kind(): MaybeMarketKind
  /** The session right now, or null with no model. */
  now(): MarketSession | null
  /** Adopt a resolved symbol's session model and repaint. */
  adopt(info: SymbolInfo | null): void
  /** Forget the model: a symbol or timeframe switch invalidates it. */
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
}

export function attachSession(deps: SessionDeps): SessionLayer {
  let kind: MaybeMarketKind = null
  let bands: SessionBandsPrimitive | null = null
  const series = deps.series()

  bands = createSessionBands(
    deps.chart,
    series,
    deps.enabled,
    () => kind,
    () => isIntradayTf(deps.timeframe()),
    deps.theme,
  )
  series.attachPrimitive(bands as never)

  return {
    kind: () => kind,
    now: () => (kind ? sessionOf(Date.now(), kind) : null),
    adopt(info) {
      if (!info) return
      kind = knownMarketKind(info.type, info.sessionClass ?? null)
      if (info.sessionCalendar && kind) setHolidayCalendar(kind, info.sessionCalendar)
      bands?.refresh()
    },
    reset() {
      kind = null
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
}
