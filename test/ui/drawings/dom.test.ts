// @vitest-environment happy-dom
// The DOM vocabulary the drawing surfaces share: roving focus, the focus trap with its
// restoration, outside dismissal, reading direction, and panel placement inside the chart box.
import { afterEach, describe, expect, it } from 'vitest'
import { button, dismissOnOutside, el, placePanel, rovingFocus, trapFocus } from '../../../src/ui/drawings/dom'
import { focusables, isRtl } from '../../../src/ui/controls/dom'

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

  it('keeps the whole height of a panel that fits, holding only a taller one to the room left', () => {
    const rect = (x: number, y: number, w: number, h: number) => () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y, toJSON: () => ({}) }) as DOMRect
    const box = el('div')
    const anchor = el('button')
    const panel = el('div')
    box.append(anchor, panel)
    document.body.appendChild(box)
    box.getBoundingClientRect = rect(0, 0, 1280, 720)
    Object.defineProperty(panel, 'offsetWidth', { configurable: true, value: 248 })
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 318 })
    // Under its button with 2px to spare at the box's end: the panel keeps all 318px.
    anchor.getBoundingClientRect = rect(500, 366, 34, 34)
    placePanel(panel, anchor, box, 'below', 0)
    expect(panel.style.top).toBe('400px')
    expect(panel.style.maxHeight).toBe('320px')
    // No room under it: it turns over above its button, whole.
    anchor.getBoundingClientRect = rect(500, 700, 34, 20)
    placePanel(panel, anchor, box, 'below', 0)
    expect(panel.style.top).toBe('382px')
    expect(Number.parseFloat(panel.style.maxHeight)).toBeGreaterThanOrEqual(318)
    // At the box's right edge it moves left to stay inside, never narrowing.
    anchor.getBoundingClientRect = rect(1200, 100, 34, 34)
    placePanel(panel, anchor, box, 'below', 0)
    expect(panel.style.left).toBe(`${1280 - 248}px`)
    // A panel taller than the box is held to the box and scrolls.
    Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 900 })
    placePanel(panel, anchor, box, 'below', 0)
    expect(panel.style.top).toBe('0px')
    expect(panel.style.maxHeight).toBe('720px')
  })

  it.each(['ltr', 'rtl'])('places an external drawing toolbar flyout against its physical anchor inside widget bounds in %s', (dir) => {
    const box = el('div', { dir })
    const anchor = el('button')
    const panel = el('div')
    document.body.append(box, anchor)
    box.appendChild(panel)
    box.getBoundingClientRect = () => ({ left: 60, top: 50, right: 1060, bottom: 750, width: 1000, height: 700 }) as DOMRect
    anchor.getBoundingClientRect = () => ({ left: 10, top: 90, right: 48, bottom: 128, width: 38, height: 38 }) as DOMRect
    Object.defineProperties(panel, { offsetWidth: { value: 192 }, offsetHeight: { value: 200 } })
    placePanel(panel, anchor, box, 'side')
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('40px')
    anchor.getBoundingClientRect = () => ({ left: 10, top: 620, right: 48, bottom: 658, width: 38, height: 38 }) as DOMRect
    placePanel(panel, anchor, box, 'side')
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('500px')
  })

  // A submenu is level with its row and flush to the row's outer edge, with no offset at all: a
  // pointer travelling from the row into the panel crosses nothing that would close it. Without
  // room on that side it mirrors to the other, keeping the same zero offset.
  it('places a sidecar level with its row and flush to its edge, mirroring without room', () => {
    const box = el('div')
    const row = el('button')
    const panel = el('div')
    box.append(row, panel)
    document.body.appendChild(box)
    box.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }) as DOMRect
    row.getBoundingClientRect = () => ({ left: 100, top: 200, right: 332, bottom: 234, width: 232, height: 34 }) as DOMRect
    Object.defineProperties(panel, { offsetWidth: { value: 176 }, offsetHeight: { value: 150 } })
    placePanel(panel, row, box, 'sidecar')
    expect(panel.style.left).toBe('332px')
    expect(panel.style.top).toBe('200px')
    row.getBoundingClientRect = () => ({ left: 760, top: 200, right: 992, bottom: 234, width: 232, height: 34 }) as DOMRect
    placePanel(panel, row, box, 'sidecar')
    expect(panel.style.left).toBe('584px')
    expect(panel.style.top).toBe('200px')
  })

  it('hangs a below-end panel with its inline-end edge level with the anchor', () => {
    const box = el('div')
    const anchor = el('button')
    const panel = el('div')
    box.append(anchor, panel)
    document.body.appendChild(box)
    box.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 700, width: 1000, height: 700 }) as DOMRect
    anchor.getBoundingClientRect = () => ({ left: 500, top: 200, right: 538, bottom: 238, width: 38, height: 38 }) as DOMRect
    Object.defineProperties(panel, { offsetWidth: { value: 240 }, offsetHeight: { value: 150 } })
    placePanel(panel, anchor, box, 'below-end')
    expect(panel.style.left).toBe('298px')
    // A panel opens a hair clear of its anchor: close enough that the control and what it opened
    // read as one move.
    expect(panel.style.top).toBe('240px')
    placePanel(panel, anchor, box, 'below')
    expect(panel.style.left).toBe('500px')
  })
})
