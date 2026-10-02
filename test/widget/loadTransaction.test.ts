// @vitest-environment happy-dom
// THE LOAD TRANSACTION, for a saved chart and for a saved layout: the content is read, applied,
// and only then does the resource's identity, name and revision become the open resource. The
// thing this pins is the destination of the NEXT save. A load that cannot be read must leave the
// chart on screen bound to whatever it was bound to before, because a save that quotes a valid
// revision of the WRONG resource overwrites saved work no conflict check can protect.
//
// Five answers a caller tells apart by `kind` alone: the body landed, the body was refused, the id
// is unknown, the store could not be reached, the load was abandoned. And one state beyond the
// call: a body refused part-way that could not be put back leaves the chart holding neither
// content, and the chart stops saving until a complete load establishes a whole one under a
// resource that matches it. A copy rescues the content but does not establish recovery.
import { describe, expect, it } from 'vitest'
import { CHART_CONTENT_VERSION, chartRecoveryReceipt, createSaveLoadApi, serializeChartContent, type ChartContent, type ParsedChartContent } from '../../src/widget/saveLoad'
import { createLayoutPlane, type LayoutModelState } from '../../src/widget/layout'
import { createChartI18n } from '../../src/i18n'
import { DEFAULT_OVERRIDES } from '../../src/overrides'
import { memorySaveLoadAdapter, type ChartSaveLoadAdapter, type ResourceStore, type ChartBody, type ChartMeta } from '../../src/resources'
import type { SerializedDrawing } from '../../src/internal/drawings/index'
import type { ChartHandle } from '../../src/widget/chart'
import { arrangementOf } from '../../src/layoutGrid'

const i18n = createChartI18n()
const t = i18n.t

const contentOf = (symbol: string, timeframe: string): ChartContent => ({
  symbol,
  timeframe,
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  appearance: DEFAULT_OVERRIDES.appearance,
  compares: null,
  ext: {},
})

/** A chart stripped to what save/load touches: its content, and the api over it. */
function fakeChart(
  symbol: string,
  timeframe: string,
  opts: { failOn?: string | string[]; adapter?: ChartSaveLoadAdapter; onApplied?: (state: ChartContent) => void } = {},
) {
  let state = contentOf(symbol, timeframe)
  let disposed = false
  const applies: string[] = []
  const refuses = typeof opts.failOn === 'string' ? [opts.failOn] : (opts.failOn ?? [])
  const apply = (parsed: ParsedChartContent): void => {
    if (parsed.symbol !== undefined && refuses.includes(parsed.symbol)) throw new Error('this chart could not take that symbol')
    applies.push(parsed.symbol ?? '')
    state = { ...state, symbol: parsed.symbol ?? state.symbol, timeframe: parsed.timeframe ?? state.timeframe }
    opts.onApplied?.(state)
  }
  const api = createSaveLoadApi({
    adapter: opts.adapter ?? null,
    i18n,
    symbol: () => state.symbol,
    timeframe: () => state.timeframe,
    content: () => state,
    apply,
    disposed: () => disposed,
  })
  return {
    api,
    applies,
    state: () => state,
    dispose: () => {
      disposed = true
    },
  }
}

/** The same chart, dressed as the handle a layout tiles. It ANNOUNCES the symbol and timeframe it
 *  took, the way a real chart does, so the layout's bus runs over live events rather than silence:
 *  what a refused load reports is only visible through them. */
function fakeHandle(id: string, symbol: string, timeframe: string, opts: { failOn?: string | string[]; adapter?: ChartSaveLoadAdapter } = {}): ChartHandle & { applies: string[] } {
  const subs: Record<string, ((value: string) => void)[]> = { symbol: [], timeframe: [] }
  let announced = { symbol, timeframe }
  const chart = fakeChart(symbol, timeframe, {
    ...opts,
    onApplied: (state) => {
      const was = announced
      announced = { symbol: state.symbol, timeframe: state.timeframe }
      if (state.symbol !== was.symbol) for (const cb of [...subs.symbol!]) cb(state.symbol)
      if (state.timeframe !== was.timeframe) for (const cb of [...subs.timeframe!]) cb(state.timeframe)
    },
  })
  const noop = (): (() => void) => () => undefined
  const on = (event: string, cb: (value: string) => void): (() => void) => {
    const list = subs[event]
    if (!list) return () => undefined
    list.push(cb)
    return () => {
      const at = list.indexOf(cb)
      if (at >= 0) list.splice(at, 1)
    }
  }
  return {
    id,
    applies: chart.applies,
    symbol: () => chart.state().symbol,
    symbolInfo: () => null,
    timeframe: () => chart.state().timeframe,
    setSymbol: (next: string) => chart.api.restore(serializeChartContent({ ...chart.state(), symbol: next })),
    setTimeframe: (next: string) => chart.api.restore(serializeChartContent({ ...chart.state(), timeframe: next })),
    style: () => 'candles',
    indicators: { get: () => [] },
    compare: { list: () => [] },
    visibleRange: () => null,
    setVisibleRange: () => undefined,
    saveLoad: chart.api,
    sync: { onCrosshair: noop, onTimeClick: noop, onVisibleRange: noop, setCrosshair: () => undefined },
    on,
  } as unknown as ChartHandle & { applies: string[] }
}

const chartsAdapterWith = async (rows: { name: string; symbol: string; timeframe: string; content: string }[]) => {
  const adapter = memorySaveLoadAdapter()
  const refs: Record<string, { id: string; revision: string }> = {}
  for (const row of rows) {
    const created = await adapter.charts.create(row)
    if (created.kind !== 'ok') throw new Error('unreachable')
    refs[row.name] = created.ref
  }
  return { adapter, refs }
}

const MALFORMED = '{this is not json'
const UNSUPPORTED = JSON.stringify({ v: 99, symbol: 'B', tf: '1h' })

