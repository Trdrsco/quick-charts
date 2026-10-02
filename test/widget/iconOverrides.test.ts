// @vitest-environment happy-dom
// A host's drawings for the chart's icons, over real widgets.
//
// The sweep is the coverage proof: with a drawing for every published icon, every glyph the
// interface shows is the host's, on the bars at rest and in each menu and dialog a viewer raises,
// so no surface draws around the one resolver. The product's own mark is the one glyph the
// inventory leaves out. The rest holds a factory to its contract: what it is handed, what the chart
// keeps for itself, how a failure falls back, and that each widget wears only what it was given.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart, type ChartWidget } from '../../src/widget/create'
import { memorySaveLoadAdapter } from '../../src/resources'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { drawingTools } from '../../src/drawings/index'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { ChartIconContext } from '../../src/ui/icons/contract'
import type { ChartWidgetOptions } from '../../src/widget/options'
import { everyHostIcon, hostIcon, ownGlyphs } from '../ownIcons'
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
/** A feed over the bars; `status` is what its subscription reports, for a feed that raises a notice. */
const datafeed = (status?: string): ChartDatafeed => ({
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async () => null,
  history: async () => ({ bars, noData: false }),
  subscribeBars: (_symbol, _timeframe, handlers) => {
    if (status) handlers.onStatus?.(status)
    return () => undefined
  },
})
const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function mount(options: Partial<ChartWidgetOptions> = {}): Promise<{ widget: ChartWidget; container: HTMLElement }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const widget = createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', saveLoad: memorySaveLoadAdapter(), ...options })
  widgets.push(widget)
  await widget.ready()
  await settle()
  return { widget, container }
}

/** The glyphs on the page the host did not draw, apart from the product's own mark. */
const unhosted = (): string[] => ownGlyphs(document, '.qc-plot-corner')

/** Press the control a viewer names, the way a viewer presses it. */
async function press(label: string, prefix = false): Promise<void> {
  const control = [...document.querySelectorAll<HTMLElement>('button')].find((b) => {
    const name = b.getAttribute('aria-label') ?? ''
    return prefix ? name.startsWith(label) : name === label
  })
  if (!control) throw new Error(`no control is named ${label}`)
  control.click()
  await settle()
}

/** Open every popup a surface announces, and every submenu inside it, checking the page after each. */
async function sweepPopups(surface: string, seen: string[][]): Promise<void> {
  const triggers = [...document.querySelectorAll<HTMLElement>(`${surface} [aria-haspopup]`)]
  expect(triggers.length, surface).toBeGreaterThan(0)
  for (const trigger of triggers) {
    trigger.click()
    await settle()
    seen.push(unhosted())
    for (const row of [...document.querySelectorAll<HTMLElement>('[data-role="drawing-popover"] [aria-haspopup]')]) {
      row.dispatchEvent(new MouseEvent('mouseenter'))
      row.click()
      await settle()
      seen.push(unhosted())
    }
  }
}

/** A trend line on the chart, selected, so the settings bar stands. */
async function selectTrendLine(widget: ChartWidget): Promise<void> {
  const line = drawingTools.create('trend_line', 'd1', [{ time: bars[10]!.t as never, price: 20 }, { time: bars[30]!.t as never, price: 40 }])!
  const drawings = widget.activeChart().drawings!
  drawings.restore([line.toJSON()])
  drawings.select('d1')
  await settle()
}

type Raise = (widget: ChartWidget, container: HTMLElement) => Promise<string[][]>

/** Every surface the default interface draws, raised as a viewer raises it. Each answers what the
 *  page showed at each stop, so one unhosted glyph names the stop it stood at. */
