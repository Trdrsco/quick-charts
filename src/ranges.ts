// Range presets and the navigation step rules: the nine presets the bottom bar offers (each a
// visible span plus the interval that span reads best at), whether a preset is offered for a
// symbol whose history starts late, the framing math that sets a pane's visible window for a
// span, and the zoom and scroll steps the on-chart navigation cluster applies. Pure over a
// structural time-scale target, so a host and a test frame the same way without a chart.
import type { ChartTranslate } from './i18n'
import type { ChartMessageKey } from './i18n/en'
import { parseTimeframe, timeframeLabel, timeframeSeconds } from './timeframe'

/** What a preset frames: seconds of history, the year to date, or everything loaded. */
export type RangeSpan = number | 'ytd' | 'all'

export interface RangePreset {
  /** The preset's identity and the text its chip wears ('1D', 'YTD', 'All'). It stays as written
   *  in every language; a host names the preset by it. */
  readonly key: string
  readonly span: RangeSpan
  /** The timeframe token the preset switches the chart to. */
  readonly tf: string
  /** The catalog key of the preset's full name, for its tooltip. */
  readonly label: ChartMessageKey
}

const DAY = 86_400

/** The nine presets, in bar order. */
export const RANGE_PRESETS: readonly RangePreset[] = [
  { key: '1D', span: DAY, tf: '1m', label: 'range.oneDay' },
  { key: '5D', span: 5 * DAY, tf: '5m', label: 'range.fiveDays' },
  { key: '1M', span: 30 * DAY, tf: '30m', label: 'range.oneMonth' },
  { key: '3M', span: 90 * DAY, tf: '1h', label: 'range.threeMonths' },
  { key: '6M', span: 180 * DAY, tf: '2h', label: 'range.sixMonths' },
  { key: 'YTD', span: 'ytd', tf: '1d', label: 'range.yearToDate' },
  { key: '1Y', span: 365 * DAY, tf: '1d', label: 'range.oneYear' },
  { key: '5Y', span: 5 * 365 * DAY, tf: '1w', label: 'range.fiveYears' },
  { key: 'All', span: 'all', tf: '1mo', label: 'range.all' },
]

/** The epoch second the current UTC year began, for the year-to-date span. */
function yearStart(nowSecs: number): number {
  return Date.UTC(new Date(nowSecs * 1000).getUTCFullYear(), 0, 1) / 1000
}

/** The seconds a span covers back from `nowSecs`; null for 'all', which has no span. */
export function rangeSpanSeconds(span: RangeSpan, nowSecs: number): number | null {
  if (span === 'all') return null
  if (span === 'ytd') return nowSecs - yearStart(nowSecs)
  return span
}

/** Whether a preset is offered for a symbol whose earliest bar is at `earliestBarSecs`: a preset
 *  deeper than the history that exists is withheld (a listing from last year has no 5Y), 'All'
 *  always stays, and an unknown depth (null) withholds nothing. The depth itself is the host's to
 *  learn from its feed; the chart does not probe. */
export function rangeAvailable(preset: RangePreset, earliestBarSecs: number | null | undefined, nowSecs: number = Math.floor(Date.now() / 1000)): boolean {
  if (earliestBarSecs == null || preset.span === 'all') return true
  if (preset.span === 'ytd') return earliestBarSecs <= yearStart(nowSecs)
  return nowSecs - earliestBarSecs >= preset.span
}

/** A preset's tooltip: what it frames, and the bars it frames it in. */
export function rangePresetTip(t: ChartTranslate, preset: RangePreset): string {
  return t('range.tip', { range: t(preset.label), interval: timeframeLabel(t, preset.tf) })
}

/** The part of a chart the framing needs: a time scale that takes a logical range. */
export interface RangeFrameTarget {
  timeScale(): { setVisibleLogicalRange(range: { from: number; to: number }): void }
}

/** Frame a pane on a span, anchored on its LAST REAL bar: a series also carries a future
 *  whitespace horizon for right-margin drawing, so fitting to content would frame a screen of
 *  empty space. The bar count comes from the pane's own interval, because the same span is a
 *  different number of bars on a one-minute pane than on a daily one. An empty series, or a token
 *  the grammar cannot read, frames nothing rather than a bogus window. */
export function frameRange(chart: RangeFrameTarget, series: { data(): readonly unknown[] }, span: RangeSpan, tf: string, nowSecs: number = Math.floor(Date.now() / 1000)): void {
  const data = series.data()
  let lastReal = -1
  for (let i = data.length - 1; i >= 0; i--) {
    const b = data[i] as { close?: number; value?: number }
    if (typeof b.close === 'number' || typeof b.value === 'number') {
      lastReal = i
      break
    }
  }
  if (lastReal < 0) return
  if (span === 'all') {
    chart.timeScale().setVisibleLogicalRange({ from: -1, to: lastReal + 6 })
    return
  }
  const parsed = parseTimeframe(tf)
  if (!parsed) return
  const secs = rangeSpanSeconds(span, nowSecs) ?? 0
  const bars = Math.max(10, Math.min(lastReal + 1, Math.round(secs / timeframeSeconds(parsed))))
  chart.timeScale().setVisibleLogicalRange({ from: lastReal + 1 - bars, to: lastReal + 4 })
}

/** One zoom step multiplies or divides the bar spacing by this. */
export const ZOOM_FACTOR = 1.25
/** The bar spacing a zoom-out never goes below. */
export const MIN_BAR_SPACING = 0.5
/** How far one scroll step moves, in bars. */
export const SCROLL_STEP_BARS = 10

/** The bar spacing after one zoom step from `spacing`. */
export function zoomedBarSpacing(spacing: number, direction: 'in' | 'out'): number {
  return Math.max(MIN_BAR_SPACING, direction === 'in' ? spacing * ZOOM_FACTOR : spacing / ZOOM_FACTOR)
}

/** The time-scale scroll position after one scroll step from `position` (positive is right, as
 *  lightweight-charts counts it). */
export function scrolledPosition(position: number, direction: 'left' | 'right'): number {
  return position + (direction === 'right' ? SCROLL_STEP_BARS : -SCROLL_STEP_BARS)
}