describe('a saved chart refuses a body it cannot read, and stays bound to what it had', () => {
  it.each([
    ['malformed', MALFORMED],
    ['an unsupported content version', UNSUPPORTED],
  ])('a named chart loading %s content keeps its content, its binding and its next save', async (_label, bad) => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'A', symbol: 'ES', timeframe: '5m', content: serializeChartContent(contentOf('ES', '5m')) },
      { name: 'B', symbol: 'NQ', timeframe: '1h', content: bad },
    ])
    const chart = fakeChart('ES', '5m', { adapter })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    const refused = await chart.api.load(refs.B!.id)
    expect(refused).toEqual({ kind: 'invalid', message: t('host.loadInvalid') })
    expect(chart.applies).toEqual([])
    expect(chart.state().symbol).toBe('ES')
    expect(chart.state().timeframe).toBe('5m')
    expect(chart.api.current()).toEqual(boundToA)
    // The next save is the whole point: it must still land on A, and B must still hold its own body.
    const saved = await chart.api.save('A')
    expect(saved.kind).toBe('ok')
    expect(chart.api.current()!.ref.id).toBe(boundToA.ref.id)
    expect((await adapter.charts.load(boundToA.ref.id))!.body.symbol).toBe('ES')
    expect((await adapter.charts.load(refs.B!.id))!.body.content).toBe(bad)
  })

  it('an unnamed chart refused a load stays unnamed, so its next save creates instead of overwriting', async () => {
    const { adapter, refs } = await chartsAdapterWith([{ name: 'B', symbol: 'NQ', timeframe: '1h', content: UNSUPPORTED }])
    const chart = fakeChart('ES', '5m', { adapter })
    expect((await chart.api.load(refs.B!.id)).kind).toBe('invalid')
    expect(chart.api.current()).toBeNull()
    expect(chart.state().symbol).toBe('ES')
    await chart.api.save('Untitled')
    expect((await adapter.charts.list()).map((row) => row.name).sort()).toEqual(['B', 'Untitled'])
    expect((await adapter.charts.load(refs.B!.id))!.body.content).toBe(UNSUPPORTED)
  })

  it('a readable body is applied and then bound, and the next save updates the chart that was opened', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'NQ', timeframe: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
    ])
    const chart = fakeChart('ES', '5m', { adapter })
    await chart.api.save('A')
    const a = chart.api.current()!.ref
    const loaded = await chart.api.load(refs.B!.id)
    expect(loaded.kind).toBe('ok')
    expect(chart.applies).toEqual(['NQ'])
    expect(chart.state()).toMatchObject({ symbol: 'NQ', timeframe: '1h' })
    expect(chart.api.current()).toEqual({ ref: refs.B, name: 'B' })
    await chart.api.save('B')
    expect(chart.api.current()!.ref.id).toBe(refs.B!.id)
    expect((await adapter.charts.load(refs.B!.id))!.body.symbol).toBe('NQ')
    expect((await adapter.charts.load(a.id))!.body.symbol).toBe('ES')
  })

  it('a refused load in separate-drawings mode puts the drawings back too, though the blob carries none', async () => {
    // Separate mode: the content blob holds no drawings, and applying one still moves them, because
    // the symbol it lands brings that symbol's drawings with it. What the rollback has to restore
    // is therefore what the chart held, not what the blob stated.
    let state = contentOf('ES', '5m')
    let onScreen: SerializedDrawing[] = [{ id: 'held' } as unknown as SerializedDrawing]
    const api = createSaveLoadApi({
      adapter: null,
      i18n,
      symbol: () => state.symbol,
      timeframe: () => state.timeframe,
      content: () => state,
      apply: (parsed) => {
        // The drawings follow the symbol, and the rest of the body is refused after they have.
        if (parsed.symbol) onScreen = [{ id: `drawn-on-${parsed.symbol}` } as unknown as SerializedDrawing]
        if (parsed.symbol === 'CL') throw new Error('this chart could not take that symbol')
        state = { ...state, symbol: parsed.symbol ?? state.symbol, timeframe: parsed.timeframe ?? state.timeframe }
      },
      heldDrawings: {
        snapshot: () => onScreen,
        restore: (list) => {
          onScreen = [...list]
        },
      },
      disposed: () => false,
    })
    expect(() => api.restore(serializeChartContent(contentOf('CL', '1h')))).toThrow()
    expect(state.symbol).toBe('ES')
    expect(onScreen).toEqual([{ id: 'held' }])
  })

  it('a chart that cannot take the content it held back says so, instead of reporting nothing changed', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'CL', timeframe: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
    ])
    // The load is refused, and so is the rollback that would undo it: the chart is left on neither
    // content, which is the one case the plain refusal copy would describe wrongly.
    const chart = fakeChart('ES', '5m', { adapter, failOn: ['CL', 'ES'] })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    expect(await chart.api.load(refs.B!.id)).toEqual({ kind: 'invalid', message: t('host.loadNotRestored') })
    expect(chart.api.current()).toEqual(boundToA)
  })

  it('a chart left holding neither content stops saving until a load restores it', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'CL', timeframe: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      { name: 'D', symbol: 'NQ', timeframe: '4h', content: serializeChartContent(contentOf('NQ', '4h')) },
    ])
    const chart = fakeChart('ES', '5m', { adapter, failOn: ['CL', 'ES'] })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    expect(chart.api.notSaving()).toBe(false)
    expect((await chart.api.load(refs.B!.id)).kind).toBe('invalid')
    // The binding is untouched, and precisely because it is, nothing may go through it: writing now
    // would put a half-applied screen over the last good body A holds.
    expect(chart.api.current()).toEqual(boundToA)
    expect(chart.api.notSaving()).toBe(true)
    expect(await chart.api.save('A')).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect((await adapter.charts.load(boundToA.ref.id))!.body.timeframe).toBe('5m')
    expect((await adapter.charts.load(boundToA.ref.id))!.ref.revision).toBe(boundToA.ref.revision)
    // A load that lands is the recovery: a whole content and the resource it came from, together.
    expect((await chart.api.load(refs.D!.id)).kind).toBe('ok')
    expect(chart.api.notSaving()).toBe(false)
    expect((await chart.api.save('D')).kind).toBe('ok')
    expect((await adapter.charts.load(refs.D!.id))!.body.symbol).toBe('NQ')
  })

  it('a copy keeps what a chart holds without starting its saving again: the manual save and the autosave stay refused', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'CL', timeframe: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      { name: 'D', symbol: 'NQ', timeframe: '4h', content: serializeChartContent(contentOf('NQ', '4h')) },
    ])
    const chart = fakeChart('ES', '5m', { adapter, failOn: ['CL', 'ES'] })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    expect((await chart.api.load(refs.B!.id)).kind).toBe('invalid')
    expect(chart.api.notSaving()).toBe(true)
    // A copy creates, so it writes over nothing: A stands at the body and the revision it stood at,
    // and the viewer keeps what is on screen.
    const copy = await chart.api.save('A recovered', { asNew: true })
    expect(copy.kind).toBe('ok')
    expect((await adapter.charts.load(boundToA.ref.id))!.ref.revision).toBe(boundToA.ref.revision)
    // And it proves nothing about the screen it wrote down, so the chart is still not saving. The
    // manual save and the autosave are the same call, so one rule refuses both.
    expect(chart.api.notSaving()).toBe(true)
    const copied = chart.api.current()!
    expect(copied.ref.id).not.toBe(boundToA.ref.id)
    expect(await chart.api.save('A recovered')).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect(await chart.api.save('A recovered')).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect((await adapter.charts.load(copied.ref.id))!.ref.revision).toBe(copied.ref.revision)
    // A load that lands is what starts it again, and it starts it where that load left the chart.
    expect((await chart.api.load(refs.D!.id)).kind).toBe('ok')
    expect(chart.api.notSaving()).toBe(false)
    expect((await chart.api.save('D')).kind).toBe('ok')
  })

  it('a chart whose store cannot be reached says the store could not be reached, and applies nothing', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'NQ', timeframe: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
    ])
    const offline = new Error('the network went away')
    const store: ResourceStore<ChartMeta, ChartBody> = { ...adapter.charts, load: () => Promise.reject(offline) }
    const chart = fakeChart('ES', '5m', { adapter: { ...adapter, charts: store } as ChartSaveLoadAdapter })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    expect(await chart.api.load(refs.B!.id)).toEqual({ kind: 'unavailable', message: t('host.loadUnavailable'), cause: offline })
    expect(chart.applies).toEqual([])
    expect(chart.api.current()).toEqual(boundToA)
    expect(chart.api.notSaving()).toBe(false)
  })

  it('a chart disposed while the store answers applies nothing and binds nothing', async () => {
    const { adapter, refs } = await chartsAdapterWith([
      { name: 'B', symbol: 'NQ', timeframe: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
    ])
    let answer: (() => void) | null = null
    const store: ResourceStore<ChartMeta, ChartBody> = {
      ...adapter.charts,
      load: (id) =>
        new Promise((resolve, reject) => {
          answer = () => adapter.charts.load(id).then(resolve, reject)
        }),
    }
    const chart = fakeChart('ES', '5m', { adapter: { ...adapter, charts: store } as ChartSaveLoadAdapter })
    await chart.api.save('A')
    const boundToA = chart.api.current()!
    const loading = chart.api.load(refs.B!.id)
    chart.dispose()
    answer!()
    expect(await loading).toEqual({ kind: 'cancelled' })
    expect(chart.applies).toEqual([])
    expect(chart.api.current()).toEqual(boundToA)
  })
})

