// The rows the settings dialog shows for one drawing, page by page. Which rows a tool gets comes
// from the drawing's own props and the settings capabilities on `@trdrs/quickcharts/drawings`; this
// module turns those facts into fields. A row exists only where the prop exists and the tool's
// paint honors it, so the dialog never shows a control that does nothing.
import type { BarPriceSource, DrawingStyle, ElliottDegree, IDrawing, LineStyle, TimeframeVisibility } from '../../internal/drawings/index'
import { alphaOf, BAR_PRICE_SOURCES, BARS_PATTERN_MODES, ELLIOTT_DEGREES, POSITION_STATS, QTY_PRECISIONS, withAlpha } from '../../internal/drawings/index'
import type { ChartMessageKey, ChartTranslate } from '../../i18n'
import {
  BAR_ONLY_COORDS,
  DEFAULT_VISIBILITY,
  FILLABLE,
  IMAGE_ACCEPT,
  IMAGE_ERROR_MESSAGES,
  INERT_PROPS,
  INPUT_PROPS,
  NO_DASH,
  NO_LINE_DECOR,
  NO_COORDINATES_TAB,
  NO_STROKE,
  NO_STYLE_TAB,
  PRICE_ONLY_COORDS,
  type DrawingAssetPort,
} from '../../drawings/index'
import { button, el } from './dom'
import { checkbox, checkRow, dropdown, fullRow, groupGap, lineEndButton, multiDropdown, numberInput, openPopover, row, sectionTitle, swatchButton, toggleRow, visibilityRangeRow } from './fields'
import { mountGlyphPicker } from './glyphPicker'
import { bundledGlyphSource } from '../../drawings/emoji'
import { firstImageFile, humanSize } from './imagePicker'
import type { IconResolver } from '../icons/resolver'
import { HIGHLIGHTER_WIDTHS } from './highlighterWidth'
import { boxLevelRows, fibRows, gannFanRows, gannSquareRows, levelLines, opacityTrack, strokedLevelRows, thicknessSelect } from './levelRows'

export type SettingsTab = 'Inputs' | 'Style' | 'Text' | 'Coordinates' | 'Visibility'

export const TAB_LABEL: Record<SettingsTab, ChartMessageKey> = {
  Inputs: 'drawing.tabInputs',
  Style: 'drawing.tabStyle',
  Text: 'drawing.tabText',
  Coordinates: 'drawing.tabCoordinates',
  Visibility: 'drawing.tabVisibility',
}

/** The pages a drawing's dialog offers, in order. A tool whose words its paint ignores has no Text
 *  page, and a tool whose points are not a reader's to type has no Coordinates page. */
export function tabsFor(drawing: IDrawing): SettingsTab[] {
  const props = drawing.props as Record<string, unknown>
  const inert = INERT_PROPS[drawing.type] ?? []
  const out: SettingsTab[] = []
  if ((INPUT_PROPS[drawing.type] ?? []).length > 0) out.push('Inputs')
  if (!NO_STYLE_TAB.has(drawing.type)) out.push('Style')
  if (typeof props.text === 'string' && !inert.includes('text')) out.push('Text')
  if (!NO_COORDINATES_TAB.has(drawing.type)) out.push('Coordinates')
  out.push('Visibility')
  return out
}

/** The page a dialog opens on: Style, or the first page a tool without one has. */
export const firstTabFor = (drawing: IDrawing): SettingsTab => (NO_STYLE_TAB.has(drawing.type) ? (tabsFor(drawing)[0] ?? 'Visibility') : 'Style')

const EXTEND_LABEL: Record<string, ChartMessageKey> = { None: 'drawing.extendNone', Left: 'drawing.extendLeft', Right: 'drawing.extendRight', Both: 'drawing.extendBoth' }
const VARIANT_LABEL: Record<string, ChartMessageKey> = { original: 'drawing.variantOriginal', schiff: 'drawing.variantSchiff', modified_schiff: 'drawing.variantModifiedSchiff', inside: 'drawing.variantInside' }
const SIDE_LABEL: Record<string, ChartMessageKey> = { left: 'drawing.left', center: 'drawing.center', right: 'drawing.right' }
const UPDOWN_LABEL: Record<string, ChartMessageKey> = { up: 'drawing.up', down: 'drawing.down' }
const ROWS_LAYOUT_LABEL: Record<string, ChartMessageKey> = { number: 'drawing.rowsByNumber', ticks: 'drawing.ticksPerRow' }
const BANDS_MODE_LABEL: Record<string, ChartMessageKey> = { stdev: 'drawing.bandsStdev', percent: 'drawing.bandsPercent' }
const PROFILE_VOLUME_LABEL: Record<string, ChartMessageKey> = { updown: 'drawing.upDown', total: 'drawing.total', delta: 'drawing.delta' }
const DEGREE_LABEL: Record<ElliottDegree, ChartMessageKey> = {
  supermillennium: 'drawing.degreeSupermillennium',
  millennium: 'drawing.degreeMillennium',
  submillennium: 'drawing.degreeSubmillennium',
  grandSupercycle: 'drawing.degreeGrandSupercycle',
  supercycle: 'drawing.degreeSupercycle',
  cycle: 'drawing.degreeCycle',
  primary: 'drawing.degreePrimary',
  intermediate: 'drawing.degreeIntermediate',
  minor: 'drawing.degreeMinor',
  minute: 'drawing.degreeMinute',
  minuette: 'drawing.degreeMinuette',
  subminuette: 'drawing.degreeSubminuette',
  micro: 'drawing.degreeMicro',
  submicro: 'drawing.degreeSubmicro',
  minuscule: 'drawing.degreeMinuscule',
}
const SOURCE_LABEL: Record<BarPriceSource, ChartMessageKey> = {
  open: 'drawing.sourceOpen',
  high: 'drawing.sourceHigh',
  low: 'drawing.sourceLow',
  close: 'drawing.sourceClose',
  volume: 'drawing.sourceVolume',
  hl2: 'drawing.sourceHl2',
  hlc3: 'drawing.sourceHlc3',
  ohlc4: 'drawing.sourceOhlc4',
  hlcc4: 'drawing.sourceHlcc4',
}
/** The tools whose words stand above, inside or below their body. */
const INSIDE_ACROSS: ReadonlySet<string> = new Set(['rectangle', 'parallel_channel', 'flat_top_bottom', 'disjoint_channel'])
const MODE_LABEL: Record<string, ChartMessageKey> = {
  hl: 'drawing.modeHlBars',
  oc: 'drawing.modeOcBars',
  close: 'drawing.modeLineClose',
  open: 'drawing.modeLineOpen',
  high: 'drawing.modeLineHigh',
  low: 'drawing.modeLineLow',
  hl2: 'drawing.modeLineHl2',
}
/** A position's stats, as its Stats list names them. */
const POSITION_STAT_LABEL: Record<string, ChartMessageKey> = {
  tpPriceOffset: 'drawing.statTpPriceOffset',
  tpPercentOffset: 'drawing.statTpPercentOffset',
  tpTickOffset: 'drawing.statTpTickOffset',
  tpAmount: 'drawing.statTpAmount',
  tpPL: 'drawing.statTpPl',
  openClosePL: 'drawing.statOpenClosePl',
  qty: 'drawing.statQty',
  riskRewardRatio: 'drawing.statRiskRewardRatio',
  slPriceOffset: 'drawing.statSlPriceOffset',
  slPercentOffset: 'drawing.statSlPercentOffset',
  slTickOffset: 'drawing.statSlTickOffset',
  slAmount: 'drawing.statSlAmount',
  slPL: 'drawing.statSlPl',
}
/** How a position's quantity is written, as its list names each way. */
const QTY_PRECISION_LABEL: Record<string, ChartMessageKey> = { default: 'drawing.qtyDefault', '0': 'drawing.qtyInteger', '1': 'drawing.qtyOneDecimal' }

/** A forecast's colors, each on a row of its own, in the order its page sets them. */
const FORECAST_COLORS: readonly { key: string; label: ChartMessageKey }[] = [
  { key: 'sourceTextColor', label: 'drawing.sourceText' },
  { key: 'sourceBackColor', label: 'drawing.sourceBackground' },
  { key: 'sourceBorderColor', label: 'drawing.sourceBorder' },
  { key: 'targetTextColor', label: 'drawing.targetText' },
  { key: 'targetBackColor', label: 'drawing.targetBackground' },
  { key: 'targetBorderColor', label: 'drawing.targetBorder' },
  { key: 'successTextColor', label: 'drawing.successText' },
  { key: 'successBackColor', label: 'drawing.successBackground' },
  { key: 'failureTextColor', label: 'drawing.failureText' },
  { key: 'failureBackColor', label: 'drawing.failureBackground' },
]
/** A volume profile's lines, in the order its Style page sets them. */
const PROFILE_LINES: readonly { label: ChartMessageKey; on: string; key: string }[] = [
  { label: 'drawing.vah', on: 'vahVisible', key: 'vah' },
  { label: 'drawing.val', on: 'valVisible', key: 'val' },
  { label: 'drawing.poc', on: 'pocVisible', key: 'poc' },
  { label: 'drawing.developingPoc', on: 'developingPoc', key: 'developingPoc' },
  { label: 'drawing.developingVa', on: 'developingVa', key: 'developingVa' },
]
/** A range meter's stats, as its Stats list names them, by the axis each measures. */
const METER_STATS: readonly { key: string; label: ChartMessageKey; price: boolean }[] = [
  { key: 'showPriceRange', label: 'drawing.priceRange', price: true },
  { key: 'showPercentChange', label: 'drawing.percentChange', price: true },
  { key: 'showPipsChange', label: 'drawing.changeInPips', price: true },
  { key: 'showBarsRange', label: 'drawing.barsRange', price: false },
  { key: 'showDateTimeRange', label: 'drawing.dateTimeRange', price: false },
  { key: 'showVolume', label: 'drawing.volume', price: false },
]
const FONT_SIZES = ['10', '11', '12', '14', '16', '20', '24', '28', '32', '40'] as const
/** The sizes the Text page offers a drawing's words. */
const TEXT_SIZES = ['8', '10', '11', '12', '14', '16', '18', '20', '22', '24', '28', '32', '40'] as const
const ACROSS_LABEL: Record<string, ChartMessageKey> = { top: 'drawing.top', middle: 'drawing.middle', bottom: 'drawing.bottom' }
/** A box's label stands above it, inside it or below it. */
const BOX_ACROSS_LABEL: Record<string, ChartMessageKey> = { top: 'drawing.top', middle: 'drawing.inside', bottom: 'drawing.bottom' }
const ORIENTATION_LABEL: Record<string, ChartMessageKey> = { horizontal: 'drawing.horizontal', vertical: 'drawing.vertical' }
const VISIBILITY_ROWS: readonly { key: keyof TimeframeVisibility; label: ChartMessageKey; max: number }[] = [
  { key: 'seconds', label: 'drawing.unitSeconds', max: 59 },
  { key: 'minutes', label: 'drawing.unitMinutes', max: 59 },
  { key: 'hours', label: 'drawing.unitHours', max: 24 },
  { key: 'days', label: 'drawing.unitDays', max: 366 },
  { key: 'weeks', label: 'drawing.unitWeeks', max: 52 },
  { key: 'months', label: 'drawing.unitMonths', max: 12 },
]

