// @vitest-environment happy-dom
// The presentation plane against the behavior plane, over real widgets.
//
// Hiding one of the chart's own controls must leave every command exactly as available as it was,
// apart from the door to a dialog the host hid as well, so a control of the host's own reaches what
// the built-in one reached. The first block proves that for every flag the plane has, by comparing
// the whole registry of a widget with one flag off against a widget with none. The coverage table
// then accounts for every flag on screen: a hidden control is gone, and a shown one is there, found
// by what a viewer or a screen reader finds it by. The rest proves the doors a hidden top bar used to
// take with it: the search dialog, the saved-layout dialogs and autosave.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { memorySaveLoadAdapter } from '../../src/resources'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { FeatureConfig, UiConfig } from '../../src/widget/options'
import { FEATURE_KEYS, flagPaths, resolveFeatures, resolveUi, UI_KEYS } from '../../src/widget/planes'
import { fakePriceAt } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  document.body.replaceChildren()
  fakePriceAt(null)
})

const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => ({ t: 60 * (index + 1), o: 10 + index, h: 11 + index, l: 9 + index, c: 10 + index, v: index + 1 }))
const datafeed = (): ChartDatafeed => ({
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: () => () => undefined,
})
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function mount(planes: { ui?: UiConfig; features?: FeatureConfig } = {}): Promise<{ widget: ChartWidget; container: HTMLElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', saveLoad: memorySaveLoadAdapter(), ...planes })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return { widget, container }
}

/** The presentation value that turns one flag path off: `topBar.settings.theme` is
 *  `{ topBar: { settings: { theme: false } } }`. */
const off = (path: string): UiConfig => path.split('.').reduceRight<unknown>((inner, key) => ({ [key]: inner }), false) as UiConfig

/** Every registered command and whether it would run now. */
const availability = (widget: ChartWidget): Record<string, boolean> =>
  Object.fromEntries(widget.commands.list().map((spec) => [spec.id, widget.commands.available(spec.id)]))

/** The commands whose one job is opening a dialog of the chart's own, by the flag that hides it. */
const DOORS: Readonly<Record<string, readonly string[]>> = {
  symbolSearch: ['chart.symbol.search'],
  indicatorPicker: ['chart.indicators.open'],
}

describe('hiding a control leaves the commands behind it available', () => {
  it.each(flagPaths(UI_KEYS))('%s', async (path) => {
    const shown = availability((await mount()).widget)
    const hidden = availability((await mount({ ui: off(path) })).widget)
    // The same verbs are registered either way: presentation never removes a command.
    expect(Object.keys(hidden).sort()).toEqual(Object.keys(shown).sort())
    const changed = Object.keys(shown).filter((id) => hidden[id] !== shown[id])
    expect(changed.sort()).toEqual([...(DOORS[path] ?? [])].sort())
    for (const door of DOORS[path] ?? []) expect(hidden[door], door).toBe(false)
  })
})

/** A control found by its accessible name, or by the start of one that carries a live value. */
const named = (label: string, prefix = false) => (root: ParentNode): boolean =>
  [...root.querySelectorAll('button, [role="button"]')].some((el) => {
    const name = el.getAttribute('aria-label') ?? ''
    return prefix ? name.startsWith(label) : name === label
  })
const has = (selector: string) => (root: ParentNode): boolean => root.querySelector(selector) !== null

/** Finds a control on the chart, raising whatever the viewer would raise first. */
type Probe = (container: HTMLElement, widget: ChartWidget) => boolean | Promise<boolean>

/** Every flag of the plane, and how the default interface draws it. A flag probed here is gone when
 *  hidden and present when shown; one only a dialog of its own can show names the test that opens
 *  that dialog in this file. */
