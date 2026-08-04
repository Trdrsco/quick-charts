// Market sessions, per asset class. Three consumers: the SESSION BANDS primitive (shades
// non-regular stretches of the chart), the legend's market-status dot, and the Market Status
// pop-up (status text + countdown + the day's session timeline). All session math runs in the
// EXCHANGE timezone via Intl, so DST is always the IANA database's answer.
//
//   equity  — US equities (New York): pre 04:00–09:30 · regular 09:30–16:00 · after 16:00–20:00,
//             weekdays only.
//   futures — CME Globex (Chicago), the TradingView ETH/RTH split: the full electronic session
//             (ETH) opens Sunday 17:00 and trades around the clock to Friday 16:00 with the
//             16:00–17:00 daily maintenance break; RTH ('open') is 08:30–15:15 within it, and the
//             rest classifies 'eth'.
//   fx      — spot FX + metals/rates/commodity indices (New York): Sunday 17:00 through Friday
//             17:00, continuous.
//   crypto  — 24/7; always open, no bands, no timeline transitions.
//
// Holidays: exchange-local dates whose sessions differ from the weekday rules carry explicit
// per-date overrides below — full closures, early closes, AND the neighbor-day effects (the
// evening before a dark Friday never opens, because that evening belongs to the dark trade date).
// Coverage is exactly what the exchanges have published: equity 2026–2027 (NYSE's holiday
// calendar), futures 2026 plus the invariant Jan 1 closure (CME's schedule; CME finalizes exact
// halt times ~2 weeks before each holiday, so forward half-day times mirror the published
// pattern). A date outside the tables falls back to the weekday rules — honestly uncorrected,
// never a guessed calendar. Extend the tables each year from the exchange calendars; fx stays
// holiday-less by decision (venue-dependent, and the class is already an approximation).
import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import type { SessionClass } from './datafeed'

export type MarketSession = 'pre' | 'open' | 'eth' | 'after' | 'closed'
/** The session models the chart renders. Identical to the datafeed's `SessionClass` by
 *  construction (the served value is assigned straight into it), so a feed can state a symbol's
 *  session model and the chart obeys it. */
export type MarketKind = SessionClass

/** The session model for a symbol: the feed's SERVED class when it states one, else a guess from
 *  the catalog display type (unknown tokens trade like futures — the platform's home asset class).
 *  Served-first is the point: an equity-typed row on a 24/7 venue is neither, and only the feed
 *  knows. */
export function marketKindOf(catalogType: string, served?: SessionClass | null): MarketKind {
  if (served) return served
  if (catalogType === 'crypto') return 'crypto'
  if (catalogType === 'equity') return 'equity'
  if (catalogType === 'fx' || catalogType === 'metal' || catalogType === 'rates' || catalogType === 'commodity') return 'fx'
  return 'futures'
}

interface SessionSegment {
  /** Minutes from exchange-local midnight; end exclusive (1440 = next midnight). */
  readonly start: number
  readonly end: number
  readonly session: Exclude<MarketSession, 'closed'>
}

interface MarketSpec {
  readonly tz: string
  readonly tzCity: string
  /** The day's trading segments for an exchange-local weekday (0 = Sunday). Gaps are closed. */
  day(weekday: number): readonly SessionSegment[]
}

const EQUITY_DAY: readonly SessionSegment[] = [
  { start: 4 * 60, end: 9 * 60 + 30, session: 'pre' },
  { start: 9 * 60 + 30, end: 16 * 60, session: 'open' },
  { start: 16 * 60, end: 20 * 60, session: 'after' },
]

const SPECS: Record<MarketKind, MarketSpec> = {
  equity: {
    tz: 'America/New_York',
    tzCity: 'New York',
    day: (wd) => (wd === 0 || wd === 6 ? [] : EQUITY_DAY),
  },
  futures: {
    tz: 'America/Chicago',
    tzCity: 'Chicago',
    day: (wd) => {
      if (wd === 6) return []
      if (wd === 0) return [{ start: 17 * 60, end: 1440, session: 'eth' }]
      const weekday: readonly SessionSegment[] = [
        { start: 0, end: 8 * 60 + 30, session: 'eth' },
        { start: 8 * 60 + 30, end: 15 * 60 + 15, session: 'open' },
        { start: 15 * 60 + 15, end: 16 * 60, session: 'eth' },
      ]
      if (wd === 5) return weekday
      return [...weekday, { start: 17 * 60, end: 1440, session: 'eth' }]
    },
  },
  fx: {
    tz: 'America/New_York',
    tzCity: 'New York',
    day: (wd) => {
      if (wd === 6) return []
      if (wd === 0) return [{ start: 17 * 60, end: 1440, session: 'open' }]
      if (wd === 5) return [{ start: 0, end: 17 * 60, session: 'open' }]
      return [{ start: 0, end: 1440, session: 'open' }]
    },
  },
  crypto: {
    tz: 'Etc/UTC',
    tzCity: 'UTC',
    day: () => [{ start: 0, end: 1440, session: 'open' }],
  },
}

