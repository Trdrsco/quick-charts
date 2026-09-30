// @vitest-environment happy-dom
// Reset defaults, and the authored appearance layer it resets.
//
// Two facts hold this together. Saved CHART CONTENT is the only place an authored look persists,
// and it carries the leaves the viewer named and nothing else: the theme floor and the host's
// constructor partial resolve fresh wherever the content lands. And an appearance edit is a content
// change like any other, so it marks the chart dirty and an autosaving host writes it down, which
// is what makes a reset survive a reopen without a preference key of its own.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { AccessPolicy } from '../../src/widget/options'
import { fakeRenderer, lastRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

void fakeRenderer
void lastRenderer

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}
const QUIET = {
  features: { drawings: false, replay: false, sessions: false, compare: false },
  ui: { contextMenu: false, navigation: false, topBar: false, bottomBar: false, toasts: false },
} as const

const mounted: ChartWidget[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

function mountWidget(options: {
  theme?: 'light' | 'dark'
  appearance?: { appearance: Record<string, unknown> }
  storage?: ChartStorage
  access?: AccessPolicy
  arrangement?: '2v'
} = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({
    container,
    datafeed,
    symbol: 'ES',
    timeframe: '1m',
    ...QUIET,
    ...(options.theme ? { theme: { mode: options.theme } } : {}),
    ...(options.appearance ? { appearance: options.appearance as never } : {}),
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.access ? { access: options.access } : {}),
    ...(options.arrangement ? { layout: { arrangement: options.arrangement } } : {}),
  })
  mounted.push(widget)
  return widget
}

/** The appearance record of a chart's own serialized content. */
const authored = (widget: ChartWidget, index = 0): Record<string, unknown> =>
  JSON.parse(widget.charts()[index]!.saveLoad.serialize().content).appearance

