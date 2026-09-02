// The session model built from a symbol's own session metadata: the reference grammar (weekday
// sessions, overnight starts, previous-day markers, per-day alternatives, multiple stretches),
// holidays, corrections, subsessions, and the state, next-change, timeline and market-status
// answers over it. Every expectation pins a concrete UTC epoch against an exchange-local wall
// time in BOTH DST regimes, so a grammar bug or a broken zone conversion fails loudly.
import { describe, expect, it } from 'vitest'
import { createChartI18n } from '../src/i18n'
import {
  exchangeTimezoneText,
  formatDuration,
  marketStatus,
  marketStatusFor,
  marketStatusText,
  marketStatusTitle,
  nextSessionChange,
  parseSessionModel,
  sessionStateAt,
  sessionTimeline,
  type SessionModel,
} from '../src/sessionModel'

const utc = (y: number, m0: number, d: number, h = 0, min = 0) => Date.UTC(y, m0, d, h, min) / 1000
const t = createChartI18n().t
const model = (source: Parameters<typeof parseSessionModel>[0]): SessionModel => {
  const m = parseSessionModel(source)
  if (!m) throw new Error(`unreadable session ${JSON.stringify(source)}`)
  return m
}

// The served shapes (the engine's symbol info): CME Globex, US equities, spot FX, a perp.
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

  it('reads the reference forms: alternatives per day, several stretches, previous-day markers, past-midnight ends, a first-day marker', () => {
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

  it("reads the reference's own corrections example with previous-day markers", () => {
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
    expect(s).toEqual({ state: 'open', dataStatus: 'streaming', continuous: false, next: { atSecs: utc(2026, 6, 13, 21, 0), state: 'closed' } })
    expect(marketStatusTitle(t, s)).toBe('Market open')
    expect(marketStatusText(t, s, now)).toBe('Market is open for regular trading. Closes in 6 hours.')
  })

  it('an end-of-day feed is its own state, never an open market', () => {
    const s = marketStatus(CME, 'endofday', now)
    expect(marketStatusTitle(t, s)).toBe('End of day')
    expect(marketStatusText(t, s, now)).toBe('Prices update once a day, after the session closes.')
  })

  it('a delayed stream says so beside the session sentence', () => {
    const s = marketStatus(CME, 'delayed_streaming', now)
    expect(s.dataStatus).toBe('delayed_streaming')
    expect(marketStatusText(t, s, now)).toBe('Market is open for regular trading. Closes in 6 hours. Prices are delayed.')
  })

  it('a continuous market never closes', () => {
    const s = marketStatus(PERP, 'streaming', now)
    expect(marketStatusTitle(t, s)).toBe('Open 24/7')
    expect(marketStatusText(t, s, now)).toBe('This market trades around the clock and never closes.')
  })

  it('writes every session sentence', () => {
    const at = (h: number, min = 0) => utc(2026, 6, 13, h, min)
    expect(marketStatusText(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(9)), at(9))).toBe('Market is open for pre-market trading. Regular hours start in 4 hours 30 minutes.')
    expect(marketStatusText(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(21)), at(21))).toBe('Market is open for after-hours trading. Ends in 3 hours.')
    expect(marketStatusText(t, marketStatus(EQUITY_EXTENDED, 'streaming', at(6)), at(6))).toBe('Market is closed. Pre-market starts in 2 hours.')
    expect(marketStatusText(t, marketStatus(EQUITY, 'streaming', at(6)), at(6))).toBe('Market is closed. Opens in 7 hours 30 minutes.')
    expect(marketStatusText(t, marketStatus(CME, 'streaming', utc(2026, 6, 13, 21, 30)), utc(2026, 6, 13, 21, 30))).toBe('Market is closed. Opens in 30 minutes.')
    const ext = model({ timezone: 'America/New_York', session: '0930-1600', subsessions: [{ id: 'extended', session: '0400-2000' }] })
    expect(marketStatusText(t, marketStatus(ext, 'streaming', at(9)), at(9))).toBe('Market is open for extended-hours trading. Regular hours start in 4 hours 30 minutes.')
    expect(marketStatusText(t, marketStatus(ext, 'streaming', at(21)), at(21))).toBe('Market is open for extended-hours trading. Closes in 3 hours.')
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
    expect(formatDuration(t, 3600 + 60)).toBe('1 hour 1 minute')
    expect(formatDuration(t, 2 * 86_400 + 5 * 3600)).toBe('2 days 5 hours')
    expect(formatDuration(t, 3 * 86_400)).toBe('3 days')
  })

  it('names the exchange zone with its offset in the footer', () => {
    expect(exchangeTimezoneText(t, 'America/Chicago', new Date(now * 1000))).toBe('Exchange timezone: Chicago (UTC-5)')
    expect(exchangeTimezoneText(t, 'Etc/UTC', new Date(now * 1000))).toBe('Exchange timezone: UTC')
  })
})
