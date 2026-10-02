// @vitest-environment happy-dom
// What a host's access policy refuses is never created, and what is already on the chart is never
// dropped because of it. On a widget mounted the way a host mounts it, under both `access.refused`
// values: an indicator whose definition the policy refuses, once on the chart, edits through
// `indicators.set`, `chart.indicators.update` and the settings dialog, survives an edit of any other
// study, and removes from every door, while a new instance of it is still refused. A drawing whose
// tool the policy refuses selects, restyles, locks, hides and deletes as any drawing does, and is
// not copied into a new one. A restore (a saved chart, a layout load, an undo or a redo, a drawings
// document) puts back what the policy refuses, and a save after it still carries it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { drawingTools } from '../../src/drawings/index'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { AccessPolicy, ChartWidgetOptions, IndicatorDefinition, IndicatorInstance } from '../../src/widget/options'

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

const REFUSED = ['disable', 'hide'] as const

/** A policy whose refusals the test changes while the widget is up, as a host's follows its session. */
function livePolicy(refused: 'disable' | 'hide') {
  const denied = { tools: new Set<string>(), indicators: new Set<string>() }
  const access: AccessPolicy = { refused, drawingTool: (id) => !denied.tools.has(id), indicator: (id) => !denied.indicators.has(id) }
  return { access, denied }
}

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

const builtIn = (id: string): IndicatorDefinition => BUILT_IN_INDICATORS.find((definition) => definition.id === id)!
const instance = (id: string, definitionId: string): IndicatorInstance => ({ id, definition: builtIn(definitionId) })
const ids = (widget: ChartWidget): string[] => widget.activeChart().indicators.get().map((i) => i.id)
const held = (widget: ChartWidget, id: string): IndicatorInstance => widget.activeChart().indicators.get().find((i) => i.id === id)!

/** A chart holding a VWAP and an SMA, then a policy that starts refusing VWAP. */
async function withRefusedVwap(refused: 'disable' | 'hide') {
  const { access, denied } = livePolicy(refused)
  const { widget, container } = mount({ access, indicators: [instance('kept', 'vwap'), instance('other', 'sma')] })
  await settle()
  denied.indicators.add('vwap')
  widget.refreshAccess()
  return { widget, container, denied }
}

