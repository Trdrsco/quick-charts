// @vitest-environment happy-dom
// The top bar: what it renders from the active chart, which controls each presentation flag removes,
// and that every press is a command: a denied command renders disabled and does nothing.
import { afterEach, describe, expect, it } from 'vitest'
import { mountTopBar, type TopBarHandle } from '../../src/ui/chrome/topBar'
import { FLYOUT_WIDTH } from '../../src/ui/chrome/flyoutGeometry'
import { symbolLabel } from '../../src/symbolLabel'
import { memoryChartStorage } from '../../src/storage'
import { buttonNames, fakeWidget, settle } from './harness'
import type { FeatureConfig, UiConfig } from '../../src/widget/options'
import type { ChartStyleId } from '../../src/widget/styles'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

function mount(options: { features?: FeatureConfig; ui?: UiConfig; access?: (id: string) => boolean; styles?: readonly ChartStyleId[] } = {}): { bar: TopBarHandle; w: ReturnType<typeof fakeWidget> } {
  const w = fakeWidget({ features: options.features, ui: options.ui, styles: options.styles, access: options.access ? { command: options.access } : undefined })
  const notices: string[] = []
  const bar = mountTopBar({ ...w.ctx, ...w.topBarParts, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => notices.push('search'), notify: (kind, text) => notices.push(`${kind}:${text}`) })
  document.body.appendChild(bar.element)
  cleanup.push(() => {
    bar.destroy()
    w.dispose()
  })
  return { bar, w }
}

