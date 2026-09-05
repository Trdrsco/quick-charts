// @vitest-environment happy-dom
// The 60 display timezones as release inventory, with the exchange choice beside them. timezones.test.ts
// proves the
// clock and the formatters; this file pins the registry: every id, that each is an IANA zone the platform
// accepts and has a city of its own, the exchange choice beside them, the picker listing over them, and
// that each zone is a chart command.
import { describe, expect, it } from 'vitest'
import { createChartI18n, DEFAULT_TIMEZONE, EXCHANGE_TIMEZONE, isTimezoneChoice, resolveDisplayTimezone, timezoneCity, timezoneListing, TIMEZONES } from '../../src/index'
import { fakeWidget } from '../chrome/harness'
import fixture from './ids.fixture.json'

describe('the 60 timezones', () => {
  it('are these, UTC first, and the fixture agrees', () => {
    expect(TIMEZONES).toHaveLength(60)
    expect(TIMEZONES[0]).toEqual({ id: 'Etc/UTC', city: 'UTC' })
    expect(DEFAULT_TIMEZONE).toBe('Etc/UTC')
    expect(TIMEZONES.map((z) => z.id).sort()).toEqual(fixture.registries.timezones)
  })

  for (const zone of TIMEZONES) {
    it(`${zone.id} is an IANA zone the platform accepts, named by ${zone.city}`, () => {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone.id })).not.toThrow()
      expect(zone.city.length).toBeGreaterThan(0)
      expect(timezoneCity(zone.id)).toBe(zone.city)
      expect(isTimezoneChoice(zone.id)).toBe(true)
      expect(resolveDisplayTimezone(zone.id, null)).toBe(zone.id)
    })
  }

  it('names each city once, so a picker never shows two rows a viewer cannot tell apart', () => {
    const cities = TIMEZONES.map((z) => z.city)
    expect(new Set(cities).size).toBe(cities.length)
  })

  it('offers the exchange choice beside the zones, and nothing else', () => {
    expect(EXCHANGE_TIMEZONE).toBe('exchange')
    expect(isTimezoneChoice(EXCHANGE_TIMEZONE)).toBe(true)
    expect(resolveDisplayTimezone(EXCHANGE_TIMEZONE, { timezone: 'America/Chicago' })).toBe('America/Chicago')
    expect(resolveDisplayTimezone(EXCHANGE_TIMEZONE, null)).toBeNull()
    for (const bad of ['Mars/Olympus', 'utc', '', 'America/Chicago ']) expect(isTimezoneChoice(bad), bad).toBe(false)
  })

  it('lists every zone once in the picker, plus the exchange row when a symbol is charted', () => {
    const t = createChartI18n().t
    expect(timezoneListing(t, { withExchange: false })).toHaveLength(60)
    expect(timezoneListing(t, { withExchange: true })).toHaveLength(61)
  })
})

describe('each zone is a chart command', () => {
  it('registers chart.timezone.<id> for all 60, labeled by city, beside the exchange choice and the setter', () => {
    const w = fakeWidget()
    try {
      for (const zone of TIMEZONES) {
        const spec = w.commands.list().find((s) => s.id === `chart.timezone.${zone.id}`)
        expect(spec, zone.id).toBeDefined()
        expect(spec!.scope).toBe('chart')
        expect(spec!.labelText).toBe(zone.city)
      }
      expect(w.commands.list().find((s) => s.id === 'chart.timezone.exchange')).toBeDefined()
      expect(w.commands.list().find((s) => s.id === 'chart.timezone.set')).toBeDefined()
    } finally {
      w.dispose()
    }
  })

  it('switches through the registry and refuses the zone already chosen', () => {
    const w = fakeWidget()
    try {
      expect(w.commands.execute('chart.timezone.Etc/UTC').kind).toBe('unavailable')
      expect(w.commands.execute('chart.timezone.America/New_York').kind).toBe('ok')
      expect(w.chart.state.timezone).toBe('America/New_York')
      expect(w.commands.execute('chart.timezone.exchange').kind).toBe('ok')
      expect(w.chart.state.timezone).toBe('exchange')
      expect(w.commands.execute('chart.timezone.set', 'Mars/Olympus').kind).toBe('ok')
      expect(w.chart.state.timezone).toBe('exchange')
    } finally {
      w.dispose()
    }
  })
})
