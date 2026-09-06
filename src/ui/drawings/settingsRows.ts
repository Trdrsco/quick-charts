// The rows the settings dialog shows for one drawing, page by page. Which rows a tool gets comes
// from the drawing's own props and the settings capabilities on `quickcharts/drawings`; this
// module turns those facts into fields. A row exists only where the prop exists and the tool's
// paint honors it, so the dialog never shows a control that does nothing.
import type { DrawingStyle, IDrawing, IntervalVisibility } from '../../internal/drawings/index'
import { alphaOf, withAlpha } from '../../internal/drawings/index'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import {
  BAR_ONLY_COORDS,
  DEFAULT_VISIBILITY,
  FILLABLE,
  IMAGE_ACCEPT,
  IMAGE_ERROR_MESSAGES,
  INERT_PROPS,
  INPUT_PROPS,
  LABELED_PATTERNS,
  NO_DASH,
  NO_LINE_DECOR,
  NO_STROKE,
  NO_STYLE_TAB,
  type DrawingAssetPort,
} from '../../drawings/index'
import { button, el } from './dom'
import { checkbox, dropdown, lineEndButton, numberInput, opacitySlider, row, swatchButton, toggleRow, visibilityRangeRow } from './fields'
import { iconSvg } from './icons'
import { humanSize } from './imagePicker'

export type SettingsTab = 'Inputs' | 'Style' | 'Text' | 'Table' | 'Coordinates' | 'Visibility'

export const TAB_LABEL: Record<SettingsTab, ChartMessageKey> = {
  Inputs: 'drawing.tabInputs',
  Style: 'drawing.tabStyle',
  Text: 'drawing.tabText',
  Table: 'drawing.tabTable',
  Coordinates: 'drawing.tabCoordinates',
  Visibility: 'drawing.tabVisibility',
}

/** The pages a drawing's dialog offers, in order. */
export function tabsFor(drawing: IDrawing): SettingsTab[] {
  const props = drawing.props as Record<string, unknown>
  const out: SettingsTab[] = []
  if ((INPUT_PROPS[drawing.type] ?? []).length > 0) out.push('Inputs')
  if (!NO_STYLE_TAB.has(drawing.type)) out.push('Style')
  if (typeof props.text === 'string') out.push('Text')
  if (Array.isArray(props.cells)) out.push('Table')
  out.push('Coordinates', 'Visibility')
  return out
}

/** The page a dialog opens on: Text for the annotation tools that have no Style page. */
export const firstTabFor = (drawing: IDrawing): SettingsTab => (NO_STYLE_TAB.has(drawing.type) ? 'Text' : 'Style')

const EXTEND_LABEL: Record<string, ChartMessageKey> = { None: 'drawing.extendNone', Left: 'drawing.extendLeft', Right: 'drawing.extendRight', Both: 'drawing.extendBoth' }
const VARIANT_LABEL: Record<string, ChartMessageKey> = { original: 'drawing.variantOriginal', schiff: 'drawing.variantSchiff', modified_schiff: 'drawing.variantModifiedSchiff', inside: 'drawing.variantInside' }
const SIDE_LABEL: Record<string, ChartMessageKey> = { left: 'drawing.left', center: 'drawing.center', right: 'drawing.right' }
const UPDOWN_LABEL: Record<string, ChartMessageKey> = { up: 'drawing.up', down: 'drawing.down' }
const ROWS_LAYOUT_LABEL: Record<string, ChartMessageKey> = { number: 'drawing.rowsByNumber', ticks: 'drawing.ticksPerRow' }
const PROFILE_VOLUME_LABEL: Record<string, ChartMessageKey> = { updown: 'drawing.upDown', total: 'drawing.total', delta: 'drawing.delta' }
const MODE_LABEL: Record<string, ChartMessageKey> = { bars: 'drawing.bars', open: 'drawing.modeLineOpen', high: 'drawing.modeLineHigh', low: 'drawing.modeLineLow', close: 'drawing.modeLineClose', hl2: 'drawing.modeLineHl2' }
const PROFILE_LEVELS: readonly { label: ChartMessageKey; key: 'poc' | 'vah' | 'val' }[] = [
  { label: 'drawing.pointOfControl', key: 'poc' },
  { label: 'drawing.valueAreaHigh', key: 'vah' },
  { label: 'drawing.valueAreaLow', key: 'val' },
]
const FONT_SIZES = ['10', '11', '12', '14', '16', '20', '24', '28', '32', '40'] as const
const VISIBILITY_ROWS: readonly { key: keyof IntervalVisibility; label: ChartMessageKey; max: number }[] = [
  { key: 'seconds', label: 'drawing.unitSeconds', max: 59 },
  { key: 'minutes', label: 'drawing.unitMinutes', max: 59 },
  { key: 'hours', label: 'drawing.unitHours', max: 24 },
  { key: 'days', label: 'drawing.unitDays', max: 366 },
  { key: 'weeks', label: 'drawing.unitWeeks', max: 52 },
  { key: 'months', label: 'drawing.unitMonths', max: 12 },
]

