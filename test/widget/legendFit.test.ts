// @vitest-environment happy-dom
// HOW THE LEGEND GIVES WAY. Three steps, tested where each one actually lives: the wrap is the
// header recipe, the compact and slim answers are `legendFit`'s decision, and what a compact or
// slim legend shows is the stylesheet's.
//
// The decision is tested as the pure function it is, because the widths it reads come off a live
// layout and this environment has none: every element here measures zero. So the browser's part
// (measuring) is not pinned here; the arithmetic and the recipes it drives are. A close-only chart
// style takes no measurement at all, so that path IS driven end to end through a real chart.
import { authoredStylesheets } from '../theme/stylesheetSource'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  COMPACT_RELEASE,
  INITIAL_LEGEND_FIT,
  SLIM_WIDTH,
  nextLegendFit,
  sameLegendFit,
  type LegendFit,
} from '../../src/legendFit'
import { createChart } from '../../src/widget/create'
import type { ChartDatafeed, FeedBar } from '../../src/datafeed'
import type { SymbolInfo } from '../../src/symbology'

vi.mock('lightweight-charts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('lightweight-charts')>()
  const { createFakeChart } = await import('./rendererFake')
  return { ...actual, createChart: createFakeChart }
})

/** The authored structural stylesheet, read the way every theme fixture reads it. */
const CSS = authoredStylesheets()['/src/styles/quickcharts.css']!

const wide = { paneWidth: 1200, quoteWidth: 300, legendWidth: 900, valueShaped: false }

describe('the reading compacts when it cannot fit its line', () => {
  it('stands the open, high and low down once the reading outgrows the room it was given', () => {
    const fit = nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, paneWidth: 420, quoteWidth: 400, legendWidth: 380 })
    expect(fit.compact).toBe(true)
    // The width it compacted AT is what the release is later measured against.
    expect(fit.compactAt).toBe(420)
  })

  it('keeps the whole reading while it still fits, and records no width to release from', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, wide)).toEqual({ compact: false, compactAt: 0, slim: false })
  })

  it('treats a reading exactly one pixel under the room as fitting, which is the measurement’s own rounding', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, quoteWidth: 379, legendWidth: 380 }).compact).toBe(false)
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, quoteWidth: 380, legendWidth: 380 }).compact).toBe(true)
  })

  it('decides nothing at all before the layout has answered a width', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { paneWidth: 0, quoteWidth: 0, legendWidth: 0, valueShaped: false })).toEqual(
      INITIAL_LEGEND_FIT,
    )
  })
})

describe('the compact answer latches, so hiding marks cannot un-hide them', () => {
  const latched: LegendFit = { compact: true, compactAt: 420, slim: false }

  it('holds compact at the width it compacted at, however roomy the shortened reading now looks', () => {
    // The shortened reading fits easily. That is the compaction working, not room to undo it.
    expect(nextLegendFit(latched, { paneWidth: 420, quoteWidth: 90, legendWidth: 380, valueShaped: false }).compact).toBe(true)
  })

  it('holds compact while the pane grows by less than the release', () => {
    expect(nextLegendFit(latched, { ...wide, paneWidth: 420 + COMPACT_RELEASE }).compact).toBe(true)
  })

  it('gives the whole reading back once the pane grows meaningfully past that width', () => {
    const released = nextLegendFit(latched, { ...wide, paneWidth: 420 + COMPACT_RELEASE + 1 })
    expect(released).toMatchObject({ compact: false, compactAt: 0 })
  })

  it('re-latches at the NEW width if the whole reading still does not fit there', () => {
    const released = nextLegendFit(latched, { ...wide, paneWidth: 560 })
    const again = nextLegendFit(released, { paneWidth: 560, quoteWidth: 400, legendWidth: 380, valueShaped: false })
    expect(again).toMatchObject({ compact: true, compactAt: 560 })
  })
})

describe('a slim pane sheds context, and does so independently of the reading', () => {
  it.each([
    [SLIM_WIDTH - 1, true],
    [SLIM_WIDTH, false],
    [SLIM_WIDTH + 400, false],
  ])('reads a %ipx pane as slim=%s', (paneWidth, slim) => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, paneWidth }).slim).toBe(slim)
  })

  it('does not call an unmeasured pane slim', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, paneWidth: 0 }).slim).toBe(false)
  })

  it('answers slim and compact on separate evidence: a wide pane can compact, a slim one need not', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { paneWidth: 1200, quoteWidth: 999, legendWidth: 300, valueShaped: false })).toMatchObject({
      compact: true,
      slim: false,
    })
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, paneWidth: 400 })).toMatchObject({ compact: false, slim: true })
  })
})

describe('a close-only chart style needs no measurement', () => {
  it('reads compact at any width, because there is no open, high or low painted to show', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, valueShaped: true })).toMatchObject({ compact: true })
  })

  it('records no latch width, so leaving the style has nothing to wait out', () => {
    const shaped = nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, valueShaped: true })
    expect(shaped.compactAt).toBe(0)
  })

  it('still answers slim on the pane’s own width', () => {
    expect(nextLegendFit(INITIAL_LEGEND_FIT, { ...wide, paneWidth: 400, valueShaped: true })).toMatchObject({ compact: true, slim: true })
  })
})

describe('sameLegendFit', () => {
  it('is true only when every part agrees, so an unchanged frame writes no attribute', () => {
    expect(sameLegendFit(INITIAL_LEGEND_FIT, { compact: false, compactAt: 0, slim: false })).toBe(true)
    expect(sameLegendFit(INITIAL_LEGEND_FIT, { compact: false, compactAt: 0, slim: true })).toBe(false)
    expect(sameLegendFit(INITIAL_LEGEND_FIT, { compact: false, compactAt: 12, slim: false })).toBe(false)
  })
})

