// @vitest-environment happy-dom
// The drawing dialog's header carries the box, and the drag hears every move and its own end. The
// box keeps its presses to itself, so a move or a release over it never bubbles out to the window:
// the drag follows the pointer over the box all the same, and a release anywhere, a cancelled press
// or the window losing focus each let the box go. Closing the dialog mid-drag leaves nothing
// following the pointer.
import { afterEach, describe, expect, it } from 'vitest'
import { openDialog } from '../../../src/ui/drawings/dialog'
import { openSettingsDialog } from '../../../src/ui/drawings/settingsDialog'
import { createChartI18n } from '../../../src/i18n'
import { drawingTools } from '../../../src/drawings/index'
import { createPresets } from '../../../src/drawings/layer/presets'
import { ownIcons } from '../../ownIcons'

const icons = ownIcons()

afterEach(() => {
  document.body.replaceChildren()
})

function open() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const dialog = openDialog({ container, title: 'Trend line', closeLabel: 'Close', icons, role: 'drawing-settings' })
  const header = dialog.box.querySelector<HTMLElement>('.qc-drawing-dialog-header')!
  return { dialog, header }
}

const pointer = (type: string, target: EventTarget, x: number, y: number): void => {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }))
}

describe('the drawing dialog drag', () => {
  it('follows the pointer over the dialog itself and lets go on a release there', () => {
    const { dialog, header } = open()
    pointer('pointerdown', header, 100, 100)
    pointer('pointermove', header, 140, 130)
    expect(dialog.box.style.position).toBe('fixed')
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['40px', '30px'])
    pointer('pointerup', header, 140, 130)
    pointer('pointermove', document.body, 300, 300)
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['40px', '30px'])
  })

  it('lets go on a release away from the dialog', () => {
    const { dialog, header } = open()
    pointer('pointerdown', header, 100, 100)
    pointer('pointermove', document.body, 160, 150)
    pointer('pointerup', document.body, 160, 150)
    pointer('pointermove', header, 20, 20)
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['60px', '50px'])
  })

  it('lets go on a cancelled press and when the window loses focus', () => {
    const { dialog, header } = open()
    pointer('pointerdown', header, 100, 100)
    pointer('pointermove', header, 110, 110)
    pointer('pointercancel', header, 110, 110)
    pointer('pointermove', header, 200, 200)
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['10px', '10px'])

    pointer('pointerdown', header, 100, 100)
    pointer('pointermove', header, 120, 120)
    window.dispatchEvent(new Event('blur'))
    pointer('pointermove', header, 200, 200)
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['20px', '20px'])
  })

  it('stops following the pointer when the dialog closes mid-drag', () => {
    const { dialog, header } = open()
    pointer('pointerdown', header, 100, 100)
    pointer('pointermove', header, 130, 130)
    dialog.close({ animate: false })
    pointer('pointermove', document.body, 250, 250)
    expect([dialog.box.style.left, dialog.box.style.top]).toEqual(['30px', '30px'])
  })

  it('leaves the box where it is for a press in the name field the header turns into', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const drawing = drawingTools.create('trend_line', 'd1', [{ time: 1000 as never, price: 100 }, { time: 1060 as never, price: 101 }])!
    openSettingsDialog({ chrome: container, t: createChartI18n().t, icons, drawing, presets: createPresets(null), idBase: 'c1', run: () => true, available: () => true })
    const box = container.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
    box.querySelector<HTMLButtonElement>('button[aria-label="Rename"]')!.click()
    const field = box.querySelector<HTMLInputElement>('.qc-drawing-dialog-header input')!
    const press = new PointerEvent('pointerdown', { clientX: 100, clientY: 100, bubbles: true, cancelable: true })
    field.dispatchEvent(press)
    // The press stays the field's own, to place the caret or select the words.
    expect(press.defaultPrevented).toBe(false)
    pointer('pointermove', document.body, 180, 180)
    expect(box.style.position).toBe('')
  })

  it('leaves the box where it is for a press on the close control', () => {
    const { dialog } = open()
    const close = dialog.box.querySelector<HTMLButtonElement>('.qc-drawing-dialog-header button')!
    pointer('pointerdown', close, 100, 100)
    pointer('pointermove', document.body, 180, 180)
    expect(dialog.box.style.position).toBe('')
  })
})
