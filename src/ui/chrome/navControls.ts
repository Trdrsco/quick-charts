// The on-chart navigation cluster: zoom out, zoom in, scroll back, scroll forward, reset. Five
// buttons over the chart's own view commands, floating at the bottom of the pane and shown while
// the pointer is NEAR them or the keyboard is in the cluster. Every press is a command, so a
// refused verb renders disabled and does nothing.
//
// NEAR, not anywhere on the chart: this cluster sits over the bars, and a viewer reading price
// action at the top of the pane has no use for five buttons fading in at the bottom every time the
// pointer crosses the plot. So the chrome watches the pointer and shows the cluster once it is
// within reach of where the cluster actually is. It cannot be a hover zone in CSS: an element wide
// enough to catch the approach would also swallow the drags, scrolls and clicks the chart owns
// underneath it, and one with `pointer-events: none` never hovers at all.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { CommandRegistry } from '../../widget/commands'
import { button, h, name, setDisabled, stopPointer } from './dom'
import { ICONS, type Glyph } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'

export interface NavControlsDeps {
  /** The chart's chrome subtree — where the cluster mounts. */
  chrome: HTMLElement
  /** The chart's GESTURE box: the layer that actually receives the pointer (the chrome above it
   *  takes none, so a listener there would never hear a pass across the plot). */
  gestures: HTMLElement
  commands: CommandRegistry
  i18n: ChartI18n
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** Whether a tile fills the layout now: the maximize control wears the mark and the name for what
   *  the next press would do. */
  maximized(): boolean
}

/** The five verbs, in the three groups they read in: what the view is worth seeing at, then which
 *  way it moves, then the way back to where it started. The layout's own verb stands between the
 *  first two, where it appears only in a layout with something to maximize into. A back-scroll
 *  turns the one chevron rather than carrying a mirrored copy of it. */
const CONTROLS: readonly { id: string; icon: Glyph; label: ChartMessageKey; group: number; turned?: true }[] = [
  { id: 'chart.view.zoomOut', icon: ICONS.navZoomOut, label: 'range.zoomOut', group: 0 },
  { id: 'chart.view.zoomIn', icon: ICONS.navZoomIn, label: 'range.zoomIn', group: 0 },
  { id: 'chart.view.scrollLeft', icon: ICONS.navScroll, label: 'range.scrollLeft', group: 2, turned: true },
  { id: 'chart.view.scrollRight', icon: ICONS.navScroll, label: 'range.scrollRight', group: 2 },
  { id: 'chart.view.reset', icon: ICONS.navReset, label: 'range.reset', group: 3 },
]

/** The layout's own control, which stands beside the five view verbs only while there is more than
 *  one tile to fill: a single chart has nothing to maximize into. */
const MAXIMIZE = 'widget.layout.toggleMaximize'

export function mountNavControls(deps: NavControlsDeps): { sync(): void; destroy(): void } {
  const t = deps.i18n.t
  const group = h('div', { class: 'qc-nav', role: 'group', 'aria-label': t('chrome.navigation') })
  stopPointer(group)
  // Four boxes in one row: the verbs that belong together sit together, and the space between two
  // groups is twice the space inside one.
  const boxes = [0, 1, 2, 3].map(() => h('div', { class: 'qc-nav-group' }))
  for (const box of boxes) group.appendChild(box)
  const buttons = new Map<string, HTMLButtonElement>()
  for (const control of CONTROLS) {
    const b = button({
      label: t(control.label),
      icon: deps.icons.glyph(control.icon, { size: 18 }),
      className: `qc-nav-button${control.turned ? ' qc-nav-turned' : ''}`,
      onClick: () => deps.commands.execute(control.id),})
    buttons.set(control.id, b)
    boxes[control.group]!.appendChild(b)
  }
  const maximize = button({ label: t('range.maximizeChart'), icon: deps.icons.glyph(ICONS.tileMaximize, { size: 18 }), className: 'qc-nav-button', pressed: false, onClick: () => deps.commands.execute(MAXIMIZE) })
  boxes[1]!.appendChild(maximize)

  const syncMaximize = (): void => {
    const available = deps.commands.available(MAXIMIZE)
    const on = deps.maximized()
    maximize.hidden = !available
    // Its group goes with it: an empty box would still hold the 8px that parts two groups.
    boxes[1]!.hidden = !available
    setDisabled(maximize, !available)
    maximize.setAttribute('aria-pressed', String(on))
    name(maximize, t(on ? 'range.restoreChart' : 'range.maximizeChart'))
    maximize.querySelector('.qc-icon')?.replaceWith(deps.icons.glyph(on ? ICONS.tileRestore : ICONS.tileMaximize, { size: 18 }))
  }

  const sync = (): void => {
    for (const [id, b] of buttons) setDisabled(b, !deps.commands.available(id))
    syncMaximize()
  }
  const relabel = (): void => {
    for (const control of CONTROLS) name(buttons.get(control.id)!, t(control.label))
    syncMaximize()
    group.setAttribute('aria-label', t('chrome.navigation'))
  }
  sync()
  const offCommands = deps.commands.onChange(sync)
  const offStrings = deps.i18n.onChange(relabel)
  deps.chrome.appendChild(group)
  // The reach around the cluster's own box, in CSS pixels: far enough that the buttons are already
  // there when the pointer arrives, near enough that they stay out of the way of the chart.
  const REACH_X = 120
  const REACH_Y = 90
  const near = (e: PointerEvent): boolean => {
    const r = group.getBoundingClientRect()
    if (r.width === 0) return false
    return (
      e.clientX >= r.left - REACH_X && e.clientX <= r.right + REACH_X && e.clientY >= r.top - REACH_Y && e.clientY <= r.bottom + REACH_Y
    )
  }
  const host = deps.gestures
  const onMove = (e: PointerEvent): void => {
    // A finger is not a pointer that hovers: a touch host reaches these through the chart's own
    // gestures, and a cluster that appeared under a scrolling thumb would be in the way.
    if (e.pointerType === 'touch') return
    group.toggleAttribute('data-qc-near', near(e))
  }
  const onLeave = (): void => group.removeAttribute('data-qc-near')
  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerleave', onLeave)
  return {
    sync,
    destroy() {
      offCommands()
      offStrings()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      group.remove()
    },
  }
}
