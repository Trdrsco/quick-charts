// @vitest-environment happy-dom
// The leveled tools' settings beyond their rows: the choices each of their lists offers and which
// one it holds, what their controls write to the drawing, and the levels, strokes and labels a new
// drawing of each tool starts with. Their rows themselves are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import type { Viewport } from '../../../src/internal/drawings/index'
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

describe('a fib whose levels stand one to a line', () => {
  it('offers a time zone its labels along and across its lines, holding right and bottom', () => {
    const { dialog, page } = rig('fib_timezone')
    const [along, across] = [...page().querySelectorAll<HTMLElement>('.qc-drawing-select[aria-label="Labels"]')]
    expect(choices(dialog, along!)).toEqual(['Left', 'Center', 'Right'])
    expect(choices(dialog, across!)).toEqual(['Top', 'Middle', 'Bottom'])
    expect([along!.textContent, across!.textContent]).toEqual(['Right', 'Bottom'])
  })

  it('wells each level in its own stroke, and greys a level switched off in place', () => {
    const { drawing, page } = rig('fib_trend_time')
    const well = control(page(), 'Level 3 color')
    expect(well.querySelector('.qc-drawing-stroke')).not.toBeNull()
    expect(well.dataset.qcDim).toBe('true')
    control(page(), 'Level 3').click()
    expect((drawing.props.levels as { visible: boolean }[])[2]!.visible).toBe(true)
    expect(control(page(), 'Level 3 color').dataset.qcDim).toBe('false')
  })
})

describe('a speed resistance fan and a gann box', () => {
  it('name each side’s divisions by their side', () => {
    const { page } = rig('gannbox')
    expect(control(page(), 'Price level 1')).not.toBeNull()
    expect(control(page(), 'Time level 7 value')).not.toBeNull()
    expect(control(page(), 'Time level 7 color')).not.toBeNull()
  })

  it('show one color for both sides, the color they share or the split well', () => {
    const { drawing, page, show } = rig('fib_speed_resist_fan')
    expect(control(page(), 'Use one color').dataset.qcMixed).toBe('true')
    const recolor = (key: string): void => drawing.applyProps({ [key]: (drawing.props[key] as { color: string }[]).map((l) => ({ ...l, color: '#123456' })) })
    recolor('priceLevels')
    show('Coordinates')
    show('Style')
    expect(control(page(), 'Use one color').dataset.qcMixed).toBe('true')
    recolor('timeLevels')
    show('Coordinates')
    show('Style')
    expect(control(page(), 'Use one color').dataset.qcMixed).toBeUndefined()
  })
})

describe('a pitchfork', () => {
  it('offers its four constructions, holds its own, and switches to another in place', () => {
    const { dialog, drawing, page } = rig('schiff_pitchfork')
    expect(choices(dialog, list(page(), 'Style'))).toEqual(['Original', 'Schiff', 'Modified Schiff', 'Inside'])
    expect(chosen(dialog, list(page(), 'Style'))).toBe('Schiff')
    pick(dialog, list(page(), 'Style'), 'Inside')
    expect(drawing.props.variant).toBe('inside')
    expect(list(page(), 'Style').textContent).toBe('Inside')
  })

  it('extends its lines on its switch and wells its median and each pair in a stroke of its own', () => {
    const { drawing, page } = rig('pitchfork')
    control(page(), 'Extend lines').click()
    expect(drawing.props.extendLines).toBe(true)
    expect(control(page(), 'Median').querySelector('.qc-drawing-stroke')).not.toBeNull()
    expect(control(page(), 'Level 3 color').dataset.qcDim).toBe('false')
    expect(control(page(), 'Level 1 color').dataset.qcDim).toBe('true')
  })
})

