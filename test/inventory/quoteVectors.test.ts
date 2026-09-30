// Quote fixtures exercise the public formatter over representative market formats.
import { describe, expect, it } from 'vitest'
import { createPriceFormatter, type NumericPunctuation, type PriceFormat } from '../../src/index'
import vectors from '../fixtures/quoteVectors.json'

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
}

const CASES = vectors.cases as unknown as Case[]

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


