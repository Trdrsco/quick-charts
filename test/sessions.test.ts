// The session bands primitive over the symbol's own session model: an unknown model draws nothing,
// a continuous market never bands, and a symbol with extended hours shades every stretch outside
// regular hours in the color the chart settings give it, and a line marks each trading day's start.
// The state and label tables are keyed by the model's five states.
import { describe, expect, it, vi } from 'vitest'
import { parseSessionModel, type SessionModel, type SessionState } from '../src/sessionModel'
import { createSessionBands, sessionBreakTimes, SESSION_DOT, SESSION_LABEL } from '../src/sessions'
import { DARK_THEME } from '../src/theme/palettes'

const model = (source: Parameters<typeof parseSessionModel>[0]): SessionModel => parseSessionModel(source)!
const CME = model({ timezone: 'America/Chicago', session: '1700-1600:23456' })
const PERP = model({ timezone: 'Etc/UTC', session: '24x7' })

describe('the state tables', () => {
  it('name and color every state, the extended state included', () => {
    const states: SessionState[] = ['pre', 'open', 'extended', 'after', 'closed']
    for (const s of states) {
      expect(SESSION_LABEL[s]).toBeTypeOf('string')
      expect(SESSION_DOT[s]).toBeTypeOf('string')
    }
    expect(SESSION_LABEL.extended).toBe('Extended hours')
  })
})

