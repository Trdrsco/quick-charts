// The exclusion ledger, as a source and packed-artifact scan (public-chart-library-boundary-plan.md
// PCL-6: "A source scan rejects app React components, Tailwind, @trdrs/ui, engine clients, private
// product imports, hard-coded storage keys, and default trdrs URLs in Quick Charts. Prove no legacy
// tick-plus-precision contract, magnitude-based price formatter, duplicate snap implementation, Object
// Tree placeholder, watermark placeholder, app account control, or app-shell fullscreen command survives
// in the package ... Source and packed scans reject the retired `trades` hide mode and its position/order
// override writes").
//
// forbiddenVocabulary.test.ts holds the import boundary, the retired API names and the two words of the
// legacy symbology contract (the float tick and its precision field); noDefaultTrdrsUrl the URLs and
// credentials; theme/packaging the stylesheet. This file holds the rest of the ledger, one named shape
// per line, judged against package CODE (comments stripped, the catalogs left out) and, for the retired
// hide mode, against every packed JavaScript file as well. Every pattern names what it catches, so an
// offender reads as a finding rather than a regex.
import { describe, expect, it } from 'vitest'
import { CHART_SOURCES, isSourceMap, offenderText, packedFileList, packedText, scanFiles, scanLines } from './scan'

/** Package sources without the locale catalogs: a translated string is a message, not a contract. */
const CODE_FILES = Object.entries(CHART_SOURCES).filter(([file]) => !file.startsWith('/packages/chart/src/i18n/'))

