// The published icon inventory: every glyph of the chart's own interface a host may draw instead,
// by an id that names what the glyph MEANS where it stands. The ids are the contract; the drawings
// behind them are the chart's own and change freely.
//
// A meaning the chart draws at more than one optical size is one icon: `delete` is the row's
// eighteen-pixel trash and the drawing toolbar's twenty-eight-pixel one, so a host's drawing for it
// stands in both, sized to each box. The chart styles, the drawing tools and the layout
// arrangements take their ids from their own registries. The product's own mark in the plot's
// corner is not in the inventory: it is the chart's signature, not a control's glyph.
import { CHART_STYLES, type ChartStyleId } from '../../widget/styles'
import { COMPARE_EMPTY_MARK, ICONS, OPERATOR_GLYPHS, SEARCH_EMPTY_MARK, STYLE_ICONS, type Glyph } from '../controls/icons'
import { TOOL_ICONS, type MiniatureTool } from '../drawings/toolIcons'
import { ARRANGEMENT_ICONS, type ArrangementGlyphCode } from '../chrome/arrangementGlyphs'
import type { ChartIconFactory } from './contract'

/** A table by meaning whose keys stay literal and whose drawings are typed as glyphs, so the published
 *  types name each icon and carry nothing drawn. */
const byMeaning = <K extends string>(table: Record<K, readonly Glyph[]>): Readonly<Record<K, readonly Glyph[]>> => table

/** The glyphs of the chart's own controls, by meaning, each with every drawing that carries it. */
const CONTROL_ICONS = byMeaning({
  // The top bar and the widget's menus.
  compare: [ICONS.comparePlus],
  indicators: [ICONS.indicators],
  replay: [ICONS.replay],
  undo: [ICONS.undo],
  redo: [ICONS.redo],
  settings: [ICONS.settings, ICONS.gear, ICONS.legendSettings],
  fullscreen: [ICONS.fullscreen],
  fullscreenExit: [ICONS.exitFullscreen],
  image: [ICONS.camera],
  download: [ICONS.download],
  copy: [ICONS.copy],
  caret: [ICONS.menuArrowWide],
  info: [ICONS.info],
  // The legend.
  visible: [ICONS.legendEye],
  hidden: [ICONS.legendEyeOff],
  collapse: [ICONS.legendChevron],
  paneCollapse: [ICONS.paneCollapse],
  paneRestore: [ICONS.paneRestore],
  paneMaximize: [ICONS.paneMaximize],
  marketStatus: [ICONS.marketStatus],
  replayStatus: [ICONS.replayStatus],
  replayMark: [ICONS.replayMark],
  replayCut: [ICONS.replayCut],
  // The navigation cluster.
  zoomIn: [ICONS.navZoomIn],
  zoomOut: [ICONS.navZoomOut],
  scroll: [ICONS.navScroll],
  reset: [ICONS.navReset],
  tileMaximize: [ICONS.tileMaximize],
  tileRestore: [ICONS.tileRestore],
  // Rows, lists and dialogs.
  check: [ICONS.check],
  close: [ICONS.close, ICONS.closeThin, ICONS.dialogClose],
  remove: [ICONS.close18, ICONS.removeRow],
  delete: [ICONS.trash, ICONS.trash28],
  add: [ICONS.plus, ICONS.plusThin, ICONS.plus24],
  bold: [ICONS.textBold],
  italic: [ICONS.textItalic],
  search: [ICONS.search, ICONS.search24],
  clear: [ICONS.clear],
  open: [ICONS.folder],
  rename: [ICONS.pencil],
  duplicate: [ICONS.clone],
  favorite: [ICONS.star, ICONS.pickerStar],
  favorited: [ICONS.starFilled, ICONS.pickerStarFilled],
  sortAscending: [ICONS.sortUp, ICONS.sortUpRow],
  sortDescending: [ICONS.sortDown, ICONS.sortDownRow],
  chevronUp: [ICONS.chevronUp],
  chevronDown: [ICONS.chevronDown, ICONS.chevronDown18],
  chevronLeft: [ICONS.chevronLeft],
  chevronRight: [ICONS.chevronRight],
  // The drawing toolbar's arrow, pointing where the flyout it opens will stand.
  flyout: [ICONS.chevronRight16],
  submenu: [ICONS.submenuArrow],
  more: [ICONS.kebab],
  grip: [ICONS.grip],
  emptySearch: [SEARCH_EMPTY_MARK],
  emptyCompare: [COMPARE_EMPTY_MARK],
  // The symbol search's spread builder.
  operatorsShow: [ICONS.spreadOpsShow],
  operatorsHide: [ICONS.spreadOpsHide],
  operatorAdd: [OPERATOR_GLYPHS.addition],
  operatorSubtract: [OPERATOR_GLYPHS.subtraction],
  operatorMultiply: [OPERATOR_GLYPHS.multiplication],
  operatorDivide: [OPERATOR_GLYPHS.division],
  operatorPower: [OPERATOR_GLYPHS.exponentiation],
  operatorReciprocal: [OPERATOR_GLYPHS.reciprocal],
  // The replay transport.
  play: [ICONS.play],
  pause: [ICONS.pause],
  stepForward: [ICONS.stepForward],
  stepBack: [ICONS.stepBack],
  goLive: [ICONS.goLive],
  selectBar: [ICONS.selectBar],
  selectDate: [ICONS.calendar],
  firstAvailable: [ICONS.firstAvailable],
  randomBar: [ICONS.randomBar],
  // The replay date picker's fields: the date's mark, and the clock that lists the times.
  calendar: [ICONS.calendarDays],
  clock: [ICONS.clock],
  // The drawing toolbar, its menus, the favorites bar and the drawing settings.
  cursorCross: [ICONS.cursorCross],
  cursorDot: [ICONS.cursorDot],
  cursorArrow: [ICONS.cursorArrow],
  eraser: [ICONS.eraser],
  measure: [ICONS.ruler],
  zoomTool: [ICONS.zoomIn],
  magnet: [ICONS.magnet],
  magnetStrong: [ICONS.magnetStrong],
  stayInMode: [ICONS.pin],
  stayInModeOn: [ICONS.pinOn],
  locked: [ICONS.lockClosed],
  unlocked: [ICONS.lockOpen],
  drawingsShown: [ICONS.drawingsShown],
  drawingsHidden: [ICONS.drawingsHidden],
  indicatorsShown: [ICONS.indicatorsShown],
  indicatorsHidden: [ICONS.indicatorsHidden],
  allShown: [ICONS.allShown],
  allHidden: [ICONS.allHidden],
  hide: [ICONS.eyeCrossed],
  sync: [ICONS.sync],
  glyphTools: [ICONS.groupGlyphs],
  favoritesBar: [ICONS.favoritesBar],
  template: [ICONS.template],
  visualOrder: [ICONS.layers],
  tableAddColumn: [ICONS.tableAddColumn],
  tableAddRow: [ICONS.tableAddRow],
  lineColor: [ICONS.pencil16],
  fillColor: [ICONS.bucket],
  textColor: [ICONS.textTee],
  lineSolid: [ICONS.lineSolid],
  lineDashed: [ICONS.lineDashed],
  lineDotted: [ICONS.lineDotted],
  lineThickness1: [ICONS.lineThickness1],
  lineThickness2: [ICONS.lineThickness2],
  lineThickness3: [ICONS.lineThickness3],
  lineThickness4: [ICONS.lineThickness4],
  // Drawn for a line's left end; the right end wears the same drawing mirrored.
  lineEndNormal: [ICONS.lineEndNormal],
  lineEndArrow: [ICONS.lineEndArrow],
})

