// The display timezones: the 60-zone registry, the exchange choice, offsets in both DST regimes,
// and the locale-keyed formatters that put a zone on the axis, the crosshair and a clock.
import { TickMarkType } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { createChartI18n } from '../src/i18n'
import {
  DEFAULT_TIMEZONE,
  EXCHANGE_TIMEZONE,
  formatClock,
  isTimezoneChoice,
  makeCrosshairTimeFormatter,
  makeTickMarkFormatter,
  resolveDisplayTimezone,
  timezoneCity,
  timezoneLabel,
  timezoneListing,
  TIMEZONES,
  tzOffsetLabel,
  tzOffsetMinutes,
  zoneClock,
} from '../src/timezones'

const utc = (y: number, m0: number, d: number, h = 0, min = 0, s = 0) => new Date(Date.UTC(y, m0, d, h, min, s))
const t = createChartI18n().t

describe('the registry', () => {
  it('lists 60 zones, UTC first, no id twice, every one an IANA id Intl accepts', () => {
    expect(TIMEZONES).toHaveLength(60)
    expect(TIMEZONES[0]).toEqual({ id: 'Etc/UTC', city: 'UTC' })
    expect(new Set(TIMEZONES.map((z) => z.id)).size).toBe(60)
    for (const z of TIMEZONES) expect(() => new Intl.DateTimeFormat(undefined, { timeZone: z.id }), z.id).not.toThrow()
  })

  it('accepts a listed id or the exchange choice, nothing else', () => {
    expect(isTimezoneChoice('America/New_York')).toBe(true)
    expect(isTimezoneChoice(EXCHANGE_TIMEZONE)).toBe(true)
    expect(isTimezoneChoice('Mars/Olympus')).toBe(false)
    expect(isTimezoneChoice('')).toBe(false)
    expect(DEFAULT_TIMEZONE).toBe('Etc/UTC')
  })

  it('names a listed zone by its city and an unlisted one by its id', () => {
    expect(timezoneCity('America/Chicago')).toBe('Chicago')
    expect(timezoneCity('Europe/Vienna')).toBe('Europe/Vienna')
  })
})

describe('resolveDisplayTimezone', () => {
  it('returns a zone choice as itself', () => {
    expect(resolveDisplayTimezone('Asia/Tokyo', null)).toBe('Asia/Tokyo')
  })

  it("resolves the exchange choice from the symbol's own timezone, and to null without a symbol", () => {
    expect(resolveDisplayTimezone(EXCHANGE_TIMEZONE, { timezone: 'America/Chicago' })).toBe('America/Chicago')
    expect(resolveDisplayTimezone(EXCHANGE_TIMEZONE, null)).toBeNull()
    expect(resolveDisplayTimezone(EXCHANGE_TIMEZONE, { timezone: '' })).toBeNull()
  })
})

describe('offsets', () => {
  it('reads the wall clock of an instant in a zone as plain numbers', () => {
    expect(zoneClock('America/New_York', utc(2026, 6, 13, 14, 30))).toEqual({ year: 2026, month: 7, day: 13, hour: 10, minute: 30, second: 0 })
    expect(zoneClock('Asia/Tokyo', utc(2026, 0, 12, 23, 0))).toEqual({ year: 2026, month: 1, day: 13, hour: 8, minute: 0, second: 0 })
  })

  it('answers each DST regime from the IANA database', () => {
    expect(tzOffsetMinutes('America/New_York', utc(2026, 6, 13))).toBe(-240)
    expect(tzOffsetMinutes('America/New_York', utc(2026, 0, 12))).toBe(-300)
    expect(tzOffsetMinutes('Europe/London', utc(2026, 6, 13))).toBe(60)
    expect(tzOffsetMinutes('Europe/London', utc(2026, 0, 12))).toBe(0)
    expect(tzOffsetMinutes('Asia/Kolkata', utc(2026, 6, 13))).toBe(330)
    expect(tzOffsetMinutes('Asia/Kathmandu', utc(2026, 6, 13))).toBe(345)
    expect(tzOffsetMinutes('Etc/UTC', utc(2026, 6, 13))).toBe(0)
  })

  it('writes the offset as a signed hour and minute', () => {
    expect(tzOffsetLabel('Etc/UTC', utc(2026, 6, 13))).toBe('UTC')
    expect(tzOffsetLabel('America/Los_Angeles', utc(2026, 6, 13))).toBe('UTC-7')
    expect(tzOffsetLabel('Asia/Kolkata', utc(2026, 6, 13))).toBe('UTC+5:30')
    expect(timezoneLabel('America/New_York', utc(2026, 6, 13))).toBe('New York (UTC-4)')
    expect(timezoneLabel('Etc/UTC', utc(2026, 6, 13))).toBe('UTC')
  })

  it('reads an unknown zone as UTC rather than throwing', () => {
    expect(tzOffsetMinutes('Not/AZone', utc(2026, 6, 13))).toBe(0)
  })
})

