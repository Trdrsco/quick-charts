// @vitest-environment happy-dom
// An extension's part in an image of the chart: each `before` runs ahead of the bitmap and its
// restore after it, each `paint` paints over the bitmap in the chart element's frame, a throw is
// contained without costing the image or a restore, and a contribution leaves when it is withdrawn
// or its extension detaches. The host is driven directly, and the widget's image surface is driven
// over the renderer stand-in to show that every image it produces is taken the same way.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChartDatafeed } from '../src/datafeed'
import { createExtensionHost, type ChartExtension, type ChartExtensionCapture, type ChartExtensionCaptureFrame, type ChartExtensionContext, type ChartExtensionHostDeps } from '../src/extension'
import type { SymbolInfo } from '../src/symbology'
import { createChart, type ChartWidget } from '../src/widget/create'
import { lastRenderer } from './widget/rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./widget/rendererFake')
  return { ...actual, createChart: createFakeChart }
})

/** A 2D context that keeps the one piece of state a painter could leave behind: its scale. */
function fakeTarget() {
  const saved: number[] = []
  const target = {
    scale: 1,
    save() {
      saved.push(target.scale)
    },
    restore() {
      target.scale = saved.pop() ?? 1
    },
    setTransform(scale: number) {
      target.scale = scale
    },
    depth: () => saved.length,
  }
  return target
}

/** A bitmap of the given pixel size whose 2D context is `target`. */
function bitmapOf(width: number, height: number, target: ReturnType<typeof fakeTarget>): HTMLCanvasElement {
  return {
    width,
    height,
    getContext: (kind: string) => (kind === '2d' ? target : null),
    toBlob: (done: (blob: Blob | null) => void) => done(new Blob(['image'], { type: 'image/png' })),
  } as unknown as HTMLCanvasElement
}

/** An extension that contributes `capture` at attach, and hands out its context. */
function contributing(id: string, capture: ChartExtensionCapture, scope?: 'symbol') {
  let context: ChartExtensionContext | null = null
  let remove: () => void = () => undefined
  const extension: ChartExtension = {
    id,
    ...(scope ? { scope } : {}),
    attach(ctx) {
      context = ctx
      remove = ctx.contributeCapture(capture)
      return { detach: () => undefined }
    },
  }
  return { extension, context: () => context!, remove: () => remove() }
}

/** A capture that writes each of its moves to `log` under its name. */
function logged(name: string, log: string[]): ChartExtensionCapture {
  return {
    before() {
      log.push(`${name}.before`)
      return () => log.push(`${name}.restore`)
    },
    paint() {
      log.push(`${name}.paint`)
    },
  }
}

const hostOf = (extensions: ChartExtension[]) => createExtensionHost({ chartId: 'capture-chart' } as unknown as ChartExtensionHostDeps, extensions)
const CSS = () => ({ width: 400, height: 300 })

describe('an image of the chart, taken through the extensions', () => {
  it('runs every before ahead of the bitmap, every paint over it, and the restores after it, the last answered first', () => {
    const log: string[] = []
    const target = fakeTarget()
    const bitmap = bitmapOf(800, 600, target)
    const host = hostOf([contributing('a', logged('a', log)).extension, contributing('b', logged('b', log)).extension])
    const image = host.capture(() => (log.push('bitmap'), bitmap), CSS)
    expect(image).toBe(bitmap)
    expect(log).toEqual(['a.before', 'b.before', 'bitmap', 'a.paint', 'b.paint', 'b.restore', 'a.restore'])
    host.detach()
  })

  it('hands paint the bitmap\'s own context and the frame, and puts the context back after each paint', () => {
    const target = fakeTarget()
    const seen: { target: unknown; frame: ChartExtensionCaptureFrame; scale: number }[] = []
    const painter = (scale: number): ChartExtensionCapture => ({
      paint(context, frame) {
        seen.push({ target: context, frame, scale: (context as unknown as ReturnType<typeof fakeTarget>).scale })
        // Left as it was set: the next painter must not inherit it.
        context.setTransform(scale, 0, 0, scale, 0, 0)
      },
    })
    const host = hostOf([contributing('a', painter(3)).extension, contributing('b', painter(5)).extension])
    host.capture(() => bitmapOf(800, 600, target), CSS)
    expect(seen).toEqual([
      { target, frame: { width: 400, height: 300, pixelRatio: 2 }, scale: 1 },
      { target, frame: { width: 400, height: 300, pixelRatio: 2 }, scale: 1 },
    ])
    expect(target.scale).toBe(1)
    expect(target.depth()).toBe(0)
    host.detach()
  })

  it('still yields the image and runs every restore when a before, a paint or a restore throws', () => {
    const log: string[] = []
    const bitmap = bitmapOf(800, 600, fakeTarget())
    const failing: ChartExtensionCapture = {
      before() {
        throw new Error('before')
      },
      paint() {
        throw new Error('paint')
      },
    }
    const throwsInPaint: ChartExtensionCapture = {
      before: () => () => log.push('b.restore'),
      paint() {
        throw new Error('paint')
      },
    }
    const throwsInRestore: ChartExtensionCapture = {
      before: () => () => {
        log.push('c.restore')
        throw new Error('restore')
      },
      paint: () => void log.push('c.paint'),
    }
    const host = hostOf([contributing('a', failing).extension, contributing('b', throwsInPaint).extension, contributing('c', throwsInRestore).extension])
    expect(host.capture(() => bitmap, CSS)).toBe(bitmap)
    expect(log).toEqual(['c.paint', 'c.restore', 'b.restore'])
    host.detach()
  })

  it('runs the restores when the bitmap cannot be taken, and the chart\'s own failure reaches the caller', () => {
    const log: string[] = []
    const host = hostOf([contributing('a', logged('a', log)).extension])
    expect(() =>
      host.capture(() => {
        throw new Error('no bitmap')
      }, CSS),
    ).toThrow('no bitmap')
    expect(log).toEqual(['a.before', 'a.restore'])
    host.detach()
  })

  it('stops calling a contribution once it is withdrawn', () => {
    const log: string[] = []
    const a = contributing('a', logged('a', log))
    const host = hostOf([a.extension])
    host.capture(() => bitmapOf(800, 600, fakeTarget()), CSS)
    expect(log).toEqual(['a.before', 'a.paint', 'a.restore'])
    a.remove()
    a.remove()
    log.length = 0
    const bitmap = bitmapOf(800, 600, fakeTarget())
    expect(host.capture(() => bitmap, CSS)).toBe(bitmap)
    expect(log).toEqual([])
    host.detach()
  })

  it('withdraws every contribution at detach, and a detached context contributes nothing', () => {
    const log: string[] = []
    const a = contributing('a', logged('a', log))
    const host = hostOf([a.extension])
    host.detach()
    const bitmap = bitmapOf(800, 600, fakeTarget())
    expect(host.capture(() => bitmap, CSS)).toBe(bitmap)
    expect(log).toEqual([])
    const remove = a.context().contributeCapture(logged('late', log))
    expect(() => remove()).not.toThrow()
    host.capture(() => bitmap, CSS)
    expect(log).toEqual([])
  })

  it('takes a symbol-scoped extension\'s contribution down with the attachment that made it', () => {
    const log: string[] = []
    const host = hostOf([contributing('a', logged('a', log), 'symbol').extension])
    host.symbolChanged('NQ')
    host.capture(() => bitmapOf(800, 600, fakeTarget()), CSS)
    expect(log).toEqual(['a.before', 'a.paint', 'a.restore'])
    host.detach()
  })
})

