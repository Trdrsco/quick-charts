// @vitest-environment happy-dom
// A widget mounted the way a host mounts it, through createChart, with a layout of more than one
// chart. The layout builds its first charts synchronously inside its own construction, and every
// chart mounts the drawing toolbar during its own; the toolbar's sync switch exists only past one
// chart, so the count it reads has to be honest before the layout exists and follow the layout
// after: a chart added or removed through the layout api shows or hides the switch on the charts
// that remain. lightweight-charts paints into canvases happy-dom cannot draw, so the 2D context is
// a recording stub; nothing here reads a pixel.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { createChartI18n } from '../../src/i18n'
import { BUILT_IN_INDICATORS } from '../../src/builtInIndicators'
import { memorySaveLoadAdapter } from '../../src/resources'

beforeAll(() => {
  // Properties written are read back as written (the library normalizes a color by writing it to
  // fillStyle and reading it back); every method is a no-op with the shape its caller expects.
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
  // The library normalizes a color by reading it back from a computed style, which happy-dom does
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
const datafeed: ChartDatafeed = {
  config: async () => ({ resolutions: ['1m', '5m'] }) as never,
  search: async () => ({ items: [], total: 0 }) as never,
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m', '5m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: 20 }, (_, i) => bar(1_700_000_000 + i * 60)), noData: false }) as never,
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.dispose()
  document.body.replaceChildren()
})

const toolbars = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[data-role="drawing-toolbar"]')]
const syncOf = (toolbar: HTMLElement) => toolbar.querySelector<HTMLButtonElement>('button[aria-label="Sync drawings across the layout"]')

