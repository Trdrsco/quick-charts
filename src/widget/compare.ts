// Compare: other symbols beside the charted one, clipped to the main bar model.
//
// Three placements, and each answers a different question about the comparison. `same-percent`
// shares the main scale and flips it to percent while any such compare lives, which is how two
// markets at different price levels are read against each other; `new-scale` binds the LEFT scale
// so a compare keeps its absolute prices; `new-pane` takes a pane of its own. The scale flip is a LOAN: the mode the viewer held is restored when the
// last same-percent compare leaves, and an explicit scale pick cancels the loan outright.
//
// One add and one remove pair serve every door — the public api, the dialog, the legend's remove —
// so the loan can never depend on which door was used.
import type { IChartApi } from 'lightweight-charts'
import { attachCompare, maintainCompareTimeline, readCompareAt, type CompareEntry, type CompareHandle, type ComparePlacement, type CompareSymbol } from '../compare'
import type { ChartDatafeed } from '../datafeed'
import type { ChartI18n } from '../i18n'
import type { LegendChip } from '../chartLegend'
import { createPriceFormatter, type PriceFormatter } from '../priceFormatter'
import type { SymbolInfo } from '../symbology'
import { symbolNames } from '../symbolLabel'
import type { ScaleMode } from '../scaleMode'

/** The compare surface a host drives. */
export interface ChartCompareApi {
  add(symbol: string, opts: { placement: ComparePlacement }): void
  remove(symbol: string): void
  setVisible(symbol: string, visible: boolean): void
  list(): CompareEntry[]
  /** Latest in-window close for one compare, or null. */
  latest(symbol: string): number | null
  /** The host-supplied curated quick-add list, for the compare dialog. */
  symbols(): CompareSymbol[]
}

/** The compare plane over one chart. */
export interface ComparePlane {
  api: ChartCompareApi
  handle: CompareHandle
  /** The legend rows for the current compares. */
  chips(time?: number | null): LegendChip[]
  /** Open the search dialog: the legend's compare door, or a row's change-symbol. The dialog is
   *  the widget chrome's; this plane supplies the pick that re-keys a compare in place. */
  openDialog(mode: 'compare' | 'change-symbol', changeFrom?: string): void
  /** Follow a timeframe switch. */
  setTimeframe(): void
  /** Re-clip to the main window after a repaint. */
  sync(): void
  serialize(): unknown
  restore(state: unknown): void
  /** Forget the loan: an explicit scale pick is the viewer overriding it. */
  releaseScaleLoan(): void
  destroy(): void
}

export interface CompareDeps {
  chart: IChartApi
  datafeed: ChartDatafeed
  i18n: ChartI18n
  /** The widget chrome's search door. `onPick` receives a change-symbol pick. */
  openSearch(mode: 'compare' | 'change-symbol', changeFrom: string | undefined, onPick: (symbol: string) => void): void
  symbol(): string
  timeframe(): string
  /** The main bar window, or null before first data. */
  mainWindow(): { from: number; to: number } | null
  /** The chart's scale mode, and the one way to change it. */
  scaleMode(): ScaleMode
  applyScaleMode(mode: ScaleMode): void
  /** The curated quick-add rows. */
  curated: readonly CompareSymbol[]
  /** Whether the feature is on at all. */
  enabled: boolean
  /** The chart went down. */
  disposed(): boolean
  /** The rows changed. */
  onChips(): void
  onEvent(entries: readonly CompareEntry[]): void
  /** Hold the chart's shared viewport across older compare history painting. */
  maintainTimeline?(write: () => void): void
}

/** How long a burst of compare ticks is collected before the rows are rebuilt. Every compare's
 *  live bar notifies, and re-rendering the legend per tick would be churn for a value the eye
 *  cannot follow. */
const CHIP_THROTTLE_MS = 250

