// @vitest-environment happy-dom
// The arrangements and sync switches a host offers, on a widget mounted the way a host mounts it. A
// host that names no list gets every arrangement and every switch; a list it names is the whole set
// its layout can take, so an arrangement left out has no tile and no setter reaches it, and a saved
// layout that names one opens on an offered arrangement while carrying the charts it cannot show. A
// switch left out holds the host's value whatever the viewer or a saved layout says. A list or an
// opening arrangement the host got wrong is a setup error from createChart.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memorySaveLoadAdapter } from '../../src/resources'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'
import { fallbackArrangement } from '../../src/widget/arrangements'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (time: number, close = 100): FeedBar => ({ t: time, o: close, h: close + 1, l: close - 1, c: close, v: 10 })
const datafeed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars: Array.from({ length: 40 }, (_, index) => bar(1_700_000_000 + index * 60, 100 + index)), noData: false }),
  subscribeBars: () => () => undefined,
}
const QUIET = {
  features: { drawings: false, replay: false, sessions: false, compare: false },
} as const

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
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', ...QUIET, ...options })
  mounted.push(widget)
  return { widget, container }
}

const setupButton = (container: HTMLElement): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('button[aria-label^="Layout setup"]')

/** Open the layout setup menu and read its tiles and its switches. */
const setupMenu = (container: HTMLElement): { tiles: string[]; rows: string[]; switches: string[] } => {
  setupButton(container)!.click()
  const menu = document.querySelector<HTMLElement>('.qc-layout-menu')!
  const read = {
    tiles: [...menu.querySelectorAll<HTMLElement>('[data-arrangement]')].map((tile) => tile.dataset.arrangement!),
    rows: [...menu.querySelectorAll('.qc-layout-count')].map((count) => count.textContent ?? ''),
    switches: [...menu.querySelectorAll('[role="switch"]')].map((control) => control.getAttribute('aria-label') ?? ''),
  }
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return read
}

/** A four-chart layout saved by a widget that offers every arrangement: ES, NQ, CL and GC, with the
 *  last one active and the crosshair synced. */
async function savedFour(): Promise<string> {
  const { widget } = mount({ layout: { arrangement: '4', sync: { crosshair: true } } })
  await settle()
  ;['ES', 'NQ', 'CL', 'GC'].forEach((symbol, i) => widget.charts()[i]!.setSymbol(symbol))
  widget.layout.setActive(3)
  return widget.layout.serialize().content
}

const symbols = (widget: ChartWidget): string[] => widget.charts().map((chart) => chart.symbol())

describe('the arrangements a widget offers', () => {
  it('are all 55 when the host names none, with every switch', () => {
    const { widget, container } = mount()
    const menu = setupMenu(container)
    expect(menu.tiles).toHaveLength(55)
    expect(menu.switches).toHaveLength(5)
    expect(widget.commands.available('widget.layout.setArrangement')).toBe(true)
    expect(widget.layout.arrangement()).toBe('s')
  })

  it('are the list the host names: the menu shows those tiles in its own rows, and nothing reaches another', () => {
    const { widget, container } = mount({ layouts: ['4', 's', '2h'] })
    expect(widget.layout.arrangement()).toBe('4')
    const menu = setupMenu(container)
    expect(menu.tiles).toEqual(['s', '2h', '4'])
    expect(menu.rows).toEqual(['1', '2', '4'])
    widget.layout.setArrangement('3h')
    expect(widget.layout.arrangement()).toBe('4')
    expect(widget.commands.execute('widget.layout.setArrangement', '2v').kind).toBe('ok')
    expect(widget.layout.arrangement()).toBe('4')
    widget.commands.execute('widget.layout.setArrangement', '2h')
    expect(widget.layout.arrangement()).toBe('2h')
    expect(() => widget.layout.setArrangement('nope')).toThrow('unknown arrangement code nope')
  })

  it('opens on layout.arrangement when it is listed', () => {
    const { widget } = mount({ layouts: ['s', '2h'], layout: { arrangement: '2h' } })
    expect(widget.layout.arrangement()).toBe('2h')
    expect(widget.charts()).toHaveLength(2)
  })

  it("['s'] is a single chart: no layout setup menu, no re-tile, and no chart to switch to", () => {
    const { widget, container } = mount({ layouts: ['s'] })
    expect(setupButton(container)).toBeNull()
    for (const id of ['widget.layout.setArrangement', 'widget.layout.setActive', 'widget.layout.activateNext', 'widget.layout.activatePrevious', 'widget.layout.toggleMaximize']) {
      expect(widget.commands.available(id), id).toBe(false)
    }
    widget.layout.setArrangement('2h')
    expect(widget.charts()).toHaveLength(1)
  })

  it('leave one arrangement of several charts a menu of the switches alone, and no menu with no switch', () => {
    const switches = mount({ layouts: ['2h'] })
    const menu = setupMenu(switches.container)
    expect(menu.tiles).toEqual([])
    expect(menu.switches).toHaveLength(5)
    expect(setupButton(mount({ layouts: ['2h'], layoutSync: [] }).container)).toBeNull()
  })

  it('stand apart from the menu flags: layoutSetup and savedLayouts hide one menu, layouts hides both', () => {
    const saveLoad = memorySaveLoadAdapter()
    const manage = (container: HTMLElement): boolean => container.querySelector('button[aria-label="Manage layouts"]') !== null
    const both = mount({ saveLoad })
    expect([setupButton(both.container) !== null, manage(both.container)]).toEqual([true, true])
    const noSetup = mount({ saveLoad, ui: { topBar: { layoutSetup: false } } })
    expect([setupButton(noSetup.container) !== null, manage(noSetup.container)]).toEqual([false, true])
    expect(noSetup.widget.commands.execute('widget.layout.setArrangement', '2h').kind).toBe('ok')
    expect(noSetup.widget.layout.arrangement()).toBe('2h')
    const noSaved = mount({ saveLoad, ui: { topBar: { savedLayouts: false } } })
    expect([setupButton(noSaved.container) !== null, manage(noSaved.container)]).toEqual([true, false])
    const none = mount({ saveLoad, ui: { topBar: { layouts: false, layoutSetup: true, savedLayouts: true } } })
    expect([setupButton(none.container) !== null, manage(none.container)]).toEqual([false, false])
  })
})

