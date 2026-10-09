// What the pattern tools paint from their settings: the shaded legs while the background is on, and
// each vertex's letter in the drawing's label ink, size, weight and slant, in a pill that grows with
// the letters.
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
        calls.push({ name: String(p), args, fillStyle: state.get('fillStyle'), font: state.get('font') })
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

const make = (type: string): Painted => {
  const n = drawingTools.get(type)!.anchors
  return drawingTools.create(type, 'p', Array.from({ length: n }, (_, i) => ({ time: (100 + i * 60) as never, price: i % 2 ? 200 : 100 })))! as Painted
}

const painted = (d: Painted): Call[] => {
  const { ctx, calls } = recorder()
  d.paint(ctx, viewport)
  return calls
}

describe('a shaded pattern', () => {
  it('shades its legs in its background while the background is on, and not while it is off', () => {
    const xabcd = make('xabcd_pattern')
    const shades = (): unknown[] => painted(xabcd).filter((c) => c.name === 'fill' && c.fillStyle === 'rgba(41, 98, 255, 0.15)').map((c) => c.fillStyle)
    expect(shades()).toHaveLength(2)
    xabcd.applyProps({ fillBackground: false })
    expect(shades()).toEqual([])
  })
})

describe("a pattern's letters", () => {
  it('stand in the label ink, size, weight and slant, in a pill that grows with them', () => {
    const abcd = make('abcd_pattern')
    const letters = (): Call[] => painted(abcd).filter((c) => c.name === 'fillText')
    expect(letters().map((c) => c.args[0])).toEqual(['A', 'B', 'C', 'D'])
    expect(letters()[0]!.fillStyle).toBe('#ffffff')
    expect(String(letters()[0]!.font)).toMatch(/^12px /)
    const radius = (): unknown => painted(abcd).find((c) => c.name === 'arc')!.args[2]
    expect(radius()).toBe(9)
    abcd.updateStyle({ fontSize: 24, bold: true, italic: true })
    expect(String(letters()[0]!.font)).toMatch(/^italic 600 24px /)
    expect(radius()).toBe(18)
  })

  it('number three drives on its seven points, the start and the reversal left unlettered', () => {
    const drives = make('three_drives')
    expect(painted(drives).filter((c) => c.name === 'fillText').map((c) => c.args[0])).toEqual(['1', 'A', '2', 'C', '3'])
  })
})
