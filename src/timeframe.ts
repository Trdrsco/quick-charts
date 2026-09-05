// The chart's timeframe grammar: the token a host, a datafeed and every chart surface exchange
// ('1m', '4h', '3mo'), its parsed shape, the per-unit ceilings, the nominal seconds each unit
// stands for, ordering, the 26 preset tokens the timeframe picker offers, and the capability
// filter a picker applies over what a feed and a symbol declare. This module is the ONE grammar
// inside Quick Charts: the UDF mapping, replay, the session filter and the range presets read it,
// and a host that hands the chart a token it cannot parse gets null, never a guess.
//
// The grammar is identical to the trdrs engine's wire grammar (the same token pattern, ceilings
// and nominal seconds), and scripts/test/timeframe-grammar.test.ts pins the two against each other
// so they cannot drift: a token the chart accepts must be one an engine-backed feed accepts. The
// chart imports nothing from that wire; the grammar is stated here in full.
import type { ChartTranslate } from './i18n'
import type { ChartMessageKey } from './i18n/en'

/** The units a timeframe token can carry: ticks, seconds, minutes, hours, days, weeks, months. */
export type TimeframeUnit = 't' | 's' | 'm' | 'h' | 'd' | 'w' | 'mo'

/** A parsed timeframe: `count` of `unit`, e.g. `{ count: 4, unit: 'h' }` for '4h'. */
export interface Timeframe {
  readonly count: number
  readonly unit: TimeframeUnit
}

/** Every unit, smallest first: the custom-interval picker's unit rows and the sort order. */
export const TIMEFRAME_UNITS: readonly TimeframeUnit[] = ['t', 's', 'm', 'h', 'd', 'w', 'mo']

/** The inclusive per-unit count ceiling. A token past it parses as null, so a custom-interval
 *  input disables Add and a feed is never asked for it. */
export const TIMEFRAME_MAX: Readonly<Record<TimeframeUnit, number>> = { t: 1000, s: 3600, m: 1440, h: 168, d: 365, w: 52, mo: 120 }

/** Nominal seconds per unit: exact for the fixed-duration units (s/m/h/d/w), a coarse nominal for
 *  ticks (about a minute) and months (30 days), which have no fixed duration. For range bounding
 *  and sorting, never a promise about bar spacing. */
export const TIMEFRAME_UNIT_SECONDS: Readonly<Record<TimeframeUnit, number>> = { t: 60, s: 1, m: 60, h: 3600, d: 86_400, w: 604_800, mo: 2_592_000 }

// `mo` before `m` so `3mo` reads as (3, month), never (3, minute) and a stray `o`.
const TOKEN = /^(\d{1,6})(t|s|mo|m|h|d|w)$/

/** Parse a timeframe token into its count and unit, or null when the token is malformed or its
 *  count is outside {@link TIMEFRAME_MAX}. */
export function parseTimeframe(token: string): Timeframe | null {
  const m = TOKEN.exec(token)
  if (!m) return null
  const count = Number(m[1])
  const unit = m[2] as TimeframeUnit
  if (!Number.isInteger(count) || count < 1 || count > TIMEFRAME_MAX[unit]) return null
  return { count, unit }
}

/** Write a timeframe as its token, or null when the count is outside {@link TIMEFRAME_MAX}. */
export function formatTimeframe(tf: Timeframe): string | null {
  if (!Number.isInteger(tf.count) || tf.count < 1 || tf.count > TIMEFRAME_MAX[tf.unit]) return null
  return `${tf.count}${tf.unit}`
}

/** The nominal seconds one bar of the timeframe spans ({@link TIMEFRAME_UNIT_SECONDS} times the
 *  count). */
export function timeframeSeconds(tf: Timeframe): number {
  return tf.count * TIMEFRAME_UNIT_SECONDS[tf.unit]
}

/** True for a sub-daily token (ticks, seconds, minutes, hours). Session bands and the
 *  regular-hours filter engage on intraday intervals only, because a daily or larger bar spans
 *  whole sessions. A token the grammar cannot read is NOT intraday: mis-shading a chart is worse
 *  than not shading it. */
export function isIntradayTimeframe(token: string): boolean {
  const tf = parseTimeframe(token)
  return tf !== null && (tf.unit === 't' || tf.unit === 's' || tf.unit === 'm' || tf.unit === 'h')
}

const UNIT_RANK: Readonly<Record<TimeframeUnit, number>> = { t: 0, s: 1, m: 2, h: 3, d: 4, w: 5, mo: 6 }

/** A total order over timeframes, smallest first: by unit (ticks before seconds before minutes
 *  and so on), then by count. Ticks sort before seconds whatever their nominal duration, because
 *  the picker groups by unit. */
export function compareTimeframes(a: Timeframe, b: Timeframe): number {
  return UNIT_RANK[a.unit] - UNIT_RANK[b.unit] || a.count - b.count
}

