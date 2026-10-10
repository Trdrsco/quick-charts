// The chart's own settings pages, built with the form a host's contribution receives. Each page reads
// the chart's effective settings and writes a partial back for every change; the dialog previews the
// change and draws the page again.
//
// A row that only means something in a context shows only in it: the trading-hours rows on an
// intraday chart of a symbol with extended hours, the indicator rows on a chart that holds an
// indicator, and the session breaks and the previous close on an intraday chart. The Symbol page
// shows the rows of the chart's style.
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import type { ChartSettingsControls, ChartSettingsOption, ChartSettingsPageId } from '../../settings/contribution'
import type {
  CandleStyleSettings,
  ChartControlVisibility,
  ChartDateFormat,
  ChartPricePrecision,
  ChartPriceSource,
  ChartSettings,
  ChartStrokeStyle,
  LineStyleSettings,
  PartialChartSettings,
} from '../../settings/schema'
import { CHART_DATE_FORMATS } from '../../settings/schema'
import { chartDateSample } from '../../timezones'
import type { ChartStyleId } from '../../widget/styles'
import type { TimezoneRow } from '../../timezones'
import type { SettingsForm as ChartSettingsForm } from './form'

/** What a page reads and how it writes. */
export interface ChartPageContext {
  t: ChartTranslate
  /** The chart's language, for the samples a date format shows. */
  locale: string
  settings: ChartSettings
  style: ChartStyleId
  /** Write a partial of the settings: the dialog runs it through `chart.settings.apply`. */
  apply(partial: PartialChartSettings): void
  /** The display timezones the chart offers, its choice, and the command a choice runs. */
  timezones: readonly TimezoneRow[]
  timezone: string
  setTimezone(id: string): void
  /** The chart's context: an intraday timeframe, a symbol that trades outside regular hours, and
   *  any indicator on the chart. */
  intraday: boolean
  extendedHours: boolean
  indicators: boolean
  /** The tint an opacity slider fades into where the setting has no color of its own. */
  accent: string
}

/** The widths a line's thickness takes. */
const LINE_WIDTHS: readonly number[] = [1, 2, 3, 4]

const PRICE_SOURCES: readonly { value: ChartPriceSource; key: ChartMessageKey }[] = [
  { value: 'open', key: 'settings.sourceOpen' },
  { value: 'high', key: 'settings.sourceHigh' },
  { value: 'low', key: 'settings.sourceLow' },
  { value: 'close', key: 'settings.sourceClose' },
  { value: 'hl2', key: 'settings.sourceHl2' },
  { value: 'hlc3', key: 'settings.sourceHlc3' },
  { value: 'ohlc4', key: 'settings.sourceOhlc4' },
]

/** A source a host or a saved chart may hold that the list does not offer, named for the button. */
const SOURCE_OUTSIDE_LIST: Readonly<Partial<Record<ChartPriceSource, ChartMessageKey>>> = { hlcc4: 'settings.sourceHlcc4' }

const VISIBILITIES: readonly { value: ChartControlVisibility; key: ChartMessageKey }[] = [
  { value: 'hover', key: 'settings.visibleOnMouseOver' },
  { value: 'always', key: 'settings.alwaysVisible' },
  { value: 'never', key: 'settings.alwaysInvisible' },
]

const FONT_SIZES: readonly number[] = [8, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40]

/** The precisions in the list's order: the symbol's own, whole numbers, one to fifteen decimals,
 *  then the fractions. */
const PRECISIONS: readonly ChartPricePrecision[] = [
  'default',
  ...Array.from({ length: 16 }, (_, n) => String(n) as ChartPricePrecision),
  ...([2, 4, 8, 16, 32, 64, 128, 320] as const).map((d) => `1/${d}` as ChartPricePrecision),
]

const options = <V extends string>(t: ChartTranslate, rows: readonly { value: V; key: ChartMessageKey }[]): ChartSettingsOption<V>[] =>
  rows.map((row) => ({ value: row.value, label: t(row.key) }))

function precisionLabel(t: ChartTranslate, precision: ChartPricePrecision): string {
  if (precision === 'default') return t('settings.precisionDefault')
  if (precision === '0') return t('settings.precisionInteger')
  if (precision.includes('/')) return precision
  const count = Number(precision)
  return t('settings.precisionDecimals', { count })
}

/** The chosen values of a list of switches, in the list's order. */
const chosen = <V extends string>(entries: readonly (readonly [V, boolean])[]): V[] => entries.filter(([, on]) => on).map(([value]) => value)