/** The asset class's exchange timezone (the clock its sessions run on). */
export function exchangeZoneOf(kind: MarketKind): { tz: string; city: string } {
  const spec = SPECS[kind]
  return { tz: spec.tz, city: spec.tzCity }
}

/* ── Holiday overrides (exchange-local dates) ────────────────────────────── */

const DARK: readonly SessionSegment[] = []

/** NYSE early close: the 13:00 ET close; late sessions still end 17:00 ET. */
const EQUITY_EARLY_CLOSE: readonly SessionSegment[] = [
  { start: 4 * 60, end: 9 * 60 + 30, session: 'pre' },
  { start: 9 * 60 + 30, end: 13 * 60, session: 'open' },
  { start: 13 * 60, end: 17 * 60, session: 'after' },
]

/** CME equity-index holiday halt at 12:00 CT with the same-evening 17:00 reopen (a Monday or
 *  Thanksgiving-Thursday holiday: the next calendar day trades). */
const FUT_HALT_NOON_REOPEN: readonly SessionSegment[] = [
  { start: 0, end: 8 * 60 + 30, session: 'eth' },
  { start: 8 * 60 + 30, end: 12 * 60, session: 'open' },
  { start: 17 * 60, end: 1440, session: 'eth' },
]

/** The 12:00 CT halt with NO evening reopen (a Friday holiday — the next open is Sunday's). */
const FUT_HALT_NOON: readonly SessionSegment[] = [
  { start: 0, end: 8 * 60 + 30, session: 'eth' },
  { start: 8 * 60 + 30, end: 12 * 60, session: 'open' },
]

/** The 12:15 CT early close (Black Friday, Christmas Eve), never followed by an evening session. */
const FUT_EARLY_1215: readonly SessionSegment[] = [
  { start: 0, end: 8 * 60 + 30, session: 'eth' },
  { start: 8 * 60 + 30, end: 12 * 60 + 15, session: 'open' },
]

/** A full regular day whose 17:00 evening reopen never happens — the day BEFORE a dark date (the
 *  evening session belongs to the next trade date, and that date is closed). */
const FUT_DAY_NO_EVENING: readonly SessionSegment[] = [
  { start: 0, end: 8 * 60 + 30, session: 'eth' },
  { start: 8 * 60 + 30, end: 15 * 60 + 15, session: 'open' },
  { start: 15 * 60 + 15, end: 16 * 60, session: 'eth' },
]

/** A dark day session with the 17:00 evening reopen (a Thursday New Year's Day: Friday trades). */
const FUT_EVENING_ONLY: readonly SessionSegment[] = [{ start: 17 * 60, end: 1440, session: 'eth' }]

/** NYSE 2026–2027, from the exchange's published holiday calendar. Full closures are DARK;
 *  Nov 27 2026, Dec 24 2026, and Nov 26 2027 close early at 13:00 ET. Both years observe
 *  Independence Day as a FULL closure (Jul 4 falls on a weekend both years). */
const EQUITY_HOLIDAYS: Record<string, readonly SessionSegment[]> = {
  '2026-01-01': DARK,
  '2026-01-19': DARK,
  '2026-02-16': DARK,
  '2026-04-03': DARK,
  '2026-05-25': DARK,
  '2026-06-19': DARK,
  '2026-07-03': DARK,
  '2026-09-07': DARK,
  '2026-11-26': DARK,
  '2026-11-27': EQUITY_EARLY_CLOSE,
  '2026-12-24': EQUITY_EARLY_CLOSE,
  '2026-12-25': DARK,
  '2027-01-01': DARK,
  '2027-01-18': DARK,
  '2027-02-15': DARK,
  '2027-03-26': DARK,
  '2027-05-31': DARK,
  '2027-06-18': DARK,
  '2027-07-05': DARK,
  '2027-09-06': DARK,
  '2027-11-25': DARK,
  '2027-11-26': EQUITY_EARLY_CLOSE,
  '2027-12-24': DARK,
}

/** CME equity-index 2026 (the exchange's published schedule): US-holiday halts at 12:00 CT,
 *  Good Friday/Christmas/New Year's fully dark, 12:15 CT early closes on Black Friday and
 *  Christmas Eve, and the dark-Friday neighbor days (Apr 2, Dec 24, Dec 31) losing their evening
 *  session. 2027 is unpublished except the invariant New Year's closure. */
