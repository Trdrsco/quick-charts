// @vitest-environment happy-dom
// The pattern tools' settings beyond their rows: the sizes their letters are offered in, what the
// Label row and the Background row write, and the look a new drawing of each pattern starts with.
// Their rows themselves are pinned in settingsFamilies.test.ts.
import { afterEach, describe, expect, it } from 'vitest'
import { drawingTools } from '../../../src/drawings/index'
import { anchors, choices, pick, rig } from './settingsRig'

afterEach(() => {
  document.body.replaceChildren()
})

const select = (page: HTMLElement, label: string): HTMLElement => page.querySelector<HTMLElement>(`.qc-drawing-select[aria-label="${label}"]`)!

describe('a pattern', () => {
  it('offers its letters in thirteen sizes, holding 12', () => {
    const { dialog, page } = rig('xabcd_pattern')
    expect(choices(dialog, select(page(), 'Font size'))).toEqual(['8', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '32', '40'])
    expect(select(page(), 'Font size').textContent).toBe('12')
  })

  it('writes its letters color, size, weight and slant from the Label row, the toggles held while on', () => {
    const { dialog, drawing, page } = rig('abcd_pattern')
    const [color] = [...page().querySelectorAll<HTMLElement>('.qc-drawing-row-controls')[0]!.children]
    expect(color!.getAttribute('aria-label')).toBe('Label color')
    pick(dialog, select(page(), 'Font size'), '16')
    expect(drawing.style.fontSize).toBe(16)
    page().querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click()
    page().querySelector<HTMLButtonElement>('[aria-label="Italic"]')!.click()
    expect([drawing.style.bold, drawing.style.italic]).toEqual([true, true])
    expect(page().querySelector('[aria-label="Bold"]')!.getAttribute('aria-pressed')).toBe('true')
  })

  it("switches a shaded pattern's background off and on, keeping its color", () => {
    const { drawing, page } = rig('head_and_shoulders')
    page().querySelector<HTMLInputElement>('input[aria-label="Background"]')!.click()
    expect(drawing.props.fillBackground).toBe(false)
    expect([drawing.style.fillColor, drawing.style.fillOpacity]).toEqual(['#089981', 0.15])
    page().querySelector<HTMLInputElement>('input[aria-label="Background"]')!.click()
    expect(drawing.props.fillBackground).toBe(true)
  })
})

describe('what a new pattern starts with', () => {
  const fresh = (type: string) => drawingTools.create(type, 'x', anchors(drawingTools.get(type)!.anchors))!

  it('draws each pattern in its hue at 2px with white 12px letters, shading the legs of the shaded ones at fifteen percent', () => {
    const looks: Record<string, [hue: string, shaded: boolean]> = {
      xabcd_pattern: ['#2962ff', true],
      cypher_pattern: ['#2962ff', true],
      abcd_pattern: ['#089981', false],
      three_drives: ['#673ab7', false],
      triangle_pattern: ['#673ab7', true],
      head_and_shoulders: ['#089981', true],
    }
    for (const [type, [hue, shaded]] of Object.entries(looks)) {
      const d = fresh(type)
      expect([d.style.lineColor, d.style.lineWidth, d.style.lineStyle, d.style.textColor, d.style.fontSize, d.style.bold, d.style.italic], type).toEqual([hue, 2, 'solid', '#ffffff', 12, false, false])
      if (shaded) {
        expect([d.style.fillColor, d.style.fillOpacity], type).toEqual([hue, 0.15])
        expect(d.props, type).toEqual({ fillBackground: true })
      } else expect(d.props, type).toEqual({})
    }
  })

  it('places three drives on seven points, and completes one saved on six with the reversal after its third drive', () => {
    expect(drawingTools.get('three_drives')!.anchors).toBe(7)
    const points = [100, 160, 220, 280, 340, 400].map((time, i) => ({ time: time as never, price: i % 2 ? 120 : 100 }))
    const saved = { ...fresh('three_drives').toJSON(), anchors: points }
    const restored = drawingTools.restore(saved)!
    expect(restored.anchors).toHaveLength(7)
    expect(restored.anchors[6]).toEqual({ time: 460, price: 100 })
    expect(restored.isValid()).toBe(true)
  })

  it('reads no words a saved pattern carries, and so offers no Text page', () => {
    const saved = { ...fresh('xabcd_pattern').toJSON(), props: { fillBackground: true, text: 'Words' } }
    const restored = drawingTools.restore(saved)!
    expect('text' in restored.props).toBe(false)
  })
})
