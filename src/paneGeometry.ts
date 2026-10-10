// Where the panes stand within a chart. A viewer may reorder them, so the pane the main series stands
// in is not always the first, and nothing laid over the chart may take a pane's top to be the
// chart's own.
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts'

/** The index of the pane a series stands in, or 0 when the renderer cannot say. */
export function paneIndexOf(series: ISeriesApi<SeriesType>): number {
  try {
    const index = series.getPane().paneIndex()
    return Number.isInteger(index) && index >= 0 ? index : 0
  } catch {
    return 0
  }
}

/** How far the pane at an index stands below the top of an element laid over the chart, in CSS
 *  pixels: the pane's own box once the renderer has laid it out, and until then the heights of the
 *  panes above it. The first pane stands at the top. */
export function paneTopIn(chart: IChartApi, index: number, box: HTMLElement): number {
  if (index <= 0) return 0
  try {
    const panes = chart.panes()
    const rect = panes[index]?.getHTMLElement()?.getBoundingClientRect()
    if (rect && rect.height > 0) return rect.top - box.getBoundingClientRect().top
    let top = 0
    for (let i = 0; i < index && i < panes.length; i++) top += panes[i]!.getHeight()
    return top
  } catch {
    return 0
  }
}

/** The top of the pane a series stands in, below the top of an element laid over the chart. */
export const seriesPaneTop = (chart: IChartApi, series: ISeriesApi<SeriesType>, box: HTMLElement): number =>
  paneTopIn(chart, paneIndexOf(series), box)
