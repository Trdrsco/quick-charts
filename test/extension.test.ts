// The extension seam's contract. What is pinned here is the part a host cannot see and cannot fix:
// that attaching and detaching is symmetrical (no listener, no drawing, no chart lock survives a
// detach), that a torn-down context is inert rather than explosive, that one extension can neither
// read nor corrupt another's state, and that a failing extension is the extension's problem and
// never the chart's.
//
// The host is exercised directly against fake capabilities — the seam is where the design lives, and
// a DOM would only add lightweight-charts to the failure surface. The widget's own wiring (which
// change calls which lane, where extension state sits in the save blob, when the plane comes down)
// is pinned against host.ts's source below, the way this package pins its other invisible rules.
import { describe, expect, it, vi } from 'vitest'
import { createExtensionHost, type ChartExtension, type ChartExtensionContext, type ChartExtensionHostDeps, type ChartExtensionSeries } from '../src/extension'
import type { FeedBar } from '../src/datafeed'
import type { ResolvedTheme } from '../src/host'
import hostSrc from '../src/host.ts?raw'
import extensionSrc from '../src/extension.ts?raw'

// The layout section below drives the REAL `createChartLayout` over stand-in panes, each running a
// real extension host. What is under test there is the pane lifecycle reaching the seam, so the
// widget is the only thing faked.
const H = vi.hoisted(() => ({ makeChart: null as null | ((options: unknown) => unknown) }))
vi.mock('../src/host', () => ({ createChart: (options: unknown) => H.makeChart!(options) }))

const THEME: ResolvedTheme = {
  background: '#101010',
  gridColor: '#202020',
  textColor: '#f0f0f0',
  upColor: '#0f0',
  downColor: '#f00',
  fontSize: 13,
}

const bar = (t: number): FeedBar => ({ t, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 })

/** The chart side of the seam, as a spy: every capability records what it was asked for, so a
 *  leak (a line never removed, a lock never released) is an assertion rather than an inspection. */
function fakeChart() {
  const state = {
    symbol: 'ESU6',
    timeframe: '5m',
    bars: [bar(100), bar(160)] as readonly FeedBar[],
    replay: { active: false, cursor: 2, total: 2 },
    feedStatus: 'live' as string | null,
    theme: THEME,
    pane: { id: 'chart-1', width: 800, height: 400 },
    /** Price lines currently ON the series. */
    lines: new Set<string>(),
    primitives: new Set<unknown>(),
    locked: false,
    lockCalls: [] as boolean[],
  }
  let lineSeq = 0
  const series: ChartExtensionSeries = {
    createPriceLine(options) {
      const id = `line-${++lineSeq}:${options.price}`
      state.lines.add(id)
      return {
        update: () => {},
        remove: () => state.lines.delete(id),
      }
    },
    attachPrimitive(primitive) {
      state.primitives.add(primitive)
      return () => state.primitives.delete(primitive)
    },
    priceToY: (price) => price * 2,
    yToPrice: (y) => y / 2,
    timeToX: (time) => time - 100,
    xToTime: (x) => x + 100,
    plotWidth: () => 720,
    lockPanZoom: (locked) => {
      state.locked = locked
      state.lockCalls.push(locked)
    },
  }
  const deps: ChartExtensionHostDeps = {
    chartId: 'chart-1',
    container: { tag: 'gesture-box' } as unknown as HTMLElement,
    overlay: { tag: 'chrome-box' } as unknown as HTMLElement,
    symbol: () => state.symbol,
    timeframe: () => state.timeframe,
    bars: () => state.bars,
    replay: () => state.replay,
    feedStatus: () => state.feedStatus,
    theme: () => state.theme,
    formatter: () => ({ format: (price) => price.toFixed(2), precision: () => 2 }),
    pane: () => state.pane,
    series,
  }
  return { state, deps }
}

