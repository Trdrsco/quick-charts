// Quick Charts SYMBOLOGY — the display facts `ChartDatafeed.resolve` serves for one symbol, and the
// only place a chart price display gets its precision from. The division of responsibility is the
// Advanced Charts one (DECISIONS.md, "Quick Charts follows datafeed symbology; trading follows
// broker instrument facts"): the datafeed says how a market's prices are WRITTEN, a broker seam
// says how they may be TRADED, and the two grids are allowed to differ.
//
// What lives here: identity, venue and type, supported resolutions, exchange timezone and session,
// data status, currency and unit, volume precision, and the price-format facts. What does NOT:
// order quantity, price steps, lot size, pip value, P&L, balances, or any validation rule; those
// are `@trdrs/broker` `InstrumentInfo`. Quote values (last, change, volume) are not symbology
// either: they are quote data a host fans out on its own.
//
// This module is self-contained by the same rule as `datafeed.ts` — the contract must never drag a
// backend SDK into the chart's dependency surface. It imports nothing.

/** How one symbol's prices are WRITTEN, in the reference's own five facts. Together they express
 *  every supported form: decimal, pip, fractional, fraction of a fraction, and variable tick.
 *
 *  - `pricescale` — price units per whole unit. 100 writes cents, 100000 writes FX pipettes,
 *    100000000 writes satoshis, 32 writes thirty-seconds. It alone sets the decimal column width.
 *  - `minmov` — the smallest move, in those units. It declares the grid a price moves on; it never
 *    widens or narrows the decimal column (ES at `{100, 25}` writes 4500.25, the same two decimals
 *    as `{100, 1}`).
 *  - `minmove2` — the further division of one `minmov` step for a fraction-of-a-fraction market:
 *    4 means quarters of a thirty-second.
 *  - `fractional` — write the sub-unit part as a counted fraction (110'16) instead of decimals.
 *  - `variableTickSize` — an ordered ladder of tick sizes by price band, the reference's
 *    space-separated string: alternating tick and upper bound, ending with the tick that applies
 *    above the last bound. "0.01 10 0.02 100 0.05" means 0.01 below 10, 0.02 below 100, 0.05 at or
 *    above 100. The band a price falls in is a DECLARED fact of the symbol, not a guess from its
 *    magnitude. */
export interface PriceFormat {
  pricescale: number
  minmov: number
  minmove2?: number
  fractional?: boolean
  variableTickSize?: string
}

/** How live the served data is, in the reference's own three states. `delayed_streaming` is a real
 *  stream behind a delay, not a degraded `streaming`. */
export type DataStatus = 'streaming' | 'endofday' | 'delayed_streaming'

/** The reference's subsession ids. `regular` is the weekly `session`; `premarket` and
 *  `postmarket` are the extended spans before and after it; `extended` is the whole span from
 *  pre-market open through post-market close. */
export type SubsessionId = 'regular' | 'extended' | 'premarket' | 'postmarket'

/** One named session of a market with extended hours, the reference's subsession shape. `session`
 *  uses the grammar of `SymbolInfo.session`; `sessionCorrections` uses the grammar of
 *  `SymbolInfo.corrections` and lists only the days that shorten THIS subsession. `description`
 *  is a label a feed may state; the chart labels a subsession by its `id` from its own catalog. */
export interface Subsession {
  id: SubsessionId
  session: string
  description?: string
  sessionCorrections?: string
}

/** Resolved metadata for ONE symbol: everything the chart needs to title it, page it, session it,
 *  and write its prices.
 *
 *  `timezone`, `session`, `sessionHolidays`, `corrections` and `subsessions` are the reference's
 *  exchange-hours facts and travel with the symbol. The chart's session model (`sessionModel.ts`)
 *  is built from them alone: market state, session shading, the regular-hours filter and the
 *  status popup all read what the feed said, and a feed that states no extended hours gets none. */
export interface SymbolInfo {
  /** The symbol the datafeed answers to on every later call. */
  ticker: string
  /** The short display identity, e.g. 'ESZ2026'. */
  name: string
  /** The long human description, e.g. 'E-mini S&P 500 Dec 2026'. */
  description: string
  /** The venue a UI attributes the symbol to. */
  exchange: string
  /** The venue that actually lists it, when it differs from `exchange`. */
  listedExchange: string
  /** The venue's own type token, e.g. 'futures', 'stock', 'crypto', 'forex'. */
  type: string
  /** The resolutions this symbol serves, as chart timeframe tokens ('1m', '4h', '1d', '1mo'). An
   *  EMPTY list declares no restriction: the feed serves any token the grammar admits (a futures
   *  or spread feed says exactly this), and the chart never reads it as "serves nothing". A finite
   *  list is a promise the chart may enforce. */
  supportedResolutions: readonly string[]
  /** The exchange's IANA zone, e.g. 'America/New_York'. */
  timezone: string
  /** The reference session string, e.g. '1700-1600' or '0930-1600'. */
  session: string
  /** The reference session-holidays string: comma-separated 'YYYYMMDD' full closures. */
  sessionHolidays?: string
  /** The reference corrections string: `;`-separated `<session>:<dates>` entries, each a session in
   *  the grammar of `session` that holds on the `,`-separated 'YYYYMMDD' trading days named. A
   *  correction outranks a holiday on the same date. */
  corrections?: string
  /** The symbol's named sessions, for a market whose exchange keeps extended hours. Absent for a
   *  market with one continuous session. */
  subsessions?: readonly Subsession[]
  dataStatus: DataStatus
  /** ISO 4217 for a money-quoted symbol; absent when the quote unit is not a currency. */
  currencyCode?: string
  /** The unit a non-currency symbol is quoted in, e.g. an energy or weight unit id. */
  unitId?: string
  /** Decimal places for a volume value. 0 for a whole-contract market. */
  volumePrecision: number
  format: PriceFormat
}

/** One band of a `variableTickSize` ladder: `size` is the tick that applies to prices strictly below
 *  `below`, and the last band's `below` is `Infinity`. */
export interface TickBand {
  /** The tick size in this band. */
  size: number
  /** The exclusive upper bound of the band. */
  below: number
}

/** Parse the reference's space-separated `variable_tick_size` ladder into ordered bands. Returns an
 *  empty array for a string the grammar cannot read, which is how a caller tells "no ladder" from
 *  "a ladder I must honour" without guessing at a half-parsed one. */
export function parseTickBands(variableTickSize: string): TickBand[] {
  const parts = variableTickSize.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length % 2 === 0) return []
  const bands: TickBand[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const size = Number(parts[i])
    if (!Number.isFinite(size) || size <= 0) return []
    const raw = parts[i + 1]
    if (raw === undefined) {
      bands.push({ size, below: Number.POSITIVE_INFINITY })
      break
    }
    const below = Number(raw)
    if (!Number.isFinite(below)) return []
    if (bands.length > 0 && below <= bands[bands.length - 1]!.below) return []
    bands.push({ size, below })
  }
  return bands
}

/** The band a price falls in, by the ladder's declared bounds (magnitude of the SYMBOL's own
 *  declared ladder, never a generic magnitude rule). Negative prices read on their absolute value,
 *  so a spread writes both sides in one column. */
export function tickBandFor(bands: readonly TickBand[], price: number): TickBand | null {
  const at = Math.abs(price)
  for (const band of bands) if (at < band.below) return band
  return bands.length > 0 ? bands[bands.length - 1]! : null
}
