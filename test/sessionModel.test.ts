// The session model built from a symbol's own session metadata: the session grammar (weekday
// sessions, overnight starts, previous-day markers, per-day alternatives, multiple stretches),
// holidays, corrections, subsessions, and the state, next-change, timeline and market-status
// answers over it. Every expectation pins a concrete UTC epoch against an exchange-local wall
// time in BOTH DST regimes, so a grammar bug or a broken zone conversion fails loudly.
import { describe, expect, it } from 'vitest'
import { createChartI18n } from '../src/i18n'
import {
  DEFAULT_SUBSESSION,
  dataStatusNotice,
  exchangeTimezoneText,
  hasExtendedHours,
  formatDuration,
  marketStatus,
  marketStatusCountdown,
  marketStatusFor,
  marketStatusSentence,
  marketStatusText,
  marketStatusTitle,
  nextSessionChange,
  parseSessionModel,
  sessionStateAt,
  sessionTimeline,
  subsessionBarFilter,
  tradingHoursOption,
  tradingHoursOptions,
  type SessionModel,
} from '../src/sessionModel'

const utc = (y: number, m0: number, d: number, h = 0, min = 0) => Date.UTC(y, m0, d, h, min) / 1000
const t = createChartI18n().t
const model = (source: Parameters<typeof parseSessionModel>[0]): SessionModel => {
  const m = parseSessionModel(source)
  if (!m) throw new Error(`unreadable session ${JSON.stringify(source)}`)
  return m
}

// The served shapes (a feed's symbol info): CME Globex, US equities, spot FX, a perp.
const CME = model({ timezone: 'America/Chicago', session: '1700-1600:23456' })
const EQUITY = model({ timezone: 'America/New_York', session: '0930-1600' })
const EQUITY_EXTENDED = model({
  timezone: 'America/New_York',
  session: '0930-1600',
  subsessions: [
    { id: 'regular', session: '0930-1600' },
    { id: 'premarket', session: '0400-0930' },
    { id: 'postmarket', session: '1600-2000' },
  ],
})
const FX = model({ timezone: 'America/New_York', session: '1700-1700:23456' })
const PERP = model({ timezone: 'Etc/UTC', session: '24x7' })

describe('parseSessionModel', () => {
  it('reads the served grammars', () => {
    expect(CME.continuous).toBe(false)
    expect(CME.regular.week[1]).toEqual([{ start: -420, end: 960 }]) // Monday: Sunday 17:00 to Monday 16:00
    expect(CME.regular.week[0]).toEqual([])
    expect(CME.regular.week[6]).toEqual([])
    expect(EQUITY.regular.week[3]).toEqual([{ start: 570, end: 960 }])
    expect(EQUITY.regular.week[0]).toEqual([])
    expect(FX.regular.week[5]).toEqual([{ start: -420, end: 1020 }]) // start equals end: the previous day
    expect(PERP.continuous).toBe(true)
  })

  it('reads every form of the grammar: alternatives per day, several stretches, previous-day markers, past-midnight ends, a first-day marker', () => {
    const m = model({ timezone: 'Etc/UTC', session: '0900-1400:2|0900-1630' })
    expect(m.regular.week[1]).toEqual([{ start: 540, end: 840 }])
    expect(m.regular.week[2]).toEqual([{ start: 540, end: 990 }])
    const two = model({ timezone: 'Etc/UTC', session: '0930-1400,1430-1700' })
    expect(two.regular.week[1]).toEqual([
      { start: 570, end: 840 },
      { start: 870, end: 1020 },
    ])
    const marked = model({ timezone: 'Etc/UTC', session: '2200-2200:3456|1700F-2200:2' })
    expect(marked.regular.week[1]).toEqual([{ start: 1020 - 1440, end: 1320 }])
    expect(marked.regular.week[2]).toEqual([{ start: 1320 - 1440, end: 1320 }])
    const back3 = model({ timezone: 'Etc/UTC', session: '1900F3-2350F3:6' })
    expect(back3.regular.week[5]).toEqual([{ start: 1140 - 3 * 1440, end: 1430 - 3 * 1440 }])
    const late = model({ timezone: 'Etc/UTC', session: '0930-2730' })
    expect(late.regular.week[1]).toEqual([{ start: 570, end: 1650 }])
    const weekend = model({ timezone: 'Etc/UTC', session: '0930-1630:34567' })
    expect(weekend.regular.week[6]).toEqual([{ start: 570, end: 990 }])
    expect(weekend.regular.week[1]).toEqual([])
    expect(model({ timezone: 'Etc/UTC', session: '1;0900-1630|0900-1400:2' }).regular.week[1]).toEqual([{ start: 540, end: 840 }])
    expect(model({ timezone: 'Etc/UTC', session: '0900-1630|0900-1400:2;6' }).regular.week[2]).toEqual([{ start: 540, end: 990 }])
    expect(model({ timezone: 'Etc/UTC', session: '0000-0000' }).regular.week[1]).toEqual([{ start: 0, end: 1440 }])
  })

  it('reads holidays and corrections in the served grammar, a close at midnight included', () => {
    const m = model({
      timezone: 'America/Chicago',
      session: '1700-1600:23456',
      sessionHolidays: '20260101,20261225',
      corrections: '1700-1200:20261126;1700-1215:20261127,20261224;1700-0000:20260102',
    })
    expect([...m.holidays]).toEqual(['20260101', '20261225'])
    expect(m.regular.corrections.get('20261126')).toEqual([{ start: -420, end: 720 }])
    expect(m.regular.corrections.get('20261127')).toEqual([{ start: -420, end: 735 }])
    expect(m.regular.corrections.get('20261224')).toEqual([{ start: -420, end: 735 }])
    expect(m.regular.corrections.get('20260102')).toEqual([{ start: -420, end: 0 }])
  })

  it('returns null for a grammar it cannot read, never a guessed session', () => {
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '' })).toBeNull()
    expect(parseSessionModel({ timezone: '', session: '0930-1600' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '9:30-16:00' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '0930-1600:8' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '0930-1660' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '0930-1600', sessionHolidays: '2026-01-01' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '0930-1600', corrections: '1000-1400' })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC', session: '0930-1600', subsessions: [{ id: 'premarket', session: 'x' }] })).toBeNull()
    expect(parseSessionModel({ timezone: 'Etc/UTC' } as never)).toBeNull()
    expect(parseSessionModel({ session: '0930-1600' } as never)).toBeNull()
  })
})

