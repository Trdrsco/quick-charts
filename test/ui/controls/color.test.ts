// @vitest-environment happy-dom
// The one color control, and the palette it paints. The values are pinned: ten greys, ten hues and
// six stated ramps over them, then the colors this viewer mixed and the plus, and a custom editor
// with a hex field, a saturation and brightness area and a hue strip. The control reports typed
// edits and is updated and destroyed explicitly; it never opens the operating system's own color
// dialog, and no consumer keeps a second implementation.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import {
  colorMemoryFor,
  createColorControl,
  createColorPalette,
  createCustomColorPicker,
  createOpacitySlider,
  CUSTOM_COLOR_FALLBACK,
  GREY_RAMP,
  hexFromText,
  hexOf,
  HUE_BASES,
  provideColorMemory,
  readColor,
  HUE_RAMPS,
  SWATCH_BLOCKS,
  type ColorMemory,
} from '../../../src/ui/controls/color'
import { ownPointer } from '../../../src/ui/drawings/dom'
import { openInlinePanel } from '../../../src/ui/controls/inlinePanel'

const t = createChartI18n().t
const host = (): HTMLElement => {
  const box = document.createElement('div')
  document.body.appendChild(box)
  return box
}
/** A consumer's panel: the control never mounts an overlay itself. */
const inline = (anchor: HTMLElement, content: HTMLElement, onClosed: () => void): (() => void) => openInlinePanel(anchor, content, anchor, onClosed)

const key = (target: Element, key: string, init: KeyboardEventInit = {}): void => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))

/** A memory the test holds, newest first. */
function memory(seed: string[] = []): ColorMemory & { colors: string[] } {
  const colors = [...seed]
  return {
    colors,
    list: () => colors,
    add(hex) {
      colors.splice(0, 0, hex)
    },
  }
}

/** Give an element a laid-out box. */
const boxed = (element: HTMLElement, left: number, top: number, width: number, height: number): void => {
  element.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the pinned palette', () => {
  it('paints the pinned grey ramp and ten hues', () => {
    expect(GREY_RAMP).toEqual(['#ffffff', '#dbdbdb', '#b8b8b8', '#9c9c9c', '#808080', '#636363', '#4a4a4a', '#2e2e2e', '#0f0f0f', '#000000'])
    expect(HUE_BASES).toEqual(['#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'])
    // Two blocks: what a viewer reaches for first, then the ramps as a second reading of the ten.
    expect(SWATCH_BLOCKS).toHaveLength(2)
    expect(SWATCH_BLOCKS[0]).toEqual([GREY_RAMP, HUE_BASES])
    expect(SWATCH_BLOCKS[1]).toBe(HUE_RAMPS)
    expect(HUE_RAMPS).toHaveLength(6)
    for (const row of SWATCH_BLOCKS.flat()) expect(row).toHaveLength(10)
    // Each ramp is a STATED row, not the base mixed: a linear mix of #f23645 toward white lands on
    // #f99ba2, and the row the palette offers is #faa1a4.
    expect(HUE_RAMPS[1]![0]).toBe('#faa1a4')
    expect(HUE_RAMPS[5]![0]).toBe('#801922')
  })

  it('reads a supported value and its alpha, and leaves an unsupported one intact', () => {
    expect(readColor('rgba(76, 152, 251, 0.4)')).toEqual({ hex: '#4c98fb', alpha: 0.4 })
    expect(readColor('#4c98fb80')?.alpha).toBeCloseTo(0.5, 2)
    expect(readColor('currentColor')).toBeNull()
    // An unsupported declaration is never rewritten as opaque black.
    expect(hexOf('currentColor')).toBe('currentcolor')
    expect(hexOf('#abc')).toBe('#aabbcc')
  })

  it('reads a typed hex of three or six digits, with or without its hash, and nothing else', () => {
    expect(hexFromText('2962FF')).toBe('#2962ff')
    expect(hexFromText('#2962ff')).toBe('#2962ff')
    expect(hexFromText('f0a')).toBe('#ff00aa')
    expect(hexFromText(' #ABC ')).toBe('#aabbcc')
    for (const refused of ['', '#', '29', '2962', '2962f', '2962ff0', 'ggg', '#12345g', 'red']) expect(hexFromText(refused), refused).toBeNull()
  })
})

