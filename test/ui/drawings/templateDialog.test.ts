// @vitest-environment happy-dom
// The template dialogs: the name prompt saves a trimmed name on Enter or Save and refuses an empty
// one; the delete confirmation names what dies. Both are modal, trap focus, and give focus back.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import { openTemplateDeleteDialog, openTemplateNameDialog } from '../../../src/ui/drawings/templateDialog'

const t = createChartI18n().t

afterEach(() => {
  document.body.replaceChildren()
})

describe('the template name dialog', () => {
  it('saves a trimmed name on Enter and closes', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const saved: string[] = []
    openTemplateNameDialog({ container, t }, (name) => saved.push(name))
    const dialog = container.querySelector<HTMLElement>('[data-role="drawing-template-name"]')!
    expect(dialog.getAttribute('aria-label')).toBe('Save drawing template')
    const input = dialog.querySelector<HTMLInputElement>('input')!
    expect(document.activeElement).toBe(input)
    const save = dialog.querySelector<HTMLButtonElement>('button[aria-label="Save"]')!
    expect(save.disabled).toBe(true)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(saved).toEqual([])
    input.value = '  Thick red  '
    input.dispatchEvent(new Event('input'))
    expect(save.disabled).toBe(false)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(saved).toEqual(['Thick red'])
    expect(container.querySelector('[data-role="drawing-template-name"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('cancels on Escape, on the close control, and on the scrim', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const saved: string[] = []
    openTemplateNameDialog({ container, t }, (name) => saved.push(name))
    container.querySelector<HTMLElement>('[data-role="drawing-template-name"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(container.querySelector('[data-role="drawing-template-name"]')).toBeNull()
    openTemplateNameDialog({ container, t }, (name) => saved.push(name))
    container.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(container.querySelector('[data-role="drawing-template-name"]')).toBeNull()
    openTemplateNameDialog({ container, t }, (name) => saved.push(name))
    container.querySelector<HTMLElement>('.qc-drawing-dialog-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(container.querySelector('[data-role="drawing-template-name"]')).toBeNull()
    expect(saved).toEqual([])
  })

  it('traps Tab inside the box', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    openTemplateNameDialog({ container, t }, () => undefined)
    const dialog = container.querySelector<HTMLElement>('[data-role="drawing-template-name"]')!
    const input = dialog.querySelector<HTMLInputElement>('input')!
    input.value = 'Mine'
    input.dispatchEvent(new Event('input')) // Save is enabled, so it is the last tab stop
    const buttons = [...dialog.querySelectorAll<HTMLElement>('button')]
    const last = buttons[buttons.length - 1]!
    last.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).toBe(buttons[0])
  })
})

describe('the delete confirmation', () => {
  it('names the template, deletes on confirm only, and focuses the destructive action', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let deleted = 0
    openTemplateDeleteDialog({ container, t }, 'Thick red', () => deleted++)
    const dialog = container.querySelector<HTMLElement>('[data-role="drawing-template-delete"]')!
    expect(dialog.textContent).toContain('"Thick red"')
    const remove = dialog.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!
    expect(document.activeElement).toBe(remove)
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(deleted).toBe(0)
    openTemplateDeleteDialog({ container, t }, 'Thick red', () => deleted++)
    container.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click()
    expect(deleted).toBe(1)
    expect(container.querySelector('[data-role="drawing-template-delete"]')).toBeNull()
  })
})