type FibLevel = { value: number; visible: boolean; color?: string; text?: string }

/** What every row builder reads and writes. `patchStyle` and `patchProps` apply live and rebuild
 *  the page; `patchQuiet` applies without a rebuild, for a field the viewer is typing into. */
export interface RowsContext {
  t: ChartTranslate
  /** Draws every glyph: the host's drawing for its icon, or the chart's own. */
  icons: IconResolver
  /** Where the rows' lists and panels stand: the dialog's backdrop, so they may hang past its edge. */
  box: HTMLElement
  drawing: IDrawing
  tab: SettingsTab
  assets?: DrawingAssetPort
  patchStyle(patch: Partial<DrawingStyle>): void
  patchProps(patch: Record<string, unknown>): void
  patchQuiet(patch: Record<string, unknown>): void
  patchVisibility(patch: Partial<TimeframeVisibility>): void
  patchAnchor(index: number, anchor: { time?: unknown; price?: number }): void
}

const label = (t: ChartTranslate, table: Record<string, ChartMessageKey>) => (value: string): string => (table[value] ? t(table[value]!) : value)

const textField = (value: string, ariaLabel: string, onInput: (v: string) => void, options: { placeholder?: string } = {}): HTMLInputElement => {
  const input = el('input', { class: 'qc-field qc-drawing-input', 'aria-label': ariaLabel, 'data-width': 'short', placeholder: options.placeholder }) as HTMLInputElement
  input.value = value
  input.addEventListener('input', () => onInput(input.value))
  return input
}

/** The Style page layouts the tools share, by tool. A tool listed here gets exactly its layout's
 *  rows, in its layout's order; every other tool's page follows its props. */
type StyleLayout = 'line' | 'level' | 'vertical' | 'cross' | 'box' | 'shape' | 'curve' | 'fib' | 'fibChannel' | 'timeZone' | 'trendTime' | 'circles' | 'arcs' | 'wedge' | 'pitchfan' | 'speedFan' | 'gannBox' | 'pitchfork' | 'spiral' | 'gannSquare' | 'gannFixed' | 'gannFan' | 'elliott' | 'brush' | 'path' | 'highlighter' | 'icon' | 'image' | 'priceLabel' | 'note' | 'priceNote' | 'pin' | 'signpost' | 'table' | 'mark' | 'lines' | 'cycles' | 'regression' | 'parallel' | 'channel' | 'forecast' | 'sector' | 'barsPattern' | 'position' | 'vwap' | 'profile' | 'meter' | 'pattern'
const STYLE_LAYOUTS: Readonly<Record<string, StyleLayout>> = {
  trend_line: 'line',
  ray: 'line',
  info_line: 'line',
  extended: 'line',
  arrow: 'line',
  trend_angle: 'line',
  horizontal_line: 'level',
  horizontal_ray: 'level',
  vertical_line: 'vertical',
  cross_line: 'cross',
  rectangle: 'box',
  rotated_rectangle: 'shape',
  arc: 'shape',
  polyline: 'shape',
  triangle: 'shape',
  ellipse: 'shape',
  circle: 'shape',
  curve: 'curve',
  double_curve: 'curve',
  fib_retracement: 'fib',
  fib_trend_ext: 'fib',
  fib_channel: 'fibChannel',
  fib_timezone: 'timeZone',
  fib_trend_time: 'trendTime',
  fib_circles: 'circles',
  fib_speed_resist_arcs: 'arcs',
  fib_wedge: 'wedge',
  pitchfan: 'pitchfan',
  fib_speed_resist_fan: 'speedFan',
  gannbox: 'gannBox',
  gannbox_square: 'gannSquare',
  gannbox_fixed: 'gannFixed',
  gannbox_fan: 'gannFan',
  pitchfork: 'pitchfork',
  schiff_pitchfork: 'pitchfork',
  schiff_pitchfork_modified: 'pitchfork',
  inside_pitchfork: 'pitchfork',
  fib_spiral: 'spiral',
  xabcd_pattern: 'pattern',
  cypher_pattern: 'pattern',
  abcd_pattern: 'pattern',
  three_drives: 'pattern',
  triangle_pattern: 'pattern',
  head_and_shoulders: 'pattern',
  elliott_impulse_wave: 'elliott',
  elliott_correction: 'elliott',
  elliott_triangle_wave: 'elliott',
  elliott_double_combo: 'elliott',
  elliott_triple_combo: 'elliott',
  brush: 'brush',
  path: 'path',
  highlighter: 'highlighter',
  icon: 'icon',
  image: 'image',
  price_label: 'priceLabel',
  note: 'note',
  price_note: 'priceNote',
  pin: 'pin',
  signpost: 'signpost',
  table: 'table',
  arrow_up: 'mark',
  arrow_down: 'mark',
  arrow_marker: 'mark',
  flag: 'mark',
  anchored_vwap: 'vwap',
  fixed_range_volume_profile: 'profile',
  anchored_volume_profile: 'profile',
  price_range: 'meter',
  date_range: 'meter',
  date_and_price_range: 'meter',
  long_position: 'position',
  short_position: 'position',
  forecast: 'forecast',
  sector: 'sector',
  bars_pattern: 'barsPattern',
  cyclic_lines: 'lines',
  sine_line: 'lines',
  time_cycles: 'cycles',
  regression_trend: 'regression',
  parallel_channel: 'parallel',
  flat_top_bottom: 'channel',
  disjoint_channel: 'channel',
}

/** A held weight or slant is a toggle of the field's box, pressed while it holds. */
const fontToggle = (icons: IconResolver, on: boolean, icon: 'textBold' | 'textItalic', name: string, onClick: () => void): HTMLButtonElement =>
  button({ class: 'qc-field qc-drawing-font-toggle', label: name, icon: icons.icon(icon, 28), pressed: on, onClick })

/** A line's stats, in the order the Stats list offers them. */
const STATS: readonly { key: string; label: ChartMessageKey }[] = [
  { key: 'showPriceRange', label: 'drawing.priceRange' },
  { key: 'showPercentChange', label: 'drawing.percentChange' },
  { key: 'showPipsChange', label: 'drawing.changeInPips' },
  { key: 'showBarsRange', label: 'drawing.barsRange' },
  { key: 'showDateTimeRange', label: 'drawing.dateTimeRange' },
  { key: 'showAngle', label: 'drawing.angle' },
]
const STATS_POSITION_LABEL: Record<string, ChartMessageKey> = { left: 'drawing.left', center: 'drawing.center', right: 'drawing.right', auto: 'drawing.auto' }

/** A gann square's price per bar, which typing holds its second corner at, and its ranges and ratio
 *  with their size, weight and slant. A square not yet drawn on a pane has no price per bar to show;
 *  the field steps by a tenth of the ratio's leading place, and no lower than one step. */
function squareRatioRows(ctx: RowsContext): HTMLElement[] {
  const { t, icons, box, drawing } = ctx
  const style = drawing.style
  const ratio = drawing.props.scaleRatio
  const perBar = typeof ratio === 'number' && ratio > 0 ? ratio : null
  const step = perBar === null ? undefined : 10 ** (Math.floor(Math.log10(perBar)) - 1)
  return [
    row(
      t('drawing.priceBarRatio'),
      numberInput(t, icons, {
        label: t('drawing.priceBarRatio'),
        value: perBar ?? NaN,
        decimals: 7,
        step,
        min: step,
        width: 'field',
        onChange: (v) => {
          if (v > 0) ctx.patchProps({ scaleRatio: v })
        },
      }),
    ),
    checkRow(t('drawing.rangesAndRatio'), !!drawing.props.showLabels, (v) => ctx.patchProps({ showLabels: v }), [
      dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(style.fontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) })),
      fontToggle(icons, style.bold, 'textBold', t('drawing.bold'), () => ctx.patchStyle({ bold: !style.bold })),
      fontToggle(icons, style.italic, 'textItalic', t('drawing.italic'), () => ctx.patchStyle({ italic: !style.italic })),
    ]),
  ]
}

/** A signpost's emoji: a button wearing it that opens the emoji picker under itself, a pick setting
 *  it and closing the picker. */
function emojiButton(ctx: RowsContext): HTMLButtonElement {
  const { t, box, drawing } = ctx
  const emoji = String(drawing.props.emoji ?? '')
  const b = button({ class: 'qc-field qc-drawing-emoji-button', label: t('drawing.emoji') })
  const url = bundledGlyphSource(emoji)
  b.append(url ? el('img', { class: 'qc-drawing-glyph-art', src: url, alt: '', draggable: 'false' }) : el('span', { class: 'qc-drawing-emoji-face', text: emoji }))
  let close: (() => void) | null = null
  b.addEventListener('click', () => {
    if (close) {
      close()
      return
    }
    const picker = mountGlyphPicker({
      t,
      recents: [],
      idBase: 'qc-signpost-emoji',
      available: () => true,
      toolAllowed: (kind) => kind === 'emoji',
      toolShown: (kind) => kind === 'emoji',
      onPick: (_kind, glyph) => {
        close?.()
        ctx.patchProps({ emoji: glyph })
      },
    })
    close = openPopover(box, b, picker.root, 'below', () => {
      picker.destroy()
      close = null
    })
  })
  return b
}

