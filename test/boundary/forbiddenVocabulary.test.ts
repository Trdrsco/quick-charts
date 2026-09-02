// The forbidden vocabulary (public-chart-library-boundary-plan.md PCL-1 and the PCL-5 exclusion
// ledger; clean-seams-entry-packets.md section 4.4). Words that belong to trading, quotes, the
// retired theme, or the V1 exclusions may not survive in the free chart's source.
//
// Same shape as the dependency fixture. AS-BUILT pins what is true today: no app source path is
// imported, no private organ beyond the four the manifest names, and the exclusions that are
// already absent stay absent. PRESENT pins the target words that ARE here today, so the target
// list cannot rot against a source that moved. TARGET carries the gate itself, one skipped block
// per owning stream; the stream deletes the `.skip` and moves its words out of PRESENT.
import { describe, expect, it } from 'vitest'
import { APP_CHART_SOURCES, CHART_SOURCES, offenderText, scanFiles } from './scan'

/** Package sources without the locale catalogs: a translated string is a message, not a contract,
 *  and the catalog split is its own PCL-4 item. */
const CODE = Object.fromEntries(Object.entries(CHART_SOURCES).filter(([file]) => !file.startsWith('/packages/chart/src/i18n/')))

const lines = (files: Record<string, string>, pattern: RegExp): string[] => scanFiles(files, pattern).map(offenderText)

interface Term {
  term: string
  pattern: RegExp
  /** Where the word lives today and where it is judged: the package, or the app chart tree. */
  scope: 'package' | 'app'
}

/** The target vocabulary, grouped by the stream that removes it. Every pattern is judged against
 *  package code (or the app chart tree for the two toolbar words), never the catalogs. */
const TARGET: Record<'W1-A' | 'W2-A' | 'W3-A' | 'W5-A', { reason: string; terms: Term[] }> = {
  // PCL-4 datafeed narrowing and symbology. Landed: SymbolInfo owns the price-format facts and the
  // quote board and the onQuote callback are gone from the free datafeed; the words stay listed so
  // a return is caught.
  'W2-A': {
    reason: 'SymbolInfo owns price-format facts; no L1 or quote-board API in Quick Charts',
    terms: [
      { term: 'pricePrecision', pattern: /\bpricePrecision\b/, scope: 'package' },
      { term: 'tick: on the symbol type', pattern: /^\s*tick\??:\s*number/, scope: 'package' },
      { term: 'onQuote', pattern: /\bonQuote\b/, scope: 'package' },
      { term: 'getQuotes', pattern: /\bgetQuotes\b/, scope: 'package' },
      { term: 'subscribeQuotes', pattern: /\bsubscribeQuotes\b/, scope: 'package' },
    ],
  },
  // PCL-3 chart-trading extraction, and the PCL-4 rename of the layout's trading symbol. Landed:
  // the block below runs; the words stay listed so a return is caught.
  'W1-A': {
    reason: 'trading vocabulary and APIs leave the free root; the layout names an active symbol',
    terms: [
      { term: 'createOrderTicket', pattern: /\bcreateOrderTicket\b/, scope: 'package' },
      { term: 'TicketOrderType', pattern: /\bTicketOrderType\b/, scope: 'package' },
      { term: 'ChartTicketApi', pattern: /\bChartTicketApi\b/, scope: 'package' },
      { term: 'ChartExecutionsApi', pattern: /\bChartExecutionsApi\b/, scope: 'package' },
      { term: 'accountPanel', pattern: /\baccountPanel\b/, scope: 'package' },
      { term: 'executionMarks', pattern: /\bexecutionMarks\b/, scope: 'package' },
      { term: 'tradingSymbol', pattern: /\btradingSymbol\b|\bonTradingSymbol\b/, scope: 'package' },
    ],
  },
  // PCL-5 executable theme: the six-field ChartTheme, one-shot ResolvedTheme, and inline cssText
  // give way to the typed token schema and the generated scoped stylesheet.
  'W3-A': {
    reason: 'the typed token schema and quickcharts/styles.css replace the one-shot theme',
    terms: [
      { term: 'ChartTheme', pattern: /\bChartTheme\b/, scope: 'package' },
      { term: 'resolveTheme', pattern: /\bresolveTheme\b/, scope: 'package' },
      { term: 'ResolvedTheme', pattern: /\bResolvedTheme\b/, scope: 'package' },
      { term: 'cssText', pattern: /\bcssText\b/, scope: 'package' },
    ],
  },
  // PCL-5 app convergence: the package drawing toolbar hides chart-owned drawings and indicators
  // only; the app's trades hide mode and its position/order override writes are deleted.
  'W5-A': {
    reason: 'the toolbar hides chart-owned drawings and indicators only',
    terms: [
      { term: 'HideMode', pattern: /\bHideMode\b/, scope: 'app' },
      { term: "'trades' hide mode", pattern: /'trades'/, scope: 'app' },
    ],
  },
}

