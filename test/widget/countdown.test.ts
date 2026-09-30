import { describe, expect, it, vi } from 'vitest'
import type { FeedBar } from '../../src/datafeed'
import { parseSessionModel, type ActiveSubsession } from '../../src/sessionModel'
import type { PriceFormatter } from '../../src/priceFormatter'
import type { DataStatus } from '../../src/symbology'
import type { SemanticTheme } from '../../src/theme/schema'
import {
  activeSessionClose,
  attachCountdown,
  barCloseBoundary,
  countdownState,
  countdownText,
  createCountdownClock,
} from '../../src/widget/countdown'

const utc = (year: number, month: number, day: number, hour = 0, minute = 0): number =>
  Date.UTC(year, month, day, hour, minute) / 1000

const bar = (t: number, o = 100, c = 101): FeedBar => ({ t, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 })

describe('the bar boundary', () => {
  it('advances fixed units from the feed bar open rather than aligning the wall clock', () => {
    expect(barCloseBoundary(101, '1s')).toBe(102)
    expect(barCloseBoundary(101, '5m')).toBe(401)
    expect(barCloseBoundary(101, '4h')).toBe(14_501)
    expect(barCloseBoundary(utc(2026, 6, 8), '2w')).toBe(utc(2026, 6, 22))
    expect(barCloseBoundary(utc(2026, 6, 8), '3w')).toBe(utc(2026, 6, 29))
  })

  it('advances multi-month bars on the UTC calendar, including leap years and short months', () => {
    expect(barCloseBoundary(utc(2024, 0, 1), '1mo')).toBe(utc(2024, 1, 1))
    expect(barCloseBoundary(utc(2024, 0, 31), '1mo')).toBe(utc(2024, 1, 29))
    expect(barCloseBoundary(utc(2024, 1, 29), '12mo')).toBe(utc(2025, 1, 28))
    expect(barCloseBoundary(utc(2026, 10, 1), '3mo')).toBe(utc(2027, 1, 1))
    expect(barCloseBoundary(utc(2026, 6, 1), '6mo')).toBe(utc(2027, 0, 1))
    expect(barCloseBoundary(utc(2026, 0, 1), '1mo')).not.toBe(utc(2026, 0, 1) + 30 * 86_400)
  })

  it('refuses ticks, malformed tokens and non-finite opens', () => {
    expect(barCloseBoundary(100, '10t')).toBeNull()
    expect(barCloseBoundary(100, 'month')).toBeNull()
    expect(barCloseBoundary(Number.NaN, '1m')).toBeNull()
  })
})

describe('the active session close', () => {
  const model = parseSessionModel({
    timezone: 'America/New_York',
    session: '0930-1600',
    sessionHolidays: '',
    corrections: '0930-1300:20261127',
    subsessions: [
      { id: 'premarket', session: '0400-0930', sessionCorrections: '0400-0930:20261127' },
      { id: 'postmarket', session: '1600-2000', sessionCorrections: '1300-1700:20261127' },
    ],
  })!

  it('regular closes when regular trading ends, including a shortened day', () => {
    expect(activeSessionClose(model, 'regular', utc(2026, 6, 13, 15))).toBe(utc(2026, 6, 13, 20))
    expect(activeSessionClose(model, 'regular', utc(2026, 10, 27, 17, 30))).toBe(utc(2026, 10, 27, 18))
  })

  it('extended crosses premarket and regular edges and closes only after the served day', () => {
    expect(activeSessionClose(model, 'extended', utc(2026, 6, 13, 12))).toBe(utc(2026, 6, 14, 0))
    expect(activeSessionClose(model, 'extended', utc(2026, 10, 27, 17, 30))).toBe(utc(2026, 10, 27, 22))
  })

  it('refuses a countdown while the selected session is closed', () => {
    expect(activeSessionClose(model, 'regular', utc(2026, 6, 13, 12))).toBeNull()
    expect(activeSessionClose(model, 'extended', utc(2026, 6, 13, 7))).toBeNull()
  })
})