/** An extension that subscribes to every lane and records what it heard. */
function recorder(id: string, scope?: 'chart' | 'symbol') {
  const heard = { attach: 0, detach: 0, symbols: [] as string[], timeframes: [] as string[], bars: 0, replay: [] as boolean[], themes: 0, panes: 0, disposed: 0 }
  let context: ChartExtensionContext | null = null
  const extension: ChartExtension = {
    id,
    ...(scope ? { scope } : {}),
    attach(ctx) {
      heard.attach += 1
      context = ctx
      ctx.onSymbolChange((s) => heard.symbols.push(s))
      ctx.onTimeframeChange((t) => heard.timeframes.push(t))
      ctx.onBars(() => (heard.bars += 1))
      ctx.onReplayChange((r) => heard.replay.push(r.active))
      ctx.onThemeChange(() => (heard.themes += 1))
      ctx.onPaneChange(() => (heard.panes += 1))
      ctx.onDispose(() => (heard.disposed += 1))
      return { detach: () => (heard.detach += 1) }
    },
  }
  return { extension, heard, context: () => context }
}

describe('attach and detach are symmetrical', () => {
  it('every subscription made at attach is gone after detach', () => {
    const { deps } = fakeChart()
    const a = recorder('a')
    const b = recorder('b')
    const host = createExtensionHost(deps, [a.extension, b.extension])
    // Seven lanes each: theme, symbol, timeframe, bars, replay, pane, dispose.
    expect(host.subscriberCount()).toBe(14)
    host.detach()
    expect(host.subscriberCount()).toBe(0)
    expect(a.heard.detach).toBe(1)
    expect(b.heard.detach).toBe(1)
  })

  it('an unsubscribe returned at attach removes exactly its own callback', () => {
    const { deps } = fakeChart()
    let off = (): void => {}
    const host = createExtensionHost(deps, [
      {
        id: 'one',
        attach(ctx) {
          off = ctx.onBars(() => {})
          ctx.onBars(() => {})
          return { detach: () => {} }
        },
      },
    ])
    expect(host.subscriberCount()).toBe(2)
    off()
    off() // idempotent
    expect(host.subscriberCount()).toBe(1)
  })

  it('dispose fires before the handle detaches, and only once', () => {
    const { deps } = fakeChart()
    const order: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'one',
        attach(ctx) {
          ctx.onDispose(() => order.push('dispose'))
          return { detach: () => order.push('detach') }
        },
      },
    ])
    host.detach()
    host.detach()
    expect(order).toEqual(['dispose', 'detach'])
  })

  it('takes back everything an extension drew and any chart lock it still holds', () => {
    const { state, deps } = fakeChart()
    const primitive = { updateAllViews: () => {} }
    const host = createExtensionHost(deps, [
      {
        id: 'messy',
        attach(ctx) {
          ctx.series.createPriceLine({ price: 5000 })
          ctx.series.createPriceLine({ price: 5010 })
          ctx.series.attachPrimitive(primitive as never)
          ctx.series.lockPanZoom(true)
          // The extension forgets all of it — the chart must not.
          return { detach: () => {} }
        },
      },
    ])
    expect(state.lines.size).toBe(2)
    expect(state.primitives.size).toBe(1)
    expect(state.locked).toBe(true)
    host.detach()
    expect(state.lines.size).toBe(0)
    expect(state.primitives.size).toBe(0)
    expect(state.locked).toBe(false)
  })

  it('a handle that removes its own line does not double-remove at detach', () => {
    const { state, deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'tidy',
        attach(ctx) {
          const line = ctx.series.createPriceLine({ price: 42 })
          return {
            detach: () => {
              line.remove()
              line.remove()
            },
          }
        },
      },
    ])
    host.detach()
    expect(state.lines.size).toBe(0)
  })
})