const SURFACES: readonly [string, Raise][] = [
  ['the bars at rest', async () => [unhosted()]],
  [
    'the legend with a study on the price pane and one in a pane of its own',
    async (widget) => {
      widget.activeChart().indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
      widget.activeChart().indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
      await settle()
      return [unhosted()]
    },
  ],
  ['the timeframe menu', async () => (await press('All timeframes'), [unhosted()])],
  ['the style menu', async () => (await press('Chart style', true), [unhosted()])],
  ['the layouts menu', async () => (await press('Manage layouts'), [unhosted()])],
  ['the layout setup', async () => (await press('Layout setup', true), [unhosted()])],
  ['the settings menu', async () => (await press('Chart settings'), [unhosted()])],
  ['the image menu', async () => (await press('Chart image'), [unhosted()])],
  [
    'the market status',
    async (_, container) => {
      container.querySelector<HTMLElement>('.qc-legend-status')!.click()
      await settle()
      return [unhosted()]
    },
  ],
  [
    'the context menu',
    async (_, container) => {
      fakePriceAt(() => 100)
      container.querySelector('.qc-gestures')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 80 }))
      await settle()
      expect(document.querySelector('.qc-menu-row')).not.toBeNull()
      return [unhosted()]
    },
  ],
  ['the symbol search', async (widget) => (widget.commands.execute('chart.symbol.search'), await settle(), [unhosted()])],
  ['the compare search', async (widget) => (widget.commands.execute('chart.compare.open'), await settle(), [unhosted()])],
  ['the indicator picker', async (widget) => (widget.commands.execute('chart.indicators.open'), await settle(), [unhosted()])],
  [
    'the indicator settings',
    async (widget, container) => {
      widget.activeChart().indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
      await settle()
      container.querySelector<HTMLButtonElement>('button[aria-label="Indicator settings"]')!.click()
      await settle()
      return [unhosted()]
    },
  ],
  ['the saved layouts', async (widget) => (widget.commands.execute('widget.layout.open'), await settle(), [unhosted()])],
  ['the layout name prompt', async (widget) => (widget.commands.execute('widget.layout.save'), await settle(), [unhosted()])],
  [
    'the replay transport, its starting-point menu and its date picker',
    async (widget) => {
      await press('Bar replay')
      const stops = [unhosted()]
      await press('Select starting point')
      stops.push(unhosted())
      const byDate = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')].find((row) => row.textContent?.startsWith('Date'))!
      byDate.click()
      await settle()
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      stops.push(unhosted())
      widget.commands.execute('chart.replay.start', bars[20]!.t)
      await settle()
      stops.push(unhosted())
      return stops
    },
  ],
  [
    'the drawing toolbar and every menu it opens',
    async () => {
      const seen: string[][] = [unhosted()]
      await sweepPopups('[data-role="drawing-toolbar"]', seen)
      return seen
    },
  ],
  ['the favorites bar', async (widget) => (widget.commands.execute('chart.drawings.favorite', 'arrow'), await settle(), [unhosted()])],
  [
    "a selected drawing's settings bar and every menu it opens",
    async (widget) => {
      await selectTrendLine(widget)
      expect(document.querySelector('[data-role="drawing-settings-bar"]')).not.toBeNull()
      const seen: string[][] = [unhosted()]
      await sweepPopups('[data-role="drawing-settings-bar"]', seen)
      return seen
    },
  ],
  [
    'the drawing template prompt',
    async (widget) => {
      await selectTrendLine(widget)
      document.querySelector<HTMLElement>('[data-role="drawing-settings-bar"] [data-qc-control="templates"]')!.click()
      await settle()
      const save = [...document.querySelectorAll<HTMLElement>('[data-role="drawing-popover"] [role="menuitem"]')].find((row) => row.textContent?.startsWith('Save drawing template as'))!
      save.click()
      await settle()
      return [unhosted()]
    },
  ],
  [
    'the drawing settings dialog, page by page, with its line-end pickers',
    async (widget) => {
      await selectTrendLine(widget)
      widget.commands.execute('chart.drawings.settings')
      await settle()
      const dialog = document.querySelector<HTMLElement>('[data-role="drawing-settings"]')!
      const seen: string[][] = [unhosted()]
      for (const tab of [...dialog.querySelectorAll<HTMLElement>('[role="tab"]')]) {
        tab.click()
        await settle()
        seen.push(unhosted())
        for (const end of [...dialog.querySelectorAll<HTMLElement>('.qc-drawing-line-end')]) {
          end.click()
          await settle()
          seen.push(unhosted())
        }
      }
      return seen
    },
  ],
]

describe('a host that draws every icon draws every glyph the interface shows', () => {
  it.each(SURFACES)('%s', async (_, raise) => {
    const { widget, container } = await mount({ icons: everyHostIcon() })
    const stops = await raise(widget, container)
    for (const [index, stop] of stops.entries()) expect(stop, `stop ${index + 1}`).toEqual([])
    // The sweep is not vacuous: the host's drawings are what the page shows.
    expect(document.querySelectorAll('[data-host-icon]').length).toBeGreaterThan(0)
    expect(widget.chrome.iconDiagnostics()).toEqual([])
  })

  it('draws the notices a feed raises', async () => {
    await mount({ datafeed: datafeed('no-data'), icons: everyHostIcon() })
    expect(document.querySelector('.qc-toast')).not.toBeNull()
    expect(unhosted()).toEqual([])
  })

  it('leaves the glyphs it was not given to the chart', async () => {
    await mount({ icons: { settings: hostIcon('settings') } })
    const settings = document.querySelector('button[aria-label="Chart settings"]')!
    expect(settings.querySelector('svg')!.getAttribute('data-host-icon')).toBe('settings')
    const fullscreen = document.querySelector('button[aria-label="Fullscreen"]')!
    expect(fullscreen.querySelector('svg')!.hasAttribute('data-host-icon')).toBe(false)
  })
})