describe('the palette control', () => {
  it('rings the value, reports a pick, and moves the ring at once', () => {
    const picks: string[] = []
    const palette = createColorPalette(t, { value: '#2962ff', onPick: (c) => picks.push(c) })
    document.body.appendChild(palette.element)
    const cells = [...palette.element.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch')]
    expect(cells).toHaveLength(80)
    const chosen = cells.find((c) => c.dataset.qcColor === '#2962ff')!
    expect(chosen.dataset.qcActive).toBe('true')
    expect(chosen.getAttribute('aria-pressed')).toBe('true')
    // A cell names its color, and stands without a tooltip of its own.
    expect(cells[0]!.getAttribute('aria-label')).toBe('Color #ffffff')
    expect(cells[0]!.hasAttribute('title')).toBe(false)
    cells[0]!.click()
    expect(picks).toEqual(['#ffffff'])
    expect(cells[0]!.dataset.qcActive).toBe('true')
    expect(chosen.dataset.qcActive).toBeUndefined()
  })

  it('is one stop for the keyboard: the arrows move along a row and between rows, Home and End reach its ends', () => {
    const picks: string[] = []
    const palette = createColorPalette(t, { value: '#2962ff', onPick: (c) => picks.push(c), recents: memory(['#123456', '#654321']) })
    document.body.appendChild(palette.element)
    const cell = (hex: string): HTMLElement => palette.element.querySelector<HTMLElement>(`[data-qc-color="${hex}"]`)!
    const plus = palette.element.querySelector<HTMLElement>('.qc-drawing-swatch-plus')!
    const all = [...palette.element.querySelectorAll<HTMLElement>('.qc-drawing-swatch, .qc-drawing-swatch-plus')]
    expect(all.filter((c) => c.tabIndex === 0)).toEqual([cell('#2962ff')])
    cell('#2962ff').focus()
    key(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(cell('#00bcd4'))
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(cell('#b2ebf2'))
    // The last ramp's cells step down into the mixed row, onto its last cell where it is short.
    cell('#880e4f').focus()
    key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(plus)
    // The plus stands third in its row, so up from it is the third cell of the last ramp.
    key(document.activeElement!, 'ArrowUp')
    expect(document.activeElement).toBe(cell('#f57f17'))
    key(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(cell('#ffffff'))
    key(document.activeElement!, 'ArrowUp')
    expect(document.activeElement).toBe(cell('#ffffff'))
    key(document.activeElement!, 'End')
    expect(document.activeElement).toBe(plus)
    // The keyboard's cell is the stop from then on; moving chose nothing.
    expect(all.filter((c) => c.tabIndex === 0)).toEqual([plus])
    expect(picks).toEqual([])
  })

  it('offers the colors this viewer mixed, newest first, with the plus after them', () => {
    const palette = createColorPalette(t, { value: '#123456', onPick: () => undefined, recents: memory(['#123456', '#abcdef']) })
    document.body.appendChild(palette.element)
    const mixed = palette.element.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed')!
    expect([...mixed.querySelectorAll<HTMLElement>('.qc-drawing-swatch')].map((c) => c.dataset.qcColor)).toEqual(['#123456', '#abcdef'])
    expect(mixed.querySelector('.qc-drawing-swatch-plus')).toBe(mixed.lastElementChild!.lastElementChild)
    expect(mixed.querySelector<HTMLElement>('[data-qc-color="#123456"]')!.dataset.qcActive).toBe('true')
    // The rule stands between the offered colors and the mixed ones.
    expect(mixed.previousElementSibling!.classList.contains('qc-drawing-separator')).toBe(true)
    // Without a memory there are no mixed colors, and the plus still stands.
    const bare = createColorPalette(t, { value: '#123456', onPick: () => undefined })
    expect(bare.element.querySelectorAll('.qc-drawing-swatch-block--mixed .qc-drawing-swatch')).toHaveLength(0)
    expect(bare.element.querySelectorAll('.qc-drawing-swatch-block--mixed .qc-drawing-swatch-plus')).toHaveLength(1)
  })

  it('turns the palette over to the mixer, and brings it back with the color added remembered and chosen', () => {
    const picks: string[] = []
    const turns: boolean[] = []
    const colors = memory()
    const palette = createColorPalette(t, { value: '#2962ff', onPick: (c) => picks.push(c), recents: colors, opacity: 1, onOpacity: () => undefined, onMixing: (on) => turns.push(on) })
    document.body.appendChild(palette.element)
    const plus = palette.element.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!
    expect(plus.getAttribute('aria-label')).toBe('Add custom color')
    plus.click()
    expect(turns).toEqual([true])
    expect(palette.element.querySelector<HTMLElement>('.qc-drawing-swatches')!.hidden).toBe(true)
    expect(palette.element.querySelector<HTMLElement>('.qc-drawing-palette-opacity')!.hidden).toBe(true)
    const hex = palette.element.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    expect(document.activeElement).toBe(hex)
    hex.value = '#00FF00'
    hex.dispatchEvent(new Event('input'))
    key(hex, 'Enter')
    expect(picks).toEqual(['#00ff00'])
    expect(colors.colors).toEqual(['#00ff00'])
    expect(turns).toEqual([true, false])
    expect(palette.element.querySelector('.qc-drawing-custom')).toBeNull()
    expect(palette.element.querySelector<HTMLElement>('.qc-drawing-swatches')!.hidden).toBe(false)
    const added = palette.element.querySelector<HTMLElement>('.qc-drawing-swatch-block--mixed [data-qc-color="#00ff00"]')!
    expect(added.dataset.qcActive).toBe('true')
    expect(document.activeElement).toBe(added)
  })

  it('takes an external update without rebuilding its cells, and keeps a focused mixed cell in place', () => {
    const colors = memory(['#123456'])
    const palette = createColorPalette(t, { value: '#2962ff', onPick: () => undefined, recents: colors, opacity: 1, onOpacity: () => undefined })
    document.body.appendChild(palette.element)
    const before = [...palette.element.querySelectorAll('.qc-drawing-swatch')]
    const mixedCell = palette.element.querySelector<HTMLElement>('[data-qc-color="#123456"]')!
    mixedCell.focus()
    palette.update('#f23645', 0.4)
    const after = [...palette.element.querySelectorAll('.qc-drawing-swatch')]
    expect(after).toEqual(before) // the same nodes, not a remount
    expect(document.activeElement).toBe(mixedCell)
    expect(palette.element.querySelector<HTMLButtonElement>('[aria-label="Color #2962ff"]')!.dataset.qcActive).toBeUndefined()
    expect(palette.element.querySelector<HTMLButtonElement>('[aria-label="Color #f23645"]')!.dataset.qcActive).toBe('true')
    expect(palette.element.querySelector<HTMLElement>('.qc-drawing-opacity')!.getAttribute('aria-valuenow')).toBe('40')
    // A memory that moved is laid out again on the next update.
    colors.add('#abcdef')
    palette.update('#f23645', 0.4)
    expect([...palette.element.querySelectorAll<HTMLElement>('.qc-drawing-swatch-block--mixed .qc-drawing-swatch')].map((c) => c.dataset.qcColor)).toEqual(['#abcdef', '#123456'])
  })

  it('finds the colors a surface provides for the element that asks, the nearest provider first', () => {
    const outer = host()
    const inner = outer.appendChild(document.createElement('div'))
    const leaf = inner.appendChild(document.createElement('span'))
    expect(colorMemoryFor(leaf)).toBeNull()
    const a = memory()
    const b = memory()
    const withdraw = provideColorMemory(outer, a)
    expect(colorMemoryFor(leaf)).toBe(a)
    provideColorMemory(inner, b)
    expect(colorMemoryFor(leaf)).toBe(b)
    expect(colorMemoryFor(outer)).toBe(a)
    withdraw()
    expect(colorMemoryFor(outer)).toBeNull()
  })
})

describe('the opacity', () => {
  it('reports a fraction from the keyboard: a percent a step, ten a page, the ends on Home and End', () => {
    const out: number[] = []
    const opacity = createOpacitySlider(t, '#ff0000', 0.25, (v) => out.push(v))
    document.body.appendChild(opacity.element)
    const track = opacity.element.querySelector<HTMLElement>('.qc-drawing-opacity')!
    expect(track.getAttribute('role')).toBe('slider')
    expect(track.getAttribute('aria-label')).toBe('Opacity')
    expect(track.getAttribute('aria-valuenow')).toBe('25')
    expect(track.style.getPropertyValue('--qcd-swatch')).toBe('#ff0000')
    key(track, 'ArrowRight')
    key(track, 'ArrowUp')
    key(track, 'PageDown')
    key(track, 'ArrowLeft')
    expect(out).toEqual([0.26, 0.27, 0.17, 0.16])
    key(track, 'End')
    key(track, 'End')
    key(track, 'Home')
    expect(out.slice(4)).toEqual([1, 0])
    expect(opacity.element.querySelector<HTMLInputElement>('.qc-drawing-opacity-readout')!.value).toBe('0')
    expect(opacity.element.querySelector<HTMLElement>('.qc-drawing-opacity-knob')!.style.getPropertyValue('inset-inline-start')).toBe('0%')
  })

  it('takes the knob to a press and follows the pointer until it is released, through a surface that keeps its presses', () => {
    const out: number[] = []
    const opacity = createOpacitySlider(t, '#ff0000', 1, (v) => out.push(v))
    // The panel the slider stands in stops pointer events on their way out, as every popover does.
    const panel = host()
    ownPointer(panel)
    panel.appendChild(opacity.element)
    const track = opacity.element.querySelector<HTMLElement>('.qc-drawing-opacity')!
    boxed(track, 100, 50, 112, 10)
    // The knob's middle travels 6px in from either end: 100 + 6 is none, 100 + 106 is all.
    track.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 156, clientY: 55, bubbles: true }))
    expect(out).toEqual([0.5])
    expect(track.dataset.qcDragging).toBe('true')
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 106, clientY: 55, bubbles: true }))
    track.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 55, bubbles: true }))
    track.dispatchEvent(new PointerEvent('pointerup', { clientX: 400, clientY: 55, bubbles: true }))
    expect(out).toEqual([0.5, 0, 1])
    expect(track.dataset.qcDragging).toBeUndefined()
    // Released, the track hears no more of the pointer.
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 156, clientY: 55 }))
    expect(out).toEqual([0.5, 0, 1])
  })

  it('takes figures alone in its field, holds a hundred at most, steps on the arrows, and puts the value back on Enter', () => {
    const out: number[] = []
    const opacity = createOpacitySlider(t, '#ff0000', 0.25, (v) => out.push(v))
    document.body.appendChild(opacity.element)
    const figure = opacity.element.querySelector<HTMLInputElement>('.qc-drawing-opacity-readout')!
    expect(figure.value).toBe('25')
    figure.focus()
    figure.value = '6a0'
    figure.dispatchEvent(new Event('input'))
    expect(figure.value).toBe('60')
    expect(out).toEqual([0.6])
    figure.value = '200'
    figure.dispatchEvent(new Event('input'))
    expect(figure.value).toBe('100')
    expect(out).toEqual([0.6, 1])
    key(figure, 'ArrowDown')
    key(figure, 'ArrowDown', { shiftKey: true })
    expect(out).toEqual([0.6, 1, 0.99, 0.89])
    expect(figure.value).toBe('89')
    // An emptied field reports nothing, and Enter puts back the value it stands for.
    figure.value = ''
    figure.dispatchEvent(new Event('input'))
    expect(out).toHaveLength(4)
    key(figure, 'Enter')
    expect(figure.value).toBe('89')
    expect(opacity.element.querySelector('.qc-drawing-opacity')!.getAttribute('aria-valuenow')).toBe('89')
  })
})

