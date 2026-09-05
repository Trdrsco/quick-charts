// The chart's display timezones: the 60 selectable IANA zones, the exchange-timezone choice, and
// the formatters that put a zone on the time axis, the crosshair and a clock. Bar times stay UTC
// epoch seconds and lightweight-charts has no timezone of its own, so a zone is applied at the
// FORMATTING layer only: bar data never shifts and DST is always the IANA database's answer.
//
// Every formatter is keyed on the host's BCP 47 tag as well as the zone, so a month name or a
// weekday reads in the chart's language. Nothing here names a locale of its own: the one
// computation that needs plain numbers (a zone's offset) asks Intl for Latin digits and the
// Gregorian calendar explicitly rather than for any particular language.
import { TickMarkType, type Time } from 'lightweight-charts'
import type { ChartTranslate } from './i18n'
import type { SymbolInfo } from './symbology'

export interface ChartTimezone {
  /** The IANA zone id: what Intl consumes and what a host persists. */
  readonly id: string
  /** The display city, as the timezone picker writes it. */
  readonly city: string
}

/** The selectable zones: one city per offset region a trader picks. The count is a release
 *  inventory: it moves only by decision. */
export const TIMEZONES: readonly ChartTimezone[] = [
  { id: 'Etc/UTC', city: 'UTC' },
  { id: 'Pacific/Honolulu', city: 'Honolulu' },
  { id: 'America/Anchorage', city: 'Anchorage' },
  { id: 'America/Los_Angeles', city: 'Los Angeles' },
  { id: 'America/Vancouver', city: 'Vancouver' },
  { id: 'America/Phoenix', city: 'Phoenix' },
  { id: 'America/Denver', city: 'Denver' },
  { id: 'America/Mexico_City', city: 'Mexico City' },
  { id: 'America/Chicago', city: 'Chicago' },
  { id: 'America/Bogota', city: 'Bogota' },
  { id: 'America/Lima', city: 'Lima' },
  { id: 'America/New_York', city: 'New York' },
  { id: 'America/Toronto', city: 'Toronto' },
  { id: 'America/Caracas', city: 'Caracas' },
  { id: 'America/Santiago', city: 'Santiago' },
  { id: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires' },
  { id: 'America/Sao_Paulo', city: 'Sao Paulo' },
  { id: 'Atlantic/Reykjavik', city: 'Reykjavik' },
  { id: 'Europe/Dublin', city: 'Dublin' },
  { id: 'Europe/Lisbon', city: 'Lisbon' },
  { id: 'Europe/London', city: 'London' },
  { id: 'Africa/Lagos', city: 'Lagos' },
  { id: 'Europe/Amsterdam', city: 'Amsterdam' },
  { id: 'Europe/Berlin', city: 'Berlin' },
  { id: 'Europe/Brussels', city: 'Brussels' },
  { id: 'Europe/Madrid', city: 'Madrid' },
  { id: 'Europe/Oslo', city: 'Oslo' },
  { id: 'Europe/Paris', city: 'Paris' },
  { id: 'Europe/Rome', city: 'Rome' },
  { id: 'Europe/Stockholm', city: 'Stockholm' },
  { id: 'Europe/Warsaw', city: 'Warsaw' },
  { id: 'Europe/Zurich', city: 'Zurich' },
  { id: 'Africa/Cairo', city: 'Cairo' },
  { id: 'Africa/Johannesburg', city: 'Johannesburg' },
  { id: 'Europe/Athens', city: 'Athens' },
  { id: 'Europe/Helsinki', city: 'Helsinki' },
  { id: 'Europe/Istanbul', city: 'Istanbul' },
  { id: 'Asia/Jerusalem', city: 'Jerusalem' },
  { id: 'Europe/Moscow', city: 'Moscow' },
  { id: 'Asia/Riyadh', city: 'Riyadh' },
  { id: 'Asia/Dubai', city: 'Dubai' },
  { id: 'Asia/Tehran', city: 'Tehran' },
  { id: 'Asia/Karachi', city: 'Karachi' },
  { id: 'Asia/Kolkata', city: 'Kolkata' },
  { id: 'Asia/Kathmandu', city: 'Kathmandu' },
  { id: 'Asia/Dhaka', city: 'Dhaka' },
  { id: 'Asia/Yangon', city: 'Yangon' },
  { id: 'Asia/Bangkok', city: 'Bangkok' },
  { id: 'Asia/Jakarta', city: 'Jakarta' },
  { id: 'Asia/Singapore', city: 'Singapore' },
  { id: 'Asia/Hong_Kong', city: 'Hong Kong' },
  { id: 'Asia/Shanghai', city: 'Shanghai' },
  { id: 'Asia/Taipei', city: 'Taipei' },
  { id: 'Australia/Perth', city: 'Perth' },
  { id: 'Asia/Seoul', city: 'Seoul' },
  { id: 'Asia/Tokyo', city: 'Tokyo' },
  { id: 'Australia/Adelaide', city: 'Adelaide' },
  { id: 'Australia/Brisbane', city: 'Brisbane' },
  { id: 'Australia/Sydney', city: 'Sydney' },
  { id: 'Pacific/Auckland', city: 'Auckland' },
]

/** The zone a chart displays in before a host or a trader chooses one. */
export const DEFAULT_TIMEZONE = 'Etc/UTC'

/** The timezone choice that follows the charted symbol's exchange: a display preference resolves
 *  it per symbol through {@link resolveDisplayTimezone}. */
export const EXCHANGE_TIMEZONE = 'exchange'

/** Whether a stored or requested value is a choice the chart accepts: a listed zone id or
 *  {@link EXCHANGE_TIMEZONE}. A host validates a persisted preference through this before
 *  applying it. */
export function isTimezoneChoice(value: string): boolean {
  return value === EXCHANGE_TIMEZONE || TIMEZONES.some((z) => z.id === value)
}

/** The zone a chart formats in for a timezone choice. A listed zone id is itself. The exchange
 *  choice is the symbol's own `timezone` (the datafeed's symbology), or null while no symbol is
 *  resolved: a null leaves the axis as it was rather than stamping a zone that may be wrong. */
export function resolveDisplayTimezone(choice: string, symbol: Pick<SymbolInfo, 'timezone'> | null | undefined): string | null {
  if (choice !== EXCHANGE_TIMEZONE) return choice
  return symbol?.timezone || null
}

/** The display city for a zone id: the listed city, or the id itself for a zone the list does not
 *  carry (a symbol's exchange zone is whatever its feed says). */
export function timezoneCity(id: string): string {
  return TIMEZONES.find((z) => z.id === id)?.city ?? id
}

// `Intl.DateTimeFormat` objects, memoized per (tag, zone, options): constructing one is the
// expensive part, using it is cheap, and the axis re-formats on every pan.
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(tag: string | undefined, zone: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${tag ?? ''}|${zone}|${JSON.stringify(opts)}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(tag, { ...opts, timeZone: zone })
    formatters.set(key, f)
  }
  return f
}

