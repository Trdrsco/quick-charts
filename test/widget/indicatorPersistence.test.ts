// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { createChartI18n } from '../../src/i18n'
import { DEFAULT_OVERRIDES } from '../../src/overrides'
import { createPriceFormatter } from '../../src/priceFormatter'
import { memorySaveLoadAdapter } from '../../src/resources'
import { memoryChartStorage, type ChartStorage } from '../../src/storage'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { attachIndicatorsPlane, createIndicatorCatalog, withHidden } from '../../src/widget/indicators'
import type { AccessPolicy, IndicatorDefinition, IndicatorInstance } from '../../src/widget/options'
import {
  CHART_CONTENT_VERSION,
  createSaveLoadApi,
  parseChartContent,
  restoreIndicatorInstance,
  serializeChartContent,
  serializeIndicatorInstance,
  type ChartContent,
  type SavedIndicator,
} from '../../src/widget/saveLoad'
import { fakeRenderer, lastRenderer, type FakeRenderer } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const body = (indicators: unknown): string =>
  JSON.stringify({
    v: CHART_CONTENT_VERSION,
    symbol: 'ES',
    tf: '5m',
    style: 'candles',
    scale: 'normal',
    priceAxis: 'auto',
    indicators,
    appearance: {},
    compares: [],
    ext: {},
  })

describe('the saved indicator schema', () => {
  it('requires the v4 instance list and preserves valid instance state', () => {
    expect(CHART_CONTENT_VERSION).toBe(4)
    expect(
      parseChartContent(
        body([
          {
            id: 'sma-1',
            definition: 'sma',
            inputs: { length: 50 },
            color: '#4c98fb',
            title: 'Fifty',
            overrides: { plots: { sma: { color: '#ff0000', lineWidth: 3, lineStyle: 'dashed' } }, precision: 3 },
          },
        ]),
      ).indicators,
    ).toEqual([
      {
        id: 'sma-1',
        definition: 'sma',
        inputs: { length: 50 },
        color: '#4c98fb',
        title: 'Fifty',
        overrides: { plots: { sma: { color: '#ff0000', lineWidth: 3, lineStyle: 'dashed' } }, precision: 3 },
      },
    ])
  })

  it('refuses duplicate ids and malformed optional fields instead of normalizing them', () => {
    const duplicate = [
      { id: 'same', definition: 'sma' },
      { id: 'same', definition: 'rsi' },
    ]
    expect(() => parseChartContent(body(duplicate))).toThrow(/indicator/i)
    for (const indicator of [
      { id: 'x', definition: 'sma', inputs: { length: '50' } },
      { id: 'x', definition: 'sma', title: 7 },
      { id: 'x', definition: 'sma', color: 'not-a-color' },
      { id: 'x', definition: 'sma', overrides: { precision: '3' } },
    ]) {
      expect(() => parseChartContent(body([indicator]))).toThrow(/indicator/i)
    }
  })

  it.each([
    ['missing list', undefined],
    ['null entry', [null]],
    ['array entry', [[]]],
    ['empty id', [{ id: '', definition: 'sma' }]],
    ['empty definition', [{ id: 'x', definition: '' }]],
    ['unknown entry field', [{ id: 'x', definition: 'sma', oldColor: '#fff' }]],
    ['null inputs', [{ id: 'x', definition: 'sma', inputs: null }]],
    ['array inputs', [{ id: 'x', definition: 'sma', inputs: [] }]],
    ['non-finite input', [{ id: 'x', definition: 'sma', inputs: { length: null } }]],
    ['non-string title', [{ id: 'x', definition: 'sma', title: null }]],
    ['context-dependent color', [{ id: 'x', definition: 'sma', color: 'var(--study)' }]],
    ['null overrides', [{ id: 'x', definition: 'sma', overrides: null }]],
    ['unknown override', [{ id: 'x', definition: 'sma', overrides: { obsolete: true } }]],
    ['non-record plots', [{ id: 'x', definition: 'sma', overrides: { plots: [] } }]],
    ['non-record plot', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: true } } }]],
    ['unknown plot override', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: { width: 2 } } } }]],
    ['invalid plot color', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: { color: 'nope' } } } }]],
    ['non-positive line width', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: { lineWidth: 0 } } } }]],
    ['invalid line style', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: { lineStyle: 'dash-dot' } } } }]],
    ['invalid visibility', [{ id: 'x', definition: 'sma', overrides: { plots: { sma: { visible: 1 } } } }]],
    ['invalid level price', [{ id: 'x', definition: 'rsi', overrides: { levels: { upper: { price: null } } } }]],
    ['unknown fill override', [{ id: 'x', definition: 'rsi', overrides: { fills: { band: { opacity: 0.2 } } } }]],
    ['fractional precision', [{ id: 'x', definition: 'sma', overrides: { precision: 1.5 } }]],
    ['unsafe precision', [{ id: 'x', definition: 'sma', overrides: { precision: 101 } }]],
    ['non-record display', [{ id: 'x', definition: 'sma', overrides: { display: [] } }]],
    ['invalid display flag', [{ id: 'x', definition: 'sma', overrides: { display: { hidden: 'yes' } } }]],
  ])('refuses %s', (_name, indicators) => {
    expect(() => parseChartContent(body(indicators))).toThrow(/indicator/i)
  })

  it('runs no compatibility reader below the one format that has stored charts in the wild', () => {
    expect(() => parseChartContent(JSON.stringify({ v: 2, symbol: 'ES', tf: '5m', hidden: [] }))).toThrow(/unsupported chart content version 2/)
    // The one exception is the format whose appearance was the RESOLVED tree: those charts exist in
    // stores, and they read back with no studies and no appearance rather than freezing at the look
    // they were drawn in.
    const old = parseChartContent(JSON.stringify({ v: 3, symbol: 'ES', tf: '5m', hidden: [], appearance: { upColor: '#26a69a' } }))
    expect(old.indicators).toEqual([])
    expect(old.appearance).toBeUndefined()
    expect(old.symbol).toBe('ES')
  })
})

