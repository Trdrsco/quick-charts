// @vitest-environment happy-dom
// The drawing tools a host offers, on a widget mounted the way a host mounts it. A tool the list
// leaves out is absent wherever a tool is chosen and refused by every door that would arm it or copy
// a drawing of it into a new one. Drawings of it already on the chart stay whole: they render,
// select, edit, lock and delete from every surface. The eraser is always offered, nothing the
// viewer stored is rewritten, and the list composes with the access policy.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { buildRailGroups, DEFAULT_DRAWING_PREFERENCES, drawingTools, type DrawingPreferences } from '../../src/drawings/index'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartWidgetOptions } from '../../src/widget/options'
import { drag } from '../drawings/fakeChart'
import { rig, type Rig } from '../drawings/layerRig'

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
const rigs: Rig[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  for (const r of rigs.splice(0)) r.handle.destroy()
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

const prefs = (patch: Partial<DrawingPreferences>): Partial<ChartWidgetOptions> => ({ preferences: { drawings: { ...DEFAULT_DRAWING_PREFERENCES, ...patch } } })

const groups = buildRailGroups()
const trend = groups.find((group) => group.id === 'trend')!
const lines = trend.sections.find((section) => section.label === 'drawing.sectionLines')!.tools.map((tool) => tool.type)
const channels = trend.sections.find((section) => section.label === 'drawing.sectionChannels')!.tools.map((tool) => tool.type)

const GROUP_LABELS = ['Trend tools', 'Fibonacci & Gann', 'Patterns', 'Forecast & measure', 'Shapes', 'Text & notes', 'Emojis & stickers']

const rail = (container: HTMLElement): HTMLElement => container.querySelector<HTMLElement>('.qc-drawing-toolbar-column')!
const railButton = (container: HTMLElement, label: string): HTMLButtonElement | null => rail(container).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const groupArrow = (container: HTMLElement, label: string): HTMLButtonElement => railButton(container, `${label} menu`)!
const groupFace = (container: HTMLElement, label: string): HTMLButtonElement => groupArrow(container, label).closest('.qc-drawing-cell')!.querySelector<HTMLButtonElement>('.qc-drawing-rail-button')!
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
const favorites = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('[data-role="drawing-favorites"] .qc-drawing-favorite')].filter((b) => drawn(b)).map((b) => b.dataset.tool!)
const settingsBar = (): HTMLElement => document.querySelector<HTMLElement>('[data-role="drawing-settings-bar"]')!
const barButton = (label: string): HTMLButtonElement | undefined => [...settingsBar().querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label)

/** A drawing already on the chart, as a saved chart or another host leaves one, selected. */
async function placed(widget: ChartWidget, type: string, id: string): Promise<void> {
  const drawing = drawingTools.create(type, id, [{ time: bars[10]!.t as never, price: 110 }, { time: bars[30]!.t as never, price: 130 }])!
  const api = widget.activeChart().drawings!
  api.restore([...api.export(), drawing.toJSON()])
  api.select(id)
  await settle()
}

describe('drawingTools: setup', () => {
  it('is a setup error for an empty list, a type that names no tool and a repeated type', () => {
    expect(() => mount({ drawingTools: [] })).toThrow(TypeError)
    expect(() => mount({ drawingTools: ['trend_line', 'no_such_tool'] })).toThrow(/no_such_tool/)
    expect(() => mount({ drawingTools: ['trend_line', 'trend_line'] })).toThrow(/more than once/)
    expect(() => mount({ drawingTools: 'trend_line' as never })).toThrow(TypeError)
    expect(() => mount({ drawingTools: [3 as never] })).toThrow(TypeError)
    // Checked even with the drawing layer off: a list the host got wrong is wrong either way.
    expect(() => mount({ drawingTools: [], features: { drawings: false } })).toThrow(TypeError)
  })

  it('takes every registered type and the transient tools, and a list of utilities alone', () => {
    expect(() => mount({ drawingTools: drawingTools.all().map((tool) => tool.type) })).not.toThrow()
    for (const list of [['eraser'], ['measure'], ['zoom'], ['eraser', 'zoom']]) expect(() => mount({ drawingTools: list }), list.join()).not.toThrow()
  })

  it('offers every tool when omitted, as before', async () => {
    const { widget, container } = mount()
    await settle()
    expect(flyout(container, 'Trend tools').tools).toEqual(trend.sections.flatMap((section) => section.tools.map((tool) => tool.type)))
    expect(drawn(railButton(container, 'Measure'))).toBe(true)
    expect(widget.commands.execute('chart.drawings.arm', 'rectangle').kind).toBe('ok')
  })
})

