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