describe('sessionStateAt: CME Globex (Chicago)', () => {
  it('classifies a summer week: Sunday 17:00 CDT opens, 16:00 to 17:00 is the daily break, Friday 16:00 closes the week', () => {
    expect(sessionStateAt(CME, utc(2026, 6, 12, 21, 0))).toBe('closed') // Sunday 16:00 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 12, 22, 0))).toBe('open') // Sunday 17:00 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 13, 15, 0))).toBe('open') // Monday 10:00 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 13, 21, 0))).toBe('closed') // Monday 16:00 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 13, 21, 59))).toBe('closed')
    expect(sessionStateAt(CME, utc(2026, 6, 13, 22, 0))).toBe('open') // Monday 17:00 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 17, 20, 59))).toBe('open') // Friday 15:59 CDT
    expect(sessionStateAt(CME, utc(2026, 6, 17, 21, 0))).toBe('closed')
    expect(sessionStateAt(CME, utc(2026, 6, 18, 15, 0))).toBe('closed') // Saturday
  })

  it('classifies a winter week under CST', () => {
    expect(sessionStateAt(CME, utc(2026, 0, 11, 22, 30))).toBe('closed') // Sunday 16:30 CST
    expect(sessionStateAt(CME, utc(2026, 0, 11, 23, 0))).toBe('open') // Sunday 17:00 CST
    expect(sessionStateAt(CME, utc(2026, 0, 12, 16, 0))).toBe('open') // Monday 10:00 CST
    expect(sessionStateAt(CME, utc(2026, 0, 12, 22, 0))).toBe('closed') // Monday 16:00 CST
  })
})

describe('sessionStateAt: equities (New York) with and without subsessions', () => {
  it('a plain regular session is open or closed', () => {
    expect(sessionStateAt(EQUITY, utc(2026, 6, 13, 9, 0))).toBe('closed') // Monday 05:00 EDT
    expect(sessionStateAt(EQUITY, utc(2026, 6, 13, 13, 30))).toBe('open') // 09:30 EDT
    expect(sessionStateAt(EQUITY, utc(2026, 6, 13, 19, 59))).toBe('open')
    expect(sessionStateAt(EQUITY, utc(2026, 6, 13, 20, 0))).toBe('closed') // 16:00 EDT
    expect(sessionStateAt(EQUITY, utc(2026, 6, 18, 15, 0))).toBe('closed') // Saturday
  })

  it('subsessions split the day into pre-market, regular and after-hours', () => {
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 6, 13, 7, 59))).toBe('closed') // 03:59 EDT
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 6, 13, 9, 0))).toBe('pre') // 05:00 EDT
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 6, 13, 14, 0))).toBe('open') // 10:00 EDT
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 6, 13, 21, 0))).toBe('after') // 17:00 EDT
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 6, 14, 1, 0))).toBe('closed') // 21:00 EDT
    expect(sessionStateAt(EQUITY_EXTENDED, utc(2026, 0, 12, 10, 0))).toBe('pre') // 05:00 EST
  })

  it('an extended subsession without a pre/post split classifies as extended outside regular hours', () => {
    const m = model({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'extended', session: '0400-2000' }] })
    expect(sessionStateAt(m, utc(2026, 6, 13, 9, 0))).toBe('extended')
    expect(sessionStateAt(m, utc(2026, 6, 13, 14, 0))).toBe('open')
    expect(sessionStateAt(m, utc(2026, 6, 13, 21, 0))).toBe('extended')
    expect(sessionStateAt(m, utc(2026, 6, 14, 1, 0))).toBe('closed')
  })
})

