// How a symbol is written on screen, for any market an integrator's feed serves. An integrator's
// datafeed decides what markets exist, so the rule is pinned here against the shapes `SymbolInfo`
// and `SymbolRow` admit rather than against whatever one backend happens to answer with.
import { describe, expect, it } from 'vitest'
import type { SymbolRow } from '../src/datafeed'
import { bareTicker, symbolLabel, symbolNames } from '../src/symbolLabel'
import type { SymbolInfo } from '../src/symbology'

/** A resolved symbol carrying only the facts the naming rule reads. */
const info = (over: Partial<SymbolInfo> & Pick<SymbolInfo, 'ticker' | 'type'>): SymbolInfo => ({
  name: '',
  description: '',
  exchange: '',
  listedExchange: '',
  supportedResolutions: [],
  timezone: 'Etc/UTC',
  session: '24x7',
  dataStatus: 'streaming',
  volumePrecision: 2,
  format: { pricescale: 100, minmov: 1 },
  ...over,
})

/** A search row carrying only the facts the naming rule reads. */
const row = (over: Partial<SymbolRow> & Pick<SymbolRow, 'symbol' | 'type'>): SymbolRow => ({ name: '', exchange: '', ...over })

const title = (symbol: SymbolInfo | SymbolRow | string): string => symbolNames(symbol).title

describe('a pair market reads as base and quote, in the codes it trades in', () => {
  it('composes a forex pair from the ticker and the quote currency', () => {
    expect(title(info({ ticker: 'FX:EURUSD', type: 'forex', currencyCode: 'USD' }))).toBe('EUR / USD')
  })

  it('follows the ticker rather than a convention, so an inverted quotation reads as written', () => {
    expect(title(info({ ticker: 'FX:USDJPY', type: 'forex', currencyCode: 'JPY' }))).toBe('USD / JPY')
    expect(title(info({ ticker: 'FX:JPYUSD', type: 'forex', currencyCode: 'USD' }))).toBe('JPY / USD')
  })

  it('never spells a currency out, even when the feed titles the symbol that way', () => {
    const euro = info({ ticker: 'FX:EURUSD', type: 'forex', currencyCode: 'USD', name: 'Euro', description: 'Euro / US Dollar' })
    expect(title(euro)).toBe('EUR / USD')
    const yen = info({ ticker: 'FX:USDJPY', type: 'forex', currencyCode: 'JPY', name: 'Japanese Yen', description: 'US Dollar / Japanese Yen' })
    expect(title(yen)).toBe('USD / JPY')
  })

  it('sheds a quote the ticker already carries instead of repeating it', () => {
    expect(title(info({ ticker: 'BINANCE:BTCUSDT', type: 'crypto', currencyCode: 'USDT' }))).toBe('BTC / USDT')
  })

  it('keeps a ticker that does not carry its quote', () => {
    expect(title(info({ ticker: 'HYPERLIQUID:BTC', type: 'crypto', currencyCode: 'USDC' }))).toBe('BTC / USDC')
  })

  it('reads the market type case-insensitively, since the token is the venue\'s own', () => {
    expect(title(info({ ticker: 'FX:EURUSD', type: 'Forex', currencyCode: 'USD' }))).toBe('EUR / USD')
  })

  it('reads a ticker already written as a slash pair without any currency to help it', () => {
    expect(symbolNames(info({ ticker: 'BTC/USD', type: 'crypto' }))).toEqual({ mark: 'BTCUSD', title: 'BTC / USD', description: 'BTC / USD' })
  })
})

describe('a market that is not a pair is never written as one', () => {
  it('leaves a share alone though it is quoted in a currency', () => {
    const apple = info({ ticker: 'NASDAQ:AAPL', type: 'stock', currencyCode: 'USD', name: 'AAPL', description: 'Apple Inc.' })
    expect(title(apple)).toBe('AAPL')
  })

  it('leaves a future alone', () => {
    const es = info({ ticker: 'CME:ESZ2026', type: 'futures', currencyCode: 'USD', name: 'ESZ2026', description: 'E-mini S&P 500 Dec 2026' })
    expect(title(es)).toBe('ESZ2026')
  })
})