describe('a tool left out is absent where a tool is chosen', () => {
  it('leaves it out of its flyout, a section it empties, and every group it empties', async () => {
    const { container } = mount({ drawingTools: [lines[0]!, channels[1]!] })
    await settle()
    const read = flyout(container, 'Trend tools')
    expect(read.tools).toEqual([lines[0], channels[1]])
    expect(read.sections).toEqual(['Lines', 'Channels'])
    expect(read.disabled).toEqual([])
    for (const label of GROUP_LABELS.filter((label) => label !== 'Trend tools')) expect(drawn(groupArrow(container, label)), label).toBe(false)
    // Measure and zoom are tools of the list; the eraser is always offered.
    expect(drawn(railButton(container, 'Measure'))).toBe(false)
    expect(drawn(railButton(container, 'Zoom in'))).toBe(false)
    railButton(container, 'Cursor menu')!.click()
    expect([...document.querySelectorAll('[role="menuitemradio"]')].map((row) => row.textContent)).toContain('Eraser')
  })

  it('puts the first offered tool on a group face whose remembered tool is left out, and keeps the memory', async () => {
    const { widget, container } = mount({ drawingTools: [channels[0]!, channels[1]!], ...prefs({ railTools: { trend: lines[0]! } }) })
    await settle()
    const first = drawingTools.get(channels[0]!)!.name
    expect(groupFace(container, 'Trend tools').getAttribute('aria-label')).toBe(first)
    expect(widget.activeChart().drawingPreferences().railTools).toEqual({ trend: lines[0] })
  })

  it('leaves a starred tool off the favorites bar and keeps its star', async () => {
    const starred = [lines[0]!, channels[0]!]
    const { widget, container } = mount({ drawingTools: [channels[0]!], ...prefs({ favorites: { tools: starred, visible: true, position: null } }) })
    await settle()
    expect(favorites(container)).toEqual([channels[0]])
    expect(widget.activeChart().drawingPreferences().favorites.tools).toEqual(starred)
  })

  it('hides the favorites bar when it leaves every starred tool out', async () => {
    const { container } = mount({ drawingTools: ['rectangle'], ...prefs({ favorites: { tools: [lines[0]!], visible: true, position: null } }) })
    await settle()
    expect(container.querySelector<HTMLElement>('[data-role="drawing-favorites"]')!.hidden).toBe(true)
  })

  it('maps each glyph kind to its tool: a kind left out has no tab, and the group goes with all three', async () => {
    const { container } = mount({ drawingTools: ['emoji', 'icon'] })
    await settle()
    groupArrow(container, 'Emojis & stickers').click()
    const kinds = [...document.querySelectorAll<HTMLElement>('.qc-drawing-glyph-kind')].map((tab) => tab.id.replace(/^.*-kind-/, ''))
    expect(kinds).toEqual(['emoji', 'icon'])
    document.body.replaceChildren()
    const none = mount({ drawingTools: ['rectangle'] })
    await settle()
    expect(drawn(groupArrow(none.container, 'Emojis & stickers'))).toBe(false)
  })

  it('offers nothing that creates with the eraser alone, and keeps the rail for removing', async () => {
    const { widget, container } = mount({ drawingTools: ['eraser'] })
    await settle()
    for (const label of GROUP_LABELS) expect(drawn(groupArrow(container, label)), label).toBe(false)
    expect(drawn(railButton(container, 'Measure'))).toBe(false)
    expect(drawn(railButton(container, 'Remove drawings'))).toBe(true)
    expect(drawn(railButton(container, 'Remove menu'))).toBe(true)
    expect(widget.commands.execute('chart.drawings.arm', 'eraser').kind).toBe('ok')
    expect(widget.activeChart().drawings!.activeTool()).toBe('eraser')
  })
})