/** A color row's pair: up and down, each named for a reader by the row. */
function upDown(c: ChartSettingsControls, t: ChartTranslate, name: string, up: string, down: string, onUp: (color: string) => void, onDown: (color: string) => void): void {
  c.color({ color: up, onColor: onUp, opacity: true, label: t('settings.upColorOf', { name }) })
  c.color({ color: down, onColor: onDown, opacity: true, label: t('settings.downColorOf', { name }) })
}

/** The candle family's rows: candles with the previous-close switch, hollow candles without it. */
function candleRows(form: ChartSettingsForm, ctx: ChartPageContext, section: 'candles' | 'hollowCandles'): void {
  const { t } = ctx
  const s = ctx.settings[section] as Partial<CandleStyleSettings> & Omit<CandleStyleSettings, 'colorOnPreviousClose'>
  const set = (leaves: Partial<CandleStyleSettings>): void => ctx.apply({ [section]: leaves } as PartialChartSettings)
  form.heading(t(section === 'candles' ? 'settings.headingCandles' : 'settings.headingHollowCandles'))
  if (section === 'candles') {
    form.check({ id: 'colorOnPreviousClose', label: t('settings.colorOnPreviousClose'), checked: s.colorOnPreviousClose === true, onChange: (on) => set({ colorOnPreviousClose: on }) })
  }
  const parts = [
    { id: 'body', label: t('settings.body'), on: s.body, up: s.upColor, down: s.downColor, leaves: ['body', 'upColor', 'downColor'] },
    { id: 'borders', label: t('settings.borders'), on: s.borders, up: s.borderUpColor, down: s.borderDownColor, leaves: ['borders', 'borderUpColor', 'borderDownColor'] },
    { id: 'wick', label: t('settings.wick'), on: s.wick, up: s.wickUpColor, down: s.wickDownColor, leaves: ['wick', 'wickUpColor', 'wickDownColor'] },
  ] as const
  for (const part of parts) {
    const [on, up, down] = part.leaves
    form.check({
      id: part.id,
      label: part.label,
      checked: part.on,
      onChange: (value) => set({ [on]: value } as Partial<CandleStyleSettings>),
      controls: (c) => upDown(c, t, part.label, part.up, part.down, (color) => set({ [up]: color } as Partial<CandleStyleSettings>), (color) => set({ [down]: color } as Partial<CandleStyleSettings>)),
    })
  }
}

function priceSourceRow(form: ChartSettingsForm, ctx: ChartPageContext, value: ChartPriceSource, onChange: (source: ChartPriceSource) => void): void {
  const { t } = ctx
  const list = options(ctx.t, PRICE_SOURCES)
  const outside = SOURCE_OUTSIDE_LIST[value]
  if (outside) list.push({ value, label: t(outside) })
  form.field({ id: 'priceSource', label: t('settings.priceSource'), controls: (c) => c.select({ value, options: list, width: 150, onChange }) })
}

/** The single-value line's rows: its source, then its line, a gradient's two colors and width or
 *  one color and line. */
function lineRows(form: ChartSettingsForm, ctx: ChartPageContext, section: 'line' | 'stepLine'): void {
  const { t } = ctx
  const s: LineStyleSettings = ctx.settings[section]
  const set = (leaves: Partial<LineStyleSettings>): void => ctx.apply({ [section]: leaves })
  form.heading(t(section === 'line' ? 'settings.headingLine' : 'settings.headingStepLine'))
  priceSourceRow(form, ctx, s.priceSource, (priceSource) => set({ priceSource }))
  const name = t('settings.lineRow')
  form.field({
    id: 'line',
    label: name,
    controls: (c) => {
      c.select({
        value: s.colorType,
        options: [
          { value: 'solid', label: t('settings.colorSolid') },
          { value: 'gradient', label: t('settings.colorGradient') },
        ],
        width: 150,
        onChange: (colorType) => set({ colorType }),
      })
      if (s.colorType === 'gradient') {
        c.color({ color: s.gradientTopColor, onColor: (gradientTopColor) => set({ gradientTopColor }), opacity: true, label: t('settings.topColorOf', { name }) })
        c.color({ color: s.gradientBottomColor, onColor: (gradientBottomColor) => set({ gradientBottomColor }), opacity: true, label: t('settings.bottomColorOf', { name }) })
        c.lineWidth({ value: s.lineWidth, options: LINE_WIDTHS, onChange: (lineWidth) => set({ lineWidth }) })
        return
      }
      c.color({
        color: s.color,
        onColor: (color) => set({ color }),
        opacity: true,
        lineWidth: { value: s.lineWidth, options: LINE_WIDTHS, onChange: (lineWidth) => set({ lineWidth }) },
        lineStyle: { value: s.lineStyle, onChange: (lineStyle) => set({ lineStyle }) },
      })
    },
  })
}

