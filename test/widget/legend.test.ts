// @vitest-environment happy-dom
// THE LEGEND, driven through a real chart instance over a scripted datafeed with the renderer
// replaced by a fake. What is pinned here is that the legend is the CHART's: the identity and the
// venue it shows are the ones `resolve()` answered, every price it writes comes out of the chart's
// one symbol formatter, the reading follows the crosshair and falls back to the last painted bar,
// each chart of a layout keeps its own reading, a study takes a row with its own controls, and a
// replay window is read at its cursor and at its edges.
//
// Independent chart tiles are distinct from renderer study panes; both lifecycles are tested.
import { CHART_STYLES } from '../../src/widget/styles'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChartInstance, type ChartInstance } from '../../src/widget/chart'
import { createIndicatorCatalog } from '../../src/widget/indicators'
import { createChart } from '../../src/widget/create'
import { createCommandRegistry } from '../../src/widget/commands'
import { resolveFeatures, resolveUi } from '../../src/widget/planes'
import { createThemeController } from '../../src/theme/controller'
import { createChartI18n } from '../../src/i18n'
import { memoryChartStorage } from '../../src/storage'
import { emptyDoors, type SearchRequest } from '../../src/ui/chrome/doors'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createPriceFormatter } from '../../src/priceFormatter'
import { COLLAPSED_H, MAIN_MIN_H } from '../../src/panePlan'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { PriceFormat, SymbolInfo } from '../../src/symbology'
import type { FeatureConfig, UiConfig } from '../../src/widget/options'
import { lastRenderer, renderers, type FakeRenderer } from './rendererFake'
import { resolveMarkPainters } from '../../src/markPainters'
import { ownIcons } from '../ownIcons'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const DECIMAL: PriceFormat = { pricescale: 100, minmov: 25 }
const THIRTY_SECONDS: PriceFormat = { pricescale: 32, minmov: 1, fractional: true }

const info = (over: Partial<SymbolInfo> = {}): SymbolInfo => ({
  ticker: 'CME_MINI:ES1!',
  name: 'ESZ2026',
  description: 'E-mini S&P 500 Dec 2026',
  exchange: 'CME',
  listedExchange: 'CME',
  type: 'futures',
  supportedResolutions: [],
  timezone: 'America/New_York',
  session: '1700-1600',
  dataStatus: 'streaming',
  volumePrecision: 0,
  format: DECIMAL,
  ...over,
})

/** An ascending minute series whose closes climb by a quarter point. */
const series = (count: number, first = 4500, start = 1_700_000_000): FeedBar[] =>
  Array.from({ length: count }, (_, i) => {
    const c = first + i * 0.25
    return { t: start + i * 60, o: c - 0.25, h: c + 0.5, l: c - 0.75, c, v: 10 + i }
  })

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

it('keeps host activity in the native legend across status updates without creating an indicator', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ES', timeframe: '1m', features: { drawings: false } })
  mounted.push(widget)
  await settle()
  const chart = widget.activeChart()
  chart.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find(definition => definition.id === 'sma')! })
  const manage = vi.fn()
  const activity = { id: 'strategy:one', title: 'TrendVol', status: 'running', settingsLabel: 'Manage strategy', onSettings: manage }
  widget.chrome.legendRows(chart.id, [activity])
  const row = container.querySelector<HTMLElement>('[data-legend-row="host:strategy:one"]')!
  expect(row.closest('.qc-legend')).not.toBeNull()
  expect(container.querySelectorAll('[data-legend-row]')).toHaveLength(2)
  expect(chart.indicators.get()).toHaveLength(1)
  expect(row.textContent).toContain('running')
  expect([...row.querySelectorAll('button')].filter(button => !button.hidden).map(button => button.getAttribute('aria-label'))).toEqual(['Manage strategy'])
  row.querySelector<HTMLButtonElement>('button[aria-label="Manage strategy"]')!.click()
  expect(manage).toHaveBeenCalledOnce()
  widget.chrome.legendRows(chart.id, [{ ...activity, status: 'Paused · Feed disconnected' }])
  expect(container.querySelector('[data-legend-row="host:strategy:one"]')).toBe(row)
  expect(row.textContent).toContain('Paused · Feed disconnected')
  widget.chrome.legendRows(chart.id, [])
  expect(row.isConnected).toBe(false)
  expect(chart.indicators.get()).toHaveLength(1)
})