describe('a tool left out is refused by every door that would arm it', () => {
  it('denies the arm command, and the handle arms nothing', async () => {
    const { widget } = mount({ drawingTools: ['rectangle'] })
    await settle()
    expect(widget.commands.execute('chart.drawings.arm', 'trend_line').kind).toBe('denied')
    expect(widget.commands.execute('chart.drawings.arm', { tool: 'emoji', props: { glyph: 'x' } }).kind).toBe('denied')
    expect(widget.commands.execute('chart.drawings.arm', 'measure').kind).toBe('denied')
    const api = widget.activeChart().drawings!
    api.armTool('trend_line')
    expect(api.activeTool()).toBeNull()
    expect(widget.commands.execute('chart.drawings.arm', 'rectangle').kind).toBe('ok')
    expect(api.activeTool()).toBe('rectangle')
  })

  it('places no image when the image tool is left out', async () => {
    const assets = { intakeImage: async () => ({ ok: false as const, error: 'unreadable' as const }) }
    const { widget } = mount({ drawingTools: ['rectangle'], assets })
    await settle()
    expect(widget.commands.available('chart.drawings.placeImage')).toBe(false)
    const api = widget.activeChart().drawings!
    api.placeImage({ dataUrl: 'data:image/png;base64,AAAA', width: 10, height: 10 } as never)
    expect(api.count()).toBe(0)
  })
})

describe('drawings of a tool left out stay whole', () => {
  it('select, edit, lock, hide and delete from the settings bar', async () => {
    const { widget } = mount({ drawingTools: ['rectangle'] })
    await settle()
    await placed(widget, 'trend_line', 'kept')
    const api = widget.activeChart().drawings!
    expect(api.selected()?.type).toBe('trend_line')
    expect(settingsBar().hidden).toBe(false)
    expect(drawn(barButton('Drawing settings')!)).toBe(true)
    expect(widget.commands.execute('chart.drawings.style', { lineWidth: 4 }).kind).toBe('ok')
    expect(api.selected()?.lineWidth).toBe(4)
    expect(widget.commands.execute('chart.drawings.lock', true).kind).toBe('ok')
    expect(api.selected()?.locked).toBe(true)
    expect(widget.commands.execute('chart.drawings.lock', false).kind).toBe('ok')
    expect(widget.commands.execute('chart.drawings.settings').kind).toBe('ok')
    await settle()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    dialog.querySelector<HTMLButtonElement>('button[aria-label="Cancel"]')!.click()
    await settle()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(widget.commands.execute('chart.drawings.hideSelected').kind).toBe('ok')
    expect(api.hasSelection()).toBe(false)
    api.select('kept')
    await settle()
    const remove = barButton('Delete drawing')!
    expect(drawn(remove)).toBe(true)
    expect(remove.disabled).toBe(false)
    remove.click()
    await settle()
    expect(api.count()).toBe(0)
  })

  it('delete with the Delete key, the remove menu and the eraser command', async () => {
    const { widget, container } = mount({ drawingTools: ['rectangle'] })
    await settle()
    await placed(widget, 'trend_line', 'one')
    const api = widget.activeChart().drawings!
    container.querySelector<HTMLElement>('.qc-gestures')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }))
    await settle()
    expect(api.count()).toBe(0)

    await placed(widget, 'trend_line', 'two')
    railButton(container, 'Remove menu')!.click()
    const row = [...document.querySelectorAll<HTMLButtonElement>('.qc-drawing-menu [role="menuitem"]')].find((b) => /drawing/i.test(b.textContent ?? ''))!
    expect(row.disabled).toBe(false)
    row.click()
    await settle()
    expect(api.count()).toBe(0)

    await placed(widget, 'trend_line', 'three')
    expect(drawn(railButton(container, 'Remove drawings'))).toBe(true)
    expect(widget.commands.execute('chart.drawings.arm', 'eraser').kind).toBe('ok')
    expect(widget.commands.execute('chart.drawings.removeAll').kind).toBe('ok')
    expect(api.count()).toBe(0)
  })

  it('refuses a clone or a paste of one, and copies one the list offers', async () => {
    const { widget } = mount({ drawingTools: ['rectangle'] })
    await settle()
    const api = widget.activeChart().drawings!
    await placed(widget, 'trend_line', 'out')
    expect(widget.commands.available('chart.drawings.clone')).toBe(false)
    expect(widget.commands.execute('chart.drawings.clone').kind).toBe('unavailable')
    api.clone()
    expect(api.count()).toBe(1)
    // Copying is not creating: the clipboard takes it, for a chart that offers its tool.
    expect(widget.commands.execute('chart.drawings.copy').kind).toBe('ok')
    expect(widget.commands.available('chart.drawings.paste')).toBe(false)
    expect(api.paste()).toBe(false)
    expect(api.count()).toBe(1)
    // The More menu's Clone row says so.
    settingsBar().querySelector<HTMLButtonElement>("[data-qc-control='more']")!.click()
    const clone = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) => b.textContent?.startsWith('Clone'))!
    expect(clone.disabled).toBe(true)

    await placed(widget, 'rectangle', 'in')
    expect(widget.commands.execute('chart.drawings.clone').kind).toBe('ok')
    expect(api.count()).toBe(3)
    expect(widget.commands.execute('chart.drawings.copy').kind).toBe('ok')
    expect(widget.commands.execute('chart.drawings.paste').kind).toBe('ok')
    expect(api.count()).toBe(4)
  })
})

