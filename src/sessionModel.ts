// The session model a symbol's OWN metadata builds: the session grammar in `session`,
// the full-closure dates in `sessionHolidays`, the dated overrides in `corrections`, and the
// optional subsessions that name the stretches around the regular hours, all read in the
// symbol's exchange `timezone`. From it the chart answers the session state at an instant, the
// next transition, the exchange-local day's timeline, the market status a status popup shows and
// the trading-hours choice the symbol offers. The feed owns every one of these facts; the chart
// evaluates them and claims nothing a feed did not say.
//
// The subsessions give a day one of two shapes. A SPLIT day states its regular hours as `session`,
// with pre-market, post-market and, optionally, overnight stretches around them. An ELECTRONIC day
// states its whole electronic trading day as `session` and its regular hours as a `regular`
// subsession that differs from it: every stretch of that day outside regular hours is one
// extended stretch, and the market status reads the whole day as open.
//
// The grammar the chart reads: `24x7`;
// `HHMM-HHMM` stretches, several per day separated by commas; a `:days` suffix with 1 = Sunday
// through 7 = Saturday, sessions for other days separated by `|`, weekdays by default; an `F` or
// `Fn` after a time for a start or end on a previous day, a start later than its end for an
// overnight session, and times past 2400 for a session that runs into the next day; an optional
// `first day;` prefix or `;first day` suffix, which orders a week and does not change any hour.
// Holidays are `YYYYMMDD` dates separated by commas. Corrections are `SESSION:YYYYMMDD[,...]`
// entries separated by semicolons, and a correction outranks a holiday on the same date.
import type { ChartTranslate } from './i18n'
import type { ChartMessageKey } from './i18n/en'
import type { ChartSessionHours } from './settings/schema'
import type { DataStatus, SymbolInfo } from './symbology'
import { timezoneLabel, tzOffsetMinutes, zoneClock } from './timezones'

/** The session an instant classifies into. `extended` is trading outside regular hours that is
 *  neither pre-market nor post-market: an overnight stretch, a bare `extended` subsession, or any
 *  stretch of an electronic day outside its regular hours. */
export type SessionState = 'pre' | 'open' | 'extended' | 'after' | 'closed'

/** One subsession of an extended-hours symbol: `regular`, `extended`, `premarket`, `postmarket` or
 *  `overnight`, each with its own session string and, optionally, the corrections that shorten
 *  it. `SymbolInfo.subsessions` satisfies it; an id the chart has
 *  no state for is ignored. */
export interface SubsessionSource {
  readonly id: string
  readonly session: string
  readonly sessionCorrections?: string
}

/** What a session model is built from: the symbology triple plus the optional corrections and
 *  subsessions. `SymbolInfo` satisfies it. */
export interface SessionSource {
  readonly timezone: string
  readonly session: string
  readonly sessionHolidays?: string
  readonly corrections?: string
  readonly subsessions?: readonly SubsessionSource[]
}

/** One trading stretch of a trading day, in minutes from that day's exchange-local midnight. The
 *  start may be negative (the stretch begins on a previous day) and the end may pass 1440 (it
 *  runs into the next day); the end is exclusive. */
export interface SessionSegment {
  readonly start: number
  readonly end: number
}

/** A schedule: the stretches per weekday (0 = Sunday), and dated overrides keyed 'YYYYMMDD'. */
export interface SessionSchedule {
  readonly week: readonly (readonly SessionSegment[])[]
  readonly corrections: ReadonlyMap<string, readonly SessionSegment[]>
}

export interface SessionModel {
  /** The exchange zone every minute here is read in. */
  readonly timezone: string
  /** A `24x7` symbol: always open, no transitions, no timeline. */
  readonly continuous: boolean
  /** An electronic-day symbol: its `regular` subsession differs from its `session`, which is then
   *  the whole electronic trading day with the regular hours inside it. Every stretch of the day
   *  outside regular hours classifies as `extended`, and the market status reads the whole day as
   *  open. */
  readonly electronic: boolean
  /** The regular session. */
  readonly regular: SessionSchedule
  /** The stretches outside regular hours, from the subsessions: each with the id of the subsession
   *  it came from and the state it classifies into. */
  readonly extended: readonly { readonly id: string; readonly state: Exclude<SessionState, 'open' | 'closed'>; readonly schedule: SessionSchedule }[]
  /** Full-closure dates, 'YYYYMMDD'. */
  readonly holidays: ReadonlySet<string>
}