const sourcesFor = (scope: Term['scope']): Record<string, string> => (scope === 'package' ? CODE : APP_CHART_SOURCES)

describe('the forbidden vocabulary, as built', () => {
  it('has package and app sources to read', () => {
    expect(Object.keys(CODE).length).toBeGreaterThan(30)
    expect(Object.keys(APP_CHART_SOURCES).length).toBeGreaterThan(20)
    expect(APP_CHART_SOURCES['/apps/web/src/chart/DrawingToolbar.tsx']).toBeTypeOf('string')
  })

  it('imports no app source path from packages/chart/src', () => {
    expect(lines(CHART_SOURCES, /from\s+['"][^'"]*\/apps\/|from\s+['"]\.\.\/\.\.\/\.\.\/apps\//)).toEqual([])
  })

  it('imports exactly the two internal seams the manifest names today, and nothing else private', () => {
    const specifiers = new Set<string>()
    for (const text of Object.values(CHART_SOURCES)) for (const m of text.matchAll(/from\s+['"](@trdrs\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g)) specifiers.add(m[1]!)
    expect([...specifiers].sort()).toEqual(['@trdrs/chart-drawings', '@trdrs/chart-indicators'])
    expect(
      lines(CHART_SOURCES, /from\s+['"](@trdrs\/(ui|engine-client|engine-wire|chart-engine|watchlist|news|trading-core|community|library|order-ticket|broker|account-manager|chart-trading|i18n)|tailwind)/),
    ).toEqual([])
  })

  it('keeps the V1 exclusions absent: no :root selector, no Object Tree, no watermark', () => {
    expect(lines(CODE, /:root\b/)).toEqual([])
    expect(lines(CODE, /Object Tree|objectTree/)).toEqual([])
    expect(lines(CODE, /\bwatermark/i)).toEqual([])
  })

  it('names every target word that is present today, so a removal is a conscious event', () => {
    const present = Object.values(TARGET)
      .flatMap((g) => g.terms)
      .filter((t) => lines(sourcesFor(t.scope), t.pattern).length > 0)
      .map((t) => t.term)
    expect(present).toEqual([
      'ChartTheme',
      'resolveTheme',
      'ResolvedTheme',
      'cssText',
      'HideMode',
      "'trades' hide mode",
    ])
  })
})

// TARGET. One block per stream, the whole word list in one assertion so the log names every
// surviving line. Delete the stream from LANDED_LATER when it lands; remove the words from the
// PRESENT pin. A landed stream's block runs.
const LANDED_LATER = new Set<keyof typeof TARGET>(['W3-A', 'W5-A'])
describe('the forbidden vocabulary (target)', () => {
  for (const [stream, { reason, terms }] of Object.entries(TARGET) as [keyof typeof TARGET, (typeof TARGET)[keyof typeof TARGET]][]) {
    const block = LANDED_LATER.has(stream) ? it.skip : it
    block(`${LANDED_LATER.has(stream) ? `[${stream} unskips] ` : ''}${reason}`, () => {
      const offenders = terms.flatMap((t) => lines(sourcesFor(t.scope), t.pattern).map((l) => `${t.term}: ${l}`))
      expect(offenders).toEqual([])
    })
  }
})
