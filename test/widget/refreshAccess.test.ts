// @vitest-environment happy-dom
// `widget.refreshAccess()`: the host's way to say its access policy answers differently when nothing
// on the chart changed (a viewer's plan changed mid-session). On a widget mounted the way a host
// mounts it, a policy flipped with no other event reaches every surface that reads it once the host
// calls this, and only then: the bars, the drawing toolbar and its flyouts, the favorites bar, the
// glyph picker, the legend's row controls, open menus and flyouts, and the indicator picker. Under
// `'hide'` a refused control goes; under `'disable'` it stays, disabled. Nothing stored and nothing
// on the chart moves.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { buildDrawingToolbarGroups } from '../../src/drawings/index'
import { memoryChartStorage } from '../../src/storage'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { AccessPolicy, ChartWidgetOptions } from '../../src/widget/options'

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
  const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', features: { replay: true, sessions: false, compare: false }, ...options })
  mounted.push(widget)
  return { widget, container }
}

/** A policy whose refusals the test changes while the widget is up, as a host's follows its session. */
function livePolicy(refused: 'disable' | 'hide') {
  const denied = { commands: new Set<string>(), tools: new Set<string>(), indicators: new Set<string>() }
  const access: AccessPolicy = {
    refused,
    command: (id) => !denied.commands.has(id),
    drawingTool: (id) => !denied.tools.has(id),
    indicator: (id) => !denied.indicators.has(id),
  }
  return { access, denied }
}

const REFUSED = ['disable', 'hide'] as const

const trend = buildDrawingToolbarGroups().find((group) => group.id === 'trend')!
const firstTrendTool = trend.sections[0]!.tools[0]!.type
const secondTrendTool = trend.sections[0]!.tools[1]!.type

/** Whether a control is drawn: present and inside nothing hidden. */
const drawn = (element: Element | null | undefined): boolean => !!element && !element.closest('[hidden]')
const topButton = (container: HTMLElement, label: string): HTMLButtonElement => container.querySelector<HTMLButtonElement>(`.qc-topbar button[aria-label="${label}"]`)!
const toolbar = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.qc-drawing-toolbar-column')!
const groupArrow = (container: HTMLElement, label: string): HTMLButtonElement => toolbar(container).querySelector<HTMLButtonElement>(`button[aria-label="${label} menu"]`)!
const flyoutRow = (tool: string): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(`.qc-drawing-flyout [data-tool="${tool}"]`)
const favorites = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('[data-role="drawing-favorites"] .qc-drawing-favorite')].filter((b) => drawn(b)).map((b) => b.dataset.tool!)

/** What `refused` says a refused control looks like: absent, or drawn and disabled. */
function expectRefused(refused: 'disable' | 'hide', control: HTMLButtonElement | null | undefined, what: string): void {
  if (refused === 'hide') expect(drawn(control), what).toBe(false)
  else {
    expect(drawn(control), what).toBe(true)
    expect(control!.disabled, what).toBe(true)
  }
}

