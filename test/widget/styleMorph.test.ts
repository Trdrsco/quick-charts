// @vitest-environment happy-dom
// The morph between a style drawn from whole bars and one drawn from closes, for a host that asks for
// it. The ease and the fold are pure: progress eases in and out along a cosine, and a bar folded part
// of the way keeps the rest of its open, high and low around its close. A morph draws its first frame
// at once, reads the bars on every frame, fades the close style with the fold, and ends once, on its
// last frame, whether its time runs out or it is finished early. A mounted chart morphs only when the
// host turns it on and the viewer has not asked for less motion, keeps both series on screen exactly
// while the morph runs, and lets no repaint unfold bars the morph is still folding.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ISeriesApi, SeriesType } from 'lightweight-charts'
import { canvasTheme, chartSettingsDefaults, type ChartStyleId } from '../../src/index'
import { BUILT_IN_THEMES } from '../../src/theme/palettes'
import { fadedStyleOptions, styleOptions, type StylePaint } from '../../src/widget/styles'
import { foldBar, morphEase, startStyleMorph, STYLE_MORPH_MS } from '../../src/widget/styleMorph'
import { createChart, type ChartWidget } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar, SubscribeHandlers } from '../../src/datafeed'
import type { TransitionOptions } from '../../src/widget/options'
import { lastRenderer, renderers, type FakeRenderer, type FakeSeries } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const widgets: ChartWidget[] = []
afterEach(() => {
  widgets.splice(0).forEach((widget) => widget.dispose())
  renderers.splice(0)
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const bar = (t: number, o: number, h: number, l: number, c: number): FeedBar => ({ t, o, h, l, c, v: 1 })

describe('the ease', () => {
  it('starts at rest, crosses halfway at half time, and lands at rest', () => {
    expect(morphEase(0)).toBe(0)
    expect(morphEase(0.5)).toBeCloseTo(0.5, 12)
    expect(morphEase(1)).toBe(1)
  })

  it('eases in and out alike, and never runs back', () => {
    for (const t of [0.1, 0.25, 0.4]) expect(morphEase(t) + morphEase(1 - t)).toBeCloseTo(1, 12)
    expect(morphEase(0.1)).toBeLessThan(0.1)
    expect(1 - morphEase(0.9)).toBeLessThan(0.1)
    for (let i = 1; i <= 20; i++) expect(morphEase(i / 20)).toBeGreaterThan(morphEase((i - 1) / 20))
  })

  it('holds still outside its length', () => {
    expect(morphEase(-1)).toBe(0)
    expect(morphEase(2)).toBe(1)
  })
})

describe('the fold', () => {
  const whole = bar(60, 10, 14, 8, 12)

  it('is the bar itself at 0 and its close alone at 1', () => {
    expect(foldBar(whole, 0)).toEqual({ time: 60, open: 10, high: 14, low: 8, close: 12 })
    expect(foldBar(whole, 1)).toEqual({ time: 60, open: 12, high: 12, low: 12, close: 12 })
  })

  it('keeps the unfolded part of each price around the close', () => {
    expect(foldBar(whole, 0.5)).toEqual({ time: 60, open: 11, high: 13, low: 10, close: 12 })
    expect(foldBar(whole, 0.75)).toEqual({ time: 60, open: 11.5, high: 12.5, low: 11, close: 12 })
  })

  it('holds still outside 0 to 1', () => {
    expect(foldBar(whole, -1)).toEqual(foldBar(whole, 0))
    expect(foldBar(whole, 2)).toEqual(foldBar(whole, 1))
  })
})

/** A morph over a frame queue and a clock of the test's own: `frame(at)` moves the clock to `at`
 *  milliseconds after the start and runs the frame the morph asked for. */
function rig(direction: 'fold' | 'unfold') {
  const shown: FeedBar[] = [bar(60, 10, 14, 8, 12)]
  const clock = { now: 1_000 }
  const pending = new Map<number, () => void>()
  let handles = 0
  let done = 0
  const drawn: unknown[][] = []
  const fades: number[] = []
  const morph = startStyleMorph({
    bars: { setData: (data: unknown[]) => void drawn.push(data) } as unknown as ISeriesApi<SeriesType>,
    fadeLine: (alpha) => void fades.push(alpha),
    shown: () => shown,
    direction,
    done: () => {
      done++
    },
    frame: (tick) => {
      pending.set(++handles, tick)
      return handles
    },
    cancelFrame: (handle) => void pending.delete(handle),
    now: () => clock.now,
  })
  const frame = (at: number): void => {
    clock.now = 1_000 + at
    const ticks = [...pending.values()]
    pending.clear()
    for (const tick of ticks) tick()
  }
  return { morph, shown, drawn, fades, pending, frame, done: () => done }
}

describe('a morph', () => {
  it('draws its first frame at once: for a fold, the bars whole and the line not yet in', () => {
    const r = rig('fold')
    expect(r.drawn).toEqual([[foldBar(r.shown[0]!, 0)]])
    expect(r.fades).toEqual([0])
    expect(r.morph.running()).toBe(true)
    expect(r.pending.size).toBe(1)
  })

  it('folds the bars into their closes as the line comes in, over its length', () => {
    const r = rig('fold')
    r.frame(STYLE_MORPH_MS / 2)
    expect(r.drawn.at(-1)).toEqual([foldBar(r.shown[0]!, morphEase(0.5))])
    expect(r.fades.at(-1)).toBeCloseTo(0.5, 12)
    expect(r.done()).toBe(0)
    r.frame(STYLE_MORPH_MS)
    expect(r.drawn.at(-1)).toEqual([foldBar(r.shown[0]!, 1)])
    expect(r.fades.at(-1)).toBe(1)
    expect(r.done()).toBe(1)
    expect(r.morph.running()).toBe(false)
    expect(r.pending.size).toBe(0)
  })

  it('unfolds the bars out of their closes as the line goes', () => {
    const r = rig('unfold')
    expect(r.drawn).toEqual([[foldBar(r.shown[0]!, 1)]])
    expect(r.fades).toEqual([1])
    r.frame(STYLE_MORPH_MS * 2)
    expect(r.drawn.at(-1)).toEqual([foldBar(r.shown[0]!, 0)])
    expect(r.fades.at(-1)).toBe(0)
    expect(r.done()).toBe(1)
  })

  it('reads the bars on every frame, so a bar that lands during the morph morphs with the rest', () => {
    const r = rig('fold')
    r.shown.push(bar(120, 12, 15, 11, 14))
    r.frame(STYLE_MORPH_MS / 4)
    const fold = morphEase(0.25)
    expect(r.drawn.at(-1)).toEqual([foldBar(r.shown[0]!, fold), foldBar(r.shown[1]!, fold)])
  })

  it('ends once, on its last frame, when it is finished early', () => {
    const r = rig('fold')
    r.frame(STYLE_MORPH_MS / 5)
    r.morph.finish()
    expect(r.drawn.at(-1)).toEqual([foldBar(r.shown[0]!, 1)])
    expect(r.fades.at(-1)).toBe(1)
    expect(r.pending.size).toBe(0)
    expect(r.done()).toBe(1)
    const frames = r.drawn.length
    r.morph.finish()
    r.frame(STYLE_MORPH_MS)
    expect(r.done()).toBe(1)
    expect(r.drawn).toHaveLength(frames)
  })
})

describe('the close style as it comes in or goes', () => {
  const paint: StylePaint = { settings: chartSettingsDefaults(BUILT_IN_THEMES.dark), canvas: canvasTheme(BUILT_IN_THEMES.dark), title: '', priceScale: true }

  it('fades a line and its fills together', () => {
    expect(fadedStyleOptions('line', paint, 0.5)).toEqual({ color: expect.stringMatching(/^rgba\(\d+, \d+, \d+, 0\.5\)$/) })
    expect(fadedStyleOptions('stepline', paint, 0.5)).toEqual(fadedStyleOptions('line', paint, 0.5))
    const area = fadedStyleOptions('area', paint, 0.5)
    expect([area.lineColor, area.topColor, area.bottomColor]).toEqual([
      expect.stringMatching(/, 0\.5\)$/),
      expect.stringMatching(/, 0\.14\)$/),
      expect.stringMatching(/, 0\)$/),
    ])
    const baseline = fadedStyleOptions('baseline', paint, 0)
    for (const [leaf, value] of Object.entries(baseline)) expect(value, leaf).toMatch(/, 0\)$/)
  })

  it('reaches the style’s own fills at full strength, and holds alpha between 0 and 1', () => {
    const area = styleOptions('area', paint)
    expect(fadedStyleOptions('area', paint, 1)).toMatchObject({ topColor: area.topColor, bottomColor: area.bottomColor })
    expect(fadedStyleOptions('baseline', paint, 2)).toEqual(fadedStyleOptions('baseline', paint, 1))
    expect(fadedStyleOptions('area', paint, -1)).toEqual(fadedStyleOptions('area', paint, 0))
  })

  it('leaves a bar style as it paints, since it has nothing to fade', () => {
    for (const style of ['candles', 'hollow', 'bars'] satisfies ChartStyleId[]) {
      expect(fadedStyleOptions(style, paint, 0.3), style).toEqual(styleOptions(style, paint))
    }
  })
})

