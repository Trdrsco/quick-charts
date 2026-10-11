// The price levels the price labels settings mark on the scale: the previous session's close, the
// visible range's high and low, the bid and ask, and the last price of a stretch outside regular
// hours that the chart does not show. Each is a renderer price line on the style
// series, so its value box stands on the price scale in the level's color, its tag ("High", "Bid")
// stands beside it on the plot side, its dotted line runs across the plot, and the scale's "no
// overlapping labels" setting stacks it with the last value's label like any other label there.
//
// A level is drawn only while its setting asks for it and its price is known: the previous close on
// an intraday chart, the high and low of the bars in view, the bid and ask from the datafeed's
// prices, and on an intraday chart of regular hours, the close of the newest bar when it stands in a
// pre-market, post-market or overnight stretch the chart leaves out, in that stretch's color. A
// level whose price moves is moved in place rather than drawn again.
import { LineStyle, type IPriceLine, type ISeriesApi, type SeriesType } from 'lightweight-charts'
import type { ChartSettings } from '../settings/schema'
import { CHART_FACTORY_COLORS } from '../theme/palettes'
import { lineWidthOf } from './styles'

/** The tags a level wears on the plot side, in the chart's language. */
export interface PriceLevelTags {
  high: string
  low: string
  bid: string
  ask: string
}

/** One level as the settings and the prices ask for it. */
export interface PriceLevel {
  key: 'previousClose' | 'high' | 'low' | 'bid' | 'ask' | 'extendedHours'
  price: number
  /** The line's color, and the label's unless `labelColor` names another. */
  color: string
  labelColor: string
  /** The tag beside the value box, or empty for none. */
  title: string
  value: boolean
  line: boolean
  width: number
}

/** What the levels are drawn from, read when they are drawn. */
export interface PriceLevelFacts {
  intraday: boolean
  previousClose: number | null
  /** The highest and lowest price of the bars in view, or null with none in view. */
  range: { high: number; low: number } | null
  bid: number | null
  ask: number | null
  /** The newest bar's close and the stretch outside regular hours it stands in, while the chart
   *  leaves that stretch out; null otherwise. */
  extendedHours: { price: number; stretch: 'pre' | 'after' | 'extended' } | null
}

/** The levels the settings ask for over the facts as they stand. Exported for tests. */
export function priceLevels(settings: ChartSettings, facts: PriceLevelFacts, tags: PriceLevelTags): PriceLevel[] {
  const labels = settings.priceLabels
  const out: PriceLevel[] = []
  if ((labels.previousCloseValue || labels.previousCloseLine) && facts.intraday && facts.previousClose !== null) {
    out.push({
      key: 'previousClose',
      price: facts.previousClose,
      color: labels.previousCloseColor,
      labelColor: labels.previousCloseColor,
      title: '',
      value: labels.previousCloseValue,
      line: labels.previousCloseLine,
      width: labels.previousCloseLineWidth,
    })
  }
  if ((labels.highLowValue || labels.highLowLine) && facts.range) {
    const line = labels.highLowColor ?? CHART_FACTORY_COLORS.highLowLine
    const label = labels.highLowColor ?? CHART_FACTORY_COLORS.highLowLabel
    const common = { color: line, labelColor: label, value: labels.highLowValue, line: labels.highLowLine, width: labels.highLowLineWidth }
    out.push({ key: 'high', price: facts.range.high, title: tags.high, ...common })
    out.push({ key: 'low', price: facts.range.low, title: tags.low, ...common })
  }
  if (labels.bidAskValue || labels.bidAskLine) {
    const common = { value: labels.bidAskValue, line: labels.bidAskLine, width: 1 }
    if (facts.ask !== null) out.push({ key: 'ask', price: facts.ask, color: labels.askColor, labelColor: labels.askColor, title: tags.ask, ...common })
    if (facts.bid !== null) out.push({ key: 'bid', price: facts.bid, color: labels.bidColor, labelColor: labels.bidColor, title: tags.bid, ...common })
  }
  if ((labels.extendedHoursValue || labels.extendedHoursLine) && facts.intraday && facts.extendedHours) {
    const stretch = facts.extendedHours.stretch
    const color = stretch === 'pre' ? labels.preMarketLabelColor : stretch === 'after' ? labels.postMarketLabelColor : labels.nightLabelColor
    out.push({
      key: 'extendedHours',
      price: facts.extendedHours.price,
      color,
      labelColor: color,
      title: '',
      value: labels.extendedHoursValue,
      line: labels.extendedHoursLine,
      width: 1,
    })
  }
  return out
}

