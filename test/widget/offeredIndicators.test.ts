// @vitest-environment happy-dom
// The built-in indicators a host offers, on a widget mounted the way a host mounts it. A built-in
// the list leaves out is absent from the indicator browser and refused by every door that would add
// one. Instances of it already on the chart stay whole: they render, edit through the settings
// dialog and the inputs, hide and show from the legend, and remove from every door. A host's own
// definitions are never filtered, nothing stored is rewritten, and the list composes with the
// access policy.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions, IndicatorDefinition, IndicatorInstance } from '../../src/widget/options'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 1_700_000_000 + index * 60, o: 100 + index, h: 101 + index, l: 99 + index, c: 100 + index, v: 10 }))
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: ChartWidget[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  document.body.replaceChildren()
})

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

const builtIn = (id: string): IndicatorDefinition => BUILT_IN_INDICATORS.find((definition) => definition.id === id)!
const instance = (id: string, definitionId: string): IndicatorInstance => ({ id, definition: builtIn(definitionId) })
/** A host's own definition, under an id no built-in uses. */
const custom: IndicatorDefinition = { manifest: { id: 'host-band', pane: 'overlay', plots: {} }, compute: () => ({}) }

const ids = (widget: ChartWidget): string[] => widget.activeChart().indicators.get().map((i) => i.id)
const drawn = (element: Element | null | undefined): boolean => !!element && !element.closest('[hidden]')

/** Open the browser on a collection and read the built-in rows it lists. */
function browser(widget: ChartWidget, collection?: string): { listed: string[]; disabled: string[] } {
  widget.commands.execute('chart.indicators.open', collection ? { collection } : undefined)
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.qc-picker-dialog [data-indicator]')]
  return { listed: rows.map((row) => row.dataset.indicator!), disabled: rows.filter((row) => row.disabled).map((row) => row.dataset.indicator!) }
}
const closeBrowser = (): void => document.querySelector<HTMLButtonElement>('.qc-picker-dialog .qc-dialog-close')?.click()
const search = async (text: string): Promise<string[]> => {
  const input = document.querySelector<HTMLInputElement>('.qc-picker-dialog .qc-picker-search')!
  input.value = text
  input.dispatchEvent(new Event('input'))
  await settle()
  return [...document.querySelectorAll<HTMLElement>('.qc-picker-dialog [data-indicator]')].map((row) => row.dataset.indicator!)
}

describe('builtInIndicators: setup', () => {
  it('is a setup error for a non-list, an empty list, an unknown id and a repeated id', () => {
    expect(() => mount({ builtInIndicators: 'sma' as never })).toThrow(TypeError)
    expect(() => mount({ builtInIndicators: [] })).toThrow(TypeError)
    expect(() => mount({ builtInIndicators: ['sma', 'no_such_study'] })).toThrow(/no_such_study/)
    expect(() => mount({ builtInIndicators: [7 as never] })).toThrow(TypeError)
    expect(() => mount({ builtInIndicators: ['sma', 'sma'] })).toThrow(/more than once/)
  })

  it('is a setup error for a mount instance whose built-in the list leaves out, and not for a host definition', () => {
    expect(() => mount({ builtInIndicators: ['ema'], indicators: [instance('a', 'sma')] })).toThrow(/indicators\[0\].*"sma"/)
    expect(() => mount({ builtInIndicators: ['ema'], indicators: [instance('a', 'ema'), { id: 'b', definition: custom }] })).not.toThrow()
  })

  it('offers every built-in when omitted, as before', async () => {
    const { widget } = mount()
    await settle()
    expect(browser(widget).listed).toEqual(BUILT_IN_INDICATORS.map((definition) => definition.id))
    expect(widget.commands.execute('chart.indicators.add', instance('x', 'vwap')).kind).toBe('ok')
    expect(ids(widget)).toEqual(['x'])
  })
})