describe('containing layout safety', () => {
  it('a recovery receipt does not certify a later child restore generation', () => {
    const failures = ['CL', 'ES']
    const child = fakeChart('ES', '5m', { failOn: failures })
    expect(() => child.api.restore(serializeChartContent(contentOf('CL', '1h')))).toThrow()
    failures.length = 0
    child.api.restore(serializeChartContent(contentOf('NQ', '1h')))
    const receipt = chartRecoveryReceipt(child.api)!
    child.api.restore(serializeChartContent(contentOf('ES', '5m')))
    receipt()
    expect(child.api.notSaving()).toBe(true)
  })
  it('blocks parent writes and copy catch-up, then recovers descendants only on a complete bound load', async () => {
    const adapter = memorySaveLoadAdapter()
    const failures: string[] = []
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter, i18n,
      createChart: () => fakeHandle('child', 'ES', '5m', { failOn: failures, adapter }),
      destroyChart: () => undefined, onActive: () => undefined, onChange: () => undefined,
    })
    await layout.api.saveLoad.save('A')
    const original = layout.api.saveLoad.current()!
    const good = layout.api.serialize().content
    const child = layout.handles()[0]!
    await child.saveLoad.save('Child A')
    const childBinding = child.saveLoad.current()
    failures.push('CL', 'ES')
    expect(() => child.saveLoad.restore(serializeChartContent(contentOf('CL', '1h')))).toThrow()
    expect(child.saveLoad.notSaving()).toBe(true)
    expect(layout.api.saveLoad.notSaving()).toBe(true)
    expect((await layout.api.saveLoad.save('A')).kind).toBe('not-saving')
    expect((await layout.api.saveLoad.save('Rescue', { asNew: true })).kind).toBe('ok')
    expect((await layout.api.saveLoad.save('Rescue')).kind).toBe('not-saving')
    expect((await adapter.layouts.load(original.ref.id))!.ref).toEqual(original.ref)
    failures.length = 0
    layout.api.restore(good)
    expect(child.saveLoad.notSaving()).toBe(true)
    expect(child.saveLoad.current()).toEqual(childBinding)
    // A partial layout can load, but it cannot certify a child it did not fully restore.
    const partial = await adapter.layouts.create({
      name: 'Partial',
      content: JSON.stringify({ v: 2, identity: { namespace: 'layout:saved-partial', next: 2 }, arrangement: 's', geometry: arrangementOf('s')!.rects, sync: { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 0, charts: [{ id: 'layout:saved-partial:chart:1', content: JSON.stringify({ v: CHART_CONTENT_VERSION, symbol: 'NQ', indicators: [] }) }] }),
    })
    if (partial.kind !== 'ok') throw new Error('unreachable')
    expect((await layout.api.saveLoad.load(partial.ref.id)).kind).toBe('ok')
    expect(child.saveLoad.notSaving()).toBe(true)
    expect(child.saveLoad.current()).toEqual(childBinding)
    const saved = await adapter.layouts.create({ name: 'Recovered', content: good })
    if (saved.kind !== 'ok') throw new Error('unreachable')
    expect((await layout.api.saveLoad.load(saved.ref.id)).kind).toBe('ok')
    expect(child.saveLoad.notSaving()).toBe(false)
    expect(child.saveLoad.current()).toBeNull()
    expect(layout.api.saveLoad.notSaving()).toBe(false)
    layout.destroy()
  })

  it('a later sibling failure and failed outer rollback cannot certify the earlier child', async () => {
    const adapter = memorySaveLoadAdapter()
    const failures: string[][] = [[], []]
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter, i18n, arrangement: '2v',
      createChart: (_element, _init, index) => fakeHandle(`child-${index}`, 'ES', '5m', { failOn: failures[index], adapter }),
      destroyChart: () => undefined, onActive: () => undefined, onChange: () => undefined,
    })
    await layout.api.saveLoad.save('A')
    await layout.handles()[0]!.saveLoad.save('Child A')
    const childBinding = layout.handles()[0]!.saveLoad.current()
    failures[0]!.push('CL', 'ES')
    expect(() => layout.handles()[0]!.saveLoad.restore(serializeChartContent(contentOf('CL', '1h')))).toThrow()
    failures[0]!.length = 0
    failures[1]!.push('NQ', 'ES')
    const content = JSON.stringify({ v: 2, identity: { namespace: 'layout:saved-siblings', next: 3 }, arrangement: '2v', geometry: arrangementOf('2v')!.rects, sync: { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 0, charts: ['NQ', 'NQ'].map((symbol, index) => ({ id: `layout:saved-siblings:chart:${index + 1}`, content: serializeChartContent(contentOf(symbol, '1h')) })) })
    const b = await adapter.layouts.create({ name: 'B', content })
    if (b.kind !== 'ok') throw new Error('unreachable')
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    expect(layout.handles()[0]!.saveLoad.notSaving()).toBe(true)
    expect(layout.handles()[0]!.saveLoad.current()).toEqual(childBinding)
    expect(layout.api.saveLoad.notSaving()).toBe(true)
    layout.destroy()
  })
})

