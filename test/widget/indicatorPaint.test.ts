// @vitest-environment happy-dom
// The default study color. Minting is the ONE moment a color is dealt: the palette rotates so two
// studies added one after another never share a hue, and a restore, a hide, a theme change or a
// recompute carries whatever the instances already hold. An explicit color and a pinned saved
// default both win and take no slot.
import { describe, expect, it } from 'vitest'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createChartI18n } from '../../src/i18n'
import { createPriceFormatter } from '../../src/priceFormatter'
import { INDICATOR_PALETTE } from '../../src/builtInIndicators'
import { attachIndicatorsPlane, createIndicatorCatalog, withHidden } from '../../src/widget/indicators'
import type { IndicatorDefinition, IndicatorInstance } from '../../src/widget/options'
import type { CanvasTheme } from '../../src/theme/renderer'
import { fakeRenderer } from './rendererFake'

const builtIn = (id: string): IndicatorDefinition => BUILT_IN_INDICATORS.find((definition) => definition.id === id)!

function indicatorPlane(canvasNeutral = '#888') {
  let neutral = canvasNeutral
  const plane = attachIndicatorsPlane({
    chart: fakeRenderer().chart,
    candleSeries: () => null,
    bars: () => [],
    i18n: createChartI18n(),
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    formatKey: () => 'test',
    minMove: () => 0.01,
    canvas: () => ({ neutral }) as unknown as CanvasTheme,
    disposed: () => false,
    onChips: () => undefined,
    onEvent: () => undefined,
    catalog: createIndicatorCatalog(),
  })
  return { plane, retheme: (next: string) => (neutral = next) }
}

const colorsOf = (plane: ReturnType<typeof indicatorPlane>['plane']): (string | undefined)[] => plane.list().map((i) => i.color)

describe('the default study color', () => {
  it('deals successive palette colors to repeated adds and wraps after ten', () => {
    const { plane } = indicatorPlane()
    for (let index = 0; index < 11; index++) {
      plane.add({ id: `sma-${index}`, definition: builtIn(index % 2 === 0 ? 'sma' : 'ema') })
    }
    const colors = colorsOf(plane)
    expect(colors.slice(0, 10)).toEqual([...INDICATOR_PALETTE])
    expect(new Set(colors.slice(0, 10)).size).toBe(10)
    // The eleventh wraps to the first rather than running out.
    expect(colors[10]).toBe(INDICATOR_PALETTE[0])
    plane.destroy()
  })

  it('gives every chart its own cursor, so two independent planes both open on the first color', () => {
    const first = indicatorPlane()
    const second = indicatorPlane()
    first.plane.add({ id: 'a', definition: builtIn('sma') })
    first.plane.add({ id: 'b', definition: builtIn('ema') })
    second.plane.add({ id: 'c', definition: builtIn('sma') })
    expect(colorsOf(first.plane)).toEqual([INDICATOR_PALETTE[0], INDICATOR_PALETTE[1]])
    expect(colorsOf(second.plane)).toEqual([INDICATOR_PALETTE[0]])
    first.plane.destroy()
    second.plane.destroy()
  })

  it('keeps saved colors on a restore and deals none for them', () => {
    const { plane } = indicatorPlane()
    plane.restore([
      { id: 'sma-1', definition: 'sma', color: '#0f0f0f' },
      { id: 'ema-1', definition: 'ema' },
    ])
    expect(colorsOf(plane)).toEqual(['#0f0f0f', undefined])
    // The restore consumed no slot: the next mint still opens on the first palette color.
    plane.add({ id: 'rsi-1', definition: builtIn('rsi') })
    expect(plane.list().find((i) => i.id === 'rsi-1')!.color).toBe(INDICATOR_PALETTE[0])
    plane.destroy()
  })

  it('does not recolor a study on hide, show or a theme change', () => {
    const { plane, retheme } = indicatorPlane()
    plane.add({ id: 'sma-1', definition: builtIn('sma') })
    plane.add({ id: 'ema-1', definition: builtIn('ema') })
    const before = colorsOf(plane)
    plane.toggleHidden('sma-1')
    plane.toggleHidden('sma-1')
    retheme('#123456')
    plane.recompute()
    expect(colorsOf(plane)).toEqual(before)
    plane.destroy()
  })

  it('lets an explicit color and a pinned saved default win, and neither takes a palette slot', () => {
    const { plane } = indicatorPlane()
    plane.add({ id: 'explicit', definition: builtIn('sma'), color: '#abcdef' })
    plane.add({ id: 'pinned', definition: builtIn('ema'), overrides: { plots: { ema: { color: '#fedcba' } } } })
    plane.add({ id: 'dealt', definition: builtIn('sma') })
    expect(colorsOf(plane)).toEqual(['#abcdef', undefined, INDICATOR_PALETTE[0]])
    expect(plane.list()[1]!.overrides?.plots?.ema?.color).toBe('#fedcba')
    plane.destroy()
  })

  it('treats a re-add of a held id as an edit and keeps its dealt color', () => {
    const { plane } = indicatorPlane()
    plane.add({ id: 'sma-1', definition: builtIn('sma') })
    const dealt = plane.list()[0]!.color
    const edited: IndicatorInstance = withHidden(plane.list()[0]!, true)
    const { color: _color, ...bare } = edited
    plane.add(bare)
    expect(plane.list()[0]!.color).toBe(dealt)
    plane.destroy()
  })
})