/** An icon of one of the chart's own controls. */
export type ControlIconId = keyof typeof CONTROL_ICONS

/** Every icon a host may draw: a control's glyph by its meaning, a chart style by its id, a drawing
 *  tool by its registry type, and a layout arrangement by its code. Exactly the ids in
 *  `CHART_ICON_IDS`, so an id the chart does not draw is a type error before it is a refusal. */
export type ChartIconId = ControlIconId | `style.${ChartStyleId}` | `tool.${MiniatureTool}` | `layout.${ArrangementGlyphCode}`

/** A host's drawings for the chart's icons, by id. An icon left out keeps the chart's own. */
export type ChartIcons = { readonly [K in ChartIconId]?: ChartIconFactory }

/** The glyphs the chart mirrors for a right-to-left language, whatever artwork they wear: a host
 *  draws the left-to-right form of these. */
export const MIRRORED_ICONS: ReadonlySet<ChartIconId> = new Set<ChartIconId>(['flyout'])

/** The tools and arrangements that wear a glyph, in their registries' orders. */
const MINIATURE_TOOLS = Object.keys(TOOL_ICONS) as MiniatureTool[]
const ARRANGEMENT_CODES = Object.keys(ARRANGEMENT_ICONS) as ArrangementGlyphCode[]

/** The miniature of each drawing tool and each layout arrangement, as a glyph, made once. */
const toolGlyphs = new Map<string, Glyph>(MINIATURE_TOOLS.map((type) => [type, { viewBox: '0 0 28 28', body: TOOL_ICONS[type] }]))
const arrangementGlyphs = new Map<string, Glyph>(ARRANGEMENT_CODES.map((code) => [code, { viewBox: ARRANGEMENT_ICONS[code].viewBox, body: ARRANGEMENT_ICONS[code].body }]))

