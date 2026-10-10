// The watermark: the symbol written large behind the bars, as the chart settings ask for it. The
// ticker and the interval share the first line and the description takes a smaller second one; a
// description alone takes the first line's size. It is the renderer's own text watermark on the
// main pane, so it sits behind the series and centres on the plot as the pane resizes. The replay
// part of the setting is the replay mark the legend already draws, not a line here.
import { createTextWatermark, type IChartApi, type ITextWatermarkPluginApi, type Time } from 'lightweight-charts'
import type { ChartSettings } from '../settings/schema'

/** What the watermark can name. */
export interface WatermarkFacts {
  ticker: string
  interval: string
  description: string
}

/** One line of the watermark. */
export interface WatermarkLine {
  text: string
  fontSize: number
}

/** The first line's size, and the description's under it. */
export const WATERMARK_FONT_SIZE = 80
export const WATERMARK_DESCRIPTION_FONT_SIZE = 36

/** The lines the canvas settings ask for: the ticker and the interval joined on the first line, the
 *  description on a smaller second one, and a description alone at the first line's size. None
 *  when no part is asked for. */
export function watermarkLines(canvas: Pick<ChartSettings['canvas'], 'watermarkTicker' | 'watermarkInterval' | 'watermarkDescription'>, facts: WatermarkFacts): WatermarkLine[] {
  const head = [canvas.watermarkTicker ? facts.ticker : '', canvas.watermarkInterval ? facts.interval : ''].filter(Boolean).join(', ')
  const description = canvas.watermarkDescription ? facts.description : ''
  if (!head) return description ? [{ text: description, fontSize: WATERMARK_FONT_SIZE }] : []
  return description ? [{ text: head, fontSize: WATERMARK_FONT_SIZE }, { text: description, fontSize: WATERMARK_DESCRIPTION_FONT_SIZE }] : [{ text: head, fontSize: WATERMARK_FONT_SIZE }]
}

export interface WatermarkDeps {
  chart: IChartApi
  settings(): ChartSettings
  facts(): WatermarkFacts
  fontFamily(): string
  /** The index of the pane the main series stands in, the one this is drawn on; the first when
   *  absent. Once drawn, it moves with that pane. */
  mainPane?(): number
  /** The renderer's text watermark, for a test to stand in for. */
  create?: (pane: ReturnType<IChartApi['panes']>[number], options: Parameters<typeof createTextWatermark<Time>>[1]) => Pick<ITextWatermarkPluginApi<Time>, 'applyOptions' | 'detach'>
}

export interface WatermarkLayer {
  /** Write the watermark again from the settings and the facts. */
  refresh(): void
  destroy(): void
}

export function attachWatermark(deps: WatermarkDeps): WatermarkLayer {
  const create = deps.create ?? ((pane, options) => createTextWatermark(pane, options))
  let plugin: Pick<ITextWatermarkPluginApi<Time>, 'applyOptions' | 'detach'> | null = null
  const refresh = (): void => {
    const settings = deps.settings()
    const lines = watermarkLines(settings.canvas, deps.facts()).map((line) => ({
      text: line.text,
      fontSize: line.fontSize,
      color: settings.canvas.watermarkColor,
      fontFamily: deps.fontFamily(),
      fontStyle: '',
    }))
    // Created on the first line asked for, and kept: an empty watermark is hidden rather than
    // detached, so a toggle back costs nothing.
    if (!plugin && lines.length === 0) return
    const options = { visible: lines.length > 0, horzAlign: 'center' as const, vertAlign: 'center' as const, lines }
    try {
      if (plugin) plugin.applyOptions(options)
      else {
        const pane = deps.chart.panes()[deps.mainPane?.() ?? 0]
        if (pane) plugin = create(pane, options)
      }
    } catch {
      /* the renderer is going down */
    }
  }
  refresh()
  return {
    refresh,
    destroy() {
      try {
        plugin?.detach()
      } catch {
        /* the renderer already released its pane */
      }
      plugin = null
    },
  }
}
