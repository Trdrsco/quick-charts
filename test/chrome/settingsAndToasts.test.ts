// @vitest-environment happy-dom
// The settings gear (the top bar's door to the chart settings dialog) and the notices (a live
// region, dismissible, self-retiring, standing where their placement and their space put them).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
    const toasts = mountToasts({ grid }, { i18n: w.i18n, icons: w.icons })
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

describe('where the notices stand', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/components/toasts.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  /** The declarations of the one rule whose selector is `selector`. */
  const rule = (selector: string): Record<string, string> => {
    const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === selector)
    if (!match) throw new Error(`no rule for ${selector}`)
    return Object.fromEntries(match[2]!.split(';').filter((d) => d.includes(':')).map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]))
  }

  it('stand 12px in from the edge or the corner their placement names', () => {
    expect(rule('[data-qc-theme] .qc-toast-stack')).toMatchObject({ bottom: '12px', left: '50%', transform: 'translateX(-50%)' })
    expect(rule("[data-qc-theme] .qc-toasts[data-qc-placement^='top'] .qc-toast-stack")).toMatchObject({ top: '12px', bottom: 'auto' })
    expect(rule("[data-qc-theme] .qc-toasts[data-qc-placement$='-left'] .qc-toast-stack")).toMatchObject({ left: '12px', 'align-items': 'flex-start', transform: 'none' })
    expect(rule("[data-qc-theme] .qc-toasts[data-qc-placement$='-right'] .qc-toast-stack")).toMatchObject({ right: '12px', left: 'auto', 'align-items': 'flex-end', transform: 'none' })
  })

  it("fill a host's space and let the pointer through it", () => {
    expect(rule('[data-qc-theme].qc-toasts-host')).toEqual({ position: 'absolute', inset: '0', 'pointer-events': 'none' })
    expect(rule('[data-qc-theme].qc-toasts-host > .qc-toasts')).toEqual({ position: 'absolute', inset: '0', height: 'auto' })
  })

  it('mount above the charts grid for a top placement and in a space of their own when given one', () => {
    const w = fakeWidget()
    const root = document.body.appendChild(document.createElement('div'))
    const grid = root.appendChild(document.createElement('div'))
    const top = mountToasts({ grid }, { i18n: w.i18n, icons: w.icons, placement: 'top-left' })
    expect(grid.previousElementSibling?.getAttribute('data-qc-placement')).toBe('top-left')
    const space = document.body.appendChild(document.createElement('div'))
    const outside = mountToasts({ space }, { i18n: w.i18n, icons: w.icons, placement: 'bottom-right' })
    outside.push('info', 'Saved a file instead.')
    expect(space.querySelector('.qc-toasts')?.getAttribute('data-qc-placement')).toBe('bottom-right')
    expect(space.querySelector('.qc-toast-text')?.textContent).toBe('Saved a file instead.')
    cleanup.push(() => (top.destroy(), outside.destroy(), w.dispose()))
  })
})
