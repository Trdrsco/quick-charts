// The layout's ACTIVE CHART. A host with one surface that follows a multi-chart layout asks the
// layout which chart it is pointed at, and through it which market. Measured on the reference,
// where activating a chart re-points such a surface and moves no chart at all. The whole point is
// that those two are different things, so what is pinned here is that the active chart tracks
// activation exactly, that it never re-points a chart, and that it is reported for every way it can
// move: a chart being activated, the active chart changing symbol, a re-tile that drops the active
// chart, a restore. A market that moves in silence strands the host on the last one.
//
// The charts are fakes and the DOM is a stub, so the code under test is the real layout plane: its
// own activation, fan-out, re-tile and restore paths decide every value asserted below.
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutPlane } from '../../src/widget/layout'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChartI18n } from '../../src/i18n'
import type { ChartHandle } from '../../src/widget/chart'

interface FakeEl {
  className: string
  dataset: Record<string, string>
  style: Record<string, string>
  down: (() => void) | null
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
    appendChild: () => {},
    addEventListener: (t, h) => {
      if (t === 'pointerdown') e.down = h
    },
    removeEventListener: () => {
      e.down = null
    },
    remove: () => {},
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
    setSymbol(next: string) {
      if (next === symbol) return
      symbol = next
      for (const cb of [...symbolSubs]) cb(next)
    },
    timeframe: () => timeframe,
    setTimeframe(next: string) {
      timeframe = next
    },
    visibleRange: () => null,
    setVisibleRange: () => undefined,
    sync: { onCrosshair: off, onTimeClick: off, onVisibleRange: off },
    saveLoad: {
      serialize: () => ({ symbol, timeframe, content: JSON.stringify({ symbol }) }),
      restore(content: string) {
        const parsed = JSON.parse(content) as { symbol?: string }
        if (typeof parsed.symbol === 'string') handle.setSymbol(parsed.symbol)
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