const COVERAGE: Readonly<Record<string, Probe | { provedBy: string }>> = {
  topBar: has('.qc-topbar'),
  'topBar.symbol': has('.qc-symbol-pill'),
  'topBar.compare': named('Compare or add symbol'),
  'topBar.timeframes': named('All timeframes'),
  'topBar.styles': named('Chart style', true),
  'topBar.indicators': named('Indicators'),
  'topBar.replay': named('Bar replay'),
  'topBar.history': named('Undo', true),
  'topBar.layouts': named('Manage layouts'),
  'topBar.settings': named('Chart settings'),
  'topBar.settings.theme': async (container) => {
    container.querySelector<HTMLButtonElement>('button[aria-label="Chart settings"]')!.click()
    await settle()
    return [...document.querySelectorAll('.qc-menu-heading')].some((heading) => heading.textContent === 'Theme')
  },
  'topBar.fullscreen': named('Fullscreen'),
  'topBar.image': named('Chart image'),
  bottomBar: has('.qc-bottombar'),
  drawingToolbar: has('.qc-drawing-toolbar'),
  drawingFavorites: async (_, widget) => {
    widget.commands.execute('chart.drawings.favorite', 'arrow')
    await settle()
    return has('[data-role="drawing-favorites"]')(document)
  },
  legend: has('.qc-legend'),
  'legend.values': (root) => (root.querySelector('[data-role="legend-quote"]')?.textContent ?? '') !== '',
  'legend.marketStatus': has('.qc-legend-status'),
  navigation: has('.qc-nav'),
  contextMenu: (container) => {
    // A press reads a level the way it does over a painted chart.
    fakePriceAt(() => 100)
    const press = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 })
    container.querySelector('.qc-gestures')!.dispatchEvent(press)
    return press.defaultPrevented && has('.qc-menu-row')(document)
  },
  replayTransport: { provedBy: 'this file: a hidden transport leaves replay to the commands' },
  toasts: has('.qc-toasts'),
  symbolSearch: { provedBy: 'this file: the search dialog is reached without the top bar, and its door closes with it' },
  indicatorPicker: async (_, widget) => {
    widget.commands.execute('chart.indicators.open')
    await settle()
    return has('.qc-picker-dialog')(document)
  },
  indicatorSettings: { provedBy: 'this file: a hidden settings dialog leaves the legend gear to the inputs editor' },
}

describe('every control flag is accounted for on screen', () => {
  it('names each flag of the plane exactly once', () => {
    expect(Object.keys(COVERAGE).sort()).toEqual(flagPaths(UI_KEYS).sort())
  })

  const probed = Object.entries(COVERAGE).filter((entry): entry is [string, Probe] => typeof entry[1] === 'function')
  it.each(probed)('%s: drawn by default, gone when hidden', async (path, probe) => {
    const shown = await mount()
    expect(await probe(shown.container, shown.widget), 'shown').toBe(true)
    shown.widget.dispose()
    document.body.replaceChildren()
    const hidden = await mount({ ui: off(path) })
    expect(await probe(hidden.container, hidden.widget), 'hidden').toBe(false)
  })
})

describe('a hidden top bar keeps every door it used to carry', () => {
  it('opens the chart’s own search dialog from a command', async () => {
    const { widget, container } = await mount({ ui: { topBar: false } })
    expect(container.querySelector('.qc-topbar')).toBeNull()
    expect(widget.commands.execute('chart.symbol.search').kind).toBe('ok')
    // The chart's dialogs stand in its layer on the document, clear of whatever box the host gave it.
    expect(document.querySelector('[role="dialog"][aria-label="Symbol search"]')).not.toBeNull()
  })

  it('asks a never-saved layout its name, and lists the saved layouts, from commands', async () => {
    const { widget } = await mount({ ui: { topBar: false } })
    expect(widget.commands.execute('widget.layout.save').kind).toBe('ok')
    expect(document.querySelector('[role="dialog"][aria-label="Save New Chart Layout"]')).not.toBeNull()
    expect(widget.commands.execute('widget.layout.open').kind).toBe('ok')
    await settle()
    expect(document.querySelector('[role="dialog"][aria-label="Layouts"]')).not.toBeNull()
  })

  it('autosaves a named layout on change, and catches a dirty one up when autosave is switched on', async () => {
    const { widget } = await mount({ ui: { topBar: false } })
    const saved: string[] = []
    widget.on('layout', (event) => {
      if (event.kind === 'saved') saved.push(event.name ?? '')
    })
    widget.commands.execute('widget.layout.save', { name: 'Desk', asNew: true })
    await settle()
    expect(saved).toEqual(['Desk'])
    // A change with autosave off is unsaved work and nothing more.
    widget.commands.execute('chart.timeframe.set', '5m')
    await settle(1_100)
    expect(saved).toEqual(['Desk'])
    // Switching autosave on writes the change that was waiting.
    widget.commands.execute('widget.layout.autosave', true)
    await settle()
    expect(saved).toEqual(['Desk', 'Desk'])
    // And the next change writes itself once the change settles.
    widget.commands.execute('chart.timeframe.set', '15m')
    await settle(1_100)
    expect(saved).toEqual(['Desk', 'Desk', 'Desk'])
  })
})

