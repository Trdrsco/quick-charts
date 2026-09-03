// @vitest-environment happy-dom
// The DOM vocabulary the drawing surfaces share: roving focus, the focus trap with its
// restoration, outside dismissal, reading direction, and panel placement inside the chart box.
import { afterEach, describe, expect, it } from 'vitest'
import { button, dismissOnOutside, el, focusables, isRtl, placePanel, rovingFocus, trapFocus } from '../../../src/ui/drawings/dom'

afterEach(() => {
  document.body.replaceChildren()
})

describe('el and button', () => {
  it('builds an element with attributes, text, listeners and children', () => {
    let clicks = 0
    const node = el(
      'div',
      {
        class: 'a b',
        'data-x': '1',
        hidden: false,
        on: {
          click: () => {
            clicks++
          },
        },
      },
      'hi',
      el('span', { text: 'there' }),
      null,
      false,
    )
    expect(node.className).toBe('a b')
    expect(node.getAttribute('data-x')).toBe('1')
    expect(node.hasAttribute('hidden')).toBe(false)
    expect(node.textContent).toBe('hithere')
    node.click()
    expect(clicks).toBe(1)
    const b = button({ label: 'Save', text: 'Save', pressed: true, disabled: true })
    expect(b.type).toBe('button')
    expect(b.getAttribute('aria-label')).toBe('Save')
    expect(b.title).toBe('Save')
    expect(b.getAttribute('aria-pressed')).toBe('true')
    expect(b.disabled).toBe(true)
  })
})

describe('roving focus', () => {
  it('keeps one tab stop and moves it with the arrows, Home and End, wrapping', () => {
    const root = el('div')
    const items = [el('button', { text: 'a' }), el('button', { text: 'b' }), el('button', { text: 'c' })]
    root.append(...items)
    document.body.appendChild(root)
    rovingFocus(root, () => items, 'vertical')
    expect(items.map((i) => i.tabIndex)).toEqual([0, -1, -1])
    items[0]!.focus()
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(document.activeElement).toBe(items[1])
    expect(items.map((i) => i.tabIndex)).toEqual([-1, 0, -1])
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    expect(document.activeElement).toBe(items[2])
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    expect(document.activeElement).toBe(items[0])
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) // horizontal keys do nothing in a vertical set
    expect(document.activeElement).toBe(items[0])
  })
})

describe('the focus trap', () => {
  it('wraps Tab both ways and hands focus back to the opener when released', () => {
    const opener = el('button', { text: 'open' })
    const box = el('div', {}, el('button', { text: 'first' }), el('input'), el('button', { text: 'last' }))
    document.body.append(opener, box)
    opener.focus()
    const release = trapFocus(box)
    const list = focusables(box)
    expect(list).toHaveLength(3)
    list[2]!.focus()
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(list[0])
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
    expect(document.activeElement).toBe(list[2])
    release()
    expect(document.activeElement).toBe(opener)
  })
})

describe('dismissal and direction', () => {
  it('closes on a press outside the panel and its anchor, and on Escape', () => {
    const anchor = el('button')
    const panel = el('div', {}, el('button', { text: 'inside' }))
    document.body.append(anchor, panel)
    let closed = 0
    const off = dismissOnOutside(panel, anchor, () => closed++)
    panel.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    anchor.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(closed).toBe(0)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(closed).toBe(1)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(closed).toBe(2)
    off()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(closed).toBe(2)
  })

  it('reads the direction from the nearest dir attribute', () => {
    const root = el('div', { dir: 'rtl' }, el('div', {}, el('span')))
    document.body.appendChild(root)
    expect(isRtl(root.querySelector('span')!)).toBe(true)
    const ltr = el('div', { dir: 'ltr' }, el('span'))
    document.body.appendChild(ltr)
    expect(isRtl(ltr.querySelector('span')!)).toBe(false)
  })

  it('places a panel beside or below its anchor with the position as the one inline write', () => {
    const box = el('div')
    const anchor = el('button')
    const panel = el('div')
    box.append(anchor, panel)
    document.body.appendChild(box)
    placePanel(panel, anchor, box, 'side')
    expect(panel.style.left).toMatch(/px$/)
    expect(panel.style.top).toMatch(/px$/)
    expect(panel.style.maxHeight).toMatch(/px$/)
    placePanel(panel, anchor, box, 'below')
    expect(panel.style.left).toBe('0px')
  })
})
