import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VISIBILITY,
  normalizeVisibility,
  parseTimeframeContext,
  visibilityPreset,
  visibleAt,
} from '../../../src/internal/drawings/core/visibility'

describe('parseTimeframeContext — timeframe tokens to buckets', () => {
  it('maps the platform timeframe vocabulary', () => {
    expect(parseTimeframeContext('1t')).toEqual({ bucket: 'ticks', value: 1 })
    expect(parseTimeframeContext('1000t')).toEqual({ bucket: 'ticks', value: 1000 })
    expect(parseTimeframeContext('30s')).toEqual({ bucket: 'seconds', value: 30 })
    expect(parseTimeframeContext('45m')).toEqual({ bucket: 'minutes', value: 45 })
    expect(parseTimeframeContext('4h')).toEqual({ bucket: 'hours', value: 4 })
    expect(parseTimeframeContext('1d')).toEqual({ bucket: 'days', value: 1 })
    expect(parseTimeframeContext('1w')).toEqual({ bucket: 'weeks', value: 1 })
    expect(parseTimeframeContext('3mo')).toEqual({ bucket: 'months', value: 3 })
  })

  it('rolls oversized values into the bucket viewers expect', () => {
    expect(parseTimeframeContext('90m')).toEqual({ bucket: 'hours', value: 1.5 })
    expect(parseTimeframeContext('120s')).toEqual({ bucket: 'minutes', value: 2 })
  })

  it('returns null for unknown tokens (drawings then always show)', () => {
    expect(parseTimeframeContext('')).toBeNull()
    expect(parseTimeframeContext('nonsense')).toBeNull()
  })
})

describe('visibleAt — the per-timeframe rule', () => {
  it('defaults show everywhere', () => {
    expect(visibleAt(DEFAULT_VISIBILITY, { bucket: 'minutes', value: 5 })).toBe(true)
    expect(visibleAt(DEFAULT_VISIBILITY, { bucket: 'ticks', value: 100 })).toBe(true)
    expect(visibleAt(DEFAULT_VISIBILITY, null)).toBe(true)
  })

  it('a disabled bucket hides the drawing on that bucket only', () => {
    const v = normalizeVisibility({ minutes: { on: false, from: 1, to: 59 } })
    expect(visibleAt(v, { bucket: 'minutes', value: 5 })).toBe(false)
    expect(visibleAt(v, { bucket: 'hours', value: 1 })).toBe(true)
  })

  it('range bounds are inclusive', () => {
    const v = normalizeVisibility({ minutes: { on: true, from: 5, to: 15 } })
    expect(visibleAt(v, { bucket: 'minutes', value: 5 })).toBe(true)
    expect(visibleAt(v, { bucket: 'minutes', value: 15 })).toBe(true)
    expect(visibleAt(v, { bucket: 'minutes', value: 4 })).toBe(false)
    expect(visibleAt(v, { bucket: 'minutes', value: 16 })).toBe(false)
  })

  it('ticks is a single switch', () => {
    const v = normalizeVisibility({ ticks: false })
    expect(visibleAt(v, { bucket: 'ticks', value: 10 })).toBe(false)
    expect(visibleAt(v, { bucket: 'seconds', value: 10 })).toBe(true)
  })
})

describe('normalizeVisibility — deep copies with defaults', () => {
  it('never aliases the shared default object', () => {
    const a = normalizeVisibility()
    const b = normalizeVisibility()
    expect(a).toEqual(DEFAULT_VISIBILITY)
    expect(a).not.toBe(DEFAULT_VISIBILITY)
    expect(a.minutes).not.toBe(b.minutes)
  })

  it('fills partial ranges from defaults', () => {
    const v = normalizeVisibility({ hours: { on: false, from: 2, to: 12 } })
    expect(v.hours).toEqual({ on: false, from: 2, to: 12 })
    expect(v.days).toEqual(DEFAULT_VISIBILITY.days)
  })
})

describe('visibilityPreset — the quick rules against the current timeframe', () => {
  it('"current and above" keeps the current bucket from its value up, coarser buckets whole, finer off', () => {
    const v = visibilityPreset('current-and-above', { bucket: 'minutes', value: 30 })
    expect(v.minutes).toEqual({ on: true, from: 30, to: 59 })
    expect(v.seconds.on).toBe(false)
    expect(v.ticks).toBe(false)
    expect(v.hours).toEqual({ on: true, from: 1, to: 24 })
    expect(v.days.on).toBe(true)
    expect(v.months.on).toBe(true)
  })

  it('"current and below" mirrors toward the finer buckets (ticks included)', () => {
    const v = visibilityPreset('current-and-below', { bucket: 'hours', value: 4 })
    expect(v.hours).toEqual({ on: true, from: 1, to: 4 })
    expect(v.minutes).toEqual({ on: true, from: 1, to: 59 })
    expect(v.seconds.on).toBe(true)
    expect(v.ticks).toBe(true)
    expect(v.days.on).toBe(false)
    expect(v.months.on).toBe(false)
  })

  it('"current only" pins the bucket value; a fractional context rounds OUTWARD so the chart satisfies its own rule', () => {
    const v = visibilityPreset('current-only', parseTimeframeContext('90m')) // → hours 1.5
    expect(v.hours).toEqual({ on: true, from: 1, to: 2 })
    expect(v.minutes.on).toBe(false)
    expect(v.days.on).toBe(false)
    expect(visibleAt(v, parseTimeframeContext('90m'))).toBe(true)
  })

  it('ticks as the current bucket stays on under every rule; "all" and a null context degrade to everything', () => {
    expect(visibilityPreset('current-and-above', { bucket: 'ticks', value: 100 }).ticks).toBe(true)
    expect(visibilityPreset('current-only', { bucket: 'ticks', value: 100 }).ticks).toBe(true)
    expect(visibilityPreset('all', { bucket: 'hours', value: 1 })).toEqual(DEFAULT_VISIBILITY)
    expect(visibilityPreset('current-only', null)).toEqual(DEFAULT_VISIBILITY)
  })
})
