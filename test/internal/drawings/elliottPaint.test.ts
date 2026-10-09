// What an Elliott wave count paints from its settings: the wave through its pivots while it is on,
// and each pivot's label in the wave's color, written as the count's degree writes it: ringed, in
// parentheses or bare, in figures, roman numerals, capitals or small letters.
import { describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { IDrawing, Viewport } from '../../../src/internal/drawings/index'
import { elliottLabel } from '../../../src/internal/drawings/index'

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
}

function painted(d: IDrawing): Call[] {
  const calls: Call[] = []
  const state = new Map<string | symbol, unknown>()
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => {
      if (p === 'measureText') return (text: string) => ({ width: text.length * 7 })
      if (state.has(p)) return state.get(p)
      return (...args: unknown[]) => {
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), strokeStyle: state.get('strokeStyle') })
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

/** A count on so many pivots, zigzagging up from (100, 300) on the pane. */
const count = (type: string, pivots: number): IDrawing =>
  drawingTools.create(
    type,
    'w',
    Array.from({ length: pivots }, (_, i) => ({ time: (100 + i * 50) as never, price: 100 + (i % 2 ? 100 : 0) + i * 10 })),
  )!

describe('an Elliott wave count', () => {
  it('writes an intermediate impulse’s waves in parentheses, in the wave’s color', () => {
    const d = count('elliott_impulse_wave', 6)
    const texts = painted(d).filter((c) => c.name === 'fillText')
    expect(texts.map((c) => c.args[0])).toEqual(['(0)', '(1)', '(2)', '(3)', '(4)', '(5)'])
    expect(new Set(texts.map((c) => c.fillStyle))).toEqual(new Set(['#3d85c6']))
  })

  it('rings a primary count’s labels and leaves a minor count’s bare', () => {
    const d = count('elliott_correction', 4)
    d.applyProps({ degree: 'primary', showWave: false })
    const primary = painted(d)
    expect(primary.filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual(['0', 'A', 'B', 'C'])
    expect(primary.filter((c) => c.name === 'arc')).toHaveLength(4)
    d.applyProps({ degree: 'minor' })
    expect(painted(d).filter((c) => c.name === 'arc')).toEqual([])
  })

  it('runs the wave through its pivots only while the wave is on', () => {
    const d = count('elliott_triangle_wave', 6)
    expect(painted(d).filter((c) => c.name === 'lineTo')).toHaveLength(5)
    d.applyProps({ showWave: false })
    expect(painted(d).filter((c) => c.name === 'lineTo')).toEqual([])
  })

  it('writes each degree’s numbers and letters as the degree writes them', () => {
    const write = (degree: string): string[] =>
      ['1', '4', 'A', 'W'].map((base) => {
        const { text, ringed } = elliottLabel(base, degree as never)
        return ringed ? `[${text}]` : text
      })
    expect(write('supermillennium')).toEqual(['[I]', '[IV]', '[A]', '[W]'])
    expect(write('supercycle')).toEqual(['(I)', '(IV)', '(a)', '(w)'])
    expect(write('cycle')).toEqual(['I', 'IV', 'a', 'w'])
    expect(write('primary')).toEqual(['[1]', '[4]', '[A]', '[W]'])
    expect(write('intermediate')).toEqual(['(1)', '(4)', '(A)', '(W)'])
    expect(write('minute')).toEqual(['[i]', '[iv]', '[a]', '[w]'])
    expect(write('minuette')).toEqual(['(i)', '(iv)', '(a)', '(w)'])
    expect(write('minuscule')).toEqual(['1', '4', 'a', 'w'])
  })
})
