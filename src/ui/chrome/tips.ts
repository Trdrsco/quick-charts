// The chart's name bubble: one per widget, standing in the widget's layer on the document body, and
// shared by every surface the widget mounts (its root, a top bar or drawing toolbar a page placed in
// its own frame, and the layer its menus and dialogs open in). Each surface is watched by
// delegation and marked `data-qc-tips`, so a page's own bubble knows to leave it alone.
//
// A control names its bubble with `data-qc-tip`, which wins, or with its accessible name. A control
// whose own visible words already say its name raises none, and neither does one marked
// `data-no-tip` (a close X, which says what it does), nor one standing expanded over the menu or
// dialog it opened. The first bubble waits for the pointer to rest; once one has shown, the next
// control's shows at once, and stays warm a moment after one hides. A press, a scroll, the pointer
// leaving and the window losing focus put it away, and a finger raises none. The bottom bar also
// shows its bubbles for keyboard focus.
//
// It opens 4px from its control, centred on it and held inside the chart's box and the window: a
// vertical toolbar's sideways toward the room, the top bar's and a pane legend's below, the bottom
// bar's above, and everything else's above where there is room and below otherwise. Its ear faces the control and
// stays centred on it however far the bubble was moved to fit.
import { h } from './dom'

/** How long the pointer rests on the first control before its bubble shows, in milliseconds. */
export const TIP_DELAY = 400
/** How long after a bubble hides the next control's still shows at once, in milliseconds. */
export const TIP_WARM = 600
/** The gap between a control and its bubble, which the ear spans. */
const GAP = 4
/** The margin a bubble keeps from the edges it is held inside. */
const EDGE = 4
/** The ear's half width: the closest its centre stands to the bubble's corner. */
const EAR = 6

/** The elements a bubble may name by their accessible name alone. */
const CONTROL = 'button, [role="button"], [role="tab"], a[href]'

/** Where a bubble stands against its control. */
export type TipSide = 'top' | 'bottom' | 'left' | 'right'

/** How a control's bubble opens: sideways, below, above, or above where there is room. */
export type TipZone = 'side' | 'below' | 'above' | 'auto'

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The words a control's bubble shows: its `data-qc-tip`, or its accessible name, or none when its
 *  own visible words already say them or it is marked `data-no-tip`. */
export function tipText(element: HTMLElement): string | null {
  if (element.hasAttribute('data-no-tip')) return null
  const words = element.dataset.qcTip ?? element.getAttribute('aria-label') ?? ''
  const said = words.replace(/\s+/g, ' ').trim()
  if (said === '') return null
  const visible = (element.textContent ?? '').replace(/\s+/g, ' ').trim()
  return visible === said ? null : words.trim()
}

/** The element a bubble names under a pointer or focus target, inside a surface: the nearest that
 *  carries words of its own, or the nearest control, which names it by its accessible name. */
export function tipTarget(target: EventTarget | null, surface: HTMLElement): HTMLElement | null {
  let node = target instanceof Element ? target : null
  while (node && surface.contains(node)) {
    if (node instanceof HTMLElement) {
      if (node.hasAttribute('data-qc-tip') || node.hasAttribute('data-no-tip')) return node
      if (node.matches(CONTROL)) return node.hasAttribute('aria-label') ? node : null
    }
    if (node === surface) break
    node = node.parentElement
  }
  return null
}

/** Whether a control stands expanded over the popup it opened: a menu or dialog trigger whose
 *  popup is up. A control that discloses in place keeps its bubble either way. */
export function popupOpen(control: HTMLElement): boolean {
  return control.getAttribute('aria-expanded') === 'true' && control.hasAttribute('aria-haspopup')
}

/** How a control's bubble opens, from where it stands. */
export function tipZone(control: HTMLElement): TipZone {
  if (control.closest('[role="toolbar"][aria-orientation="vertical"]')) return 'side'
  // A pane's legend stands at the pane's top, over its own plot, so its bubbles open down into it.
  if (control.closest('.qc-topbar, .qc-legend')) return 'below'
  if (control.closest('.qc-bottombar')) return 'above'
  return 'auto'
}

const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(value, Math.max(low, high)))

/** Where a bubble of a size stands for a control: its corner, the side it takes, and its ear's
 *  offset along the edge that faces the control, measured from the bubble's own corner. */
export function placeTip(control: Box, bubble: { width: number; height: number }, zone: TipZone, bounds: Box): { left: number; top: number; side: TipSide; ear: number } {
  const centreX = (control.left + control.right) / 2
  const centreY = (control.top + control.bottom) / 2
  if (zone === 'side') {
    const side: TipSide = centreX <= (bounds.left + bounds.right) / 2 ? 'right' : 'left'
    const left = side === 'right' ? control.right + GAP : control.left - GAP - bubble.width
    const top = clamp(centreY - bubble.height / 2, bounds.top + EDGE, bounds.bottom - EDGE - bubble.height)
    return { left, top, side, ear: clamp(centreY - top, EAR, bubble.height - EAR) }
  }
  const above = control.top - GAP - bubble.height
  const side: TipSide = zone === 'above' || (zone === 'auto' && above >= bounds.top + EDGE) ? 'top' : 'bottom'
  const top = side === 'top' ? above : control.bottom + GAP
  const left = clamp(centreX - bubble.width / 2, bounds.left + EDGE, bounds.right - EDGE - bubble.width)
  return { left, top, side, ear: clamp(centreX - left, EAR, bubble.width - EAR) }
}

