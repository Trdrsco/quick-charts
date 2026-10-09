// What a pitchfork paints from its settings: each shown pair of lines in its own stroke on both sides
// of the median, the median in a stroke of its own from where its construction starts it, the bands
// between neighbouring pairs in the outer pair's color, and every line run back past the start when
// its lines extend.
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
}

function recorder(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), lineWidth: state.get('lineWidth') })
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

/** A fork whose handle starts at (100, 200) on the pane and whose tines end at (300, 100) and
 *  (300, 300), so its middle stands at (300, 200). */
const fork = (type = 'pitchfork', props: Record<string, unknown> = {}): Painted => {
  const d = drawingTools.create(type, 'p', [
    { time: 100 as never, price: 200 },
    { time: 300 as never, price: 300 },
    { time: 300 as never, price: 100 },
  ])!
  d.applyProps(props)
  return d as Painted
}

const painted = (d: Painted): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)
/** Where each stroked line starts, in the order they are drawn. */
const starts = (calls: Call[]): unknown[][] => named(calls, 'moveTo').map((c) => c.args)

describe('a pitchfork', () => {
  it('draws each shown pair in its own stroke on both sides of the median, and the median in its own', () => {
    const d = fork('pitchfork', { fillBackground: false })
    const strokes = named(painted(d), 'stroke')
    expect(strokes.map((c) => c.strokeStyle)).toEqual(['#089981', '#089981', '#2962ff', '#2962ff', '#f23645'])
    const levels = (d.props.levels as { value: number; width?: number }[]).map((l) => (l.value === 1 ? { ...l, width: 4 } : l))
    d.applyProps({ levels, medianWidth: 3 })
    expect(named(painted(d), 'stroke').map((c) => c.lineWidth)).toEqual([2, 2, 4, 4, 3])
  })

  it('fills the bands between neighbouring pairs in the outer pair’s color, at the bands’ opacity', () => {
    const d = fork()
    const fills = (): unknown[] => named(painted(d), 'fill').map((c) => c.fillStyle)
    const inner = withAlpha('#089981', 0.2)
    const outer = withAlpha('#2962ff', 0.2)
    expect(fills()).toEqual([inner, outer, inner, outer])
    d.applyProps({ backgroundOpacity: 0.5 })
    expect(fills()[1]).toBe(withAlpha('#2962ff', 0.5))
    d.applyProps({ fillBackground: false })
    expect(fills()).toEqual([])
  })

  it('starts its median where its construction does, switched in place', () => {
    const d = fork('pitchfork', { fillBackground: false })
    const median = (): unknown[] => starts(painted(d)).at(-1)!
    expect(median()).toEqual([100, 200])
    d.applyProps({ variant: 'schiff' })
    expect(median()).toEqual([200, 150])
    d.applyProps({ variant: 'modified_schiff' })
    expect(median()).toEqual([100, 150])
    d.applyProps({ variant: 'inside' })
    expect(median()).toEqual([300, 200])
  })

  it('runs every line back past the fork’s start while its lines extend', () => {
    const d = fork('pitchfork', { fillBackground: false })
    expect(starts(painted(d))[0]).toEqual([300, 250])
    d.applyProps({ extendLines: true })
    const lines = starts(painted(d))
    expect(lines[0]).toEqual([-900, 250])
    expect(lines.at(-1)).toEqual([-900, 200])
  })

  it('reads a fork saved with its background switch under its earlier name', () => {
    const fresh = fork('schiff_pitchfork')
    const saved = { variant: 'schiff', extendLines: false, levels: [{ value: 0.5, visible: true }, { value: 1, visible: true }], background: false }
    const restored = drawingTools.restore({ ...fresh.toJSON(), props: saved })!
    expect(restored.props.fillBackground).toBe(false)
    expect('background' in restored.props).toBe(false)
    expect(restored.props.medianColor).toBe('#f23645')
  })
})
