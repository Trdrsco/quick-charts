// The layout's ACTIVE CHART. A host with one surface that follows a multi-chart layout asks the
// layout which chart it is pointed at, and through it which market. Activating a chart re-points
// that surface and moves no chart at all: the two are different things, which is the whole point.
// So what is pinned here is that the active chart tracks activation exactly, that it never
// re-points a chart, and that it is reported for every way it can move: a chart being activated,
// the active chart's symbol changed, a re-tile that drops the active chart, a restore. A market
// that moves in silence strands the host on the last one.
//
// The charts are fakes and the DOM is a stub, so the code under test is the real layout plane: its
// own activation, fan-out, re-tile and restore paths decide every value asserted below.
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutPlane } from '../../src/widget/layout'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChartI18n } from '../../src/i18n'
import type { ChartHandle } from '../../src/widget/chart'
import { parseChartContent, serializeChartContent, type ChartContent } from '../../src/widget/saveLoad'
import { DEFAULT_OVERRIDES } from '../../src/overrides'

interface FakeEl {
  className: string
  dataset: Record<string, string>
  style: Record<string, string>
  down: (() => void) | null
  removed: boolean
  appendChild(c: FakeEl): void
  addEventListener(t: string, h: () => void): void
  removeEventListener(t: string, h: () => void): void
  remove(): void
}

const el = (): FakeEl => {
  const e: FakeEl = {
    className: '',
    dataset: {},
    style: {},
    down: null,
    removed: false,
    appendChild: () => {},
    addEventListener: (t, h) => {
      if (t === 'pointerdown') e.down = h
    },
    removeEventListener: () => {
      e.down = null
    },
    remove: () => { e.removed = true },
  }
  return e
}

const made: FakeEl[] = []
beforeEach(() => {
  made.length = 0
  const g = globalThis as unknown as { document: { createElement(): FakeEl } }
  g.document = {
    createElement: () => {
      const e = el()
      made.push(e)
      return e
    },
  }
})

/** The chart content a stand-in chart holds: nothing but the symbol and timeframe move in these
 *  tests, and the rest is the chart's own defaults. */
const BLANK_CONTENT = {
  symbol: '',
  timeframe: '1D',
  style: 'candles',
  scale: 'normal',
  priceAxis: 'auto',
  indicators: [],
  appearance: DEFAULT_OVERRIDES.appearance,
  compares: null,
  ext: {},
} as const satisfies ChartContent

/** A stand-in chart: symbol and timeframe state, the two sync lanes the layout wires, and the save
 *  blob it serializes. Everything the layout actually touches, and nothing else. */
function fakeChart(id: string, initial: string) {
  let symbol = initial
  let timeframe = '1D'
  const symbolSubs = new Set<(s: string) => void>()
  const off = () => () => undefined
  const handle = {
    id,
    symbol: () => symbol,
    symbolInfo: () => null,
    setSymbol(next: string) {
      if (next === symbol) return
      symbol = next
      for (const cb of [...symbolSubs]) cb(next)
    },
    timeframe: () => timeframe,
    setTimeframe(next: string) {
      timeframe = next
    },
    style: () => 'candles',
    indicators: { get: () => [] },
    compare: { list: () => [] },
    visibleRange: () => null,
    setVisibleRange: () => undefined,
    sync: { onCrosshair: off, onTimeClick: off, onVisibleRange: off },
    saveLoad: {
      notSaving: () => false,
      // A layout reads every nested chart's blob before it re-tiles, so the stand-in writes the
      // chart's real content format rather than a shape of its own.
      serialize: () => ({ symbol, timeframe, content: serializeChartContent({ ...BLANK_CONTENT, symbol, timeframe }) }),
      restore(content: string) {
        const parsed = parseChartContent(content)
        if (parsed.symbol) handle.setSymbol(parsed.symbol)
        if (parsed.timeframe) timeframe = parsed.timeframe
      },
    },
    on(name: string, callback: (value: string) => void) {
      if (name !== 'symbol') return off()
      symbolSubs.add(callback)
      return () => symbolSubs.delete(callback)
    },
  }
  return handle as unknown as ChartHandle
}

/** A layout of `symbols.length` charts, plus the active markets it reported along the way. */
const mount = (symbols: string[], arrangement: string, sync?: { symbol?: boolean }) => {
  const active: string[] = []
  let seq = 0
  const plane = createLayoutPlane({
    container: el() as unknown as HTMLElement,
    adapter: null,
    i18n: createChartI18n(),
    arrangement,
    charts: symbols.map((symbol) => ({ symbol })),
    ...(sync ? { sync } : {}),
    createChart: (_element, init) => fakeChart(`chart-${++seq}`, init?.symbol ?? 'SEED'),
    destroyChart: () => undefined,
    onActive: (handle) => active.push(handle.symbol()),
    onChange: () => undefined,
  })
  return { plane, active, symbolsNow: () => plane.handles().map((h) => h.symbol()) }
}

