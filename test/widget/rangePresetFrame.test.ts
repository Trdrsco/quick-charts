// @vitest-environment happy-dom
// A range load: a range preset that changes the interval reloads the chart, so its span is a
// pending intent that frames the load's first paint instead of measuring an empty series.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart } from '../../src/widget/create'
import { FeedUnavailableError, type ChartDatafeed, type FeedBar, type HistoryPage } from '../../src/datafeed'
import { lastRenderer, renderers } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const bar = (t: number, c = 100): FeedBar => ({ t, o: c, h: c + 1, l: c - 1, c, v: 10 })
const series = (count: number, stepSecs: number, start = 1_700_000_000): FeedBar[] =>
  Array.from({ length: count }, (_, i) => bar(start + i * stepSecs, 100 + i))

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/** A feed whose first history answer per timeframe is scripted, and whose older pages are always
 *  the end of history: these checks are about framing, not about paging. */
function framingFeed(script: (symbol: string, tf: string) => Promise<HistoryPage>) {
  const asks: { symbol: string; tf: string }[] = []
  const feed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => null,
    history: (symbol, tf, range = {}) => {
      if (range.to !== undefined) return Promise.resolve({ bars: [], noData: true })
      asks.push({ symbol, tf })
      return script(symbol, tf)
    },
    subscribeBars: () => () => undefined,
  }
  return { feed, asks }
}

const mounted: { dispose(): void }[] = []
afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  renderers.splice(0)
  document.body.replaceChildren()
})

function mount(feed: ChartDatafeed, timeframe: string) {
  const container = document.createElement('div')
  document.body.append(container)
  const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe })
  mounted.push(widget)
  return { widget, renderer: lastRenderer() }
}

describe('a range preset and the load it may trigger', () => {
  it('frames a same-interval preset immediately, against the data already on screen', async () => {
    const { feed } = framingFeed(async () => ({ bars: series(200, 60), noData: false }))
    const { widget, renderer } = mount(feed, '1m')
    await settle()
    const fit = vi.spyOn(renderer.chart.timeScale(), 'fitContent')

    expect(widget.commands.execute('chart.range.1D')).toEqual({ kind: 'ok' })
    expect(widget.activeChart().rangePreset()).toBe('1D')
    expect(renderer.logicalWrites).toEqual([{ from: 0, to: 203 }])
    expect(fit).not.toHaveBeenCalled()
    widget.activeChart().reset()
    expect(widget.activeChart().rangePreset()).toBeNull()
  })

  it('holds a changed-interval preset until its load paints, then frames the requested span rather than fitting content', async () => {
    const page = deferred<HistoryPage>()
    const { feed, asks } = framingFeed(async (_symbol, tf) => (tf === '1m' ? page.promise : { bars: series(120, 1_800), noData: false }))
    const { widget, renderer } = mount(feed, '30m')
    await settle()
    const fit = vi.spyOn(renderer.chart.timeScale(), 'fitContent')

    // 1D reads at one minute: the switch clears the model, so nothing can be framed yet.
    expect(widget.commands.execute('chart.range.1D')).toEqual({ kind: 'ok' })
    expect(widget.activeChart().rangePreset()).toBe('1D')
    expect(asks.map((a) => a.tf)).toEqual(['30m', '1m'])
    expect(renderer.logicalWrites).toEqual([])

    page.resolve({ bars: series(2_000, 60), noData: false })
    await settle()
    // One day of one-minute bars, ending on the last real bar with the chart's right margin.
    expect(renderer.logicalWrites).toEqual([{ from: 560, to: 2_003 }])
    expect(widget.activeChart().rangePreset()).toBe('1D')
    expect(fit).not.toHaveBeenCalled()
  })

  it('keeps only the last of two rapid presets', async () => {
    const minutes = deferred<HistoryPage>()
    const { feed } = framingFeed(async (_symbol, tf) => {
      if (tf === '1m') return minutes.promise
      if (tf === '1d') return { bars: series(1_000, 86_400), noData: false }
      return { bars: series(120, 1_800), noData: false }
    })
    const { widget, renderer } = mount(feed, '30m')
    await settle()

    widget.commands.execute('chart.range.1D')
    widget.commands.execute('chart.range.1Y')
    expect(widget.activeChart().rangePreset()).toBe('1Y')
    minutes.resolve({ bars: series(2_000, 60), noData: false })
    await settle()

    // Only the daily load frames, and it frames the year the last chip asked for.
    expect(widget.charts()[0]!.timeframe()).toBe('1d')
    expect(renderer.logicalWrites).toEqual([{ from: 635, to: 1_003 }])
  })

  it('drops the intent when the symbol changes while its load is away', async () => {
    const minutes = deferred<HistoryPage>()
    const { feed } = framingFeed(async (symbol, tf) => {
      if (symbol === 'NQ') return { bars: series(300, 60), noData: false }
      return tf === '1m' ? minutes.promise : { bars: series(120, 1_800), noData: false }
    })
    const { widget, renderer } = mount(feed, '30m')
    await settle()
    const fit = vi.spyOn(renderer.chart.timeScale(), 'fitContent')

    widget.commands.execute('chart.range.1D')
    widget.charts()[0]!.setSymbol('NQ')
    expect(widget.activeChart().rangePreset()).toBeNull()
    minutes.resolve({ bars: series(2_000, 60), noData: false })
    await settle()

    expect(fit).toHaveBeenCalledTimes(1)
    expect(renderer.logicalWrites).toEqual([])
  })

  it.each([
    { name: 'an empty answer', answer: async (): Promise<HistoryPage> => ({ bars: [], noData: true }) },
    { name: 'a refusal', answer: (): Promise<HistoryPage> => Promise.reject(new FeedUnavailableError('no feed', 'feed_requires_connection')) },
    { name: 'a transient failure', answer: (): Promise<HistoryPage> => Promise.reject(new Error('timeout')) },
  ])('drops the intent on $name, without throwing', async ({ answer }) => {
    const { feed } = framingFeed(async (_symbol, tf) => (tf === '1m' ? answer() : { bars: series(120, 1_800), noData: false }))
    const { widget, renderer } = mount(feed, '30m')
    await settle()

    widget.commands.execute('chart.range.1D')
    await settle()
    await settle()
    expect(renderer.logicalWrites).toEqual([])

    // The chart still answers: a later same-interval preset frames what is on screen.
    const { feed: served } = framingFeed(async () => ({ bars: series(200, 60), noData: false }))
    const second = mount(served, '1m')
    await settle()
    second.widget.commands.execute('chart.range.1D')
    expect(second.renderer.logicalWrites).toEqual([{ from: 0, to: 203 }])
  })

  it('leaves replay before it frames, so the span belongs to the reloaded interval', async () => {
    const { feed } = framingFeed(async (_symbol, tf) => ({ bars: tf === '1m' ? series(2_000, 60) : series(120, 1_800), noData: false }))
    const { widget, renderer } = mount(feed, '30m')
    await settle()
    const chart = widget.charts()[0]!
    // A RUNNING session, not just the armed question: the preset has to hand a painted slice back.
    chart.replay.start(1_700_000_000 + 90 * 1_800)
    expect(chart.replay.state().on).toBe(true)

    widget.commands.execute('chart.range.1D')
    await settle()
    expect(chart.replay.state().on).toBe(false)
    expect(renderer.logicalWrites).toEqual([{ from: 560, to: 2_003 }])
  })
})
