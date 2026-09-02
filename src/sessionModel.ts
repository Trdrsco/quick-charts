// The session model a symbol's OWN metadata builds: the reference session grammar in `session`,
// the full-closure dates in `sessionHolidays`, the dated overrides in `corrections`, and the
// optional subsessions that split extended hours into pre-market, regular and after-hours, all
// read in the symbol's exchange `timezone`. From it the chart answers the session state at an
// instant, the next transition, the exchange-local day's timeline, and the market status a
// status popup shows. The feed owns every one of these facts; the chart evaluates them and
// claims nothing a feed did not say.
//
// The grammar is the reference's (docs/corpus, "Trading sessions" and "Symbology"): `24x7`;
// `HHMM-HHMM` stretches, several per day separated by commas; a `:days` suffix with 1 = Sunday
// through 7 = Saturday, sessions for other days separated by `|`, weekdays by default; an `F` or
// `Fn` after a time for a start or end on a previous day, a start later than its end for an
// overnight session, and times past 2400 for a session that runs into the next day; an optional
// `first day;` prefix or `;first day` suffix, which orders a week and does not change any hour.
// Holidays are `YYYYMMDD` dates separated by commas. Corrections are `SESSION:YYYYMMDD[,...]`
// entries separated by semicolons, and a correction outranks a holiday on the same date.
import type { ChartTranslate } from './i18n'
import type { ChartMessageKey } from './i18n/en'
import type { DataStatus, SymbolInfo } from './symbology'
import { timezoneLabel, tzOffsetMinutes, zoneClock } from './timezones'

/** The session an instant classifies into. `extended` is trading outside regular hours when the
 *  symbol does not split it into pre-market and after-hours. */
export type SessionState = 'pre' | 'open' | 'extended' | 'after' | 'closed'

/** One subsession of an extended-hours symbol, the reference's own shape: `regular`,
 *  `extended`, `premarket` or `postmarket`, each with its own session string and, optionally,
 *  its own corrections. */
