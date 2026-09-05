// One resolved formatter on every price-bearing surface: the axis, OHLC legend, crosshair, drawing
// labels, marks, indicator price plots, and exported image all write through one resolved Quick Charts
// formatter. kernel.test.ts pins in source which surface reads which formatter;
// this file drives the surfaces that can be driven, with every fixture symbol, so the text a Treasury
// axis, a satoshi drawing label and a variable-tick study scale write is the text `createPriceFormatter`
// writes, and nothing on the way keeps a decimal count of its own.
//
// What each surface is, and how it is reached here:
//   axis, crosshair and last-price label   the main series' price format: a custom formatter over the
//                                          symbol formatter and the symbol's own smallest move
//   level menu and copy-price              the context-menu rows the widget composes from formatted text
//   drawing labels                         the drawing seam's price-format port, on an axis pill
//   indicator price plots                  the study scale's fallback format, the same shape as the axis
//   exported image                         the renderer's own screenshot, which paints the axis above
import type { IChartApi } from 'lightweight-charts'
import { describe, expect, it } from 'vitest'
import { attachIndicators, chartContextMenu, createPriceFormatter, type IndicatorPlots, type PriceFormat } from '../../src/index'
import { drawingTools } from '../../src/drawings/index'
import { minMoveOf } from '../../src/widget/chart'
import chartSrc from '../../src/widget/chart.ts?raw'
import createSrc from '../../src/widget/create.ts?raw'
import indicatorsSrc from '../../src/widget/indicators.ts?raw'
import rendererSrc from '../../src/indicatorRenderer.ts?raw'
import vectors from '../fixtures/quoteVectors.json'

interface Case {
  id: string
  symbol: string
  format: PriceFormat
  precision: number
  prices: { value: number; display: string }[]
}

const CASES = vectors.cases.filter((c) => !('punctuation' in c)) as unknown as Case[]

/** A chart that hands back the series options it was asked to apply, so the study scale's format can
 *  be read after the renderer applies it. */
function fakeChart() {
  const applied: Record<string, unknown>[] = []
  const chart = {
    addSeries() {
      const series = {
        applyOptions(o: Record<string, unknown>) {
          applied.push(o)
        },
        setData() {},
        priceScale: () => ({ applyOptions() {} }),
        createPriceLine: () => ({}),
        removePriceLine() {},
        attachPrimitive() {},
        detachPrimitive() {},
        getPane: () => ({ paneIndex: () => 0 }),
      }
      return series
    },
    removeSeries() {},
    panes: () => [{ getSeries: () => [], getHeight: () => 100, paneIndex: () => 0 }],
    removePane() {},
  }
  return { chart: chart as unknown as IChartApi, applied }
}

