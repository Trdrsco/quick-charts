// The one price formatter, against the exact multi-asset vectors in test/fixtures/quoteVectors.json.
// Every case proves three things at once: the display string, the parse that returns the same
// number, and the declared precision. The fixture is the shared artifact — the private facade's
// quote work reads the same file rather than writing a second set of numbers.
import { describe, expect, it } from 'vitest'
import { createPriceFormatter, type NumericPunctuation } from '../src/priceFormatter'
import { parseTickBands, tickBandFor, type PriceFormat } from '../src/symbology'
import vectors from './fixtures/quoteVectors.json'

interface Case {
  id: string
  symbol: string
  what: string
  format: PriceFormat
  punctuation?: NumericPunctuation
  precision: number
  prices: { value: number; display: string }[]
  quote: { last: number; change: number; changePct: number; volume: number }
}

const CASES = vectors.cases as unknown as Case[]

describe('the fixture', () => {
  it('covers every market shape the plan names', () => {
    expect(CASES.map((c) => c.id)).toEqual([
      'equities-decimal',
      'equities-decimal-grouped',
      'crypto-satoshi',
      'fx-pips',
      'fx-pips-jpy',
      'cme-decimal-futures',
      'treasury-thirty-seconds',
      'treasury-quarter-of-a-thirty-second',
      'variable-tick-bands',
    ])
  })

  it('gives every case a symbol, a description, prices and quote values', () => {
    for (const c of CASES) {
      expect(c.symbol.length, c.id).toBeGreaterThan(0)
      expect(c.what.length, c.id).toBeGreaterThan(0)
      expect(c.prices.length, c.id).toBeGreaterThan(0)
      expect(Number.isFinite(c.quote.last), c.id).toBe(true)
    }
  })
})

describe('createPriceFormatter over the pinned vectors', () => {
  for (const c of CASES) {
    describe(`${c.id}: ${c.what}`, () => {
      const formatter = createPriceFormatter(c.format, c.punctuation ? { numericPunctuation: c.punctuation } : undefined)

      it('declares the pinned precision', () => {
        expect(formatter.precision()).toBe(c.precision)
      })

      for (const { value, display } of c.prices) {
        it(`writes ${value} as ${display}`, () => {
          expect(formatter.format(value)).toBe(display)
        })
        it(`parses ${display} back to ${value}`, () => {
          expect(formatter.parse(display) ?? Number.NaN).toBeCloseTo(value, 10)
        })
      }
    })
  }
})

describe('precision never comes from the price', () => {
  it('writes a small and a large price at the same width for a fixed-format symbol', () => {
    const cents = createPriceFormatter({ pricescale: 100, minmov: 1 })
    expect(cents.format(0.5)).toBe('0.50')
    expect(cents.format(68284.3)).toBe('68284.30')
  })

  it('keeps eight decimals on a satoshi symbol however large the price is', () => {
    const satoshi = createPriceFormatter({ pricescale: 100000000, minmov: 1 })
    expect(satoshi.format(1)).toBe('1.00000000')
    expect(satoshi.format(0.00000001)).toBe('0.00000001')
  })

  it('changes width only where the SYMBOL declared a tick ladder', () => {
    const laddered = createPriceFormatter({ pricescale: 10000, minmov: 1, variableTickSize: '0.0001 1 0.001 10 0.01' })
    const flat = createPriceFormatter({ pricescale: 10000, minmov: 1 })
    expect(laddered.format(0.5)).toBe('0.5000')
    expect(laddered.format(50)).toBe('50.00')
    expect(flat.format(0.5)).toBe('0.5000')
    expect(flat.format(50)).toBe('50.0000')
  })
})

describe('punctuation', () => {
  it('defaults to a dot and no grouping, the reference default', () => {
    expect(createPriceFormatter({ pricescale: 100, minmov: 1 }).format(1234567.5)).toBe('1234567.50')
  })

  it('takes the decimal sign from a locale when one is given', () => {
    expect(createPriceFormatter({ pricescale: 100, minmov: 1 }, { locale: 'de-DE' }).format(1234.5)).toBe('1234,50')
  })

  it('lets an explicit punctuation beat the locale', () => {
    const formatter = createPriceFormatter({ pricescale: 100, minmov: 1 }, { locale: 'de-DE', numericPunctuation: { decimalSign: '.' } })
    expect(formatter.format(1234.5)).toBe('1234.50')
  })

  it('leaves a fractional price unpunctuated by the decimal sign', () => {
    const formatter = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true }, { locale: 'de-DE' })
    expect(formatter.format(110.5)).toBe("110'16")
  })
})

describe('parse', () => {
  const cents = createPriceFormatter({ pricescale: 100, minmov: 1 })

  it('refuses text that is not a price', () => {
    for (const text of ['', '   ', 'abc', '1.2.3', '12px', '--1']) expect(cents.parse(text), text).toBeNull()
  })

  it('accepts a signed price and surrounding space', () => {
    expect(cents.parse('  -12.50 ')).toBe(-12.5)
    expect(cents.parse('+12.50')).toBe(12.5)
  })

  it('refuses a fractional part the symbol cannot hold', () => {
    const thirtySeconds = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true })
    expect(thirtySeconds.parse("110'32")).toBeNull()
    expect(thirtySeconds.parse('110.5')).toBeNull()
    const quarters = createPriceFormatter({ pricescale: 128, minmov: 1, minmove2: 4, fractional: true })
    expect(quarters.parse("110'16'4")).toBeNull()
    expect(quarters.parse("110'16'3") ?? Number.NaN).toBeCloseTo(110.5234375, 10)
  })
})

describe('tick bands', () => {
  it('reads the reference ladder string', () => {
    expect(parseTickBands('0.01 10 0.02 100 0.05')).toEqual([
      { size: 0.01, below: 10 },
      { size: 0.02, below: 100 },
      { size: 0.05, below: Number.POSITIVE_INFINITY },
    ])
  })

  it('reads a bare tick as one unbounded band', () => {
    expect(parseTickBands('0.25')).toEqual([{ size: 0.25, below: Number.POSITIVE_INFINITY }])
  })

  it('returns nothing for a ladder it cannot read, rather than half of one', () => {
    for (const bad of ['', '0.01 10 0.02 100', '0.01 100 0.02 10 0.05', 'a b c', '0 10 0.02']) {
      expect(parseTickBands(bad), bad).toEqual([])
    }
  })

  it('places a price in its band by the declared bounds, on the absolute value', () => {
    const bands = parseTickBands('0.01 10 0.02 100 0.05')
    expect(tickBandFor(bands, 9.99)?.size).toBe(0.01)
    expect(tickBandFor(bands, 10)?.size).toBe(0.02)
    expect(tickBandFor(bands, 1000)?.size).toBe(0.05)
    expect(tickBandFor(bands, -9.99)?.size).toBe(0.01)
    expect(tickBandFor([], 1)).toBeNull()
  })
})

describe('edge values', () => {
  it('writes nothing for a value that is not a number', () => {
    const cents = createPriceFormatter({ pricescale: 100, minmov: 1 })
    expect(cents.format(Number.NaN)).toBe('')
    expect(cents.format(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('never writes a negative zero', () => {
    const cents = createPriceFormatter({ pricescale: 100, minmov: 1 })
    expect(cents.format(-0.001)).toBe('0.00')
    const thirtySeconds = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true })
    expect(thirtySeconds.format(-0.001)).toBe("0'00")
  })

  it('writes a whole-number format with no decimal part', () => {
    expect(createPriceFormatter({ pricescale: 1, minmov: 1 }).format(1234.6)).toBe('1235')
  })
})