describe('the chart pushes its changes at every attached extension', () => {
  it('symbol, timeframe, bars, replay, theme and pane each reach their lane', () => {
    const { deps } = fakeChart()
    const r = recorder('one')
    const host = createExtensionHost(deps, [r.extension])
    host.symbolChanged('NQZ6')
    host.timeframeChanged('1h')
    host.barsChanged([bar(220)])
    host.replayChanged({ active: true, cursor: 4, total: 9 })
    host.replayChanged({ active: false, cursor: 9, total: 9 })
    host.themeChanged(THEME)
    host.paneChanged({ id: 'chart-1', width: 400, height: 300 })
    expect(r.heard.symbols).toEqual(['NQZ6'])
    expect(r.heard.timeframes).toEqual(['1h'])
    expect(r.heard.bars).toBe(1)
    expect(r.heard.replay).toEqual([true, false])
    expect(r.heard.themes).toBe(1)
    expect(r.heard.panes).toBe(1)
  })

  it('a chart-scoped extension is TOLD about a symbol switch, never rebuilt', () => {
    const { deps } = fakeChart()
    const r = recorder('one')
    createExtensionHost(deps, [r.extension]).symbolChanged('NQZ6')
    expect(r.heard.attach).toBe(1)
    expect(r.heard.detach).toBe(0)
    expect(r.heard.symbols).toEqual(['NQZ6'])
  })

  it('a symbol-scoped extension is re-attached, and sees the NEW symbol from its context', () => {
    const { state, deps } = fakeChart()
    const seen: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'per-symbol',
        scope: 'symbol',
        attach(ctx) {
          seen.push(ctx.chart.symbol())
          ctx.series.createPriceLine({ price: 1 })
          return { detach: () => {} }
        },
      },
    ])
    expect(seen).toEqual(['ESU6'])
    state.symbol = 'NQZ6'
    host.symbolChanged('NQZ6')
    expect(seen).toEqual(['ESU6', 'NQZ6'])
    // The re-attachment is a real one: the old market's drawing came down with the old attachment.
    expect(state.lines.size).toBe(1)
    host.detach()
    expect(state.lines.size).toBe(0)
  })

  it('a symbol switch re-attaches in place and tells only the chart-scoped extensions', () => {
    const { state, deps } = fakeChart()
    const told: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'per-symbol',
        scope: 'symbol',
        attach(ctx) {
          ctx.onSymbolChange((s) => told.push(`per-symbol:${s}`))
          ctx.contributeContextMenu(() => [{ id: 'first', label: 'First', run: () => {} }])
          return { detach: () => {} }
        },
      },
      {
        id: 'whole-chart',
        attach(ctx) {
          ctx.onSymbolChange((s) => told.push(`whole-chart:${s}`))
          ctx.contributeContextMenu(() => [{ id: 'second', label: 'Second', run: () => {} }])
          return { detach: () => {} }
        },
      },
    ])
    const rows = () => host.menuItems({ price: 1, priceText: '1', symbol: state.symbol, timeframe: '5m', clientX: 0, clientY: 0 }).map((r) => r.id)
    expect(rows()).toEqual(['first', 'second'])
    state.symbol = 'NQZ6'
    host.symbolChanged('NQZ6')
    // The re-attached extension already reads NQZ6 from its context; it is not also told.
    expect(told).toEqual(['whole-chart:NQZ6'])
    // And it keeps its slot, so its rows do not move below the others after every switch.
    expect(rows()).toEqual(['first', 'second'])
  })

  it('an attach that draws and locks and then throws leaves nothing on the chart', () => {
    const { state, deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'half-way',
        attach(ctx) {
          ctx.series.createPriceLine({ price: 3 })
          ctx.series.attachPrimitive({})
          ctx.series.lockPanZoom(true)
          ctx.onBars(() => {})
          throw new Error('nope')
        },
      },
    ])
    expect(state.lines.size).toBe(0)
    expect(state.primitives.size).toBe(0)
    expect(state.locked).toBe(false)
    expect(host.subscriberCount()).toBe(0)
    expect(host.serialize()).toEqual({})
  })

  it('one subscriber that throws does not stop the next one, or reach the chart', () => {
    const { deps } = fakeChart()
    const reached: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'angry',
        attach(ctx) {
          ctx.onBars(() => {
            throw new Error('boom')
          })
          return { detach: () => {} }
        },
      },
      {
        id: 'calm',
        attach(ctx) {
          ctx.onBars(() => reached.push('calm'))
          return { detach: () => {} }
        },
      },
    ])
    expect(() => host.barsChanged([bar(1)])).not.toThrow()
    expect(reached).toEqual(['calm'])
  })
})