const builtIn = (id: string): IndicatorDefinition => BUILT_IN_INDICATORS.find((definition) => definition.id === id)!
const contentOf = (indicators: readonly SavedIndicator[], symbol = 'ES', timeframe = '5m'): ChartContent => ({
  symbol,
  timeframe,
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators,
  appearance: DEFAULT_OVERRIDES.appearance,
  compares: [],
  drawings: [],
  ext: {},
})

describe('indicator instance serialization', () => {
  it('round-trips explicit instance settings without copying definition defaults', () => {
    const instance: IndicatorInstance = {
      id: 'sma-1',
      definition: builtIn('sma'),
      inputs: { length: 50 },
      color: '#4c98fb',
      title: 'Fifty',
      overrides: {
        plots: { sma: { color: '#ff0000', lineWidth: 3, lineStyle: 'dashed', visible: false } },
        levels: { zero: { price: 0, color: 'red', lineStyle: 'dotted', visible: true } },
        fills: { band: { color: 'rgba(1, 2, 3, 0.5)', visible: false } },
        precision: 3,
        display: { labelsOnPriceScale: false, valuesInStatusLine: true, inputsInStatusLine: false, hidden: true },
      },
    }
    const saved = serializeIndicatorInstance(instance)!
    expect(parseChartContent(serializeChartContent(contentOf([saved]))).indicators).toEqual([saved])
    expect(restoreIndicatorInstance(saved, (id) => (id === 'sma' ? instance.definition : undefined))).toEqual(instance)

    const defaultsOnly = serializeIndicatorInstance({ id: 'rsi-1', definition: builtIn('rsi') })!
    expect(defaultsOnly).toEqual({ id: 'rsi-1', definition: 'rsi' })
    expect(defaultsOnly).not.toHaveProperty('inputs')
  })

  it('leaves an anonymous definition out of the blob but keeps hidden in the instance record', () => {
    const anonymous: IndicatorDefinition = { manifest: { pane: 'overlay', plots: { x: { kind: 'line' } } }, compute: () => ({ x: [] }) }
    expect(serializeIndicatorInstance({ id: 'anonymous', definition: anonymous })).toBeNull()
    const bare: IndicatorInstance = { id: 'sma-1', definition: builtIn('sma') }
    const hidden = withHidden(bare, true)
    expect(hidden.overrides).toEqual({ display: { hidden: true } })
    expect(withHidden(hidden, false)).toEqual(bare)
  })
})

const indicatorPlane = (access?: AccessPolicy) => {
  const events: string[] = []
  const catalog = createIndicatorCatalog()
  const plane = attachIndicatorsPlane({
    chart: fakeRenderer().chart,
    candleSeries: () => null,
    bars: () => [],
    i18n: createChartI18n(),
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    formatKey: () => 'test',
    minMove: () => 0.01,
    canvas: () => ({ neutral: '#888' }) as never,
    access,
    disposed: () => false,
    onChips: () => undefined,
    onEvent: (event) => events.push(`${event.kind}:${event.id}`),
    catalog,
  })
  return { plane, events, catalog }
}