describe('widget.refreshAccess', () => {
  it('moves the bars with a policy that changed, and nothing else does', async () => {
    for (const refused of REFUSED) {
      const { access, denied } = livePolicy(refused)
      const { widget, container } = mount({ access })
      await settle()
      const replay = topButton(container, 'Bar replay')
      expect(drawn(replay)).toBe(true)
      expect(replay.disabled).toBe(false)
      denied.commands.add('chart.replay.start')
      await settle()
      // No chart event and no registry change: the bar still shows what the policy used to say.
      expect(drawn(replay), refused).toBe(true)
      expect(replay.disabled, refused).toBe(false)
      // The host says so, and the bar reads the policy again at once.
      widget.refreshAccess()
      expectRefused(refused, replay, refused)
      denied.commands.clear()
      widget.refreshAccess()
      expect(drawn(replay)).toBe(true)
      expect(replay.disabled).toBe(false)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('moves the drawing toolbar, its groups and the favorites bar', async () => {
    for (const refused of REFUSED) {
      const { access, denied } = livePolicy(refused)
      const { widget, container } = mount({ access })
      await settle()
      expect(widget.commands.execute('chart.drawings.favorite', firstTrendTool).kind).toBe('ok')
      expect(favorites(container)).toEqual([firstTrendTool])
      denied.tools.add(firstTrendTool)
      denied.commands.add('chart.drawings.removeAll')
      widget.refreshAccess()
      const remove = toolbar(container).querySelector<HTMLButtonElement>('button[aria-label="Remove drawings"]')
      expectRefused(refused, remove, `${refused}: remove`)
      const favorite = container.querySelector<HTMLButtonElement>(`[data-role="drawing-favorites"] .qc-drawing-favorite[data-tool="${firstTrendTool}"]`)
      expectRefused(refused, favorite, `${refused}: favorite`)
      // The star is kept, whatever the bar draws.
      expect(widget.activeChart().drawingPreferences().favorites.tools).toEqual([firstTrendTool])
      denied.tools.clear()
      denied.commands.clear()
      widget.refreshAccess()
      expect(favorites(container)).toEqual([firstTrendTool])
      expect(drawn(toolbar(container).querySelector('button[aria-label="Remove drawings"]'))).toBe(true)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('re-reads a drawing toolbar flyout that is open', async () => {
    for (const refused of REFUSED) {
      const { access, denied } = livePolicy(refused)
      const { widget, container } = mount({ access })
      await settle()
      groupArrow(container, 'Trend tools').click()
      expect(flyoutRow(secondTrendTool)!.disabled).toBe(false)
      denied.tools.add(secondTrendTool)
      widget.refreshAccess()
      // Still open, its rows built again.
      expect(document.querySelector('.qc-drawing-flyout')).not.toBeNull()
      expectRefused(refused, flyoutRow(secondTrendTool), refused)
      expect(flyoutRow(firstTrendTool)!.disabled).toBe(false)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('re-reads the glyph picker that is open', async () => {
    const { access, denied } = livePolicy('hide')
    const { widget, container } = mount({ access })
    await settle()
    groupArrow(container, 'Emojis & stickers').click()
    const kinds = (): string[] => [...document.querySelectorAll<HTMLElement>('.qc-drawing-glyph-kind')].map((tab) => tab.id.replace(/^.*-kind-/, ''))
    expect(kinds()).toEqual(['emoji', 'sticker', 'icon'])
    denied.tools.add('sticker')
    widget.refreshAccess()
    expect(kinds()).toEqual(['emoji', 'icon'])
  })

  it('re-reads a top-bar menu that is open', async () => {
    for (const refused of REFUSED) {
      const { access, denied } = livePolicy(refused)
      const { widget, container } = mount({ access })
      await settle()
      topButton(container, 'Chart image').click()
      const row = (label: string): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>('.qc-image-menu [role="menuitem"]')].find((b) => b.textContent?.includes(label))
      expect(drawn(row('Copy image'))).toBe(true)
      denied.commands.add('widget.image.copy')
      widget.refreshAccess()
      expect(document.querySelector('.qc-image-menu')).not.toBeNull()
      expectRefused(refused, row('Copy image'), refused)
      expect(drawn(row('Download image'))).toBe(true)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('re-reads the indicator picker that is open', async () => {
    for (const refused of REFUSED) {
      const { access, denied } = livePolicy(refused)
      const { widget } = mount({ access })
      await settle()
      widget.commands.execute('chart.indicators.open')
      const row = (id: string): HTMLButtonElement | null => document.querySelector<HTMLButtonElement>(`.qc-picker-dialog [data-indicator="${id}"]`)
      expect(row('sma')!.disabled).toBe(false)
      denied.indicators.add('sma')
      widget.refreshAccess()
      expectRefused(refused, row('sma'), refused)
      expect(row('ema')!.disabled).toBe(false)
      denied.indicators.clear()
      widget.refreshAccess()
      expect(row('sma')!.disabled).toBe(false)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it("re-reads the legend's row controls", async () => {
    const { access, denied } = livePolicy('hide')
    const { widget, container } = mount({ access })
    await settle()
    const sma = BUILT_IN_INDICATORS.find((definition) => definition.id === 'sma')!
    widget.activeChart().indicators.set([{ id: 'kept', definition: sma }])
    await settle()
    const remove = (): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>('.qc-legend button[aria-label="Remove indicator"]')
    expect(drawn(remove())).toBe(true)
    denied.commands.add('chart.indicators.remove')
    widget.refreshAccess()
    expect(drawn(remove())).toBe(false)
    // The indicator itself stays on the chart.
    expect(widget.activeChart().indicators.get().map((instance) => instance.id)).toEqual(['kept'])
  })

  it('tells registry listeners, so a host control can read commands.available again', async () => {
    const { access, denied } = livePolicy('disable')
    const { widget } = mount({ access })
    await settle()
    const heard: boolean[] = []
    widget.commands.onChange(() => heard.push(widget.commands.available('chart.replay.start')))
    denied.commands.add('chart.replay.start')
    widget.refreshAccess()
    expect(heard).toEqual([false])
  })

  it('changes nothing stored and nothing on the chart', async () => {
    const storage = memoryChartStorage()
    const { access, denied } = livePolicy('hide')
    const { widget } = mount({ access, storage })
    await settle()
    const sma = BUILT_IN_INDICATORS.find((definition) => definition.id === 'sma')!
    widget.activeChart().indicators.set([{ id: 'kept', definition: sma }])
    expect(widget.commands.execute('chart.drawings.favorite', firstTrendTool).kind).toBe('ok')
    await settle()
    // Past the debounce of the writes above, so a save-needed heard below is the refresh's own.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const saved = new Map(storage.keys().map((key) => [key, storage.get(key)]))
    const indicators = widget.activeChart().indicators.get().map((instance) => instance.id)
    const drawings = widget.activeChart().drawings!.export()
    let saveNeeded = 0
    widget.on('saveNeeded', () => saveNeeded++)
    denied.tools.add(firstTrendTool)
    denied.indicators.add('sma')
    denied.commands.add('chart.replay.start')
    widget.refreshAccess()
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(new Map(storage.keys().map((key) => [key, storage.get(key)]))).toEqual(saved)
    expect(widget.activeChart().indicators.get().map((instance) => instance.id)).toEqual(indicators)
    expect(widget.activeChart().drawings!.export()).toEqual(drawings)
    expect(saveNeeded).toBe(0)
  })

  it('is inert after dispose', async () => {
    const { widget } = mount({ access: { refused: 'hide' } })
    await settle()
    widget.dispose()
    expect(() => widget.refreshAccess()).not.toThrow()
  })
})
