// @vitest-environment happy-dom
// The leveled tools' settings beyond their rows: the choices each of their lists offers and which
// one it holds, what their controls write to the drawing, and the levels, strokes and labels a new
// drawing of each tool starts with. Their rows themselves are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, chosen, pick, rig } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const control = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`[aria-label="${label}"]`)!
/** A list button by its name: a row whose label is a checkbox names the checkbox the same. */
const list = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`.qc-drawing-select[aria-label="${label}"]`)!

/** The twenty-four levels a retracement, an extension and a fib channel start with: value, color,
 *  whether it is shown. */
const FIB_LEVELS: [number, string, boolean][] = [
  [0, '#808080', true],
  [0.236, '#f23645', true],
  [0.382, '#ff9800', true],
  [0.5, '#4caf50', true],
  [0.618, '#089981', true],
  [0.786, '#00bcd4', true],
  [1, '#808080', true],
  [1.618, '#2962ff', true],
  [2.618, '#f23645', true],
  [3.618, '#9c27b0', true],
  [4.236, '#e91e63', true],
  [1.272, '#ff9800', false],
  [1.414, '#f23645', false],
  [2.272, '#ff9800', false],
  [2.414, '#4caf50', false],
  [2, '#089981', false],
  [3, '#00bcd4', false],
  [3.272, '#808080', false],
  [3.414, '#2962ff', false],
  [4, '#f23645', false],
  [4.272, '#9c27b0', false],
  [4.414, '#e91e63', false],
  [4.618, '#ff9800', false],
  [4.764, '#089981', false],
]

describe('a fib retracement, extension and channel', () => {
  it('offer the levels line in four thicknesses and three styles, holding 2px and solid', () => {
    const { dialog, page } = rig('fib_retracement')
    const thickness = control(page(), 'Thickness')
    const style = control(page(), 'Line style')
    expect(choices(dialog, thickness)).toEqual(['Thickness 1px', 'Thickness 2px', 'Thickness 3px', 'Thickness 4px'])
    expect(chosen(dialog, thickness)).toBe('Thickness 2px')
    expect(choices(dialog, style)).toEqual(['Line', 'Dashed line', 'Dotted line'])
    expect(chosen(dialog, style)).toBe('Line')
    // The faces are marks: the chosen thickness as a bar, the chosen style as its line.
    expect(thickness.textContent).toBe('')
    expect((thickness.querySelector('.qc-drawing-thickness-bar') as HTMLElement).style.height).toBe('2px')
    expect(style.querySelector('svg')).not.toBeNull()
  })

  it('offer their extensions, label readings, label places and sizes in order', () => {
    const { dialog, page } = rig('fib_retracement')
    const lists = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select:not(.qc-drawing-select--mark)')]
    expect(lists.map((b) => b.getAttribute('aria-label'))).toEqual(['Extend', 'Levels', 'Labels', 'Labels', 'Text', 'Text', 'Font size'])
    expect(choices(dialog, lists[0]!)).toEqual(['Extend lines left', 'Extend lines right'])
    expect(choices(dialog, lists[1]!)).toEqual(['Values', 'Percents'])
    expect(choices(dialog, lists[2]!)).toEqual(['Left', 'Center', 'Right'])
    expect(choices(dialog, lists[3]!)).toEqual(['Top', 'Middle', 'Bottom'])
    expect(choices(dialog, lists[4]!)).toEqual(['Left', 'Center', 'Right'])
    expect(choices(dialog, lists[5]!)).toEqual(['Top', 'Middle', 'Bottom'])
    expect(choices(dialog, lists[6]!)).toEqual(['8', '10', '11', '12', '14', '16', '18', '20', '22', '24'])
    const channel = rig('fib_channel')
    expect(choices(channel.dialog, list(channel.page(), 'Extend'))).toEqual(['Extend left', 'Extend right'])
  })

  it('write the levels stroke, the label reading and places, and the size', () => {
    const { dialog, drawing, page } = rig('fib_retracement')
    pick(dialog, control(page(), 'Thickness'), 'Thickness 4px')
    expect(drawing.style.lineWidth).toBe(4)
    pick(dialog, control(page(), 'Line style'), 'Dotted line')
    expect(drawing.style.lineStyle).toBe('dotted')
    pick(dialog, list(page(), 'Levels'), 'Percents')
    expect(drawing.props.coeffsAsPercents).toBe(true)
    const [along, across] = [...page().querySelectorAll<HTMLElement>('[aria-label="Labels"]')]
    pick(dialog, along!, 'Right')
    pick(dialog, across!, 'Top')
    expect(drawing.props).toMatchObject({ labelsHAlign: 'right', labelsVAlign: 'top' })
    pick(dialog, list(page(), 'Font size'), '16')
    expect(drawing.style.fontSize).toBe(16)
  })

  it('show the one color as a split well while the levels differ, and as the color they share', () => {
    const { drawing, page, show } = rig('fib_channel')
    const well = (): HTMLElement => control(page(), 'Use one color')
    const face = (): string => well().querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.getPropertyValue('--qcd-swatch')
    expect(well().dataset.qcMixed).toBe('true')
    expect(face()).toBe('#f7525f')
    drawing.applyProps({ levels: (drawing.props.levels as { color: string }[]).map((l) => ({ ...l, color: '#123456' })) })
    // The page reads the drawing again when it is next shown.
    show('Coordinates')
    show('Style')
    expect(well().dataset.qcMixed).toBeUndefined()
    expect(face()).toBe('#123456')
  })

  it('write the bands opacity quietly as the track moves, and switch the bands off keeping it', () => {
    const { drawing, page } = rig('fib_retracement')
    const track = page().querySelector<HTMLInputElement>('.qc-drawing-band-opacity')!
    expect(track.value).toBe('20')
    track.value = '45'
    track.dispatchEvent(new Event('input'))
    expect(drawing.props.backgroundOpacity).toBe(0.45)
    expect(track.isConnected).toBe(true)
    control(page(), 'Background').click()
    expect(drawing.props).toMatchObject({ fillBackground: false, backgroundOpacity: 0.45 })
  })

  it('hold the log levels switch off until the price scale is logarithmic', () => {
    const { page } = rig('fib_retracement')
    const toggle = [...page().querySelectorAll<HTMLElement>('label.qc-drawing-toggle')].find((x) => x.textContent === 'Fib levels based on log scale')!
    expect(toggle.querySelector('input')!.disabled).toBe(true)
  })
})

