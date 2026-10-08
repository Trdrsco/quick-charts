// @vitest-environment happy-dom
// The favorites bar renders the starred tools as arms, hides when empty or switched off, marks the
// armed one, and reports where it was dragged.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import type { FavoritesPosition, FavoritesState } from '../../../src/drawings/index'
import { mountFavoritesBar } from '../../../src/ui/drawings/favoritesBar'
import { ownIcons } from '../../ownIcons'

const t = createChartI18n().t

function rig(favorites: FavoritesState, activeTool: string | null = null, gate: { available?: boolean; refuse?: string[] } = {}) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const armed: (string | null)[] = []
  const moved: FavoritesPosition[] = []
  const state = { favorites, activeTool }
  const bar = mountFavoritesBar({
    icons: ownIcons(),
    chrome,
    t,
    favorites: () => state.favorites,
    activeTool: () => state.activeTool,
    arm: (tool) => armed.push(tool),
    available: () => gate.available ?? true,
    toolAllowed: (tool) => !(gate.refuse ?? []).includes(tool),
    onMove: (p) => moved.push(p),
  })
  const root = chrome.querySelector<HTMLElement>('[data-role="drawing-favorites"]')!
  return { chrome, bar, root, state, armed, moved }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the favorites bar', () => {
  it('renders a refused tool disabled, and every arm disabled while the registry would not arm', () => {
    const a = rig({ tools: ['trend_line', 'rectangle'], visible: true, position: null }, null, { refuse: ['rectangle'] })
    const arms = () => [...a.root.querySelectorAll<HTMLButtonElement>('.qc-drawing-favorite')]
    expect(arms().map((b) => b.disabled)).toEqual([false, true])
    arms()[1]!.click()
    expect(a.armed).toEqual([])
    const b = rig({ tools: ['trend_line', 'rectangle'], visible: true, position: null }, null, { available: false })
    expect([...b.root.querySelectorAll<HTMLButtonElement>('.qc-drawing-favorite')].map((x) => x.disabled)).toEqual([true, true])
  })

  it('renders one named arm per starred tool and hides with nothing starred', () => {
    const { root, state, bar } = rig({ tools: ['trend_line', 'rectangle'], visible: true, position: null })
    expect(root.getAttribute('role')).toBe('toolbar')
    expect(root.hidden).toBe(false)
    const arms = [...root.querySelectorAll<HTMLElement>('.qc-drawing-favorite')]
    expect(arms.map((a) => a.getAttribute('aria-label'))).toEqual(['Trend line', 'Rectangle'])
    state.favorites = { tools: [], visible: true, position: null }
    bar.render()
    expect(root.hidden).toBe(true)
    state.favorites = { tools: ['ray'], visible: false, position: null }
    bar.render()
    expect(root.hidden).toBe(true)
  })

  it('draws no arm for a starred type the catalog does not hold, and hides when it is the only star', () => {
    // A content card starred by a chart that drew one is such a type.
    const { root, state, bar } = rig({ tools: ['content_card', 'rectangle'], visible: true, position: null })
    expect(root.hidden).toBe(false)
    expect([...root.querySelectorAll<HTMLElement>('.qc-drawing-favorite')].map((b) => b.dataset.tool)).toEqual(['rectangle'])
    state.favorites = { tools: ['content_card'], visible: true, position: null }
    bar.render()
    expect(root.hidden).toBe(true)
    expect(root.querySelectorAll('button')).toHaveLength(0)
  })

  it('arms a tool, releases the armed one, and marks it', () => {
    const { root, state, bar, armed } = rig({ tools: ['trend_line'], visible: true, position: null })
    root.querySelector<HTMLElement>('.qc-drawing-favorite')!.click()
    expect(armed).toEqual(['trend_line'])
    state.activeTool = 'trend_line'
    bar.render()
    const arm = root.querySelector<HTMLElement>('.qc-drawing-favorite')!
    expect(arm.dataset.qcActive).toBe('true')
    arm.click()
    expect(armed[1]).toBeNull()
  })

  it('takes its stored position, and reports a drag by the grip', () => {
    const { root, moved } = rig({ tools: ['ray'], visible: true, position: { x: 40, y: 30 } })
    expect(root.style.left).toBe('40px')
    expect(root.style.top).toBe('30px')
    const grip = root.querySelector<HTMLElement>('.qc-drawing-grip')!
    expect(grip.getAttribute('aria-label')).toBe('Move favorites toolbar')
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 25, clientY: 18 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 25, clientY: 18 }))
    expect(moved).toEqual([{ x: 0, y: 0 }]) // the test document has no size, so the clamp lands at the origin
  })

  it('is one row of fixed cells with a grip and no resize affordance', () => {
    const { root } = rig({ tools: ['trend_line', 'rectangle', 'ray'], visible: true, position: null })
    // The grip is one control, ahead of the arms; the arms are the tools, in the starred order.
    const controls = [...root.querySelectorAll<HTMLElement>('button')]
    expect(controls[0]!.className).toContain('qc-drawing-grip')
    expect(controls.filter((b) => b.className.includes('qc-drawing-grip'))).toHaveLength(1)
    expect([...root.querySelectorAll<HTMLElement>('.qc-drawing-favorite')].map((b) => b.dataset.tool)).toEqual(['trend_line', 'rectangle', 'ray'])
    // Nothing in the strip is a resizer, and the strip writes no size of its own.
    expect(root.querySelector('[class*="resize"]')).toBeNull()
    expect(root.style.width).toBe('')
    expect(root.style.height).toBe('')
  })

  it('a drag moves the strip and changes nothing else about it', () => {
    const { root, moved } = rig({ tools: ['trend_line', 'ray'], visible: true, position: { x: 40, y: 30 } })
    const before = [...root.querySelectorAll<HTMLElement>('.qc-drawing-favorite')].map((b) => `${b.dataset.tool}:${b.className}`)
    const grip = root.querySelector<HTMLElement>('.qc-drawing-grip')!
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 44, bubbles: true }))
    grip.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 44, bubbles: true }))
    expect(moved).toHaveLength(1)
    expect([...root.querySelectorAll<HTMLElement>('.qc-drawing-favorite')].map((b) => `${b.dataset.tool}:${b.className}`)).toEqual(before)
    expect(root.style.width).toBe('')
    expect(root.style.height).toBe('')
  })

  it('a press with no movement moves nothing', () => {
    const { root, moved } = rig({ tools: ['ray'], visible: true, position: { x: 40, y: 30 } })
    const grip = root.querySelector<HTMLElement>('.qc-drawing-grip')!
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    grip.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true }))
    expect(moved).toEqual([])
    expect(root.style.left).toBe('40px')
  })

  // The bar keeps its own pointer events to itself, so a release over it is stopped on the way out
  // and a BUBBLE listener never hears it: the drag takes the capture phase, which runs before the
  // event reaches the bar at all. Every way a pointer can end a drag ends this one.
  it.each(['pointerup', 'pointercancel'] as const)('releases the drag on %s, once, with no listener left behind', (ending) => {
    const { root, moved } = rig({ tools: ['ray'], visible: true, position: { x: 40, y: 30 } })
    const grip = root.querySelector<HTMLElement>('.qc-drawing-grip')!
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 30, clientY: 22, bubbles: true }))
    grip.dispatchEvent(new PointerEvent(ending, { clientX: 30, clientY: 22, bubbles: true }))
    expect(moved).toHaveLength(1)
    const after = root.style.left
    // The drag is over: further movement, and a second ending, change nothing.
    grip.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 200, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 300 }))
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 300 }))
    expect(root.style.left).toBe(after)
    expect(moved).toHaveLength(1)
  })
})


