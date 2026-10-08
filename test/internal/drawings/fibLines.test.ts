// What the fibs whose levels stand one to a line paint from their settings: each level in a stroke of
// its own, a time zone's labels where its Labels row puts them, the bands between levels at their
// opacity, a trend line through the points in its own stroke, a circle fib's labels as percents, an
// arc fib's full circles, a wedge's rays as its trend line, and a pitchfan's median on its own.
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
  lineWidth?: unknown
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
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle'), lineWidth: state.get('lineWidth'), textAlign: state.get('textAlign'), textBaseline: state.get('textBaseline') })
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

const painted = (d: Painted): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)

describe('a fib time zone', () => {
  it('labels each line with its multiple after it at the foot of the pane, or where the Labels row puts it', () => {
    const zone = make('fib_timezone', [[100, 100], [140, 100]], {}, [0, 1])
    const labels = named(painted(zone), 'fillText')
    expect(labels.map((c) => c.args)).toEqual([
      ['0', 104, 396],
      ['1', 144, 396],
    ])
    expect([labels[0]!.textAlign, labels[0]!.textBaseline]).toEqual(['left', 'bottom'])
    zone.applyProps({ labelsHAlign: 'left', labelsVAlign: 'top' })
    const moved = named(painted(zone), 'fillText')[0]!
    expect(moved.args).toEqual(['0', 96, 4])
    expect([moved.textAlign, moved.textBaseline]).toEqual(['right', 'top'])
    zone.applyProps({ showLevels: false })
    expect(named(painted(zone), 'fillText')).toEqual([])
  })

  it('draws each line in its own stroke, and fills the bands between lines while the background is on', () => {
    const zone = make('fib_timezone', [[100, 100], [140, 100]], { showLevels: false }, [0, 1, 2])
    zone.applyProps({ levels: (zone.props.levels as { value: number }[]).map((l) => (l.value === 1 ? { ...l, width: 4 } : l)) })
    const strokes = named(painted(zone), 'stroke')
    expect(strokes.map((c) => c.lineWidth)).toEqual([2, 4, 2])
    expect(named(painted(zone), 'fillRect')).toEqual([])
    zone.applyProps({ fillBackground: true })
    expect(named(painted(zone), 'fillRect').map((c) => c.fillStyle)).toEqual(['rgba(41, 98, 255, 0.2)', 'rgba(41, 98, 255, 0.2)'])
  })
})

describe('a trend-based fib time', () => {
  it('draws its trend line through its three points, dashed in its own color, and not while switched off', () => {
    const time = make('fib_trend_time', [[100, 100], [140, 200], [180, 150]], { showLevels: false, fillBackground: false }, [])
    const strokes = named(painted(time), 'stroke')
    expect(strokes).toHaveLength(2)
    expect(strokes.every((c) => c.strokeStyle === '#808080')).toBe(true)
    time.applyProps({ trendLine: false })
    expect(named(painted(time), 'stroke')).toEqual([])
  })
})

describe('a fib circles and arcs', () => {
  it('labels a circle fib as ratios or percents', () => {
    const circles = make('fib_circles', [[100, 200], [200, 200]], { fillBackground: false }, [0.618])
    expect(named(painted(circles), 'fillText')[0]!.args[0]).toBe('0.618')
    circles.applyProps({ coeffsAsPercents: true })
    expect(named(painted(circles), 'fillText')[0]!.args[0]).toBe('61.8%')
  })

  it('bows an arc fib back toward its origin, or completes each arc into a circle', () => {
    const arcs = make('fib_speed_resist_arcs', [[100, 200], [200, 200]], { fillBackground: false, showLevels: false, trendLine: false }, [1])
    const arc = (): unknown[] => named(painted(arcs), 'arc')[0]!.args
    expect(arc()).toEqual([200, 200, 100, Math.PI / 2, (3 * Math.PI) / 2])
    arcs.applyProps({ fullCircles: true })
    expect(arc()).toEqual([200, 200, 100, 0, Math.PI * 2])
  })
})

describe('a fib wedge and a pitchfan', () => {
  it('draws a wedge its two rays as its trend line, and not while switched off', () => {
    const wedge = make('fib_wedge', [[100, 200], [200, 200], [100, 100]], { fillBackground: false, showLevels: false }, [])
    expect(named(painted(wedge), 'stroke').filter((c) => c.strokeStyle === '#808080')).toHaveLength(2)
    wedge.applyProps({ trendLine: false })
    expect(named(painted(wedge), 'stroke')).toEqual([])
  })

  it('draws a pitchfan its median in its own stroke and two rays a level', () => {
    const fan = make('pitchfan', [[100, 200], [300, 300], [300, 100]], { fillBackground: false }, [1])
    const strokes = named(painted(fan), 'stroke')
    expect(strokes.map((c) => c.strokeStyle)).toEqual(['#2962ff', '#2962ff', '#f23645'])
  })
})
