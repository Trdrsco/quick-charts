// Pane arithmetic: how many panes a chart holds after indicators come and go.
//
// A study placed in its own pane gets `chart.panes().length` as its index, which is only correct
// while the pane list is accurate. Every way of getting this wrong is invisible: an extra pane is
// not an error, it is a pane, and the renderer simply divides the chart's height by one more than
// it should. The study lands in the last pane, squeezed toward the renderer's minimum, and the
// symptom a viewer sees is a legend row offering to restore a pane nobody collapsed.
import { describe, expect, it } from 'vitest'
import type { IChartApi } from 'lightweight-charts'
import { attachIndicators } from '../src/indicatorRenderer'
import { attachIndicatorsPlane } from '../src/widget/indicators'
import { createChartI18n } from '../src/i18n'
import { createPriceFormatter } from '../src/priceFormatter'
import type { FeedBar } from '../src/datafeed'
import type { IndicatorPlots } from '../src/indicatorModel'

/** A chart that keeps an honest pane list: a series names the pane it joins, a removed series
 *  leaves its pane behind (the renderer is what sweeps empties), and removing a pane shifts every
 *  pane after it down, exactly as the real one does. */
function fakeChart() {
  const panes: { series: object[] }[] = [{ series: [] }]
  const chart = {
    addSeries(_type: unknown, _opts: unknown, paneIndex = 0) {
      while (panes.length <= paneIndex) panes.push({ series: [] })
      const s = {
        applyOptions() {},
        setData() {},
        priceScale: () => ({ applyOptions() {} }),
        createPriceLine: () => ({}),
        removePriceLine() {},
        attachPrimitive() {},
        detachPrimitive() {},
        getPane: () => ({ paneIndex: () => panes.findIndex((p) => p.series.includes(s)) }),
      }
      panes[paneIndex]!.series.push(s)
      return s
    },
    removeSeries(s: object) {
      for (const p of panes) {
        const at = p.series.indexOf(s)
        if (at >= 0) p.series.splice(at, 1)
      }
    },
    panes: () => panes.map((p, i) => ({ getSeries: () => p.series, getHeight: () => 100, paneIndex: () => i })),
    removePane(i: number) {
      panes.splice(i, 1)
    },
  }
  return { chart: chart as unknown as IChartApi, paneCount: () => panes.length }
}

const overlay: IndicatorPlots = {
  placement: 'overlay',
  title: 'Average',
  plots: [{ key: 'ma', type: 'line', color: '#fff', data: [{ time: 1 as never, value: 1 }] }],
}
const study: IndicatorPlots = {
  placement: 'pane',
  title: 'Oscillator',
  plots: [{ key: 'osc', type: 'line', color: '#fff', data: [{ time: 1 as never, value: 1 }] }],
}

function renderer(chart: IChartApi) {
  return attachIndicators(chart, { candles: () => null, neutral: () => '#888' })
}

describe('one pane-placed study means exactly one study pane', () => {
  it('after the first paint', () => {
    const { chart, paneCount } = fakeChart()
    const r = renderer(chart)
    r.render('sma-20', overlay)
    r.render('osc-1', study)
    expect(paneCount()).toBe(2) // the price pane and the study's
  })

  it('after a recompute paints the same shapes again', () => {
    // Every tick and every theme change repaints. A pane per repaint would grow without bound.
    const { chart, paneCount } = fakeChart()
    const r = renderer(chart)
    for (let i = 0; i < 3; i++) {
      r.render('sma-20', overlay)
      r.render('osc-1', study)
    }
    expect(paneCount()).toBe(2)
  })

  it('after a reshape rebuilds the study from scratch', () => {
    // A re-published script or a definition swap under the same id rebuilds the entry. The old
    // pane has to go with it, or the new series is placed one pane too far down.
    const { chart, paneCount } = fakeChart()
    const r = renderer(chart)
    r.render('sma-20', overlay)
    r.render('osc-1', study)
    r.render('osc-1', { ...study, plots: [...study.plots, { key: 'sig', type: 'line', color: '#0f0', data: [] }] })
    expect(paneCount()).toBe(2)
    expect(r.paneOf()['osc-1']).toBe(1)
  })

  it('after the study goes unavailable and comes back', () => {
    // The feed loses volume, or a subsession filter empties the window: the study is removed and
    // later restored. It must come back to the same pane, not to a new one below the last.
    const { chart, paneCount } = fakeChart()
    const r = renderer(chart)
    r.render('sma-20', overlay)
    r.render('osc-1', study)
    r.render('osc-1', { ...study, unavailable: 'no volume' })
    expect(paneCount()).toBe(1) // the pane goes with it
    r.render('osc-1', study)
    expect(paneCount()).toBe(2)
    expect(r.paneOf()['osc-1']).toBe(1)
  })

  it('even when a pane was left behind before it was placed', () => {
    // The regression this exists for. A pane nobody swept counts the same as a real one, so the
    // study is placed BELOW it: three panes for one study, the study squeezed into the last of
    // them and an empty pane keeping its share of the height. The index has to be counted from a
    // pane list that holds only panes something is using.
    const { chart, paneCount } = fakeChart()
    const stray = chart.addSeries(null as never, {}, 1) // a pane created, then emptied and not swept
    chart.removeSeries(stray)
    expect(paneCount()).toBe(2) // the empty pane is still there

    const r = renderer(chart)
    r.render('sma-20', overlay)
    r.render('osc-1', study)
    expect(paneCount()).toBe(2) // the leftover is gone, not counted
    expect(r.paneOf()['osc-1']).toBe(1) // and the study is not one pane too low
  })

  it('and the study never lands below the last pane', () => {
    const { chart } = fakeChart()
    const r = renderer(chart)
    r.render('sma-20', overlay)
    r.render('osc-1', study)
    expect(r.paneOf()['osc-1']).toBe(1)
  })
})