const FUTURES_HOLIDAYS: Record<string, readonly SessionSegment[]> = {
  '2026-01-01': FUT_EVENING_ONLY,
  '2026-01-19': FUT_HALT_NOON_REOPEN,
  '2026-02-16': FUT_HALT_NOON_REOPEN,
  '2026-04-02': FUT_DAY_NO_EVENING,
  '2026-04-03': DARK,
  '2026-05-25': FUT_HALT_NOON_REOPEN,
  '2026-06-19': FUT_HALT_NOON,
  '2026-07-03': FUT_HALT_NOON,
  '2026-09-07': FUT_HALT_NOON_REOPEN,
  '2026-11-26': FUT_HALT_NOON_REOPEN,
  '2026-11-27': FUT_EARLY_1215,
  '2026-12-24': FUT_EARLY_1215,
  '2026-12-25': DARK,
  '2026-12-31': FUT_DAY_NO_EVENING,
  '2027-01-01': DARK,
}

const HOLIDAY_OVERRIDES: Partial<Record<MarketKind, Record<string, readonly SessionSegment[]>>> = {
  equity: EQUITY_HOLIDAYS,
  futures: FUTURES_HOLIDAYS,
}

/** The trading segments for one exchange-local calendar day: the holiday override when the date
 *  has one, the weekday rules otherwise. */
