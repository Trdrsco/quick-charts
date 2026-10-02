// @vitest-environment happy-dom
// The timeframe picker a page opens with no chart behind it: the chart's own grouped list and
// composer, dropped from the page's control or built into the page's box, with a pick that goes
// back to whoever asked. It checks its options as a chart does before anything mounts, brings its
// own painted layer, and takes it away again.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTimeframePicker, openTimeframePicker, type TimeframePickerOptions } from '../../src/ui/chrome/openTimeframePicker'
import { press } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

const panel = (): HTMLElement | null => document.querySelector<HTMLElement>('.qc-tf-menu')
const rows = (root: ParentNode = document): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
const labels = (root: ParentNode = document): string[] => rows(root).map((row) => row.textContent ?? '')
const groups = (root: ParentNode = document): string[] => [...root.querySelectorAll('.qc-tf-group')].map((g) => g.textContent ?? '')
const row = (text: string, root: ParentNode = document): HTMLButtonElement => rows(root).find((r) => r.textContent === text)!

function open(extra: Partial<TimeframePickerOptions> = {}) {
  const anchor = document.body.appendChild(document.createElement('button'))
  anchor.textContent = 'Timeframe'
  const events: string[] = []
  const handle = openTimeframePicker({
    anchor,
    onPick: (timeframe) => events.push(`pick:${timeframe}`),
    onClose: () => events.push('close'),
    ...extra,
  })
  cleanup.push(() => handle.close())
  return { anchor, handle, events }
}

/** Type a count into the composer and choose a unit by its row's position. */
function compose(root: ParentNode, count: string, unitIndex?: number): HTMLButtonElement {
  const field = root.querySelector<HTMLInputElement>('.qc-tf-count-input')!
  field.value = count
  field.dispatchEvent(new Event('input'))
  if (unitIndex !== undefined) {
    root.querySelector<HTMLButtonElement>('.qc-tf-unit')!.click()
    root.querySelectorAll<HTMLButtonElement>('.qc-tf-unit-list [role="option"]')[unitIndex]!.click()
  }
  return root.querySelector<HTMLButtonElement>('.qc-tf-add')!
}