describe('a built-in left out is absent from the browser', () => {
  it('lists only the offered built-ins, in search results too', async () => {
    const { widget } = mount({ builtInIndicators: ['sma', 'ema'] })
    await settle()
    expect(browser(widget).listed).toEqual(['sma', 'ema'])
    expect(await search('average')).not.toContain('vwap')
    expect(await search('vwap')).toEqual([])
  })

  it('leaves a starred built-in out of the favorites and keeps its star in storage', async () => {
    const key = 'quickcharts.indicatorFavorites.v1'
    const stored = JSON.stringify(['vwap', 'sma'])
    const storage = new Map<string, string>([[key, stored]])
    const port = { get: (k: string) => storage.get(k) ?? null, set: (k: string, v: string) => void storage.set(k, v), remove: (k: string) => void storage.delete(k), keys: () => [...storage.keys()] }
    const { widget } = mount({ builtInIndicators: ['sma'], storage: port })
    await settle()
    expect(browser(widget, 'favorites').listed).toEqual(['sma'])
    expect(storage.get(key)).toBe(stored)
  })

  it('hands the host listing only the offered built-in ids, and lists host items unfiltered', async () => {
    const requests: (readonly string[])[] = []
    const { widget } = mount({
      builtInIndicators: ['sma'],
      indicatorPicker: {
        collections: [{ id: 'mine', label: 'Mine', group: 'Personal' }],
        list: async (request) => {
          requests.push(request.builtInIds)
          return { kind: 'ok', items: [{ id: 'host-1', title: 'Host study', actions: [{ id: 'open', label: 'Open' }], primaryAction: 'open' }] }
        },
        act: async () => ({ kind: 'ok' }),
      },
    })
    await settle()
    widget.commands.execute('chart.indicators.open', { collection: 'mine' })
    await settle()
    expect(requests.at(-1)).toEqual(['sma'])
    expect(document.querySelector('.qc-picker-dialog [data-picker-item="host-1"]')).not.toBeNull()
  })
})

describe('a built-in left out is refused by every door that would add one', () => {
  it('denies the add command and the handle adds nothing', async () => {
    const { widget } = mount({ builtInIndicators: ['sma'] })
    await settle()
    expect(widget.commands.execute('chart.indicators.add', instance('x', 'vwap')).kind).toBe('denied')
    const api = widget.activeChart().indicators
    api.add(instance('y', 'vwap'))
    api.set([...api.get(), instance('z', 'vwap')])
    expect(ids(widget)).toEqual([])
    expect(widget.commands.execute('chart.indicators.add', instance('s', 'sma')).kind).toBe('ok')
    expect(ids(widget)).toEqual(['s'])
  })

  it("never filters a host's own definition", async () => {
    const { widget } = mount({ builtInIndicators: ['sma'] })
    await settle()
    expect(widget.commands.execute('chart.indicators.add', { id: 'h', definition: custom }).kind).toBe('ok')
    expect(ids(widget)).toEqual(['h'])
  })
})