it.each([true, false])('keeps the default Compare door in the toolbar only (shown=%s), without disabling commands', async (compareDoor) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ES', timeframe: '1m', features: { drawings: false }, ui: { topBar: { compare: compareDoor } } })
  mounted.push(widget)
  await settle()
  expect(container.querySelectorAll('button[aria-label="Compare or add symbol"]')).toHaveLength(compareDoor ? 1 : 0)
  widget.commands.execute('chart.compare.add', 'NQ')
  await expect.poll(() => container.querySelector('[data-legend-row="cmp:NQ"]')).not.toBeNull()
  expect(widget.activeChart().compare.list().map(entry => entry.symbol)).toEqual(['NQ'])
  const row = container.querySelector<HTMLElement>('[data-legend-row="cmp:NQ"]')!
  expect(row).not.toBeNull()
  expect(row.querySelector<HTMLButtonElement>('button[aria-label="Change symbol"]')!.hidden).toBe(false)
  row.querySelector<HTMLButtonElement>('button[aria-label="Remove compare"]')!.click()
  expect(widget.activeChart().compare.list()).toEqual([])
})

it('keeps inactive-tile compare readings independent and routes a keyboard row action to its focused tile', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const offset = renderers.length
  const bars = series(6)
  const widget = createChart({ container, datafeed: scriptedFeed({ bars }), symbol: 'ES', timeframe: '1m', features: { drawings: false }, layout: { arrangement: '2h' } })
  mounted.push(widget)
  await settle()
  const [first, second] = widget.charts()
  first!.compare.add('NQ', { placement: 'new-scale' })
  second!.compare.add('NQ', { placement: 'new-scale' })
  await expect.poll(() => container.querySelectorAll('[data-legend-row="cmp:NQ"]').length).toBe(2)
  const legends = container.querySelectorAll<HTMLElement>('.qc-legend')
  const value = (index: number) => legends[index]!.querySelector('[data-role="legend-study-value"]')!.textContent
  renderers[offset + 1]!.fireCrosshair(bars[1]!.t)
  expect(widget.layout.active()).toBe(0)
  expect(value(0)).toBe('4501.25')
  expect(value(1)).toBe('4500.25')
  const remove = legends[1]!.querySelector<HTMLButtonElement>('button[aria-label="Remove compare"]')!
  remove.focus()
  remove.click() // keyboard button activation does not send pointerdown
  expect(first!.compare.list().map(entry => entry.symbol)).toEqual(['NQ'])
  expect(second!.compare.list()).toEqual([])
  expect(widget.layout.active()).toBe(1)
})

it('activates once on tile focus, preserves toolbar selection and releases removed-tile focus listeners', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ES', timeframe: '1m', features: { drawings: false }, layout: { arrangement: '2h' } })
  mounted.push(widget)
  await settle()
  const panes = container.querySelectorAll<HTMLElement>('.qc-pane')
  const second = panes[1]!
  const removeListener = vi.spyOn(second, 'removeEventListener')
  const changed = vi.fn()
  widget.on('activeChart', changed)
  second.querySelector<HTMLButtonElement>('[data-role="legend-symbol"]')!.focus()
  expect(widget.layout.active()).toBe(1)
  expect(changed).toHaveBeenCalledTimes(1)
  second.querySelector<HTMLButtonElement>('.qc-legend-status')!.focus()
  expect(changed).toHaveBeenCalledTimes(1)
  container.querySelector<HTMLButtonElement>('button[aria-label="Compare or add symbol"]')!.focus()
  expect(widget.layout.active()).toBe(1)
  expect(changed).toHaveBeenCalledTimes(1)
  widget.layout.setArrangement('s')
  expect(removeListener.mock.calls.some(([type, , capture]) => type === 'focusin' && capture === true)).toBe(true)
  changed.mockClear()
  second.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  expect(widget.layout.active()).toBe(0)
  expect(changed).not.toHaveBeenCalled()
})

interface FeedScript {
  bars?: FeedBar[]
  symbol?: SymbolInfo | null
}