describe('the feed\'s own words, and which face each one fills', () => {
  it('takes a short name the feed distinguished from its description as the title', () => {
    expect(title(info({ ticker: 'CME:ESZ2026', type: 'futures', name: 'ESZ2026', description: 'E-mini S&P 500 Dec 2026' }))).toBe('ESZ2026')
  })

  it('falls back to the ticker when the short name merely repeats the description', () => {
    const echoed = info({ ticker: 'HYPERLIQUID:BTC', type: 'crypto', name: 'Bitcoin perpetual', description: 'Bitcoin perpetual' })
    expect(title(echoed)).toBe('BTC')
  })

  it('falls back to the ticker when the feed states no name at all', () => {
    expect(title(info({ ticker: 'XETR:SAP', type: 'stock' }))).toBe('SAP')
  })

  it('writes the long description beside the mark, and the ticker where the feed gave none', () => {
    const es = info({ ticker: 'CME:ESZ2026', type: 'futures', name: 'ESZ2026', description: 'E-mini S&P 500 Dec 2026' })
    expect(symbolNames(es)).toEqual({ mark: 'ESZ2026', title: 'ESZ2026', description: 'E-mini S&P 500 Dec 2026' })
    expect(symbolNames(info({ ticker: 'XETR:SAP', type: 'stock' })).description).toBe('SAP')
  })
})

describe('a search row is named by the same rule', () => {
  it('writes a pair market as its closed pair beside its spaced pair', () => {
    const perp = row({ symbol: 'HYPERLIQUID:ETH', name: 'Ethereum perpetual', exchange: 'Hyperliquid', type: 'crypto', currencyCode: 'USDC' })
    expect(symbolNames(perp)).toEqual({ mark: 'ETHUSDC', title: 'ETH / USDC', description: 'ETH / USDC' })
  })

  it('keeps the feed\'s one name as the description of a market that is not a pair, and never invents a quote', () => {
    const apple = row({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc', exchange: 'NASDAQ', type: 'stock', currencyCode: 'USD' })
    expect(symbolNames(apple)).toEqual({ mark: 'AAPL', title: 'AAPL', description: 'Apple Inc' })
  })

  it('falls back to the bare ticker for a row without a name', () => {
    expect(symbolNames(row({ symbol: 'XETR:SAP', type: 'stock' }))).toEqual({ mark: 'SAP', title: 'SAP', description: 'SAP' })
  })
})

describe('before a symbol resolves, the ticker stands on its own', () => {
  it('never guesses a quote from the symbol alone', () => {
    expect(symbolNames('HYPERLIQUID:ETH')).toEqual({ mark: 'ETH', title: 'ETH', description: 'ETH' })
    expect(symbolNames('BINANCE:BTCUSDT').mark).toBe('BTCUSDT')
  })
})

describe('the venue prefix is feed identity, not display', () => {
  it('sheds a well-formed venue prefix', () => {
    expect(bareTicker('NASDAQ:AAPL')).toBe('AAPL')
  })

  it('leaves a symbol that is not VENUE:TICKER whole, so a spread keeps its expression', () => {
    expect(bareTicker('CME:ES1!-CME:NQ1!')).toBe('CME:ES1!-CME:NQ1!')
    expect(symbolNames(info({ ticker: 'CME:ES1!-CME:NQ1!', type: 'spread' }))).toEqual({ mark: 'CME:ES1!-CME:NQ1!', title: 'CME:ES1!-CME:NQ1!', description: 'CME:ES1!-CME:NQ1!' })
    expect(symbolNames(row({ symbol: 'ES-NQ', name: 'ES-NQ', type: 'spread' }))).toEqual({ mark: 'ES-NQ', title: 'ES-NQ', description: 'ES-NQ' })
  })
})

describe('the mark and the title are two faces of one symbol', () => {
  it('writes the mark slashless where the title writes the pair', () => {
    const pair = info({ ticker: 'HYPERLIQUID:BTC', type: 'crypto', currencyCode: 'USDC' })
    expect(symbolLabel('BTC/USDC')).toBe('BTCUSDC')
    expect(symbolNames(pair)).toEqual({ mark: 'BTCUSDC', title: 'BTC / USDC', description: 'BTC / USDC' })
  })

  it('leaves a venue-prefixed pair whole in the mark: the prefix pattern admits no slash', () => {
    expect(symbolLabel('HYPERLIQUID:BTC/USDC')).toBe('HYPERLIQUID:BTC/USDC')
  })
})
