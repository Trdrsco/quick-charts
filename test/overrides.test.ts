import { describe, expect, it } from 'vitest'
import { BRAND_DOWN, BRAND_UP, DEFAULT_OVERRIDES, layerOverrides, mergeOverrides } from '../src/overrides'
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
  // The brand pair drives the package THEME and the buy line. It deliberately no longer drives the
  // candle bodies: the shipped default canvas is the owner's own paper/teal/orange chart (owner call
  // 2026-08-20), and the pair marks trdrs' own ink — your orders — not the market's.
  it('the theme still resolves to the brand pair', () => {
    const theme = resolveTheme()
    expect(theme.upColor).toBe(BRAND_UP)
    expect(theme.downColor).toBe(BRAND_DOWN)
  })

  it('the buy line tracks the brand, so a rebrand still moves it', () => {
    expect(DEFAULT_OVERRIDES.trading.buyColor).toBe(BRAND_UP)
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

  it('trading', () => {
    expect(DEFAULT_OVERRIDES.trading).toEqual({
      buyColor: '#4c98fb',
      sellColor: '#f5a623',
      tpColor: '#089981',
      slColor: '#ff9800',
      showPositions: true,
      showOrders: true,
      lineWidth: 1,
      executionMarks: true,
      // Arrows on, their price labels off — the arrow already says side and level.
      executionLabels: false,
      pnlMode: 'money',
    })
  })
})

describe('layerOverrides — the precedence composer', () => {
  it('later layers win leaf by leaf; unnamed leaves fall through to the base', () => {
    const constructorPartial = { appearance: { background: '#111111', upColor: '#00ff00' } }
    const runtimePartial = { appearance: { upColor: '#ff00ff' }, trading: { lineWidth: 3 as const } }
    const out = layerOverrides(DEFAULT_OVERRIDES, constructorPartial, runtimePartial)
    expect(out.appearance.upColor).toBe('#ff00ff') // runtime beats constructor
    expect(out.appearance.background).toBe('#111111') // constructor beats base where runtime is silent
    expect(out.appearance.downColor).toBe(DEFAULT_OVERRIDES.appearance.downColor) // base where all are silent
    expect(out.trading.lineWidth).toBe(3)
    expect(out.trading.buyColor).toBe(DEFAULT_OVERRIDES.trading.buyColor)
  })

  it('null/undefined layers are inert, and the base is never mutated', () => {
    const base = { appearance: { ...DEFAULT_OVERRIDES.appearance }, trading: { ...DEFAULT_OVERRIDES.trading } }
    const out = layerOverrides(base, undefined, null, { appearance: { grid: false } })
    expect(out.appearance.grid).toBe(false)
    expect(base.appearance.grid).toBe(true)
    expect(layerOverrides(base)).toEqual(base)
  })

  it('mergeOverrides is layerOverrides over the shipped defaults', () => {
    const partial = { trading: { buyColor: '#e5e7eb' } }
    expect(mergeOverrides(partial)).toEqual(layerOverrides(DEFAULT_OVERRIDES, partial))
  })
})