function scriptedFeed(script: FeedScript = {}): ChartDatafeed {
  return {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => (script.symbol === undefined ? info() : script.symbol),
    history: async () => ({ bars: [...(script.bars ?? series(6))], noData: false }),
    subscribeBars: () => () => undefined,
  }
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const instance of mounted.splice(0)) instance.dispose()
  document.body.replaceChildren()
  vi.unstubAllGlobals()
})

interface Mounted {
  instance: ChartInstance
  handle: ChartInstance['handle']
  renderer: FakeRenderer
  container: HTMLElement
  searches: SearchRequest[]
}

function mountChart(feed: ChartDatafeed, options: { features?: FeatureConfig; ui?: UiConfig; symbol?: string; symbolMark?: (request: { symbol: string; host: HTMLElement; size: number }) => (() => void) | void } = {}): Mounted {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const registry = createCommandRegistry()
  const searches: SearchRequest[] = []
  const doors = emptyDoors()
  doors.openSearch = (request) => void searches.push(request)
  const instance = createChartInstance({
    icons: ownIcons(),
    indicatorCatalog: createIndicatorCatalog(),
    id: `chart-${mounted.length + 1}`,
    active: () => true,
    container,
    layer: document.body,
    datafeed: feed,
    saveLoad: null,
    drawings: { identity: { current: () => 'chart-1', set: () => undefined }, mode: 'combined' },
    storage: memoryChartStorage(),
    i18n: createChartI18n(),
    theme: createThemeController({ mode: 'dark' }),
    features: resolveFeatures({ drawings: false, sessions: false, ...options.features }),
    ui: resolveUi({ contextMenu: false, navigation: false, ...options.ui }, resolveFeatures({ drawings: false, sessions: false, ...options.features })),
    compareSymbols: [],
    styles: CHART_STYLES,
    indicators: [],
    extensions: [],
    marks: false,
    commands: registry.registry,
    replayCommands: registry.registry,
    preferences: {},
    symbol: options.symbol ?? 'ES',
    timeframe: '1m',
    onSymbolInfo: () => undefined,
    onConfig: () => undefined,
    onSaveConflict: () => undefined,
    onReady: () => undefined,
    capabilities: () => ({
      resolutions: null,
      symbolResolutions: null,
      search: true,
      history: true,
      serverTime: false,
      marks: false,
      timescaleMarks: false,
      dataStatus: 'streaming',
      saveLoad: { charts: false, layouts: false, drawings: false, templates: false },
      imageCopy: false,
      fullscreen: false,
      extensions: [],
    }),
    chartCount: () => 1,
    layoutMaximized: () => false,
    doors,
    painters: resolveMarkPainters(options),
  })
  mounted.push(instance)
  return { instance, handle: instance.handle, renderer: lastRenderer(), container, searches }
}

const legendOf = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.qc-legend')!
const partText = (container: HTMLElement, role: string): string => legendOf(container).querySelector<HTMLElement>(`[data-role="${role}"]`)?.textContent ?? ''
const quote = (container: HTMLElement): string => partText(container, 'legend-quote')
const rows = (container: HTMLElement): HTMLElement[] => [...legendOf(container).querySelectorAll<HTMLElement>('.qc-legend-row')]
const titled = (container: HTMLElement, title: string): HTMLButtonElement[] =>
  [...legendOf(container).querySelectorAll<HTMLButtonElement>(`button[title="${title}"]`)]