describe('sessionStateAt: FX and a perp', () => {
  it('FX runs Sunday 17:00 to Friday 17:00 New York, continuously', () => {
    expect(sessionStateAt(FX, utc(2026, 6, 12, 20, 59))).toBe('closed') // Sunday 16:59 EDT
    expect(sessionStateAt(FX, utc(2026, 6, 12, 21, 0))).toBe('open')
    expect(sessionStateAt(FX, utc(2026, 6, 15, 7, 0))).toBe('open') // Wednesday 03:00 EDT
    expect(sessionStateAt(FX, utc(2026, 6, 17, 20, 59))).toBe('open') // Friday 16:59 EDT
    expect(sessionStateAt(FX, utc(2026, 6, 17, 21, 0))).toBe('closed')
  })

  it('a 24x7 market is always open and never changes', () => {
    expect(sessionStateAt(PERP, utc(2026, 6, 18, 3, 0))).toBe('open')
    expect(nextSessionChange(PERP, utc(2026, 6, 18, 3, 0))).toBeNull()
  })
})

describe('holidays and corrections', () => {
  const HOLIDAY = model({ timezone: 'America/Chicago', session: '1700-1600:23456', sessionHolidays: '20260101' })
  const CORRECTED = model({
    timezone: 'America/Chicago',
    session: '1700-1600:23456',
    sessionHolidays: '20260101',
    corrections: '1700-1200:20261126;1700-1215:20261127,20261224;1700-0000:20260101',
  })

  it('a holiday closes its whole trading day, the night before included', () => {
    expect(sessionStateAt(HOLIDAY, utc(2026, 0, 1, 0, 0))).toBe('closed') // Dec 31 18:00 CST, trading day Jan 1
    expect(sessionStateAt(HOLIDAY, utc(2026, 0, 1, 16, 0))).toBe('closed') // Jan 1 10:00 CST
    expect(sessionStateAt(HOLIDAY, utc(2026, 0, 2, 0, 0))).toBe('open') // Jan 1 18:00 CST, trading day Jan 2
    expect(sessionStateAt(CME, utc(2026, 0, 1, 16, 0))).toBe('open') // the same instant without the holiday
  })

  it('a correction shortens its trading day and outranks a holiday on the same date', () => {
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 26, 17, 0))).toBe('open') // Thanksgiving 11:00 CST
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 26, 18, 0))).toBe('closed') // 12:00 CST
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 26, 19, 0))).toBe('closed')
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 27, 0, 0))).toBe('open') // Nov 26 18:00 CST, trading day Nov 27
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 27, 18, 10))).toBe('open') // Nov 27 12:10 CST
    expect(sessionStateAt(CORRECTED, utc(2026, 10, 27, 18, 20))).toBe('closed')
    expect(sessionStateAt(CORRECTED, utc(2026, 11, 24, 18, 10))).toBe('open') // Dec 24 12:10 CST
    expect(sessionStateAt(CORRECTED, utc(2026, 0, 1, 0, 0))).toBe('open') // Dec 31 18:00 CST: the correction, not the holiday
    expect(sessionStateAt(CORRECTED, utc(2026, 0, 1, 7, 0))).toBe('closed') // Jan 1 01:00 CST: closed at 0000
  })

  it('reads a corrections string with previous-day markers', () => {
    const m = model({ timezone: 'America/New_York', session: '0930-1600', corrections: '1900F4-2350F4,1000-1845:20181113;1000-1400:20181114' })
    expect(sessionStateAt(m, utc(2018, 10, 10, 1, 0))).toBe('open') // Friday Nov 9 20:00 EST, the first stretch of Nov 13
    expect(sessionStateAt(m, utc(2018, 10, 13, 14, 45))).toBe('closed') // Nov 13 09:45: the corrected day starts at 10:00
    expect(sessionStateAt(m, utc(2018, 10, 13, 17, 0))).toBe('open')
    expect(sessionStateAt(m, utc(2018, 10, 13, 23, 0))).toBe('open') // 18:00, until 18:45
    expect(sessionStateAt(m, utc(2018, 10, 14, 18, 0))).toBe('open') // Nov 14 13:00
    expect(sessionStateAt(m, utc(2018, 10, 14, 20, 0))).toBe('closed') // Nov 14 15:00
    expect(sessionStateAt(m, utc(2018, 10, 15, 20, 0))).toBe('open') // Nov 15 15:00, the default session again
  })
})