type FibLevel = { value: number; visible: boolean; color?: string; text?: string }

/** What every row builder reads and writes. `patchStyle` and `patchProps` apply live and rebuild
 *  the page; `patchQuiet` applies without a rebuild, for a field the trader is typing into. */
export interface RowsContext {
  t: ChartTranslate
  /** The chrome box popovers stay within. */
  box: HTMLElement
  drawing: IDrawing
  tab: SettingsTab
  assets?: DrawingAssetPort
  patchStyle(patch: Partial<DrawingStyle>): void
  patchProps(patch: Record<string, unknown>): void
  patchQuiet(patch: Record<string, unknown>): void
  patchVisibility(patch: Partial<IntervalVisibility>): void
  patchAnchor(index: number, anchor: { time?: unknown; price?: number }): void
}

const label = (t: ChartTranslate, table: Record<string, ChartMessageKey>) => (value: string): string => (table[value] ? t(table[value]!) : value)

const textField = (value: string, ariaLabel: string, onInput: (v: string) => void, options: { placeholder?: string; wide?: boolean } = {}): HTMLInputElement => {
  const input = el('input', { class: 'qc-field qc-drawing-input', 'aria-label': ariaLabel, 'data-width': options.wide ? 'wide' : 'short', placeholder: options.placeholder }) as HTMLInputElement
  input.value = value
  input.addEventListener('input', () => onInput(input.value))
  return input
}

/** The Style and Inputs pages. Each row asks whether its prop belongs on this page and whether
 *  the tool's paint honors it. */
