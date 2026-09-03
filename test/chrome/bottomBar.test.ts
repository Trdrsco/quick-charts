// @vitest-environment happy-dom
// The bottom bar and the navigation cluster: range chips over the range commands, the clock in
// the display zone, the timezone list, the session view offered only where a symbol has extended
// hours, and the five navigation verbs.
import { afterEach, describe, expect, it } from 'vitest'
import { mountBottomBar, timezoneCommand } from '../../src/ui/chrome/bottomBar'
import { mountNavControls } from '../../src/ui/chrome/navControls'
import { RANGE_PRESETS } from '../../src/ranges'
import { buttonNames, fakeChart, fakeWidget } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the bottom bar', () => {
  it('lists every range preset as a chip named by its tip, running the preset command', () => {
    const w = fakeWidget()
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    const chips = [...bar.element.querySelectorAll<HTMLButtonElement>('.qc-range-chip')]
    expect(chips.map((c) => c.textContent)).toEqual(RANGE_PRESETS.map((p) => p.key))
    expect(chips[0]!.getAttribute('aria-label')).toBe('1 Day · 1 Minute bars')
    chips[1]!.click()
    expect(w.chart.calls).toContain('frame:5D')
  })

  it('disables a preset the registry refuses and never frames it', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.range.5Y' } })
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    const fiveYears = [...bar.element.querySelectorAll<HTMLButtonElement>('.qc-range-chip')].find((c) => c.textContent === '5Y')!
    expect(fiveYears.disabled).toBe(true)
    fiveYears.click()
    expect(w.chart.calls).not.toContain('frame:5Y')
  })

  it('shows the clock in the display zone with its offset, and the timezone list picks through commands', () => {
    const w = fakeWidget()
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    expect(bar.element.querySelector('.qc-clock')!.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/)
    expect(bar.element.querySelector('.qc-clock-offset')!.textContent).toBe('UTC')
    const trigger = bar.element.querySelector<HTMLButtonElement>('.qc-tz-trigger')!
    expect(trigger.getAttribute('aria-label')).toBe('Chart timezone')
    trigger.click()
    const list = w.overlays.querySelector<HTMLElement>('[role="listbox"]')!
    const options = [...list.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    expect(options.length).toBe(61) // 60 zones plus the exchange choice
    expect(options[0]!.textContent).toBe('UTC')
    expect(options[0]!.getAttribute('aria-selected')).toBe('true')
    expect(options[1]!.textContent).toBe('Exchange')
    options[1]!.click()
    expect(w.chart.calls).toContain('timezone:exchange')
    expect(timezoneCommand('America/New_York')).toBe('chart.timezone.America/New_York')
    bar.sync()
    expect(bar.element.querySelector('.qc-clock-offset')!.textContent).toMatch(/^UTC-[45]$/)
  })

  it('offers the session view only for a symbol with extended hours, over the subsession commands', () => {
    const plain = fakeWidget()
    const plainBar = mountBottomBar(plain.ctx)
    expect(plainBar.element.querySelector<HTMLElement>('.qc-session-trigger')!.hidden).toBe(true)
    plainBar.destroy()
    plain.dispose()

    const w = fakeWidget({ chart: fakeChart({ extendedHours: true }) })
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    const trigger = bar.element.querySelector<HTMLButtonElement>('.qc-session-trigger')!
    expect(trigger.hidden).toBe(false)
    expect(trigger.textContent).toBe('Extended hours')
    trigger.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Extended hours', 'Regular hours'])
    rows[1]!.click()
    expect(w.chart.calls).toContain('subsession:regular')
  })
})

describe('the navigation cluster', () => {
  it('carries the five verbs as a labeled group and routes each through its command', () => {
    const w = fakeWidget()
    const chrome = document.createElement('div')
    document.body.appendChild(chrome)
    const nav = mountNavControls({ chrome, commands: w.commands, i18n: w.i18n })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    const group = chrome.querySelector('.qc-nav')!
    expect(group.getAttribute('role')).toBe('group')
    expect(buttonNames(group)).toEqual(['Zoom out', 'Zoom in', 'Scroll left', 'Scroll right', 'Reset chart view'])
    for (const b of group.querySelectorAll('button')) b.click()
    expect(w.chart.calls).toEqual(['zoom:out', 'zoom:in', 'scroll:left', 'scroll:right', 'reset'])
  })

  it('disables a denied verb and does nothing when it is pressed', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.view.reset' } })
    const chrome = document.createElement('div')
    document.body.appendChild(chrome)
    const nav = mountNavControls({ chrome, commands: w.commands, i18n: w.i18n })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    const reset = chrome.querySelector<HTMLButtonElement>('button[aria-label="Reset chart view"]')!
    expect(reset.disabled).toBe(true)
    reset.click()
    expect(w.chart.calls).toEqual([])
  })
})
