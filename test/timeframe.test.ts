// The timeframe grammar: the one parser, its ceilings, ordering, the 26 presets, the label a
// picker writes, and the capability filter over what a feed and a symbol declare.
import { describe, expect, it } from 'vitest'
import { createChartI18n } from '../src/i18n'
import {
  allowedTimeframes,
  compareTimeframes,
  formatTimeframe,
  isIntradayTimeframe,
  parseTimeframe,
  timeframeAllowed,
  timeframeGroupUnit,
  timeframeLabel,
  timeframeOrder,
  timeframeSeconds,
  TIMEFRAME_MAX,
  TIMEFRAME_PRESET_TOKENS,
  TIMEFRAME_PRESETS,
  TIMEFRAME_UNITS,
} from '../src/timeframe'

const t = createChartI18n().t

describe('parseTimeframe', () => {
  it('reads count and unit, months before minutes', () => {
    expect(parseTimeframe('1m')).toEqual({ count: 1, unit: 'm' })
    expect(parseTimeframe('3mo')).toEqual({ count: 3, unit: 'mo' })
    expect(parseTimeframe('1000t')).toEqual({ count: 1000, unit: 't' })
    expect(parseTimeframe('45s')).toEqual({ count: 45, unit: 's' })
    expect(parseTimeframe('168h')).toEqual({ count: 168, unit: 'h' })
    expect(parseTimeframe('52w')).toEqual({ count: 52, unit: 'w' })
  })

  it('refuses a malformed token or a count outside the unit ceiling', () => {
    for (const bad of ['', 'm', '1', '1M', '1 m', ' 1m', '1mo ', '0m', '1441m', '1001t', '3601s', '169h', '366d', '53w', '121mo', '1x', '1.5m', '1000000m']) {
      expect(parseTimeframe(bad), bad).toBeNull()
    }
    expect(parseTimeframe('1440m')).toEqual({ count: 1440, unit: 'm' })
  })

  it('formatTimeframe is its inverse and refuses the same ceilings', () => {
    for (const token of ['1t', '30s', '15m', '4h', '1d', '1w', '12mo']) expect(formatTimeframe(parseTimeframe(token)!)).toBe(token)
    expect(formatTimeframe({ count: 0, unit: 'm' })).toBeNull()
    expect(formatTimeframe({ count: 1441, unit: 'm' })).toBeNull()
    expect(formatTimeframe({ count: 1.5, unit: 'h' })).toBeNull()
  })
})

describe('the units and their seconds', () => {
  it('lists every unit smallest first and gives each a ceiling', () => {
    expect(TIMEFRAME_UNITS).toEqual(['t', 's', 'm', 'h', 'd', 'w', 'mo'])
    for (const unit of TIMEFRAME_UNITS) expect(TIMEFRAME_MAX[unit]).toBeGreaterThan(0)
  })

  it('measures a timeframe in nominal seconds', () => {
    expect(timeframeSeconds({ count: 5, unit: 'm' })).toBe(300)
    expect(timeframeSeconds({ count: 4, unit: 'h' })).toBe(14_400)
    expect(timeframeSeconds({ count: 1, unit: 'w' })).toBe(604_800)
    expect(timeframeSeconds({ count: 1, unit: 'mo' })).toBe(2_592_000)
    expect(timeframeSeconds({ count: 10, unit: 't' })).toBe(600)
  })

  it('calls ticks, seconds, minutes and hours intraday and nothing else', () => {
    for (const token of ['1t', '30s', '1m', '4h']) expect(isIntradayTimeframe(token), token).toBe(true)
    for (const token of ['1d', '1w', '1mo', '', 'x', '1D']) expect(isIntradayTimeframe(token), token).toBe(false)
  })
})