export function styleRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing, box, tab } = ctx
  const type = drawing.type
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const inputKeys = new Set(INPUT_PROPS[type] ?? [])
  const inertKeys = new Set(INERT_PROPS[type] ?? [])
  const sect = (key: string): boolean => key in props && !inertKeys.has(key) && (inputKeys.has(key) ? tab === 'Inputs' : tab === 'Style')
  const out: HTMLElement[] = []
  const fontSize = (): HTMLElement => dropdown(t('drawing.fontSize'), FONT_SIZES, String(style.fontSize) as (typeof FONT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) }))
  const toggle = (key: string, text: ChartMessageKey): void => {
    if (sect(key)) out.push(toggleRow(t(text), !!props[key], (v) => ctx.patchProps({ [key]: v })))
  }
  const swatch = (key: string): HTMLElement => swatchButton(t, box, { label: t('drawing.color'), value: String(props[key]), onPick: (c) => ctx.patchProps({ [key]: c }) })

  if (tab === 'Style' && !NO_STROKE.has(type)) {
    const stroke = swatchButton(t, box, {
      label: t(NO_LINE_DECOR.has(type) ? 'drawing.color' : 'drawing.rowLine'),
      value: style.lineColor,
      onPick: (c) => {
        const alpha = alphaOf(style.lineColor)
        ctx.patchStyle({ lineColor: alpha < 1 ? withAlpha(c, alpha) : c })
      },
      opacity: alphaOf(style.lineColor),
      onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }),
      ...(!NO_LINE_DECOR.has(type)
        ? { thickness: style.lineWidth, onThickness: (v: number) => ctx.patchStyle({ lineWidth: v }), ...(!NO_DASH.has(type) ? { lineStyle: style.lineStyle, onLineStyle: (v: DrawingStyle['lineStyle']) => ctx.patchStyle({ lineStyle: v }) } : {}) }
        : {}),
    })
    const ends: HTMLElement[] = []
    if ('leftEnd' in props && sect('leftEnd')) {
      ends.push(
        lineEndButton(t, box, 'left', props.leftEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ leftEnd: v })),
        lineEndButton(t, box, 'right', props.rightEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ rightEnd: v })),
      )
    }
    out.push(row(t(NO_LINE_DECOR.has(type) ? 'drawing.color' : 'drawing.rowLine'), stroke, ...ends))
  }
  if (tab === 'Style' && FILLABLE.has(type)) {
    out.push(row(t('drawing.background'), swatchButton(t, box, { label: t('drawing.background'), value: style.fillColor, onPick: (c) => ctx.patchStyle({ fillColor: c }), opacity: style.fillOpacity, onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }) })))
  }
  if ('extendLeft' in props && sect('extendLeft')) {
    const value = props.extendLeft && props.extendRight ? 'Both' : props.extendLeft ? 'Left' : props.extendRight ? 'Right' : 'None'
    out.push(row(t('drawing.extend'), dropdown(t('drawing.extend'), ['None', 'Left', 'Right', 'Both'] as const, value, label(t, EXTEND_LABEL), (v) => ctx.patchProps({ extendLeft: v === 'Left' || v === 'Both', extendRight: v === 'Right' || v === 'Both' }))))
  }
  toggle('middlePoint', 'drawing.middlePoint')
  toggle('showPriceLabels', 'drawing.priceLabels')
  toggle('showPrice', 'drawing.priceLabel')
  toggle('showTime', 'drawing.timeLabel')
  toggle('middleLine', 'drawing.middleLine')
  if (sect('variant')) {
    out.push(row(t('drawing.rowStyle'), dropdown(t('drawing.rowStyle'), ['original', 'schiff', 'modified_schiff', 'inside'] as const, props.variant as 'original', label(t, VARIANT_LABEL), (v) => ctx.patchProps({ variant: v }))))
  }
  if (sect('showPriceDelta')) {
    out.push(el('div', { class: 'qc-dialog-heading', text: t('drawing.sectionStats') }))
    if (type !== 'date_range') {
      out.push(toggleRow(t('drawing.priceChange'), !!props.showPriceDelta, (v) => ctx.patchProps({ showPriceDelta: v })), toggleRow(t('drawing.percentChange'), !!props.showPercent, (v) => ctx.patchProps({ showPercent: v })))
    }
    if (type !== 'price_range') {
      out.push(
        toggleRow(t('drawing.bars'), !!props.showBars, (v) => ctx.patchProps({ showBars: v })),
        toggleRow(t('drawing.dateTimeRange'), !!props.showTimeSpan, (v) => ctx.patchProps({ showTimeSpan: v })),
        toggleRow(t('drawing.volume'), !!props.showVolume, (v) => ctx.patchProps({ showVolume: v })),
      )
    }
    out.push(toggleRow(t('drawing.extend'), !!props.extend, (v) => ctx.patchProps({ extend: v })))
  }
  if (sect('showPriceRange')) {
    out.push(
      el('div', { class: 'qc-dialog-heading', text: t('drawing.sectionInfo') }),
      toggleRow(t('drawing.priceRange'), !!props.showPriceRange, (v) => ctx.patchProps({ showPriceRange: v })),
      toggleRow(t('drawing.percentChange'), !!props.showPercentChange, (v) => ctx.patchProps({ showPercentChange: v })),
      toggleRow(t('drawing.barsRange'), !!props.showBarsRange, (v) => ctx.patchProps({ showBarsRange: v })),
      toggleRow(t('drawing.dateTimeRange'), !!props.showDateTimeRange, (v) => ctx.patchProps({ showDateTimeRange: v })),
      toggleRow(t('drawing.angle'), !!props.showAngle, (v) => ctx.patchProps({ showAngle: v })),
      row(t('drawing.statsPosition'), dropdown(t('drawing.statsPosition'), ['left', 'center', 'right'] as const, props.statsPosition as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ statsPosition: v }))),
    )
  }
  if (sect('direction')) out.push(row(t('drawing.direction'), dropdown(t('drawing.direction'), ['up', 'down'] as const, props.direction as 'up', label(t, UPDOWN_LABEL), (v) => ctx.patchProps({ direction: v }))))
  toggle('showPrices', 'drawing.prices')
  toggle('showLevels', 'drawing.levels')
  toggle('reverse', 'drawing.reverse')
  toggle('fullCircles', 'drawing.fullCircles')
  toggle('coeffsAsPercents', 'drawing.coeffsAsPercents')
  if (LABELED_PATTERNS.has(type) && tab === 'Style') {
    out.push(row(t('drawing.label'), swatchButton(t, box, { label: t('drawing.label'), value: style.textColor, onPick: (c) => ctx.patchStyle({ textColor: c }), opacity: alphaOf(style.textColor), onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }) }), fontSize()))
  }
  toggle('background', 'drawing.background')
  toggle('extendLines', 'drawing.extendLines')
  toggle('showMiddle', 'drawing.middleLine')
  toggle('showLabels', 'drawing.labels')
  if (sect('glyph')) {
    out.push(
      row(t('drawing.glyph'), textField(String(props.glyph ?? ''), t('drawing.glyph'), (v) => ctx.patchQuiet({ glyph: v }))),
      row(t('drawing.size'), numberInput(t, { label: t('drawing.size'), value: Number(props.size), min: 10, max: 120, step: 1, onChange: (v) => ctx.patchProps({ size: v }) })),
    )
  }
  if (sect('dataUrl')) {
    const file = el('input', { type: 'file', accept: IMAGE_ACCEPT, class: 'qc-drawing-file' }) as HTMLInputElement
    file.hidden = true
    const error = el('div', { class: 'qc-negative qc-drawing-note' })
    error.hidden = true
    const choose = button({ class: 'qc-button', label: t(props.dataUrl ? 'drawing.replaceEllipsis' : 'drawing.chooseEllipsis'), text: t(props.dataUrl ? 'drawing.replaceEllipsis' : 'drawing.chooseEllipsis'), onClick: () => file.click(), disabled: !ctx.assets })
    file.addEventListener('change', () => {
      const chosen = file.files?.[0]
      file.value = ''
      if (!chosen || !ctx.assets) return
      void ctx.assets.intakeImage(chosen).then((result) => {
        if (result.ok) {
          error.hidden = true
          ctx.patchProps({ dataUrl: result.asset.dataUrl })
        } else {
          error.textContent = t(IMAGE_ERROR_MESSAGES[result.error], { size: result.bytes === undefined ? '' : humanSize(result.bytes) })
          error.hidden = false
        }
      })
    })
    out.push(
      row(t('drawing.image'), choose, file),
      error,
      row(t('drawing.width'), numberInput(t, { label: t('drawing.width'), value: Number(props.width), min: 24, max: 800, step: 1, onChange: (v) => ctx.patchProps({ width: v }) })),
      row(t('drawing.opacity'), opacitySlider(t, 'currentColor', Number(props.opacity ?? 1), (v) => ctx.patchQuiet({ opacity: v }))),
    )
  }
  if (sect('url')) out.push(row(t('drawing.link'), textField(String(props.url ?? ''), t('drawing.link'), (v) => ctx.patchQuiet({ url: v }), { wide: true })))
  if (sect('rowsLayout')) {
    out.push(
      row(t('drawing.rowsLayout'), dropdown(t('drawing.rowsLayout'), ['number', 'ticks'] as const, props.rowsLayout as 'number', label(t, ROWS_LAYOUT_LABEL), (v) => ctx.patchProps({ rowsLayout: v }))),
      row(t('drawing.rowSize'), numberInput(t, { label: t('drawing.rowSize'), value: Number(props.rowSize), min: 1, max: 400, step: 1, onChange: (v) => ctx.patchProps({ rowSize: v }) })),
      row(t('drawing.volume'), dropdown(t('drawing.volume'), ['updown', 'total', 'delta'] as const, props.volume as 'updown', label(t, PROFILE_VOLUME_LABEL), (v) => ctx.patchProps({ volume: v }))),
      row(t('drawing.valueAreaVolume'), numberInput(t, { label: t('drawing.valueAreaVolume'), value: Number(props.valueAreaVolume), min: 0, max: 95, step: 5, onChange: (v) => ctx.patchProps({ valueAreaVolume: v }) })),
    )
    if ('extendRight' in props) out.push(toggleRow(t('drawing.extendRight'), !!props.extendRight, (v) => ctx.patchProps({ extendRight: v })))
  }
  if ('rowsLayout' in props && tab === 'Style') {
    out.push(
      row(t('drawing.widthPercent'), numberInput(t, { label: t('drawing.widthPercent'), value: Number(props.widthPercent), min: 5, max: 100, step: 5, onChange: (v) => ctx.patchProps({ widthPercent: v }) })),
      row(t('drawing.placement'), dropdown(t('drawing.placement'), ['left', 'right'] as const, props.placement as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ placement: v }))),
      row(t('drawing.upDownVolume'), swatch('upColor'), swatch('downColor')),
      row(t('drawing.valueAreaUpDown'), swatch('valueAreaUpColor'), swatch('valueAreaDownColor')),
    )
    for (const level of PROFILE_LEVELS) {
      out.push(
        row(
          t(level.label),
          checkbox(t('drawing.rowVisible', { name: t(level.label) }), !!props[`${level.key}Visible`], (v) => ctx.patchProps({ [`${level.key}Visible`]: v })),
          swatch(`${level.key}Color`),
          dropdown(t('drawing.thickness'), ['1', '2', '3', '4'] as const, String(Math.min(4, Number(props[`${level.key}Width`]) || 1)) as '1', (v) => `${v}px`, (v) => ctx.patchProps({ [`${level.key}Width`]: Number(v) })),
          dropdown(t('drawing.lineStyle'), ['solid', 'dashed', 'dotted'] as const, props[`${level.key}Style`] as 'solid', (v) => t(v === 'solid' ? 'drawing.lineSolid' : v === 'dashed' ? 'drawing.lineDashed' : 'drawing.lineDotted'), (v) => ctx.patchProps({ [`${level.key}Style`]: v })),
        ),
      )
    }
    out.push(toggleRow(t('drawing.developingPoc'), !!props.developingPoc, (v) => ctx.patchProps({ developingPoc: v })), toggleRow(t('drawing.developingVa'), !!props.developingVa, (v) => ctx.patchProps({ developingVa: v })))
  }
  if (sect('source')) {
    // The four price-source tokens are the vocabulary a script writes them in, shown as written.
    out.push(row(t('drawing.source'), dropdown(t('drawing.source'), ['close', 'open', 'hl2', 'hlc3'] as const, props.source as 'close', (v) => v, (v) => ctx.patchProps({ source: v }))))
  }
  if (sect('mode')) out.push(row(t('drawing.mode'), dropdown(t('drawing.mode'), ['bars', 'open', 'high', 'low', 'close', 'hl2'] as const, props.mode as 'bars', label(t, MODE_LABEL), (v) => ctx.patchProps({ mode: v }))))
  toggle('mirrored', 'drawing.mirrored')
  toggle('flipped', 'drawing.flipped')
  if (sect('successBackColor')) {
    out.push(
      row(t('drawing.source'), swatch('sourceTextColor'), swatch('sourceBackColor'), swatch('sourceBorderColor')),
      row(t('drawing.target'), swatch('targetTextColor'), swatch('targetBackColor'), swatch('targetBorderColor')),
      row(t('drawing.success'), swatch('successTextColor'), swatch('successBackColor')),
      row(t('drawing.failure'), swatch('failureTextColor'), swatch('failureBackColor')),
    )
  }
  if (sect('averageHL')) {
    out.push(
      row(t('drawing.avgHl'), numberInput(t, { label: t('drawing.avgHl'), value: Number(props.averageHL), min: 0, max: 1_000_000, step: 0.5, onChange: (v) => ctx.patchProps({ averageHL: v }) })),
      row(t('drawing.variance'), numberInput(t, { label: t('drawing.variance'), value: Number(props.variance), min: 0, max: 100, step: 5, onChange: (v) => ctx.patchProps({ variance: v }) })),
    )
  }
  if ('wickColor' in props && tab === 'Style') {
    out.push(
      row(t('drawing.body'), swatch('upColor'), swatch('downColor')),
      row(t('drawing.borders'), checkbox(t('drawing.drawBorders'), !!props.drawBorder, (v) => ctx.patchProps({ drawBorder: v })), swatch('borderUpColor'), swatch('borderDownColor')),
      row(t('drawing.wick'), checkbox(t('drawing.drawWicks'), !!props.drawWick, (v) => ctx.patchProps({ drawWick: v })), swatch('wickColor')),
      row(t('drawing.transparency'), opacitySlider(t, String(props.upColor), Number(props.transparency) / 100, (v) => ctx.patchQuiet({ transparency: Math.round(v * 100) }))),
    )
  }
  if (sect('upperDeviation')) {
    out.push(
      el('div', { class: 'qc-dialog-heading', text: t('drawing.sectionDeviation') }),
      row(t('drawing.upper'), checkbox(t('drawing.useUpperDeviation'), !!props.useUpper, (v) => ctx.patchProps({ useUpper: v })), numberInput(t, { label: t('drawing.upper'), value: Number(props.upperDeviation), step: 0.5, onChange: (v) => ctx.patchProps({ upperDeviation: v }) })),
      row(t('drawing.lower'), checkbox(t('drawing.useLowerDeviation'), !!props.useLower, (v) => ctx.patchProps({ useLower: v })), numberInput(t, { label: t('drawing.lower'), value: Number(props.lowerDeviation), step: 0.5, onChange: (v) => ctx.patchProps({ lowerDeviation: v }) })),
    )
  }
  if (sect('accountSize')) {
    out.push(
      el('div', { class: 'qc-dialog-heading', text: t('drawing.risk') }),
      row(t('drawing.accountSize'), numberInput(t, { label: t('drawing.accountSize'), value: Number(props.accountSize), width: 'wide', onChange: (v) => ctx.patchProps({ accountSize: v }) })),
      row(
        t('drawing.risk'),
        numberInput(t, { label: t('drawing.risk'), value: Number(props.risk), onChange: (v) => ctx.patchProps({ risk: v }) }),
        dropdown(t('drawing.risk'), ['percent', 'money'] as const, props.riskDisplay as 'percent', (v) => (v === 'percent' ? '%' : '$'), (v) => ctx.patchProps({ riskDisplay: v })),
      ),
      row(t('drawing.lotSize'), numberInput(t, { label: t('drawing.lotSize'), value: Number(props.lotSize), min: 0, step: 0.01, onChange: (v) => ctx.patchProps({ lotSize: v }) })),
      row(t('drawing.leverage'), numberInput(t, { label: t('drawing.leverage'), value: Number(props.leverage), min: 1, max: 500, step: 1, onChange: (v) => ctx.patchProps({ leverage: v }) })),
      toggleRow(t('drawing.compactStatsMode'), !!props.compact, (v) => ctx.patchProps({ compact: v })),
    )
  }
  const levels = Array.isArray(props.levels) ? (props.levels as FibLevel[]) : null
  if (levels && tab === 'Style') {
    out.push(el('div', { class: 'qc-dialog-heading', text: t('drawing.levels') }))
    const list = el('div', { class: 'qc-drawing-levels' })
    levels.forEach((level, i) => {
      const patchLevel = (patch: Partial<FibLevel>, quiet = false): void => {
        const next = levels.map((l, j) => (j === i ? { ...l, ...patch } : l))
        if (quiet) ctx.patchQuiet({ levels: next })
        else ctx.patchProps({ levels: next })
      }
      list.appendChild(
        el(
          'div',
          { class: 'qc-drawing-level' },
          checkbox(t('drawing.levelVisible', { value: level.value }), level.visible, (v) => patchLevel({ visible: v })),
          numberInput(t, { label: t('drawing.levelVisible', { value: level.value }), value: level.value, width: 'short', onChange: (v) => patchLevel({ value: v }) }),
          swatchButton(t, box, { label: t('drawing.color'), value: level.color ?? style.lineColor, onPick: (c) => patchLevel({ color: c }) }),
          textField(level.text ?? '', t('drawing.levelText', { value: level.value }), (v) => patchLevel({ text: v }, true), { placeholder: t('drawing.textPlaceholder') }),
          button({ class: 'qc-drawing-star', label: t('drawing.removeLevel', { value: level.value }), html: iconSvg('close', 18), onClick: () => ctx.patchProps({ levels: levels.filter((_, j) => j !== i) }) }),
        ),
      )
    })
    out.push(list, button({ class: 'qc-button', label: t('drawing.addLevel'), text: t('drawing.addLevel'), onClick: () => ctx.patchProps({ levels: [...levels, { value: 0, visible: true }] }) }), row(t('drawing.fontSize'), fontSize()))
  }
  if ('cells' in props && tab === 'Style') {
    out.push(
      row(t('drawing.textColor'), swatchButton(t, box, { label: t('drawing.textColor'), value: style.textColor, onPick: (c) => ctx.patchStyle({ textColor: c }), opacity: alphaOf(style.textColor), onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }) })),
      row(t('drawing.fontSize'), fontSize()),
    )
  }
  return out
}

