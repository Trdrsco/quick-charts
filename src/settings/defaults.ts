// The chart settings' factory values and the ladder that resolves them.
//
// The floor is a function of the resolved theme: every color that changes with the mode reads its
// role, so a host's custom palette tints the chart's factory look as it tints the rest of the chart,
// and every color that does not is one of the theme's factory chart colors. The other leaves are
// the same in every mode. Above the floor, the host's constructor partial and then the viewer's
// runtime partial win leaf by leaf.
//
// A stored partial is read back through `readPartialChartSettings`, which keeps a leaf only when its
// section and name are the tree's and its value has the leaf's type, so a saved chart can never hand
// the renderer a value it cannot draw.
import { parseCssColor } from '../theme/color'
import { CHART_FACTORY_COLORS, DARK_THEME } from '../theme/palettes'
import type { SemanticTheme } from '../theme/schema'
import { CHART_DATE_FORMATS, type ChartSettings, type ChartSettingsSection, type PartialChartSettings } from './schema'

/** A CSS color at a given opacity. Hex and rgb inputs are understood; anything else comes back as it
 *  was, so an unusual palette value still paints. */
export function colorWithAlpha(color: string, alpha: number): string {
  const parsed = parseCssColor(color)
  if (!parsed) return color
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${Math.min(1, Math.max(0, alpha))})`
}

/** The chart settings a chart opens with under a resolved theme, before any host or viewer names a
 *  leaf. */
export function chartSettingsDefaults(theme: SemanticTheme): ChartSettings {
  const up = theme['series.up']
  const down = theme['series.down']
  const factory = CHART_FACTORY_COLORS
  const candle = {
    body: true,
    upColor: up,
    downColor: down,
    borders: true,
    borderUpColor: up,
    borderDownColor: down,
    wick: true,
    wickUpColor: up,
    wickDownColor: down,
  }
  const line = {
    priceSource: 'close',
    colorType: 'gradient',
    color: factory.line,
    gradientTopColor: factory.lineGradientTop,
    gradientBottomColor: factory.lineGradientBottom,
    lineStyle: 'solid',
    lineWidth: 2,
  } as const
  return {
    candles: { colorOnPreviousClose: false, ...candle },
    hollowCandles: { ...candle },
    bars: { colorOnPreviousClose: false, hlcBars: false, upColor: up, downColor: down, thinBars: true },
    line: { ...line },
    stepLine: { ...line },
    area: {
      priceSource: 'close',
      lineColor: factory.line,
      lineStyle: 'solid',
      lineWidth: 2,
      topColor: factory.areaTop,
      bottomColor: factory.areaBottom,
    },
    baseline: {
      priceSource: 'close',
      topLineColor: up,
      topLineWidth: 2,
      topFillColor1: colorWithAlpha(up, 0.28),
      topFillColor2: colorWithAlpha(up, 0.05),
      bottomLineColor: down,
      bottomLineWidth: 2,
      bottomFillColor1: colorWithAlpha(down, 0.05),
      bottomFillColor2: colorWithAlpha(down, 0.28),
      baseLevelPercentage: 50,
    },
    symbol: {
      session: 'regular',
      preMarketColor: theme['scale.sessionPreMarket'],
      postMarketColor: theme['scale.sessionAfterHours'],
      nightColor: theme['scale.sessionExtended'],
      precision: 'default',
    },
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
    priceScale: {
      currencyAndUnit: 'hover',
      scaleModeButtons: 'hover',
      lockPriceToBarRatio: false,
      priceToBarRatio: null,
      placement: 'auto',
    },
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
      preMarketLabelColor: factory.preMarketLabel,
      postMarketLabelColor: factory.postMarketLabel,
      nightLabelColor: factory.nightLabel,
      previousCloseValue: false,
      previousCloseLine: false,
      previousCloseColor: factory.previousClose,
      previousCloseLineWidth: 1,
      highLowValue: false,
      highLowLine: false,
      highLowColor: null,
      highLowLineWidth: 1,
      bidAskValue: false,
      bidAskLine: false,
      bidColor: factory.bid,
      askColor: factory.ask,
    },
    timeScale: { dayOfWeek: true, dateFormat: "dd MMM 'yy", hoursFormat: '24', keepLeftEdge: false },
    canvas: {
      backgroundType: 'solid',
      background: theme['canvas.background'],
      backgroundBottom: theme['canvas.background'],
      verticalGrid: true,
      verticalGridColor: theme['scale.grid'],
      verticalGridStyle: 'dotted',
      horizontalGrid: true,
      horizontalGridColor: theme['scale.grid'],
      horizontalGridStyle: 'dotted',
      crosshairColor: theme['scale.crosshair'],
      crosshairStyle: 'dashed',
      crosshairWidth: 1,
      watermarkTicker: false,
      watermarkInterval: false,
      watermarkDescription: false,
      watermarkReplay: true,
      watermarkColor: theme['canvas.watermark'],
      scaleTextColor: theme['scale.text'],
      scaleTextSize: 12,
      scaleLineColor: theme['scale.border'],
      navigationButtons: 'hover',
      paneButtons: 'hover',
      marginTop: 10,
      marginBottom: 8,
      marginRight: 10,
    },
    events: { sessionBreaks: false, sessionBreaksColor: factory.sessionBreaks, sessionBreaksStyle: 'dashed', sessionBreaksWidth: 1 },
  }
}

const PRICE_SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'] as const
const STROKES = ['solid', 'dashed', 'dotted'] as const
const VISIBILITIES = ['hover', 'always', 'never'] as const
const PRECISIONS = [
  'default',
  ...Array.from({ length: 16 }, (_, i) => String(i)),
  ...[2, 4, 8, 16, 32, 64, 128, 320].map((d) => `1/${d}`),
] as const

/** The leaves whose value is one of a fixed set of words, keyed `section.leaf`. */
const CHOICES: Readonly<Record<string, readonly string[]>> = {
  'line.priceSource': PRICE_SOURCES,
  'line.colorType': ['solid', 'gradient'],
  'line.lineStyle': STROKES,
  'stepLine.priceSource': PRICE_SOURCES,
  'stepLine.colorType': ['solid', 'gradient'],
  'stepLine.lineStyle': STROKES,
  'area.priceSource': PRICE_SOURCES,
  'area.lineStyle': STROKES,
  'baseline.priceSource': PRICE_SOURCES,
  'symbol.session': ['regular', 'extended', 'allHours'],
  'symbol.precision': PRECISIONS,
  'statusLine.titleSource': ['name', 'symbol', 'symbolAndName'],
  'priceScale.currencyAndUnit': VISIBILITIES,
  'priceScale.scaleModeButtons': VISIBILITIES,
  'priceScale.placement': ['left', 'right', 'auto'],
  'priceLabels.symbolValueMode': ['scale', 'priceAndPercent'],
  'timeScale.dateFormat': CHART_DATE_FORMATS,
  'timeScale.hoursFormat': ['24', '12'],
  'canvas.backgroundType': ['solid', 'gradient'],
  'canvas.verticalGridStyle': STROKES,
  'canvas.horizontalGridStyle': STROKES,
  'canvas.crosshairStyle': STROKES,
  'canvas.navigationButtons': VISIBILITIES,
  'canvas.paneButtons': VISIBILITIES,
  'events.sessionBreaksStyle': STROKES,
}

/** The leaves that may hold null, and what they hold otherwise. */
const NULLABLE: Readonly<Record<string, 'color' | 'number'>> = {
  'priceLabels.symbolLineColor': 'color',
  'priceLabels.highLowColor': 'color',
  'priceScale.priceToBarRatio': 'number',
}

/** The tree's shape, read off a floor: which sections exist and what type each leaf holds. Colors
 *  in a floor are strings, which is what a color leaf is told apart by. */
const SHAPE: ChartSettings = chartSettingsDefaults(DARK_THEME)

/** Every section of the tree, in its order. */
export const CHART_SETTINGS_SECTIONS: readonly ChartSettingsSection[] = Object.keys(SHAPE) as ChartSettingsSection[]

/** What reading a stored partial kept, and the `section.leaf` paths it had to drop because the value
 *  was not one the leaf can hold. A path the tree does not have at all is ignored rather than
 *  reported: it is a leaf this build does not know, not a broken one. */
export interface ReadChartSettings {
  settings: PartialChartSettings
  rejected: string[]
}

/** Read a stored or supplied partial. `isColor` decides whether a string is a color the renderer can
 *  paint; the portable parser is the default. */
export function readPartialChartSettings(raw: unknown, isColor: (value: string) => boolean = (value) => parseCssColor(value) !== null): ReadChartSettings {
  const settings: Record<string, Record<string, unknown>> = {}
  const rejected: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { settings: {}, rejected }
  for (const [section, leaves] of Object.entries(raw as Record<string, unknown>)) {
    const shape = (SHAPE as unknown as Record<string, Record<string, unknown>>)[section]
    if (!shape || !leaves || typeof leaves !== 'object' || Array.isArray(leaves)) continue
    for (const [leaf, value] of Object.entries(leaves as Record<string, unknown>)) {
      if (!Object.prototype.hasOwnProperty.call(shape, leaf) || value === undefined) continue
      const path = `${section}.${leaf}`
      if (acceptable(path, shape[leaf], value, isColor)) (settings[section] ??= {})[leaf] = value
      else rejected.push(path)
    }
  }
  return { settings: settings as PartialChartSettings, rejected }
}

function acceptable(path: string, sample: unknown, value: unknown, isColor: (value: string) => boolean): boolean {
  const nullable = NULLABLE[path]
  if (nullable) {
    if (value === null) return true
    return nullable === 'number' ? typeof value === 'number' && Number.isFinite(value) : typeof value === 'string' && isColor(value)
  }
  if (typeof sample === 'boolean') return typeof value === 'boolean'
  if (typeof sample === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (typeof value !== 'string') return false
  const choices = CHOICES[path]
  return choices ? choices.includes(value) : isColor(value)
}

/** Layer partials over a complete tree, later partials winning leaf by leaf. A leaf the tree does
 *  not have is ignored. */
export function layerChartSettings(base: ChartSettings, ...partials: (PartialChartSettings | null | undefined)[]): ChartSettings {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [section, leaves] of Object.entries(base)) out[section] = { ...(leaves as Record<string, unknown>) }
  for (const partial of partials) {
    if (!partial) continue
    for (const [section, leaves] of Object.entries(partial)) {
      const target = out[section]
      if (!target || !leaves) continue
      for (const [leaf, value] of Object.entries(leaves as Record<string, unknown>)) {
        if (value !== undefined && Object.prototype.hasOwnProperty.call(target, leaf)) target[leaf] = value
      }
    }
  }
  return out as unknown as ChartSettings
}

/** Two partials as one, the second winning leaf by leaf. */
export function mergePartialChartSettings(first: PartialChartSettings, second: PartialChartSettings): PartialChartSettings {
  const out: Record<string, Record<string, unknown>> = {}
  for (const partial of [first, second]) {
    for (const [section, leaves] of Object.entries(partial)) {
      if (!leaves) continue
      out[section] = { ...out[section], ...(leaves as Record<string, unknown>) }
    }
  }
  return out as PartialChartSettings
}

/** A deep copy of a partial: what a chart holds, so a caller's object never aliases the chart's. */
export function copyPartialChartSettings(partial: PartialChartSettings): PartialChartSettings {
  return mergePartialChartSettings({}, partial)
}

/** The settings a chart content blob of the previous format carried as its `appearance` partial,
 *  in the tree's sections. The single up and down pair colored every bar style's up and down, the
 *  hollow candles' borders and wicks, and the baseline's lines and fills, so it names each of them;
 *  the plain candles' borders and wicks had their own leaves. `sessions` turned on the shading of
 *  the stretches outside regular hours, which is the extended trading hours now. Values go through
 *  the same reading as any stored partial. */
export function settingsFromAppearance(appearance: unknown, isColor?: (value: string) => boolean): ReadChartSettings {
  if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) return { settings: {}, rejected: [] }
  const old = appearance as Record<string, unknown>
  const out: Record<string, Record<string, unknown>> = {}
  const put = (section: ChartSettingsSection, leaf: string, value: unknown): void => {
    if (value !== undefined) (out[section] ??= {})[leaf] = value
  }
  const tinted = (value: unknown, alpha: number): unknown => (typeof value === 'string' ? colorWithAlpha(value, alpha) : value)
  const up = old.upColor
  const down = old.downColor
  put('candles', 'upColor', up)
  put('candles', 'downColor', down)
  put('hollowCandles', 'upColor', up)
  put('hollowCandles', 'downColor', down)
  put('hollowCandles', 'borderUpColor', up)
  put('hollowCandles', 'borderDownColor', down)
  put('hollowCandles', 'wickUpColor', up)
  put('hollowCandles', 'wickDownColor', down)
  put('bars', 'upColor', up)
  put('bars', 'downColor', down)
  if (up !== undefined) {
    put('baseline', 'topLineColor', up)
    put('baseline', 'topFillColor1', tinted(up, 0.28))
    put('baseline', 'topFillColor2', tinted(up, 0.05))
  }
  if (down !== undefined) {
    put('baseline', 'bottomLineColor', down)
    put('baseline', 'bottomFillColor1', tinted(down, 0.05))
    put('baseline', 'bottomFillColor2', tinted(down, 0.28))
  }
  put('candles', 'borderUpColor', old.borderUpColor)
  put('candles', 'borderDownColor', old.borderDownColor)
  put('candles', 'wickUpColor', old.wickUpColor)
  put('candles', 'wickDownColor', old.wickDownColor)
  put('canvas', 'background', old.background)
  put('canvas', 'verticalGrid', old.grid)
  put('canvas', 'horizontalGrid', old.grid)
  put('priceLabels', 'countdown', old.countdown)
  if (old.sessions === true) put('symbol', 'session', 'extended')
  return readPartialChartSettings(out, isColor)
}
