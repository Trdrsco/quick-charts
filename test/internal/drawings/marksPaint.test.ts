// @vitest-environment happy-dom
// What the marks paint, held to measured pixels. A flag mark on (563, 700) stands a one pixel grey
// pole up 20px from its point and a flag from 2px right of the pole to 19px, rows 680 to 690,
// notched 3px in at the middle of its far edge. An arrow mark's tip is on its point: an up arrow
// hangs below it, its head 21px across 12px down, its shaft 11px across on to 22px down; a down
// arrow stands above it the same way. An arrow marker from its tail on (558, 700) to its tip on
// (661, 630), 124.5px long, widens from its tail to 21px across at its head's back, 94px along,
// where its barbs stand 39px across, and closes to its tip.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing } from '../../../src/internal/drawings/index'
import { identityViewport, measureInTrebuchet, named, painted } from './measuredFont'

beforeAll(measureInTrebuchet)

const at = (type: string, ...points: [number, number][]): IDrawing => drawingTools.create(type, type, points.map(([x, y]) => ({ time: x as never, price: y })))!
const shape = (d: IDrawing): unknown[][] => {
  const calls = painted(d)
  return [named(calls, 'moveTo')[named(calls, 'moveTo').length - 1]!.args, ...named(calls, 'lineTo').map((c) => c.args)]
}
const r2 = (n: unknown): number => Math.round(Number(n) * 100) / 100

describe('a flag mark, against measured pixels', () => {
  it('stands a one pixel grey pole on its point and a notched flag at its top', () => {
    const calls = painted(at('flag', [563, 700]))
    expect([named(calls, 'moveTo')[0]!.args, named(calls, 'lineTo')[0]!.args]).toEqual([
      [563.5, 680],
      [563.5, 700],
    ])
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#808080', lineWidth: 1 })
    expect([named(calls, 'moveTo')[1]!.args, ...named(calls, 'lineTo').slice(1).map((c) => c.args)]).toEqual([
      [565, 680],
      [582, 680],
      [579, 685],
      [582, 690],
      [565, 690],
    ])
    expect(named(calls, 'fill')[0]!.fillStyle).toBe('#2962ff')
    // As measured, the far edge stands at 581.88 on row 680 and 579.27 on row 684.
    const edge = (row: number): number => 582 - 3 * (1 - Math.abs(row + 0.5 - 685) / 5)
    expect([r2(edge(680)), r2(edge(684))]).toEqual([581.7, 579.3])
  })

  it('shows a small ring on its point', () => {
    expect((at('flag', [563, 700]) as unknown as { handleShape(): string }).handleShape()).toBe('small')
  })
})

describe('the arrow marks, against measured pixels', () => {
  it('an up arrow hangs from its tip on its point: a head 21px across 12px down, a shaft 11px across on to 22px', () => {
    expect(shape(at('arrow_up', [558, 700]))).toEqual([
      [558.5, 700],
      [569, 712],
      [564, 712],
      [564, 722],
      [553, 722],
      [553, 712],
      [548, 712],
    ])
  })

  it('a down arrow stands on its tip the same way, above its point', () => {
    expect(shape(at('arrow_down', [558, 700]))).toEqual([
      [558.5, 700],
      [569, 688],
      [564, 688],
      [564, 678],
      [553, 678],
      [553, 688],
      [548, 688],
    ])
  })

  it('shows a small ring on its point and no invitation to type: its words are typed in its settings', () => {
    const d = at('arrow_up', [558, 700])
    expect((d as unknown as { handleShape(): string }).handleShape()).toBe('small')
    const hint: string[] = []
    const ctx = new Proxy({} as CanvasRenderingContext2D, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 0 }) : () => void hint.push(String(p))), set: () => true })
    d.paintTextHint(ctx, identityViewport)
    expect(hint).toEqual([])
  })

  it('keeps a format-2 save’s chevron, sized by its stroke, 2px wide here', () => {
    const save = { ...at('arrow_down', [558, 700]).toJSON(), v: 2 as const, props: { text: '' } }
    const restored = drawingTools.restore(save)!
    expect(restored.props).toMatchObject({ savedLook: {} })
    expect(shape(restored)[1]).toEqual([558 - 11, 700 - 11])
  })
})

describe('an arrow marker, against measured pixels', () => {
  it('runs from its tail at its first point to its tip at its second, widening to a broad head', () => {
    const calls = painted(at('arrow_marker', [558, 700], [661, 630]))
    expect(named(calls, 'translate')[0]!.args).toEqual([558, 700])
    expect(r2(named(calls, 'rotate')[0]!.args[0])).toBe(r2(Math.atan2(-70, 103)))
    const length = Math.hypot(103, 70)
    const outline = [named(calls, 'moveTo')[0]!.args, ...named(calls, 'lineTo').map((c) => c.args)].map((p) => p.map(r2))
    // As measured: 21px across at the head's back 94px along, its barbs 39px across, its tip at the
    // second point.
    expect(outline).toEqual([
      [0, -1],
      [r2(length * 0.755), r2(-length * 0.084)],
      [r2(length * 0.755), r2(-length * 0.157)],
      [r2(length), 0],
      [r2(length * 0.755), r2(length * 0.157)],
      [r2(length * 0.755), r2(length * 0.084)],
      [0, 1],
    ])
    expect([Math.round(length * 0.755), Math.round(length * 0.084 * 2), Math.round(length * 0.157 * 2)]).toEqual([94, 21, 39])
    expect(named(calls, 'fill')[0]!.fillStyle).toBe('#1e53e5')
  })

  it('takes a format-2 save’s first point as its tip, and keeps its look', () => {
    const save = { ...at('arrow_marker', [558, 700], [661, 630]).toJSON(), v: 2 as const, props: { text: '' } }
    const restored = drawingTools.restore(save)!
    expect(restored.anchors.map((a) => Number(a.time))).toEqual([661, 558])
    expect(restored.props).toMatchObject({ savedLook: {} })
    expect(named(painted(restored), 'translate')[0]!.args).toEqual([558, 700])
  })
})
