// @vitest-environment happy-dom
// What a host's access policy refuses, presented the way the host asks: drawn disabled (the
// default, an offer the viewer can unlock) or left out (`access.refused: 'hide'`, something the host
// does not offer). On a widget mounted the way a host mounts it. Only a refusal hides: a permitted
// command that cannot run now is still drawn disabled. The predicates are asked whenever the chrome
// syncs, so a policy that changes moves the controls with it, and nothing the viewer stored is
// rewritten because a control is not drawn. Every other door refuses exactly as it does by default.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { buildRailGroups } from '../../src/drawings/index'
import { createChartI18n } from '../../src/i18n'
import { mountMenu } from '../../src/contextMenuUi'
import { createIconDiagnostics } from '../../src/ui/icons/draw'
import { createIconResolver } from '../../src/ui/icons/resolver'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { AccessPolicy, ChartWidgetOptions } from '../../src/widget/options'

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

/** A policy whose refusals the test can change while the widget is up, the way a host's policy
 *  follows its own session. */
function livePolicy(refused: 'disable' | 'hide' | undefined, start: { commands?: string[]; tools?: string[]; indicators?: string[] } = {}) {
  const denied = { commands: new Set(start.commands ?? []), tools: new Set(start.tools ?? []), indicators: new Set(start.indicators ?? []) }
  const access: AccessPolicy = {
    ...(refused ? { refused } : {}),
    command: (id) => !denied.commands.has(id),
    drawingTool: (id) => !denied.tools.has(id),
    indicator: (id) => !denied.indicators.has(id),
  }
  return { access, denied }
}

/** The registry tells every listener when the registered set moves, which is one of the paths the
 *  chrome syncs on. A host whose session changed has its own reasons to register; this stands in. */
const nudge = (widget: ChartWidget): void => {
  widget.commands.register({ id: `host.nudge.${Math.random()}`, scope: 'widget', label: 'command.historyUndo', labelText: 'Nudge', available: () => true, execute: () => undefined })
}

const groups = buildRailGroups()
const trend = groups.find((group) => group.id === 'trend')!
const channels = trend.sections.find((section) => section.label === 'drawing.sectionChannels')!.tools.map((tool) => tool.type)
const firstTrendTool = trend.sections[0]!.tools[0]!.type
const shapes = groups.find((group) => group.id === 'shapes')!
const allShapes = shapes.sections.flatMap((section) => section.tools.map((tool) => tool.type))

const rail = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.qc-drawing-toolbar-column')!
const groupArrow = (container: HTMLElement, label: string): HTMLButtonElement => rail(container).querySelector<HTMLButtonElement>(`button[aria-label="${label} menu"]`)!
/** Open a group's flyout and read its section headings and its tool rows. */
const flyout = (container: HTMLElement, label: string): { sections: string[]; tools: string[]; disabled: string[] } => {
  groupArrow(container, label).click()
  const list = document.querySelector<HTMLElement>('.qc-drawing-flyout')!
  const read = {
    sections: [...list.querySelectorAll('.qc-dialog-heading')].map((heading) => heading.textContent ?? ''),
    tools: [...list.querySelectorAll<HTMLButtonElement>('[data-tool]')].map((row) => row.dataset.tool!),
    disabled: [...list.querySelectorAll<HTMLButtonElement>('[data-tool]')].filter((row) => row.disabled).map((row) => row.dataset.tool!),
  }
  groupArrow(container, label).click()
  return read
}
/** Whether a control is drawn: present and inside nothing hidden. */
const drawn = (element: Element | null): boolean => !!element && !element.closest('[hidden]')
const topButton = (container: HTMLElement, label: string): HTMLButtonElement | null => container.querySelector<HTMLButtonElement>(`.qc-topbar button[aria-label="${label}"]`)

describe('access.refused', () => {
  it('is a setup error unless it is disable or hide', () => {
    for (const refused of ['nope', 1, true, null, {}]) {
      expect(() => mount({ access: { refused: refused as never } }), String(refused)).toThrow(TypeError)
    }
    expect(() => mount({ access: { refused: 'disable' } })).not.toThrow()
    expect(() => mount({ access: { refused: 'hide' } })).not.toThrow()
  })

  it('draws a refused tool disabled by default, and with disable, as before', async () => {
    for (const refused of [undefined, 'disable'] as const) {
      const { access } = livePolicy(refused, { tools: [channels[0]!] })
      const { container } = mount({ access })
      await settle()
      const read = flyout(container, 'Trend tools')
      expect(read.tools).toContain(channels[0])
      expect(read.disabled).toEqual([channels[0]])
      document.body.replaceChildren()
    }
  })
})