describe('catalog resolution and policy filtering', () => {
  it('counts unknown and denied definitions as dropped and reports restore arrivals as changes', () => {
    const { plane, events } = indicatorPlane({ indicator: (id) => id !== 'rsi' })
    plane.set([{ id: 'old', definition: builtIn('volume') }])
    events.length = 0
    expect(
      plane.restore([
        { id: 'sma-1', definition: 'sma' },
        { id: 'rsi-1', definition: 'rsi' },
        { id: 'gone-1', definition: 'not-installed' },
      ]),
    ).toEqual({ dropped: 2 })
    expect(plane.list().map((instance) => instance.id)).toEqual(['sma-1'])
    expect(events).toEqual(['removed:old', 'changed:sma-1'])
    plane.destroy()
  })

  it('shares carried host definitions through the widget catalog', () => {
    const host: IndicatorDefinition = {
      manifest: { id: 'host.average', pane: 'overlay', plots: { value: { kind: 'line' } } },
      compute: (bars) => ({ value: bars.map((bar) => bar.c) }),
    }
    const catalog = createIndicatorCatalog()
    catalog.carry([{ id: 'host-1', definition: host }])
    expect(restoreIndicatorInstance({ id: 'host-2', definition: 'host.average' }, catalog.resolve)?.definition).toBe(host)
  })

  it('remembers a host definition while policy denies its seed, then asks the live policy again', () => {
    let permitted = false
    const host: IndicatorDefinition = {
      manifest: { id: 'host.average', pane: 'overlay', plots: { value: { kind: 'line' } } },
      compute: () => ({ value: [] }),
    }
    const { plane } = indicatorPlane({ indicator: () => permitted })
    plane.set([{ id: 'seed', definition: host }])
    expect(plane.list()).toEqual([])
    permitted = true
    expect(plane.restore([{ id: 'restored', definition: 'host.average' }])).toEqual({ dropped: 0 })
    expect(plane.list()[0]!.definition).toBe(host)
    plane.destroy()
  })
})

describe('indicator rollback', () => {
  it('puts back the exact held list, including an anonymous definition, without reporting an add', () => {
    const anonymous: IndicatorDefinition = { manifest: { pane: 'overlay', plots: { x: { kind: 'line' } } }, compute: () => ({ x: [] }) }
    const { plane, events } = indicatorPlane()
    plane.set([{ id: 'anonymous', definition: anonymous }, { id: 'sma-1', definition: builtIn('sma') }])
    let symbol = 'ES'
    const api = createSaveLoadApi({
      adapter: null,
      i18n: createChartI18n(),
      symbol: () => symbol,
      timeframe: () => '5m',
      content: () => contentOf(plane.list().map(serializeIndicatorInstance).filter((saved): saved is SavedIndicator => saved !== null), symbol),
      apply(parsed) {
        plane.restore(parsed.indicators)
        if (parsed.symbol === 'CL') throw new Error('symbol refused')
        symbol = parsed.symbol ?? symbol
      },
      heldIndicators: { snapshot: () => plane.list(), restore: (instances) => plane.restoreHeld(instances) },
      disposed: () => false,
    })
    events.length = 0
    expect(() => api.restore(serializeChartContent(contentOf([{ id: 'rsi-1', definition: 'rsi' }], 'CL')))).toThrow(/symbol refused/)
    expect(plane.list().map((instance) => instance.id)).toEqual(['anonymous', 'sma-1'])
    expect(plane.list()[0]!.definition).toBe(anonymous)
    expect(events.filter((event) => event.endsWith(':anonymous'))).toEqual(['removed:anonymous', 'changed:anonymous'])
    expect(events.some((event) => event.startsWith('added:'))).toBe(false)
    plane.destroy()
  })
})

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}
const QUIET = {
  features: { drawings: false, replay: false, sessions: false, compare: false },
  ui: { contextMenu: false, navigation: false, topBar: false, bottomBar: false },
} as const
const mounted: ChartWidget[] = []
const settle = async (): Promise<void> => {
  for (let index = 0; index < 4; index++) await new Promise((resolve) => setTimeout(resolve, 0))
}

