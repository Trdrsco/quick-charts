import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createSessionBands,
  exchangeZoneOf,
  knownMarketKind,
  marketKindOf,
  nextSessionChange,
  sessionOf,
  sessionTimeline,
  setHolidayCalendar,
} from '../src/sessions'

// All expectations pin concrete UTC epochs against exchange-local wall times, in BOTH DST regimes
// (July = EDT/CDT, January = EST/CST), so a session bug or a broken tz conversion fails loudly.

const utc = (y: number, m0: number, d: number, h: number, min = 0) => Date.UTC(y, m0, d, h, min) / 1000

describe('marketKindOf — the session model for a symbol', () => {
  it('falls back to the catalog vocabulary when the feed states no class', () => {
    expect(marketKindOf('crypto')).toBe('crypto')
    expect(marketKindOf('equity')).toBe('equity')
    expect(marketKindOf('fx')).toBe('fx')
    expect(marketKindOf('metal')).toBe('fx')
    expect(marketKindOf('rates')).toBe('fx')
    expect(marketKindOf('commodity')).toBe('fx')
    expect(marketKindOf('future')).toBe('futures')
    expect(marketKindOf('anything-else')).toBe('futures')
    expect(marketKindOf('future', null)).toBe('futures') // an explicit "feed didn't say"
  })

  it("the SERVED class wins over the display type — only the feed knows a symbol's real hours", () => {
    // The case the guess cannot get right: an equity-typed row on a 24/7 venue.
    expect(marketKindOf('equity', 'crypto')).toBe('crypto')
    expect(marketKindOf('future', 'fx')).toBe('fx')
    expect(marketKindOf('crypto', 'equity')).toBe('equity')
  })
})

describe('sessionOf — equity (New York)', () => {
  it('classifies a summer Monday: pre 04:00, open 09:30 (inclusive), after 16:00, closed 20:00', () => {
    // Mon 2026-07-20, EDT = UTC-4
    expect(sessionOf(utc(2026, 6, 20, 8, 0), 'equity')).toBe('pre') // 04:00 ET
    expect(sessionOf(utc(2026, 6, 20, 13, 29), 'equity')).toBe('pre') // 09:29 ET
    expect(sessionOf(utc(2026, 6, 20, 13, 30), 'equity')).toBe('open') // 09:30 ET
    expect(sessionOf(utc(2026, 6, 20, 19, 59), 'equity')).toBe('open') // 15:59 ET
    expect(sessionOf(utc(2026, 6, 20, 20, 0), 'equity')).toBe('after') // 16:00 ET
    expect(sessionOf(utc(2026, 6, 21, 0, 0), 'equity')).toBe('closed') // 20:00 ET
  })
  it('classifies a winter Monday under EST (UTC-5)', () => {
    // Mon 2026-01-05
    expect(sessionOf(utc(2026, 0, 5, 14, 30), 'equity')).toBe('open') // 09:30 ET
    expect(sessionOf(utc(2026, 0, 5, 9, 0), 'equity')).toBe('pre') // 04:00 ET
  })
  it('weekends are closed', () => {
    expect(sessionOf(utc(2026, 6, 18, 15, 0), 'equity')).toBe('closed') // Saturday
    expect(sessionOf(utc(2026, 6, 19, 15, 0), 'equity')).toBe('closed') // Sunday
  })
})

describe('sessionOf — futures (CME Globex, Chicago; TradingView ETH/RTH split)', () => {
  it('RTH is 08:30–15:15 CT; the rest of the electronic day classifies eth', () => {
    // Mon 2026-07-20, CDT = UTC-5
    expect(sessionOf(utc(2026, 6, 20, 13, 29), 'futures')).toBe('eth') // 08:29 CT
    expect(sessionOf(utc(2026, 6, 20, 13, 30), 'futures')).toBe('open') // 08:30 CT — RTH opens
    expect(sessionOf(utc(2026, 6, 20, 14, 0), 'futures')).toBe('open') // 09:00 CT
    expect(sessionOf(utc(2026, 6, 20, 20, 14), 'futures')).toBe('open') // 15:14 CT
    expect(sessionOf(utc(2026, 6, 20, 20, 15), 'futures')).toBe('eth') // 15:15 CT — RTH closes
    expect(sessionOf(utc(2026, 6, 20, 21, 30), 'futures')).toBe('closed') // 16:30 CT maintenance
    expect(sessionOf(utc(2026, 6, 20, 22, 30), 'futures')).toBe('eth') // 17:30 CT evening session
    expect(sessionOf(utc(2026, 6, 21, 3, 0), 'futures')).toBe('eth') // 22:00 CT overnight
  })
  it('closes Friday 16:00 CT and reopens (electronic) Sunday 17:00 CT', () => {
    expect(sessionOf(utc(2026, 6, 17, 20, 59), 'futures')).toBe('eth') // Fri 15:59 CT post-RTH
    expect(sessionOf(utc(2026, 6, 17, 21, 30), 'futures')).toBe('closed') // Fri 16:30 CT
    expect(sessionOf(utc(2026, 6, 18, 15, 0), 'futures')).toBe('closed') // Saturday
    expect(sessionOf(utc(2026, 6, 19, 21, 59), 'futures')).toBe('closed') // Sun 16:59 CT
    expect(sessionOf(utc(2026, 6, 19, 22, 0), 'futures')).toBe('eth') // Sun 17:00 CT
  })
})