describe("drawing tools under refused: 'hide'", () => {
  it('leaves a refused tool out of its flyout, and a section it empties', async () => {
    const { access } = livePolicy('hide', { tools: [...channels, firstTrendTool] })
    const { container } = mount({ access })
    await settle()
    const read = flyout(container, 'Trend tools')
    expect(read.sections).not.toContain('Channels')
    for (const tool of [...channels, firstTrendTool]) expect(read.tools).not.toContain(tool)
    expect(read.disabled).toEqual([])
    // The group's face wears the first tool it still offers.
    const face = groupArrow(container, 'Trend tools').closest('.qc-drawing-cell')!.querySelector<HTMLButtonElement>('.qc-drawing-rail-button')!
    groupArrow(container, 'Trend tools').click()
    const first = document.querySelector('.qc-drawing-flyout [data-tool] .qc-menu-label')!.textContent
    groupArrow(container, 'Trend tools').click()
    expect(face.getAttribute('aria-label')).toBe(first)
  })

  it('leaves out a group it empties, and the rule beside it stays tidy', async () => {
    const { access } = livePolicy('hide', { tools: allShapes })
    const { container } = mount({ access })
    await settle()
    expect(groupArrow(container, 'Shapes')).not.toBeNull()
    expect(drawn(groupArrow(container, 'Shapes'))).toBe(false)
    expect(drawn(groupArrow(container, 'Trend tools'))).toBe(true)
  })

  it('keeps a refused favorite starred: the bar leaves it out, and draws it again once permitted', async () => {
    const { access, denied } = livePolicy('hide')
    const { widget, container } = mount({ access })
    await settle()
    expect(widget.commands.execute('chart.drawings.favorite', firstTrendTool).kind).toBe('ok')
    expect(widget.commands.execute('chart.drawings.favorite', channels[0]).kind).toBe('ok')
    const favorites = (): string[] => [...container.querySelectorAll<HTMLElement>('[data-role="drawing-favorites"] .qc-drawing-favorite')].map((b) => b.dataset.tool!)
    expect(favorites()).toEqual([firstTrendTool, channels[0]])
    denied.tools.add(firstTrendTool)
    nudge(widget)
    await settle()
    expect(favorites()).toEqual([channels[0]])
    denied.tools.add(channels[0]!)
    nudge(widget)
    await settle()
    // Nothing left to draw: the bar goes, its stars kept.
    expect(container.querySelector<HTMLElement>('[data-role="drawing-favorites"]')!.hidden).toBe(true)
    denied.tools.clear()
    nudge(widget)
    await settle()
    expect(favorites()).toEqual([firstTrendTool, channels[0]])
  })

  it('leaves a refused glyph kind out of the picker', async () => {
    const { access } = livePolicy('hide', { tools: ['sticker'] })
    const { container } = mount({ access })
    await settle()
    groupArrow(container, 'Emojis & stickers').click()
    const kinds = [...document.querySelectorAll<HTMLElement>('.qc-drawing-glyph-kind')].map((tab) => tab.id.replace(/^.*-kind-/, ''))
    expect(kinds).toEqual(['emoji', 'icon'])
  })

  it('refuses from every other door exactly as before', async () => {
    const { access } = livePolicy('hide', { tools: [firstTrendTool] })
    const { widget } = mount({ access })
    await settle()
    expect(widget.commands.execute('chart.drawings.arm', firstTrendTool).kind).toBe('denied')
    expect(widget.activeChart().drawings!.activeTool()).toBeNull()
  })
})

describe("indicators under refused: 'hide'", () => {
  it('leaves a refused definition out of the browser, where disable draws it disabled', async () => {
    for (const refused of ['disable', 'hide'] as const) {
      const { access } = livePolicy(refused, { indicators: ['sma'] })
      const { widget } = mount({ access })
      await settle()
      widget.commands.execute('chart.indicators.open')
      const row = document.querySelector<HTMLButtonElement>('.qc-picker-dialog [data-indicator="sma"]')
      if (refused === 'disable') expect(row?.disabled).toBe(true)
      else expect(row).toBeNull()
      expect(document.querySelector('.qc-picker-dialog [data-indicator="ema"]')).not.toBeNull()
      expect(widget.commands.execute('chart.indicators.add', { id: 'x', definition: { manifest: { id: 'sma', pane: 'overlay', plots: {} }, compute: () => ({}) } }).kind).toBe('ok')
      expect(widget.activeChart().indicators.get().some((instance) => instance.id === 'x')).toBe(false)
      widget.dispose()
      document.body.replaceChildren()
    }
  })

  it('keeps an indicator already on the chart as it keeps it under disable', async () => {
    const readings: unknown[] = []
    for (const refused of ['disable', 'hide'] as const) {
      const { widget } = mount({ access: { refused, indicator: (id) => id !== 'sma' } })
      await settle()
      const { BUILT_IN_INDICATORS } = await import('../../src/builtInIndicators')
      const sma = BUILT_IN_INDICATORS.find((definition) => definition.id === 'sma')!
      widget.activeChart().indicators.set([{ id: 'kept', definition: sma }])
      readings.push(widget.activeChart().indicators.get().map((instance) => instance.id))
      widget.dispose()
    }
    expect(readings[1]).toEqual(readings[0])
  })
})

