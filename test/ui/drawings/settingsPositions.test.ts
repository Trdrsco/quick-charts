// @vitest-environment happy-dom
// The positions' settings beyond their rows: the risk's units, a level written in ticks or as a
// price, the ways a quantity is written, the stats the tags read, and the look a new position starts
// with. Their rows themselves are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { anchors, choices, pick, rig } from './settingsRig'
import { drawingTools } from '../../../src/drawings/index'

afterEach(() => {
  document.body.replaceChildren()
})

const select = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`.qc-drawing-select[aria-label="${label}"]`)!
const fields = (page: HTMLElement, label: string): HTMLInputElement[] => [...page.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`)]
const type = (field: HTMLInputElement, value: string): void => {
  field.value = value
  field.dispatchEvent(new Event('change'))
}

describe('a position', () => {
  it('offers its risk as a percent or an amount in the symbol’s currency', () => {
    const plain = rig('long_position')
    plain.show('Inputs')
    expect(choices(plain.dialog, select(plain.page(), 'Risk unit'))).toEqual(['%', 'Amount'])
    document.body.replaceChildren()
    const quoted = rig('short_position')
    ;(quoted.drawing as unknown as { setCurrencyCode(code: string): void }).setCurrencyCode('EUR')
    quoted.show('Inputs')
    expect(choices(quoted.dialog, select(quoted.page(), 'Risk unit'))).toEqual(['%', 'EUR'])
    pick(quoted.dialog, select(quoted.page(), 'Risk unit'), 'EUR')
    expect(quoted.drawing.props.riskDisplay).toBe('money')
  })

  it('moves its target and its stop by ticks from the entry, or to a price', () => {
    const { drawing, page, show } = rig('long_position')
    show('Inputs')
    // Without a host tick a tick is a cent: the target stands a whole price above the entry.
    const [targetTicks, stopTicks] = fields(page(), 'Ticks')
    expect(targetTicks!.value).toBe('100')
    type(targetTicks!, '50')
    expect(drawing.anchors[1]!.price).toBe(100.5)
    // A long's stop stands below its entry, whichever side it was on.
    type(stopTicks!, '30')
    expect(drawing.anchors[2]!.price).toBeCloseTo(99.7, 10)
    type(fields(page(), 'Entry price')[0]!, '90')
    expect(drawing.anchors[0]!.price).toBe(90)
  })

  it('writes its quantity as it reads best, in whole lots, or to one to ten decimals', () => {
    const { dialog, drawing, page, show } = rig('long_position')
    show('Inputs')
    expect(choices(dialog, select(page(), 'QTY precision'))).toEqual(['Default', 'Integer', '1 decimal', ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `${n} decimals`)])
    pick(dialog, select(page(), 'QTY precision'), '3 decimals')
    expect(drawing.props.qtyPrecision).toBe('3')
  })

  it('ticks a stat into its list in the list’s order, keeping the list open', () => {
    const { dialog, drawing, page } = rig('long_position')
    const stats = select(page(), 'Stats')
    stats.click()
    const items = [...dialog.parentElement!.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    expect(items.map((i) => i.textContent)).toEqual(['TP price offset', 'TP percent offset', 'TP tick offset', 'TP amount', 'TP PL', 'Open/closed PL', 'Qty', 'Risk/reward ratio', 'SL price offset', 'SL percent offset', 'SL tick offset', 'SL amount', 'SL PL'])
    items[4]!.click()
    items[0]!.click()
    expect((drawing.props.stats as string[]).slice(0, 4)).toEqual(['tpPercentOffset', 'tpTickOffset', 'tpAmount', 'tpPL'])
    expect(dialog.parentElement!.querySelector('[role="menu"]')).not.toBeNull()
  })
})

describe('what a new position starts with', () => {
  it('draws its lines grey at 1px, its words white at 12px, and reads all but the levels’ P&L', () => {
    for (const kind of ['long_position', 'short_position']) {
      const d = drawingTools.create(kind, 'x', anchors(3))!
      expect([d.style.lineColor, d.style.lineWidth, d.style.textColor, d.style.fontSize], kind).toEqual(['#808080', 1, '#ffffff', 12])
      expect(d.props.stats, kind).toEqual(['tpPriceOffset', 'tpPercentOffset', 'tpTickOffset', 'tpAmount', 'openClosePL', 'qty', 'riskRewardRatio', 'slPriceOffset', 'slPercentOffset', 'slTickOffset', 'slAmount'])
      expect([d.props.profitColor, d.props.stopColor], kind).toEqual(['rgba(8, 153, 129, 0.2)', 'rgba(242, 54, 69, 0.2)'])
    }
  })
})
