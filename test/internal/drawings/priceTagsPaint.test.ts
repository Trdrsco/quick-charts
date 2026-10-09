// @vitest-environment happy-dom
// What a price label and a price note paint, held to measured pixels. A price label on (558, 700)
// reading 7,656.77 in bold 14px shows a body over [566, 660, 81.5, 26]: its outline [567, 661,
// 79.5, 24] rounded at 2.5 and stroked 2px, the price 10px in on a baseline 16px down; a tail from
// the point to the body's bottom from 14px to 21px right of the point, stroked so its edges pass
// 556.6 and 559.7 on the point's row; and a dot on the point. A price note from (558, 700) to
// (684, 640) runs a one pixel line between them, dots its first point, and stands a tag over
// [683, 627, 66, 26] on its second: its outline's near edge on the point, rounded at 5 and stroked
// 2px, the price in 12px 8px in on a baseline 16px down.
import { beforeAll, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'
import { identityViewport, measureInTrebuchet, named, painted } from './measuredFont'

beforeAll(measureInTrebuchet)

/** Prices read as the price scale reads them: grouped in thousands, to two places. */
const priced = <D extends IDrawing>(d: D): D => {
  ;(d as unknown as { setPriceFormatter(f: (p: number) => string): void }).setPriceFormatter((p) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  return d
}

const r2 = (n: unknown): number => Math.round(Number(n) * 100) / 100

/** A pane where a time is its own x and the price 7,656.77 stands on row 700, a tenth of a point a
 *  pixel. */
const PRICE = 7656.77
const viewport: Viewport = {
  ...identityViewport,
  yOf: (price) => 700 - (price - PRICE) * 10,
  priceAt: (y) => PRICE + (700 - y) / 10,
}
const priceOn = (y: number): number => PRICE + (700 - y) / 10

describe('a price label, against measured pixels', () => {
  const label = (): IDrawing => priced(drawingTools.create('price_label', 'l', [{ time: 558 as never, price: PRICE }])!)

  it('stands its body up and to the right of its point, its price 10px in and 16px down in bold', () => {
    const calls = painted(label(), viewport)
    expect(named(calls, 'roundRect').map((c) => c.args)).toEqual([[567, 661, 79.5, 24, 2.5]])
    // Stroked 2px, the body covers [566, 660, 81.5, 26], as measured.
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['#2962ff', 2],
      ['#2962ff', 2],
    ])
    const price = named(calls, 'fillText')[0]!
    expect([price.args, price.fillStyle, price.baseline, price.align, /^600 14px/.test(String(price.font))]).toEqual([['7,656.77', 577, 677], '#ffffff', 'alphabetic', 'left', true])
  })

  it('runs its tail from its point to the body’s bottom, 14px to 21px right of the point, and dots the point', () => {
    const calls = painted(label(), viewport)
    expect([named(calls, 'moveTo')[0]!.args, ...named(calls, 'lineTo').map((c) => c.args)]).toEqual([
      [558, 700],
      [572, 685],
      [579, 685],
    ])
    // A 2px stroke stands each edge a pixel out: on the point's row they pass 556.63 and 559.72,
    // measured at 556.55 and 559.64.
    expect([r2(558 - Math.hypot(1, 14 / 15)), r2(558 + Math.hypot(1, 21 / 15))]).toEqual([556.63, 559.72])
    expect(named(calls, 'arc').map((c) => [...c.args.slice(0, 3), c.fillStyle])).toEqual([[558, 700, 2, '#2962ff']])
  })

  it('shows a small ring on its point when selected', () => {
    expect((label() as unknown as { handleShape(): string }).handleShape()).toBe('small')
  })

  it('keeps a format-2 save’s pill centred on its point’s right, filled at 18%', () => {
    const save = { ...label().toJSON(), v: 2 as const, props: {} }
    const restored = priced(drawingTools.restore(save)!)
    expect(restored.props).toEqual({ savedLook: {} })
    expect(restored.style.fillOpacity).toBe(0.18)
    expect(named(painted(restored, viewport), 'roundRect')[0]!.args[0]).toBe(570)
  })
})

describe('a price note, against measured pixels', () => {
  const note = (to: [number, number] = [684, 640]): IDrawing =>
    priced(
      drawingTools.create('price_note', 'n', [
        { time: 558 as never, price: PRICE },
        { time: to[0] as never, price: priceOn(to[1]) },
      ])!,
    )

  it('runs a one pixel line between its points and dots its first', () => {
    const calls = painted(note(), viewport)
    expect([named(calls, 'moveTo')[0]!.args, named(calls, 'lineTo')[0]!.args]).toEqual([
      [558, 700],
      [684, 640],
    ])
    expect(named(calls, 'stroke')[0]).toMatchObject({ strokeStyle: '#2962ff', lineWidth: 1 })
    expect(named(calls, 'arc').map((c) => c.args.slice(0, 3))).toEqual([[558, 700, 2.5]])
  })

  it('stands its tag on its second point, the price 8px in and 16px down in 12px', () => {
    const calls = painted(note(), viewport)
    // Stroked 2px, the tag covers [683, 627, 66, 26], as measured.
    expect(named(calls, 'roundRect').map((c) => c.args)).toEqual([[684, 628, 64, 24, 5]])
    expect(named(calls, 'stroke')[1]).toMatchObject({ strokeStyle: '#2962ff', lineWidth: 2 })
    const price = named(calls, 'fillText')[0]!
    expect([price.args, price.fillStyle, price.baseline, /^12px/.test(String(price.font))]).toEqual([['7,656.77', 692, 644], '#ffffff', 'alphabetic', true])
  })

  it('stands its tag on the side of its second point away from its first', () => {
    expect(named(painted(note([430, 640]), viewport), 'roundRect')[0]!.args.slice(0, 2)).toEqual([366, 628])
  })

  it('shows a handle on each point and no invitation to type: its words are typed in its settings', () => {
    const d = note()
    d.setState('selected')
    expect(d.getControlPoints(viewport).map((p) => [r2(p.x), r2(p.y)])).toEqual([
      [558, 700],
      [684, 640],
    ])
    const hint: string[] = []
    const ctx = new Proxy({} as CanvasRenderingContext2D, { get: (_t, p) => (p === 'measureText' ? () => ({ width: 0 }) : () => void hint.push(String(p))), set: () => true })
    d.paintTextHint(ctx, viewport)
    expect(hint).toEqual([])
    expect(drawingTools.get('price_note')?.hasText).toBeFalsy()
  })
})