describe('the authored appearance layer', () => {
  it('carries only the leaves the viewer named, never the theme floor or the host palette', () => {
    const widget = mountWidget({ theme: 'dark', appearance: { appearance: { background: '#0b0b0b', downColor: '#ff0055' } } })
    const chart = widget.activeChart()
    // Nothing authored yet: a fully resolved look on screen, an empty record in content.
    expect(authored(widget)).toEqual({})
    expect(chart.appearance().appearance.background).toBe('#0b0b0b')
    chart.applyAppearance({ appearance: { upColor: '#ffffff' } })
    expect(authored(widget)).toEqual({ upColor: '#ffffff' })
  })

  it('marks the chart dirty exactly once for an appearance edit, and once for the reset', async () => {
    vi.useFakeTimers()
    const widget = mountWidget()
    await vi.advanceTimersByTimeAsync(1000)
    const needed = vi.fn()
    widget.on('saveNeeded', needed)
    widget.activeChart().applyAppearance({ appearance: { upColor: '#ffffff' } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(needed).toHaveBeenCalledTimes(1)
    widget.commands.execute('chart.appearance.reset')
    await vi.advanceTimersByTimeAsync(1000)
    expect(needed).toHaveBeenCalledTimes(2)
  })

  it('restores an authored leaf and still lets a later theme switch restyle the leaves nobody named', () => {
    const source = mountWidget({ theme: 'dark' })
    source.activeChart().applyAppearance({ appearance: { upColor: '#ffffff' } })
    const content = source.activeChart().saveLoad.serialize().content
    const widget = mountWidget({ theme: 'dark' })
    widget.activeChart().saveLoad.restore(content)
    const chart = widget.activeChart()
    expect(chart.appearance().appearance.upColor).toBe('#ffffff')
    const darkBackground = chart.appearance().appearance.background
    widget.theme.setMode('light')
    // The named leaf is the viewer's and stands; the unnamed background follows the new theme.
    expect(chart.appearance().appearance.upColor).toBe('#ffffff')
    expect(chart.appearance().appearance.background).not.toBe(darkBackground)
  })
})

describe('reset defaults', () => {
  it('puts the theme baseline back in light and in dark, and returns the scale to normal', () => {
    for (const mode of ['light', 'dark'] as const) {
      const widget = mountWidget({ theme: mode })
      const chart = widget.activeChart()
      const baseline = { ...chart.appearance().appearance }
      chart.applyAppearance({ appearance: { background: '#010203', upColor: '#123456', grid: false } })
      chart.setScaleMode('log')
      expect(chart.appearance().appearance.background).toBe('#010203')
      expect(widget.commands.execute('chart.appearance.reset')).toEqual({ kind: 'ok' })
      expect(chart.appearance().appearance).toEqual(baseline)
      expect(chart.scaleMode()).toBe('normal')
    }
  })

  it('keeps a custom host palette and drops only the viewer layer over it', () => {
    const brand = { appearance: { background: '#0b0b0b', upColor: '#00ff88', downColor: '#ff0055' } }
    const widget = mountWidget({ appearance: brand })
    const chart = widget.activeChart()
    chart.applyAppearance({ appearance: { upColor: '#ffffff', background: '#123123' } })
    widget.commands.execute('chart.appearance.reset')
    const after = chart.appearance().appearance
    expect(after.background).toBe('#0b0b0b')
    expect(after.upColor).toBe('#00ff88')
    expect(after.downColor).toBe('#ff0055')
    // The brand was never the viewer's, so it was never written into content to begin with.
    expect(authored(widget)).toEqual({})
  })

  it('clears the authored leaves from content, so restoring the reset reads theme and host defaults', () => {
    const brand = { appearance: { downColor: '#ff0055' } }
    const source = mountWidget({ appearance: brand })
    source.activeChart().applyAppearance({ appearance: { upColor: '#ffffff' } })
    expect(authored(source)).toEqual({ upColor: '#ffffff' })
    source.commands.execute('chart.appearance.reset')
    expect(authored(source)).toEqual({})
    const content = source.activeChart().saveLoad.serialize().content
    const fresh = mountWidget({ appearance: brand })
    fresh.activeChart().saveLoad.restore(content)
    const after = fresh.activeChart().appearance().appearance
    expect(after.upColor).not.toBe('#ffffff')
    expect(after.downColor).toBe('#ff0055')
  })

  it('leaves the viewport and every unrelated preference alone', () => {
    const storage = memoryChartStorage()
    const widget = mountWidget({ storage })
    const chart = widget.activeChart()
    chart.setStyle('line')
    chart.setTimeframe('5m')
    chart.setTimezone('America/New_York')
    chart.setVisibleRange({ from: 1_700_000_060, to: 1_700_000_600 })
    const range = chart.visibleRange()
    chart.applyAppearance({ appearance: { grid: false } })
    widget.commands.execute('chart.appearance.reset')
    expect(chart.style()).toBe('line')
    expect(chart.timeframe()).toBe('5m')
    expect(chart.timezone()).toBe('America/New_York')
    expect(chart.visibleRange()).toEqual(range)
    expect(storage.get('quickcharts.style.v1')).toBe('line')
    expect(storage.get('quickcharts.timezone.v1')).toBe('America/New_York')
    // Appearance keeps no preference key of its own: saved content is its only authority.
    expect(storage.keys().some((key) => key.includes('appearance'))).toBe(false)
  })

  it('is per chart: resetting the active one leaves the other chart in the layout styled', () => {
    const widget = mountWidget({ arrangement: '2v' })
    const [first, second] = widget.charts()
    first!.applyAppearance({ appearance: { upColor: '#111111' } })
    second!.applyAppearance({ appearance: { upColor: '#222222' } })
    widget.layout.setActive(0)
    widget.commands.execute('chart.appearance.reset')
    expect(first!.appearance().appearance.upColor).not.toBe('#111111')
    expect(second!.appearance().appearance.upColor).toBe('#222222')
    expect(authored(widget, 0)).toEqual({})
    expect(authored(widget, 1)).toEqual({ upColor: '#222222' })
  })

  it('answers denied under a refusing access policy and changes nothing', () => {
    const widget = mountWidget({ access: { command: (id) => id !== 'chart.appearance.reset' } })
    const chart = widget.activeChart()
    chart.applyAppearance({ appearance: { upColor: '#abcabc' } })
    chart.setScaleMode('log')
    expect(widget.commands.available('chart.appearance.reset')).toBe(false)
    expect(widget.commands.execute('chart.appearance.reset')).toEqual({ kind: 'denied' })
    expect(chart.appearance().appearance.upColor).toBe('#abcabc')
    expect(chart.scaleMode()).toBe('log')
  })
})
