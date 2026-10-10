// The chart settings: every viewer-tunable property of a chart, in ONE typed tree of sections and
// leaves. A section is one group of the settings dialog; a leaf is one value a row edits. Every leaf
// is a JSON primitive, so a partial merges leaf by leaf, saves as plain JSON and restores without a
// schema of its own. A color leaf that is null follows the bar colors rather than naming one.
//
// The tree resolves as a ladder: the theme floor (the mode's factory values), then the host's
// constructor partial, then the viewer's runtime partial. Only the viewer's partial is saved with a
// chart, so a leaf nobody named takes whatever theme the chart opens under.

/** When an on-chart control shows: while the pointer is over its area, always, or never. */
export type ChartControlVisibility = 'hover' | 'always' | 'never'

/** How a line is stroked. */
export type ChartStrokeStyle = 'solid' | 'dashed' | 'dotted'

/** Which bar value a single-value style draws. */
export type ChartPriceSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4'

/** How prices are written: the symbol's own precision, a fixed count of decimals (0 to 15), or a
 *  fraction of a whole (halves through 320ths). */
export type ChartPricePrecision =
  | 'default'
  | `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`
  | `1/${2 | 4 | 8 | 16 | 32 | 64 | 128 | 320}`

/** The text a legend titles the symbol with. */
export type ChartTitleSource = 'name' | 'symbol' | 'symbolAndName'

/** What the symbol's last-value label on the price scale holds: the value as the scale states it,
 *  or the price with its percentage change beneath it. */
export type ChartLastValueMode = 'scale' | 'priceAndPercent'

/** Where the price scales stand: stacked on the left, stacked on the right, or wherever each
 *  series' scale belongs. */
export type ChartScalePlacement = 'left' | 'right' | 'auto'

/** How the time scale writes a date. `ddd` is the weekday, which `timeScale.dayOfWeek` adds or
 *  removes; the rest are the date's own order and separators. */
export type ChartDateFormat =
  | 'MMM Q yy'
  | 'MMM Q yyyy'
  | 'dd MMM yy'
  | 'MMM yy'
  | 'MMM dd, yyyy'
  | 'MMM yyyy'
  | 'MMM dd'
  | 'dd MMM'
  | 'yyyy-MM-dd'
  | 'yy-MM-dd'
  | 'yy/MM/dd'
  | 'yyyy/MM/dd'
  | 'dd-MM-yyyy'
  | 'dd-MM-yy'
  | 'dd/MM/yy'
  | 'dd/MM/yyyy'
  | 'MM/dd/yy'
  | 'MM/dd/yyyy'

/** A clock of 24 hours or of 12 with a day half. */
export type ChartHoursFormat = '24' | '12'

/** The chart's background: one color, or a vertical gradient from the top color to the bottom. */
export type ChartBackgroundType = 'solid' | 'gradient'

/** The candle family: candles and hollow candles share it. */
export interface CandleStyleSettings {
  /** Color each bar by its close against the previous bar's close, rather than against its own open. */
  colorOnPreviousClose: boolean
  /** Fill the body. Off leaves the body hollow, so only its border and wick stand. */
  body: boolean
  upColor: string
  downColor: string
  borders: boolean
  borderUpColor: string
  borderDownColor: string
  wick: boolean
  wickUpColor: string
  wickDownColor: string
}

