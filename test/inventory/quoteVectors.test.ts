// The quote vectors end to end: reusable vectors for last, bid, ask, open, high, low, prevClose, change,
// changePct, volume, status, and timestamp; the injected Watchlist formatter matches Last and Chg to the
// chart's display for the same symbol while Chg% and Volume keep their own independent value formats;
// and Watchlist has no Quick Charts import.
//
// priceFormatter.test.ts proves each price case; this file proves the quote block: that the vectors are
// coherent with one another and land on the symbol grid, that every price field of a quote writes through
// the one formatter to the recorded display, and that a Watchlist value-formatter port built the way the
// first-party host builds it writes Last and Chg to the chart's own text while Chg% and Volume keep their
// own value kinds. The host's port implementation is pinned in source; the Watchlist package is proved to
// import nothing of Quick Charts, so the port is the only way the two can agree.
import { describe, expect, it } from 'vitest'
import { createPriceFormatter, type NumericPunctuation, type PriceFormat } from '../../src/index'
import vectors from '../fixtures/quoteVectors.json'

const APP_SOURCES = import.meta.glob(['/apps/web/src/widgets/watchlistFormat.ts', '/apps/web/src/lib/priceFormat.ts'], { query: '?raw', import: 'default', eager: true })
const WATCHLIST_FILES = import.meta.glob(['/packages/watchlist/src/**/*.ts', '/packages/watchlist/test/**/*.ts', '/packages/watchlist/package.json', '/packages/watchlist/README.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

type Price = 'last' | 'bid' | 'ask' | 'open' | 'high' | 'low' | 'prevClose'
const PRICES: readonly Price[] = ['last', 'bid', 'ask', 'open', 'high', 'low', 'prevClose']
const DATA_STATUSES = ['streaming', 'endofday', 'delayed_streaming']

interface Case {
  id: string
  symbol: string
  format: PriceFormat
  punctuation?: NumericPunctuation
  quote: Record<Price, number> & { change: number; changePct: number; volume: number; status: string; timestamp: number }
  display: Record<Price, string> & { change: string }
  board?: { last: string; change: string; changePct: string; volume: string }
}

const CASES = vectors.cases as unknown as Case[]

/** A Watchlist value-formatter port built exactly as the first-party host builds its own (apps/web
 *  watchlistFormat.ts): Last and Chg through the ONE Quick Charts formatter for the symbol, Chg% as a
 *  signed percentage at two decimals in the interface language, Volume compacted in that language. */
function hostPort(format: PriceFormat, punctuation: NumericPunctuation | undefined, locale: string) {
  const price = createPriceFormatter(format, punctuation ? { numericPunctuation: punctuation } : undefined)
  const two = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const percent = new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' })
  const whole = new Intl.NumberFormat(locale)
  const volume = (value: number): string => {
    const at = Math.abs(value)
    if (at >= 1e9) return `${two.format(value / 1e9)}B`
    if (at >= 1e6) return `${two.format(value / 1e6)}M`
    if (at >= 1e3) return `${two.format(value / 1e3)}K`
    return whole.format(Math.round(value))
  }
  return {
    last: (value: number) => price.format(value),
    change: (value: number) => `${value >= 0 ? '+' : ''}${price.format(value)}`,
    changePct: (value: number) => percent.format(value / 100),
    volume,
  }
}

describe('the quote vectors are coherent', () => {
  for (const c of CASES) {
    describe(c.id, () => {
      const grid = c.format.minmov / c.format.pricescale
      const formatter = createPriceFormatter(c.format, c.punctuation ? { numericPunctuation: c.punctuation } : undefined)

      it('carries every quote field', () => {
        expect(Object.keys(c.quote).sort()).toEqual(['ask', 'bid', 'change', 'changePct', 'high', 'low', 'open', 'prevClose', 'timestamp', 'volume', 'last', 'status'].sort())
        expect(DATA_STATUSES).toContain(c.quote.status)
        expect(Number.isInteger(c.quote.timestamp)).toBe(true)
        expect(new Date(c.quote.timestamp * 1000).getUTCFullYear()).toBe(2026)
      })

      it('lands every price on the symbol grid, so each round-trips through the formatter', () => {
        for (const field of PRICES) {
          const value = c.quote[field]
          // On the grid: the nearest step reproduces the value, to the precision a double holds it at.
          expect(Math.round(value / grid) * grid, field).toBeCloseTo(value, 9)
          expect(formatter.parse(formatter.format(value)) ?? Number.NaN, field).toBeCloseTo(value, 10)
        }
      })

      it('derives change and changePct from last and prevClose, never the other way round', () => {
        expect(c.quote.change).toBeCloseTo(c.quote.last - c.quote.prevClose, 10)
        expect(c.quote.changePct).toBe(Number(((c.quote.change / c.quote.prevClose) * 100).toFixed(2)))
      })

      it('keeps the day inside its range and the book around the last', () => {
        expect(c.quote.high).toBeGreaterThanOrEqual(Math.max(c.quote.open, c.quote.last, c.quote.low))
        expect(c.quote.low).toBeLessThanOrEqual(Math.min(c.quote.open, c.quote.last, c.quote.high))
        expect(c.quote.bid).toBeLessThanOrEqual(c.quote.ask)
        expect(c.quote.volume).toBeGreaterThanOrEqual(0)
      })
    })
  }
})

describe('every price field of a quote writes through the one formatter', () => {
  for (const c of CASES) {
    it(`${c.id}: last, bid, ask, open, high, low, prevClose and the signed change`, () => {
      const formatter = createPriceFormatter(c.format, c.punctuation ? { numericPunctuation: c.punctuation } : undefined)
      for (const field of PRICES) expect(formatter.format(c.quote[field]), field).toBe(c.display[field])
      expect(`${c.quote.change >= 0 ? '+' : ''}${formatter.format(c.quote.change)}`).toBe(c.display.change)
      expect(Object.keys(c.display).sort()).toEqual([...PRICES, 'change'].sort())
    })
  }
})

describe('the Watchlist port over the same symbol', () => {
  for (const c of CASES.filter((c) => c.board)) {
    it(`${c.id}: Last and Chg read as the chart writes them, Chg% and Volume keep their own kinds`, () => {
      const port = hostPort(c.format, c.punctuation, 'en')
      expect(port.last(c.quote.last)).toBe(c.display.last)
      expect(port.change(c.quote.change)).toBe(c.display.change)
      expect(port.last(c.quote.last)).toBe(c.board!.last)
      expect(port.change(c.quote.change)).toBe(c.board!.change)
      expect(port.changePct(c.quote.changePct)).toBe(c.board!.changePct)
      expect(port.volume(c.quote.volume)).toBe(c.board!.volume)
      // A percentage and a count are not prices: neither carries the symbol's decimal width.
      expect(port.changePct(c.quote.changePct)).toMatch(/^[+-]\d+\.\d{2}%$/)
      expect(port.volume(c.quote.volume)).not.toBe(createPriceFormatter(c.format).format(c.quote.volume))
    })
  }

  it('every case with a board says every one of the four columns', () => {
    for (const c of CASES.filter((c) => c.board)) expect(Object.keys(c.board!).sort(), c.id).toEqual(['change', 'changePct', 'last', 'volume'])
    expect(CASES.filter((c) => c.board).length).toBeGreaterThanOrEqual(8)
  })

  it('is how the first-party host builds its port: Last and Chg through createPriceFormatter, Chg% a percent, Volume compacted', () => {
    const source = APP_SOURCES['/apps/web/src/widgets/watchlistFormat.ts']
    expect(source).toBeTypeOf('string')
    expect(source).toContain("import { createPriceFormatter, type PriceFormat, type PriceFormatter } from 'quickcharts'")
    expect(source).toContain('last: (symbol, value) => priceOf(symbol).format(value)')
    expect(source).toContain("change: (symbol, value) => `${value >= 0 ? '+' : ''}${priceOf(symbol).format(value)}`")
    expect(source).toMatch(/changePct: \(_symbol, value\) =>\s*deps\.number\(value \/ 100, \{ style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' \}\)/)
    expect(source).toContain('volume: (_symbol, value) => formatVolume(value, deps.number)')
    // The unresolved policy is a declared format, not a guess from the price.
    expect(APP_SOURCES['/apps/web/src/lib/priceFormat.ts']).toContain('export const UNRESOLVED_PRICE_FORMAT: PriceFormat = { pricescale: 100, minmov: 1 }')
  })
})

describe('the Watchlist package imports nothing of Quick Charts', () => {
  it('names no chart package in its source, tests, manifest or README', () => {
    const files = Object.keys(WATCHLIST_FILES)
    expect(files).toContain('/packages/watchlist/package.json')
    expect(files).toContain('/packages/watchlist/src/widget.ts')
    const offenders = files.filter((f) => /quickcharts|lightweight-charts|@trdrs\/chart/.test(WATCHLIST_FILES[f]!))
    expect(offenders).toEqual([])
  })

  it('declares no dependency at all: the port is structural', () => {
    const manifest = JSON.parse(WATCHLIST_FILES['/packages/watchlist/package.json']!) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> }
    expect(manifest.dependencies ?? {}).toEqual({})
    expect(manifest.peerDependencies ?? {}).toEqual({})
  })
})