describe('where the bar sits', () => {
  // The recipe anchors the bar to the BOTTOM of the pane. A placed bar therefore has to cancel that
  // anchor, not merely drop its own inline copy of it: an absolutely placed box with both a top and
  // a bottom is stretched between them, and this one would reflow into a tall narrow column that
  // reads as a resize. Only `auto` cancels a stylesheet rule from an inline style.
  it('cancels the bottom anchor when it is placed, so nothing stretches it', () => {
    const { root } = rig({ tools: ['ray'], visible: true, position: { x: 40, y: 30 } })
    expect(root.style.top).toBe('30px')
    expect(root.style.bottom).toBe('auto')
  })

  it('cancels it while being dragged, not only once it lands', () => {
    const { root } = rig({ tools: ['ray'], visible: true, position: { x: 40, y: 30 } })
    const grip = root.querySelector<HTMLElement>('.qc-drawing-grip')!
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 44 }))
    expect(root.style.bottom).toBe('auto')
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 44 }))
  })

  it('gives the anchor back when it has no placement of its own', () => {
    const { root } = rig({ tools: ['ray'], visible: true, position: null })
    // Nothing inline at all, so the recipe's own corner applies.
    expect(root.style.top).toBe('')
    expect(root.style.bottom).toBe('')
  })
})
