// Tucking the drawing toolbar away: the pill at the toolbar's inline-end edge, and the attribute the
// boxes that make room for the toolbar wear.
//
// The pill lives inside the toolbar, standing just past its trailing edge, so it rides every slide
// the toolbar makes and stays where the toolbar's edge is. A press writes the widget's one answer;
// every box that makes room for a toolbar follows it through `data-qc-drawing-toolbar`, `true` or
// `collapsed`, and the stylesheet does the rest: the column closes or opens at once and the toolbar
// slides over it.
//
// The pill shows while the pointer is near it, over the toolbar or the chart beside its edge, and
// while it has keyboard focus; on a screen without hover it always shows.
import type { ChartTranslate } from '../../i18n'
import type { ToolbarCollapseStore } from '../chrome/preferences'
import type { IconResolver } from '../icons/resolver'
import { button, ownPointer } from './dom'

/** How close, in pixels on either side of the pill, the pointer brings it out. */
const REVEAL_DISTANCE = 64

export interface ToolbarToggleDeps {
  /** The toolbar the pill stands at the edge of. */
  toolbar: HTMLElement
  store: ToolbarCollapseStore
  t: ChartTranslate
  icons: IconResolver
}

export interface ToolbarToggleHandle {
  /** Name the pill again, after a language switch. */
  relabel(): void
  destroy(): void
}

export function mountToolbarToggle(deps: ToolbarToggleDeps): ToolbarToggleHandle {
  const pill = button({
    class: 'qc-drawing-toolbar-toggle',
    label: '',
    icon: deps.icons.icon('chevronRight16'),
    onClick: () => deps.store.set(!deps.store.get()),
  })
  pill.dataset.role = 'drawing-toolbar-toggle'
  ownPointer(pill)

  const paint = (): void => {
    const collapsed = deps.store.get()
    pill.setAttribute('aria-expanded', String(!collapsed))
    const label = deps.t(collapsed ? 'drawing.showToolbar' : 'drawing.hideToolbar')
    pill.setAttribute('aria-label', label)
    pill.dataset.qcTip = label
  }
  paint()
  deps.toolbar.classList.add('qc-drawing-toolbar--tuckable')
  deps.toolbar.appendChild(pill)
  const unsubscribe = deps.store.subscribe(paint)

  // The pointer is read wherever it is, captured, so neither the chart's own handlers nor a surface
  // that keeps its presses (the toolbar) hide it, and the pill comes out from either side of its edge.
  const doc = deps.toolbar.ownerDocument
  const setNear = (near: boolean): void => {
    if (near !== pill.hasAttribute('data-qc-near')) pill.toggleAttribute('data-qc-near', near)
  }
  const approach = (event: PointerEvent): void => {
    if (!pill.isConnected) return
    const bar = deps.toolbar.getBoundingClientRect()
    const box = pill.getBoundingClientRect()
    const within = event.clientY >= bar.top && event.clientY <= bar.bottom
    setNear(within && Math.abs(event.clientX - (box.left + box.width / 2)) <= REVEAL_DISTANCE)
  }
  const away = (): void => setNear(false)
  doc.addEventListener('pointermove', approach, { capture: true, passive: true })
  doc.documentElement.addEventListener('pointerleave', away)

  return {
    relabel: paint,
    destroy() {
      unsubscribe()
      doc.removeEventListener('pointermove', approach, { capture: true })
      doc.documentElement.removeEventListener('pointerleave', away)
      deps.toolbar.classList.remove('qc-drawing-toolbar--tuckable')
      pill.remove()
    },
  }
}

/** Keep `data-qc-drawing-toolbar` on each box that makes room for a toolbar in step with the
 *  widget's answer. Returns the release, which takes the attribute off. */
export function followToolbarCollapse(store: ToolbarCollapseStore, frames: readonly HTMLElement[]): () => void {
  const paint = (collapsed: boolean): void => {
    for (const frame of frames) frame.dataset.qcDrawingToolbar = collapsed ? 'collapsed' : 'true'
  }
  paint(store.get())
  const unsubscribe = store.subscribe(paint)
  return () => {
    unsubscribe()
    for (const frame of frames) delete frame.dataset.qcDrawingToolbar
  }
}
