// @vitest-environment happy-dom
// The 26 preset timeframes as release inventory (public-chart-library-boundary-plan.md PCL-5 extraction
// ledger: "Preserve the 26 presets, capability-filtered custom intervals"; PCL-6 "Prove ... 26 preset
// timeframes" and "timeframe tokens"). timeframe.test.ts proves the grammar; this file pins the preset
// registry: the five groups and their tokens, that every token reads, labels and measures through the
// grammar, that the capability filter keeps or drops each one, and that each preset is a chart command.
import { describe, expect, it } from 'vitest'
import {
  allowedTimeframes,
  createChartI18n,
  formatTimeframe,
  isIntradayTimeframe,
  parseTimeframe,
  TIMEFRAME_PRESET_TOKENS,
  TIMEFRAME_PRESETS,
  timeframeAllowed,
  timeframeGroupUnit,
  timeframeLabel,
  timeframeSeconds,
} from '../../src/index'
import { fakeWidget } from '../chrome/harness'
import fixture from './ids.fixture.json'

/** The five groups in picker order, each with its tokens smallest first. */
const GROUPS = [
  { unit: 't', tokens: ['1t', '10t', '100t', '1000t'] },
  { unit: 's', tokens: ['1s', '5s', '10s', '15s', '30s', '45s'] },
  { unit: 'm', tokens: ['1m', '3m', '5m', '15m', '30m', '45m'] },
  { unit: 'h', tokens: ['1h', '2h', '3h', '4h'] },
  { unit: 'd', tokens: ['1d', '1w', '1mo', '3mo', '6mo', '12mo'] },
]

const TOKENS = GROUPS.flatMap((g) => g.tokens)

describe('the 26 preset timeframes', () => {
  it('are these five groups, and the fixture agrees', () => {
    expect(TIMEFRAME_PRESETS.map((g) => ({ unit: g.unit, tokens: [...g.tokens] }))).toEqual(GROUPS)
    expect(TOKENS).toHaveLength(26)
    expect([...TOKENS].sort()).toEqual(fixture.registries.timeframes)
    expect([...TIMEFRAME_PRESET_TOKENS].sort()).toEqual(fixture.registries.timeframes)
  })

  for (const group of GROUPS) {
    describe(`the ${group.unit} group`, () => {
      for (const token of group.tokens) {
        it(`${token} reads, writes back, measures, labels, and groups under ${group.unit}`, () => {
          const parsed = parseTimeframe(token)
          expect(parsed).not.toBeNull()
          expect(formatTimeframe(parsed!)).toBe(token)
          expect(timeframeSeconds(parsed!)).toBeGreaterThan(0)
          expect(timeframeGroupUnit(parsed!.unit)).toBe(group.unit)
          expect(isIntradayTimeframe(token)).toBe(group.unit !== 'd')
          const label = timeframeLabel(createChartI18n().t, token)
          expect(label.length).toBeGreaterThan(0)
          expect(label).not.toBe(token)
        })
      }

      it('is in size order', () => {
        const seconds = group.tokens.map((token) => timeframeSeconds(parseTimeframe(token)!))
        expect([...seconds].sort((a, b) => a - b)).toEqual(seconds)
      })
    })
  }
})

describe('the capability filter over the presets', () => {
  it('keeps all 26 when neither the feed nor the symbol restricts', () => {
    expect(allowedTimeframes(TOKENS, {})).toEqual(TOKENS)
    expect(allowedTimeframes(TOKENS, { resolutions: [], supportedResolutions: [] })).toEqual(TOKENS)
  })

  it('keeps only what both lists admit, in preset order', () => {
    expect(allowedTimeframes(TOKENS, { resolutions: ['1m', '1h', '1d'], supportedResolutions: ['1h', '1d', '1w'] })).toEqual(['1h', '1d'])
    expect(timeframeAllowed('5m', { resolutions: ['1m', '1h'] })).toBe(false)
    expect(timeframeAllowed('1h', { resolutions: ['1m', '1h'] })).toBe(true)
  })
})

describe('each preset is a chart command', () => {
  it('registers chart.timeframe.<token> for all 26, labeled in the chart language, beside the open setter', () => {
    const w = fakeWidget()
    try {
      const t = createChartI18n().t
      for (const token of TOKENS) {
        const spec = w.commands.list().find((s) => s.id === `chart.timeframe.${token}`)
        expect(spec, token).toBeDefined()
        expect(spec!.scope).toBe('chart')
        expect(spec!.labelText).toBe(timeframeLabel(t, token))
      }
      expect(w.commands.list().find((s) => s.id === 'chart.timeframe.set')).toBeDefined()
    } finally {
      w.dispose()
    }
  })

  it('switches through the registry, refuses the current token, and refuses one the feed cannot serve', () => {
    const w = fakeWidget({ capabilities: { resolutions: ['1m', '1h'] } })
    try {
      expect(w.commands.execute('chart.timeframe.1m').kind).toBe('unavailable')
      expect(w.commands.execute('chart.timeframe.5m').kind).toBe('unavailable')
      expect(w.commands.execute('chart.timeframe.1h').kind).toBe('ok')
      expect(w.chart.state.timeframe).toBe('1h')
      expect(w.commands.execute('chart.timeframe.set', '5m').kind).toBe('ok')
      expect(w.chart.state.timeframe).toBe('1h')
    } finally {
      w.dispose()
    }
  })
})