/** The wall-clock parts of an instant in a zone, as plain numbers: the Gregorian calendar, Latin
 *  digits and a 24-hour clock are asked for explicitly, so the answer is the same under every
 *  host language. */
export interface ZoneClock {
  readonly year: number
  /** 1 to 12. */
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

const NUMERIC: Intl.DateTimeFormatOptions = {
  calendar: 'gregory',
  numberingSystem: 'latn',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}

export function zoneClock(zone: string, at: Date): ZoneClock {
  const parts = formatter(undefined, zone, NUMERIC).formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') % 24, minute: read('minute'), second: read('second') }
}

/** The zone's UTC offset in minutes at an instant (DST-aware: Intl answers from the IANA
 *  database). East of UTC is positive. An unknown zone reads as UTC. */
export function tzOffsetMinutes(zone: string, at: Date = new Date()): number {
  try {
    const c = zoneClock(zone, at)
    const wall = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second)
    return Math.round((wall - Math.floor(at.getTime() / 1000) * 1000) / 60_000)
  } catch {
    return 0
  }
}

/** "UTC", "UTC-7" or "UTC+5:30" for the zone's offset at an instant. */
export function tzOffsetLabel(zone: string, at: Date = new Date()): string {
  const mins = tzOffsetMinutes(zone, at)
  if (mins === 0) return 'UTC'
  const sign = mins < 0 ? '-' : '+'
  const h = Math.floor(Math.abs(mins) / 60)
  const m = Math.abs(mins) % 60
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/** The city and offset a timezone footer or picker row shows: "New York (UTC-4)", or "UTC" for
 *  the UTC zone itself. */
export function timezoneLabel(zone: string, at: Date = new Date()): string {
  const city = timezoneCity(zone)
  return zone === DEFAULT_TIMEZONE ? city : `${city} (${tzOffsetLabel(zone, at)})`
}

/** The wall clock in the zone, hours, minutes and seconds on a 24-hour cycle, in the language of
 *  `tag`. */
export function formatClock(tag: string, zone: string, at: Date = new Date()): string {
  return formatter(tag, zone, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(at)
}

/** The time-axis tick-mark formatter for lightweight-charts: each mark granularity written in the
 *  zone and the language. Assign it to `timeScale.tickMarkFormatter`. */
export function makeTickMarkFormatter(tag: string, zone: string): (time: Time, tickMarkType: TickMarkType) => string {
  const year = formatter(tag, zone, { year: 'numeric' })
  const month = formatter(tag, zone, { month: 'short' })
  const day = formatter(tag, zone, { day: 'numeric' })
  const time = formatter(tag, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const timeS = formatter(tag, zone, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  return (t, tickMarkType) => {
    const d = new Date((t as number) * 1000)
    switch (tickMarkType) {
      case TickMarkType.Year:
        return year.format(d)
      case TickMarkType.Month:
        return month.format(d)
      case TickMarkType.DayOfMonth:
        return day.format(d)
      case TickMarkType.TimeWithSeconds:
        return timeS.format(d)
      default:
        return time.format(d)
    }
  }
}

/** The crosshair time label for lightweight-charts: the date always, the wall time only when
 *  `withTime` (an intraday chart). A daily or larger bar's timestamp is a session date, and a
 *  shifted midnight would misread as a fill time. Assign it to `localization.timeFormatter`. */
export function makeCrosshairTimeFormatter(tag: string, zone: string, withTime: boolean): (time: Time) => string {
  const date = formatter(tag, zone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const time = formatter(tag, zone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return (t) => {
    const d = new Date((t as number) * 1000)
    return withTime ? `${date.format(d)}  ${time.format(d)}` : date.format(d)
  }
}

/** One row of the timezone picker: the choice it selects and the text it wears. */
export interface TimezoneRow {
  readonly id: string
  readonly label: string
}

/** The timezone picker's rows: UTC first, then the exchange choice when the surface has a charted
 *  symbol to follow, then every other zone ordered by its offset at `at` (so DST is current), ties
 *  by city, each written "(UTC-7) Los Angeles". The city names are the zone table's own data; the
 *  exchange row is the chart catalog's word. */
export function timezoneListing(t: ChartTranslate, options: { withExchange?: boolean; at?: Date } = {}): TimezoneRow[] {
  const at = options.at ?? new Date()
  const rows: TimezoneRow[] = [{ id: DEFAULT_TIMEZONE, label: timezoneCity(DEFAULT_TIMEZONE) }]
  if (options.withExchange !== false) rows.push({ id: EXCHANGE_TIMEZONE, label: t('timezone.exchange') })
  const rest = TIMEZONES.filter((z) => z.id !== DEFAULT_TIMEZONE)
    .map((z) => ({ z, offset: tzOffsetMinutes(z.id, at) }))
    .sort((a, b) => a.offset - b.offset || a.z.city.localeCompare(b.z.city))
  for (const { z } of rest) rows.push({ id: z.id, label: `(${tzOffsetLabel(z.id, at)}) ${z.city}` })
  return rows
}