describe('createSessionBands — an unknown model draws NOTHING (the promise the README makes)', () => {
  const fakeChart = { timeScale: () => ({ getVisibleRange: () => ({ from: Date.UTC(2026, 6, 13) / 1000, to: Date.UTC(2026, 6, 15) / 1000 }), options: () => ({ barSpacing: 6 }), timeToCoordinate: () => 10 }) }
  const bars = [
    { time: Date.UTC(2026, 6, 13, 21, 30) / 1000, close: 1 }, // Monday 16:30 CT: the daily break, closed
    { time: Date.UTC(2026, 6, 14, 15) / 1000, close: 1 }, // Tuesday 10:00 CT: open
  ]
  const fakeSeries = { data: () => bars }
  const draw = (m: SessionModel | null, intraday = true) => {
    const prim = createSessionBands(fakeChart as never, fakeSeries as never, () => true, () => m, () => intraday, () => DARK_THEME)
    const view = prim.paneViews()[0] as { renderer: () => { draw: (t: unknown) => void } }
    const useBitmap = vi.fn()
    view.renderer().draw({ useBitmapCoordinateSpace: useBitmap })
    return useBitmap
  }
  it('null: the renderer never enters the canvas', () => {
    expect(draw(null)).not.toHaveBeenCalled()
  })
  it('a continuous market never bands', () => {
    expect(draw(PERP)).not.toHaveBeenCalled()
  })
  it('a daily or larger timeframe never bands', () => {
    expect(draw(CME, false)).not.toHaveBeenCalled()
  })
  it('a session with closures and bars: paints', () => {
    expect(draw(CME)).toHaveBeenCalledTimes(1)
  })
  it('shades every run outside regular hours and leaves regular hours clear', () => {
    const prim = createSessionBands(fakeChart as never, fakeSeries as never, () => true, () => CME, () => true, () => DARK_THEME)
    const view = prim.paneViews()[0] as { renderer: () => { draw: (t: unknown) => void } }
    const fillRect = vi.fn()
    const scope = { context: { fillRect, fillStyle: '' }, bitmapSize: { width: 800, height: 400 }, horizontalPixelRatio: 1 }
    view.renderer().draw({ useBitmapCoordinateSpace: (fn: (s: typeof scope) => void) => fn(scope) })
    expect(fillRect).toHaveBeenCalledTimes(1) // the one closed bar; the open bar draws no rect
  })
  it('refresh() is safe detached and forwards to requestUpdate once attached', () => {
    const prim = createSessionBands(fakeChart as never, fakeSeries as never, () => true, () => CME, () => true, () => DARK_THEME)
    expect(() => prim.refresh()).not.toThrow()
    const requestUpdate = vi.fn()
    prim.attached({ requestUpdate })
    prim.refresh()
    expect(requestUpdate).toHaveBeenCalledTimes(1)
    prim.detached()
    prim.refresh()
    expect(requestUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('session breaks', () => {
  it('fall on the first bar of each trading day, in the exchange zone', () => {
    const hour = (d: number, h: number): number => Date.UTC(2026, 6, d, h) / 1000
    // A continuous market's day turns at its own midnight.
    expect(sessionBreakTimes(PERP, [hour(13, 22), hour(13, 23), hour(14, 0), hour(14, 1)])).toEqual([hour(14, 0)])
    // A session that opens the evening before belongs to the day it closes on: 17:00 Chicago on
    // Monday (22:00 UTC) opens Tuesday.
    expect(sessionBreakTimes(CME, [hour(13, 20), hour(13, 21), hour(13, 22), hour(13, 23)])).toEqual([hour(13, 22)])
    expect(sessionBreakTimes(CME, [])).toEqual([])
  })

  it('draw a line at each break in their own stroke, on a continuous market too, and none while off', () => {
    const times = [Date.UTC(2026, 6, 13, 23) / 1000, Date.UTC(2026, 6, 14, 0) / 1000, Date.UTC(2026, 6, 14, 1) / 1000]
    const chart = {
      timeScale: () => ({
        getVisibleRange: () => ({ from: times[0], to: times[2] }),
        options: () => ({ barSpacing: 6 }),
        timeToCoordinate: (time: number) => (time - times[0]!) / 360,
      }),
    }
    const series = { data: () => times.map((time) => ({ time, close: 1 })) }
    const calls: string[] = []
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: (x: number, y: number) => calls.push(`move ${x},${y}`),
      lineTo: (x: number, y: number) => calls.push(`line ${x},${y}`),
      stroke: () => calls.push('stroke'),
      setLineDash: (dash: number[]) => calls.push(`dash ${dash.join(',')}`),
      fillRect: () => calls.push('fill'),
      strokeStyle: '',
      lineWidth: 0,
      fillStyle: '',
    }
    let breaks: { color: string; width: number; style: 'solid' | 'dashed' | 'dotted' } | null = { color: '#4985e7', width: 1, style: 'dashed' }
    const prim = createSessionBands(chart as never, series as never, () => true, () => PERP, () => true, () => DARK_THEME, () => ({ pre: null, after: null, extended: null, breaks }))
    const draw = (): void => {
      const view = prim.paneViews()[0] as { renderer: () => { draw: (target: unknown) => void } }
      view.renderer().draw({ useBitmapCoordinateSpace: (fn: (scope: unknown) => void) => fn({ context: ctx, bitmapSize: { width: 800, height: 400 }, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) })
    }
    draw()
    // One break, at midnight: ten pixels in, a pixel wide, dashed six and six, full height.
    expect(calls).toEqual(['dash 6,6', 'move 10.5,0', 'line 10.5,400', 'stroke'])
    expect(ctx.strokeStyle).toBe('#4985e7')
    calls.length = 0
    breaks = null
    draw()
    expect(calls).toEqual([])
  })

  it('shade each stretch outside regular hours in the color the settings give it', () => {
    const EXT = model({ timezone: 'America/New_York', session: '0930-1600:23456', subsessions: [{ id: 'premarket', session: '0400-0930:23456' }, { id: 'postmarket', session: '1600-2000:23456' }] })
    const times = [Date.UTC(2026, 6, 14, 12) / 1000, Date.UTC(2026, 6, 14, 15) / 1000, Date.UTC(2026, 6, 14, 21) / 1000, Date.UTC(2026, 6, 14, 22) / 1000]
    const chart = { timeScale: () => ({ getVisibleRange: () => ({ from: times[0], to: times[3] }), options: () => ({ barSpacing: 6 }), timeToCoordinate: () => 10 }) }
    const fills: string[] = []
    const ctx = { fillRect: () => fills.push(ctx.fillStyle), fillStyle: '' }
    const prim = createSessionBands(chart as never, { data: () => times.map((time) => ({ time, close: 1 })) } as never, () => true, () => EXT, () => true, () => DARK_THEME, () => ({
      pre: 'rgba(255, 152, 0, 0.08)',
      after: 'rgba(41, 98, 255, 0.08)',
      extended: null,
      breaks: null,
    }))
    const view = prim.paneViews()[0] as { renderer: () => { draw: (target: unknown) => void } }
    view.renderer().draw({ useBitmapCoordinateSpace: (fn: (scope: unknown) => void) => fn({ context: ctx, bitmapSize: { width: 800, height: 400 }, horizontalPixelRatio: 1 }) })
    expect(fills).toEqual(['rgba(255, 152, 0, 0.08)', 'rgba(41, 98, 255, 0.08)'])
  })
})