/** The Text page: the text channel, the words themselves, alignment, and for the annotation tools
 *  that have no Style page, the background and border. */
export function textRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing, box } = ctx
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const weight = (on: boolean, text: string, name: string, onClick: () => void): HTMLButtonElement => {
    const b = button({ class: 'qc-button qc-drawing-weight', label: name, text, pressed: on, onClick })
    if (on) b.dataset.qcActive = 'true'
    return b
  }
  const area = el('textarea', { class: 'qc-field qc-drawing-textarea', rows: '4', spellcheck: 'false', placeholder: t('drawing.addText'), 'aria-label': t('drawing.tabText') }) as HTMLTextAreaElement
  area.value = String(props.text ?? '')
  area.addEventListener('input', () => ctx.patchQuiet({ text: area.value }))
  const out: HTMLElement[] = [
    row(t('drawing.color'), swatchButton(t, box, { label: t('drawing.textColor'), value: style.textColor, onPick: (c) => {
      const alpha = alphaOf(style.textColor)
      ctx.patchStyle({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
    }, opacity: alphaOf(style.textColor), onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }) })),
    row(t('drawing.size'), dropdown(t('drawing.size'), FONT_SIZES, String(style.fontSize) as (typeof FONT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) }))),
    row(t('drawing.weight'), weight(style.bold, 'B', t('drawing.bold'), () => ctx.patchStyle({ bold: !style.bold })), weight(style.italic, 'I', t('drawing.italic'), () => ctx.patchStyle({ italic: !style.italic }))),
    area,
  ]
  if ('align' in props) out.push(row(t('drawing.alignment'), dropdown(t('drawing.alignment'), ['left', 'center'] as const, props.align as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ align: v }))))
  if (NO_STYLE_TAB.has(drawing.type)) {
    out.push(row(t('drawing.background'), swatchButton(t, box, { label: t('drawing.background'), value: style.fillColor, onPick: (c) => ctx.patchStyle({ fillColor: c, ...(style.fillOpacity === 0 ? { fillOpacity: 0.95 } : {}) }), opacity: style.fillOpacity, onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }) })))
    if (drawing.type !== 'text') {
      out.push(row(t('drawing.border'), swatchButton(t, box, { label: t('drawing.border'), value: style.lineColor, onPick: (c) => ctx.patchStyle({ lineColor: c }), opacity: alphaOf(style.lineColor), onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }) })))
    }
  }
  return out
}