describe('countdown state', () => {
  const market = parseSessionModel({
    timezone: 'America/New_York',
    session: '0930-1600',
    sessionHolidays: '',
    corrections: '',
  })!

  it('uses the latest bar and expires instead of counting through stale history', () => {
    expect(countdownState([bar(0), bar(300)], '5m', 420, null, 'extended')).toMatchObject({ closeAt: 600, remaining: 180 })
    expect(countdownState([bar(0), bar(300)], '5m', 600, null, 'extended')).toBeNull()
    expect(countdownState([bar(300)], '5m', 299, null, 'extended')).toBeNull()
  })

  it('does not require a guessed session when metadata is unresolved', () => {
    expect(countdownState([bar(300)], '5m', 420, null, 'extended')?.remaining).toBe(180)
  })

  it('ends a daily bar at its declared trading-session close', () => {
    const open = utc(2026, 6, 13)
    const now = utc(2026, 6, 13, 15)
    expect(countdownState([bar(open)], '1d', now, market, 'regular')?.closeAt).toBe(utc(2026, 6, 13, 20))
  })

  it('does not truncate weekly or multi-month bars at an intervening daily close', () => {
    const open = utc(2026, 6, 13)
    const now = utc(2026, 6, 13, 15)
    expect(countdownState([bar(open)], '1w', now, market, 'regular')?.closeAt).toBe(utc(2026, 6, 20))
    expect(countdownState([bar(open)], '3mo', now, market, 'regular')?.closeAt).toBe(utc(2026, 9, 13))
  })

  it('refuses weekly and monthly countdowns while the declared selected session is closed', () => {
    const open = utc(2026, 6, 13)
    const closed = utc(2026, 6, 18, 15)
    expect(countdownState([bar(open)], '1w', closed, market, 'regular')).toBeNull()
    expect(countdownState([bar(open)], '3mo', closed, market, 'regular')).toBeNull()
  })

  it('formats the remaining duration without inventing fractional seconds', () => {
    expect(countdownText(59.9)).toBe('00:59')
    expect(countdownText(3661)).toBe('1:01:01')
    expect(countdownText(176_400)).toBe('2d 1h')
  })
})