/** The look and setup each leveled tool opens with. */
describe('what a new leveled drawing starts with', () => {
  const fresh = (type: string) => drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!

  it('draws a retracement, an extension and a channel on the twenty-four levels, at 2px with 12px labels', () => {
    for (const type of ['fib_retracement', 'fib_trend_ext', 'fib_channel']) {
      const d = fresh(type)
      expect((d.props.levels as { value: number; color: string; visible: boolean }[]).map((l) => [l.value, l.color, l.visible]), type).toEqual(FIB_LEVELS)
      expect([d.style.lineWidth, d.style.lineStyle, d.style.fontSize], type).toEqual([2, 'solid', 12])
      expect(d.props, type).toMatchObject({
        extendLeft: false,
        extendRight: false,
        showLevels: true,
        coeffsAsPercents: false,
        showPrices: true,
        labelsHAlign: 'left',
        labelsVAlign: 'middle',
        fillBackground: true,
        backgroundOpacity: 0.2,
      })
    }
    for (const type of ['fib_retracement', 'fib_trend_ext']) {
      expect(fresh(type).props, type).toMatchObject({
        trendLine: true,
        trendLineColor: '#808080',
        trendLineWidth: 2,
        trendLineStyle: 'dashed',
        reverse: false,
        showText: true,
        textHAlign: 'center',
        textVAlign: 'middle',
        levelsOnLogScale: false,
      })
    }
    expect('trendLine' in fresh('fib_channel').props).toBe(false)
  })

  it('keeps the bands of a fib saved with the background switch under its earlier name', () => {
    const saved = fresh('fib_retracement').toJSON()
    const { fillBackground: _drop, ...props } = saved.props as Record<string, unknown>
    void _drop
    const restored = drawingTools.restore({ ...saved, props: { ...props, background: false } })!
    expect(restored.props.fillBackground).toBe(false)
    expect('background' in restored.props).toBe(false)
  })
})
