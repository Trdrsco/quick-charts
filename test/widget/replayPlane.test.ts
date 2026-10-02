import { describe, expect, it, vi } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import type { FeedBar, HistoryPage } from '../../src/datafeed'
import { attachReplayPlane, type ReplayDeps } from '../../src/widget/replay'
import { tfSeconds } from '../../src/replay'

const bar = (t: number, c = 100): FeedBar => ({ t, o: c, h: c + 1, l: c - 1, c, v: 10 })
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }

function fixture(initialTimeframe = '1h', served: readonly string[] | null = null, initialGrain = 'auto') {
  // Bars spaced by the timeframe's own seconds, so a fixture reads the same at any grain.
  const step = tfSeconds(initialTimeframe) || 3600
  const bars = Array.from({ length: 10 }, (_, i) => bar(i * step, 100 + i))
  const requests: { resolve(page: HistoryPage): void; reject(error: Error): void; from: number }[] = []
  const paint = vi.fn()
  const change = vi.fn()
  const crosshair = vi.fn()
  let symbol = 'A'
  let timeframe = initialTimeframe
  let disposed = false
  const deps: ReplayDeps = {
    chart: { timeScale: () => ({ scrollToRealTime: vi.fn() }) } as unknown as IChartApi,
    datafeed: {
      search: async () => ({ hits: [], hasMore: false }), resolve: async () => null,
      history: (_s, _tf, range) => {
        expect(range?.from).toBeDefined()
        return new Promise((resolve, reject) => requests.push({ resolve, reject, from: range!.from! }))
      },
      subscribeBars: () => () => {},
    },
    symbol: () => symbol, timeframe: () => timeframe, bars: () => bars,
    paint, clearSlice: vi.fn(), visible: () => true, enabled: true,
    disposed: () => disposed, setHeader: vi.fn(), setCrosshair: crosshair, resolutions: () => served, persist: vi.fn(), onChange: change,
    initialSpeed: 10, initialGrain,
  }
  const plane = attachReplayPlane(deps)
  const resolve = (index: number) => {
    const request = requests[index]!
    request.resolve({ bars: [bar(request.from, 900), bar(request.from + 900, 901)], noData: false })
  }
  return { plane, bars, requests, paint, change, crosshair, resolve,
    symbol: () => { symbol = 'B' }, timeframe: () => { timeframe = '4h' }, disposed: () => { disposed = true } }
}

