// @vitest-environment happy-dom
// The field primitives: each reports the value it was built to edit, reads its words from the
// chart's language, and carries its accessible name.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { checkRow, dialogTabs, dropdown, lineEndButton, multiDropdown, numberInput, row, strokeSegments, swatchButton, toggleRow, visibilityRangeRow } from '../../../src/ui/drawings/fields'
import { createColorPalette, createCustomColorPicker, createOpacitySlider, hexOf, hexToHsv, hsvToHex, SWATCH_BLOCKS } from '../../../src/ui/controls/color'
import { ownIcons } from '../../ownIcons'

const t = createChartI18n().t
const icons = ownIcons()
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
  })

  it('offers eight rows of ten in two blocks, greys first, every cell a hex', () => {
    const rows = SWATCH_BLOCKS.flat()
    expect(rows).toHaveLength(8)
    for (const rowOfSwatches of rows) {
      expect(rowOfSwatches).toHaveLength(10)
      for (const c of rowOfSwatches) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(rows[0]![0]).toBe('#ffffff')
    expect(rows[0]![9]).toBe('#000000')
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

  it('a check row makes its label the checkbox and keeps its controls beside it', () => {
    const changed: boolean[] = []
    const control = document.createElement('button')
    const r = checkRow('Background', true, (v) => changed.push(v), [control])
    document.body.appendChild(r)
    const label = r.querySelector<HTMLElement>('.qc-drawing-row-label')!
    expect(label.matches('label.qc-drawing-toggle')).toBe(true)
    expect(label.textContent).toBe('Background')
    expect(r.querySelector('.qc-drawing-row-controls')!.firstElementChild).toBe(control)
    label.querySelector('input')!.click()
    expect(changed).toEqual([false])
  })

  it('a dropdown shows the label, lists the choices under it with the current one chosen, and stores the id', () => {
    const picked: string[] = []
    const host = box()
    const field = dropdown(icons, host, 'Extend', ['None', 'Left'] as const, 'Left', (v) => (v === 'None' ? 'Do not' : 'To the left'), (v) => picked.push(v), 'wide')
    host.appendChild(field)
    expect(field.getAttribute('role')).toBe('combobox')
    expect(field.getAttribute('aria-label')).toBe('Extend')
    expect(field.dataset.width).toBe('wide')
    expect(field.textContent).toBe('To the left')
    field.click()
    expect(field.getAttribute('aria-expanded')).toBe('true')
    const options = [...host.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')]
    expect(options.map((o) => [o.textContent, o.getAttribute('aria-selected')])).toEqual([
      ['Do not', 'false'],
      ['To the left', 'true'],
    ])
    // The keyboard lands on the current value.
    expect(document.activeElement).toBe(options[1])
    options[0]!.click()
    expect(picked).toEqual(['None'])
    expect(host.querySelector('[role="listbox"]')).toBeNull()
    expect(field.getAttribute('aria-expanded')).toBe('false')
    // Picking the value it holds reports nothing.
    field.click()
    host.querySelectorAll<HTMLElement>('[role="option"]')[1]!.click()
    expect(picked).toEqual(['None'])
  })

  it('a multiple list reads the choices that are on, stays open while they are ticked, and reports each', () => {
    const reports: [string, boolean][] = []
    const host = box()
    const field = multiDropdown(icons, host, {
      label: 'Stats',
      empty: 'Hidden',
      choices: [
        { label: 'Price range', checked: false, onChange: (v) => reports.push(['price', v]) },
        { label: 'Bars range', checked: true, onChange: (v) => reports.push(['bars', v]) },
      ],
    })
    host.appendChild(field)
    expect(field.getAttribute('aria-haspopup')).toBe('menu')
    expect(field.textContent).toBe('Bars range')
    field.click()
    const items = [...host.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')]
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true'])
    items[0]!.click()
    expect(reports).toEqual([['price', true]])
    expect(items[0]!.getAttribute('aria-checked')).toBe('true')
    expect(items[0]!.querySelector<HTMLInputElement>('input')!.checked).toBe(true)
    // Every choice after the first reads in the middle of a sentence.
    expect(field.textContent).toBe('Price range, bars range')
    items[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    items[0]!.click()
    expect(reports).toEqual([['price', true], ['bars', false], ['price', false]])
    expect(field.textContent).toBe('Hidden')
    expect(host.querySelector('[role="menu"]')).not.toBeNull()
  })

  it('a list button ends its face with the 18px chevron, hidden from a reader; a line end wears its mark alone', () => {
    const host = box()
    const field = dropdown(icons, host, 'Extend', ['None', 'Left'] as const, 'Left', (v) => v, () => undefined)
    expect(field.classList.contains('qc-field')).toBe(true)
    const chevron = field.lastElementChild!
    expect(chevron.classList.contains('qc-select-chevron')).toBe(true)
    expect(chevron.getAttribute('aria-hidden')).toBe('true')
    expect(chevron.querySelector('svg')!.getAttribute('height')).toBe('18')
    const end = lineEndButton(t, icons, host, 'left', 'arrow', () => undefined)
    expect(end.querySelector('.qc-select-chevron')).toBeNull()
    expect(end.querySelectorAll('svg')).toHaveLength(1)
    expect(end.getAttribute('aria-haspopup')).toBe('listbox')
    expect(end.getAttribute('aria-label')).toBe('Left end')
  })

  it('a number field steps by its step within its bounds and rounds float dust away', () => {
    const values: number[] = []
    const field = numberInput(t, icons, { label: 'Risk', value: 0.2, step: 0.1, min: 0, max: 0.4, onChange: (v) => values.push(v) })
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

  it('an opacity slider reports a fraction, and its field takes one typed', () => {
    const out: number[] = []
    const slider = createOpacitySlider(t, '#ff0000', 0.25, (v) => out.push(v)).element
    const [track, figure] = [...slider.querySelectorAll('input')]
    expect(track!.value).toBe('25')
    expect(figure!.value).toBe('25')
    track!.value = '60'
    track!.dispatchEvent(new Event('input'))
    expect(out).toEqual([0.6])
    expect(figure!.value).toBe('60')
    // The field holds the range as it is typed, so a hundred is the most a hand can reach.
    figure!.value = '200'
    figure!.dispatchEvent(new Event('input'))
    expect(out).toEqual([0.6, 1])
    expect(track!.value).toBe('100')
  })
})

describe('the palette', () => {
  it('lays out the swatches by name, marks the current one, and opens the custom panel in place', () => {
    const picked: string[] = []
    const opacities: number[] = []
    const palette = createColorPalette(t, { value: 'rgba(255, 255, 255, 0.5)', onPick: (c) => picked.push(c), opacity: 0.5, onOpacity: (v) => opacities.push(v) }).element
    document.body.appendChild(palette)
    const swatches = [...palette.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')]
    expect(swatches).toHaveLength(80)
    expect(swatches[0]!.getAttribute('aria-label')).toBe('Color #ffffff')
    expect(swatches[0]!.dataset.qcActive).toBe('true')
    swatches[15]!.click()
    expect(picked).toEqual([SWATCH_BLOCKS.flat()[1]![5]])
    const plus = palette.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!
    plus.click()
    expect(palette.querySelector<HTMLElement>('.qc-drawing-swatches')!.hidden).toBe(true)
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
    const panel = createCustomColorPicker(t, '#4c98fb', (hex) => added.push(hex)).element
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
  it('uses a highlighter-specific thickness scale when supplied', () => {
    const b = box()
    const picks: number[] = []
    const control = swatchButton(t, b, { label: 'Highlighter', value: '#ffcc00', onPick: () => {}, thickness: 20, thicknessChoices: [8, 12, 20, 32, 48, 64, 80, 96], onThickness: (width) => picks.push(width) })
    b.appendChild(control)
    control.click()
    const options = [...b.querySelectorAll<HTMLButtonElement>('.qc-drawing-option')]
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([8, 12, 20, 32, 48, 64, 80, 96].map((width) => `Thickness ${width}px`))
    expect(options[2]!.dataset.qcActive).toBe('true')
    options[7]!.click()
    expect(picks).toEqual([96])
  })
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
    const button = lineEndButton(t, icons, b, 'right', 'normal', (v) => picks.push(v))
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
    const r = visibilityRangeRow(t, icons, { label: 'Minutes', range: { on: true, from: 5, to: 30 }, max: 59, onChange: (next) => out.push(next) })
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
