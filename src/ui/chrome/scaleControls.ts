// The controls that stand on the main price scale: the box at its top that names what prices are
// in (the symbol's currency and unit), the auto-scale and logarithmic buttons at its foot, and the
// door to the plus beside the crosshair's price label, which opens that price's menu. The box and
// the buttons show while the pointer is over the scale, always, or never, as the chart settings say.
// Each press is the chart's own verb, so the controls and every other door to the same state read
// alike.
//
// The scale is drawn by the renderer, so these are DOM in the chart's chrome layer, placed over the
// scale's box as the chart measures it. The chrome takes no pointer, so the pointer is watched on
// the gesture box beneath it; the buttons take it back while it is over them.
//
// The plus itself is painted by the renderer with the crosshair's label. Each paint reports the box
// it drew, and the plus's button stands exactly there: a transparent target that carries the plus's
// name and takes the keyboard. It takes no pointer, so a pointer resting on the plus stays on the
// plot and keeps the crosshair and its label; a press that lands in the painted box is taken at the
// gesture box before the plot hears it, and its release opens the menu.
import type { ChartI18n } from '../../i18n'
import type { ChartControlVisibility } from '../../settings/schema'
import { h, name, stopPointer } from './dom'

/** The main price scale's box in the chrome's own pixels, and the side it stands on. */
export interface PriceScaleBox {
  left: number
  top: number
  width: number
  height: number
  side: 'left' | 'right'
}

export interface ScaleControlsDeps {
  /** The chart's chrome subtree: where the controls mount. */
  chrome: HTMLElement
  /** The gesture box under the chrome, which hears the pointer. */
  gestures: HTMLElement
  i18n: ChartI18n
  /** The main price scale's box, or null while the chart shows none. */
  box(): PriceScaleBox | null
  /** When the auto-scale and logarithmic buttons show. */
  modeButtons(): ChartControlVisibility
  /** When the currency and unit box shows, and what it names: the symbol's currency and unit,
   *  either of which it may not state. */
  unitBox(): ChartControlVisibility
  currencyAndUnit(): { currency?: string; unit?: string } | null
  /** Whether the scale frames itself, and whether it is logarithmic. */
  autoScale(): boolean
  logScale(): boolean
  toggleAutoScale(): void
  toggleLogScale(): void
  /** Open the price menu under the plus, for the price at the crosshair's height. `keyboard` says the
   *  plus's button was pressed from the keyboard, so the menu takes the focus. */
  openPriceMenu(anchor: PriceMenuAnchor, keyboard: boolean): void
}

/** The plus as the menu anchors to it, in viewport pixels: its box, the crosshair's height through
 *  its middle, and the side of the plot the scale stands on. */
export interface PriceMenuAnchor {
  left: number
  top: number
  right: number
  bottom: number
  /** The crosshair's height, where the price the menu names is read. */
  y: number
  side: 'left' | 'right'
}

/** The box the renderer painted the plus in, in the main pane's own pixels, with the crosshair's
 *  height through it and the pane's width. */
export interface PlusBox {
  left: number
  top: number
  width: number
  height: number
  y: number
  paneWidth: number
}

export interface ScaleControls {
  /** Read the settings, the scale's state and its box again. */
  sync(): void
  /** Stand the plus's button over the box the renderer just painted the plus in, or put it away
   *  when the paint drew none. */
  placePlus(box: PlusBox | null): void
  destroy(): void
}

/** The buttons' size and the space between them and below them. */
const BUTTON = { width: 20, height: 22, gap: 4, foot: 4 }
/** The currency and unit box's inset from the scale's top and from its side away from the plot. */
const UNIT_BOX = { inset: 4 }

