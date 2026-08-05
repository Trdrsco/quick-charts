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

  it('sub-intervals are strictly finer and divide evenly', () => {
    expect(subIntervalsFor('1h').map((s) => s.tf)).toEqual(['1m', '5m', '15m', '30m'])
    expect(subIntervalsFor('1m')).toEqual([]) // the finest ladder entry cannot form
  })

  it("auto picks the LARGEST sub-interval giving at least four updates per bar (a daily chart lands on 4h)", () => {
    expect(autoIntervalFor('1d')?.tf).toBe('4h')
    expect(autoIntervalFor('1h')?.tf).toBe('15m')
    expect(autoIntervalFor('1m')).toBeNull()
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