export function attachComparePlane(deps: CompareDeps): ComparePlane {
  let chipTimer: ReturnType<typeof setTimeout> | null = null
  const handle = attachCompare(deps.chart, {
    datafeed: deps.datafeed,
    tf: deps.timeframe,
    mainWindow: deps.mainWindow,
    onChange: () => {
      if (chipTimer !== null) return
      chipTimer = setTimeout(() => {
        chipTimer = null
        if (!deps.disposed()) deps.onChips()
      }, CHIP_THROTTLE_MS)
    },
  })
  if (deps.maintainTimeline) maintainCompareTimeline(handle, deps.maintainTimeline)

  /** The scale the viewer held before same-percent forced percent. Null while no flip is on loan. */
  let scaleBeforeCompare: ScaleMode | null = null
  const scalePolicy = (): void => {
    if (handle.hasSamePercent()) {
      if (deps.scaleMode() !== 'percent') {
        scaleBeforeCompare = deps.scaleMode()
        deps.applyScaleMode('percent')
      }
    } else if (scaleBeforeCompare !== null) {
      const prior = scaleBeforeCompare
      scaleBeforeCompare = null
      deps.applyScaleMode(prior)
    }
  }

  const add = (symbol: string, placement: ComparePlacement): void => {
    // The charted symbol compared to itself is a no-op, and so is any add with the feature off.
    if (deps.disposed() || !deps.enabled || !symbol || symbol === deps.symbol()) return
    handle.add(symbol, { placement })
    scalePolicy()
    deps.onEvent(handle.list())
  }
  const remove = (symbol: string): void => {
    if (deps.disposed()) return
    handle.remove(symbol)
    formats.delete(symbol)
    scalePolicy()
    deps.onEvent(handle.list())
  }

  /** A compared symbol writes its last value in ITS OWN price format, resolved once per compare
   *  through the same datafeed seam. Until that resolve lands (or when the feed knows nothing) the
   *  row carries no value rather than one written at another market's precision. */
  const formats = new Map<string, { info: SymbolInfo | null }>()
  const formatterFor = (symbol: string): PriceFormatter | null => {
    if (!formats.has(symbol)) {
      const record = { info: null as SymbolInfo | null }
      formats.set(symbol, record)
      void deps.datafeed
        .resolve(symbol)
        .then((info) => {
          if (deps.disposed() || !info || formats.get(symbol) !== record || !handle.list().some(entry => entry.symbol === symbol)) return
          record.info = info
          deps.onChips()
        })
        .catch(() => {
          /* the row stays valueless; the next mount asks again */
        })
    }
    const format = formats.get(symbol)?.info?.format
    return format ? createPriceFormatter(format, { locale: deps.i18n.tag() }) : null
  }

  return {
    handle,
    api: {
      add: (symbol, opts) => add(symbol, opts.placement),
      remove,
      setVisible: (symbol, visible) => {
        handle.setVisible(symbol, visible)
        // Visibility is part of what a comparison row IS, so hiding one reports like adding or
        // removing one: it is written down with the row and every follower reads the same list.
        deps.onEvent(handle.list())
      },
      list: () => handle.list(),
      latest: (symbol) => handle.latest(symbol),
      symbols: () => [...deps.curated],
    },
    chips(time = null) {
      return handle.list().map((entry) => {
        const formatter = formatterFor(entry.symbol)
        const reading = readCompareAt(handle, entry.symbol, time)
        const pct = entry.placement === 'same-percent' ? reading.percent : null
        const last = entry.placement === 'same-percent' ? null : reading.latest
        const lastText = last != null ? (formatter?.format(last) ?? null) : null
        const info = formats.get(entry.symbol)?.info ?? null
        return {
          id: `cmp:${entry.symbol}`,
          // The market as the legend writes it — the pair spelled out, never the contract's prose
          // name — so a compare row and the header's identity read the same way.
          title: symbolNames(info ?? entry.symbol).title,
          mark: entry.symbol,
          venue: info?.exchange ?? '',
          // A percentage is its own value kind and keeps two decimals; a last value is a price.
          value: pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : lastText,
          // Only the MOVE takes a direction. A last price is a level, and colouring it would claim
          // a direction the number is not stating.
          ...(pct != null ? { tone: pct >= 0 ? ('up' as const) : ('down' as const) } : {}),
          hidden: !entry.visible,
          titleButton: true,
          removable: true,
        } satisfies LegendChip
      })
    },
    openDialog(mode, changeFrom) {
      if (deps.disposed() || !deps.enabled) return
      deps.openSearch(mode, changeFrom, (next) => {
        // A change-symbol pick re-keys the compare in place: the placement, color and visibility
        // the row had carry over to the new symbol, so the viewer swapped a market, not a row.
        if (!changeFrom || next === changeFrom || next === deps.symbol()) return
        const current = handle.list().find((e) => e.symbol === changeFrom)
        if (!current || handle.list().some((e) => e.symbol === next)) return
        handle.remove(changeFrom)
        formats.delete(changeFrom)
        handle.add(next, { placement: current.placement, color: current.color, visible: current.visible })
        scalePolicy()
        deps.onEvent(handle.list())
      })
    },
    setTimeframe: () => handle.setTimeframe(),
    sync: () => handle.sync(),
    serialize: () => handle.serialize(),
    restore(state) {
      formats.clear()
      handle.restore(Array.isArray(state) ? state : [])
      scalePolicy()
      deps.onEvent(handle.list())
    },
    releaseScaleLoan() {
      scaleBeforeCompare = null
    },
    destroy() {
      if (chipTimer) clearTimeout(chipTimer)
      chipTimer = null
      formats.clear()
      handle.destroy()
    },
  }
}