describe('the list and the access policy', () => {
  it('offers a tool only when listed and permitted, and draws a listed refusal as refused says', async () => {
    const drawingTool = (tool: string): boolean => tool !== channels[0]
    for (const refused of ['disable', 'hide'] as const) {
      const { widget, container } = mount({ drawingTools: [lines[0]!, channels[0]!], access: { refused, drawingTool } })
      await settle()
      const read = flyout(container, 'Trend tools')
      expect(read.tools, refused).toEqual(refused === 'hide' ? [lines[0]] : [lines[0], channels[0]])
      expect(read.disabled, refused).toEqual(refused === 'hide' ? [] : [channels[0]])
      // A tool the policy permits but the list leaves out is absent under either value.
      expect(read.tools).not.toContain(lines[1])
      expect(widget.commands.execute('chart.drawings.arm', channels[0]).kind).toBe('denied')
      expect(widget.commands.execute('chart.drawings.arm', lines[1]).kind).toBe('denied')
      expect(widget.commands.execute('chart.drawings.arm', lines[0]).kind).toBe('ok')
      document.body.replaceChildren()
    }
  })

  it('removes everything with the drawing layer off, whatever the list says', async () => {
    const { widget, container } = mount({ drawingTools: ['rectangle'], features: { drawings: false } })
    await settle()
    expect(container.querySelector('[data-role="drawing-toolbar"]')).toBeNull()
    expect(widget.activeChart().drawings).toBeNull()
  })
})

describe('the layer refuses a copy by type', () => {
  it('moves the drawing on a modifier-drag rather than duplicating one it may not copy', () => {
    const r = rig({ copies: (type) => type !== 'rectangle' })
    rigs.push(r)
    r.handle.armTool('rectangle')
    drag(r.container, [10, 10], [100, 100])
    expect(r.handle.count()).toBe(1)
    const before = r.handle.export()[0]!.anchors
    drag(r.container, [10, 55], [110, 55], { ctrlKey: true })
    expect(r.handle.count()).toBe(1)
    expect(r.handle.export()[0]!.anchors).not.toEqual(before)
    r.handle.clone()
    expect(r.handle.count()).toBe(1)
    r.handle.copy()
    expect(r.handle.canPaste()).toBe(false)
    expect(r.handle.paste()).toBe(false)

    const free = rig()
    rigs.push(free)
    free.handle.armTool('rectangle')
    drag(free.container, [10, 10], [100, 100])
    drag(free.container, [10, 55], [110, 55], { ctrlKey: true })
    expect(free.handle.count()).toBe(2)
  })
})