/** A drawing tool's miniature as a glyph, or undefined for a type that draws none. */
export const toolGlyph = (type: string): Glyph | undefined => toolGlyphs.get(type)
/** A layout arrangement's glyph, or undefined for an unknown code. */
export const arrangementGlyphOf = (code: string): Glyph | undefined => arrangementGlyphs.get(code)

/** Every published icon id, in catalog order: the controls, then the styles, the tools and the
 *  layouts in their registries' orders. */
export const CHART_ICON_IDS: readonly ChartIconId[] = [
  ...(Object.keys(CONTROL_ICONS) as ControlIconId[]),
  ...CHART_STYLES.map((style) => `style.${style}` as const),
  ...MINIATURE_TOOLS.map((type) => `tool.${type}` as const),
  ...ARRANGEMENT_CODES.map((code) => `layout.${code}` as const),
]

const PUBLISHED = new Set<string>(CHART_ICON_IDS)

/** Which icon a glyph of the chart's own draws, or undefined for the one no host redraws. */
const ICON_OF = new WeakMap<Glyph, ChartIconId>()
for (const [id, glyphs] of Object.entries(CONTROL_ICONS)) for (const mark of glyphs) ICON_OF.set(mark, id as ControlIconId)
for (const style of CHART_STYLES) ICON_OF.set(STYLE_ICONS[style], `style.${style}`)
for (const type of MINIATURE_TOOLS) ICON_OF.set(toolGlyphs.get(type)!, `tool.${type}`)
for (const code of ARRANGEMENT_CODES) ICON_OF.set(arrangementGlyphs.get(code)!, `layout.${code}`)

/** The icon a glyph draws, when a host may draw it instead. */
export const iconOf = (mark: Glyph): ChartIconId | undefined => ICON_OF.get(mark)

/** The chart's own drawing of an icon, as markup a host draws without the chart: a toolbar of its
 *  own, a native view. */
export interface ChartIconArtwork {
  /** The grid the drawing is on. */
  viewBox: string
  /** The markup inside the svg, every ink on `currentColor`. */
  body: string
  /** The whole drawing as one standalone svg: the grid, no fill of its own (as the chart draws it),
   *  and the body. */
  svg: string
}

/** The drawings behind each id, as published glyphs. */
const GLYPHS_OF = new Map<string, readonly Glyph[]>([
  ...Object.entries(CONTROL_ICONS),
  ...CHART_STYLES.map((style): [string, readonly Glyph[]] => [`style.${style}`, [STYLE_ICONS[style]]]),
  ...MINIATURE_TOOLS.map((type): [string, readonly Glyph[]] => [`tool.${type}`, [toolGlyphs.get(type)!]]),
  ...ARRANGEMENT_CODES.map((code): [string, readonly Glyph[]] => [`layout.${code}`, [arrangementGlyphs.get(code)!]]),
])

/** A drawing that stands on its own: its inks are `currentColor` or its own, never a role of the
 *  chart's theme and never a class the chart's stylesheet switches. */
const standsAlone = (mark: Glyph): boolean => !/var\(--|class=/.test(mark.body)

/** Every drawing the chart paints for an icon, in the order its controls use them, each on its own
 *  grid, so a host picks the one whose grid suits its box (the drawing toolbar's are on a 28 grid).
 *  The chart's own artwork, whatever a host's `icons` draw instead. An icon the chart draws in its
 *  theme's roles, an illustration, answers none, and so does an id it does not draw. */
export function chartIconArtwork(id: ChartIconId): readonly ChartIconArtwork[] {
  const glyphs = GLYPHS_OF.get(id) ?? []
  if (!glyphs.every(standsAlone)) return []
  return glyphs.map((mark) => ({
    viewBox: mark.viewBox,
    body: mark.body,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}" fill="none">${mark.body}</svg>`,
  }))
}

/** Refuse a host's drawings the chart would otherwise read wrongly: an id nothing in the interface
 *  draws, or a drawing that is not a factory. A refused key is an error rather than something
 *  skipped, because a skipped key is artwork the host believes is standing and a viewer never sees. */
export function checkIcons(icons: unknown): void {
  if (icons === undefined) return
  if (typeof icons !== 'object' || icons === null || Array.isArray(icons)) throw new TypeError('icons must be an object')
  for (const [id, factory] of Object.entries(icons)) {
    if (!PUBLISHED.has(id)) throw new TypeError(`icons.${id} is not an icon the chart draws; CHART_ICON_IDS lists every one`)
    if (factory !== undefined && typeof factory !== 'function') throw new TypeError(`icons.${id} must be a function that draws the icon`)
  }
}