describe('a mounted chart', () => {
  const bars: FeedBar[] = Array.from({ length: 40 }, (_, index) => bar(60 * (index + 1), 10 + index, 12 + index, 9 + index, 11 + index))
  const settle = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  async function mount(transitions?: TransitionOptions, style: ChartStyleId = 'candles') {
    let feed: SubscribeHandlers | null = null
    const datafeed: ChartDatafeed = {
      search: async () => ({ hits: [], hasMore: false }),
      resolve: async () => null,
      history: async () => ({ bars, noData: false }),
      subscribeBars: (_symbol, _tf, handlers) => {
        feed = handlers
        return () => undefined
      },
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed, symbol: 'ES', timeframe: '1m', style, ...(transitions ? { transitions } : {}) })
    widgets.push(widget)
    await widget.ready()
    await settle()
    return { widget, renderer: lastRenderer(), snapshot: () => feed?.onBars({ kind: 'snapshot', bars: [...bars] }) }
  }

  /** The series a style draws, oldest first: every visible series of the main pane. */
  const drawnBy = (renderer: FakeRenderer): FakeSeries[] => renderer.series.filter((s) => s.paneIndex === 0 && s.options.visible !== false)
  const kinds = (renderer: FakeRenderer): string[] => drawnBy(renderer).map((s) => s.kind)

  /** Asks the viewer's system for less motion, as `prefers-reduced-motion: reduce` does. */
  const reduceMotion = (): void => {
    const real = window.matchMedia.bind(window)
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const list = real(query)
      if (query.includes('prefers-reduced-motion')) Object.defineProperty(list, 'matches', { value: true })
      return list
    })
  }

  it('switches at once unless the host turns the morph on', async () => {
    const { widget, renderer } = await mount()
    expect(widget.commands.execute('chart.style.line').kind).toBe('ok')
    expect(kinds(renderer)).toEqual(['Line'])
  })

  it('keeps the bars and the line both on screen while a fold runs, and the line alone, in its own paint, once it ends', async () => {
    const plain = await mount()
    plain.widget.commands.execute('chart.style.line')
    const ownColor = drawnBy(plain.renderer)[0]!.options.color

    const { widget, renderer } = await mount({ style: true })
    expect(widget.commands.execute('chart.style.line').kind).toBe('ok')
    expect(kinds(renderer)).toEqual(['Candlestick', 'Line'])
    expect(drawnBy(renderer)[1]!.options.color).toMatch(/^rgba\(/)
    await settle(STYLE_MORPH_MS + 250)
    expect(kinds(renderer)).toEqual(['Line'])
    expect(drawnBy(renderer)[0]!.options.color).toBe(ownColor)
  })

  it('brings the bars back out of the line, and no repaint unfolds them while the morph does', async () => {
    const { widget, renderer, snapshot } = await mount({ style: true }, 'line')
    expect(widget.commands.execute('chart.style.candles').kind).toBe('ok')
    expect(kinds(renderer)).toEqual(['Line', 'Candlestick'])
    /** Whether every bar stands folded into its close. */
    const folded = (): boolean =>
      (drawnBy(renderer).find((s) => s.kind === 'Candlestick')!.data as { open: number; high: number; low: number; close: number }[]).every(
        (row) => row.open === row.close && row.high === row.close && row.low === row.close,
      )
    expect(folded()).toBe(true)
    snapshot()
    expect(folded()).toBe(true)
    await settle(STYLE_MORPH_MS + 250)
    expect(kinds(renderer)).toEqual(['Candlestick'])
    expect(folded()).toBe(false)
  })

  it('switches at once when the viewer asks for less motion', async () => {
    const { widget, renderer } = await mount({ style: true })
    reduceMotion()
    expect(widget.commands.execute('chart.style.line').kind).toBe('ok')
    expect(kinds(renderer)).toEqual(['Line'])
  })

  it('morphs only between a bar style and a close style', async () => {
    const { widget, renderer } = await mount({ style: true })
    expect(widget.commands.execute('chart.style.bars').kind).toBe('ok')
    expect(kinds(renderer)).toEqual(['Bar'])
  })
})