describe('an indicator the policy refuses, already on the chart', () => {
  it('edits through chart.indicators.update and indicators.set', async () => {
    for (const refused of REFUSED) {
      const { widget } = await withRefusedVwap(refused)
      const current = held(widget, 'kept')
      expect(widget.commands.execute('chart.indicators.update', { ...current, inputs: { ...current.inputs, period: 7 } }).kind, refused).toBe('ok')
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      expect(held(widget, 'kept').inputs?.period, refused).toBe(7)
      const api = widget.activeChart().indicators
      api.set(api.get().map((i) => (i.id === 'kept' ? { ...i, title: 'Session VWAP' } : i)))
      expect(held(widget, 'kept').title, refused).toBe('Session VWAP')
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('survives an edit of another study, by command and by set', async () => {
    for (const refused of REFUSED) {
      const { widget } = await withRefusedVwap(refused)
      const other = held(widget, 'other')
      expect(widget.commands.execute('chart.indicators.update', { ...other, inputs: { ...other.inputs, length: 50 } }).kind, refused).toBe('ok')
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      expect(held(widget, 'other').inputs?.length, refused).toBe(50)
      const api = widget.activeChart().indicators
      api.set([...api.get()])
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('applies from the settings dialog', async () => {
    const { widget, container } = await withRefusedVwap('disable')
    container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Indicator settings"]')!.click()
    const dialog = document.querySelector<HTMLElement>('.qc-settings-dialog')!
    expect(dialog).not.toBeNull()
    ;[...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Apply')!.click()
    await settle()
    expect(ids(widget)).toEqual(['kept', 'other'])
  })

  it('keeps an edit that would move it, or another study, onto a refused definition as it stands', async () => {
    const { widget, denied } = await withRefusedVwap('hide')
    denied.indicators.add('obv')
    const api = widget.activeChart().indicators
    api.set(api.get().map((i) => ({ ...i, definition: builtIn('obv') })))
    expect(api.get().map((i) => [i.id, i.definition.manifest.id])).toEqual([['kept', 'vwap'], ['other', 'sma']])
    // An edit onto a definition the policy permits is an edit like any other.
    api.set(api.get().map((i) => (i.id === 'kept' ? { ...i, definition: builtIn('ema') } : i)))
    expect(held(widget, 'kept').definition.manifest.id).toBe('ema')
  })

  it('still refuses a new instance of it, from every door', async () => {
    const { widget } = await withRefusedVwap('disable')
    const api = widget.activeChart().indicators
    widget.commands.execute('chart.indicators.add', instance('fresh-1', 'vwap'))
    api.add(instance('fresh-2', 'vwap'))
    api.set([...api.get(), instance('fresh-3', 'vwap')])
    expect(ids(widget)).toEqual(['kept', 'other'])
  })

  it('removes from the legend, the api and remove all', async () => {
    const { widget, container } = await withRefusedVwap('hide')
    container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Remove indicator"]')!.click()
    expect(ids(widget)).toEqual(['other'])
    const second = await withRefusedVwap('hide')
    second.widget.activeChart().indicators.remove('kept')
    expect(ids(second.widget)).toEqual(['other'])
    const third = await withRefusedVwap('hide')
    expect(third.widget.commands.execute('chart.indicators.removeAll').kind).toBe('ok')
    expect(ids(third.widget)).toEqual([])
  })
})

/** A drawing already on the chart, as a saved chart or another host leaves one, selected. */
async function placed(widget: ChartWidget, type: string, id: string): Promise<void> {
  const drawing = drawingTools.create(type, id, [{ time: bars[10]!.t as never, price: 110 }, { time: bars[30]!.t as never, price: 130 }])!
  const api = widget.activeChart().drawings!
  api.restore([...api.export(), drawing.toJSON()])
  api.select(id)
  await settle()
}
const settingsBar = (): HTMLElement => document.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!
const barButton = (label: string): HTMLButtonElement | undefined => [...settingsBar().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)
const drawn = (element: Element | null | undefined): boolean => !!element && !element.closest('[hidden]')

describe('a drawing whose tool the policy refuses, already on the chart', () => {
  it('selects, restyles, locks, opens its settings, hides and deletes from the settings bar', async () => {
    for (const refused of REFUSED) {
      const { access } = livePolicy(refused)
      const policy: AccessPolicy = { ...access, drawingTool: (tool) => tool !== 'trend_line' }
      const { widget } = mount({ access: policy })
      await settle()
      await placed(widget, 'trend_line', 'kept')
      const api = widget.activeChart().drawings!
      expect(widget.commands.execute('chart.drawings.arm', 'trend_line').kind, refused).toBe('denied')
      expect(api.selected()?.type, refused).toBe('trend_line')
      expect(settingsBar().hidden, refused).toBe(false)
      expect(drawn(barButton('Drawing settings')), refused).toBe(true)
      expect(widget.commands.execute('chart.drawings.style', { lineWidth: 4 }).kind, refused).toBe('ok')
      expect(api.selected()?.lineWidth, refused).toBe(4)
      expect(widget.commands.execute('chart.drawings.lock', true).kind, refused).toBe('ok')
      expect(api.selected()?.locked, refused).toBe(true)
      expect(widget.commands.execute('chart.drawings.lock', false).kind, refused).toBe('ok')
      expect(widget.commands.execute('chart.drawings.settings').kind, refused).toBe('ok')
      await settle()
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
      expect(dialog, refused).not.toBeNull()
      dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
      await settle()
      expect(widget.commands.execute('chart.drawings.hideSelected').kind, refused).toBe('ok')
      api.select('kept')
      await settle()
      const remove = barButton('Delete drawing')!
      expect(drawn(remove), refused).toBe(true)
      expect(remove.disabled, refused).toBe(false)
      remove.click()
      await settle()
      expect(api.count(), refused).toBe(0)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('deletes with the Delete key and remove all', async () => {
    const { widget, container } = mount({ access: { refused: 'hide', drawingTool: (tool) => tool !== 'trend_line' } })
    await settle()
    const api = widget.activeChart().drawings!
    await placed(widget, 'trend_line', 'one')
    container.querySelector<HTMLElement>('.qc-gestures')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await settle()
    expect(api.count()).toBe(0)
    await placed(widget, 'trend_line', 'two')
    expect(widget.commands.execute('chart.drawings.removeAll').kind).toBe('ok')
    expect(api.count()).toBe(0)
  })

  it('is not copied into a new drawing, and copies to the clipboard; a permitted one clones', async () => {
    const { access, denied } = livePolicy('disable')
    const { widget } = mount({ access })
    await settle()
    const api = widget.activeChart().drawings!
    await placed(widget, 'trend_line', 'out')
    denied.tools.add('trend_line')
    widget.refreshAccess()
    expect(widget.commands.available('chart.drawings.clone')).toBe(false)
    expect(widget.commands.execute('chart.drawings.clone').kind).toBe('unavailable')
    api.clone()
    expect(api.count()).toBe(1)
    expect(widget.commands.execute('chart.drawings.copy').kind).toBe('ok')
    expect(widget.commands.available('chart.drawings.paste')).toBe(false)
    expect(api.paste()).toBe(false)
    expect(api.count()).toBe(1)
    // The policy is asked live: once it permits the tool again, the copy is made.
    denied.tools.delete('trend_line')
    expect(widget.commands.execute('chart.drawings.paste').kind).toBe('ok')
    expect(api.count()).toBe(2)
    await placed(widget, 'rectangle', 'in')
    expect(widget.commands.execute('chart.drawings.clone').kind).toBe('ok')
    expect(api.count()).toBe(4)
  })
})

describe('content the policy refuses, put back by a restore', () => {
  /** Saved content written by a chart that permits everything: a VWAP and an SMA, a trend line and
   *  a rectangle. */
  async function savedContent(): Promise<{ chart: string; layout: string }> {
    const { widget } = mount({ indicators: [instance('kept', 'vwap'), instance('other', 'sma')] })
    await settle()
    await placed(widget, 'trend_line', 'line')
    await placed(widget, 'rectangle', 'box')
    const chart = widget.activeChart().saveLoad.serialize().content
    const layout = widget.layout.serialize().content
    widget.dispose()
    document.body.replaceChildren()
    return { chart, layout }
  }
  const refusing = (refused: 'disable' | 'hide'): AccessPolicy => ({ refused, indicator: (id) => id !== 'vwap', drawingTool: (tool) => tool !== 'trend_line' })
  const drawingIds = (chart: ReturnType<ChartWidget['activeChart']>): string[] => chart.drawings!.export().map((d) => d.id)
  const savedStudies = (content: string): string[] => (JSON.parse(content) as { indicators: { definition: string }[] }).indicators.map((i) => i.definition)

  it('comes back whole from a saved chart, and a save after it still carries it', async () => {
    const saved = await savedContent()
    for (const refused of REFUSED) {
      const { widget } = mount({ access: refusing(refused) })
      await settle()
      widget.activeChart().saveLoad.restore(saved.chart)
      await settle()
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      expect(drawingIds(widget.activeChart()), refused).toEqual(['line', 'box'])
      expect(savedStudies(widget.activeChart().saveLoad.serialize().content), refused).toEqual(['vwap', 'sma'])
      // Restored, it is content like any other: it edits and removes.
      const current = held(widget, 'kept')
      expect(widget.commands.execute('chart.indicators.update', { ...current, inputs: { ...current.inputs, period: 7 } }).kind, refused).toBe('ok')
      expect(held(widget, 'kept').inputs?.period, refused).toBe(7)
      widget.activeChart().indicators.remove('kept')
      expect(ids(widget), refused).toEqual(['other'])
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('comes back from a layout load', async () => {
    const saved = await savedContent()
    const { widget } = mount({ access: refusing('hide') })
    await settle()
    widget.layout.restore(saved.layout)
    await settle()
    expect(ids(widget)).toEqual(['kept', 'other'])
    expect(drawingIds(widget.activeChart())).toEqual(['line', 'box'])
    const layout = JSON.parse(widget.layout.serialize().content) as { charts: { content: string }[] }
    expect(savedStudies(layout.charts[0]!.content)).toEqual(['vwap', 'sma'])
  })

  it('stays through an undo of another change, and comes back on an undo of its own removal', async () => {
    for (const refused of REFUSED) {
      const { widget } = await withRefusedVwap(refused)
      const api = widget.activeChart().indicators
      api.remove('other')
      await settle()
      expect(widget.commands.execute('chart.history.undo').kind, refused).toBe('ok')
      await settle()
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      api.remove('kept')
      await settle()
      expect(ids(widget), refused).toEqual(['other'])
      expect(widget.commands.execute('chart.history.undo').kind, refused).toBe('ok')
      await settle()
      expect(ids(widget), refused).toEqual(['kept', 'other'])
      expect(widget.commands.execute('chart.history.redo').kind, refused).toBe('ok')
      await settle()
      expect(ids(widget), refused).toEqual(['other'])
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('puts back a drawing of a refused tool, or of a tool the host does not offer, through every restore', async () => {
    const saved = await savedContent()
    const offered = drawingTools.all().map((tool) => tool.type).filter((type) => type !== 'rectangle')
    const { widget } = mount({ access: refusing('disable'), drawingTools: offered })
    await settle()
    const chart = widget.activeChart()
    chart.saveLoad.restore(saved.chart)
    await settle()
    expect(drawingIds(chart)).toEqual(['line', 'box'])
    expect(widget.commands.execute('chart.drawings.removeAll').kind).toBe('ok')
    await settle()
    expect(drawingIds(chart)).toEqual([])
    expect(widget.commands.execute('chart.history.undo').kind).toBe('ok')
    await settle()
    expect(drawingIds(chart)).toEqual(['line', 'box'])
    const document_ = chart.drawings!.export()
    chart.drawings!.restore([])
    chart.drawings!.restore(document_)
    expect(drawingIds(chart)).toEqual(['line', 'box'])
  })
})
