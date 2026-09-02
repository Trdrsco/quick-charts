// UDF `/symbols` → Quick Charts `SymbolInfo`. A pure mapping, no transport: the datafeed adapter
// fetches, this decides what the answer MEANS.
//
// The one thing it must never do is collapse `pricescale`, `minmov`, `minmove2`, `fractional` and
// `variable_tick_size` into a single floating tick. A float can express a decimal grid and nothing
// else: it cannot say "thirty-seconds", it cannot say "quarters of a thirty-second", and it cannot
// carry an ordered ladder of tick bands. Those facts ride through to `PriceFormat` intact.
//
// Absent fields resolve to the protocol's own documented defaults, never to a guess about the
// market: an unstated `minmov` is 1 because UDF says so, and an unstated session is the round clock
// because claiming exchange hours nobody served would render wrong bands.
import { udfResolutionToTf } from './udfResolution'
import type { DataStatus, PriceFormat, SymbolInfo } from './symbology'

/** The `/symbols` fields this mapping reads. A server may send more; anything not listed here has
 *  no place in symbology. */
export interface UdfSymbolResponse {
  name?: string
  ticker?: string
  description?: string
  exchange?: string
  listed_exchange?: string
  type?: string
  pricescale?: number
  minmov?: number
  minmove2?: number
  fractional?: boolean
  variable_tick_size?: string
  supported_resolutions?: readonly string[]
  timezone?: string
  session?: string
  session_holidays?: string
  data_status?: string
  currency_code?: string
  unit_id?: string
  volume_precision?: number
}

const DATA_STATUSES: readonly DataStatus[] = ['streaming', 'endofday', 'delayed_streaming']

const posInt = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback

/** The price-format facts, mapped one for one. `pricescale` defaults to 100 (the protocol's own
 *  default) and `minmov` to 1; `minmove2` and `fractional` only appear when the server sent
 *  something meaningful, so a plain decimal symbol carries no fractional machinery. */
export function udfPriceFormat(raw: UdfSymbolResponse): PriceFormat {
  const format: PriceFormat = { pricescale: posInt(raw.pricescale, 100), minmov: posInt(raw.minmov, 1) }
  const minmove2 = posInt(raw.minmove2, 0)
  if (minmove2 > 1) format.minmove2 = minmove2
  if (raw.fractional === true) format.fractional = true
  if (typeof raw.variable_tick_size === 'string' && raw.variable_tick_size.trim() !== '') {
    format.variableTickSize = raw.variable_tick_size.trim()
  }
  return format
}

/** The whole symbol. `symbol` is the identifier the caller asked for, used where the server named
 *  neither a ticker nor a name. Returns null for an answer that identifies no symbol at all, which
 *  is how a caller distinguishes "unknown symbol" from "a symbol with sparse metadata". */
export function udfSymbolInfo(raw: UdfSymbolResponse, symbol: string): SymbolInfo | null {
  const ticker = raw.ticker ?? raw.name
  if (!ticker && !symbol) return null
  const exchange = raw.exchange ?? ''
  const resolutions = (raw.supported_resolutions ?? [])
    .map((r) => udfResolutionToTf(r))
    .filter((tf): tf is string => tf !== null)
  const status = typeof raw.data_status === 'string' && (DATA_STATUSES as readonly string[]).includes(raw.data_status)
  const info: SymbolInfo = {
    ticker: ticker ?? symbol,
    name: raw.name ?? ticker ?? symbol,
    description: raw.description ?? raw.name ?? ticker ?? symbol,
    exchange,
    listedExchange: raw.listed_exchange ?? exchange,
    type: raw.type ?? '',
    supportedResolutions: resolutions,
    timezone: raw.timezone ?? 'Etc/UTC',
    session: raw.session ?? '24x7',
    dataStatus: status ? (raw.data_status as DataStatus) : 'streaming',
    volumePrecision: typeof raw.volume_precision === 'number' && Number.isFinite(raw.volume_precision) && raw.volume_precision >= 0
      ? Math.floor(raw.volume_precision)
      : 0,
    format: udfPriceFormat(raw),
  }
  if (typeof raw.session_holidays === 'string' && raw.session_holidays.trim() !== '') info.sessionHolidays = raw.session_holidays.trim()
  if (typeof raw.currency_code === 'string' && raw.currency_code !== '') info.currencyCode = raw.currency_code
  if (typeof raw.unit_id === 'string' && raw.unit_id !== '') info.unitId = raw.unit_id
  return info
}
