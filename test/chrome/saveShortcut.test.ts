// @vitest-environment happy-dom
// Ctrl+S, and Cmd+S on a Mac keyboard, save the layout.
//
// The press is not a second save path: it resolves to `widget.layout.save` and runs through the
// registry, so it meets the same access policy, the same availability and the same naming
// controller the menu's Save row meets. A never-saved layout gets the name dialog the menu raises
// rather than a write under a name nobody chose; a press with a write already on its way does not start a
// second one; and the listener is on the chart's own root, so a host's editor keeps its save.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountLayoutsMenu } from '../../src/ui/chrome/layoutsMenu'
import { mountLayoutDialogs } from '../../src/ui/chrome/layoutDialogs'
import { createLayoutListStore } from '../../src/ui/chrome/preferences'
import { attachShortcuts } from '../../src/widget/shortcuts'
import { fakeWidget, settle, type FakeWidgetOptions } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

/** The chart root with the keyboard bound, the saved-layouts menu, and the chrome's name dialog
 *  filling the name-prompt door, which is the arrangement `mountChrome` builds. */
function mounted(options: FakeWidgetOptions = {}) {
  const w = fakeWidget(options)
  const listing = createLayoutListStore(w.storage)
  const dialogs = mountLayoutDialogs({ ...w.ctx, catalog: null, listing, notify: () => undefined })
  const menu = mountLayoutsMenu({ ...w.ctx, catalog: null, autosave: w.autosave, notify: () => undefined, listing, dialogs, changes: w.layoutChanges })
  document.body.appendChild(menu.element)
  w.setNameLayoutDoor(() => {
    dialogs.nameLayout()
    return true
  })
  const root = document.body.appendChild(document.createElement('div'))
  const shortcuts = attachShortcuts({ root, commands: w.commands })
  cleanup.push(() => (shortcuts.dispose(), menu.destroy(), dialogs.destroy(), w.dispose()))
  const press = (over: KeyboardEventInit & { code: string }, target: HTMLElement = root): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true, ...over })
    target.dispatchEvent(event)
    return event
  }
  return { w, menu, root, press }
}

describe('Ctrl and Cmd + S save the layout', () => {
  it('saves the open layout through the save command, once per press', async () => {
    const { w, press } = mounted()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    ;(w.widget.layout.saveLoad.save as ReturnType<typeof vi.fn>).mockClear()
    expect(press({ code: 'KeyS', ctrlKey: true }).defaultPrevented).toBe(true)
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledTimes(1)
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledWith('Desk', { asNew: false })
  })

  it('answers a Command press on a Mac keyboard as the same chord', async () => {
    const { w, press } = mounted()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    ;(w.widget.layout.saveLoad.save as ReturnType<typeof vi.fn>).mockClear()
    expect(press({ code: 'KeyS', metaKey: true }).defaultPrevented).toBe(true)
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledTimes(1)
  })

  it('asks a never-saved layout for its name instead of writing one', async () => {
    const { w, press } = mounted()
    press({ code: 'KeyS', ctrlKey: true })
    await settle()
    expect(w.widget.layout.saveLoad.save).not.toHaveBeenCalled()
    const dialog = w.overlays.querySelector<HTMLElement>('.qc-prompt')
    expect(dialog).not.toBeNull()
    // And the name typed there saves through the same command, so there is one write path.
    const field = dialog!.querySelector<HTMLInputElement>('.qc-name-input')!
    field.value = 'Desk'
    field.dispatchEvent(new Event('input'))
    dialog!.querySelector<HTMLButtonElement>('.qc-prompt-actions .qc-button--primary')!.click()
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledWith('Desk', { asNew: true })
  })

  it('writes once for two presses in a row', async () => {
    const { w, press } = mounted()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    ;(w.widget.layout.saveLoad.save as ReturnType<typeof vi.fn>).mockClear()
    press({ code: 'KeyS', ctrlKey: true })
    press({ code: 'KeyS', ctrlKey: true })
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledTimes(1)
    // And the next press, once the write has landed, saves again.
    press({ code: 'KeyS', ctrlKey: true })
    await settle()
    expect(w.widget.layout.saveLoad.save).toHaveBeenCalledTimes(2)
  })

  it('leaves the press alone while the viewer is typing', async () => {
    const { w, root, press } = mounted()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    ;(w.widget.layout.saveLoad.save as ReturnType<typeof vi.fn>).mockClear()
    const field = root.appendChild(document.createElement('input'))
    expect(press({ code: 'KeyS', ctrlKey: true }, field).defaultPrevented).toBe(false)
    await settle()
    expect(w.widget.layout.saveLoad.save).not.toHaveBeenCalled()
  })

  it('never reaches a press outside the chart root, so a host editor keeps its own save', async () => {
    const { w } = mounted()
    w.commands.execute('widget.layout.save', 'Desk')
    await settle()
    ;(w.widget.layout.saveLoad.save as ReturnType<typeof vi.fn>).mockClear()
    const outside = document.body.appendChild(document.createElement('div'))
    const event = new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true })
    outside.dispatchEvent(event)
    await settle()
    expect(event.defaultPrevented).toBe(false)
    expect(w.widget.layout.saveLoad.save).not.toHaveBeenCalled()
  })

  it('leaves the key to the page when the host access policy refuses layout writes', async () => {
    const { w, press } = mounted({ access: { command: (id) => id !== 'widget.layout.save' } })
    expect(press({ code: 'KeyS', ctrlKey: true }).defaultPrevented).toBe(false)
    await settle()
    expect(w.widget.layout.saveLoad.save).not.toHaveBeenCalled()
  })
})