describe('the legend names the symbol the datafeed resolved', () => {
  it('clears old identity immediately on a switch and ignores an obsolete resolve', async () => {
    const pending = new Map<string, (value: SymbolInfo | null) => void>()
    const feed = scriptedFeed()
    feed.resolve = symbol => new Promise(resolve => pending.set(symbol, resolve))
    const { container, handle } = mountChart(feed)
    pending.get('ES')!(info())
    await settle()
    handle.setSymbol('opaque:next')
    // Before a resolve lands there is no venue to put in the exchange part, so the qualifier is not
    // repeated in the name either: a legend that read `opaque:next` beside an empty venue would say
    // the exchange twice on the way in and once afterwards.
    expect(partText(container, 'legend-symbol')).toBe('next')
    expect(partText(container, 'legend-exchange')).toBe('')
    handle.setSymbol('opaque:last')
    pending.get('opaque:next')!(info({ name: 'STALE', exchange: 'OLD' }))
    await settle()
    expect(partText(container, 'legend-symbol')).toBe('last')
    pending.get('opaque:last')!(null)
    await settle()
    expect(partText(container, 'legend-symbol')).toBe('last')
  })
  it('writes the resolved identity and its venue, not the ticker the chart was mounted with', async () => {
    const { container } = mountChart(scriptedFeed())
    await settle()
    expect(partText(container, 'legend-symbol')).toBe('ESZ2026')
    expect(partText(container, 'legend-exchange')).toBe('CME')
    expect(partText(container, 'legend-timeframe')).toBe('1m')
  })

  it('falls back to the charted symbol while it is unresolved, and invents no venue', async () => {
    const { container } = mountChart(scriptedFeed({ symbol: null }))
    await settle()
    expect(partText(container, 'legend-symbol')).toBe('ES')
    expect(partText(container, 'legend-exchange')).toBe('')
  })

  it('opens the chart’s own search door from the name, the one the top bar’s symbol control uses', async () => {
    const { container, searches } = mountChart(scriptedFeed())
    await settle()
    legendOf(container).querySelector<HTMLButtonElement>('[data-role="legend-symbol"]')!.click()
    expect(searches.map((r) => r.mode)).toEqual(['search'])
  })

  it('leaves the name a plain mark when the host hid the chart’s search dialog', async () => {
    const { container } = mountChart(scriptedFeed(), { ui: { symbolSearch: false } })
    await settle()
    expect(legendOf(container).querySelector('button[data-role="legend-symbol"]')).toBeNull()
    expect(partText(container, 'legend-symbol')).toBe('ESZ2026')
  })
})

describe('the market’s mark', () => {
  it('is the package monogram until a host paints its own into the same slot', async () => {
    const { container } = mountChart(scriptedFeed())
    await settle()
    const badge = legendOf(container).querySelector<HTMLElement>('.qc-symbol-badge')!
    expect(badge.textContent).toBe('ES')
    expect(badge.dataset.qcHost).toBeUndefined()
  })

  it('is the host’s for every symbol, and the previous one is taken down before the next is painted', async () => {
    const painted: string[] = []
    const dropped: string[] = []
    const sizes: number[] = []
    const { container, handle } = mountChart(scriptedFeed(), {
      symbolMark: ({ symbol, host, size }) => {
        sizes.push(size)
        painted.push(symbol)
        host.replaceChildren(document.createTextNode(`<${symbol}>`))
        return () => dropped.push(symbol)
      },
    })
    await settle()
    const badge = legendOf(container).querySelector<HTMLElement>('.qc-symbol-badge')!
    expect(painted).toEqual(['ES'])
    // The chart owns the box and STATES its size, so a host paints at the size it was given rather
    // than guessing one and being boxed inside it.
    expect(sizes).toEqual([18])
    expect(badge.textContent).toBe('<ES>')
    expect(badge.dataset.qcHost).toBe('true')
    handle.setSymbol('NQ')
    await settle()
    expect(dropped).toEqual(['ES'])
    expect(painted).toEqual(['ES', 'NQ'])
    expect(badge.textContent).toBe('<NQ>')
  })
})

describe('the legend writes through the chart’s one price formatter', () => {
  it('reads a decimal instrument at the symbol’s own precision', async () => {
    const { container } = mountChart(scriptedFeed())
    await settle()
    const last = series(6)[5]!
    const fmt = createPriceFormatter(DECIMAL, { locale: 'en' })
    expect(quote(container)).toContain(fmt.format(last.c))
    expect(quote(container)).toContain(fmt.format(last.h))
  })

  it('reads a fractional instrument in thirty-seconds, exactly as the axis writes it', async () => {
    const bars: FeedBar[] = [
      { t: 1_700_000_000, o: 110, h: 110.75, l: 109.5, c: 110.25, v: 5 },
      { t: 1_700_000_060, o: 110.25, h: 111, l: 110, c: 110.5, v: 7 },
    ]
    const { container } = mountChart(scriptedFeed({ bars, symbol: info({ format: THIRTY_SECONDS }) }))
    await settle()
    const fmt = createPriceFormatter(THIRTY_SECONDS, { locale: 'en' })
    expect(fmt.format(110.5)).toBe("110'16")
    const text = quote(container)
    expect(text).toContain("110'16")
    expect(text).toContain("111'00")
    // The change against the previous close is written on the same grid, with its sign.
    expect(partText(container, 'legend-change')).toContain("+0'08")
  })

  it('writes the percentage in the chart’s language, with its sign', async () => {
    const { container } = mountChart(scriptedFeed())
    await settle()
    expect(partText(container, 'legend-change')).toMatch(/\+0\.01%/)
  })
})