function symbolPage(form: ChartSettingsForm, ctx: ChartPageContext): void {
  const { t, settings } = ctx
  switch (ctx.style) {
    case 'candles':
      candleRows(form, ctx, 'candles')
      break
    case 'hollow':
      candleRows(form, ctx, 'hollowCandles')
      break
    case 'bars': {
      const s = settings.bars
      const set = (leaves: Partial<ChartSettings['bars']>): void => ctx.apply({ bars: leaves })
      form.heading(t('settings.headingBars'))
      form.check({ id: 'colorOnPreviousClose', label: t('settings.colorOnPreviousClose'), checked: s.colorOnPreviousClose, onChange: (on) => set({ colorOnPreviousClose: on }) })
      form.check({ id: 'hlcBars', label: t('settings.hlcBars'), checked: s.hlcBars, onChange: (on) => set({ hlcBars: on }) })
      form.field({ id: 'upColor', label: t('settings.upColor'), controls: (c) => c.color({ color: s.upColor, onColor: (upColor) => set({ upColor }), opacity: true }) })
      form.field({ id: 'downColor', label: t('settings.downColor'), controls: (c) => c.color({ color: s.downColor, onColor: (downColor) => set({ downColor }), opacity: true }) })
      form.check({ id: 'thinBars', label: t('settings.thinBars'), checked: s.thinBars, onChange: (on) => set({ thinBars: on }) })
      break
    }
    case 'line':
      lineRows(form, ctx, 'line')
      break
    case 'stepline':
      lineRows(form, ctx, 'stepLine')
      break
    case 'area': {
      const s = settings.area
      const set = (leaves: Partial<ChartSettings['area']>): void => ctx.apply({ area: leaves })
      form.heading(t('settings.headingArea'))
      priceSourceRow(form, ctx, s.priceSource, (priceSource) => set({ priceSource }))
      form.field({
        id: 'line',
        label: t('settings.lineRow'),
        controls: (c) =>
          c.color({
            color: s.lineColor,
            onColor: (lineColor) => set({ lineColor }),
            opacity: true,
            lineWidth: { value: s.lineWidth, options: LINE_WIDTHS, onChange: (lineWidth) => set({ lineWidth }) },
            lineStyle: { value: s.lineStyle, onChange: (lineStyle) => set({ lineStyle }) },
          }),
      })
      const fill = t('settings.fill')
      form.field({
        id: 'fill',
        label: fill,
        controls: (c) => {
          c.color({ color: s.topColor, onColor: (topColor) => set({ topColor }), opacity: true, label: t('settings.topColorOf', { name: fill }) })
          c.color({ color: s.bottomColor, onColor: (bottomColor) => set({ bottomColor }), opacity: true, label: t('settings.bottomColorOf', { name: fill }) })
        },
      })
      break
    }
    case 'baseline': {
      const s = settings.baseline
      const set = (leaves: Partial<ChartSettings['baseline']>): void => ctx.apply({ baseline: leaves })
      form.heading(t('settings.headingBaseline'))
      priceSourceRow(form, ctx, s.priceSource, (priceSource) => set({ priceSource }))
      form.field({
        id: 'topLine',
        label: t('settings.topLine'),
        controls: (c) =>
          c.color({ color: s.topLineColor, onColor: (topLineColor) => set({ topLineColor }), opacity: true, lineWidth: { value: s.topLineWidth, options: LINE_WIDTHS, onChange: (topLineWidth) => set({ topLineWidth }) } }),
      })
      form.field({
        id: 'bottomLine',
        label: t('settings.bottomLine'),
        controls: (c) =>
          c.color({ color: s.bottomLineColor, onColor: (bottomLineColor) => set({ bottomLineColor }), opacity: true, lineWidth: { value: s.bottomLineWidth, options: LINE_WIDTHS, onChange: (bottomLineWidth) => set({ bottomLineWidth }) } }),
      })
      const top = t('settings.fillTopArea')
      form.field({
        id: 'fillTopArea',
        label: top,
        controls: (c) => {
          c.color({ color: s.topFillColor1, onColor: (topFillColor1) => set({ topFillColor1 }), opacity: true, label: t('settings.topColorOf', { name: top }) })
          c.color({ color: s.topFillColor2, onColor: (topFillColor2) => set({ topFillColor2 }), opacity: true, label: t('settings.bottomColorOf', { name: top }) })
        },
      })
      const bottom = t('settings.fillBottomArea')
      form.field({
        id: 'fillBottomArea',
        label: bottom,
        controls: (c) => {
          c.color({ color: s.bottomFillColor1, onColor: (bottomFillColor1) => set({ bottomFillColor1 }), opacity: true, label: t('settings.topColorOf', { name: bottom }) })
          c.color({ color: s.bottomFillColor2, onColor: (bottomFillColor2) => set({ bottomFillColor2 }), opacity: true, label: t('settings.bottomColorOf', { name: bottom }) })
        },
      })
      form.field({
        id: 'baseLevelPercentage',
        label: t('settings.baseLevel'),
        controls: (c) => c.number({ value: s.baseLevelPercentage, min: 0, max: 100, step: 1, width: 120, suffix: t('settings.unitPercent'), onChange: (baseLevelPercentage) => set({ baseLevelPercentage }) }),
      })
      break
    }
  }

  const symbol = settings.symbol
  const setSymbol = (leaves: Partial<ChartSettings['symbol']>): void => ctx.apply({ symbol: leaves })
  form.heading(t('settings.headingDataModification'))
  if (ctx.intraday && ctx.extendedHours) {
    form.field({
      id: 'session',
      label: t('settings.session'),
      controls: (c) =>
        c.select({
          value: symbol.session,
          options: [
            { value: 'regular', label: t('settings.sessionRegular') },
            { value: 'extended', label: t('settings.sessionExtended') },
            { value: 'allHours', label: t('settings.sessionAllHours') },
          ],
          width: 150,
          onChange: (session) => setSymbol({ session }),
        }),
    })
    if (symbol.session !== 'regular') {
      form.field({
        id: 'sessionBackground',
        label: t(symbol.session === 'allHours' ? 'settings.allHoursBackground' : 'settings.extendedHoursBackground'),
        controls: (c) => {
          c.color({ color: symbol.preMarketColor, onColor: (preMarketColor) => setSymbol({ preMarketColor }), opacity: true, label: t('settings.preMarket') })
          c.color({ color: symbol.postMarketColor, onColor: (postMarketColor) => setSymbol({ postMarketColor }), opacity: true, label: t('settings.postMarket') })
          if (symbol.session === 'allHours') c.color({ color: symbol.nightColor, onColor: (nightColor) => setSymbol({ nightColor }), opacity: true, label: t('settings.night') })
        },
      })
    }
  }
  form.field({
    id: 'precision',
    label: t('settings.precision'),
    controls: (c) => c.select({ value: symbol.precision, options: PRECISIONS.map((value) => ({ value, label: precisionLabel(t, value) })), width: 150, onChange: (precision) => setSymbol({ precision }) }),
  })
  form.field({
    id: 'timezone',
    label: t('timezone.title'),
    controls: (c) => c.select({ value: ctx.timezone, options: ctx.timezones.map((row) => ({ value: row.id, label: row.label })), width: 150, onChange: (id) => ctx.setTimezone(id) }),
  })
}

