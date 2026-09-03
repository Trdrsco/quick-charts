// The floating favorites bar: the starred tools as one-click arms over the chart, draggable by
// its grip, its position and visibility the favorites preference the toolbar's stars fill. It
// renders from the same favorites state the toolbar reads, so the two can never disagree about
// what is starred.
import type { ChartTranslate } from '../../i18n'
import { clampFavoritesPosition, drawingTools, favoritesBarShown, type FavoritesPosition, type FavoritesState } from '../../drawings/index'
import { toolName } from '../../i18n'
import { button, el, ownPointer, rovingFocus } from './dom'
import { iconSvg } from './icons'
import { toolIconSvg } from './toolIcons'

export interface FavoritesBarDeps {
  /** The chrome subtree the bar floats in. */
  chrome: HTMLElement
  t: ChartTranslate
  favorites(): FavoritesState
  activeTool(): string | null
  /** Arm a tool, or release it when it is the armed one. */
  arm(tool: string | null): void
  /** The bar was dragged: persist where it landed. */
  onMove(position: FavoritesPosition): void
}

export interface FavoritesBarHandle {
  /** Re-render from the current favorites state and armed tool. */
  render(): void
  destroy(): void
}

export function mountFavoritesBar(deps: FavoritesBarDeps): FavoritesBarHandle {
  const { t } = deps
  const bar = el('div', { class: 'qc-overlay qc-drawing-favorites', role: 'toolbar', 'aria-label': t('drawing.favToolsBar'), 'data-role': 'drawing-favorites' })
  ownPointer(bar)
  const grip = button({ class: 'qc-drawing-grip', label: t('drawing.moveFavoritesToolbar'), title: t('drawing.moveToolbar'), html: iconSvg('grip', 12) })
  const tools = el('div', { class: 'qc-drawing-favorites-tools' })
  bar.append(grip, tools)

  const place = (): void => {
    const position = deps.favorites().position
    if (position) {
      bar.style.left = `${position.x}px`
      bar.style.top = `${position.y}px`
      bar.style.bottom = ''
    } else {
      bar.style.left = ''
      bar.style.top = ''
      bar.style.bottom = ''
    }
  }

  grip.addEventListener('pointerdown', (e) => {
    const host = deps.chrome.getBoundingClientRect()
    const rect = bar.getBoundingClientRect()
    const offset = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    let last: FavoritesPosition | null = null
    const onMove = (ev: PointerEvent): void => {
      last = clampFavoritesPosition({ x: ev.clientX - host.left - offset.dx, y: ev.clientY - host.top - offset.dy }, { width: rect.width, height: rect.height }, { width: host.width, height: host.height })
      bar.style.left = `${last.x}px`
      bar.style.top = `${last.y}px`
      bar.style.bottom = ''
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (last) deps.onMove(last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    e.preventDefault()
  })

  const unrove = rovingFocus(bar, () => [grip, ...tools.querySelectorAll<HTMLElement>('button')], 'horizontal')

  const render = (): void => {
    const state = deps.favorites()
    const shown = favoritesBarShown(state)
    bar.hidden = !shown
    if (!shown) return
    tools.replaceChildren()
    const active = deps.activeTool()
    for (const type of state.tools) {
      const def = drawingTools.get(type)
      if (!def) continue
      const name = toolName(t, type, def.name)
      const b = button({ class: 'qc-button qc-drawing-favorite', label: name, html: toolIconSvg(type), onClick: () => deps.arm(active === type ? null : type) })
      b.dataset.qcActive = String(active === type)
      b.dataset.tool = type
      tools.appendChild(b)
    }
    place()
  }

  deps.chrome.appendChild(bar)
  render()
  return {
    render,
    destroy() {
      unrove()
      bar.remove()
    },
  }
}