describe('nextSessionChange', () => {
  it('finds the next transition to the minute, across the daily break and the weekend', () => {
    expect(nextSessionChange(CME, utc(2026, 6, 13, 15, 0))).toEqual({ atSecs: utc(2026, 6, 13, 21, 0), state: 'closed' })
    expect(nextSessionChange(CME, utc(2026, 6, 13, 21, 30))).toEqual({ atSecs: utc(2026, 6, 13, 22, 0), state: 'open' })
    expect(nextSessionChange(CME, utc(2026, 6, 17, 21, 30))).toEqual({ atSecs: utc(2026, 6, 19, 22, 0), state: 'open' })
    expect(nextSessionChange(EQUITY_EXTENDED, utc(2026, 6, 13, 9, 0))).toEqual({ atSecs: utc(2026, 6, 13, 13, 30), state: 'open' })
    expect(nextSessionChange(EQUITY_EXTENDED, utc(2026, 6, 13, 21, 0))).toEqual({ atSecs: utc(2026, 6, 14, 0, 0), state: 'closed' })
    expect(nextSessionChange(EQUITY_EXTENDED, utc(2026, 6, 18, 12, 0))).toEqual({ atSecs: utc(2026, 6, 20, 8, 0), state: 'pre' })
  })

  it('lands on the right side of a DST change', () => {
    // US DST begins Sunday 2026-03-08 at 02:00. Sunday 17:00 CDT is 22:00 UTC, not 23:00.
    expect(nextSessionChange(CME, utc(2026, 2, 7, 18, 0))).toEqual({ atSecs: utc(2026, 2, 8, 22, 0), state: 'open' })
    // It ends Sunday 2026-11-01. Sunday 17:00 CST is 23:00 UTC.
    expect(nextSessionChange(CME, utc(2026, 9, 31, 18, 0))).toEqual({ atSecs: utc(2026, 10, 1, 23, 0), state: 'open' })
  })

  it('answers null for a closure longer than its horizon', () => {
    const shut = model({ timezone: 'Etc/UTC', session: '0930-1600', sessionHolidays: Array.from({ length: 14 }, (_, i) => `202607${String(13 + i).padStart(2, '0')}`).join(',') })
    expect(nextSessionChange(shut, utc(2026, 6, 13, 12, 0))).toBeNull()
  })
})

describe('sessionTimeline', () => {
  it('partitions the exchange-local day by state, with the now marker and the weekday in the asked language', () => {
    const tl = sessionTimeline(EQUITY_EXTENDED, utc(2026, 6, 13, 14, 0), 'en')
    expect(tl.segments).toEqual([
      { start: 0, end: 240, state: 'closed' },
      { start: 240, end: 570, state: 'pre' },
      { start: 570, end: 960, state: 'open' },
      { start: 960, end: 1200, state: 'after' },
      { start: 1200, end: 1440, state: 'closed' },
    ])
    expect(tl.nowMins).toBe(600)
    expect(tl.dayLabel).toBe('MON')
    expect(tl.timezone).toBe('America/New_York')
    expect(sessionTimeline(EQUITY_EXTENDED, utc(2026, 6, 13, 14, 0), 'de').dayLabel).toMatch(/^MO/)
  })

  it('shows an overnight session as open across midnight with the daily break', () => {
    expect(sessionTimeline(CME, utc(2026, 6, 13, 15, 0), 'en').segments).toEqual([
      { start: 0, end: 960, state: 'open' },
      { start: 960, end: 1020, state: 'closed' },
      { start: 1020, end: 1440, state: 'open' },
    ])
    expect(sessionTimeline(CME, utc(2026, 6, 18, 15, 0), 'en').segments).toEqual([{ start: 0, end: 1440, state: 'closed' }])
    expect(sessionTimeline(PERP, utc(2026, 6, 18, 15, 0), 'en').segments).toEqual([{ start: 0, end: 1440, state: 'open' }])
  })
})