/** An image's page: its picture, chosen from the box the Image tool's picker chooses from, pressed or
 *  dropped on, which shows the picture or says what the host takes, and how see-through the picture
 *  is drawn. A picture the host cannot take says why under the box. */
function imageRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const props = drawing.props as Record<string, unknown>
  const file = el('input', { type: 'file', accept: IMAGE_ACCEPT, class: 'qc-drawing-file' }) as HTMLInputElement
  file.hidden = true
  const error = el('div', { class: 'qc-negative qc-drawing-note', role: 'status', 'aria-live': 'polite' })
  error.hidden = true
  const picture = typeof props.dataUrl === 'string' ? props.dataUrl : ''
  const zone = button({ class: 'qc-drawing-drop', label: t('drawing.chooseImage'), disabled: !ctx.assets, onClick: () => file.click() })
  if (picture) zone.append(el('img', { class: 'qc-drawing-drop-preview', src: picture, alt: '' }))
  else {
    zone.append(
      el(
        'span',
        { class: 'qc-drawing-drop-words' },
        el('span', { class: 'qc-drawing-drop-title', text: t('drawing.chooseImage') }),
        el('span', { class: 'qc-secondary', text: t('drawing.imageFormats') }),
        el('span', { class: 'qc-secondary', text: t('drawing.imageMaxSize') }),
      ),
    )
  }
  const take = (chosen: File | null): void => {
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
  }
  file.addEventListener('change', () => {
    const chosen = file.files?.[0] ?? null
    file.value = ''
    take(chosen)
  })
  zone.addEventListener('dragover', (e) => {
    e.preventDefault()
    zone.dataset.qcActive = 'true'
  })
  zone.addEventListener('dragleave', () => {
    zone.dataset.qcActive = 'false'
  })
  zone.addEventListener('drop', (e) => {
    e.preventDefault()
    zone.dataset.qcActive = 'false'
    take(firstImageFile(e.dataTransfer?.files))
  })
  const caption = row(t('drawing.image'), file)
  caption.classList.add('qc-drawing-row--caption')
  return [caption, zone, error, row(t('drawing.transparency'), opacityTrack(t, Number(props.opacity ?? 1), (v) => ctx.patchQuiet({ opacity: v }), t('drawing.transparency')))]
}

/** A pitchfork's Style row: the construction its median takes, switched in place. */
const forkStyleRow = (ctx: RowsContext): HTMLElement =>
  row(ctx.t('drawing.rowStyle'), dropdown(ctx.icons, ctx.box, ctx.t('drawing.rowStyle'), ['original', 'schiff', 'modified_schiff', 'inside'] as const, ctx.drawing.props.variant as 'original', label(ctx.t, VARIANT_LABEL), (v) => ctx.patchProps({ variant: v })))

/** The rows of a listed tool's Style page. A switch a viewer ticks in a list writes quietly, so the
 *  list stays open over a page that does not rebuild under it. */
