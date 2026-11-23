// The chart's notices: a stack, newest last, each dismissible and retiring itself after a few
// seconds. A live region, so a screen reader hears a notice as it lands; the motion is the
// stylesheet's and flattens under reduced motion. Over the charts, the region mounts as a sibling of
// the charts grid, a row of no height whose stack floats over the charts from their bottom edge (or
// their top edge), so the grid itself holds nothing but the tiled charts. In a host's own space, the
// region fills that space and the stack stands in the corner or at the edge its placement names.
import type { ChartI18n } from '../../i18n'
import { button, h, name } from './dom'
import { ICONS } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'

export interface ToastsHandle {
  /** The live region the stack stands in. */
  element: HTMLElement
  push(kind: 'info' | 'error', text: string): void
  destroy(): void
}

/** How long a notice stands before it retires itself. */
export const TOAST_MS = 5000

/** Where the notice stack stands in its space: a corner, or the middle of the top or bottom edge. */
export type ToastPlacement = 'top-left' | 'top' | 'top-right' | 'bottom-left' | 'bottom' | 'bottom-right'

/** Every placement, in reading order. */
export const TOAST_PLACEMENTS: readonly ToastPlacement[] = ['top-left', 'top', 'top-right', 'bottom-left', 'bottom', 'bottom-right']

/** Mount the notices over the charts `grid` tiles, beside it, or in `space`, a host element the
 *  region fills. */
export function mountToasts(where: { grid: HTMLElement } | { space: HTMLElement }, deps: { i18n: ChartI18n; icons: IconResolver; placement?: ToastPlacement }): ToastsHandle {
  const t = (): ChartI18n['t'] => deps.i18n.t
  const placement = deps.placement ?? 'bottom'
  const list = h('div', { class: 'qc-toast-stack' })
  const region = h('div', { class: 'qc-toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false', 'data-qc-placement': placement }, list)
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
  const dismiss = (card: HTMLElement): void => {
    const timer = timers.get(card)
    if (timer) clearTimeout(timer)
    timers.delete(card)
    card.remove()
  }
  const offStrings = deps.i18n.onChange(() => {
    for (const b of list.querySelectorAll<HTMLElement>('.qc-toast-dismiss')) name(b, t()('toast.dismiss'))
  })
  if ('space' in where) where.space.appendChild(region)
  else if (placement.startsWith('top')) where.grid.before(region)
  else where.grid.after(region)
  return {
    element: region,
    push(kind, text) {
      const card = h('div', { class: 'qc-overlay qc-toast', 'data-qc-kind': kind }, h('span', { class: `qc-toast-text${kind === 'error' ? ' qc-negative' : ''}` }, text))
      card.appendChild(button({ label: t()('toast.dismiss'), noTip: true, icon: deps.icons.glyph(ICONS.close, { size: 18 }), className: 'qc-toast-dismiss', onClick: () => dismiss(card) }))
      list.appendChild(card)
      timers.set(
        card,
        setTimeout(() => dismiss(card), TOAST_MS),
      )
    },
    destroy() {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      offStrings()
      region.remove()
    },
  }
}
