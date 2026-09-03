// The chart's notices: a stack at the bottom of the charts, newest last, each dismissible and
// retiring itself after a few seconds. A live region, so a screen reader hears a notice as it
// lands; the motion is the stylesheet's and flattens under reduced motion.
import type { ChartI18n } from '../../i18n'
import { button, h, name } from './dom'
import { ICONS } from './icons'

export interface ToastsHandle {
  push(kind: 'info' | 'error', text: string): void
  destroy(): void
}

/** How long a notice stands before it retires itself. */
export const TOAST_MS = 5000

export function mountToasts(host: HTMLElement, deps: { i18n: ChartI18n }): ToastsHandle {
  const t = (): ChartI18n['t'] => deps.i18n.t
  const list = h('div', { class: 'qc-toasts', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false' })
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
  host.appendChild(list)
  return {
    push(kind, text) {
      const card = h('div', { class: 'qc-overlay qc-toast', 'data-qc-kind': kind }, h('span', { class: `qc-toast-text${kind === 'error' ? ' qc-negative' : ''}` }, text))
      card.appendChild(button({ label: t()('toast.dismiss'), icon: ICONS.close, iconSize: 18, className: 'qc-toast-dismiss', onClick: () => dismiss(card) }))
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
      list.remove()
    },
  }
}
