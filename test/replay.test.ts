import { describe, expect, it } from 'vitest'
import { autoIntervalFor, composeFormingBar, REPLAY_SPEEDS, subIntervalsFor, tfSeconds } from '../src/replay'

// The shared replay vocabulary — one definition for every replay host, so two replays can never
// disagree about what '4h auto on a daily chart' means or how a forming bar composes.

describe('the interval vocabulary', () => {
  it('tfSeconds knows the wire tokens replay meets and refuses the rest', () => {
    expect(tfSeconds('1m')).toBe(60)
    expect(tfSeconds('4h')).toBe(14400)
    expect(tfSeconds('1d')).toBe(86400)
    expect(tfSeconds('100t')).toBe(0) // ticks are too fine to subdivide meaningfully
  })

  it('offers the chart\'s own unit group and the one below, and the chart interval with them', () => {
    // A minute chart: the second rung, and the minute itself.
    expect(subIntervalsFor('1m').map((s) => s.tf)).toEqual(['1s', '1m'])
    // An hour chart: seconds, every minute rung that divides an hour, and the hour itself.
    expect(subIntervalsFor('1h').map((s) => s.tf)).toEqual(['1s', '1m', '3m', '5m', '10m', '15m', '30m', '1h'])
    // A daily: hours and the day. Minutes are a group too far — a day played a minute at a time is
    // 1,440 updates per bar, which is why the list stops at the group below.
    expect(subIntervalsFor('1d').map((s) => s.tf)).toEqual(['1h', '2h', '3h', '4h', '1d'])
    // Evenly, so a rung leaving a remainder is not offered.
    expect(subIntervalsFor('45m').map((s) => s.tf)).not.toContain('30m')
    // A week or a month plays in whole days and nothing else.
    expect(subIntervalsFor('1w').map((s) => s.tf)).toEqual(['1d'])
    expect(subIntervalsFor('3mo').map((s) => s.tf)).toEqual(['1d'])
  })

  it('auto takes the COARSEST interval offered, which is the chart\'s own', () => {
    expect(autoIntervalFor('1d')?.tf).toBe('1d')
    expect(autoIntervalFor('1h')?.tf).toBe('1h')
    expect(autoIntervalFor('1m')?.tf).toBe('1m')
    // A timeframe that is not itself a rung has no rung of its own, so auto takes the coarsest that
    // divides it.
    expect(autoIntervalFor('45m')?.tf).toBe('15m')
  })

  it('the speed table is descending and starts at the fastest', () => {
    expect(REPLAY_SPEEDS[0]).toBe(10)
    expect([...REPLAY_SPEEDS]).toEqual([...REPLAY_SPEEDS].sort((a, b) => b - a))
  })
})

describe('composeFormingBar', () => {
  const parent = { t: 0, o: 100, h: 110, l: 90, c: 105, v: 1000 }
  const subs = [
    { t: 0, o: 100, h: 103, l: 99, c: 102, v: 100 },
    { t: 60, o: 102, h: 108, l: 101, c: 101, v: 150 },
    { t: 120, o: 101, h: 110, l: 90, c: 105, v: 750 },
  ]

  it('forms progressively: open from the first sub, high/low cumulative, close latest, volume summed', () => {
    expect(composeFormingBar(parent, subs, 1)).toEqual({ t: 0, o: 100, h: 103, l: 99, c: 102, v: 100 })
    expect(composeFormingBar(parent, subs, 2)).toEqual({ t: 0, o: 100, h: 108, l: 99, c: 101, v: 250 })
  })

  it('a fully-formed bar is the REAL parent verbatim — never a reconstruction', () => {
    expect(composeFormingBar(parent, subs, 3)).toBe(parent)
    expect(composeFormingBar(parent, subs, 99)).toBe(parent)
  })
})