describe('the saved-layouts menu without a layouts store', () => {
  const imageRows = (container: HTMLElement): string[] => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Chart image"]')!.click()
    const rows = [...document.querySelectorAll('.qc-image-menu [role="menuitem"]')].map((row) => row.textContent ?? '')
    document.querySelector('.qc-image-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return rows
  }

  it('is not drawn, and Download chart data joins the image menu', async () => {
    const { widget, container } = mount()
    await settle()
    expect(container.querySelector('button[aria-label="Manage layouts"]')).toBeNull()
    expect(container.querySelector('.qc-layouts')).toBeNull()
    expect(imageRows(container)).toEqual(['Download image', 'Copy image', 'Download chart data'])
    expect(widget.commands.available('chart.data.download')).toBe(true)
  })

  it('is drawn over a store, which keeps Download chart data in it and out of the image menu', async () => {
    const { container } = mount({ saveLoad: memorySaveLoadAdapter() })
    await settle()
    expect(container.querySelector('button[aria-label="Manage layouts"]')).not.toBeNull()
    expect(imageRows(container)).toEqual(['Download image', 'Copy image'])
  })
})

describe('a saved layout whose arrangement is not offered', () => {
  it('opens on the offered arrangement with the most charts not above its count, first listed winning a tie', () => {
    expect(fallbackArrangement(4, ['s', '2h', '3h'])).toBe('3h')
    expect(fallbackArrangement(4, ['2v', '2h', 's'])).toBe('2v')
    expect(fallbackArrangement(4, ['2h', '2v', '6'])).toBe('2h')
    expect(fallbackArrangement(1, ['6', '2v', '2h'])).toBe('2v')
    expect(fallbackArrangement(3, ['4', '4h', '6'])).toBe('4')
  })

  it('shows the first charts, leaves the first active when the saved one is hidden, and keeps the sync as saved', async () => {
    const saved = await savedFour()
    const { widget } = mount({ layouts: ['s', '2h', '3h'] })
    widget.layout.restore(saved)
    expect(widget.layout.arrangement()).toBe('3h')
    expect(symbols(widget)).toEqual(['ES', 'NQ', 'CL'])
    expect(widget.layout.active()).toBe(0)
    expect(widget.layout.sync().crosshair).toBe(true)
  })

  it('carries the hidden charts through a save unchanged, so a widget that offers the arrangement again opens them all', async () => {
    const saved = await savedFour()
    const original = JSON.parse(saved) as { arrangement: string; geometry: unknown; charts: unknown[] }
    const restricted = mount({ layouts: ['s', '2h'] })
    restricted.widget.layout.restore(saved)
    expect(symbols(restricted.widget)).toEqual(['ES', 'NQ'])
    restricted.widget.charts()[0]!.setSymbol('YM')
    const resaved = JSON.parse(restricted.widget.layout.serialize().content) as typeof original
    expect(resaved.arrangement).toBe('4')
    expect(resaved.geometry).toEqual(original.geometry)
    expect(resaved.charts).toHaveLength(4)
    expect(resaved.charts.slice(2)).toEqual(original.charts.slice(2))

    // Through the store too: a save under the restriction and a load where every arrangement is offered.
    const saveLoad = memorySaveLoadAdapter()
    const stored = mount({ layouts: ['s', '2h'], saveLoad })
    stored.widget.layout.restore(saved)
    await stored.widget.layout.saveLoad.save('Desk')
    const id = stored.widget.layout.saveLoad.current()!.ref.id
    const wide = mount({ saveLoad })
    expect((await wide.widget.layout.saveLoad.load(id)).kind).toBe('ok')
    expect(wide.widget.layout.arrangement()).toBe('4')
    expect(symbols(wide.widget)).toEqual(['ES', 'NQ', 'CL', 'GC'])

    const widened = mount()
    widened.widget.layout.restore(JSON.stringify(resaved))
    expect(widened.widget.layout.arrangement()).toBe('4')
    expect(symbols(widened.widget)).toEqual(['YM', 'NQ', 'CL', 'GC'])
  })

  it("shows one chart on a host offering ['s'], and its re-save keeps the other three for a host offering every arrangement", async () => {
    const saveLoad = memorySaveLoadAdapter()
    const wide = mount({ saveLoad, layout: { arrangement: '4' } })
    await settle()
    ;['ES', 'NQ', 'CL', 'GC'].forEach((symbol, i) => wide.widget.charts()[i]!.setSymbol(symbol))
    await wide.widget.layout.saveLoad.save('Desk')
    const id = wide.widget.layout.saveLoad.current()!.ref.id

    const single = mount({ saveLoad, layouts: ['s'] })
    expect((await single.widget.layout.saveLoad.load(id)).kind).toBe('ok')
    expect(single.widget.layout.arrangement()).toBe('s')
    expect(symbols(single.widget)).toEqual(['ES'])
    expect(setupButton(single.container)).toBeNull()
    single.widget.activeChart().setTimeframe('5m')
    expect((await single.widget.layout.saveLoad.save('Desk')).kind).toBe('ok')

    const reopened = mount({ saveLoad })
    expect((await reopened.widget.layout.saveLoad.load(id)).kind).toBe('ok')
    expect(reopened.widget.layout.arrangement()).toBe('4')
    expect(symbols(reopened.widget)).toEqual(['ES', 'NQ', 'CL', 'GC'])
    expect(reopened.widget.charts()[0]!.timeframe()).toBe('5m')
  })

  it('stops carrying them once the layout is re-tiled', async () => {
    const saved = await savedFour()
    const { widget } = mount({ layouts: ['s', '2h', '3h'] })
    widget.layout.restore(saved)
    widget.layout.setArrangement('2h')
    const content = JSON.parse(widget.layout.serialize().content) as { arrangement: string; charts: unknown[] }
    expect(content.arrangement).toBe('2h')
    expect(content.charts).toHaveLength(2)
  })

  it('opens on the fewest charts when every offered arrangement holds more, filling the extra panes from the first chart', async () => {
    const source = mount()
    await settle()
    source.widget.activeChart().setSymbol('CL')
    const saved = source.widget.layout.serialize().content
    const { widget } = mount({ layouts: ['4', '2h', '3h'] })
    widget.layout.restore(saved)
    expect(widget.layout.arrangement()).toBe('2h')
    expect(symbols(widget)).toEqual(['CL', 'CL'])
    const content = JSON.parse(widget.layout.serialize().content) as { arrangement: string; charts: unknown[] }
    expect(content.arrangement).toBe('2h')
    expect(content.charts).toHaveLength(2)
  })

  it('creates a new layout on the arrangement a single chart falls back to', async () => {
    const { widget } = mount({ layouts: ['2h', '3h'], saveLoad: memorySaveLoadAdapter() })
    await settle()
    widget.layout.setArrangement('3h')
    widget.charts()[1]!.setSymbol('NQ')
    widget.commands.execute('widget.layout.create', 'Swing')
    await settle()
    expect(widget.layout.saveLoad.current()?.name).toBe('Swing')
    expect(widget.layout.arrangement()).toBe('2h')
    expect(symbols(widget)).toEqual(['ES', 'ES'])
  })
})