function statusLinePage(form: ChartSettingsForm, ctx: ChartPageContext): void {
  const { t } = ctx
  const s = ctx.settings.statusLine
  const set = (leaves: Partial<ChartSettings['statusLine']>): void => ctx.apply({ statusLine: leaves })
  form.heading(t('settings.headingInstrument'))
  form.check({ id: 'logo', label: t('settings.logo'), checked: s.logo, onChange: (logo) => set({ logo }) })
  form.check({
    id: 'title',
    label: t('settings.title'),
    checked: s.title,
    onChange: (title) => set({ title }),
    controls: (c) =>
      c.select({
        value: s.titleSource,
        options: [
          { value: 'name', label: t('settings.titleName') },
          { value: 'symbol', label: t('settings.titleSymbol') },
          { value: 'symbolAndName', label: t('settings.titleSymbolAndName') },
        ],
        width: 150,
        onChange: (titleSource) => set({ titleSource }),
      }),
  })
  form.check({ id: 'chartValues', label: t('settings.chartValues'), checked: s.chartValues, onChange: (chartValues) => set({ chartValues }) })
  form.check({ id: 'barChange', label: t('settings.barChangeValues'), checked: s.barChange, onChange: (barChange) => set({ barChange }) })
  form.check({ id: 'volume', label: t('settings.volume'), checked: s.volume, onChange: (volume) => set({ volume }) })
  form.check({ id: 'lastDayChange', label: t('settings.lastDayChangeValues'), checked: s.lastDayChange, onChange: (lastDayChange) => set({ lastDayChange }) })
  if (ctx.indicators) {
    form.heading(t('settings.headingIndicators'), 'indicators')
    form.check({ id: 'indicatorTitles', label: t('settings.indicatorTitles'), checked: s.indicatorTitles, onChange: (indicatorTitles) => set({ indicatorTitles }) })
    form.check({ id: 'indicatorInputs', label: t('settings.indicatorInputs'), checked: s.indicatorInputs, onChange: (indicatorInputs) => set({ indicatorInputs }) })
    form.check({ id: 'indicatorValues', label: t('settings.indicatorValues'), checked: s.indicatorValues, onChange: (indicatorValues) => set({ indicatorValues }) })
  }
  form.check({
    id: 'background',
    label: t('settings.background'),
    checked: s.background,
    onChange: (background) => set({ background }),
    controls: (c) => c.slider({ value: s.backgroundOpacity / 100, kind: { opacity: ctx.accent }, label: t('drawing.opacity'), onChange: (level) => set({ backgroundOpacity: Math.round(level * 100) }) }),
  })
}

