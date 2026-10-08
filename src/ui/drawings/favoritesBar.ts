// The floating favorites bar: the starred tools as one-click arms over the chart, draggable by
// its grip, its position and visibility the favorites preference the toolbar's stars fill. It
// renders from the same favorites state the toolbar reads, so the two can never disagree about
// what is starred.
import type { ChartTranslate } from '../../i18n'
import { clampFavoritesPosition, drawingTools, favoritesBarShown, pruneFavorites, type FavoritesPosition, type FavoritesState } from '../../drawings/index'
import { toolName } from '../../i18n'
import { button, dragUntilRelease, el, followHostSize, ownPointer, paintedPosition, rovingFocus } from './dom'
import type { IconResolver } from '../icons/resolver'

export interface FavoritesBarDeps {
  /** The chrome subtree the bar floats in. */
  chrome: HTMLElement
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  favorites(): FavoritesState
  activeTool(): string | null
  /** Arm a tool, or release it when it is the armed one. */
  arm(tool: string | null): void
  /** Whether the registry would arm a tool now; every arm renders disabled otherwise. */
  available(): boolean
  /** Whether the access policy permits a tool. A refused tool renders disabled. */
  toolAllowed(tool: string): boolean
  /** Whether the bar draws a starred tool at all. A tool it leaves out keeps its star, and the bar
   *  draws it again once this says so. Without it, every starred tool the catalog holds is drawn. */
  toolShown?(tool: string): boolean
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
  const grip = button({ class: 'qc-drawing-grip', label: t('drawing.moveFavoritesToolbar'), title: t('drawing.moveToolbar'), icon: deps.icons.icon('grip', 12) })
  const tools = el('div', { class: 'qc-drawing-favorites-tools' })
  bar.append(grip, tools)

  const place = (): void => {
    const remembered = deps.favorites().position
    if (remembered) {
      const position = paintedPosition(remembered, bar, deps.chrome)
      bar.style.left = `${position.x}px`
      bar.style.top = `${position.y}px`
      // AUTO, not empty. The recipe anchors this bar to the bottom of the pane, and an empty string
      // drops the inline copy rather than the rule: a box placed by both a top and a bottom is
      // stretched between them, and this one reflows into a tall column that reads as a resize.
      bar.style.bottom = 'auto'
    } else {
      bar.style.left = ''
      bar.style.top = ''
      bar.style.bottom = ''
    }
  }

  // Moving the bar, through the one drag every floating surface here uses.
  grip.addEventListener('pointerdown', (e) => {
    const host = deps.chrome.getBoundingClientRect()
    const rect = bar.getBoundingClientRect()
    const offset = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    let last: FavoritesPosition | null = null
    const onMove = (ev: PointerEvent): void => {
      last = clampFavoritesPosition({ x: ev.clientX - host.left - offset.dx, y: ev.clientY - host.top - offset.dy }, { width: rect.width, height: rect.height }, { width: host.width, height: host.height })
      bar.style.left = `${last.x}px`
      bar.style.top = `${last.y}px`
      bar.style.bottom = 'auto'
    }
    // A press with no movement is a press, not a move: nothing is reported and nothing is saved.
    dragUntilRelease(onMove, () => {
      if (last) deps.onMove(last)
    })
    e.preventDefault()
  })

  const unrove = rovingFocus(bar, () => [grip, ...tools.querySelectorAll<HTMLElement>('button')], 'horizontal')
  // A panel opening beside the chart narrows the box this bar floats in; the bar moves in with it.
  const unfollow = followHostSize(deps.chrome, place)

  const render = (): void => {
    // The starred tools the bar draws: those the catalog holds and the host shows. A star on a type
    // the catalog does not hold draws nothing, so it never keeps an empty bar standing. The favorites
    // themselves are never rewritten here.
    const state = pruneFavorites(deps.favorites(), (type) => drawingTools.has(type))
    const listed = state.tools.filter((type) => deps.toolShown?.(type) ?? true)
    const shown = favoritesBarShown({ ...state, tools: listed })
    bar.hidden = !shown
    // A hidden bar holds no controls at all, so a census of the chart's buttons and a keyboard
    // walk both meet only what a viewer can reach.
    if (!shown) {
      bar.replaceChildren()
      return
    }
    if (!bar.contains(grip)) bar.append(grip, tools)
    tools.replaceChildren()
    const active = deps.activeTool()
    for (const type of listed) {
      const def = drawingTools.get(type)
      if (!def) continue
      const name = toolName(t, type, def.name)
      const b = button({ class: 'qc-button qc-drawing-favorite', label: name, icon: deps.icons.tool(type), disabled: !deps.available() || !deps.toolAllowed(type), onClick: () => deps.arm(active === type ? null : type) })
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
      unfollow()
      unrove()
      bar.remove()
    },
  }
}