describe('the formatters, keyed on the language tag', () => {
  it('writes the clock on a 24-hour cycle in the zone', () => {
    expect(formatClock('en', 'America/New_York', utc(2026, 6, 13, 14, 5, 9))).toBe('10:05:09')
    expect(formatClock('en', 'Asia/Tokyo', utc(2026, 6, 13, 14, 5, 9))).toBe('23:05:09')
  })

  it('writes each tick-mark granularity in the zone and the language', () => {
    const en = makeTickMarkFormatter('en', 'America/New_York')
    const at = utc(2026, 6, 13, 14, 5).getTime() / 1000
    expect(en(at as never, TickMarkType.Year)).toBe('2026')
    expect(en(at as never, TickMarkType.Month)).toBe('Jul')
    expect(en(at as never, TickMarkType.DayOfMonth)).toBe('13')
    expect(en(at as never, TickMarkType.Time)).toBe('10:05')
    expect(en(at as never, TickMarkType.TimeWithSeconds)).toBe('10:05:00')
    const de = makeTickMarkFormatter('de', 'Europe/Berlin')
    expect(de(at as never, TickMarkType.Month)).toMatch(/^Jul/)
    expect(de(at as never, TickMarkType.Time)).toBe('16:05')
  })

  it('writes the crosshair date, with the wall time only intraday', () => {
    const at = utc(2026, 6, 13, 14, 5).getTime() / 1000
    expect(makeCrosshairTimeFormatter('en', 'America/New_York', true)(at as never)).toBe('Mon, Jul 13, 2026  10:05')
    expect(makeCrosshairTimeFormatter('en', 'America/New_York', false)(at as never)).toBe('Mon, Jul 13, 2026')
  })
})

describe('the picker listing', () => {
  it('pins UTC then Exchange, then every zone by offset then city, DST-current', () => {
    const rows = timezoneListing(t, { at: utc(2026, 6, 13) })
    expect(rows).toHaveLength(61)
    expect(rows[0]).toEqual({ id: 'Etc/UTC', label: 'UTC' })
    expect(rows[1]).toEqual({ id: EXCHANGE_TIMEZONE, label: 'Exchange' })
    expect(rows[2]!.label).toBe('(UTC-10) Honolulu')
    expect(rows[rows.length - 1]!.label).toBe('(UTC+12) Auckland')
    const offsets = rows.slice(2).map((r) => tzOffsetMinutes(r.id, utc(2026, 6, 13)))
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets)
    // Phoenix keeps standard time, so in July it sorts with Los Angeles, alphabetically after.
    const july = rows.findIndex((r) => r.id === 'America/Phoenix')
    expect(rows[july - 1]!.id).toBe('America/Los_Angeles')
  })

  it('omits the exchange row for a surface with no charted symbol', () => {
    const rows = timezoneListing(t, { withExchange: false, at: utc(2026, 0, 12) })
    expect(rows).toHaveLength(60)
    expect(rows.some((r) => r.id === EXCHANGE_TIMEZONE)).toBe(false)
  })
})
