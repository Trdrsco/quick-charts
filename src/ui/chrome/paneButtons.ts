// The buttons at the top right of each pane: delete the pane, collapse it or open it again, and
// maximize it or restore it. The main pane carries maximize alone, and only while there is another
// pane to give way to it. Each press runs the pane operation the legend's row controls run, or the
// chart's own remove verb, so a pane's buttons and its legend row can never disagree.
//
// The buttons show for the pane under the pointer, for every pane always, or never, as the chart
// settings say. They are DOM in the chart's chrome layer, placed over each pane as the chart
// measures it; the chrome takes no pointer, so the pointer is watched on the gesture box beneath.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { ChartControlVisibility } from '../../settings/schema'
import { ICONS, type Glyph } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'
import { h, name, stopPointer } from './dom'

/** One pane as its buttons read it. */
export interface PaneFacts {
  index: number
  /** The pane's top and height in the chrome's pixels. */
  top: number
  height: number
  collapsed: boolean
  maximized: boolean
}

/** What a pane button does. */
export type PaneAction = 'delete' | 'collapse' | 'expand' | 'maximize' | 'restore'

export interface PaneButtonsDeps {
  chrome: HTMLElement
  gestures: HTMLElement
  i18n: ChartI18n
  icons: IconResolver
  visibility(): ChartControlVisibility
  /** Every pane, top to bottom. */
  panes(): readonly PaneFacts[]
  /** How far from the chrome's right edge the plot ends: the right price scale's width. */
  insetEnd(): number
  /** Whether a pane's contents may be removed: the access policy's say over the remove verbs. */
  removable(pane: number): boolean
  run(pane: number, action: PaneAction): void
}

export interface PaneButtons {
  /** Read the panes, their state and the settings again. */
  sync(): void
  destroy(): void
}

/** The gap from the pane's top and from the plot's right edge. */
const INSET = 4

const BUTTONS: readonly { action: PaneAction; icon: Glyph; label: ChartMessageKey }[] = [
  { action: 'delete', icon: ICONS.trash, label: 'chrome.deletePane' },
  { action: 'collapse', icon: ICONS.paneCollapse15, label: 'legend.collapsePane' },
  { action: 'expand', icon: ICONS.paneExpand15, label: 'legend.restorePane' },
  { action: 'maximize', icon: ICONS.paneMaximize15, label: 'legend.maximizePane' },
  { action: 'restore', icon: ICONS.paneMaximize15, label: 'legend.restorePane' },
]

/** The buttons a pane carries in its state, in their order. */
export function paneActions(pane: PaneFacts, count: number, removable: boolean): PaneAction[] {
  if (pane.index === 0) return count > 1 ? [pane.maximized ? 'restore' : 'maximize'] : []
  const out: PaneAction[] = []
  if (removable) out.push('delete')
  out.push(pane.collapsed ? 'expand' : 'collapse')
  if (!pane.collapsed) out.push(pane.maximized ? 'restore' : 'maximize')
  return out
}

export function mountPaneButtons(deps: PaneButtonsDeps): PaneButtons {
  const t = deps.i18n.t
  const groups = new Map<number, HTMLElement>()
  /** The pane under the pointer, and the one whose buttons the pointer is on. */
  let hovered: number | null = null
  let onGroup: number | null = null

  const groupFor = (index: number): HTMLElement => {
    let group = groups.get(index)
    if (group) return group
    group = h('div', { class: 'qc-pane-buttons', role: 'group', 'data-pane': index })
    stopPointer(group)
    group.addEventListener('pointerenter', () => {
      onGroup = index
    })
    group.addEventListener('pointerleave', () => {
      onGroup = null
      sync()
    })
    deps.chrome.appendChild(group)
    groups.set(index, group)
    return group
  }

  const sync = (): void => {
    const visibility = deps.visibility()
    const panes = deps.panes()
    const seen = new Set<number>()
    for (const pane of panes) {
      const actions = paneActions(pane, panes.length, deps.removable(pane.index))
      if (actions.length === 0) continue
      seen.add(pane.index)
      const group = groupFor(pane.index)
      group.setAttribute('aria-label', t('chrome.paneButtons'))
      group.dataset.qcVisibility = visibility
      group.hidden = visibility === 'never' || (visibility === 'hover' && hovered !== pane.index && onGroup !== pane.index)
      group.style.top = `${Math.round(pane.top + INSET)}px`
      group.style.right = `${Math.round(deps.insetEnd() + INSET)}px`
      const written = actions.join(' ')
      if (group.dataset.actions !== written) {
        group.dataset.actions = written
        group.replaceChildren(
          ...actions.map((action) => {
            const spec = BUTTONS.find((entry) => entry.action === action)!
            const button = h('button', { type: 'button', class: 'qc-pane-button', 'data-action': action })
            button.appendChild(deps.icons.glyph(spec.icon, { size: 15 }))
            name(button, t(spec.label))
            if (action === 'maximize' || action === 'restore') button.setAttribute('aria-pressed', String(action === 'restore'))
            button.addEventListener('click', () => {
              deps.run(pane.index, action)
              sync()
            })
            return button
          }),
        )
      }
    }
    for (const [index, group] of groups) {
      if (seen.has(index)) continue
      group.remove()
      groups.delete(index)
      if (onGroup === index) onGroup = null
    }
  }

  const paneAt = (event: PointerEvent): number | null => {
    const rect = deps.gestures.getBoundingClientRect()
    const y = event.clientY - rect.top
    for (const pane of deps.panes()) if (y >= pane.top && y < pane.top + pane.height) return pane.index
    return null
  }
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return
    const next = paneAt(event)
    if (next === hovered) return
    hovered = next
    sync()
  }
  const onLeave = (): void => {
    if (hovered === null) return
    hovered = null
    sync()
  }
  deps.gestures.addEventListener('pointermove', onMove)
  deps.gestures.addEventListener('pointerleave', onLeave)
  const offStrings = deps.i18n.onChange(() => {
    // The names are written as the buttons are made, so a new language makes them again.
    for (const group of groups.values()) delete group.dataset.actions
    sync()
  })
  sync()

  return {
    sync,
    destroy() {
      offStrings()
      deps.gestures.removeEventListener('pointermove', onMove)
      deps.gestures.removeEventListener('pointerleave', onLeave)
      for (const group of groups.values()) group.remove()
      groups.clear()
    },
  }
}