describe('what a factory is handed and what the chart keeps', () => {
  it('hands the document, the box and the reading direction', async () => {
    const asked: ChartIconContext[] = []
    const draw = hostIcon('settings')
    await mount({ icons: { settings: (context) => (asked.push(context), draw(context)) } })
    expect(asked.length).toBeGreaterThan(0)
    const [first] = asked
    expect(first!.document).toBe(document)
    expect(first!.direction).toBe('ltr')
    const svg = document.querySelector('button[aria-label="Chart settings"] svg')!
    // The chart sizes the answer to the box it named.
    expect(svg.getAttribute('width')).toBe(String(first!.width))
    expect(svg.getAttribute('height')).toBe(String(first!.height))
  })

  it('names right to left for a right-to-left language', async () => {
    const asked: ChartIconContext[] = []
    const draw = hostIcon('settings')
    await mount({ locale: 'ar', icons: { settings: (context) => (asked.push(context), draw(context)) } })
    expect(asked.at(-1)!.direction).toBe('rtl')
  })

  it('keeps the control its own: name, hit area, and the glyph hidden from assistive technology', async () => {
    await mount({ icons: everyHostIcon() })
    const settings = document.querySelector<HTMLButtonElement>('button[aria-label="Chart settings"]')!
    expect(settings.getAttribute('aria-label')).toBe('Chart settings')
    const svg = settings.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    // Pressing it still opens the chart's own menu.
    settings.click()
    await settle()
    expect(document.querySelector('[role="dialog"] [data-settings-page="theme"]')).not.toBeNull()
  })
})

