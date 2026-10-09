// What a regression trend and the channels paint from their settings: a trend's line and bands in
// their own strokes, the bodies between them, the correlation under them, and the source it fits; a
// parallel channel's levels in their own strokes over its body; a flat top/bottom's and a disjoint
// channel's sides with their ends, their prices in a text style of their own, and every channel's
// words where they stand.
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

function painted(d: IDrawing): Call[] {
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
  ;(d as IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return calls
}
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)

describe('a regression trend', () => {
  /** A trend over eleven bars from time 100 to 200 whose closes climb ten a bar from 100, but for a
   *  bar that dips, so its bands stand off the line. */
  const trend = (props: Record<string, unknown> = {}): IDrawing => {
    const d = drawingTools.create('regression_trend', 'r', [
      { time: 100 as never, price: 100 },
      { time: 200 as never, price: 200 },
    ])!
    const bars = Array.from({ length: 11 }, (_, i) => {
      const close = 100 + i * 10 - (i === 5 ? 20 : 0)
      return { time: (100 + i * 10) as never, open: close - 5, high: close + 10, low: close - 10, close, volume: 1000 + i }
    })
    ;(d as unknown as { setBarSource(s: () => typeof bars): void }).setBarSource(() => bars)
    d.applyProps(props)
    return d
  }

  it('draws its bands and its line in their own strokes over the bodies between them', () => {
    const calls = painted(trend({ showPearsons: false }))
    expect(named(calls, 'stroke').map((c) => [c.strokeStyle, c.lineWidth])).toEqual([
      ['rgba(41, 98, 255, 0.3)', 2],
      ['rgba(41, 98, 255, 0.3)', 2],
      ['rgba(242, 54, 69, 0.3)', 1],
    ])
    const body = withAlpha('rgba(41, 98, 255, 0.3)', 0.3 * 0.3)
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual([body, body])
  })

  it('leaves out a band switched off, and the line while its switch is off', () => {
    const d = trend({ showPearsons: false, useLower: false, baseLine: false })
    expect(named(painted(d), 'stroke')).toHaveLength(1)
    expect(named(painted(d), 'fill')).toHaveLength(1)
  })

  it('reads the correlation under the lower band’s end, and fits the source it is set to', () => {
    const d = trend()
    const text = named(painted(d), 'fillText')
    expect(text).toHaveLength(1)
    expect(Number(text[0]!.args[0])).toBeGreaterThan(0.9)
    expect(text[0]!.args[1]).toBe(200)
    // Fitted through the volume, which climbs one a bar, the line runs the volume's way.
    d.applyProps({ source: 'volume', useUpper: false, useLower: false })
    const line = named(painted(d), 'moveTo').map((c) => c.args)
    expect(line[0]).toEqual([100, 400 - 1000])
  })

  it('counts a band below the line down from it, and reads one saved before its strokes as below', () => {
    const fresh = trend()
    expect(fresh.props.lowerDeviation).toBe(-2)
    const restored = drawingTools.restore({ ...fresh.toJSON(), props: { upperDeviation: 2, lowerDeviation: 3, useUpper: true, useLower: true, source: 'close' } })!
    expect(restored.props.lowerDeviation).toBe(-3)
  })
})

describe('a parallel channel', () => {
  /** A channel along (100, 300) to (300, 200) on the pane, its parallel 100 above. */
  const channel = (props: Record<string, unknown> = {}): IDrawing => {
    const d = drawingTools.create('parallel_channel', 'p', [
      { time: 100 as never, price: 100 },
      { time: 300 as never, price: 200 },
      { time: 300 as never, price: 300 },
    ])!
    d.applyProps(props)
    return d
  }

  it('draws its shown levels each in its own stroke over its body', () => {
    const calls = painted(channel())
    expect(named(calls, 'stroke').map((c) => c.lineWidth)).toEqual([2, 1, 2])
    expect(named(calls, 'moveTo').map((c) => c.args)).toEqual([
      [100, 300],
      [100, 300],
      [100, 250],
      [100, 200],
    ])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual([withAlpha('#2962ff', 0.2)])
  })

  it('writes its words above its upper side, inside it or below its lower side, at its start, middle or end', () => {
    const d = channel({ text: 'Range', fillBackground: false })
    const at = (): unknown[] => {
      const label = named(painted(d), 'fillText')[0]!
      return [label.args[1], label.args[2], label.textAlign, label.textBaseline]
    }
    expect(at()).toEqual([100, 196, 'left', 'bottom'])
    d.applyProps({ textVAlign: 'middle', textHAlign: 'center' })
    expect(at()).toEqual([200, 200, 'center', 'middle'])
    d.applyProps({ textVAlign: 'bottom', textHAlign: 'right' })
    expect(at()).toEqual([300, 204, 'right', 'top'])
  })
})

describe('a flat top/bottom and a disjoint channel', () => {
  it('read each side’s prices at its ends in a text style of their own while the prices are on', () => {
    const d = drawingTools.create('flat_top_bottom', 'f', [
      { time: 100 as never, price: 100 },
      { time: 300 as never, price: 200 },
      { time: 200 as never, price: 300 },
    ])!
    expect(named(painted(d), 'fillText')).toEqual([])
    d.applyProps({ showPrices: true, pricesColor: '#123456', pricesFontSize: 16, pricesBold: true })
    const prices = named(painted(d), 'fillText')
    expect(prices.map((c) => c.args[0])).toEqual(['100.00', '200.00', '300.00', '300.00'])
    expect(new Set(prices.map((c) => c.fillStyle))).toEqual(new Set(['#123456']))
    expect(String(prices[0]!.font)).toMatch(/^600 16px/)
  })

  it('end their sides in arrows where the ends are set to', () => {
    const d = drawingTools.create('disjoint_channel', 'd', [
      { time: 100 as never, price: 100 },
      { time: 300 as never, price: 200 },
      { time: 100 as never, price: 300 },
      { time: 300 as never, price: 350 },
    ])!
    // The body is the one fill until each side's end takes its arrow head.
    expect(named(painted(d), 'fill')).toHaveLength(1)
    d.applyProps({ rightEnd: 'arrow' })
    expect(named(painted(d), 'fill')).toHaveLength(3)
  })
})
