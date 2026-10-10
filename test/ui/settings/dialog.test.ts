// @vitest-environment happy-dom
// The chart settings dialog: the page structure a host hooks, the pages built from the chart's
// settings, the form's layout rules, the rows a host contributes, the edit session (Cancel restores,
// Ok commits, Apply defaults resets), the chart templates and the command that opens the dialog.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createExtensionHost, type ChartExtension, type ChartExtensionHostDeps } from '../../../src/extension'
import { memorySaveLoadAdapter } from '../../../src/resources'
import type { ChartSettingsContribution } from '../../../src/settings/contribution'
import { createChartSettingsDialog } from '../../../src/ui/settings/dialog'
import { ChartTemplates } from '../../../src/ui/settings/templates'
import { fakeChart, fakeWidget, type FakeChartOptions } from '../../chrome/harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

/** A widget over the fake chart, whose registry carries the settings commands the dialog writes
 *  through, and a dialog of its own over it. The chart's `viewer` state is the viewer's settings. */
function setup(options: { chart?: FakeChartOptions; templates?: boolean; access?: (id: string) => boolean } = {}) {
  const chart = fakeChart(options.chart)
  const w = fakeWidget({ chart, ...(options.access ? { access: { command: options.access } } : {}) })
  const templates = options.templates ? new ChartTemplates(memorySaveLoadAdapter().templates('chart')) : null
  const dialog = createChartSettingsDialog({ ...w.ctx, templates })
  cleanup.push(() => {
    dialog.destroy()
    w.dispose()
  })
  // The dialog standing open, never one still playing its exit.
  const box = (): HTMLElement => w.overlays.querySelector<HTMLElement>('.qc-chart-settings-dialog:not([aria-hidden="true"])')!
  const panel = (): HTMLElement => box().querySelector<HTMLElement>('.qc-chart-settings-panel')!
  const rows = (): HTMLElement[] => [...panel().children] as HTMLElement[]
  const rowIds = (): string[] => rows().map((row) => row.dataset.row ?? '')
  const tab = (page: string): HTMLButtonElement => box().querySelector<HTMLButtonElement>(`.qc-chart-settings-nav-item[data-settings-page="${page}"]`)!
  const check = (id: string): HTMLInputElement => panel().querySelector<HTMLInputElement>(`[data-row="${id}"] input[type="checkbox"]`)!
  const controls = (id: string): HTMLElement[] => [...panel().querySelectorAll<HTMLElement>(`[data-row="${id}"] [data-qc-key]`)].filter((c) => !(c.dataset.qcKey ?? '').endsWith(':check'))
  return { w, chart, dialog, templates, box, panel, rows, rowIds, tab, check, controls }
}

/** An extension host for the fake chart, with one extension contributing what it is given. */
function contribute(chartId: string, ...contributions: ChartSettingsContribution[]): () => void {
  const extension: ChartExtension = {
    id: 'host-settings',
    attach(context) {
      for (const contribution of contributions) context.contributeSettings(contribution)
      return { detach: () => undefined }
    },
  }
  const host = createExtensionHost({ chartId } as unknown as ChartExtensionHostDeps, [extension])
  return () => host.detach()
}

const pageLabels = (s: ReturnType<typeof setup>): string[] => [...s.box().querySelectorAll('.qc-chart-settings-nav-item')].map((item) => item.textContent ?? '')

