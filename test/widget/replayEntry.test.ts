// @vitest-environment happy-dom
// Entering bar replay ASKS where to begin. Everything here is that one sentence read back from the
// running widget: the window stays whole while the question is open, the legend's mark says which
// of the two states the chart is in, and answering the question moves the cursor inside the one
// session rather than leaving and re-entering.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import { renderers } from './rendererFake'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

const FIRST = 1_700_000_000
const COUNT = 40
const bar = (t: number): FeedBar => ({ t, o: 100, h: 101, l: 99, c: 100, v: 1 })
const feed: ChartDatafeed = {
  search: async () => ({ hits: [], hasMore: false }),
  resolve: async (symbol) => ({ symbol, name: symbol, type: 'future', exchange: 'X', timezone: 'UTC', resolutions: ['1m'], priceFormat: { type: 'decimal', precision: 2, minMove: 0.25 } }) as never,
  history: async () => ({ bars: Array.from({ length: COUNT }, (_, i) => bar(FIRST + i * 60)), noData: false }),
  subscribeBars: () => () => undefined,
}

const mounted: { dispose(): void }[] = []
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  for (const widget of mounted.splice(0)) widget.dispose()
  renderers.splice(0)
  document.body.replaceChildren()
})

async function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', features: { replay: true } })
  mounted.push(widget)
  await widget.ready()
  await settle()
  const chart = widget.activeChart()
  const renderer = renderers[0]!
  /** The candles actually handed to the renderer: what a viewer can see, not what is loaded. */
  const painted = (): number => renderer.series.find((s) => s.kind === 'Candlestick')!.data.length
  const pill = (): HTMLElement => container.querySelector<HTMLElement>('.qc-legend-replay')!
  return { container, widget, chart, renderer, painted, pill }
}

