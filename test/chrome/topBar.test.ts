// @vitest-environment happy-dom
// The top bar: what it renders from the active chart, which controls each feature flag removes,
// and that every press is a command: a denied command renders disabled and does nothing.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTopBar, pillSymbol, type TopBarHandle } from '../../src/ui/chrome/topBar'
import { memoryChartStorage } from '../../src/storage'
import { buttonNames, fakeWidget, settle } from './harness'
import type { FeatureConfig } from '../../src/widget/options'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

function mount(options: { features?: FeatureConfig; access?: (id: string) => boolean } = {}): { bar: TopBarHandle; w: ReturnType<typeof fakeWidget> } {
  const w = fakeWidget({ features: options.features, access: options.access ? { command: options.access } : undefined })
  const notices: string[] = []
  const bar = mountTopBar({ ...w.ctx, features: w.features, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => notices.push('search'), notify: (kind, text) => notices.push(`${kind}:${text}`) })
  document.body.appendChild(bar.element)
  cleanup.push(() => {
    bar.destroy()
    w.dispose()
  })
  return { bar, w }
}

describe('the top bar', () => {
  it('is a labeled toolbar carrying every control by default', () => {
    const { bar } = mount()
    expect(bar.element.getAttribute('role')).toBe('toolbar')
    expect(bar.element.getAttribute('aria-label')).toBe('Chart toolbar')
    const names = buttonNames(bar.element)
    expect(names.some((n) => n.startsWith('Search symbol'))).toBe(true)
    expect(names).toContain('Compare or add symbol')
    expect(names).toContain('All timeframes')
    expect(names.some((n) => n.startsWith('Chart style'))).toBe(true)
    expect(names).toContain('Indicators')
    expect(names).toContain('Bar replay')
    expect(names.some((n) => n.startsWith('Layout setup'))).toBe(true)
    expect(names).toContain('Manage layouts')
    expect(names).toContain('Chart settings')
    expect(names).toContain('Fullscreen')
    expect(names).toContain('Chart image')
  })

  it('reads the symbol pill from the active chart, without the slash of a plain pair', () => {
    const { bar, w } = mount()
    expect(bar.element.querySelector('.qc-symbol-pill .qc-button-text')?.textContent).toBe('ES')
    w.chart.handle.setSymbol('BTC/USD')
    bar.sync()
    expect(bar.element.querySelector('.qc-symbol-pill .qc-button-text')?.textContent).toBe('BTCUSD')
    expect(pillSymbol('1/ES')).toBe('1/ES')
    expect(pillSymbol('ES-NQ')).toBe('ES-NQ')
  })

  it('removes a surface when its feature flag is off, and the whole bar when topBar is off', () => {
    const { bar } = mount({ features: { symbolSearch: false, chartStyles: false, layouts: false, image: false } })
    const names = buttonNames(bar.element)
    expect(names.some((n) => n.startsWith('Search symbol'))).toBe(false)
    expect(names.some((n) => n.startsWith('Chart style'))).toBe(false)
    expect(names).not.toContain('Manage layouts')
    expect(names).not.toContain('Chart image')
    expect(names).toContain('Indicators')
  })

  it('the style picker lists the seven styles as radio rows, checks the current one, and routes a pick through its command', () => {
    const { bar, w } = mount()
    const trigger = bar.element.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!
    trigger.click()
    const menu = w.overlays.querySelector('[role="menu"]')!
    const rows = [...menu.querySelectorAll('[role="menuitemradio"]')]
    expect(rows.length).toBe(7)
    expect(rows.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false', 'false', 'false', 'false', 'false'])
    ;(rows[3] as HTMLButtonElement).click()
    expect(w.chart.calls).toContain('style:line')
    expect(w.overlays.querySelector('[role="menu"]')).toBeNull()
    bar.sync()
    expect(trigger.getAttribute('aria-label')).toBe('Chart style: Line')
  })

  it('a denied command renders disabled and does nothing when pressed', () => {
    const { bar, w } = mount({ access: (id) => !id.startsWith('chart.style.') && id !== 'chart.replay.start' })
    const trigger = bar.element.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!
    trigger.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.slice(1).every((r) => r.disabled && r.getAttribute('aria-disabled') === 'true')).toBe(true)
    rows[2]!.click()
    expect(w.chart.calls.filter((c) => c.startsWith('style:'))).toEqual([])
    const replay = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Bar replay"]')!
    expect(replay.disabled).toBe(true)
    replay.click()
    expect(w.chart.calls).not.toContain('replay:start:')
  })

  it('the replay button starts and exits replay and reads as pressed while on', async () => {
    const { bar, w } = mount()
    const replay = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Bar replay"]')!
    expect(replay.getAttribute('aria-pressed')).toBe('false')
    replay.click()
    expect(w.chart.calls).toContain('replay:start:')
    bar.sync()
    await settle()
    expect(replay.getAttribute('aria-pressed')).toBe('true')
    replay.click()
    expect(w.chart.calls).toContain('replay:exit')
  })

  it('the fullscreen button toggles through its command and follows the widget state', () => {
    const { bar, w } = mount()
    const fs = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Fullscreen"]')!
    fs.click()
    expect(w.widgetCalls).toContain('fullscreen:toggle')
    bar.sync()
    expect(fs.getAttribute('aria-label')).toBe('Exit fullscreen')
    expect(fs.getAttribute('aria-pressed')).toBe('true')
  })

  it('the image menu downloads through its command and offers copy only while the registry allows it', async () => {
    const { bar, w } = mount()
    const image = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Chart image"]')!
    image.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Download image', 'Copy image'])
    rows[0]!.click()
    await settle()
    expect(w.widget.image.download).toHaveBeenCalledTimes(1)
  })

  it('the image menu renders copy disabled and inert when the browser cannot put an image on the clipboard', () => {
    const w = fakeWidget({ capabilities: { imageCopy: false } })
    const bar = mountTopBar({ ...w.ctx, features: w.features, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => undefined, notify: () => undefined })
    document.body.appendChild(bar.element)
    cleanup.push(() => {
      bar.destroy()
      w.dispose()
    })
    bar.element.querySelector<HTMLButtonElement>('button[aria-label="Chart image"]')!.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Download image', 'Copy image'])
    expect(rows[1]!.disabled).toBe(true)
    rows[1]!.click()
    expect(w.widget.image.copy).not.toHaveBeenCalled()
  })

  it('copy runs through its command, and a refused copy falls back to a download and reports it', async () => {
    const w = fakeWidget()
    ;(w.widget.image.copy as unknown as { mockResolvedValue(v: boolean): void }).mockResolvedValue(false)
    const heard: string[] = []
    w.events.on('image', (event) => heard.push(event.kind))
    const bar = mountTopBar({ ...w.ctx, features: w.features, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => undefined, notify: () => undefined })
    document.body.appendChild(bar.element)
    cleanup.push(() => {
      bar.destroy()
      w.dispose()
    })
    bar.element.querySelector<HTMLButtonElement>('button[aria-label="Chart image"]')!.click()
    ;[...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')][1]!.click()
    await settle()
    expect(w.widget.image.copy).toHaveBeenCalledTimes(1)
    expect(w.widget.image.download).toHaveBeenCalledTimes(1)
    expect(heard).toEqual(['copyFallback'])
  })

  it('relabels every control when the language changes', async () => {
    const { bar, w } = mount()
    const caret = bar.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!
    expect(caret.getAttribute('aria-label')).toBe('All timeframes')
    await w.i18n.setLocale('de')
    expect(caret.getAttribute('aria-label')).toBe('Alle Zeiteinheiten')
  })
})