describe('a failing extension is its own problem', () => {
  it('an extension that throws in attach is dropped, and the rest of the chart attaches', () => {
    const { deps } = fakeChart()
    const good = recorder('good')
    const host = createExtensionHost(deps, [
      {
        id: 'bad',
        attach() {
          throw new Error('nope')
        },
      },
      good.extension,
    ])
    expect(good.heard.attach).toBe(1)
    expect(host.subscriberCount()).toBe(7)
    host.barsChanged([bar(1)])
    expect(good.heard.bars).toBe(1)
    expect(host.serialize()).toEqual({})
  })

  it('a teardown that throws still lets the chart sweep what the extension drew', () => {
    const { state, deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'bad-detach',
        attach(ctx) {
          ctx.series.createPriceLine({ price: 7 })
          return {
            detach: () => {
              throw new Error('nope')
            },
          }
        },
      },
    ])
    expect(() => host.detach()).not.toThrow()
    expect(state.lines.size).toBe(0)
  })

  it('a menu provider that throws contributes nothing and the menu still opens', () => {
    const { deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'angry',
        attach(ctx) {
          ctx.contributeContextMenu(() => {
            throw new Error('boom')
          })
          return { detach: () => {} }
        },
      },
      {
        id: 'calm',
        attach(ctx) {
          ctx.contributeContextMenu(() => [{ id: 'row', label: 'Row', run: () => {} }])
          return { detach: () => {} }
        },
      },
    ])
    const rows = host.menuItems({ price: 1, priceText: '1.00', symbol: 'ESU6', timeframe: '5m', clientX: 0, clientY: 0 })
    expect(rows.map((r) => r.id)).toEqual(['row'])
  })
})

describe('a detached context is inert, never explosive', () => {
  it('every method answers neutrally after detach and nothing throws', () => {
    const { state, deps } = fakeChart()
    const r = recorder('one')
    const host = createExtensionHost(deps, [r.extension])
    const ctx = r.context()!
    host.detach()

    expect(() => ctx.series.createPriceLine({ price: 1 }).update({ price: 2 })).not.toThrow()
    expect(() => ctx.series.createPriceLine({ price: 1 }).remove()).not.toThrow()
    expect(state.lines.size).toBe(0) // …and it drew nothing on the way
    expect(ctx.series.attachPrimitive({} as never)()).toBeUndefined()
    expect(state.primitives.size).toBe(0)
    expect(ctx.series.priceToY(10)).toBeNull()
    expect(ctx.series.yToPrice(10)).toBeNull()
    expect(ctx.series.timeToX(200)).toBeNull()
    expect(ctx.series.xToTime(20)).toBeNull()
    expect(ctx.series.plotWidth()).toBe(0)
    ctx.series.lockPanZoom(true)
    expect(state.locked).toBe(false)

    // Reads still answer: an extension winding down asks what it was looking at.
    expect(ctx.chart.symbol()).toBe('ESU6')
    expect(ctx.chart.feedStatus()).toBe('live')
    expect(ctx.theme().background).toBe('#101010')
    expect(ctx.formatter().format(1.5)).toBe('1.50')

    // Subscribing after the end registers nothing and never fires.
    let delivered = false
    const off = ctx.onBars(() => (delivered = true))
    expect(host.subscriberCount()).toBe(0)
    host.barsChanged([bar(1)])
    expect(delivered).toBe(false)
    expect(() => off()).not.toThrow()
    expect(ctx.contributeContextMenu(() => [])()).toBeUndefined()
    expect(ctx.contributeCommands([])()).toBeUndefined()
    expect(host.menuItems({ price: 1, priceText: '1', symbol: 'ESU6', timeframe: '5m', clientX: 0, clientY: 0 })).toEqual([])
    expect(host.commands.list()).toEqual([])
    expect(host.commands.execute('anything')).toBe(false)
    expect(host.serialize()).toEqual({})
  })
})