/** A source with its comments removed, so a comment that names a shape to explain its absence is not
 *  read as the shape. Block comments and line comments; string literals are left alone, which is the
 *  honest direction: a shape hidden in a string is still shipped. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')
}

const CODE: Record<string, string> = Object.fromEntries(CODE_FILES.map(([file, text]) => [file, stripComments(text)]))

interface Shape {
  name: string
  pattern: RegExp
}

const sweep = (files: Record<string, string>, shapes: readonly Shape[]): string[] =>
  shapes.flatMap((shape) => scanFiles(files, shape.pattern).map((o) => `${shape.name}: ${offenderText(o)}`))

// ── The framework and product boundary ──────────────────────────────────────────────────────────
const APP_FRAMEWORK: readonly Shape[] = [
  { name: 'a React import', pattern: /from\s+['"]react(-dom)?(\/[^'"]*)?['"]/ },
  { name: 'a React hook', pattern: /\buse(State|Effect|Memo|Callback|Ref|Context|Reducer)\s*\(/ },
  // JSX writes `className="..."` or `className={...}`; the chrome's DOM helpers assign `element.className`.
  { name: 'a JSX class attribute', pattern: /\bclassName=(?=[{"'])/ },
  { name: 'a Tailwind directive or config', pattern: /@apply\b|\btailwind/i },
  { name: 'the first-party design system', pattern: /@trdrs\/ui\b/ },
  { name: 'an engine client', pattern: /@trdrs\/(engine-client|engine-wire|chart-engine)\b|\bengineApi\b|\bmarketStream\b/ },
  { name: 'a private product organ', pattern: /@trdrs\/(broker|order-ticket|account-manager|chart-trading|watchlist|news|trading-core|community|library|i18n)\b/ },
]

// ── Storage: every viewer key flows through the port; the package assumes no browser store ─────────
const BROWSER_STORAGE: readonly Shape[] = [
  { name: 'a browser storage API', pattern: /\b(localStorage|sessionStorage|indexedDB)\b/ },
  { name: 'a cookie read or write', pattern: /document\.cookie/ },
]

// ── Symbology: the datafeed's five facts, never a precision guessed from the price ─────────────────
const LEGACY_SYMBOLOGY: readonly Shape[] = [
  { name: 'a magnitude ternary choosing decimals', pattern: /\b(price|value|last|close|p|v)\s*(<|>=?)\s*\d+(\.\d+)?\s*\?\s*\d+\s*:\s*\d+/ },
  { name: 'a locale number formatter writing a price', pattern: /\btoLocaleString\s*\(|maximumFractionDigits|minimumFractionDigits/ },
  { name: 'a significant-figure cap', pattern: /\btoPrecision\s*\(/ },
]

// ── The magnet snaps in the drawing seam; the chart keeps no snap of its own ───────────────────────
const DUPLICATE_SNAP: readonly Shape[] = [
  // `snapshot` and `snapped` are words of their own; a snap function is `snap`, `snapTo...`, `snapPrice`.
  { name: 'a snap function declared in the chart', pattern: /\b(function|const)\s+snap(?!shot|ped)[A-Za-z]*\s*[=(]/ },
  { name: 'a magnet implementation outside the seam', pattern: /\bfunction\s+magnet[A-Za-z]*\s*\(/ },
]

// ── The V1 exclusions and the app-shell controls ──────────────────────────────────────────────────
const V1_EXCLUSIONS: readonly Shape[] = [
  { name: 'an Object Tree', pattern: /Object Tree|\bobjectTree\b/ },
  { name: 'a watermark', pattern: /\bwatermark/i },
  { name: 'an account or profile control', pattern: /\b(logout|signOut|signIn|accountMenu|profileMenu|userMenu|avatar)\b/i },
  { name: 'a document-level fullscreen call', pattern: /document\.(documentElement|body)\.requestFullscreen\s*\(/ },
]

// ── The retired trades hide mode and the override writes that served it ───────────────────────────
const RETIRED_TRADES: readonly Shape[] = [
  { name: 'the trades hide mode', pattern: /\bhideTrades\b|\bshowTrades\b|['"]trades['"]/ },
  { name: 'a position or order visibility override write', pattern: /\b(positionsVisible|ordersVisible|showPositions|showOrders|tradingOverlay|positionLines|orderLines)\b/ },
]

describe('the exclusion ledger against package code', () => {
  it('has code to read, with its comments stripped', () => {
    expect(Object.keys(CODE).length).toBeGreaterThan(30)
    expect(CODE['/packages/chart/src/storage.ts']).not.toContain('localStorage') // the comment that names it is stripped
    const stripped = stripComments("const url = 'https://example.test' // a comment\n/* block */ const x = 1")
    expect(stripped).toContain("const url = 'https://example.test'")
    expect(stripped).toContain('const x = 1')
    expect(stripped).not.toContain('comment')
    expect(stripped).not.toContain('block')
  })

  it('carries no app framework, design system, engine client or private product', () => {
    expect(sweep(CODE, APP_FRAMEWORK)).toEqual([])
  })

  it('assumes no browser store: every viewer key flows through the storage port', () => {
    expect(sweep(CODE, BROWSER_STORAGE)).toEqual([])
  })

  it('keeps every magnitude formatter and locale number writer out of the price path', () => {
    expect(sweep(CODE, LEGACY_SYMBOLOGY)).toEqual([])
  })

  it('keeps one snap: the magnet in the drawing seam, and one level grid in the chart', () => {
    expect(sweep(CODE, DUPLICATE_SNAP)).toEqual([])
    // The level menu snaps a pointed-at price to the symbol grid; that is the one place the chart
    // rounds a price to a step, and it is not the magnet.
    const gridRounding = scanFiles(CODE, /Math\.round\([^)]*\/\s*(step|tick|minMove)\)/)
    expect(gridRounding.map((o) => o.file)).toEqual(['/packages/chart/src/widget/menu.ts'])
  })

  it('carries no Object Tree, watermark, account control or document-level fullscreen', () => {
    expect(sweep(CODE, V1_EXCLUSIONS)).toEqual([])
  })

  it('carries neither the trades hide mode nor its override writes', () => {
    expect(sweep(CODE, RETIRED_TRADES)).toEqual([])
  })
})

describe('the exclusion ledger against the packed artifact', () => {
  const packed = packedFileList().filter((p) => /^dist\/.*\.js$/.test(p) && !isSourceMap(p))

  it('reads every packed JavaScript file', () => {
    for (const path of packed) expect(packedText(path), path).not.toBeNull()
  })

  it('ships neither the trades hide mode nor its override writes', () => {
    const offenders: string[] = []
    for (const path of packed) {
      const text = packedText(path)
      if (text === null) continue
      for (const shape of RETIRED_TRADES) offenders.push(...scanLines(path, text, shape.pattern).map((o) => `${shape.name}: ${o.file}:${o.line}`))
    }
    expect(offenders).toEqual([])
  })

  it('ships no browser store assumption and no app framework', () => {
    const offenders: string[] = []
    for (const path of packed) {
      const text = packedText(path)
      if (text === null) continue
      for (const shape of [...BROWSER_STORAGE, ...APP_FRAMEWORK]) offenders.push(...scanLines(path, text, shape.pattern).map((o) => `${shape.name}: ${o.file}:${o.line}`))
    }
    expect(offenders).toEqual([])
  })
})