// ── the same rule through the widget's own indicator plane ──────────────────────────────────────
//
// The renderer above is exercised directly, one render call at a time. The plane is what the widget
// actually drives, and it decides how many times the renderer is called per mount: `set` prunes
// then recomputes, every tick recomputes again, and a definition that cannot be computed yet is
// skipped rather than rendered. A mount that rendered a pane study twice would leave a pane behind
// the same way, so the count is pinned here too, over the same fake chart.
describe('the widget plane places one study pane and keeps it there', () => {
  const planeDeps = (chart: IChartApi, feed: { bars: readonly FeedBar[] }) => ({
    chart,
    candleSeries: () => null,
    bars: () => feed.bars,
    i18n: createChartI18n(),
    formatter: () => createPriceFormatter({ pricescale: 100, minmov: 1 }),
    formatKey: () => 'test',
    minMove: () => 0.01,
    // Only the neutral ink is read on this path; the rest of the theme never reaches it.
    canvas: () => ({ neutral: '#888' }) as never,
    disposed: () => false,
    onChips: () => {},
    onEvent: () => {},
  })

  const bars: FeedBar[] = Array.from({ length: 40 }, (_, i) => ({ t: (i + 1) * 60, o: 1, h: 2, l: 0.5, c: 1 + i / 40, v: 10 }))
  const line = { kind: 'line' as const }
  const average = { manifest: { name: 'AVG', pane: 'overlay' as const, plots: { ma: line } }, compute: (b: readonly FeedBar[]) => ({ ma: b.map((x) => x.c) }) }
  const oscillator = { manifest: { name: 'OSC', pane: 'pane' as const, plots: { osc: line } }, compute: (b: readonly FeedBar[]) => ({ osc: b.map((x) => x.c) }) }

  it('after the first paint, and after every recompute after it', () => {
    const { chart, paneCount } = fakeChart()
    const plane = attachIndicatorsPlane(planeDeps(chart, { bars }))
    plane.set([
      { id: 'sma-20', definition: average },
      { id: 'osc-1', definition: oscillator },
    ])
    expect(paneCount()).toBe(2)
    expect(plane.renderer.paneOf()['osc-1']).toBe(1)

    // Ticks, theme changes and symbol formats all land here.
    plane.recompute()
    plane.recompute()
    expect(paneCount()).toBe(2)
    expect(plane.renderer.paneOf()['osc-1']).toBe(1)
    plane.destroy()
  })

  it('and across a mount that starts before the bars arrive', () => {
    // The widget mounts and recomputes before the feed has answered, then again once it has. The
    // empty round draws nothing, so it must place nothing: a pane created for a study with no data
    // is a pane the real study is then placed below.
    const { chart, paneCount } = fakeChart()
    const feed: { bars: readonly FeedBar[] } = { bars: [] }
    const plane = attachIndicatorsPlane(planeDeps(chart, feed))
    plane.set([
      { id: 'sma-20', definition: average },
      { id: 'osc-1', definition: oscillator },
    ])
    expect(paneCount()).toBe(1) // nothing to draw yet, so nothing placed

    feed.bars = bars
    plane.recompute()
    expect(paneCount()).toBe(2)
    expect(plane.renderer.paneOf()['osc-1']).toBe(1)
    plane.destroy()
  })

  it('and when the study is hidden and shown again', () => {
    // Hiding takes the series down but keeps the legend row. Showing it again must return it to
    // its own pane, not to a new one below whatever is left.
    const { chart, paneCount } = fakeChart()
    const plane = attachIndicatorsPlane(planeDeps(chart, { bars }))
    plane.set([
      { id: 'sma-20', definition: average },
      { id: 'osc-1', definition: oscillator },
    ])
    plane.toggleHidden('osc-1')
    expect(paneCount()).toBe(1)
    plane.toggleHidden('osc-1')
    expect(paneCount()).toBe(2)
    expect(plane.renderer.paneOf()['osc-1']).toBe(1)
    plane.destroy()
  })
})