// ── What the answer DOES to the legend. The state is written on the root; the stylesheet keys on
// it. These pin the pair, since neither half is any use without the other.
describe('the stylesheet stands the readouts down on the state the legend writes', () => {
  it('hides every OHLC group but the close under compact, and nothing under a whole reading', () => {
    expect(CSS).toContain(".qc-legend[data-qc-compact='true'] .qc-legend-ohlc:not([data-qc-ohlc='close'])")
    // The change rides along with the close: it is the other half of what a compact reading says.
    expect(CSS).not.toContain("data-qc-compact='true'] .qc-legend-change")
  })

  it('hides the venue and its separator together under slim, and keeps the interval', () => {
    expect(CSS).toContain("[data-qc-slim='true'] [data-role='legend-exchange']")
    expect(CSS).toContain("[data-qc-slim='true'] [data-role='legend-exchange-sep']")
    expect(CSS).not.toContain("[data-qc-slim='true'] [data-role='legend-timeframe']")
  })

  it('wraps the header rather than clipping it, and truncates only the market’s own name', () => {
    const header = CSS.slice(CSS.indexOf('.qc-legend-header'), CSS.indexOf('.qc-legend-symbol'))
    expect(header).toContain('flex-wrap: wrap')
    const symbol = CSS.slice(CSS.indexOf('[data-qc-theme] .qc-legend-symbol'), CSS.indexOf('button.qc-legend-symbol'))
    expect(symbol).toContain('text-overflow: ellipsis')
    expect(symbol).toContain('max-width: 100%')
  })
})

describe('a real chart writes the state its style calls for', () => {
  const mounted: { dispose(): void }[] = []
  afterEach(() => {
    for (const widget of mounted.splice(0)) widget.dispose()
    document.body.replaceChildren()
  })

  const bars: FeedBar[] = Array.from({ length: 6 }, (_, i) => ({ t: 1_700_000_000 + i * 60, o: 10, h: 11, l: 9, c: 10 + i, v: 5 }))
  const symbol: SymbolInfo = {
    ticker: 'CME_MINI:ES1!',
    name: 'ESZ2026',
    description: '',
    exchange: 'CME',
    listedExchange: 'CME',
    type: 'futures',
    supportedResolutions: [],
    timezone: 'America/New_York',
    session: '1700-1600',
    dataStatus: 'streaming',
    volumePrecision: 0,
    format: { pricescale: 100, minmov: 1 },
  }
  const feed: ChartDatafeed = {
    search: async () => ({ hits: [], hasMore: false }),
    resolve: async () => symbol,
    history: async () => ({ bars: [...bars], noData: false }),
    subscribeBars: () => () => undefined,
  }
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

  const mount = async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const widget = createChart({ container, datafeed: feed, symbol: 'ES', timeframe: '1m', features: { drawings: false } })
    mounted.push(widget)
    await settle()
    /** A style change takes the chart's own command, which is the one path a picker or a shortcut
     *  uses; nothing here reaches past it into the legend. */
    const setStyle = async (style: string): Promise<void> => {
      widget.commands.execute(`chart.style.${style}`)
      await settle()
    }
    const legend = (): HTMLElement => container.querySelector<HTMLElement>('.qc-legend')!
    return { container, setStyle, legend }
  }

  it('opens on a candle style with the whole reading standing', async () => {
    const { legend } = await mount()
    expect(legend().dataset.qcCompact).toBe('false')
  })

  it.each(['line', 'area', 'baseline', 'stepline'])('reads compact under the close-only %s style', async (style) => {
    const { setStyle, legend } = await mount()
    await setStyle(style)
    expect(legend().dataset.qcCompact).toBe('true')
  })

  it.each(['candles', 'hollow', 'bars'])('gives the whole reading back under the OHLC-shaped %s style', async (style) => {
    const { setStyle, legend } = await mount()
    await setStyle('line')
    expect(legend().dataset.qcCompact).toBe('true')
    await setStyle(style)
    expect(legend().dataset.qcCompact).toBe('false')
  })

  it('names each OHLC group, so the compact recipe can find the close among them', async () => {
    const { container } = await mount()
    const groups = [...container.querySelectorAll<HTMLElement>('.qc-legend-ohlc')].map((el) => el.dataset.qcOhlc)
    expect(groups).toEqual(['open', 'high', 'low', 'close'])
  })

  it('names the venue’s separator so slim takes the pair, never a stray dot', async () => {
    const { legend } = await mount()
    expect(legend().querySelector('[data-role="legend-exchange-sep"]')).not.toBeNull()
    expect(legend().querySelector<HTMLElement>('[data-role="legend-exchange"]')!.textContent).toBe('CME')
  })

  it('keeps the OHLC nodes mounted while compact, so widening brings them back rather than rebuilding', async () => {
    const { container, setStyle } = await mount()
    const open = container.querySelector<HTMLElement>('[data-qc-ohlc="open"]')!
    await setStyle('line')
    expect(container.querySelector('[data-qc-ohlc="open"]')).toBe(open)
    await setStyle('candles')
    expect(container.querySelector('[data-qc-ohlc="open"]')).toBe(open)
  })

  it('has no legend-built compare door and no price-scale chips to give way', async () => {
    const { legend } = await mount()
    expect(legend().querySelector('.qc-legend-scales')).toBeNull()
  })
})