describe('entering bar replay', () => {
  it('arms on the WHOLE window instead of choosing a starting point for the viewer', async () => {
    const { chart, painted } = await mount()
    const loaded = painted()
    expect(loaded).toBe(COUNT)

    chart.replay.start()
    // The question is open, so nothing has been rewound past: a viewer picks their start from the
    // window that is in front of them, not from the three quarters of it left after a guess.
    expect(chart.replay.phase()).toBe('arming')
    expect(chart.replay.state().on).toBe(false)
    expect(painted()).toBe(loaded)
  })

  it('wears the quiet mark while arming and the lit one once a session runs', async () => {
    const { chart, pill } = await mount()

    chart.replay.start()
    expect(pill().hidden).toBe(false)
    expect(pill().dataset.qcPhase).toBe('arming')

    chart.replay.start(FIRST + 20 * 60)
    expect(pill().dataset.qcPhase).toBe('on')

    chart.replay.exit()
    expect(pill().hidden).toBe(true)
    expect(pill().dataset.qcPhase).toBe('off')
  })

  it('brings the transport up with the question and takes it down with replay itself', async () => {
    const { container, chart } = await mount()
    expect(container.querySelector('.qc-replay')).toBeNull()

    chart.replay.start()
    // The transport IS the thing that asks, so it stands with the question rather than appearing
    // once the answer has already been given.
    expect(container.querySelector('.qc-replay')).not.toBeNull()

    const row = container.querySelector('.qc-replay')
    chart.replay.start(FIRST + 20 * 60)
    // The SAME row: picking a bar is an answer, not an exit and a fresh entry.
    expect(container.querySelector('.qc-replay')).toBe(row)

    chart.replay.exit()
    expect(container.querySelector('.qc-replay')).toBeNull()
  })

  it('paints the cursor slice from the whole loaded window, not from a slice of itself', async () => {
    const { chart, painted } = await mount()
    chart.replay.start()
    chart.replay.start(FIRST + 30 * 60)
    const late = chart.replay.state()
    expect(painted()).toBe(late.cursor)
    expect(late.total).toBe(COUNT)

    // Moving BACK to an earlier bar still counts against the full window. A restart that
    // re-snapshotted the master from the painted slice would shrink the total every time.
    chart.replay.start(FIRST + 10 * 60)
    const early = chart.replay.state()
    expect(early.cursor).toBeLessThan(late.cursor)
    expect(early.total).toBe(COUNT)
    expect(painted()).toBe(early.cursor)
  })

  it('draws the arming guide down the PLOT, clear of the time axis and its labels', async () => {
    const { container, chart, renderer } = await mount()
    chart.replay.start()
    const guide = container.querySelector<HTMLElement>('.qc-replay-guide')!
    expect(guide.hidden).toBe(true)

    renderer.fireCrosshair(FIRST + 12 * 60, 240)
    expect(guide.hidden).toBe(false)
    expect(guide.style.insetInlineStart).toBe('240px')
    // The axis owns the band below the plot, including the crosshair label naming the very moment
    // the rule is pointing at. A guide that ran to the container's floor would cover it.
    expect(Number.parseFloat(guide.style.insetBlockEnd)).toBe(renderer.chart.timeScale().height())
    expect(Number.parseFloat(guide.style.insetBlockEnd)).toBeGreaterThan(0)
    // The shears ride the rule rather than standing anywhere else on the wash.
    expect(guide.querySelector('.qc-replay-cut')).not.toBeNull()

    chart.replay.start(FIRST + 12 * 60)
    // A running session has no question open, so the guide and its mark leave with the arming.
    expect(guide.hidden).toBe(true)
  })

  it('ties Select bar, the marks and the crosshair to the one arming state', async () => {
    const { container, chart, renderer } = await mount()
    const selectBar = (): HTMLButtonElement => container.querySelector<HTMLButtonElement>('.qc-replay-start')!
    const guide = (): HTMLElement => container.querySelector<HTMLElement>('.qc-replay-guide')!
    const pane = (): HTMLElement => container.querySelector<HTMLElement>('.qc-pane')!

    chart.replay.start()
    // Select bar reads HELD because the session is arming. The control does not hold a second
    // opinion about that: it draws the phase.
    expect(selectBar().getAttribute('aria-pressed')).toBe('true')
    expect(pane().getAttribute('data-qc-replay-arming')).toBe('true')

    renderer.fireClick(FIRST + 15 * 60)
    // The bar is chosen, so the question is answered: the control goes up, the plot's marks leave,
    // and the pointer goes back to being the ordinary crosshair for the running session.
    expect(chart.replay.phase()).toBe('on')
    expect(selectBar().getAttribute('aria-pressed')).toBe('false')
    expect(guide().hidden).toBe(true)
    expect(pane().hasAttribute('data-qc-replay-arming')).toBe(false)

    // Pressing it again asks again, mid-session, without leaving replay.
    selectBar().click()
    expect(chart.replay.phase()).toBe('arming')
    expect(selectBar().getAttribute('aria-pressed')).toBe('true')
    expect(pane().getAttribute('data-qc-replay-arming')).toBe('true')
    expect(chart.replay.state().on).toBe(true)

    renderer.fireClick(FIRST + 25 * 60)
    expect(selectBar().getAttribute('aria-pressed')).toBe('false')
    expect(pane().hasAttribute('data-qc-replay-arming')).toBe(false)
  })

  it('leaves replay from the armed state, so the question can be withdrawn', async () => {
    const { container, chart } = await mount()
    chart.replay.start()
    chart.replay.exit()
    expect(chart.replay.phase()).toBe('off')
    expect(container.querySelector('.qc-replay')).toBeNull()
  })
})