/** The Table page: the header switch, every cell, and the row and column controls. */
export function tableRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const props = drawing.props as { cells: string[][]; headerRow?: boolean }
  const cells = props.cells
  const rows = cells.length
  const cols = cells[0]?.length ?? 0
  const grid = el('div', { class: 'qc-drawing-table' })
  cells.forEach((line, r) => {
    const lineEl = el('div', { class: 'qc-drawing-table-row' })
    line.forEach((value, c) => {
      lineEl.appendChild(
        textField(value, t('drawing.tableCell', { row: r + 1, col: c + 1 }), (v) => {
          const next = cells.map((x, ri) => (ri === r ? x.map((cell, ci) => (ci === c ? v : cell)) : x))
          ctx.patchQuiet({ cells: next })
        }),
      )
    })
    grid.appendChild(lineEl)
  })
  const actions = el(
    'div',
    { class: 'qc-drawing-table-actions' },
    button({ class: 'qc-button', label: t('drawing.addRow'), text: t('drawing.addRow'), onClick: () => ctx.patchProps({ cells: [...cells, Array.from({ length: cols }, () => '')] }) }),
    button({ class: 'qc-button', label: t('drawing.removeRow'), text: t('drawing.removeRow'), disabled: rows <= 1, onClick: () => ctx.patchProps({ cells: cells.slice(0, -1) }) }),
    button({ class: 'qc-button', label: t('drawing.addColumn'), text: t('drawing.addColumn'), onClick: () => ctx.patchProps({ cells: cells.map((line) => [...line, '']) }) }),
    button({ class: 'qc-button', label: t('drawing.removeColumn'), text: t('drawing.removeColumn'), disabled: cols <= 1, onClick: () => ctx.patchProps({ cells: cells.map((line) => line.slice(0, -1)) }) }),
  )
  return [toggleRow(t('drawing.headerRow'), !!props.headerRow, (v) => ctx.patchProps({ headerRow: v })), grid, actions]
}