describe('every image the widget produces', () => {
  const info: SymbolInfo = {
    ticker: 'ES',
    name: 'ES',
    description: 'E-mini',
    exchange: 'CME',
    listedExchange: 'CME',
    type: 'futures',
    supportedResolutions: [],
    timezone: 'Etc/UTC',
    session: '24x7',
    dataStatus: 'streaming',
    volumePrecision: 0,
    format: { pricescale: 100, minmov: 1 },
  }
  const datafeed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => info,
    history: async () => ({ bars: [{ t: 1_700_000_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }], noData: false }),
    subscribeBars: () => () => undefined,
  }

  const mounted: ChartWidget[] = []
  afterEach(() => {
    for (const widget of mounted.splice(0)) widget.dispose()
    document.body.replaceChildren()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /** A widget whose one chart lays out 400x300 and draws an 800x600 bitmap, with one extension
   *  taking part in its image. */
  function mount(capture: ChartExtensionCapture, log: string[]) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({
      container,
      datafeed,
      symbol: 'ES',
      timeframe: '1m',
      theme: { mode: 'dark' },
      features: { drawings: false, replay: false, compare: false },
      ui: { contextMenu: false, topBar: false, bottomBar: false, toasts: false },
      extensions: [{ id: 'overlay', attach: (ctx) => (ctx.contributeCapture(capture), { detach: () => undefined }) }],
    })
    mounted.push(widget)
    const sized = (element: HTMLElement): void => {
      Object.defineProperty(element, 'clientWidth', { configurable: true, value: 400 })
      Object.defineProperty(element, 'clientHeight', { configurable: true, value: 300 })
    }
    sized(container.querySelector<HTMLElement>('.qc-panes')!)
    const renderer = lastRenderer()
    sized(renderer.chart.chartElement())
    const bitmap = bitmapOf(800, 600, fakeTarget())
    ;(renderer.chart as unknown as { takeScreenshot(): HTMLCanvasElement }).takeScreenshot = () => (log.push('bitmap'), bitmap)
    return widget
  }

  it('is taken through the contributions, whether it is captured, copied or downloaded', async () => {
    const log: string[] = []
    const frames: ChartExtensionCaptureFrame[] = []
    const widget = mount(
      {
        before: () => (log.push('before'), () => log.push('restore')),
        paint: (_target, frame) => (log.push('paint'), frames.push(frame)),
      },
      log,
    )
    const once = ['before', 'bitmap', 'paint', 'restore']

    await expect(widget.image.capture()).resolves.toBeInstanceOf(Blob)
    expect(log).toEqual(once)
    expect(frames).toEqual([{ width: 400, height: 300, pixelRatio: 2 }])

    log.length = 0
    const write = vi.fn(async () => undefined)
    vi.stubGlobal('ClipboardItem', class {
      items: Record<string, Blob>
      constructor(items: Record<string, Blob>) {
        this.items = items
      }
    })
    vi.spyOn(navigator, 'clipboard', 'get').mockReturnValue({ write } as unknown as Clipboard)
    await expect(widget.image.copy()).resolves.toBe(true)
    expect(write).toHaveBeenCalledOnce()
    expect(log).toEqual(once)

    log.length = 0
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    await widget.image.download('chart.png')
    expect(log).toEqual(once)
  })
})
