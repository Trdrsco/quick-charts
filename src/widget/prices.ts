// The charted symbol's live prices, and the previous session's close they are measured from.
//
// The prices come from the datafeed's optional prices port. The chart holds a subscription only
// while a setting draws something from it, so a feed is never asked for a stream nobody shows, and
// a symbol change ends the old one before the new one starts. A delivery that arrives for a symbol
// no longer on screen is dropped.
//
// The previous session's close is the feed's own when it states one (or states the change from it),
// and otherwise is read off the bars: on an intraday chart, the last regular-hours bar of the
// trading day before the newest bar's, by the symbol's session model; on a daily or longer chart,
// the bar before the newest. Without a session model an intraday chart has no previous close.
import type { ChartDatafeed, FeedBar, SymbolPrices } from '../datafeed'
import { sessionStateAt, type SessionModel } from '../sessionModel'
import { tradingDayOf } from '../sessions'

export interface PricesPlane {
  /** The prices as they stand, or null while none have arrived for the symbol on screen. */
  current(): SymbolPrices | null
  /** Subscribe or unsubscribe so a subscription stands exactly while a setting draws the prices, for
   *  the symbol on screen. */
  sync(): void
  destroy(): void
}

export interface PricesDeps {
  datafeed: ChartDatafeed
  symbol(): string
  /** Whether a setting draws anything from the prices now. */
  wanted(): boolean
  /** New prices arrived: the surfaces that draw them repaint. */
  changed(): void
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** One delivery over what was held: a field it states replaces the held one, a field it leaves out
 *  keeps it, and a field that is not a finite number is not a price and is left out. Exported for
 *  tests. */
export function mergePrices(held: SymbolPrices | null, next: SymbolPrices): SymbolPrices {
  const out: SymbolPrices = { ...held }
  for (const key of ['bid', 'ask', 'last', 'previousClose', 'change'] as const) {
    const value = next[key]
    if (finite(value)) out[key] = value
  }
  return out
}

export function attachPrices(deps: PricesDeps): PricesPlane {
  /** The prices held, and the symbol they are the prices of. */
  let held: SymbolPrices | null = null
  let heldFor: string | null = null
  let unsubscribe: (() => void) | null = null
  /** The symbol the standing subscription is for, and a counter that retires a subscription's
   *  deliveries the moment it is replaced. */
  let subscribed: string | null = null
  let generation = 0
  let destroyed = false

  /** End the standing subscription. What it delivered goes with it: prices nobody keeps current are
   *  not prices to draw. */
  const stop = (): void => {
    generation++
    const off = unsubscribe
    unsubscribe = null
    subscribed = null
    held = null
    heldFor = null
    try {
      off?.()
    } catch {
      /* the feed's own teardown failing is the feed's */
    }
  }

  const sync = (): void => {
    if (destroyed) return
    const subscribe = deps.datafeed.subscribePrices
    const symbol = deps.symbol()
    const want = !!subscribe && symbol !== '' && deps.wanted()
    if (!want) {
      if (unsubscribe) stop()
      return
    }
    if (subscribed === symbol && unsubscribe) return
    stop()
    const mine = generation
    subscribed = symbol
    try {
      unsubscribe = subscribe.call(deps.datafeed, symbol, {
        onPrices: (prices) => {
          if (destroyed || mine !== generation || !prices || typeof prices !== 'object') return
          held = mergePrices(heldFor === symbol ? held : null, prices)
          heldFor = symbol
          deps.changed()
        },
      })
    } catch {
      unsubscribe = null
      subscribed = null
    }
  }

  return {
    current: () => (heldFor !== null && heldFor === deps.symbol() ? held : null),
    sync,
    destroy() {
      if (destroyed) return
      stop()
      destroyed = true
    },
  }
}

/** Per language: the writer of whole numbers, and the decimal sign and minus sign it writes. */
const percentWriters = new Map<string, { whole: Intl.NumberFormat; decimal: string; minus: string }>()

/** A change as a percentage of what it is measured from, to two decimals with its sign and the
 *  percent sign, in the reader's own digits and signs: "+0.08%". The two decimals are arithmetic,
 *  hundredths of a point written after the reader's decimal sign, because a ratio has no symbology
 *  and the only writer that sets a decimal width from a market's facts is the price formatter.
 *  Exported for tests. */
export function signedPercentText(fraction: number, tag: string): string {
  let writer = percentWriters.get(tag)
  if (!writer) {
    const whole = new Intl.NumberFormat(tag)
    const part = (value: number, type: string): string | undefined => whole.formatToParts(value).find((p) => p.type === type)?.value
    writer = { whole, decimal: part(1.5, 'decimal') ?? '.', minus: part(-1, 'minusSign') ?? '-' }
    percentWriters.set(tag, writer)
  }
  const hundredths = Math.round(Math.abs(fraction) * 10_000)
  const sign = hundredths === 0 ? '' : fraction > 0 ? '+' : writer.minus
  return `${sign}${writer.whole.format(Math.floor(hundredths / 100))}${writer.decimal}${String(hundredths % 100).padStart(2, '0')}%`
}

/** The previous session's close the feed states: its own close, or its last less the change it
 *  states. Null when it states neither. */
export function statedPreviousClose(prices: SymbolPrices | null): number | null {
  if (!prices) return null
  if (finite(prices.previousClose)) return prices.previousClose
  if (finite(prices.last) && finite(prices.change)) return prices.last - prices.change
  return null
}

/** The previous session's close read off ascending bars. On an intraday timeframe it is the close of
 *  the last regular-hours bar of the trading day before the newest bar's, by the session model; on a
 *  daily or longer one it is the close of the bar before the newest. Null when the bars hold no such
 *  bar, or an intraday chart has no session model. */
export function previousCloseFromBars(bars: readonly FeedBar[], intraday: boolean, model: SessionModel | null): number | null {
  const last = bars[bars.length - 1]
  if (!last) return null
  if (!intraday) return bars[bars.length - 2]?.c ?? null
  if (!model) return null
  const dayOf = tradingDayOf(model)
  const today = dayOf(last.t)
  // The trading day only grows with time, so the newest day's first bar is found by halving.
  let lo = 0
  let hi = bars.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dayOf(bars[mid]!.t) < today) lo = mid + 1
    else hi = mid
  }
  for (let i = lo - 1; i >= 0; i--) {
    const bar = bars[i]!
    if (model.continuous || sessionStateAt(model, bar.t) === 'open') return bar.c
  }
  return null
}
