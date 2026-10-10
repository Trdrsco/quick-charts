// The controls that stand on the main price scale: the box at its top that names what prices are
// in (the symbol's currency and unit), the auto-scale and logarithmic buttons at its foot, and the
// plus beside the crosshair's price label, which opens that price's menu. The box and the buttons
// show while the pointer is over the scale, always, or never, as the chart settings say; the plus
// shows while the crosshair stands on the main pane. Each press is the chart's own verb, so the
// controls and every other door to the same state read alike.
//
// The scale is drawn by the renderer, so these are DOM in the chart's chrome layer, placed over the
// scale's box as the chart measures it. The chrome takes no pointer, so the pointer is watched on
// the gesture box beneath it; the buttons take it back while it is over them.
import type { ChartI18n } from '../../i18n'
import type { ChartControlVisibility } from '../../settings/schema'
import { ICONS } from '../controls/icons'
import type { IconResolver } from '../icons/resolver'
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
  icons: IconResolver
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
  /** Whether the plus beside the crosshair's price shows: the setting, and a menu to open. */
  plusButton(): boolean
  /** Open the price level's menu at a viewport point, the price read off its height. */
  openPriceMenu(clientX: number, clientY: number): void
}

export interface ScaleControls {
  /** Read the settings, the scale's state and its box again. */
  sync(): void
  /** Where the crosshair stands on the main pane, from its top, or null while it is elsewhere. */
  setCrosshair(y: number | null): void
  destroy(): void
}

/** The buttons' size and the space between them and below them. */
const BUTTON = { width: 20, height: 22, gap: 4, foot: 4 }
/** The currency and unit box's inset from the scale's top and from its side away from the plot. */
const UNIT_BOX = { inset: 4 }
/** The plus beside the crosshair's price: its square, and its gap from the scale's edge. */
const PLUS = { size: 24, gap: 1 }

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
  const plus = h('button', { type: 'button', class: 'qc-scale-plus', 'data-role': 'scale-plus' })
  plus.appendChild(deps.icons.glyph(ICONS.priceLevelMenu, { size: 18 }))
  plus.hidden = true
  stopPointer(plus)
  deps.chrome.appendChild(plus)
  /** Where the crosshair stood on the main pane when it was last there, and whether the pointer is
   *  on the plus itself, which takes the crosshair off the plot without taking the plus away. */
  let crosshairY: number | null = null
  let overPlus = false
  plus.addEventListener('click', () => {
    if (crosshairY === null) return
    const rect = deps.gestures.getBoundingClientRect()
    const own = plus.getBoundingClientRect()
    deps.openPriceMenu(own.left + own.width / 2, rect.top + crosshairY)
  })
  plus.addEventListener('pointerenter', () => {
    overPlus = true
  })
  plus.addEventListener('pointerleave', () => {
    overPlus = false
    syncPlus()
  })
  const syncPlus = (): void => {
    const box = deps.box()
    const y = crosshairY
    if (!box || y === null || !deps.plusButton() || (y < box.top || y > box.top + box.height)) {
      if (!overPlus) plus.hidden = true
      return
    }
    plus.hidden = false
    const left = box.side === 'right' ? box.left - PLUS.size - PLUS.gap : box.left + box.width + PLUS.gap
    plus.style.left = `${Math.round(left)}px`
    plus.style.top = `${Math.round(y - PLUS.size / 2)}px`
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
    syncPlus()
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
    setCrosshair(y) {
      // Off the main pane the crosshair names no price of the main series; the plus stays only
      // while the pointer is on it.
      if (y === null && overPlus) return
      crosshairY = y
      syncPlus()
    },
    destroy() {
      offStrings()
      deps.gestures.removeEventListener('pointermove', onMove)
      deps.gestures.removeEventListener('pointerup', onMove)
      deps.gestures.removeEventListener('pointerleave', onLeave)
      modes.remove()
      unit.remove()
      plus.remove()
    },
  }
}
