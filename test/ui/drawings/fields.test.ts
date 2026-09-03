// @vitest-environment happy-dom
// The field primitives: each reports the value it was built to edit, reads its words from the
// chart's language, and carries its accessible name.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { colorSwatches, customColorPicker, dialogTabs, dropdown, lineEndButton, numberInput, opacitySlider, row, strokeSegments, swatchButton, toggleRow, visibilityRangeRow } from '../../../src/ui/drawings/fields'
import { hexOf, hexToHsv, hsvToHex, shade, SWATCH_ROWS } from '../../../src/ui/drawings/color'

const t = createChartI18n().t
const box = (): HTMLElement => {
  const b = document.createElement('div')
  document.body.appendChild(b)
  return b
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('color arithmetic', () => {
  it('round-trips hex through HSV and reads the base of an rgba value', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#4c98fb', '#123456']) expect(hsvToHex(hexToHsv(hex).h, hexToHsv(hex).s, hexToHsv(hex).v)).toBe(hex)
    expect(hexOf('rgba(76, 152, 251, 0.5)')).toBe('#4c98fb')
    expect(hexOf('#abc')).toBe('#aabbcc')
    expect(shade('#808080', -1)).toBe('#ffffff')
    expect(shade('#808080', 1)).toBe('#000000')
  })

  it('computes a six by ten palette, greys first, every cell a hex', () => {
    expect(SWATCH_ROWS).toHaveLength(6)
    for (const rowOfSwatches of SWATCH_ROWS) {
      expect(rowOfSwatches).toHaveLength(10)
      for (const c of rowOfSwatches) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(SWATCH_ROWS[0]![0]).toBe('#ffffff')
    expect(SWATCH_ROWS[0]![9]).toBe('#000000')
  })
})

describe('rows and toggles', () => {
  it('a row names itself and holds its controls; a toggle reports its checkbox', () => {
    const changed: boolean[] = []
    const toggle = toggleRow('Middle point', false, (v) => changed.push(v))
    const r = row('Extend', toggle)
    document.body.appendChild(r) // a detached checkbox runs no activation on click
    expect(r.querySelector('.qc-drawing-row-label')!.textContent).toBe('Extend')
    const input = toggle.querySelector('input')!
    expect(input.getAttribute('aria-label')).toBe('Middle point')
    input.click()
    expect(changed).toEqual([true])
    const off = toggleRow('Pinned', true, () => undefined, true)
    expect(off.querySelector('input')!.disabled).toBe(true)
  })

  it('a dropdown stores the id and shows the label', () => {
    const picked: string[] = []
    const select = dropdown('Extend', ['None', 'Left'] as const, 'Left', (v) => (v === 'None' ? 'Do not' : 'To the left'), (v) => picked.push(v))
    expect(select.value).toBe('Left')
    expect([...select.options].map((o) => o.textContent)).toEqual(['Do not', 'To the left'])
    select.value = 'None'
    select.dispatchEvent(new Event('change'))
    expect(picked).toEqual(['None'])
  })

  it('a number field steps by its step within its bounds and rounds float dust away', () => {
    const values: number[] = []
    const field = numberInput(t, { label: 'Risk', value: 0.2, step: 0.1, min: 0, max: 0.4, onChange: (v) => values.push(v) })
    const [up, down] = [...field.querySelectorAll<HTMLButtonElement>('button')]
    expect(up!.getAttribute('aria-label')).toBe('Increase')
    up!.click()
    up!.click()
    up!.click()
    expect(values).toEqual([0.3, 0.4, 0.4])
    down!.click()
    expect(values[3]).toBe(0.3)
    const input = field.querySelector('input')!
    input.value = 'abc'
    input.dispatchEvent(new Event('change'))
    expect(values).toHaveLength(4)
  })

  it('an opacity slider reports a fraction and shows a percent', () => {
    const out: number[] = []
    const slider = opacitySlider(t, '#ff0000', 0.25, (v) => out.push(v))
    const input = slider.querySelector('input')!
    expect(input.value).toBe('25')
    expect(slider.textContent).toBe('25%')
    input.value = '60'
    input.dispatchEvent(new Event('input'))
    expect(out).toEqual([0.6])
    expect(slider.textContent).toBe('60%')
  })
})

describe('the palette', () => {
  it('lays out the swatches by name, marks the current one, and opens the custom panel in place', () => {
    const picked: string[] = []
    const opacities: number[] = []
    const palette = colorSwatches(t, { value: 'rgba(255, 255, 255, 0.5)', onPick: (c) => picked.push(c), opacity: 0.5, onOpacity: (v) => opacities.push(v) })
    document.body.appendChild(palette)
    const swatches = [...palette.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')]
    expect(swatches).toHaveLength(60)
    expect(swatches[0]!.getAttribute('aria-label')).toBe('Color #ffffff')
    expect(swatches[0]!.dataset.qcActive).toBe('true')
    swatches[15]!.click()
    expect(picked).toEqual([SWATCH_ROWS[1]![5]])
    const plus = palette.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!
    plus.click()
    expect(plus.getAttribute('aria-expanded')).toBe('true')
    const hex = palette.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    hex.value = '00ff00'
    hex.dispatchEvent(new Event('input'))
    hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(picked[1]).toBe('#00ff00')
    expect(palette.querySelector('.qc-drawing-custom')).toBeNull()
    expect(palette.querySelector('.qc-drawing-opacity')).toBeTruthy()
  })

  it('the custom panel refuses a half-typed hex and paints the square from the hue', () => {
    const added: string[] = []
    const panel = customColorPicker(t, '#4c98fb', (hex) => added.push(hex))
    document.body.appendChild(panel)
    const hex = panel.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    const add = panel.querySelector<HTMLButtonElement>('.qc-drawing-add')!
    expect(hex.value).toBe('4c98fb')
    expect(add.disabled).toBe(false)
    hex.value = '08'
    hex.dispatchEvent(new Event('input'))
    expect(add.disabled).toBe(true)
    hex.value = 'ff8800'
    hex.dispatchEvent(new Event('input'))
    add.click()
    expect(added).toEqual(['#ff8800'])
    expect(panel.querySelector<HTMLElement>('.qc-drawing-sv')!.style.getPropertyValue('--qcd-hue')).toBe('#ff8800')
  })
})

describe('the swatch button', () => {
  it('opens its popover with the palette and, for a stroke, the thickness and style rows', () => {
    const b = box()
    const picks: unknown[] = []
    const button = swatchButton(t, b, {
      label: 'Line',
      value: '#4c98fb',
      onPick: (c) => picks.push(['color', c]),
      thickness: 2,
      onThickness: (v) => picks.push(['thickness', v]),
      lineStyle: 'solid',
      onLineStyle: (v) => picks.push(['style', v]),
    })
    b.appendChild(button)
    expect(button.getAttribute('aria-label')).toBe('Line')
    expect(button.querySelector('.qc-drawing-stroke')).toBeTruthy()
    button.click()
    const popover = b.querySelector<HTMLElement>('[data-role="drawing-popover"]')!
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(popover.querySelectorAll('.qc-drawing-option')).toHaveLength(7)
    popover.querySelector<HTMLButtonElement>('[aria-label="Thickness 4px"]')!.click()
    popover.querySelector<HTMLButtonElement>('[aria-label="Line style Dashed line"]')!.click()
    expect(picks).toEqual([
      ['thickness', 4],
      ['style', 'dashed'],
    ])
    expect(b.querySelector('[data-role="drawing-popover"]')).toBeTruthy() // stroke edits keep it open
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(b.querySelector('[data-role="drawing-popover"]')).toBeNull()
  })

  it('a plain swatch closes on a pick and keeps the alpha the value carried', () => {
    const b = box()
    const picks: string[] = []
    const button = swatchButton(t, b, { label: 'Color', value: 'rgba(1, 2, 3, 0.5)', onPick: (c) => picks.push(c) })
    b.appendChild(button)
    button.click()
    b.querySelector<HTMLButtonElement>('[aria-label="Color #000000"]')!.click()
    expect(picks).toEqual(['rgba(0, 0, 0, 0.5)'])
    expect(b.querySelector('[data-role="drawing-popover"]')).toBeNull()
  })

  it('the stroke preview draws one bar, four dashes, or a run of dots', () => {
    expect(strokeSegments(2).children).toHaveLength(1)
    expect(strokeSegments(2, 'dashed').children).toHaveLength(4)
    expect(strokeSegments(1, 'dotted').children.length).toBeGreaterThan(4)
  })
})

describe('line ends, tabs and visibility rows', () => {
  it('a line-end picker offers the two ends and reports the pick', () => {
    const b = box()
    const picks: string[] = []
    const button = lineEndButton(t, b, 'right', 'normal', (v) => picks.push(v))
    b.appendChild(button)
    expect(button.getAttribute('aria-label')).toBe('Right end')
    button.click()
    const options = [...b.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.map((o) => o.textContent)).toEqual(['Normal', 'Arrow'])
    options[1]!.click()
    expect(picks).toEqual(['arrow'])
    expect(b.querySelector('[role="listbox"]')).toBeNull()
  })

  it('the tab strip marks the page and moves with the arrow keys', () => {
    const picked: string[] = []
    const strip = dialogTabs(['Style', 'Text', 'Visibility'], 'Text', (id) => id.toUpperCase(), (id) => picked.push(id))
    document.body.appendChild(strip)
    const tabs = [...strip.querySelectorAll<HTMLElement>('[role="tab"]')]
    expect(tabs.map((tab) => tab.textContent)).toEqual(['STYLE', 'TEXT', 'VISIBILITY'])
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true')
    tabs[2]!.click()
    expect(picked).toEqual(['Visibility'])
    tabs[1]!.focus()
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(tabs[2])
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(picked).toEqual(['Visibility', 'Visibility'])
  })

  it('a visibility row clamps from and to against each other', () => {
    const out: { on: boolean; from: number; to: number }[] = []
    const r = visibilityRangeRow(t, { label: 'Minutes', range: { on: true, from: 5, to: 30 }, max: 59, onChange: (next) => out.push(next) })
    document.body.appendChild(r)
    const [from, to] = [...r.querySelectorAll<HTMLInputElement>('input[type="number"]')]
    from!.value = '45'
    from!.dispatchEvent(new Event('change'))
    to!.value = '1'
    to!.dispatchEvent(new Event('change'))
    expect(out).toEqual([
      { on: true, from: 30, to: 30 },
      { on: true, from: 5, to: 5 },
    ])
    const check = r.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(check.getAttribute('aria-label')).toBe('Minutes visible')
    check.click()
    expect(out[2]).toEqual({ on: false, from: 5, to: 30 })
  })
})