describe('the sync switches a widget offers', () => {
  it('leave the others at the host value: hidden, refused by setSync, and not moved by a saved layout', async () => {
    const saved = await savedFour()
    const { widget, container } = mount({ layoutSync: ['symbol', 'timeframe'], layout: { arrangement: '2h', sync: { time: true } } })
    expect(setupMenu(container).switches).toEqual(['Sync symbol', 'Sync timeframe'])
    widget.layout.setSync({ time: false, crosshair: true })
    expect(widget.layout.sync()).toEqual({ symbol: false, timeframe: false, crosshair: false, time: true, dateRange: false })
    expect(widget.commands.execute('widget.layout.setSync', { symbol: true, time: false }).kind).toBe('ok')
    expect(widget.layout.sync()).toEqual({ symbol: true, timeframe: false, crosshair: false, time: true, dateRange: false })
    widget.layout.restore(saved)
    expect(widget.layout.sync()).toEqual({ symbol: false, timeframe: false, crosshair: false, time: true, dateRange: false })
  })

  it('may be none, which fixes every switch and leaves the command unavailable', () => {
    const { widget, container } = mount({ layoutSync: [] })
    expect(setupMenu(container).switches).toEqual([])
    expect(widget.commands.available('widget.layout.setSync')).toBe(false)
    widget.layout.setSync({ symbol: true })
    expect(widget.layout.sync().symbol).toBe(false)
  })
})