const MINUTES_PER_DAY = 1440

/** 'HHMM' with an optional 'F' or 'Fn' previous-day marker, to minutes from the trading day's
 *  midnight. Hours may pass 24 for a stretch that runs into the next day. */
function parseTime(text: string): number | null {
  const m = /^(\d{2})(\d{2})(?:F(\d)?)?$/.exec(text)
  if (!m) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (minutes > 59) return null
  const back = m[0].includes('F') ? Number(m[3] ?? '1') : 0
  if (back > 6) return null
  return hours * 60 + minutes - back * MINUTES_PER_DAY
}

/** 'HHMM-HHMM' to a segment, applying the overnight rule: a start at or after its end, with no
 *  previous-day marker on either side, begins on the previous day. `0000-0000` is the whole
 *  day. */
function parseSegment(text: string): SessionSegment | null {
  const parts = text.split('-')
  if (parts.length !== 2) return null
  const startText = parts[0]!
  const endText = parts[1]!
  let start = parseTime(startText)
  const end = parseTime(endText)
  if (start === null || end === null) return null
  const marked = startText.includes('F') || endText.includes('F')
  if (!marked && start >= end && !(start === 0 && end === 0)) start -= MINUTES_PER_DAY
  if (!marked && start === 0 && end === 0) return { start: 0, end: MINUTES_PER_DAY }
  if (start >= end) return null
  return { start, end }
}

/** The days a session applies to, from a ':days' suffix (1 = Sunday), to weekday indexes. */
function parseDays(text: string): number[] | null {
  if (!/^[1-7]+$/.test(text)) return null
  return [...text].map((d) => Number(d) - 1)
}

/** A session string to its weekly schedule, or null when the grammar cannot read it. */
function parseWeek(session: string): readonly (readonly SessionSegment[])[] | null {
  let body = session.trim()
  if (body === '') return null
  // The first-day-of-week prefix or suffix orders a week for a calendar; the hours are the same.
  const prefix = /^([1-7]);(.+)$/.exec(body)
  if (prefix) body = prefix[2]!
  const suffix = /^(.+);([1-7])$/.exec(body)
  if (suffix) body = suffix[1]!
  const week: SessionSegment[][] = Array.from({ length: 7 }, () => [])
  const assigned = new Set<number>()
  for (const alternative of body.split('|')) {
    const colon = alternative.indexOf(':')
    const hours = colon === -1 ? alternative : alternative.slice(0, colon)
    const days = colon === -1 ? [1, 2, 3, 4, 5] : parseDays(alternative.slice(colon + 1))
    if (!days) return null
    const segments: SessionSegment[] = []
    for (const part of hours.split(',')) {
      const seg = parseSegment(part)
      if (!seg) return null
      segments.push(seg)
    }
    // The first alternative that names a day wins it; the default weekday set never overrides an
    // explicit day.
    for (const day of days) {
      if (assigned.has(day)) continue
      if (colon === -1 && week[day]!.length > 0) continue
      week[day] = segments
      if (colon !== -1) assigned.add(day)
    }
  }
  return week
}

