// The layout menu's arrangement glyphs, keyed by the arrangement codes of the ARRANGEMENTS catalog
// and drawn from each arrangement's own panes. A glyph is a rounded frame one unit thick on the 21 by
// 19 grid, with a one-unit wall wherever two panes meet: each pane is a hollow cut out of the frame's
// face, set on the whole units nearest its share of the frame. Panes that would stand less than two
// units across share one hollow instead, with its first walls at a three-unit pitch, each fainter
// than the last, so that part of the glyph reads as many panes rather than counting them. The table
// is built once from package-authored geometry, which is what makes the innerHTML write safe.
import { ARRANGEMENTS, type PaneRect } from '../../layoutGrid'
import { box, roundedBox } from '../controls/glyphGeometry'

export interface ArrangementIcon { viewBox: string; body: string }

/** The frame's outer box on the grid, and the corner radius of its outer edge. */
const WIDTH = 19
const HEIGHT = 17
const RADIUS = 2.5

/** The opacities of a shared hollow's fading walls, from the first to the last. */
const FADE = [1, 0.7, 0.45, 0.22, 0.08]

/** The unit a wall `t` of the way across a span stands on: the whole unit nearest its share, a half
 *  going away from the middle so a glyph stays symmetrical. */
function wallAt(t: number, span: number): number {
  const exact = t * (span - 1)
  const whole = Math.floor(exact)
  if (Math.abs(exact - whole - 0.5) > 1e-9) return Math.round(exact)
  return t < 0.5 ? whole : whole + 1
}

/** The hollow a pane leaves in the frame's face, its corners rounded where they meet the frame's. */
function hollow(pane: PaneRect): { x0: number; y0: number; x1: number; y1: number; radii: number[] } {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9
  const right = pane.x + pane.w
  const bottom = pane.y + pane.h
  const inner = RADIUS - 1
  return {
    x0: wallAt(pane.x, WIDTH) + 1,
    y0: wallAt(pane.y, HEIGHT) + 1,
    x1: wallAt(right, WIDTH),
    y1: wallAt(bottom, HEIGHT),
    radii: [
      near(pane.x, 0) && near(pane.y, 0) ? inner : 0,
      near(right, 1) && near(pane.y, 0) ? inner : 0,
      near(right, 1) && near(bottom, 1) ? inner : 0,
      near(pane.x, 0) && near(bottom, 1) ? inner : 0,
    ],
  }
}

const solidPath = (d: string, opacity = 1): string => `<path fill="currentColor"${opacity < 1 ? ` opacity="${opacity}"` : ''} d="${d}"/>`

type Hollow = ReturnType<typeof hollow>

/** Panes too small to draw one by one, merged into the one hollow they share: a column stacked with
 *  any pane less than two units tall, or a band run with any pane less than two units wide, is drawn
 *  whole. Each merged hollow keeps the direction its walls run in, for the fading walls drawn across
 *  it. */
function merged(holes: readonly Hollow[]): { holes: Hollow[]; dense: { hole: Hollow; across: 'rows' | 'columns' }[] } {
  const column = (h: Hollow): string => `r${h.x0}:${h.x1}`
  const band = (h: Hollow): string => `c${h.y0}:${h.y1}`
  const shortColumns = new Set(holes.filter((h) => h.y1 - h.y0 < 2).map(column))
  const narrowBands = new Set(holes.filter((h) => h.x1 - h.x0 < 2).map(band))
  const kept: Hollow[] = []
  const groups = new Map<string, { hole: Hollow; across: 'rows' | 'columns' }>()
  for (const h of holes) {
    const across = shortColumns.has(column(h)) ? 'rows' : narrowBands.has(band(h)) ? 'columns' : null
    if (!across) {
      kept.push(h)
      continue
    }
    const key = across === 'rows' ? column(h) : band(h)
    const group = groups.get(key)
    if (!group) {
      groups.set(key, { hole: { ...h, radii: [...h.radii] }, across })
      continue
    }
    const g = group.hole
    g.x0 = Math.min(g.x0, h.x0)
    g.y0 = Math.min(g.y0, h.y0)
    g.x1 = Math.max(g.x1, h.x1)
    g.y1 = Math.max(g.y1, h.y1)
    g.radii = g.radii.map((r, i) => Math.max(r, h.radii[i]!))
  }
  const dense = [...groups.values()]
  return { holes: [...kept, ...dense.map((d) => d.hole)], dense }
}

