// The bar-replay vocabulary — the pure decision layer every replay host shares: the speed table,
// seconds-per-bar for the wire tf tokens replay meets, and the update-interval ladder (which
// finer intervals can FORM a chart bar, and which one 'Auto' picks). The mechanism that consumes
// this differs by host — the widget replays whole bars over its owned series; a richer host may
// form bars progressively from finer fetches — but the vocabulary must be ONE, or two replays
// disagree about what '4h auto on a daily chart' means.

import { parseTimeframe, timeframeSeconds } from './timeframe'


/** Updates per second, fastest first. */
export const REPLAY_SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.2, 0.1] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

/** Seconds per bar for the timeframe tokens replay meets ('1m' to '1mo'), by the chart grammar's
 *  nominal seconds; 0 for ticks and seconds (too fine to subdivide meaningfully) and for a token
 *  the grammar cannot read. */
export function tfSeconds(tf: string): number {
  const parsed = parseTimeframe(tf)
  if (!parsed || parsed.unit === 't' || parsed.unit === 's') return 0
  return timeframeSeconds(parsed)
}

/** Sub-interval ladder the update-interval menu draws from (wire tf tokens, seconds). */
const LADDER: { tf: string; sec: number }[] = [
  { tf: '1m', sec: 60 },
  { tf: '5m', sec: 300 },
  { tf: '15m', sec: 900 },
  { tf: '30m', sec: 1800 },
  { tf: '1h', sec: 3600 },
  { tf: '2h', sec: 7200 },
  { tf: '4h', sec: 14400 },
  { tf: '1d', sec: 86400 },
]

/** The sub-intervals a chart timeframe can form from: strictly finer, divides evenly, ladder-listed. */
export function subIntervalsFor(chartTf: string): { tf: string; sec: number }[] {
  const parent = tfSeconds(chartTf)
  if (!parent) return []
  return LADDER.filter((s) => s.sec < parent && parent % s.sec === 0)
}

/** Auto = the LARGEST sub-interval giving at least four updates per bar; none ⇒ whole-bar updates. */
export function autoIntervalFor(chartTf: string): { tf: string; sec: number } | null {
  const parent = tfSeconds(chartTf)
  const candidates = subIntervalsFor(chartTf).filter((s) => parent / s.sec >= 4)
  return candidates.length ? candidates[candidates.length - 1]! : null
}

/** A bar shape shared with the datafeed contract ({t,o,h,l,c,v} — kept structural here so this
 *  module stays dependency-free). */
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
  let h = used[0]!.h
  let l = used[0]!.l
  let v = 0
  for (const s of used) {
    if (s.h > h) h = s.h
    if (s.l < l) l = s.l
    v += s.v
  }
  return { ...parent, o: used[0]!.o, h, l, c: used[used.length - 1]!.c, v }
}
