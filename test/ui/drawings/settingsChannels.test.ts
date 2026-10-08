// @vitest-environment happy-dom
// The regression trend's and the channels' settings beyond their rows: the sources a trend fits, the
// prices a channel reads and the switch they wait on, where a channel's words stand, a parallel
// channel's offset, and the look a new drawing of each starts with. Their rows themselves are pinned
// in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, pick, rig } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const select = (page: HTMLElement, label: string): HTMLElement[] => [...page.querySelectorAll<HTMLElement>(`.qc-drawing-select[aria-label="${label}"]`)]
const control = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`[aria-label="${label}"]`)!

describe('a regression trend', () => {
  it('fits through any of nine sources, holding the close, and writes its inputs', () => {
    const { dialog, drawing, page, show } = rig('regression_trend')
    show('Inputs')
    const [source] = select(page(), 'Source')
    expect(choices(dialog, source!)).toEqual(['Open', 'High', 'Low', 'Close', 'Volume', '(H + L)/2', '(H + L + C)/3', '(O + H + L + C)/4', '(H + L + C + C)/4'])
    expect(source!.textContent).toBe('Close')
    pick(dialog, source!, '(H + L + C + C)/4')
    expect(drawing.props.source).toBe('hlcc4')
    control(page(), 'Use Lower Deviation').click()
    expect(drawing.props.useLower).toBe(false)
  })

  it('switches its line and each band, keeping their strokes', () => {
    const { drawing, page } = rig('regression_trend')
    page().querySelector<HTMLInputElement>('input[aria-label="Base"]')!.click()
    expect(drawing.props.baseLine).toBe(false)
    expect(drawing.props.baseColor).toBe('rgba(242, 54, 69, 0.3)')
    page().querySelector<HTMLInputElement>('input[aria-label="Pearson\'s R"]')!.click()
    expect(drawing.props.showPearsons).toBe(false)
  })
})

describe('a channel', () => {
  it('waits to offer its prices’ size, weight and slant until its prices are on', () => {
    const { dialog, drawing, page } = rig('flat_top_bottom')
    const size = (): HTMLButtonElement => select(page(), 'Font size')[0] as HTMLButtonElement
    expect(size().disabled).toBe(true)
    expect((control(page(), 'Bold') as HTMLButtonElement).disabled).toBe(true)
    page().querySelector<HTMLInputElement>('input[aria-label="Prices"]')!.click()
    expect(drawing.props.showPrices).toBe(true)
    expect(size().disabled).toBe(false)
    pick(dialog, size(), '16')
    expect(drawing.props.pricesFontSize).toBe(16)
    control(page(), 'Bold').click()
    expect(drawing.props.pricesBold).toBe(true)
  })

  it('stands its words above it, inside it or below it, at its start, middle or end', () => {
    const { dialog, page, show } = rig('disjoint_channel')
    show('Text')
    const [across, along] = select(page(), 'Text alignment')
    expect(choices(dialog, across!)).toEqual(['Top', 'Inside', 'Bottom'])
    expect(choices(dialog, along!)).toEqual(['Left', 'Center', 'Right'])
  })

  it('reads a parallel channel’s offset from its baseline at its third point, and moves the parallel to an offset typed', () => {
    const { drawing, page, show } = rig('parallel_channel')
    show('Coordinates')
    const field = control(page(), 'Price offset') as HTMLInputElement
    // The rig's points climb one a minute: the baseline through the first two reaches 102 at the
    // third point's time, where the third point stands.
    expect(field.value).toBe('0')
    field.value = '5'
    field.dispatchEvent(new Event('change'))
    expect(drawing.anchors[2]!.price).toBe(107)
  })
})

describe('what a new trend and channel start with', () => {
  const fresh = (type: string) => drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!

  it('fits a trend through the close, its bands two deviations either side, its line dashed', () => {
    expect(fresh('regression_trend').props).toEqual({
      upperDeviation: 2,
      lowerDeviation: -2,
      useUpper: true,
      useLower: true,
      source: 'close',
      baseLine: true,
      baseColor: 'rgba(242, 54, 69, 0.3)',
      baseWidth: 1,
      baseStyle: 'dashed',
      upLine: true,
      upColor: 'rgba(41, 98, 255, 0.3)',
      upWidth: 2,
      upStyle: 'solid',
      downLine: true,
      downColor: 'rgba(41, 98, 255, 0.3)',
      downWidth: 2,
      downStyle: 'solid',
      extendLines: false,
      showPearsons: true,
      bodyColor: null,
    })
  })

  it('draws each channel in its hue at 2px over a body at a fifth, its words 14px', () => {
    const hues: Record<string, string> = { parallel_channel: '#2962ff', flat_top_bottom: '#ff9800', disjoint_channel: '#089981' }
    for (const [type, hue] of Object.entries(hues)) {
      const d = fresh(type)
      expect([d.style.lineColor, d.style.lineWidth, d.style.fillColor, d.style.fillOpacity, d.style.textColor, d.style.fontSize], type).toEqual([hue, 2, hue, 0.2, hue, 14])
      expect(d.props, type).toMatchObject({ text: '', textVAlign: 'top', textHAlign: 'left', fillBackground: true, extendLeft: false, extendRight: false })
    }
    for (const type of ['flat_top_bottom', 'disjoint_channel']) {
      expect(fresh(type).props, type).toMatchObject({ leftEnd: 'normal', rightEnd: 'normal', showPrices: false, pricesColor: hues[type], pricesFontSize: 12, pricesBold: false, pricesItalic: false })
    }
    const levels = fresh('parallel_channel').props.levels as { value: number; visible: boolean; width: number; style: string }[]
    expect(levels.map((l) => [l.value, l.visible, l.width, l.style])).toEqual([
      [-0.25, false, 1, 'solid'],
      [0, true, 2, 'solid'],
      [0.25, false, 1, 'solid'],
      [0.5, true, 1, 'dashed'],
      [0.75, false, 1, 'solid'],
      [1, true, 2, 'solid'],
      [1.25, false, 1, 'solid'],
    ])
  })
})