describe('the product mark on the plot', () => {
  it('is on every chart, with no option that removes it', async () => {
    const { container } = await mount()
    const corner = container.querySelector<HTMLElement>('.qc-plot-corner')!
    // The attribution the library is given away on: the chart draws it, not a host, and there is no
    // feature flag, option or verb that takes it off.
    expect(corner).not.toBeNull()
    expect(corner.querySelector('svg')).not.toBeNull()
    expect(corner.getAttribute('aria-hidden')).toBe('true')
  })

  it('stands inside the plot and moves with it, never onto an axis or the transport row', async () => {
    const { container, chart, renderer } = await mount()
    const corner = container.querySelector<HTMLElement>('.qc-plot-corner')!

    // Above the time axis, whatever height the axis reports.
    expect(Number.parseFloat(corner.style.insetBlockEnd)).toBe(renderer.chart.timeScale().height())
    // Inside the leading price scale. With none, it sits on the plot's own edge.
    expect(Number.parseFloat(corner.style.insetInlineStart)).toBe(0)

    // A scale appearing beside it, as a comparison on its own scale does, moves it in rather than
    // leaving it over the numbers.
    renderer.scaleWidths.left = 64
    chart.setStyle('line')
    expect(Number.parseFloat(corner.style.insetInlineStart)).toBe(64)

    // It lives in the PANE, so the transport row opening below the grid cannot reach it: the pane
    // gives up the height and carries the corner with it.
    chart.replay.start()
    expect(container.querySelector('.qc-replay')).not.toBeNull()
    expect(corner.closest('.qc-pane')).not.toBeNull()
    expect(corner.closest('.qc-replay')).toBeNull()
  })
})

describe('the time-click dispatch', () => {
  it('does not hand a listener the click that subscribed it', async () => {
    const { chart, renderer } = await mount()
    let calls = 0
    // The transport does exactly this: it answers a picked bar by re-arming for the next pick. A
    // dispatch over the live subscriber set would hand that new picker the click that created it,
    // and each answer would arm again until the tab stopped responding.
    const resubscribe = (): void => {
      calls += 1
      if (calls > 8) return
      chart.sync.onTimeClick(resubscribe)
    }
    chart.sync.onTimeClick(resubscribe)

    renderer.fireClick(FIRST + 5 * 60)
    expect(calls).toBe(1)
  })

  it('picks a starting point without leaving replay', async () => {
    const { chart, renderer, painted } = await mount()
    const seen: boolean[] = []
    chart.on('replay', (state) => seen.push(state.on))

    chart.replay.start()
    renderer.fireClick(FIRST + 15 * 60)

    expect(chart.replay.phase()).toBe('on')
    expect(chart.replay.state().total).toBe(COUNT)
    expect(painted()).toBe(chart.replay.state().cursor)
    // Once a session is running it never reports off again inside the pick. The reports before it
    // are the question being put and then stood down; an exit would have come AFTER the start, and
    // would have taken the transport down inside the click that asked for the start.
    expect(seen).toContain(true)
    expect(seen.lastIndexOf(false)).toBeLessThan(seen.indexOf(true))
  })
})

describe('the first available date', () => {
  it('walks the feed back to its first bar, a page at a time, and opens the session there', async () => {
    const all = Array.from({ length: 4_500 }, (_, i) => bar(FIRST + i * 60))
    // A feed that serves its history newest first, a page per ask, and has nothing before its first bar.
    const deep: ChartDatafeed = {
      ...feed,
      history: async (_symbol, _tf, range) => {
        const upTo = all.filter((b) => b.t <= (range?.to ?? Number.POSITIVE_INFINITY))
        const page = upTo.slice(-(range?.countBack ?? upTo.length))
        return { bars: page, noData: page.length === 0 }
      },
    }
    const container = document.createElement('div')
    document.body.append(container)
    const widget = createChart({ container, datafeed: deep, symbol: 'ES', timeframe: '1m', features: { replay: true } })
    mounted.push(widget)
    await widget.ready()
    await settle()
    const chart = widget.activeChart()
    expect(chart.replay.state().on).toBe(false)

    expect(widget.commands.execute('chart.replay.startFirst').kind).toBe('ok')
    for (let i = 0; i < 50 && !chart.replay.state().on; i++) await settle()
    // The session holds every bar the feed serves and stands at its very first ones.
    expect(chart.replay.state()).toMatchObject({ on: true, total: all.length, cursor: 2 })
  })
})