describe('market status', () => {
  const now = utc(2026, 6, 13, 15, 0) // Monday 10:00 CDT

  it('combines the session state with the feed liveness', () => {
    const s = marketStatus(CME, 'streaming', now)
    expect(s).toEqual({
      state: 'open',
      phase: 'open',
      dataStatus: 'streaming',
      continuous: false,
      holiday: false,
      next: { atSecs: utc(2026, 6, 13, 21, 0), state: 'closed', phase: 'closed' },
    })
    expect(marketStatusTitle(t, s)).toBe('Market open')
    expect(marketStatusSentence(t, s)).toBe("All's well, market is open.")
    expect(marketStatusCountdown(t, s, now)).toBe("It'll close in 6 hours.")
    expect(marketStatusText(t, s, now)).toBe("All's well, market is open. It'll close in 6 hours.")
    expect(dataStatusNotice(t, s.dataStatus)).toBeNull()
  })

  it('states an end-of-day or delayed feed in a notice of its own, beside the market status it does not replace', () => {
    const eod = marketStatus(CME, 'endofday', now)
    expect(marketStatusTitle(t, eod)).toBe('Market open')
    expect(dataStatusNotice(t, eod.dataStatus)).toEqual({ title: 'End-of-day data', text: 'Prices update once a day, after the session ends.' })
    const delayed = marketStatus(CME, 'delayed_streaming', now)
    expect(delayed.dataStatus).toBe('delayed_streaming')
    expect(marketStatusText(t, delayed, now)).toBe("All's well, market is open. It'll close in 6 hours.")
    expect(dataStatusNotice(t, delayed.dataStatus)).toEqual({ title: 'Data is delayed', text: "This symbol's prices are delayed." })
  })

  it('a continuous market is open, with nothing to count down to', () => {
    const s = marketStatus(PERP, 'streaming', now)
    expect(marketStatusTitle(t, s)).toBe('Market open')
    expect(marketStatusCountdown(t, s, now)).toBeNull()
    expect(marketStatusText(t, s, now)).toBe("All's well, market is open.")
  })

  it('writes every session sentence, the countdown named for where the market goes', () => {
    const at = (h: number, min = 0) => utc(2026, 6, 13, h, min)
    const text = (m: SessionModel, secs: number) => marketStatusText(t, marketStatus(m, 'streaming', secs), secs)
    expect(text(EQUITY_EXTENDED, at(9))).toBe("Morning. Market is open for pre-market trading. It'll open fully in 4 hours and 30 minutes.")
    expect(text(EQUITY_EXTENDED, at(21))).toBe("Evening. Market is open for post-market trading. It'll close in 3 hours.")
    expect(text(EQUITY_EXTENDED, at(14))).toBe("All's well, market is open. It'll go to post-market trading in 6 hours.")
    expect(text(EQUITY_EXTENDED, at(6))).toBe("Time for a walk, this market is closed. It'll open for pre-market trading in 2 hours.")
    expect(text(EQUITY, at(6))).toBe("Time for a walk, this market is closed. It'll open in 7 hours and 30 minutes.")
    expect(text(CME, at(21, 30))).toBe("Time for a walk, this market is closed. It'll open in 30 minutes.")
    const ext = model({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'extended', session: '0400-2000' }] })
    expect(marketStatusTitle(t, marketStatus(ext, 'streaming', at(9)))).toBe('Extended hours')
    expect(text(ext, at(9))).toBe("Market is open for extended-hours trading. It'll open fully in 4 hours and 30 minutes.")
    expect(text(ext, at(14))).toBe("All's well, market is open. It'll go to extended-hours trading in 6 hours.")
    expect(text(ext, at(21))).toBe("Market is open for extended-hours trading. It'll close in 3 hours.")
  })

  it('names each phase', () => {
    const at = (h: number) => utc(2026, 6, 13, h)
    expect(marketStatus(EQUITY_EXTENDED, 'streaming', at(9)).phase).toBe('pre')
    expect(marketStatusTitle(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(9)))).toBe('Pre-market')
    expect(marketStatusTitle(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(21)))).toBe('Post-market')
    expect(marketStatusTitle(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(6)))).toBe('Market closed')
  })

  it('reads straight from a resolved symbol, or answers null when its session cannot be read', () => {
    const symbol = { timezone: 'America/Chicago', session: '1700-1600:23456', sessionHolidays: undefined, dataStatus: 'streaming' as const }
    expect(marketStatusFor(symbol, now)?.state).toBe('open')
    expect(marketStatusFor({ ...symbol, session: 'nonsense' }, now)).toBeNull()
  })

  it('formats a countdown by its coarsest unit and the next one down', () => {
    expect(formatDuration(t, 30)).toBe('1 minute')
    expect(formatDuration(t, 5 * 60)).toBe('5 minutes')
    expect(formatDuration(t, 3600)).toBe('1 hour')
    expect(formatDuration(t, 3600 + 60)).toBe('1 hour and 1 minute')
    expect(formatDuration(t, 2 * 86_400 + 5 * 3600)).toBe('2 days and 5 hours')
    expect(formatDuration(t, 3 * 86_400)).toBe('3 days')
  })

  it('names the exchange zone with its offset in the footer', () => {
    expect(exchangeTimezoneText(t, 'America/Chicago', new Date(now * 1000))).toBe('Exchange timezone: Chicago (UTC-5)')
    expect(exchangeTimezoneText(t, 'Etc/UTC', new Date(now * 1000))).toBe('Exchange timezone: UTC')
  })
})

