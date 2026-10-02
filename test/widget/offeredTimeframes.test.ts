// @vitest-environment happy-dom
// The timeframes a host offers, on a widget mounted the way a host mounts it. A host that names no
// list gets every preset and custom timeframes; a list it names is the whole set its charts can be
// on, so a preset left out has no command, the setters ignore a token left out, the picker shows
// only the list, and a saved layout or a stored preference that names another token opens on the
// smallest listed one. `customTimeframes: false` offers the presets alone. A list, a switch or an
// opening timeframe the host got wrong is a setup error from createChart.
// lightweight-charts paints into canvases happy-dom cannot draw, so the 2D context is a recording
// stub; nothing here reads a pixel.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { memoryChartStorage } from '../../src/storage'
import { TIMEFRAME_PRESET_TOKENS } from '../../src/timeframe'
import type { ChartWidgetOptions } from '../../src/widget/options'
import { offeredTimeframe, rangeTimeframe, resolveOfferedTimeframes } from '../../src/widget/timeframes'

beforeAll(() => {
  const written: Record<PropertyKey, unknown> = {}
  const context = new Proxy({} as Record<PropertyKey, unknown>, {
    get: (_target, key) => {
      if (key in written) return written[key]
      if (key === 'measureText') return () => ({ width: 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      if (key === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) })
      if (key === 'canvas') return document.createElement('canvas')
      return () => undefined
    },
    set: (_target, key, value) => {
      written[key] = value
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as HTMLCanvasElement['getContext']
  // The renderer normalizes a color by reading it back from a computed style, which happy-dom does
  // not resolve to rgb(); the reading resolves a hex or named color the way a browser would.
  const NAMED: Record<string, string> = { white: 'rgb(255, 255, 255)', black: 'rgb(0, 0, 0)', transparent: 'rgba(0, 0, 0, 0)' }
  const rgbOf = (raw: string): string | null => {
    if (raw.startsWith('rgb')) return raw
    if (NAMED[raw]) return NAMED[raw]!
    const hex = raw.match(/^#([0-9a-f]{3,8})$/i)?.[1]
    if (!hex) return null
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16)
    return full.length === 8 ? 'rgba(' + n(0) + ', ' + n(2) + ', ' + n(4) + ', ' + n(6) / 255 + ')' : 'rgb(' + n(0) + ', ' + n(2) + ', ' + n(4) + ')'
  }
  const computed = window.getComputedStyle.bind(window)
  window.getComputedStyle = ((element: Element, pseudo?: string | null) => {
    const style = computed(element, pseudo)
    const rgb = rgbOf((element as HTMLElement).style?.color ?? '')
    return rgb ? new Proxy(style, { get: (target, key) => (key === 'color' ? rgb : Reflect.get(target, key)) }) : style
  }) as typeof window.getComputedStyle
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})

const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100.5, v: 10 })
// A feed that declares no resolutions, so every restriction seen here is the host's own.
const datafeed: ChartDatafeed = {
  config: async () => ({}) as never,
  search: async () => ({ items: [], total: 0 }) as never,
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: [], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 20 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }) as never,
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.dispose()
  document.body.replaceChildren()
})

function mount(options: Partial<ChartWidgetOptions> = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const widget = createChart({ container, datafeed, symbol: 'ES', ...options })
  mounted.push(widget)
  return { widget, container }
}

const presetCommands = (widget: ReturnType<typeof createChart>): string[] =>
  widget.commands.list().map((spec) => spec.id).filter((id) => id.startsWith('chart.timeframe.') && id !== 'chart.timeframe.set')

const chipTexts = (container: HTMLElement): string[] => [...container.querySelectorAll('.qc-tf-chip')].map((chip) => chip.textContent ?? '')

const openList = (container: HTMLElement): HTMLElement => {
  container.querySelector<HTMLButtonElement>('.qc-tf-caret')!.click()
  return document.querySelector<HTMLElement>('.qc-tf-menu')!
}

const rowTexts = (menu: HTMLElement): string[] => [...menu.querySelectorAll('[role="menuitemradio"]')].map((row) => row.textContent ?? '')

const rowOf = (menu: HTMLElement, text: string): HTMLElement => [...menu.querySelectorAll<HTMLElement>('.qc-tf-row')].find((row) => row.textContent === text)!

