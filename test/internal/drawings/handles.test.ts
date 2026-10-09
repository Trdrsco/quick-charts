// A drawing's handles, held to the measured canvas calls: selected, a round handle is a ring of
// radius 5.5 and 2px wide on its point's pixel, filled with the chart's ground, and the one under the
// pointer stands in a halo, a ring of radius 8 and 3px wide in its ring ink at 20%; a square one is
// 11px across with corners rounded at 3.3, its ring 2px wide; a mark's small one is a ring 1px wide
// of radius 3.5. The thin form a hovered drawing shows is a ring of radius 6, or a square 12px
// across, 1px wide. All take their inks from the chart's theme.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { hoveredIndex, paintHandles } from '../../../src/internal/drawings/render/canvas'
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

const INKS = { ring: '#1e53e5', center: '#0f0f0f' }

describe('selection handles', () => {
  it('rings a point’s pixel at a radius of 5.5, 2px wide, filled with the chart’s ground', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 615, y: 692 }, { x: 614.6, y: 692.3 }], INKS)
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([
      [615.5, 692.5, 5.5],
      [615.5, 692.5, 5.5],
    ])
    expect(calls.filter((c) => c.name === 'fill').map((c) => c.fillStyle)).toEqual(['#0f0f0f', '#0f0f0f'])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#1e53e5', 2],
      ['#1e53e5', 2],
    ])
  })

  it('squares a point’s pixel 11px across, its ring 2px wide and its corners rounded at 3.3', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 1112, y: 700 }], INKS, 'square')
    // As measured: the outline from (1107, 695) to (1118, 706).
    expect(calls.filter((c) => c.name === 'roundRect').map((c) => c.args)).toEqual([[1107, 695, 11, 11, 3.3]])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => c.lineWidth)).toEqual([2])
  })

  it('stands the round handle under the pointer in a ring of its ring ink at 20%, 3px wide at a radius of 8', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 118, y: 140 }, { x: 244, y: 80 }], INKS, 'circle', 1)
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([
      [118.5, 140.5, 5.5],
      [244.5, 80.5, 8],
      [244.5, 80.5, 5.5],
    ])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.strokeStyle, c.lineWidth, c.alpha])).toEqual([
      ['#1e53e5', 2, 1],
      ['#1e53e5', 3, 0.2],
      ['#1e53e5', 2, 1],
    ])
    // Over the dark ground the halo reads #121d3a, as measured round a hovered handle.
    expect([0x0f, 0x0f, 0x0f].map((g, i) => Math.round(g * 0.8 + [0x1e, 0x53, 0xe5][i]! * 0.2).toString(16))).toEqual(['12', '1d', '3a'])
  })

  it('stands the square handle under the pointer in a square halo 16px across, its corners rounded at 4.8', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 1112, y: 700 }], INKS, 'square', 0)
    expect(calls.filter((c) => c.name === 'roundRect').map((c) => c.args)).toEqual([
      [1104.5, 692.5, 16, 16, 4.8],
      [1107, 695, 11, 11, 3.3],
    ])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.lineWidth, c.alpha])).toEqual([
      [3, 0.2],
      [2, 1],
    ])
  })

  it('draws the thin form a hovered drawing shows: a ring of radius 6, or a square 12px across, 1px wide', () => {
    const round = recorder()
    paintHandles(round.ctx, [{ x: 558, y: 700 }], INKS, 'circle', 0, 'thin')
    expect(round.calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([[558.5, 700.5, 6]])
    expect(round.calls.filter((c) => c.name === 'stroke').map((c) => c.lineWidth)).toEqual([1])
    const square = recorder()
    paintHandles(square.ctx, [{ x: 1112, y: 700 }], INKS, 'square', null, 'thin')
    // As measured: the outline from (1106.5, 694.5) to (1118.5, 706.5).
    expect(square.calls.filter((c) => c.name === 'roundRect').map((c) => c.args)).toEqual([[1106.5, 694.5, 12, 12, 3.3]])
    expect(square.calls.filter((c) => c.name === 'stroke').map((c) => c.lineWidth)).toEqual([1])
  })

  it('stands out the handle nearest a mouse within a press’s reach', () => {
    const points = [{ x: 100, y: 100 }, { x: 300, y: 200 }]
    expect([hoveredIndex(points, { x: 301, y: 199 }, 11), hoveredIndex(points, { x: 200, y: 150 }, 11), hoveredIndex(points, { x: 110, y: 108 }, 11), hoveredIndex(points, null, 11)]).toEqual([1, null, null, null])
  })

  it('rings a mark’s point with a small ring 1px wide, of radius 3.5', () => {
    const { ctx, calls } = recorder()
    paintHandles(ctx, [{ x: 558, y: 700 }], INKS, 'small', 0)
    // As measured, the ring reads half strength on columns 554, 555, 561 and 562 of row 700; a small
    // ring under the pointer stands in no halo.
    expect(calls.filter((c) => c.name === 'arc').map((c) => c.args.slice(0, 3))).toEqual([[558.5, 700.5, 3.5]])
    expect(calls.filter((c) => c.name === 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([['#1e53e5', 1]])
  })

  it('takes its inks from the chart’s theme: the dark ring is #1e53e5 around the dark ground', () => {
    expect(drawingInksOf(BUILT_IN_THEMES.dark)).toMatchObject({ handleRing: '#1e53e5', handleCenter: '#0f0f0f', accent: '#2962ff' })
    expect(drawingInksOf(BUILT_IN_THEMES.light)).toMatchObject({ handleRing: '#2962ff', handleCenter: '#ffffff', accent: '#2962ff' })
    const d = drawingTools.create('trend_line', 't', [])! as unknown as { inks(): unknown; setInks(s: () => unknown): void }
    expect(d.inks()).toEqual(DEFAULT_INKS)
    d.setInks(() => drawingInksOf(BUILT_IN_THEMES.dark))
    expect(d.inks()).toMatchObject({ handleRing: '#1e53e5' })
  })
})
