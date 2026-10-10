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
  LineStyle,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type LineWidth,
  type SeriesType,
} from 'lightweight-charts'
import type { ChartSettings, ChartStrokeStyle, LineStyleSettings } from '../settings/schema'
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

/** The styles a widget offers: the host's list in its own order, or every style. `named` says which,
 *  because the picker follows a list the host named and keeps its own family grouping otherwise. */
export interface OfferedChartStyles {
  readonly list: readonly ChartStyleId[]
  readonly named: boolean
}

/** Every style, grouped the picker's own way: what a widget offers when the host names no list. */
export const ALL_STYLES_OFFERED: OfferedChartStyles = { list: CHART_STYLES, named: false }

/** Validate the host's `styles` and `style` options. An empty list, an unknown id, a repeated id
 *  and an opening style outside the list are setup errors: nothing a host passes is substituted. */
export function resolveOfferedStyles(styles: readonly unknown[] | undefined, style: unknown): OfferedChartStyles {
  let offered = ALL_STYLES_OFFERED
  if (styles !== undefined) {
    if (!Array.isArray(styles)) throw new TypeError(`styles must be a list of chart styles; it takes ${CHART_STYLES.join(', ')}`)
    if (styles.length === 0) throw new TypeError(`styles must name at least one chart style; it takes ${CHART_STYLES.join(', ')}`)
    const seen = new Set<ChartStyleId>()
    for (const id of styles) {
      if (!isChartStyle(id)) throw new TypeError(`styles names ${JSON.stringify(id)}, which is not a chart style; it takes ${CHART_STYLES.join(', ')}`)
      if (seen.has(id)) throw new TypeError(`styles names "${id}" more than once`)
      seen.add(id)
    }
    offered = { list: [...seen], named: true }
  }
  if (style !== undefined && !(offered.list as readonly unknown[]).includes(style)) {
    throw new TypeError(`style ${JSON.stringify(style)} is not one of the offered styles: ${offered.list.join(', ')}`)
  }
  return offered
}

/** The offered style a stored or restored value opens on: the value itself when it is offered, else
 *  the first offered style. */
export function offeredStyle(raw: unknown, offered: readonly ChartStyleId[]): ChartStyleId {
  return isChartStyle(raw) && offered.includes(raw) ? raw : offered[0]!
}

/** Styles whose series consumes `{ time, value }` (close only). The rest consume the whole bar.
 *  Every consumer branches on this ONE predicate: a style is value-shaped or bar-shaped, never a
 *  third thing. A value-shaped style has no open, high or low to show, so the legend drops the
 *  OHLC values while it is on. */
export function valueShaped(style: ChartStyleId): boolean {
  return style === 'line' || style === 'area' || style === 'baseline' || style === 'stepline'
}