function layoutRows(ctx: RowsContext, layout: StyleLayout): HTMLElement[] {
  if (layout === 'fib' || layout === 'fibChannel') return fibRows(ctx, layout === 'fib')
  if (layout === 'timeZone' || layout === 'trendTime' || layout === 'circles' || layout === 'arcs' || layout === 'wedge' || layout === 'pitchfan') return strokedLevelRows(ctx, layout)
  if (layout === 'speedFan' || layout === 'gannBox') return boxLevelRows(ctx, layout)
  if (layout === 'pitchfork') return [...strokedLevelRows(ctx, 'pitchfork'), forkStyleRow(ctx)]
  if (layout === 'gannSquare') return [...gannSquareRows(ctx), ...squareRatioRows(ctx)]
  if (layout === 'gannFixed') return gannSquareRows(ctx)
  if (layout === 'gannFan') return gannFanRows(ctx)
  const { t, drawing, box, icons } = ctx
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const inert = new Set(INERT_PROPS[drawing.type] ?? [])
  const has = (key: string): boolean => key in props && !inert.has(key)
  const toggle = (key: string, text: ChartMessageKey): HTMLElement => toggleRow(t(text), !!props[key], (v) => ctx.patchProps({ [key]: v }))
  /** The stroke: its color, thickness and, unless the tool draws it solid alone, its line style. */
  const stroke = (label: ChartMessageKey): HTMLButtonElement =>
    swatchButton(t, box, {
      label: t(label),
      value: style.lineColor,
      onPick: (c) => {
        const alpha = alphaOf(style.lineColor)
        ctx.patchStyle({ lineColor: alpha < 1 ? withAlpha(c, alpha) : c })
      },
      opacity: alphaOf(style.lineColor),
      onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }),
      thickness: style.lineWidth,
      onThickness: (v) => ctx.patchStyle({ lineWidth: v }),
      ...(!NO_DASH.has(drawing.type) ? { lineStyle: style.lineStyle, onLineStyle: (v: DrawingStyle['lineStyle']) => ctx.patchStyle({ lineStyle: v }) } : {}),
    })
  const ends = (): HTMLElement[] =>
    has('leftEnd')
      ? [
          lineEndButton(t, icons, box, 'left', props.leftEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ leftEnd: v })),
          lineEndButton(t, icons, box, 'right', props.rightEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ rightEnd: v })),
        ]
      : []
  const extend = (left: ChartMessageKey, right: ChartMessageKey): HTMLElement =>
    row(
      t('drawing.extend'),
      multiDropdown(icons, box, {
        label: t('drawing.extend'),
        empty: t('drawing.extendNone'),
        choices: [
          { label: t(left), checked: !!props.extendLeft, onChange: (v) => ctx.patchQuiet({ extendLeft: v }) },
          { label: t(right), checked: !!props.extendRight, onChange: (v) => ctx.patchQuiet({ extendRight: v }) },
        ],
      }),
    )
  const background = (): HTMLElement =>
    checkRow(t('drawing.background'), props.fillBackground !== false, (v) => ctx.patchProps({ fillBackground: v }), [
      swatchButton(t, box, {
        label: t('drawing.backgroundColor'),
        value: style.fillColor,
        onPick: (c) => ctx.patchStyle({ fillColor: c, ...(style.fillOpacity === 0 ? { fillOpacity: 0.2 } : {}) }),
        opacity: style.fillOpacity,
        onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }),
      }),
    ])
  /** A well for the stroke color alone, its opacity riding in the color. */
  const strokeSwatch = (text: ChartMessageKey): HTMLButtonElement =>
    swatchButton(t, box, {
      label: t(text),
      value: style.lineColor,
      onPick: (c) => {
        const alpha = alphaOf(style.lineColor)
        ctx.patchStyle({ lineColor: alpha < 1 ? withAlpha(c, alpha) : c })
      },
      opacity: alphaOf(style.lineColor),
      onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }),
    })
  /** A well for the fill's color and opacity. */
  const fillSwatch = (text: ChartMessageKey): HTMLButtonElement =>
    swatchButton(t, box, { label: t(text), value: style.fillColor, onPick: (c) => ctx.patchStyle({ fillColor: c, ...(style.fillOpacity === 0 ? { fillOpacity: 1 } : {}) }), opacity: style.fillOpacity, onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }) })
  /** A well for a color the tool keeps in a prop of its own, its opacity riding in the color. */
  const propSwatch = (key: string, text: ChartMessageKey): HTMLButtonElement => {
    const value = String(props[key])
    return swatchButton(t, box, {
      label: t(text),
      value,
      onPick: (c) => {
        const alpha = alphaOf(value)
        ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
      },
      opacity: alphaOf(value),
      onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
    })
  }
  /** The words' color and size. */
  const wordsLook = (): HTMLElement[] => [
    swatchButton(t, box, {
      label: t('drawing.textColor'),
      value: style.textColor,
      onPick: (c) => {
        const alpha = alphaOf(style.textColor)
        ctx.patchStyle({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
      },
      opacity: alphaOf(style.textColor),
      onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }),
    }),
    dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(style.fontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) })),
  ]
  const out: HTMLElement[] = []
  if (layout === 'line') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine'), ...ends()), extend('drawing.extendLeftLine', 'drawing.extendRightLine'), toggle('middlePoint', 'drawing.middlePoint'), toggle('showPriceLabels', 'drawing.priceLabels'))
    const stats = STATS.filter((s) => has(s.key))
    out.push(
      sectionTitle(t('drawing.sectionInfo')),
      row(
        t('drawing.sectionStats'),
        multiDropdown(icons, box, {
          label: t('drawing.sectionStats'),
          empty: t('drawing.statsHidden'),
          choices: stats.map((s) => ({ label: t(s.label), checked: !!props[s.key], onChange: (v: boolean) => ctx.patchQuiet({ [s.key]: v }) })),
        }),
      ),
      row(t('drawing.statsPosition'), dropdown(icons, box, t('drawing.statsPosition'), ['left', 'center', 'right', 'auto'] as const, props.statsPosition as 'left', label(t, STATS_POSITION_LABEL), (v) => ctx.patchProps({ statsPosition: v }), 'wide')),
      toggle('alwaysShowStats', 'drawing.alwaysShowStats'),
      groupGap(),
    )
  } else if (layout === 'level') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), toggle('showPrice', 'drawing.priceLabel'))
  } else if (layout === 'vertical') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), toggle('showTime', 'drawing.timeLabel'))
  } else if (layout === 'cross') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), toggle('showPrice', 'drawing.priceLabel'), toggle('showTime', 'drawing.timeLabel'))
  } else if (layout === 'box') {
    out.push(
      extend('drawing.extendLeft', 'drawing.extendRight'),
      row(t('drawing.border'), stroke('drawing.border')),
      checkRow(t('drawing.middleLine'), !!props.middleLine, (v) => ctx.patchProps({ middleLine: v }), [
        swatchButton(t, box, {
          label: t('drawing.middleLine'),
          value: String(props.middleLineColor),
          onPick: (c) => ctx.patchProps({ middleLineColor: c }),
          thickness: Number(props.middleLineWidth),
          onThickness: (v) => ctx.patchProps({ middleLineWidth: v }),
          lineStyle: props.middleLineStyle as DrawingStyle['lineStyle'],
          onLineStyle: (v) => ctx.patchProps({ middleLineStyle: v }),
        }),
      ]),
      background(),
    )
  } else if (layout === 'shape') {
    out.push(row(t('drawing.border'), stroke('drawing.border')), background())
  } else if (layout === 'vwap') {
    // The average's line, each band's lines on their switches with the first band's body between
    // its two, and the average's price on the scale.
    const band = (side: 'upperBands' | 'lowerBands', index: number): HTMLElement => {
      const n = index + 1
      const text = t(side === 'upperBands' ? 'drawing.upperBand' : 'drawing.lowerBand', { n })
      const live = (): Record<string, unknown>[] => (Array.isArray(drawing.props[side]) ? (drawing.props[side] as Record<string, unknown>[]) : [])
      const line = live()[index] ?? {}
      const patch = (next: Record<string, unknown>): void => ctx.patchProps({ [side]: live().map((l, j) => (j === index ? { ...l, ...next } : l)) })
      const color = String(line.color)
      return checkRow(text, line.visible === true, (v) => patch({ visible: v }), [
        swatchButton(t, box, {
          label: text,
          value: color,
          onPick: (c) => {
            const alpha = alphaOf(color)
            patch({ color: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(color),
          onOpacity: (v) => patch({ color: withAlpha(color, v) }),
          thickness: Number(line.width),
          onThickness: (v) => patch({ width: v }),
          lineStyle: line.style as LineStyle,
          onLineStyle: (v) => patch({ style: v }),
        }),
      ])
    }
    out.push(
      row(t('drawing.vwap'), stroke('drawing.vwap')),
      band('lowerBands', 0),
      band('upperBands', 0),
      checkRow(t('drawing.bandBackground', { n: 1 }), props.fillBackground !== false, (v) => ctx.patchProps({ fillBackground: v }), [
        swatchButton(t, box, {
          label: t('drawing.bandBackground', { n: 1 }),
          value: style.fillColor,
          onPick: (c) => ctx.patchStyle({ fillColor: c }),
          opacity: style.fillOpacity,
          onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }),
        }),
      ]),
      band('lowerBands', 1),
      band('upperBands', 1),
      band('lowerBands', 2),
      band('upperBands', 2),
      toggle('showPriceLabel', 'drawing.priceLabel'),
    )
  } else if (layout === 'profile') {
    // The histogram's switch, and nested under it its values, its width and edge and its rows'
    // colors in and out of the value area; then its lines each on a switch in a stroke of its own,
    // and the box behind it.
    const well = (key: string, text: ChartMessageKey): HTMLButtonElement => {
      const value = String(props[key])
      return swatchButton(t, box, {
        label: t(text),
        value,
        onPick: (c) => {
          const alpha = alphaOf(value)
          ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
        },
        opacity: alphaOf(value),
        onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
      })
    }
    out.push(
      compact(toggle('showProfile', 'drawing.volumeProfile')),
      ...[
        checkRow(t('drawing.values'), props.showValues === true, (v) => ctx.patchProps({ showValues: v }), [well('valuesColor', 'drawing.valuesColor')]),
        row(t('drawing.widthPercent'), numberInput(t, icons, { label: t('drawing.widthPercent'), value: Number(props.widthPercent), min: 5, max: 100, step: 5, width: 'field', onChange: (v) => ctx.patchProps({ widthPercent: v }) })),
        row(t('drawing.placement'), dropdown(icons, box, t('drawing.placement'), ['right', 'left'] as const, props.placement as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ placement: v }))),
        row(t('drawing.upVolume'), well('upColor', 'drawing.upVolume')),
        row(t('drawing.downVolume'), well('downColor', 'drawing.downVolume')),
        row(t('drawing.valueAreaUp'), well('valueAreaUpColor', 'drawing.valueAreaUp')),
        row(t('drawing.valueAreaDown'), well('valueAreaDownColor', 'drawing.valueAreaDown')),
      ].map(nested),
      ...PROFILE_LINES.map((line) => {
        const color = String(props[`${line.key}Color`])
        return checkRow(t(line.label), props[line.on] === true, (v) => ctx.patchProps({ [line.on]: v }), [
          swatchButton(t, box, {
            label: t(line.label),
            value: color,
            onPick: (c) => {
              const alpha = alphaOf(color)
              ctx.patchProps({ [`${line.key}Color`]: alpha < 1 ? withAlpha(c, alpha) : c })
            },
            opacity: alphaOf(color),
            onOpacity: (v) => ctx.patchProps({ [`${line.key}Color`]: withAlpha(color, v) }),
            thickness: Number(props[`${line.key}Width`]),
            onThickness: (v) => ctx.patchProps({ [`${line.key}Width`]: v }),
            lineStyle: props[`${line.key}Style`] as LineStyle,
            onLineStyle: (v) => ctx.patchProps({ [`${line.key}Style`]: v }),
          }),
        ])
      }),
      row(t('drawing.histogramBox'), well('boxColor', 'drawing.histogramBox')),
    )
    if (drawing.type === 'anchored_volume_profile') out.push(compact(toggle('showLabelsOnPriceScale', 'drawing.labelsOnPriceScale')))
  } else if (layout === 'meter') {
    // The arrows' stroke, the span's background and border, how far it runs, the stats its label
    // reads, and the label's words and background.
    const price = drawing.type !== 'date_range'
    const time = drawing.type !== 'price_range'
    const labelWell = (key: string, text: ChartMessageKey): HTMLButtonElement => {
      const value = String(props[key])
      return swatchButton(t, box, {
        label: t(text),
        value,
        onPick: (c) => {
          const alpha = alphaOf(value)
          ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
        },
        opacity: alphaOf(value),
        onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
      })
    }
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')))
    if (drawing.type === 'date_and_price_range') {
      const color = String(props.borderColor)
      out.push(
        checkRow(t('drawing.border'), props.drawBorder === true, (v) => ctx.patchProps({ drawBorder: v }), [
          swatchButton(t, box, {
            label: t('drawing.border'),
            value: color,
            onPick: (c) => ctx.patchProps({ borderColor: c }),
            thickness: Number(props.borderWidth),
            onThickness: (v) => ctx.patchProps({ borderWidth: v }),
          }),
        ]),
      )
    }
    out.push(background())
    if (drawing.type === 'price_range') out.push(extend('drawing.extendLeft', 'drawing.extendRight'))
    if (drawing.type === 'date_range') {
      out.push(
        row(
          t('drawing.extend'),
          multiDropdown(icons, box, {
            label: t('drawing.extend'),
            empty: t('drawing.extendNone'),
            choices: [
              { label: t('drawing.extendTop'), checked: !!props.extendTop, onChange: (v) => ctx.patchQuiet({ extendTop: v }) },
              { label: t('drawing.extendBottom'), checked: !!props.extendBottom, onChange: (v) => ctx.patchQuiet({ extendBottom: v }) },
            ],
          }),
        ),
      )
    }
    out.push(
      sectionTitle(t('drawing.sectionInfo')),
      row(
        t('drawing.sectionStats'),
        multiDropdown(icons, box, {
          label: t('drawing.sectionStats'),
          empty: t('drawing.statsHidden'),
          choices: METER_STATS.filter((s) => (s.price ? price : time)).map((s) => ({ label: t(s.label), checked: !!props[s.key], onChange: (v: boolean) => ctx.patchQuiet({ [s.key]: v }) })),
        }),
      ),
      row(
        t('drawing.label'),
        labelWell('labelColor', 'drawing.labelColor'),
        dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(props.labelFontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchProps({ labelFontSize: Number(v) })),
      ),
      checkRow(t('drawing.labelBackground'), props.fillLabelBackground !== false, (v) => ctx.patchProps({ fillLabelBackground: v }), [labelWell('labelBackgroundColor', 'drawing.labelBackground')]),
      groupGap(),
    )
  } else if (layout === 'position') {
    // The lines, the two zones, the words' color and size, the levels' prices, then the stats the
    // tags read and how they read them.
    const zone = (key: 'stopColor' | 'profitColor', text: ChartMessageKey): HTMLElement => {
      const value = String(props[key])
      return row(
        t(text),
        swatchButton(t, box, {
          label: t(text),
          value,
          onPick: (c) => {
            const alpha = alphaOf(value)
            ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(value),
          onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
        }),
      )
    }
    const shown = new Set(Array.isArray(props.stats) ? (props.stats as string[]) : [])
    const liveStats = (): string[] => (Array.isArray(drawing.props.stats) ? (drawing.props.stats as string[]) : [])
    out.push(
      row(t('drawing.lines'), stroke('drawing.lines')),
      zone('stopColor', 'drawing.stopColor'),
      zone('profitColor', 'drawing.profitColor'),
      row(
        t('drawing.text'),
        swatchButton(t, box, {
          label: t('drawing.textColor'),
          value: style.textColor,
          onPick: (c) => {
            const alpha = alphaOf(style.textColor)
            ctx.patchStyle({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(style.textColor),
          onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }),
        }),
        dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(style.fontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) })),
      ),
      toggle('showPrices', 'drawing.priceLabels'),
      sectionTitle(t('drawing.sectionInfo')),
      row(
        t('drawing.sectionStats'),
        multiDropdown(icons, box, {
          label: t('drawing.sectionStats'),
          empty: t('drawing.statsHidden'),
          asWritten: true,
          choices: POSITION_STATS.map((stat) => ({
            label: t(POSITION_STAT_LABEL[stat]!),
            checked: shown.has(stat),
            // The stats keep the list's order whichever way one is ticked.
            onChange: (v: boolean) => {
              const next = new Set(liveStats())
              if (v) next.add(stat)
              else next.delete(stat)
              ctx.patchQuiet({ stats: POSITION_STATS.filter((s) => next.has(s)) })
            },
          })),
        }),
      ),
      toggle('compact', 'drawing.compactStatsMode'),
      toggle('alwaysShowStats', 'drawing.alwaysShowStats'),
      groupGap(),
    )
  } else if (layout === 'forecast') {
    const color = (key: string, text: ChartMessageKey): HTMLElement => {
      const value = String(props[key])
      return row(
        t(text),
        swatchButton(t, box, {
          label: t(text),
          value,
          onPick: (c) => {
            const alpha = alphaOf(value)
            ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(value),
          onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
        }),
      )
    }
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), ...FORECAST_COLORS.map((c) => color(c.key, c.label)))
  } else if (layout === 'sector') {
    // The slice's two backgrounds, one for each half, and its border.
    const fill = (key: 'color1' | 'color2'): HTMLButtonElement => {
      const value = String(props[key])
      return swatchButton(t, box, {
        label: t(key === 'color1' ? 'drawing.backgroundFirst' : 'drawing.backgroundSecond'),
        value,
        onPick: (c) => {
          const alpha = alphaOf(value)
          ctx.patchProps({ [key]: alpha < 1 ? withAlpha(c, alpha) : c })
        },
        opacity: alphaOf(value),
        onOpacity: (v) => ctx.patchProps({ [key]: withAlpha(value, v) }),
      })
    }
    out.push(row(t('drawing.background'), fill('color1'), fill('color2')), row(t('drawing.border'), stroke('drawing.border')))
  } else if (layout === 'barsPattern') {
    out.push(
      row(
        t('drawing.color'),
        swatchButton(t, box, {
          label: t('drawing.color'),
          value: style.lineColor,
          onPick: (c) => {
            const alpha = alphaOf(style.lineColor)
            ctx.patchStyle({ lineColor: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(style.lineColor),
          onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }),
        }),
      ),
      row(t('drawing.mode'), dropdown(icons, box, t('drawing.mode'), BARS_PATTERN_MODES, props.mode as (typeof BARS_PATTERN_MODES)[number], label(t, MODE_LABEL), (v) => ctx.patchProps({ mode: v }))),
      toggle('mirrored', 'drawing.mirrored'),
      toggle('flipped', 'drawing.flipped'),
    )
  } else if (layout === 'lines') {
    out.push(row(t('drawing.lines'), stroke('drawing.lines')))
  } else if (layout === 'cycles') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), background())
  } else if (layout === 'spiral') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine')), toggle('counterclockwise', 'drawing.counterclockwise'))
  } else if (layout === 'pattern') {
    // The letters' color, size, weight and slant on one row, then the border and, where the
    // pattern shades its legs, the background.
    out.push(
      row(
        t('drawing.label'),
        swatchButton(t, box, {
          label: t('drawing.labelColor'),
          value: style.textColor,
          onPick: (c) => {
            const alpha = alphaOf(style.textColor)
            ctx.patchStyle({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(style.textColor),
          onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }),
        }),
        dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(style.fontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) })),
        fontToggle(icons, style.bold, 'textBold', t('drawing.bold'), () => ctx.patchStyle({ bold: !style.bold })),
        fontToggle(icons, style.italic, 'textItalic', t('drawing.italic'), () => ctx.patchStyle({ italic: !style.italic })),
      ),
      row(t('drawing.border'), stroke('drawing.border')),
    )
    if (has('fillBackground')) out.push(background())
  } else if (layout === 'regression') {
    // The line through the bars and its two bands, each its switch and its stroke, then whether
    // they run on past both ends and whether the correlation reads.
    const line = (key: 'base' | 'up' | 'down', text: ChartMessageKey): HTMLElement => {
      const color = String(props[`${key}Color`])
      return checkRow(t(text), props[`${key}Line`] !== false, (v) => ctx.patchProps({ [`${key}Line`]: v }), [
        swatchButton(t, box, {
          label: t(text),
          value: color,
          onPick: (c) => {
            const alpha = alphaOf(color)
            ctx.patchProps({ [`${key}Color`]: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(color),
          onOpacity: (v) => ctx.patchProps({ [`${key}Color`]: withAlpha(color, v) }),
          thickness: Number(props[`${key}Width`]),
          onThickness: (v) => ctx.patchProps({ [`${key}Width`]: v }),
          lineStyle: props[`${key}Style`] as LineStyle,
          onLineStyle: (v) => ctx.patchProps({ [`${key}Style`]: v }),
        }),
      ])
    }
    out.push(line('base', 'drawing.base'), line('up', 'drawing.up'), line('down', 'drawing.down'), toggle('extendLines', 'drawing.extendLines'), toggle('showPearsons', 'drawing.pearsonsR'))
  } else if (layout === 'parallel') {
    out.push(...levelLines(ctx), extend('drawing.extendLeftLine', 'drawing.extendRightLine'), background())
  } else if (layout === 'channel') {
    // The sides' prices in a text style of their own: their size, weight and slant wait for the
    // switch.
    const on = props.showPrices === true
    const size = dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(props.pricesFontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchProps({ pricesFontSize: Number(v) }))
    const bold = fontToggle(icons, props.pricesBold === true, 'textBold', t('drawing.bold'), () => ctx.patchProps({ pricesBold: props.pricesBold !== true }))
    const italic = fontToggle(icons, props.pricesItalic === true, 'textItalic', t('drawing.italic'), () => ctx.patchProps({ pricesItalic: props.pricesItalic !== true }))
    for (const control of [size, bold, italic]) control.disabled = !on
    out.push(
      row(t('drawing.rowLine'), stroke('drawing.rowLine'), ...ends()),
      extend('drawing.extendLeftLine', 'drawing.extendRightLine'),
      checkRow(t('drawing.prices'), on, (v) => ctx.patchProps({ showPrices: v }), [
        swatchButton(t, box, { label: t('drawing.pricesColor'), value: String(props.pricesColor), onPick: (c) => ctx.patchProps({ pricesColor: c }) }),
        size,
        bold,
        italic,
      ]),
      background(),
    )
  } else if (layout === 'priceLabel') {
    out.push(row(t('drawing.text'), ...wordsLook()), row(t('drawing.background'), fillSwatch('drawing.background')), row(t('drawing.border'), strokeSwatch('drawing.border')))
  } else if (layout === 'note') {
    // The label's background and border, each on its switch, then the line to the point it notes.
    out.push(
      checkRow(t('drawing.labelBackground'), props.fillBackground !== false, (v) => ctx.patchProps({ fillBackground: v }), [fillSwatch('drawing.labelBackground')]),
      checkRow(t('drawing.labelBorder'), props.drawBorder === true, (v) => ctx.patchProps({ drawBorder: v }), [propSwatch('borderColor', 'drawing.labelBorder')]),
      row(t('drawing.lineColor'), strokeSwatch('drawing.lineColor')),
    )
  } else if (layout === 'priceNote') {
    // The tag's words in a text style of their own, its background and border, then the line.
    out.push(
      row(
        t('drawing.labelText'),
        propSwatch('labelTextColor', 'drawing.labelText'),
        dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(props.labelFontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchProps({ labelFontSize: Number(v) })),
        fontToggle(icons, props.labelBold === true, 'textBold', t('drawing.bold'), () => ctx.patchProps({ labelBold: props.labelBold !== true })),
        fontToggle(icons, props.labelItalic === true, 'textItalic', t('drawing.italic'), () => ctx.patchProps({ labelItalic: props.labelItalic !== true })),
      ),
      row(t('drawing.labelBackground'), propSwatch('labelBackgroundColor', 'drawing.labelBackground')),
      row(t('drawing.labelBorder'), propSwatch('labelBorderColor', 'drawing.labelBorder')),
      row(t('drawing.lineColor'), strokeSwatch('drawing.lineColor')),
    )
  } else if (layout === 'pin') {
    out.push(row(t('drawing.label'), strokeSwatch('drawing.label')))
  } else if (layout === 'signpost') {
    out.push(checkRow(t('drawing.emojiPin'), props.showImage === true, (v) => ctx.patchProps({ showImage: v }), [emojiButton(ctx), strokeSwatch('drawing.plateColor')]))
  } else if (layout === 'table') {
    out.push(
      row(t('drawing.background'), fillSwatch('drawing.background')),
      row(t('drawing.border'), strokeSwatch('drawing.border')),
      row(t('drawing.text'), ...wordsLook()),
      row(t('drawing.textAlignment'), dropdown(icons, box, t('drawing.textAlignment'), ['left', 'center', 'right'] as const, props.textHAlign as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ textHAlign: v }))),
    )
  } else if (layout === 'mark') {
    // A mark's one color, named for what it paints.
    const name: ChartMessageKey = drawing.type === 'flag' ? 'drawing.flag' : drawing.type === 'arrow_marker' ? 'drawing.color' : 'drawing.arrowMark'
    out.push(row(t(name), strokeSwatch(name)))
  } else if (layout === 'brush') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine'), ...ends()), background())
  } else if (layout === 'path') {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine'), ...ends()))
  } else if (layout === 'highlighter') {
    // The marker's color with its see-through, and its width in pixels.
    out.push(
      row(t('drawing.rowLine'), strokeSwatch('drawing.rowLine')),
      row(t('drawing.thickness'), dropdown(icons, box, t('drawing.thickness'), HIGHLIGHTER_WIDTHS.map(String), String(style.lineWidth), (v) => `${v}px`, (v) => ctx.patchStyle({ lineWidth: Number(v) }))),
    )
  } else if (layout === 'icon') {
    out.push(row(t('drawing.color'), strokeSwatch('drawing.color')))
  } else if (layout === 'image') {
    out.push(...imageRows(ctx))
  } else if (layout === 'elliott') {
    // One color for the wave and its labels, the wave's switch and thickness, and the degree that
    // writes the labels.
    out.push(
      row(
        t('drawing.color'),
        swatchButton(t, box, {
          label: t('drawing.color'),
          value: style.lineColor,
          onPick: (c) => {
            const alpha = alphaOf(style.lineColor)
            ctx.patchStyle({ lineColor: alpha < 1 ? withAlpha(c, alpha) : c })
          },
          opacity: alphaOf(style.lineColor),
          onOpacity: (v) => ctx.patchStyle({ lineColor: withAlpha(style.lineColor, v) }),
        }),
      ),
      checkRow(t('drawing.wave'), props.showWave !== false, (v) => ctx.patchProps({ showWave: v }), [thicknessSelect(ctx, style.lineWidth, (v) => ctx.patchStyle({ lineWidth: v }))]),
      row(t('drawing.degree'), dropdown(icons, box, t('drawing.degree'), ELLIOTT_DEGREES, props.degree as ElliottDegree, label(t, DEGREE_LABEL), (v) => ctx.patchProps({ degree: v }), 'medium')),
    )
  } else {
    out.push(row(t('drawing.rowLine'), stroke('drawing.rowLine'), ...ends()), extend('drawing.extendLeftLine', 'drawing.extendRightLine'), background())
  }
  return out
}

