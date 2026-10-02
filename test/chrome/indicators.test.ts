// @vitest-environment happy-dom
// The indicator picker and the indicator settings dialog: the 23 built-ins grouped and searchable,
// an add composed into an instance and run as a command, a refused definition disabled and named
// as such, and the settings dialog's three tabs applied as one update.
import { afterEach, describe, expect, it } from 'vitest'
import { filterDefinitions, freshInstanceId, openIndicatorPicker } from '../../src/ui/chrome/indicatorPicker'
import { openIndicatorSettings } from '../../src/ui/chrome/indicatorSettings'
import { readColor } from '../../src/ui/controls/color'
import { indicatorPermitted } from '../../src/widget/access'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { fakeWidget, press } from './harness'

let cleanup: (() => void)[] = []
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn()
  document.body.replaceChildren()
})

describe('the picker rules', () => {
  it('filters on name, tag and description in the chart language', () => {
    const t = fakeWidget().i18n.t
    expect(filterDefinitions(t, 'rsi').map((d) => d.id)).toEqual(['rsi', 'stochrsi', 'mfi']) // the money-flow description names RSI
    expect(filterDefinitions(t, 'Bollinger').map((d) => d.id)).toEqual(['bollinger'])
    expect(filterDefinitions(t, '').length).toBe(23)
  })

  it('mints an instance id no instance holds, and reads the access policy without trusting a throw', () => {
    const sma = BUILT_IN_INDICATORS[0]!
    expect(freshInstanceId('sma', [])).toBe('sma-1')
    expect(freshInstanceId('sma', [{ id: 'sma-1', definition: sma }, { id: 'sma-2', definition: sma }])).toBe('sma-3')
    expect(indicatorPermitted(undefined, sma)).toBe(true)
    expect(indicatorPermitted({ indicator: () => false }, sma)).toBe(false)
    expect(
      indicatorPermitted(
        {
          indicator: () => {
            throw new Error('policy down')
          },
        },
        sma,
      ),
    ).toBe(false)
    // The predicate is asked the definition id, and a definition that names none is not gated.
    const asked: string[] = []
    expect(indicatorPermitted({ indicator: (id) => (asked.push(id), true) }, sma)).toBe(true)
    expect(asked).toEqual(['sma'])
    expect(indicatorPermitted({ indicator: () => false }, { manifest: { pane: 'overlay', plots: {} }, compute: () => ({}) })).toBe(true)
  })
})

describe('the picker dialog', () => {
  it('uses the historical table and navigation, with no host-only sections in standalone mode', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    cleanup.push(() => dialog.close())
    expect(dialog.element.style.width).toBe('840px')
    expect([...dialog.element.querySelectorAll('[data-picker-collection]')].map((row) => row.textContent?.trim())).toEqual(['Favorites', 'Built-in'])
    expect([...dialog.element.querySelectorAll('[role="columnheader"]')].map((cell) => cell.textContent)).toEqual(['', 'Name', 'Author', 'Favorites', ''])
    expect(dialog.element.textContent).not.toMatch(/Community|Strategies|My library/)
    expect(dialog.element.querySelector('.qc-picker-list')!.contains(dialog.element.querySelector('[role="rowgroup"]'))).toBe(true)
    // The close is the dialogs' own cross; no dialog writes a key's name in its header.
    const close = dialog.element.querySelector<HTMLButtonElement>('.qc-dialog-close')!
    expect(close.getAttribute('aria-label')).toBe('Close')
    expect(close.querySelector('svg')).not.toBeNull()
    expect(dialog.element.textContent).not.toContain('Esc')
  })

  it('keeps the modal and query open while adding repeated instances through row and Plus', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    cleanup.push(() => dialog.close())
    const search = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    search.value = 'macd'
    search.dispatchEvent(new Event('input'))
    dialog.element.querySelector<HTMLElement>('[data-indicator="macd"]')!.click()
    expect(dialog.open()).toBe(true)
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-add="macd"]')!.click()
    expect(w.chart.state.indicators.map((instance) => instance.id)).toEqual(['macd-1', 'macd-2'])
    expect(search.value).toBe('macd')
  })

  it('lists all 23 built-ins, searches, and adds through the command with a fresh id', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    expect(dialog.element.getAttribute('aria-label')).toBe('Indicators')
    const rows = (): HTMLButtonElement[] => [...dialog.element.querySelectorAll<HTMLButtonElement>('[data-indicator]')]
    expect(rows().length).toBe(23)
    const search = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    expect(document.activeElement).toBe(search)
    search.value = 'macd'
    search.dispatchEvent(new Event('input'))
    expect(rows().map((r) => r.dataset.indicator)).toEqual(['macd'])
    expect(rows()[0]!.getAttribute('aria-label')).toBe('Add MACD')
    press(search, 'ArrowDown')
    expect(document.activeElement).toBe(rows()[0])
    rows()[0]!.click()
    expect(w.chart.calls).toContain('indicators:add:macd-1')
    expect(w.chart.state.indicators[0]!.definition).toBe(BUILT_IN_INDICATORS.find((d) => d.id === 'macd'))
    expect(dialog.open()).toBe(true)
    dialog.close()
  })

  it('a definition the policy refuses renders disabled and says so', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx, access: { indicator: (id) => id !== 'sma' } })
    const sma = dialog.element.querySelector<HTMLButtonElement>('[data-indicator="sma"]')!
    expect(sma.disabled).toBe(true)
    expect(sma.getAttribute('aria-label')).toBe('Simple Moving Average is not available here')
    sma.click()
    expect(w.chart.calls).toEqual([])
    dialog.close()
  })

  it('says when nothing matches', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    const search = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    search.value = 'zzz'
    search.dispatchEvent(new Event('input'))
    expect(dialog.element.querySelector('[role="status"]')!.textContent).toBe('No matching indicators.')
    dialog.close()
  })
})

