// Folding a feed's own bars into a grain it does not serve, and refusing to invent one it cannot.
import { describe, expect, it, vi } from 'vitest'
import { foldBars, foldFor, withFoldedHistory } from '../src/aggregate'
import type { ChartDatafeed, FeedBar } from '../src/datafeed'

const bar = (t: number, o: number, h: number, l: number, c: number, v = 1): FeedBar => ({ t, o, h, l, c, v })
const SERVES = ['1m', '5m', '15m', '1h', '1d', '1mo']

describe('choosing what to fold from', () => {
  it('takes the COARSEST served grain that divides the ask, so the fewest bars are fetched', () => {
    // 45m divides by 15m (3 bars) and by 5m (9) and by 1m (45). The coarsest wins.
    expect(foldFor('45m', SERVES)).toMatchObject({ source: '15m', ratio: 3 })
    expect(foldFor('3h', SERVES)).toMatchObject({ source: '1h', ratio: 3 })
  })

  it('leaves a grain the feed already serves alone', () => {
    expect(foldFor('1h', SERVES)).toBeNull()
    expect(foldFor('1d', SERVES)).toBeNull()
  })

  it('refuses what nothing divides, rather than inventing it', () => {
    // Below everything served: the path inside a 1m bar was never written down.
    expect(foldFor('1s', SERVES)).toBeNull()
    expect(foldFor('15s', SERVES)).toBeNull()
    // A tick bar counts trades rather than time, so it neither folds nor is folded from.
    expect(foldFor('10t', SERVES)).toBeNull()
    // Nothing served divides it: 17 minutes is not a whole number of 5-minute or hourly bars.
    expect(foldFor('17m', ['5m', '1h', '1d'])).toBeNull()
    // With minutes served it folds perfectly well, seventeen at a time.
    expect(foldFor('17m', SERVES)).toMatchObject({ source: '1m', ratio: 17 })
  })

  it('folds month multiples by CALENDAR month, not by ninety days', () => {
    expect(foldFor('3mo', SERVES)).toMatchObject({ source: '1mo', ratio: 3 })
    expect(foldFor('12mo', SERVES)).toMatchObject({ source: '1mo', ratio: 12 })
    // A quarter starts in January, April, July and October whatever the month lengths are.
    const q = foldFor('3mo', SERVES)!
    const feb = Date.UTC(2026, 1, 1) / 1000
    const apr = Date.UTC(2026, 3, 1) / 1000
    expect(q.bucket(feb)).toBe(Date.UTC(2026, 0, 1) / 1000)
    expect(q.bucket(apr)).toBe(Date.UTC(2026, 3, 1) / 1000)
  })

  it('starts a week on Monday, not on the epoch\'s Thursday', () => {
    const w = foldFor('1w', ['1d'])!
    const wed = Date.UTC(2026, 8, 9) / 1000 // a Wednesday
    expect(new Date(w.bucket(wed) * 1000).getUTCDay()).toBe(1)
  })
})

describe('the fold itself', () => {
  it('takes the first open, the extremes, the last close and the summed volume', () => {
    const src = [bar(0, 10, 12, 9, 11, 5), bar(900, 11, 15, 8, 14, 7), bar(1800, 14, 14, 13, 13, 3)]
    const [folded] = foldBars(src, (t) => Math.floor(t / 2700) * 2700)
    expect(folded).toEqual({ t: 0, o: 10, h: 15, l: 8, c: 13, v: 15 })
  })

  it('starts a new bar at every bucket boundary and keeps time order', () => {
    const src = [bar(0, 1, 1, 1, 1), bar(2700, 2, 2, 2, 2), bar(5400, 3, 3, 3, 3)]
    expect(foldBars(src, (t) => Math.floor(t / 2700) * 2700).map((b) => b.t)).toEqual([0, 2700, 5400])
  })

  it('answers nothing for nothing', () => {
    expect(foldBars([], (t) => t)).toEqual([])
  })
})

describe('a feed that folds', () => {
  const feedWith = (bars: FeedBar[]) => {
    const history = vi.fn(async () => ({ bars, noData: false }))
    const feed = { search: async () => ({ hits: [], hasMore: false }), resolve: async () => null, history, subscribeBars: () => () => {} } as unknown as ChartDatafeed
    return { feed: withFoldedHistory(feed, { serves: SERVES }), history }
  }

  it('asks for the source grain and answers in the requested one', async () => {
    const src = Array.from({ length: 6 }, (_, i) => bar(i * 900, i, i + 1, i - 1, i))
    const { feed, history } = feedWith(src)
    const page = await feed.history('ES', '45m')
    expect(history).toHaveBeenCalledWith('ES', '15m', undefined)
    expect(page.bars.map((b) => b.t)).toEqual([0, 2700])
  })

  it('passes an unfoldable ask straight through, so the feed answers for itself', async () => {
    const { feed, history } = feedWith([])
    await feed.history('ES', '1s')
    // The wrapper adds nothing: the feed is asked exactly what the chart asked for, and its own
    // no-data answer is what comes back.
    expect(history).toHaveBeenCalledWith('ES', '1s', undefined)
  })

  it('scales a countBack to the source and trims the answer to what was asked', async () => {
    const src = Array.from({ length: 12 }, (_, i) => bar(i * 900, 1, 1, 1, 1))
    const { feed, history } = feedWith(src)
    const page = await feed.history('ES', '45m', { countBack: 2 })
    // Two 45m bars are six 15m bars, plus one bucket's worth because the window usually opens
    // part-way into its first bar.
    expect(history).toHaveBeenCalledWith('ES', '15m', { countBack: 9 })
    expect(page.bars).toHaveLength(2)
  })

  it('drops a first bucket the window opened inside, rather than showing a part-bar', async () => {
    // The window starts at 900, which is the middle of the 0..2700 bucket.
    const src = [bar(900, 1, 1, 1, 1), bar(1800, 2, 2, 2, 2), bar(2700, 3, 3, 3, 3), bar(3600, 4, 4, 4, 4)]
    const { feed } = feedWith(src)
    const page = await feed.history('ES', '45m', { from: 900 })
    expect(page.bars.map((b) => b.t)).toEqual([2700])
  })

  it('keeps every other verb the wrapped feed had', async () => {
    const { feed } = feedWith([])
    expect(typeof feed.search).toBe('function')
    expect(typeof feed.subscribeBars).toBe('function')
  })
})
