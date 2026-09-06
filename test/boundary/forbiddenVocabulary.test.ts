// The forbidden vocabulary: words that belong to trading, quotes, the retired theme, or the V1
// exclusions may not survive in the free chart's source.
//
// Same shape as the dependency fixture. AS-BUILT pins what is true today: no private package is
// imported at all, and the exclusions that are already absent stay absent. PRESENT pins the target
// words that ARE here today, so the target list cannot rot against a source that moved; every
// removal has landed, so it is empty. TARGET carries the gate itself, one block per group of words.
import { describe, expect, it } from 'vitest'
import { CHART_SOURCES, offenderText, scanFiles } from './scan'

/** Package sources without the locale catalogs: a translated string is a message, not a contract,
 *  and the catalogs are held to their own contract in i18n.test.ts. */
const CODE = Object.fromEntries(Object.entries(CHART_SOURCES).filter(([file]) => !file.startsWith('/src/i18n/')))

const lines = (files: Record<string, string>, pattern: RegExp): string[] => scanFiles(files, pattern).map(offenderText)

interface Term {
  term: string
  pattern: RegExp
}

/** The target vocabulary, grouped by the removal that forbids it. Every pattern is judged against
 *  package code, never the catalogs. */
const TARGET: Record<'trading' | 'symbology' | 'theme', { reason: string; terms: Term[] }> = {
  // The datafeed narrowing and symbology. Landed: SymbolInfo owns the price-format facts and the
  // quote board and the onQuote callback are gone from the free datafeed; the words stay listed so
  // a return is caught.
  symbology: {
    reason: 'SymbolInfo owns price-format facts; no L1 or quote-board API in Quick Charts',
    terms: [
      { term: 'pricePrecision', pattern: /\bpricePrecision\b/ },
      { term: 'tick: on the symbol type', pattern: /^\s*tick\??:\s*number/ },
      { term: 'onQuote', pattern: /\bonQuote\b/ },
      { term: 'getQuotes', pattern: /\bgetQuotes\b/ },
      { term: 'subscribeQuotes', pattern: /\bsubscribeQuotes\b/ },
    ],
  },
  // The chart-trading extraction, and the rename of the layout's trading symbol. Landed:
  // the block below runs; the words stay listed so a return is caught.
  trading: {
    reason: 'trading vocabulary and APIs leave the free root; the layout names an active symbol',
    terms: [
      { term: 'createOrderTicket', pattern: /\bcreateOrderTicket\b/ },
      { term: 'TicketOrderType', pattern: /\bTicketOrderType\b/ },
      { term: 'ChartTicketApi', pattern: /\bChartTicketApi\b/ },
      { term: 'ChartExecutionsApi', pattern: /\bChartExecutionsApi\b/ },
      { term: 'accountPanel', pattern: /\baccountPanel\b/ },
      { term: 'executionMarks', pattern: /\bexecutionMarks\b/ },
      { term: 'tradingSymbol', pattern: /\btradingSymbol\b|\bonTradingSymbol\b/ },
    ],
  },
  // The executable theme: the six-field ChartTheme, one-shot ResolvedTheme, and inline cssText
  // gave way to the typed token schema and the generated scoped stylesheet. Landed: the block below
  // runs; the words stay listed so a return is caught.
  theme: {
    reason: 'the typed token schema and quickcharts/styles.css replace the one-shot theme',
    terms: [
      { term: 'ChartTheme', pattern: /\bChartTheme\b/ },
      { term: 'resolveTheme', pattern: /\bresolveTheme\b/ },
      { term: 'ResolvedTheme', pattern: /\bResolvedTheme\b/ },
      { term: 'cssText', pattern: /\bcssText\b/ },
    ],
  },
}

const sourcesFor = (): Record<string, string> => CODE

describe('the forbidden vocabulary, as built', () => {
  it('has package sources to read', () => {
    expect(Object.keys(CODE).length).toBeGreaterThan(30)
    expect(CODE['/src/index.ts']).toBeTypeOf('string')
    expect(CODE['/src/internal/drawings/index.ts']).toBeTypeOf('string')
  })

  it('imports no path outside this repository', () => {
    expect(lines(CHART_SOURCES, /from\s+['"][^'"]*\/apps\/|from\s+['"]\.\.\/\.\.\/\.\.\/apps\//)).toEqual([])
  })

  it('imports no private package: the seams are source modules of this one package', () => {
    const specifiers = new Set<string>()
    for (const text of Object.values(CHART_SOURCES)) for (const m of text.matchAll(/from\s+['"](@trdrs\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g)) specifiers.add(m[1]!)
    expect([...specifiers].sort()).toEqual([])
    expect(lines(CHART_SOURCES, /from\s+['"](@trdrs\/|tailwind)/)).toEqual([])
  })

  it('keeps the V1 exclusions absent: no :root selector, no Object Tree, no watermark', () => {
    expect(lines(CODE, /:root\b/)).toEqual([])
    expect(lines(CODE, /Object Tree|objectTree/)).toEqual([])
    expect(lines(CODE, /\bwatermark/i)).toEqual([])
  })

  it('names every target word that is present today, so a removal is a conscious event', () => {
    const present = Object.values(TARGET)
      .flatMap((g) => g.terms)
      .filter((t) => lines(sourcesFor(), t.pattern).length > 0)
      .map((t) => t.term)
    expect(present).toEqual([])
  })
})

// TARGET. One block per group, the whole word list in one assertion so the log names every
// surviving line. Delete the group from LANDED_LATER when its removal lands; remove the words from
// the PRESENT pin. Every group has landed, so every block runs.
const LANDED_LATER = new Set<keyof typeof TARGET>()
describe('the forbidden vocabulary (target)', () => {
  for (const [group, { reason, terms }] of Object.entries(TARGET) as [keyof typeof TARGET, (typeof TARGET)[keyof typeof TARGET]][]) {
    const block = LANDED_LATER.has(group) ? it.skip : it
    block(`${LANDED_LATER.has(group) ? `[${group}, not yet landed] ` : ''}${reason}`, () => {
      const offenders = terms.flatMap((t) => lines(sourcesFor(), t.pattern).map((l) => `${t.term}: ${l}`))
      expect(offenders).toEqual([])
    })
  }
})