function scalesPage(form: ChartSettingsForm, ctx: ChartPageContext): void {
  const { t } = ctx
  const scale = ctx.settings.priceScale
  const labels = ctx.settings.priceLabels
  const time = ctx.settings.timeScale
  const setScale = (leaves: Partial<ChartSettings['priceScale']>): void => ctx.apply({ priceScale: leaves })
  const setLabels = (leaves: Partial<ChartSettings['priceLabels']>): void => ctx.apply({ priceLabels: leaves })
  const setTime = (leaves: Partial<ChartSettings['timeScale']>): void => ctx.apply({ timeScale: leaves })
  const visibilities = options(t, VISIBILITIES)
  const valueLine = (): ChartSettingsOption<'value' | 'line'>[] => [
    { value: 'value', label: t('settings.labelValue') },
    { value: 'line', label: t('settings.labelLine') },
  ]

  form.heading(t('settings.sectionScale'))
  form.field({ id: 'currencyAndUnit', label: t('settings.currencyAndUnit'), controls: (c) => c.select({ value: scale.currencyAndUnit, options: visibilities, width: 180, onChange: (currencyAndUnit) => setScale({ currencyAndUnit }) }) })
  form.field({ id: 'scaleModeButtons', label: t('settings.scaleModes'), controls: (c) => c.select({ value: scale.scaleModeButtons, options: visibilities, width: 180, onChange: (scaleModeButtons) => setScale({ scaleModeButtons }) }) })
  form.check({
    id: 'lockPriceToBarRatio',
    label: t('settings.lockPriceToBarRatio'),
    checked: scale.lockPriceToBarRatio,
    onChange: (lockPriceToBarRatio) => setScale({ lockPriceToBarRatio }),
    controls: (c) => c.number({ value: scale.priceToBarRatio ?? Number.NaN, min: 0, max: 1e9, step: 0.1, width: 150, onChange: (priceToBarRatio) => setScale({ priceToBarRatio }) }),
  })
  form.field({
    id: 'placement',
    label: t('settings.scalesPlacement'),
    controls: (c) =>
      c.select({
        value: scale.placement,
        options: [
          { value: 'left', label: t('settings.placementLeft') },
          { value: 'right', label: t('settings.placementRight') },
          { value: 'auto', label: t('settings.placementAuto') },
        ],
        width: 150,
        onChange: (placement) => setScale({ placement }),
      }),
  })

  form.heading(t('settings.headingPriceLabels'))
  form.check({ id: 'noOverlappingLabels', label: t('settings.noOverlappingLabels'), checked: labels.noOverlappingLabels, onChange: (noOverlappingLabels) => setLabels({ noOverlappingLabels }) })
  form.check({ id: 'plusButton', label: t('settings.plusButton'), checked: labels.plusButton, tip: { kind: 'hint', text: t('settings.plusButtonTip') }, onChange: (plusButton) => setLabels({ plusButton }) })
  form.check({ id: 'countdown', label: t('settings.countdown'), checked: labels.countdown, onChange: (countdown) => setLabels({ countdown }) })
  const symbolName = t('settings.symbolLabel')
  form.field({
    id: 'symbolLabel',
    label: symbolName,
    controls: (c) => {
      c.multiSelect({
        values: chosen([['name', labels.symbolName], ['value', labels.symbolValue], ['line', labels.symbolLine]] as const),
        options: [{ value: 'name', label: t('settings.labelName') }, ...valueLine()],
        width: 180,
        none: t('settings.hidden'),
        onChange: (values) => setLabels({ symbolName: values.includes('name'), symbolValue: values.includes('value'), symbolLine: values.includes('line') }),
      })
      c.color({
        color: labels.symbolLineColor,
        onColor: (symbolLineColor) => setLabels({ symbolLineColor }),
        lineWidth: { value: labels.symbolLineWidth, options: LINE_WIDTHS, onChange: (symbolLineWidth) => setLabels({ symbolLineWidth }) },
        disabled: !labels.symbolName && !labels.symbolValue && !labels.symbolLine,
      })
      c.nextLine()
      c.select({
        value: labels.symbolValueMode,
        options: [
          { value: 'priceAndPercent', label: t('settings.priceAndPercent') },
          { value: 'scale', label: t('settings.valueByScale') },
        ],
        width: 180,
        label: t('settings.lastValueMode'),
        onChange: (symbolValueMode) => setLabels({ symbolValueMode }),
      })
    },
  })
  if (ctx.indicators) {
    form.field({
      id: 'indicatorLabels',
      label: t('settings.indicatorsAndFinancials'),
      controls: (c) =>
        c.multiSelect({
          values: chosen([['name', labels.indicatorLabelName], ['value', labels.indicatorLabelValue]] as const),
          options: [
            { value: 'name', label: t('settings.labelName') },
            { value: 'value', label: t('settings.labelValue') },
          ],
          width: 180,
          none: t('settings.hidden'),
          onChange: (values) => setLabels({ indicatorLabelName: values.includes('name'), indicatorLabelValue: values.includes('value') }),
        }),
    })
  }
  if (ctx.extendedHours) {
    const hidden = !labels.extendedHoursValue && !labels.extendedHoursLine
    form.field({
      id: 'extendedHoursLabels',
      label: t('settings.extendedHoursLabels'),
      controls: (c) => {
        c.multiSelect({
          values: chosen([['value', labels.extendedHoursValue], ['line', labels.extendedHoursLine]] as const),
          options: valueLine(),
          width: 180,
          none: t('settings.hidden'),
          onChange: (values) => setLabels({ extendedHoursValue: values.includes('value'), extendedHoursLine: values.includes('line') }),
        })
        c.color({ color: labels.preMarketLabelColor, onColor: (preMarketLabelColor) => setLabels({ preMarketLabelColor }), opacity: true, label: t('settings.preMarket'), disabled: hidden })
        c.color({ color: labels.postMarketLabelColor, onColor: (postMarketLabelColor) => setLabels({ postMarketLabelColor }), opacity: true, label: t('settings.postMarket'), disabled: hidden })
        c.color({ color: labels.nightLabelColor, onColor: (nightLabelColor) => setLabels({ nightLabelColor }), opacity: true, label: t('settings.night'), disabled: hidden })
      },
    })
  }
  if (ctx.intraday) {
    form.field({
      id: 'previousClose',
      label: t('settings.previousDayClose'),
      controls: (c) => {
        c.multiSelect({
          values: chosen([['value', labels.previousCloseValue], ['line', labels.previousCloseLine]] as const),
          options: valueLine(),
          width: 180,
          none: t('settings.hidden'),
          onChange: (values) => setLabels({ previousCloseValue: values.includes('value'), previousCloseLine: values.includes('line') }),
        })
        c.color({
          color: labels.previousCloseColor,
          onColor: (previousCloseColor) => setLabels({ previousCloseColor }),
          opacity: true,
          lineWidth: { value: labels.previousCloseLineWidth, options: LINE_WIDTHS, onChange: (previousCloseLineWidth) => setLabels({ previousCloseLineWidth }) },
          disabled: !labels.previousCloseValue && !labels.previousCloseLine,
        })
      },
    })
  }
  form.field({
    id: 'highLow',
    label: t('settings.highAndLow'),
    controls: (c) => {
      c.multiSelect({
        values: chosen([['value', labels.highLowValue], ['line', labels.highLowLine]] as const),
        options: valueLine(),
        width: 180,
        none: t('settings.hidden'),
        onChange: (values) => setLabels({ highLowValue: values.includes('value'), highLowLine: values.includes('line') }),
      })
      c.color({
        color: labels.highLowColor,
        onColor: (highLowColor) => setLabels({ highLowColor }),
        lineWidth: { value: labels.highLowLineWidth, options: LINE_WIDTHS, onChange: (highLowLineWidth) => setLabels({ highLowLineWidth }) },
        disabled: !labels.highLowValue && !labels.highLowLine,
      })
    },
  })
  form.field({
    id: 'bidAsk',
    label: t('settings.bidAndAsk'),
    controls: (c) => {
      const hidden = !labels.bidAskValue && !labels.bidAskLine
      c.multiSelect({
        values: chosen([['value', labels.bidAskValue], ['line', labels.bidAskLine]] as const),
        options: valueLine(),
        width: 180,
        none: t('settings.hidden'),
        onChange: (values) => setLabels({ bidAskValue: values.includes('value'), bidAskLine: values.includes('line') }),
      })
      c.color({ color: labels.bidColor, onColor: (bidColor) => setLabels({ bidColor }), opacity: true, label: t('settings.bid'), disabled: hidden })
      c.color({ color: labels.askColor, onColor: (askColor) => setLabels({ askColor }), opacity: true, label: t('settings.ask'), disabled: hidden })
    },
  })

  form.heading(t('settings.headingTimeScale'))
  form.check({ id: 'dayOfWeek', label: t('settings.dayOfWeek'), checked: time.dayOfWeek, onChange: (dayOfWeek) => setTime({ dayOfWeek }) })
  form.field({
    id: 'dateFormat',
    label: t('settings.dateFormat'),
    controls: (c) =>
      c.select({
        value: time.dateFormat,
        options: CHART_DATE_FORMATS.map((format: ChartDateFormat) => ({ value: format, label: chartDateSample(format, { locale: ctx.locale, dayOfWeek: time.dayOfWeek, t }) })),
        width: 150,
        onChange: (dateFormat) => setTime({ dateFormat }),
      }),
  })
  form.field({
    id: 'hoursFormat',
    label: t('settings.timeHoursFormat'),
    controls: (c) =>
      c.select({
        value: time.hoursFormat,
        options: [
          { value: '24', label: t('settings.hours24') },
          { value: '12', label: t('settings.hours12') },
        ],
        width: 100,
        onChange: (hoursFormat) => setTime({ hoursFormat }),
      }),
  })
  form.check({ id: 'keepLeftEdge', label: t('settings.keepLeftEdge'), checked: time.keepLeftEdge, onChange: (keepLeftEdge) => setTime({ keepLeftEdge }) })
}