describe('sessionOf — fx (24/5, New York) and crypto (24/7)', () => {
  it('fx runs Sunday 17:00 ET through Friday 17:00 ET', () => {
    expect(sessionOf(utc(2026, 6, 19, 20, 59), 'fx')).toBe('closed') // Sun 16:59 ET
    expect(sessionOf(utc(2026, 6, 19, 21, 0), 'fx')).toBe('open') // Sun 17:00 ET
    expect(sessionOf(utc(2026, 6, 22, 3, 0), 'fx')).toBe('open') // mid-week overnight
    expect(sessionOf(utc(2026, 6, 17, 21, 30), 'fx')).toBe('closed') // Fri 17:30 ET
  })
  it('crypto never closes', () => {
    expect(sessionOf(utc(2026, 6, 18, 3, 0), 'crypto')).toBe('open') // Saturday night
    expect(sessionOf(utc(2026, 0, 1, 0, 0), 'crypto')).toBe('open')
  })
})

describe('nextSessionChange — exact to the minute across day rolls', () => {
  it('equity: after-hours ends at 20:00 ET', () => {
    const next = nextSessionChange(utc(2026, 6, 20, 21, 0), 'equity') // Mon 17:00 ET
    expect(next).toEqual({ atSecs: utc(2026, 6, 21, 0, 0), session: 'closed' }) // 20:00 ET
  })
  it('equity: a Saturday rolls to Monday pre-market 04:00 ET', () => {
    const next = nextSessionChange(utc(2026, 6, 18, 15, 0), 'equity')
    expect(next).toEqual({ atSecs: utc(2026, 6, 20, 8, 0), session: 'pre' })
  })
  it('futures: the weekend rolls to the Sunday 17:00 CT electronic open', () => {
    const next = nextSessionChange(utc(2026, 6, 18, 12, 0), 'futures')
    expect(next).toEqual({ atSecs: utc(2026, 6, 19, 22, 0), session: 'eth' })
  })
  it('futures: an RTH Monday morning rolls to the 15:15 CT electronic close', () => {
    const next = nextSessionChange(utc(2026, 6, 20, 14, 0), 'futures') // 09:00 CT
    expect(next).toEqual({ atSecs: utc(2026, 6, 20, 20, 15), session: 'eth' }) // 15:15 CT
  })
  it('crypto never transitions', () => {
    expect(nextSessionChange(utc(2026, 6, 20, 14, 0), 'crypto')).toBeNull()
  })
})

// The holiday behavior tests drive the SAME exchange-published dates the engine now serves, through
// the registry a datafeed resolve populates — the session MATH is this package's contract; the DATA
// truth is tested engine-side where the calendar lives. Fixtures mirror the served shapes exactly.
const FUT_FIXTURE = {
  holidays: {
    '2026-01-01': [{ start: 17 * 60, end: 1440, session: 'eth' as const }],
    '2026-01-19': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 720, session: 'open' as const },
      { start: 1020, end: 1440, session: 'eth' as const },
    ],
    '2026-04-02': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 915, session: 'open' as const },
      { start: 915, end: 960, session: 'eth' as const },
    ],
    '2026-04-03': [],
    '2026-07-03': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 720, session: 'open' as const },
    ],
    '2026-11-26': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 720, session: 'open' as const },
      { start: 1020, end: 1440, session: 'eth' as const },
    ],
    '2026-11-27': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 735, session: 'open' as const },
    ],
    '2026-12-25': [],
    '2026-12-31': [
      { start: 0, end: 510, session: 'eth' as const },
      { start: 510, end: 915, session: 'open' as const },
      { start: 915, end: 960, session: 'eth' as const },
    ],
    '2027-01-01': [],
  },
  coverageThrough: '2027-01-01',
}
const EQ_FIXTURE = {
  holidays: {
    '2026-06-19': [],
    '2026-07-03': [],
    '2026-11-26': [],
    '2026-11-27': [
      { start: 240, end: 570, session: 'pre' as const },
      { start: 570, end: 780, session: 'open' as const },
      { start: 780, end: 1020, session: 'after' as const },
    ],
    '2026-12-24': [
      { start: 240, end: 570, session: 'pre' as const },
      { start: 570, end: 780, session: 'open' as const },
      { start: 780, end: 1020, session: 'after' as const },
    ],
    '2026-12-25': [],
    '2027-03-26': [],
  },
  coverageThrough: '2027-12-31',
}
beforeAll(() => {
  setHolidayCalendar('futures', FUT_FIXTURE)
  setHolidayCalendar('equity', EQ_FIXTURE)
})
afterAll(() => {
  setHolidayCalendar('futures', null)
  setHolidayCalendar('equity', null)
})