describe('the page structure a host hooks', () => {
  it('keeps the dialog, body, rail, tab, panel and footer classes, the tab ids, and the 750px card', () => {
    const s = setup()
    s.dialog.open()
    const box = s.box()
    expect(box.style.width).toBe('750px')
    const body = box.querySelector(':scope > .qc-chart-settings-body')!
    expect(body).not.toBeNull()
    expect(box.querySelector(':scope > .qc-dialog-title')).not.toBeNull()
    expect(body.querySelector(':scope > .qc-chart-settings-nav')).not.toBeNull()
    expect(body.querySelector(':scope > .qc-chart-settings-panel')).not.toBeNull()
    expect(box.querySelector(':scope > .qc-chart-settings-footer')).not.toBeNull()
    const tabs = [...box.querySelectorAll<HTMLElement>('.qc-chart-settings-nav-item')]
    expect(tabs.map((t) => t.getAttribute('role'))).toEqual(['tab', 'tab', 'tab', 'tab', 'tab'])
    expect(tabs.every((t) => /^qc-chart-settings-tab-\d+-\w+$/.test(t.id) && document.getElementById(t.id) === t)).toBe(true)
    expect(pageLabels(s)).toEqual(['Symbol', 'Status line', 'Scales and lines', 'Canvas', 'Events'])
    expect(box.querySelector('.qc-dialog-title .qc-title')!.textContent).toBe('Settings')
    expect(box.getAttribute('aria-label')).toBe('Chart settings')
  })

  it('keeps a tab id across a page change, so a host that read it finds it again', () => {
    const s = setup()
    s.dialog.open()
    const id = s.tab('canvas').id
    s.tab('canvas').click()
    expect(document.getElementById(id)?.getAttribute('aria-selected')).toBe('true')
    expect(s.panel().getAttribute('aria-labelledby')).toBe(id)
  })

  it('lets the pointer through to the chart behind it, and opens on the first page by default', () => {
    const s = setup()
    s.dialog.open()
    expect((s.box().parentElement as HTMLElement).dataset.qcPass).toBe('true')
    expect(s.tab('symbol').getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(s.tab('symbol'))
  })
})

describe('the form', () => {
  it('lays a checkbox row with no controls across both columns, and a labelled row as two grid cells', () => {
    const s = setup()
    s.dialog.open('statusLine')
    const logo = s.panel().querySelector<HTMLElement>('[data-row="logo"]')!
    expect(logo.classList.contains('qc-settings-check')).toBe(true)
    const title = s.panel().querySelector<HTMLElement>('[data-row="title"]')!
    expect(title.classList.contains('qc-drawing-row')).toBe(true)
    expect(title.children[0]!.classList.contains('qc-drawing-row-label')).toBe(true)
    expect(title.children[1]!.classList.contains('qc-drawing-row-controls')).toBe(true)
    // The headings carry the section's name in the catalog's words; the stylesheet writes them in capitals.
    expect([...s.panel().querySelectorAll('.qc-settings-heading')].map((h) => h.textContent)).toEqual(['Instrument'])
  })

  it('disables an unchecked row\'s controls and the sub-rows under it, and stands their words back', () => {
    const s = setup()
    const off = contribute(
      'chart-1',
      {
        place: { page: { id: 'host', label: 'Host', icon: () => () => undefined } },
        build(form) {
          form.heading('General')
          form.check({ id: 'parent', label: 'Parent', checked: false, onChange: () => undefined, controls: (c) => c.slider({ value: 0.5, kind: 'volume', onChange: () => undefined }) })
          form.check({ id: 'child', label: 'Child', checked: true, indent: true, hint: 'Under the parent', onChange: () => undefined })
          form.field({ id: 'childField', label: 'Units', indent: true, controls: (c) => c.select({ value: 'a', options: [{ value: 'a', label: 'A' }], width: 100, onChange: () => undefined }) })
          form.check({ id: 'other', label: 'Other', checked: true, onChange: () => undefined })
        },
      },
    )
    cleanup.push(off)
    s.dialog.open('host')
    const parent = s.panel().querySelector<HTMLElement>('[data-row="parent"]')!
    expect(parent.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(true)
    // A switched-off volume wears the muted speaker.
    expect(parent.querySelector('.qc-settings-slider')!.getAttribute('data-disabled')).toBe('true')
    const child = s.panel().querySelector<HTMLElement>('[data-row="child"]')!
    expect(child.dataset.indent).toBe('true')
    expect(child.dataset.disabled).toBe('true')
    expect(child.querySelector<HTMLInputElement>('input')!.disabled).toBe(true)
    expect(child.querySelector('.qc-settings-hint')!.textContent).toBe('Under the parent')
    const field = s.panel().querySelector<HTMLElement>('[data-row="childField"]')!
    expect(field.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true)
    expect(s.panel().querySelector<HTMLElement>('[data-row="other"]')!.dataset.disabled).toBe('false')
  })

  it('draws the page again from the state a change made, and keeps the keyboard on the control', () => {
    const s = setup({ chart: { timeframe: '5m' } })
    s.dialog.open('events')
    const swatch = (): HTMLButtonElement => s.panel().querySelector<HTMLButtonElement>('[data-row="sessionBreaks"] .qc-drawing-swatch-button')!
    expect(swatch().disabled).toBe(true)
    s.check('sessionBreaks').focus()
    s.check('sessionBreaks').click()
    expect(s.chart.state.viewer).toEqual({ events: { sessionBreaks: true } })
    expect(swatch().disabled).toBe(false)
    expect((document.activeElement as HTMLElement).dataset.qcKey).toBe('sessionBreaks:check')
  })

  it('stacks a second line of controls in the controls\' column', () => {
    const s = setup()
    s.dialog.open('scales')
    const symbol = s.panel().querySelector<HTMLElement>('[data-row="symbolLabel"] .qc-settings-controls')!
    const lines = [...symbol.querySelectorAll('.qc-settings-line')]
    expect(lines).toHaveLength(2)
    expect(lines[0]!.querySelectorAll('button')).toHaveLength(2)
    expect(lines[1]!.querySelector('button')!.textContent).toBe('Value according to scale')
  })
})

describe('the chart\'s pages', () => {
  it('builds the Symbol page for the chart\'s style, then precision and timezone', () => {
    const s = setup()
    s.dialog.open()
    expect(s.rowIds()).toEqual(['', 'colorOnPreviousClose', 'body', 'borders', 'wick', '', 'precision', 'timezone'])
    expect(s.controls('body').map((c) => c.getAttribute('aria-label'))).toEqual(['Body up color', 'Body down color'])
    expect(s.controls('precision')[0]!.textContent).toBe('Default')
    s.controls('precision')[0]!.click()
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)
    expect(options).toHaveLength(25)
    expect(options.slice(0, 4)).toEqual(['Default', 'Integer', '1 decimal', '2 decimals'])
    expect(options.slice(-8)).toEqual(['1/2', '1/4', '1/8', '1/16', '1/32', '1/64', '1/128', '1/320'])
  })

  it('offers bars their open switch as HLC bars, and a line its gradient or solid stroke', () => {
    const bars = setup({ chart: { style: 'bars' } })
    bars.dialog.open()
    expect(bars.rowIds().slice(0, 6)).toEqual(['', 'colorOnPreviousClose', 'hlcBars', 'upColor', 'downColor', 'thinBars'])
    bars.check('hlcBars').click()
    expect(bars.chart.state.viewer).toEqual({ bars: { hlcBars: true } })

    const line = setup({ chart: { style: 'line' } })
    line.dialog.open()
    const stroke = (): HTMLElement[] => line.controls('line')
    expect(stroke().map((c) => c.className.includes('qc-drawing-swatch-button') ? 'color' : c.className.includes('qc-settings-width') ? 'width' : 'select')).toEqual(['select', 'color', 'color', 'width'])
    line.chart.handle.applySettings({ line: { colorType: 'solid' } })
    line.tab('symbol').click()
    expect(stroke()).toHaveLength(2)
    expect(stroke()[1]!.querySelector('.qc-drawing-stroke')).not.toBeNull()
  })

  it('stands the baseline\'s base level in a 120px field with its unit', () => {
    const s = setup({ chart: { style: 'baseline' } })
    s.dialog.open()
    expect(s.rowIds().slice(0, 8)).toEqual(['', 'priceSource', 'topLine', 'bottomLine', 'fillTopArea', 'fillBottomArea', 'baseLevelPercentage', ''])
    const level = s.panel().querySelector<HTMLElement>('[data-row="baseLevelPercentage"] .qc-drawing-number-wrap')!
    expect(level.style.width).toBe('120px')
    expect(s.panel().querySelector('[data-row="baseLevelPercentage"] .qc-settings-suffix')!.textContent).toBe('%')
  })

  it('shows the trading-hours rows only on an intraday chart of a symbol with extended hours', () => {
    const daily = setup({ chart: { timeframe: '1D', extendedHours: true } })
    daily.dialog.open()
    expect(daily.rowIds()).not.toContain('session')
    const intraday = setup({ chart: { timeframe: '5m', extendedHours: true } })
    intraday.dialog.open()
    expect(intraday.rowIds()).toContain('session')
    expect(intraday.rowIds()).not.toContain('sessionBackground')
    intraday.chart.handle.applySettings({ symbol: { session: 'allHours' } })
    intraday.tab('symbol').click()
    const background = intraday.panel().querySelector('[data-row="sessionBackground"]')!
    expect(background.querySelector('.qc-settings-label-text')!.textContent).toBe('Pre/post/night market hours background')
    expect(intraday.controls('sessionBackground').map((c) => c.getAttribute('aria-label'))).toEqual(['Pre-market', 'Post-market', 'Night'])
  })

  it('shows the Status line\'s indicator rows only with an indicator, and Background last', () => {
    const s = setup()
    s.dialog.open('statusLine')
    expect(s.rowIds()).toEqual(['', 'logo', 'title', 'chartValues', 'barChange', 'volume', 'lastDayChange', 'background'])
    s.chart.handle.indicators.add({ id: 'rsi-1' } as never)
    expect(s.rowIds()).toEqual(['', 'logo', 'title', 'chartValues', 'barChange', 'volume', 'lastDayChange', 'indicators', 'indicatorTitles', 'indicatorInputs', 'indicatorValues', 'background'])
    const slider = s.panel().querySelector<HTMLInputElement>('[data-row="background"] input[type="range"]')!
    expect(slider.className).toBe('qc-settings-opacity')
    expect(slider.value).toBe('50')
    slider.value = '80'
    slider.dispatchEvent(new Event('input'))
    expect(s.chart.state.viewer).toEqual({ statusLine: { backgroundOpacity: 80 } })
  })

  it('builds the Canvas page with its watermark parts and margins', () => {
    const s = setup()
    s.dialog.open('canvas')
    expect(s.rowIds()).toEqual(['', 'background', 'verticalGrid', 'horizontalGrid', 'crosshair', 'watermark', '', 'scaleText', 'scaleLines', '', 'navigationButtons', 'paneButtons', '', 'marginTop', 'marginBottom', 'marginRight'])
    const watermark = s.controls('watermark')[0]!
    expect(watermark.textContent).toBe('Replay mode')
    watermark.click()
    expect([...document.querySelectorAll('[role="menuitemcheckbox"]')].map((o) => o.textContent)).toEqual(['Ticker', 'Interval', 'Description', 'Replay mode'])
    expect(s.panel().querySelector('[data-row="marginRight"] .qc-settings-suffix')!.textContent).toBe('bars')
  })

  it('leaves the Events page its session breaks on an intraday chart alone', () => {
    const daily = setup({ chart: { timeframe: '1D' } })
    daily.dialog.open('events')
    expect(daily.rowIds()).toEqual([''])
    const intraday = setup({ chart: { timeframe: '5m' } })
    intraday.dialog.open('events')
    expect(intraday.rowIds()).toEqual(['', 'sessionBreaks'])
  })

  it('drives the timezone through the timezone commands', () => {
    const s = setup()
    s.dialog.open()
    s.controls('timezone')[0]!.click()
    const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((o) => o.textContent?.endsWith('New York'))!
    option.click()
    expect(s.chart.state.timezone).toBe('America/New_York')
  })

  it('stands every chart row disabled when the host refuses the settings command', () => {
    const s = setup({ access: (id) => id !== 'chart.settings.apply' })
    s.dialog.open('canvas')
    const controls = [...s.panel().querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input')]
    expect(controls.length).toBeGreaterThan(10)
    expect(controls.every((c) => c.disabled)).toBe(true)
  })
})

describe('what a host contributes', () => {
  it('places a page after the chart page it names, and rows before the first of the rows it names', () => {
    const s = setup()
    const order: string[] = []
    cleanup.push(
      contribute(
        'chart-1',
        { place: { page: { id: 'alerts', label: 'Alerts', icon: (box) => (box.appendChild(document.createElement('i')), () => box.replaceChildren()), after: 'canvas' } }, build: (form) => form.check({ id: 'lines', label: 'Alert lines', checked: true, onChange: () => undefined }) },
        { place: { page: { id: 'trading', label: 'Trading', icon: () => () => undefined, after: 'canvas' } }, build: (form) => form.check({ id: 'buttons', label: 'Buy/sell buttons', checked: true, onChange: () => undefined }) },
        { place: { into: 'statusLine', before: ['indicators', 'background'] }, build: (form) => (order.push('built'), form.check({ id: 'buySell', label: 'Buy/sell buttons', hint: 'Displays buy and sell buttons directly on the chart', checked: true, onChange: () => undefined })) },
        { place: { into: 'events' }, build: (form) => form.check({ id: 'news', label: 'Latest news', checked: true, onChange: () => undefined }) },
      ),
    )
    s.dialog.open()
    expect(pageLabels(s)).toEqual(['Symbol', 'Status line', 'Scales and lines', 'Canvas', 'Alerts', 'Trading', 'Events'])
    expect(s.tab('alerts').querySelector('.qc-chart-settings-nav-icon i')).not.toBeNull()
    s.tab('statusLine').click()
    expect(s.rowIds().slice(-2)).toEqual(['buySell', 'background'])
    s.chart.handle.indicators.add({ id: 'rsi-1' } as never)
    expect(s.rowIds().slice(6, 9)).toEqual(['lastDayChange', 'buySell', 'indicators'])
    s.tab('events').click()
    expect(s.rowIds()).toEqual(['', 'sessionBreaks', 'news'])
    s.tab('trading').click()
    expect(s.rowIds()).toEqual(['buttons'])
    expect(order.length).toBeGreaterThan(0)
  })

  it('cancels each contribution with what its open answered, and commits each on Ok', () => {
    const one = { open: vi.fn(() => ({ was: 1 })), cancel: vi.fn(), commit: vi.fn(), applyDefaults: vi.fn() }
    const first = setup()
    cleanup.push(contribute('chart-1', { place: { into: 'events' }, build: () => undefined, ...one }))
    first.dialog.open()
    expect(one.open).toHaveBeenCalledTimes(1)
    first.box().querySelector<HTMLButtonElement>('.qc-chart-settings-cancel')!.click()
    expect(one.cancel).toHaveBeenCalledWith({ was: 1 })
    expect(one.commit).not.toHaveBeenCalled()
    expect(first.dialog.isOpen()).toBe(false)

    first.dialog.open()
    first.box().querySelector<HTMLButtonElement>('.qc-chart-settings-ok')!.click()
    expect(one.commit).toHaveBeenCalledTimes(1)
    expect(one.cancel).toHaveBeenCalledTimes(1)
  })

  it('applies the chart\'s defaults and every contribution\'s from the Template menu', () => {
    const applyDefaults = vi.fn()
    const s = setup()
    cleanup.push(contribute('chart-1', { place: { into: 'events' }, build: () => undefined, applyDefaults }))
    s.chart.handle.applySettings({ canvas: { verticalGrid: false } })
    s.chart.handle.setScaleMode('log')
    s.dialog.open()
    s.box().querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
    const rows = [...document.querySelectorAll<HTMLButtonElement>('.qc-chart-settings-template-menu [role="menuitem"]')]
    expect(rows.map((r) => r.textContent)).toEqual(['Apply defaults'])
    rows[0]!.click()
    expect(s.chart.state.viewer).toEqual({})
    expect(s.chart.state.scale).toBe('normal')
    expect(applyDefaults).toHaveBeenCalledTimes(1)
  })

  it('withdraws a contribution its extension takes back, and every one at detach', () => {
    const s = setup()
    let withdraw: () => void = () => undefined
    const host = createExtensionHost({ chartId: 'chart-1' } as unknown as ChartExtensionHostDeps, [
      {
        id: 'x',
        attach(context) {
          withdraw = context.contributeSettings({ place: { page: { id: 'mine', label: 'Mine', icon: () => () => undefined } }, build: () => undefined })
          context.contributeSettings({ place: { page: { id: 'other', label: 'Other', icon: () => () => undefined } }, build: () => undefined })
          return { detach: () => undefined }
        },
      },
    ])
    expect(host.settingsContributions()).toHaveLength(2)
    withdraw()
    expect(host.settingsContributions()).toHaveLength(1)
    host.detach()
    s.dialog.open()
    expect(pageLabels(s)).not.toContain('Other')
  })
})

describe('the edit session', () => {
  it('Cancel puts back the viewer\'s settings, the scale mode and the timezone it opened with', () => {
    const s = setup({ chart: { timeframe: '5m' } })
    s.chart.handle.applySettings({ canvas: { marginTop: 12 } })
    s.dialog.open('events')
    s.check('sessionBreaks').click()
    s.chart.handle.setScaleMode('log')
    s.chart.handle.setTimezone('America/New_York')
    expect(s.chart.state.viewer).toEqual({ canvas: { marginTop: 12 }, events: { sessionBreaks: true } })
    s.box().querySelector<HTMLButtonElement>('.qc-chart-settings-cancel')!.click()
    expect(s.chart.state.viewer).toEqual({ canvas: { marginTop: 12 } })
    expect(s.chart.state.scale).toBe('normal')
    expect(s.chart.state.timezone).toBe('Etc/UTC')
  })

  it('Escape and the close cancel as Cancel does, and Ok keeps the changes', () => {
    const s = setup({ chart: { timeframe: '5m' } })
    s.dialog.open('events')
    s.check('sessionBreaks').click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(s.chart.state.viewer).toEqual({})
    s.dialog.open('events')
    s.check('sessionBreaks').click()
    s.box().querySelector<HTMLButtonElement>('.qc-dialog-close')!.click()
    expect(s.chart.state.viewer).toEqual({})
    s.dialog.open('events')
    s.check('sessionBreaks').click()
    s.box().querySelector<HTMLButtonElement>('.qc-chart-settings-ok')!.click()
    expect(s.chart.state.viewer).toEqual({ events: { sessionBreaks: true } })
  })

  it('an untouched session restores nothing', () => {
    const s = setup()
    s.chart.handle.applySettings({ canvas: { marginTop: 12 } })
    s.dialog.open()
    s.chart.calls.length = 0
    s.box().querySelector<HTMLButtonElement>('.qc-chart-settings-cancel')!.click()
    expect(s.chart.calls).toEqual([])
  })
})

describe('the chart templates', () => {
  it('stores the viewer\'s settings under a name, lists it under the two actions, and applies it', async () => {
    const s = setup({ templates: true })
    s.chart.handle.applySettings({ canvas: { marginTop: 30 } })
    await s.templates!.save('Wide', { canvas: { marginTop: 30 } })
    s.chart.handle.resetSettings()
    s.chart.handle.setScaleMode('log')
    s.dialog.open()
    await vi.waitFor(() => {
      s.box().querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
      const labels = [...document.querySelectorAll('.qc-chart-settings-template-menu [role="menuitem"]')].map((r) => r.textContent)
      if (labels.length < 3) {
        s.box().querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
        throw new Error('not listed yet')
      }
      expect(labels).toEqual(['Apply defaults', 'Save as…', 'Wide'])
    })
    expect(document.querySelector('.qc-chart-settings-template-menu [aria-label="Remove template Wide"]')).not.toBeNull()
    ;[...document.querySelectorAll<HTMLButtonElement>('.qc-chart-settings-template-menu [role="menuitem"]')].find((r) => r.textContent === 'Wide')!.click()
    await vi.waitFor(() => expect(s.chart.state.viewer).toEqual({ canvas: { marginTop: 30 } }))
    // The scale mode the viewer chose stands through a template.
    expect(s.chart.state.scale).toBe('log')
  })

  it('saves under a name asked in the name prompt, replacing a name already saved', async () => {
    const s = setup({ templates: true })
    s.chart.handle.applySettings({ canvas: { marginBottom: 20 } })
    s.dialog.open()
    s.box().querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
    ;[...document.querySelectorAll<HTMLButtonElement>('.qc-chart-settings-template-menu [role="menuitem"]')].find((r) => r.textContent === 'Save as…')!.click()
    const prompt = document.querySelector<HTMLElement>('[data-role="chart-template-name"]')!
    expect(prompt.getAttribute('aria-label')).toBe('Save chart template')
    const field = prompt.querySelector<HTMLInputElement>('input')!
    field.value = 'Mine'
    field.dispatchEvent(new Event('input'))
    ;[...prompt.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Save')!.click()
    await vi.waitFor(async () => expect((await s.templates!.list()).map((row) => row.name)).toEqual(['Mine']))
    const saved = (await s.templates!.list())[0]!
    expect(await s.templates!.load(saved.ref.id)).toEqual({ canvas: { marginBottom: 20 } })
    await s.templates!.save('Mine', { canvas: { marginBottom: 5 } })
    expect((await s.templates!.list()).map((row) => row.name)).toEqual(['Mine'])
  })
})

describe('the open command', () => {
  it('opens the dialog on the page it names, turns an open one to it, and falls back to the first', () => {
    const s = setup()
    const harness = fakeWidget()
    cleanup.push(() => harness.dispose())
    expect(harness.commands.list().find((spec) => spec.id === 'chart.settings.open')?.scope).toBe('widget')
    expect(harness.commands.execute('chart.settings.open', { page: 'events' }).kind).toBe('ok')
    const open = harness.overlays.querySelector<HTMLElement>('.qc-chart-settings-dialog')!
    expect(open.querySelector('[aria-selected="true"]')!.getAttribute('data-settings-page')).toBe('events')
    harness.commands.execute('chart.settings.open', { page: 'scales' })
    expect(harness.overlays.querySelectorAll('.qc-chart-settings-dialog')).toHaveLength(1)
    expect(open.querySelector('[aria-selected="true"]')!.getAttribute('data-settings-page')).toBe('scales')
    s.dialog.open('nothing')
    expect(s.tab('symbol').getAttribute('aria-selected')).toBe('true')
  })
})
