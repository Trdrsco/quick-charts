/** One interval bucket's visibility rule: enabled + the inclusive value range it covers. */
export interface VisibilityRange {
  on: boolean
  from: number
  to: number
}

/**
 * Per-interval visibility for one drawing — which chart timeframes it appears on. Buckets and
 * ranges mirror the timeframe vocabulary (seconds/minutes 1–59, hours 1–24, days 1–366,
 * weeks 1–52, months 1–12); ticks is a single switch.
 */
export interface IntervalVisibility {
  ticks: boolean
  seconds: VisibilityRange
  minutes: VisibilityRange
  hours: VisibilityRange
  days: VisibilityRange
  weeks: VisibilityRange
  months: VisibilityRange
}

export const DEFAULT_VISIBILITY: IntervalVisibility = {
  ticks: true,
  seconds: { on: true, from: 1, to: 59 },
  minutes: { on: true, from: 1, to: 59 },
  hours: { on: true, from: 1, to: 24 },
  days: { on: true, from: 1, to: 366 },
  weeks: { on: true, from: 1, to: 52 },
  months: { on: true, from: 1, to: 12 },
}

export type IntervalBucket = 'ticks' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months'

/** The reference's four quick visibility rules, resolved against the chart's CURRENT interval. */
export type VisibilityPreset = 'current-and-above' | 'current-and-below' | 'current-only' | 'all'

const RANGE_BUCKETS = ['seconds', 'minutes', 'hours', 'days', 'weeks', 'months'] as const
const BUCKET_MAX: Record<(typeof RANGE_BUCKETS)[number], number> = {
  seconds: 59,
  minutes: 59,
  hours: 24,
  days: 366,
  weeks: 52,
  months: 12,
}

/** Build the visibility tree for one quick rule. "Above" means the current interval and every
 *  COARSER one (a 1h line kept "and above" shows on 4h and 1d, never on 5m); "below" mirrors it
 *  toward the finer intervals; "only" pins the current bucket's value. A fractional context
 *  (90m → hours 1.5) rounds OUTWARD so the current chart always satisfies its own rule. With no
 *  context (unparseable timeframe) every rule degrades to all — a drawing must never vanish
 *  because the interval could not be classified. */
export function visibilityPreset(kind: VisibilityPreset, ctx: IntervalContext): IntervalVisibility {
  const all: IntervalVisibility = {
    ticks: true,
    seconds: { on: true, from: 1, to: 59 },
    minutes: { on: true, from: 1, to: 59 },
    hours: { on: true, from: 1, to: 24 },
    days: { on: true, from: 1, to: 366 },
    weeks: { on: true, from: 1, to: 52 },
    months: { on: true, from: 1, to: 12 },
  }
  if (kind === 'all' || !ctx) return all
  const order: IntervalBucket[] = ['ticks', ...RANGE_BUCKETS]
  const at = order.indexOf(ctx.bucket)
  const lo = Math.max(1, Math.floor(ctx.value))
  const hi = Math.max(lo, Math.ceil(ctx.value))
  const out = all
  // Ticks is a single switch and the FINEST bucket: on when ticks IS the current bucket (every
  // rule keeps the current interval visible), else only "and below" reaches down to it.
  out.ticks = ctx.bucket === 'ticks' || kind === 'current-and-below'
  for (const bucket of RANGE_BUCKETS) {
    const i = order.indexOf(bucket)
    if (i === at) {
      out[bucket] =
        kind === 'current-and-above'
          ? { on: true, from: lo, to: BUCKET_MAX[bucket] }
          : kind === 'current-and-below'
            ? { on: true, from: 1, to: hi }
            : { on: true, from: lo, to: hi }
    } else if (i > at) {
      out[bucket] = { on: kind === 'current-and-above', from: 1, to: BUCKET_MAX[bucket] }
    } else {
      out[bucket] = { on: kind === 'current-and-below', from: 1, to: BUCKET_MAX[bucket] }
    }
  }
  return out
}

/** The chart's current interval, bucketed; null = unknown (drawings then always show). */
export type IntervalContext = { bucket: IntervalBucket; value: number } | null

/**
 * Parse a timeframe token ('1t', '30s', '45m', '4h', '1d', '1w', '3mo') into a bucket context.
 * Oversized values roll up so custom intervals land in the range users expect (90m → 1.5h).
 */
export function parseIntervalContext(tf: string): IntervalContext {
  const match = /^(\d+)(t|s|m|h|d|w|mo)$/.exec(tf.trim().toLowerCase())
  if (!match) return null
  let value = Number(match[1])
  const unit = match[2]
  if (unit === 't') return { bucket: 'ticks', value }
  if (unit === 's') {
    if (value < 60) return { bucket: 'seconds', value }
    value /= 60
    return value < 60 ? { bucket: 'minutes', value } : { bucket: 'hours', value: value / 60 }
  }
  if (unit === 'm') {
    return value < 60 ? { bucket: 'minutes', value } : { bucket: 'hours', value: value / 60 }
  }
  if (unit === 'h') return { bucket: 'hours', value }
  if (unit === 'd') return { bucket: 'days', value }
  if (unit === 'w') return { bucket: 'weeks', value }
  return { bucket: 'months', value }
}

/** Deep-copied visibility with defaults filled in — configs never alias the shared default. */
export function normalizeVisibility(partial?: Partial<IntervalVisibility>): IntervalVisibility {
  return {
    ticks: partial?.ticks ?? DEFAULT_VISIBILITY.ticks,
    seconds: { ...DEFAULT_VISIBILITY.seconds, ...partial?.seconds },
    minutes: { ...DEFAULT_VISIBILITY.minutes, ...partial?.minutes },
    hours: { ...DEFAULT_VISIBILITY.hours, ...partial?.hours },
    days: { ...DEFAULT_VISIBILITY.days, ...partial?.days },
    weeks: { ...DEFAULT_VISIBILITY.weeks, ...partial?.weeks },
    months: { ...DEFAULT_VISIBILITY.months, ...partial?.months },
  }
}

/** Whether a drawing with this visibility config shows at the given interval. */
export function visibleAt(visibility: IntervalVisibility, context: IntervalContext): boolean {
  if (!context) return true
  if (context.bucket === 'ticks') return visibility.ticks
  const range = visibility[context.bucket]
  return range.on && context.value >= range.from && context.value <= range.to
}
