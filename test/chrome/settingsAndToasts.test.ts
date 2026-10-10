// @vitest-environment happy-dom
// The settings gear (the top bar's door to the chart settings dialog) and the notices (a live
// region, dismissible, self-retiring).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountSettingsMenu } from '../../src/ui/chrome/settingsMenu'
import { mountToasts, TOAST_MS } from '../../src/ui/chrome/toasts'
import { fakeWidget } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the settings gear', () => {
  it('opens the chart settings dialog of the chrome, says so, and closes it again', () => {
    const w = fakeWidget()
    const menu = mountSettingsMenu({ ...w.ctx, settingsDialog: w.topBarParts.settingsDialog })
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    expect(menu.element.getAttribute('aria-haspopup')).toBe('dialog')
    expect(menu.element.getAttribute('aria-expanded')).toBe('false')
    menu.element.click()
    expect(w.overlays.querySelectorAll('.qc-chart-settings-dialog')).toHaveLength(1)
    expect(menu.element.getAttribute('aria-expanded')).toBe('true')
    menu.element.click()
    expect(menu.element.getAttribute('aria-expanded')).toBe('false')
  })

  it('reaches the same dialog the open command does, on the page it names', () => {
    const w = fakeWidget()
    const menu = mountSettingsMenu({ ...w.ctx, settingsDialog: w.topBarParts.settingsDialog })
    cleanup.push(() => (menu.destroy(), w.dispose()))
    expect(w.commands.execute('chart.settings.open', { page: 'canvas' }).kind).toBe('ok')
    expect(menu.element.getAttribute('aria-expanded')).toBe('true')
    const selected = w.overlays.querySelector<HTMLElement>('.qc-chart-settings-nav-item[aria-selected="true"]')!
    expect(selected.dataset.settingsPage).toBe('canvas')
  })
})

describe('the notices', () => {
  it('announce through a live region, dismiss on their button, and retire themselves', () => {
    vi.useFakeTimers()
    const w = fakeWidget()
    const root = document.createElement('div')
    const grid = document.createElement('div')
    root.appendChild(grid)
    document.body.appendChild(root)
    const toasts = mountToasts(grid, { i18n: w.i18n, icons: w.icons })
    cleanup.push(() => (toasts.destroy(), w.dispose(), vi.useRealTimers()))
    // The region follows the charts grid as its sibling; the grid itself stays empty.
    const region = root.querySelector<HTMLElement>('.qc-toasts')!
    expect(grid.nextElementSibling).toBe(region)
    expect(grid.children.length).toBe(0)
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