describe('the settings dialog', () => {
  const bollinger = BUILT_IN_INDICATORS.find((d) => d.id === 'bollinger')!

  it('opens on Inputs with the manifest fields, and Apply runs one update with the inputs and overrides', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    w.chart.handle.indicators.add({ id: 'bollinger-1', definition: bollinger, inputs: { period: 20 } })
    const dialog = openIndicatorSettings({ ...w.ctx, chart: w.chart.handle, instance: w.chart.state.indicators[0]! })
    expect(dialog.element.getAttribute('aria-label')).toBe('Bollinger Bands settings')
    const tabs = [...dialog.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
    expect(tabs.map((t) => t.textContent)).toEqual(['Inputs', 'Style', 'Visibility'])
    const period = dialog.element.querySelector<HTMLInputElement>('input[type="number"]')!
    period.value = '50'
    tabs[1]!.click()
    // Every color here is the package's own control: no surface falls back to the OS dialog.
    expect(dialog.element.querySelector('input[type="color"]')).toBeNull()
    expect(dialog.element.querySelectorAll('.qc-drawing-swatch-button').length).toBeGreaterThan(0)
    const width = dialog.element.querySelector<HTMLSelectElement>('select[aria-label$="line width"]')!
    width.value = '3'
    width.dispatchEvent(new Event('change'))
    tabs[2]!.click()
    const switches = [...dialog.element.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches[0]!.getAttribute('aria-label')).toBe('Show this indicator')
    switches[1]!.click() // hide the first plot
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Apply"]')!.click()
    expect(w.chart.calls.some((c) => c.startsWith('indicators:set:'))).toBe(true)
    const updated = w.chart.state.indicators[0]!
    expect(updated.inputs?.period).toBe(50)
    const firstPlot = Object.keys(bollinger.manifest.plots)[0]!
    expect(updated.overrides?.plots?.[firstPlot]).toMatchObject({ lineWidth: 3, visible: false })
    expect(dialog.open()).toBe(false)
  })

  it('Cancel leaves the instance as it was, and the visibility switch hides through its command', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    w.chart.handle.indicators.add({ id: 'bollinger-1', definition: bollinger })
    const dialog = openIndicatorSettings({ ...w.ctx, chart: w.chart.handle, instance: w.chart.state.indicators[0]! })
    dialog.element.querySelector<HTMLInputElement>('input[type="number"]')!.value = '9'
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    expect(w.chart.calls.filter((c) => c.startsWith('indicators:set'))).toEqual([])
    const again = openIndicatorSettings({ ...w.ctx, chart: w.chart.handle, instance: w.chart.state.indicators[0]! })
    ;[...again.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')][2]!.click()
    again.element.querySelector<HTMLButtonElement>('[role="switch"]')!.click()
    again.element.querySelector<HTMLButtonElement>('button[aria-label="Apply"]')!.click()
    expect(w.chart.calls).toContain('indicators:hide:bollinger-1')
  })

  it('reads a color and its alpha, and leaves a value it cannot read intact', () => {
    expect(readColor('#4c98fb')).toEqual({ hex: '#4c98fb', alpha: 1 })
    expect(readColor('rgb(76, 152, 251)')).toEqual({ hex: '#4c98fb', alpha: 1 })
    expect(readColor('rgba(76, 152, 251, 0.5)')).toEqual({ hex: '#4c98fb', alpha: 0.5 })
    expect(readColor('currentColor')).toBeNull()
    expect(readColor(undefined)).toBeNull()
  })

  it('edits a plot color through the shared palette, and holds the pick for Apply', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    w.chart.handle.indicators.add({ id: 'bollinger-1', definition: bollinger })
    const dialog = openIndicatorSettings({ ...w.ctx, chart: w.chart.handle, instance: w.chart.state.indicators[0]! })
    ;[...dialog.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')][1]!.click()
    const control = dialog.element.querySelector<HTMLButtonElement>('.qc-drawing-swatch-button')!
    control.click()
    const palette = dialog.element.querySelector<HTMLElement>('.qc-inline-panel .qc-drawing-palette')!
    expect(palette.querySelectorAll('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')).toHaveLength(80)
    palette.querySelector<HTMLButtonElement>('[aria-label="Color #f23645"]')!.click()
    // The pick is a draft: the dialog reaches the chart only on Apply.
    expect(w.chart.calls.filter((c) => c.startsWith('indicators:set'))).toEqual([])
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Apply"]')!.click()
    const firstPlot = Object.keys(bollinger.manifest.plots)[0]!
    expect(w.chart.state.indicators[0]!.overrides?.plots?.[firstPlot]?.color).toBe('#f23645')
  })
})
