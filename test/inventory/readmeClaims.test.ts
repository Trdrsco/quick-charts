// The README's count claims against the registries, so product claims cannot outrun code. Every place
// the README or
// the changelog states a number of styles, indicators, tools, categories, arrangements, presets, zones or
// languages is found by the words around it and held to the registry it describes; and each registry has
// to be claimed at least once, so a count the documentation has stopped stating is a finding too.
//
// The claims are matched in prose and in code blocks alike: a `// 26 tokens` beside an example is a claim
// a reader trusts as much as a sentence.
import { describe, expect, it } from 'vitest'
import { ARRANGEMENTS, BUILT_IN_INDICATORS, BUILT_IN_LOCALES, CHART_STYLES, TIMEFRAME_PRESETS, TIMEZONES } from '../../src/index'
import { drawingTools, TOOL_CATEGORIES } from '../../src/drawings/index'
import changelog from '../../CHANGELOG.md?raw'
import readme from '../../README.md?raw'

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fourteen: 14, sixteen: 16, twenty: 20, 'twenty-one': 21 }
const NUMBER = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen|sixteen|twenty-one|twenty)'
const count = (word: string): number => WORDS[word.toLowerCase()] ?? Number(word)

/** What a number written beside these words claims, and the registry that decides whether it is true.
 *  `stated` says the README has to state the count at least once: true for the six day-one registries
 *  and the tool categories; the language count is listed by `BUILT_IN_LOCALES` rather than stated in
 *  prose, so it is checked only where a document writes it. */
const CLAIMS: { registry: string; actual: number; pattern: RegExp; stated: boolean }[] = [
  { registry: 'chart styles', actual: CHART_STYLES.length, pattern: new RegExp(`\\b${NUMBER}\\s+(?:chart\\s+|main-series\\s+)?styles\\b`, 'gi'), stated: true },
  { registry: 'built-in indicators', actual: BUILT_IN_INDICATORS.length, pattern: new RegExp(`\\b${NUMBER}\\s+built-in\\s+(?:definitions|indicators)\\b`, 'gi'), stated: true },
  { registry: 'drawing tools', actual: drawingTools.all().length, pattern: new RegExp(`\\b${NUMBER}\\s+(?:registered\\s+)?tools\\b`, 'gi'), stated: true },
  { registry: 'tool categories', actual: TOOL_CATEGORIES.length, pattern: new RegExp(`\\b${NUMBER}\\s+categories\\b`, 'gi'), stated: true },
  { registry: 'layout arrangements', actual: ARRANGEMENTS.length, pattern: new RegExp(`\\b${NUMBER}\\s+arrangements\\b`, 'gi'), stated: true },
  { registry: 'preset timeframes', actual: TIMEFRAME_PRESETS.flatMap((g) => g.tokens).length, pattern: new RegExp(`\\b${NUMBER}\\s+(?:presets?|preset tokens|tokens)\\b`, 'gi'), stated: true },
  { registry: 'timezones', actual: TIMEZONES.length, pattern: new RegExp(`\\b${NUMBER}\\s+(?:selectable\\s+)?zones\\b`, 'gi'), stated: true },
  { registry: 'languages', actual: BUILT_IN_LOCALES.length, pattern: new RegExp(`\\b${NUMBER}\\s+(?:built-in\\s+)?languages\\b`, 'gi'), stated: false },
]

const DOCUMENTS = { 'README.md': readme, 'CHANGELOG.md': changelog }

interface Claim {
  document: string
  line: number
  text: string
  claimed: number
}

function claimsOf(pattern: RegExp): Claim[] {
  const out: Claim[] = []
  for (const [document, text] of Object.entries(DOCUMENTS)) {
    text.split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(pattern)) out.push({ document, line: i + 1, text: m[0], claimed: count(m[1]!) })
    })
  }
  return out
}

describe('the count claims in the client documents', () => {
  for (const claim of CLAIMS) {
    const found = claimsOf(claim.pattern)

    it(`${claim.registry}: every stated number is ${claim.actual}`, () => {
      const wrong = found.filter((c) => c.claimed !== claim.actual).map((c) => `${c.document}:${c.line}: "${c.text}" (registry holds ${claim.actual})`)
      expect(wrong).toEqual([])
    })

    if (claim.stated) {
      it(`${claim.registry}: the README states it at least once`, () => {
        expect(found.filter((c) => c.document === 'README.md').length, `no README sentence claims a count of ${claim.registry}`).toBeGreaterThan(0)
      })
    }
  }

  it('reads both documents', () => {
    expect(readme.length).toBeGreaterThan(1000)
    expect(changelog.length).toBeGreaterThan(100)
  })
})