describe('replay finer-history ownership', () => {
  /** A session ASKING for a finer grain. Auto is the chart's own timeframe, which advances whole
   *  bars and fetches nothing, so a spec about finer HISTORY has to name the grain it wants. */
  const forming = (): ReturnType<typeof fixture> => fixture('1h', null, '15m')

  it('commits a whole-bar step synchronously when no finer history is available', () => {
    // The FINEST rung on the ladder offers only ITSELF, which means whole-bar updates. There is
    // nothing to fetch, so the step never crosses an async boundary.
    const f = fixture('1s')
    expect(f.plane.api.subTimeframes()).toEqual(['1s'])
    expect(f.plane.api.resolvedTimeframe()).toBe('1s')
    f.plane.api.start(f.bars[2]!.t)
    f.paint.mockClear()
    f.plane.api.stepForward()
    expect(f.plane.api.state().cursor).toBe(4)
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.requests).toHaveLength(0)
    f.plane.destroy()
  })

  it.each(['rewind', 'grain', 'live', 'restart', 'destroy', 'symbol', 'timeframe', 'disposed'] as const)(
    'ignores a completion after %s invalidates its request', async (transition) => {
      const f = forming()
      f.plane.api.start(7200)
      f.plane.api.stepForward()
      expect(f.requests).toHaveLength(1)
      switch (transition) {
        case 'rewind': f.plane.api.stepBack(); break
        case 'grain': f.plane.api.setTimeframe('5m'); break
        case 'live': f.plane.api.goLive(); break
        case 'restart': f.plane.api.exit(); f.plane.api.start(18000); break
        case 'destroy': f.plane.destroy(); break
        case 'symbol': f.symbol(); break
        case 'timeframe': f.timeframe(); break
        case 'disposed': f.disposed(); break
      }
      f.paint.mockClear(); f.change.mockClear()
      const state = f.plane.api.state()
      f.resolve(0); await flush()
      expect(f.paint).not.toHaveBeenCalled()
      expect(f.change).not.toHaveBeenCalled()
      expect(f.plane.api.state()).toEqual(state)
      f.plane.destroy()
    },
  )

  it('does not let an old completion release a newer in-flight step', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.plane.api.exit(); f.plane.api.start(18000); f.plane.api.stepForward()
    expect(f.requests).toHaveLength(2)
    f.resolve(0); await flush()
    f.plane.api.stepForward()
    expect(f.requests).toHaveLength(2)
    f.resolve(1); await flush()
    expect(f.paint.mock.lastCall?.[0].at(-1).c).toBe(900)
    f.plane.destroy()
  })

  it('applies the current finer-history completion', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.paint.mockClear(); f.change.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.change).toHaveBeenCalledTimes(1)
    expect(f.paint.mock.lastCall?.[0].at(-1).c).toBe(900)
    f.plane.destroy()
  })

  it('ignores history for a parent replaced by a reconnect snapshot', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.plane.absorb({ kind: 'snapshot', bars: f.bars.map((b) => ({ ...b, c: b.c + 10 })) })
    f.paint.mockClear(); f.change.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).not.toHaveBeenCalled()
    expect(f.change).not.toHaveBeenCalled()
    f.plane.destroy()
  })

  it('keeps the current request valid when an unrelated live bar appends', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.plane.absorb({ kind: 'bar', bar: bar(36000) })
    f.paint.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.paint.mock.lastCall?.[0].at(-1).c).toBe(900)
    f.plane.destroy()
  })

  it('does not invalidate a current request for an unsupported timeframe', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.plane.api.setTimeframe('4h')
    f.paint.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).toHaveBeenCalledTimes(1)
    f.plane.destroy()
  })

  it('ignores rejected stale history rather than painting a whole-bar fallback', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward(); f.plane.api.stepBack()
    f.paint.mockClear(); f.change.mockClear()
    f.requests[0]!.reject(new Error('history unavailable')); await flush()
    expect(f.paint).not.toHaveBeenCalled()
    expect(f.change).not.toHaveBeenCalled()
    f.plane.destroy()
  })

  it('retains the whole-bar fallback for current failed history', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.paint.mockClear()
    f.requests[0]!.reject(new Error('history unavailable')); await flush()
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.paint.mock.lastCall?.[0].at(-1)).toEqual(f.bars[3])
    f.plane.destroy()
  })

  it('cannot restart or start a timer after its own destruction', () => {
    const f = forming()
    f.plane.destroy()
    f.paint.mockClear(); f.change.mockClear()
    f.plane.api.start(7200); f.plane.api.play(); f.plane.api.stepForward()
    expect(f.plane.api.state().on).toBe(false)
    expect(f.requests).toHaveLength(0)
    expect(f.paint).not.toHaveBeenCalled()
    expect(f.change).not.toHaveBeenCalled()
  })

  it.each(['grain', 'snapshot'] as const)('retries the unpainted parent after %s invalidation', async (transition) => {
    const f = forming()
    f.plane.api.start(7200)
    const paintedCursor = f.plane.api.state().cursor
    f.plane.api.stepForward()
    const parentTime = f.requests[0]!.from
    expect(f.plane.api.state().cursor).toBe(paintedCursor)
    if (transition === 'grain') f.plane.api.setTimeframe('5m')
    else f.plane.absorb({ kind: 'snapshot', bars: f.bars.map((b) => ({ ...b, c: b.c + 10 })) })
    f.resolve(0); await flush()
    expect(f.plane.api.state().cursor).toBe(paintedCursor)
    f.plane.api.stepForward()
    expect(f.requests[1]!.from).toBe(parentTime)
    f.resolve(1); await flush()
    expect(f.plane.api.state().cursor).toBe(paintedCursor + 1)
    expect(f.paint.mock.lastCall?.[0].at(-1).t).toBe(parentTime)
    f.plane.destroy()
  })

  it('keeps pending history when selecting the current timeframe', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    f.plane.api.setTimeframe('15m') // the one it is already on: no change, so nothing to invalidate
    f.paint.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.paint.mock.lastCall?.[0].at(-1).t).toBe(f.requests[0]!.from)
    f.plane.destroy()
  })

  it('releases a snapshot-invalidated request before its obsolete promise settles', async () => {
    const f = forming()
    f.plane.api.start(7200); f.plane.api.stepForward()
    const parentTime = f.requests[0]!.from
    f.plane.absorb({ kind: 'snapshot', bars: f.bars.map((b) => ({ ...b, c: b.c + 10 })) })
    f.plane.api.stepForward()
    expect(f.requests).toHaveLength(2)
    expect(f.requests[1]!.from).toBe(parentTime)
    f.paint.mockClear(); f.change.mockClear()
    f.resolve(0); await flush()
    expect(f.paint).not.toHaveBeenCalled()
    expect(f.change).not.toHaveBeenCalled()
    f.plane.api.stepForward()
    expect(f.requests).toHaveLength(2)
    f.resolve(1); await flush()
    expect(f.plane.api.state().cursor).toBe(4)
    expect(f.paint).toHaveBeenCalledTimes(1)
    expect(f.paint.mock.lastCall?.[0].at(-1).t).toBe(parentTime)
    f.plane.destroy()
  })
})

