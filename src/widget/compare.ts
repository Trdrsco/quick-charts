// Compare: other symbols beside the charted one, clipped to the main bar model.
//
// Three placements, and each answers a different question about the comparison. `same-percent`
// shares the main scale and flips it to percent while any such compare lives, which is how two
// markets at different price levels are read against each other; `new-scale` binds the LEFT scale
// so a compare keeps its absolute prices; `new-pane` takes a pane of its own. The scale flip is a LOAN: the mode the trader held is restored when the
// last same-percent compare leaves, and an explicit scale pick cancels the loan outright.
//
// One add and one remove pair serve every door — the public api, the dialog, the legend's remove —
// so the loan can never depend on which door was used.
import type { IChartApi } from 'lightweight-charts'
import { attachCompare, type CompareEntry, type CompareHandle, type ComparePlacement, type CompareSymbol } from '../compare'
import { openCompareDialog, type CompareDialogHandle } from '../compareDialog'
import type { ChartDatafeed } from '../datafeed'
import type { ChartI18n } from '../i18n'
import type { LegendChip } from '../chartLegend'
import { createPriceFormatter, type PriceFormatter } from '../priceFormatter'
import type { PriceFormat } from '../symbology'
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
  chips(): LegendChip[]
  /** Open the chart's own dialog: the legend's compare door, or a row's change-symbol. */
  openDialog(mode: 'compare' | 'change-symbol', changeFrom?: string): void
  /** Follow a timeframe switch. */
  setTimeframe(): void
  /** Re-clip to the main window after a repaint. */
  sync(): void
  serialize(): unknown
  restore(state: unknown): void
  /** Forget the loan: an explicit scale pick is the trader overriding it. */
  releaseScaleLoan(): void
  destroy(): void
}

export interface CompareDeps {
  chart: IChartApi
  datafeed: ChartDatafeed
  i18n: ChartI18n
  /** The chrome subtree the dialog mounts into. */
  chrome: HTMLElement
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

  /** The scale the trader held before same-percent forced percent. Null while no flip is on loan. */
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
    scalePolicy()
    deps.onEvent(handle.list())
  }

  /** A compared symbol writes its last value in ITS OWN price format, resolved once per compare
   *  through the same datafeed seam. Until that resolve lands (or when the feed knows nothing) the
   *  row carries no value rather than one written at another market's precision. */
  const formats = new Map<string, PriceFormat | null>()
  const formatterFor = (symbol: string): PriceFormatter | null => {
    if (!formats.has(symbol)) {
      formats.set(symbol, null)
      void deps.datafeed
        .resolve(symbol)
        .then((info) => {
          if (deps.disposed() || !info) return
          formats.set(symbol, info.format)
          deps.onChips()
        })
        .catch(() => {
          /* the row stays valueless; the next mount asks again */
        })
    }
    const format = formats.get(symbol)
    return format ? createPriceFormatter(format, { locale: deps.i18n.tag() }) : null
  }

  let dialog: CompareDialogHandle | null = null

  return {
    handle,
    api: {
      add: (symbol, opts) => add(symbol, opts.placement),
      remove,
      setVisible: (symbol, visible) => handle.setVisible(symbol, visible),
      list: () => handle.list(),
      latest: (symbol) => handle.latest(symbol),
      symbols: () => [...deps.curated],
    },
    chips() {
      return handle.list().map((entry) => {
        const pct = entry.placement === 'same-percent' ? handle.changePct(entry.symbol) : null
        const last = entry.placement === 'same-percent' ? null : handle.latest(entry.symbol)
        const lastText = last != null ? (formatterFor(entry.symbol)?.format(last) ?? null) : null
        return {
          id: `cmp:${entry.symbol}`,
          // A plain pair reads with spaces around the slash ("XRP / USDC"); anything else verbatim.
          title: /^[A-Za-z][A-Za-z0-9.]*\/[A-Za-z][A-Za-z0-9.]*$/.test(entry.symbol) ? entry.symbol.replace('/', ' / ') : entry.symbol,
          // A percentage is its own value kind and keeps two decimals; a last value is a price.
          value: pct != null ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%` : lastText,
          hidden: !entry.visible,
          titleButton: true,
          removable: true,
        } satisfies LegendChip
      })
    },
    openDialog(mode, changeFrom) {
      if (deps.disposed() || !deps.enabled) return
      dialog?.close()
      dialog = openCompareDialog({
        container: deps.chrome,
        strings: deps.i18n,
        datafeed: deps.datafeed,
        mode,
        curated: deps.curated,
        added: () => handle.list(),
        onAdd: add,
        onRemove: remove,
        initialQuery: changeFrom,
        onPick: (next) => {
          if (!changeFrom || next === changeFrom || next === deps.symbol()) return
          const current = handle.list().find((e) => e.symbol === changeFrom)
          if (!current || handle.list().some((e) => e.symbol === next)) return
          handle.remove(changeFrom)
          handle.add(next, { placement: current.placement, color: current.color, visible: current.visible })
          scalePolicy()
          deps.onEvent(handle.list())
        },
        onClose: () => {
          dialog = null
        },
      })
    },
    setTimeframe: () => handle.setTimeframe(),
    sync: () => handle.sync(),
    serialize: () => handle.serialize(),
    restore(state) {
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
      dialog?.close()
      dialog = null
      handle.destroy()
    },
  }
}
