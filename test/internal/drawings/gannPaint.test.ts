// What a gann square and a gann fan paint from their settings: a square's grid at its fifths, its fans
// from the corner it counts from out to its far sides and its arcs about that corner, the bands
// between its arcs, all inside the square, and its ranges and ratio under it; a square held to its
// price per bar; and a fan's rays, each in its own stroke, the bands between them and their ratios.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'
import { withAlpha } from '../../../src/internal/drawings/render/canvas'

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
  lineWidth?: unknown
  textAlign?: unknown
  textBaseline?: unknown
  font?: unknown
}

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({
          name: String(p),
          args,
          fillStyle: state.get('fillStyle'),
          strokeStyle: state.get('strokeStyle'),
          lineWidth: state.get('lineWidth'),
          textAlign: state.get('textAlign'),
          textBaseline: state.get('textBaseline'),
          font: state.get('font'),
        })
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
type Line = { visible: boolean; color: string; width: number }

const painted = (d: Painted): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)

/** A square tool from (100, 300) to (300, 100) on the pane, 200 across and 200 up: its unit is 40. */
const square = (type: string, props: Record<string, unknown> = {}): Painted => {
  const d = drawingTools.create(type, 'g', [
    { time: 100 as never, price: 100 },
    { time: 300 as never, price: 300 },
  ])!
  d.applyProps(props)
  return d as Painted
}
/** A square's set of lines, every one off. */
const off = (d: IDrawing, key: string): Line[] => (d.props[key] as Line[]).map((l) => ({ ...l, visible: false }))