describe('ordering', () => {
  it('sorts by unit then count, unreadable tokens last', () => {
    const tokens = ['1d', '30m', '1000t', '1h', '5m', 'junk', '1s', '1mo', '1w']
    expect(tokens.sort((a, b) => timeframeOrder(a) - timeframeOrder(b))).toEqual(['1000t', '1s', '5m', '30m', '1h', '1d', '1w', '1mo', 'junk'])
    expect(compareTimeframes({ count: 1000, unit: 't' }, { count: 1, unit: 's' })).toBeLessThan(0)
    expect(compareTimeframes({ count: 3, unit: 'm' }, { count: 1, unit: 'm' })).toBeGreaterThan(0)
  })

  it('groups weeks and months with days', () => {
    expect(timeframeGroupUnit('w')).toBe('d')
    expect(timeframeGroupUnit('mo')).toBe('d')
    expect(timeframeGroupUnit('m')).toBe('m')
  })
})

describe('the 26 presets', () => {
  it('are 26 tokens in five groups, every one of which parses, none twice', () => {
    expect(TIMEFRAME_PRESETS.map((g) => g.unit)).toEqual(['t', 's', 'm', 'h', 'd'])
    const tokens = TIMEFRAME_PRESETS.flatMap((g) => g.tokens)
    expect(tokens).toHaveLength(26)
    expect(TIMEFRAME_PRESET_TOKENS.size).toBe(26)
    for (const token of tokens) expect(parseTimeframe(token), token).not.toBeNull()
    for (const g of TIMEFRAME_PRESETS) for (const token of g.tokens) expect(timeframeGroupUnit(parseTimeframe(token)!.unit)).toBe(g.unit)
  })

  it('are in size order within each group', () => {
    for (const g of TIMEFRAME_PRESETS) expect([...g.tokens].sort((a, b) => timeframeOrder(a) - timeframeOrder(b))).toEqual(g.tokens)
  })
})

describe('timeframeLabel', () => {
  it('writes a counted unit in the chart language, singular and plural', () => {
    expect(timeframeLabel(t, '1h')).toBe('1 Hour')
    expect(timeframeLabel(t, '4h')).toBe('4 Hours')
    expect(timeframeLabel(t, '5t')).toBe('5 Ticks')
    expect(timeframeLabel(t, '1mo')).toBe('1 Month')
    expect(timeframeLabel(t, '12mo')).toBe('12 Months')
  })

  it('returns an unreadable token as written', () => {
    expect(timeframeLabel(t, '7x')).toBe('7x')
  })
})

describe('the capability filter', () => {
  it('treats an absent or EMPTY list as no restriction', () => {
    expect(timeframeAllowed('1m')).toBe(true)
    expect(timeframeAllowed('1m', { supportedResolutions: [] })).toBe(true)
    expect(timeframeAllowed('1m', { supportedResolutions: [], resolutions: [] })).toBe(true)
    expect(timeframeAllowed('1m', { supportedResolutions: null, resolutions: undefined })).toBe(true)
  })

  it('requires a token to pass the symbol list AND the feed list when each is given', () => {
    expect(timeframeAllowed('1m', { supportedResolutions: ['1m', '1d'] })).toBe(true)
    expect(timeframeAllowed('5m', { supportedResolutions: ['1m', '1d'] })).toBe(false)
    expect(timeframeAllowed('1m', { resolutions: ['1d'] })).toBe(false)
    expect(timeframeAllowed('1d', { supportedResolutions: ['1m', '1d'], resolutions: ['1d'] })).toBe(true)
    expect(timeframeAllowed('1m', { supportedResolutions: ['1m', '1d'], resolutions: ['1d'] })).toBe(false)
  })

  it('never allows a token the grammar cannot read, even when a list names it', () => {
    expect(timeframeAllowed('1D', { supportedResolutions: ['1D'] })).toBe(false)
  })

  it('filters the presets in place, keeping their order', () => {
    const all = TIMEFRAME_PRESETS.flatMap((g) => g.tokens)
    expect(allowedTimeframes(all, { supportedResolutions: ['1d', '1h', '5m'] })).toEqual(['5m', '1h', '1d'])
    expect(allowedTimeframes(all)).toEqual(all)
  })
})