/** The Style and Inputs pages. A tool with a shared layout gets its layout's rows; every other row
 *  asks whether its prop belongs on this page and whether the tool's paint honors it. */
export function styleRows(ctx: RowsContext): HTMLElement[] {
  const layout = STYLE_LAYOUTS[ctx.drawing.type]
  if (layout && ctx.tab === 'Style') return layoutRows(ctx, layout)
  if (ctx.drawing.type === 'anchored_vwap' && ctx.tab === 'Inputs') return vwapInputs(ctx)
  const { t, drawing, box, tab } = ctx
  const type = drawing.type
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const inputKeys = new Set(INPUT_PROPS[type] ?? [])
  const inertKeys = new Set(INERT_PROPS[type] ?? [])
  const sect = (key: string): boolean => key in props && !inertKeys.has(key) && (inputKeys.has(key) ? tab === 'Inputs' : tab === 'Style')
  const out: HTMLElement[] = []
  const fontSize = (): HTMLElement => dropdown(ctx.icons, ctx.box, t('drawing.fontSize'), FONT_SIZES, String(style.fontSize) as (typeof FONT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) }))
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
        ? { thickness: style.lineWidth, thicknessChoices: type === 'highlighter' ? HIGHLIGHTER_WIDTHS : undefined, onThickness: (v: number) => ctx.patchStyle({ lineWidth: v }), ...(!NO_DASH.has(type) ? { lineStyle: style.lineStyle, onLineStyle: (v: DrawingStyle['lineStyle']) => ctx.patchStyle({ lineStyle: v }) } : {}) }
        : {}),
    })
    const ends: HTMLElement[] = []
    if ('leftEnd' in props && sect('leftEnd')) {
      ends.push(
        lineEndButton(t, ctx.icons, box, 'left', props.leftEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ leftEnd: v })),
        lineEndButton(t, ctx.icons, box, 'right', props.rightEnd as 'normal' | 'arrow', (v) => ctx.patchProps({ rightEnd: v })),
      )
    }
    out.push(row(t(NO_LINE_DECOR.has(type) ? 'drawing.color' : 'drawing.rowLine'), stroke, ...ends))
  }
  if (tab === 'Style' && FILLABLE.has(type)) {
    out.push(row(t('drawing.background'), swatchButton(t, box, { label: t('drawing.background'), value: style.fillColor, onPick: (c) => ctx.patchStyle({ fillColor: c }), opacity: style.fillOpacity, onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }) })))
  }
  if ('extendLeft' in props && sect('extendLeft')) {
    const value = props.extendLeft && props.extendRight ? 'Both' : props.extendLeft ? 'Left' : props.extendRight ? 'Right' : 'None'
    out.push(row(t('drawing.extend'), dropdown(ctx.icons, ctx.box, t('drawing.extend'), ['None', 'Left', 'Right', 'Both'] as const, value, label(t, EXTEND_LABEL), (v) => ctx.patchProps({ extendLeft: v === 'Left' || v === 'Both', extendRight: v === 'Right' || v === 'Both' }))))
  }
  toggle('middlePoint', 'drawing.middlePoint')
  toggle('showPriceLabels', 'drawing.priceLabels')
  toggle('showPrice', 'drawing.priceLabel')
  toggle('showTime', 'drawing.timeLabel')
  toggle('middleLine', 'drawing.middleLine')
  if (sect('showPriceRange')) {
    out.push(
      sectionTitle(t('drawing.sectionInfo')),
      toggleRow(t('drawing.priceRange'), !!props.showPriceRange, (v) => ctx.patchProps({ showPriceRange: v })),
      toggleRow(t('drawing.percentChange'), !!props.showPercentChange, (v) => ctx.patchProps({ showPercentChange: v })),
      toggleRow(t('drawing.barsRange'), !!props.showBarsRange, (v) => ctx.patchProps({ showBarsRange: v })),
      toggleRow(t('drawing.dateTimeRange'), !!props.showDateTimeRange, (v) => ctx.patchProps({ showDateTimeRange: v })),
      toggleRow(t('drawing.angle'), !!props.showAngle, (v) => ctx.patchProps({ showAngle: v })),
      row(t('drawing.statsPosition'), dropdown(ctx.icons, ctx.box, t('drawing.statsPosition'), ['left', 'center', 'right'] as const, props.statsPosition as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ statsPosition: v }))),
    )
  }
  if (sect('direction')) out.push(row(t('drawing.direction'), dropdown(ctx.icons, ctx.box, t('drawing.direction'), ['up', 'down'] as const, props.direction as 'up', label(t, UPDOWN_LABEL), (v) => ctx.patchProps({ direction: v }))))
  toggle('showPrices', 'drawing.prices')
  toggle('showLevels', 'drawing.levels')
  toggle('reverse', 'drawing.reverse')
  toggle('fullCircles', 'drawing.fullCircles')
  toggle('coeffsAsPercents', 'drawing.coeffsAsPercents')
  toggle('background', 'drawing.background')
  toggle('extendLines', 'drawing.extendLines')
  toggle('showMiddle', 'drawing.middleLine')
  toggle('showLabels', 'drawing.labels')
  if (sect('rowsLayout')) {
    // How the profile divides the range, what each row reads, the value area's share, and whether
    // the profile runs on with new bars.
    out.push(
      row(t('drawing.rowsLayout'), dropdown(ctx.icons, ctx.box, t('drawing.rowsLayout'), ['number', 'ticks'] as const, props.rowsLayout as 'number', label(t, ROWS_LAYOUT_LABEL), (v) => ctx.patchProps({ rowsLayout: v }))),
      row(t('drawing.rowSize'), numberInput(t, ctx.icons, { label: t('drawing.rowSize'), value: Number(props.rowSize), min: 1, max: 1000, step: 1, width: 'field', onChange: (v) => ctx.patchProps({ rowSize: v }) })),
      row(t('drawing.volume'), dropdown(ctx.icons, ctx.box, t('drawing.volume'), ['updown', 'total', 'delta'] as const, props.volume as 'updown', label(t, PROFILE_VOLUME_LABEL), (v) => ctx.patchProps({ volume: v }))),
      row(t('drawing.valueAreaVolume'), numberInput(t, ctx.icons, { label: t('drawing.valueAreaVolume'), value: Number(props.valueAreaVolume), min: 0, max: 100, step: 5, width: 'field', onChange: (v) => ctx.patchProps({ valueAreaVolume: v }) })),
    )
    if ('extendRight' in props) out.push(compact(toggleRow(t('drawing.profileExtendRight'), !!props.extendRight, (v) => ctx.patchProps({ extendRight: v }))))
  }
  if (sect('averageHL')) {
    // The sketched candles' average span is written in the symbol's minimum ticks, cents where the
    // host states no tick, and the drawing holds it as a price.
    const tick = drawing.getTickSize?.() ?? null
    const unit = tick !== null && tick > 0 ? tick : 0.01
    out.push(
      row(t('drawing.avgHlMinticks'), numberInput(t, ctx.icons, { label: t('drawing.avgHlMinticks'), value: Math.round(Number(props.averageHL) / unit), min: 0, step: 1, width: 'field', onChange: (v) => ctx.patchProps({ averageHL: v * unit }) })),
      row(t('drawing.variance'), numberInput(t, ctx.icons, { label: t('drawing.variance'), value: Number(props.variance), min: 0, max: 100, step: 5, width: 'field', onChange: (v) => ctx.patchProps({ variance: v }) })),
    )
  }
  if ('wickColor' in props && tab === 'Style') {
    out.push(
      row(t('drawing.candles'), swatch('upColor'), swatch('downColor')),
      checkRow(t('drawing.borders'), !!props.drawBorder, (v) => ctx.patchProps({ drawBorder: v }), [swatch('borderUpColor'), swatch('borderDownColor')]),
      checkRow(t('drawing.wick'), !!props.drawWick, (v) => ctx.patchProps({ drawWick: v }), [swatch('wickColor')]),
      row(t('drawing.transparency'), opacityTrack(t, 1 - Number(props.transparency) / 100, (v) => ctx.patchQuiet({ transparency: Math.round((1 - v) * 100) }))),
    )
  }
  if (sect('upperDeviation')) {
    // How far each band stands from the line in standard deviations, the lower one counted down,
    // whether each band shows, and the price the line is fitted through.
    out.push(
      row(t('drawing.upperDeviation'), numberInput(t, ctx.icons, { label: t('drawing.upperDeviation'), value: Number(props.upperDeviation), step: 0.5, width: 'field', onChange: (v) => ctx.patchProps({ upperDeviation: v }) })),
      row(t('drawing.lowerDeviation'), numberInput(t, ctx.icons, { label: t('drawing.lowerDeviation'), value: Number(props.lowerDeviation), step: 0.5, width: 'field', onChange: (v) => ctx.patchProps({ lowerDeviation: v }) })),
      compact(toggleRow(t('drawing.useUpperDeviation'), !!props.useUpper, (v) => ctx.patchProps({ useUpper: v }))),
      compact(toggleRow(t('drawing.useLowerDeviation'), !!props.useLower, (v) => ctx.patchProps({ useLower: v }))),
      row(t('drawing.source'), dropdown(ctx.icons, ctx.box, t('drawing.source'), BAR_PRICE_SOURCES, props.source as BarPriceSource, label(t, SOURCE_LABEL), (v) => ctx.patchProps({ source: v }))),
    )
  }
  if (sect('accountSize')) out.push(...positionInputs(ctx))
  const levels = Array.isArray(props.levels) ? (props.levels as FibLevel[]) : null
  if (levels && tab === 'Style') {
    // The levels as the drawing holds them NOW. Every change replaces the whole array, so a row
    // built before an earlier edit must read the current one rather than write its own copy back
    // and undo what came between.
    const liveLevels = (): FibLevel[] => (Array.isArray(drawing.props.levels) ? (drawing.props.levels as FibLevel[]) : levels)
    out.push(sectionTitle(t('drawing.levels')))
    const list = el('div', { class: 'qc-drawing-levels' })
    levels.forEach((level, i) => {
      const patchLevel = (patch: Partial<FibLevel>, quiet = false): void => {
        const next = liveLevels().map((l, j) => (j === i ? { ...l, ...patch } : l))
        if (quiet) ctx.patchQuiet({ levels: next })
        else ctx.patchProps({ levels: next })
      }
      list.appendChild(
        el(
          'div',
          { class: 'qc-drawing-level' },
          checkbox(t('drawing.levelVisible', { value: level.value }), level.visible, (v) => patchLevel({ visible: v })),
          numberInput(t, ctx.icons, { label: t('drawing.levelVisible', { value: level.value }), value: level.value, width: 'short', onChange: (v) => patchLevel({ value: v }) }),
          swatchButton(t, box, { label: t('drawing.color'), value: level.color ?? style.lineColor, onPick: (c) => patchLevel({ color: c }) }),
          textField(level.text ?? '', t('drawing.levelText', { value: level.value }), (v) => patchLevel({ text: v }, true), { placeholder: t('drawing.textPlaceholder') }),
          button({ class: 'qc-drawing-star', label: t('drawing.removeLevel', { value: level.value }), icon: ctx.icons.icon('close18', 18), onClick: () => ctx.patchProps({ levels: liveLevels().filter((_, j) => j !== i) }) }),
        ),
      )
    })
    out.push(
      list,
      button({ class: 'qc-button', label: t('drawing.addLevel'), text: t('drawing.addLevel'), onClick: () => ctx.patchProps({ levels: [...liveLevels(), { value: 0, visible: true }] }) }),
      row(t('drawing.fontSize'), fontSize()),
    )
  }
  if ('cells' in props && tab === 'Style') {
    out.push(
      row(t('drawing.textColor'), swatchButton(t, box, { label: t('drawing.textColor'), value: style.textColor, onPick: (c) => ctx.patchStyle({ textColor: c }), opacity: alphaOf(style.textColor), onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }) })),
      row(t('drawing.fontSize'), fontSize()),
    )
  }
  return out
}