describe('a saved layout is read whole, nested charts included, before a tile moves', () => {
  const layoutContent = (arrangement: string, charts: { symbol: string; tf: string; content: string }[]): string =>
    JSON.stringify({ v: 2, identity: { namespace: `layout:saved-${arrangement}`, next: charts.length + 1 }, arrangement, geometry: arrangementOf(arrangement)?.rects ?? [], sync: { symbol: true, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 0, charts: charts.map((chart, index) => ({ id: `layout:saved-${arrangement}:chart:${index + 1}`, ...chart })) })

  /** `failOn` names the symbols every chart this layout builds refuses. Naming the symbol a load
   *  brings AND the one the layout holds is what makes the apply fail part-way and the rollback
   *  fail after it, which is the only way a layout ends up holding neither content. */
  const plane = (adapter: ChartSaveLoadAdapter, changes: string[], failOn?: string[], onCommitted?: (state: LayoutModelState) => void) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let next = 0
    return createLayoutPlane({
      container,
      adapter,
      i18n,
      arrangement: 's',
      charts: [{ symbol: 'ES', timeframe: '5m' }],
      createChart: () => fakeHandle(`c${next++}`, 'ES', '5m', failOn ? { failOn } : {}),
      destroyChart: () => undefined,
      onActive: () => undefined,
      onChange: () => changes.push('change'),
      onCommitted,
    })
  }

  it('persists chart entities across reorder and never reuses a retired identity', () => {
    const rebound: string[] = []
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter: null, i18n, arrangement: '2v', identitySeed: 'desk',
      createChart: (_element, _init, index) => fakeHandle(`runtime-${index}`, 'ES', '5m'),
      rebindChart: (_handle, id) => rebound.push(id),
      destroyChart: () => undefined, onActive: () => undefined, onChange: () => undefined,
    })
    const first = JSON.parse(layout.api.serialize().content) as { identity: { namespace: string; next: number }; charts: { id: string }[] }
    expect(first.charts.map((chart) => chart.id)).toEqual(['layout:desk:chart:1', 'layout:desk:chart:2'])
    const reordered = { ...first, charts: [first.charts[1], first.charts[0]] }
    layout.api.restore(JSON.stringify(reordered))
    expect(rebound).toEqual(['layout:desk:chart:2', 'layout:desk:chart:1'])
    layout.api.setArrangement('s')
    layout.api.setArrangement('2v')
    const expanded = JSON.parse(layout.api.serialize().content) as typeof first
    expect(expanded.charts.map((chart) => chart.id)).toEqual(['layout:desk:chart:2', 'layout:desk:chart:3'])
    expect(expanded.identity.next).toBe(4)
    layout.destroy()
  })

  it('takes saved v2 identities on a fresh widget and retains them through copy and detach', async () => {
    const adapter = memorySaveLoadAdapter()
    const source = plane(adapter, [])
    source.api.setArrangement('2v')
    const savedBody = source.api.serialize().content
    const savedIds = (JSON.parse(savedBody) as { charts: { id: string }[] }).charts.map((chart) => chart.id)
    const row = await adapter.layouts.create({ name: 'Saved', content: savedBody })
    if (row.kind !== 'ok') throw new Error('unreachable')
    source.destroy()

    const fresh = plane(adapter, [])
    expect((await fresh.api.saveLoad.load(row.ref.id)).kind).toBe('ok')
    expect((JSON.parse(fresh.api.serialize().content) as { charts: { id: string }[] }).charts.map((chart) => chart.id)).toEqual(savedIds)
    const copy = await fresh.api.saveLoad.save('Copy', { asNew: true })
    expect(copy.kind).toBe('ok')
    expect((JSON.parse(fresh.api.serialize().content) as { charts: { id: string }[] }).charts.map((chart) => chart.id)).toEqual(savedIds)
    fresh.api.saveLoad.detach()
    expect((JSON.parse(fresh.api.serialize().content) as { charts: { id: string }[] }).charts.map((chart) => chart.id)).toEqual(savedIds)
    fresh.destroy()
  })

  type IdentityBody = { identity: { next: number }; charts: { id?: string }[] }
  it.each<[string, (body: IdentityBody) => void]>([
    ['missing', (body) => { delete body.charts[0]!.id }],
    ['duplicate', (body) => { body.charts[1]!.id = body.charts[0]!.id }],
    ['reusable allocator', (body) => { body.identity.next = 2 }],
  ])('refuses %s chart identity before mutation or rebinding', (_label, corrupt) => {
    const rebound: string[] = []
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter: null, i18n, arrangement: '2v', identitySeed: 'desk',
      createChart: (_element, _init, index) => fakeHandle(`runtime-${index}`, 'ES', '5m'),
      rebindChart: (_handle, id) => rebound.push(id),
      destroyChart: () => undefined, onActive: () => undefined, onChange: () => undefined,
    })
    const held = layout.api.serialize().content
    const body = JSON.parse(held) as IdentityBody
    corrupt(body)
    expect(() => layout.api.restore(JSON.stringify(body))).toThrow()
    expect(layout.api.serialize().content).toBe(held)
    expect(rebound).toEqual([])
    layout.destroy()
  })

  it.each(['layout:%zz', 'layout:a/b', 'session:A', 'session:a_b'])('refuses noncanonical namespace %s', (namespace) => {
    const layout = plane(memorySaveLoadAdapter(), [])
    const held = layout.api.serialize().content
    const body = JSON.parse(held) as { identity: { namespace: string }; charts: { id: string }[] }
    body.identity.namespace = namespace
    body.charts[0]!.id = `${namespace}:chart:1`
    expect(() => layout.api.restore(JSON.stringify(body))).toThrow('invalid layout chart identity allocator')
    expect(layout.api.serialize().content).toBe(held)
    layout.destroy()
  })

  it('rolls an earlier drawing identity rebind back when a later chart refuses reconciliation', () => {
    const identities = new Map<string, string>()
    let refuse = false
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter: null, i18n, arrangement: '2v', identitySeed: 'desk',
      createChart: (_element, _init, index, id) => {
        const handle = fakeHandle(`runtime-${index}`, 'ES', '5m')
        identities.set(handle.id, id)
        return handle
      },
      rebindChart: (handle, id) => {
        if (refuse && handle.id === 'runtime-1') throw new Error('refused identity')
        identities.set(handle.id, id)
      },
      destroyChart: () => undefined, onActive: () => undefined, onChange: () => undefined,
    })
    const held = layout.api.serialize().content
    const body = JSON.parse(held) as { identity: { namespace: string; next: number }; charts: { id: string }[] }
    body.identity = { namespace: 'layout:other', next: 3 }
    body.charts[0]!.id = 'layout:other:chart:1'
    body.charts[1]!.id = 'layout:other:chart:2'
    refuse = true
    expect(() => layout.api.restore(JSON.stringify(body))).toThrow('refused identity')
    expect([...identities.values()]).toEqual(['layout:desk:chart:1', 'layout:desk:chart:2'])
    expect(layout.api.serialize().content).toBe(held)
    layout.destroy()
  })

  it('publishes complete committed private state without exposing a public layout field', () => {
    const states: LayoutModelState[] = []
    const layout = plane(memorySaveLoadAdapter(), [], undefined, (state) => states.push(state))
    layout.api.setArrangement('2h')
    layout.api.setActive(1)
    layout.api.setSync({ timeframe: true })
    expect(states.at(-1)).toEqual({
      arrangement: '2h',
      geometry: arrangementOf('2h')!.rects,
      sync: { symbol: false, timeframe: true, crosshair: false, time: false, dateRange: false },
      active: 1,
      maximized: null,
    })
    expect('geometry' in layout.api).toBe(false)
    layout.destroy()
  })

  it.each([
    ['v1', JSON.stringify({ v: 1, arrangement: 's', charts: [] })],
    ['malformed v2 geometry', JSON.stringify({ v: 2, arrangement: 's', geometry: [{ x: 0, y: 0, w: 2, h: 1 }], sync: { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 0, charts: [{ symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) }] })],
  ])('refuses %s without mutation or save-target rebinding', async (_label, content) => {
    const adapter = memorySaveLoadAdapter()
    const changes: string[] = []
    const layout = plane(adapter, changes)
    const original = await layout.api.saveLoad.save('Original')
    if (original.kind !== 'ok') throw new Error('unreachable')
    const candidate = await adapter.layouts.create({ name: 'Candidate', content })
    if (candidate.kind !== 'ok') throw new Error('unreachable')
    const held = layout.api.serialize().content
    changes.length = 0
    expect((await layout.api.saveLoad.load(candidate.ref.id)).kind).toBe('invalid')
    expect(layout.api.serialize().content).toBe(held)
    expect(layout.api.saveLoad.current()).toEqual({ ref: original.ref, name: 'Original' })
    expect(changes).toEqual([])
    layout.destroy()
  })

  it('a layout whose nested chart content this build cannot read changes nothing and stays bound to the layout it had', async () => {
    const adapter = memorySaveLoadAdapter()
    const changes: string[] = []
    const layout = plane(adapter, changes)
    const savedA = await layout.api.saveLoad.save('A')
    expect(savedA.kind).toBe('ok')
    const boundToA = layout.api.saveLoad.current()!
    const badChild = JSON.stringify({ v: 2, arrangement: '2v', geometry: arrangementOf('2v')!.rects, sync: { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 1, charts: [{ symbol: 'NQ', tf: '1h', content: UNSUPPORTED }, { symbol: 'ES', tf: '5m', content: serializeChartContent(contentOf('ES', '5m')) }] })
    const b = await adapter.layouts.create({ name: 'B', content: badChild })
    if (b.kind !== 'ok') throw new Error('unreachable')
    changes.length = 0
    const refused = await layout.api.saveLoad.load(b.ref.id)
    expect(refused).toEqual({ kind: 'invalid', message: t('host.loadInvalid') })
    // The tiles never moved, the charts never took content, and nothing reported a change a host
    // would autosave on.
    expect(layout.api.arrangement()).toBe('s')
    expect(layout.handles().length).toBe(1)
    expect(layout.api.active()).toBe(0)
    expect(layout.api.sync().symbol).toBe(false)
    expect((layout.handles()[0] as ChartHandle & { applies: string[] }).applies).toEqual([])
    expect(changes).toEqual([])
    expect(layout.api.saveLoad.current()).toEqual(boundToA)
    // The next save still writes A, and B keeps the body that could not be opened.
    await layout.api.saveLoad.save('A')
    expect(layout.api.saveLoad.current()!.ref.id).toBe(boundToA.ref.id)
    expect((await adapter.layouts.load(b.ref.id))!.body.content).toBe(badChild)
    expect((await adapter.layouts.load(boundToA.ref.id))!.body.name).toBe('A')
    layout.destroy()
  })

  it('a layout naming an arrangement this build does not carry is refused before a tile moves', async () => {
    const adapter = memorySaveLoadAdapter()
    const changes: string[] = []
    const layout = plane(adapter, changes)
    const b = await adapter.layouts.create({
      name: 'B',
      content: layoutContent('9x9', [{ symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) }]),
    })
    if (b.kind !== 'ok') throw new Error('unreachable')
    changes.length = 0
    // Refusing the code up front is what keeps the refusal free: a layout that re-tiled first could
    // only be put back by re-tiling again, on new charts.
    expect(await layout.api.saveLoad.load(b.ref.id)).toEqual({ kind: 'invalid', message: t('host.loadInvalid') })
    expect(layout.api.arrangement()).toBe('s')
    expect((layout.handles()[0] as ChartHandle & { applies: string[] }).applies).toEqual([])
    expect(changes).toEqual([])
    expect(layout.api.saveLoad.current()).toBeNull()
    layout.destroy()
  })

  it('a layout with a readable body applies it and then binds, and the next save updates it', async () => {
    const adapter = memorySaveLoadAdapter()
    const layout = plane(adapter, [])
    await layout.api.saveLoad.save('A')
    const a = layout.api.saveLoad.current()!.ref
    const good = layoutContent('2v', [
      { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
      { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
    ])
    const b = await adapter.layouts.create({ name: 'B', content: good })
    if (b.kind !== 'ok') throw new Error('unreachable')
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('ok')
    expect(layout.api.arrangement()).toBe('2v')
    expect(layout.handles().map((h) => h.symbol())).toEqual(['NQ', 'CL'])
    expect(layout.api.sync().symbol).toBe(true)
    expect(layout.api.saveLoad.current()).toEqual({ ref: b.ref, name: 'B' })
    await layout.api.saveLoad.save('B')
    expect(layout.api.saveLoad.current()!.ref.id).toBe(b.ref.id)
    expect((await adapter.layouts.load(a.id))!.body.name).toBe('A')
    layout.destroy()
  })

  it('a layout torn down while the store answers restores nothing and binds nothing', async () => {
    const base = memorySaveLoadAdapter()
    const good = layoutContent('2v', [
      { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
      { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
    ])
    const b = await base.layouts.create({ name: 'B', content: good })
    if (b.kind !== 'ok') throw new Error('unreachable')
    let answer: (() => void) | null = null
    const adapter = {
      ...base,
      layouts: {
        ...base.layouts,
        load: (id: string) =>
          new Promise<{ ref: { id: string; revision: string }; body: { name: string; content: string } } | null>((resolve, reject) => {
            answer = () => base.layouts.load(id).then(resolve, reject)
          }),
      },
    } as unknown as ChartSaveLoadAdapter
    const layout = plane(adapter, [])
    await layout.api.saveLoad.save('A')
    const boundToA = layout.api.saveLoad.current()!
    const loading = layout.api.saveLoad.load(b.ref.id)
    layout.destroy()
    answer!()
    expect(await loading).toEqual({ kind: 'cancelled' })
    expect(layout.api.saveLoad.current()).toEqual(boundToA)
  })

  it('a later load supersedes one still in flight, and only the later one binds or applies', async () => {
    const base = memorySaveLoadAdapter()
    const first = await base.layouts.create({ name: 'First', content: layoutContent('2v', ['NQ', 'ES'].map((symbol) => ({ symbol, tf: '1h', content: serializeChartContent(contentOf(symbol, '1h')) }))) })
    const second = await base.layouts.create({ name: 'Second', content: layoutContent('2h', ['CL', 'GC'].map((symbol) => ({ symbol, tf: '4h', content: serializeChartContent(contentOf(symbol, '4h')) }))) })
    if (first.kind !== 'ok' || second.kind !== 'ok') throw new Error('unreachable')
    const release = new Map<string, () => void>()
    const adapter = {
      ...base,
      layouts: {
        ...base.layouts,
        load: (id: string) =>
          new Promise<unknown>((resolve, reject) => {
            release.set(id, () => base.layouts.load(id).then(resolve, reject))
          }),
      },
    } as unknown as ChartSaveLoadAdapter
    const layout = plane(adapter, [])
    const one = layout.api.saveLoad.load(first.ref.id)
    const two = layout.api.saveLoad.load(second.ref.id)
    release.get(second.ref.id)!()
    expect((await two).kind).toBe('ok')
    release.get(first.ref.id)!()
    expect(await one).toEqual({ kind: 'cancelled' })
    expect(layout.api.arrangement()).toBe('2h')
    expect(layout.api.saveLoad.current()).toEqual({ ref: second.ref, name: 'Second' })
    layout.destroy()
  })

  it('autosave after a refused load writes the layout it was already bound to, and never the one it failed to open', async () => {
    const adapter = memorySaveLoadAdapter()
    const changes: string[] = []
    const layout = plane(adapter, changes)
    await layout.api.saveLoad.save('A')
    const a = layout.api.saveLoad.current()!.ref
    const bad = JSON.stringify({ v: 2, arrangement: '2v', geometry: arrangementOf('2v')!.rects, sync: { symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false }, active: 0, charts: [{ symbol: 'NQ', tf: '1h', content: MALFORMED }, { symbol: 'ES', tf: '5m', content: serializeChartContent(contentOf('ES', '5m')) }] })
    const b = await adapter.layouts.create({ name: 'B', content: bad })
    if (b.kind !== 'ok') throw new Error('unreachable')
    changes.length = 0
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    // The rule the chrome's autosave runs on: a dirty layout with an open resource writes itself
    // back under the name it holds. Nothing reported dirty here, and the resource it holds is A.
    expect(changes).toEqual([])
    const open = layout.api.saveLoad.current()!
    expect(open.name).toBe('A')
    await layout.api.saveLoad.save(open.name)
    expect((await adapter.layouts.load(b.ref.id))!.body).toEqual({ name: 'B', content: bad })
    expect((await adapter.layouts.load(a.id))!.body.name).toBe('A')
    layout.destroy()
  })

  it('a nested chart that refuses its content part-way leaves the layout on the content it held, and reports no change', async () => {
    const adapter = memorySaveLoadAdapter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const changes: string[] = []
    let built = 0
    const layout = createLayoutPlane({
      container,
      adapter,
      i18n,
      arrangement: 's',
      charts: [{ symbol: 'ES', timeframe: '5m' }],
      // Every chart this layout builds refuses one symbol outright: the blob reads cleanly and the
      // apply still fails, which is the case prevalidation alone cannot rule out.
      createChart: () => fakeHandle(`c${built++}`, 'ES', '5m', { failOn: 'CL' }),
      destroyChart: () => undefined,
      onActive: () => undefined,
      onChange: () => changes.push('change'),
    })
    await layout.api.saveLoad.save('A')
    const boundToA = layout.api.saveLoad.current()!
    const b = await adapter.layouts.create({
      name: 'B',
      content: layoutContent('2v', [
        { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
        { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      ]),
    })
    if (b.kind !== 'ok') throw new Error('unreachable')
    changes.length = 0
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    expect(layout.api.arrangement()).toBe('s')
    expect(layout.handles().map((h) => h.symbol())).toEqual(['ES'])
    expect(layout.api.saveLoad.current()).toEqual(boundToA)
    // The apply that failed and the rollback that undid it both moved charts, and both did it as
    // placement: an unchanged layout that reported dirty would have an autosaving host write an
    // identical body and burn a revision on it.
    expect(changes).toEqual([])
    layout.destroy()
  })

  it('rolls back a restore shrink whose retired chart cleanup fails', () => {
    let built = 0
    let failed = false
    const layout = createLayoutPlane({
      container: document.createElement('div'), adapter: null, i18n, arrangement: '2v', identitySeed: 'desk',
      createChart: () => fakeHandle(`cleanup-${++built}`, 'ES', '5m'),
      destroyChart: (handle) => {
        if (!failed && handle.id === 'cleanup-2') { failed = true; throw new Error('cleanup refused') }
      },
      onActive: () => undefined, onChange: () => undefined,
    })
    const held = layout.api.serialize().content
    const target = layoutContent('s', [{ symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) }])
    expect(() => layout.api.restore(target)).toThrow('cleanup refused')
    expect(layout.api.serialize().content).toBe(held)
    expect(layout.api.arrangement()).toBe('2v')
    expect(layout.handles()).toHaveLength(2)
    layout.destroy()
  })

  it('a layout that cannot take the content it held back says so, instead of reporting nothing changed', async () => {
    const adapter = memorySaveLoadAdapter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    let built = 0
    const layout = createLayoutPlane({
      container,
      adapter,
      i18n,
      arrangement: 's',
      charts: [{ symbol: 'ES', timeframe: '5m' }],
      // These charts refuse the symbol the load brings AND the one the layout held, so the apply
      // fails part-way and the rollback fails after it.
      createChart: () => fakeHandle(`c${built++}`, 'ES', '5m', { failOn: ['CL', 'ES'] }),
      destroyChart: () => undefined,
      onActive: () => undefined,
      onChange: () => undefined,
    })
    await layout.api.saveLoad.save('A')
    const boundToA = layout.api.saveLoad.current()!
    const b = await adapter.layouts.create({
      name: 'B',
      content: layoutContent('2v', [
        { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
        { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      ]),
    })
    if (b.kind !== 'ok') throw new Error('unreachable')
    expect(await layout.api.saveLoad.load(b.ref.id)).toEqual({ kind: 'invalid', message: t('host.loadNotRestored') })
    expect(layout.api.saveLoad.current()).toEqual(boundToA)
    layout.destroy()
  })

  it('a layout left holding neither content stops saving, autosave and all, until a load restores it', async () => {
    const adapter = memorySaveLoadAdapter()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const changes: string[] = []
    let built = 0
    const layout = createLayoutPlane({
      container,
      adapter,
      i18n,
      arrangement: 's',
      charts: [{ symbol: 'ES', timeframe: '5m' }],
      // These charts refuse the symbol the load brings AND the one the layout held, so the apply
      // fails part-way and the rollback fails after it.
      createChart: () => fakeHandle(`c${built++}`, 'ES', '5m', { failOn: ['CL', 'ES'] }),
      destroyChart: () => undefined,
      onActive: () => undefined,
      onChange: () => changes.push('change'),
    })
    await layout.api.saveLoad.save('A')
    const boundToA = layout.api.saveLoad.current()!
    const heldByA = (await adapter.layouts.load(boundToA.ref.id))!
    const b = await adapter.layouts.create({
      name: 'B',
      content: layoutContent('2v', [
        { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
        { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      ]),
    })
    const c = await adapter.layouts.create({ name: 'C', content: layoutContent('s', [{ symbol: 'NQ', tf: '4h', content: serializeChartContent(contentOf('NQ', '4h')) }]) })
    if (b.kind !== 'ok' || c.kind !== 'ok') throw new Error('unreachable')
    expect(layout.api.saveLoad.notSaving()).toBe(false)
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    expect(layout.api.saveLoad.notSaving()).toBe(true)
    // The autosave rule a host runs: the open layout is written back under the name it holds. Every
    // one of those writes is refused, and A stands at the body and the revision it stood at.
    changes.length = 0
    expect(await layout.api.saveLoad.save(boundToA.name)).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect(await layout.api.saveLoad.save(boundToA.name)).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    const stillA = (await adapter.layouts.load(boundToA.ref.id))!
    expect(stillA.body).toEqual(heldByA.body)
    expect(stillA.ref.revision).toBe(heldByA.ref.revision)
    expect(layout.api.saveLoad.current()).toEqual(boundToA)
    // A load that lands puts a whole content on screen under the resource it came from, and saving
    // starts again where that load left it.
    expect((await layout.api.saveLoad.load(c.ref.id)).kind).toBe('ok')
    expect(layout.api.saveLoad.notSaving()).toBe(false)
    expect((await layout.api.saveLoad.save('C')).kind).toBe('ok')
    expect((await adapter.layouts.load(c.ref.id))!.body.name).toBe('C')
    expect((await adapter.layouts.load(boundToA.ref.id))!.body).toEqual(heldByA.body)
    layout.destroy()
  })

  it('a copy keeps what a layout holds without starting its saving again, and the layout it was bound to stands whole', async () => {
    const adapter = memorySaveLoadAdapter()
    const changes: string[] = []
    const layout = plane(adapter, changes, ['CL', 'ES'])
    await layout.api.saveLoad.save('A')
    const boundToA = layout.api.saveLoad.current()!
    const heldByA = (await adapter.layouts.load(boundToA.ref.id))!
    const b = await adapter.layouts.create({
      name: 'B',
      content: layoutContent('2v', [
        { symbol: 'NQ', tf: '1h', content: serializeChartContent(contentOf('NQ', '1h')) },
        { symbol: 'CL', tf: '1h', content: serializeChartContent(contentOf('CL', '1h')) },
      ]),
    })
    const c = await adapter.layouts.create({ name: 'C', content: layoutContent('s', [{ symbol: 'NQ', tf: '4h', content: serializeChartContent(contentOf('NQ', '4h')) }]) })
    if (b.kind !== 'ok' || c.kind !== 'ok') throw new Error('unreachable')
    expect((await layout.api.saveLoad.load(b.ref.id)).kind).toBe('invalid')
    expect(layout.api.saveLoad.notSaving()).toBe(true)
    // The one write a layout holding neither content is allowed: it creates, so A is not touched and
    // the tiles on screen are kept somewhere of their own.
    expect((await layout.api.saveLoad.save('A recovered', { asNew: true })).kind).toBe('ok')
    const stillA = (await adapter.layouts.load(boundToA.ref.id))!
    expect(stillA.body).toEqual(heldByA.body)
    expect(stillA.ref.revision).toBe(heldByA.ref.revision)
    // The layout still holds tiles nothing validated, so it still saves nowhere: the copy it just
    // made is refused the same as the layout it came from.
    expect(layout.api.saveLoad.notSaving()).toBe(true)
    const copied = layout.api.saveLoad.current()!
    expect(copied.ref.id).not.toBe(boundToA.ref.id)
    expect(await layout.api.saveLoad.save('A recovered')).toEqual({ kind: 'not-saving', message: t('host.notSaving') })
    expect((await adapter.layouts.load(copied.ref.id))!.ref.revision).toBe(copied.ref.revision)
    // A saved layout that opens is what starts it again.
    expect((await layout.api.saveLoad.load(c.ref.id)).kind).toBe('ok')
    expect(layout.api.saveLoad.notSaving()).toBe(false)
    expect((await layout.api.saveLoad.save('C')).kind).toBe('ok')
    layout.destroy()
  })

  it('a layout whose store cannot be reached says the store could not be reached, and moves no tile', async () => {
    const base = memorySaveLoadAdapter()
    const offline = new Error('the network went away')
    const adapter = { ...base, layouts: { ...base.layouts, load: () => Promise.reject(offline) } } as unknown as ChartSaveLoadAdapter
    const changes: string[] = []
    const layout = plane(adapter, changes)
    changes.length = 0
    expect(await layout.api.saveLoad.load('anything')).toEqual({ kind: 'unavailable', message: t('host.loadUnavailable'), cause: offline })
    expect(layout.api.arrangement()).toBe('s')
    expect((layout.handles()[0] as ChartHandle & { applies: string[] }).applies).toEqual([])
    expect(changes).toEqual([])
    expect(layout.api.saveLoad.current()).toBeNull()
    expect(layout.api.saveLoad.notSaving()).toBe(false)
    layout.destroy()
  })
})
