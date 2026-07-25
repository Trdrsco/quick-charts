import { describe, expect, it } from 'vitest'
import { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, mergeOverrides } from '../src/overrides'
import { resolveTheme } from '../src/host'

describe('mergeOverrides', () => {
  it('nothing supplied → the defaults, whole and untouched', () => {
    expect(mergeOverrides()).toEqual(DEFAULT_OVERRIDES)
    expect(mergeOverrides(null)).toEqual(DEFAULT_OVERRIDES)
    expect(mergeOverrides({})).toEqual(DEFAULT_OVERRIDES)
  })

  it('a partial tints only what it names — sibling leaves keep their defaults', () => {
    const o = mergeOverrides({ trading: { buyColor: '#00ff00' }, appearance: { grid: false } })
    expect(o.trading.buyColor).toBe('#00ff00')
    expect(o.trading.sellColor).toBe(DEFAULT_OVERRIDES.trading.sellColor)
    expect(o.appearance.grid).toBe(false)
    expect(o.appearance.background).toBe(DEFAULT_OVERRIDES.appearance.background)
  })

  it('never mutates the defaults', () => {
    const before = JSON.stringify(DEFAULT_OVERRIDES)
    mergeOverrides({ appearance: { background: '#000000' } })
    expect(JSON.stringify(DEFAULT_OVERRIDES)).toBe(before)
  })
})

describe('brand colors are single-sourced', () => {
  it('the theme defaults and the override defaults are the SAME two strings', () => {
    const theme = resolveTheme()
    expect(theme.upColor).toBe(BRAND_UP)
    expect(theme.downColor).toBe(BRAND_DOWN)
    expect(DEFAULT_OVERRIDES.appearance.upColor).toBe(BRAND_UP)
    expect(DEFAULT_OVERRIDES.trading.buyColor).toBe(BRAND_UP)
    expect(DEFAULT_OVERRIDES.appearance.downColor).toBe(BRAND_DOWN)
    expect(DEFAULT_OVERRIDES.trading.sellColor).toBe(BRAND_DOWN)
  })
})
