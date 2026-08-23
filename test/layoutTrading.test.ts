// The layout's TRADING context. A host rendering one order ticket beside a multi-chart layout asks
// the layout what market an order would hit, and the answer is the ACTIVE pane's symbol — measured on
// the reference, where activating a chart moves the ticket to its market and moves no chart at all.
// The whole point is that those two are different things, so what is pinned here is that the traded
// market tracks activation exactly, that it never re-points a chart, and that it is reported for
// every way it can move: a chart being activated, the active chart changing symbol, a re-tile that
// drops the active pane, a restore. A market that moves in silence strands a ticket on the last one.
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

/** A layout of `symbols.length` panes, plus the traded markets it reported along the way. */
const mount = (symbols: string[], arrangement: string, sync?: { symbol?: boolean }) => {
  const traded: string[] = []
  const api = createChartLayout({
    container: el() as unknown as HTMLElement,
    base: {} as never,
    arrangement,
    panes: symbols.map((symbol) => ({ symbol })),
    ...(sync ? { sync } : {}),
    events: { onTradingSymbol: (s) => traded.push(s) },
  })
  return { api, traded, symbolsNow: () => api.panes().map((p) => p.symbol()) }
}

describe('the layout trades its active pane', () => {
  it('reports the active pane’s market on mount without an event — state, not a change', () => {
    const { api, traded } = mount(['AAPL', 'MSFT'], '2h')
    expect(api.tradingSymbol()).toBe('AAPL')
    expect(traded).toEqual([])
  })

  it('moves the traded market to an activated chart and leaves every chart’s symbol alone', () => {
    const { api, traded, symbolsNow } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    expect(api.tradingSymbol()).toBe('MSFT')
    expect(traded).toEqual(['MSFT'])
    // The half that a single shared "current symbol" could never express.
    expect(symbolsNow()).toEqual(['AAPL', 'MSFT'])
  })

  it('activates from the pane’s own pointerdown, not only the api', () => {
    const { api, traded } = mount(['AAPL', 'MSFT'], '2h')
    // Only the layout builds elements, one per pane, in order.
    made[1]!.down?.()
    expect(api.activePane()).toBe(1)
    expect(traded).toEqual(['MSFT'])
  })

  it('follows the active chart changing symbol, and ignores an inactive one changing', () => {
    const { api, traded } = mount(['AAPL', 'MSFT'], '2h')
    api.panes()[1]!.setSymbol('NVDA')
    expect(api.tradingSymbol()).toBe('AAPL')
    expect(traded).toEqual([])
    api.panes()[0]!.setSymbol('TSLA')
    expect(api.tradingSymbol()).toBe('TSLA')
    expect(traded).toEqual(['TSLA'])
  })

  it('reports a value, never a gesture — re-activating the same market says nothing', () => {
    const { api, traded } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    api.setActivePane(0)
    api.setActivePane(1)
    expect(traded).toEqual(['MSFT', 'AAPL', 'MSFT'])
    // Symbol sync puts the SAME market on every pane, so activating across them moves nothing.
    const b = mount(['AAPL', 'MSFT'], '2h', { symbol: true })
    b.api.panes()[0]!.setSymbol('GOOG')
    b.api.setActivePane(1)
    expect(b.traded).toEqual(['GOOG'])
    expect(b.symbolsNow()).toEqual(['GOOG', 'GOOG'])
  })

  it('reports the market a re-tile lands on when the active pane is destroyed', () => {
    const { api, traded } = mount(['AAPL', 'MSFT'], '2h')
    api.setActivePane(1)
    traded.length = 0
    api.setArrangement('s')
    expect(api.activePane()).toBe(0)
    expect(api.tradingSymbol()).toBe('AAPL')
    expect(traded).toEqual(['AAPL'])
  })

  it('reports the restored market once, not the panes sweeping past it', () => {
    const saved = (() => {
      const a = mount(['AAPL', 'MSFT'], '2h')
      a.api.setActivePane(1)
      return a.api.serialize().content
    })()
    const { api, traded } = mount(['TSLA', 'TSLA'], '2h')
    api.restore(saved)
    expect(api.activePane()).toBe(1)
    expect(api.tradingSymbol()).toBe('MSFT')
    expect(traded).toEqual(['MSFT'])
  })
})
