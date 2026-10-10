// A complete settings tree for the dialog's tests: the dark mode's factory values, as a chart answers
// `settings()` with no host or viewer partial over them.
import type { ChartSettings, PartialChartSettings } from '../../../src/settings/schema'

const candles = {
  body: true,
  upColor: '#089981',
  downColor: '#f23645',
  borders: true,
  borderUpColor: '#089981',
  borderDownColor: '#f23645',
  wick: true,
  wickUpColor: '#089981',
  wickDownColor: '#f23645',
}

const line = {
  priceSource: 'close',
  colorType: 'gradient',
  color: '#2962ff',
  gradientTopColor: '#d500f9',
  gradientBottomColor: '#00bce5',
  lineStyle: 'solid',
  lineWidth: 2,
} as const

export const FACTORY_SETTINGS: ChartSettings = {
  candles: { colorOnPreviousClose: false, ...candles },
  hollowCandles: { ...candles },
  bars: { colorOnPreviousClose: false, hlcBars: false, upColor: '#089981', downColor: '#f23645', thinBars: true },
  line: { ...line },
  stepLine: { ...line },
  area: { priceSource: 'close', lineColor: '#2962ff', lineStyle: 'solid', lineWidth: 2, topColor: 'rgba(41, 98, 255, 0.28)', bottomColor: 'rgba(41, 98, 255, 0)' },
  baseline: {
    priceSource: 'close',
    topLineColor: '#089981',
    topLineWidth: 2,
    topFillColor1: 'rgba(8, 153, 129, 0.28)',
    topFillColor2: 'rgba(8, 153, 129, 0.05)',
    bottomLineColor: '#f23645',
    bottomLineWidth: 2,
    bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
    bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
    baseLevelPercentage: 50,
  },
  symbol: { session: 'regular', preMarketColor: 'rgba(255, 152, 0, 0.08)', postMarketColor: 'rgba(41, 98, 255, 0.08)', nightColor: 'rgba(213, 0, 249, 0.08)', precision: 'default' },
  statusLine: {
    logo: true,
    title: true,
    titleSource: 'name',
    chartValues: true,
    barChange: true,
    volume: false,
    lastDayChange: false,
    indicatorTitles: true,
    indicatorInputs: true,
    indicatorValues: true,
    background: true,
    backgroundOpacity: 50,
  },
  priceScale: { currencyAndUnit: 'hover', scaleModeButtons: 'hover', lockPriceToBarRatio: false, priceToBarRatio: null, placement: 'auto' },
  priceLabels: {
    noOverlappingLabels: true,
    plusButton: true,
    countdown: true,
    symbolName: false,
    symbolValue: true,
    symbolLine: true,
    symbolLineColor: null,
    symbolLineWidth: 1,
    symbolValueMode: 'scale',
    indicatorLabelName: false,
    indicatorLabelValue: true,
    extendedHoursValue: true,
    extendedHoursLine: true,
    preMarketLabelColor: '#fb8c00',
    postMarketLabelColor: '#2962ff',
    nightLabelColor: '#8e24aa',
    previousCloseValue: false,
    previousCloseLine: false,
    previousCloseColor: '#555555',
    previousCloseLineWidth: 1,
    highLowValue: false,
    highLowLine: false,
    highLowColor: null,
    highLowLineWidth: 1,
    bidAskValue: false,
    bidAskLine: false,
    bidColor: '#2962ff',
    askColor: '#f7525f',
  },
  timeScale: { dayOfWeek: true, dateFormat: "dd MMM 'yy" as ChartSettings['timeScale']['dateFormat'], hoursFormat: '24', keepLeftEdge: false },
  canvas: {
    backgroundType: 'solid',
    background: '#0f0f0f',
    backgroundBottom: '#0f0f0f',
    verticalGrid: true,
    verticalGridColor: 'rgba(242, 242, 242, 0.2)',
    verticalGridStyle: 'dotted',
    horizontalGrid: true,
    horizontalGridColor: 'rgba(242, 242, 242, 0.2)',
    horizontalGridStyle: 'dotted',
    crosshairColor: '#9c9c9c',
    crosshairStyle: 'dashed',
    crosshairWidth: 1,
    watermarkTicker: false,
    watermarkInterval: false,
    watermarkDescription: false,
    watermarkReplay: true,
    watermarkColor: 'rgba(80, 83, 94, 0.3)',
    scaleTextColor: '#b8b8b8',
    scaleTextSize: 12,
    scaleLineColor: 'rgba(242, 242, 242, 0)',
    navigationButtons: 'hover',
    paneButtons: 'hover',
    marginTop: 10,
    marginBottom: 8,
    marginRight: 10,
  },
  events: { sessionBreaks: false, sessionBreaksColor: '#4985e7', sessionBreaksStyle: 'dashed', sessionBreaksWidth: 1 },
}

/** The factory settings with a partial layered over them, leaf by leaf. */
export function settingsWith(partial: PartialChartSettings): ChartSettings {
  const out = structuredClone(FACTORY_SETTINGS) as unknown as Record<string, Record<string, unknown>>
  for (const [section, leaves] of Object.entries(partial)) Object.assign(out[section]!, leaves)
  return out as unknown as ChartSettings
}

/** Two partials layered leaf by leaf, the later over the earlier. */
export function layered(base: PartialChartSettings, over: PartialChartSettings): PartialChartSettings {
  const out: Record<string, Record<string, unknown>> = {}
  for (const source of [base, over]) for (const [section, leaves] of Object.entries(source)) out[section] = { ...out[section], ...leaves }
  return out as PartialChartSettings
}
