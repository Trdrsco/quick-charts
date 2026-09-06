// The symbology contract itself: what a resolved symbol carries, and what it must never carry.
// The exclusions are the load-bearing half. A quote field here would make the free chart a quote
// board; a broker field here would make a display grid look like an execution grid, and
// DECISIONS.md is explicit that the two are allowed to differ.
import { describe, expect, it } from 'vitest'
import type { SymbolInfo } from '../src/symbology'

const SOURCES: Record<string, string> = import.meta.glob('/src/symbology.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

/** A fully populated symbol: every optional field present, so the key set below is the whole
 *  contract rather than the required part of it. */
const FULL: SymbolInfo = {
  ticker: 'CME_MINI:ESZ2026',
  name: 'ESZ2026',
  description: 'E-mini S&P 500 Dec 2026',
  exchange: 'CME',
  listedExchange: 'CME_MINI',
  type: 'futures',
  supportedResolutions: ['1m', '5m', '1h', '1d'],
  timezone: 'America/Chicago',
  session: '1700-1600',
  sessionHolidays: '20261126',
  dataStatus: 'streaming',
  currencyCode: 'USD',
  unitId: 'point',
  volumePrecision: 0,
  format: { pricescale: 100, minmov: 25 },
  corrections: '1700-1200:20261126',
  subsessions: [{ id: 'regular', session: '1700-1600', description: 'Regular', sessionCorrections: '1700-1200:20261126' }],
}

describe('SymbolInfo', () => {
  it('carries exactly the symbology scope the chart owns, the session facts included', () => {
    expect(Object.keys(FULL).sort()).toEqual([
      'corrections',
      'currencyCode',
      'dataStatus',
      'description',
      'exchange',
      'format',
      'listedExchange',
      'name',
      'session',
      'sessionHolidays',
      'subsessions',
      'supportedResolutions',
      'ticker',
      'timezone',
      'type',
      'unitId',
      'volumePrecision',
    ])
  })

  it('resolves without any optional field', () => {
    const minimal: SymbolInfo = {
      ticker: 'AAPL',
      name: 'AAPL',
      description: 'Apple Inc',
      exchange: 'NASDAQ',
      listedExchange: 'NASDAQ',
      type: 'stock',
      supportedResolutions: [],
      timezone: 'America/New_York',
      session: '0930-1600',
      dataStatus: 'endofday',
      volumePrecision: 0,
      format: { pricescale: 100, minmov: 1 },
    }
    expect(minimal.format.pricescale).toBe(100)
  })
})

describe('what symbology refuses to own', () => {
  const source = SOURCES['/src/symbology.ts'] ?? ''
  /** Comments explain the boundary by naming what sits outside it, so only DECLARATIONS are judged. */
  const declarations = source
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')

  it('has the module to read', () => {
    expect(source.length).toBeGreaterThan(1000)
  })

  it('declares no floating tick and no standalone precision', () => {
    expect(declarations).not.toMatch(/^\s*tick\??:\s*number/m)
    expect(declarations).not.toMatch(/\bpricePrecision\b/)
  })

  it('declares no quote value and no quote capability', () => {
    for (const word of [/\bquotes\??:/, /\blast\??:/, /\bchangePct\b/, /\bprevClose\b/, /\bbid\b/, /\bask\b/]) {
      expect(declarations, String(word)).not.toMatch(word)
    }
  })

  it('declares no broker execution fact', () => {
    for (const word of [/\bminTick\b/, /\bquantity/i, /\blotSize\b/, /\bpipValue\b/, /\bmarginRequirement\b/]) {
      expect(declarations, String(word)).not.toMatch(word)
    }
  })
})
