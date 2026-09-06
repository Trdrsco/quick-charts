// The drawing toolbar's STRUCTURE, with no view attached.
//
// The toolbar is one button per tool GROUP; each group opens a flyout whose sections gather the
// related registry categories under a heading. Categories alone do not give that shape: the arrow
// marks belong beside the arrow line rather than with the annotations, the brushes lead the shapes,
// and the image and content cards sit under Content rather than with the glyph marks. Those moves
// are the product's, so they live here as data rather than as conditions inside a component.
//
// Everything is catalog KEYS, never words: the toolbar is built once from the registry while the
// headings it shows follow the interface language.
import type { ToolCategory } from '../internal/drawings/index'
import type { ChartMessageKey } from '../i18n/en'
import { drawingTools, type DrawingTool } from './tools'

/** One heading inside a group's flyout and the tools under it. */
export interface RailSection {
  label: ChartMessageKey
  tools: DrawingTool[]
}

/** One toolbar button: its stable id, its heading, and the sections its flyout shows. */
export interface RailGroup {
  id: string
  label: ChartMessageKey
  sections: RailSection[]
}

/** The arrow marks ride with the plain arrow line in the shapes group's Arrows section. */
export const ARROW_TYPES: readonly string[] = ['arrow_marker', 'arrow', 'arrow_up', 'arrow_down']
/** The brushes lead the shapes group rather than sitting among the geometric shapes. */
export const BRUSH_TYPES: readonly string[] = ['brush', 'highlighter']
/** The glyph marks get a group of their own. */
export const GLYPH_TYPES: readonly string[] = ['emoji', 'sticker', 'icon']
/** Image and content cards make a Content section under Text and notes. */
export const CARD_TYPES: readonly string[] = ['image', 'content_card']

/** A section built from whole categories, minus the types that moved elsewhere. */
interface CategorySection {
  label: ChartMessageKey
  category: ToolCategory
  exclude?: readonly string[]
}

/** A section built from an explicit list, in that order. */
interface TypeSection {
  label: ChartMessageKey
  types: readonly string[]
}

type SectionPlan = CategorySection | TypeSection

interface GroupPlan {
  id: string
  label: ChartMessageKey
  sections: readonly SectionPlan[]
}

/** The toolbar's seven groups and their sections, in display order. This is the product decision the
 *  registry cannot express: which categories share a button, and where the moved types land. */
export const RAIL_PLAN: readonly GroupPlan[] = [
  {
    id: 'trend',
    label: 'drawing.groupTrend',
    sections: [
      { label: 'drawing.sectionLines', category: 'lines', exclude: ['arrow'] },
      { label: 'drawing.sectionChannels', category: 'channels' },
      { label: 'drawing.sectionPitchforks', category: 'pitchforks' },
    ],
  },
  {
    id: 'fib-gann',
    label: 'drawing.groupFibGann',
    sections: [
      { label: 'drawing.sectionFibonacci', category: 'fibonacci' },
      { label: 'drawing.sectionGann', category: 'gann' },
    ],
  },
  {
    id: 'patterns',
    label: 'drawing.groupPatterns',
    sections: [
      { label: 'drawing.sectionChartPatterns', category: 'patterns' },
      { label: 'drawing.sectionElliott', category: 'elliott' },
      { label: 'drawing.sectionCycles', category: 'cycles' },
    ],
  },
  {
    id: 'forecast',
    label: 'drawing.groupForecast',
    sections: [
      { label: 'drawing.sectionForecasting', category: 'forecasting' },
      { label: 'drawing.sectionVolumeBased', category: 'volume' },
      // Measure is a transient tool on the toolbar's action row, not a placeable drawing in a flyout.
      { label: 'drawing.sectionMeasures', category: 'measurement', exclude: ['measure'] },
    ],
  },
  {
    id: 'shapes',
    label: 'drawing.shapes',
    sections: [
      { label: 'drawing.sectionBrushes', types: BRUSH_TYPES },
      { label: 'drawing.sectionArrows', types: ARROW_TYPES },
      { label: 'drawing.shapes', category: 'shapes', exclude: BRUSH_TYPES },
    ],
  },
  {
    id: 'annotation',
    label: 'drawing.textNotes',
    sections: [
      { label: 'drawing.textNotes', category: 'annotation', exclude: ARROW_TYPES },
      { label: 'drawing.sectionContent', types: CARD_TYPES },
    ],
  },
  {
    id: 'glyphs',
    label: 'drawing.groupGlyphs',
    sections: [{ label: 'drawing.sectionGlyphs', types: GLYPH_TYPES }],
  },
]

const isTypeSection = (section: SectionPlan): section is TypeSection => 'types' in section

/** Build the toolbar from the tool catalog. An empty section and a group left with none are dropped,
 *  so a catalog trimmed by configuration never shows a button that opens on nothing. */
export function buildRailGroups(catalog = drawingTools): RailGroup[] {
  const toolsOf = (section: SectionPlan): DrawingTool[] =>
    isTypeSection(section)
      ? section.types.map((type) => catalog.get(type)).filter((tool): tool is DrawingTool => !!tool)
      : catalog.byCategory(section.category).filter((tool) => !(section.exclude ?? []).includes(tool.type))

  return RAIL_PLAN.map((group) => ({
    id: group.id,
    label: group.label,
    sections: group.sections.map((section) => ({ label: section.label, tools: toolsOf(section) })).filter((section) => section.tools.length > 0),
  })).filter((group) => group.sections.length > 0)
}

/** Which group holds a tool, or null when no group shows it. The toolbar highlights that button while
 *  the tool is armed. */
export function groupOfTool(groups: readonly RailGroup[], type: string | null): string | null {
  if (!type) return null
  return groups.find((group) => group.sections.some((section) => section.tools.some((tool) => tool.type === type)))?.id ?? null
}

/** Each toolbar button wears its last-picked tool's glyph, so the toolbar keeps that face across
 *  reloads. This resolves the face: the remembered tool when the group still shows it, else the
 *  group's first tool, else null for a group whose tools carry no glyph. */
export function railFaceOf(group: RailGroup, lastTools: Readonly<Record<string, string>>): string | null {
  const remembered = lastTools[group.id]
  if (remembered && group.sections.some((section) => section.tools.some((tool) => tool.type === remembered))) return remembered
  return group.sections[0]?.tools[0]?.type ?? null
}

/** Remember the tool a group was last used to arm. Returns a NEW record, so a caller stores the
 *  result rather than mutating what it was handed. A tool no group shows changes nothing. */
export function rememberRailTool(
  groups: readonly RailGroup[],
  lastTools: Readonly<Record<string, string>>,
  type: string,
): Record<string, string> {
  const group = groupOfTool(groups, type)
  if (!group) return { ...lastTools }
  return { ...lastTools, [group]: type }
}