function canvasPage(form: ChartSettingsForm, ctx: ChartPageContext): void {
  const { t } = ctx
  const s = ctx.settings.canvas
  const set = (leaves: Partial<ChartSettings['canvas']>): void => ctx.apply({ canvas: leaves })
  const visibilities = options(t, VISIBILITIES)
  const style = (value: ChartStrokeStyle, onChange: (style: ChartStrokeStyle) => void): { value: ChartStrokeStyle; onChange(style: ChartStrokeStyle): void } => ({ value, onChange })

  form.heading(t('settings.headingChartStyles'))
  const background = t('settings.background')
  form.field({
    id: 'background',
    label: background,
    controls: (c) => {
      c.select({
        value: s.backgroundType,
        options: [
          { value: 'solid', label: t('settings.colorSolid') },
          { value: 'gradient', label: t('settings.colorGradient') },
        ],
        width: 150,
        onChange: (backgroundType) => set({ backgroundType }),
      })
      if (s.backgroundType === 'gradient') {
        c.color({ color: s.background, onColor: (color) => set({ background: color }), opacity: true, label: t('settings.topColorOf', { name: background }) })
        c.color({ color: s.backgroundBottom, onColor: (backgroundBottom) => set({ backgroundBottom }), opacity: true, label: t('settings.bottomColorOf', { name: background }) })
        return
      }
      c.color({ color: s.background, onColor: (color) => set({ background: color }), opacity: true, label: background })
    },
  })
  form.check({
    id: 'verticalGrid',
    label: t('settings.verticalGrid'),
    checked: s.verticalGrid,
    onChange: (verticalGrid) => set({ verticalGrid }),
    controls: (c) => c.color({ color: s.verticalGridColor, onColor: (verticalGridColor) => set({ verticalGridColor }), opacity: true, lineStyle: style(s.verticalGridStyle, (verticalGridStyle) => set({ verticalGridStyle })) }),
  })
  form.check({
    id: 'horizontalGrid',
    label: t('settings.horizontalGrid'),
    checked: s.horizontalGrid,
    onChange: (horizontalGrid) => set({ horizontalGrid }),
    controls: (c) => c.color({ color: s.horizontalGridColor, onColor: (horizontalGridColor) => set({ horizontalGridColor }), opacity: true, lineStyle: style(s.horizontalGridStyle, (horizontalGridStyle) => set({ horizontalGridStyle })) }),
  })
  form.field({
    id: 'crosshair',
    label: t('settings.crosshair'),
    controls: (c) =>
      c.color({
        color: s.crosshairColor,
        onColor: (crosshairColor) => set({ crosshairColor }),
        opacity: true,
        lineWidth: { value: s.crosshairWidth, options: LINE_WIDTHS, onChange: (crosshairWidth) => set({ crosshairWidth }) },
        lineStyle: style(s.crosshairStyle, (crosshairStyle) => set({ crosshairStyle })),
      }),
  })
  form.field({
    id: 'watermark',
    label: t('settings.watermark'),
    controls: (c) => {
      c.multiSelect({
        values: chosen([['ticker', s.watermarkTicker], ['interval', s.watermarkInterval], ['description', s.watermarkDescription], ['replay', s.watermarkReplay]] as const),
        options: [
          { value: 'ticker', label: t('settings.watermarkTicker') },
          { value: 'interval', label: t('settings.watermarkInterval') },
          { value: 'description', label: t('settings.watermarkDescription') },
          { value: 'replay', label: t('settings.watermarkReplay') },
        ],
        width: 180,
        none: t('settings.hidden'),
        asWritten: true,
        onChange: (values) => set({ watermarkTicker: values.includes('ticker'), watermarkInterval: values.includes('interval'), watermarkDescription: values.includes('description'), watermarkReplay: values.includes('replay') }),
      })
      c.color({ color: s.watermarkColor, onColor: (watermarkColor) => set({ watermarkColor }), opacity: true })
    },
  })

  form.heading(t('settings.headingScales'))
  form.field({
    id: 'scaleText',
    label: t('settings.scaleText'),
    controls: (c) => {
      c.color({ color: s.scaleTextColor, onColor: (scaleTextColor) => set({ scaleTextColor }), opacity: true })
      c.select({
        value: String(s.scaleTextSize),
        options: FONT_SIZES.map((size) => ({ value: String(size), label: String(size) })),
        width: 100,
        label: t('drawing.fontSize'),
        onChange: (size) => set({ scaleTextSize: Number(size) }),
      })
    },
  })
  form.field({ id: 'scaleLines', label: t('settings.scaleLines'), controls: (c) => c.color({ color: s.scaleLineColor, onColor: (scaleLineColor) => set({ scaleLineColor }), opacity: true }) })

  form.heading(t('settings.headingButtons'))
  form.field({ id: 'navigationButtons', label: t('settings.navigationButtons'), controls: (c) => c.select({ value: s.navigationButtons, options: visibilities, width: 180, onChange: (navigationButtons) => set({ navigationButtons }) }) })
  form.field({ id: 'paneButtons', label: t('settings.paneButtons'), controls: (c) => c.select({ value: s.paneButtons, options: visibilities, width: 180, onChange: (paneButtons) => set({ paneButtons }) }) })

  form.heading(t('settings.headingMargins'))
  form.field({ id: 'marginTop', label: t('settings.marginTop'), controls: (c) => c.number({ value: s.marginTop, min: 0, max: 100, step: 1, suffix: t('settings.unitPercent'), onChange: (marginTop) => set({ marginTop }) }) })
  form.field({ id: 'marginBottom', label: t('settings.marginBottom'), controls: (c) => c.number({ value: s.marginBottom, min: 0, max: 100, step: 1, suffix: t('settings.unitPercent'), onChange: (marginBottom) => set({ marginBottom }) }) })
  form.field({ id: 'marginRight', label: t('settings.marginRight'), controls: (c) => c.number({ value: s.marginRight, min: 0, max: 500, step: 1, suffix: t('settings.unitBars'), onChange: (marginRight) => set({ marginRight }) }) })
}

