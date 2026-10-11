// @vitest-environment happy-dom
// The settings ladder on a mounted chart, the viewer's own leaves it saves, and Apply defaults.
//
// Three facts hold this together. The tree resolves as the theme's factory values, then the host's
// `settings` option, then the viewer's own leaves. Saved CHART CONTENT is the only place an authored
// look persists, and it carries the leaves the viewer named and nothing else: the theme's values and
// the host's partial resolve fresh wherever the content lands. And a settings edit is a content
// change like any other, so it marks the chart dirty and an autosaving host writes it down, which
// is what makes a reset survive a reopen without a preference key of its own.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { PartialChartSettings } from '../../src/settings/schema'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { DARK_THEME, LIGHT_THEME } from '../../src/theme/palettes'
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
  settings?: PartialChartSettings
  storage?: ChartStorage
  access?: AccessPolicy
  arrangement?: '2v'
  subsession?: 'regular' | 'extended'
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
    ...(options.settings ? { settings: options.settings } : {}),
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.access ? { access: options.access } : {}),
    ...(options.arrangement ? { layout: { arrangement: options.arrangement } } : {}),
    ...(options.subsession ? { preferences: { subsession: options.subsession } } : {}),
  })
  mounted.push(widget)
  return widget
}

/** The settings record of a chart's own serialized content. */
const authored = (widget: ChartWidget, index = 0): Record<string, unknown> =>
  JSON.parse(widget.charts()[index]!.saveLoad.serialize().content).settings

describe('the settings ladder', () => {
  it('opens on the theme factory values, then the host partial, then the viewer leaves', () => {
    const widget = mountWidget({ theme: 'dark', settings: { canvas: { background: '#0b0b0b' }, candles: { downColor: '#ff0055' } } })
    const chart = widget.activeChart()
    const settings = chart.settings()
    // The floor: the dark theme's own values, and the factory leaves that do not follow a theme.
    expect(settings.canvas.verticalGridColor).toBe(DARK_THEME['scale.grid'])
    expect(settings.canvas.scaleTextColor).toBe('#b8b8b8')
    expect(settings.priceLabels.countdown).toBe(true)
    expect(settings.canvas.marginRight).toBe(10)
    // The host's rung over it.
    expect(settings.canvas.background).toBe('#0b0b0b')
    expect(settings.candles.downColor).toBe('#ff0055')
    // The viewer's rung over both.
    chart.applySettings({ canvas: { background: '#123123' } })
    expect(chart.settings().canvas.background).toBe('#123123')
    expect(chart.settings().candles.downColor).toBe('#ff0055')
  })

  it('takes only leaves the tree has, holding values their leaf can hold', () => {
    const widget = mountWidget()
    const chart = widget.activeChart()
    chart.applySettings({
      candles: { upColor: 'not a color', downColor: '#010203' },
      canvas: { marginTop: 'ten', unknownLeaf: true },
      unknownSection: { a: 1 },
    } as never)
    expect(chart.settings().candles.upColor).toBe(DARK_THEME['series.up'])
    expect(chart.settings().candles.downColor).toBe('#010203')
    expect(chart.settings().canvas.marginTop).toBe(10)
    expect(authored(widget)).toEqual({ candles: { downColor: '#010203' } })
  })
})

describe('the authored settings', () => {
  it('carry only the leaves the viewer named, never the theme floor or the host palette', () => {
    const widget = mountWidget({ theme: 'dark', settings: { canvas: { background: '#0b0b0b' }, candles: { downColor: '#ff0055' } } })
    const chart = widget.activeChart()
    // Nothing authored yet: a fully resolved look on screen, an empty record in content.
    expect(authored(widget)).toEqual({})
    expect(chart.settings().canvas.background).toBe('#0b0b0b')
    chart.applySettings({ candles: { upColor: '#ffffff' } })
    expect(authored(widget)).toEqual({ candles: { upColor: '#ffffff' } })
  })

  it('marks the chart dirty exactly once for a settings edit, and once for the reset', async () => {
    vi.useFakeTimers()
    const widget = mountWidget()
    await vi.advanceTimersByTimeAsync(1000)
    const needed = vi.fn()
    widget.on('saveNeeded', needed)
    widget.commands.execute('chart.settings.apply', { settings: { candles: { upColor: '#ffffff' } } })
    await vi.advanceTimersByTimeAsync(1000)
    expect(needed).toHaveBeenCalledTimes(1)
    widget.commands.execute('chart.settings.reset')
    await vi.advanceTimersByTimeAsync(1000)
    expect(needed).toHaveBeenCalledTimes(2)
  })

  it('restores an authored leaf and still lets a later theme switch restyle the leaves nobody named', () => {
    const source = mountWidget({ theme: 'dark' })
    source.activeChart().applySettings({ candles: { upColor: '#ffffff' } })
    const content = source.activeChart().saveLoad.serialize().content
    const widget = mountWidget({ theme: 'dark' })
    widget.activeChart().saveLoad.restore(content)
    const chart = widget.activeChart()
    expect(chart.settings().candles.upColor).toBe('#ffffff')
    widget.theme.setMode('light')
    // The named leaf is the viewer's and stands; the unnamed background follows the new theme.
    expect(chart.settings().candles.upColor).toBe('#ffffff')
    expect(chart.settings().canvas.background).toBe(LIGHT_THEME['canvas.background'])
    expect(chart.settings().canvas.scaleTextColor).toBe('#0f0f0f')
  })
})

