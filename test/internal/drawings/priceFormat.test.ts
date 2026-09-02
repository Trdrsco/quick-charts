import { describe, expect, it } from 'vitest'
import type { Time } from 'lightweight-charts'
import { DrawingManager } from '../src/core/manager'
import { moneyText } from '../src/core/money'
import forecastingSrc from '../src/tools/forecasting.ts?raw'
import { toolRegistry } from '../src/registry'
import type { Anchor } from '../src/core/types'

// Every price a drawing writes comes through the host-injected price-format port: the symbol's
// own formatter, carrying the market's declared precision. The package has no magnitude rule of
// its own, so a Treasury label reads in thirty-seconds and a satoshi label in eight decimals
// because the host said so, never because of the size of the number.

/** A Treasury's formatter, as a host builds it from `{ pricescale: 32, minmov: 1, fractional }`. */
const thirtySeconds = (price: number): string => {
  const total = Math.round(price * 32)
  const whole = Math.floor(total / 32)
  return `${whole}'${String(total - whole * 32).padStart(2, '0')}`
}

const line = (id: string, price: number) => toolRegistry.create('horizontal_line', id, [{ time: 1_700_000_000 as Time, price }] as Anchor[])!
const axisText = (drawing: ReturnType<typeof line>): string => drawing.priceAxisViews()[0]!.text()

describe('the price-format port', () => {
  it('a drawing label writes through the injected formatter', () => {
    const d = line('zb', 110.5)
    d.setPriceFormatter(thirtySeconds)
    expect(axisText(d)).toBe("110'16")
  })

  it('the manager broadcasts the port to every drawing it holds and to every drawing added later', () => {
    const manager = new DrawingManager()
    const before = line('before', 110.5)
    manager.add(before)
    manager.setPriceFormatter(thirtySeconds)
    const after = line('after', 111.25)
    manager.add(after)
    expect(axisText(before)).toBe("110'16")
    expect(axisText(after)).toBe("111'08")
  })

  it('without a host formatter a drawing writes the declared stand-in, the same for every magnitude', () => {
    // Cents for an unhosted drawing is a stated choice, not a rule read off the price: a large
    // price and a small one get the same width.
    expect(axisText(line('big', 68284.3))).toBe('68284.30')
    expect(axisText(line('small', 0.5))).toBe('0.50')
    expect(axisText(line('tiny', 0.00001234))).toBe('0.00')
  })

  it('a null port returns the drawing to the stand-in', () => {
    const d = line('zb', 110.5)
    d.setPriceFormatter(thirtySeconds)
    d.setPriceFormatter(null)
    expect(axisText(d)).toBe('110.50')
  })
})

describe('money is not a price', () => {
  it('the money stand-in writes two decimals for every magnitude, signed', () => {
    expect(moneyText(500)).toBe('500.00')
    expect(moneyText(-12.345)).toBe('-12.35')
    expect(moneyText(0.004)).toBe('0.00')
  })

  it('a position tool writes its P&L and amounts as money and its level offsets through the price port', () => {
    expect(forecastingSrc).toContain('moneyText(s.pnl)')
    expect(forecastingSrc).toContain('moneyText(s.amountAtTp)')
    expect(forecastingSrc).toContain('moneyText(s.amountAtSl)')
    expect(forecastingSrc).not.toContain('this.formatPrice(s.pnl)')
    expect(forecastingSrc).not.toContain('this.formatPrice(s.amountAt')
    expect(forecastingSrc).toContain('return `${this.formatPrice(offset)} (${percent.toFixed(2)}%)${ticks}`')
  })
})
