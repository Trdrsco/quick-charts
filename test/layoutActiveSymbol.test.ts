// The layout's ACTIVE SYMBOL. A host with one surface that follows a multi-chart layout asks the
// layout which market it is pointed at, and the answer is the ACTIVE pane's symbol — measured on
// the reference, where activating a chart re-points such a surface at its market and moves no
// chart at all. The whole point is that those two are different things, so what is pinned here is
// that the active symbol tracks activation exactly, that it never re-points a chart, and that it is
// reported for every way it can move: a chart being activated, the active chart changing symbol, a
// re-tile that drops the active pane, a restore. A market that moves in silence strands the host
// on the last one.
//
// The panes are fakes and the DOM is a stub, so the code under test is the real layout: its own
// activation, fan-out, re-tile and restore paths decide every value asserted below.
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeOpts {
  symbol?: string
  timeframe?: string
  events?: { onSymbolChange?: (s: string) => void; onTimeframeChange?: (t: string) => void }
}

const H = vi.hoisted(() => {
  const createChart = (o: FakeOpts) => {
    let sym = o.symbol ?? 'SEED'
    let tf = o.timeframe ?? '1D'
    const off = () => () => {}
    return {
      symbol: () => sym,
      setSymbol: (s: string) => {
        if (s === sym) return
        sym = s
        o.events?.onSymbolChange?.(s)
      },
      timeframe: () => tf,
      setTimeframe: (t: string) => {
        if (t === tf) return
        tf = t
        o.events?.onTimeframeChange?.(t)
      },
      sync: { onCrosshair: off, onTimeClick: off, onVisibleRange: off, centerOn: () => {} },
      saveLoad: {
        serialize: () => ({ symbol: sym, timeframe: tf, content: JSON.stringify({ sym }) }),
        restore: (c: string) => {
          const p = JSON.parse(c) as { sym?: string }
          if (typeof p.sym === 'string') {
            sym = p.sym
            o.events?.onSymbolChange?.(p.sym)
          }
        },
      },
      remove: () => {},
    }
  }
  return { createChart }
})
vi.mock('../src/host', () => ({ createChart: H.createChart }))

const { createChartLayout } = await import('../src/layout')

interface FakeEl {
  style: Record<string, string>
  down: (() => void) | null
  appendChild(c: FakeEl): void
  addEventListener(t: string, h: () => void): void
  removeEventListener(t: string, h: () => void): void
  remove(): void
}

const el = (): FakeEl => {
  const e: FakeEl = {
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
  const g = globalThis as unknown as {
    document: { createElement(): FakeEl }
    getComputedStyle(): { position: string }
  }
  g.document = {
    createElement: () => {
      const e = el()
      made.push(e)
      return e
    },
  }
  g.getComputedStyle = () => ({ position: 'relative' })
})

/** A layout of `symbols.length` panes, plus the active symbols it reported along the way. */
const mount = (symbols: string[], arrangement: string, sync?: { symbol?: boolean }) => {
  const active: string[] = []
  const api = createChartLayout({
    container: el() as unknown as HTMLElement,
    base: {} as never,
    arrangement,
    panes: symbols.map((symbol) => ({ symbol })),
    ...(sync ? { sync } : {}),
    events: { onActiveSymbol: (s) => active.push(s) },
  })
  return { api, active, symbolsNow: () => api.panes().map((p) => p.symbol()) }
}

describe('the layout is pointed at its active pane', () => {
  it('reports the active pane’s symbol on mount without an event — state, not a change', () => {
    const { api, active } = mount(['AAPL', 'MSFT'], '2h')
    expect(api.activeSymbol()).toBe('AAPL')
    expect(active).toEqual([])
  })

  it('moves the active symbol to an activated chart and leaves every chart’s symbol alone', () => {
    const { api, active, symbolsNow } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    expect(api.activeSymbol()).toBe('MSFT')
    expect(active).toEqual(['MSFT'])
    // The half that a single shared "current symbol" could never express.
    expect(symbolsNow()).toEqual(['AAPL', 'MSFT'])
  })

  it('activates from the pane’s own pointerdown, not only the api', () => {
    const { api, active } = mount(['AAPL', 'MSFT'], '2h')
    // Only the layout builds elements, one per pane, in order.
    made[1]!.down?.()
    expect(api.activePane()).toBe(1)
    expect(active).toEqual(['MSFT'])
  })

  it('follows the active chart changing symbol, and ignores an inactive one changing', () => {
    const { api, active } = mount(['AAPL', 'MSFT'], '2h')
    api.panes()[1]!.setSymbol('NVDA')
    expect(api.activeSymbol()).toBe('AAPL')
    expect(active).toEqual([])
    api.panes()[0]!.setSymbol('TSLA')
    expect(api.activeSymbol()).toBe('TSLA')
    expect(active).toEqual(['TSLA'])
  })

  it('reports a value, never a gesture — re-activating the same market says nothing', () => {
    const { api, active } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    api.setActivePane(0)
    api.setActivePane(1)
    expect(active).toEqual(['MSFT', 'AAPL', 'MSFT'])
    // Symbol sync puts the SAME market on every pane, so activating across them moves nothing.
    const b = mount(['AAPL', 'MSFT'], '2h', { symbol: true })
    b.api.panes()[0]!.setSymbol('GOOG')
    b.api.setActivePane(1)
    expect(b.active).toEqual(['GOOG'])
    expect(b.symbolsNow()).toEqual(['GOOG', 'GOOG'])
  })

  it('reports the symbol a re-tile lands on when the active pane is destroyed', () => {
    const { api, active } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    active.length = 0
    api.setArrangement('s')
    expect(api.activePane()).toBe(0)
    expect(api.activeSymbol()).toBe('AAPL')
    expect(active).toEqual(['AAPL'])
  })

  it('reports the restored symbol once, not the panes sweeping past it', () => {
    const saved = (() => {
      const a = mount(['AAPL', 'MSFT'], '2h')
      a.api.setActivePane(1)
      return a.api.serialize().content
    })()
    const { api, active } = mount(['TSLA', 'TSLA'], '2h')
    api.restore(saved)
    expect(api.activePane()).toBe(1)
    expect(api.activeSymbol()).toBe('MSFT')
    expect(active).toEqual(['MSFT'])
  })

  it('switches one shared host localization adapter once for the whole layout', async () => {
    let locale = 'source'
    const setLocale = vi.fn(async (next: string) => {
      locale = next
    })
    const api = createChartLayout({
      container: el() as unknown as HTMLElement,
      base: {
        i18n: {
          locale: () => locale,
          tag: () => (locale === 'source' ? 'en-US' : 'fr-CA'),
          t: (() => '') as never,
          setLocale,
          onChange: () => () => {},
        },
      } as never,
      arrangement: '2h',
      panes: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }],
    })

    await api.setLocale('canada')
    expect(setLocale).toHaveBeenCalledTimes(1)
    expect(setLocale).toHaveBeenCalledWith('canada')
  })
})
