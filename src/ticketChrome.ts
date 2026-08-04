// The order ticket's two micro-editors — the pieces the draft chrome reports taps for but never
// owned (the package renders the qty chip and type cell; SOMETHING must edit them). Same chrome
// discipline as the rail/legend: tiny theme-tinted vanilla DOM, self-removing, pointer events
// stopped so an open editor never leaks gestures into the chart. Both are PRE-MONEY: they only
// hand a value back to the ticket controller.
import type { ResolvedTheme } from './host'
import type { TicketOrderType } from './orderTicket'

const TYPES: ReadonlyArray<{ id: TicketOrderType; label: string }> = [
  { id: 'market', label: 'Market' },
  { id: 'limit', label: 'Limit' },
  { id: 'stop', label: 'Stop' },
  { id: 'stop_limit', label: 'Stop Limit' },
]

function surface(container: HTMLElement, rect: { x: number; y: number; w: number; h: number }, theme: ResolvedTheme): HTMLDivElement {
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
  const host = container.getBoundingClientRect()
  const el = document.createElement('div')
  el.style.cssText =
    `position:absolute;left:${Math.max(4, rect.x - host.left)}px;top:${Math.max(4, rect.y - host.top + rect.h + 4)}px;z-index:6;` +
    `background:${theme.background};border:1px solid ${theme.gridColor};border-radius:6px;padding:4px;` +
    `display:flex;gap:4px;align-items:center;font-size:11px;color:${theme.textColor};`
  for (const type of ['pointerdown', 'pointerup', 'pointermove'] as const) el.addEventListener(type, (e) => e.stopPropagation())
  container.appendChild(el)
  return el
}

/** One editor at a time: opening either dismisses whatever is open (tracked per container). */
const OPEN = new WeakMap<HTMLElement, () => void>()
function claim(container: HTMLElement, dismiss: () => void): void {
  OPEN.get(container)?.()
  OPEN.set(container, dismiss)
}

export function openQtyPopover(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  current: number,
  step: number,
  theme: ResolvedTheme,
  onCommit: (qty: number) => void,
): void {
  const el = surface(container, rect, theme)
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '1'
  input.step = String(Math.max(1, step))
  input.value = String(current)
  input.style.cssText = `width:64px;background:transparent;border:1px solid ${theme.gridColor};border-radius:4px;color:${theme.textColor};padding:2px 4px;font-size:11px;outline:none;`
  el.appendChild(input)
  const dismiss = () => {
    el.remove()
    if (OPEN.get(container) === dismiss) OPEN.delete(container)
  }
  claim(container, dismiss)
  input.addEventListener('keydown', (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      const qty = Number(input.value)
      if (Number.isFinite(qty) && qty >= 1) onCommit(Math.round(qty))
      dismiss()
    } else if (e.key === 'Escape') dismiss()
  })
  input.addEventListener('blur', dismiss)
  input.focus({ preventScroll: true })
  input.select()
}

export function openTypeMenu(
  container: HTMLElement,
  rect: { x: number; y: number; w: number; h: number },
  current: string,
  theme: ResolvedTheme,
  onPick: (orderType: TicketOrderType) => void,
): void {
  const el = surface(container, rect, theme)
  el.style.flexDirection = 'column'
  el.style.alignItems = 'stretch'
  const dismiss = () => {
    el.remove()
    if (OPEN.get(container) === dismiss) OPEN.delete(container)
  }
  claim(container, dismiss)
  for (const t of TYPES) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = t.label
    const active = t.label === current
    b.style.cssText =
      `text-align:left;background:none;border:none;cursor:pointer;padding:3px 8px;border-radius:4px;font-size:11px;` +
      `color:${active ? theme.upColor : theme.textColor};`
    b.addEventListener('click', () => {
      onPick(t.id)
      dismiss()
    })
    el.appendChild(b)
  }
  // A click anywhere else dismisses — deferred a tick so the opening tap doesn't self-dismiss.
  setTimeout(() => {
    const away = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) {
        window.removeEventListener('pointerdown', away, true)
        dismiss()
      }
    }
    window.addEventListener('pointerdown', away, { capture: true, once: false })
    const origDismiss = OPEN.get(container)
    OPEN.set(container, () => {
      window.removeEventListener('pointerdown', away, true)
      origDismiss?.()
    })
  }, 0)
}
