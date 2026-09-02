// The session bands primitive over the symbol's own session model: an unknown model draws nothing,
// a continuous market never bands, and a symbol with extended hours shades every stretch outside
// regular hours. The state and label tables are keyed by the model's five states.
import { describe, expect, it, vi } from 'vitest'
import { parseSessionModel, type SessionModel, type SessionState } from '../src/sessionModel'
import { createSessionBands, SESSION_DOT, SESSION_LABEL } from '../src/sessions'
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
  it('a daily or larger interval never bands', () => {
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
