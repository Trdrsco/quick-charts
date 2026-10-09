// What a position's tags read: nothing at rest unless its stats always show, the stats its list
// chooses with their words or, compact, without them, and its quantity as its precision writes it;
// and the currency the symbol is quoted in reaching every drawing from the manager.
import { describe, expect, it } from 'vitest'
import { DrawingManager } from '../../../src/internal/drawings/core/manager'
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

/** The words a drawing paints. */
function words(d: IDrawing): string[] {
  const out: string[] = []
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get: (_t, p) => (p === 'measureText' ? (text: string) => ({ width: text.length * 7 }) : p === 'fillText' ? (text: string) => out.push(text) : () => undefined),
    set: () => true,
  })
  ;(d as IDrawing & { paint(ctx: CanvasRenderingContext2D, v: Viewport): void }).paint(ctx, viewport)
  return out
}

/** How many positions the tests have made, so each has an id of its own. */
let made = 0
/** A long from 100 to 300 on the pane: entry at 200, target at 300, stop at 150. */
const long =(props: Record<string, unknown> = {}): IDrawing => {
  const d = drawingTools.create('long_position', `p${made++}`, [
    { time: 100 as never, price: 200 },
    { time: 300 as never, price: 300 },
    { time: 300 as never, price: 150 },
  ])!
  d.applyProps({ showPrices: false, ...props })
  return d
}

describe('a position’s tags', () => {
  it('read only while the position is hovered or selected, unless its stats always show', () => {
    const d = long()
    expect(words(d)).toEqual([])
    d.setState('selected')
    expect(words(d)).toHaveLength(3)
    d.setState('normal')
    d.applyProps({ alwaysShowStats: true })
    expect(words(d)).toHaveLength(3)
  })

  it('read the stats the list chooses, with their words or, compact, without them', () => {
    const d = long({ alwaysShowStats: true, stats: ['tpPriceOffset', 'qty', 'slAmount'] })
    // A quarter of the 1000 account at risk over a stop 50 below the entry: five lots.
    expect(words(d)).toEqual(['Target: 100.00', 'Amount: 750.00', 'Qty: 5.00'])
    d.applyProps({ compact: true, stats: ['tpPriceOffset', 'tpPercentOffset', 'qty', 'riskRewardRatio'] })
    expect(words(d)).toEqual(['100.00 (50.00%)', '5.00 · 2.00'])
  })

  it('write the quantity as the precision says', () => {
    const d = long({ alwaysShowStats: true, stats: ['qty'], risk: 26 })
    expect(words(d)).toEqual(['Qty: 5.20'])
    d.applyProps({ qtyPrecision: '0' })
    expect(words(d)).toEqual(['Qty: 5'])
    d.applyProps({ qtyPrecision: '4' })
    expect(words(d)).toEqual(['Qty: 5.2000'])
  })
})

describe('the symbol’s currency', () => {
  it('reaches every drawing the manager holds and every drawing added later', () => {
    const manager = new DrawingManager()
    const before = long()
    manager.add(before)
    manager.setCurrencyCode('JPY')
    const after = long()
    manager.add(after)
    const code = (d: IDrawing): string | null => (d as unknown as { getCurrencyCode(): string | null }).getCurrencyCode()
    expect([code(before), code(after)]).toEqual(['JPY', 'JPY'])
    manager.setCurrencyCode(null)
    expect(code(before)).toBeNull()
  })
})
