import type { FeedBar } from '../datafeed'

/** A backfill fills missing history; a complete snapshot replaces the recent window. */
export function mergeBarSnapshot(held: readonly FeedBar[], incoming: readonly FeedBar[], backfill = false): FeedBar[] {
  if (backfill) {
    const merged = new Map(incoming.map((bar) => [bar.t, bar]))
    for (const bar of held) merged.set(bar.t, bar)
    return [...merged.values()].sort((a, b) => a.t - b.t)
  }
  const first = incoming[0]?.t
  return first === undefined ? [...incoming] : [...held.filter((bar) => bar.t < first), ...incoming]
}