/** The 'YYYYMMDD' key of a date given as a UTC day number triple. */
function dateKey(year: number, month: number, day: number): string {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

/** A corrections string to its dated overrides, or null when an entry cannot be read. A
 *  correction's day list may be written latest-first; the order does not matter here. */
function parseCorrections(corrections: string | undefined): ReadonlyMap<string, readonly SessionSegment[]> | null {
  const map = new Map<string, readonly SessionSegment[]>()
  if (!corrections || corrections.trim() === '') return map
  for (const entry of corrections.split(';')) {
    const text = entry.trim()
    if (text === '') continue
    const colon = text.lastIndexOf(':')
    if (colon === -1) return null
    const hours = text.slice(0, colon)
    const dates = text.slice(colon + 1).split(',')
    const segments: SessionSegment[] = []
    for (const part of hours.split(',')) {
      const seg = parseSegment(part)
      if (!seg) return null
      segments.push(seg)
    }
    for (const date of dates) {
      const d = date.trim()
      if (!/^\d{8}$/.test(d)) return null
      map.set(d, segments)
    }
  }
  return map
}

function parseHolidays(holidays: string | undefined): ReadonlySet<string> | null {
  const set = new Set<string>()
  if (!holidays || holidays.trim() === '') return set
  for (const date of holidays.split(',')) {
    const d = date.trim()
    if (!/^\d{8}$/.test(d)) return null
    set.add(d)
  }
  return set
}

function parseSchedule(session: string, corrections: string | undefined): SessionSchedule | null {
  const week = parseWeek(session)
  const dated = parseCorrections(corrections)
  if (!week || !dated) return null
  return { week, corrections: dated }
}

const STATE_RANK: Readonly<Record<Exclude<SessionState, 'open' | 'closed'>, number>> = { pre: 0, after: 0, extended: 1 }

const SUBSESSION_STATE: Readonly<Record<string, Exclude<SessionState, 'open' | 'closed'>>> = {
  premarket: 'pre',
  postmarket: 'after',
  extended: 'extended',
  overnight: 'extended',
}

/** Build the session model from a symbol's metadata. Null when the grammar cannot read any part
 *  of it: a chart then shows no bands, no status and no timeline for the symbol rather than a
 *  session it guessed. A `regular` subsession, when given, is the regular session; the symbol's
 *  `session` is otherwise. A `regular` subsession that differs from `session` makes the symbol an
 *  electronic day: each of its other subsessions classifies as `extended`, and `session` itself is
 *  the extended span when no `extended` subsession states one. Subsessions with ids the chart has
 *  no state for are ignored. */
export function parseSessionModel(source: SessionSource): SessionModel | null {
  const timezone = source.timezone.trim()
  if (timezone === '') return null
  const holidays = parseHolidays(source.sessionHolidays)
  if (!holidays) return null
  if (source.session.trim() === '24x7') {
    return { timezone, continuous: true, electronic: false, regular: { week: Array.from({ length: 7 }, () => [{ start: 0, end: MINUTES_PER_DAY }]), corrections: new Map() }, extended: [], holidays }
  }
  const regularSource = source.subsessions?.find((s) => s.id === 'regular')
  const regular = regularSource ? parseSchedule(regularSource.session, regularSource.sessionCorrections ?? source.corrections) : parseSchedule(source.session, source.corrections)
  if (!regular) return null
  // The two strings are compared by the hours they state, so one week written two ways is one week.
  const day = regularSource ? parseWeek(source.session) : null
  const electronic = day !== null && JSON.stringify(day) !== JSON.stringify(regular.week)
  const extended: { id: string; state: Exclude<SessionState, 'open' | 'closed'>; schedule: SessionSchedule }[] = []
  for (const sub of source.subsessions ?? []) {
    const state = SUBSESSION_STATE[sub.id]
    if (!state) continue
    const schedule = parseSchedule(sub.session, sub.sessionCorrections)
    if (!schedule) return null
    extended.push({ id: sub.id, state: electronic ? 'extended' : state, schedule })
  }
  if (electronic && !extended.some((stretch) => stretch.id === 'extended')) {
    const whole = parseSchedule(source.session, source.corrections)
    if (!whole) return null
    extended.push({ id: 'extended', state: 'extended', schedule: whole })
  }
  // The named spans outrank the whole extended span: a minute in pre-market is pre, not extended,
  // whatever order the feed listed them in.
  extended.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state])
  return { timezone, continuous: false, electronic, regular, extended, holidays }
}

/** Which of a symbol's named sessions a chart displays:
 *  `regular` shows regular hours only, `extended` shows the extended-hours bars as well. A
 *  per-chart preference a host persists. `extended` is the DEFAULT and shows every bar the feed
 *  served; narrowing to `regular` is the opt-in, because a chart that silently hid bars it had
 *  would be lying about the market by default. A symbol without extended hours has nothing to
 *  choose, and every bar shows either way. */
export type ActiveSubsession = 'regular' | 'extended'

export const DEFAULT_SUBSESSION: ActiveSubsession = 'extended'

/** Whether the symbol declared any hours outside its regular session. Only such a symbol offers a
 *  subsession choice or shades extended hours. */