describe('the timeframes a widget offers', () => {
  it('are every preset and custom timeframes when the host names none', () => {
    const { widget, container } = mount({ timeframe: '1m' })
    expect(presetCommands(widget)).toHaveLength(26)
    const menu = openList(container)
    expect(rowTexts(menu)).toHaveLength(26)
    expect(menu.querySelectorAll('.qc-tf-group')).toHaveLength(5)
    expect(menu.querySelector('.qc-tf-composer')).not.toBeNull()
    widget.activeChart().setTimeframe('7m')
    expect(widget.activeChart().timeframe()).toBe('7m')
  })

  it('are the list the host names: commands, chips and rows follow it, smallest first in their groups', () => {
    const { widget, container } = mount({ timeframes: ['1d', '1h', '5m', '2m'], timeframe: '5m' })
    expect(presetCommands(widget)).toEqual(['chart.timeframe.5m', 'chart.timeframe.1h', 'chart.timeframe.1d'])
    expect(widget.activeChart().timeframe()).toBe('5m')
    // The first-run chips the list keeps.
    expect(chipTexts(container)).toEqual(['5m', '1h', 'D'])
    const menu = openList(container)
    expect([...menu.querySelectorAll('.qc-tf-group')].map((group) => group.textContent)).toEqual(['Minutes', 'Hours', 'Days'])
    expect(rowTexts(menu)).toEqual(['2 Minutes', '5 Minutes', '1 Hour', '1 Day'])
    // A listed token beyond the presets is a row of its group with a star and no delete, and the
    // list has no composer.
    expect([...rowOf(menu, '2 Minutes').querySelectorAll('.qc-tf-side')].map((side) => side.getAttribute('aria-label'))).toEqual(['Save 2 Minutes'])
    expect(document.querySelector('.qc-tf-composer')).toBeNull()
    expect(widget.commands.execute('chart.timeframe.15m').kind).toBe('unknown')
    widget.commands.execute('chart.timeframe.set', '15m')
    expect(widget.activeChart().timeframe()).toBe('5m')
    widget.commands.execute('chart.timeframe.set', '2m')
    expect(widget.activeChart().timeframe()).toBe('2m')
  })

  it('make setTimeframe ignore a timeframe the widget does not offer', () => {
    const { widget } = mount({ timeframes: ['5m', '1h'] })
    const chart = widget.activeChart()
    expect(chart.timeframe()).toBe('5m')
    chart.setTimeframe('1m')
    expect(chart.timeframe()).toBe('5m')
    chart.setTimeframe('1h')
    expect(chart.timeframe()).toBe('1h')
  })

  it('seed the chips from the smallest five listed when the list leaves none saved, and keep the stored chips', () => {
    const storage = memoryChartStorage({ 'quickcharts.savedTf.v1': JSON.stringify(['1m', '1d']) })
    const { container } = mount({ timeframes: ['2m', '10m', '2h', '6h', '2d', '3d', '1w'], storage })
    expect(chipTexts(container)).toEqual(['2m', '10m', '2h', '6h', '2D'])
    expect(storage.get('quickcharts.savedTf.v1')).toBe(JSON.stringify(['1m', '1d']))
    // Starring makes the shown chips the saved ones and keeps the tokens this chart does not offer.
    const menu = openList(container)
    rowOf(menu, '1 Week').querySelector<HTMLButtonElement>('.qc-tf-side')!.click()
    expect(chipTexts(container)).toEqual(['2m', '10m', '2h', '6h', '2D', 'W'])
    expect(JSON.parse(storage.get('quickcharts.savedTf.v1')!)).toEqual(['1m', '1d', '2m', '10m', '2h', '6h', '2d', '1w'])
  })

  it('show none of the viewer custom timeframes beside a list', () => {
    const { container } = mount({ timeframes: ['1m', '5m'], preferences: { customTimeframes: ['7m'], savedTimeframes: ['1m', '7m'] } })
    expect(chipTexts(container)).toEqual(['1m'])
    expect(rowTexts(openList(container))).toEqual(['1 Minute', '5 Minutes'])
  })

  it('open a stored or preferred timeframe that is left out on the smallest listed one', () => {
    const stored = mount({ timeframes: ['1h', '5m'], storage: memoryChartStorage({ 'quickcharts.tf.v1': '4h' }) })
    expect(stored.widget.activeChart().timeframe()).toBe('5m')
    const preferred = mount({ timeframes: ['1h', '1d'], preferences: { timeframe: '1m' } })
    expect(preferred.widget.activeChart().timeframe()).toBe('1h')
    const kept = mount({ timeframes: ['5m', '1h'], storage: memoryChartStorage({ 'quickcharts.tf.v1': '1h' }) })
    expect(kept.widget.activeChart().timeframe()).toBe('1h')
  })

  it('open a saved layout that names a timeframe left out on the smallest listed one, and restore the rest', () => {
    const source = mount({ timeframe: '15m' })
    source.widget.activeChart().setStyle('line')
    const saved = source.widget.layout.serialize().content
    const { widget } = mount({ timeframes: ['1h', '5m'], timeframe: '1h' })
    widget.layout.restore(saved)
    expect(widget.activeChart().timeframe()).toBe('5m')
    expect(widget.activeChart().style()).toBe('line')
  })

  it('read a range preset at the nearest coarser offered timeframe when its own is left out', () => {
    const { widget } = mount({ timeframes: ['5m', '1h', '1d'], timeframe: '1d' })
    expect(widget.commands.execute('chart.range.1D').kind).toBe('ok')
    expect(widget.activeChart().timeframe()).toBe('5m')
    expect(widget.commands.execute('chart.range.All').kind).toBe('ok')
    expect(widget.activeChart().timeframe()).toBe('1d')
  })

  it('stand apart from ui.topBar.timeframes, which hides the picker and leaves the list governing commands', () => {
    const { widget, container } = mount({ timeframes: ['5m', '1h'], ui: { topBar: { timeframes: false } } })
    expect(container.querySelector('.qc-tf')).toBeNull()
    expect(presetCommands(widget)).toEqual(['chart.timeframe.5m', 'chart.timeframe.1h'])
    expect(widget.commands.execute('chart.timeframe.1h').kind).toBe('ok')
    expect(widget.activeChart().timeframe()).toBe('1h')
    widget.commands.execute('chart.timeframe.set', '4h')
    expect(widget.activeChart().timeframe()).toBe('1h')
  })

  it('leave no picker for a single timeframe, and the chart opens on it', () => {
    const { widget, container } = mount({ timeframes: ['4h'] })
    expect(container.querySelector('.qc-tf')).toBeNull()
    expect(widget.activeChart().timeframe()).toBe('4h')
    expect(presetCommands(widget)).toEqual(['chart.timeframe.4h'])
  })
})