/** A level as the renderer's price line takes it. The tag shows only beside a value box, since the
 *  renderer writes a title only with its axis label, and every level writes in the scale's label
 *  text. */
export function priceLineOptions(level: PriceLevel): Record<string, unknown> {
  return {
    price: level.price,
    color: level.color,
    lineWidth: lineWidthOf(level.width),
    lineStyle: LineStyle.SparseDotted,
    lineVisible: level.line,
    axisLabelVisible: level.value,
    axisLabelColor: level.labelColor,
    axisLabelTextColor: CHART_FACTORY_COLORS.scaleLabelText,
    title: level.value ? level.title : '',
  }
}

/** The highest high and lowest low of the bars whose time stands in a range, or null with none
 *  there. `value` names what a bar contributes when a style draws one value per bar rather than the
 *  whole bar. Exported for tests. */
export function visibleRange<B extends { t: number; h: number; l: number }>(
  bars: readonly B[],
  from: number,
  to: number,
  value?: (bar: B) => number,
): { high: number; low: number } | null {
  // The bars ascend in time, so the first one in view is found by halving.
  let lo = 0
  let hi = bars.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid]!.t < from) lo = mid + 1
    else hi = mid
  }
  let high = -Infinity
  let low = Infinity
  for (let i = lo; i < bars.length && bars[i]!.t <= to; i++) {
    const bar = bars[i]!
    const top = value ? value(bar) : bar.h
    const bottom = value ? value(bar) : bar.l
    if (top > high) high = top
    if (bottom < low) low = bottom
  }
  return Number.isFinite(high) && Number.isFinite(low) ? { high, low } : null
}

export interface PriceLevelsDeps {
  series(): ISeriesApi<SeriesType>
  settings(): ChartSettings
  /** Whether the chart shows a price scale: without one nothing is marked. */
  enabled(): boolean
  facts(): PriceLevelFacts
  tags(): PriceLevelTags
}

export interface PriceLevelsLayer {
  /** Draw the levels as the settings and the facts stand now. */
  refresh(): void
  /** The style series was replaced: the levels move onto the new one. */
  seriesChanged(previous: ISeriesApi<SeriesType>): void
  destroy(): void
}

export function attachPriceLevels(deps: PriceLevelsDeps): PriceLevelsLayer {
  const drawn = new Map<PriceLevel['key'], { line: IPriceLine; options: string }>()
  let disposed = false

  const clear = (series: ISeriesApi<SeriesType>): void => {
    for (const { line } of drawn.values()) {
      try {
        series.removePriceLine(line)
      } catch {
        /* the series already went down */
      }
    }
    drawn.clear()
  }

  const refresh = (): void => {
    if (disposed) return
    const series = deps.series()
    const levels = deps.enabled() ? priceLevels(deps.settings(), deps.facts(), deps.tags()) : []
    const keep = new Set(levels.map((level) => level.key))
    for (const [key, { line }] of drawn) {
      if (keep.has(key)) continue
      try {
        series.removePriceLine(line)
      } catch {
        /* the series already went down */
      }
      drawn.delete(key)
    }
    for (const level of levels) {
      const options = priceLineOptions(level)
      const written = JSON.stringify(options)
      const held = drawn.get(level.key)
      if (held) {
        if (held.options !== written) {
          held.line.applyOptions(options)
          held.options = written
        }
        continue
      }
      drawn.set(level.key, { line: series.createPriceLine(options as never), options: written })
    }
  }

  return {
    refresh,
    seriesChanged(previous) {
      clear(previous)
      refresh()
    },
    destroy() {
      if (disposed) return
      clear(deps.series())
      disposed = true
    },
  }
}
