// The buttons at the top right of each pane: move the pane one place up or down, delete it, collapse
// it or open it again, and maximize it or restore it. A pane that is not the top one moves up, and
// one that is not the bottom one moves down; the main pane moves too, and otherwise carries maximize
// alone, only while there is another pane to give way to it. A collapsed pane keeps all four and
// shows its collapse pressed; a maximized pane keeps its moves and its restore, pressed. Each press
// runs the pane operation, or the chart's own move and remove verbs, so the buttons and the commands
// can never disagree.
//
// The buttons show for the pane under the pointer, for every pane always, or never, as the chart
// settings say, and fade in and out. They are DOM in the chart's chrome layer, placed over each pane
// as the chart measures it. The pointer is watched on the element that holds both the gesture box
// and the chrome, so moving from a pane onto its buttons never reads as leaving the pane.
import type { ChartI18n, ChartMessageKey } from '../../i18n'
import type { ChartControlVisibility } from '../../settings/schema'
import { ICONS, type Glyph } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'
import { h, name, stopPointer } from './dom'

/** One pane as its buttons read it. */
export interface PaneFacts {
  index: number
  /** Whether the main series stands in the pane. */
  main: boolean
  /** The pane's top and height in the chrome's pixels. */
  top: number
  height: number
  collapsed: boolean
  maximized: boolean
  /** A maximized pane stands over this one, which carries no buttons while it does. */
  hidden?: boolean
}

/** What a pane button does. */
export type PaneAction = 'moveUp' | 'moveDown' | 'delete' | 'collapse' | 'expand' | 'maximize' | 'restore'

export interface PaneButtonsDeps {
  chrome: HTMLElement
  /** The box the panes' tops and heights are measured in. */
  gestures: HTMLElement
  /** The element that holds the gesture box and the chrome, where the pointer is watched. */
  hoverRoot: HTMLElement
  i18n: ChartI18n
  icons: IconResolver
  visibility(): ChartControlVisibility
  /** Every pane, top to bottom. */
  panes(): readonly PaneFacts[]
  /** How far from the chrome's right edge the plot ends: the right price scale's width. */
  insetEnd(): number
  /** Whether a pane's contents may be removed: the access policy's say over the remove verbs. */
  removable(pane: number): boolean
  /** Whether panes may move that way: the access policy's say over the move verbs. */
  movable(direction: 'up' | 'down'): boolean
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
  { action: 'moveUp', icon: ICONS.paneUp15, label: 'legend.movePaneUp' },
  { action: 'moveDown', icon: ICONS.paneDown15, label: 'legend.movePaneDown' },
  { action: 'delete', icon: ICONS.trash15, label: 'chrome.deletePane' },
  { action: 'collapse', icon: ICONS.paneCollapse15, label: 'legend.collapsePane' },
  { action: 'expand', icon: ICONS.paneExpand15, label: 'legend.restorePane' },
  { action: 'maximize', icon: ICONS.paneMaximize15, label: 'legend.maximizePane' },
  { action: 'restore', icon: ICONS.paneMaximize15, label: 'legend.restorePane' },
]

/** What the policy lets a pane's buttons do beyond collapse, maximize and restore. */
export interface PanePermits {
  remove: boolean
  up: boolean
  down: boolean
}

/** The buttons a pane carries in its state, in their order: the moves first, then delete, collapse
 *  and maximize. A maximized pane keeps only its moves and its restore. */
export function paneActions(pane: PaneFacts, count: number, permits: PanePermits): PaneAction[] {
  const out: PaneAction[] = []
  if (pane.hidden) return out
  if (permits.up && pane.index > 0) out.push('moveUp')
  if (permits.down && pane.index < count - 1) out.push('moveDown')
  if (pane.main) {
    if (count > 1) out.push(pane.maximized ? 'restore' : 'maximize')
    return out
  }
  if (pane.maximized) {
    out.push('restore')
    return out
  }
  if (permits.remove) out.push('delete')
  out.push(pane.collapsed ? 'expand' : 'collapse')
  out.push('maximize')
  return out
}

/** The buttons that stand pressed: an open collapse and an open maximize. */
const PRESSED: Partial<Record<PaneAction, boolean>> = { collapse: false, expand: true, maximize: false, restore: true }

/** How far each part of a button's glyph travels under the pointer, in pixels down: a move's arrow
 *  nudges its way, a collapse or a restore draws its upper and lower halves together, and an expand
 *  or a maximize spreads them. */
const STIR: Readonly<Record<PaneAction, readonly number[]>> = { moveUp: [-2], moveDown: [2], collapse: [1, -1], restore: [1, -1], expand: [-1, 1], maximize: [-1, 1], delete: [] }

/** A motion role's duration in milliseconds, as the stylesheet resolves it on an element: zero under
 *  a reduced-motion preference, which resolves every duration role to zero. */
function durationOf(element: Element, role: string): number {
  const value = getComputedStyle(element).getPropertyValue(role).trim()
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n)) return 0
  return value.endsWith('ms') ? n : value.endsWith('s') ? n * 1000 : n
}

/** Stir a button's glyph once: each part travels out and back over the slower duration role. A
 *  glyph whose parts are not the ones its action moves, as a host's own drawing may be, stays still. */
function stir(button: HTMLElement, action: PaneAction): void {
  const offsets = STIR[action]
  const svg = button.querySelector('svg')
  if (!svg || offsets.length === 0) return
  const parts: Element[] = offsets.length === 1 ? [svg] : [...svg.querySelectorAll('path')]
  if (parts.length !== offsets.length) return
  const duration = durationOf(button, '--qc-motion-durationSlower')
  if (!(duration > 0)) return
  const easing = getComputedStyle(button).getPropertyValue('--qc-motion-easingStandard').trim() || 'ease'
  parts.forEach((part, index) => {
    if (typeof part.animate !== 'function') return
    part.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${offsets[index]}px)` }, { transform: 'translateY(0)' }], { duration, easing })
  })
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
    const up = deps.movable('up')
    const down = deps.movable('down')
    for (const pane of panes) {
      const actions = paneActions(pane, panes.length, { remove: deps.removable(pane.index), up, down })
      if (actions.length === 0) continue
      seen.add(pane.index)
      const group = groupFor(pane.index)
      group.setAttribute('aria-label', t('chrome.paneButtons'))
      group.dataset.qcVisibility = visibility
      group.hidden = visibility === 'never'
      const shown = visibility === 'always' || (visibility === 'hover' && (hovered === pane.index || onGroup === pane.index))
      group.dataset.qcShown = String(shown)
      group.toggleAttribute('inert', !shown)
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
            const pressed = PRESSED[action]
            if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed))
            button.addEventListener('click', () => {
              deps.run(pane.index, action)
              sync()
            })
            button.addEventListener('pointerenter', (event) => {
              if ((event as PointerEvent).pointerType !== 'touch') stir(button, action)
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
  deps.hoverRoot.addEventListener('pointermove', onMove)
  deps.hoverRoot.addEventListener('pointerleave', onLeave)
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
      deps.hoverRoot.removeEventListener('pointermove', onMove)
      deps.hoverRoot.removeEventListener('pointerleave', onLeave)
      for (const group of groups.values()) group.remove()
      groups.clear()
    },
  }
}