describe('server clock correction', () => {
  it('uses a finite answer and fences a prior load', async () => {
    let client = 100
    let resolveFirst!: (value: number) => void
    let resolveSecond!: (value: number) => void
    const server = vi.fn()
      .mockImplementationOnce(() => new Promise<number>((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise<number>((resolve) => { resolveSecond = resolve }))
    const clock = createCountdownClock(() => client, server)
    clock.reset()
    clock.reset()
    await Promise.resolve()
    resolveFirst(140)
    await Promise.resolve()
    expect(clock.now()).toBe(100)
    client = 102
    resolveSecond(130)
    await Promise.resolve()
    await Promise.resolve()
    expect(clock.now()).toBe(130)
  })

  it('keeps the client clock on failure, invalid answers and disposal', async () => {
    const failed = createCountdownClock(() => 100, () => Promise.reject(new Error('offline')))
    failed.reset()
    await Promise.resolve()
    expect(failed.now()).toBe(100)

    const invalid = createCountdownClock(() => 100, () => Promise.resolve(Number.NaN))
    invalid.reset()
    await Promise.resolve()
    expect(invalid.now()).toBe(100)

    let answer!: (value: number) => void
    const disposed = createCountdownClock(() => 100, () => new Promise((resolve) => { answer = resolve }))
    disposed.reset()
    disposed.destroy()
    await Promise.resolve()
    answer(150)
    await Promise.resolve()
    expect(disposed.now()).toBe(100)
  })

  it('turns a synchronous host-clock throw into the optional-probe fallback', async () => {
    const clock = createCountdownClock(() => 100, () => { throw new Error('host clock failed') })
    expect(() => clock.reset()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(clock.now()).toBe(100)
  })
})

describe('the price-axis lifecycle', () => {
  const theme = {
    'series.up': '#00aa88',
    'series.down': '#cc3300',
    'text.inverse': '#ffffff',
    'text.fontSizeAxis': '12px',
    'text.fontFamily': 'Inter',
  } as SemanticTheme

  const setup = () => {
    const options: Record<string, unknown>[] = []
    const oldOptions: Record<string, unknown>[] = []
    const primitives: unknown[] = []
    const makeSeries = (writes: Record<string, unknown>[]) => ({
      applyOptions: (next: Record<string, unknown>) => writes.push(next),
      priceToCoordinate: () => 50,
      attachPrimitive: (primitive: unknown) => { primitives.push(primitive) },
      detachPrimitive: (primitive: unknown) => { primitives.splice(primitives.indexOf(primitive), 1) },
    })
    let series = makeSeries(options)
    let tick: (() => void) | null = null
    let cleared = false
    let enabled = true
    let replaying = false
    let status: DataStatus | null = 'streaming'
    let timeframe = '1m'
    let bars: FeedBar[] = [bar(60)]
    let active: ActiveSubsession = 'extended'
    const formatter = { format: (price: number) => `exact:${price.toFixed(5)}` } as PriceFormatter
    const layer = attachCountdown({
      series: () => series as never,
      bars: () => bars,
      timeframe: () => timeframe,
      enabled: () => enabled,
      replaying: () => replaying,
      dataStatus: () => status,
      session: () => null,
      activeSubsession: () => active,
      formatter: () => formatter,
      theme: () => theme,
      now: () => 90,
      setInterval: (callback) => { tick = callback; return 7 },
      clearInterval: () => { cleared = true },
    })
    return {
      layer, options, oldOptions, primitives,
      setEnabled: (value: boolean) => { enabled = value },
      setReplay: (value: boolean) => { replaying = value },
      setStatus: (value: DataStatus | null) => { status = value },
      setTimeframe: (value: string) => { timeframe = value },
      setBars: (value: FeedBar[]) => { bars = value },
      setActive: (value: ActiveSubsession) => { active = value },
      swapSeries: () => { const previous = series; series = makeSeries(oldOptions); layer.seriesChanged(previous as never) },
      tick: () => tick?.(),
      cleared: () => cleared,
    }
  }

  it('hides exactly the native label while the combined label is truthful', () => {
    const h = setup()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: false })
    h.setEnabled(false); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setEnabled(true); h.setReplay(true); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setReplay(false); h.setStatus('delayed_streaming'); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setStatus('endofday'); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setStatus(null); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setStatus('streaming'); h.setTimeframe('10t'); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    h.setTimeframe('1m'); h.setBars([]); h.layer.refresh()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
  })

  it('hands native visibility across any style-series replacement and disposes once', () => {
    const h = setup()
    h.swapSeries()
    expect(h.options.at(-1)).toEqual({ lastValueVisible: true })
    expect(h.oldOptions.at(-1)).toEqual({ lastValueVisible: false })
    h.tick()
    h.layer.destroy()
    expect(h.oldOptions.at(-1)).toEqual({ lastValueVisible: true })
    expect(h.cleared()).toBe(true)
    expect(h.primitives).toHaveLength(0)
    h.layer.destroy()
  })

  it('draws the precise chart formatter and semantic theme inside one axis pill', () => {
    const h = setup()
    const primitive = h.primitives[0] as {
      priceAxisPaneViews(): readonly { renderer(): { draw(target: unknown): void } }[]
    }
    const text: string[] = []
    const fills: string[] = []
    const context = {
      set fillStyle(value: string) { fills.push(value) },
      set font(_value: string) {},
      set textAlign(_value: CanvasTextAlign) {},
      set textBaseline(_value: CanvasTextBaseline) {},
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText(value: string) { text.push(value) },
    }
    primitive.priceAxisPaneViews()[0]!.renderer().draw({
      useMediaCoordinateSpace(callback: (scope: unknown) => void) {
        callback({ context, mediaSize: { width: 80, height: 100 } })
      },
    })
    expect(text).toEqual(['exact:101.00000', '00:30'])
    expect(fills).toEqual(['#00aa88', '#ffffff'])
  })

  it('does not schedule another renderer update from updateAllViews', () => {
    const h = setup()
    const primitive = h.primitives[0] as {
      attached(param: { requestUpdate(): void }): void
      updateAllViews(): void
    }
    const requestUpdate = vi.fn()
    primitive.attached({ requestUpdate })
    requestUpdate.mockClear()
    primitive.updateAllViews()
    expect(requestUpdate).not.toHaveBeenCalled()
    h.layer.refresh()
    expect(requestUpdate).toHaveBeenCalledOnce()
  })
})