/** An arrangement's glyph from its panes. */
function drawn(code: string): ArrangementIcon {
  const panes = ARRANGEMENTS.find((a) => a.code === code)!.rects
  const { holes, dense } = merged(panes.map(hollow))
  let body = solidPath(roundedBox(0, 0, WIDTH, HEIGHT, RADIUS) + holes.map((h) => roundedBox(h.x0, h.y0, h.x1, h.y1, h.radii, true)).join(''))
  // A merged hollow wears its first walls at a three-unit pitch, each fainter than the last.
  for (const { hole, across } of dense) {
    FADE.forEach((opacity, i) => {
      const at = (across === 'rows' ? hole.y0 : hole.x0) + 2 + 3 * i
      if (at + 1 > (across === 'rows' ? hole.y1 : hole.x1) - 1) return
      body += solidPath(across === 'rows' ? box(hole.x0, at, hole.x1, at + 1) : box(at, hole.y0, at + 1, hole.y1), opacity)
    })
  }
  return { viewBox: '-1 -1 21 19', body }
}

export const ARRANGEMENT_ICONS = {
  's': drawn('s'),
  '2h': drawn('2h'),
  '2v': drawn('2v'),
  '3h': drawn('3h'),
  '3v': drawn('3v'),
  '3s': drawn('3s'),
  '3r': drawn('3r'),
  '2-1': drawn('2-1'),
  '1-2': drawn('1-2'),
  '4': drawn('4'),
  '4v': drawn('4v'),
  '4h': drawn('4h'),
  '4s': drawn('4s'),
  '4s-l': drawn('4s-l'),
  '1-3': drawn('1-3'),
  '3-1': drawn('3-1'),
  '2-2-l': drawn('2-2-l'),
  '2-2-r': drawn('2-2-r'),
  '2-2': drawn('2-2'),
  '1-4': drawn('1-4'),
  '5h': drawn('5h'),
  '5v': drawn('5v'),
  '5s': drawn('5s'),
  '5s-l': drawn('5s-l'),
  '2-3': drawn('2-3'),
  '3-2': drawn('3-2'),
  '4-1': drawn('4-1'),
  '2-3-l': drawn('2-3-l'),
  '2-3-r': drawn('2-3-r'),
  '6': drawn('6'),
  '6h': drawn('6h'),
  '6v': drawn('6v'),
  '6c': drawn('6c'),
  '2-4': drawn('2-4'),
  '4-2': drawn('4-2'),
  '4-3': drawn('4-3'),
  '7h': drawn('7h'),
  '7s': drawn('7s'),
  '8': drawn('8'),
  '8c': drawn('8c'),
  '8h': drawn('8h'),
  '8v': drawn('8v'),
  '9s': drawn('9s'),
  '5-4': drawn('5-4'),
  '9h': drawn('9h'),
  '9v': drawn('9v'),
  '10c5': drawn('10c5'),
  '10h': drawn('10h'),
  '10v': drawn('10v'),
  '12c6': drawn('12c6'),
  '12c4': drawn('12c4'),
  '12h': drawn('12h'),
  '14c7': drawn('14c7'),
  '16c8': drawn('16c8'),
  '16c4': drawn('16c4'),
} satisfies Readonly<Record<string, ArrangementIcon>>

/** A layout arrangement that wears a glyph, by its code. */
export type ArrangementGlyphCode = keyof typeof ARRANGEMENT_ICONS