describe('customTimeframes: false', () => {
  it('offers the presets alone: no composer, no viewer custom timeframes, and the setters refuse others', () => {
    const { widget, container } = mount({ customTimeframes: false, timeframe: '1m', preferences: { customTimeframes: ['7m'], savedTimeframes: ['1m', '7m'] } })
    expect(presetCommands(widget)).toHaveLength(26)
    expect(chipTexts(container)).toEqual(['1m'])
    const menu = openList(container)
    expect(rowTexts(menu)).toHaveLength(26)
    expect(document.querySelector('.qc-tf-composer')).toBeNull()
    widget.commands.execute('chart.timeframe.set', '7m')
    widget.activeChart().setTimeframe('7m')
    expect(widget.activeChart().timeframe()).toBe('1m')
    widget.activeChart().setTimeframe('4h')
    expect(widget.activeChart().timeframe()).toBe('4h')
  })

  it('opens a stored token beyond the presets on 1m', () => {
    const { widget } = mount({ customTimeframes: false, storage: memoryChartStorage({ 'quickcharts.tf.v1': '7m' }) })
    expect(widget.activeChart().timeframe()).toBe('1m')
  })
})

describe('the offered-timeframe rules', () => {
  const listed = resolveOfferedTimeframes(['1d', '5m', '1h'], undefined)

  it('keep the list smallest first, and fall back to its smallest', () => {
    expect(listed.list).toEqual(['5m', '1h', '1d'])
    expect(offeredTimeframe('4h', listed)).toBe('5m')
    expect(offeredTimeframe('1h', listed)).toBe('1h')
    expect(offeredTimeframe('7m', resolveOfferedTimeframes(undefined, false))).toBe('1m')
    expect(offeredTimeframe('7m', resolveOfferedTimeframes(undefined, undefined))).toBe('7m')
  })

  it('map a range preset timeframe to the nearest coarser offered one, else the largest', () => {
    expect(rangeTimeframe('1m', listed)).toBe('5m')
    expect(rangeTimeframe('2h', listed)).toBe('1d')
    expect(rangeTimeframe('1mo', listed)).toBe('1d')
    expect(rangeTimeframe('1h', listed)).toBe('1h')
    expect(rangeTimeframe('1m', resolveOfferedTimeframes(undefined, false))).toBe('1m')
    const every = resolveOfferedTimeframes(undefined, undefined)
    expect([...TIMEFRAME_PRESET_TOKENS].every((token) => rangeTimeframe(token, every) === token)).toBe(true)
  })
})

describe('a timeframes option the host got wrong', () => {
  const refuse = (options: Partial<ChartWidgetOptions>, message: string): void => {
    const container = document.body.appendChild(document.createElement('div'))
    expect(() => mounted.push(createChart({ container, datafeed, ...options }))).toThrow(message)
    expect(container.childElementCount).toBe(0)
  }

  it('is an empty list', () => refuse({ timeframes: [] }, 'timeframes must name at least one timeframe token'))
  it('is a token the grammar cannot read', () => refuse({ timeframes: ['1m', '1441m'] }, 'timeframes names "1441m", which is not a timeframe token'))
  it('is a repeated token', () => refuse({ timeframes: ['1m', '5m', '1m'] }, 'timeframes names "1m" more than once'))
  it('is an opening timeframe outside the list', () => refuse({ timeframes: ['5m', '1h'], timeframe: '1m' }, 'timeframe "1m" is not one of the offered timeframes: 5m, 1h'))
  it('is a layout chart timeframe outside the list', () =>
    refuse({ timeframes: ['5m', '1h'], layout: { charts: [{ timeframe: '5m' }, { timeframe: '4h' }] } }, 'layout.charts[1].timeframe "4h" is not one of the offered timeframes'))
  it('is customTimeframes: true beside a list', () => refuse({ timeframes: ['5m'], customTimeframes: true }, 'customTimeframes cannot be true beside a timeframes list'))
  it('is an opening timeframe beyond the presets with customTimeframes: false', () => refuse({ customTimeframes: false, timeframe: '7m' }, 'timeframe "7m" is not offered: customTimeframes is false'))
  it('is a customTimeframes that is not a boolean', () => refuse({ customTimeframes: 'no' as unknown as boolean }, 'customTimeframes must be true or false'))
})
