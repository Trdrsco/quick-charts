// What a brush and a path paint from their settings: a brush's background only on its switch, and an
// arrow at each end of a stroke that its ends say is one.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { Anchor, IDrawing, Viewport } from '../../../src/internal/drawings/index'

/** A pane 800 by 400 where a time is its own x and a price stands that far up from the bottom. */
const viewport: Viewport = {
  width: 800,
  height: 400,
  xOf: (time) => Number(time),
  yOf: (price) => 400 - price,
  timeAt: (x) => x as never,
  priceAt: (y) => 400 - y,
  barsBetween: (a, b) => (Number(b) - Number(a)) / 10,
  logicalOf: (time) => Number(time) / 10,
  timeOfLogical: (logical) => (logical * 10) as never,
}

interface Call {
  name: string
  args: unknown[]
  fillStyle?: unknown
}

function painted(d: IDrawing): Call[] {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle') })
      }
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  ;(d as IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return calls
}
const at = (time: number, price: number): Anchor => ({ time: time as never, price })
const stroke = (type: string, props: Record<string, unknown> = {}): IDrawing => {
  const d = drawingTools.create(type, type, [at(100, 100), at(150, 200), at(200, 150)])!
  d.applyProps(props)
  return d
}
/** The arrow heads a stroke paints: each a filled triangle with its tip first. */
const tips = (d: IDrawing): unknown[] => {
  const calls = painted(d)
  return calls.flatMap((c, i) => (c.name === 'moveTo' && calls[i + 3]?.name === 'closePath' ? [c.args] : []))
}

describe('a brush', () => {
  it('fills the area its stroke closes only while its background is on', () => {
    const fills = (d: IDrawing): unknown[] => painted(d).filter((c) => c.name === 'fill').map((c) => c.fillStyle)
    expect(fills(stroke('brush'))).toEqual([])
    expect(fills(stroke('brush', { fillBackground: true }))).toEqual(['rgba(0, 188, 212, 0.5)'])
  })

  it('heads its ends with arrows as they say', () => {
    expect(tips(stroke('brush'))).toEqual([])
    expect(tips(stroke('brush', { leftEnd: 'arrow', rightEnd: 'arrow' }))).toEqual([
      [100, 300],
      [200, 250],
    ])
  })
})

describe('a path', () => {
  it('heads its last point with an arrow at first, and its first point on its left end', () => {
    expect(tips(stroke('path'))).toEqual([[200, 250]])
    expect(tips(stroke('path', { leftEnd: 'arrow', rightEnd: 'normal' }))).toEqual([[100, 300]])
  })
})