describe('the layout is pointed at its active chart', () => {
  it('rolls an expansion back when constructing a new cloned tile fails', () => {
    let seq = 0
    let refuseThird = false
    let refuseCleanup = false
    const destroyed: string[] = []
    const plane = createLayoutPlane({
      container: el() as unknown as HTMLElement,
      adapter: null,
      i18n: createChartI18n(),
      arrangement: 's',
      charts: [{ symbol: 'ES' }],
      createChart: (_element, init, index) => {
        if (refuseThird && index === 2) throw new Error('construction refused')
        return fakeChart(`chart-${++seq}`, init?.symbol ?? 'SEED')
      },
      destroyChart: (handle) => {
        destroyed.push(handle.id)
        if (refuseCleanup && handle.id === 'chart-2') throw new Error('cleanup refused')
      },
      onActive: () => undefined,
      onChange: () => undefined,
    })
    const held = [...plane.handles()]
    const style = held[0]!.style
    held[0]!.style = () => { throw new Error('snapshot refused') }
    expect(() => plane.api.setArrangement('3h')).toThrow('snapshot refused')
    expect(plane.api.arrangement()).toBe('s')
    expect(plane.handles()).toEqual(held)
    held[0]!.style = style
    refuseThird = true
    refuseCleanup = true
    expect(() => plane.api.setArrangement('3h')).toThrow('construction refused')
    expect(plane.api.arrangement()).toBe('s')
    expect(plane.handles()).toEqual(held)
    expect(destroyed).toEqual(['chart-2'])
  })

  it('disposes a constructed chart when subscribing its layout lanes fails', () => {
    let seq = 0
    let unsubscribed = 0
    const destroyed: string[] = []
    const plane = createLayoutPlane({
      container: el() as unknown as HTMLElement,
      adapter: null,
      i18n: createChartI18n(),
      arrangement: 's',
      createChart: (_element, init, index) => {
        const handle = fakeChart(`chart-${++seq}`, init?.symbol ?? 'ES')
        if (index === 1) {
          handle.sync.onCrosshair = () => () => {
            unsubscribed++
            throw new Error('unsubscribe refused')
          }
          handle.sync.onTimeClick = () => { throw new Error('subscription refused') }
        }
        return handle
      },
      destroyChart: (handle) => destroyed.push(handle.id),
      onActive: () => undefined,
      onChange: () => undefined,
    })
    const held = plane.handles()[0]
    expect(() => plane.api.setArrangement('2h')).toThrow('subscription refused')
    expect(plane.api.arrangement()).toBe('s')
    expect(plane.handles()).toEqual([held])
    expect(unsubscribed).toBe(1)
    expect(destroyed).toEqual(['chart-2'])
  })

  it('finishes a shrink when a retired child cleanup throws', () => {
    let seq = 0
    const destroyed: string[] = []
    const changes: string[] = []
    const committed: string[] = []
    const plane = createLayoutPlane({
      container: el() as unknown as HTMLElement, adapter: null, i18n: createChartI18n(), arrangement: '3h',
      createChart: () => fakeChart(`chart-${++seq}`, 'ES'),
      destroyChart: (handle) => { destroyed.push(handle.id); if (handle.id === 'chart-3') throw new Error('cleanup refused') },
      onActive: () => undefined, onChange: () => changes.push('changed'),
      onCommitted: (state) => committed.push(state.arrangement),
    })
    expect(() => plane.api.setArrangement('s')).toThrow('cleanup refused')
    expect(plane.api.arrangement()).toBe('s')
    expect(plane.handles().map((handle) => handle.id)).toEqual(['chart-1'])
    expect(destroyed.slice(0, 2)).toEqual(['chart-3', 'chart-2'])
    expect(made.filter((element) => element.className === 'qc-layout-divider' && !element.removed)).toHaveLength(0)
    expect(changes).toEqual(['changed'])
    expect(committed).toEqual(['s'])
    plane.destroy()
  })

  it('opens pointed at the first chart without an event — state, not a change', () => {
    const { plane, active } = mount(['AAPL', 'MSFT'], '2h')
    expect(plane.activeHandle()!.symbol()).toBe('AAPL')
    expect(active).toEqual([])
  })

  it('moves to an activated chart and leaves every chart’s symbol alone', () => {
    const { plane, active, symbolsNow } = mount(['AAPL', 'MSFT'], '2h')
    plane.api.setActive(1)
    expect(plane.activeHandle()!.symbol()).toBe('MSFT')
    expect(active).toEqual(['MSFT'])
    // The half that a single shared "current symbol" could never express.
    expect(symbolsNow()).toEqual(['AAPL', 'MSFT'])
  })

  it('activates from the chart’s own pointerdown, not only the api', () => {
    const { plane, active } = mount(['AAPL', 'MSFT'], '2h')
    // Only the layout builds elements, one per chart, in order.
    made[1]!.down?.()
    expect(plane.api.active()).toBe(1)
    expect(active).toEqual(['MSFT'])
  })

  it('follows the active chart changing symbol, and ignores an inactive one changing', () => {
    const { plane, active } = mount(['AAPL', 'MSFT'], '2h')
    plane.handles()[1]!.setSymbol('NVDA')
    expect(plane.activeHandle()!.symbol()).toBe('AAPL')
    expect(active).toEqual([])
    plane.handles()[0]!.setSymbol('TSLA')
    expect(plane.activeHandle()!.symbol()).toBe('TSLA')
    expect(active).toEqual(['TSLA'])
  })

  it('reports a value, never a gesture — re-activating the same chart and market says nothing', () => {
    const { plane, active } = mount(['AAPL', 'MSFT'], '2h')
    plane.api.setActive(1)
    plane.api.setActive(0)
    plane.api.setActive(1)
    expect(active).toEqual(['MSFT', 'AAPL', 'MSFT'])
    // Symbol sync puts the SAME market on every chart. Activating across them still reports,
    // because the chart a host is pointed at is a different fact from the market it holds, but no
    // chart's own symbol moves.
    const b = mount(['AAPL', 'MSFT'], '2h', { symbol: true })
    b.plane.handles()[0]!.setSymbol('GOOG')
    b.plane.api.setActive(1)
    expect(b.symbolsNow()).toEqual(['GOOG', 'GOOG'])
    expect(b.active).toEqual(['GOOG', 'GOOG'])
  })

  it('reports the market a re-tile lands on when the active chart is destroyed', () => {
    const { plane, active } = mount(['AAPL', 'MSFT'], '2h')
    plane.api.setActive(1)
    active.length = 0
    plane.api.setArrangement('s')
    expect(plane.api.active()).toBe(0)
    expect(plane.activeHandle()!.symbol()).toBe('AAPL')
    expect(active).toEqual(['AAPL'])
  })

  it('reports the restored market once, not the charts sweeping past it', () => {
    const saved = (() => {
      const a = mount(['AAPL', 'MSFT'], '2h')
      a.plane.api.setActive(1)
      return a.plane.api.serialize().content
    })()
    const { plane, active } = mount(['TSLA', 'TSLA'], '2h')
    plane.api.restore(saved)
    expect(plane.api.active()).toBe(1)
    expect(plane.activeHandle()!.symbol()).toBe('MSFT')
    expect(active).toEqual(['MSFT'])
  })
})

