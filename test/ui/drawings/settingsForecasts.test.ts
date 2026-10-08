// @vitest-environment happy-dom
// The forecast's, the sector's, the bars pattern's and the ghost feed's settings beyond their rows:
// the modes a bars pattern offers, a ghost feed's span in minimum ticks and its transparency, the
// sector's two backgrounds, and the look a new drawing of each starts with. Their rows themselves
// are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, pick, rig } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const control = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`[aria-label="${label}"]`)!

describe('a bars pattern', () => {
  it('paints its bars seven ways, holding their high-low ranges', () => {
    const { dialog, drawing, page } = rig('bars_pattern')
    const mode = page().querySelector<HTMLElement>('.qc-drawing-select[aria-label="Mode"]')!
    expect(choices(dialog, mode)).toEqual(['HL bars', 'OC bars', 'Line - close', 'Line - open', 'Line - high', 'Line - low', 'Line - HL/2'])
    pick(dialog, mode, 'OC bars')
    expect(drawing.props.mode).toBe('oc')
  })
})

describe('a ghost feed', () => {
  it('writes its candles’ average span in the symbol’s minimum ticks', () => {
    const { drawing, page, show } = rig('ghost_feed')
    ;(drawing as unknown as { setTickSize(tick: number): void }).setTickSize(0.5)
    drawing.applyProps({ averageHL: 10 })
    show('Inputs')
    const field = control(page(), 'Avg HL in minticks') as HTMLInputElement
    expect(field.value).toBe('20')
    field.value = '30'
    field.dispatchEvent(new Event('change'))
    expect(drawing.props.averageHL).toBe(15)
  })

  it('switches its borders and wick, and writes its transparency from its track', () => {
    const { drawing, page } = rig('ghost_feed')
    page().querySelector<HTMLInputElement>('input[aria-label="Borders"]')!.click()
    expect(drawing.props.drawBorder).toBe(false)
    const track = page().querySelector<HTMLInputElement>('.qc-drawing-band-opacity')!
    expect(track.value).toBe('50')
    track.value = '75'
    track.dispatchEvent(new Event('input'))
    expect(drawing.props.transparency).toBe(25)
  })
})

describe('a sector', () => {
  it('sets each half of its slice in a background of its own', () => {
    const { page } = rig('sector')
    expect(control(page(), 'First background')).not.toBeNull()
    expect(control(page(), 'Second background')).not.toBeNull()
  })
})

describe('what a new forecast, sector, bars pattern and ghost feed start with', () => {
  const fresh = (type: string) => drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!

  it('draws a forecast in blue at 2px, its source a tenth see-through and its verdicts green and red', () => {
    const d = fresh('forecast')
    expect([d.style.lineColor, d.style.lineWidth]).toEqual(['#2962ff', 2])
    expect(d.props).toEqual({
      sourceTextColor: '#ffffff',
      sourceBackColor: 'rgba(41, 98, 255, 0.9)',
      sourceBorderColor: '#2962ff',
      targetTextColor: '#ffffff',
      targetBackColor: '#2962ff',
      targetBorderColor: '#2962ff',
      successTextColor: '#ffffff',
      successBackColor: '#4caf50',
      failureTextColor: '#ffffff',
      failureBackColor: '#f23645',
    })
  })

  it('shades a sector blue and purple inside a grey border, and draws a bars pattern in blue', () => {
    const sector = fresh('sector')
    expect([sector.style.lineColor, sector.style.lineWidth]).toEqual(['#9c9c9c', 2])
    expect(sector.props).toEqual({ color1: 'rgba(41, 98, 255, 0.2)', color2: 'rgba(156, 39, 176, 0.2)', fillBackground: true })
    const bars = fresh('bars_pattern')
    expect(bars.style.lineColor).toBe('#2962ff')
    expect(bars.props).toMatchObject({ mode: 'hl', mirrored: false, flipped: false })
  })
})