afterEach(() => {
  vi.useRealTimers()
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

function mountWidget(options: {
  indicators?: IndicatorInstance[]
  access?: AccessPolicy
  storage?: ChartStorage
  saveLoad?: ReturnType<typeof memorySaveLoadAdapter>
  preferences?: { hiddenIndicators?: readonly string[] }
  toasts?: boolean
} = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({
    container,
    datafeed,
    symbol: 'ES',
    timeframe: '1m',
    features: QUIET.features,
    ui: { ...QUIET.ui, toasts: options.toasts ?? false },
    indicators: options.indicators ?? [],
    access: options.access,
    storage: options.storage,
    saveLoad: options.saveLoad,
    preferences: options.preferences,
  })
  mounted.push(widget)
  return { widget, chart: widget.activeChart(), container, renderer: lastRenderer() as FakeRenderer }
}

describe('chart and layout persistence', () => {
  it('a chart load replaces mount defaults and restores Volume like any other study', () => {
    const { chart } = mountWidget({ indicators: [{ id: 'seed', definition: builtIn('sma') }] })
    chart.saveLoad.restore(serializeChartContent(contentOf([])))
    expect(chart.indicators.get()).toEqual([])
    chart.saveLoad.restore(
      serializeChartContent(contentOf([{ id: 'volume-1', definition: 'volume', inputs: { showMa: 1, maLength: 30 } }])),
    )
    expect(chart.indicators.get()[0]).toMatchObject({ id: 'volume-1', definition: builtIn('volume'), inputs: { showMa: 1, maLength: 30 } })
  })

  it('active and inactive tiles keep distinct ordered instances, settings, hidden state, and panes', async () => {
    const first = mountWidget()
    first.widget.layout.setArrangement('2h')
    const [left, right] = first.widget.charts()
    left!.indicators.add({ id: 'sma-1', definition: builtIn('sma'), inputs: { length: 50 }, title: 'Left average', overrides: { display: { hidden: true } } })
    right!.indicators.add({ id: 'rsi-1', definition: builtIn('rsi'), overrides: { levels: { upper: { price: 80 } } } })
    right!.indicators.add({ id: 'volume-1', definition: builtIn('volume') })
    first.widget.layout.setActive(1)
    const saved = first.widget.layout.serialize().content

    const second = mountWidget()
    second.widget.layout.restore(saved)
    await settle()
    expect(second.widget.layout.arrangement()).toBe('2h')
    expect(second.widget.layout.active()).toBe(1)
    const [restoredLeft, restoredRight] = second.widget.charts()
    expect(restoredLeft!.indicators.get().map((instance) => instance.id)).toEqual(['sma-1'])
    expect(restoredLeft!.indicators.get()[0]).toMatchObject({ inputs: { length: 50 }, title: 'Left average' })
    expect(restoredRight!.indicators.get().map((instance) => instance.id)).toEqual(['rsi-1', 'volume-1'])
    expect(restoredLeft!.indicators.hidden()).toEqual(['sma-1'])
    expect(restoredRight!.indicators.hidden()).toEqual([])
    expect(restoredRight!.indicators.get()[0]!.overrides?.levels?.upper?.price).toBe(80)
    expect((lastRenderer() as FakeRenderer).series.some((series) => series.paneIndex > 0)).toBe(true)
  })

  it('a host definition carried on one tile resolves after another tile and a re-tile', () => {
    const host: IndicatorDefinition = {
      manifest: { id: 'host.average', pane: 'overlay', plots: { value: { kind: 'line' } } },
      compute: (bars) => ({ value: bars.map((bar) => bar.c) }),
    }
    const { widget, chart } = mountWidget()
    chart.indicators.add({ id: 'host-1', definition: host })
    widget.layout.setArrangement('2h')
    widget.charts()[1]!.saveLoad.restore(chart.saveLoad.serialize().content)
    expect(widget.charts()[1]!.indicators.get()[0]!.definition).toBe(host)
    const saved = widget.layout.serialize().content
    widget.layout.setArrangement('s')
    widget.layout.restore(saved)
    expect(widget.charts()).toHaveLength(2)
    for (const tile of widget.charts()) expect(tile.indicators.get()[0]!.definition).toBe(host)
  })

  it('opening eye state merges stored ids with hidden seeds without dirtying the layout', async () => {
    vi.useFakeTimers()
    const storage = memoryChartStorage()
    storage.set('quickcharts.indHidden.v1', JSON.stringify(['rsi-1']))
    const { widget, chart } = mountWidget({
      storage,
      indicators: [
        { id: 'sma-1', definition: builtIn('sma'), overrides: { display: { hidden: true } } },
        { id: 'rsi-1', definition: builtIn('rsi') },
      ],
    })
    const saveNeeded = vi.fn()
    widget.on('saveNeeded', saveNeeded)
    await vi.advanceTimersByTimeAsync(1_100)
    expect(chart.indicators.hidden()).toEqual(['sma-1', 'rsi-1'])
    expect(JSON.parse(storage.get('quickcharts.indHidden.v1')!)).toEqual(['sma-1', 'rsi-1'])
    expect(saveNeeded).not.toHaveBeenCalled()
  })

  it('add, set edit, hide, show, and remove all dirty the layout through indicator events', async () => {
    vi.useFakeTimers()
    const { widget, chart } = mountWidget()
    const saveNeeded = vi.fn()
    widget.on('saveNeeded', saveNeeded)
    chart.indicators.add({ id: 'sma-1', definition: builtIn('sma') })
    await vi.advanceTimersByTimeAsync(1_100)
    chart.indicators.set([{ ...chart.indicators.get()[0]!, inputs: { length: 50 } }])
    await vi.advanceTimersByTimeAsync(1_100)
    chart.indicators.hide('sma-1')
    await vi.advanceTimersByTimeAsync(1_100)
    chart.indicators.show('sma-1')
    await vi.advanceTimersByTimeAsync(1_100)
    chart.indicators.remove('sma-1')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(saveNeeded).toHaveBeenCalledTimes(5)
  })

  it('a malformed chart or nested layout body is refused before symbol, arrangement, or instances mutate', () => {
    const { widget, chart } = mountWidget({ indicators: [{ id: 'sma-1', definition: builtIn('sma') }] })
    widget.layout.setArrangement('2h')
    const chartBody = JSON.parse(chart.saveLoad.serialize().content) as Record<string, unknown>
    chartBody.symbol = 'CL'
    chartBody.indicators = [
      { id: 'duplicate', definition: 'sma' },
      { id: 'duplicate', definition: 'rsi' },
    ]
    expect(() => chart.saveLoad.restore(JSON.stringify(chartBody))).toThrow(/indicator/i)
    expect(chart.symbol()).toBe('ES')
    expect(chart.indicators.get().map((instance) => instance.id)).toEqual(['sma-1'])

    const layout = JSON.parse(widget.layout.serialize().content) as { arrangement: string; charts: { content: string }[] }
    layout.arrangement = 's'
    layout.charts[0]!.content = JSON.stringify(chartBody)
    expect(() => widget.layout.restore(JSON.stringify(layout))).toThrow(/indicator/i)
    expect(widget.layout.arrangement()).toBe('2h')
    expect(widget.charts()).toHaveLength(2)
  })

  it('unknown and denied definitions share one dropped notice and cannot certify unsafe recovery', async () => {
    const adapter = memorySaveLoadAdapter()
    const backing = memoryChartStorage()
    let failWrites = false
    const storage: ChartStorage = {
      ...backing,
      set(key, value) {
        backing.set(key, value)
        if (failWrites) throw new Error('storage refused')
      },
    }
    const mountedPolicy = mountWidget({
      saveLoad: adapter,
      storage,
      access: { indicator: (id) => id !== 'rsi' },
      indicators: [{ id: 'seed', definition: builtIn('sma') }],
      toasts: true,
    })
    const current = mountedPolicy.chart.saveLoad.serialize()
    const poison = JSON.parse(current.content) as Record<string, unknown>
    poison.symbol = 'NQ'
    failWrites = true
    expect(() => mountedPolicy.chart.saveLoad.restore(JSON.stringify(poison))).toThrow()
    failWrites = false
    expect(mountedPolicy.chart.saveLoad.notSaving()).toBe(true)

    const partialContent = serializeChartContent(
      contentOf(
        [
          { id: 'sma-1', definition: 'sma' },
          { id: 'rsi-1', definition: 'rsi' },
          { id: 'gone-1', definition: 'not-installed' },
        ],
        'CL',
      ),
    )
    const partial = await adapter.charts.create({ name: 'Partial', symbol: 'CL', timeframe: '5m', content: partialContent })
    if (partial.kind !== 'ok') throw new Error('unreachable')
    expect((await mountedPolicy.chart.saveLoad.load(partial.ref.id)).kind).toBe('ok')
    expect(mountedPolicy.chart.indicators.get().map((instance) => instance.id)).toEqual(['sma-1'])
    expect(mountedPolicy.container.querySelector('.qc-toast-text')?.textContent).toBe(
      createChartI18n().t('toast.indicatorsNotCarried', { count: 2 }),
    )
    expect(mountedPolicy.chart.saveLoad.notSaving()).toBe(true)

    const complete = await adapter.charts.create({ name: 'Complete', symbol: 'ES', timeframe: '5m', content: serializeChartContent(contentOf([], 'ES')) })
    if (complete.kind !== 'ok') throw new Error('unreachable')
    expect((await mountedPolicy.chart.saveLoad.load(complete.ref.id)).kind).toBe('ok')
    expect(mountedPolicy.chart.saveLoad.notSaving()).toBe(false)
  })
})