describe('the reading follows the crosshair, and each chart keeps its own', () => {
  it('shows the hovered bar while the crosshair stands, and the latest when it leaves', async () => {
    const bars = series(6)
    const { container, renderer } = mountChart(scriptedFeed({ bars }))
    await settle()
    const fmt = createPriceFormatter(DECIMAL, { locale: 'en' })
    expect(quote(container)).toContain(fmt.format(bars[5]!.c))
    renderer.fireCrosshair(bars[2]!.t)
    expect(quote(container)).toContain(fmt.format(bars[2]!.c))
    expect(quote(container)).not.toContain(fmt.format(bars[5]!.c))
    renderer.fireCrosshair(null)
    expect(quote(container)).toContain(fmt.format(bars[5]!.c))
  })

  it('keeps every pane’s reading its own: a crosshair on one chart never moves another’s', async () => {
    const bars = series(6)
    const first = mountChart(scriptedFeed({ bars }))
    const second = mountChart(scriptedFeed({ bars, symbol: info({ name: 'NQZ2026', exchange: 'CME' }) }), { symbol: 'NQ' })
    await settle()
    const fmt = createPriceFormatter(DECIMAL, { locale: 'en' })
    first.renderer.fireCrosshair(bars[1]!.t)
    expect(quote(first.container)).toContain(fmt.format(bars[1]!.c))
    expect(quote(second.container)).toContain(fmt.format(bars[5]!.c))
    expect(partText(second.container, 'legend-symbol')).toBe('NQZ2026')
    // Activating the other chart is a host's pointer, not a legend event: neither reading moves.
    second.renderer.fireCrosshair(bars[3]!.t)
    expect(quote(first.container)).toContain(fmt.format(bars[1]!.c))
    expect(quote(second.container)).toContain(fmt.format(bars[3]!.c))
  })
})

