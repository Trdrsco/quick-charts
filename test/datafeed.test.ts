import { describe, expect, it } from 'vitest'
import { olderPageVerdict, type HistoryPage } from '../src/datafeed'

const bar = { t: 100, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }
const page = (p: Partial<HistoryPage>): HistoryPage => ({ bars: [], noData: false, ...p })

// The one scroll-back rule both paging consumers (the widget host and the app's stream hook) apply.
// The stakes of each verdict differ by an order of magnitude: `end` PERMANENTLY seals scroll-back
// for the (symbol, tf), so it must be unreachable from a gap or a transient; `hop` must be bounded
// so a lying feed can't spin a flight.
describe('olderPageVerdict', () => {
  it('a page with bars is data, whatever flags ride along — bars are never discarded', () => {
    expect(olderPageVerdict(page({ bars: [bar] }), 99, false).kind).toBe('bars')
    expect(olderPageVerdict(page({ bars: [bar], noData: true }), 99, false).kind).toBe('bars')
    expect(olderPageVerdict(page({ bars: [bar], noData: true, nextTime: 50 }), 99, false).kind).toBe('bars')
  })

  it('empty + noData + no hint = the end of history — the only verdict that seals', () => {
    expect(olderPageVerdict(page({ noData: true }), 99, false).kind).toBe('end')
    expect(olderPageVerdict(page({ noData: true }), 99, true).kind).toBe('end')
  })

  it('empty with an older nextTime hops there — the session-gap answer, noData flag or not', () => {
    expect(olderPageVerdict(page({ noData: true, nextTime: 50 }), 99, false)).toEqual({ kind: 'hop', to: 50 })
    expect(olderPageVerdict(page({ nextTime: 50 }), 99, false)).toEqual({ kind: 'hop', to: 50 })
  })

  it('one hop per gap: an ask that already was a hop never chains, and never seals on a hint', () => {
    expect(olderPageVerdict(page({ noData: true, nextTime: 50 }), 99, true).kind).toBe('stop')
  })

  it('a hint that would not move the ask older (equal or newer) is unusable — stop, never hop or seal', () => {
    expect(olderPageVerdict(page({ noData: true, nextTime: 99 }), 99, false).kind).toBe('stop')
    expect(olderPageVerdict(page({ noData: true, nextTime: 200 }), 99, false).kind).toBe('stop')
  })

  it('an empty page with no verdict at all is a transient — stop, and let the next gesture retry', () => {
    expect(olderPageVerdict(page({}), 99, false).kind).toBe('stop')
  })
})