describe('for every fixture symbol', () => {
  for (const c of CASES) {
    describe(`${c.id} (${c.symbol})`, () => {
      const formatter = createPriceFormatter(c.format)

      it('the axis, crosshair and last-price label take the symbol formatter and the symbol grid', () => {
        // The shape the chart hands the renderer, built here exactly as chart.ts builds it.
        const priceFormat = { type: 'custom' as const, formatter: (price: number) => formatter.format(price), minMove: minMoveOf(c.format) }
        for (const { value, display } of c.prices) expect(priceFormat.formatter(value)).toBe(display)
        expect(priceFormat.minMove).toBe(c.format.minmov / c.format.pricescale)
      })

      it('the level menu quotes the price in the same text, and copy-price writes it', () => {
        for (const { value, display } of c.prices) {
          const rows = chartContextMenu({ priceText: formatter.format(value), symbol: c.symbol, indicatorCount: 0, drawingCount: 0 })
          const labels = rows.map((r) => (r.kind === 'item' ? r.label : ''))
          expect(labels.some((l) => l.endsWith(display)), display).toBe(true)
        }
      })

      it('a drawing label writes through the port, at every magnitude the fixture names', () => {
        for (const { value, display } of c.prices) {
          const line = drawingTools.create('horizontal_line', `hl-${value}`, [{ time: 1_700_000_000 as never, price: value }])!
          line.setPriceFormatter((price) => formatter.format(price))
          const pill = (line as unknown as { priceAxisViews(): { text(): string }[] }).priceAxisViews()[0]
          expect(pill, 'the horizontal line carries an axis pill').toBeDefined()
          expect(pill!.text()).toBe(display)
          const label = drawingTools.create('price_label', `pl-${value}`, [{ time: 1_700_000_000 as never, price: value }])!
          label.setPriceFormatter((price) => formatter.format(price))
          expect(label.isValid()).toBe(true)
        }
      })

      it('a study without a precision of its own takes the symbol formatter on its scale', () => {
        const { chart, applied } = fakeChart()
        const renderer = attachIndicators(chart, {
          symbolPriceFormat: () => ({ key: c.id, formatter: (price: number) => formatter.format(price), minMove: minMoveOf(c.format) }),
        })
        const study: IndicatorPlots = { placement: 'pane', title: 'Study', plots: [{ key: 'v', type: 'line', color: '#fff', data: [{ time: 1 as never, value: 1 }] }] }
        renderer.render('study', study)
        const priceFormat = applied.map((o) => o.priceFormat as { type: string; formatter?: (p: number) => string; minMove?: number } | undefined).find((f) => f?.type === 'custom')
        expect(priceFormat, 'the study series took a custom price format').toBeDefined()
        for (const { value, display } of c.prices) expect(priceFormat!.formatter!(value)).toBe(display)
        expect(priceFormat!.minMove).toBe(minMoveOf(c.format))
        renderer.destroy()
      })
    })
  }
})

describe('the wiring that makes those the same formatter', () => {
  it('the chart builds one symbol formatter per resolve and hands it to every surface', () => {
    expect(chartSrc).toContain("const priceFormat = { type: 'custom' as const, formatter: (price: number) => symbolFormatter.format(price), minMove: minMoveOf(format) }")
    expect(chartSrc).toContain('drawings.setPricing(format ? minMoveOf(format) : null, (price) => symbolFormatter.format(price))')
    expect(chartSrc).toContain('formatter: () => ({ format: (price) => symbolFormatter.format(price)')
    // The indicators plane is handed the live formatter and its key, and builds the study scale's
    // fallback format from them.
    expect(chartSrc).toMatch(/formatter: \(\) => symbolFormatter,\s*formatKey,/)
    expect(indicatorsSrc).toContain('symbolPriceFormat: () => ({ key: deps.formatKey(), formatter: (price) => deps.formatter().format(price), minMove: deps.minMove() })')
  })

  it('the legend rows write a study value through the symbol formatter unless the manifest declares a precision', () => {
    expect(indicatorsSrc).toContain("built.precision != null ? value.toFixed(built.precision) : formatter.format(value)")
  })

  it('the study scale falls back to the symbol format the same way the axis is built', () => {
    expect(rendererSrc).toContain("{ type: 'custom' as const, formatter: symbolFormat.formatter, minMove: symbolFormat.minMove }")
  })

  it('the exported image is the renderer screenshot, so its axis text is the axis text', () => {
    expect(chartSrc).toContain('screenshot: () => chart.takeScreenshot()')
    expect(createSrc).toContain('const canvas = instances.get(slot.handle.id)?.screenshot()')
  })

  it('no price surface keeps a decimal count of its own', () => {
    for (const [name, src] of [
      ['chart.ts', chartSrc],
      ['indicators.ts', indicatorsSrc],
      ['create.ts', createSrc],
    ] as const) {
      expect(src, name).not.toMatch(/toFixed\(2\)/)
      expect(src, name).not.toContain('toLocaleString(')
      expect(src, name).not.toContain('maximumFractionDigits')
    }
  })
})