describe('study rows', () => {
  it('keeps price-scale controls out of the legend and places list collapse after its rows', async () => {
    const { container, handle } = mountChart(scriptedFeed())
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find(d => d.id === 'sma')! })
    const legend = legendOf(container)
    expect(legend.querySelector('.qc-legend-scales')).toBeNull()
    const mainRows = legend.querySelector<HTMLElement>('[data-legend-pane="0"]')!
    const toggle = legend.querySelector<HTMLElement>('[data-role="legend-collapse"]')!
    expect(mainRows.nextElementSibling).toBe(toggle)
  })

  it('collapses the row list without losing study nodes, values or instances', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(30) }))
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find(d => d.id === 'sma')! })
    const row = rows(container)[0]!
    const toggle = container.querySelector<HTMLButtonElement>('[data-role="legend-collapse"]')!
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    renderer.fireCrosshair(series(30)[10]!.t)
    toggle.click()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(rows(container)[0]).toBe(row)
    expect(handle.indicators.get()).toHaveLength(1)
  })
  it('keeps the focused eye node through ticks, hover, and its own visibility change', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(30) }))
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    const eye = titled(container, 'Hide indicator')[0]!
    eye.focus()
    renderer.fireCrosshair(series(30)[10]!.t)
    expect(document.activeElement).toBe(eye)
    expect(titled(container, 'Hide indicator')[0]).toBe(eye)
    eye.click()
    expect(titled(container, 'Show indicator')[0]).toBe(eye)
    expect(document.activeElement).toBe(eye)
  })

  it('places a study row in its actual renderer pane, separate from overlay rows', async () => {
    const { container, handle } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    handle.indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
    expect(rows(container)[0]!.closest('[data-legend-pane]')?.getAttribute('data-legend-pane')).toBe('0')
    expect(rows(container)[1]!.closest('[data-legend-pane]')?.getAttribute('data-legend-pane')).toBe('1')
  })

  it('reads explicit Volume units, not the symbol price grid', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(30), symbol: info({ format: THIRTY_SECONDS }) }))
    await settle()
    handle.indicators.add({ id: 'vol-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'volume')! })
    expect(rows(container)[0]!.textContent).toContain('39')
    renderer.fireCrosshair(series(30)[3]!.t)
    expect(rows(container)[0]!.textContent).toContain('13')
    expect(rows(container)[0]!.textContent).not.toContain("'")
  })
  it('carries the eye, the settings gear and the remove, and the eye reports the hide', async () => {
    const { container, handle } = mountChart(scriptedFeed())
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    await settle()
    expect(rows(container)).toHaveLength(1)
    expect(titled(container, 'Hide indicator')).toHaveLength(1)
    expect(titled(container, 'Indicator settings')).toHaveLength(1)
    expect(titled(container, 'Remove indicator')).toHaveLength(1)
    expect(rows(container)[0]!.querySelector('.qc-legend-actions')?.children).toHaveLength(5)
    expect(rows(container)[0]!.querySelector('.qc-legend-label')).not.toBeNull()
    expect(rows(container)[0]!.querySelector('.qc-legend-value')).not.toBeNull()
    titled(container, 'Hide indicator')[0]!.click()
    expect(handle.indicators.hidden()).toEqual(['sma-1'])
    titled(container, 'Remove indicator')[0]!.click()
    expect(rows(container)).toHaveLength(0)
  })

  it('reads a study’s row at the hovered bar, and back at the last one when the pointer leaves', async () => {
    const bars = series(30)
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars }))
    await settle()
    handle.indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!, inputs: { period: 5 } })
    await settle()
    const latest = rows(container)[0]!.textContent
    renderer.fireCrosshair(bars[10]!.t)
    const hovered = rows(container)[0]!.textContent
    expect(hovered).not.toBe(latest)
    renderer.fireCrosshair(null)
    expect(rows(container)[0]!.textContent).toBe(latest)
  })

  it('turns the volume band on with the study and off with its remove', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed())
    await settle()
    const band = () => renderer.series.find((s) => s.options.priceScaleId === 'volume')!
    expect(band().options.visible).toBe(false)
    handle.indicators.add({ id: 'vol-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'volume')! })
    await settle()
    expect(band().options.visible).toBe(true)
    expect(rows(container)).toHaveLength(1)
    titled(container, 'Remove indicator')[0]!.click()
    expect(band().options.visible).toBe(false)
    expect(rows(container)).toHaveLength(0)
  })
})