export interface SubsessionSource {
  readonly id: string
  readonly session: string
  readonly corrections?: string
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
  /** The regular session. */
  readonly regular: SessionSchedule
  /** Extended-hours stretches by the state they classify into, from the subsessions. */
  readonly extended: readonly { readonly state: Exclude<SessionState, 'open' | 'closed'>; readonly schedule: SessionSchedule }[]
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

const SUBSESSION_STATE: Readonly<Record<string, Exclude<SessionState, 'open' | 'closed'>>> = {
  premarket: 'pre',
  postmarket: 'after',
  extended: 'extended',
}

/** Build the session model from a symbol's metadata. Null when the grammar cannot read any part
 *  of it: a chart then shows no bands, no status and no timeline for the symbol rather than a
 *  session it guessed. A `regular` subsession, when given, is the regular session; the symbol's
 *  `session` is otherwise. Subsessions with ids the chart has no state for are ignored. */
export function parseSessionModel(source: SessionSource): SessionModel | null {
  const timezone = source.timezone.trim()
  if (timezone === '') return null
  const holidays = parseHolidays(source.sessionHolidays)
  if (!holidays) return null
  if (source.session.trim() === '24x7') {
    return { timezone, continuous: true, regular: { week: Array.from({ length: 7 }, () => [{ start: 0, end: MINUTES_PER_DAY }]), corrections: new Map() }, extended: [], holidays }
  }
  const regularSource = source.subsessions?.find((s) => s.id === 'regular')
  const regular = regularSource ? parseSchedule(regularSource.session, regularSource.corrections ?? source.corrections) : parseSchedule(source.session, source.corrections)
  if (!regular) return null
  const extended: { state: Exclude<SessionState, 'open' | 'closed'>; schedule: SessionSchedule }[] = []
  for (const sub of source.subsessions ?? []) {
    const state = SUBSESSION_STATE[sub.id]
    if (!state) continue
    const schedule = parseSchedule(sub.session, sub.corrections)
    if (!schedule) return null
    extended.push({ state, schedule })
  }
  return { timezone, continuous: false, regular, extended, holidays }
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

function localAt(model: SessionModel, epochSecs: number): { day: LocalDay; minute: number } {
  const c = zoneClock(model.timezone, new Date(epochSecs * 1000))
  return { day: { year: c.year, month: c.month, day: c.day }, minute: c.hour * 60 + c.minute }
}

/** The session state at an instant (epoch seconds), under the symbol's exchange clock. */
export function sessionStateAt(model: SessionModel, epochSecs: number): SessionState {
  const { day, minute } = localAt(model, epochSecs)
  return stateAtLocal(model, day, minute)
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
  if (model.continuous) return null
  const from = sessionStateAt(model, epochSecs)
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
    const state = sessionStateAt(model, at)
    if (state !== from) return { atSecs: at, state }
  }
  return null
}

export interface SessionTimeline {
  /** The exchange-local day's stretches, closed gaps included, covering 0 to 1440 minutes. */
  readonly segments: readonly { readonly start: number; readonly end: number; readonly state: SessionState }[]
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
  // Every stretch edge that falls inside the day is a boundary; the state of each interval
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
    const state = stateAtLocal(model, day, start)
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
  return { segments, nowMins: minute, dayLabel, timezone: model.timezone }
}

/** A symbol's market status at an instant: the session state and the feed's liveness together,
 *  so a consumer cannot present an end-of-day or delayed feed as a live open market. */
export interface MarketStatus {
  readonly state: SessionState
  /** The feed's liveness, an explicit part of the status. */
  readonly dataStatus: DataStatus
  /** A `24x7` symbol. */
  readonly continuous: boolean
  /** The next transition, or null when there is none to count down to. */
  readonly next: { readonly atSecs: number; readonly state: SessionState } | null
}

export function marketStatus(model: SessionModel, dataStatus: DataStatus, nowSecs: number): MarketStatus {
  return { state: sessionStateAt(model, nowSecs), dataStatus, continuous: model.continuous, next: nextSessionChange(model, nowSecs) }
}

/** The market status straight from a resolved symbol, or null when its session cannot be read. */
export function marketStatusFor(symbol: Pick<SymbolInfo, 'timezone' | 'session' | 'sessionHolidays' | 'dataStatus'> & { corrections?: string; subsessions?: readonly SubsessionSource[] }, nowSecs: number): MarketStatus | null {
  const model = parseSessionModel(symbol)
  return model ? marketStatus(model, symbol.dataStatus, nowSecs) : null
}

/** The catalog key of a session state's name: the same five words the legend's status dot and
 *  a status popup's title use. */
export const SESSION_STATE_TITLE: Readonly<Record<SessionState, ChartMessageKey>> = {
  pre: 'session.pre',
  open: 'session.open',
  extended: 'session.eth',
  after: 'session.after',
  closed: 'session.closed',
}

/** The title line of a status popup: the feed's liveness when it is not a live stream, the
 *  continuous market's own word, or the session state's name. */
export function marketStatusTitle(t: ChartTranslate, status: MarketStatus): string {
  if (status.dataStatus === 'endofday') return t('status.endOfDayTitle')
  if (status.continuous) return t('status.continuousTitle')
  return t(SESSION_STATE_TITLE[status.state])
}

/** "3 days 4 hours": the coarsest unit, and the next one down when it is non-zero. Each unit is a
 *  whole phrase and `status.durationPair` owns the order and the separator, so a language decides
 *  both rather than inheriting English's. A duration under a minute reads as one minute. */
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

/** The sentence under a status popup's title. An end-of-day feed states that and nothing about
 *  hours; a continuous market states that it never closes; otherwise the session state with a
 *  countdown to the next transition when one is known, and a delayed stream adds that its prices
 *  are delayed. */
export function marketStatusText(t: ChartTranslate, status: MarketStatus, nowSecs: number): string {
  if (status.dataStatus === 'endofday') return t('status.endOfDay')
  const session = sessionSentence(t, status, nowSecs)
  return status.dataStatus === 'delayed_streaming' ? t('status.delayedPair', { status: session, delay: t('status.delayed') }) : session
}

function sessionSentence(t: ChartTranslate, status: MarketStatus, nowSecs: number): string {
  if (status.continuous) return t('status.continuous')
  const next = status.next
  const until = next ? formatDuration(t, next.atSecs - nowSecs) : null
  switch (status.state) {
    case 'open':
      return until ? t('status.openCloses', { until }) : t('status.open')
    case 'extended':
      if (!until || !next) return t('status.extended')
      return next.state === 'open' ? t('status.extendedRegular', { until }) : t('status.extendedCloses', { until })
    case 'pre':
      return until ? t('status.preRegular', { until }) : t('status.pre')
    case 'after':
      return until ? t('status.afterEnds', { until }) : t('status.after')
    case 'closed':
      if (!until || !next) return t('status.closed')
      return next.state === 'pre' ? t('status.closedPre', { until }) : t('status.closedOpens', { until })
  }
}

/** The footer naming the exchange zone a timeline is drawn in: "Exchange timezone: New York
 *  (UTC-4)". */
export function exchangeTimezoneText(t: ChartTranslate, timezone: string, at: Date = new Date()): string {
  return t('status.exchangeTimezone', { zone: timezoneLabel(timezone, at) })
}
