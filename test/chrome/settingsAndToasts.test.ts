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
    const menu = mountSettingsMenu({ ...w.ctx, ui: w.ui })
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    expect(menu.element.getAttribute('aria-haspopup')).toBe('dialog')
    menu.element.click()
    const panel = w.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    // Every color row is the package's own control, never the operating system's dialog.
    expect(panel.querySelector('input[type="color"]')).toBeNull()
    const colors = [...panel.querySelectorAll<HTMLButtonElement>('.qc-drawing-swatch-button')]
    expect(colors.map((c) => c.getAttribute('aria-label'))).toEqual(['Background', 'Up candles', 'Down candles', 'Up borders', 'Down borders', 'Up wicks', 'Down wicks'])
    colors[1]!.click()
    const palette = panel.querySelector<HTMLElement>('.qc-inline-panel .qc-drawing-palette')!
    expect(palette.querySelectorAll('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')).toHaveLength(80)
    palette.querySelector<HTMLButtonElement>('[aria-label="Color #2962ff"]')!.click()
    expect(w.chart.calls).toContain('appearance:upColor')
    expect(w.chart.state.appearance.appearance.upColor).toBe('#2962ff')
    expect(panel.querySelector('.qc-inline-panel')).toBeNull() // the pick closes what it opened
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

  it('offers Reset defaults below the scale section and runs it through the registry', () => {
    const w = fakeWidget()
    const menu = mountSettingsMenu({ ...w.ctx, ui: w.ui })
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    menu.element.click()
    const panel = w.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    const rows = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Reset defaults'])
    // Directly below the four scale radios and above the theme pair: the baseline's own position.
    const order = [...panel.querySelectorAll<HTMLElement>('[role="menuitem"],[role="menuitemradio"]')]
    const radios = [...panel.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(order.indexOf(rows[0]!)).toBe(order.indexOf(radios[3]!) + 1)
    w.chart.handle.setScaleMode('log')
    w.chart.handle.applyAppearance({ appearance: { upColor: '#112233' } })
    rows[0]!.click()
    expect(w.chart.calls).toContain('appearance:reset')
    expect(w.chart.state.appearance.appearance.upColor).not.toBe('#112233')
    expect(w.chart.state.scale).toBe('normal')
  })

  it('a denied reset leaves its row disabled and the chart untouched', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.appearance.reset' } })
    const menu = mountSettingsMenu({ ...w.ctx, ui: w.ui })
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    menu.element.click()
    const row = w.overlays.querySelector<HTMLButtonElement>('[role="menuitem"]')!
    expect(row.textContent).toBe('Reset defaults')
    expect(row.disabled).toBe(true)
    row.click()
    expect(w.chart.calls).toEqual([])
  })

  it('a denied appearance command leaves the fields disabled and the chart untouched', () => {
    const w = fakeWidget({ access: { command: (id) => id !== 'chart.appearance.apply' } })
    const menu = mountSettingsMenu({ ...w.ctx, ui: w.ui })
    document.body.appendChild(menu.element)
    cleanup.push(() => (menu.destroy(), w.dispose()))
    menu.element.click()
    const color = w.overlays.querySelector<HTMLButtonElement>('.qc-drawing-swatch-button')!
    expect(color.disabled).toBe(true)
    color.click()
    expect(w.overlays.querySelector('.qc-inline-panel')).toBeNull()
    expect(w.chart.calls).toEqual([])
  })

  it('carries the Theme section by default and leaves the whole section out for a host that owns the choice', () => {
    const on = fakeWidget()
    const withTheme = mountSettingsMenu({ ...on.ctx, ui: on.ui })
    document.body.appendChild(withTheme.element)
    cleanup.push(() => (withTheme.destroy(), on.dispose()))
    withTheme.element.click()
    const shown = on.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    expect([...shown.querySelectorAll('.qc-menu-heading')].map((h) => h.textContent)).toContain('Theme')
    expect([...shown.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].map((r) => r.textContent)).toEqual([
      'Regular price scale',
      'Logarithmic price scale',
      'Percentage price scale',
      'Indexed price scale',
      'Light theme',
      'Dark theme',
    ])

    const off = fakeWidget({ ui: { topBar: { settings: { theme: false } } } })
    const withoutTheme = mountSettingsMenu({ ...off.ctx, ui: off.ui })
    document.body.appendChild(withoutTheme.element)
    cleanup.push(() => (withoutTheme.destroy(), off.dispose()))
    withoutTheme.element.click()
    const hidden = off.overlays.querySelector<HTMLElement>('[role="dialog"]')!
    expect([...hidden.querySelectorAll('.qc-menu-heading')].map((h) => h.textContent)).not.toContain('Theme')
    expect([...hidden.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].map((r) => r.textContent)).toEqual([
      'Regular price scale',
      'Logarithmic price scale',
      'Percentage price scale',
      'Indexed price scale',
    ])
    // Reset defaults ends the menu: no rule with nothing under it.
    const body = hidden.querySelector<HTMLElement>('.qc-separator')!.parentElement!
    expect(body.lastElementChild!.getAttribute('role')).toBe('menuitem')
    expect(body.lastElementChild!.textContent).toBe('Reset defaults')
    // The theme itself is still the widget's to set.
    expect(off.commands.available('widget.theme.light')).toBe(true)
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