/** A sort key over tokens with the same order as {@link compareTimeframes}; a token the grammar
 *  cannot read sorts last. */
export function timeframeOrder(token: string): number {
  const tf = parseTimeframe(token)
  return tf ? UNIT_RANK[tf.unit] * 1e7 + tf.count : Number.MAX_SAFE_INTEGER
}

/** The picker group a unit belongs to: its own, except weeks and months, which ride with days as
 *  the preset tokens do. */
export function timeframeGroupUnit(unit: TimeframeUnit): TimeframeUnit {
  return unit === 'w' || unit === 'mo' ? 'd' : unit
}

/** One group of the timeframe picker. A group's `unit` is its identity: collapse state is keyed by
 *  it and a custom token is placed by it, so it stays a unit code whatever language the heading
 *  is in. */
export interface TimeframeGroup {
  readonly unit: TimeframeUnit
  readonly tokens: readonly string[]
}

/** The 26 preset timeframes, grouped as the picker shows them. Weeks and months share the Days
 *  group. The count is a release inventory: it moves only by decision. */
export const TIMEFRAME_PRESETS: readonly TimeframeGroup[] = [
  { unit: 't', tokens: ['1t', '10t', '100t', '1000t'] },
  { unit: 's', tokens: ['1s', '5s', '10s', '15s', '30s', '45s'] },
  { unit: 'm', tokens: ['1m', '3m', '5m', '15m', '30m', '45m'] },
  { unit: 'h', tokens: ['1h', '2h', '3h', '4h'] },
  { unit: 'd', tokens: ['1d', '1w', '1mo', '3mo', '6mo', '12mo'] },
]

/** Every preset token across the groups. A custom interval that already exists as a preset is
 *  refused rather than listed twice. */
export const TIMEFRAME_PRESET_TOKENS: ReadonlySet<string> = new Set(TIMEFRAME_PRESETS.flatMap((g) => g.tokens))

/** The unit's own name in the chart catalog: a picker group's heading and the custom-interval
 *  unit rows. */
export const TIMEFRAME_UNIT_NAME: Readonly<Record<TimeframeUnit, ChartMessageKey>> = {
  t: 'timeframe.unitTicks',
  s: 'timeframe.unitSeconds',
  m: 'timeframe.unitMinutes',
  h: 'timeframe.unitHours',
  d: 'timeframe.unitDays',
  w: 'timeframe.unitWeeks',
  mo: 'timeframe.unitMonths',
}

/** A count of a unit, one plural message per unit, so the count and the word agree by the
 *  language's own rules rather than by an English 's'. */
const TIMEFRAME_COUNT_NAME: Readonly<Record<TimeframeUnit, ChartMessageKey>> = {
  t: 'timeframe.countTicks',
  s: 'timeframe.countSeconds',
  m: 'timeframe.countMinutes',
  h: 'timeframe.countHours',
  d: 'timeframe.countDays',
  w: 'timeframe.countWeeks',
  mo: 'timeframe.countMonths',
}

/** A readable label for a token in the chart's language: '5t' reads "5 Ticks", '1h' reads
 *  "1 Hour". A token the grammar cannot read is returned as written, which is what the feed calls
 *  it, never a blank. */
export function timeframeLabel(t: ChartTranslate, token: string): string {
  const tf = parseTimeframe(token)
  if (!tf) return token
  return t(TIMEFRAME_COUNT_NAME[tf.unit], { count: tf.count })
}

/** What a symbol and its feed declare about the intervals they serve. Both lists are optional and
 *  an EMPTY list is no restriction: a feed or symbol that serves any interval says nothing rather
 *  than listing everything. `supportedResolutions` is the symbol's own list (`SymbolInfo`);
 *  `resolutions` is the feed-level list (`DatafeedConfig`). A token must pass every list given. */
export interface TimeframeRestrictions {
  readonly supportedResolutions?: readonly string[] | null
  readonly resolutions?: readonly string[] | null
}

/** Whether a token may be offered under the given restrictions. A token the grammar cannot read
 *  is never allowed. */
export function timeframeAllowed(token: string, restrictions: TimeframeRestrictions = {}): boolean {
  if (parseTimeframe(token) === null) return false
  const bySymbol = restrictions.supportedResolutions
  if (bySymbol && bySymbol.length > 0 && !bySymbol.includes(token)) return false
  const byFeed = restrictions.resolutions
  if (byFeed && byFeed.length > 0 && !byFeed.includes(token)) return false
  return true
}

/** The tokens a picker may offer: the given tokens, in their order, minus those the symbol or the
 *  feed does not serve. */
export function allowedTimeframes(tokens: readonly string[], restrictions: TimeframeRestrictions = {}): string[] {
  return tokens.filter((token) => timeframeAllowed(token, restrictions))
}