describe('an electronic day: the session string is the whole electronic trading day, the regular hours inside it', () => {
  // A futures exchange's day: the electronic day from 17:00 to 16:00, regular hours 08:30 to 15:15.
  const ES = model({
    timezone: 'America/Chicago',
    session: '1700-1600:23456',
    subsessions: [
      { id: 'regular', session: '0830-1515' },
      { id: 'premarket', session: '1700-0830' },
      { id: 'postmarket', session: '1515-1600' },
      { id: 'extended', session: '1700-1600' },
    ],
  })

  it('reads as electronic, with every stretch outside regular hours one extended stretch', () => {
    expect(ES.electronic).toBe(true)
    expect(ES.extended.map((stretch) => stretch.state)).toEqual(['extended', 'extended', 'extended'])
    expect(EQUITY_EXTENDED.electronic).toBe(false)
    expect(CME.electronic).toBe(false)
    expect(sessionStateAt(ES, utc(2026, 6, 13, 12, 0))).toBe('extended') // Monday 07:00 CDT
    expect(sessionStateAt(ES, utc(2026, 6, 13, 15, 0))).toBe('open') // 10:00 CDT
    expect(sessionStateAt(ES, utc(2026, 6, 13, 20, 30))).toBe('extended') // 15:30 CDT
    expect(sessionStateAt(ES, utc(2026, 6, 13, 21, 30))).toBe('closed') // 16:30 CDT, the daily break
    // The raw transitions still see regular hours end, which the bar filter and the bands read.
    expect(nextSessionChange(ES, utc(2026, 6, 13, 15, 0))).toEqual({ atSecs: utc(2026, 6, 13, 20, 15), state: 'extended' })
    const keep = subsessionBarFilter(ES, 'regular')!
    expect(keep(utc(2026, 6, 13, 12, 0))).toBe(false)
    expect(keep(utc(2026, 6, 13, 15, 0))).toBe(true)
  })

  it('reports the whole electronic day as open, counting down to its close', () => {
    const evening = utc(2026, 6, 14, 0, 4) // Monday 19:04 CDT
    const s = marketStatus(ES, 'streaming', evening)
    expect(s.state).toBe('open')
    expect(s.phase).toBe('open')
    expect(s.next).toEqual({ atSecs: utc(2026, 6, 14, 21, 0), state: 'closed', phase: 'closed' })
    expect(marketStatusText(t, s, evening)).toBe("All's well, market is open. It'll close in 20 hours and 56 minutes.")
    const afterRegular = utc(2026, 6, 13, 20, 30) // 15:30 CDT
    expect(marketStatusCountdown(t, marketStatus(ES, 'streaming', afterRegular), afterRegular)).toBe("It'll close in 30 minutes.")
    const tl = sessionTimeline(ES, utc(2026, 6, 13, 15, 0), 'en')
    expect(tl.segments).toEqual([
      { start: 0, end: 960, state: 'open' },
      { start: 960, end: 1020, state: 'closed' },
      { start: 1020, end: 1440, state: 'open' },
    ])
    expect([tl.before, tl.after]).toEqual(['open', 'open'])
  })

  it('offers its electronic and its regular trading hours', () => {
    expect(tradingHoursOptions(ES).map((option) => [option.hours, t(option.label), t(option.short)])).toEqual([
      ['extended', 'Electronic trading hours', 'ETH'],
      ['regular', 'Regular trading hours', 'RTH'],
    ])
    expect(tradingHoursOption(tradingHoursOptions(ES), 'allHours')?.hours).toBe('extended')
  })

  it('compares the two by the hours they state, so one week written two ways is a split day', () => {
    const split = model({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'regular', session: '0930-1600:23456' }, { id: 'premarket', session: '0400-0930' }] })
    expect(split.electronic).toBe(false)
    expect(sessionStateAt(split, utc(2026, 6, 13, 9, 0))).toBe('pre')
  })

  it('takes its session string as the electronic day when no extended subsession states one', () => {
    const bare = model({ timezone: 'America/Chicago', session: '1700-1600:23456', subsessions: [{ id: 'regular', session: '0830-1515' }] })
    expect(bare.electronic).toBe(true)
    expect(hasExtendedHours(bare)).toBe(true)
    expect(sessionStateAt(bare, utc(2026, 6, 13, 12, 0))).toBe('extended')
    expect(marketStatus(bare, 'streaming', utc(2026, 6, 13, 12, 0)).phase).toBe('open')
  })
})

