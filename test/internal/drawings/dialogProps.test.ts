// What the settings rows of the line, shape and curve tools make a drawing paint: a line's stats
// while it is selected or always, the change counted in the symbol's smallest move, a label placed
// across and along what carries it, a vertical line's label running up it, a background switched
// off, a box's middle line in its own stroke, and a curve's extensions and ends.
import { describe, expect, it } from 'vitest'
import { drawingTools, INERT_PROPS } from '../../../src/drawings/index'
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

/** A context that records every call with the fill it was made under. */
function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
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
  return { ctx, calls }
}

const make = (type: string, points: [number, number][], props: Record<string, unknown> = {}): IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void } => {
  const d = drawingTools.create(type, 'd', points.map(([time, price]) => ({ time: time as never, price })))!
  d.applyProps(props)
  return d as never
}

const painted = (d: { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const texts = (calls: Call[]): string[] => calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]))

describe('a line’s stats', () => {
  it('stand while the line is selected, or always where the viewer asked', () => {
    const line = make('trend_line', [[100, 100], [300, 200]], { showPriceRange: true })
    expect(texts(painted(line))).toEqual([])
    line.setState('selected')
    expect(texts(painted(line))).toEqual(['+100.00'])
    line.setState('normal')
    line.applyProps({ alwaysShowStats: true })
    expect(texts(painted(line))).toEqual(['+100.00'])
  })

  it('count the change in the symbol’s smallest move, and leave the count out without one', () => {
    const line = make('info_line', [[100, 100], [300, 110]])
    expect(texts(painted(line))[0]).not.toMatch(/\+20\b/)
    line.setTickSize(0.5)
    expect(texts(painted(line))[0]).toContain('+20')
  })

  it('stand near the right end, or near the left one when auto finds no room on the right', () => {
    const line = make('trend_line', [[100, 100], [790, 100]], { showPriceRange: true, alwaysShowStats: true, statsPosition: 'auto' })
    const at = (calls: Call[]): unknown[] => calls.find((c) => c.name === 'translate')!.args
    expect(at(painted(line))[0]).toBeCloseTo(100 + 690 * 0.12)
    line.applyProps({ statsPosition: 'right' })
    expect(at(painted(line))[0]).toBeCloseTo(100 + 690 * 0.88)
  })
})

describe('a label', () => {
  it('stands across a line above, on or below it, at the end the viewer chose', () => {
    const line = make('trend_line', [[100, 100], [300, 100]], { text: 'Hi', textVAlign: 'bottom', textHAlign: 'left' })
    const calls = painted(line)
    const text = calls.find((c) => c.name === 'fillText')!
    expect(text.args.slice(1)).toEqual([0, 4])
    expect(calls.find((c) => c.name === 'translate')!.args).toEqual([100, 300])
  })

  it('stands above, inside or below a box', () => {
    const box = make('rectangle', [[100, 300], [300, 100]], { text: 'Box', textVAlign: 'top', textHAlign: 'right' })
    const text = painted(box).find((c) => c.name === 'fillText')!
    expect(text.args).toEqual(['Box', 296, 96])
  })

  it('runs up a vertical line, turned a quarter left, or reads across it', () => {
    const line = make('vertical_line', [[200, 100]], { text: 'Up' })
    expect(painted(line).find((c) => c.name === 'rotate')!.args).toEqual([-Math.PI / 2])
    line.applyProps({ textOrientation: 'horizontal', textHAlign: 'right', textVAlign: 'top' })
    const calls = painted(line)
    expect(calls.some((c) => c.name === 'rotate')).toBe(false)
    expect(calls.find((c) => c.name === 'fillText')!.args).toEqual(['Up', 204, 4])
  })

  it('is not offered on a trend angle, which reads its angle instead', () => {
    const angle = make('trend_angle', [[100, 100], [300, 200]])
    expect(INERT_PROPS.trend_angle).toEqual(expect.arrayContaining(['text', 'leftEnd', 'rightEnd']))
    expect(texts(painted(angle))).toEqual(['27°'])
  })
})

describe('a background and a middle line', () => {
  it('paint the fill only while the background is on, and the hit test follows it', () => {
    const box = make('rectangle', [[100, 300], [300, 100]])
    const fills = (calls: Call[]): number => calls.filter((c) => c.name === 'fill').length
    expect(fills(painted(box))).toBe(1)
    expect(box.testHit({ x: 200, y: 200 }, viewport)).toBe(true)
    box.applyProps({ fillBackground: false })
    expect(fills(painted(box))).toBe(0)
    expect(box.testHit({ x: 200, y: 200 }, viewport)).toBe(false)
    expect(box.style.fillOpacity).toBe(0.2)
  })

  it('draw a box’s middle line in its own color and width', () => {
    const box = make('rectangle', [[100, 300], [300, 100]], { middleLine: true, middleLineColor: '#123456', middleLineWidth: 3 })
    const { ctx } = recorder()
    const strokes: unknown[] = []
    const watched = new Proxy(ctx, {
      get: (target, p) => (p === 'stroke' ? () => strokes.push(target.strokeStyle) : Reflect.get(target, p)),
      set: (target, p, v) => Reflect.set(target, p, v),
    })
    box.paint(watched, viewport)
    expect(strokes).toContain('#123456')
  })
})

describe('a curve', () => {
  it('extends along the tangent it ends on, to the pane edge, and takes the pointer there', () => {
    // From (100, 200) bent through (200, 150) to (300, 200), the curve ends heading down and right at
    // 45 degrees, so its extension crosses (450, 350) on the way to the pane's bottom edge.
    const curve = make('curve', [[100, 200], [300, 200], [200, 250]])
    expect(curve.testHit({ x: 450, y: 350 }, viewport)).toBe(false)
    curve.applyProps({ extendRight: true })
    expect(curve.testHit({ x: 450, y: 350 }, viewport)).toBe(true)
    expect(curve.testHit({ x: 50, y: 150 }, viewport)).toBe(false)
  })

  it('heads an end with an arrow where it asks for one', () => {
    const curve = make('curve', [[100, 200], [300, 200], [200, 250]])
    const fills = (): number => painted(curve).filter((c) => c.name === 'fill').length
    const before = fills()
    curve.applyProps({ rightEnd: 'arrow', leftEnd: 'arrow' })
    expect(fills()).toBe(before + 2)
  })
})
