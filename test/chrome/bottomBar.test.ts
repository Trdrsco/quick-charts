// @vitest-environment happy-dom
// The bottom bar and the navigation cluster: range chips over the range commands, the clock in
// the display zone, the timezone list, the session view offered only where a symbol has extended
// hours, and the five navigation verbs.
import { afterEach, describe, expect, it } from 'vitest'
import { mountBottomBar, timezoneCommand } from '../../src/ui/chrome/bottomBar'
import { mountNavControls } from '../../src/ui/chrome/navControls'
import { RANGE_PRESETS } from '../../src/ranges'
import { FLYOUT_WIDTH } from '../../src/ui/chrome/flyoutGeometry'
import { buttonNames, fakeChart, fakeWidget } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the bottom bar', () => {
  it.each(['.qc-tz-trigger', '.qc-session-trigger'])('%s toggles rather than accumulating panels', (selector) => {
    const w = fakeWidget({ chart: fakeChart({ extendedHours: true }) })
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    const trigger = bar.element.querySelector<HTMLButtonElement>(selector)!
    for (let repeat = 0; repeat < 3; repeat++) {
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-menu-panel')).toHaveLength(1)
      bar.sync()
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-menu-panel')).toHaveLength(0)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('lists every range preset as a chip named by its tip, running the preset command', () => {
    const w = fakeWidget()
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    const chips = [...bar.element.querySelectorAll<HTMLButtonElement>('.qc-range-chip')]
    const selected = () => [...bar.element.querySelectorAll<HTMLButtonElement>('.qc-range-chip[aria-pressed="true"]')].map((chip) => chip.textContent)
    expect(chips.map((c) => c.textContent)).toEqual(RANGE_PRESETS.map((p) => p.key))
    expect(selected()).toEqual([])
    expect(chips[0]!.getAttribute('aria-label')).toBe('1 Day · 1 Minute bars')
    chips[1]!.click()
    expect(w.chart.calls).toContain('frame:5D')
    bar.sync()
    expect(selected()).toEqual(['5D'])
    w.commands.execute('chart.range.1M')
    bar.sync()
    expect(selected()).toEqual(['1M'])
    w.chart.handle.reset()
    bar.sync()
    expect(selected()).toEqual([])
    w.commands.execute('chart.range.5D')
    w.chart.handle.setTimeframe('1h')
    bar.sync()
    expect(selected()).toEqual([])
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

describe('the timezone flyout geometry', () => {
  it('opens upward at the pinned 251px, the chosen zone checked in its column', () => {
    const w = fakeWidget()
    const bar = mountBottomBar(w.ctx)
    document.body.appendChild(bar.element)
    cleanup.push(() => (bar.destroy(), w.dispose()))
    bar.element.querySelector<HTMLButtonElement>('.qc-tz-trigger')!.click()
    const panel = w.overlays.querySelector<HTMLElement>('.qc-tz-menu')!
    expect(panel.style.width).toBe(`${FLYOUT_WIDTH.timezone}px`)
    expect(FLYOUT_WIDTH.timezone).toBe(251)
    // Every zone row keeps the mark column; only the chosen zone's carries the check.
    const marked = [...panel.querySelectorAll('.qc-menu-row')].filter((row) => row.querySelector('.qc-menu-icon svg'))
    expect(marked).toHaveLength(1)
    expect(marked[0]!.getAttribute('aria-selected')).toBe('true')
  })
})

describe('the navigation cluster', () => {
  it('carries the five verbs as a labeled group and routes each through its command', () => {
    const w = fakeWidget()
    const chrome = document.createElement('div')
    const gestures = document.createElement('div')
    document.body.append(gestures, chrome)
    const nav = mountNavControls({ chrome, gestures, commands: w.commands, i18n: w.i18n, icons: w.icons, maximized: () => false })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    const group = chrome.querySelector('.qc-nav')!
    expect(group.getAttribute('role')).toBe('group')
    // The maximize control stands between what the view is worth seeing at and which way it moves,
    // and is out of the cluster entirely on a single chart: there is nothing for one tile to fill,
    // and the group it stands in goes with it rather than holding its space open.
    expect(buttonNames(group)).toEqual(['Zoom out', 'Zoom in', 'Maximize chart', 'Scroll left', 'Scroll right', 'Reset chart view'])
    expect(group.querySelector<HTMLButtonElement>('button[aria-label="Maximize chart"]')!.hidden).toBe(true)
    expect([...group.querySelectorAll<HTMLElement>('.qc-nav-group')].map((box) => box.hidden)).toEqual([false, true, false, false])
    for (const b of group.querySelectorAll('button')) b.click()
    expect(w.chart.calls).toEqual(['zoom:out', 'zoom:in', 'scroll:left', 'scroll:right', 'reset'])
  })

  it('shows itself when the pointer comes NEAR it, and stands down again when it leaves', () => {
    const w = fakeWidget()
    const chrome = document.createElement('div')
    const gestures = document.createElement('div')
    document.body.append(gestures, chrome)
    const nav = mountNavControls({ chrome, gestures, commands: w.commands, i18n: w.i18n, icons: w.icons, maximized: () => false })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    const group = chrome.querySelector('.qc-nav')!
    // Nothing lays out in this DOM, so the cluster is given the box it has on a chart: the reach is
    // measured off that, and the arithmetic under test is the real one.
    const box = { left: 500, right: 640, top: 700, bottom: 730, width: 140, height: 30, x: 500, y: 700 }
    group.getBoundingClientRect = () => ({ ...box, toJSON: () => box }) as DOMRect
    const move = (x: number, y: number, pointerType = 'mouse') =>
      gestures.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerType }))
    expect(group.hasAttribute('data-qc-near')).toBe(false)
    // The top of the plot, right above the cluster: reading price action is not reaching for it.
    move(570, 400)
    expect(group.hasAttribute('data-qc-near')).toBe(false)
    // Coming down towards it, and over it.
    move(570, 640)
    expect(group.hasAttribute('data-qc-near')).toBe(true)
    move(570, 715)
    expect(group.hasAttribute('data-qc-near')).toBe(true)
    // A finger says nothing either way: a touch host reaches these through the chart's gestures.
    move(570, 400, 'touch')
    expect(group.hasAttribute('data-qc-near')).toBe(true)
    // Away again, and off the chart entirely.
    move(570, 400)
    expect(group.hasAttribute('data-qc-near')).toBe(false)
    move(570, 715)
    gestures.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    expect(group.hasAttribute('data-qc-near')).toBe(false)
  })

  it('disables a denied verb and does nothing when it is pressed', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.view.reset' } })
    const chrome = document.createElement('div')
    const gestures = document.createElement('div')
    document.body.append(gestures, chrome)
    const nav = mountNavControls({ chrome, gestures, commands: w.commands, i18n: w.i18n, icons: w.icons, maximized: () => false })
    cleanup.push(() => (nav.destroy(), w.dispose()))
    const reset = chrome.querySelector<HTMLButtonElement>('button[aria-label="Reset chart view"]')!
    expect(reset.disabled).toBe(true)
    reset.click()
    expect(w.chart.calls).toEqual([])
  })
})
