// @vitest-environment happy-dom
// The indicator picker and the indicator settings dialog: the 23 built-ins grouped and searchable,
// an add composed into an instance and run as a command, a refused definition disabled and named
// as such, and the settings dialog's three tabs applied as one update.
import { afterEach, describe, expect, it } from 'vitest'
import { filterDefinitions, freshInstanceId, openIndicatorPicker } from '../../src/ui/chrome/indicatorPicker'
import { hexOf, openIndicatorSettings } from '../../src/ui/chrome/indicatorSettings'
import { indicatorPermitted } from '../../src/widget/indicators'
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
  it('lists the 23 built-ins in four groups, searches, and adds through the command with a fresh id', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    expect(dialog.element.getAttribute('aria-label')).toBe('Indicators')
    const rows = (): HTMLButtonElement[] => [...dialog.element.querySelectorAll<HTMLButtonElement>('[role="option"]')]
    expect(rows().length).toBe(23)
    expect([...dialog.element.querySelectorAll('.qc-dialog-heading')].map((h) => h.textContent)).toEqual(['Moving averages', 'Bands and channels', 'Oscillators', 'Volume'])
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
    expect(dialog.open()).toBe(false)
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
    expect(dialog.element.querySelectorAll('input[type="color"]').length).toBeGreaterThan(0)
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

  it('reads a color for the native field only when it can show it', () => {
    expect(hexOf('#4c98fb')).toBe('#4c98fb')
    expect(hexOf('rgb(76, 152, 251)')).toBe('#4c98fb')
    expect(hexOf('rgba(76, 152, 251, 0.5)')).toBe('#4c98fb')
    expect(hexOf('currentColor')).toBeNull()
    expect(hexOf(undefined)).toBeNull()
  })
})
