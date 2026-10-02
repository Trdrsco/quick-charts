// The display timezones a widget offers: every zone in `TIMEZONES` and the exchange choice when the
// host names no list, or exactly the host's list. A choice outside the offered set is not a
// timezone of this chart: it has no `chart.timezone.<id>` command, `chart.timezone.set` and
// `setTimezone` ignore it, and the timezone picker lists no row for it. A stored or preferred
// choice outside the list opens on the first choice the host lists, and what is stored is not
// rewritten until the viewer chooses. The standalone registry (`TIMEZONES`, `isTimezoneChoice`,
// `timezoneListing`) is never filtered: the list bounds a chart, not the package.
import { DEFAULT_TIMEZONE, EXCHANGE_TIMEZONE, isTimezoneChoice } from '../timezones'

/** The timezone choices a widget offers, in the host's order, or null when the host names no list
 *  and every choice is offered. */
export type OfferedTimezones = readonly string[] | null

const TAKES = `it takes the zone ids TIMEZONES lists, such as America/New_York, and ${EXCHANGE_TIMEZONE} for the exchange's own zone`

/** Validate the host's `timezones` option. A non-list, an empty list, an id that names no zone and a
 *  repeated id are setup errors: nothing a host passes is substituted. */
export function resolveOfferedTimezones(list: readonly unknown[] | undefined): OfferedTimezones {
  if (list === undefined) return null
  if (!Array.isArray(list)) throw new TypeError(`timezones must be a list of timezone choices; ${TAKES}`)
  if (list.length === 0) throw new TypeError(`timezones must name at least one timezone choice; ${TAKES}`)
  const seen = new Set<string>()
  for (const id of list) {
    if (typeof id !== 'string' || !isTimezoneChoice(id)) throw new TypeError(`timezones names ${JSON.stringify(id) ?? String(id)}, which is not a timezone choice; ${TAKES}`)
    if (seen.has(id)) throw new TypeError(`timezones names "${id}" more than once`)
    seen.add(id)
  }
  return [...seen]
}

/** Whether the widget offers a choice: a listed one, or any choice the registry carries when the
 *  host names no list. */
export function offersTimezone(offered: OfferedTimezones, choice: string): boolean {
  return isTimezoneChoice(choice) && (offered === null || offered.includes(choice))
}

/** The choice a chart opens on for a stored or preferred value: the value itself when the widget
 *  offers it, else the first choice the host lists, or the chart's default when it names none. */
export function offeredTimezone(choice: string | null | undefined, offered: OfferedTimezones): string {
  if (choice && offersTimezone(offered, choice)) return choice
  return offered?.[0] ?? DEFAULT_TIMEZONE
}