describe('an instance of a built-in left out stays whole', () => {
  /** A chart whose saved content carries a VWAP the list leaves out, restored as a saved chart is. */
  async function withSavedVwap(options: Partial<ChartWidgetOptions> = {}) {
    const donor = mount({ indicators: [instance('kept', 'vwap')] })
    await settle()
    const saved = donor.widget.activeChart().saveLoad.serialize()
    donor.widget.dispose()
    document.body.replaceChildren()
    const { widget, container } = mount({ builtInIndicators: ['sma'], ...options })
    await settle()
    widget.activeChart().saveLoad.restore(saved.content)
    await settle()
    return { widget, container }
  }

  it('comes back from saved content and renders', async () => {
    const { widget, container } = await withSavedVwap()
    expect(ids(widget)).toEqual(['kept'])
    expect(container.querySelector('.qc-legend button[aria-label="Remove indicator"]')).not.toBeNull()
  })

  it('edits through the update command, the settings dialog and the legend eye', async () => {
    const { widget, container } = await withSavedVwap()
    const current = widget.activeChart().indicators.get()[0]!
    expect(widget.commands.execute('chart.indicators.update', { ...current, inputs: { ...current.inputs, period: 7 } }).kind).toBe('ok')
    expect(widget.activeChart().indicators.get()[0]?.inputs?.period).toBe(7)
    // The settings dialog opens from the legend and applies through the same update.
    const gear = container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Indicator settings"]')!
    expect(drawn(gear)).toBe(true)
    gear.click()
    const dialog = document.querySelector<HTMLElement>('.qc-settings-dialog')!
    expect(dialog).not.toBeNull()
    ;[...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Apply')!.click()
    await settle()
    expect(ids(widget)).toEqual(['kept'])
    expect(widget.activeChart().indicators.get()[0]?.inputs?.period).toBe(7)
    container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Hide indicator"]')!.click()
    expect(widget.activeChart().indicators.hidden()).toEqual(['kept'])
    container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Show indicator"]')!.click()
    expect(widget.activeChart().indicators.hidden()).toEqual([])
  })

  it('keeps an edit that would swap it onto another left-out built-in as it stands', async () => {
    const { widget } = await withSavedVwap()
    const current = widget.activeChart().indicators.get()[0]!
    widget.activeChart().indicators.set([{ ...current, definition: builtIn('obv') }])
    expect(widget.activeChart().indicators.get()[0]?.definition.manifest.id).toBe('vwap')
  })

  it('removes from the legend', async () => {
    const { widget, container } = await withSavedVwap()
    container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Remove indicator"]')!.click()
    expect(ids(widget)).toEqual([])
  })

  it('removes with remove all', async () => {
    const { widget } = await withSavedVwap()
    expect(widget.commands.execute('chart.indicators.removeAll').kind).toBe('ok')
    expect(ids(widget)).toEqual([])
  })

  it('removes through the api', async () => {
    const { widget } = await withSavedVwap()
    widget.activeChart().indicators.remove('kept')
    expect(ids(widget)).toEqual([])
  })

  it('is not copied onto a new pane, which copies the studies the first chart offers', async () => {
    const { widget } = await withSavedVwap()
    widget.activeChart().indicators.add(instance('s', 'sma'))
    widget.layout.setArrangement('2h')
    await settle()
    const [first, second] = widget.charts()
    expect(first!.indicators.get().map((i) => i.id)).toEqual(['kept', 's'])
    expect(second!.indicators.get().map((i) => i.id)).toEqual(['s'])
  })

  it('comes back on an undo of its removal', async () => {
    const { widget } = await withSavedVwap()
    widget.activeChart().indicators.remove('kept')
    await settle()
    expect(ids(widget)).toEqual([])
    expect(widget.commands.execute('chart.history.undo').kind).toBe('ok')
    await settle()
    expect(ids(widget)).toEqual(['kept'])
  })
})

describe('the list and the access policy', () => {
  it('offers a built-in only when listed and permitted, and draws a listed refusal as refused says', async () => {
    const indicator = (id: string): boolean => id !== 'ema'
    for (const refused of ['disable', 'hide'] as const) {
      const { widget } = mount({ builtInIndicators: ['sma', 'ema'], access: { refused, indicator } })
      await settle()
      const read = browser(widget)
      expect(read.listed, refused).toEqual(refused === 'hide' ? ['sma'] : ['sma', 'ema'])
      expect(read.disabled, refused).toEqual(refused === 'hide' ? [] : ['ema'])
      expect(read.listed).not.toContain('vwap')
      closeBrowser()
      expect(widget.commands.execute('chart.indicators.add', instance('v', 'vwap')).kind).toBe('denied')
      widget.commands.execute('chart.indicators.add', instance('e', 'ema'))
      expect(widget.commands.execute('chart.indicators.add', instance('s', 'sma')).kind).toBe('ok')
      expect(ids(widget)).toEqual(['s'])
      widget.dispose()
      document.body.replaceChildren()
    }
  })
})