export function hasExtendedHours(model: SessionModel): boolean {
  return model.extended.length > 0
}

/** One trading-hours choice a symbol offers: the `symbol.session` setting it writes, and its name
 *  and its short name for a compact trigger, both catalog keys. */
export interface TradingHoursOption {
  readonly hours: ChartSessionHours
  readonly label: ChartMessageKey
  readonly short: ChartMessageKey
}

const ELECTRONIC_OPTIONS: readonly TradingHoursOption[] = [
  { hours: 'extended', label: 'settings.sessionElectronic', short: 'chrome.sessionShortExtended' },
  { hours: 'regular', label: 'settings.sessionRegularHours', short: 'chrome.sessionShortRegular' },
]

const SPLIT_OPTIONS: readonly TradingHoursOption[] = [
  { hours: 'regular', label: 'settings.sessionRegular', short: 'chrome.sessionShortRegular' },
  { hours: 'extended', label: 'settings.sessionExtended', short: 'chrome.sessionShortExtended' },
]

const ALL_HOURS_OPTION: TradingHoursOption = { hours: 'allHours', label: 'settings.sessionAllHours', short: 'chrome.sessionShortAllHours' }

/** The trading-hours choices a symbol offers, in the order a picker lists them, read from its own
 *  session facts. None for an unknown model, a continuous market or a symbol with no hours outside
 *  its regular session. An electronic day offers its electronic and its regular trading hours; a
 *  split day offers regular and extended hours, and 24 hours when it declares an `overnight`
 *  subsession. */
export function tradingHoursOptions(model: SessionModel | null): readonly TradingHoursOption[] {
  if (!model || model.continuous || !hasExtendedHours(model)) return []
  if (model.electronic) return ELECTRONIC_OPTIONS
  return model.extended.some((stretch) => stretch.id === 'overnight') ? [...SPLIT_OPTIONS, ALL_HOURS_OPTION] : SPLIT_OPTIONS
}

/** The option a trading-hours setting stands for among a symbol's choices: the setting's own, or the
 *  extended hours for `allHours` on a symbol that offers no 24 hours. Null where the symbol offers
 *  no choice. */
export function tradingHoursOption(options: readonly TradingHoursOption[], hours: ChartSessionHours): TradingHoursOption | null {
  return options.find((option) => option.hours === hours) ?? (hours === 'allHours' ? (options.find((option) => option.hours === 'extended') ?? null) : null)
}

/** The bar filter for the active subsession: under `regular`, on a symbol with extended hours,
 *  keep the bars whose open falls in regular hours; otherwise nothing is filtered (null). For
 *  intraday timeframes only: a daily bar spans whole sessions, so a caller applies the filter on
 *  intraday timeframes and shows every daily bar. */
export function subsessionBarFilter(model: SessionModel, active: ActiveSubsession): ((epochSecs: number) => boolean) | null {
  if (active !== 'regular' || !hasExtendedHours(model)) return null
  return (epochSecs) => sessionStateAt(model, epochSecs) === 'open'
}

/** A trading day as the exchange calendar counts it: its 'YYYYMMDD' key and weekday. */
interface LocalDay {
  readonly year: number
  readonly month: number
  readonly day: number
}

