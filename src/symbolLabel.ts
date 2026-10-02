// How a symbol is WRITTEN on screen: one rule, three faces, kept in one file so they cannot drift.
// The toolbar pill wears the compact mark, the legend wears the title, and a search row wears the
// mark beside the description. Every face drops the venue prefix, which is feed identity rather
// than anything a viewer reads, and every surface that names a market, in this package or over it,
// reads the same faces from `symbolNames`.
import type { SymbolRow } from './datafeed'
import type { SymbolInfo } from './symbology'

/** The ticker inside a feed symbol. Only a well-formed `VENUE:TICKER` sheds its prefix; a spread
 *  expression, or anything else the pattern does not admit, is its own label and passes through. */
export function bareTicker(symbol: string): string {
  return /^[A-Za-z][A-Za-z0-9._-]*:([A-Za-z0-9][A-Za-z0-9._!]*)$/.exec(symbol)?.[1] ?? symbol
}

/** A ticker written as a slash pair (`BTC/USD`): catalog identity that already says what it is
 *  priced in. A reciprocal expression (`1/ES`) starts with a digit and is not one. */
const SLASH_PAIR = /^[A-Za-z][A-Za-z0-9.]*\/[A-Za-z][A-Za-z0-9.]*$/

/** Compact presentation of one symbol. Feed identity and spread expressions stay untouched. */
export function symbolLabel(symbol: string): string {
  const ticker = bareTicker(symbol)
  return SLASH_PAIR.test(ticker) ? ticker.replace('/', '') : ticker
}

/** The markets whose symbols ARE a pair: one thing priced in another, where the ticker alone says
 *  what is being bought but not what it is priced in. Those read as `BASE / QUOTE`.
 *
 *  Every other market is deliberately absent. Nearly every symbol carries a `currencyCode`, so the
 *  gate cannot be "has a currency": a share quoted in dollars is not a pair, and `AAPL / USD` would
 *  claim one that does not exist. */
const PAIR_MARKETS = new Set(['crypto', 'forex'])

/** `BASE / QUOTE` for a pair market, or null for anything that is not one.
 *
 *  The quote comes from the feed's own currency; a ticker that already carries it as a suffix
 *  (`BTCUSDT`, `EURUSD`) sheds it rather than repeating it, and the base is whatever the ticker
 *  states, so an inverted quotation reads the way it is written. */
export function pairLabel(ticker: string, type: string, currencyCode: string | undefined): string | null {
  const quote = currencyCode?.trim()
  if (!quote || !PAIR_MARKETS.has(type.toLowerCase())) return null
  const bare = bareTicker(ticker)
  const base = bare.length > quote.length && bare.toUpperCase().endsWith(quote.toUpperCase()) ? bare.slice(0, -quote.length) : bare
  return base && base.toUpperCase() !== quote.toUpperCase() ? `${base} / ${quote}` : null
}

/** The three ways one market is written, from one rule. */
export interface SymbolNames {
  /** The compact mark a label wears at a glance: a pair closed up (`BTCUSDC`, `EURUSD`), otherwise
   *  the bare ticker (`ES1!`, `AAPL`). A spread expression is its own mark, operators and all. */
  mark: string
  /** The title a reading wears: a pair spaced (`BTC / USDC`), otherwise the feed's short name where
   *  it stated one apart from the description, otherwise the bare ticker. */
  title: string
  /** The description beside a mark: a pair spaced, otherwise the feed's long description, otherwise
   *  the bare ticker, so a market never repeats its own mark for want of a name. */
  description: string
}

/** The facts the rule reads, in one shape whatever the surface holds. */
interface Facts {
  ticker: string
  type: string
  shortName: string
  longName: string
  currencyCode: string | undefined
}

function factsOf(symbol: SymbolInfo | SymbolRow | string): Facts {
  if (typeof symbol === 'string') return { ticker: symbol, type: '', shortName: '', longName: '', currencyCode: undefined }
  // A search row states one name, the long one; a resolved symbol states a short name beside its
  // description, and a short name that merely repeats the description has not been given.
  if ('symbol' in symbol) return { ticker: symbol.symbol, type: symbol.type, shortName: '', longName: symbol.name.trim(), currencyCode: symbol.currencyCode }
  const name = symbol.name.trim()
  const description = symbol.description.trim()
  return { ticker: symbol.ticker, type: symbol.type, shortName: name !== description ? name : '', longName: description, currencyCode: symbol.currencyCode }
}

/** How a market is named, from a resolved `SymbolInfo`, a search row, or the feed symbol alone
 *  before either has landed.
 *
 *  A pair market reads as `BTC / USDC` or `EUR / USD`, both sides in the codes the market itself
 *  trades in, never a spelled-out currency name. The quote comes from `currencyCode`, and a ticker
 *  written as a slash pair (`BTC/USD`) needs no currency to say so. Before a symbol resolves there
 *  is no pair to write, so the bare ticker stands on its own rather than guessing at a quote. A
 *  market that is not a pair keeps the feed's own words: the short name as its title, the long
 *  description beside its mark. */
export function symbolNames(symbol: SymbolInfo | SymbolRow | string): SymbolNames {
  const facts = factsOf(symbol)
  if (facts.type.toLowerCase() === 'spread') return { mark: facts.ticker, title: facts.ticker, description: facts.ticker }
  const bare = bareTicker(facts.ticker)
  const pair = pairLabel(facts.ticker, facts.type, facts.currencyCode) ?? (SLASH_PAIR.test(bare) ? bare.replace('/', ' / ') : null)
  return {
    mark: pair ? pair.replace(' / ', '') : symbolLabel(facts.ticker),
    title: pair ?? (facts.shortName || bare),
    description: pair ?? (facts.longName || bare),
  }
}
