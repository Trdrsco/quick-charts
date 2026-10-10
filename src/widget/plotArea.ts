// The main pane's plot: where the bars are drawn, between the price scales and between any panes
// above and below it, measured in the pixels of the element the host handed the widget. A host
// control floating over the bars, at the plot's bottom right beside the price scale say, places
// itself with it, and the plot moves whenever the price scale widens, a pane joins or the widget
// resizes, so the chart reports each move rather than leaving the host to guess at its axes.
import type { IChartApi } from 'lightweight-charts'

/** The plot's box: the four distances an absolutely positioned element takes, each measured in from
 *  the matching edge of the host's element, and the box's size. `right` is how far the plot's right
 *  edge stands in from the element's right edge, which is the right price scale and anything beside
 *  the chart; `bottom` is the time scale, any panes below the main one and anything beneath. */
export interface PlotArea {
  top: number
  right: number
  bottom: number
  left: number
  width: number
  height: number
}

/** Measure once. Null while the renderer has no main pane laid out. The main pane is the first
 *  unless a viewer moved it, and its index says where it stands. */
export function measurePlotArea(chart: IChartApi, host: HTMLElement, main = 0): PlotArea | null {
  const row = chart.panes()[main]?.getHTMLElement()
  if (!row) return null
  const size = chart.paneSize(main)
  if (!(size.width > 0) || !(size.height > 0)) return null
  const outer = host.getBoundingClientRect()
  // The pane's row spans the price scales too, so its top is the plot's top; the plot's left edge
  // is the chart's own left edge past the left price scale, whose width is zero while it is hidden.
  const top = row.getBoundingClientRect().top
  const left = chart.chartElement().getBoundingClientRect().left + chart.priceScale('left').width()
  const round = (n: number): number => Math.round(n * 100) / 100
  return {
    top: round(top - outer.top),
    right: round(outer.right - (left + size.width)),
    bottom: round(outer.bottom - (top + size.height)),
    left: round(left - outer.left),
    width: round(size.width),
    height: round(size.height),
  }
}

const sameArea = (a: PlotArea, b: PlotArea | null): boolean =>
  b !== null && a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left && a.width === b.width && a.height === b.height

export interface PlotAreaDeps {
  chart: IChartApi
  /** The element the host handed the widget: the box every distance is measured from. */
  host: HTMLElement
  /** The index of the pane the main series stands in; the first when absent. */
  mainPane?(): number
  /** Hears each new area, once per change. */
  changed(area: PlotArea): void
}

export interface PlotAreaWatch {
  current(): PlotArea | null
  /** Measure again on the next frame: the panes moved, which moves the plot without resizing
   *  anything the watch observes. */
  refresh(): void
  destroy(): void
}

/** Follow the plot as it moves. Four things move it: the time scale changing size, which is what a
 *  price scale growing a digit or the widget resizing does to it; the host's element or the chart
 *  resizing; the main pane's row changing height as panes join or leave; and the panes moving, which
 *  the chart reports through `refresh`. A burst of any of them is measured once, on the next
 *  frame. */
export function watchPlotArea(deps: PlotAreaDeps): PlotAreaWatch {
  let area: PlotArea | null = null
  let frame: number | null = null
  let destroyed = false
  let row: HTMLElement | null = null

  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule())
  const measure = (): void => {
    frame = null
    if (destroyed) return
    const main = deps.mainPane?.() ?? 0
    const nextRow = deps.chart.panes()[main]?.getHTMLElement() ?? null
    if (nextRow !== row) {
      if (row) resize?.unobserve(row)
      if (nextRow) resize?.observe(nextRow)
      row = nextRow
    }
    const next = measurePlotArea(deps.chart, deps.host, main)
    if (next === null || sameArea(next, area)) return
    area = next
    deps.changed(next)
  }
  function schedule(): void {
    if (destroyed || frame !== null) return
    if (typeof requestAnimationFrame !== 'function') {
      measure()
      return
    }
    frame = requestAnimationFrame(measure)
  }

  deps.chart.timeScale().subscribeSizeChange(schedule)
  resize?.observe(deps.host)
  resize?.observe(deps.chart.chartElement())
  schedule()

  return {
    current() {
      if (destroyed) return null
      return area ?? measurePlotArea(deps.chart, deps.host, deps.mainPane?.() ?? 0)
    },
    refresh: schedule,
    destroy() {
      if (destroyed) return
      destroyed = true
      if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      frame = null
      resize?.disconnect()
      try {
        deps.chart.timeScale().unsubscribeSizeChange(schedule)
      } catch {
        /* the renderer went first */
      }
    },
  }
}