describe('a factory that fails costs one glyph its artwork', () => {
  it('falls back to the chart’s own glyph when a factory throws, and reports it once', async () => {
    const { widget } = await mount({
      icons: {
        settings: () => {
          throw new Error('no artwork')
        },
      },
    })
    const settings = document.querySelector('button[aria-label="Chart settings"]')!
    expect(settings.querySelector('svg')).not.toBeNull()
    expect(settings.querySelector('[data-host-icon]')).toBeNull()
    // Each study's gear draws the same icon again; the failure is still one record.
    widget.activeChart().indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    widget.activeChart().indicators.add({ id: 'rsi-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'rsi')! })
    await settle()
    const gears = [...document.querySelectorAll('button[aria-label="Indicator settings"]')]
    expect(gears.length).toBeGreaterThanOrEqual(2)
    for (const gear of gears) expect(gear.querySelector('svg')).not.toBeNull()
    expect(widget.chrome.iconDiagnostics()).toEqual([{ icon: 'settings', code: 'threw', message: 'settings: the factory threw' }])
  })

  it('refuses an answer that is not an svg element', async () => {
    const { widget } = await mount({ icons: { settings: ((context: ChartIconContext) => context.document.createElement('div')) as never } })
    expect(document.querySelector('button[aria-label="Chart settings"] svg')).not.toBeNull()
    expect(widget.chrome.iconDiagnostics().map((d) => [d.icon, d.code])).toEqual([['settings', 'not-svg']])
  })

  it('refuses an element answered twice, and leaves the first control holding it', async () => {
    const shared = hostIcon('settings')({ document, width: 28, height: 28, direction: 'ltr' })
    const { widget } = await mount({ icons: { settings: () => shared } })
    expect(shared.closest('button')?.getAttribute('aria-label')).toBe('Chart settings')
    // A study's gear asks for the same icon and is handed the element the top bar holds.
    widget.activeChart().indicators.add({ id: 'sma-1', definition: BUILT_IN_INDICATORS.find((d) => d.id === 'sma')! })
    await settle()
    expect(document.querySelector('button[aria-label="Indicator settings"] svg')).not.toBeNull()
    expect(shared.closest('button')?.getAttribute('aria-label')).toBe('Chart settings')
    expect(widget.chrome.iconDiagnostics().map((d) => [d.icon, d.code])).toEqual([['settings', 'in-use']])
  })

  it('refuses an element already standing in the document, and leaves it where it stands', async () => {
    const elsewhere = document.body.appendChild(document.createElement('div'))
    const standing = elsewhere.appendChild(hostIcon('settings')({ document, width: 28, height: 28, direction: 'ltr' }))
    const { widget } = await mount({ icons: { settings: () => standing } })
    expect(standing.parentElement).toBe(elsewhere)
    expect(document.querySelector('button[aria-label="Chart settings"] svg')).not.toBeNull()
    expect(widget.chrome.iconDiagnostics().map((d) => [d.icon, d.code])).toEqual([['settings', 'in-use']])
  })
})

describe('a host drawing follows the reading direction', () => {
  it('draws every host glyph again when a language turns the direction around', async () => {
    const { widget } = await mount({ icons: everyHostIcon() })
    const drawn = (): Element[] => [...document.querySelectorAll('svg[data-host-icon]')]
    const before = drawn()
    expect(before.length).toBeGreaterThan(0)
    expect(before.every((svg) => svg.getAttribute('data-direction') === 'ltr')).toBe(true)
    const settings = document.querySelector('button[aria-label="Chart settings"]')!
    await widget.setLocale('ar')
    await settle()
    const after = drawn()
    expect(after.length).toBe(before.length)
    expect(after.every((svg) => svg.getAttribute('data-direction') === 'rtl')).toBe(true)
    // The control is the one that stood before; only its artwork was made again.
    expect(settings.isConnected).toBe(true)
    expect(settings.querySelector('svg')!.getAttribute('data-direction')).toBe('rtl')
    expect(widget.chrome.iconDiagnostics()).toEqual([])
  })

  it('leaves every drawing where it is for a language that reads the same way', async () => {
    const { widget } = await mount({ icons: { settings: hostIcon('settings') } })
    const settings = document.querySelector('button[aria-label="Chart settings"]')!
    const glyph = settings.querySelector('svg')
    await widget.setLocale('de')
    await settle()
    expect(settings.querySelector('svg')).toBe(glyph)
  })

  it('draws a host control again with the chart', async () => {
    const { widget } = await mount()
    const control = widget.chrome.toolbarButton({ label: 'Price alerts', icon: hostIcon('alerts'), onClick: () => undefined })
    widget.chrome.topBar('afterIndicators')!.appendChild(control.element)
    expect(control.element.querySelector('svg')!.getAttribute('data-direction')).toBe('ltr')
    await widget.setLocale('ar')
    await settle()
    expect(control.element.querySelector('svg')!.getAttribute('data-direction')).toBe('rtl')
    // Back to a left-to-right language, and back to the left-to-right drawing.
    await widget.setLocale('en')
    await settle()
    expect(control.element.querySelector('svg')!.getAttribute('data-direction')).toBe('ltr')
  })

  it('keeps the drawing it had when the factory refuses the new direction, and says so once', async () => {
    const draw = hostIcon('settings')
    const { widget } = await mount({
      icons: {
        settings: (context) => {
          if (context.direction === 'rtl') throw new Error('no right-to-left artwork')
          return draw(context)
        },
      },
    })
    const settings = document.querySelector('button[aria-label="Chart settings"]')!
    await widget.setLocale('ar')
    await settle()
    expect(settings.querySelector('svg')!.getAttribute('data-direction')).toBe('ltr')
    expect(widget.chrome.iconDiagnostics().map((d) => [d.icon, d.code])).toEqual([['settings', 'threw']])
  })
})

describe('the icons are the widget’s own', () => {
  it('draws each widget in what it was given', async () => {
    const branded = await mount({ icons: { settings: hostIcon('settings') } })
    const plain = await mount()
    expect(branded.container.querySelector('button[aria-label="Chart settings"] [data-host-icon]')).not.toBeNull()
    expect(plain.container.querySelector('button[aria-label="Chart settings"] [data-host-icon]')).toBeNull()
  })

  it('refuses an icon nothing draws before anything mounts', () => {
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', icons: { nope: hostIcon('nope') } as never })).toThrow(
      new TypeError('icons.nope is not an icon the chart draws; CHART_ICON_IDS lists every one'),
    )
    expect(container.childElementCount).toBe(0)
  })

  it('refuses a drawing that is not a factory', () => {
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => createChart({ container, datafeed: datafeed(), symbol: 'ES', timeframe: '1m', icons: { settings: '<svg/>' } as never })).toThrow(
      new TypeError('icons.settings must be a function that draws the icon'),
    )
  })
})
