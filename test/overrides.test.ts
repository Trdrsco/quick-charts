import { describe, expect, it } from 'vitest'
import { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, layerOverrides, mergeOverrides } from '../src/overrides'
import { DARK_THEME, LIGHT_THEME } from '../src/theme/palettes'

describe('mergeOverrides', () => {
  it('nothing supplied → the defaults, whole and untouched', () => {
    expect(mergeOverrides()).toEqual(DEFAULT_OVERRIDES)
    expect(mergeOverrides(null)).toEqual(DEFAULT_OVERRIDES)
    expect(mergeOverrides({})).toEqual(DEFAULT_OVERRIDES)
  })

  it('a partial tints only what it names — sibling leaves keep their defaults', () => {
    const o = mergeOverrides({ appearance: { grid: false } })
    expect(o.appearance.grid).toBe(false)
    expect(o.appearance.background).toBe(DEFAULT_OVERRIDES.appearance.background)
  })

  it('the tree is the chart’s own look: one section, nothing about an account', () => {
    expect(Object.keys(DEFAULT_OVERRIDES)).toEqual(['appearance'])
  })

  it('never mutates the defaults', () => {
    const before = JSON.stringify(DEFAULT_OVERRIDES)
    mergeOverrides({ appearance: { background: '#000000' } })
    expect(JSON.stringify(DEFAULT_OVERRIDES)).toBe(before)
  })
})

describe('brand colors are single-sourced', () => {
  // The brand pair marks what speaks for trdrs on top of a chart. It deliberately does not drive
  // the candle bodies: the shipped default canvas is the owner's own paper/teal/orange chart
  // (// 2026-08-20), and the pair is trdrs' own ink, not the market's.
  it('the theme series roles ARE the brand pair, so one rebrand moves both', () => {
    expect(DARK_THEME['series.up']).toBe(BRAND_UP)
    expect(DARK_THEME['series.down']).toBe(BRAND_DOWN)
    expect(LIGHT_THEME['series.up']).toBe(BRAND_UP)
    expect(LIGHT_THEME['series.down']).toBe(BRAND_DOWN)
  })

  it('the candle canvas is its own palette, NOT the brand pair', () => {
    expect(DEFAULT_OVERRIDES.appearance.upColor).not.toBe(BRAND_UP)
    expect(DEFAULT_OVERRIDES.appearance.downColor).not.toBe(BRAND_DOWN)
  })
})

// Pinned literally, because these came off the owner's account rather than out of a palette — there
// is no rule to re-derive them from, so a silent edit would have nothing to fail against.
describe('the shipped default chart is the owner-approved one', () => {
  it('appearance', () => {
    expect(DEFAULT_OVERRIDES.appearance).toEqual({
      background: '#ece7c0',
      upColor: '#26a69a',
      downColor: '#ffa726',
      borderUpColor: '#000000',
      borderDownColor: '#000000',
      wickUpColor: '#000000',
      wickDownColor: '#000000',
      grid: true,
      sessions: true,
      countdown: true,
    })
  })
})

describe('layerOverrides — the precedence composer', () => {
  it('later layers win leaf by leaf; unnamed leaves fall through to the base', () => {
    const constructorPartial = { appearance: { background: '#111111', upColor: '#00ff00' } }
    const runtimePartial = { appearance: { upColor: '#ff00ff', grid: false } }
    const out = layerOverrides(DEFAULT_OVERRIDES, constructorPartial, runtimePartial)
    expect(out.appearance.upColor).toBe('#ff00ff') // runtime beats constructor
    expect(out.appearance.background).toBe('#111111') // constructor beats base where runtime is silent
    expect(out.appearance.downColor).toBe(DEFAULT_OVERRIDES.appearance.downColor) // base where all are silent
    expect(out.appearance.grid).toBe(false)
  })

  it('null/undefined layers are inert, and the base is never mutated', () => {
    const base = { appearance: { ...DEFAULT_OVERRIDES.appearance } }
    const out = layerOverrides(base, undefined, null, { appearance: { grid: false } })
    expect(out.appearance.grid).toBe(false)
    expect(base.appearance.grid).toBe(true)
    expect(layerOverrides(base)).toEqual(base)
  })

  it('mergeOverrides is layerOverrides over the shipped defaults', () => {
    const partial = { appearance: { upColor: '#e5e7eb' } }
    expect(mergeOverrides(partial)).toEqual(layerOverrides(DEFAULT_OVERRIDES, partial))
  })
})