function daySegments(kind: MarketKind, dateKey: string, weekday: number): readonly SessionSegment[] {
  return HOLIDAY_OVERRIDES[kind]?.[dateKey] ?? SPECS[kind].day(weekday)
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

const localFmtCache = new Map<string, Intl.DateTimeFormat>()
function localParts(epochMs: number, tz: string): { weekday: number; mins: number; dateKey: string } {
  let fmt = localFmtCache.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    localFmtCache.set(tz, fmt)
  }
  const parts = fmt.formatToParts(new Date(epochMs))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return {
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    mins: (Number(get('hour')) % 24) * 60 + Number(get('minute')),
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/** Classify an epoch (seconds or ms) into a market session under the asset class's exchange clock. */
export function sessionOf(epoch: number, kind: MarketKind): MarketSession {
  const ms = epoch < 1e12 ? epoch * 1000 : epoch
  const spec = SPECS[kind]
  const { weekday, mins, dateKey } = localParts(ms, spec.tz)
  const seg = daySegments(kind, dateKey, weekday).find((s) => mins >= s.start && mins < s.end)
  return seg?.session ?? 'closed'
}

/** The next session transition after `epochSecs`, exact to the minute (found by scan + binary
 *  search over real classifications, so DST weeks resolve correctly). Null = never (crypto). */
export function nextSessionChange(epochSecs: number, kind: MarketKind): { atSecs: number; session: MarketSession } | null {
  if (kind === 'crypto') return null
  const from = sessionOf(epochSecs, kind)
  const STEP = 15 * 60
  const LIMIT = 8 * 86_400
  let lo = epochSecs
  let hi = epochSecs
  for (let off = STEP; off <= LIMIT; off += STEP) {
    hi = epochSecs + off
    if (sessionOf(hi, kind) !== from) break
    lo = hi
  }
  if (sessionOf(hi, kind) === from) return null
  while (hi - lo > 60) {
    // Floor to a minute but never back onto `lo` — a sub-2-minute window would otherwise loop.
    const mid = lo + Math.max(60, Math.floor((hi - lo) / 2 / 60) * 60)
    if (sessionOf(mid, kind) === from) lo = mid
    else hi = mid
  }
  return { atSecs: hi, session: sessionOf(hi, kind) }
}

export interface SessionTimeline {
  /** The exchange-local day's segments, closed gaps included, covering 0–1440. */
  readonly segments: readonly { start: number; end: number; session: MarketSession }[]
  /** Now, in exchange-local minutes from midnight. */
  readonly nowMins: number
  /** Exchange-local weekday label ("MON"). */
  readonly dayLabel: string
  readonly tz: string
  readonly tzCity: string
}

/** The current exchange-local day's session timeline for the Market Status pop-up. */
export function sessionTimeline(epochSecs: number, kind: MarketKind): SessionTimeline {
  const spec = SPECS[kind]
  const { weekday, mins, dateKey } = localParts(epochSecs * 1000, spec.tz)
  const open = daySegments(kind, dateKey, weekday)
  const segments: { start: number; end: number; session: MarketSession }[] = []
  let cursor = 0
  for (const s of open) {
    if (s.start > cursor) segments.push({ start: cursor, end: s.start, session: 'closed' })
    segments.push({ start: s.start, end: s.end, session: s.session })
    cursor = s.end
  }
  if (cursor < 1440) segments.push({ start: cursor, end: 1440, session: 'closed' })
  const dayLabel = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][weekday] ?? ''
  return { segments, nowMins: mins, dayLabel, tz: spec.tz, tzCity: spec.tzCity }
}

/** The chart's session view (TradingView's CME model): ETH shows every bar; RTH filters intraday
 *  bars to regular hours. Persisted once for all charts. */
/** True for a sub-daily timeframe token (t/s/m/h units) — session bands and regular-hours
 *  filtering only make sense intraday, because a daily+ bar spans whole sessions. An unparseable
 *  token reads as NOT intraday: mis-shading a chart is worse than not shading it. */
export function isIntradayTf(tf: string): boolean {
  return /^\d+(t|s|m|h)$/.test(tf)
}

export const SESSION_LABEL: Record<MarketSession, string> = {
  pre: 'Pre-market',
  open: 'Market open',
  eth: 'Electronic hours',
  after: 'After-hours',
  closed: 'Market closed',
}

export const SESSION_DOT: Record<MarketSession, string> = {
  pre: '#4c98fb',
  open: '#22c55e',
  eth: '#4c98fb',
  after: '#f5a623',
  closed: 'rgba(255,255,255,0.35)',
}

const BAND_FILL: Record<Exclude<MarketSession, 'open'>, string> = {
  pre: 'rgba(76,152,251,0.05)',
  eth: 'rgba(76,152,251,0.05)',
  after: 'rgba(245,166,35,0.045)',
  closed: 'rgba(0,0,0,0.22)',
}

/** A series primitive that shades every non-regular-hours stretch of the visible chart. Bars are
 *  read back from the price series (no second feed), classified under the CURRENT market kind,
 *  merged into runs, and drawn as full-height rects UNDER the candles (zOrder bottom). Re-renders
 *  with every chart paint, so it tracks pan/zoom for free. Crypto never bands (always open), and
 *  bands render on INTRADAY intervals only — a daily+ bar spans whole sessions, so classifying its
 *  single timestamp would shade entire days by whichever session that instant fell in. */
export function createSessionBands(chart: IChartApi, series: ISeriesApi<SeriesType>, enabled: () => boolean, kind: () => MarketKind, intraday: () => boolean) {
  const renderer = {
    draw(target: unknown) {
      const k = kind()
      if (!enabled() || !intraday() || k === 'crypto') return
      const t = target as {
        useBitmapCoordinateSpace: (fn: (scope: { context: CanvasRenderingContext2D; bitmapSize: { width: number; height: number }; horizontalPixelRatio: number }) => void) => void
      }
      t.useBitmapCoordinateSpace((scope) => {
        // REAL bars only — the future-whitespace horizon (right-margin drawing) must not paint
        // session bands into empty space past the last candle.
        const data = (series.data() as { time: Time; close?: number; value?: number }[]).filter(
          (b) => typeof b.close === 'number' || typeof b.value === 'number',
        )
        if (data.length < 2) return
        const ts = chart.timeScale()
        const range = ts.getVisibleRange()
        if (!range) return
        const barW = ts.options().barSpacing
        // Merge consecutive same-session bars into runs (visible window only, with 1-bar slack).
        let runStart: number | null = null
        let runSession: MarketSession | null = null
        const flush = (endTime: number) => {
          if (runStart == null || runSession == null || runSession === 'open') {
            runStart = null
            return
          }
          const x1 = ts.timeToCoordinate(runStart as Time)
          const x2 = ts.timeToCoordinate(endTime as Time)
          if (x1 == null && x2 == null) {
            runStart = null
            return
          }
          const r = scope.horizontalPixelRatio
          const left = ((x1 ?? -barW) - barW / 2) * r
          const right = ((x2 ?? scope.bitmapSize.width / r + barW) + barW / 2) * r
          scope.context.fillStyle = BAND_FILL[runSession]
          scope.context.fillRect(left, 0, right - left, scope.bitmapSize.height)
          runStart = null
        }
        let prevTime = 0
        for (const bar of data) {
          const time = bar.time as number
          if (time < (range.from as number) - 86_400 || time > (range.to as number) + 86_400) continue
          const s = sessionOf(time, k)
          if (s !== runSession) {
            if (runSession != null) flush(prevTime)
            runStart = time
            runSession = s
          }
          prevTime = time
        }
        if (runSession != null) flush(prevTime)
      })
    },
  }
  // NOTE: in lightweight-charts v5 a pane view's zOrder is a METHOD — a plain property makes the
  // library call a string and crash every chart paint (which unmounts the whole app).
  return {
    paneViews() {
      return [{ zOrder: () => 'bottom' as const, renderer: () => renderer }]
    },
  }
}
