// @vitest-environment happy-dom
// The timeframe picker: chips from the saved list plus the active token, the grouped list with its
// stars and deletes, the custom composer, and the store the choices persist through. Every pick is
// a command: a preset's own, or the open-ended setter for a custom token.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTimeframePicker, timeframeCommand } from '../../src/ui/chrome/timeframePicker'
import { createTimeframeStore, DEFAULT_SAVED_TIMEFRAMES } from '../../src/ui/chrome/preferences'
import { memoryChartStorage } from '../../src/storage'
import { fakeWidget, press } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

function mount(options: { access?: (id: string) => boolean; resolutions?: string[] } = {}) {
  const w = fakeWidget({ access: options.access ? { command: options.access } : undefined, capabilities: { resolutions: options.resolutions ?? null } })
  const storage = memoryChartStorage()
  const store = createTimeframeStore(storage, {})
  const picker = mountTimeframePicker({ ...w.ctx, store, restrictions: () => ({ resolutions: options.resolutions ?? null }) })
  document.body.appendChild(picker.element)
  cleanup.push(() => {
    picker.destroy()
    w.dispose()
  })
  return { w, picker, store, storage }
}

const chips = (root: HTMLElement): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>('.qc-tf-chip')]

describe('the timeframe store', () => {
  it('seeds the chips from the preference plane, then the storage port wins', () => {
    const storage = memoryChartStorage()
    const first = createTimeframeStore(storage, { savedTimeframes: ['1m', '1d'], customTimeframes: ['7m', 'bogus', '1m'] })
    expect(first.saved()).toEqual(['1m', '1d'])
    expect(first.custom()).toEqual(['7m']) // the preset and the unparseable token are dropped
    first.toggleSaved('4h')
    expect(createTimeframeStore(storage, { savedTimeframes: ['1m'] }).saved()).toEqual(['1m', '1d', '4h'])
    expect(createTimeframeStore(memoryChartStorage(), {}).saved()).toEqual([...DEFAULT_SAVED_TIMEFRAMES])
  })

  it('refuses a custom token that is a preset, unparseable, or already held, and a removal unsaves it', () => {
    const store = createTimeframeStore(memoryChartStorage(), {})
    expect(store.addCustom('5m')).toBe(false)
    expect(store.addCustom('99x')).toBe(false)
    expect(store.addCustom('7m')).toBe(true)
    expect(store.addCustom('7m')).toBe(false)
    store.toggleSaved('7m')
    expect(store.saved()).toContain('7m')
    store.removeCustom('7m')
    expect(store.custom()).toEqual([])
    expect(store.saved()).not.toContain('7m')
  })
})

describe('the timeframe chips', () => {
  it('show the saved tokens plus the active one, smallest first, with the active one pressed', () => {
    const { w, picker } = mount()
    w.chart.handle.setTimeframe('3m')
    picker.sync()
    expect(chips(picker.element).map((c) => c.textContent)).toEqual(['1m', '3m', '5m', '1h', '4h', '1d'])
    expect(chips(picker.element).map((c) => c.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false'])
    expect(chips(picker.element)[0]!.getAttribute('aria-label')).toBe('1 Minute')
  })

  it('a chip runs the preset command; a custom chip runs the setter with the token', () => {
    const { w, picker, store } = mount()
    chips(picker.element)[2]!.click()
    expect(w.chart.calls).toContain('timeframe:1h')
    store.addCustom('7m')
    store.toggleSaved('7m')
    picker.sync()
    const custom = chips(picker.element).find((c) => c.textContent === '7m')!
    custom.click()
    expect(w.chart.calls).toContain('timeframe:7m')
    expect(timeframeCommand('7m')).toEqual({ id: 'chart.timeframe.set', arg: '7m' })
    expect(timeframeCommand('1h')).toEqual({ id: 'chart.timeframe.1h' })
  })

  it('a chip the feed cannot serve is disabled, and a denied preset does nothing', () => {
    const { w, picker } = mount({ resolutions: ['1m', '1h'], access: (id) => id !== 'chart.timeframe.1h' })
    const byText = (text: string): HTMLButtonElement => chips(picker.element).find((c) => c.textContent === text)!
    expect(byText('4h').disabled).toBe(true)
    expect(byText('1h').disabled).toBe(true)
    byText('1h').click()
    expect(w.chart.calls.filter((c) => c.startsWith('timeframe:'))).toEqual([])
  })
})

describe('the timeframe list', () => {
  it('opens the five groups with the active row checked, stars save, and the composer adds a custom token', () => {
    const { w, picker, store } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    expect(menu.querySelectorAll('.qc-tf-group').length).toBe(5)
    const rows = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.length).toBe(26)
    const checked = rows.filter((r) => r.getAttribute('aria-checked') === 'true')
    expect(checked.map((r) => r.textContent)).toEqual(['1 Minute'])
    // The star beside a row saves it as a chip.
    const star = rows[0]!.parentElement!.querySelector<HTMLButtonElement>('.qc-tf-side')!
    expect(star.getAttribute('aria-pressed')).toBe('false')
    star.click()
    expect(store.saved()).toContain('1t')
    // The composer: a count, a unit, and Add.
    const count = menu.querySelector<HTMLInputElement>('.qc-tf-count')!
    const unit = menu.querySelector<HTMLSelectElement>('.qc-tf-unit')!
    const add = menu.querySelector<HTMLButtonElement>('.qc-tf-add')!
    expect(add.disabled).toBe(true) // 1m already exists as a preset
    count.value = '7'
    count.dispatchEvent(new Event('input'))
    expect(add.disabled).toBe(false)
    unit.value = 'h'
    unit.dispatchEvent(new Event('change'))
    add.click()
    expect(store.custom()).toEqual(['7h'])
    expect(w.chart.calls).toContain('timeframe:7h')
    expect(w.overlays.querySelector('[role="menu"]')).toBeNull()
  })

  it('collapses a group from its heading and reaches the side controls by ArrowRight', () => {
    const { w, picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    const heading = menu.querySelector<HTMLButtonElement>('.qc-tf-group')!
    expect(heading.getAttribute('aria-expanded')).toBe('true')
    heading.click()
    const reopened = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    expect(reopened.querySelector<HTMLButtonElement>('.qc-tf-group')!.getAttribute('aria-expanded')).toBe('false')
    expect(reopened.querySelectorAll('[role="menuitemradio"]').length).toBe(22)
    const row = reopened.querySelector<HTMLButtonElement>('[role="menuitemradio"]')!
    row.focus()
    press(row, 'ArrowRight')
    expect(document.activeElement?.classList.contains('qc-tf-side')).toBe(true)
    press(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(row)
  })
})