/** A row nested under the switch before it, its label 26px in. */
function nested(rowElement: HTMLElement): HTMLElement {
  rowElement.classList.add('qc-drawing-row--nested')
  return rowElement
}

/** A checkbox row in a list of inputs, 34px tall rather than a setting's 50px. */
function compact(toggle: HTMLElement): HTMLElement {
  toggle.classList.add('qc-drawing-toggle--compact')
  return toggle
}

/** The tools that are their words, whose text box stands 172px tall rather than 100px. */
const TALL_TEXT: ReadonlySet<string> = new Set(['text', 'note', 'callout'])

/** How many decimals a field writes a price with: the symbol's tick's, or cents where the host states
 *  no tick, so a price reads as the chart writes it rather than with a float's dust. */
function priceDecimals(drawing: IDrawing): number {
  const tick = drawing.getTickSize?.() ?? null
  if (tick === null || !(tick > 0)) return 2
  for (let d = 0; d < 10; d++) {
    const scaled = tick * 10 ** d
    if (Math.abs(Math.round(scaled) - scaled) < 1e-9 * Math.max(1, scaled)) return d
  }
  return 10
}

/** The Text page: the words' look, the words themselves, where they stand and which way they read
 *  where the tool places them, and for the text tools without a Style page, their background and
 *  border. The words' look is one line: a comment's names itself Text and carries no weight or
 *  slant, a note's names itself Text, and a signpost's carries no color, its plate choosing the
 *  ink. */
