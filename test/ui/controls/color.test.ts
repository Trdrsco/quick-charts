// @vitest-environment happy-dom
// The one color control, and the palette it paints. The values and the geometry are pinned:
// ten greys, ten hues, six stated ramps over
// them, 17px cells, and a custom editor with a hex field, a saturation and value square and a hue
// strip. The control reports typed edits and is updated and destroyed explicitly; it never opens
// the operating system's own color dialog, and no consumer keeps a second implementation.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import {
  createColorControl,
  createColorPalette,
  createCustomColorPicker,
  CUSTOM_COLOR_FALLBACK,
  GREY_RAMP,
  hexOf,
  HUE_BASES,
  readColor,
  HUE_RAMPS,
  SWATCH_BLOCKS,
} from '../../../src/ui/controls/color'
import { openInlinePanel } from '../../../src/ui/controls/inlinePanel'

const t = createChartI18n().t
const host = (): HTMLElement => {
  const box = document.createElement('div')
  document.body.appendChild(box)
  return box
}
/** A consumer's panel: the control never mounts an overlay itself. */
const inline = (anchor: HTMLElement, content: HTMLElement, onClosed: () => void): (() => void) => openInlinePanel(anchor, content, anchor, onClosed)

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
})

describe('the palette control', () => {
  it('marks the value, reports a pick, and turns the panel over to the mixer', () => {
    const picks: string[] = []
    const palette = createColorPalette(t, { value: '#2962ff', onPick: (c) => picks.push(c) })
    document.body.appendChild(palette.element)
    const cells = [...palette.element.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')]
    expect(cells).toHaveLength(80)
    expect(cells.find((c) => c.dataset.qcColor === '#2962ff')!.dataset.qcActive).toBe('true')
    cells[0]!.click()
    expect(picks).toEqual(['#ffffff'])
    const plus = palette.element.querySelector<HTMLButtonElement>('.qc-drawing-swatch-plus')!
    plus.click()
    expect(palette.element.querySelector('.qc-drawing-sv')).toBeTruthy()
    expect(palette.element.querySelector('.qc-drawing-hue')).toBeTruthy()
    // Escape inside the palette closes the editor and returns focus to the cell that opened it.
    palette.element.querySelector('.qc-drawing-hex')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(palette.element.querySelector('.qc-drawing-custom')).toBeNull()
    expect(document.activeElement).toBe(plus)
  })

  it('takes an external update without rebuilding its cells', () => {
    const palette = createColorPalette(t, { value: '#2962ff', onPick: () => undefined, opacity: 1, onOpacity: () => undefined })
    document.body.appendChild(palette.element)
    const before = [...palette.element.querySelectorAll('.qc-drawing-swatch')]
    palette.update('#f23645', 0.4)
    const after = [...palette.element.querySelectorAll('.qc-drawing-swatch')]
    expect(after).toEqual(before) // the same nodes, not a remount
    expect(palette.element.querySelector<HTMLButtonElement>('[aria-label="Color #2962ff"]')!.dataset.qcActive).toBeUndefined()
    expect(palette.element.querySelector<HTMLButtonElement>('[aria-label="Color #f23645"]')!.dataset.qcActive).toBe('true')
    expect(palette.element.querySelector<HTMLInputElement>('.qc-drawing-opacity')!.value).toBe('40')
  })
})

describe('the custom editor', () => {
  it('holds a half-typed hex, commits a whole one, and falls back for a value it cannot read', () => {
    const added: string[] = []
    const editor = createCustomColorPicker(t, 'currentColor', (hex) => added.push(hex))
    document.body.appendChild(editor.element)
    const field = editor.element.querySelector<HTMLInputElement>('.qc-drawing-hex')!
    const add = editor.element.querySelector<HTMLButtonElement>('.qc-drawing-add')!
    expect(field.value).toBe(CUSTOM_COLOR_FALLBACK.slice(1))
    field.value = '0f'
    field.dispatchEvent(new Event('input'))
    expect(add.disabled).toBe(true)
    add.click()
    expect(added).toEqual([])
    field.value = 'ff8800'
    field.dispatchEvent(new Event('input'))
    expect(add.disabled).toBe(false)
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
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(strip.getAttribute('aria-valuenow')).not.toBe(start)
    strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }))
    expect(strip.getAttribute('aria-valuenow')).toBe('360')
    const before = square.getAttribute('aria-valuetext')
    square.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(square.getAttribute('aria-valuetext')).not.toBe(before)
    square.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
    expect(square.getAttribute('aria-valuetext')).toBe('#ffffff')
  })

  it('captures the pointer for a drag, releases it on cancel, and reports nothing until committed', () => {
    const added: string[] = []
    const editor = createCustomColorPicker(t, '#808080', (hex) => added.push(hex))
    document.body.appendChild(editor.element)
    const strip = editor.element.querySelector<HTMLElement>('.qc-drawing-hue')!
    const captured: number[] = []
    const released: number[] = []
    strip.setPointerCapture = (id: number): void => void captured.push(id)
    strip.hasPointerCapture = (): boolean => true
    strip.releasePointerCapture = (id: number): void => void released.push(id)
    strip.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: 0, clientY: 0, bubbles: true }))
    strip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 0, clientY: 20, bubbles: true }))
    expect(captured).toEqual([7])
    strip.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7, bubbles: true }))
    expect(released).toEqual([7])
    // A drag is one edit at most: nothing is reported until the viewer commits it.
    expect(added).toEqual([])
    // A move after the release is ignored, so an unmounted editor can report nothing.
    const after = editor.element.querySelector('.qc-drawing-hue')!.getAttribute('aria-valuenow')
    strip.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 0, clientY: 90, bubbles: true }))
    expect(editor.element.querySelector('.qc-drawing-hue')!.getAttribute('aria-valuenow')).toBe(after)
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