describe('the top bar', () => {
  it('uses the chart-owned double-rewind mark for replay', () => {
    const { bar } = mount()
    const replay = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Bar replay"]')!
    const path = replay.querySelector('path')!
    expect(path.getAttribute('d')).toBe('M13.5 9L13.5 20L7.5 14.5ZM21.5 9L21.5 20L15.5 14.5Z')
    expect(path.getAttribute('stroke')).toBe('currentColor')
  })
  it('stands undo and redo down on an empty history, and names each after the step it would move', () => {
    const { bar, w } = mount()
    const control = (label: string): HTMLButtonElement => [...bar.element.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(label))!
    const undo = control('Undo')
    const redo = control('Redo')
    // Nothing to take back and nothing to put back: both controls are out of the tab order and
    // carry the verb's own name rather than a word for a step that is not there.
    expect([undo.disabled, redo.disabled]).toEqual([true, true])
    expect([undo.getAttribute('aria-label'), undo.title]).toEqual(['Undo', 'Undo'])
    undo.click()
    expect(w.chart.calls).not.toContain('history:undo')

    w.chart.state.history = { past: 1, future: 0, undoChange: 'timeframe', redoChange: null }
    bar.sync()
    expect(undo.disabled).toBe(false)
    expect(undo.getAttribute('aria-label')).toBe('Undo timeframe change')
    expect(redo.disabled).toBe(true)
    undo.click()
    expect(w.chart.calls).toContain('history:undo')
    // The step's own word travels with it, so the redo that would put it back names the same thing.
    bar.sync()
    expect(control('Redo').disabled).toBe(false)
  })

  it('renders undo and redo disabled where the policy refuses them, and running one does nothing', () => {
    const { bar, w } = mount({ access: (id) => !id.startsWith('chart.history.') })
    w.chart.state.history = { past: 2, future: 2, undoChange: 'symbol', redoChange: 'symbol' }
    bar.sync()
    for (const label of ['Undo', 'Redo']) {
      const control = [...bar.element.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? '').startsWith(label))!
      expect(control.disabled, label).toBe(true)
      control.click()
    }
    expect(w.chart.calls.filter((c) => c.startsWith('history:'))).toEqual([])
  })

  it.each(['All timeframes', 'Chart style', 'Layout setup', 'Manage layouts', 'Chart image'])('%s toggles without duplicating its panel', (label) => {
    const { bar, w } = mount()
    const trigger = [...bar.element.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.getAttribute('aria-label')?.startsWith(label))!
    for (let repeat = 0; repeat < 3; repeat++) {
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-menu-panel')).toHaveLength(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      bar.sync()
      trigger.click()
      expect(w.overlays.querySelectorAll('.qc-menu-panel')).toHaveLength(0)
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger)
    }
  })

  it('Chart settings opens one dialog and completes its animated close before reopening', async () => {
    const { bar } = mount()
    const trigger = bar.element.querySelector<HTMLButtonElement>('button[aria-label="Chart settings"]')!
    for (let repeat = 0; repeat < 2; repeat++) {
      trigger.focus()
      trigger.click()
      expect(document.querySelectorAll('.qc-chart-settings-dialog')).toHaveLength(1)
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      trigger.click()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(document.querySelector('.qc-chart-settings-dialog')?.getAttribute('aria-hidden')).toBe('true')
      await new Promise((resolve) => setTimeout(resolve, 240))
      expect(document.querySelectorAll('.qc-chart-settings-dialog')).toHaveLength(0)
      expect(document.activeElement).toBe(trigger)
    }
  })

  it('Chart settings uses a section rail and Cancel restores previewed changes', () => {
    const { bar, w } = mount()
    bar.element.querySelector<HTMLButtonElement>('button[aria-label="Chart settings"]')!.click()
    const dialog = document.querySelector<HTMLElement>('.qc-chart-settings-dialog')!
    expect(dialog.querySelector('.qc-dialog-title')?.textContent).toContain('Settings')
    expect([...dialog.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['Appearance', 'Display', 'Price scale', 'Theme'])
    expect([...dialog.querySelectorAll('.qc-chart-settings-footer .qc-button')].map((control) => control.textContent)).toEqual(['Apply defaults', 'Cancel', 'Ok'])

    dialog.querySelector<HTMLButtonElement>('[role="tab"][data-settings-page="display"]')!.click()
    const grid = dialog.querySelector<HTMLButtonElement>('[role="switch"][aria-label="Grid lines"]')!
    grid.click()
    expect(w.chart.state.settings.canvas.verticalGrid).toBe(false)
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(w.chart.state.settings.canvas.verticalGrid).toBe(true)
  })

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
    expect(names).toContain('Undo')
    expect(names).toContain('Redo')
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
    expect(symbolLabel('1/ES')).toBe('1/ES')
    expect(symbolLabel('ES-NQ')).toBe('ES-NQ')
    expect(symbolLabel('BINANCE:BTCUSDT')).toBe('BTCUSDT')
    expect(symbolLabel('CME:ES1!')).toBe('ES1!')
    expect(symbolLabel('CME:ES-NQ')).toBe('CME:ES-NQ')
    expect(symbolLabel('CME:ES/CME:NQ')).toBe('CME:ES/CME:NQ')
    w.chart.handle.setSymbol('BINANCE:BTCUSDT')
    bar.sync()
    const pill = bar.element.querySelector('.qc-symbol-pill')!
    expect(pill.textContent).toBe('BTCUSDT')
    expect(pill.getAttribute('title')).toContain('BINANCE:BTCUSDT')
    expect(w.chart.handle.symbol()).toBe('BINANCE:BTCUSDT')
  })

  it('removes a control when the interface hides it, and keeps the rest', () => {
    const { bar } = mount({ ui: { topBar: { symbol: false, styles: false, layouts: false, image: false } } })
    const names = buttonNames(bar.element)
    expect(names.some((n) => n.startsWith('Search symbol'))).toBe(false)
    expect(names.some((n) => n.startsWith('Chart style'))).toBe(false)
    expect(names).not.toContain('Manage layouts')
    expect(names).not.toContain('Chart image')
    expect(names).toContain('Indicators')
  })

  it('the style picker lists the seven styles by family as radio rows, checks the current one, and routes a pick through its command', () => {
    const { bar, w } = mount()
    const trigger = bar.element.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!
    trigger.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    expect(menu.classList.contains('qc-style-menu')).toBe(true)
    expect(menu.style.width).toBe(`${FLYOUT_WIDTH.chartStyle}px`)
    const rows = [...menu.querySelectorAll('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Bars', 'Candles', 'Hollow candles', 'Line', 'Step line', 'Area', 'Baseline'])
    // The bars, the lines and the filled areas, each family under a rule.
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(2)
    expect(rows.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false'])
    ;(rows[3] as HTMLButtonElement).click()
    expect(w.chart.calls).toContain('style:line')
    expect(w.overlays.querySelector('[role="menu"]')).toBeNull()
    bar.sync()
    expect(trigger.getAttribute('aria-label')).toBe('Chart style: Line')
  })

  it('the style picker lists only the offered styles, in the order given, with a rule where the family changes', () => {
    const { bar, w } = mount({ styles: ['line', 'candles', 'bars', 'area'] })
    bar.element.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!.click()
    const menu = w.overlays.querySelector<HTMLElement>('[role="menu"]')!
    const rows = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Line', 'Candles', 'Bars', 'Area'])
    expect(menu.querySelectorAll('[role="separator"]').length).toBe(2)
    expect(rows.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false'])
    rows[3]!.click()
    expect(w.chart.calls).toContain('style:area')
    const ids = w.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.style.'))
    expect(ids).toEqual(['chart.style.line', 'chart.style.candles', 'chart.style.bars', 'chart.style.area'])
    expect(w.commands.execute('chart.style.hollow').kind).not.toBe('ok')
    expect(w.chart.calls).not.toContain('style:hollow')
  })

  it('shows no style picker when one style is offered, since there is nothing to choose', () => {
    const { bar, w } = mount({ styles: ['line'] })
    expect(buttonNames(bar.element).some((n) => n.startsWith('Chart style'))).toBe(false)
    expect(w.ui.stylePicker).toBe(false)
    expect(w.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.style.'))).toEqual(['chart.style.line'])
  })

  it('hides the picker with ui.topBar.styles: false independently of the offered styles', () => {
    const hidden = mount({ ui: { topBar: { styles: false } } })
    expect(buttonNames(hidden.bar.element).some((n) => n.startsWith('Chart style'))).toBe(false)
    expect(hidden.w.commands.list().filter((spec) => spec.id.startsWith('chart.style.'))).toHaveLength(7)
    const both = mount({ ui: { topBar: { styles: false } }, styles: ['candles', 'line'] })
    expect(buttonNames(both.bar.element).some((n) => n.startsWith('Chart style'))).toBe(false)
    expect(both.w.commands.execute('chart.style.line').kind).toBe('ok')
    expect(both.w.chart.calls).toContain('style:line')
    expect(both.w.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.style.'))).toEqual(['chart.style.candles', 'chart.style.line'])
  })

  it('a denied command renders disabled and does nothing when pressed', () => {
    const { bar, w } = mount({ access: (id) => !id.startsWith('chart.style.') && id !== 'chart.replay.start' })
    const trigger = bar.element.querySelector<HTMLButtonElement>('button[aria-label^="Chart style"]')!
    trigger.click()
    const rows = [...w.overlays.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
    const others = rows.filter((r) => r.getAttribute('aria-checked') !== 'true')
    expect(others.length).toBe(6)
    expect(others.every((r) => r.disabled && r.getAttribute('aria-disabled') === 'true')).toBe(true)
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
    const bar = mountTopBar({ ...w.ctx, ...w.topBarParts, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => undefined, notify: () => undefined })
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
    const bar = mountTopBar({ ...w.ctx, ...w.topBarParts, ui: w.ui, storage: memoryChartStorage(), preferences: {}, saveLoad: null, autosave: w.autosave, openSearch: () => undefined, notify: () => undefined })
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

  describe('the labels a control carries', () => {
    const chip = (bar: TopBarHandle, selector: string): string | null =>
      bar.element.querySelector(`${selector} .qc-button-text`)?.textContent ?? null
    const indicators = '[aria-haspopup="dialog"][data-qc-label]'
    const replay = '[data-qc-mode="held"]'

    it('writes the short word beside the glyph while the accessible name stays the full one', () => {
      const { bar } = mount()
      expect(chip(bar, indicators)).toBe('Indicators')
      expect(chip(bar, replay)).toBe('Replay')
      // A bar read aloud says which replay it is; the chip beside the glyph does not have to.
      expect(bar.element.querySelector(replay)!.getAttribute('aria-label')).toBe('Bar replay')
    })

    it('says which labels the row may take back, and keeps the one it may not', () => {
      const { bar } = mount()
      expect(bar.element.querySelector(indicators)!.getAttribute('data-qc-label')).toBe('last')
      expect(bar.element.querySelector(replay)!.getAttribute('data-qc-label')).toBe('drop')
      // The row states how far down the order it got, so the recipe has something to answer.
      expect(bar.element.dataset.qcLabels).toBe('all')
    })

    it('rewrites the chips from the catalog on a language change rather than emptying them', async () => {
      const { bar, w } = mount()
      await w.i18n.setLocale('de')
      // German has yet to be written for these two, so the words are still the English ones; what
      // this holds is that the sync REWRITES them from the catalog instead of clearing the nodes.
      expect(chip(bar, indicators)).toBe('Indicators')
      expect(chip(bar, replay)).toBe('Replay')
      expect(bar.element.dataset.qcLabels).toBe('all')
    })

    it('reads replay as a held mode, pressed for as long as the chart is in it', async () => {
      const { bar, w } = mount()
      const button = bar.element.querySelector(replay)!
      expect(button.getAttribute('aria-pressed')).toBe('false')
      w.chart.state.replay.on = true
      bar.sync()
      expect(button.getAttribute('aria-pressed')).toBe('true')
    })
  })

  it('relabels every control when the language changes', async () => {
    const { bar, w } = mount()
    const caret = bar.element.querySelector<HTMLButtonElement>('.qc-tf-caret')!
    expect(caret.getAttribute('aria-label')).toBe('All timeframes')
    await w.i18n.setLocale('de')
    expect(caret.getAttribute('aria-label')).toBe('Alle Zeiteinheiten')
  })
})