describe('the custom editor', () => {
  it('reads three or six digits as typed, and refuses anything else in the field\'s invalid state when asked to add it', () => {
    const added: string[] = []
    const editor = createCustomColorPicker(t, 'currentColor', (hex) => added.push(hex))
    document.body.appendChild(editor.element)
    const field = editor.element.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    const add = editor.element.querySelector<HTMLButtonElement>('.qc-drawing-add')!
    const well = editor.element.querySelector<HTMLElement>('.qc-drawing-custom-swatch')!
    expect(field.value).toBe(CUSTOM_COLOR_FALLBACK.slice(1))
    expect(editor.element.querySelector('.qc-drawing-hex-mark')!.textContent).toBe('#')
    field.value = '0f'
    field.dispatchEvent(new Event('input'))
    add.click()
    expect(added).toEqual([])
    expect(field.getAttribute('aria-invalid')).toBe('true')
    // A hex that names a color again clears the refusal and repaints from it.
    field.value = '0f0'
    field.dispatchEvent(new Event('input'))
    expect(field.hasAttribute('aria-invalid')).toBe(false)
    expect(well.style.getPropertyValue('--qcd-swatch')).toBe('#00ff00')
    expect(field.value).toBe('0f0')
    field.value = 'nope!'
    field.dispatchEvent(new Event('input'))
    key(field, 'Enter')
    expect(field.getAttribute('aria-invalid')).toBe('true')
    field.value = '#FF8800'
    field.dispatchEvent(new Event('input'))
    add.click()
    expect(added).toEqual(['#ff8800'])
  })

  it('edits both axes from the keyboard and names what it is editing', () => {
    const editor = createCustomColorPicker(t, '#808080', () => undefined)
    document.body.appendChild(editor.element)
    const square = editor.element.querySelector<HTMLElement>('.qc-drawing-sv')!
    const strip = editor.element.querySelector<HTMLElement>('.qc-drawing-hue')!
    expect(square.getAttribute('role')).toBe('slider')
    expect(square.getAttribute('aria-label')).toBe('Saturation and brightness')
    expect(strip.getAttribute('aria-label')).toBe('Hue')
    const start = strip.getAttribute('aria-valuenow')
    key(strip, 'ArrowUp')
    expect(strip.getAttribute('aria-valuenow')).not.toBe(start)
    key(strip, 'End')
    expect(strip.getAttribute('aria-valuenow')).toBe('360')
    const before = square.getAttribute('aria-valuetext')
    key(square, 'ArrowDown')
    expect(square.getAttribute('aria-valuetext')).not.toBe(before)
    key(square, 'Home')
    expect(square.getAttribute('aria-valuetext')).toBe('#ffffff')
  })

  it('follows a drag on the area and the strip until the release, and reports nothing until the color is added', () => {
    const added: string[] = []
    const editor = createCustomColorPicker(t, '#ff0000', (hex) => added.push(hex))
    const panel = host()
    ownPointer(panel)
    panel.appendChild(editor.element)
    const area = editor.element.querySelector<HTMLElement>('.qc-drawing-sv')!
    const strip = editor.element.querySelector<HTMLElement>('.qc-drawing-hue')!
    const travel = editor.element.querySelector<HTMLElement>('.qc-drawing-hue-travel')!
    const field = editor.element.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    boxed(area, 0, 0, 200, 184)
    boxed(travel, 207, 3, 17, 178)
    // The area: across is saturation, down is brightness falling away.
    area.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 200, clientY: 0, bubbles: true }))
    expect(field.value).toBe('ff0000')
    area.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 0, bubbles: true }))
    expect(field.value).toBe('ffffff')
    area.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 92, bubbles: true }))
    expect(field.value).toBe('804040')
    area.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 0, clientY: 184 }))
    expect(field.value).toBe('804040')
    // The strip maps its track, inside the ends, onto the hue wheel.
    strip.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 215, clientY: 3 + 178 / 3, bubbles: true }))
    expect(strip.getAttribute('aria-valuenow')).toBe('120')
    expect(Number.parseFloat(editor.element.querySelector<HTMLElement>('.qc-drawing-hue-dot')!.style.top)).toBeCloseTo(100 / 3, 6)
    strip.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    // A drag is one edit at most: nothing is reported until the viewer adds the color.
    expect(added).toEqual([])
    editor.element.querySelector<HTMLButtonElement>('.qc-drawing-add')!.click()
    expect(added).toEqual(['#408040'])
  })
})

