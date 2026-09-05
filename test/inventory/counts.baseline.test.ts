// The registry count baselines (seven chart
// styles, 23 built-in indicators, 90 drawings, 55 layouts, 26 preset timeframes, 60 timezones).
// counts.baseline.json records each count with the file it was read from today; this test reads
// those files and counts again. Every registry lives in Quick Charts or one of its bundled seams;
// a registry that moves updates the path in the baseline, and the count itself moves only by a
// conscious decision, because the first release adds nothing to any of them.
// registries.test.ts pins the ids behind each count.
import { describe, expect, it } from 'vitest'
import baseline from './counts.baseline.json'

const SOURCES = import.meta.glob(
  [
    '/packages/chart-drawings/src/registry.ts',
    '/packages/chart-indicators/src/registry.ts',
    '/packages/chart/src/layoutGrid.ts',
    '/packages/chart/src/timeframe.ts',
    '/packages/chart/src/timezones.ts',
    '/packages/chart/src/widget/styles.ts',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
)

/** The text of the array literal declared as `symbol`, bracket-balanced from its first `[`. */
function arrayLiteral(text: string, symbol: string): string {
  const decl = new RegExp(`(?:export )?const ${symbol}\\b[^=]*=\\s*\\[`).exec(text)
  if (!decl) throw new Error(`no array literal declared as ${symbol}`)
  const start = decl.index + decl[0].length - 1
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++
    else if (text[i] === ']' && --depth === 0) return text.slice(start, i + 1)
  }
  throw new Error(`unbalanced array literal for ${symbol}`)
}

/** How each registry is counted inside its literal: one entry per recognized element. */
const COUNTERS: Record<string, (literal: string) => number> = {
  // ['candles', 'hollow', ...]
  CHART_STYLES: (l) => l.match(/'[a-z]+'/g)?.length ?? 0,
  // [smaIndicator, emaIndicator, ...] one definition identifier per line.
  BUILT_IN_INDICATORS: (l) => l.match(/^\s*[a-z]+Indicator,/gm)?.length ?? 0,
  // { unit: 'm', tokens: ['1m', '3m', ...] } per group; a count of tokens across every group.
  TIMEFRAME_PRESETS: (l) => [...l.matchAll(/tokens: \[([^\]]*)\]/g)].reduce((n, m) => n + (m[1]!.match(/'[0-9a-z]+'/g)?.length ?? 0), 0),
  // { id: 'Etc/UTC', city: 'UTC' } per zone.
  TIMEZONES: (l) => l.match(/\{ id: '/g)?.length ?? 0,
  // tool(Ctor, { type: ... }) per registration.
  DEFINITIONS: (l) => l.match(/^\s*tool\(/gm)?.length ?? 0,
  // A('code', rects) per arrangement.
  ARRANGEMENTS: (l) => l.match(/^\s*A\('/gm)?.length ?? 0,
}

describe('the registry count baselines', () => {
  it('records the six day-one registries', () => {
    expect(baseline.registries.map((r) => [r.registry, r.count])).toEqual([
      ['chart styles', 7],
      ['built-in indicators', 23],
      ['preset timeframes', 26],
      ['timezones', 60],
      ['drawing tools', 90],
      ['layout arrangements', 55],
    ])
  })

  for (const r of baseline.registries) {
    it(`${r.registry}: ${r.count} in ${r.file}`, () => {
      const text = SOURCES[`/${r.file}`]
      expect(text, `${r.file} is named by the baseline but absent`).toBeTypeOf('string')
      const count = COUNTERS[r.symbol]
      expect(count, `no counter for ${r.symbol}`).toBeTypeOf('function')
      expect(count!(arrayLiteral(text!, r.symbol))).toBe(r.count)
    })
  }
})