describe('the sync switches a saved layout states', () => {
  it('open a switch the layout leaves out at the value the widget started with, and read only the five names', async () => {
    const saved = JSON.parse(await savedFour()) as { sync: Record<string, boolean> }
    delete saved.sync.timeframe
    saved.sync.interval = false
    const { widget } = mount({ layout: { arrangement: '2h', sync: { timeframe: true } } })
    widget.layout.restore(JSON.stringify(saved))
    expect(widget.layout.sync()).toEqual({ symbol: false, timeframe: true, crosshair: true, time: false, dateRange: false })
    expect(Object.keys(JSON.parse(widget.layout.serialize().content).sync)).toEqual(['symbol', 'timeframe', 'crosshair', 'time', 'dateRange'])
  })

  it('refuse a switch stated as anything but a boolean, and keep the layout on screen', async () => {
    const saved = JSON.parse(await savedFour()) as { sync: Record<string, unknown> }
    saved.sync = { ...saved.sync, timeframe: 'yes' }
    const { widget } = mount({ layout: { arrangement: '2h' } })
    expect(() => widget.layout.restore(JSON.stringify(saved))).toThrow(/invalid layout sync flags/)
    expect(widget.layout.arrangement()).toBe('2h')
  })

  it('hold the five switches alone: a caller naming another key moves no switch and saves none', () => {
    const { widget } = mount({ layout: { arrangement: '2h' } })
    expect(widget.commands.execute('widget.layout.setSync', { interval: true }).kind).toBe('ok')
    expect(widget.layout.sync()).toEqual({ symbol: false, timeframe: false, crosshair: false, time: false, dateRange: false })
    expect(Object.keys(JSON.parse(widget.layout.serialize().content).sync)).toEqual(['symbol', 'timeframe', 'crosshair', 'time', 'dateRange'])
  })
})

describe('a layouts option the host got wrong', () => {
  const refuse = (options: Partial<ChartWidgetOptions>, message: string): void => {
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => mounted.push(createChart({ container, datafeed, ...options }))).toThrow(message)
    expect(container.childElementCount).toBe(0)
  }

  it('is an empty list', () => refuse({ layouts: [] }, 'layouts must name at least one arrangement code'))
  it('is a code outside the catalog', () => refuse({ layouts: ['s', '3x3'] }, 'layouts names "3x3", which is not an arrangement code'))
  it('is a repeated code', () => refuse({ layouts: ['s', '2h', 's'] }, 'layouts names "s" more than once'))
  it('is an opening arrangement outside the list', () => refuse({ layouts: ['s', '2h'], layout: { arrangement: '4' } }, 'layout.arrangement "4" is not one of the offered layouts: s, 2h'))
  it('is an unknown sync switch', () => refuse({ layoutSync: ['symbol', 'zoom' as never] }, 'layoutSync names "zoom", which is not a sync switch'))
  it('names the timeframe switch interval', () => refuse({ layoutSync: ['interval' as never] }, 'layoutSync names "interval", which is not a sync switch; it takes symbol, timeframe, crosshair, time, dateRange'))
  it('is a repeated sync switch', () => refuse({ layoutSync: ['time', 'time'] }, 'layoutSync names "time" more than once'))
})