describe('a gann square', () => {
  it('draws its grid at its fifths, across it and down it, each line in its own stroke', () => {
    const d = square('gannbox_square', { fillBackground: false, showLabels: false })
    d.applyProps({ fans: off(d, 'fans'), arcs: off(d, 'arcs') })
    const calls = painted(d)
    const strokes = named(calls, 'stroke')
    expect(strokes.map((c) => c.strokeStyle)).toEqual(['#808080', '#ff9800', '#00bcd4', '#4caf50', '#089981', '#808080'].flatMap((c) => [c, c]))
    const starts = named(calls, 'moveTo').map((c) => c.args)
    expect(starts.filter((_, i) => i % 2 === 0).map(([, y]) => y)).toEqual([300, 260, 220, 180, 140, 100])
    expect(starts.filter((_, i) => i % 2 === 1).map(([x]) => x)).toEqual([100, 140, 180, 220, 260, 300])
    expect(named(calls, 'rect').map((c) => c.args)).toEqual([[100, 100, 200, 200]])
    expect(named(calls, 'clip')).toHaveLength(1)
  })

  it('runs its fans from the corner it counts from out to its far sides', () => {
    const d = square('gannbox_fixed', { fillBackground: false })
    d.applyProps({ levels: off(d, 'levels'), arcs: off(d, 'arcs') })
    const ends = (): unknown[][] => named(painted(d), 'lineTo').map((c) => c.args)
    // Shown at first: 2x1, 1x1 and 1x2.
    expect(ends()).toEqual([
      [300, 200],
      [300, 100],
      [200, 100],
    ])
    d.applyProps({ reverse: true })
    expect(named(painted(d), 'moveTo').map((c) => c.args)).toEqual([
      [300, 100],
      [300, 100],
      [300, 100],
    ])
    expect(ends()).toEqual([
      [100, 200],
      [100, 300],
      [200, 300],
    ])
  })

  it('draws its arcs about that corner as long as their ratios, and fills the bands between them', () => {
    const d = square('gannbox_fixed')
    d.applyProps({ levels: off(d, 'levels'), fans: off(d, 'fans') })
    const calls = painted(d)
    const strokes = named(calls, 'stroke').length
    expect(strokes).toBe(11)
    const radii = [1, Math.SQRT2, 1.5, 2, Math.hypot(2, 1), 3, Math.hypot(3, 1), 4, Math.hypot(4, 1), 5, Math.hypot(5, 1)]
    const arcs = named(calls, 'ellipse').slice(-11)
    arcs.forEach((c, i) => {
      expect(c.args.slice(0, 2)).toEqual([100, 300])
      expect(c.args[2] as number).toBeCloseTo(40 * radii[i]!, 6)
      expect(c.args[3] as number).toBeCloseTo(40 * radii[i]!, 6)
    })
    const colors = ['#ff9800', '#ff9800', '#ff9800', '#00bcd4', '#00bcd4', '#4caf50', '#4caf50', '#089981', '#089981', '#2962ff', '#2962ff']
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(colors.map((c) => withAlpha(c, 0.2)))
    d.applyProps({ fillBackground: false })
    expect(named(painted(d), 'fill')).toEqual([])
  })

  it('reads its price and bar ranges and their ratio under it, in its labels’ size, weight and slant', () => {
    const d = square('gannbox_square')
    const text = (): Call[] => named(painted(d), 'fillText')
    expect(text().map((c) => [c.args[0], c.args[1], c.args[2], c.textAlign, c.textBaseline, c.fillStyle])).toEqual([['200.00, 20 bars, 10', 200, 304, 'center', 'top', '#808080']])
    d.updateStyle({ bold: true, fontSize: 16 })
    expect(String(text()[0]!.font)).toMatch(/^600 16px/)
    d.applyProps({ showLabels: false })
    expect(text()).toEqual([])
  })

  it('holds its second corner at its price per bar, taken from the pane when it is first drawn', () => {
    const d = drawingTools.create('gannbox_square', 'g', [
      { time: 100 as never, price: 100 },
      { time: 100 as never, price: 100 },
    ])!
    ;(d as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    // Drawn out 20 bars and some way up: the pane shows 200 price over the 200px those bars span.
    d.updateAnchor(1, { time: 300 as never, price: 150 })
    expect(d.props.scaleRatio).toBe(10)
    expect(d.anchors[1]).toEqual({ time: 300, price: 300 })
    d.applyProps({ scaleRatio: 5 })
    expect(d.anchors[1]!.price).toBe(200)
    // Dragged back 10 bars and below the first corner, it turns down at the same ratio.
    d.updateAnchor(1, { time: 200 as never, price: 0 })
    expect(d.anchors[1]).toEqual({ time: 200, price: 50 })
  })

  it('reads a square saved before it held its own lines with its factory lines and its background switch', () => {
    const fresh = square('gannbox_square')
    const saved = { levels: [{ value: 0, visible: true }, { value: 0.5, visible: true }], showLabels: false, background: false }
    const restored = drawingTools.restore({ ...fresh.toJSON(), props: saved })!
    expect((restored.props.levels as Line[]).map((l) => l.color)).toEqual(['#808080', '#ff9800', '#00bcd4', '#4caf50', '#089981', '#808080'])
    expect(restored.props).toMatchObject({ showLabels: false, fillBackground: false, scaleRatio: null })
    expect('background' in restored.props).toBe(false)
  })
})

describe('a gann fan', () => {
  const fan = (props: Record<string, unknown> = {}): Painted => {
    const d = drawingTools.create('gannbox_fan', 'f', [
      { time: 100 as never, price: 100 },
      { time: 200 as never, price: 200 },
    ])!
    d.applyProps(props)
    return d as Painted
  }

  it('draws each ray in its own stroke and labels it with its ratio', () => {
    const d = fan({ fillBackground: false })
    const calls = painted(d)
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#ff9800', '#089981', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63', '#f23645'])
    expect(named(calls, 'fillText').map((c) => c.args[0])).toEqual(['1/8', '1/4', '1/3', '1/2', '1/1', '2/1', '3/1', '4/1', '8/1'])
    const levels = (d.props.levels as { value: number; width?: number }[]).map((l) => (l.value === 1 ? { ...l, width: 4 } : l))
    d.applyProps({ levels, showLabels: false })
    expect(named(painted(d), 'stroke').map((c) => c.lineWidth)).toEqual([2, 2, 2, 2, 4, 2, 2, 2, 2])
    expect(named(painted(d), 'fillText')).toEqual([])
  })

  it('fills the bands between neighbouring rays, each in the color of the steeper ray', () => {
    const d = fan({ showLabels: false })
    const fills = named(painted(d), 'fill').map((c) => c.fillStyle)
    expect(fills).toEqual(['#089981', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#9c27b0', '#e91e63', '#f23645'].map((c) => withAlpha(c, 0.2)))
  })
})