describe('the replay phases', () => {
  it('arms without painting when no moment is given, and runs when one is', () => {
    const f = fixture()
    f.plane.api.start()
    expect(f.plane.api.phase()).toBe('arming')
    expect(f.plane.api.state().on).toBe(false)
    // Arming rewinds past NOTHING: the window a viewer is choosing from stays whole under them.
    expect(f.paint).not.toHaveBeenCalled()
    expect(f.plane.api.state().total).toBe(f.bars.length)

    f.plane.api.start(3600 * 5)
    expect(f.plane.api.phase()).toBe('on')
    expect(f.paint).toHaveBeenCalledTimes(1)
    f.plane.destroy()
  })

  it('moves the cursor when a running session is given another moment', () => {
    const f = fixture()
    f.plane.api.start(3600 * 7)
    const late = f.plane.api.state().cursor
    f.change.mockClear()
    f.plane.api.start(3600 * 3)
    const state = f.plane.api.state()
    expect(state.cursor).toBeLessThan(late)
    // The master set is the LOADED window throughout. Re-snapshotting from the painted slice would
    // shrink the total on every pick until there was nothing left to replay.
    expect(state.total).toBe(f.bars.length)
    expect(state.on).toBe(true)
    expect(f.change).toHaveBeenCalledTimes(1)
    f.plane.destroy()
  })

  it('takes the crosshair away for the length of the question and hands it back after', () => {
    const f = fixture()
    f.plane.api.start()
    expect(f.crosshair.mock.calls).toEqual([[false]])

    // Answered: the rule is gone, so the crosshair is the pointer again.
    f.plane.api.start(3600 * 4)
    expect(f.crosshair.mock.calls).toEqual([[false], [true]])

    // Re-arming mid-session asks again, and takes it away again.
    f.plane.api.arm()
    f.plane.api.disarm()
    expect(f.crosshair.mock.calls).toEqual([[false], [true], [false], [true]])
    f.plane.destroy()
  })

  it('offers only the grains the FEED serves, and never fetches one it does not', () => {
    // A feed serving minutes and nothing finer leaves a minute chart with only its OWN timeframe,
    // so updates advance whole bars rather than spending a request per step to be told no.
    const f = fixture('1m', ['1m', '5m'])
    expect(f.plane.api.subTimeframes()).toEqual(['1m'])
    expect(f.plane.api.resolvedTimeframe()).toBe('1m')
    f.plane.api.start(f.bars[2]!.t)
    f.plane.api.stepForward()
    expect(f.requests).toHaveLength(0)
    expect(f.plane.api.state().cursor).toBe(4)

    // The same chart on a feed that serves seconds can form from them.
    const g = fixture('1m', ['1s', '1m'])
    expect(g.plane.api.subTimeframes()).toEqual(['1s', '1m'])
    g.plane.api.setTimeframe('1s')
    expect(g.plane.api.resolvedTimeframe()).toBe('1s')
    f.plane.destroy()
    g.plane.destroy()
  })

  it('takes the chart\'s own timeframe as auto, and a finer grain only when asked', () => {
    const f = fixture('1m')
    expect(f.plane.api.subTimeframes()).toEqual(['1s', '1m'])
    // Auto is the coarsest on offer, which is the chart's own: whole-bar updates until asked
    // otherwise.
    expect(f.plane.api.timeframe()).toBe('auto')
    expect(f.plane.api.resolvedTimeframe()).toBe('1m')
    f.plane.api.setTimeframe('1s')
    expect(f.plane.api.resolvedTimeframe()).toBe('1s')
    f.plane.destroy()
  })

  it('reports leaving the armed state, so the row and the mark hear the question withdrawn', () => {
    const f = fixture()
    f.plane.api.start()
    f.change.mockClear()
    f.plane.api.exit()
    expect(f.plane.api.phase()).toBe('off')
    expect(f.change).toHaveBeenCalledTimes(1)
    // Nothing was painted, so nothing is handed back.
    f.plane.api.exit()
    expect(f.change).toHaveBeenCalledTimes(1)
    f.plane.destroy()
  })
})
