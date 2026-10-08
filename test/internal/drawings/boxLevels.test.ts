// What a speed resistance fan and a gann box paint from their settings: their price divisions across
// the box and time divisions down it, each division's labels on the sides their switches show, a
// fan's rays and grid, a gann box's two sets of bands and its angles, and the divisions turned about
// the box when reversed.
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
  strokeStyle?: unknown
  textAlign?: unknown
  textBaseline?: unknown
}

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), textAlign: state.get('textAlign'), textBaseline: state.get('textBaseline') })
      }
    },
    set: (_t, p, v) => {
      state.set(p, v)
      return true
    },
  })
  return { ctx, calls }
}

type Painted = IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }

/** A box tool from (100, 300) to (300, 100) on the pane, with only the divisions at these values
 *  shown on each side. */
const make = (type: string, props: Record<string, unknown> = {}, shown: number[] = [0, 0.5, 1]): Painted => {
  const d = drawingTools.create(type, 'b', [
    { time: 100 as never, price: 100 },
    { time: 300 as never, price: 300 },
  ])!
  const only = (levels: { value: number }[]) => levels.map((l) => ({ ...l, visible: shown.includes(l.value) }))
  d.applyProps({ priceLevels: only(d.props.priceLevels as { value: number }[]), timeLevels: only(d.props.timeLevels as { value: number }[]), ...props })
  return d as Painted
}

const painted = (d: Painted): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)

describe('a gann box', () => {
  it('labels its price divisions beside its left and right edges and its time divisions above and below it', () => {
    const box = make('gannbox', { fillPriceBackground: false, fillTimeBackground: false }, [0.5])
    const labels = named(painted(box), 'fillText').map((c) => [c.args[0], c.args[1], c.args[2], c.textAlign, c.textBaseline])
    expect(labels).toEqual([
      ['0.5', 96, 200, 'right', 'middle'],
      ['0.5', 304, 200, 'left', 'middle'],
      ['0.5', 200, 96, 'center', 'bottom'],
      ['0.5', 200, 304, 'center', 'top'],
    ])
    box.applyProps({ showLeftLabels: false, showBottomLabels: false })
    expect(named(painted(box), 'fillText').map((c) => c.args[1])).toEqual([304, 200])
  })

  it('shades the bands between price divisions and between time divisions, each set on its own switch', () => {
    const box = make('gannbox')
    const rects = (): unknown[] => named(painted(box), 'fillRect').map((c) => c.fillStyle)
    expect(rects()).toHaveLength(4)
    box.applyProps({ fillTimeBackground: false })
    expect(rects()).toHaveLength(2)
    box.applyProps({ fillPriceBackground: false })
    expect(rects()).toEqual([])
  })

  it('draws its angles corner to corner in their own color while they are on', () => {
    const box = make('gannbox', { fillPriceBackground: false, fillTimeBackground: false, showLeftLabels: false, showRightLabels: false, showTopLabels: false, showBottomLabels: false }, [])
    expect(named(painted(box), 'stroke')).toEqual([])
    box.applyProps({ angles: true })
    expect(named(painted(box), 'stroke').map((c) => c.strokeStyle)).toEqual(['#9c9c9c', '#9c9c9c'])
  })

  it('counts its divisions from the other corner when reversed', () => {
    const box = make('gannbox', { fillPriceBackground: false, fillTimeBackground: false, showRightLabels: false, showTopLabels: false, showBottomLabels: false }, [0.25])
    // Unreversed, a quarter is a quarter of the way from the second point to the first.
    expect(named(painted(box), 'fillText')[0]!.args[2]).toBe(150)
    box.applyProps({ reverse: true })
    expect(named(painted(box), 'fillText')[0]!.args[2]).toBe(250)
  })
})

describe('a speed resistance fan', () => {
  it('runs a ray from its first point through each division and draws its grid in its own stroke', () => {
    const fan = make('fib_speed_resist_fan', { fillBackground: false, showLeftLabels: false, showRightLabels: false, showTopLabels: false, showBottomLabels: false }, [0.5])
    const strokes = named(painted(fan), 'stroke')
    expect(strokes.map((c) => c.strokeStyle)).toEqual(['rgba(21, 56, 153, 0.8)', 'rgba(21, 56, 153, 0.8)', '#4caf50', '#4caf50'])
    fan.applyProps({ grid: false })
    expect(named(painted(fan), 'stroke')).toHaveLength(2)
  })

  it('fills the bands between neighbouring rays while the background is on', () => {
    const fan = make('fib_speed_resist_fan', { grid: false }, [0, 0.5, 1])
    expect(named(painted(fan), 'fill')).toHaveLength(4)
    fan.applyProps({ fillBackground: false })
    expect(named(painted(fan), 'fill')).toEqual([])
  })

  it('reads a fan saved with one set of levels as its price divisions', () => {
    const fresh = drawingTools.create('fib_speed_resist_fan', 'f', [{ time: 100 as never, price: 100 }, { time: 300 as never, price: 300 }])!
    // A fan saved before it divided both sides: one set of levels, its background switch under its
    // earlier name, and switches it no longer reads.
    const saved = { levels: [{ value: 0.5, visible: true }], background: false, showPrices: true, extendLeft: false }
    const restored = drawingTools.restore({ ...fresh.toJSON(), props: saved })!
    expect((restored.props.priceLevels as { value: number }[]).map((l) => l.value)).toEqual([0.5])
    expect((restored.props.timeLevels as { value: number }[]).map((l) => l.value)).toEqual([0, 0.25, 0.382, 0.5, 0.618, 0.75, 1])
    expect(restored.props.fillBackground).toBe(false)
    for (const key of ['levels', 'background', 'showPrices', 'extendLeft']) expect(key in restored.props, key).toBe(false)
  })
})