export interface TipsHandle {
  /** The bubble, for a test to read. */
  readonly element: HTMLElement
  /** Watch a surface: mark it `data-qc-tips` and name its controls with the bubble. Returns what
   *  stops the watch. */
  watch(surface: HTMLElement): () => void
  /** Put the bubble away now. */
  hide(): void
  destroy(): void
}

/** The widget's one bubble, standing in `layer`. */
export function attachTips(layer: HTMLElement): TipsHandle {
  const bubble = h('div', { class: 'qc-tip', 'aria-hidden': 'true' })
  bubble.hidden = true
  layer.appendChild(bubble)
  /** The control the bubble names, shown or waiting to show. */
  let current: HTMLElement | null = null
  /** A control just pressed: it raises no bubble again until the pointer leaves it. */
  let pressed: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Until when a bubble shows at once, because one has just hidden. */
  let warmUntil = 0
  const releases: (() => void)[] = []

  const clear = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  const hide = (): void => {
    clear()
    if (!bubble.hidden) warmUntil = Date.now() + TIP_WARM
    bubble.hidden = true
    current = null
  }

  const show = (control: HTMLElement): void => {
    clear()
    const words = control.isConnected && !popupOpen(control) ? tipText(control) : null
    if (!words) {
      hide()
      return
    }
    bubble.textContent = words
    bubble.hidden = false
    bubble.style.visibility = 'hidden'
    bubble.style.left = '0px'
    bubble.style.top = '0px'
    const size = bubble.getBoundingClientRect()
    const rect = control.getBoundingClientRect()
    const view: Box = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    const root = control.closest('.qc-root')?.getBoundingClientRect()
    const bounds: Box = root && root.width > 0 && root.height > 0
      ? { left: Math.max(view.left, root.left), top: Math.max(view.top, root.top), right: Math.min(view.right, root.right), bottom: Math.min(view.bottom, root.bottom) }
      : view
    const placed = placeTip(rect, { width: size.width, height: size.height }, tipZone(control), bounds)
    bubble.dataset.qcSide = placed.side
    bubble.style.left = `${Math.round(placed.left)}px`
    bubble.style.top = `${Math.round(placed.top)}px`
    bubble.style.setProperty('--qcd-tip-ear', `${Math.round(placed.ear)}px`)
    bubble.style.visibility = ''
  }

  /** Show a control's bubble at once while one is up or has just hidden, or after the rest. */
  const offer = (control: HTMLElement): void => {
    if (control === current) return
    clear()
    const warm = !bubble.hidden || Date.now() < warmUntil
    if (!bubble.hidden) bubble.hidden = true
    current = control
    if (warm) show(control)
    else timer = setTimeout(() => current === control && show(control), TIP_DELAY)
  }

  const onWindowBlur = (): void => hide()
  const onScroll = (): void => hide()
  window.addEventListener('blur', onWindowBlur)
  window.addEventListener('scroll', onScroll, true)

  const watch = (surface: HTMLElement): (() => void) => {
    surface.setAttribute('data-qc-tips', '')
    const onOver = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') {
        hide()
        return
      }
      const control = tipTarget(event.target, surface)
      if (control && control === pressed) return
      pressed = null
      if (control) offer(control)
      else if (current) hide()
    }
    const onOut = (event: PointerEvent): void => {
      const next = event.relatedTarget
      if (current && !(next instanceof Node && current.contains(next))) hide()
      if (pressed && !(next instanceof Node && pressed.contains(next))) pressed = null
    }
    const onDown = (event: PointerEvent): void => {
      pressed = tipTarget(event.target, surface)
      hide()
    }
    // The bottom bar answers keyboard focus as the pointer's rest.
    const onFocus = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('.qc-bottombar')) return
      let visible = false
      try {
        visible = target.matches(':focus-visible')
      } catch {
        visible = false
      }
      const control = visible ? tipTarget(target, surface) : null
      if (control) offer(control)
    }
    const onBlur = (event: FocusEvent): void => {
      if (current && event.target instanceof Node && current.contains(event.target)) hide()
    }
    surface.addEventListener('pointerover', onOver)
    surface.addEventListener('pointerout', onOut)
    surface.addEventListener('pointerdown', onDown, true)
    surface.addEventListener('focusin', onFocus)
    surface.addEventListener('focusout', onBlur)
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      surface.removeAttribute('data-qc-tips')
      surface.removeEventListener('pointerover', onOver)
      surface.removeEventListener('pointerout', onOut)
      surface.removeEventListener('pointerdown', onDown, true)
      surface.removeEventListener('focusin', onFocus)
      surface.removeEventListener('focusout', onBlur)
      if (current && surface.contains(current)) hide()
    }
    releases.push(release)
    return release
  }

  return {
    element: bubble,
    watch,
    hide,
    destroy() {
      for (const release of releases.splice(0)) release()
      hide()
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('scroll', onScroll, true)
      bubble.remove()
    },
  }
}