describe('a split day that trades overnight', () => {
  const OVERNIGHT = model({
    timezone: 'America/New_York',
    session: '0930-1600',
    subsessions: [
      { id: 'regular', session: '0930-1600' },
      { id: 'premarket', session: '0400-0930' },
      { id: 'postmarket', session: '1600-2000' },
      { id: 'overnight', session: '2000-0400' },
    ],
  })
  const at = (d: number, h: number, min = 0) => utc(2026, 6, d, h, min)
  const text = (secs: number) => marketStatusText(t, marketStatus(OVERNIGHT, 'streaming', secs), secs)

  it('classifies the overnight stretch as extended and names it overnight', () => {
    expect(OVERNIGHT.electronic).toBe(false)
    const night = marketStatus(OVERNIGHT, 'streaming', at(13, 6)) // Monday 02:00 EDT
    expect(night.state).toBe('extended')
    expect(night.phase).toBe('overnight')
    expect(marketStatusTitle(t, night)).toBe('Overnight')
    expect(text(at(13, 6))).toBe('Hey there, night owl. Market is currently open for overnight trading. Pre-market will start in 2 hours.')
    expect(text(at(13, 21))).toBe('Evening. Market is open for post-market trading. Overnight trading will start in 3 hours.')
    expect(text(at(14, 0, 30))).toBe('Hey there, night owl. Market is currently open for overnight trading. Pre-market will start in 7 hours and 30 minutes.')
    // Friday's post-market is the week's last stretch; the week opens again on Sunday evening.
    expect(text(at(18, 1))).toBe("Time for a walk, this market is closed. It'll open in 1 day and 23 hours.")
  })

  it('offers 24 hours beside regular and extended hours; a split day without an overnight stretch does not', () => {
    expect(tradingHoursOptions(OVERNIGHT).map((option) => [option.hours, t(option.label), t(option.short)])).toEqual([
      ['regular', 'Regular', 'RTH'],
      ['extended', 'Extended', 'ETH'],
      ['allHours', '24 hours', '24H'],
    ])
    expect(tradingHoursOptions(EQUITY_EXTENDED).map((option) => option.hours)).toEqual(['regular', 'extended'])
    expect(tradingHoursOption(tradingHoursOptions(EQUITY_EXTENDED), 'allHours')?.hours).toBe('extended')
    expect(tradingHoursOption(tradingHoursOptions(OVERNIGHT), 'allHours')?.hours).toBe('allHours')
  })

  it('offers no choice for a continuous market or a symbol with one weekly session', () => {
    expect(tradingHoursOptions(PERP)).toEqual([])
    expect(tradingHoursOptions(CME)).toEqual([])
    expect(tradingHoursOptions(FX)).toEqual([])
    expect(tradingHoursOptions(null)).toEqual([])
    expect(tradingHoursOption([], 'regular')).toBeNull()
  })
})

describe('a holiday', () => {
  const HOL = model({
    timezone: 'America/New_York',
    session: '0930-1600',
    sessionHolidays: '20261126',
    subsessions: [
      { id: 'regular', session: '0930-1600' },
      { id: 'premarket', session: '0400-0930' },
      { id: 'postmarket', session: '1600-2000' },
    ],
  })

  it('reads a closed trading day the symbol lists as a holiday, counting down to the next session', () => {
    const noon = utc(2026, 10, 26, 15, 0) // Thanksgiving 10:00 EST
    const s = marketStatus(HOL, 'streaming', noon)
    expect(s.state).toBe('closed')
    expect(s.holiday).toBe(true)
    expect(s.phase).toBe('holiday')
    expect(marketStatusTitle(t, s)).toBe('Holiday')
    expect(marketStatusText(t, s, noon)).toBe("Market is currently on holiday. Lucky them. It'll open for pre-market trading in 18 hours.")
    expect(marketStatus(HOL, 'streaming', utc(2026, 10, 26, 8, 0)).phase).toBe('holiday') // 03:00 EST, the holiday's own date
    expect(marketStatus(HOL, 'streaming', utc(2026, 10, 26, 3, 0)).phase).toBe('closed') // Nov 25 22:00 EST
  })

  it('carries a holiday into the evening its trading day opens on, and yields to a correction', () => {
    const cme = model({ timezone: 'America/Chicago', session: '1700-1600:23456', sessionHolidays: '20260101' })
    expect(marketStatus(cme, 'streaming', utc(2026, 0, 1, 0, 0)).phase).toBe('holiday') // Dec 31 18:00 CST, trading day Jan 1
    expect(marketStatus(cme, 'streaming', utc(2025, 11, 31, 22, 30)).phase).toBe('closed') // Dec 31 16:30 CST, the daily break
    const corrected = model({ timezone: 'America/Chicago', session: '1700-1600:23456', sessionHolidays: '20260101', corrections: '1700-0000:20260101' })
    const late = marketStatus(corrected, 'streaming', utc(2026, 0, 1, 7, 0)) // Jan 1 01:00 CST: closed by the correction
    expect(late.state).toBe('closed')
    expect(late.holiday).toBe(false)
  })
})

describe('the timeline edges', () => {
  it('states the minute before the day and the minute after it', () => {
    const monday = sessionTimeline(EQUITY_EXTENDED, utc(2026, 6, 13, 14, 0), 'en')
    expect([monday.before, monday.after]).toEqual(['closed', 'closed'])
    const perp = sessionTimeline(PERP, utc(2026, 6, 13, 14, 0), 'en')
    expect([perp.before, perp.after]).toEqual(['open', 'open'])
  })
})