export function mountScaleControls(deps: ScaleControlsDeps): ScaleControls {
  const t = deps.i18n.t
  const modes = h('div', { class: 'qc-scale-modes', role: 'group' })
  const auto = h('button', { type: 'button', class: 'qc-scale-mode', 'data-role': 'scale-auto' })
  const log = h('button', { type: 'button', class: 'qc-scale-mode', 'data-role': 'scale-log' })
  modes.append(auto, log)
  stopPointer(modes)
  // The box names; it takes no pointer, so a drag that starts on it is a drag of the scale.
  const unit = h('div', { class: 'qc-scale-unit', 'data-role': 'scale-unit' })
  deps.chrome.appendChild(unit)
  // The plus's button: no fill and no glyph of its own, since the renderer paints both.
  const plus = h('button', { type: 'button', class: 'qc-scale-plus', 'data-role': 'scale-plus' })
  plus.hidden = true
  deps.chrome.appendChild(plus)
  /** The plus the renderer painted last, in the chrome's own pixels, or null while it painted none. */
  let placed: { left: number; top: number; width: number; height: number; y: number; side: 'left' | 'right' } | null = null
  /** The pointer whose press landed on the plus, until its release. */
  let pressing: number | null = null
  /** Whether the click the browser raises after that release is still to come. */
  let releasing = false

  const anchor = (): PriceMenuAnchor | null => {
    if (!placed) return null
    const origin = deps.gestures.getBoundingClientRect()
    const left = origin.left + placed.left
    const top = origin.top + placed.top
    return { left, top, right: left + placed.width, bottom: top + placed.height, y: origin.top + placed.y, side: placed.side }
  }
  const onPlus = (clientX: number, clientY: number): boolean => {
    const at = anchor()
    return at !== null && clientX >= at.left && clientX < at.right && clientY >= at.top && clientY < at.bottom
  }
  // The keyboard's press: Enter or Space on the focused button.
  plus.addEventListener('click', (event) => {
    const at = anchor()
    if (at) deps.openPriceMenu(at, event.detail === 0)
  })
  // The pointer's press, taken in the capture phase at the gesture box, before the renderer and the
  // drawing layer beneath it hear it: a press on the plus pans nothing and places no point. Holding
  // the default back also holds back the mouse events the press would have raised.
  const onPressDown = (event: PointerEvent): void => {
    pressing = null
    releasing = false
    if (event.button !== 0 || !onPlus(event.clientX, event.clientY)) return
    pressing = event.pointerId
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const onPressUp = (event: PointerEvent): void => {
    if (pressing === null || event.pointerId !== pressing) return
    pressing = null
    releasing = true
    event.stopImmediatePropagation()
    const at = anchor()
    // The menu opens on the release, and only for a release on the plus.
    if (at && onPlus(event.clientX, event.clientY)) deps.openPriceMenu(at, false)
  }
  const onPressCancel = (): void => {
    pressing = null
  }
  // A finger's touch events follow its pointer events; one that starts on the plus is the plus's.
  const onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches[0]
    if (touch && onPlus(touch.clientX, touch.clientY)) event.stopImmediatePropagation()
  }
  // The click that follows a press of the plus is the plus's too, wherever the menu has left it.
  const onClick = (event: MouseEvent): void => {
    if (!releasing && !onPlus(event.clientX, event.clientY)) return
    releasing = false
    event.stopImmediatePropagation()
  }
  deps.gestures.addEventListener('pointerdown', onPressDown, true)
  deps.gestures.addEventListener('pointerup', onPressUp, true)
  deps.gestures.addEventListener('pointercancel', onPressCancel, true)
  deps.gestures.addEventListener('touchstart', onTouchStart, true)
  deps.gestures.addEventListener('click', onClick, true)

  const placePlus = (box: PlusBox | null): void => {
    const scale = box ? deps.box() : null
    if (!box || !scale) {
      placed = null
      plus.hidden = true
      return
    }
    // The main pane's plot ends where the scale starts on its side, and the box stands in the plot.
    const plotLeft = scale.side === 'right' ? scale.left - box.paneWidth : scale.left + scale.width
    const left = plotLeft + box.left
    const was = placed
    placed = { left, top: scale.top + box.top, width: box.width, height: box.height, y: scale.top + box.y, side: scale.side }
    if (was && !plus.hidden && was.left === placed.left && was.top === placed.top && was.width === placed.width && was.height === placed.height) return
    plus.hidden = false
    plus.style.left = `${placed.left}px`
    plus.style.top = `${placed.top}px`
    plus.style.width = `${placed.width}px`
    plus.style.height = `${placed.height}px`
  }
  auto.addEventListener('click', () => {
    deps.toggleAutoScale()
    sync()
  })
  log.addEventListener('click', () => {
    deps.toggleLogScale()
    sync()
  })
  deps.chrome.appendChild(modes)

  /** Whether the pointer is over the scale, or over the controls standing on it. */
  let overScale = false
  let overControls = false

  const label = (): void => {
    modes.setAttribute('aria-label', t('chrome.scaleModes'))
    auto.textContent = t('chrome.autoScaleMark')
    name(auto, t('chrome.autoScale'))
    log.textContent = t('chrome.logScaleMark')
    name(log, t('chrome.logScale'))
    name(plus, t('chrome.priceLevelMenu'))
  }

  const sync = (): void => {
    const box = deps.box()
    const visibility = deps.modeButtons()
    modes.dataset.qcVisibility = visibility
    const shown = box !== null && visibility !== 'never' && (visibility === 'always' || overScale || overControls)
    modes.hidden = !shown
    if (!box) {
      unit.hidden = true
      return
    }
    const width = BUTTON.width * 2 + BUTTON.gap
    modes.style.left = `${Math.round(box.left + (box.width - width) / 2)}px`
    modes.style.top = `${Math.round(box.top + box.height - BUTTON.height - BUTTON.foot)}px`
    auto.setAttribute('aria-pressed', String(deps.autoScale()))
    log.setAttribute('aria-pressed', String(deps.logScale()))
    syncUnit(box)
  }

  const syncUnit = (box: PriceScaleBox): void => {
    const visibility = deps.unitBox()
    const named = deps.currencyAndUnit()
    const currency = named?.currency?.trim() ?? ''
    const unitId = named?.unit?.trim() ?? ''
    const text = currency && unitId ? t('chrome.currencyAndUnit', { currency, unit: unitId }) : currency || unitId
    unit.textContent = text
    unit.dataset.qcVisibility = visibility
    unit.hidden = text === '' || visibility === 'never' || (visibility === 'hover' && !overScale && !overControls)
    // At the scale's top, four pixels in from the corner away from the plot.
    unit.style.top = `${Math.round(box.top + UNIT_BOX.inset)}px`
    unit.style.left = box.side === 'right' ? `${Math.round(box.left + UNIT_BOX.inset)}px` : ''
    unit.style.right = box.side === 'left' ? `${Math.round(deps.gestures.clientWidth - box.left - box.width + UNIT_BOX.inset)}px` : ''
  }

  const within = (event: PointerEvent): boolean => {
    const box = deps.box()
    if (!box) return false
    const rect = deps.gestures.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height
  }
  const onMove = (event: PointerEvent): void => {
    // A finger does not hover: on touch the buttons show only when the settings keep them shown.
    if (event.pointerType === 'touch') return
    const next = within(event)
    if (next === overScale) {
      // A drag on the scale releases its framing without a word to anyone, so the state is read
      // again while the pointer is there.
      if (next) sync()
      return
    }
    overScale = next
    sync()
  }
  const onLeave = (): void => {
    if (!overScale) return
    overScale = false
    sync()
  }
  const onControlsEnter = (): void => {
    overControls = true
    sync()
  }
  const onControlsLeave = (): void => {
    overControls = false
    sync()
  }
  deps.gestures.addEventListener('pointermove', onMove)
  deps.gestures.addEventListener('pointerup', onMove)
  deps.gestures.addEventListener('pointerleave', onLeave)
  modes.addEventListener('pointerenter', onControlsEnter)
  modes.addEventListener('pointerleave', onControlsLeave)
  const offStrings = deps.i18n.onChange(label)
  label()
  sync()

  return {
    sync,
    placePlus,
    destroy() {
      offStrings()
      deps.gestures.removeEventListener('pointermove', onMove)
      deps.gestures.removeEventListener('pointerup', onMove)
      deps.gestures.removeEventListener('pointerleave', onLeave)
      deps.gestures.removeEventListener('pointerdown', onPressDown, true)
      deps.gestures.removeEventListener('pointerup', onPressUp, true)
      deps.gestures.removeEventListener('pointercancel', onPressCancel, true)
      deps.gestures.removeEventListener('touchstart', onTouchStart, true)
      deps.gestures.removeEventListener('click', onClick, true)
      modes.remove()
      unit.remove()
      plus.remove()
    },
  }
}
