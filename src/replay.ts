// The bar-replay vocabulary — the pure decision layer every replay host shares: the speed table,
// seconds-per-bar for the wire tf tokens replay meets, and the update-timeframe ladder (which
// finer timeframes can FORM a chart bar, and which one 'Auto' picks). The mechanism that consumes
// this differs by host — the chart replays whole bars over its own series; a richer host may
// form bars progressively from finer fetches — but the vocabulary must be ONE, or two replays
// disagree about what '4h auto on a daily chart' means.

import { foldOhlcv } from './aggregate'
import { parseTimeframe, timeframeSeconds } from './timeframe'


/** Updates per second, fastest first. */
export const REPLAY_SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.2, 0.1] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

/** Seconds per bar for the timeframe tokens replay meets ('1s' to '1mo'), by the chart grammar's
 *  nominal seconds; 0 for ticks and for a token the grammar cannot read. A tick bar has no fixed
 *  duration, so it can neither be subdivided nor stand as a subdivision of a time bar. */
export function tfSeconds(tf: string): number {
  const parsed = parseTimeframe(tf)
  if (!parsed || parsed.unit === 't') return 0
  return timeframeSeconds(parsed)
}

/** The update-timeframe ladder, by unit group, coarsest group last. A rung is a wire tf token and
 *  its nominal seconds. */
const GRAIN_GROUPS: { unit: 's' | 'm' | 'h' | 'd'; rungs: { tf: string; sec: number }[] }[] = [
  { unit: 's', rungs: [{ tf: '1s', sec: 1 }] },
  { unit: 'm', rungs: [1, 3, 5, 10, 15, 30].map((n) => ({ tf: `${n}m`, sec: n * 60 })) },
  { unit: 'h', rungs: [1, 2, 3, 4].map((n) => ({ tf: `${n}h`, sec: n * 3600 })) },
  { unit: 'd', rungs: [{ tf: '1d', sec: 86400 }] },
]

const DAY_RUNG = { tf: '1d', sec: 86400 }

/** The update timeframes a chart timeframe offers.
 *
 *  A rung qualifies when it divides the chart's timeframe evenly and is no coarser than it, drawn
 *  from the chart's OWN unit group and the group below it. That bound is what keeps the list
 *  readable: every minute rung divides a day evenly, but a day played a minute at a time is 1,440
 *  updates per bar, so a daily chart offers hours. Seconds join any intraday chart, which is how a
 *  minute chart gets a grain at all. A week or a month plays in whole days and nothing else.
 *
 *  The chart's own timeframe is ON the list when it is a rung, and choosing it is how a viewer asks
 *  for whole-bar updates. A timeframe that is not a rung (17m, say) simply has no rung of its own,
 *  and the list is whatever divides it. */
export function subTimeframesFor(chartTf: string): { tf: string; sec: number }[] {
  const parsed = parseTimeframe(chartTf)
  const parent = tfSeconds(chartTf)
  if (!parsed || !parent) return []
  if (parsed.unit === 'w' || parsed.unit === 'mo') return [DAY_RUNG]
  const own = GRAIN_GROUPS.findIndex((g) => g.unit === parsed.unit)
  if (own < 0) return []
  const intraday = parsed.unit === 's' || parsed.unit === 'm' || parsed.unit === 'h'
  return GRAIN_GROUPS.filter((g, i) => i === own || i === own - 1 || (intraday && g.unit === 's'))
    .flatMap((g) => g.rungs)
    .filter((s) => s.sec <= parent && parent % s.sec === 0)
    .sort((a, b) => a.sec - b.sec)
}

/** Auto = the COARSEST timeframe on offer, which is the chart's own whenever that is a rung. Replay
 *  then advances a whole bar per update until a viewer asks for a finer grain. */
export function autoTimeframeFor(chartTf: string): { tf: string; sec: number } | null {
  const offered = subTimeframesFor(chartTf)
  return offered.length ? offered[offered.length - 1]! : null
}

/** A bar shape shared with the datafeed contract ({t,o,h,l,c,v}), kept structural so this module
 *  never depends on the feed's own types. */
interface ReplayBarShape {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

/** The FORMING parent bar after k of its sub-bars have played: open from the first sub, high/low
 *  cumulative, close from the latest, volume summed — real finer bars, never synthesized ticks.
 *  With k at (or past) the full sub count the REAL parent is returned verbatim, so a fully-formed
 *  bar is exact rather than a reconstruction (sub-bar sets can be lossy at session edges). */
export function composeFormingBar<B extends ReplayBarShape>(parent: B, subs: readonly ReplayBarShape[], k: number): B {
  const used = subs.slice(0, Math.max(1, k))
  if (k >= subs.length || used.length === 0) return parent
  // The SAME fold a coarser history bar is built from: a partly-formed bar is the sub-bars played
  // so far read together, which is exactly what the whole bar will be once the rest arrive.
  const folded = foldOhlcv(used)
  return folded ? { ...parent, ...folded } : parent
}
