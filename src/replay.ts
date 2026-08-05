// The bar-replay vocabulary — the pure decision layer every replay host shares: the speed table,
// seconds-per-bar for the wire tf tokens replay meets, and the update-interval ladder (which
// finer intervals can FORM a chart bar, and which one 'Auto' picks). The mechanism that consumes
// this differs by host — the widget replays whole bars over its owned series; a richer host may
// form bars progressively from finer fetches — but the vocabulary must be ONE, or two replays
// disagree about what '4h auto on a daily chart' means.

/** Updates per second, fastest first. */
export const REPLAY_SPEEDS = [10, 7, 5, 3, 1, 0.5, 0.3, 0.2, 0.1] as const
export type ReplaySpeed = (typeof REPLAY_SPEEDS)[number]

/** Seconds per bar for the wire tf tokens replay meets ('1m'…'1mo'); 0 when unknown (ticks,
 *  seconds — too fine to subdivide meaningfully). */
export function tfSeconds(tf: string): number {
  const m = /^(\d+)(m|h|d|w|mo)$/.exec(tf)
  if (!m) return 0
  const n = Number(m[1])
  return n * (m[2] === 'm' ? 60 : m[2] === 'h' ? 3600 : m[2] === 'd' ? 86400 : m[2] === 'w' ? 604800 : 2592000)
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
