// What a sector and a bars pattern paint from their settings: a sector's two halves in their own
// backgrounds inside its border, and a bars pattern's bars as their high-low or open-close ranges, or
// as a line through one price of each.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'

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

describe('a sector', () => {
  it('shades each half of its slice in its own background, and none while its background is off', () => {
    const d = drawingTools.create('sector', 's', [
      { time: 100 as never, price: 200 },
      { time: 300 as never, price: 200 },
      { time: 300 as never, price: 300 },
    ])!
    expect(painted(d).filter((c) => c.name === 'fill').map((c) => c.fillStyle)).toEqual(['rgba(41, 98, 255, 0.2)', 'rgba(156, 39, 176, 0.2)'])
    d.applyProps({ fillBackground: false })
    expect(painted(d).filter((c) => c.name === 'fill')).toEqual([])
    expect(painted(d).filter((c) => c.name === 'stroke')).toHaveLength(1)
  })
})

describe('a bars pattern', () => {
  /** A pattern from (100, 200) to (300, 200) over two captured bars. */
  const pattern = (mode: string): IDrawing => {
    const d = drawingTools.create('bars_pattern', 'b', [
      { time: 100 as never, price: 200 },
      { time: 300 as never, price: 200 },
    ])!
    d.applyProps({ mode, bars: [{ o: 200, h: 230, l: 190, c: 210 }, { o: 210, h: 220, l: 180, c: 190 }] })
    return d
  }
  const heights = (d: IDrawing): number[] => painted(d).filter((c) => c.name === 'fillRect').map((c) => c.args[3] as number)

  it('paints each bar as its high-low range, or as its open-close range', () => {
    expect(heights(pattern('hl'))).toEqual([40, 40])
    expect(heights(pattern('oc'))).toEqual([10, 20])
  })

  it('runs a line through one price of each bar in the line modes', () => {
    const d = pattern('high')
    const calls = painted(d)
    expect(calls.filter((c) => c.name === 'fillRect')).toEqual([])
    expect(calls.filter((c) => c.name === 'lineTo')).toHaveLength(1)
  })

  it('reads a pattern saved painting candle sticks as its high-low ranges', () => {
    const fresh = pattern('hl')
    const restored = drawingTools.restore({ ...fresh.toJSON(), props: { ...fresh.toJSON().props, mode: 'bars' } })!
    expect(restored.props.mode).toBe('hl')
  })
})
