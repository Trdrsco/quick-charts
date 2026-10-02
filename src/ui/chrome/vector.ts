// One builder for every glyph the level menu draws, the chart's own and a host's, from the SAME
// descriptor: shapes on a 28-unit grid, each one path data plus a closed set of paint values. There
// is no second icon contract and no markup path. Nodes are CREATED and attributes are written by
// name from the allowlists below, so a descriptor has nowhere to carry a script, an event handler,
// a colour, a URL or an attribute nobody named, however it is written.
//
// The bounds exist because a menu raise builds a glyph per row while the viewer waits, and because
// turning a payload away has to cost less than drawing it would. A descriptor outside them draws
// nothing and the row still paints.
//
// `glyph()` in dom.ts is the chrome's other drawing helper and not this one's twin: it takes a
// package-authored body for the package's own controls, where no value a caller wrote ever reaches
// it. This builder serves the one surface a host can write into, so it takes a descriptor and never
// a string of markup.
import type { ChartExtensionIcon, ChartExtensionIconPath } from '../../extension'

/** The grid a descriptor is drawn on, and the box the menu gives it. */
const GRID = 28

/** What a glyph may be. The longest shape the chart draws is 440 characters of path data and its
 *  most detailed glyph is two shapes, so these leave a contributor several times that room while
 *  keeping one raise's work small and bounded. A stroke wider than 8 of the grid's 28 units fills
 *  the cell instead of outlining a shape. */
export const GLYPH_LIMITS = {
  /** Shapes in one glyph. */
  shapes: 8,
  /** Characters of path data in one shape. */
  pathData: 2048,
  /** Stroke width, in grid units, of an outlined shape. */
  strokeWidth: 8,
} as const

/** Every attribute this module writes, by element. `setAttribute` is called in exactly one place
 *  below and reads these first, so an attribute name can only ever be one of these constants. */
export const GLYPH_ATTRIBUTES = {
  svg: ['aria-hidden', 'fill', 'height', 'viewBox', 'width'],
  path: ['d', 'fill', 'fill-rule', 'stroke', 'stroke-width'],
} as const

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Path data and nothing else: the commands, their numbers, and the separators between them. A
 *  value carrying a quote, an angle bracket, a colon or a parenthesis is not path data, so it is
 *  refused rather than sanitised. */
const PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9eE,.\-+\s]+$/

/** Every number inside path data, so each one can be held to being finite: the character set above
 *  accepts an exponent, and `1e999` is an overflow rather than a coordinate. */
const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g

/** The one write. A name the element's list does not carry is not written at all. */
const set = (node: Element, allowed: readonly string[], name: string, value: string): void => {
  if (allowed.includes(name)) node.setAttribute(name, value)
}

/** Whether one shape can be drawn: path data of a bounded length, every number in it finite, and
 *  each paint value one this contract names. Anything else is dropped, so a mistake in one shape of
 *  a drawing costs that shape rather than the rest of it. */
const drawable = (shape: ChartExtensionIconPath | undefined): boolean => {
  if (!shape) return false
  const { d, paint, rule, width } = shape
  if (typeof d !== 'string' || d.length === 0 || d.length > GLYPH_LIMITS.pathData) return false
  if (!PATH_DATA.test(d)) return false
  for (const token of d.match(NUMBER) ?? []) if (!Number.isFinite(Number(token))) return false
  if (paint !== undefined && paint !== 'solid' && paint !== 'outline') return false
  if (rule !== undefined && rule !== 'nonzero' && rule !== 'evenodd') return false
  return width === undefined || (Number.isFinite(width) && width > 0 && width <= GLYPH_LIMITS.strokeWidth)
}

/** The glyph a descriptor asks for, or null where there is nothing to draw. Null is the whole
 *  failure mode: the caller leaves its glyph cell empty, which is what a row with no icon at all
 *  already looks like. */
export function buildGlyph(icon: ChartExtensionIcon | undefined): SVGSVGElement | null {
  try {
    const paths = icon && Array.isArray(icon.paths) ? icon.paths : []
    // Refused before a single shape is read: more shapes than a glyph can hold is not a drawing,
    // and this is the branch that has to stay free.
    if (paths.length === 0 || paths.length > GLYPH_LIMITS.shapes) return null
    const shapes = paths.filter(drawable)
    if (shapes.length === 0) return null

    const root = document.createElementNS(SVG_NS, 'svg')
    set(root, GLYPH_ATTRIBUTES.svg, 'width', String(GRID))
    set(root, GLYPH_ATTRIBUTES.svg, 'height', String(GRID))
    set(root, GLYPH_ATTRIBUTES.svg, 'viewBox', `0 0 ${GRID} ${GRID}`)
    set(root, GLYPH_ATTRIBUTES.svg, 'fill', 'none')
    // The glyph is decoration: the control it sits in carries the accessible name, and a screen
    // reader reads that name rather than announcing a drawing.
    set(root, GLYPH_ATTRIBUTES.svg, 'aria-hidden', 'true')

    for (const shape of shapes) {
      const path = document.createElementNS(SVG_NS, 'path')
      set(path, GLYPH_ATTRIBUTES.path, 'd', shape.d)
      // `currentColor` and nothing else: the glyph takes the ink of the row it sits in, so it
      // reads correctly in every theme and no descriptor can name a colour of its own.
      if (shape.paint === 'outline') {
        set(path, GLYPH_ATTRIBUTES.path, 'fill', 'none')
        set(path, GLYPH_ATTRIBUTES.path, 'stroke', 'currentColor')
        set(path, GLYPH_ATTRIBUTES.path, 'stroke-width', String(shape.width ?? 1))
      } else {
        set(path, GLYPH_ATTRIBUTES.path, 'fill', 'currentColor')
      }
      if (shape.rule) set(path, GLYPH_ATTRIBUTES.path, 'fill-rule', shape.rule)
      root.append(path)
    }
    return root
  } catch {
    // A descriptor that cannot be read at all, because reading it throws, draws nothing. The row
    // still paints and the menu still opens.
    return null
  }
}
