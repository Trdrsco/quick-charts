// @vitest-environment happy-dom
// The indicator picker and the indicator settings dialog: the 23 built-ins grouped and searchable,
// an add composed into an instance and run as a command, a refused definition disabled and named
// as such, and the settings dialog laid out from the manifest, previewed live and committed once.
import { afterEach, describe, expect, it } from 'vitest'
import { filterDefinitions, freshInstanceId, openIndicatorPicker } from '../../src/ui/chrome/indicatorPicker'
import { openIndicatorSettings } from '../../src/ui/indicators/settingsDialog'
import type { IndicatorDefinition, IndicatorInstance } from '../../src/widget/options'
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
  it('uses the pinned table and navigation, with no host-only sections in standalone mode', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    cleanup.push(() => dialog.close())
    expect(dialog.element.style.width).toBe('840px')
    // Nothing is starred, so the rail offers no Favorites.
    expect([...dialog.element.querySelectorAll('[data-picker-collection]')].map((row) => row.textContent?.trim())).toEqual(['Technicals'])
    expect([...dialog.element.querySelectorAll('.qc-picker-group')].map((heading) => heading.textContent)).toEqual(['Built-in'])
    expect([...dialog.element.querySelectorAll('[role="columnheader"]')].map((cell) => cell.textContent)).toEqual(['', 'Name', 'Author', 'Favorites', ''])
    expect(dialog.element.textContent).not.toMatch(/Community|Strategies|My library/)
    expect(dialog.element.querySelector('.qc-picker-list')!.contains(dialog.element.querySelector('[role="rowgroup"]'))).toBe(true)
    // The dialog opens on the field every search dialog shares, with no title band and no close:
    // Escape and a press outside the box close it.
    expect(dialog.element.firstElementChild?.classList.contains('qc-search-field')).toBe(true)
    expect(dialog.element.querySelector('.qc-search-field .qc-picker-search')).toBe(document.activeElement)
    expect(dialog.element.querySelector('.qc-dialog-close')).toBeNull()
    expect(dialog.element.querySelector('.qc-title')).toBeNull()
    // Built-in rows carry no add control of their own: the row and its name add.
    expect(dialog.element.querySelector('[data-picker-add]')).toBeNull()
    expect(dialog.element.querySelector('.qc-picker-author')?.textContent).toBe('')
    // No built-in has an author or a count, so neither column stands.
    const list = dialog.element.querySelector('.qc-picker-list')!
    expect(list.classList.contains('qc-picker-list--authors')).toBe(false)
    expect(list.classList.contains('qc-picker-list--counts')).toBe(false)
  })

  it('offers Favorites in the rail while anything is starred, and keeps it while it is open', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx, storage: w.storage })
    cleanup.push(() => dialog.close())
    const rail = () => [...dialog.element.querySelectorAll('[data-picker-collection]')].map((row) => row.getAttribute('data-picker-collection'))
    expect(rail()).toEqual(['builtin'])
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Favorite Simple Moving Average"]')!.click()
    expect(rail()).toEqual(['favorites', 'builtin'])
    expect([...dialog.element.querySelectorAll('.qc-picker-group')].map((heading) => heading.textContent)).toEqual(['Personal', 'Built-in'])
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-collection="favorites"]')!.click()
    dialog.element.querySelector<HTMLButtonElement>('button[aria-label="Unfavorite Simple Moving Average"]')!.click()
    // Unstarring the last one leaves the open collection where it is, empty, until the trader leaves.
    expect(rail()).toEqual(['favorites', 'builtin'])
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(0)
    dialog.element.querySelector<HTMLButtonElement>('[data-picker-collection="builtin"]')!.click()
    expect(rail()).toEqual(['builtin'])
  })

  it('opens on Technicals when asked for Favorites with nothing starred', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx, storage: w.storage, initialCollection: 'favorites' })
    cleanup.push(() => dialog.close())
    expect(dialog.element.querySelector('[data-picker-collection="builtin"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(dialog.element.querySelector('[data-picker-collection="favorites"]')).toBeNull()
  })

  it('clears the query from the field\'s own clear mark, which shows only while there is a query', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    cleanup.push(() => dialog.close())
    const search = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    const clear = dialog.element.querySelector<HTMLButtonElement>('.qc-search-field .qc-search-op')!
    expect(clear.hidden).toBe(true)
    search.value = 'macd'
    search.dispatchEvent(new Event('input'))
    expect(clear.hidden).toBe(false)
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(1)
    clear.click()
    expect(search.value).toBe('')
    expect(clear.hidden).toBe(true)
    expect(document.activeElement).toBe(search)
    expect(dialog.element.querySelectorAll('[data-indicator]')).toHaveLength(23)
  })

  it('keeps the modal and query open while adding repeated instances through the row and its name', () => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    const dialog = openIndicatorPicker({ ...w.ctx })
    cleanup.push(() => dialog.close())
    const search = dialog.element.querySelector<HTMLInputElement>('.qc-picker-search')!
    search.value = 'macd'
    search.dispatchEvent(new Event('input'))
    dialog.element.querySelector<HTMLElement>('[data-indicator="macd"]')!.click()
    expect(dialog.open()).toBe(true)
    dialog.element.querySelector<HTMLElement>('.qc-picker-row .qc-picker-author')!.click()
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
  const rsi = BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')!
  const macd = BUILT_IN_INDICATORS.find((d) => d.id === 'macd')!
  const volume = BUILT_IN_INDICATORS.find((d) => d.id === 'volume')!

  /** A widget holding one instance, its dialog open over a session that records what it was lent. */
  const open = (instance: IndicatorInstance) => {
    const w = fakeWidget()
    cleanup.push(() => w.dispose())
    w.chart.handle.indicators.add(instance)
    const previews: (IndicatorInstance | null)[] = []
    const saved: IndicatorInstance[] = []
    const session = { preview: (next: IndicatorInstance | null) => previews.push(next), saveDefault: (next: IndicatorInstance) => saved.push(next) }
    const dialog = openIndicatorSettings({ ...w.ctx, chart: w.chart.handle, instance: w.chart.state.indicators[0]!, session })
    const box = dialog.element
    const tab = (name: string) => [...box.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === name)!.click()
    const rowOf = (label: string) => [...box.querySelectorAll<HTMLElement>('.qc-drawing-row, .qc-drawing-toggle')].find((r) => r.querySelector('.qc-drawing-row-label, span')?.textContent === label)
    const footer = (label: string) => box.querySelector<HTMLButtonElement>(`.qc-drawing-dialog-footer button[aria-label="${label}"]`)!
    const sets = () => w.chart.calls.filter((c) => c.startsWith('indicators:set'))
    return { w, dialog, box, previews, saved, tab, rowOf, footer, sets }
  }

  /** Type a value into a number field and let it go, as a viewer does. */
  const type = (field: HTMLInputElement, value: string): void => {
    field.value = value
    field.dispatchEvent(new Event('change'))
  }

  it('names the instance, opens on Inputs, previews every edit and commits once on Ok', () => {
    const { box, previews, tab, footer, sets, w } = open({ id: 'bollinger-1', definition: bollinger, inputs: { period: 20 } })
    expect(box.getAttribute('aria-label')).toBe('Bollinger Bands settings')
    expect(box.querySelector('.qc-drawing-dialog-title')!.textContent).toBe('BB')
    expect([...box.querySelectorAll('[role="tab"]')].map((t) => t.textContent)).toEqual(['Inputs', 'Style', 'Visibility'])
    expect([...box.querySelectorAll('.qc-drawing-page .qc-drawing-row-label')].map((l) => l.textContent)).toEqual(['Length', 'StdDev'])
    type(box.querySelector<HTMLInputElement>('input[aria-label="Length"]')!, '50')
    expect(previews.at(-1)?.inputs?.period).toBe(50)
    // An edit previews; the chart's content keeps the instance until Ok.
    expect(sets()).toEqual([])
    tab('Style')
    expect(box.querySelector('input[type="color"]')).toBeNull()
    expect(box.querySelectorAll('.qc-drawing-swatch-button').length).toBe(4)
    box.querySelector<HTMLInputElement>('input[aria-label="Upper"]')!.click()
    expect(previews.at(-1)?.overrides?.plots?.upper?.visible).toBe(false)
    footer('Ok').click()
    expect(previews.at(-1)).toBeNull()
    expect(sets()).toHaveLength(1)
    expect(w.chart.state.indicators[0]!.inputs?.period).toBe(50)
    expect(w.chart.state.indicators[0]!.overrides?.plots?.upper).toEqual({ visible: false })
  })

  it('Cancel ends the preview and leaves the instance as it was', () => {
    const { box, previews, footer, sets } = open({ id: 'bollinger-1', definition: bollinger })
    type(box.querySelector<HTMLInputElement>('input[aria-label="Length"]')!, '9')
    footer('Cancel').click()
    expect(previews.at(-1)).toBeNull()
    expect(sets()).toEqual([])
  })

  it('sets grouped inputs under their headings and stands an input that does not apply disabled', () => {
    const { box, rowOf } = open({ id: 'rsi-1', definition: rsi })
    expect([...box.querySelectorAll('.qc-drawing-page > .qc-drawing-section')].map((h) => h.textContent)).toEqual(['RSI Settings', 'Smoothing'])
    const length = () => rowOf('Length')!.querySelector<HTMLInputElement>('input')!
    expect(length().disabled).toBe(true)
    rowOf('Type')!.querySelector<HTMLButtonElement>('button')!.click()
    ;[...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((o) => o.textContent === 'SMA')!.click()
    expect(length().disabled).toBe(false)
  })

  it('draws a switch input as a checkbox row, and the input it governs follows it', () => {
    const { box, previews, rowOf } = open({ id: 'volume-1', definition: volume })
    const show = box.querySelector<HTMLInputElement>('input[aria-label="Show MA"]')!
    expect(show.type).toBe('checkbox')
    expect(rowOf('MA Length')!.querySelector<HTMLInputElement>('input')!.disabled).toBe(true)
    show.click()
    expect(previews.at(-1)?.inputs?.showMa).toBe(1)
    expect(rowOf('MA Length')!.querySelector<HTMLInputElement>('input')!.disabled).toBe(false)
  })

  it('gives a level its value, a two-color plot its own rows, and closes the page on the output values', () => {
    const levels = open({ id: 'rsi-1', definition: rsi })
    levels.tab('Style')
    const upper = levels.rowOf('RSI Upper Band')!
    expect(upper.querySelectorAll('.qc-drawing-swatch-button')).toHaveLength(1)
    type(upper.querySelector<HTMLInputElement>('input[type="number"]')!, '75')
    expect(levels.previews.at(-1)?.overrides?.levels?.upper?.price).toBe(75)
    expect([...levels.box.querySelectorAll('.qc-drawing-page > .qc-drawing-section')].map((h) => h.textContent)).toEqual(['Output values', 'Input values'])
    expect(levels.box.querySelector('input[aria-label="Values in status line"]')).not.toBeNull()
    expect(levels.box.querySelector('input[aria-label="Inputs in status line"]')).not.toBeNull()

    const histogram = open({ id: 'macd-1', definition: macd })
    histogram.tab('Style')
    expect(histogram.box.querySelectorAll('.qc-indicator-color-row')).toHaveLength(2)
    expect([...histogram.box.querySelectorAll('.qc-indicator-color-row .qc-drawing-row-label')].map((l) => l.textContent)).toEqual(['Growing', 'Falling'])
  })

  it('edits a plot color through the shared palette', () => {
    const { box, previews, tab, footer, w } = open({ id: 'bollinger-1', definition: bollinger })
    tab('Style')
    box.querySelector<HTMLButtonElement>('.qc-drawing-swatch-button')!.click()
    const palette = document.querySelector<HTMLElement>('.qc-drawing-palette')!
    expect(palette.querySelectorAll('.qc-drawing-swatch:not(.qc-drawing-swatch-plus)')).toHaveLength(80)
    palette.querySelector<HTMLButtonElement>('[aria-label="Color #f23645"]')!.click()
    expect(previews.at(-1)?.overrides?.plots?.upper?.color).toBe('#f23645')
    footer('Ok').click()
    expect(w.chart.state.indicators[0]!.overrides?.plots?.upper?.color).toBe('#f23645')
  })

  it('keeps an instance off the timeframes its Visibility page turns off', () => {
    const { box, previews, tab } = open({ id: 'bollinger-1', definition: bollinger })
    tab('Visibility')
    expect(box.querySelectorAll('.qc-drawing-visibility-row')).toHaveLength(6)
    box.querySelector<HTMLInputElement>('input[aria-label="Hours visible"]')!.click()
    expect(previews.at(-1)?.overrides?.visibility?.hours.on).toBe(false)
  })

  it('resets to the definition\'s own settings and saves the draft as the default', () => {
    const { box, previews, saved } = open({ id: 'bollinger-1', definition: bollinger, inputs: { period: 40 }, overrides: { precision: 2 } })
    const menu = () => {
      box.querySelector<HTMLButtonElement>('.qc-drawing-template-button')!.click()
      return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    }
    expect(menu().map((item) => item.textContent)).toEqual(['Reset settings', 'Save as default'])
    menu()
    menu()[1]!.click()
    expect(saved.at(-1)?.inputs?.period).toBe(40)
    menu()[0]!.click()
    expect(previews.at(-1)?.inputs).toBeUndefined()
    expect(previews.at(-1)?.overrides).toBeUndefined()
  })

  it('lays out a host definition by the same rules, its keys read as words where it gives no title', () => {
    const definition: IndicatorDefinition = {
      manifest: {
        id: 'host-trend',
        pane: 'pane',
        inputs: {
          fastLength: { kind: 'int', default: 9, min: 1 },
          mode: { kind: 'enum', default: 0, options: ['Fast', 'Slow'] },
          useLog: { kind: 'bool', default: 0, group: 'Calculation' },
        },
        plots: { trend: { kind: 'line' } },
      },
      compute: (bars) => ({ trend: bars.map((b) => b.c) }),
    }
    const { box, tab } = open({ id: 'host-1', definition })
    expect([...box.querySelectorAll('.qc-drawing-page .qc-drawing-row-label')].map((l) => l.textContent)).toEqual(['Fast Length', 'Mode'])
    expect(box.querySelector('.qc-drawing-page > .qc-drawing-section')!.textContent).toBe('Calculation')
    expect(box.querySelector<HTMLInputElement>('input[aria-label="Use Log"]')!.type).toBe('checkbox')
    tab('Style')
    expect(box.querySelector<HTMLInputElement>('input[aria-label="Trend"]')).not.toBeNull()
  })
})
