// @vitest-environment happy-dom
// The anchored VWAP's, the volume profiles' and the range meters' settings beyond their rows: the
// choices their lists offer, what their switches and fields write, and the look a new drawing of
// each starts with. Their rows themselves are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, pick, rig } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const select = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`.qc-drawing-select[aria-label="${label}"]`)!
const input = (page: HTMLElement, label: string): HTMLInputElement => page.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!

describe('an anchored VWAP', () => {
  it('stands its bands off by deviations or percents, calculates each on its switch, and weighs any of nine sources', () => {
    const { dialog, drawing, page, show } = rig('anchored_vwap')
    show('Inputs')
    expect(choices(dialog, select(page(), 'Bands Calculation Mode'))).toEqual(['Standard Deviation', 'Percentage'])
    pick(dialog, select(page(), 'Bands Calculation Mode'), 'Percentage')
    expect(drawing.props.bandsMode).toBe('percent')
    input(page(), 'Bands Multiplier #2').click()
    expect(drawing.props.bandsOn).toEqual([true, true, false])
    const field = page().querySelectorAll<HTMLInputElement>('input[aria-label="Bands Multiplier #3"]')[1]!
    field.value = '4'
    field.dispatchEvent(new Event('change'))
    expect(drawing.props.bandMultipliers).toEqual([1, 2, 4])
    expect(choices(dialog, select(page(), 'Source'))).toHaveLength(9)
  })

  it('switches each band line, keeping its stroke', () => {
    const { drawing, page } = rig('anchored_vwap')
    input(page(), 'Upper band #2').click()
    expect((drawing.props.upperBands as { visible: boolean; color: string }[])[1]).toMatchObject({ visible: false, color: '#808000' })
    input(page(), 'Price label').click()
    expect(drawing.props.showPriceLabel).toBe(true)
  })
})

describe('a volume profile', () => {
  it('lays its rows out by count or by ticks, reads them up and down, totalled or as their delta, and grows from either edge', () => {
    const { dialog, drawing, page, show } = rig('anchored_volume_profile')
    show('Inputs')
    expect(choices(dialog, select(page(), 'Rows Layout'))).toEqual(['Number Of Rows', 'Ticks Per Row'])
    expect(choices(dialog, select(page(), 'Volume'))).toEqual(['Up/Down', 'Total', 'Delta'])
    show('Style')
    expect(choices(dialog, select(page(), 'Placement'))).toEqual(['Right', 'Left'])
    input(page(), 'VAH').click()
    expect(drawing.props.vahVisible).toBe(true)
    input(page(), 'Values').click()
    expect(drawing.props.showValues).toBe(true)
  })
})

describe('a range meter', () => {
  it('offers the stats its axes measure, and runs a date range on to the top or bottom', () => {
    const date = rig('date_range')
    const stats = date.page().querySelector<HTMLElement>('.qc-drawing-select[aria-label="Stats"]')!
    expect(choices(date.dialog, stats)).toEqual(['Bars range', 'Date/time range', 'Volume'])
    expect(choices(date.dialog, select(date.page(), 'Extend'))).toEqual(['Extend top', 'Extend bottom'])
    document.body.replaceChildren()
    const price = rig('price_range')
    expect(choices(price.dialog, select(price.page(), 'Stats'))).toEqual(['Price range', 'Percent change', 'Change in pips'])
    expect(choices(price.dialog, select(price.page(), 'Extend'))).toEqual(['Extend left', 'Extend right'])
  })

  it('writes its label’s size and its label background’s switch', () => {
    const { dialog, drawing, page } = rig('date_and_price_range')
    pick(dialog, select(page(), 'Font size'), '16')
    expect(drawing.props.labelFontSize).toBe(16)
    input(page(), 'Label background').click()
    expect(drawing.props.fillLabelBackground).toBe(false)
    input(page(), 'Border').click()
    expect(drawing.props.drawBorder).toBe(true)
  })
})

describe('what a new VWAP, profile and meter start with', () => {
  const fresh = (type: string) => drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!

  it('weighs a VWAP over the typical price, its first band at one deviation over a faint body', () => {
    const d = fresh('anchored_vwap')
    expect([d.style.lineColor, d.style.lineWidth, d.style.fillColor, d.style.fillOpacity]).toEqual(['#1e88e5', 1, '#4caf50', 0.05])
    expect(d.props).toMatchObject({ source: 'hlc3', bandsMode: 'stdev', bandMultipliers: [1, 2, 3], bandsOn: [true, false, false], fillBackground: true, showPriceLabel: false })
    expect((d.props.upperBands as { color: string }[]).map((l) => l.color)).toEqual(['#4caf50', '#808000', '#00897b'])
  })

  it('opens a fixed profile on two hundred rows holding the whole range, and an anchored one on twenty-four holding seventy percent', () => {
    expect(fresh('fixed_range_volume_profile').props).toMatchObject({ rowSize: 200, valueAreaVolume: 100, placement: 'left', extendRight: true, pocColor: 'rgba(244, 67, 54, 0.35)', boxColor: 'rgba(55, 166, 239, 0)' })
    expect(fresh('anchored_volume_profile').props).toMatchObject({ rowSize: 24, valueAreaVolume: 70, placement: 'right', pocColor: '#dbdbdb', pocWidth: 2, showLabelsOnPriceScale: true })
  })

  it('reads every stat a meter measures, its label white over a dark pill', () => {
    expect(fresh('price_range').props).toMatchObject({ showPriceRange: true, showPercentChange: true, showPipsChange: true, labelColor: '#ffffff', labelFontSize: 12, fillLabelBackground: true, labelBackgroundColor: 'rgba(46, 46, 46, 0.4)' })
    expect(fresh('date_range').props).toMatchObject({ showBarsRange: true, showDateTimeRange: true, showVolume: true, extendTop: false, extendBottom: false })
    expect(fresh('date_and_price_range').props).toMatchObject({ drawBorder: false, borderColor: '#2962ff', borderWidth: 1 })
    expect([fresh('date_range').style.lineColor, fresh('date_range').style.fillOpacity, fresh('date_range').style.textColor]).toEqual(['#2962ff', 0.15, '#2962ff'])
  })
})