describe('holiday overrides — futures (CME equity-index 2026, served-calendar shapes)', () => {
  it('Good Friday 2026-04-03 is dark all day (a weekday rule alone would trade it)', () => {
    // Fri, CDT = UTC-5
    expect(sessionOf(utc(2026, 3, 3, 15, 0), 'futures')).toBe('closed') // 10:00 CT
    expect(sessionOf(utc(2026, 3, 3, 22, 30), 'futures')).toBe('closed') // 17:30 CT — no evening either
  })
  it('a Monday holiday (MLK, CST regime) halts at 12:00 CT and reopens 17:00 CT the same evening', () => {
    expect(sessionOf(utc(2026, 0, 19, 17, 59), 'futures')).toBe('open') // 11:59 CT
    expect(sessionOf(utc(2026, 0, 19, 18, 0), 'futures')).toBe('closed') // 12:00 CT — the halt
    expect(sessionOf(utc(2026, 0, 19, 23, 30), 'futures')).toBe('eth') // 17:30 CT — the reopen
  })
  it('a Friday holiday halt (Jul 3, CDT regime) has NO evening reopen — Sunday is next', () => {
    expect(sessionOf(utc(2026, 6, 3, 16, 0), 'futures')).toBe('open') // 11:00 CT
    expect(sessionOf(utc(2026, 6, 3, 17, 30), 'futures')).toBe('closed') // 12:30 CT
    expect(sessionOf(utc(2026, 6, 3, 22, 30), 'futures')).toBe('closed') // 17:30 CT
  })
  it('Black Friday closes early at 12:15 CT', () => {
    expect(sessionOf(utc(2026, 10, 27, 18, 10), 'futures')).toBe('open') // 12:10 CT
    expect(sessionOf(utc(2026, 10, 27, 18, 20), 'futures')).toBe('closed') // 12:20 CT
  })
  it("the day BEFORE a dark Friday trades its day session but its evening never opens (the evening belongs to the dark trade date)", () => {
    // Thu 2026-04-02, ahead of Good Friday
    expect(sessionOf(utc(2026, 3, 2, 15, 0), 'futures')).toBe('open') // 10:00 CT — day session intact
    expect(sessionOf(utc(2026, 3, 2, 22, 30), 'futures')).toBe('closed') // 17:30 CT — a plain Thursday says eth
    // New Year's Eve 2026 ahead of the Jan 1 2027 closure
    expect(sessionOf(utc(2026, 11, 31, 16, 0), 'futures')).toBe('open') // 10:00 CT
    expect(sessionOf(utc(2026, 11, 31, 23, 30), 'futures')).toBe('closed') // 17:30 CT
  })
  it("a Thursday New Year's Day is dark but reopens 17:00 CT for Friday's session", () => {
    expect(sessionOf(utc(2026, 0, 1, 16, 0), 'futures')).toBe('closed') // 10:00 CT
    expect(sessionOf(utc(2026, 0, 1, 23, 30), 'futures')).toBe('eth') // 17:30 CT
    expect(sessionOf(utc(2027, 0, 1, 16, 0), 'futures')).toBe('closed') // Jan 1 2027 — the one 2027 futures date
  })
  it('a date outside the published tables falls back to the weekday rules — honestly uncorrected', () => {
    // Christmas 2030 (a Wednesday): no CME calendar exists that far out, so the weekday rules answer.
    expect(sessionOf(utc(2030, 11, 25, 16, 0), 'futures')).toBe('open') // 10:00 CT
  })
})