describe('a hidden dialog closes its own door and nothing else', () => {
  it('refuses the search door with the dialog hidden, and still changes the symbol', async () => {
    const { widget, container } = await mount({ ui: { symbolSearch: false } })
    expect(container.querySelector('.qc-symbol-pill')).toBeNull()
    expect(widget.commands.execute('chart.symbol.search').kind).toBe('unavailable')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(widget.commands.execute('chart.symbol.set', 'NQ').kind).toBe('ok')
    expect(widget.activeChart().symbol()).toBe('NQ')
  })

  it.each([
    { hidden: false, opens: '.qc-settings-dialog', not: '.qc-inputs' },
    { hidden: true, opens: '.qc-inputs', not: '.qc-settings-dialog' },
  ])('opens $opens from the legend gear with the settings dialog hidden=$hidden', async ({ hidden, opens, not }) => {
    const { widget, container } = await mount(hidden ? { ui: { indicatorSettings: false } } : {})
    const sma = BUILT_IN_INDICATORS.find((d) => d.id === 'sma')!
    widget.activeChart().indicators.add({ id: 'sma-1', definition: sma })
    await settle()
    container.querySelector<HTMLButtonElement>('button[aria-label="Indicator settings"]')!.click()
    await settle()
    expect(document.querySelector(opens)).not.toBeNull()
    expect(document.querySelector(not)).toBeNull()
    expect(widget.commands.available('chart.indicators.update')).toBe(true)
  })
})

describe('a hidden transport leaves replay to the commands', () => {
  it('starts, runs and leaves replay with no transport row drawn', async () => {
    const { widget, container } = await mount({ ui: { replayTransport: false } })
    expect(widget.commands.execute('chart.replay.start').kind).toBe('ok')
    await settle()
    expect(widget.activeChart().replay.phase()).not.toBe('off')
    expect(container.querySelector('.qc-replay')).toBeNull()
    expect(widget.commands.execute('chart.replay.exit').kind).toBe('ok')
    await settle()
    expect(widget.activeChart().replay.phase()).toBe('off')
  })
})

describe('resolving the planes', () => {
  const features = resolveFeatures()

  it('draws every control by default', () => {
    expect(Object.values(resolveUi(undefined, features)).every(Boolean)).toBe(true)
  })

  it('hides a control inside a hidden surface, and only the controls a node names', () => {
    const noBar = resolveUi({ topBar: false }, features)
    expect([noBar.topBar, noBar.symbolPill, noBar.settingsTheme, noBar.imageMenu]).toEqual([false, false, false, false])
    expect([noBar.bottomBar, noBar.legend, noBar.symbolSearch, noBar.indicatorPicker]).toEqual([true, true, true, true])
    const some = resolveUi({ topBar: { image: false, settings: { theme: false } } }, features)
    expect([some.topBar, some.imageMenu, some.settingsMenu, some.settingsTheme, some.fullscreenButton]).toEqual([true, false, true, false, true])
  })

  it('draws no control over a behavior the features turned off', () => {
    const ui = resolveUi(undefined, resolveFeatures({ replay: false, compare: false, history: false, drawings: false }))
    expect([ui.replayButton, ui.replayTransport, ui.compareButton, ui.historyButtons, ui.drawingToolbar, ui.drawingFavorites]).toEqual([false, false, false, false, false, false])
  })

  it('draws no door to a hidden dialog', () => {
    const ui = resolveUi({ symbolSearch: false, indicatorPicker: false }, features)
    expect([ui.symbolPill, ui.indicatorsButton]).toEqual([false, false])
  })

  it('never reads presentation back into behavior', () => {
    const before = resolveFeatures()
    resolveUi({ topBar: false, drawingToolbar: false, replayTransport: false }, before)
    expect(before).toEqual(resolveFeatures())
  })
})

describe('refusing a configuration the chart would read wrongly', () => {
  it('refuses a key a plane does not take, naming its path and what the plane takes', () => {
    expect(() => resolveFeatures({ topBar: false } as never)).toThrow(TypeError)
    expect(() => resolveFeatures({ topBar: false } as never)).toThrow(`features.topBar is not an option of features; it takes ${Object.keys(FEATURE_KEYS).join(', ')}`)
    expect(() => resolveUi({ topBar: { symbolSearch: false } } as never, resolveFeatures())).toThrow('ui.topBar.symbolSearch is not an option of ui.topBar')
    expect(() => resolveUi({ legend: { dot: false } } as never, resolveFeatures())).toThrow('ui.legend.dot is not an option of ui.legend')
  })

  it('refuses a value of the wrong kind', () => {
    expect(() => resolveFeatures({ drawings: 'no' } as never)).toThrow('features.drawings must be true or false')
    expect(() => resolveFeatures({ compareSymbols: 'NQ' } as never)).toThrow('features.compareSymbols must be a list')
    expect(() => resolveUi({ topBar: 'hidden' } as never, resolveFeatures())).toThrow('ui.topBar must be an object')
    expect(() => resolveUi(null as never, resolveFeatures())).toThrow('ui must be an object')
  })

  it('refuses at construction, before anything is mounted', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    expect(() => createChart({ container, datafeed: datafeed(), ui: { toolbar: false } as never })).toThrow('ui.toolbar is not an option of ui')
    expect(container.children).toHaveLength(0)
  })
})