/** A CSS color with an alpha applied, for a style faded in or out. Hex and rgb inputs are understood;
 *  anything else is returned untouched, so an unusual palette value still paints. */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color.trim())
  if (rgb) {
    const parts = rgb[1]!.split(',').map((p) => p.trim())
    const own = parts.length >= 4 ? Number(parts[3]) : 1
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${(Number.isFinite(own) ? own : 1) * alpha})`
  }
  return color
}

/** The renderer's line style for a settings stroke. A dash is six widths with a gap of six and a dot
 *  one width with a gap of four, the proportions of the settings' own dashed and dotted lines. */
export function strokeLineStyle(style: ChartStrokeStyle): LineStyle {
  if (style === 'dashed') return LineStyle.LargeDashed
  if (style === 'dotted') return LineStyle.SparseDotted
  return LineStyle.Solid
}

/** A width the renderer's lines take: a whole number of pixels from one to four. */
export function lineWidthOf(width: number): LineWidth {
  return Math.min(4, Math.max(1, Math.round(Number.isFinite(width) ? width : 1))) as LineWidth
}

/** What a style needs to paint: the chart settings the ladder resolves to, the mode's theme, and
 *  what the price scale shows of the symbol. */
export interface StylePaint {
  settings: ChartSettings
  canvas: CanvasTheme
  /** The symbol's name, written beside its last value on the price scale when the settings ask for
   *  it. */
  title: string
  /** The chart shows a price scale. Without one, nothing points at the last price: no label and no
   *  line across the plot. */
  priceScale: boolean
}

/** Add the main series for a style, with the paint the ladder resolves to. The series options are
 *  re-applied on every look change through {@link styleOptions}, so the two must name the same
 *  leaves. */
export function addStyleSeries(chart: IChartApi, style: ChartStyleId, paint: StylePaint): ISeriesApi<SeriesType> {
  const options = styleOptions(style, paint)
  switch (style) {
    case 'line':
    case 'stepline':
      return chart.addSeries(LineSeries, options)
    case 'area':
      return chart.addSeries(AreaSeries, options)
    case 'baseline':
      return chart.addSeries(BaselineSeries, options)
    case 'bars':
      return chart.addSeries(BarSeries, options)
    case 'hollow':
    case 'candles':
    default:
      return chart.addSeries(CandlestickSeries, options)
  }
}

/** The options one style wears for a given paint: what a look change re-applies to the series
 *  already on the chart. Every style carries the symbol's last-value label and line. */
export function styleOptions(style: ChartStyleId, paint: StylePaint): Record<string, unknown> {
  return { ...ownOptions(style, paint), ...lastValueOptions(paint) }
}

function ownOptions(style: ChartStyleId, paint: StylePaint): Record<string, unknown> {
  switch (style) {
    case 'line':
      return lineOptions(paint.settings.line)
    case 'stepline':
      return { ...lineOptions(paint.settings.stepLine), lineType: LineType.WithSteps }
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

/** The symbol on the price scale: its last value, the line across the plot at that value, and its
 *  name beside the value. A line color left null follows the last bar. The line is dotted, as the
 *  settings' own price lines are. */
function lastValueOptions(paint: StylePaint): Record<string, unknown> {
  const labels = paint.settings.priceLabels
  return {
    lastValueVisible: paint.priceScale && labels.symbolValue,
    priceLineVisible: paint.priceScale && labels.symbolLine,
    priceLineColor: labels.symbolLineColor ?? '',
    priceLineWidth: lineWidthOf(labels.symbolLineWidth),
    priceLineStyle: LineStyle.SparseDotted,
    title: labels.symbolName ? paint.title : '',
  }
}

/** A style drawn from closes, its lines and fills at `alpha` of their own strength: what a morph
 *  between a bar style and a close style shows of the close style as it comes in or goes. A bar
 *  style has nothing to fade, so its own options come back. A gradient line is drawn by its own
 *  primitive, which the chart fades beside these. */
export function fadedStyleOptions(style: ChartStyleId, paint: StylePaint, alpha: number): Record<string, unknown> {
  const a = Math.min(1, Math.max(0, alpha))
  const settings = paint.settings
  switch (style) {
    case 'line':
    case 'stepline': {
      const line = style === 'line' ? settings.line : settings.stepLine
      return { color: withAlpha(line.colorType === 'gradient' ? line.gradientTopColor : line.color, a) }
    }
    case 'area':
      return {
        lineColor: withAlpha(settings.area.lineColor, a),
        topColor: withAlpha(settings.area.topColor, a),
        bottomColor: withAlpha(settings.area.bottomColor, a),
      }
    case 'baseline': {
      const b = settings.baseline
      return {
        topLineColor: withAlpha(b.topLineColor, a),
        bottomLineColor: b.topLineWidth === b.bottomLineWidth ? withAlpha(b.bottomLineColor, a) : 'transparent',
        topFillColor1: withAlpha(b.topFillColor1, a),
        topFillColor2: withAlpha(b.topFillColor2, a),
        bottomFillColor1: withAlpha(b.bottomFillColor1, a),
        bottomFillColor2: withAlpha(b.bottomFillColor2, a),
      }
    }
    default:
      return styleOptions(style, paint)
  }
}

/** One line through the closes. A gradient is drawn by the chart's value-line primitive over the
 *  series, so the series' own line stands down and keeps only its scale, its label and its marker,
 *  in the gradient's top color. */
function lineOptions(line: LineStyleSettings): Record<string, unknown> {
  const gradient = line.colorType === 'gradient'
  return {
    color: gradient ? line.gradientTopColor : line.color,
    lineVisible: !gradient,
    lineWidth: lineWidthOf(line.lineWidth),
    lineStyle: strokeLineStyle(line.lineStyle),
  }
}

function areaOptions(paint: StylePaint): Record<string, unknown> {
  const area = paint.settings.area
  return {
    lineColor: area.lineColor,
    lineWidth: lineWidthOf(area.lineWidth),
    lineStyle: strokeLineStyle(area.lineStyle),
    topColor: area.topColor,
    bottomColor: area.bottomColor,
  }
}

/** The baseline takes one line width. When the two halves' widths differ, the series strokes the
 *  upper half at its width and leaves the lower half to the chart's value-line primitive, which
 *  strokes it at its own. */
function baselineOptions(paint: StylePaint): Record<string, unknown> {
  const b = paint.settings.baseline
  return {
    topLineColor: b.topLineColor,
    bottomLineColor: b.topLineWidth === b.bottomLineWidth ? b.bottomLineColor : 'transparent',
    lineWidth: lineWidthOf(b.topLineWidth),
    topFillColor1: b.topFillColor1,
    topFillColor2: b.topFillColor2,
    bottomFillColor1: b.bottomFillColor1,
    bottomFillColor2: b.bottomFillColor2,
  }
}

/** Bars: the direction pair, the open tick unless only high, low and close are drawn, and thin bars.
 *  Coloring by the previous close is per bar, written with the data. */
function barOptions(paint: StylePaint): Record<string, unknown> {
  const bars = paint.settings.bars
  return { upColor: bars.upColor, downColor: bars.downColor, openVisible: !bars.hlcBars, thinBars: bars.thinBars }
}

/** Hollow candles: a rising body is outline only and a falling body fills, while the border and the
 *  wick carry the direction color. With the body off, a falling body is hollow as well. */
function hollowOptions(paint: StylePaint): Record<string, unknown> {
  const h = paint.settings.hollowCandles
  return {
    upColor: 'transparent',
    downColor: h.body ? h.downColor : 'transparent',
    borderVisible: h.borders,
    borderUpColor: h.borderUpColor,
    borderDownColor: h.borderDownColor,
    wickVisible: h.wick,
    wickUpColor: h.wickUpColor,
    wickDownColor: h.wickDownColor,
  }
}

/** Candles: the body, its border and its wick, each shown or not and each in its own pair. A body
 *  that is off is hollow, so the border and the wick stand alone. */
function candleOptions(paint: StylePaint): Record<string, unknown> {
  const c = paint.settings.candles
  return {
    upColor: c.body ? c.upColor : 'transparent',
    downColor: c.body ? c.downColor : 'transparent',
    borderVisible: c.borders,
    borderUpColor: c.borderUpColor,
    borderDownColor: c.borderDownColor,
    wickVisible: c.wick,
    wickUpColor: c.wickUpColor,
    wickDownColor: c.wickDownColor,
  }
}

/** One bar's own colors when a style colors by the previous bar's close: up when the close is at or
 *  above the previous close, down below it. The first bar has no previous close and is colored by
 *  its own open. Null when the style colors by the bar's own open, which the series does itself. */
export function previousCloseColors(
  style: ChartStyleId,
  settings: ChartSettings,
): ((bar: { o: number; c: number }, previous: { c: number } | undefined) => Record<string, string>) | null {
  if (style === 'candles' && settings.candles.colorOnPreviousClose) {
    const c = settings.candles
    return (bar, previous) => {
      const up = bar.c >= (previous?.c ?? bar.o)
      return {
        color: c.body ? (up ? c.upColor : c.downColor) : 'transparent',
        borderColor: up ? c.borderUpColor : c.borderDownColor,
        wickColor: up ? c.wickUpColor : c.wickDownColor,
      }
    }
  }
  if (style === 'bars' && settings.bars.colorOnPreviousClose) {
    const b = settings.bars
    return (bar, previous) => ({ color: bar.c >= (previous?.c ?? bar.o) ? b.upColor : b.downColor })
  }
  return null
}
