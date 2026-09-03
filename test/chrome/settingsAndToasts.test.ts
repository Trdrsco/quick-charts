// @vitest-environment happy-dom
// The settings menu (appearance through the appearance command, scale and theme through theirs)
// and the notices (a live region, dismissible, self-retiring).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSettingsMenu } from '../../src/ui/chrome/settingsMenu'
import { mountToasts, TOAST_MS } from '../../src/ui/chrome/toasts'
import { fakeWidget } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the settings menu', () => {
  it('edits appearance through the appearance command, and scale and theme through theirs', () => {
    const w = fakeWidget()
    const menu = mountSettingsMenu(w.ctx)
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    expect(menu.element.getAttribute('aria-haspopup')).toBe('dialog')
    menu.element.click()
    const panel = w.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    const colors = [...panel.querySelectorAll<HTMLInputElement>('input[type="color"]')]
    expect(colors.map((c) => c.getAttribute('aria-label'))).toEqual(['Background', 'Up candles', 'Down candles', 'Up borders', 'Down borders', 'Up wicks', 'Down wicks'])
    colors[1]!.value = '#112233'
    colors[1]!.dispatchEvent(new Event('input'))
    expect(w.chart.calls).toContain('appearance:upColor')
    expect(w.chart.state.appearance.appearance.upColor).toBe('#112233')
    const switches = [...panel.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual(['Grid lines', 'Session shading'])
    switches[0]!.click()
    expect(w.chart.state.appearance.appearance.grid).toBe(false)
    const radios = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(radios.map((r) => r.textContent)).toEqual(['Regular price scale', 'Logarithmic price scale', 'Percentage price scale', 'Indexed price scale', 'Light theme', 'Dark theme'])
    expect(radios[0]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[5]!.getAttribute('aria-checked')).toBe('true')
    radios[1]!.click()
    expect(w.chart.calls).toContain('scale:log')
    radios[4]!.click()
    expect(w.widget.theme.mode()).toBe('light')
  })

  it('a denied appearance command leaves the fields disabled and the chart untouched', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.appearance.apply' } })
    const menu = mountSettingsMenu(w.ctx)
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    menu.element.click()
    const color = w.overlays.querySelector<HTMLInputElement>('input[type="color"]')!
    expect(color.disabled).toBe(true)
    color.value = '#112233'
    color.dispatchEvent(new Event('input'))
    expect(w.chart.calls).toEqual([])
  })
})

describe('the notices', () => {
  it('announce through a live region, dismiss on their button, and retire themselves', () => {
    vi.useFakeTimers()
    const w = fakeWidget()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const toasts = mountToasts(host, { i18n: w.i18n })
    cleanup.push(() => (toasts.destroy(), w.dispose(), vi.useRealTimers()))
    const region = host.querySelector<HTMLElement>('.qc-toasts')!
    expect(region.getAttribute('role')).toBe('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    toasts.push('error', 'No data for ES from this feed.')
    toasts.push('info', 'Saved a file instead.')
    const cards = (): HTMLElement[] => [...region.querySelectorAll<HTMLElement>('.qc-toast')]
    expect(cards().map((c) => c.dataset.qcKind)).toEqual(['error', 'info'])
    expect(cards()[0]!.querySelector('.qc-toast-text')!.classList.contains('qc-negative')).toBe(true)
    cards()[0]!.querySelector<HTMLButtonElement>('button[aria-label="Dismiss"]')!.click()
    expect(cards().length).toBe(1)
    vi.advanceTimersByTime(TOAST_MS)
    expect(cards().length).toBe(0)
  })
})