describe('the color control', () => {
  it('opens one panel, updates its face in place, and destroys what it opened', () => {
    const box = host()
    const picks: string[] = []
    const control = createColorControl(t, { label: 'Up candles', value: '#089981', onPick: (c) => picks.push(c), closeOnPick: true, openPanel: inline })
    box.appendChild(control.element)
    expect(control.element.querySelector('input[type="color"]')).toBeNull()
    expect(control.element.getAttribute('aria-label')).toBe('Up candles')
    control.element.click()
    expect(control.element.getAttribute('aria-expanded')).toBe('true')
    expect(box.querySelectorAll('.qc-inline-panel')).toHaveLength(1)
    box.querySelector<HTMLButtonElement>('[aria-label="Color #f23645"]')!.click()
    expect(picks).toEqual(['#f23645'])
    expect(box.querySelector('.qc-inline-panel')).toBeNull()
    control.update('#f23645')
    expect(control.element.querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.getPropertyValue('--qcd-swatch')).toBe('#f23645')
    control.element.click()
    control.destroy()
    expect(box.querySelector('.qc-inline-panel')).toBeNull()
    expect(control.element.isConnected).toBe(false)
  })

  it('two controls on one surface stay independent, and Escape closes only the panel', () => {
    const box = host()
    const first = createColorControl(t, { label: 'Up', value: '#089981', onPick: () => undefined, openPanel: inline })
    const second = createColorControl(t, { label: 'Down', value: '#f23645', onPick: () => undefined, openPanel: inline })
    box.append(first.element, second.element)
    first.element.click()
    second.element.click()
    expect(box.querySelectorAll('.qc-inline-panel')).toHaveLength(2)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    // The innermost surface open takes the press; the other panel is untouched.
    expect(box.querySelectorAll('.qc-inline-panel')).toHaveLength(1)
    expect(document.activeElement).toBe(second.element)
    first.destroy()
    second.destroy()
  })

  it('keeps an unsupported declaration until a valid pick replaces it', () => {
    const box = host()
    const picks: string[] = []
    const control = createColorControl(t, { label: 'Border', value: 'currentColor', onPick: (c) => picks.push(c), openPanel: inline })
    box.appendChild(control.element)
    expect(control.element.querySelector<HTMLElement>('.qc-drawing-well-fill')!.style.getPropertyValue('--qcd-swatch')).toBe('currentColor')
    control.element.click()
    // No swatch reads as the current one, because the value is not one the palette holds.
    expect(box.querySelectorAll('[data-qc-active="true"]')).toHaveLength(0)
    box.querySelector<HTMLButtonElement>('[aria-label="Color #000000"]')!.click()
    expect(picks).toEqual(['#000000'])
    control.destroy()
  })
})