describe('a pane-placed study’s own lifecycle', () => {
  it('repositions pane rows and price-axis insets on renderer resize, then releases observers', async () => {
    const callbacks: (() => void)[] = []
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { callbacks.push(callback) }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    })
    const { container, instance, handle, renderer } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    handle.indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find(d => d.id === 'rsi')! })
    const original = renderer.chart.priceScale.bind(renderer.chart)
    vi.spyOn(renderer.chart, 'priceScale').mockImplementation((id) => ({ ...original(id), width: () => id === 'left' ? 44 : 60 }))
    renderer.paneHeights[0] = 420
    for (const callback of callbacks) callback()
    expect(container.querySelector<HTMLElement>('[data-legend-pane="1"]')!.style.top).toBe('420px')
    expect(legendOf(container).style.insetInlineStart).toBe('44px')
    expect(legendOf(container).style.insetInlineEnd).toBe('60px')
    instance.dispose()
    expect(disconnect).toHaveBeenCalled()
  })
  it('restores the same study height after an earlier study is removed and its index shifts', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    const definition = BUILT_IN_INDICATORS.find(d => d.id === 'rsi')!
    handle.indicators.add({ id: 'first', definition })
    handle.indicators.add({ id: 'second', definition })
    renderer.paneHeights[1] = 170
    renderer.paneHeights[2] = 230
    const second = () => container.querySelector<HTMLElement>('[data-legend-row="second"]')!
    second().querySelector<HTMLButtonElement>('button[title="Collapse pane"]')!.click()
    const row = second()
    handle.indicators.remove('first')
    expect(second()).toBe(row)
    expect(row.closest('[data-legend-pane]')?.getAttribute('data-legend-pane')).toBe('1')
    expect(renderer.paneHeights[1]).toBe(COLLAPSED_H)
    row.querySelector<HTMLButtonElement>('button[title="Restore pane"]')!.click()
    expect(renderer.paneHeights[1]).toBe(230)
  })
  it('brings a row with collapse and maximize, and takes them away with the study', async () => {
    const { container, handle } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    handle.indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
    await settle()
    expect(titled(container, 'Collapse pane')).toHaveLength(1)
    expect(titled(container, 'Maximize pane')).toHaveLength(1)
    handle.indicators.remove('rsi-1')
    await settle()
    expect(rows(container)).toHaveLength(0)
    expect(titled(container, 'Collapse pane')).toHaveLength(0)
  })

  it('collapses and restores the pane it names, and reports the state on the row', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    handle.indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
    await settle()
    titled(container, 'Collapse pane')[0]!.click()
    expect(renderer.paneHeights[1]).toBe(COLLAPSED_H)
    expect(titled(container, 'Restore pane')).toHaveLength(1)
    titled(container, 'Restore pane')[0]!.click()
    expect(renderer.paneHeights[1]).toBeGreaterThan(COLLAPSED_H)
    expect(titled(container, 'Collapse pane')).toHaveLength(1)
  })

  it('maximizes by putting every OTHER pane at the floor', async () => {
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars: series(40) }))
    await settle()
    handle.indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
    await settle()
    titled(container, 'Maximize pane')[0]!.click()
    expect(renderer.paneHeights[0]).toBe(MAIN_MIN_H)
    expect(renderer.paneHeights[1]).toBeGreaterThan(MAIN_MIN_H)
    titled(container, 'Restore pane').find(button => !button.hidden)!.click()
    expect(renderer.paneHeights[1]).toBe(300)
    expect(renderer.paneHeights[0]).toBe(300)
  })
})

