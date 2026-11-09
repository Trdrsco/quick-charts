// @vitest-environment happy-dom
// The name bubble: the words a control's bubble shows, the control a pointer names, where the bubble
// stands for each part of the chart, and when it shows and goes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachTips, placeTip, popupOpen, TIP_DELAY, TIP_WARM, tipTarget, tipText, tipZone, type TipsHandle } from '../../src/ui/chrome/tips'

const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) })
const VIEW = { left: 0, top: 0, right: 1000, bottom: 800 }

const control = (attrs: Record<string, string>, text = ''): HTMLButtonElement => {
  const b = document.createElement('button')
  for (const [key, value] of Object.entries(attrs)) b.setAttribute(key, value)
  b.textContent = text
  return b
}

describe('the words', () => {
  it('take the control’s own words over its name, and its name otherwise', () => {
    expect(tipText(control({ 'aria-label': 'Indicators', 'data-qc-tip': 'Indicators and strategies' }, 'Indicators'))).toBe('Indicators and strategies')
    expect(tipText(control({ 'aria-label': 'Compare or add symbol' }))).toBe('Compare or add symbol')
  })

  it('raise none for a control whose visible words already say them, or one marked as needing none', () => {
    expect(tipText(control({ 'aria-label': 'Cancel' }, 'Cancel'))).toBeNull()
    expect(tipText(control({ 'aria-label': 'All' }, ' All '))).toBeNull()
    expect(tipText(control({ 'aria-label': 'Close', 'data-no-tip': '' }))).toBeNull()
    expect(tipText(control({ 'aria-label': 'Save', 'data-qc-tip': '' }))).toBeNull()
  })

  it('stand down over an open popup, and keep standing for a control that discloses in place', () => {
    expect(popupOpen(control({ 'aria-label': 'Chart style', 'aria-haspopup': 'menu', 'aria-expanded': 'true' }))).toBe(true)
    expect(popupOpen(control({ 'aria-label': 'Chart style', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }))).toBe(false)
    expect(popupOpen(control({ 'aria-label': '2 more listings', 'aria-expanded': 'true' }))).toBe(false)
  })
})

describe('the control a pointer names', () => {
  it('is the nearest element with words of its own, or the nearest named control, inside the surface', () => {
    const surface = document.createElement('div')
    const named = control({ 'aria-label': 'Settings' })
    const glyph = document.createElement('span')
    named.appendChild(glyph)
    const label = document.createElement('span')
    label.dataset.qcTip = 'Relative Strength Index'
    const inner = document.createElement('em')
    label.appendChild(inner)
    const bare = control({}, 'Apply')
    const quiet = control({ 'aria-label': 'Close', 'data-no-tip': '' })
    surface.append(named, label, bare, quiet)
    expect(tipTarget(glyph, surface)).toBe(named)
    expect(tipTarget(inner, surface)).toBe(label)
    expect(tipTarget(bare, surface)).toBeNull()
    expect(tipTarget(quiet, surface)).toBe(quiet)
    expect(tipText(quiet)).toBeNull()
    expect(tipTarget(surface, surface)).toBeNull()
    expect(tipTarget(document.body, surface)).toBeNull()
  })
})

describe('where the bubble stands', () => {
  it('opens sideways from a vertical toolbar toward the room, below the top bar, above the bottom bar, and above or below elsewhere', () => {
    const toolbar = document.createElement('div')
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-orientation', 'vertical')
    const tool = control({ 'aria-label': 'Trend line' })
    toolbar.appendChild(tool)
    const topbar = document.createElement('div')
    topbar.className = 'qc-topbar'
    const undo = control({ 'aria-label': 'Undo' })
    topbar.appendChild(undo)
    const bottombar = document.createElement('div')
    bottombar.className = 'qc-bottombar'
    const chip = control({ 'aria-label': '1 day' })
    bottombar.appendChild(chip)
    expect([tipZone(tool), tipZone(undo), tipZone(chip), tipZone(control({ 'aria-label': 'Remove' }))]).toEqual(['side', 'below', 'above', 'auto'])
  })

  it('stands 4px from its control, centred on it, with its ear on the side facing the control', () => {
    const size = { width: 100, height: 26 }
    // A left-side toolbar's control opens to its right, centred on it.
    expect(placeTip(box(4, 200, 28, 28), size, 'side', VIEW)).toEqual({ left: 36, top: 201, side: 'right', ear: 13 })
    // One near the right edge opens to its left.
    expect(placeTip(box(960, 200, 28, 28), size, 'side', VIEW)).toEqual({ left: 856, top: 201, side: 'left', ear: 13 })
    expect(placeTip(box(400, 10, 40, 30), size, 'below', VIEW)).toEqual({ left: 370, top: 44, side: 'bottom', ear: 50 })
    expect(placeTip(box(400, 700, 40, 30), size, 'above', VIEW)).toEqual({ left: 370, top: 670, side: 'top', ear: 50 })
    expect(placeTip(box(400, 300, 40, 30), size, 'auto', VIEW)).toEqual({ left: 370, top: 270, side: 'top', ear: 50 })
    // With no room above, below.
    expect(placeTip(box(400, 10, 40, 20), size, 'auto', VIEW)).toEqual({ left: 370, top: 34, side: 'bottom', ear: 50 })
  })

  it('stays inside its bounds and keeps its ear on the control however far it moved', () => {
    const size = { width: 200, height: 26 }
    const left = placeTip(box(2, 300, 20, 20), size, 'auto', VIEW)
    expect(left.left).toBe(4)
    expect(left.ear).toBe(8)
    const right = placeTip(box(980, 300, 20, 20), size, 'auto', VIEW)
    expect(right.left).toBe(796)
    expect(right.ear).toBe(194)
    const low = placeTip(box(4, 790, 28, 8), { width: 100, height: 40 }, 'side', VIEW)
    expect(low.top).toBe(756)
    expect(low.ear).toBe(34)
  })
})