/** Every setting of a chart. */
export interface ChartSettings {
  candles: CandleStyleSettings
  hollowCandles: Omit<CandleStyleSettings, 'colorOnPreviousClose'>
  bars: {
    colorOnPreviousClose: boolean
    upColor: string
    downColor: string
    thinBars: boolean
    /** Draw the open tick. */
    open: boolean
  }
  line: { priceSource: ChartPriceSource; color: string; lineStyle: ChartStrokeStyle; lineWidth: number }
  stepLine: { priceSource: ChartPriceSource; color: string; lineStyle: ChartStrokeStyle; lineWidth: number }
  area: {
    priceSource: ChartPriceSource
    lineColor: string
    lineStyle: ChartStrokeStyle
    lineWidth: number
    /** The fill's color at the line, fading to `bottomColor` at the pane's foot. */
    topColor: string
    bottomColor: string
  }
  baseline: {
    priceSource: ChartPriceSource
    topLineColor: string
    topFillColor1: string
    topFillColor2: string
    bottomLineColor: string
    bottomFillColor1: string
    bottomFillColor2: string
    lineWidth: number
    /** Where the base level stands, as a percentage of the pane's height from its foot. */
    baseLevelPercentage: number
  }
  /** Settings of the charted symbol that hold whatever its style. */
  symbol: {
    precision: ChartPricePrecision
  }
  /** The legend over the pane that names the symbol and states its values. */
  statusLine: {
    logo: boolean
    title: boolean
    titleSource: ChartTitleSource
    /** The bar's open, high, low and close. */
    chartValues: boolean
    /** The bar's change and percentage change. */
    barChange: boolean
    volume: boolean
    /** The change since the previous session's close, from the datafeed's quotes. */
    lastDayChange: boolean
    background: boolean
    /** The background's opacity, 0 to 100. */
    backgroundOpacity: number
  }
  priceScale: {
    /** The currency and unit box at the top of the price scale. */
    currencyAndUnit: ChartControlVisibility
    /** The auto-scale and logarithmic buttons at the foot of the price scale. */
    scaleModeButtons: ChartControlVisibility
    /** Hold the price-to-bar ratio while the time scale zooms. */
    lockPriceToBarRatio: boolean
    /** The held ratio, or null to take the ratio the chart shows when the lock engages. */
    priceToBarRatio: number | null
    placement: ChartScalePlacement
  }
  priceLabels: {
    /** Move price-scale labels apart so none overlaps another. */
    noOverlappingLabels: boolean
    /** The add button beside the crosshair's price label, opening the price-level menu. */
    plusButton: boolean
    /** The time left until the bar closes, under the last-value label. */
    countdown: boolean
    symbolName: boolean
    symbolValue: boolean
    symbolLine: boolean
    /** Null follows the last bar's color. */
    symbolLineColor: string | null
    symbolLineWidth: number
    symbolValueMode: ChartLastValueMode
    previousCloseValue: boolean
    previousCloseLine: boolean
    previousCloseColor: string
    previousCloseLineWidth: number
    highLowValue: boolean
    highLowLine: boolean
    /** Null follows the bar colors. */
    highLowColor: string | null
    highLowLineWidth: number
    /** Bid and ask come from the datafeed's quotes. */
    bidAskValue: boolean
    bidAskLine: boolean
    bidColor: string
    askColor: string
  }
  timeScale: {
    dayOfWeek: boolean
    dateFormat: ChartDateFormat
    hoursFormat: ChartHoursFormat
    /** Keep the chart's left edge at the same time when the timeframe changes. */
    keepLeftEdge: boolean
  }
  canvas: {
    backgroundType: ChartBackgroundType
    /** The solid color, or the gradient's top. */
    background: string
    /** The gradient's bottom. */
    backgroundBottom: string
    verticalGrid: boolean
    verticalGridColor: string
    verticalGridStyle: ChartStrokeStyle
    horizontalGrid: boolean
    horizontalGridColor: string
    horizontalGridStyle: ChartStrokeStyle
    crosshairColor: string
    crosshairStyle: ChartStrokeStyle
    crosshairWidth: number
    /** The watermark's parts, written large behind the bars. */
    watermarkTicker: boolean
    watermarkInterval: boolean
    watermarkDescription: boolean
    /** Name bar replay in the watermark while it runs. */
    watermarkReplay: boolean
    watermarkColor: string
    scaleTextColor: string
    scaleTextSize: number
    scaleLineColor: string
    navigationButtons: ChartControlVisibility
    paneButtons: ChartControlVisibility
    /** Space above the highest bar, as a percentage of the pane's height. */
    marginTop: number
    /** Space below the lowest bar, as a percentage of the pane's height. */
    marginBottom: number
    /** Empty bar slots after the last bar. */
    marginRight: number
  }
  events: {
    sessionBreaks: boolean
    sessionBreaksColor: string
    sessionBreaksStyle: ChartStrokeStyle
    sessionBreaksWidth: number
  }
}

/** A section's name. */
export type ChartSettingsSection = keyof ChartSettings

/** What a host or a viewer supplies: any leaves of any sections. */
export type PartialChartSettings = { [S in ChartSettingsSection]?: Partial<ChartSettings[S]> }