export function textRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing, box, icons } = ctx
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const type = drawing.type
  const area = el('textarea', { class: 'qc-field qc-drawing-textarea', spellcheck: 'false', placeholder: t('drawing.addText'), 'aria-label': t('drawing.tabText'), 'data-size': TALL_TEXT.has(type) ? 'tall' : undefined }) as HTMLTextAreaElement
  area.value = String(props.text ?? '')
  area.addEventListener('input', () => ctx.patchQuiet({ text: area.value }))
  const color = swatchButton(t, box, {
    label: t('drawing.textColor'),
    value: style.textColor,
    onPick: (c) => {
      const alpha = alphaOf(style.textColor)
      ctx.patchStyle({ textColor: alpha < 1 ? withAlpha(c, alpha) : c })
    },
    opacity: alphaOf(style.textColor),
    onOpacity: (v) => ctx.patchStyle({ textColor: withAlpha(style.textColor, v) }),
  })
  const size = dropdown(icons, box, t('drawing.fontSize'), TEXT_SIZES, String(style.fontSize) as (typeof TEXT_SIZES)[number], (v) => v, (v) => ctx.patchStyle({ fontSize: Number(v) }))
  const bold = fontToggle(icons, style.bold, 'textBold', t('drawing.bold'), () => ctx.patchStyle({ bold: !style.bold }))
  const italic = fontToggle(icons, style.italic, 'textItalic', t('drawing.italic'), () => ctx.patchStyle({ italic: !style.italic }))
  const look = type === 'comment' ? row(t('drawing.text'), color, size) : type === 'note' ? row(t('drawing.text'), color, size, bold, italic) : type === 'signpost' ? fullRow(size, bold, italic) : fullRow(color, size, bold, italic)
  const out: HTMLElement[] = [look, fullRow(area)]
  if ('textVAlign' in props) {
    out.push(
      row(
        t('drawing.textAlignment'),
        dropdown(icons, box, t('drawing.textAlignment'), ['top', 'middle', 'bottom'] as const, props.textVAlign as 'top', label(t, INSIDE_ACROSS.has(drawing.type) ? BOX_ACROSS_LABEL : ACROSS_LABEL), (v) => ctx.patchProps({ textVAlign: v })),
        dropdown(icons, box, t('drawing.textAlignment'), ['left', 'center', 'right'] as const, props.textHAlign as 'left', label(t, SIDE_LABEL), (v) => ctx.patchProps({ textHAlign: v })),
      ),
    )
  }
  if ('textOrientation' in props) {
    out.push(row(t('drawing.textOrientation'), dropdown(icons, box, t('drawing.textOrientation'), ['horizontal', 'vertical'] as const, props.textOrientation as 'horizontal', label(t, ORIENTATION_LABEL), (v) => ctx.patchProps({ textOrientation: v }))))
  }
  if (NO_STYLE_TAB.has(type) || type === 'pin') out.push(...textBoxRows(ctx))
  if ('wordWrap' in props) out.push(toggleRow(t('drawing.textWrap'), props.wordWrap === true, (v) => ctx.patchProps({ wordWrap: v })))
  return out
}

/** A text box's background and border: a text's and a pin's each on its switch, a pin's border in a
 *  color of its own; a comment's and a callout's always drawn, a callout's border at its width. */
function textBoxRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing, box } = ctx
  const props = drawing.props as Record<string, unknown>
  const style = drawing.style
  const fill = swatchButton(t, box, { label: t('drawing.background'), value: style.fillColor, onPick: (c) => ctx.patchStyle({ fillColor: c, ...(style.fillOpacity === 0 ? { fillOpacity: 1 } : {}) }), opacity: style.fillOpacity, onOpacity: (v) => ctx.patchStyle({ fillOpacity: v }) })
  const own = 'borderColor' in props
  const current = own ? String(props.borderColor) : style.lineColor
  const setBorder = (next: string): void => (own ? ctx.patchProps({ borderColor: next }) : ctx.patchStyle({ lineColor: next }))
  const border = swatchButton(t, box, {
    label: t('drawing.border'),
    value: current,
    onPick: (c) => setBorder(alphaOf(current) < 1 ? withAlpha(c, alphaOf(current)) : c),
    opacity: alphaOf(current),
    onOpacity: (v) => setBorder(withAlpha(current, v)),
    ...(drawing.type === 'callout' ? { thickness: style.lineWidth, onThickness: (v: number) => ctx.patchStyle({ lineWidth: v }) } : {}),
  })
  if ('drawBorder' in props) {
    return [
      checkRow(t('drawing.background'), props.fillBackground !== false, (v) => ctx.patchProps({ fillBackground: v }), [fill]),
      checkRow(t('drawing.border'), props.drawBorder === true, (v) => ctx.patchProps({ drawBorder: v }), [border]),
    ]
  }
  return [row(t('drawing.background'), fill), row(t('drawing.border'), border)]
}

/** The Coordinates page: one row per anchor, as price and bar index, bar alone for the
 *  time-anchored tools, or price alone for a level that spans every bar. A trend angle's second
 *  point is its angle: typing one turns the line about its first point and keeps its length. */
export function coordinateRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const viewport = drawing.getViewport()
  const barOnly = BAR_ONLY_COORDS.has(drawing.type)
  const priceOnly = PRICE_ONLY_COORDS.has(drawing.type)
  return drawing.anchors.map((anchor, i) => {
    if (drawing.type === 'trend_angle' && i === 1) return angleRow(ctx)
    if (drawing.type === 'parallel_channel' && i === 2) return priceOffsetRow(ctx)
    if (drawing.type === 'signpost' && i === 0) return signpostRow(ctx)
    const bar = viewport?.logicalOf(anchor.time)
    const controls: HTMLElement[] = []
    if (!barOnly) controls.push(numberInput(t, ctx.icons, { label: t('drawing.coordPriceBar', { n: i + 1 }), value: anchor.price, decimals: priceDecimals(drawing), width: 'field', onChange: (v) => ctx.patchAnchor(i, { price: v }) }))
    if (!priceOnly) controls.push(
      numberInput(t, ctx.icons, {
        label: t('drawing.coordBar', { n: i + 1 }),
        value: bar === null || bar === undefined ? NaN : Math.round(bar),
        step: 1,
        width: 'field',
        onChange: (v) => {
          const time = viewport?.timeOfLogical(v)
          if (time !== null && time !== undefined) ctx.patchAnchor(i, { time })
        },
      }),
    )
    return row(t(barOnly ? 'drawing.coordBar' : priceOnly ? 'drawing.coordPrice' : 'drawing.coordPriceBar', { n: i + 1 }), ...controls)
  })
}

/** An anchored VWAP's Inputs page: how its bands stand off it and which of them are calculated, at
 *  what multiples, each band on one line, and the price it weighs. Its title row stands a field
 *  row's height. */