describe("command controls under refused: 'hide'", () => {
  it('leaves out a control whose command is refused, and keeps one that merely cannot run now', async () => {
    const { access } = livePolicy('hide', { commands: ['chart.replay.start', 'chart.history.redo', 'widget.image.copy', 'chart.style.bars'] })
    const { widget, container } = mount({ access })
    await settle()
    expect(drawn(topButton(container, 'Bar replay'))).toBe(false)
    // Redo is refused and goes; undo is permitted with nothing to undo, so it stays, disabled.
    const undo = topButton(container, 'Undo')!
    expect(drawn(undo)).toBe(true)
    expect(undo.disabled).toBe(true)
    expect([...container.querySelectorAll<HTMLButtonElement>('.qc-topbar button')].some((b) => b.getAttribute('aria-label') === 'Redo' && drawn(b))).toBe(false)
    // The image menu leaves out Copy image.
    topButton(container, 'Chart image')!.click()
    const imageRows = [...document.querySelectorAll('.qc-image-menu .qc-menu-label')].map((label) => label.textContent)
    expect(imageRows).toContain('Download image')
    expect(imageRows).not.toContain('Copy image')
    document.querySelector('.qc-image-menu')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    // The style menu leaves out the refused style.
    container.querySelector<HTMLButtonElement>('.qc-topbar button[aria-label^="Chart style"]')!.click()
    const styleRows = [...document.querySelectorAll('.qc-style-menu .qc-menu-label')].map((label) => label.textContent)
    expect(styleRows).toContain('Candles')
    expect(styleRows).not.toContain('Bars')
    // A refused command still answers denied from every door.
    expect(widget.commands.execute('chart.replay.start').kind).toBe('denied')
  })

  it('keeps a state-unavailable rail control drawn and disabled', async () => {
    const { access } = livePolicy('hide')
    const { container } = mount({ access })
    await settle()
    const remove = rail(container).querySelector<HTMLButtonElement>('button[aria-label="Remove drawings"]')!
    expect(drawn(remove)).toBe(true)
    expect(remove.disabled).toBe(true)
  })

  it('follows a policy that changes, on the paths that sync the chrome', async () => {
    const { access, denied } = livePolicy('hide')
    const { widget, container } = mount({ access })
    await settle()
    expect(drawn(topButton(container, 'Bar replay'))).toBe(true)
    expect(drawn(rail(container).querySelector('button[aria-label="Remove drawings"]'))).toBe(true)
    denied.commands.add('chart.replay.start')
    denied.commands.add('chart.drawings.removeAll')
    nudge(widget)
    await settle()
    expect(drawn(topButton(container, 'Bar replay'))).toBe(false)
    expect(drawn(rail(container).querySelector('button[aria-label="Remove drawings"]'))).toBe(false)
    denied.commands.clear()
    widget.activeChart().setTimeframe('5m')
    await settle()
    expect(drawn(topButton(container, 'Bar replay'))).toBe(true)
  })

  it('leaves the rule beside an emptied top-bar group out', async () => {
    const { access } = livePolicy('hide', { commands: ['chart.history.undo', 'chart.history.redo'] })
    const { container } = mount({ access })
    await settle()
    const start = container.querySelector<HTMLElement>('.qc-topbar-start')!
    const children = [...start.children] as HTMLElement[]
    const shown = children.filter((child) => !child.hidden && (!child.classList.contains('qc-topbar-slot') || child.childElementCount > 0))
    expect(shown[shown.length - 1]!.classList.contains('qc-separator')).toBe(false)
  })

  it('leaves a refused row out of the level menu', () => {
    const host = document.body.appendChild(document.createElement('div'))
    const strings = createChartI18n()
    const icons = createIconResolver({ document, direction: () => 'ltr', diagnostics: createIconDiagnostics() })
    const menu = mountMenu(host, () => undefined, strings, icons, (id) => id !== 'reset-view')
    menu.open({ clientX: 20, clientY: 20 }, { priceText: '1', symbol: 'ES', indicatorCount: 0, drawingCount: 0 })
    const labels = [...host.querySelectorAll('.qc-menu-row .qc-menu-label')].map((label) => label.textContent)
    expect(labels).not.toContain('Reset chart view')
    expect(labels[0]).toBe('Copy price 1')
    expect(host.querySelector('.qc-menu')!.firstElementChild!.classList.contains('qc-menu-row')).toBe(true)
    menu.destroy()
  })
})
