// The seven main-series styles Quick Charts draws, and the one place a style becomes a series.
//
// A style is presentation: switching one keeps the loaded bars, the indicators, the drawings, the
// comparisons, the scale and the visible range, and refetches nothing. Four of the seven consume a
// close-only value point and three consume the whole bar, which is the single predicate every
// consumer branches on — the paint path, the legend's OHLC values, and replay's forming shape.
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  LineSeries,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts'
import type { ChartOverrides } from '../overrides'
import type { CanvasTheme } from '../theme/renderer'

/** The style vocabulary. Fixed at seven; a new one is a public API addition, not a config value. */
export type ChartStyleId = 'candles' | 'hollow' | 'bars' | 'line' | 'area' | 'baseline' | 'stepline'

/** Picker and manifest order. */
export const CHART_STYLES: readonly ChartStyleId[] = ['candles', 'hollow', 'bars', 'line', 'area', 'baseline', 'stepline']

/** Whether a string names a style. A stored or restored value outside the vocabulary degrades to
 *  candles rather than leaving the chart with no series at all. */
export function isChartStyle(raw: unknown): raw is ChartStyleId {
  return typeof raw === 'string' && (CHART_STYLES as readonly string[]).includes(raw)
}

/** Coerce a stored or restored value to a style. */
export function coerceChartStyle(raw: unknown): ChartStyleId {
  return isChartStyle(raw) ? raw : 'candles'
}

/** Styles whose series consumes `{ time, value }` (close only). The rest consume the whole bar.
 *  Every consumer branches on this ONE predicate: a style is value-shaped or bar-shaped, never a
 *  third thing. A value-shaped style has no open, high or low to show, so the legend drops the
 *  OHLC values while it is on. */
export function valueShaped(style: ChartStyleId): boolean {
  return style === 'line' || style === 'area' || style === 'baseline' || style === 'stepline'
}

/** A CSS color with an alpha applied, for the area and baseline gradients. Hex and rgb inputs are
 *  understood; anything else is returned untouched, so an unusual palette value still paints. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgb) {
    const parts = rgb[1]!.split(',').map((p) => p.trim())
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
  }
  return color
}

/** What a style needs to paint: the direction pair and the anatomy leaves from the appearance
 *  ladder, and the mode's neutral ink for the styles that draw one undirected line. */
export interface StylePaint {
  appearance: ChartOverrides['appearance']
  canvas: CanvasTheme
  /** True once a host layer has named a candle border color: candles keep their borders invisible
   *  until someone asks, so an appearance-free chart is not silently re-ringed. */
  candleBorders: boolean
}

/** Add the main series for a style, with the paint the ladder resolves to. The series options are
 *  re-applied on every look change through {@link styleOptions}, so the two must name the same
 *  leaves. */
export function addStyleSeries(chart: IChartApi, style: ChartStyleId, paint: StylePaint): ISeriesApi<SeriesType> {
  switch (style) {
    case 'line':
      return chart.addSeries(LineSeries, lineOptions(paint))
    case 'stepline':
      return chart.addSeries(LineSeries, { ...lineOptions(paint), lineType: LineType.WithSteps })
    case 'area':
      return chart.addSeries(AreaSeries, areaOptions(paint))
    case 'baseline':
      return chart.addSeries(BaselineSeries, baselineOptions(paint))
    case 'bars':
      return chart.addSeries(BarSeries, barOptions(paint))
    case 'hollow':
      return chart.addSeries(CandlestickSeries, hollowOptions(paint))
    case 'candles':
    default:
      return chart.addSeries(CandlestickSeries, candleOptions(paint))
  }
}

/** The options one style wears for a given paint — what a look change re-applies to the series
 *  already on the chart. */
export function styleOptions(style: ChartStyleId, paint: StylePaint): Record<string, unknown> {
  switch (style) {
    case 'line':
      return lineOptions(paint)
    case 'stepline':
      return { ...lineOptions(paint), lineType: LineType.WithSteps }
    case 'area':
      return areaOptions(paint)
    case 'baseline':
      return baselineOptions(paint)
    case 'bars':
      return barOptions(paint)
    case 'hollow':
      return hollowOptions(paint)
    case 'candles':
    default:
      return candleOptions(paint)
  }
}

/** One undirected line: the mode's neutral ink, because a close-only line has no direction to
 *  carry. */
function lineOptions(paint: StylePaint): Record<string, unknown> {
  return { color: paint.canvas.neutral, lineWidth: 2 }
}

function areaOptions(paint: StylePaint): Record<string, unknown> {
  const up = paint.appearance.upColor
  return { lineColor: up, lineWidth: 2, topColor: withAlpha(up, 0.28), bottomColor: withAlpha(up, 0.04) }
}

function baselineOptions(paint: StylePaint): Record<string, unknown> {
  const up = paint.appearance.upColor
  const down = paint.appearance.downColor
  return {
    topLineColor: up,
    bottomLineColor: down,
    topFillColor1: withAlpha(up, 0.28),
    topFillColor2: withAlpha(up, 0.04),
    bottomFillColor1: withAlpha(down, 0.04),
    bottomFillColor2: withAlpha(down, 0.28),
  }
}

function barOptions(paint: StylePaint): Record<string, unknown> {
  return { upColor: paint.appearance.upColor, downColor: paint.appearance.downColor }
}

/** Hollow candles: a rising body is outline only and a falling body fills, while the border and the
 *  wick carry the direction color either way. The border is always on here, because the outline IS
 *  the rising candle. */
function hollowOptions(paint: StylePaint): Record<string, unknown> {
  const a = paint.appearance
  return {
    upColor: 'transparent',
    downColor: a.downColor,
    borderVisible: true,
    borderUpColor: a.upColor,
    borderDownColor: a.downColor,
    wickUpColor: a.upColor,
    wickDownColor: a.downColor,
  }
}

/** Plain candles take the appearance anatomy whole: the border and wick leaves are their own
 *  values, not a shade of the body pair, so nothing is re-derived here. */
function candleOptions(paint: StylePaint): Record<string, unknown> {
  const a = paint.appearance
  return {
    upColor: a.upColor,
    downColor: a.downColor,
    borderVisible: paint.candleBorders,
    borderUpColor: a.borderUpColor,
    borderDownColor: a.borderDownColor,
    wickUpColor: a.wickUpColor,
    wickDownColor: a.wickDownColor,
  }
}
