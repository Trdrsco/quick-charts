// The COMPARE organ. What is pinned here is the contract this package promises: three placements
// with the dialog's own semantics, bars clipped to the main window (extending the time scale is out
// of scope, so a compare must never stretch the axis), palette assignment that frees colors on
// removal, snapshot round-trips that drop junk, and a live path that can only touch the newest bar.
// The chart and the datafeed are fakes; the code under test is the real organ.
import { describe, expect, it, vi } from 'vitest'
import { attachCompare, clipToWindow, COMPARE_COLORS, pickCompareColor, seriesTargetOf } from '../src/compare'
import type { BarsEvent, ChartDatafeed, FeedBar, SubscribeHandlers } from '../src/datafeed'
import type { IChartApi } from 'lightweight-charts'

const bar = (t: number, c = t): FeedBar => ({ t, o: c, h: c, l: c, c, v: 1 })

describe('the pure rules', () => {
  it('assigns the first unused palette color, and a removal frees its slot', () => {
    expect(pickCompareColor([])).toBe(COMPARE_COLORS[0])
    expect(pickCompareColor([COMPARE_COLORS[0]!])).toBe(COMPARE_COLORS[1])
    // The first slot came free again — it wins over extending to a third.
    expect(pickCompareColor([COMPARE_COLORS[1]!])).toBe(COMPARE_COLORS[0])
  })

  it('wraps past an exhausted palette by reuse, never an invented hue', () => {
    expect(pickCompareColor([...COMPARE_COLORS])).toBe(COMPARE_COLORS[0])
  })

  it('clips inclusively to the main window, and renders nothing before the main paints', () => {
    const bars = [bar(10), bar(20), bar(30), bar(40)]
    expect(clipToWindow(bars, { from: 20, to: 30 }).map((b) => b.t)).toEqual([20, 30])
    // A compare must never be the thing that gives the axis its range.
    expect(clipToWindow(bars, null)).toEqual([])
  })

  it('maps each placement to the scale it binds', () => {
    expect(seriesTargetOf('same-percent', 3)).toEqual({ paneIndex: 0 })
    expect(seriesTargetOf('new-scale', 3)).toEqual({ paneIndex: 0, priceScaleId: 'left' })
    expect(seriesTargetOf('new-pane', 3)).toEqual({ paneIndex: 3 })
  })
})

// ── the behavioral half: a fake chart + a scripted datafeed ─────────────────────────────────────

interface FakeSeries {
  data: unknown[]
  options: Record<string, unknown>
  setData(d: unknown[]): void
  applyOptions(o: Record<string, unknown>): void
  getPane(): { paneIndex(): number }
}

function fakeChart() {
  const series: { s: FakeSeries; paneIndex: number }[] = []
  const chartOptions: Record<string, unknown>[] = []
  const chart = {
    addSeries: (_type: unknown, opts: Record<string, unknown>, paneIndex: number) => {
      const s: FakeSeries = {
        data: [],
        options: { ...opts },
        setData(d: unknown[]) {
          this.data = d
        },
        applyOptions(o: Record<string, unknown>) {
          Object.assign(this.options, o)
        },
        getPane: () => ({ paneIndex: () => paneIndex }),
      }
      series.push({ s, paneIndex })
      return s
    },
    removeSeries: (s: FakeSeries) => {
      const i = series.findIndex((e) => e.s === s)
      if (i >= 0) series.splice(i, 1)
    },
    applyOptions: (o: Record<string, unknown>) => void chartOptions.push(o),
    panes: () => [{}, {}], // pane 0 (price) + pane 1 (an existing study pane)
  }
  return { chart: chart as unknown as IChartApi, series, chartOptions }
}

