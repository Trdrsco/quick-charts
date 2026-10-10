// The renderer's chart-level options for a resolved settings tree: the canvas background, the grid,
// the crosshair, the scales' text, lines and label alignment, and the margins. One pure function, so
// the chart applies the same answer when it is created and on every look change after, and a test
// reads the options a setting drives without a renderer.
import { ColorType, LineStyle } from 'lightweight-charts'
import type { ChartSettings } from '../settings/schema'
import type { CanvasTheme } from '../theme/renderer'
import { lineWidthOf, strokeLineStyle } from './styles'

/** The host's controls that shape the crosshair and the price scale, beside the settings. */
export interface ChartLookUi {
  crosshairLabels: boolean
  crosshairHorizontal: boolean
  /** The host draws the crosshair solid, whatever the setting's stroke. */
  crosshairSolid: boolean
}

/** The renderer options the settings drive. The right margin is not among them: it is the time
 *  scale's right offset, which also scrolls the view, so the chart writes it only when it changes. */
export function chartLookOptions(settings: ChartSettings, canvas: CanvasTheme, ui: ChartLookUi): Record<string, unknown> {
  const c = settings.canvas
  const crosshairLine = {
    color: c.crosshairColor,
    width: lineWidthOf(c.crosshairWidth),
    style: ui.crosshairSolid ? LineStyle.Solid : strokeLineStyle(c.crosshairStyle),
    labelBackgroundColor: canvas.crosshairLabelBackground,
    labelVisible: ui.crosshairLabels,
  }
  const scale = {
    borderVisible: true,
    borderColor: c.scaleLineColor,
    alignLabels: settings.priceLabels.noOverlappingLabels,
    scaleMargins: { top: c.marginTop / 100, bottom: c.marginBottom / 100 },
  }
  return {
    layout: {
      background:
        c.backgroundType === 'gradient'
          ? { type: ColorType.VerticalGradient, topColor: c.background, bottomColor: c.backgroundBottom }
          : { type: ColorType.Solid, color: c.background },
      textColor: c.scaleTextColor,
      fontSize: c.scaleTextSize,
      fontFamily: canvas.fontFamily,
    },
    grid: {
      vertLines: { visible: c.verticalGrid, color: c.verticalGridColor, style: strokeLineStyle(c.verticalGridStyle) },
      horzLines: { visible: c.horizontalGrid, color: c.horizontalGridColor, style: strokeLineStyle(c.horizontalGridStyle) },
    },
    crosshair: {
      vertLine: { ...crosshairLine },
      horzLine: { ...crosshairLine, visible: ui.crosshairHorizontal },
    },
    rightPriceScale: { ...scale },
    leftPriceScale: { ...scale },
    timeScale: { borderVisible: true, borderColor: c.scaleLineColor },
  }
}

/** The canvas theme an extension reads: the mode's own values, with the ones a setting governs
 *  replaced by what the settings resolve to, so an extension draws over the chart the viewer sees. */
export function settingsCanvas(canvas: CanvasTheme, settings: ChartSettings): CanvasTheme {
  const c = settings.canvas
  return {
    ...canvas,
    background: c.background,
    watermark: c.watermarkColor,
    grid: c.horizontalGridColor,
    axisText: c.scaleTextColor,
    axisBorder: c.scaleLineColor,
    crosshair: c.crosshairColor,
    fontSize: c.scaleTextSize,
    up: settings.candles.upColor,
    down: settings.candles.downColor,
  }
}