describe('a gann square and a gann fan', () => {
  it('name each line’s switch and stroke by its place or its ratio, and switch a line on in place', () => {
    const { drawing, page } = rig('gannbox_square')
    expect(control(page(), 'Level 0')).not.toBeNull()
    expect(control(page(), 'Arc 1.5x0 color')).not.toBeNull()
    expect(control(page(), 'Fan 8x1 color').dataset.qcDim).toBe('true')
    control(page(), 'Fan 8x1').click()
    expect((drawing.props.fans as { visible: boolean }[])[0]!.visible).toBe(true)
    expect(control(page(), 'Fan 8x1 color').dataset.qcDim).toBe('false')
  })

  it('show one color for every line of a square, the split well while they differ', () => {
    const { drawing, page, show } = rig('gannbox_fixed')
    expect(control(page(), 'Use one color').dataset.qcMixed).toBe('true')
    for (const key of ['levels', 'fans', 'arcs']) drawing.applyProps({ [key]: (drawing.props[key] as { color: string }[]).map((l) => ({ ...l, color: '#123456' })) })
    show('Coordinates')
    show('Style')
    expect(control(page(), 'Use one color').dataset.qcMixed).toBeUndefined()
  })

  it('offer a square its price per bar, and its ranges’ switch, size, weight and slant', () => {
    const { dialog, drawing, page } = rig('gannbox_square')
    // Not yet drawn on a pane, the square has no price per bar to show.
    expect((control(page(), 'Price/bar ratio') as HTMLInputElement).value).toBe('')
    expect(choices(dialog, list(page(), 'Font size'))).toEqual(['8', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '32', '40'])
    pick(dialog, list(page(), 'Font size'), '16')
    expect(drawing.style.fontSize).toBe(16)
    control(page(), 'Bold').click()
    expect(drawing.style.bold).toBe(true)
    control(page(), 'Ranges and ratio').click()
    expect(drawing.props.showLabels).toBe(false)
  })

  it('write a square’s price per bar with seven decimals', () => {
    const { drawing, page } = rig('gannbox_square')
    drawing.applyProps({ scaleRatio: 33.360546 })
    control(page(), 'Reverse').click()
    expect((control(page(), 'Price/bar ratio') as HTMLInputElement).value).toBe('33.3605460')
  })

  it('hold a square’s second corner on the price per bar typed, and keep it as the corner is dragged', () => {
    const { drawing, page } = rig('gannbox_square')
    // A pane where a bar is a minute wide and a price stands that far up from the bottom.
    const viewport: Viewport = {
      width: 800,
      height: 400,
      xOf: (time) => Number(time) - 900,
      yOf: (price) => 400 - price,
      timeAt: (x) => (x + 900) as never,
      priceAt: (y) => 400 - y,
      barsBetween: (a, b) => (Number(b) - Number(a)) / 60,
      logicalOf: (time) => Number(time) / 60,
      timeOfLogical: (logical) => (logical * 60) as never,
    }
    ;(drawing as unknown as { getViewport(): Viewport }).getViewport = () => viewport
    const field = control(page(), 'Price/bar ratio') as HTMLInputElement
    field.value = '2'
    field.dispatchEvent(new Event('change'))
    // One bar out from the first corner, the second stands two above it.
    expect(drawing.props.scaleRatio).toBe(2)
    expect(drawing.anchors[1]).toEqual({ time: 1060, price: 102 })
    // Dragged as the layer drags a corner, three bars out and below the first corner, it stands six
    // below it: the drag keeps the ratio.
    drawing.updateAnchor(1, { time: 1180 as never, price: 50 })
    expect(drawing.anchors[1]).toEqual({ time: 1180, price: 94 })
    expect(drawing.props.scaleRatio).toBe(2)
  })

  it('name a fan’s rays by their ratios, each in a stroke with its own thickness and style', () => {
    const { page } = rig('gannbox_fan')
    expect([...page().querySelectorAll('.qc-drawing-ratio-switch')].map((s) => s.textContent)).toEqual(['1/8', '1/4', '1/3', '1/2', '1/1', '2/1', '3/1', '4/1', '8/1'])
    expect(control(page(), 'Fan 1/8 color').querySelector('.qc-drawing-stroke')).not.toBeNull()
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

  it('draws the one-to-a-line fibs and the pitchfan in their levels’ own colors and strokes', () => {
    const levels = (type: string): [number, string, boolean, number | undefined][] =>
      (fresh(type).props.levels as { value: number; color: string; visible: boolean; width?: number }[]).map((l) => [l.value, l.color, l.visible, l.width])
    expect(levels('fib_timezone').map(([v, c]) => [v, c])).toEqual([0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89].map((v) => [v, v === 0 ? '#808080' : '#2962ff']))
    expect(levels('fib_trend_time').map(([v, , on]) => [v, on])).toEqual([[0, true], [0.382, true], [0.5, false], [0.618, true], [1, true], [1.382, true], [1.618, true], [2, true], [2.382, true], [2.618, true], [3, true]])
    expect(levels('fib_circles').every(([, , , w]) => w === 2)).toBe(true)
    expect(levels('fib_wedge').map(([, , on]) => on)).toEqual([true, true, true, true, true, true, false, false, false, false, false])
    expect(levels('pitchfan').map(([v, c, on]) => [v, c, on])).toEqual([[0.25, '#ffb74d', false], [0.382, '#81c784', false], [0.5, '#00bcd4', true], [0.618, '#089981', false], [0.75, '#00bcd4', false], [1, '#2962ff', true], [1.5, '#9c27b0', false], [1.75, '#e91e63', false], [2, '#f77c80', false]])
    expect(fresh('fib_timezone').props).toMatchObject({ showLevels: true, labelsHAlign: 'right', labelsVAlign: 'bottom', fillBackground: false, backgroundOpacity: 0.2 })
    expect(fresh('fib_wedge').props).toMatchObject({ trendLine: true, trendLineColor: '#808080', trendLineWidth: 2, trendLineStyle: 'solid' })
    expect(fresh('pitchfan').props).toMatchObject({ medianColor: '#f23645', medianWidth: 2, medianStyle: 'solid', fillBackground: true })
  })

  it('opens a fib spiral in cyan at 2px, winding clockwise', () => {
    const d = fresh('fib_spiral')
    expect([d.style.lineColor, d.style.lineWidth, d.style.lineStyle]).toEqual(['#00bcd4', 2, 'solid'])
    expect(d.props).toEqual({ counterclockwise: false })
  })

  it('opens a gann square and a fixed one on six grid lines, eleven fans and eleven arcs, and a gann fan on nine rays', () => {
    type Line = { x?: number; y?: number; color: string; visible: boolean; width: number }
    const ratio = (l: Line): string => `${l.x}x${l.y}`
    for (const type of ['gannbox_square', 'gannbox_fixed']) {
      const d = fresh(type)
      expect((d.props.levels as Line[]).map((l) => [l.color, l.visible, l.width]), type).toEqual(['#808080', '#ff9800', '#00bcd4', '#4caf50', '#089981', '#808080'].map((c) => [c, true, 2]))
      expect((d.props.fans as Line[]).map((l) => [ratio(l), l.color, l.visible, l.width]), type).toEqual([
        ['8x1', '#b39ddb', false, 2],
        ['5x1', '#f23645', false, 2],
        ['4x1', '#808080', false, 2],
        ['3x1', '#ff9800', false, 2],
        ['2x1', '#00bcd4', true, 2],
        ['1x1', '#4caf50', true, 2],
        ['1x2', '#089981', true, 2],
        ['1x3', '#089981', false, 2],
        ['1x4', '#2962ff', false, 2],
        ['1x5', '#9575cd', false, 2],
        ['1x8', '#b39ddb', false, 2],
      ])
      expect((d.props.arcs as Line[]).map((l) => [ratio(l), l.color, l.visible, l.width]), type).toEqual([
        ['1x0', '#ff9800', true, 2],
        ['1x1', '#ff9800', true, 2],
        ['1.5x0', '#ff9800', true, 2],
        ['2x0', '#00bcd4', true, 2],
        ['2x1', '#00bcd4', true, 2],
        ['3x0', '#4caf50', true, 2],
        ['3x1', '#4caf50', true, 2],
        ['4x0', '#089981', true, 2],
        ['4x1', '#089981', true, 2],
        ['5x0', '#2962ff', true, 2],
        ['5x1', '#2962ff', true, 2],
      ])
      expect(d.props, type).toMatchObject({ fillBackground: true, backgroundOpacity: 0.2, reverse: false })
    }
    expect(fresh('gannbox_square').props).toMatchObject({ scaleRatio: null, showLabels: true })
    expect([fresh('gannbox_square').style.fontSize, fresh('gannbox_square').style.bold, fresh('gannbox_square').style.italic]).toEqual([12, false, false])
    expect((fresh('gannbox_fan').props.levels as { value: number; color: string; visible: boolean; width: number }[]).map((l) => [l.value, l.color, l.visible, l.width])).toEqual([
      [1 / 8, '#ff9800', true, 2],
      [1 / 4, '#089981', true, 2],
      [1 / 3, '#4caf50', true, 2],
      [1 / 2, '#089981', true, 2],
      [1, '#00bcd4', true, 2],
      [2, '#2962ff', true, 2],
      [3, '#9c27b0', true, 2],
      [4, '#e91e63', true, 2],
      [8, '#f23645', true, 2],
    ])
    expect(fresh('gannbox_fan').props).toMatchObject({ fillBackground: true, backgroundOpacity: 0.2, showLabels: true })
  })

  it('opens the four pitchforks on one ladder of nine pairs, the half and the tines shown, with a red median', () => {
    for (const type of ['pitchfork', 'schiff_pitchfork', 'schiff_pitchfork_modified', 'inside_pitchfork']) {
      const d = fresh(type)
      expect((d.props.levels as { value: number; color: string; visible: boolean; width: number }[]).map((l) => [l.value, l.color, l.visible, l.width]), type).toEqual([
        [0.25, '#ffb74d', false, 2],
        [0.382, '#81c784', false, 2],
        [0.5, '#089981', true, 2],
        [0.618, '#089981', false, 2],
        [0.75, '#00bcd4', false, 2],
        [1, '#2962ff', true, 2],
        [1.5, '#9c27b0', false, 2],
        [1.75, '#e91e63', false, 2],
        [2, '#f77c80', false, 2],
      ])
      expect(d.props, type).toMatchObject({ extendLines: false, medianColor: '#f23645', medianWidth: 2, medianStyle: 'solid', fillBackground: true, backgroundOpacity: 0.2 })
    }
  })

  it('divides a fan and a gann box on seven divisions a side, with a fan’s grid and a box’s two sets of bands', () => {
    for (const type of ['fib_speed_resist_fan', 'gannbox']) {
      const d = fresh(type)
      for (const key of ['priceLevels', 'timeLevels']) {
        expect((d.props[key] as { value: number; color: string }[]).map((l) => [l.value, l.color]), `${type} ${key}`).toEqual([[0, '#808080'], [0.25, '#ff9800'], [0.382, '#00bcd4'], [0.5, '#4caf50'], [0.618, '#089981'], [0.75, '#2962ff'], [1, '#808080']])
      }
      expect(d.props, type).toMatchObject({ showLeftLabels: true, showRightLabels: true, showTopLabels: true, showBottomLabels: true, reverse: false })
    }
    expect(fresh('fib_speed_resist_fan').props).toMatchObject({ grid: true, gridColor: 'rgba(21, 56, 153, 0.8)', gridWidth: 1, gridStyle: 'solid', fillBackground: true })
    expect(fresh('gannbox').props).toMatchObject({ fillPriceBackground: true, fillTimeBackground: true, angles: false, anglesColor: '#9c9c9c' })
    expect(fresh('gannbox').style.lineColor).toBe('rgba(21, 56, 153, 0.8)')
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