function vwapInputs(ctx: RowsContext): HTMLElement[] {
  const { t, icons, box, drawing } = ctx
  const props = drawing.props as Record<string, unknown>
  const live = (key: 'bandMultipliers' | 'bandsOn'): unknown[] => (Array.isArray(drawing.props[key]) ? (drawing.props[key] as unknown[]) : [])
  const multipliers = live('bandMultipliers') as number[]
  const on = live('bandsOn') as boolean[]
  /** A band on one line: its switch with its name, then its multiplier 8px after the name. */
  const band = (index: number): HTMLElement => {
    const name = t('drawing.bandsMultiplier', { n: index + 1 })
    const switched = toggleRow(name, on[index] === true, (v) => ctx.patchProps({ bandsOn: live('bandsOn').map((b, j) => (j === index ? v : b)) }))
    const line = fullRow(
      switched,
      numberInput(t, icons, {
        label: name,
        value: Number(multipliers[index]),
        min: 0,
        step: 0.5,
        width: 'field',
        onChange: (v) => ctx.patchProps({ bandMultipliers: live('bandMultipliers').map((m, j) => (j === index ? v : m)) }),
      }),
    )
    line.classList.add('qc-drawing-band-row')
    return line
  }
  const title = sectionTitle(t('drawing.bandsSettings'))
  title.classList.add('qc-drawing-section--row')
  return [
    title,
    row(t('drawing.bandsMode'), dropdown(icons, box, t('drawing.bandsMode'), ['stdev', 'percent'] as const, props.bandsMode as 'stdev', label(t, BANDS_MODE_LABEL), (v) => ctx.patchProps({ bandsMode: v }))),
    band(0),
    band(1),
    band(2),
    groupGap(),
    row(t('drawing.source'), dropdown(icons, box, t('drawing.source'), BAR_PRICE_SOURCES, props.source as BarPriceSource, label(t, SOURCE_LABEL), (v) => ctx.patchProps({ source: v }))),
  ]
}

/** A position's Inputs page: its account, lots, risk and leverage; its entry, and its target and stop
 *  each as ticks from the entry and as a price; and how its quantity is written, each group kept
 *  apart by a gap. Ticks are the symbol's minimum ticks, cents where the host states no tick, the
 *  prices are written at the symbol's precision, and the risk's second unit is the currency the
 *  symbol is quoted in. */
function positionInputs(ctx: RowsContext): HTMLElement[] {
  const { t, icons, box, drawing } = ctx
  const props = drawing.props as Record<string, unknown>
  const [entry, target, stop] = drawing.anchors
  const tick = drawing.getTickSize?.() ?? null
  const unit = tick !== null && tick > 0 ? tick : 0.01
  const currency = drawing.getCurrencyCode?.() ?? null
  const short = drawing.type === 'short_position'
  const prices = priceDecimals(drawing)
  const field = (text: ChartMessageKey, value: number, onChange: (v: number) => void, extra: { decimals?: number; step?: number; min?: number } = {}): HTMLElement =>
    numberInput(t, icons, { label: t(text), value, width: 'field', onChange, ...extra })
  /** A level, written as ticks from the entry and as a price; the target stands above a long's entry
   *  and below a short's, the stop the other way. */
  const level = (index: 1 | 2, anchor: typeof target): HTMLElement[] => {
    const above = (index === 1) !== short
    const ticks = entry && anchor ? Math.round(Math.abs(anchor.price - entry.price) / unit) : NaN
    return [
      row(t('drawing.ticks'), field('drawing.ticks', ticks, (v) => entry && ctx.patchAnchor(index, { price: entry.price + (above ? 1 : -1) * Math.abs(v) * unit }), { step: 1, min: 0 })),
      row(t('drawing.price'), field('drawing.price', anchor ? anchor.price : NaN, (v) => ctx.patchAnchor(index, { price: v }), { decimals: prices })),
    ]
  }
  return [
    row(t('drawing.accountSize'), field('drawing.accountSize', Number(props.accountSize), (v) => ctx.patchProps({ accountSize: v }), { min: 0 })),
    row(t('drawing.lotSize'), field('drawing.lotSize', Number(props.lotSize), (v) => ctx.patchProps({ lotSize: v }), { min: 0, step: 0.01 })),
    row(
      t('drawing.risk'),
      field('drawing.risk', Number(props.risk), (v) => ctx.patchProps({ risk: v }), { decimals: 2, min: 0 }),
      dropdown(icons, box, t('drawing.riskUnit'), ['percent', 'money'] as const, props.riskDisplay as 'percent', (v) => (v === 'percent' ? '%' : (currency ?? t('drawing.riskAmount'))), (v) => ctx.patchProps({ riskDisplay: v })),
    ),
    row(t('drawing.entryPrice'), field('drawing.entryPrice', entry ? entry.price : NaN, (v) => ctx.patchAnchor(0, { price: v }), { decimals: prices })),
    row(t('drawing.leverage'), field('drawing.leverage', Number(props.leverage), (v) => ctx.patchProps({ leverage: v }), { decimals: 1, min: 1, step: 1 })),
    groupGap(),
    sectionTitle(t('drawing.profitLevel')),
    ...level(1, target),
    groupGap(),
    sectionTitle(t('drawing.stopLevel')),
    ...level(2, stop),
    groupGap(),
    row(t('drawing.qtyPrecision'), dropdown(icons, box, t('drawing.qtyPrecision'), QTY_PRECISIONS, props.qtyPrecision as (typeof QTY_PRECISIONS)[number], (v) => (QTY_PRECISION_LABEL[v] ? t(QTY_PRECISION_LABEL[v]!) : t('drawing.qtyDecimals', { n: Number(v) })), (v) => ctx.patchProps({ qtyPrecision: v }))),
    groupGap(),
  ]
}

/** A parallel channel's offset: the price its parallel stands from the baseline at the third point's
 *  bar, the baseline run on through its own two points bar by bar. Typing one moves the parallel to
 *  it at that bar. */
function priceOffsetRow(ctx: RowsContext): HTMLElement {
  const { t, drawing } = ctx
  const viewport = drawing.getViewport()
  const [a, b, c] = drawing.anchors
  const barOf = (time: unknown): number => {
    const logical = viewport?.logicalOf(time as never)
    return logical === null || logical === undefined ? Number(time) : logical
  }
  const baseAt = (time: unknown): number => {
    if (!a || !b) return NaN
    const span = barOf(b.time) - barOf(a.time)
    return span === 0 ? a.price : a.price + ((b.price - a.price) * (barOf(time) - barOf(a.time))) / span
  }
  const offset = c ? c.price - baseAt(c.time) : NaN
  return row(
    t('drawing.priceOffset'),
    numberInput(t, ctx.icons, {
      label: t('drawing.priceOffset'),
      value: offset,
      decimals: priceDecimals(drawing),
      width: 'field',
      onChange: (v) => {
        if (c) ctx.patchAnchor(2, { price: baseAt(c.time) + v })
      },
    }),
  )
}

/** A signpost's point: how far its plate stands from its bar, in percent of the pane's height, and
 *  its bar. Typing a bar moves the signpost to it at the same height over the bar. */
function signpostRow(ctx: RowsContext): HTMLElement {
  const { t, drawing } = ctx
  const viewport = drawing.getViewport()
  const anchor = drawing.anchors[0]
  const position = drawing.props.position
  const bar = anchor ? viewport?.logicalOf(anchor.time) : null
  return row(
    t('drawing.coordPositionBar', { n: 1 }),
    numberInput(t, ctx.icons, { label: t('drawing.verticalPosition'), value: typeof position === 'number' ? position : NaN, decimals: 2, step: 1, width: 'field', onChange: (v) => ctx.patchProps({ position: v }) }),
    numberInput(t, ctx.icons, {
      label: t('drawing.coordBar', { n: 1 }),
      value: bar === null || bar === undefined ? NaN : Math.round(bar),
      step: 1,
      width: 'field',
      onChange: (v) => {
        const time = viewport?.timeOfLogical(v)
        if (time !== null && time !== undefined) ctx.patchAnchor(0, { time })
      },
    }),
  )
}

/** A line's angle in degrees, counted up from the horizontal, as the pane draws it. */
function angleRow(ctx: RowsContext): HTMLElement {
  const { t, drawing } = ctx
  const viewport = drawing.getViewport()
  const [first, second] = drawing.anchors
  const a = first && viewport ? drawing.anchorToPixel(first, viewport) : null
  const b = second && viewport ? drawing.anchorToPixel(second, viewport) : null
  const degrees = a && b ? -Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI) : NaN
  return row(
    t('drawing.angle'),
    numberInput(t, ctx.icons, {
      label: t('drawing.angle'),
      value: Number.isFinite(degrees) ? Number(degrees.toFixed(2)) : NaN,
      step: 1,
      width: 'field',
      onChange: (v) => {
        if (!a || !b || !viewport) return
        const length = Math.hypot(b.x - a.x, b.y - a.y)
        const turn = (-v * Math.PI) / 180
        const time = viewport.timeAt(a.x + length * Math.cos(turn))
        const price = viewport.priceAt(a.y + length * Math.sin(turn))
        if (time !== null && price !== null) ctx.patchAnchor(1, { time, price })
      },
    }),
  )
}

/** The Visibility page: the ticks switch and one range row per bucket. A drawing switched off on
 *  every timeframe would be gone for good (it paints nothing and takes no hit), so the last enabled
 *  timeframe is pinned on. */
export function visibilityRows(ctx: RowsContext): HTMLElement[] {
  const { t, drawing } = ctx
  const visibility = drawing.options.visibility ?? DEFAULT_VISIBILITY
  const enabled = (visibility.ticks ? 1 : 0) + VISIBILITY_ROWS.reduce((n, r) => n + ((visibility[r.key] as { on: boolean }).on ? 1 : 0), 0)
  const pinned = (on: boolean): boolean => enabled === 1 && on
  const out: HTMLElement[] = [toggleRow(t('drawing.unitTicks'), visibility.ticks, (v) => ctx.patchVisibility({ ticks: v }), pinned(visibility.ticks))]
  for (const { key, label: text, max } of VISIBILITY_ROWS) {
    const range = visibility[key] as { on: boolean; from: number; to: number }
    out.push(visibilityRangeRow(t, ctx.icons, { label: t(text), range, max, disabled: pinned(range.on), onChange: (next) => ctx.patchVisibility({ [key]: next }) }))
  }
  if (enabled === 1) out.push(el('span', { class: 'qc-muted qc-drawing-note', text: t('drawing.timeframePinnedNote') }))
  return out
}