describe('holiday overrides — equity (NYSE 2026–2027, exchange-published)', () => {
  it('full closures are dark: Christmas 2026 (EST), Juneteenth 2026 (EDT), Good Friday 2027 (EDT)', () => {
    expect(sessionOf(utc(2026, 11, 25, 15, 0), 'equity')).toBe('closed') // 10:00 ET
    expect(sessionOf(utc(2026, 5, 19, 14, 0), 'equity')).toBe('closed') // 10:00 ET
    expect(sessionOf(utc(2027, 2, 26, 14, 0), 'equity')).toBe('closed') // 10:00 ET
  })
  it('Independence Day 2026 is OBSERVED Friday Jul 3 as a FULL closure (Jul 4 is a Saturday) — not an early close', () => {
    expect(sessionOf(utc(2026, 6, 3, 14, 0), 'equity')).toBe('closed') // 10:00 ET
  })
  it('Christmas Eve 2026 closes at 13:00 ET; late trading still ends 17:00 ET', () => {
    expect(sessionOf(utc(2026, 11, 24, 17, 59), 'equity')).toBe('open') // 12:59 ET
    expect(sessionOf(utc(2026, 11, 24, 18, 0), 'equity')).toBe('after') // 13:00 ET
    expect(sessionOf(utc(2026, 11, 24, 22, 0), 'equity')).toBe('closed') // 17:00 ET
  })
})

describe('holiday overrides — transitions and the timeline', () => {
  it("futures: Christmas Friday's next transition is the Sunday 17:00 CT electronic open, 2.5 dark days later", () => {
    const next = nextSessionChange(utc(2026, 11, 25, 16, 0), 'futures')
    expect(next).toEqual({ atSecs: utc(2026, 11, 27, 23, 0), session: 'eth' })
  })
  it("equity: Thanksgiving Thursday rolls to Black Friday's 04:00 ET pre-market", () => {
    const next = nextSessionChange(utc(2026, 10, 26, 15, 0), 'equity')
    expect(next).toEqual({ atSecs: utc(2026, 10, 27, 9, 0), session: 'pre' })
  })
  it('the Market Status timeline renders a dark holiday as one closed day', () => {
    const tl = sessionTimeline(utc(2026, 11, 25, 16, 0), 'futures')
    expect(tl.dayLabel).toBe('FRI')
    expect(tl.segments).toEqual([{ start: 0, end: 1440, session: 'closed' }])
  })
  it('the timeline renders an early-close day with the shortened regular session', () => {
    const tl = sessionTimeline(utc(2026, 11, 24, 15, 0), 'equity') // 10:00 ET Christmas Eve
    expect(tl.segments).toEqual([
      { start: 0, end: 240, session: 'closed' },
      { start: 240, end: 570, session: 'pre' },
      { start: 570, end: 780, session: 'open' },
      { start: 780, end: 1020, session: 'after' },
      { start: 1020, end: 1440, session: 'closed' },
    ])
  })
})

describe('sessionTimeline — the exchange-local day, gaps included', () => {
  it('equity Monday: closed | pre | open | after | closed', () => {
    const tl = sessionTimeline(utc(2026, 6, 20, 14, 0), 'equity')
    expect(tl.dayLabel).toBe('MON')
    expect(tl.tzCity).toBe('New York')
    expect(tl.segments).toEqual([
      { start: 0, end: 240, session: 'closed' },
      { start: 240, end: 570, session: 'pre' },
      { start: 570, end: 960, session: 'open' },
      { start: 960, end: 1200, session: 'after' },
      { start: 1200, end: 1440, session: 'closed' },
    ])
    expect(tl.nowMins).toBe(600) // 10:00 ET
  })
  it('futures Monday: eth | RTH | eth | maintenance | eth', () => {
    const tl = sessionTimeline(utc(2026, 6, 20, 14, 0), 'futures')
    expect(tl.tzCity).toBe('Chicago')
    expect(tl.segments).toEqual([
      { start: 0, end: 510, session: 'eth' },
      { start: 510, end: 915, session: 'open' },
      { start: 915, end: 960, session: 'eth' },
      { start: 960, end: 1020, session: 'closed' },
      { start: 1020, end: 1440, session: 'eth' },
    ])
  })
  it('crypto: one open segment, every day', () => {
    const tl = sessionTimeline(utc(2026, 6, 18, 3, 0), 'crypto')
    expect(tl.segments).toEqual([{ start: 0, end: 1440, session: 'open' }])
    expect(tl.tzCity).toBe('UTC')
  })
})