describe('the timeframe picker a page opens on its own', () => {
  it('drops the chart\'s five groups from the page\'s control, the value checked and focused', () => {
    const { anchor } = open({ timeframe: '15m' })
    expect(panel()).not.toBeNull()
    expect(panel()!.getAttribute('role')).toBe('menu')
    expect(groups()).toEqual(['Ticks', 'Seconds', 'Minutes', 'Hours', 'Days'])
    expect(rows().length).toBe(26)
    expect(rows().filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.textContent)).toEqual(['15 Minutes'])
    expect(document.activeElement).toBe(row('15 Minutes'))
    expect(anchor.getAttribute('aria-expanded')).toBe('true')
    // No saved chips and no stars: a field asks for one timeframe and keeps no quick-select row.
    expect(document.querySelector('.qc-tf-side')).toBeNull()
    expect(document.querySelector('.qc-tf-chip')).toBeNull()
  })

  it('hands a preset back, then closes and takes its layer with it', () => {
    const { anchor, events } = open({ timeframe: '1m' })
    row('4 Hours').click()
    expect(events).toEqual(['pick:4h', 'close'])
    expect(panel()).toBeNull()
    expect(document.querySelector('.qc-layer')).toBeNull()
    expect(anchor.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(anchor)
  })

  it('composes a custom timeframe and hands it back, refusing one that is already a row', () => {
    const { events } = open()
    const add = compose(document, '1')
    expect(add.disabled).toBe(true) // 1m is a preset row
    compose(document, '7', 3)
    expect(add.disabled).toBe(false)
    add.click()
    expect(events).toEqual(['pick:7h', 'close'])
    // Enter in the count field takes the token as Add does.
    const second = open()
    const field = document.querySelector<HTMLInputElement>('.qc-tf-count-input')!
    compose(document, '13')
    press(field, 'Enter')
    expect(second.events).toEqual(['pick:13m', 'close'])
  })

  it('lists a custom value in its unit\'s group, checked', () => {
    open({ timeframe: '7m' })
    expect(labels()).toContain('7 Minutes')
    expect(row('7 Minutes').getAttribute('aria-checked')).toBe('true')
    // A held custom value is no delete: the picker keeps nothing of the viewer's.
    expect(row('7 Minutes').parentElement!.querySelector('.qc-tf-side')).toBeNull()
  })

  it('offers exactly the host\'s list, smallest first in its groups, with no composer', () => {
    open({ timeframes: ['1d', '5m', '1h', '90m'], timeframe: '1h' })
    expect(groups()).toEqual(['Minutes', 'Hours', 'Days'])
    expect(labels()).toEqual(['5 Minutes', '90 Minutes', '1 Hour', '1 Day'])
    expect(document.querySelector('.qc-tf-composer')).toBeNull()
    row('90 Minutes').click()
    expect(document.querySelector('.qc-layer')).toBeNull()
  })

  it('offers the presets alone with customTimeframes: false', () => {
    open({ customTimeframes: false })
    expect(rows().length).toBe(26)
    expect(document.querySelector('.qc-tf-composer')).toBeNull()
  })

  it('leaves out what the feed or the symbol does not serve, as the chart\'s list does, and composes none of it', () => {
    open({ resolutions: ['1m', '5m', '7m', '1h', '1d'], supportedResolutions: ['1m', '5m', '7m', '1d'] })
    expect(labels()).toEqual(['1 Minute', '5 Minutes', '1 Day'])
    expect(compose(document, '7').disabled).toBe(false)
    expect(compose(document, '9').disabled).toBe(true)
  })

  it('closes on Escape and returns focus to the control', () => {
    const { anchor, events } = open()
    press(document.activeElement!, 'Escape')
    expect(events).toEqual(['close'])
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(anchor)
  })

  it('closes on a press outside it, and not on one inside it', () => {
    const { events } = open()
    document.querySelector('.qc-tf-group')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(panel()).not.toBeNull()
    const outside = document.body.appendChild(document.createElement('div'))
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(events).toEqual(['close'])
    expect(document.querySelector('.qc-layer')).toBeNull()
  })

  it('roves its rows by the arrow keys, as the chart\'s list does', () => {
    open({ timeframe: '1m' })
    press(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(row('3 Minutes'))
    press(document.activeElement!, 'ArrowUp')
    expect(document.activeElement).toBe(row('1 Minute'))
  })

  it('collapses a group from its heading', () => {
    open()
    const heading = [...document.querySelectorAll<HTMLButtonElement>('.qc-tf-group')].find((g) => g.textContent === 'Ticks')!
    heading.click()
    expect(rows().length).toBe(22)
    expect(document.querySelector('.qc-tf-group')!.getAttribute('aria-expanded')).toBe('false')
  })

  it('paints its layer in the mode it is given, as a theme root the stylesheet reaches', () => {
    for (const mode of ['light', 'dark'] as const) {
      const { handle } = open({ theme: { mode } })
      const layer = document.querySelector<HTMLElement>('.qc-layer')!
      expect(layer.getAttribute('data-qc-theme')).toBe(mode)
      expect(layer.style.getPropertyValue('--qc-chrome-surface')).not.toBe('')
      expect(layer.querySelector('.qc-overlays .qc-tf-menu')).not.toBeNull()
      handle.close()
    }
  })

  it('reads right to left in a language that does', () => {
    open({ locale: 'ar' })
    expect(document.querySelector<HTMLElement>('.qc-layer')!.getAttribute('dir')).toBe('rtl')
  })

  it('mounts in the element the page names', () => {
    const host = document.body.appendChild(document.createElement('section'))
    open({ container: host })
    expect(host.querySelector('.qc-layer .qc-tf-menu')).not.toBeNull()
  })

  it('closes from the outside, and closing twice is safe', () => {
    const { handle, events } = open()
    handle.close()
    handle.close()
    expect(events).toEqual(['close'])
    expect(document.querySelector('.qc-layer')).toBeNull()
  })

  it('checks its options as createChart does, before anything mounts', () => {
    const anchor = document.body.appendChild(document.createElement('button'))
    const attempt = (extra: Partial<TimeframePickerOptions>) => () => openTimeframePicker({ anchor, onPick: () => undefined, ...extra })
    expect(attempt({ timeframes: [] })).toThrow(TypeError)
    expect(attempt({ timeframes: ['1m', 'soon'] })).toThrow(/soon/)
    expect(attempt({ timeframes: ['1m', '1m'] })).toThrow(/more than once/)
    expect(attempt({ timeframes: ['1m'], customTimeframes: true })).toThrow(TypeError)
    expect(attempt({ customTimeframes: 'yes' as never })).toThrow(TypeError)
    expect(attempt({ timeframes: ['5m', '1h'], timeframe: '1m' })).toThrow(/timeframe "1m"/)
    expect(attempt({ customTimeframes: false, timeframe: '7m' })).toThrow(TypeError)
    expect(attempt({ timeframe: 'soon' })).toThrow(TypeError)
    expect(attempt({ resolutions: '1m' as never })).toThrow(/resolutions/)
    expect(() => mountTimeframePicker({ container: anchor, onPick: () => undefined, timeframes: [] })).toThrow(TypeError)
    expect(document.querySelector('.qc-layer, .qc-tf-card')).toBeNull()
    expect(anchor.getAttribute('aria-expanded')).toBeNull()
  })
})

describe('the same list in a box the page owns', () => {
  function mount(extra: Partial<TimeframePickerOptions> = {}) {
    const container = document.body.appendChild(document.createElement('div'))
    const events: string[] = []
    const handle = mountTimeframePicker({
      container,
      onPick: (timeframe) => events.push(`pick:${timeframe}`),
      onClose: () => events.push('close'),
      ...extra,
    })
    cleanup.push(() => handle.dispose())
    return { container, handle, events }
  }

  it('stands bare in the box as a theme root: no layer, no floating panel', () => {
    const { container, handle } = mount({ timeframe: '5m', theme: { mode: 'light' } })
    const card = container.querySelector<HTMLElement>('.qc-tf-card')!
    expect(card).toBe(handle.element)
    expect(card.getAttribute('data-qc-theme')).toBe('light')
    expect(card.style.getPropertyValue('--qc-chrome-surface')).not.toBe('')
    expect(document.querySelector('.qc-layer, .qc-menu-panel')).toBeNull()
    expect(groups(card)).toEqual(['Ticks', 'Seconds', 'Minutes', 'Hours', 'Days'])
    expect(card.querySelector('.qc-tf-composer')).not.toBeNull()
    expect(row('5 Minutes', card).getAttribute('aria-checked')).toBe('true')
  })

  it('hands the pick back, then tells the page to close its box', () => {
    const { container, events } = mount()
    row('1 Day', container).click()
    expect(events).toEqual(['pick:1d', 'close'])
    const add = compose(container, '3', 4)
    add.click()
    expect(events).toEqual(['pick:1d', 'close', 'pick:3d', 'close'])
  })

  it('focuses the checked row, roves, and collapses a group in place', () => {
    const { container, handle } = mount({ timeframe: '1h' })
    handle.focus()
    expect(document.activeElement).toBe(row('1 Hour', container))
    press(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(row('2 Hours', container))
    container.querySelector<HTMLButtonElement>('.qc-tf-group')!.click()
    expect(rows(container).length).toBe(22)
  })

  it('honors the offered list and the restrictions as the drop-down does', () => {
    const { container } = mount({ timeframes: ['1m', '5m', '1h'], resolutions: ['1m', '1h'] })
    expect(labels(container)).toEqual(['1 Minute', '1 Hour'])
    expect(container.querySelector('.qc-tf-composer')).toBeNull()
  })

  it('goes when the page takes it down, and going twice is safe', () => {
    const { container, handle } = mount()
    handle.dispose()
    handle.dispose()
    expect(container.querySelector('.qc-tf-card')).toBeNull()
  })
})
