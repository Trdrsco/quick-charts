// @vitest-environment happy-dom
// The timeframe picker: chips from the saved list plus the active token, the grouped list with its
// stars and deletes, the custom composer, and the store the choices persist through. Every pick is
// a command: a preset's own, or the open-ended setter for a custom token.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTimeframePicker, timeframeCommand } from '../../src/ui/chrome/timeframePicker'
import { FLYOUT_WIDTH } from '../../src/ui/chrome/flyoutGeometry'
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
    // A chip wears the SHORT form: sub-daily keeps its token, a day drops to its letter. The list
    // still spells every one out.
    expect(chips(picker.element).map((c) => c.textContent)).toEqual(['1m', '3m', '5m', '1h', '4h', 'D'])
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
  it('toggles one panel on repeated trigger activation and reopens after dismissal', () => {
    const { w, picker } = mount()
    const trigger = picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!
    for (let cycle = 0; cycle < 3; cycle++) {
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-tf-menu')).toHaveLength(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-tf-menu')).toHaveLength(0)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger)
    }
  })

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
    // The composer: a count with its own spinner, a unit that opens a list, and Add.
    const count = menu.querySelector<HTMLInputElement>('.qc-tf-count-input')!
    const unit = menu.querySelector<HTMLButtonElement>('.qc-tf-unit')!
    const add = menu.querySelector<HTMLButtonElement>('.qc-tf-add')!
    expect(add.disabled).toBe(true) // 1m already exists as a preset
    count.value = '7'
    count.dispatchEvent(new Event('input'))
    expect(add.disabled).toBe(false)
    // The unit is a listbox on a button, not a native select: the list is the menu's own rows, so
    // it wears the same highlight and checked state as every other list in the chrome.
    expect(unit.getAttribute('aria-haspopup')).toBe('listbox')
    expect(unit.getAttribute('aria-expanded')).toBe('false')
    unit.click()
    expect(unit.getAttribute('aria-expanded')).toBe('true')
    const options = [...menu.querySelectorAll<HTMLButtonElement>('.qc-tf-unit-list [role="option"]')]
    expect(options.map((o) => o.textContent)).toEqual(['Ticks', 'Seconds', 'Minutes', 'Hours', 'Days', 'Weeks', 'Months'])
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent)).toEqual(['Minutes'])
    options[3]!.click()
    expect(unit.getAttribute('aria-expanded')).toBe('false')
    // The list is one element toggled shut, not rebuilt per open: the options keep their identity,
    // so the row a viewer chose stays the row that is selected.
    expect(menu.querySelector<HTMLElement>('.qc-tf-unit-list')!.hidden).toBe(true)
    expect(unit.querySelector('.qc-tf-unit-label')!.textContent).toBe('Hours')
    add.click()
    expect(store.custom()).toEqual(['7h'])
    expect(w.chart.calls).toContain('timeframe:7h')
    expect(w.overlays.querySelector('[role="menu"]')).toBeNull()
  })

  it('steps the composer count with its own spinner, never below one', () => {
    const { w, picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    const count = menu.querySelector<HTMLInputElement>('.qc-tf-count-input')!
    const up = menu.querySelector<HTMLButtonElement>('.qc-tf-spin-up')!
    const down = menu.querySelector<HTMLButtonElement>('.qc-tf-spin-down')!
    expect(count.value).toBe('1')
    up.click()
    up.click()
    expect(count.value).toBe('3')
    down.click()
    expect(count.value).toBe('2')
    // A count is a multiplier: there is no zeroth interval and no negative one, so the floor holds
    // however many times the step is pressed.
    down.click()
    down.click()
    down.click()
    expect(count.value).toBe('1')
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

  it('keeps a reader where they scrolled to when the list refreshes under them', () => {
    const { picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const scroller = () => document.querySelector<HTMLElement>('.qc-tf-menu .qc-menu-body')!
    const before = scroller()
    scroller().scrollTop = 240

    // Collapsing a group rebuilds the list, and so does any state change the chart reports while
    // the list is up. Neither is a reason to put a reader back at the first row.
    document.querySelectorAll<HTMLButtonElement>('.qc-tf-group')[3]!.click()
    // The scroll region is the MENU'S, so a rebuild replaces the rows inside it and not the region
    // itself. That is what holds the position: nothing saves and restores a number.
    expect(scroller()).toBe(before)
    expect(scroller().scrollTop).toBe(240)
    // And the list builds no scroller of its own. One that did would be rebuilt with the rows, and
    // would open at the top every time.
    expect(document.querySelector('.qc-tf-menu .qc-menu-body [class*="groups"]')).toBeNull()
  })

  it('leaves the open list alone when a sync changes nothing it shows', () => {
    const { picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const before = document.querySelector('.qc-tf-menu .qc-menu-body')
    // The chart reports state many times a second on a streaming symbol. A sync that moves none of
    // the active token, the saved list, the custom list or the collapsed groups must not rebuild.
    picker.sync()
    picker.sync()
    expect(document.querySelector('.qc-tf-menu .qc-menu-body')).toBe(before)
  })
})

describe('the timeframe flyout geometry', () => {
  it('opens at the pinned 192px width', () => {
    const { w, picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const panel = w.overlays.querySelector<HTMLElement>('.qc-tf-menu')!
    expect(panel.style.width).toBe(`${FLYOUT_WIDTH.timeframe}px`)
    expect(FLYOUT_WIDTH.timeframe).toBe(192)
  })

  it('marks the chosen row cell, so the wash reaches its star and its delete', () => {
    const { w, picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    const marked = [...menu.querySelectorAll<HTMLElement>('.qc-tf-row[data-qc-checked="true"]')]
    expect(marked.length).toBe(1)
    expect(marked[0]!.querySelector('[role="menuitemradio"]')!.getAttribute('aria-checked')).toBe('true')
  })

  it('keeps the composer outside the scrolling list, so the last group never hides it', () => {
    const { w, picker } = mount()
    picker.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
    const panel = w.overlays.querySelector<HTMLElement>('.qc-tf-menu')!
    const body = panel.querySelector<HTMLElement>('.qc-menu-body')!
    const composer = panel.querySelector<HTMLElement>('.qc-tf-composer')!
    // In the PINNED footer, a sibling of the scroll rather than its last child: a reader partway
    // down the list can still reach the custom field.
    expect(body.contains(composer)).toBe(false)
    expect(composer.closest('.qc-menu-footer')?.parentElement).toBe(panel)
  })
})