describe('knownMarketKind — the honest sibling: null when the model is not actually known', () => {
  it('classifies enumerated display types without a served class', () => {
    expect(knownMarketKind('future', null)).toBe('futures')
    expect(knownMarketKind('crypto', null)).toBe('crypto')
    expect(knownMarketKind('metal', null)).toBe('fx')
  })
  it('returns null for an absent or unrecognized display type', () => {
    expect(knownMarketKind(null, null)).toBeNull()
    expect(knownMarketKind(undefined, null)).toBeNull()
    expect(knownMarketKind('index-thing', null)).toBeNull()
  })
  it("a served 'futures' on an unrecognized type reads as unknown — indistinguishable from the wire's catch-all default", () => {
    expect(knownMarketKind('index-thing', 'futures')).toBeNull()
    expect(knownMarketKind('future', 'futures')).toBe('futures') // enumerated type: the served value is a real claim
  })
  it('any served class OTHER than futures is always a real claim', () => {
    expect(knownMarketKind('index-thing', 'crypto')).toBe('crypto')
    expect(knownMarketKind(null, 'fx')).toBe('fx')
  })
})

describe('session math survives a kind from outside the union (decoded storage, a newer wire)', () => {
  const bogus = 'nonsense' as never
  it('classifies closed instead of throwing, everywhere', () => {
    expect(sessionOf(Date.UTC(2026, 6, 15, 12) / 1000, bogus)).toBe('closed')
    expect(nextSessionChange(Date.UTC(2026, 6, 15, 12) / 1000, bogus)).toBeNull()
    expect(sessionTimeline(Date.UTC(2026, 6, 15, 12) / 1000, bogus).tzCity).toBe('UTC')
    expect(exchangeZoneOf(bogus)).toEqual({ tz: 'Etc/UTC', city: 'UTC' })
  })
})

describe('createSessionBands — an unknown model draws NOTHING (the promise the README makes)', () => {
  const fakeChart = { timeScale: () => ({ getVisibleRange: () => ({ from: 0, to: 10_000 }), options: () => ({ barSpacing: 6 }), timeToCoordinate: () => 10 }) }
  const bars = [
    { time: Date.UTC(2026, 6, 15, 2) / 1000, close: 1 }, // 21:00 CT prior day — eth
    { time: Date.UTC(2026, 6, 15, 15) / 1000, close: 1 }, // 10:00 CT — open
  ]
  const fakeSeries = { data: () => bars }
  const draw = (kind: ReturnType<typeof knownMarketKind>) => {
    const prim = createSessionBands(fakeChart as never, fakeSeries as never, () => true, () => kind, () => true)
    const view = prim.paneViews()[0] as { renderer: () => { draw: (t: unknown) => void } }
    const useBitmap = vi.fn()
    view.renderer().draw({ useBitmapCoordinateSpace: useBitmap })
    return useBitmap
  }
  it('null: the renderer never enters the canvas', () => {
    expect(draw(null)).not.toHaveBeenCalled()
  })
  it('crypto: never bands', () => {
    expect(draw('crypto')).not.toHaveBeenCalled()
  })
  it('futures with bars: paints', () => {
    expect(draw('futures')).toHaveBeenCalledTimes(1)
  })
  it('refresh() is safe detached and forwards to requestUpdate once attached', () => {
    const prim = createSessionBands(fakeChart as never, fakeSeries as never, () => true, () => 'futures', () => true)
    expect(() => prim.refresh()).not.toThrow()
    const requestUpdate = vi.fn()
    prim.attached({ requestUpdate })
    prim.refresh()
    expect(requestUpdate).toHaveBeenCalledTimes(1)
    prim.detached()
    prim.refresh()
    expect(requestUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('the served-calendar registry', () => {
  it('an unregistered class follows the weekday rules — no bundled calendar exists to go stale', () => {
    // fx never registers; Christmas 2026 (a Friday) trades by fx weekday rules, uncorrected.
    expect(sessionOf(utc(2026, 11, 25, 15, 0), 'fx')).toBe('open')
  })
  it('clearing a calendar returns the class to its weekday rules', () => {
    setHolidayCalendar('futures', null)
    expect(sessionOf(utc(2026, 11, 25, 16, 0), 'futures')).toBe('open') // Christmas Friday, weekday rules
    setHolidayCalendar('futures', FUT_FIXTURE)
    expect(sessionOf(utc(2026, 11, 25, 16, 0), 'futures')).toBe('closed')
  })
  // The 90-day coverage tripwire lives ENGINE-SIDE (packages/instruments session-calendar.test.ts),
  // where the calendar data lives and where the annual fix is a data edit + deploy — deliberately
  // not here: a client gate would re-create the client-release obligation the served model removes.
})
