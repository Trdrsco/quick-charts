// Folding a feed's own bars into a coarser timeframe it does not serve.
//
// A feed answers the grains its venue records. A chart may want one it does not: a venue that keeps
// 15-minute bars records every 45-minute bar too, just not under that name. Folding is exact, so
// the coarser bar is the finer ones read together rather than an estimate of them.
//
// It only works DOWNWARD. A coarser bar is a fold of finer ones; a finer bar is not recoverable
// from a coarser one, because the path the price took inside a bar was never written down. A
// request below everything a feed serves therefore stays unanswered, honestly, rather than being
// invented.
import type { ChartDatafeed, FeedBar, HistoryPage } from './datafeed'
import { parseTimeframe, timeframeSeconds } from './timeframe'

/** The window a history read asks for, as the datafeed port states it. */
type HistoryRange = { from?: number; to?: number; countBack?: number }

/** A source grain a request can be folded from, and how many of it make one target bar. */
interface Fold {
  /** The wire token to ask the feed for. */
  source: string
  /** How the source bar's own time maps to the bar it belongs in. */
  bucket(epochSecs: number): number
  /** Source bars per target bar, for sizing a `countBack` request. */
  ratio: number
}

const MONTH_UNITS = new Set(['mo'])

/** Seconds per whole month is not a number, so month multiples are bucketed by CALENDAR month index
 *  rather than by duration: 3 months is a quarter, not ninety days. */
function monthBucket(epochSecs: number, months: number): number {
  const d = new Date(epochSecs * 1000)
  const index = d.getUTCFullYear() * 12 + d.getUTCMonth()
  const start = Math.floor(index / months) * months
  return Math.floor(Date.UTC(Math.floor(start / 12), start % 12, 1) / 1000)
}

/** Weeks start on MONDAY, as a trading week reads. The epoch fell on a Thursday, so a plain modulo
 *  of the week's seconds would cut the week in the middle of it. */
function weekBucket(epochSecs: number, weeks: number): number {
  const WEEK = 604800
  // 345600s is the epoch's offset to the first Monday after it.
  const shifted = epochSecs - 345600
  return Math.floor(shifted / (WEEK * weeks)) * (WEEK * weeks) + 345600
}

/** How to build `target` out of grains the feed serves, or null when nothing serves it. The source
 *  chosen is the COARSEST that divides the target, so the fewest bars are fetched and folded. */
export function foldFor(target: string, serves: readonly string[]): Fold | null {
  const want = parseTimeframe(target)
  if (!want) return null
  // A TICK bar counts trades, not time. It has a nominal duration for ordering purposes only, and
  // folding time bars into it (or it into anything) would read that nominal figure as a real span.
  if (want.unit === 't') return null
  if (serves.includes(target)) return null

  // Month multiples fold from a smaller month multiple: a quarter is three months read together.
  if (MONTH_UNITS.has(want.unit)) {
    const sources = serves
      .map((tf) => ({ tf, parsed: parseTimeframe(tf) }))
      .filter((s) => s.parsed && MONTH_UNITS.has(s.parsed.unit) && s.parsed.count < want.count && want.count % s.parsed.count === 0)
      .sort((a, b) => b.parsed!.count - a.parsed!.count)
    const best = sources[0]
    if (!best) return null
    return { source: best.tf, bucket: (t) => monthBucket(t, want.count), ratio: want.count / best.parsed!.count }
  }

  const targetSecs = timeframeSeconds(want)
  if (!targetSecs) return null
  const sources = serves
    .map((tf) => ({ tf, parsed: parseTimeframe(tf) }))
    .filter((s) => s.parsed && !MONTH_UNITS.has(s.parsed.unit) && s.parsed.unit !== 't')
    .map((s) => ({ tf: s.tf, secs: timeframeSeconds(s.parsed!) }))
    .filter((s) => s.secs > 0 && s.secs < targetSecs && targetSecs % s.secs === 0)
    .sort((a, b) => b.secs - a.secs)
  const best = sources[0]
  if (!best) return null
  const bucket = want.unit === 'w' ? (t: number) => weekBucket(t, want.count) : (t: number) => Math.floor(t / targetSecs) * targetSecs
  return { source: best.tf, bucket, ratio: targetSecs / best.secs }
}

/** The OHLCV a fold reads and writes. Structural, so the replay plane's forming bar and this
 *  module's history fold share one implementation without either importing the other's types. */
export interface OhlcvBar {
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** ONE bar from a run of finer ones: the first open, the extremes across them, the last close and
 *  their summed volume. That is what the coarser bar would have been recorded as, which is why a
 *  fold is exact rather than an estimate of the bar it stands for. Null for an empty run. */
export function foldOhlcv(run: readonly OhlcvBar[]): OhlcvBar | null {
  const first = run[0]
  const last = run[run.length - 1]
  if (!first || !last) return null
  let h = first.h
  let l = first.l
  let v = 0
  for (const b of run) {
    if (b.h > h) h = b.h
    if (b.l < l) l = b.l
    v += b.v
  }
  return { o: first.o, h, l, c: last.c, v }
}

/** Fold source bars into their buckets, in the time order they arrive in. */
export function foldBars(bars: readonly FeedBar[], bucket: (epochSecs: number) => number): FeedBar[] {
  const out: FeedBar[] = []
  let run: FeedBar[] = []
  let at = 0
  const close = (): void => {
    const folded = foldOhlcv(run)
    if (folded) out.push({ t: at, ...folded })
  }
  for (const b of bars) {
    const start = bucket(b.t)
    if (run.length > 0 && start !== at) {
      close()
      run = []
    }
    at = start
    run.push(b)
  }
  close()
  return out
}

/** A feed that answers coarser grains than the one it wraps.
 *
 *  `serves` names the grains the wrapped feed answers natively; every other request is folded from
 *  the coarsest of them that divides it. A request nothing divides is passed straight through, so
 *  the wrapped feed gives its own honest answer rather than this wrapper inventing one.
 *
 *  ```ts
 *  import { withFoldedHistory } from '@trdrs/quickcharts'
 *
 *  const feed = withFoldedHistory(venueFeed, { serves: ['1m', '15m', '1h', '1d', '1mo'] })
 *  // A 45m request now fetches 15m bars and folds them three at a time.
 *  ```
 */
export function withFoldedHistory(feed: ChartDatafeed, options: { serves: readonly string[] }): ChartDatafeed {
  const { serves } = options
  return {
    ...feed,
    async history(symbol: string, tf: string, range?: HistoryRange): Promise<HistoryPage> {
      const fold = foldFor(tf, serves)
      if (!fold) return feed.history(symbol, tf, range)
      // A countBack is a count of TARGET bars, so the source is asked for as many as make them, plus
      // one bucket's worth: the window's first bucket is usually entered part-way through.
      const sourceRange: HistoryRange | undefined = range
        ? { ...range, ...(range.countBack === undefined ? {} : { countBack: range.countBack * fold.ratio + fold.ratio }) }
        : undefined
      const page = await feed.history(symbol, fold.source, sourceRange)
      const bars = foldBars(page.bars, fold.bucket)
      // The first bucket is dropped when the window opened inside it: a bar built from part of its
      // own span is not that bar, and showing it would put a short candle at the left edge.
      const trimmed = bars.length > 1 && range?.from !== undefined && bars[0]!.t < range.from ? bars.slice(1) : bars
      return { ...page, bars: range?.countBack === undefined ? trimmed : trimmed.slice(-range.countBack) }
    },
  }
}
