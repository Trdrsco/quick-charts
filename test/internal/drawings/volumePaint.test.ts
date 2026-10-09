// What an anchored VWAP, a volume profile and the range meters paint from their settings: a VWAP's
// average weighed by the source it is set to, its bands in standard deviations or percents and the
// first band's body, and its price on the scale; a profile's histogram, its values and its lines'
// prices on the scale; and a meter's stats, its span's reach, its border and its label's background.
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
const named = (calls: Call[], name: string): Call[] => calls.filter((c) => c.name === name)
/** The labels a drawing reads on the price scale. */
const scale = (d: IDrawing): readonly { visible(): boolean; text(): string }[] => (d as unknown as { priceAxisViews(): readonly { visible(): boolean; text(): string }[] }).priceAxisViews()

/** Bars every ten from time 100, their closes climbing from 100, with volume. */
const bars = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const close = 100 + i * 4
    return { time: (100 + i * 10) as never, open: close - 2, high: close + 6, low: close - 6, close, volume: 1000 }
  })
const fed = (d: IDrawing, n = 10): IDrawing => {
  ;(d as unknown as { setBarSource(s: () => ReturnType<typeof bars>): void }).setBarSource(() => bars(n))
  ;(d as unknown as { getViewport(): Viewport }).getViewport = () => viewport
  return d
}

describe('an anchored VWAP', () => {
  const vwap = (props: Record<string, unknown> = {}): IDrawing => {
    const d = fed(drawingTools.create('anchored_vwap', 'v', [{ time: 100 as never, price: 100 }])!)
    d.applyProps(props)
    return d
  }

  it('weighs the source it is set to, and draws the first band’s lines over its body', () => {
    const d = vwap()
    const calls = painted(d)
    // The anchor's dot, the first band's body, its two lines and the average.
    expect(named(calls, 'stroke').map((c) => c.strokeStyle)).toEqual(['#4caf50', '#4caf50', '#1e88e5'])
    expect(named(calls, 'fill').map((c) => c.fillStyle)).toEqual(['#1e88e5', 'rgba(76, 175, 80, 0.05)'])
    const first = (): unknown[] => named(painted(d), 'moveTo').at(-1)!.args
    expect(first()).toEqual([100, 400 - 100])
    d.applyProps({ source: 'high' })
    expect(first()).toEqual([100, 400 - 106])
  })

  it('stands its bands off by standard deviations or by percents, each calculated on its switch', () => {
    const d = vwap({ bandsOn: [true, true, false] })
    expect(named(painted(d), 'stroke')).toHaveLength(5)
    d.applyProps({ bandsMode: 'percent', bandMultipliers: [10, 20, 30], bandsOn: [true, false, false], fillBackground: false })
    // A tenth of the first bar's average either side of it.
    const starts = named(painted(d), 'moveTo').map((c) => c.args)
    expect(starts.slice(0, 2)).toEqual([
      [100, 400 - 110],
      [100, 400 - 90],
    ])
  })

  it('reads its latest average on the price scale while its price label is on', () => {
    const d = vwap()
    const label = scale(d)[0]!
    expect(label.visible()).toBe(false)
    d.applyProps({ showPriceLabel: true })
    expect(label.visible()).toBe(true)
    expect(Number(label.text())).toBeCloseTo(118, 6)
  })
})

describe('a volume profile', () => {
  const profile = (props: Record<string, unknown> = {}): IDrawing => {
    const d = fed(drawingTools.create('fixed_range_volume_profile', 'p', [
      { time: 100 as never, price: 100 },
      { time: 190 as never, price: 100 },
    ])!)
    d.applyProps({ rowSize: 4, extendRight: false, upColor: '#123456', downColor: '#654321', ...props })
    return d
  }

  it('paints its rows while its histogram is on, and writes each row’s volume while its values are', () => {
    const rows = (d: IDrawing): number => named(painted(d), 'fillRect').length
    expect(rows(profile())).toBeGreaterThan(0)
    expect(rows(profile({ showProfile: false }))).toBe(0)
    expect(named(painted(profile({ showValues: true, valueAreaVolume: 0 })), 'fillText').map((c) => c.args[0])).toContain('3.0K')
  })

  it('reads its point of control on the price scale, and its value area’s bounds while they show', () => {
    const d = profile()
    const [poc, vah] = scale(d)
    expect(poc!.visible()).toBe(true)
    expect(vah!.visible()).toBe(false)
    d.applyProps({ vahVisible: true })
    expect(vah!.visible()).toBe(true)
    d.applyProps({ showLabelsOnPriceScale: false })
    expect(poc!.visible()).toBe(false)
  })
})

describe('a range meter', () => {
  const meter = (type: string, props: Record<string, unknown> = {}): IDrawing => {
    const d = fed(drawingTools.create(type, 'm', [
      { time: 100 as never, price: 100 },
      { time: 200 as never, price: 150 },
    ])!)
    d.applyProps(props)
    return d
  }
  const label = (d: IDrawing): unknown => named(painted(d), 'fillText')[0]?.args[0]

  it('reads the stats it is set to', () => {
    expect(label(meter('price_range'))).toBe('+50.00 (+50.00%)')
    expect(label(meter('price_range', { showPercentChange: false }))).toBe('+50.00')
    expect(label(meter('date_range', { showVolume: false }))).toBe('10 bars  ·  1m 40s')
  })

  it('runs its span on to the pane’s edges on the sides it extends', () => {
    const span = (d: IDrawing): unknown[] => named(painted(d), 'fillRect')[0]!.args
    expect(span(meter('price_range'))).toEqual([100, 250, 100, 50])
    expect(span(meter('price_range', { extendLeft: true }))).toEqual([0, 250, 200, 50])
    expect(span(meter('date_range', { extendBottom: true }))).toEqual([100, 250, 100, 150])
  })

  it('backs its label while the label background is on, and borders a date and price range on its switch', () => {
    const pill = (d: IDrawing): number => named(painted(d), 'roundRect').length
    expect(pill(meter('date_range'))).toBe(1)
    expect(pill(meter('date_range', { fillLabelBackground: false }))).toBe(0)
    expect(named(painted(meter('date_and_price_range')), 'strokeRect')).toHaveLength(0)
    expect(named(painted(meter('date_and_price_range', { drawBorder: true })), 'strokeRect')).toHaveLength(1)
  })
})