describe('when the bubble shows and goes', () => {
  let layer: HTMLElement
  let surface: HTMLElement
  let tips: TipsHandle
  const over = (target: Element, pointerType = 'mouse', relatedTarget: Element | null = null): void => {
    target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType, relatedTarget }))
  }
  const out = (target: Element, relatedTarget: Element | null): void => {
    target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, pointerType: 'mouse', relatedTarget }))
  }
  const words = (): string | null => (tips.element.hidden ? null : tips.element.textContent)

  beforeEach(() => {
    vi.useFakeTimers()
    layer = document.createElement('div')
    surface = document.createElement('div')
    document.body.append(layer, surface)
    tips = attachTips(layer)
    tips.watch(surface)
  })
  afterEach(() => {
    tips.destroy()
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('marks every surface it watches, and unmarks it when the watch ends', () => {
    expect(surface.hasAttribute('data-qc-tips')).toBe(true)
    const other = document.createElement('div')
    const release = tips.watch(other)
    expect(other.hasAttribute('data-qc-tips')).toBe(true)
    release()
    expect(other.hasAttribute('data-qc-tips')).toBe(false)
    expect(tips.element.getAttribute('aria-hidden')).toBe('true')
    expect(tips.element.parentElement).toBe(layer)
  })

  it('waits for the first rest, then hands over at once while warm, and waits again once cold', () => {
    const a = control({ 'aria-label': 'Undo' })
    const b = control({ 'aria-label': 'Redo' })
    surface.append(a, b)
    over(a)
    vi.advanceTimersByTime(TIP_DELAY - 1)
    expect(words()).toBeNull()
    vi.advanceTimersByTime(1)
    expect(words()).toBe('Undo')
    out(a, b)
    over(b, 'mouse', a)
    expect(words()).toBe('Redo')
    out(b, surface)
    expect(words()).toBeNull()
    over(a)
    expect(words()).toBe('Undo')
    out(a, surface)
    vi.advanceTimersByTime(TIP_WARM + 1)
    over(b)
    expect(words()).toBeNull()
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBe('Redo')
  })

  it('places itself against its control and writes its ear', () => {
    const a = control({ 'aria-label': 'Remove' })
    surface.appendChild(a)
    a.getBoundingClientRect = () => box(400, 300, 40, 30) as DOMRect
    tips.element.getBoundingClientRect = () => box(0, 0, 80, 26) as DOMRect
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    expect(tips.element.dataset.qcSide).toBe('top')
    expect(tips.element.style.left).toBe('380px')
    expect(tips.element.style.top).toBe('270px')
    expect(tips.element.style.getPropertyValue('--qcd-tip-ear')).toBe('40px')
  })

  it('goes on a press and stays away from the pressed control until the pointer leaves it', () => {
    const a = control({ 'aria-label': 'Undo' })
    surface.appendChild(a)
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))
    expect(words()).toBeNull()
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBeNull()
    out(a, surface)
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBe('Undo')
  })

  it('goes on a scroll and when the window loses focus', () => {
    const a = control({ 'aria-label': 'Undo' })
    surface.appendChild(a)
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    surface.dispatchEvent(new Event('scroll'))
    expect(words()).toBeNull()
    vi.advanceTimersByTime(TIP_WARM + 1)
    over(control({ 'aria-label': 'Redo' }))
    over(a)
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBe('Undo')
    window.dispatchEvent(new Event('blur'))
    expect(words()).toBeNull()
  })

  it('raises none for a finger, a control marked as needing none, a worded button, or a control over its open popup', () => {
    const a = control({ 'aria-label': 'Undo' })
    const close = control({ 'aria-label': 'Close', 'data-no-tip': '' })
    const ok = control({ 'aria-label': 'Ok' }, 'Ok')
    const style = control({ 'aria-label': 'Chart style: Candles', 'data-qc-tip': 'Candles', 'aria-haspopup': 'menu', 'aria-expanded': 'true' })
    surface.append(a, close, ok, style)
    over(a, 'touch')
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBeNull()
    for (const quiet of [close, ok, style]) {
      over(quiet)
      vi.advanceTimersByTime(TIP_DELAY)
      expect(words()).toBeNull()
    }
    style.setAttribute('aria-expanded', 'false')
    out(style, surface)
    over(style)
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBe('Candles')
  })

  it('answers keyboard focus in the bottom bar only', () => {
    const bottombar = document.createElement('div')
    bottombar.className = 'qc-bottombar'
    const chip = control({ 'aria-label': '1 day', 'data-qc-tip': '1 day in 1 minute intervals' }, '1D')
    bottombar.appendChild(chip)
    const elsewhere = control({ 'aria-label': 'Undo' })
    surface.append(bottombar, elsewhere)
    for (const target of [chip, elsewhere]) target.matches = ((selector: string) => selector === ':focus-visible') as never
    elsewhere.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBeNull()
    chip.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.advanceTimersByTime(TIP_DELAY)
    expect(words()).toBe('1 day in 1 minute intervals')
    chip.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    expect(words()).toBeNull()
  })
})
