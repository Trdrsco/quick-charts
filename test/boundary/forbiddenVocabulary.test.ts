// The forbidden vocabulary: words that belong to trading, quotes, a one-shot theme, or the excluded
// chrome may not appear in Quick Charts source.
//
// The first block holds the import boundary (no private package is imported at all) and the
// excluded chrome. Each word group follows with the reason it is forbidden, judged in one block so
// the log names every offending line.
import { describe, expect, it } from 'vitest'
import { CHART_SOURCES, offenderText, scanFiles } from './scan'

/** Package sources without the locale catalogs: a translated string is a message, not a contract,
 *  and the catalogs are held to their own contract in i18n.test.ts. */
const CODE = Object.fromEntries(Object.entries(CHART_SOURCES).filter(([file]) => !file.startsWith('/src/i18n/')))

const lines = (files: Record<string, string>, pattern: RegExp): string[] => scanFiles(files, pattern).map(offenderText)

const REPLAY_INDICATOR_TOKEN = /\breplayWatermark(?:Text)?\b|replay\.watermark|qc-replay-watermark/gi
/** The symbol watermark the chart settings name: the one module that draws it, and the settings,
 *  theme and wiring files that name its parts, its ink and its layer. Nothing else may mention a
 *  watermark. */
const SETTINGS_WATERMARK_FILES = new Set([
  '/src/widget/watermark.ts',
  '/src/widget/chart.ts',
  '/src/widget/chartLook.ts',
  '/src/widget/legend.ts',
  '/src/settings/schema.ts',
  '/src/settings/defaults.ts',
  '/src/theme/palettes.ts',
  '/src/theme/renderer.ts',
  '/src/theme/schema.ts',
])
const watermarkViolations = (files: Record<string, string>): string[] => scanFiles(files, /watermark/i)
  .filter((o) => !SETTINGS_WATERMARK_FILES.has(o.file))
  .filter((o) => o.file !== '/src/chartLegend.ts' || /watermark/i.test(o.text.replace(REPLAY_INDICATOR_TOKEN, '')))
  .map(offenderText)

interface Term {
  term: string
  pattern: RegExp
}

/** The forbidden vocabulary, grouped by the reason it is forbidden. Every pattern is judged against
 *  package code, never the catalogs. */
const TARGET: Record<'trading' | 'symbology' | 'theme', { reason: string; terms: Term[] }> = {
  // Symbology: SymbolInfo owns the price-format facts, and the datafeed serves bars, so a quote
  // board and a quote callback stay out of it.
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
  // Trading: a host's trading lives in the host, over the extension seam, and the layout names an
  // active symbol.
  trading: {
    reason: 'no trading vocabulary or API in the Quick Charts root; the layout names an active symbol',
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
  // The executable theme: the typed token schema and the generated scoped stylesheet carry every
  // theme, so a six-field ChartTheme, a one-shot ResolvedTheme and inline cssText stay out.
  theme: {
    reason: 'the typed token schema and quickcharts/styles.css carry every theme',
    terms: [
      { term: 'ChartTheme', pattern: /\bChartTheme\b/ },
      { term: 'resolveTheme', pattern: /\bresolveTheme\b/ },
      { term: 'ResolvedTheme', pattern: /\bResolvedTheme\b/ },
      { term: 'cssText', pattern: /\bcssText\b/ },
    ],
  },
}

const sourcesFor = (): Record<string, string> => CODE

describe('the import boundary and the excluded chrome', () => {
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
    for (const text of Object.values(CHART_SOURCES)) for (const m of text.matchAll(/from\s+['"](@trdrs\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g)) { if (m[1] !== '@trdrs/quickcharts') specifiers.add(m[1]!) }
    expect([...specifiers].sort()).toEqual([])
    expect(lines(CHART_SOURCES, /from\s+['"](@trdrs\/(?!quickcharts(?:\/|['"]))|tailwind)/)).toEqual([])
  })

  it('keeps the excluded chrome absent while allowing only the fixed replay state indicator', () => {
    expect(lines(CODE, /:root\b/)).toEqual([])
    expect(lines(CODE, /Object Tree|objectTree/)).toEqual([])
    // Every one of these is the replay session's own mark on the plot, built and named in the
    // legend, or the symbol watermark the chart settings name. The count is the canary: a brand
    // watermark, a screenshot stamp or an export overlay would have to move this number, which is
    // the conscious event the guard is here to force.
    const watermark = lines(CODE, /watermark/i)
    expect(watermark).toHaveLength(74)
    expect(watermarkViolations(CODE)).toEqual([])
    // The renderer's text watermark is drawn by the settings' own module and nowhere else.
    expect(lines(CODE, /createTextWatermark/).every((line) => line.startsWith('/src/widget/watermark.ts'))).toBe(true)
    expect(watermarkViolations({
      '/src/chartLegend.ts': "replayWatermark.className = 'qc-replay-watermark'\nconst watermarkOptions = {}",
      '/src/widget/create.ts': 'const brandWatermark = true',
    })).toHaveLength(2)
  })

  it('finds no word of any group in the package code', () => {
    const present = Object.values(TARGET)
      .flatMap((g) => g.terms)
      .filter((t) => lines(sourcesFor(), t.pattern).length > 0)
      .map((t) => t.term)
    expect(present).toEqual([])
  })
})

// One block per group, the whole word list in one assertion so the log names every offending
// line. A group named in SKIPPED_GROUPS runs skipped; the set is empty, so every block runs.
const SKIPPED_GROUPS = new Set<keyof typeof TARGET>()
describe('the forbidden vocabulary, by group', () => {
  for (const [group, { reason, terms }] of Object.entries(TARGET) as [keyof typeof TARGET, (typeof TARGET)[keyof typeof TARGET]][]) {
    const block = SKIPPED_GROUPS.has(group) ? it.skip : it
    block(`${SKIPPED_GROUPS.has(group) ? `[${group}, skipped] ` : ''}${reason}`, () => {
      const offenders = terms.flatMap((t) => lines(sourcesFor(), t.pattern).map((l) => `${t.term}: ${l}`))
      expect(offenders).toEqual([])
    })
  }
})