describe('apply defaults', () => {
  it('puts the theme values back in light and in dark, and returns the scale to normal', () => {
    for (const mode of ['light', 'dark'] as const) {
      const widget = mountWidget({ theme: mode })
      const chart = widget.activeChart()
      const baseline = JSON.parse(JSON.stringify(chart.settings()))
      chart.applySettings({ canvas: { background: '#010203', verticalGrid: false }, candles: { upColor: '#123456' } })
      chart.setScaleMode('log')
      expect(chart.settings().canvas.background).toBe('#010203')
      expect(widget.commands.execute('chart.settings.reset')).toEqual({ kind: 'ok' })
      expect(chart.settings()).toEqual(baseline)
      expect(chart.scaleMode()).toBe('normal')
    }
  })

  it('keeps a custom host palette and drops only the viewer leaves over it', () => {
    const brand: PartialChartSettings = { canvas: { background: '#0b0b0b' }, candles: { upColor: '#00ff88', downColor: '#ff0055' } }
    const widget = mountWidget({ settings: brand })
    const chart = widget.activeChart()
    chart.applySettings({ candles: { upColor: '#ffffff' }, canvas: { background: '#123123' } })
    chart.resetSettings()
    const after = chart.settings()
    expect(after.canvas.background).toBe('#0b0b0b')
    expect(after.candles.upColor).toBe('#00ff88')
    expect(after.candles.downColor).toBe('#ff0055')
    // The brand was never the viewer's, so it was never written into content to begin with.
    expect(authored(widget)).toEqual({})
  })

  it('clears the authored leaves from content, so restoring the reset reads theme and host values', () => {
    const brand: PartialChartSettings = { candles: { downColor: '#ff0055' } }
    const source = mountWidget({ settings: brand })
    source.activeChart().applySettings({ candles: { upColor: '#ffffff' } })
    expect(authored(source)).toEqual({ candles: { upColor: '#ffffff' } })
    source.commands.execute('chart.settings.reset')
    expect(authored(source)).toEqual({})
    const content = source.activeChart().saveLoad.serialize().content
    const fresh = mountWidget({ settings: brand })
    fresh.activeChart().saveLoad.restore(content)
    const after = fresh.activeChart().settings()
    expect(after.candles.upColor).not.toBe('#ffffff')
    expect(after.candles.downColor).toBe('#ff0055')
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
    chart.applySettings({ canvas: { verticalGrid: false } })
    widget.commands.execute('chart.settings.reset')
    expect(chart.style()).toBe('line')
    expect(chart.timeframe()).toBe('5m')
    expect(chart.timezone()).toBe('America/New_York')
    expect(chart.visibleRange()).toEqual(range)
    expect(storage.get('quickcharts.style.v1')).toBe('line')
    expect(storage.get('quickcharts.timezone.v1')).toBe('America/New_York')
    // The settings keep no preference key of their own: saved content is their only authority.
    expect(storage.keys().some((key) => key.includes('settings') || key.includes('appearance'))).toBe(false)
  })

  it('is per chart: resetting the active one leaves the other chart in the layout styled', () => {
    const widget = mountWidget({ arrangement: '2v' })
    const [first, second] = widget.charts()
    first!.applySettings({ candles: { upColor: '#111111' } })
    second!.applySettings({ candles: { upColor: '#222222' } })
    widget.layout.setActive(0)
    widget.commands.execute('chart.settings.reset')
    expect(first!.settings().candles.upColor).not.toBe('#111111')
    expect(second!.settings().candles.upColor).toBe('#222222')
    expect(authored(widget, 0)).toEqual({})
    expect(authored(widget, 1)).toEqual({ candles: { upColor: '#222222' } })
  })

  it('answers denied under a refusing access policy and changes nothing', () => {
    const widget = mountWidget({ access: { command: (id) => id !== 'chart.settings.reset' } })
    const chart = widget.activeChart()
    chart.applySettings({ candles: { upColor: '#abcabc' } })
    chart.setScaleMode('log')
    expect(widget.commands.available('chart.settings.reset')).toBe(false)
    expect(widget.commands.execute('chart.settings.reset')).toEqual({ kind: 'denied' })
    expect(chart.settings().candles.upColor).toBe('#abcabc')
    expect(chart.scaleMode()).toBe('log')
  })
})

describe('the trading hours', () => {
  it('are the chart subsession: regular hours by default, and a choice anywhere is the viewer setting', () => {
    const widget = mountWidget()
    const chart = widget.activeChart()
    expect(chart.settings().symbol.session).toBe('regular')
    expect(chart.subsession()).toBe('regular')
    chart.applySettings({ symbol: { session: 'allHours' } })
    expect(chart.subsession()).toBe('extended')
    expect(authored(widget)).toEqual({ symbol: { session: 'allHours' } })
  })

  it('open on a choice this device stored before, without writing it again', () => {
    const storage = memoryChartStorage()
    storage.set('quickcharts.subsession.v1', 'extended')
    const widget = mountWidget({ storage })
    const chart = widget.activeChart()
    expect(chart.settings().symbol.session).toBe('extended')
    // The seed is the host's rung, so nothing was authored and a reset keeps it.
    expect(authored(widget)).toEqual({})
    chart.applySettings({ symbol: { session: 'regular' } })
    expect(storage.get('quickcharts.subsession.v1')).toBe('extended')
    chart.resetSettings()
    expect(chart.settings().symbol.session).toBe('extended')
  })

  it('follow the host first-run preference when nothing is stored', () => {
    const chart = mountWidget({ subsession: 'extended' }).activeChart()
    expect(chart.settings().symbol.session).toBe('extended')
  })
})