describe('a replay window', () => {
  it('marks each replaying chart independently of the widget transport owner', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed: scriptedFeed(), symbol: 'ES', timeframe: '1m', features: { drawings: false, replay: true }, layout: { arrangement: '2h' } })
    mounted.push(widget)
    await settle()
    const [first, second] = widget.charts()
    first!.replay.start()
    second!.replay.start()
    expect([...container.querySelectorAll<HTMLElement>('.qc-replay-watermark')].filter(mark => !mark.hidden)).toHaveLength(2)
    first!.replay.exit()
    expect([...container.querySelectorAll<HTMLElement>('.qc-replay-watermark')].filter(mark => !mark.hidden)).toHaveLength(1)
    expect(container.querySelectorAll('.qc-replay')).toHaveLength(0)
  })

  it('keeps the exact status glyph mounted for unknown sessions, toggles its dialog, and closes it for replay', async () => {
    const { container, handle } = mountChart(scriptedFeed({ symbol: null }), { features: { replay: true } })
    await settle()
    const status = container.querySelector<HTMLButtonElement>('.qc-legend-status')!
    expect(status.hidden).toBe(false)
    expect(status.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 18 18')
    expect(status.querySelector('circle')?.getAttribute('opacity')).toBe('0.2')
    status.click()
    expect(container.querySelector('.qc-status-popup')).not.toBeNull()
    status.click()
    expect(container.querySelector('.qc-status-popup')).toBeNull()
    status.click()
    handle.replay.start()
    expect(container.querySelector('.qc-status-popup')).toBeNull()
    expect(status.hidden).toBe(true)
    const pill = container.querySelector<HTMLElement>('.qc-legend-replay')!
    const watermark = container.querySelector<HTMLElement>('.qc-replay-watermark')!
    expect(pill.hidden).toBe(false)
    expect(pill.textContent).toBe('')
    expect(pill.title).toBe('Replay')
    expect(watermark.hidden).toBe(false)
    expect(watermark.textContent).toBe('Replay')
    expect(watermark.getAttribute('aria-hidden')).toBe('true')
    expect(watermark.querySelector('button, a, input')).toBeNull()
    const markPath = watermark.querySelector('path')!
    expect(markPath.getAttribute('fill-rule')).toBe('evenodd')
    expect(markPath.getAttribute('d')).toContain('M8 5.5 4.5 9 8 12.5')
    expect(markPath.getAttribute('fill')).toBe('currentColor')
    handle.replay.exit()
    expect(status.hidden).toBe(false)
    expect(pill.hidden).toBe(true)
    expect(watermark.hidden).toBe(true)
    expect(container.querySelector('.qc-legend-status')).toBe(status)
  })

  it('keeps new-pane compare readings clipped to the cursor, hovered time and their own pane', async () => {
    const bars = series(8)
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars }), { features: { replay: true } })
    await settle()
    handle.compare.add('NQ', { placement: 'new-pane' })
    await settle()
    renderer.fireCrosshair(bars[2]!.t)
    await settle() // the compared symbol resolves its own display format
    const row = container.querySelector<HTMLElement>('[data-legend-row="cmp:NQ"]')!
    expect(row.closest('[data-legend-pane]')?.getAttribute('data-legend-pane')).toBe('1')
    expect(row.querySelector('[data-role="legend-study-value"]')?.textContent).toBe('4500.50')
    handle.replay.start(bars[3]!.t)
    renderer.fireCrosshair(bars[7]!.t)
    expect(row.querySelector('[data-role="legend-study-value"]')?.textContent).toBe('4500.75')
    renderer.fireCrosshair(bars[0]!.t - 1)
    expect(row.querySelector('[data-role="legend-study-value"]')?.textContent).toBe('')
    handle.compare.remove('NQ')
    await new Promise(resolve => setTimeout(resolve, 260))
    expect(container.querySelector('[data-legend-row="cmp:NQ"]')).toBeNull()
  })
  it('reads the cursor’s bar, steps with it, and gives the live edge back on exit', async () => {
    const bars = series(8)
    const { container, handle } = mountChart(scriptedFeed({ bars }), { features: { replay: true } })
    await settle()
    const fmt = createPriceFormatter(DECIMAL, { locale: 'en' })
    // The cursor lands on the bar the window opens at; the live edge is no longer the reading.
    handle.replay.start(bars[3]!.t)
    await settle()
    expect(quote(container)).toContain(fmt.format(bars[3]!.c))
    expect(quote(container)).not.toContain(fmt.format(bars[7]!.c))
    handle.replay.stepForward()
    await settle()
    expect(quote(container)).toContain(fmt.format(bars[4]!.c))
    handle.replay.stepBack()
    await settle()
    expect(quote(container)).toContain(fmt.format(bars[3]!.c))
    handle.replay.exit()
    await settle()
    expect(quote(container)).toContain(fmt.format(bars[7]!.c))
  })

  it('never reads past the cursor: a crosshair beyond the window stays on its last bar', async () => {
    const bars = series(8)
    const { container, handle, renderer } = mountChart(scriptedFeed({ bars }), { features: { replay: true } })
    await settle()
    const fmt = createPriceFormatter(DECIMAL, { locale: 'en' })
    handle.replay.start(bars[3]!.t)
    await settle()
    renderer.fireCrosshair(bars[1]!.t)
    expect(quote(container)).toContain(fmt.format(bars[1]!.c))
    renderer.fireCrosshair(bars[7]!.t)
    expect(quote(container)).toContain(fmt.format(bars[3]!.c))
    expect(quote(container)).not.toContain(fmt.format(bars[7]!.c))
  })

  it('states no change at the first bar of the painted window, which has no previous close', async () => {
    const { container } = mountChart(scriptedFeed({ bars: series(1) }))
    await settle()
    expect(quote(container)).toContain('4500.00')
    expect(partText(container, 'legend-change')).toBe('')
  })

  it('says so in the interval while replay runs', async () => {
    const { container, handle } = mountChart(scriptedFeed({ bars: series(8) }), { features: { replay: true } })
    await settle()
    handle.replay.start()
    await settle()
    expect(partText(container, 'legend-timeframe')).toBe('1m')
    handle.replay.exit()
    await settle()
    expect(partText(container, 'legend-timeframe')).toBe('1m')
  })
})