function eventsPage(form: ChartSettingsForm, ctx: ChartPageContext): void {
  const { t } = ctx
  const s = ctx.settings.events
  const set = (leaves: Partial<ChartSettings['events']>): void => ctx.apply({ events: leaves })
  form.heading(t('settings.pageEvents'))
  if (!ctx.intraday) return
  form.check({
    id: 'sessionBreaks',
    label: t('settings.sessionBreaks'),
    checked: s.sessionBreaks,
    onChange: (sessionBreaks) => set({ sessionBreaks }),
    controls: (c) =>
      c.color({
        color: s.sessionBreaksColor,
        onColor: (sessionBreaksColor) => set({ sessionBreaksColor }),
        opacity: true,
        lineWidth: { value: s.sessionBreaksWidth, options: LINE_WIDTHS, onChange: (sessionBreaksWidth) => set({ sessionBreaksWidth }) },
        lineStyle: { value: s.sessionBreaksStyle, onChange: (sessionBreaksStyle) => set({ sessionBreaksStyle }) },
      }),
  })
}

/** The chart's pages in rail order, each with its name. */
export const CHART_PAGES: readonly { id: ChartSettingsPageId; label: ChartMessageKey }[] = [
  { id: 'symbol', label: 'settings.pageSymbol' },
  { id: 'statusLine', label: 'settings.pageStatusLine' },
  { id: 'scales', label: 'settings.pageScales' },
  { id: 'canvas', label: 'settings.pageCanvas' },
  { id: 'events', label: 'settings.pageEvents' },
]

/** Build one of the chart's pages into the form. */
export function buildChartPage(page: ChartSettingsPageId, form: ChartSettingsForm, ctx: ChartPageContext): void {
  if (page === 'symbol') symbolPage(form, ctx)
  else if (page === 'statusLine') statusLinePage(form, ctx)
  else if (page === 'scales') scalesPage(form, ctx)
  else if (page === 'canvas') canvasPage(form, ctx)
  else eventsPage(form, ctx)
}