describe('extensions cannot see each other', () => {
  it('viewer state is namespaced by id, and restore hands each one only its own slot', () => {
    const { deps } = fakeChart()
    const seen: Record<string, unknown> = {}
    const stateful = (id: string, value: unknown): ChartExtension => ({
      id,
      attach: () => ({
        serialize: () => value,
        restore: (s) => {
          seen[id] = s
        },
        detach: () => {},
      }),
    })
    const host = createExtensionHost(deps, [stateful('alpha', { level: 1 }), stateful('beta', { level: 2 })])
    const saved = host.serialize()
    expect(saved).toEqual({ alpha: { level: 1 }, beta: { level: 2 } })
    host.restore(saved)
    expect(seen).toEqual({ alpha: { level: 1 }, beta: { level: 2 } })
  })

  it('an extension with no state in the blob is left at its defaults rather than restored with null', () => {
    const { deps } = fakeChart()
    const restore = vi.fn()
    const host = createExtensionHost(deps, [{ id: 'alpha', attach: () => ({ restore, detach: () => {} }) }])
    host.restore({ beta: { level: 9 } })
    host.restore(null)
    host.restore('nonsense')
    expect(restore).not.toHaveBeenCalled()
  })

  it('an extension that saves nothing takes no slot, and one that throws saving loses only itself', () => {
    const { deps } = fakeChart()
    const host = createExtensionHost(deps, [
      { id: 'quiet', attach: () => ({ serialize: () => undefined, detach: () => {} }) },
      {
        id: 'angry',
        attach: () => ({
          serialize: () => {
            throw new Error('boom')
          },
          detach: () => {},
        }),
      },
      { id: 'good', attach: () => ({ serialize: () => 1, detach: () => {} }) },
    ])
    expect(host.serialize()).toEqual({ good: 1 })
  })

  it('a duplicate id is refused rather than allowed to overwrite the first extension’s slot', () => {
    const { deps } = fakeChart()
    const host = createExtensionHost(deps, [
      { id: 'same', attach: () => ({ serialize: () => 'first', detach: () => {} }) },
      { id: 'same', attach: () => ({ serialize: () => 'second', detach: () => {} }) },
    ])
    expect(host.serialize()).toEqual({ same: 'first' })
  })

  it('unsubscribing one extension’s contribution leaves the other’s standing', () => {
    const { deps } = fakeChart()
    let offA = (): void => {}
    const host = createExtensionHost(deps, [
      {
        id: 'a',
        attach(ctx) {
          offA = ctx.contributeContextMenu(() => [{ id: 'a-row', label: 'A', run: () => {} }])
          return { detach: () => {} }
        },
      },
      {
        id: 'b',
        attach(ctx) {
          ctx.contributeContextMenu(() => [{ id: 'b-row', label: 'B', run: () => {} }])
          return { detach: () => {} }
        },
      },
    ])
    const raise = () => host.menuItems({ price: 1, priceText: '1', symbol: 'ESU6', timeframe: '5m', clientX: 0, clientY: 0 }).map((r) => r.id)
    expect(raise()).toEqual(['a-row', 'b-row'])
    offA()
    expect(raise()).toEqual(['b-row'])
  })
})

