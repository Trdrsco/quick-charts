// An extension's price line lives on the series the style paints. The renderer draws a custom price
// line only on a visible series, and the long-lived anchor an extension binds primitives to is
// hidden by design, so a line created there would never be seen. A style switch replaces the
// painted series, and every line still standing follows it with the options it last held.
import { describe, expect, it } from 'vitest'
import type { CreatePriceLineOptions, IChartApi, IPriceLine, ISeriesApi, SeriesType } from 'lightweight-charts'
import { canvasTheme } from '../src/theme/renderer'
import { DARK_THEME } from '../src/theme/palettes'
import { createCommandRegistry } from '../src/widget/commands'
import { attachExtensionsPlane, type ExtensionsDeps } from '../src/widget/extensions'
import type { ChartExtension, ChartExtensionContext } from '../src/extension'
import chartSrc from '../src/widget/chart.ts?raw'
import { resolveMarkPainters } from '../src/markPainters'

type Line = IPriceLine & { options: CreatePriceLineOptions; removed: boolean }

function fakeSeries(name: string) {
  const lines: Line[] = []
  const api = {
    name,
    lines,
    createPriceLine(options: CreatePriceLineOptions) {
      const line = {
        options: { ...options },
        removed: false,
        applyOptions(next: Partial<CreatePriceLineOptions>) {
          Object.assign(line.options, next)
        },
        options_: () => line.options,
      } as unknown as Line
      lines.push(line)
      return line
    },
    removePriceLine(line: Line) {
      line.removed = true
    },
    attachPrimitive() {},
    detachPrimitive() {},
    priceToCoordinate: (p: number) => p,
    coordinateToPrice: (y: number) => y,
  }
  return api as unknown as ISeriesApi<SeriesType> & typeof api
}

function plane(extension: ChartExtension) {
  const anchor = fakeSeries('anchor')
  let visible = fakeSeries('candles')
  let disposed = false
  const deps: ExtensionsDeps = {
    chartId: 'c',
    painters: resolveMarkPainters({}),
    active: () => true,
    chart: { timeScale: () => ({ timeToCoordinate: () => null, coordinateToTime: () => null }), priceScale: () => ({ width: () => 60 }), applyOptions() {} } as unknown as IChartApi,
    series: () => anchor,
    visible: () => visible,
    gestures: { clientWidth: 800, clientHeight: 400 } as unknown as HTMLElement,
    chrome: {} as HTMLElement,
    layer: {} as HTMLElement,
    symbol: () => 'ES',
    symbolTitle: () => 'E-mini',
    timeframe: () => '1m',
    bars: () => [],
    replay: () => ({ active: false, cursor: 0, total: 0 }),
    feedStatus: () => null,
    theme: () => canvasTheme(DARK_THEME),
    formatter: () => ({ format: (p) => String(p), precision: () => 2 }),
    commands: createCommandRegistry().registry,
    extensions: [extension],
    disposed: () => disposed,
    setTouchAction() {},
    hideState: () => ({ mode: 'drawings', on: false }),
    setHide() {},
    hideLayersChanged() {},
  }
  const built = attachExtensionsPlane(deps)
  return {
    built,
    anchor,
    visible: () => visible,
    restyle() {
      visible = fakeSeries('bars')
      built.visibleSeriesReplaced()
      return visible
    },
    dispose: () => (disposed = true),
  }
}

describe('extension price lines', () => {
  it('are created on the painted series, never on the hidden anchor', () => {
    let ctx: ChartExtensionContext | null = null
    const p = plane({ id: 'x', attach: (c) => { ctx = c; return { detach() {} } } })
    ctx!.series.createPriceLine({ price: 10, color: '#fff' })
    expect(p.anchor.lines).toHaveLength(0)
    expect(p.visible().lines.map((l) => l.options.price)).toEqual([10])
  })

  it('follow a style switch with the options they last held, and a removed line does not', () => {
    let ctx: ChartExtensionContext | null = null
    const p = plane({ id: 'x', attach: (c) => { ctx = c; return { detach() {} } } })
    const kept = ctx!.series.createPriceLine({ price: 10, color: '#fff', lineStyle: 2 })
    const gone = ctx!.series.createPriceLine({ price: 20, color: '#0f0' })
    kept.update({ price: 11 })
    gone.remove()
    const before = p.visible()
    const after = p.restyle()
    expect(before.lines[1]!.removed).toBe(true)
    expect(after.lines.map((l) => l.options)).toEqual([{ price: 11, color: '#fff', lineStyle: 2 }])
    // Updates and removal now address the line on the new series.
    kept.update({ price: 12 })
    expect(after.lines[0]!.options.price).toBe(12)
    kept.remove()
    expect(after.lines[0]!.removed).toBe(true)
    expect(before.lines[0]!.removed).toBe(false)
  })

  it('the chart paints extension lines on its style series and re-homes them on a switch', () => {
    const depsBlock = chartSrc.slice(chartSrc.indexOf('const extensions = attachExtensionsPlane('), chartSrc.indexOf('const menu ='))
    expect(depsBlock).toContain('series: () => anchor')
    expect(depsBlock).toContain('visible: () => series')
    const setStyle = chartSrc.slice(chartSrc.indexOf('function setStyle('), chartSrc.indexOf("events.emit('style', next)"))
    expect(setStyle).toContain('series = addStyleSeries(chart, next, paint())')
    expect(setStyle).toContain('extensions.visibleSeriesReplaced()')
    expect(setStyle.indexOf('extensions.visibleSeriesReplaced()')).toBeLessThan(setStyle.indexOf('chart.removeSeries(previous)'))
  })
})