describe('the drawing toolbar in a layout, mounted through createChart', () => {
  it.each([false, true])('routes commands to the active chart through activation, creation and removal (external: %s)', (external) => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    document.body.append(container, host)
    const extensionCalls: string[] = []
    const widget = createChart({ container, drawingToolbarContainer: external ? host : undefined, datafeed, symbol: 'ES', timeframe: '1m', extensions: [{
      id: 'test.command-owner',
      attach(ctx) {
        const off = ctx.contributeCommands([{ id: 'test.extension', label: 'Test extension', execute: () => { extensionCalls.push(ctx.chart.id) } }])
        return { detach: off }
      },
    }] })
    mounted.push(widget)
    const first = widget.activeChart()
    widget.commands.setShortcut('chart.style.line', 'Alt+KeyU')
    widget.layout.setArrangement('2v')
    const second = widget.charts()[1]!
    expect(widget.commands.execute('chart.style.line').kind).toBe('ok')
    expect(first.style()).toBe('line')
    expect(second.style()).toBe('candles')
    expect(widget.commands.execute('test.extension').kind).toBe('ok')
    expect(extensionCalls.at(-1)).toBe(first.id)
    widget.layout.setActive(1)
    expect(widget.commands.execute('test.extension').kind).toBe('ok')
    expect(extensionCalls.at(-1)).toBe(second.id)
    expect(widget.commands.execute('chart.symbol.set', 'NQ').kind).toBe('ok')
    expect(second.symbol()).toBe('NQ')
    expect(first.symbol()).toBe('ES')
    widget.layout.setActive(0)
    expect(widget.commands.execute('chart.drawings.arm', 'measure').kind).toBe('ok')
    expect(first.drawings?.activeTool()).toBe('measure')
    expect(second.drawings?.activeTool()).toBeNull()
    widget.layout.setActive(1)
    widget.layout.setArrangement('s')
    expect(widget.activeChart()).toBe(first)
    expect(widget.commands.execute('test.extension').kind).toBe('ok')
    expect(extensionCalls.at(-1)).toBe(first.id)
    expect(widget.commands.available('chart.style.candles')).toBe(true)
    expect(widget.commands.execute('chart.style.candles').kind).toBe('ok')
    expect(first.style()).toBe('candles')
    expect(widget.commands.execute('chart.drawings.arm', 'zoom').kind).toBe('ok')
    expect(first.drawings?.activeTool()).toBe('zoom')
    expect(widget.commands.list().find((spec) => spec.id === 'chart.style.line')?.shortcut).toBe('Alt+KeyU')
    widget.commands.setShortcut('chart.style.line', null)
    widget.layout.setArrangement('2h')
    widget.layout.setActive(1)
    expect(widget.commands.list().find((spec) => spec.id === 'chart.style.line')?.shortcut).toBeUndefined()
  })

  it('mounts only the drawing toolbar of the active chart externally, closes its flyouts on activation, and follows layout changes', () => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    document.body.append(container, host)
    const widget = createChart({ container, drawingToolbarContainer: host, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v' } })
    mounted.push(widget)
    const [first, second] = widget.charts()
    expect(toolbars(container)).toHaveLength(0)
    expect(container.querySelector('[data-qc-drawing-toolbar]')).toBeNull()
    expect(toolbars(host)).toHaveLength(1)
    const firstToolbar = toolbars(host)[0]!
    // The arrow opens the chart's menu in the widget's own layer on the document body: the toolbar
    // stands outside the widget, and its flyout stands over whatever the host puts beside it.
    const arrow = firstToolbar.querySelector<HTMLButtonElement>('.qc-drawing-toolbar-arrow')!
    arrow.click()
    expect(document.querySelector('.qc-layer > [data-role="drawing-popover"]')).not.toBeNull()
    expect(container.querySelector('[data-role="drawing-popover"]')).toBeNull()
    expect(host.querySelector('[data-role="drawing-popover"]')).toBeNull()
    widget.layout.setActive(1)
    expect(document.querySelector('[data-role="drawing-popover"]')).toBeNull()
    expect(firstToolbar.isConnected).toBe(false)
    expect(toolbars(host)).toHaveLength(1)
    const secondToolbar = toolbars(host)[0]!
    secondToolbar.querySelector<HTMLButtonElement>('button[aria-label="Measure"]')!.click()
    expect(second!.drawings?.activeTool()).toBe('measure')
    expect(first!.drawings?.activeTool()).not.toBe('measure')
    widget.layout.setActive(0)
    expect(toolbars(host)).toEqual([firstToolbar])
    expect(firstToolbar.querySelector('[aria-label="Measure"]')?.getAttribute('data-qc-active')).not.toBe('true')
    widget.layout.setActive(1)
    const saved = widget.layout.serialize().content
    widget.layout.setArrangement('s')
    expect(toolbars(host)).toHaveLength(1)
    expect(syncOf(toolbars(host)[0]!)).toBeNull()
    widget.layout.restore(saved)
    expect(widget.layout.active()).toBe(1)
    expect(toolbars(host)).toHaveLength(1)
    expect(toolbars(host)[0]).not.toBe(secondToolbar)
    expect(syncOf(toolbars(host)[0]!)).not.toBeNull()
    expect(toolbars(container)).toHaveLength(0)
    const restoredToolbar = toolbars(host)[0]
    widget.layout.restore(saved)
    expect(toolbars(host)).toEqual([restoredToolbar])
  })

  it('tells each pane\'s extensions whether it is the active chart, at mount and on every activation', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const heard: Record<string, boolean[]> = {}
    const read: Record<string, () => boolean> = {}
    const widget = createChart({
      container,
      datafeed,
      symbol: 'ES',
      timeframe: '1m',
      layout: { arrangement: '2v' },
      extensions: [{
        id: 'activity-probe',
        attach(ctx) {
          heard[ctx.chart.id] = []
          read[ctx.chart.id] = () => ctx.active()
          ctx.onActiveChange((active) => heard[ctx.chart.id]!.push(active))
          return { detach() {} }
        },
      }],
    })
    mounted.push(widget)
    const [first, second] = widget.charts()
    expect(widget.activeChart()).toBe(first)
    expect(read[first!.id]!()).toBe(true)
    expect(read[second!.id]!()).toBe(false)
    widget.layout.setActive(1)
    expect(read[first!.id]!()).toBe(false)
    expect(read[second!.id]!()).toBe(true)
    expect(heard[first!.id]).toEqual([false])
    expect(heard[second!.id]).toEqual([true])
    // Activating the already active chart says nothing again.
    widget.layout.setActive(1)
    expect(heard[second!.id]).toEqual([true])
  })

  it('transfers the shared drawing toolbar tool before another pane consumes its first pointer', () => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    document.body.append(container, host)
    const widget = createChart({ container, drawingToolbarContainer: host, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v' } })
    mounted.push(widget)
    const [first, second] = widget.charts()
    const panes = container.querySelectorAll<HTMLElement>('.qc-pane')
    const gestureSurfaces = container.querySelectorAll<HTMLElement>('.qc-gestures')
    const toolbar = () => host.querySelector<HTMLElement>('[data-role="drawing-toolbar"]')!
    const pointer = (target: EventTarget, type: string, x: number, y: number) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, button: 0, clientX: x, clientY: y }))

    toolbar().querySelector<HTMLButtonElement>('button[aria-label="Trend line"]')!.click()
    expect(first!.drawings?.activeTool()).toBe('trend_line')
    let toolAtTargetPointer: string | null = null
    gestureSurfaces[1]!.addEventListener('pointerdown', () => { toolAtTargetPointer = second!.drawings?.activeTool() ?? null })
    pointer(gestureSurfaces[1]!, 'pointerdown', 100, 100)
    expect(widget.activeChart()).toBe(second)
    expect(toolAtTargetPointer).toBe('trend_line')
    expect(second!.drawings?.activeTool()).toBe('trend_line')
    expect(first!.drawings?.activeTool()).toBeNull()
    // A one-shot completion reports the same null transition as the layer's placement loop.
    second!.drawings?.armTool(null)
    expect(second!.drawings?.activeTool()).toBeNull()

    // One-shot completion cleared the layout intent, so entering the other pane navigates normally.
    pointer(panes[0]!, 'pointerdown', 120, 120)
    pointer(window, 'pointerup', 120, 120)
    expect(first!.drawings?.activeTool()).toBeNull()
    expect(first!.drawings?.export()).toHaveLength(0)

    toolbar().querySelector<HTMLButtonElement>('button[aria-label="Stay in drawing mode"]')!.click()
    toolbar().querySelector<HTMLButtonElement>('button[aria-label="Trend line"]')!.click()
    pointer(gestureSurfaces[1]!, 'pointerdown', 130, 130)
    expect(second!.drawings?.activeTool()).toBe('trend_line')
    panes[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
    expect(second!.drawings?.activeTool()).toBeNull()
    pointer(panes[0]!, 'pointerdown', 140, 140)
    pointer(window, 'pointerup', 140, 140)
    expect(first!.drawings?.activeTool()).toBeNull()

    // The intent belongs to the layout, so retiring its current pane hands it to the survivor.
    toolbar().querySelector<HTMLButtonElement>('button[aria-label="Trend line"]')!.click()
    pointer(gestureSurfaces[1]!, 'pointerdown', 150, 150)
    expect(second!.drawings?.activeTool()).toBe('trend_line')
    widget.layout.setArrangement('s')
    expect(widget.activeChart()).toBe(first)
    expect(first!.drawings?.activeTool()).toBe('trend_line')
  })

  it('keeps built-in drawing toolbars pane-local', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v' } })
    mounted.push(widget)
    const [first, second] = widget.charts()
    const panes = container.querySelectorAll<HTMLElement>('.qc-pane')
    toolbars(container)[0]!.querySelector<HTMLButtonElement>('button[aria-label="Trend line"]')!.click()
    expect(first!.drawings?.activeTool()).toBe('trend_line')
    panes[1]!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, button: 0, clientX: 100, clientY: 100 }))
    expect(second!.drawings?.activeTool()).toBeNull()
    expect(first!.drawings?.activeTool()).toBe('trend_line')
  })

  it.each(['2v', '2h', '4'] as const)('anchors the external drawing toolbar flyout beside its trigger and within the viewport across active panes in %s', (arrangement) => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    document.body.append(host, container)
    const widget = createChart({ container, drawingToolbarContainer: host, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement } })
    mounted.push(widget)
    const chartCount = widget.charts().length

    const root = container.querySelector<HTMLElement>('.qc-root')!
    const layer = [...document.body.children].find((node) => node.classList.contains('qc-layer')) as HTMLElement
    // The viewport the layer's surfaces are kept within.
    let viewport = { width: 1000, height: 700 }
    const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth')
    const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => viewport.width })
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, get: () => viewport.height })
    root.querySelectorAll<HTMLElement>('.qc-chrome').forEach((chrome, index) => {
      const left = 60 + (index % 2) * 500
      const top = 50 + Math.floor(index / 2) * 350
      chrome.getBoundingClientRect = () => ({ left, top, right: left + 500, bottom: top + 350, width: 500, height: 350 }) as DOMRect
    })
    const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    const nativeResizeObserver = globalThis.ResizeObserver
    const resizeCallbacks: ResizeObserverCallback[] = []
    let resizeDisconnects = 0
    globalThis.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback) }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void { resizeDisconnects++ }
    } as typeof ResizeObserver
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { configurable: true, get() { return (this as HTMLElement).matches('[data-role="drawing-popover"]') ? 192 : 0 } },
      offsetHeight: { configurable: true, get() { return (this as HTMLElement).matches('[data-role="drawing-popover"]') ? 200 : 0 } },
    })
    try {
      const open = (): { arrow: HTMLButtonElement; panel: HTMLElement } => {
        const arrow = host.querySelector<HTMLButtonElement>('button[aria-label="Trend tools menu"]')!
        // The panel is placed against the cell the arrow rides, so the cell carries the same box.
        arrow.getBoundingClientRect = () => ({ left: 10, top: 90, right: 48, bottom: 128, width: 38, height: 38 }) as DOMRect
        arrow.closest<HTMLElement>('.qc-drawing-cell')!.getBoundingClientRect = arrow.getBoundingClientRect
        arrow.click()
        return { arrow, panel: document.querySelector<HTMLElement>('[data-role="drawing-popover"]')! }
      }

      // A pixel clear of the toolbar it opened from, not floated off it: the cell's right edge plus
      // one is where the panel's left edge goes, so the two read as one control opening sideways
      // rather than as a panel hovering beside a button. Level with its trigger, whichever pane is
      // active.
      let { panel } = open()
      expect(panel.parentElement).toBe(layer)
      expect([panel.style.left, panel.style.top]).toEqual(['49px', '90px'])

      for (let index = 1; index < chartCount; index++) {
        widget.layout.setActive(index)
        expect(document.querySelector('[data-role="drawing-popover"]')).toBeNull()
        ;({ panel } = open())
        expect(panel.parentElement).toBe(layer)
        expect([panel.style.left, panel.style.top]).toEqual(['49px', '90px'])
      }

      // A viewport too short for it lifts the panel to stay whole on screen.
      viewport = { ...viewport, height: 250 }
      window.dispatchEvent(new Event('resize'))
      expect(panel.style.top).toBe('50px')
      viewport = { ...viewport, height: 700 }
      const activeArrow = host.querySelector<HTMLButtonElement>('button[aria-label="Trend tools menu"]')!
      activeArrow.getBoundingClientRect = () => ({ left: 10, top: 140, right: 48, bottom: 178, width: 38, height: 38 }) as DOMRect
      activeArrow.closest<HTMLElement>('.qc-drawing-cell')!.getBoundingClientRect = activeArrow.getBoundingClientRect
      document.dispatchEvent(new Event('scroll'))
      expect(panel.style.top).toBe('140px')

      const row = panel.querySelector<HTMLButtonElement>('[role="menuitem"]')!
      row.click()
      expect(resizeDisconnects).toBe(chartCount)
      const closedPosition = [panel.style.left, panel.style.top]
      resizeCallbacks.at(-1)!([], {} as ResizeObserver)
      window.dispatchEvent(new Event('resize'))
      document.dispatchEvent(new Event('scroll'))
      expect([panel.style.left, panel.style.top]).toEqual(closedPosition)
      expect(widget.activeChart().drawings?.activeTool()).not.toBeNull()
      expect(widget.charts().filter((chart) => chart.drawings?.activeTool() !== null)).toEqual([widget.activeChart()])

      ;({ panel } = open())
      const disposedPosition = [panel.style.left, panel.style.top]
      widget.dispose()
      expect(resizeDisconnects).toBe(chartCount + 1)
      expect(panel.isConnected).toBe(false)
      resizeCallbacks.at(-1)!([], {} as ResizeObserver)
      expect([panel.style.left, panel.style.top]).toEqual(disposedPosition)
    } finally {
      if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
      else delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth
      if (height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height)
      else delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight
      delete (document.documentElement as { clientWidth?: number }).clientWidth
      delete (document.documentElement as { clientHeight?: number }).clientHeight
      if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth)
      if (clientHeight) Object.defineProperty(Element.prototype, 'clientHeight', clientHeight)
      globalThis.ResizeObserver = nativeResizeObserver
    }
  })

  it('keeps a standalone internal drawing toolbar flyout in its own chart bounds', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v' } })
    mounted.push(widget)
    const secondToolbar = toolbars(container)[1]!
    const chrome = secondToolbar.closest<HTMLElement>('.qc-chrome')!
    secondToolbar.querySelector<HTMLButtonElement>('.qc-drawing-toolbar-arrow')!.click()
    expect(chrome.querySelector<HTMLElement>('[data-role="drawing-popover"]')?.parentElement).toBe(chrome)
    expect(container.querySelector<HTMLElement>('.qc-overlays')!.querySelector('[data-role="drawing-popover"]')).toBeNull()
  })

  it('themes and relabels the separate drawing toolbar and releases its child and shortcuts at disposal', async () => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    const owned = document.createElement('span')
    host.appendChild(owned)
    document.body.append(container, host)
    const i18n = createChartI18n('en')
    const widget = createChart({ container, drawingToolbarContainer: host, datafeed, symbol: 'ES', timeframe: '1m',
      i18n: { ...i18n, t: (key, ...args) => key === 'drawing.toolbar' ? `Tools (${i18n.locale()})` : i18n.t(key, ...args) },
    })
    mounted.push(widget)
    const surface = host.querySelector<HTMLElement>('.qc-drawing-toolbar-host')!
    widget.theme.setMode('light')
    expect(surface.dataset.qcTheme).toBe('light')
    await widget.setLocale('ar')
    expect(surface.dir).toBe('rtl')
    expect(toolbars(host)[0]!.getAttribute('aria-label')).toBe('Tools (ar)')
    let calls = 0
    widget.commands.register({ id: 'test.toolbar', scope: 'widget', label: 'command.viewReset', shortcut: 'Alt+KeyR', available: () => true, execute: () => { calls++ } })
    const press = () => surface.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', altKey: true, bubbles: true, cancelable: true }))
    press()
    expect(calls).toBe(1)
    widget.dispose()
    const style = surface.getAttribute('style')
    widget.theme.setMode('dark')
    expect(surface.getAttribute('style')).toBe(style)
    press()
    expect(calls).toBe(1)
    expect([...host.children]).toEqual([owned])
    expect(host.hasAttribute('data-qc-theme')).toBe(false)
  })

  it.each([{ features: { drawings: false } }, { ui: { drawingToolbar: false } }])('leaves external host content alone without a drawing toolbar: %o', (planes) => {
    const container = document.createElement('div')
    const host = document.createElement('aside')
    const widget = createChart({ container, drawingToolbarContainer: host, datafeed, ...planes })
    mounted.push(widget)
    expect(host.children).toHaveLength(0)
    expect(toolbars(container)).toHaveLength(0)
    expect(container.querySelector('[data-qc-drawing-toolbar]')).toBeNull()
  })

  it('constructs with a two-chart layout and shows the sync switch on both charts', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2h' } })
    mounted.push(widget)
    expect(widget.charts()).toHaveLength(2)
    const shown = toolbars(container)
    expect(shown).toHaveLength(2)
    expect(shown.map((r) => syncOf(r) !== null)).toEqual([true, true])
  })

  it('shows no switch on one chart, and the switch follows charts added and removed through the layout', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' })
    mounted.push(widget)
    expect(toolbars(container)).toHaveLength(1)
    expect(syncOf(toolbars(container)[0]!)).toBeNull()
    widget.layout.setArrangement('2v')
    expect(widget.charts()).toHaveLength(2)
    expect(toolbars(container).map((r) => syncOf(r) !== null)).toEqual([true, true])
    widget.layout.setArrangement('s')
    expect(widget.charts()).toHaveLength(1)
    expect(toolbars(container)).toHaveLength(1)
    expect(syncOf(toolbars(container)[0]!)).toBeNull()
  })

  it('clones a deep, safe pane-0 presentation into new tiles and lets saved content replace it', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const adapter = memorySaveLoadAdapter()
    const widget = createChart({ container, datafeed, saveLoad: adapter, symbol: 'ES', timeframe: '1m' })
    mounted.push(widget)
    const first = widget.charts()[0]!
    first.setSymbol('NQ')
    first.setTimeframe('5m')
    first.setStyle('line')
    first.setSubsession('regular')
    first.indicators.add({
      id: 'sma-copy', definition: BUILT_IN_INDICATORS.find((definition) => definition.id === 'sma')!,
      inputs: { length: 34 }, overrides: { plots: { sma: { lineWidth: 3 } } },
    })
    first.compare.add('AAPL', { placement: 'new-scale' })
    first.replay.start(1_700_000_600)
    await first.saveLoad.save('primary')

    widget.layout.setArrangement('2h')
    const second = widget.charts()[1]!
    expect([second.symbol(), second.timeframe(), second.style()]).toEqual(['NQ', '5m', 'line'])
    expect(second.indicators.get()).toEqual(first.indicators.get())
    expect(second.indicators.get()).not.toBe(first.indicators.get())
    expect(second.indicators.get()[0]!.inputs).not.toBe(first.indicators.get()[0]!.inputs)
    expect(second.indicators.get()[0]!.overrides).not.toBe(first.indicators.get()[0]!.overrides)
    expect(second.compare.list()).toEqual(first.compare.list())
    expect(second.compare.list()).not.toBe(first.compare.list())
    expect(second.replay.state().on).toBe(false)
    expect(second.subsession()).not.toBe(first.subsession())
    expect(second.saveLoad.current()).toBeNull()

    second.setSymbol('CL')
    second.setTimeframe('1m')
    second.setStyle('area')
    second.indicators.get()[0]!.inputs!.length = 7
    widget.layout.setActive(1)
    widget.layout.setArrangement('3h')
    const third = widget.charts()[2]!
    expect([third.symbol(), third.timeframe(), third.style()]).toEqual(['NQ', '5m', 'line'])
    expect(third.indicators.get()[0]!.inputs!.length).toBe(34)
    expect(first.indicators.get()[0]!.inputs!.length).toBe(34)

    const saved = widget.layout.serialize().content
    widget.layout.setArrangement('s')
    first.setSymbol('YM')
    widget.layout.restore(saved)
    expect(widget.charts().map((chart) => [chart.symbol(), chart.timeframe(), chart.style()])).toEqual([
      ['NQ', '5m', 'line'], ['CL', '1m', 'area'], ['NQ', '5m', 'line'],
    ])
    expect(widget.charts()[1]!.saveLoad.current()).toBeNull()
  })

  it('keeps one reserved replay row bound to its first-entry owner while another chart replays independently', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '2v' } })
    mounted.push(widget)
    await widget.ready()
    const [first, second] = widget.charts()
    const root = container.querySelector<HTMLElement>('.qc-root')!
    const topbarReplay = () => root.querySelector<HTMLButtonElement>('.qc-topbar button[aria-label="Bar replay"]')!

    first!.replay.start(1_700_000_600)
    expect(root.querySelectorAll('.qc-replay')).toHaveLength(1)
    expect([...root.children].map((node) => node.classList.contains('qc-replay') ? 'qc-replay' : node.className)).toEqual(['qc-topbar', 'qc-panes', 'qc-replay', 'qc-toasts', 'qc-bottombar', 'qc-overlays'])
    const ownedRow = root.querySelector('.qc-replay')
    widget.theme.setMode('light')
    expect(root.querySelector('.qc-replay')).toBe(ownedRow)
    const firstCursor = first!.replay.state().cursor

    widget.layout.setActive(1)
    second!.replay.start(1_700_000_600)
    const secondCursor = second!.replay.state().cursor
    expect(first!.replay.state().on).toBe(true)
    expect(second!.replay.state().on).toBe(true)
    expect(root.querySelectorAll('.qc-replay')).toHaveLength(1)
    root.querySelector<HTMLButtonElement>('.qc-replay button[aria-label="Step forward one bar"]')!.click()
    expect(first!.replay.state().cursor).toBe(firstCursor + 1)
    expect(second!.replay.state().cursor).toBe(secondCursor)

    second!.replay.stepForward()
    expect(second!.replay.state().cursor).toBe(secondCursor + 1)
    root.querySelector<HTMLButtonElement>('.qc-replay .qc-replay-speed')!.click()
    expect(root.querySelector('.qc-overlays [role="menu"]')).not.toBeNull()
    first!.replay.exit()
    expect(first!.replay.state().on).toBe(false)
    expect(second!.replay.state().on).toBe(true)
    expect(root.querySelector('.qc-replay')).toBeNull()
    expect(root.querySelector('.qc-overlays [role="menu"]')).toBeNull()

    // An already-running non-owner cannot acquire the vacant row through later replay updates.
    // Only a fresh off-to-on transition is an entry eligible to claim presentation ownership.
    second!.replay.stepForward()
    second!.replay.setSpeed(3)
    second!.replay.goLive()
    expect(root.querySelector('.qc-replay')).toBeNull()

    // The active chart's existing top-bar command still controls the concurrent data-only replay.
    topbarReplay().click()
    expect(second!.replay.phase()).toBe('off')
    // Pressing it again re-enters, which ASKS where to begin. That is a fresh off-to-on transition,
    // so this entry is eligible to claim the row the owner vacated.
    topbarReplay().click()
    expect(second!.replay.phase()).toBe('arming')
    expect(root.querySelectorAll('.qc-replay')).toHaveLength(1)
    second!.replay.start(1_700_000_600)
    expect(second!.replay.state().on).toBe(true)
    expect(root.querySelectorAll('.qc-replay')).toHaveLength(1)

    // Removing the owner removes its reserved row. Nothing is transferred to another chart.
    widget.layout.setArrangement('s')
    expect(root.querySelector('.qc-replay')).toBeNull()
  })

  it('keeps replay usable from a host control when the built-in top bar is hidden', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', ui: { topBar: false } })
    mounted.push(widget)
    await widget.ready()

    expect(container.querySelector('.qc-topbar')).toBeNull()
    const chart = widget.activeChart()
    chart.replay.start(1_700_000_600)
    expect(container.querySelector('.qc-replay')).not.toBeNull()
    const before = chart.replay.state().cursor
    chart.replay.stepForward()
    expect(chart.replay.state().cursor).toBe(before + 1)
    chart.replay.exit()
    expect(container.querySelector('.qc-replay')).toBeNull()
  })
})