function fakeFeed(history: Record<string, FeedBar[]>) {
  const calls: { symbol: string; tf: string; range?: { from?: number; to?: number; countBack?: number } }[] = []
  const subs = new Map<string, SubscribeHandlers>()
  const unsubs: string[] = []
  const feed = {
    history: (symbol: string, tf: string, range?: { from?: number; to?: number; countBack?: number }) => {
      calls.push({ symbol, tf, range })
      const bars = history[symbol] ?? []
      const inRange =
        range?.from != null && range?.to != null ? bars.filter((b) => b.t >= range.from! && b.t <= range.to!) : bars
      return Promise.resolve({ bars: inRange, noMore: false })
    },
    subscribeBars: (symbol: string, _tf: string, handlers: SubscribeHandlers) => {
      subs.set(symbol, handlers)
      return () => {
        subs.delete(symbol)
        unsubs.push(symbol)
      }
    },
  }
  return { feed: feed as unknown as ChartDatafeed, calls, subs, unsubs }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

function harness(history: Record<string, FeedBar[]>, window: { from: number; to: number } | null = { from: 10, to: 40 }) {
  const { chart, series, chartOptions } = fakeChart()
  const { feed, calls, subs, unsubs } = fakeFeed(history)
  const win = { current: window }
  const onChange = vi.fn()
  const handle = attachCompare(chart, { datafeed: feed, tf: () => '1m', mainWindow: () => win.current, onChange })
  return { handle, series, chartOptions, calls, subs, unsubs, win, onChange }
}

describe('adding a compare', () => {
  it('creates the series at the placement target, fetches the main window, clips into it', async () => {
    const h = harness({ NQ: [bar(5), bar(10), bar(20), bar(50)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    expect(h.series).toHaveLength(1)
    expect(h.series[0]!.paneIndex).toBe(0)
    expect(h.series[0]!.s.options.priceScaleId).toBeUndefined()
    // 5 and 50 fall outside the main window [10,40] and must not stretch the axis.
    expect((h.series[0]!.s.data as { time: number }[]).map((d) => d.time)).toEqual([10, 20])
    expect(h.handle.latest('NQ')).toBe(20)
  })

  it('the second add of the same symbol at the same placement is a no-op', async () => {
    const h = harness({ NQ: [bar(20)] })
    h.handle.add('NQ', { placement: 'new-pane' })
    await flush()
    h.handle.add('NQ', { placement: 'new-pane' })
    await flush()
    expect(h.series).toHaveLength(1)
    expect(h.handle.list()).toHaveLength(1)
  })

  it('re-placing an existing compare moves the series and keeps its bars — no refetch', async () => {
    const h = harness({ NQ: [bar(20), bar(30)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    const fetches = h.calls.length
    h.handle.add('NQ', { placement: 'new-scale' })
    expect(h.series).toHaveLength(1)
    expect(h.series[0]!.s.options.priceScaleId).toBe('left')
    expect((h.series[0]!.s.data as unknown[]).length).toBe(2)
    expect(h.calls.length).toBe(fetches)
  })

  it('reports percent change over the clipped window, the same-percent legend value', async () => {
    const h = harness({ NQ: [bar(10, 100), bar(20, 105), bar(50, 999)] }) // 50 is outside [10,40]
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    expect(h.handle.changePct('NQ')).toBeCloseTo(5)
    expect(h.handle.changePct('GC')).toBeNull()
  })

  it('reports each compare’s live pane index, and null for an unknown symbol', async () => {
    const h = harness({ NQ: [bar(20)], ES: [bar(20)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    h.handle.add('ES', { placement: 'new-pane' })
    expect(h.handle.paneIndexOf('NQ')).toBe(0)
    expect(h.handle.paneIndexOf('ES')).toBe(2) // added past the fake's two existing panes
    expect(h.handle.paneIndexOf('GC')).toBeNull()
  })

  it('colors assign from the palette and free on removal', async () => {
    const h = harness({ A: [bar(20)], B: [bar(20)], C: [bar(20)] })
    h.handle.add('A', { placement: 'new-pane' })
    h.handle.add('B', { placement: 'new-pane' })
    expect(h.handle.list().map((e) => e.color)).toEqual([COMPARE_COLORS[0], COMPARE_COLORS[1]])
    h.handle.remove('A')
    h.handle.add('C', { placement: 'new-pane' })
    expect(h.handle.list().find((e) => e.symbol === 'C')!.color).toBe(COMPARE_COLORS[0])
  })
})

describe('the left scale belongs to new-scale compares alone', () => {
  it('shows while one lives and hides when the last leaves', async () => {
    const h = harness({ NQ: [bar(20)] })
    h.handle.add('NQ', { placement: 'new-scale' })
    const shown = h.chartOptions.filter((o) => (o.leftPriceScale as { visible?: boolean })?.visible === true)
    expect(shown.length).toBeGreaterThan(0)
    h.handle.remove('NQ')
    const last = h.chartOptions[h.chartOptions.length - 1] as { leftPriceScale?: { visible?: boolean } }
    expect(last.leftPriceScale?.visible).toBe(false)
  })
})

describe('the live path', () => {
  it('appends a newer bar, replaces the open bar whole, and never rewrites history', async () => {
    const h = harness({ NQ: [bar(20), bar(30)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    const push = (e: BarsEvent) => h.subs.get('NQ')!.onBars(e)
    push({ kind: 'bar', bar: bar(40, 99) }) // append
    expect(h.handle.latest('NQ')).toBe(99)
    push({ kind: 'bar', bar: bar(40, 101) }) // whole-bar replace of the open bar
    expect(h.handle.latest('NQ')).toBe(101)
    push({ kind: 'bar', bar: bar(30, 7) }) // an older time must not rewrite history
    expect(h.handle.latest('NQ')).toBe(101)
  })

  it('a snapshot replaces the recent window and keeps older paged-in bars', async () => {
    const h = harness({ NQ: [bar(10), bar(20), bar(30)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    h.subs.get('NQ')!.onBars({ kind: 'snapshot', bars: [bar(20, 2), bar(30, 3), bar(40, 4)] })
    expect((h.series[0]!.s.data as { time: number; value: number }[]).map((d) => [d.time, d.value])).toEqual([
      [10, 10],
      [20, 2],
      [30, 3],
      [40, 4],
    ])
  })
})

describe('sync follows the main window', () => {
  it('re-clips on growth and pages older history in exactly once', async () => {
    const h = harness({ NQ: [bar(20), bar(30)] }, { from: 20, to: 30 })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    expect((h.series[0]!.s.data as unknown[]).length).toBe(2)
    // The main paged back: the window now starts earlier than anything fetched.
    h.win.current = { from: 5, to: 30 }
    ;(h as { calls: { range?: unknown }[] }).calls.length = 0
    h.handle.sync()
    await flush()
    expect(h.calls).toHaveLength(1)
    expect(h.calls[0]!.range).toMatchObject({ from: 5 })
  })
})

describe('timeframe re-key', () => {
  it('blanks and refetches every compare', async () => {
    const h = harness({ NQ: [bar(20)], ES: [bar(30)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    h.handle.add('ES', { placement: 'new-pane' })
    await flush()
    h.calls.length = 0
    h.handle.setTimeframe()
    await flush()
    expect(h.calls.map((c) => c.symbol).sort()).toEqual(['ES', 'NQ'])
  })
})

describe('suppress', () => {
  it('hides the series without touching the eye, and the snapshot never carries it', async () => {
    const h = harness({ NQ: [bar(20)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    h.handle.suppress('NQ', true)
    expect(h.series[0]!.s.options.visible).toBe(false)
    expect(h.handle.list()[0]!.visible).toBe(true) // the eye is untouched
    expect(h.handle.serialize()[0]!.visible).toBe(true)
    h.handle.suppress('NQ', false)
    expect(h.series[0]!.s.options.visible).toBe(true)
  })
})

describe('restyle', () => {
  it('applies color/width/style to the live series and round-trips through the snapshot', async () => {
    const h = harness({ NQ: [bar(20)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    await flush()
    h.handle.restyle('NQ', { color: '#123456', lineWidth: 3, lineStyle: 'dashed' })
    expect(h.series[0]!.s.options.color).toBe('#123456')
    expect(h.series[0]!.s.options.lineWidth).toBe(3)
    const snap = h.handle.serialize()
    const h2 = harness({ NQ: [bar(20)] })
    h2.handle.restore(snap)
    await flush()
    const e = h2.handle.list()[0]!
    expect([e.color, e.lineWidth, e.lineStyle]).toEqual(['#123456', 3, 'dashed'])
    h.handle.restyle('GC', { color: '#fff' }) // unknown symbol: a no-op, never a throw
  })
})

describe('snapshot round-trip', () => {
  it('serializes the whole entry and restores it, dropping junk', async () => {
    const h = harness({ NQ: [bar(20)], ES: [bar(30)] })
    h.handle.add('NQ', { placement: 'new-scale' })
    h.handle.add('ES', { placement: 'new-pane' })
    const snap = h.handle.serialize()
    expect(snap).toHaveLength(2)

    const h2 = harness({ NQ: [bar(20)], ES: [bar(30)] })
    h2.handle.restore([...snap, { symbol: 'BAD', placement: 'sideways' }, null, { placement: 'new-pane' }])
    await flush()
    expect(h2.handle.list().map((e) => e.symbol).sort()).toEqual(['ES', 'NQ'])
    expect(h2.handle.list().find((e) => e.symbol === 'NQ')!.placement).toBe('new-scale')
  })
})

describe('teardown', () => {
  it('destroy unsubscribes every stream and drops every series', async () => {
    const h = harness({ NQ: [bar(20)], ES: [bar(30)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    h.handle.add('ES', { placement: 'new-pane' })
    await flush()
    h.handle.destroy()
    expect(h.unsubs.sort()).toEqual(['ES', 'NQ'])
    expect(h.series).toHaveLength(0)
  })

  it('a stale fetch that lands after removal must not resurrect the compare', async () => {
    const h = harness({ NQ: [bar(20)] })
    h.handle.add('NQ', { placement: 'same-percent' })
    h.handle.remove('NQ') // before the fetch resolves
    await flush()
    expect(h.handle.list()).toHaveLength(0)
    expect(h.series).toHaveLength(0)
  })
})
