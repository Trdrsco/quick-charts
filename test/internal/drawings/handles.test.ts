// A selected drawing's handles, held to measured pixels: a round handle is a ring 1.5px wide and
// 11px across on its point's pixel, filled with the chart's ground, and the one under the pointer
// stands in a halo of its ring ink at 20% that reaches 9px from its middle; a square one is 13px
// across, its ring 2px wide and its corners rounded at 4; a mark's small one is a ring 1px wide of
// radius 3.5. All take their inks from the chart's theme.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { paintHandles } from '../../../src/internal/drawings/render/canvas'
import { DEFAULT_INKS, drawingInksOf } from '../../../src/internal/drawings/core/inks'
import { BUILT_IN_THEMES } from '../../../src/theme/palettes'

interface Call {
  name: string
  args: unknown[]
  fillStyle?: unknown
  strokeStyle?: unknown
  lineWidth?: unknown
  alpha?: number
}

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), lineWidth: state.get('lineWidth'), alpha: state.has('globalAlpha') ? Number(state.get('globalAlpha')) : 1 })
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  return { ctx, calls }
}

describe('selection handles', () => {
  it('rings a point’s pixel 11px across, 1.5px wide, filled with the chart’s ground', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 615, y: 692 }, { x: 614.6, y: 692.3 }], { ring: '#1e53e5', center: '#0f0f0f' })
    // Centred on the pixel (615, 692), radius 5: the ring fills columns 610 and 620 and the seven
    // between are the ground, as measured.
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([
      [615.5, 692.5, 5],
      [615.5, 692.5, 5],
    ])
    expect(calls.filter((c) => c.name === 'fill').map((c) => c.fillStyle)).toEqual(['#0f0f0f', '#0f0f0f'])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#1e53e5', 1.5],
      ['#1e53e5', 1.5],
    ])
  })

  it('squares a point’s pixel 13px across, its ring 2px wide and its corners rounded', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 558, y: 700 }], { ring: '#1e53e5', center: '#0f0f0f' }, 'square')
    // The ring's two pixels stand at columns 552 and 553, and 563 and 564, as measured.
    expect(calls.filter((c) => c.name === 'roundRect').map((c) => c.args)).toEqual([[553, 695, 11, 11, 3]])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => c.lineWidth)).toEqual([2])
  })

  it('stands the round handle under the pointer in a halo of its ring ink at 20%, 18px across', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 118, y: 140 }, { x: 244, y: 80 }], { ring: '#1e53e5', center: '#0f0f0f' }, 'circle', 1)
    // As measured, the halo reads #121d3a over the ground from 6px to 9px out of the hovered one.
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([
      [118.5, 140.5, 5],
      [244.5, 80.5, 9],
      [244.5, 80.5, 5],
    ])
    expect(calls.filter((c) => c.name === 'fill').map((c) => [c.fillStyle, c.alpha])).toEqual([
      ['#0f0f0f', 1],
      ['#1e53e5', 0.2],
      ['#0f0f0f', 1],
    ])
    expect([0x0f, 0x0f, 0x0f].map((g, i) => Math.round(g * 0.8 + [0x1e, 0x53, 0xe5][i]! * 0.2).toString(16))).toEqual(['12', '1d', '3a'])
  })

  it('rings a mark’s point with a small ring 1px wide, of radius 3.5', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 558, y: 700 }], { ring: '#1e53e5', center: '#0f0f0f' }, 'small', 0)
    // As measured, the ring reads half strength on columns 554, 555, 561 and 562 of row 700; a small
    // ring under the pointer stands in no halo.
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([[558.5, 700.5, 3.5]])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([['#1e53e5', 1]])
  })

  it('takes its inks from the chart’s theme: the dark ring is #1e53e5 around the dark ground', () => {
    expect(drawingInksOf(BUILT_IN_THEMES.dark)).toMatchObject({ handleRing: '#1e53e5', handleCenter: '#0f0f0f' })
    expect(drawingInksOf(BUILT_IN_THEMES.light)).toMatchObject({ handleRing: '#2962ff', handleCenter: '#ffffff' })
    const d = drawingTools.create('trend_line', 't', [])! as unknown as { inks(): unknown; setInks(s: () => unknown): void }
    expect(d.inks()).toEqual(DEFAULT_INKS)
    d.setInks(() => drawingInksOf(BUILT_IN_THEMES.dark))
    expect(d.inks()).toMatchObject({ handleRing: '#1e53e5' })
  })
})