describe('custom multi-chart geometry', () => {
  it('resizes an irregular branch, serializes it, and maximizes without replacing chart instances', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', layout: { arrangement: '3s' } })
    mounted.push(widget)
    const panes = container.querySelector<HTMLElement>('.qc-panes')!
    panes.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }) as DOMRect
    const horizontal = panes.querySelector<HTMLElement>('.qc-layout-divider[data-qc-axis="h"]')!
    horizontal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, button: 0, clientY: 400 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientY: 560 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientY: 560 }))
    const savedContent = widget.layout.serialize().content
    const saved = JSON.parse(savedContent) as { v: number; geometry: { h: number }[] }
    expect(saved.v).toBe(2)
    expect(saved.geometry[0]!.h).toBe(1)
    expect(saved.geometry[1]!.h).toBeCloseTo(0.7)

    horizontal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, button: 0, clientY: 560 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientY: 640 }))
    widget.layout.setArrangement('s')
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientY: 240 }))
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 8 }))
    expect((JSON.parse(widget.layout.serialize().content) as { arrangement: string; geometry: unknown[] })).toMatchObject({ arrangement: 's', geometry: [{ x: 0, y: 0, w: 1, h: 1 }] })
    widget.layout.restore(savedContent)
    const restored = [...widget.charts()]

    const secondPane = panes.querySelectorAll<HTMLElement>('.qc-pane')[1]!
    widget.layout.setActive(1)
    const restoredHorizontal = panes.querySelector<HTMLElement>('.qc-layout-divider[data-qc-axis="h"]')!
    restoredHorizontal.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, button: 0, clientY: 560 }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientY: 480 }))
    secondPane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }))
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 9, clientY: 720 }))
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 9 }))
    expect(widget.activeChart()).toBe(restored[1])
    expect(restored[0]!.id).toBe(widget.charts()[0]!.id)
    expect(panes.querySelectorAll('.qc-layout-divider')).toHaveLength(0)
    expect((JSON.parse(widget.layout.serialize().content) as { geometry: unknown[] }).geometry).toEqual(saved.geometry)
    expect(panes.querySelectorAll<HTMLElement>('.qc-pane')[0]!.hidden).toBe(true)
    secondPane.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }))
    expect(widget.activeChart()).toBe(restored[2])
    expect(panes.querySelectorAll<HTMLElement>('.qc-pane')[1]!.hidden).toBe(true)
    expect(panes.querySelectorAll<HTMLElement>('.qc-pane')[2]!.hidden).toBe(false)
    panes.querySelectorAll<HTMLElement>('.qc-pane')[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true }))
    expect(widget.charts()).toEqual(restored)
    expect(panes.querySelectorAll('.qc-layout-divider').length).toBeGreaterThan(0)
  })
})

// The context menu stands over the whole page: every pane is its own stacking context and the host
// may stack its own chrome above the widget, so the menu mounts on a layer the widget keeps on the
// document body, themed as the root is and taken down with it.
describe('the widget layer on the document body', () => {
  it('exists beside the root with the same theme, hosts the context menu, and goes at dispose', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m' })
    const root = container.querySelector<HTMLElement>('.qc-root')!
    const layer = document.body.querySelector<HTMLElement>(':scope > .qc-layer')!
    expect(layer).toBeTruthy()
    expect(container.contains(layer)).toBe(false)
    expect(layer.getAttribute('data-qc-theme')).toBe(root.getAttribute('data-qc-theme'))
    expect(layer.style.getPropertyValue('--qc-text-primary')).toBe(root.style.getPropertyValue('--qc-text-primary'))
    expect(layer.querySelector('.qc-menu')).toBeTruthy()
    expect(root.querySelector('.qc-menu')).toBeNull()
    widget.dispose()
    expect(document.body.querySelector('.qc-layer')).toBeNull()
  })
})
