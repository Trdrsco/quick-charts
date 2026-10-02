// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'
import { authoredStylesheet } from '../theme/stylesheetSource'
import { parseCssColor } from '../../src/theme/color'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})
const widgets: ChartWidget[] = []
afterEach(() => { widgets.splice(0).forEach((widget) => widget.dispose()); document.body.replaceChildren() })
const bars = Array.from({ length: 40 }, (_, index) => ({ t: 60 * (index + 1), o: 10 + index, h: 11 + index, l: 9 + index, c: 10 + index, v: index + 1 }))
function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.createElement('div'); document.body.append(container)
  const { ui, ...rest } = options
  const widget = createChart({ container, symbol: 'ES', timeframe: '1m', datafeed: { search: async () => ({ hits: [], hasMore: false }), resolve: async () => null, history: async () => ({ bars, noData: false }), subscribeBars: () => () => {} }, features: { drawings: false, sessions: false }, ui: { contextMenu: false, ...ui }, ...rest })
  widgets.push(widget)
  return { widget, container }
}

describe('the real widget owns one indicator picker', () => {
  it('opens a declared host collection directly and falls back safely for an unknown collection', async () => {
    const list = vi.fn(async (_request: { collection: string }) => ({ kind: 'ok' as const, items: [] }))
    const { widget } = mount({ indicatorPicker: { collections: [{ id: 'saved', label: 'Saved studies' }], list, act: async () => ({ kind: 'ok' }) } })
    widget.commands.execute('chart.indicators.open', { collection: 'saved' })
    await vi.waitFor(() => expect(list).toHaveBeenCalled())
    expect(list.mock.calls[0]?.[0]).toMatchObject({ collection: 'saved' })
    expect(document.querySelector('.qc-picker-collection[aria-pressed="true"]')?.textContent).toContain('Saved studies')
    document.querySelector<HTMLButtonElement>('.qc-dialog-close')!.click()
    // Asked again while the first is still leaving, the browser opens a fresh one at once.
    widget.commands.execute('chart.indicators.open', { collection: 'missing' })
    const open = document.querySelectorAll('.qc-dialog-scrim[data-state="open"] .qc-picker-dialog')
    expect(open).toHaveLength(1)
    expect(open[0]!.querySelector('.qc-picker-collection[aria-pressed="true"]')?.textContent).not.toContain('Saved studies')
  })
  it('shares the toolbar and command modal, rereads the active pane on each Add, and keeps replay bounded', async () => {
    const { widget, container } = mount()
    await widget.ready()
    widget.layout.setArrangement('2v')
    const [left, right] = widget.charts()
    expect(widget.commands.execute('chart.indicators.open')).toEqual({ kind: 'ok' })
    const dialog = document.querySelector('.qc-picker-dialog')!
    container.querySelector<HTMLButtonElement>('button[aria-label="Indicators"]')!.click()
    expect(document.querySelectorAll('.qc-picker-dialog')).toHaveLength(1)
    dialog.querySelector<HTMLButtonElement>('[data-picker-add="sma"]')!.click()
    expect(left!.indicators.get()).toHaveLength(1)
    widget.layout.setActive(1)
    dialog.querySelector<HTMLButtonElement>('[data-picker-add="sma"]')!.click()
    expect(right!.indicators.get()).toHaveLength(1)
    expect(left!.indicators.get()).toHaveLength(1)
    for (let i = 0; i < 8; i++) await Promise.resolve()
    right!.replay.start(600)
    const before = right!.replay.state()
    expect(before.on).toBe(true)
    expect(before.cursor).toBeLessThan(before.total)
    dialog.querySelector<HTMLButtonElement>('[data-picker-add="sma"]')!.click()
    expect(right!.replay.state()).toEqual(before)
    expect(right!.indicators.get().map((instance) => instance.id)).toEqual(['sma-1', 'sma-2'])
    expect(dialog.isConnected).toBe(true)
  })
  it.each([{ ui: { indicatorPicker: false } }, { access: { command: (id: string) => id !== 'chart.indicators.open' } }])('refuses the same browser through command and toolbar under policy %j', (options) => {
    const { widget, container } = mount(options)
    expect(widget.commands.execute('chart.indicators.open').kind).not.toBe('ok')
    container.querySelector<HTMLButtonElement>('button[aria-label="Indicators"]')?.click()
    expect(document.querySelector('.qc-picker-dialog')).toBeNull()
  })
  it('closes and aborts pending content on disposal, with an inert retained command registry', async () => {
    let signal: AbortSignal | undefined
    const { widget } = mount({ indicatorPicker: { collections: [], list: (_, next) => { signal = next; return new Promise(() => {}) }, act: async () => ({ kind: 'ok' }) } })
    widget.commands.execute('chart.indicators.open')
    expect(document.querySelector('.qc-picker-dialog')).not.toBeNull()
    widget.dispose()
    expect(signal?.aborted).toBe(true)
    expect(document.querySelector('.qc-picker-dialog')).toBeNull()
    expect(widget.commands.execute('chart.indicators.open').kind).not.toBe('ok')
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
  it('retains its dialog and query across RTL locale and custom palette changes', async () => {
    const { widget, container } = mount()
    widget.commands.execute('chart.indicators.open')
    const dialog = document.querySelector('.qc-picker-dialog')!
    const input = dialog.querySelector<HTMLInputElement>('input')!
    input.value = 'sma'; input.dispatchEvent(new Event('input'))
    expect(Number.parseFloat(widget.theme.get()['text.fontSizeBase']) + 2).toBe(16)
    widget.theme.applyCustom({ dark: { 'text.fontSizeBase': '15px', 'state.selected': 'rgba(12, 80, 140, 0.5)', 'text.primary': '#ddeeff' } })
    expect(Number.parseFloat(widget.theme.get()['text.fontSizeBase']) + 2).toBe(17)
    expect(parseCssColor(widget.theme.get()['state.selected'])).toMatchObject({ a: 0.5 })
    expect(document.querySelector('.qc-picker-dialog')).toBe(dialog)
    expect(container.querySelector<HTMLElement>('.qc-root')!.style.getPropertyValue('--qc-text-primary')).toBe('#ddeeff')
    await widget.setLocale('ar')
    expect(document.querySelector('.qc-picker-dialog')).toBe(dialog)
    expect(container.querySelector('.qc-root')?.getAttribute('dir')).toBe('rtl')
    expect(input.value).toBe('sma')
    expect(dialog.querySelector('[data-indicator="sma"]')).not.toBeNull()
    input.focus()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
    expect(document.activeElement?.getAttribute('data-indicator')).toBe('sma')
    // Switching to Arabic imports its dictionaries on first use, which takes seconds on a cold, busy
    // worker; the default five seconds timed this test out under CI load.
  }, 20_000)
  it('disables package Add when its command is denied without disabling the picker', () => {
    const { widget } = mount({ access: { command: (id) => id !== 'chart.indicators.add' } })
    expect(widget.commands.execute('chart.indicators.open').kind).toBe('ok')
    const add = document.querySelector<HTMLButtonElement>('[data-picker-add="sma"]')!
    expect(add.disabled).toBe(true)
    add.click()
    expect(widget.activeChart().indicators.get()).toHaveLength(0)
  })
  it('keeps the pinned geometry, sticky headings, nested hover and keyboard-visible actions using root-scoped logical recipes', () => {
    const css = authoredStylesheet()
    expect(css).toMatch(/\.qc-picker-dialog\s*\{[^}]*height: 638px/)
    expect(css).not.toMatch(/\.qc-picker-dialog\s*\{[^}]*border-radius:/)
    expect(css).toMatch(/\.qc-overlay\s*\{[^}]*border-radius: var\(--qc-chrome-radiusLarge\)/)
    expect(css).toMatch(/\.qc-picker-nav\s*\{[^}]*200px/)
    expect(css).toContain('grid-template-columns: 22px minmax(0, 1fr) 100px 50px 44px')
    expect(css).toMatch(/\.qc-picker-headings\s*\{[^}]*position: sticky/)
    expect(css).toContain('.qc-picker-row:focus-within .qc-picker-actions')
    expect(css).toContain('margin-inline-start: -20px')
    expect(css).toContain('font-size: calc(var(--qc-text-fontSizeBase) + 2px)')
    expect(css).toMatch(/\.qc-picker-collection\[aria-pressed='true'\] \{[^}]*background: var\(--qc-state-selected\)/)
    expect(css).toMatch(/\.qc-picker-collection:not\(\[aria-pressed='true'\]\):hover,[^{]+\{[^}]*background: var\(--qc-state-hover\)/)
    expect(css).not.toMatch(/\.qc-picker-collection:not\(\[aria-pressed='true'\]\):hover,[^{]+\.qc-picker-content/)
    expect(css).toContain('color-mix(in srgb, var(--qc-text-primary) 8%, transparent)')
  })
})