describe('a layout is its own saved resource', () => {
  // The layout saves through the adapter's LAYOUTS family, never through charts: a layout is an
  // arrangement of charts and conflicts separately from the charts inside it.
  const layoutOver = (adapter: ReturnType<typeof memorySaveLoadAdapter> | null, arrangement: string, symbols: string[]) => {
    let seq = 0
    return createLayoutPlane({
      container: el() as unknown as HTMLElement,
      adapter,
      i18n: createChartI18n(),
      arrangement,
      charts: symbols.map((symbol) => ({ symbol })),
      createChart: (_element, init) => fakeChart(`chart-${++seq}`, init?.symbol ?? 'SEED'),
      destroyChart: () => undefined,
      onActive: () => undefined,
      onChange: () => undefined,
    })
  }

  it('saves under layouts at the held revision, loads back, and reports a conflict rather than overwriting', async () => {
    const adapter = memorySaveLoadAdapter()
    const plane = layoutOver(adapter, '2h', ['ES', 'NQ'])
    const saved = await plane.api.saveLoad.save('Pair')
    expect(saved.kind).toBe('ok')
    expect((await adapter.layouts.list()).map((r) => r.name)).toEqual(['Pair'])
    // The listing names what the layout shows: the active chart's market and interval.
    expect((await adapter.layouts.list()).map(({ symbol, timeframe }) => ({ symbol, timeframe }))).toEqual([{ symbol: 'ES', timeframe: '1D' }])
    expect(await adapter.charts.list()).toEqual([])
    const held = plane.api.saveLoad.current()!
    // Another tab saves the same layout first.
    const elsewhere = await adapter.layouts.update(held.ref, { name: 'Pair', content: '{}' })
    expect(elsewhere.kind).toBe('ok')
    const refused = await plane.api.saveLoad.save('Pair')
    expect(refused.kind).toBe('conflict')
    if (refused.kind === 'conflict') expect(refused.message.length).toBeGreaterThan(0)
    expect((await adapter.layouts.load(held.ref.id))!.body.content).toBe('{}')

    plane.api.saveLoad.detach()
    expect(plane.api.saveLoad.current()).toBeNull()
    const fresh = await plane.api.saveLoad.save('Pair copy')
    if (fresh.kind !== 'ok') throw new Error('unreachable')
    const other = layoutOver(adapter, 's', ['GC'])
    const loaded = await other.api.saveLoad.load(fresh.ref.id)
    expect(loaded.kind).toBe('ok')
    expect(other.handles().map((h) => h.symbol())).toEqual(['ES', 'NQ'])
    expect(other.api.saveLoad.current()?.name).toBe('Pair copy')
  })

  it('rejects a save with no adapter', async () => {
    const plane = layoutOver(null, 's', ['ES'])
    await expect(plane.api.saveLoad.save('x')).rejects.toThrow(/no save\/load adapter/)
  })
})