describe('contributions', () => {
  it('menu rows are asked for at the raise and carry their own action', () => {
    const { deps } = fakeChart()
    const ran: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'alerts',
        attach(ctx) {
          ctx.contributeContextMenu((menu) => [{ id: 'add', label: `Alert at ${menu.priceText}`, run: () => ran.push(menu.priceText) }])
          return { detach: () => {} }
        },
      },
    ])
    const rows = host.menuItems({ price: 5000.25, priceText: '5,000.25', symbol: 'ESU6', timeframe: '5m', clientX: 10, clientY: 20 })
    expect(rows[0]!.label).toBe('Alert at 5,000.25')
    rows[0]!.run()
    expect(ran).toEqual(['5,000.25'])
  })

  it('commands list only what is available, and execute reports whether it ran', () => {
    const { deps } = fakeChart()
    let armed = false
    const ran: string[] = []
    const host = createExtensionHost(deps, [
      {
        id: 'one',
        attach(ctx) {
          ctx.contributeCommands([
            { id: 'always', label: 'Always', execute: () => ran.push('always') },
            { id: 'sometimes', label: 'Sometimes', available: () => armed, execute: () => ran.push('sometimes') },
          ])
          return { detach: () => {} }
        },
      },
    ])
    expect(host.commands.list().map((c) => c.id)).toEqual(['always'])
    expect(host.commands.execute('sometimes')).toBe(false)
    armed = true
    expect(host.commands.list().map((c) => c.id)).toEqual(['always', 'sometimes'])
    expect(host.commands.execute('sometimes')).toBe(true)
    expect(host.commands.execute('nothing-by-that-name')).toBe(false)
    expect(ran).toEqual(['sometimes'])
  })

  it('a command that throws reports failure instead of escaping into the host', () => {
    const { deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'one',
        attach(ctx) {
          ctx.contributeCommands([
            {
              id: 'boom',
              label: 'Boom',
              execute: () => {
                throw new Error('nope')
              },
            },
          ])
          return { detach: () => {} }
        },
      },
    ])
    expect(host.commands.execute('boom')).toBe(false)
  })

  it('contributions come down with their extension', () => {
    const { deps } = fakeChart()
    const host = createExtensionHost(deps, [
      {
        id: 'one',
        attach(ctx) {
          ctx.contributeContextMenu(() => [{ id: 'row', label: 'Row', run: () => {} }])
          ctx.contributeCommands([{ id: 'cmd', label: 'Cmd', execute: () => {} }])
          return { detach: () => {} }
        },
      },
    ])
    host.detach()
    expect(host.menuItems({ price: 1, priceText: '1', symbol: 'ESU6', timeframe: '5m', clientX: 0, clientY: 0 })).toEqual([])
    expect(host.commands.list()).toEqual([])
  })
})