describe('the served equity shape: regular, extended, premarket and postmarket with early-close corrections', () => {
  // A feed serves an equity exactly like this (regular equals the weekly session, its
  // corrections equal the symbol's, and every subsession that closes early names the day).
  const EQUITY_SERVED = model({
    timezone: 'America/New_York',
    session: '0930-1600',
    sessionHolidays: '20261126',
    corrections: '0930-1300:20261127,20261224',
    subsessions: [
      { id: 'regular', session: '0930-1600', sessionCorrections: '0930-1300:20261127,20261224' },
      { id: 'extended', session: '0400-2000', sessionCorrections: '0400-1700:20261127,20261224' },
      { id: 'premarket', session: '0400-0930' },
      { id: 'postmarket', session: '1600-2000', sessionCorrections: '1300-1700:20261127,20261224' },
    ],
  })

  it('classifies a full day as pre, open, after and closed', () => {
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 7, 59))).toBe('closed') // 03:59 EDT
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 8, 0))).toBe('pre') // 04:00 EDT
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 13, 29))).toBe('pre')
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 13, 30))).toBe('open') // 09:30 EDT
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 19, 59))).toBe('open')
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 20, 0))).toBe('after') // 16:00 EDT
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 13, 23, 59))).toBe('after')
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 14, 0, 0))).toBe('closed') // 20:00 EDT
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 6, 18, 14, 0))).toBe('closed') // Saturday
  })

  it('a holiday closes every subsession; an early close shortens each by its own correction', () => {
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 26, 15, 0))).toBe('closed') // Thanksgiving 10:00 EST
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 26, 10, 0))).toBe('closed') // 05:00 EST: no pre-market on a holiday
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 27, 10, 0))).toBe('pre') // Nov 27 05:00 EST
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 27, 17, 30))).toBe('open') // 12:30 EST
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 27, 18, 0))).toBe('after') // 13:00 EST: the corrected close
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 27, 21, 59))).toBe('after') // 16:59 EST
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 10, 27, 22, 0))).toBe('closed') // 17:00 EST: the corrected post-market close
    expect(sessionStateAt(EQUITY_SERVED, utc(2026, 11, 24, 18, 0))).toBe('after') // Dec 24 13:00 EST
  })

  it('counts down through the subsessions and draws the day', () => {
    expect(nextSessionChange(EQUITY_SERVED, utc(2026, 6, 13, 8, 0))).toEqual({ atSecs: utc(2026, 6, 13, 13, 30), state: 'open' })
    expect(nextSessionChange(EQUITY_SERVED, utc(2026, 10, 27, 17, 30))).toEqual({ atSecs: utc(2026, 10, 27, 18, 0), state: 'after' })
    expect(sessionTimeline(EQUITY_SERVED, utc(2026, 10, 27, 17, 30), 'en').segments).toEqual([
      { start: 0, end: 240, state: 'closed' },
      { start: 240, end: 570, state: 'pre' },
      { start: 570, end: 780, state: 'open' },
      { start: 780, end: 1020, state: 'after' },
      { start: 1020, end: 1440, state: 'closed' },
    ])
  })

  it('the regular subsession states the regular hours and its own corrections take precedence over the symbol level', () => {
    const m = model({
      timezone: 'America/New_York',
      session: '0930-1600',
      corrections: '0930-1200:20261127',
      subsessions: [{ id: 'regular', session: '0930-1600', sessionCorrections: '0930-1300:20261127' }],
    })
    expect(sessionStateAt(m, utc(2026, 10, 27, 17, 30))).toBe('open') // 12:30 EST: the subsession's 13:00 close, not the symbol's 12:00
  })
})

describe('the active subsession', () => {
  const EQUITY_EXT = model({
    timezone: 'America/New_York',
    session: '0930-1600',
    subsessions: [
      { id: 'regular', session: '0930-1600' },
      { id: 'extended', session: '0400-2000' },
      { id: 'premarket', session: '0400-0930' },
      { id: 'postmarket', session: '1600-2000' },
    ],
  })

  it('defaults to showing EVERY bar, and only a symbol with extended hours has anything to choose', () => {
    // Narrowing to regular hours is the opt-in. A chart that hid bars it had been served by
    // default would be understating the market before anyone asked it to.
    expect(DEFAULT_SUBSESSION).toBe('extended')
    expect(hasExtendedHours(EQUITY_EXT)).toBe(true)
    expect(hasExtendedHours(CME)).toBe(false)
    expect(hasExtendedHours(PERP)).toBe(false)
  })

  it('filters bars to regular hours under regular, and filters nothing under extended or without extended hours', () => {
    const keep = subsessionBarFilter(EQUITY_EXT, 'regular')!
    expect(keep).toBeTypeOf('function')
    expect(keep(utc(2026, 6, 13, 9, 0))).toBe(false) // 05:00 EDT, pre-market
    expect(keep(utc(2026, 6, 13, 14, 0))).toBe(true) // 10:00 EDT
    expect(keep(utc(2026, 6, 13, 21, 0))).toBe(false) // 17:00 EDT, after-hours
    expect(subsessionBarFilter(EQUITY_EXT, 'extended')).toBeNull()
    expect(subsessionBarFilter(CME, 'regular')).toBeNull()
    expect(subsessionBarFilter(PERP, 'regular')).toBeNull()
  })
})