/** The Coordinates page: one row per anchor, as price and bar index, or bar alone for the
 *  time-anchored tools. */
export function coordinateRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const viewport = drawing.getViewport()
  const barOnly = BAR_ONLY_COORDS.has(drawing.type)
  return drawing.anchors.map((anchor, i) => {
    const bar = viewport?.logicalOf(anchor.time)
    const controls: HTMLElement[] = []
    if (!barOnly) controls.push(numberInput(t, { label: t('drawing.coordPriceBar', { n: i + 1 }), value: anchor.price, width: 'wide', onChange: (v) => ctx.patchAnchor(i, { price: v }) }))
    controls.push(
      numberInput(t, {
        label: t('drawing.coordBar', { n: i + 1 }),
        value: bar === null || bar === undefined ? NaN : Math.round(bar),
        step: 1,
        onChange: (v) => {
          const time = viewport?.timeOfLogical(v)
          if (time !== null && time !== undefined) ctx.patchAnchor(i, { time })
        },
      }),
    )
    return row(t(barOnly ? 'drawing.coordBar' : 'drawing.coordPriceBar', { n: i + 1 }), ...controls)
  })
}

/** The Visibility page: the ticks switch and one range row per bucket. A drawing switched off on
 *  every interval would be gone for good (it paints nothing and takes no hit), so the last enabled
 *  interval is pinned on. */
export function visibilityRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const visibility = drawing.options.visibility ?? DEFAULT_VISIBILITY
  const enabled = (visibility.ticks ? 1 : 0) + VISIBILITY_ROWS.reduce((n, r) => n + ((visibility[r.key] as { on: boolean }).on ? 1 : 0), 0)
  const pinned = (on: boolean): boolean => enabled === 1 && on
  const out: HTMLElement[] = [toggleRow(t('drawing.unitTicks'), visibility.ticks, (v) => ctx.patchVisibility({ ticks: v }), pinned(visibility.ticks))]
  for (const { key, label: text, max } of VISIBILITY_ROWS) {
    const range = visibility[key] as { on: boolean; from: number; to: number }
    out.push(visibilityRangeRow(t, { label: t(text), range, max, disabled: pinned(range.on), onChange: (next) => ctx.patchVisibility({ [key]: next }) }))
  }
  if (enabled === 1) out.push(el('span', { class: 'qc-muted qc-drawing-note', text: t('drawing.intervalPinnedNote') }))
  return out
}
