// What a retracement, an extension and a fib channel paint from their settings: each level's label
// reading its ratio or percent and its price where the Labels row puts it, a level's own words where
// the Text row puts them, the bands between levels at their opacity, the trend line through the
// swing points in its own stroke, and levels that divide the swing by log price over a log scale.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'

/** A pane 800 by 400 where a time is its own x and a price stands that far up from the bottom. */
const linear: Viewport = {
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

/** A context that records every call with the state it was made under. */
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

/** A drawing on points given as [time, price], with only the levels at the given values shown. */
const make = (type: string, points: [number, number][], props: Record<string, unknown> = {}, shown?: number[]): Painted => {
  const d = drawingTools.create(type, 'd', points.map(([time, price]) => ({ time: time as never, price })))!
  if (shown) d.applyProps({ levels: (d.props.levels as { value: number }[]).map((l) => ({ ...l, visible: shown.includes(l.value) })) })
  d.applyProps(props)
  return d as Painted
}

const painted = (d: Painted, viewport: Viewport = linear): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const texts = (calls: Call[]): Call[] => calls.filter((c) => c.name === 'fillText')

describe('a fib level label', () => {
  it('reads the ratio and the price before the levels, on each level line, by default', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], {}, [0.5])
    const [label] = texts(painted(fib))
    expect(label!.args).toEqual(['0.5 (150.00)', 96, 250])
    expect([label!.textAlign, label!.textBaseline]).toEqual(['right', 'middle'])
  })

  it('stands after the levels or at their middle, and above or below the line, where the Labels row puts it', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], { labelsHAlign: 'right', labelsVAlign: 'top' }, [0.5])
    const [after] = texts(painted(fib))
    expect(after!.args).toEqual(['0.5 (150.00)', 304, 247])
    expect([after!.textAlign, after!.textBaseline]).toEqual(['left', 'bottom'])
    fib.applyProps({ labelsHAlign: 'center', labelsVAlign: 'bottom' })
    const [middle] = texts(painted(fib))
    expect(middle!.args).toEqual(['0.5 (150.00)', 200, 253])
    expect([middle!.textAlign, middle!.textBaseline]).toEqual(['center', 'top'])
  })

  it('reads the ratio as a percent, or leaves the ratio or the price out', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], { coeffsAsPercents: true }, [0.236])
    expect(texts(painted(fib))[0]!.args[0]).toBe('23.6% (176.40)')
    fib.applyProps({ showPrices: false })
    expect(texts(painted(fib))[0]!.args[0]).toBe('23.6%')
    fib.applyProps({ showLevels: false })
    expect(texts(painted(fib))).toEqual([])
  })
})

describe("a fib level's own words", () => {
  it('stand on its line where the Text row puts them, while the Text row is on', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], { showLevels: false, showPrices: false }, [0.5])
    fib.applyProps({ levels: (fib.props.levels as { value: number }[]).map((l) => (l.value === 0.5 ? { ...l, text: 'Half' } : l)) })
    const [words] = texts(painted(fib))
    expect(words!.args).toEqual(['Half', 200, 250])
    expect([words!.textAlign, words!.textBaseline]).toEqual(['center', 'middle'])
    fib.applyProps({ textHAlign: 'left', textVAlign: 'top' })
    expect(texts(painted(fib))[0]!.args).toEqual(['Half', 104, 247])
    fib.applyProps({ showText: false })
    expect(texts(painted(fib))).toEqual([])
  })
})

describe('the bands between fib levels', () => {
  it('fill at their opacity in the color of the level that closes them, and not while switched off', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], { showLevels: false, showPrices: false }, [0, 0.5, 1])
    const fills = (calls: Call[]): unknown[] => calls.filter((c) => c.name === 'fill').map((c) => c.fillStyle)
    expect(fills(painted(fib))).toEqual(['rgba(76, 175, 80, 0.2)', 'rgba(128, 128, 128, 0.2)'])
    fib.applyProps({ backgroundOpacity: 0.5 })
    expect(fills(painted(fib))[0]).toBe('rgba(76, 175, 80, 0.5)')
    fib.applyProps({ fillBackground: false })
    expect(fills(painted(fib))).toEqual([])
  })
})

describe('a fib trend line', () => {
  it('runs through the swing points in its own color and dashes, and is gone while switched off', () => {
    const fib = make('fib_trend_ext', [[100, 100], [200, 200], [300, 150]], { showLevels: false, showPrices: false }, [])
    const strokes = (calls: Call[]): Call[] => calls.filter((c) => c.name === 'stroke')
    const trend = strokes(painted(fib))
    expect(trend).toHaveLength(2)
    expect(trend.every((c) => c.strokeStyle === '#808080')).toBe(true)
    const dash = painted(fib).filter((c) => c.name === 'setLineDash').pop()!
    expect((dash.args[0] as number[]).length).toBe(2)
    fib.applyProps({ trendLine: false })
    expect(strokes(painted(fib))).toEqual([])
  })
})

describe('fib levels over a log scale', () => {
  it('divide the swing by log price while asked to and the scale is logarithmic, by price otherwise', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 400]], { showLevels: false }, [0.5])
    const logScale: Viewport = { ...linear, logScale: true }
    const price = (viewport: Viewport): unknown => texts(painted(fib, viewport))[0]!.args[0]
    expect(price(logScale)).toBe('(250.00)')
    fib.applyProps({ levelsOnLogScale: true })
    expect(price(linear)).toBe('(250.00)')
    expect(price(logScale)).toBe('(200.00)')
  })

  it('run the other way when reversed', () => {
    const fib = make('fib_retracement', [[100, 100], [300, 200]], { showLevels: false, reverse: true }, [0.236])
    expect(texts(painted(fib))[0]!.args[0]).toBe('(123.60)')
  })
})
