// @vitest-environment happy-dom
// The favorites bar renders the starred tools as arms, hides when empty or switched off, marks the
// armed one, and reports where it was dragged.
import { afterEach, describe, expect, it } from 'vitest'
import { createChartI18n } from '../../../src/i18n'
import type { FavoritesPosition, FavoritesState } from '../../../src/drawings/index'
import { mountFavoritesBar } from '../../../src/ui/drawings/favoritesBar'

const t = createChartI18n().t

function rig(favorites: FavoritesState, activeTool: string | null = null) {
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const armed: (string | null)[] = []
  const moved: FavoritesPosition[] = []
  const state = { favorites, activeTool }
  const bar = mountFavoritesBar({ chrome, t, favorites: () => state.favorites, activeTool: () => state.activeTool, arm: (tool) => armed.push(tool), onMove: (p) => moved.push(p) })
  const root = chrome.querySelector<HTMLElement>('[data-role="drawing-favorites"]')!
  return { chrome, bar, root, state, armed, moved }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('the favorites bar', () => {
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
})