describe('the contract is neutral by construction, not by intention', () => {
  /** The module without its prose: the seam's own comments name what it deliberately excludes, and
   *  a vocabulary check that read them would fail on the sentence promising the exclusion. */
  const code = extensionSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('imports only lightweight-charts types and this package’s own modules', () => {
    const specifiers = [...extensionSrc.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(specifier === 'lightweight-charts' || specifier.startsWith('./'), specifier).toBe(true)
    }
    // No workspace package at all — the free chart's seam cannot acquire a private dependency by
    // way of one convenient type.
    expect(code).not.toMatch(/@trdrs\//)
  })

  it('names no account, broker, order, execution or money concept anywhere in the contract', () => {
    // The seam is the one place a trading concept would enter the free chart under a generic name,
    // and the whole product boundary rests on it not happening.
    const banned =
      /\b(broker|account|position|order|execution|fill|trade|trading|money|currency|pnl|profit|balance|margin|qty|quantity|side|buy|sell|instrument)\w*/i
    const hit = banned.exec(code)
    expect(hit?.[0] ?? null).toBeNull()
  })
})

describe('the widget wires the plane where the contract says it does', () => {
  it('the chart hands out capabilities, never its lightweight-charts instance', () => {
    // The one rule the whole seam rests on: an extension that could reach `chart` or `candles`
    // could do anything, and nothing the widget promises about teardown would hold.
    expect(hostSrc).toMatch(/createExtensionHost\(/)
    const depsBlock = hostSrc.slice(hostSrc.indexOf('extHost = createExtensionHost('), hostSrc.indexOf('options.extensions ?? []'))
    expect(depsBlock).not.toMatch(/\bchart\b\s*,/)
    expect(depsBlock).not.toMatch(/\bcandles\b/)
  })

  it('a symbol or timeframe switch reaches the plane BEFORE the reload that repaints', () => {
    for (const [notify, lane] of [
      ['extHost?.symbolChanged(next)', 'symbol'],
      ['extHost?.timeframeChanged(next)', 'timeframe'],
    ] as const) {
      const at = hostSrc.indexOf(notify)
      expect(at, lane).toBeGreaterThan(-1)
      expect(hostSrc.slice(at, at + 200)).toContain('load()')
    }
  })

  it('extension state is namespaced inside the save blob, and restores after the chart it describes', () => {
    expect(hostSrc).toContain('ext: extHost?.serialize() ?? {}')
    const restoreAt = hostSrc.indexOf('extHost?.restore(c.ext)')
    expect(restoreAt).toBeGreaterThan(-1)
    // Last in the restore body: the symbol, timeframe, scale and compares are the world the state
    // describes, so they must already be on screen.
    expect(hostSrc.slice(hostSrc.indexOf('compareHandle!.restore('), restoreAt)).toContain('compareScalePolicy()')
  })

  it('the plane comes down before the chart it drew on', () => {
    const detachAt = hostSrc.indexOf('extHost?.detach()')
    expect(detachAt).toBeGreaterThan(-1)
    expect(detachAt).toBeLessThan(hostSrc.indexOf('chart.remove()'))
  })

})

// ── The layout attaches per PANE. Nothing in `createChartLayout` knows what an extension is: it
// hands every pane the shared options and removes the panes it drops, so the seam's per-pane
// behavior falls out of the pane lifecycle rather than out of a second rule that could disagree
// with it. Driven here against the real layout, with the widget as the only stand-in. ──
const fakeEl = () => {
  const e = {
    style: {} as Record<string, string>,
    appendChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    remove: () => {},
  }
  return e
}

const { createChartLayout } = await import('../src/layout')

describe('a layout attaches and detaches per pane', () => {
  it('every pane gets its own attachment, its own id, and its own teardown', async () => {
    const attachedTo: string[] = []
    const detachedFrom: string[] = []
    const extension: ChartExtension = {
      id: 'per-pane',
      attach(ctx) {
        attachedTo.push(ctx.chart.id)
        return { detach: () => detachedFrom.push(ctx.chart.id) }
      },
    }

    let paneSeq = 0
    H.makeChart = (options) => {
      const opts = options as { extensions?: readonly ChartExtension[]; symbol?: string }
      const { deps } = fakeChart()
      const id = `pane-${++paneSeq}`
      const host = createExtensionHost({ ...deps, chartId: id }, opts.extensions ?? [])
      let symbol = opts.symbol ?? 'ESU6'
      const off = () => () => {}
      return {
        symbol: () => symbol,
        setSymbol: (s: string) => (symbol = s),
        timeframe: () => '5m',
        setTimeframe: () => {},
        sync: { onCrosshair: off, onTimeClick: off, onVisibleRange: off, centerOn: () => {}, setCrosshair: () => {}, setVisibleRange: () => {} },
        saveLoad: { serialize: () => ({ symbol, timeframe: '5m', content: '{}' }), restore: () => {} },
        remove: () => host.detach(),
      }
    }
    const globals = globalThis as unknown as { document: unknown; getComputedStyle: unknown }
    globals.document = { createElement: () => fakeEl() }
    globals.getComputedStyle = () => ({ position: 'relative' })

    const layout = createChartLayout({
      container: fakeEl() as unknown as HTMLElement,
      base: { extensions: [extension] } as never,
      arrangement: '2h',
    })
    expect(attachedTo.length).toBe(2)
    expect(new Set(attachedTo).size).toBe(2) // two panes, two identities, two state slots
    expect(detachedFrom).toEqual([])

    layout.setArrangement('s') // the dropped pane takes its attachment with it
    expect(detachedFrom.length).toBe(1)
    expect(attachedTo.length).toBe(2)

    layout.setArrangement('2h') // a new pane attaches its own
    expect(attachedTo.length).toBe(3)

    layout.remove()
    expect(detachedFrom.length).toBe(3)
    expect(new Set(detachedFrom)).toEqual(new Set(attachedTo))
  })
})
