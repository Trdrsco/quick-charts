// @vitest-environment happy-dom
// The chrome primitives: the menu (roving focus, Escape, outside press, focus restoration), the
// dialog (focus trap, Escape, restoration), the switch, the tabs, and the DOM helpers every surface
// builds with. What is pinned is the keyboard and screen-reader contract, because every picker
// inherits it from here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { armRoving, button, focusables, h, isRtl, items, roveFocus, setDisabled } from '../../src/ui/chrome/dom'
import { menuItem, openMenu } from '../../src/ui/chrome/menu'
import { openDialog, switchControl, switchRow, tabList } from '../../src/ui/chrome/dialog'
import { press } from './harness'

const host = (): HTMLElement => {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the DOM helpers', () => {
  it('builds an element with attributes and skips empty children', () => {
    const el = h('div', { class: 'a', 'aria-label': 'x', hidden: false, title: undefined }, 'text', null, false, h('span'))
    expect(el.className).toBe('a')
    expect(el.getAttribute('aria-label')).toBe('x')
    expect(el.hasAttribute('hidden')).toBe(false)
    expect(el.childNodes.length).toBe(2)
  })

  it('names a button for a screen reader and a hover alike, and disables it both ways', () => {
    const b = button({ label: 'Zoom in', icon: '<path d="M0 0"/>' })
    expect(b.getAttribute('aria-label')).toBe('Zoom in')
    expect(b.title).toBe('Zoom in')
    expect(b.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    setDisabled(b, true)
    expect(b.disabled).toBe(true)
    expect(b.getAttribute('aria-disabled')).toBe('true')
    setDisabled(b, false)
    expect(b.hasAttribute('aria-disabled')).toBe(false)
  })

  it('roves focus among items with wraparound and skips disabled rows', () => {
    const root = host()
    const rows = [1, 2, 3].map((n) => menuItem({ text: `row ${n}` }))
    rows[1]!.disabled = true
    root.append(...rows)
    armRoving(root)
    expect(items(root).length).toBe(2)
    expect(rows[0]!.getAttribute('tabindex')).toBe('0')
    rows[0]!.focus()
    expect(roveFocus(root, new KeyboardEvent('keydown', { key: 'ArrowDown' }))).toBe(true)
    expect(document.activeElement).toBe(rows[2])
    roveFocus(root, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(document.activeElement).toBe(rows[0])
    roveFocus(root, new KeyboardEvent('keydown', { key: 'End' }))
    expect(document.activeElement).toBe(rows[2])
    expect(roveFocus(root, new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false)
  })

  it('lists focusables in order and reads direction from the nearest dir', () => {
    const root = host()
    root.setAttribute('dir', 'rtl')
    root.append(h('button'), h('input', { type: 'text' }), h('span', { tabindex: '-1' }), h('a', { href: '#' }))
    expect(focusables(root).map((el) => el.tagName)).toEqual(['BUTTON', 'INPUT', 'A'])
    expect(isRtl(root.firstElementChild!)).toBe(true)
  })
})

describe('the menu', () => {
  it('opens with focus on the first row, marks the anchor expanded, and closes on Escape back to the anchor', () => {
    const overlays = host()
    const anchor = button({ label: 'open' })
    document.body.appendChild(anchor)
    anchor.focus()
    const onClose = vi.fn()
    const menu = openMenu({
      host: overlays,
      anchor,
      label: 'Styles',
      build(body) {
        body.append(menuItem({ text: 'a' }), menuItem({ text: 'b' }))
      },
      onClose,
    })
    expect(menu.element.getAttribute('role')).toBe('menu')
    expect(menu.element.getAttribute('aria-label')).toBe('Styles')
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement?.textContent).toBe('a')
    press(menu.element, 'ArrowDown')
    expect(document.activeElement?.textContent).toBe('b')
    press(document.activeElement!, 'Escape')
    expect(menu.open()).toBe(false)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(anchor)
    expect(overlays.childElementCount).toBe(0)
  })

  it('closes on a press outside, and stays for a press inside or on its anchor', () => {
    const overlays = host()
    const anchor = button({ label: 'open' })
    document.body.appendChild(anchor)
    const menu = openMenu({ host: overlays, anchor, label: 'm', build: (body) => body.append(menuItem({ text: 'a' })) })
    menu.element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(menu.open()).toBe(true)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(menu.open()).toBe(false)
  })

  it('refreshes its rows in place from the builder', () => {
    const overlays = host()
    const anchor = button({ label: 'open' })
    document.body.appendChild(anchor)
    let count = 1
    const menu = openMenu({
      host: overlays,
      anchor,
      label: 'm',
      build(body) {
        for (let i = 0; i < count; i++) body.append(menuItem({ text: `row ${i}` }))
      },
    })
    expect(items(menu.element).length).toBe(1)
    count = 3
    menu.refresh()
    expect(items(menu.element).length).toBe(3)
    menu.close()
  })

  it('carries radio and disabled state on rows', () => {
    const row = menuItem({ text: 'x', role: 'menuitemradio', checked: true, disabled: true, hint: 'Alt+R' })
    expect(row.getAttribute('aria-checked')).toBe('true')
    expect(row.disabled).toBe(true)
    expect(row.querySelector('.qc-menu-hint')?.textContent).toBe('Alt+R')
  })
})

describe('the dialog', () => {
  it('is modal, traps Tab inside itself, closes on Escape and returns focus', () => {
    const overlays = host()
    const opener = button({ label: 'open' })
    document.body.appendChild(opener)
    opener.focus()
    const dialog = openDialog({
      host: overlays,
      label: 'Search',
      build(box) {
        box.append(button({ label: 'first' }), button({ label: 'last' }))
      },
    })
    expect(dialog.element.getAttribute('role')).toBe('dialog')
    expect(dialog.element.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('first')
    press(document.activeElement!, 'Tab', { shiftKey: true })
    expect(document.activeElement?.getAttribute('aria-label')).toBe('last')
    press(document.activeElement!, 'Tab')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('first')
    press(document.activeElement!, 'Escape')
    expect(dialog.open()).toBe(false)
    expect(document.activeElement).toBe(opener)
  })

  it('closes on a press on its scrim and not on its box', () => {
    const overlays = host()
    const dialog = openDialog({ host: overlays, label: 'd', build: (box) => box.append(button({ label: 'x' })) })
    dialog.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dialog.open()).toBe(true)
    overlays.firstElementChild!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(dialog.open()).toBe(false)
  })
})

describe('switches and tabs', () => {
  it('a switch carries role and state and reports its change', () => {
    const onChange = vi.fn()
    const control = switchControl({ label: 'Autosave', checked: false, onChange })
    expect(control.getAttribute('role')).toBe('switch')
    expect(control.getAttribute('aria-checked')).toBe('false')
    control.click()
    expect(control.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(true)
    const row = switchRow({ label: 'Grid', checked: true, onChange })
    ;(row.firstElementChild as HTMLElement).click()
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('tabs move with arrow keys and mark the selected one', () => {
    const onChange = vi.fn()
    const tabs = tabList({ tabs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], value: 'a', label: 'Pages', onChange })
    document.body.appendChild(tabs.element)
    const [a, b] = [...tabs.element.querySelectorAll('button')]
    expect(a!.getAttribute('aria-selected')).toBe('true')
    a!.focus()
    press(a!, 'ArrowRight')
    expect(b!.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(b)
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