function shiftDay(d: LocalDay, days: number): LocalDay {
  const date = new Date(Date.UTC(d.year, d.month - 1, d.day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function weekdayOf(d: LocalDay): number {
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay()
}

/** The stretches of one trading day under a schedule: its correction when one names the date,
 *  nothing on a holiday, the weekday rule otherwise. */
function daySegments(model: SessionModel, schedule: SessionSchedule, d: LocalDay): readonly SessionSegment[] {
  const key = dateKey(d.year, d.month, d.day)
  const corrected = schedule.corrections.get(key)
  if (corrected) return corrected
  if (model.holidays.has(key)) return []
  return schedule.week[weekdayOf(d)] ?? []
}

/** A stretch of a trading day can start up to six days before it and run past its midnight, so
 *  the trading days whose stretches may cover a local minute of day D are D-1 through D+6. */
const DAY_REACH_BACK = 1
const DAY_REACH_FORWARD = 6

function inSchedule(model: SessionModel, schedule: SessionSchedule, d: LocalDay, minute: number): boolean {
  for (let k = -DAY_REACH_BACK; k <= DAY_REACH_FORWARD; k++) {
    const shift = k * MINUTES_PER_DAY
    for (const seg of daySegments(model, schedule, shiftDay(d, k))) {
      if (minute >= seg.start + shift && minute < seg.end + shift) return true
    }
  }
  return false
}

/** The state at a local minute of a local day. Regular hours win; then the subsession that
 *  covers the minute; otherwise closed. */
function stateAtLocal(model: SessionModel, d: LocalDay, minute: number): SessionState {
  if (model.continuous) return 'open'
  if (inSchedule(model, model.regular, d, minute)) return 'open'
  for (const sub of model.extended) if (inSchedule(model, sub.schedule, d, minute)) return sub.state
  return 'closed'
}

/** The state the market status reports for a session state: on an electronic day every stretch of
 *  the day is the market open, and on any other day the state is its own. */
function marketFacing(model: SessionModel, state: SessionState): SessionState {
  return model.electronic && state === 'extended' ? 'open' : state
}

function localAt(model: SessionModel, epochSecs: number): { day: LocalDay; minute: number } {
  const c = zoneClock(model.timezone, new Date(epochSecs * 1000))
  return { day: { year: c.year, month: c.month, day: c.day }, minute: c.hour * 60 + c.minute }
}

/** The session state at an instant (epoch seconds), under the symbol's exchange clock. */
export function sessionStateAt(model: SessionModel, epochSecs: number): SessionState {
  const { day, minute } = localAt(model, epochSecs)
  return stateAtLocal(model, day, minute)
}

/** The state the market status reports at an instant. */
function marketStateAt(model: SessionModel, epochSecs: number): SessionState {
  return marketFacing(model, sessionStateAt(model, epochSecs))
}

/** Whether a trading day is a full closure: listed in the holidays, with no correction in any
 *  schedule naming it. */
function closedForHoliday(model: SessionModel, d: LocalDay): boolean {
  const key = dateKey(d.year, d.month, d.day)
  if (!model.holidays.has(key) || model.regular.corrections.has(key)) return false
  return !model.extended.some((stretch) => stretch.schedule.corrections.has(key))
}

/** Whether a closed local minute is a holiday: its own date is one, or a trading day whose weekly
 *  stretches would have covered the minute is one (a session that opens the evening before carries
 *  its holiday into that evening). */
function holidayAt(model: SessionModel, d: LocalDay, minute: number): boolean {
  if (model.continuous || model.holidays.size === 0) return false
  if (closedForHoliday(model, d)) return true
  const schedules = [model.regular, ...model.extended.map((stretch) => stretch.schedule)]
  for (let k = -DAY_REACH_BACK; k <= DAY_REACH_FORWARD; k++) {
    const tradingDay = shiftDay(d, k)
    if (k === 0 || !closedForHoliday(model, tradingDay)) continue
    const shift = k * MINUTES_PER_DAY
    for (const schedule of schedules) {
      for (const seg of schedule.week[weekdayOf(tradingDay)] ?? []) if (minute >= seg.start + shift && minute < seg.end + shift) return true
    }
  }
  return false
}

/** The epoch seconds of a wall-clock minute of a local day in the model's zone. Resolved through
 *  the zone's offset at the answer, so a DST change on the day lands on the right side of it. */
function localToEpoch(model: SessionModel, d: LocalDay, minute: number): number {
  const wall = Date.UTC(d.year, d.month - 1, d.day) + minute * 60_000
  const first = wall - tzOffsetMinutes(model.timezone, new Date(wall)) * 60_000
  const offset = tzOffsetMinutes(model.timezone, new Date(first))
  return Math.floor((wall - offset * 60_000) / 1000)
}

/** How far ahead the next transition is looked for: a market closed for longer than this reads
 *  as having no next change. */
const NEXT_CHANGE_HORIZON_DAYS = 8

/** The next session transition after an instant, exact to the minute, or null when there is
 *  none within eight days (a continuous market, or a long closure). */
export function nextSessionChange(model: SessionModel, epochSecs: number): { atSecs: number; state: SessionState } | null {
  return nextChange(model, epochSecs, (at) => sessionStateAt(model, at))
}

/** The next instant after `epochSecs` at which `classify` answers a different state. */
function nextChange(model: SessionModel, epochSecs: number, classify: (atSecs: number) => SessionState): { atSecs: number; state: SessionState } | null {
  if (model.continuous) return null
  const from = classify(epochSecs)
  const { day } = localAt(model, epochSecs)
  // Every stretch edge of every trading day in reach is a candidate transition; the first one
  // after `epochSecs` whose state differs is the answer.
  const edges = new Set<number>()
  const schedules = [model.regular, ...model.extended.map((e) => e.schedule)]
  for (let k = -DAY_REACH_BACK; k <= NEXT_CHANGE_HORIZON_DAYS + DAY_REACH_FORWARD; k++) {
    const tradingDay = shiftDay(day, k)
    for (const schedule of schedules) {
      for (const seg of daySegments(model, schedule, tradingDay)) {
        edges.add(localToEpoch(model, tradingDay, seg.start))
        edges.add(localToEpoch(model, tradingDay, seg.end))
      }
    }
  }
  const horizon = epochSecs + NEXT_CHANGE_HORIZON_DAYS * 86_400
  for (const at of [...edges].sort((a, b) => a - b)) {
    if (at <= epochSecs || at > horizon) continue
    const state = classify(at)
    if (state !== from) return { atSecs: at, state }
  }
  return null
}

export interface SessionTimeline {
  /** The exchange-local day's stretches, closed gaps included, covering 0 to 1440 minutes, in the
   *  states the market status reports: an electronic day is open across the whole day. */
  readonly segments: readonly { readonly start: number; readonly end: number; readonly state: SessionState }[]
  /** The state of the last minute of the day before, and of the first minute of the day after: a
   *  stretch at the day's edge in the same state continues past it. */
  readonly before: SessionState
  readonly after: SessionState
  /** Now, in exchange-local minutes from midnight. */
  readonly nowMins: number
  /** The exchange-local weekday, written in the language of `tag` and upper-cased ("MON"). */
  readonly dayLabel: string
  readonly timezone: string
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>()

/** The exchange-local day's timeline for a status popup. `tag` is the BCP 47 tag the weekday is
 *  written in: a date part, so it comes from Intl rather than the catalog. */
export function sessionTimeline(model: SessionModel, epochSecs: number, tag: string): SessionTimeline {
  const { day, minute } = localAt(model, epochSecs)
  // Every stretch edge that falls inside the day is a boundary; the state of each stretch
  // between boundaries is read at its first minute.
  const bounds = new Set<number>([0, MINUTES_PER_DAY])
  const schedules = [model.regular, ...model.extended.map((e) => e.schedule)]
  for (let k = -DAY_REACH_BACK; k <= DAY_REACH_FORWARD; k++) {
    const shift = k * MINUTES_PER_DAY
    for (const schedule of schedules) {
      for (const seg of daySegments(model, schedule, shiftDay(day, k))) {
        for (const edge of [seg.start + shift, seg.end + shift]) if (edge > 0 && edge < MINUTES_PER_DAY) bounds.add(edge)
      }
    }
  }
  const sorted = [...bounds].sort((a, b) => a - b)
  const segments: { start: number; end: number; state: SessionState }[] = []
  for (let i = 0; i + 1 < sorted.length; i++) {
    const start = sorted[i]!
    const end = sorted[i + 1]!
    const state = marketFacing(model, stateAtLocal(model, day, start))
    const last = segments[segments.length - 1]
    if (last && last.state === state) segments[segments.length - 1] = { start: last.start, end, state }
    else segments.push({ start, end, state })
  }
  const cacheKey = `${tag}|${model.timezone}`
  let weekday = weekdayFormatters.get(cacheKey)
  if (!weekday) {
    weekday = new Intl.DateTimeFormat(tag, { timeZone: model.timezone, weekday: 'short' })
    weekdayFormatters.set(cacheKey, weekday)
  }
  const dayLabel = weekday.format(new Date(epochSecs * 1000)).toUpperCase()
  const before = marketFacing(model, stateAtLocal(model, shiftDay(day, -1), MINUTES_PER_DAY - 1))
  const after = marketFacing(model, stateAtLocal(model, shiftDay(day, 1), 0))
  return { segments, before, after, nowMins: minute, dayLabel, timezone: model.timezone }
}

/** What a market status says, in one word: the session state, with the `extended` state named
 *  `overnight` on a symbol whose extended hours are its overnight stretch, and a closed day the
 *  symbol lists among its holidays named `holiday`. */
export type MarketPhase = 'open' | 'pre' | 'post' | 'overnight' | 'extended' | 'closed' | 'holiday'

/** A symbol's market status at an instant: the session state and the feed's liveness together,
 *  so a consumer cannot present an end-of-day or delayed feed as a live open market. */
export interface MarketStatus {
  /** The session state the market reports. An electronic day reads `open` across the whole day. */
  readonly state: SessionState
  /** What the status says: the state, named for the symbol it is read on. */
  readonly phase: MarketPhase
  /** The feed's liveness, an explicit part of the status. */
  readonly dataStatus: DataStatus
  /** A `24x7` symbol. */
  readonly continuous: boolean
  /** The market is closed for a holiday the symbol lists, on a trading day no correction names. */
  readonly holiday: boolean
  /** The next transition, or null when there is none to count down to. */
  readonly next: { readonly atSecs: number; readonly state: SessionState; readonly phase: MarketPhase } | null
}

/** Whether a model's `extended` state is its overnight stretch: it declares an `overnight`
 *  subsession, or names both its pre-market and its post-market, so the trading outside them is
 *  overnight. A bare `extended` subsession and an electronic day are extended hours. */
function extendedIsOvernight(model: SessionModel): boolean {
  if (model.electronic) return false
  const ids = new Set(model.extended.map((stretch) => stretch.id))
  return ids.has('overnight') || (ids.has('premarket') && ids.has('postmarket'))
}

function phaseOf(model: SessionModel, state: SessionState, holiday: boolean): MarketPhase {
  switch (state) {
    case 'open':
      return 'open'
    case 'pre':
      return 'pre'
    case 'after':
      return 'post'
    case 'extended':
      return extendedIsOvernight(model) ? 'overnight' : 'extended'
    case 'closed':
      return holiday ? 'holiday' : 'closed'
  }
}

/** The phase a market status reports at an instant whose state is already known. */
function phaseAt(model: SessionModel, atSecs: number, state: SessionState): MarketPhase {
  if (state !== 'closed') return phaseOf(model, state, false)
  const { day, minute } = localAt(model, atSecs)
  return phaseOf(model, state, holidayAt(model, day, minute))
}

export function marketStatus(model: SessionModel, dataStatus: DataStatus, nowSecs: number): MarketStatus {
  const { day, minute } = localAt(model, nowSecs)
  const state = marketFacing(model, stateAtLocal(model, day, minute))
  const holiday = state === 'closed' && holidayAt(model, day, minute)
  const change = nextChange(model, nowSecs, (at) => marketStateAt(model, at))
  return {
    state,
    phase: phaseOf(model, state, holiday),
    dataStatus,
    continuous: model.continuous,
    holiday,
    next: change ? { atSecs: change.atSecs, state: change.state, phase: phaseAt(model, change.atSecs, change.state) } : null,
  }
}

/** The market status straight from a resolved symbol, or null when its session cannot be read. */
export function marketStatusFor(symbol: Pick<SymbolInfo, 'timezone' | 'session' | 'sessionHolidays' | 'corrections' | 'subsessions' | 'dataStatus'>, nowSecs: number): MarketStatus | null {
  const model = parseSessionModel(symbol)
  return model ? marketStatus(model, symbol.dataStatus, nowSecs) : null
}

/** The catalog key of each session state's name. A status popup's title uses the same words for the
 *  phases that share them. */
export const SESSION_STATE_TITLE: Readonly<Record<SessionState, ChartMessageKey>> = {
  pre: 'session.pre',
  open: 'session.open',
  extended: 'session.extended',
  after: 'session.after',
  closed: 'session.closed',
}

/** The title of each phase: the session's own name, or the overnight stretch's and the holiday's. */
const PHASE_TITLE: Readonly<Record<MarketPhase, ChartMessageKey>> = {
  open: 'session.open',
  pre: 'session.pre',
  post: 'session.after',
  overnight: 'status.overnightTitle',
  extended: 'session.extended',
  closed: 'session.closed',
  holiday: 'status.holidayTitle',
}

/** The sentence under each phase's title. */
const PHASE_SENTENCE: Readonly<Record<MarketPhase, ChartMessageKey>> = {
  open: 'status.openText',
  pre: 'status.preText',
  post: 'status.postText',
  overnight: 'status.overnightText',
  extended: 'status.extended',
  closed: 'status.closedText',
  holiday: 'status.holidayText',
}

/** The title of a status popup's market section: the phase's name. */
export function marketStatusTitle(t: ChartTranslate, status: MarketStatus): string {
  return t(PHASE_TITLE[status.phase])
}

/** The sentence under the market section's title, which says what the phase means. */
export function marketStatusSentence(t: ChartTranslate, status: MarketStatus): string {
  return t(PHASE_SENTENCE[status.phase])
}

/** The countdown sentence to the next transition, named for where the market goes: "It'll close in
 *  7 hours and 56 minutes." Null with nothing to count down to, which is always the case for a
 *  continuous market. */
export function marketStatusCountdown(t: ChartTranslate, status: MarketStatus, nowSecs: number): string | null {
  const next = status.next
  if (status.continuous || !next) return null
  const until = formatDuration(t, next.atSecs - nowSecs)
  const closed = status.phase === 'closed' || status.phase === 'holiday'
  switch (next.phase) {
    case 'closed':
    case 'holiday':
      return t('status.closesIn', { until })
    case 'pre':
      return t(closed ? 'status.opensPreMarketIn' : 'status.preMarketIn', { until })
    case 'open':
      return t(closed ? 'status.opensIn' : 'status.opensFullyIn', { until })
    case 'post':
      return t(closed ? 'status.opensIn' : 'status.postMarketIn', { until })
    case 'overnight':
      return t(closed ? 'status.opensIn' : 'status.overnightIn', { until })
    case 'extended':
      return t(closed ? 'status.opensIn' : 'status.extendedIn', { until })
  }
}

/** The market section's words as one sentence: what the phase means, then the countdown when there
 *  is one. `status.textPair` owns how the two join, so a language decides the separator. */
export function marketStatusText(t: ChartTranslate, status: MarketStatus, nowSecs: number): string {
  const sentence = marketStatusSentence(t, status)
  const countdown = marketStatusCountdown(t, status, nowSecs)
  return countdown ? t('status.textPair', { sentence, countdown }) : sentence
}

/** The data section of a status popup for a feed that is not a live stream: a delayed stream, or
 *  end-of-day data. Null for a live stream, which has nothing to say about its data. */
export function dataStatusNotice(t: ChartTranslate, dataStatus: DataStatus): { title: string; text: string } | null {
  if (dataStatus === 'delayed_streaming') return { title: t('status.delayedTitle'), text: t('status.delayedText') }
  if (dataStatus === 'endofday') return { title: t('status.endOfDayTitle'), text: t('status.endOfDay') }
  return null
}

/** "3 days and 4 hours": the coarsest unit, and the next one down when it is non-zero. Each unit is
 *  a whole phrase and `status.durationPair` owns the order and the joining words, so a language
 *  decides both rather than inheriting English's. A duration under a minute reads as one minute. */
export function formatDuration(t: ChartTranslate, secs: number): string {
  const mins = Math.max(1, Math.round(secs / 60))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const pair = (major: string, minor: string) => t('status.durationPair', { major, minor })
  if (d > 0) {
    const days = t('status.durationDays', { count: d })
    return h ? pair(days, t('status.durationHours', { count: h })) : days
  }
  if (h > 0) {
    const hours = t('status.durationHours', { count: h })
    return m ? pair(hours, t('status.durationMinutes', { count: m })) : hours
  }
  return t('status.durationMinutes', { count: m })
}

/** The footer naming the exchange zone a timeline is drawn in: "Exchange timezone: New York
 *  (UTC-4)". */
export function exchangeTimezoneText(t: ChartTranslate, timezone: string, at: Date = new Date()): string {
  return t('status.exchangeTimezone', { zone: timezoneLabel(timezone, at) })
}
