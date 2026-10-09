// Every glyph the chart's own surfaces wear: the top bar, the legend, the dialogs, the drawing
// toolbar and its bars. Inline SVG markup in `currentColor`, so a recipe's ink is the glyph's ink
// and the package ships no asset and fetches nothing. The drawings are built from lines, arcs,
// circles and walled outlines on their grids (`glyphGeometry`), once, when the module loads. Each
// glyph carries the grid it was drawn on, so a surface names the glyph and its size and never a
// viewBox. One object drawn for two optical sizes is two glyphs: the bare name is the common one and
// its twin carries its grid (`trash` on 18 is every row's, `trash28` is the drawing toolbar's face).
// The tool miniatures live in the drawings' `toolIcons`, the layout arrangements in the chrome's
// `arrangementGlyphs`.

import { arc, bend, box, disc, frame, inset, line, onCircle, polygon, polyline, ring, roundedBox, roundedPolygon, solid, wall, type Point } from './glyphGeometry'

/** One glyph: its own grid and the inner markup drawn on it. */
export interface Glyph {
  viewBox: string
  body: string
  /** A glyph that is not square keeps its grid's proportion: the size is its HEIGHT and the width
   *  follows this ratio. Square glyphs omit it. */
  aspect?: number
  /** The height the glyph is drawn at when a caller names none. Glyphs drawn at 28 omit it. */
  size?: number
}

const stroke = (d: string, width = 1.5): string => `<path d="${d}" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`

/** One candle: a body walled one unit thick with its corners eased, and a wick above and below. */
const candle = (x: number, top: number, y0: number, y1: number, bottom: number, width: number): string =>
  solid(frame(x, y0, x + width, y1, 0.5), 'evenodd') + solid(box(x + (width - 1) / 2, top, x + (width + 1) / 2, y0) + box(x + (width - 1) / 2, y1, x + (width + 1) / 2, bottom))

/** A bar of the bars style: the stem, the open's tick to its left and the close's to its right. */
const ohlcBar = (x: number, y0: number, y1: number, open: number, close: number): string =>
  box(x, y0, x + 1, y1) + box(x - 3, open, x, open + 1) + box(x + 1, close, x + 4, close + 1)

/** The line both the line and the area marks trace, a unit wide. */
const LINE_STYLE_POINTS: readonly Point[] = [[3, 21], [10.5, 12], [16.5, 17.5], [25, 7]]
const AREA_STYLE_POINTS: readonly Point[] = [[2, 18], [10.5, 9.5], [15.5, 14.5], [25, 5]]

/** The area mark's ground: every other one-unit cell under its line, a cell and a half clear of it
 *  and down to the floor of the mark, so the ground reads as a half tone. */
function areaGround(points: readonly Point[], floor: number): string {
  const lineY = (x: number): number => {
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1]!
      const [x1, y1] = points[i]!
      if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
    return points[points.length - 1]![1]
  }
  let cells = ''
  for (let x = points[0]![0]; x < points[points.length - 1]![0]; x++) {
    const clear = Math.max(lineY(x), lineY(x + 1)) + 1.4
    for (let y = floor - 1; y >= clear; y--) if ((x + y) % 2 === 1) cells += box(x, y, x + 1, y + 1)
  }
  return cells
}

/** The baseline mark's line: a zigzag broken where it would cross the dotted base. */
function brokenAt(points: readonly Point[], top: number, bottom: number): string {
  const runs: Point[][] = []
  let run: Point[] = []
  points.forEach((p, index) => {
    const q = points[index - 1]
    if (q) {
      // Where this leg crosses the band's edges, in order along it: the first crossing out of a run
      // ends it, and the next one back out starts the next.
      const crossings = [top, bottom].map((edge) => (edge - q[1]) / (p[1] - q[1])).filter((t) => t > 0 && t < 1).sort((a, b) => a - b)
      for (const t of crossings) {
        const at: Point = [q[0] + t * (p[0] - q[0]), q[1] + t * (p[1] - q[1])]
        if (run.length) {
          runs.push([...run, at])
          run = []
        } else run = [at]
      }
    }
    if (p[1] <= top || p[1] >= bottom) run.push(p)
  })
  if (run.length > 1) runs.push(run)
  return runs.filter((piece) => piece.length > 1).map((piece) => polyline(piece, 1)).join('')
}

/** The main-series styles, in CHART_STYLES order, each drawn as filled outlines: a bar mark reads
 *  as the thing it names at any size, where a stroked outline of one thins out as it scales. The
 *  candle bodies carry the even-odd rule their hollow middles need. */
export const STYLE_ICONS = {
  // Two candles, the left one taller and lower.
  candles: { viewBox: '0 0 28 28', body: candle(16, 7, 10, 18, 21, 5) + candle(8, 4, 7, 21, 24, 5) },
  // The same two candles with the left one's body filled, a hair inside its wall.
  hollow: { viewBox: '0 0 28 28', body: candle(16, 7, 10, 18, 21, 5) + candle(8, 4, 7, 21, 24, 5) + solid(box(9.5, 8.5, 11.5, 19.5)) },
  bars: { viewBox: '0 0 28 28', body: solid(ohlcBar(18, 6, 22, 13, 18) + ohlcBar(10, 7, 23, 20, 9)) },
  line: { viewBox: '0 0 28 28', body: solid(polyline(LINE_STYLE_POINTS, 1)) },
  area: { viewBox: '0 0 28 28', body: solid(polyline(AREA_STYLE_POINTS, 1) + areaGround(AREA_STYLE_POINTS, 22)) },
  // A zigzag over a dotted base, broken where it crosses, so each half reads against the base.
  baseline: {
    viewBox: '0 0 28 28',
    body: solid(brokenAt([[3, 21], [10.5, 8.5], [17.5, 19.5], [25, 8]], 12, 17) + Array.from({ length: 12 }, (_, i) => box(3 + i * 2, 14, 4 + i * 2, 15)).join('')),
  },
  stepline: { viewBox: '0 0 28 28', body: solid(polyline([[5, 23.5], [9.5, 23.5], [9.5, 11.5], [14.5, 11.5], [14.5, 18.5], [19.5, 18.5], [19.5, 5.5], [24, 5.5]], 1)) },
} as const satisfies Record<string, Glyph>

/** The settings nut on the 28 grid: a hexagon stretched across the grid, walled one unit thick, and
 *  the ring in its middle. The context menu's settings row draws the same two shapes. */
const SETTINGS_NUT: readonly Point[] = [[8.5, 5], [19.5, 5], [24.5, 14], [19.5, 23], [8.5, 23], [3.5, 14]]
export const NUT_PATH = wall(SETTINGS_NUT, 0, 0)
export const NUT_RING_PATH = ring(14, 14, 4)

/** The check on the 28 grid, a line and a half wide: a short stroke down into the corner and a
 *  long one up out of it. The context menu's checked rows draw the same one. */
export const CHECK_PATH = polyline([[6.5, 14.2], [11, 18.9], [21.5, 8.5]], 1.5)

/** Four corner brackets, one at each corner of the box their arcs turn round: each a quarter circle
 *  of `radius` along its middle, with a straight run `run` long leaving each end, one unit wide. */
function cornerBrackets(x0: number, y0: number, x1: number, y1: number, radius: number, run: number): string {
  return [
    arc(x0, y0, radius, 180, 270) + line([x0, y0 - radius], [x0 + run, y0 - radius]) + line([x0 - radius, y0], [x0 - radius, y0 + run]),
    arc(x1, y0, radius, 270, 360) + line([x1 - run, y0 - radius], [x1, y0 - radius]) + line([x1 + radius, y0], [x1 + radius, y0 + run]),
    arc(x1, y1, radius, 0, 90) + line([x1 + radius, y1 - run], [x1 + radius, y1]) + line([x1, y1 + radius], [x1 - run, y1 + radius]),
    arc(x0, y1, radius, 90, 180) + line([x0, y1 + radius], [x0 + run, y1 + radius]) + line([x0 - radius, y1], [x0 - radius, y1 - run]),
  ].join('')
}

/** The points round a circle, clockwise from the right: a closed run for a shape that is cut. */
const circlePoints = (cx: number, cy: number, r: number, steps = 40): Point[] =>
  Array.from({ length: steps }, (_, i) => onCircle(cx, cy, r, (360 * i) / steps))

/** An eye's outline: an almond `2 * w` wide and `2 * h` tall about its centre, fuller in the middle
 *  than an ellipse and drawn in to a point at each corner, as a closed run of points. */
function almond(cx: number, cy: number, w: number, h: number, steps = 48): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (2 * Math.PI * i) / steps
    const s = Math.sin(t)
    return [cx + w * Math.cos(t), cy + h * Math.sign(s) * Math.abs(s) ** 1.7] as Point
  })
}

/** An eye's shapes: the almond walled `wall` thick at its corners and one unit at its top and
 *  bottom, and the pupil a ring a unit wide. */
interface EyeShape {
  outer: Point[]
  inner: Point[]
  pupil: Point[]
  pupilHole: Point[]
}

const eye = (cx: number, cy: number, w: number, h: number, wall: number, pupil: number): EyeShape => ({
  outer: almond(cx, cy, w, h),
  inner: almond(cx, cy, w - wall, h - 1),
  pupil: circlePoints(cx, cy, pupil),
  pupilHole: circlePoints(cx, cy, pupil - 1),
})

const drawEye = (shape: EyeShape): string => polygon(shape.outer) + polygon(shape.inner, true) + polygon(shape.pupil) + polygon(shape.pupilHole, true)

/** The part of a closed run of points on the side of a line where `nx * x + ny * y >= d`. */
function keepSide(points: readonly Point[], nx: number, ny: number, d: number): Point[] {
  const side = ([x, y]: Point): number => nx * x + ny * y - d
  const kept: Point[] = []
  points.forEach((p, index) => {
    const q = points[(index + 1) % points.length]!
    const sp = side(p)
    const sq = side(q)
    if (sp >= 0) kept.push(p)
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq)
      kept.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  })
  return kept
}

/** An eye struck through from its upper right to its lower left: the eye cut away two units either
 *  side of the strike's middle, and the strike a unit wide reaching `reach` out from the centre
 *  along the diagonal. */
function struckEye(shape: EyeShape, cx: number, cy: number, reach: number): string {
  const n = Math.SQRT1_2
  const middle = n * (cx + cy)
  const parts: string[] = []
  for (const [contour, hole] of [[shape.outer, false], [shape.inner, true], [shape.pupil, false], [shape.pupilHole, true]] as const) {
    for (const [sign, d] of [[1, middle + 2], [-1, 2 - middle]] as const) {
      const kept = keepSide(contour, sign * n, sign * n, d)
      if (kept.length > 2) parts.push(polygon(kept, hole))
    }
  }
  return parts.join('') + line([cx + reach, cy - reach], [cx - reach, cy + reach])
}

/** The drawings badge: a small brush, its round head drawn out to a point at the lower left and its
 *  handle running off up and to the right. */
const BRUSH_BADGE =
  wall([[14.6, 25.4], [16.4, 21.2], [17.4, 20.3], [18.6, 20], [19.8, 20.3], [20.7, 21.2], [21, 22.4], [20.7, 23.6], [19.8, 24.5], [18.6, 25.4]], [0.6, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0) +
  line([20.2, 20.1], [24, 16.3], 1, 'round')

/** An X, its four arms `width` wide reaching `reach` out from its centre to their square ends, as
 *  one outline. */
function cross(cx: number, cy: number, reach: number, width: number, hole = false): string {
  const arm = reach / Math.SQRT2
  const k = width / 2 / Math.SQRT2
  const at = (x: number, y: number): Point => [cx + x, cy + y]
  return polygon(
    [
      at(-arm - k, -arm + k), at(-arm + k, -arm - k), at(0, -2 * k), at(arm - k, -arm - k), at(arm + k, -arm + k), at(2 * k, 0),
      at(arm + k, arm - k), at(arm - k, arm + k), at(0, 2 * k), at(-arm + k, arm + k), at(-arm - k, arm - k), at(-2 * k, 0),
    ],
    hole,
  )
}

/** The indicators badge: an f with its two hooks and its bar, and a small X beside its foot. */
const FX_BADGE = arc(21, 18, 1.5, 180, 360) + line([19.5, 18], [19.5, 23]) + arc(18, 23, 1.5, 0, 180) + box(18, 20, 21, 21) + cross(23.5, 23.5, 2.12, 1)

/** The eyes the visibility marks wear: a small one high and left of centre, with room for a badge
 *  under it, the same one in the middle, a large one in the middle, and the legend's own. */
const SMALL_EYE = eye(13, 10, 9.55, 7.06, 1.1, 3.6)
const SMALL_EYE_CENTRED = eye(14, 14, 9.55, 7.06, 1.1, 3.6)
const LARGE_EYE = eye(14, 14, 10.55, 8, 1.1, 4)
const LEGEND_EYE = eye(9, 9.5, 7.95, 5.5, 1.45, 2.5)

/** A pencil lying corner to corner with its point at `tip` and its butt `length` up and to the
 *  right along the diagonal: a band `2 * half` wide walled one unit thick, a square point, a wall
 *  across a short way up from the point, and a ferrule wall under the butt, whose corners are
 *  rounded to `end`. */
function pencil(tip: Point, length: number, half: number, end: number): string {
  const at = (u: number, v: number): Point => [tip[0] + (u + v) / Math.SQRT2, tip[1] + (v - u) / Math.SQRT2]
  const inner = half - 1
  const point = half + 1.1
  const ferrule = length - 3.8
  return (
    roundedPolygon([at(0, 0), at(half, half), at(length, half), at(length, -half), at(half, -half)], [0, 0, end, end, 0]) +
    polygon([at(Math.SQRT2, 0), at(Math.SQRT2 + inner, inner), at(point, inner), at(point, -inner), at(Math.SQRT2 + inner, -inner)], true) +
    polygon([at(point + 1, inner), at(ferrule, inner), at(ferrule, -inner), at(point + 1, -inner)], true) +
    roundedPolygon([at(ferrule + 1, inner), at(length - 1, inner), at(length - 1, -inner), at(ferrule + 1, -inner)], [0, end - 1, end - 1, 0], true)
  )
}

/** A small padlock in the lower right corner: its body walled one unit thick, its keyhole, and its
 *  shackle, the shackle's right leg run down into the body when it is locked. */
const cornerLock = (locked: boolean): string =>
  frame(15, 18, 24, 25, 1.5) + box(19, 21, 20, 23) + arc(19.5, 15.5, 2, 180, 360) + line([17.5, 15.5], [17.5, 18]) + line([21.5, 15.5], [21.5, locked ? 18 : 16])

/** A padlock: its body walled one unit thick, a keyhole slot in it, and its shackle over it, the
 *  shackle's right leg run down into the body when it is locked. */
const padlock = (locked: boolean): string =>
  frame(6, 12, 22, 24, 2.5) + roundedBox(13, 16, 15, 20, 1) + arc(14, 9, 3.5, 180, 360) + line([10.5, 9], [10.5, 12]) + (locked ? line([17.5, 9], [17.5, 12]) : '')

/** A bin: a lid bar, a handle standing over it, and a body whose walls lean in to a foot with
 *  rounded corners, every wall a unit thick. The body is given from the lid's top, so the hollow
 *  inside it opens under the lid. */
function bin(lid: [number, number, number], handle: [number, number, number, number], body: readonly Point[]): string {
  const [x0, x1, y] = lid
  const [hx0, hx1, hy, r] = handle
  return box(x0, y, x1, y + 1) + roundedBox(hx0, hy, hx1, y + 0.5, [r, r, 0, 0]) + roundedBox(hx0 + 1, hy + 1, hx1 - 1, y, [r - 1, r - 1, 0, 0], true) + wall(body, [0, 0, 1.5, 1.5], [0, 0, 0.5, 0.5])
}

/** A horseshoe's outline: an arch of radius `r` round (cx, cy) whose legs, `leg` wide, run down to
 *  `foot`, as a closed run of points. */
function horseshoe(cx: number, cy: number, r: number, leg: number, foot: number): Point[] {
  const over = Array.from({ length: 25 }, (_, i) => onCircle(cx, cy, r, 180 + (180 * i) / 24))
  const under = Array.from({ length: 25 }, (_, i) => onCircle(cx, cy, r - leg, 360 - (180 * i) / 24))
  return [[cx - r, foot], ...over, [cx + r, foot], [cx + r - leg, foot], ...under, [cx - r + leg, foot]]
}

/** One half of a chain link: a half circle of `radius` along its middle round `c`, open toward
 *  `toward`, its two legs running `leg` on toward that side, a unit wide. */
function linkHalf(c: Point, toward: Point, radius: number, leg: number): string {
  const facing = (Math.atan2(toward[1], toward[0]) * 180) / Math.PI
  const side: Point = [-toward[1] * radius, toward[0] * radius]
  const ends: Point[] = [[c[0] + side[0], c[1] + side[1]], [c[0] - side[0], c[1] - side[1]]]
  return arc(c[0], c[1], radius, facing + 90, facing + 270) + ends.map((e) => line(e, [e[0] + toward[0] * leg, e[1] + toward[1] * leg])).join('')
}

/** A five-pointed star's ten corners, its points `outer` from its centre and its notches `inner`. */
const starPoints = (cx: number, cy: number, outer: number, inner: number): Point[] =>
  Array.from({ length: 10 }, (_, i) => onCircle(cx, cy, i % 2 ? inner : outer, -90 + 36 * i))

/** The operator strip's card on the 18 grid: a rounded card walled one unit thick and open along its
 *  left edge, holding a minus, a times, a plus and an equals. */
const OPERATOR_CARD =
  bend([[3.5, 4], [3.5, 2.5], [16.5, 2.5], [16.5, 15.5], [3.5, 15.5], [3.5, 14]], 1.5) +
  box(6, 6, 9, 7) + cross(12.5, 6.5, 1.63, 1.13) + box(7, 10, 8, 13) + box(6, 11, 9, 12) + box(11, 10, 14, 11) + box(11, 12, 14, 13)

/** A folder walled one unit thick, its tab raised at the left of its top edge and a wall across it
 *  under the tab's height. */
const FOLDER = ((): string => {
  const outline: Point[] = [[5, 6], [10.7, 6], [12.7, 8], [23, 8], [23, 21], [5, 21]]
  const [a, b, c, d] = inset(outline, 1)
  return roundedPolygon(outline, [1.5, 0, 0, 1.5, 1.5, 1.5]) + roundedPolygon([a!, b!, c!, d!, [22, 11], [6, 11]], [0.5, 0, 0, 0.5, 0, 0], true) + roundedBox(6, 12, 22, 20, [0, 0, 0.5, 0.5], true)
})()

/** The sort marks' three bars, each shorter than the one above it. */
const SORT_BARS = box(10, 5, 16, 6) + box(10, 9, 15, 10) + box(10, 13, 14, 14)

/** Two sheets as a one-unit line, for the copy and duplicate rows: a rounded square in front, and
 *  the one behind it showing only where the front one leaves it. */
const FRONT_SHEET = roundedBox(9.5, 5.5, 22.5, 18.5, 1)
const BACK_SHEET = 'M18.5 20V21.5A1 1 0 0 1 17.5 22.5H6.5A1 1 0 0 1 5.5 21.5V10.5A1 1 0 0 1 6.5 9.5H8'

/** The measure tool's ruler, drawn level and turned an eighth of the way round by its path: a long
 *  rounded bar walled one unit thick with ticks hanging from its top edge, every other one longer. */
const RULER = frame(0.5, 9.75, 27.5, 18.25, 1.5) + [5, 13.5, 22].map((x) => box(x, 10.75, x + 1, 13.25)).join('') + [9.25, 17.75].map((x) => box(x, 10.75, x + 1, 14.65)).join('')

/** The visual order mark's top layer: a square seen corner on, flattened to a diamond. */
const LAYER: Point[] = [[14, 6], [24, 11.7], [14, 17.3], [4, 11.7]]

/** The first available date's flag: a banner flying from the pole, its top and bottom edges one wave
 *  eight units apart, walled one unit thick. */
function flagBanner(): string {
  const wave = (t: number): Point => {
    const s = 1 - t
    const bez = (a: number, b: number, c: number, d: number): number => s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d
    return [bez(8, 11.5, 17, 21), bez(5, 1.8, 7.4, 4)]
  }
  const top = Array.from({ length: 17 }, (_, i) => wave(i / 16))
  const bottom = top.map(([x, y]) => [x, y + 8] as Point).reverse()
  return wall([...top, ...bottom], 0, 0)
}

export const ICONS = {
  legendEye: { viewBox: '0 0 18 18', body: solid(drawEye(LEGEND_EYE)) },
  legendEyeOff: { viewBox: '0 0 18 18', body: solid(drawEye(LEGEND_EYE)) + '<path stroke="currentColor" stroke-linecap="round" d="M3.5 2.5 14.5 16.5"/>' },
  legendSettings: { viewBox: '0 0 18 18', body: solid(wall([[2, 9], [4.73, 3], [13.27, 3], [16, 9], [13.27, 15], [4.73, 15]], 0, 0) + ring(9, 9, 2.5)) },
  // THE trash, on the 18 grid every row control that carries one uses: the legend's compare rows,
  // the saved-layout rows and the timeframe list's custom rows.
  trash: { viewBox: '0 0 18 18', body: solid(bin([3, 15, 5], [6, 12, 3, 1.5], [[3.939, 5], [14.061, 5], [12.953, 15], [5.047, 15]])) },
  legendChevron: { viewBox: '0 0 15 15', body: solid(polyline([[4, 6], [7.5, 9], [11, 6]], 1.3, { cap: 'round' })) },
  paneCollapse: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3 4.5h12M3 13.5h12M9 6.5v-2M7.5 6l1.5 1.5L10.5 6M9 11.5v2M7.5 12l1.5-1.5L10.5 12\" />" },
  paneRestore: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3 4.5h12M3 13.5h12M9 5v3M7.5 7.5L9 9l1.5-1.5M9 13v-3M7.5 10.5L9 9l1.5 1.5\" />" },
  paneMaximize: { viewBox: '0 0 18 18', body: "<path stroke=\"currentColor\" d=\"M3.5 4.5h11v9h-11z\" /> <path stroke=\"currentColor\" d=\"M6 9h6M9 6.5v5M7.5 8L9 6.5 10.5 8M7.5 10L9 11.5 10.5 10\" />" },
  /** The product's own mark, on its native 120 grid. Every chart carries it in the plot's corner. */
  productMark: { viewBox: '0 0 120 120', body:
    '<path fill="currentColor" d="M113 2.5A7 7 0 0 1 120 9.5L120 71.5A6 6 0 0 1 114 77.5L83 77.5A3 3 0 0 1 80 74.5L80 42.5A4 4 0 0 1 84 38.5L110 38.5A4 4 0 0 0 114 34.5L114 12.5A4 4 0 0 0 110 8.5L10 8.5A4 4 0 0 0 6 12.5L6 34.5A4 4 0 0 0 10 38.5L36 38.5A4 4 0 0 1 40 42.5L40 74.5A3 3 0 0 1 37 77.5L6 77.5A6 6 0 0 1 0 71.5L0 9.5A7 7 0 0 1 7 2.5Z"/>' +
    '<path fill="currentColor" d="M40 77.5H80V110.5A7 7 0 0 1 73 117.5H47A7 7 0 0 1 40 110.5Z"/>',
  },
  /** The market-status mark, on its native 18 grid. */
  marketStatus: { viewBox: '0 0 18 18', body: '<circle cx="9" cy="9" r="7" fill="currentColor" opacity="0.2"/><path fill="currentColor" d="M9 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8"/>' },
  /** The replay marks, on their native 18 grid. */
  // The disc carries the phase in `currentColor`; the rewind stays ONE ink in both modes, because a
  // mark that changed the colour of its own shape between modes would read as a different mark.
  replayStatus: { viewBox: '0 0 18 18', body: '<circle cx="9" cy="9" r="9" fill="currentColor"/><path d="M8 5.5v7L4.5 9 8 5.5Zm5 0v7L9.5 9 13 5.5Z" fill="var(--qc-state-markInk)"/>' },
  replayMark: { viewBox: '0 0 18 18', body: '<path fill="currentColor" fill-rule="evenodd" d="M9 0a9 9 0 1 1 0 18A9 9 0 0 1 9 0ZM8 5.5 4.5 9 8 12.5v-7Zm5 0L9.5 9l3.5 3.5v-7Z"/>' },
  /** The cut the arming guide is offering. Turned upright to sit on a VERTICAL rule: the blades
   *  cross above the pointer and the handles hang below it, so the shape reads along the line it
   *  rides rather than across it. Open strokes, no plate behind them, so the rule stays whole
   *  through the mark. */
  replayCut: { viewBox: '0 0 18 18', body:
    stroke('M5.3 3 11.4 12.2M12.7 3 6.6 12.2', 1.4) +
    '<circle cx="5" cy="14" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
    '<circle cx="13" cy="14" r="2.3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  },
  // A ring around a plus, each a one-unit line.
  comparePlus: { viewBox: '0 0 28 28', body: solid(ring(13.5, 14.5, 9.5)) + solid(box(9, 14, 18, 15) + box(13, 10, 14, 19)) },
  // Columns under a trend line: the line a one-unit stroke, the four columns one filled mark whose
  // walls they share.
  indicators: { viewBox: '0 0 28 28', body:
    '<path stroke="currentColor" stroke-linejoin="round" d="M6 12 11.5 6.5 15.5 10.5 23 5"/>' +
    solid(
      roundedBox(6, 18, 11, 23, [1, 0, 0, 0]) + box(7, 19, 10, 22, true) +
      roundedBox(10, 15, 15, 23, [1, 1, 0, 0]) + box(11, 16, 14, 22, true) +
      box(14, 17, 19, 23) + box(15, 18, 18, 22, true) +
      roundedBox(18, 12, 23, 23, [1, 1, 0, 0]) + box(19, 13, 22, 22, true),
    ),
  },
  // A double rewind: two open triangles at the one-unit weight.
  replay: { viewBox: '0 0 28 28', body: `<path fill="none" stroke="currentColor" d="${polygon([[13.5, 9], [13.5, 20], [7.5, 14.5]]) + polygon([[21.5, 9], [21.5, 20], [15.5, 14.5]])}"/>` },
  // A step back and a step forward through the chart's own history: a head at the end of a line that
  // runs level and then turns down a quarter circle, and the same mark facing the other way, each one
  // filled mark.
  undo: { viewBox: '0 0 28 28', body: solid(polyline([[11, 9], [7.5, 12.5], [11, 16]]) + line([8, 12.5], [14.5, 12.5]) + arc(14.5, 17.5, 5, -90, 0) + line([19.5, 17.5], [19.5, 19])) },
  redo: { viewBox: '0 0 28 28', body: solid(polyline([[16, 9], [19.5, 12.5], [16, 16]]) + line([19, 12.5], [12.5, 12.5]) + arc(12.5, 17.5, 5, 180, 270) + line([7.5, 17.5], [7.5, 19])) },
  // A nut: a stretched hexagon walled one unit thick around a ring.
  settings: { viewBox: '0 0 28 28', body: solid(NUT_RING_PATH, 'evenodd') + solid(NUT_PATH, 'evenodd') },
  // Enter fullscreen: four corner brackets turning outward, drawn as a one-unit wall.
  fullscreen: { viewBox: '0 0 28 28', body: solid(cornerBrackets(9.5, 9.5, 18.5, 18.5, 3, 2.5), 'evenodd') },
  // Exit fullscreen: the same brackets folded inward, stroked at a 1.5 weight.
  exitFullscreen: { viewBox: '0 0 28 28', body: stroke(['M11 6V7.5A3.5 3.5 0 0 1 7.5 11H6', 'M17 6V7.5A3.5 3.5 0 0 0 20.5 11H22', 'M17 22V20.5A3.5 3.5 0 0 1 20.5 17H22', 'M11 22V20.5A3.5 3.5 0 0 0 7.5 17H6'].join(''), 1.5) },
  // Chart image: a camera, a one-unit-walled body with the shutter hump left of centre and the lens
  // ring offset toward it.
  camera: { viewBox: '0 0 28 28', body:
    solid(wall([[3, 7], [9.2, 7], [10.2, 5], [16.8, 5], [17.8, 7], [24, 7], [24, 22], [3, 22]], [2.5, 0, 1.5, 1.5, 0, 2.5, 2.5, 2.5], [1.5, 0, 0.5, 0.5, 0, 1.5, 1.5, 1.5]), 'evenodd')
    + solid(ring(13.5, 14.5, 4.5), 'evenodd'),
  },
  /** The layout tile's own maximize and restore marks, on their native 18 grid: two
   *  opposite corner brackets turning outward to fill the layout, and inward to give the tile back. */
  tileMaximize: { viewBox: '0 0 18 18', body: solid(polyline([[10, 2.75], [15.25, 2.75], [15.25, 8]], 1.5) + polyline([[8, 15.25], [2.75, 15.25], [2.75, 10]], 1.5)) },
  tileRestore: { viewBox: '0 0 18 18', body: solid(polyline([[10.75, 2], [10.75, 7.25], [16, 7.25]], 1.5) + polyline([[7.25, 16], [7.25, 10.75], [2, 10.75]], 1.5)) },
  /** The on-chart navigation cluster's five marks, on the same 18 grid the tile marks use and
   *  filled rather than stroked: they sit in 24px chips over the bars, where a hairline outline
   *  goes grey against a candle. One chevron serves both directions; the back button turns it. */
  navZoomOut: { viewBox: '0 0 18 18', body: solid(box(4, 8.5, 14, 10)) },
  navZoomIn: { viewBox: '0 0 18 18', body: solid(box(8.25, 4.25, 9.75, 13.75) + box(4.25, 8.25, 13.75, 9.75)) },
  navScroll: { viewBox: '0 0 18 18', body: solid(polyline([[7.25, 4.4], [11.25, 9], [7.25, 13.6]], 1.5)) },
  // Three quarters of a circle a line and a half wide, its open end rounded and its other end under
  // a head pointing back along it.
  navReset: { viewBox: '0 0 18 18', body: solid(arc(9, 10, 4.5, -80, 180, 1.5) + disc(4.5, 10, 0.75) + polygon([[10, 3], [10, 8], [6, 5.5]])) },
  /** The pickers' wide caret, on its native 16 by 8 grid: the trigger arrow, which
   *  renders half size beside a picker's text. */
  menuArrowWide: { viewBox: '0 0 16 8', body: solid(polyline([[0.6, 0.7], [8, 7], [15.4, 0.7]], 1.8)) },
  // Hairline weight: these two sit beside a label rather than alone in a 38px cell. A tray taking an
  // arrow, and two sheets, the back one broken where the front lies over it.
  download: { viewBox: '0 0 28 28', body: solid(bend([[6.5, 17], [6.5, 22.5], [22.5, 22.5], [22.5, 17]], 1) + line([14.5, 6], [14.5, 18]) + polyline([[10.5, 14.5], [14.5, 18.5], [18.5, 14.5]])) },
  copy: { viewBox: '0 0 28 28', body: `<path stroke="currentColor" d="${FRONT_SHEET}${BACK_SHEET}"/>` },
  chevronDown: { viewBox: '0 0 28 28', body: stroke('M8 11l6 6 6-6', 1.7) },
  chevronUp: { viewBox: '0 0 28 28', body: stroke('M8 17l6-6 6 6', 1.7) },
  chevronLeft: { viewBox: '0 0 28 28', body: stroke('M17 8l-6 6 6 6', 1.7) },
  chevronRight: { viewBox: '0 0 28 28', body: stroke('M11 8l6 6-6 6', 1.7) },
  check: { viewBox: '0 0 28 28', body: solid(CHECK_PATH) },
  close: { viewBox: '0 0 28 28', body: stroke('M7 7l14 14M21 7 7 21', 1.6) },
  /** A hairline cross on its own 17 grid: the close a whole row carries at its far end. */
  closeThin: { viewBox: '0 0 17 17', body: solid(line([1, 1], [16, 16], 1.16) + line([1, 16], [16, 1], 1.16)) },
  // The magnifier is DRAWN, not stroked: it stands at full size in the search field's own row,
  // where a stroked ring thins out beside a 15px value and reads as a lighter mark than the text.
  search: { viewBox: '0 0 28 28', body: solid(ring(12.2, 12.2, 8.2, 1.5) + line([17.7, 17.7], [23.45, 23.45], 1.5)) },
  // The operator strip's toggle, on the 18 grid it was drawn on: a card of arithmetic with a chevron
  // at its open edge, pointing out to show the strip and back in to hide it.
  spreadOpsShow: { viewBox: '0 0 18 18', body: solid(OPERATOR_CARD + polyline([[3.9, 6.3], [1.65, 9], [3.9, 11.7]])) },
  spreadOpsHide: { viewBox: '0 0 18 18', body: solid(OPERATOR_CARD + polyline([[1.37, 6.3], [3.75, 9], [1.37, 11.7]])) },
  // A FILLED disc with the cross cut out of it, on the 18 grid, so the mark reads as a solid
  // control to press rather than as a thin ring the eye has to find. Drawn beside a text field at
  // its own size, which is why it does not share the 28 grid the toolbar marks are drawn on.
  clear: { viewBox: '0 0 18 18', body: solid(disc(9, 9, 8) + cross(9, 9, 4.92, 1.47, true)) },
  plus: { viewBox: '0 0 28 28', body: stroke('M14 6v16M6 14h16', 1.7) },
  goLive: { viewBox: '0 0 28 28', body: solid(wall([[7, 5], [17, 14], [7, 23]], 1.5, 0.5) + box(18, 6, 19, 22) + box(21, 6, 22, 22)) },
  play: { viewBox: '0 0 28 28', body: solid(wall([[9, 3.77], [21.09, 14], [9, 24.23]], [1.7, 1.74, 1.7], [0.6, 0.58, 0.6], 1.1)) },
  pause: { viewBox: '0 0 28 28', body: solid(frame(9, 5, 13, 23, 1) + frame(15, 5, 19, 23, 1)) },
  stepForward: { viewBox: '0 0 28 28', body: solid(box(20, 6, 21, 22) + wall([[8, 5], [18, 14], [8, 23]], 1.5, 0.5)) },
  stepBack: { viewBox: '0 0 28 28', body: solid(box(7, 6, 8, 22) + wall([[20, 5], [20, 23], [10, 14]], 1.5, 0.5)) },
  // A page with its heading ruled off and two posts through its top edge, an arrow on it pointing back.
  calendar: { viewBox: '0 0 28 28', body: solid(frame(3, 5, 24, 24, 3) + box(4, 10, 23, 11) + box(8, 3, 9, 8) + box(18, 3, 19, 8) + wall([[13, 12], [13, 21], [8, 16.5]], 0, 0) + box(13, 16, 20, 17)) },
  selectBar: { viewBox: '0 0 28 28', body: solid(frame(7, 5, 11, 23, 1) + wall([[17, 9], [17, 19], [12, 14]], 0, 0) + box(17, 13.5, 23, 14.5)) },
  // The first available date: a flag flying from a pole planted where the line begins.
  firstAvailable: { viewBox: '0 0 28 28', body: solid(flagBanner() + box(8, 5, 9, 19.1) + ring(8.5, 21.5, 2.5) + box(11, 21, 22, 22)) },
  // A random bar: a four-pointed spark beside a dot.
  randomBar: { viewBox: '0 0 28 28', body: solid(polygon([[21, 1], [22.64, 5.36], [27, 7], [22.64, 8.64], [21, 13], [19.36, 8.64], [15, 7], [19.36, 5.36]]) + polygon([[21, 3.8], [21.9, 6.1], [24.2, 7], [21.9, 7.9], [21, 10.2], [20.1, 7.9], [17.8, 7], [20.1, 6.1]], true) + disc(8.5, 9.5, 1.5)) },
  // The saved-layouts menu's marks, at the hairline weight of the words beside them: a folder with
  // its tab, a pencil, one square lifted off another, and a plus as thin as a stroke of the text.
  folder: { viewBox: '0 0 28 28', body: solid(FOLDER) },
  pencil: { viewBox: '0 0 28 28', body: solid(pencil([6, 22], 21, 3.325, 2.5)) },
  clone: { viewBox: '0 0 28 28', body: `<path stroke="currentColor" d="${BACK_SHEET}${FRONT_SHEET}"/>` },
  plusThin: { viewBox: '0 0 28 28', body: solid(box(13.9, 5, 15.1, 22) + box(6, 12.9, 23, 14.1)) },
  // A dialog's close on its own 14 grid, drawn at 18px with a stroke that keeps its weight at any size.
  dialogClose: { viewBox: '0 0 14 14', body: '<path stroke="currentColor" stroke-width="1.2" d="m1.5 1.5 11 11m0-11-11 11" vector-effect="non-scaling-stroke"/>' },
  // The Layouts dialog's marks on the 18 grid: a saved row's delete, and the sort control's arrow, down
  // for a descending order and up for an ascending one, over the bars it sorts.
  removeRow: { viewBox: '0 0 18 18', body: solid(bin([3, 15, 4], [6, 12, 2, 1.5], [[3.959, 4], [14.051, 4], [12.956, 16], [5.044, 16]])) },
  sortDown: { viewBox: '0 0 18 18', body: solid(line([5.5, 4], [5.5, 14]) + polyline([[2.65, 11.35], [5.5, 14.3], [8.35, 11.35]]) + SORT_BARS) },
  sortUp: { viewBox: '0 0 18 18', body: solid(line([5.5, 15], [5.5, 5]) + polyline([[2.65, 7.65], [5.5, 4.7], [8.35, 7.65]]) + SORT_BARS) },
  // The sort menu's rows carry the same arrows on the 28 grid, stroked like the menu's other marks.
  sortUpRow: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 18.5h-3M21.5 13.5h-5M23.5 8.5h-7M8.5 20.5V7M12.5 11l-4-4-4 4"/>' },
  sortDownRow: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M19.5 18.5h-3M21.5 13.5h-5M23.5 8.5h-7M8.5 7v13.5M4.5 16.5l4 4 4-4"/>' },
  cursorCross: { viewBox: '0 0 28 28', body: solid(box(18, 14, 26, 15) + box(14, 18, 15, 26) + box(14, 3, 15, 11) + box(3, 14, 11, 15)) },
  cursorDot: { viewBox: '0 0 28 28', body: '<circle cx="14" cy="14" r="3" fill="currentColor"/>' },
  cursorArrow: { viewBox: '0 0 28 28', body: solid(wall([[7, 6], [19, 13], [14.78, 15.46], [18.28, 21.52], [14.82, 23.52], [11.32, 17.46], [7, 20]], 0, 0)) },
  eraser: {
    viewBox: '0 0 29 31',
    aspect: 29 / 31,
    size: 31,
    // A block lying corner to corner, walled one unit thick, its near corner flattened on the line it
    // rubs along, a band across it, and the line under it.
    body: solid(wall([[4.415, 20.185], [18.55, 6.05], [25.55, 13.05], [15.6, 23], [7.23, 23]], [2, 2, 2, 0, 0], [1, 1, 1, 0, 0]) + line([13.85, 10.94], [20.57, 17.66]) + box(13, 22, 21, 23)),
  },
  magnet: { viewBox: '0 0 28 28', body: solid(wall(horseshoe(14, 12, 8, 6, 23), 0, 0) + box(6.5, 18, 11.5, 19) + box(16.5, 18, 21.5, 19)) },
  magnetStrong: { viewBox: '0 0 28 28', body: solid(polygon(horseshoe(14, 12, 8, 6, 20)) + polygon(inset(horseshoe(14, 12, 8, 6, 16), 1), true) + box(7, 16, 11, 19, true) + box(17, 16, 21, 19, true) + polyline([[8.5, 21], [10, 23.5], [8, 24.5], [9.5, 27]]) + polyline([[19.5, 21], [18, 23.5], [20, 24.5], [18.5, 27]])) },
  pin: { viewBox: '0 0 28 28', body: solid(pencil([3, 20], 21, 3.325, 2.5) + cornerLock(false)) },
  pinOn: { viewBox: '0 0 28 28', body: solid(pencil([3, 20], 21, 3.325, 2.5) + cornerLock(true)) },
  lockOpen: { viewBox: '0 0 28 28', body: solid(padlock(false)) },
  lockClosed: { viewBox: '0 0 28 28', body: solid(padlock(true)) },
  drawingsShown: { viewBox: '0 0 28 28', body: solid(drawEye(SMALL_EYE) + BRUSH_BADGE) },
  drawingsHidden: { viewBox: '0 0 28 28', body: solid(struckEye(SMALL_EYE, 13, 10, 7.85) + BRUSH_BADGE) },
  indicatorsShown: { viewBox: '0 0 28 28', body: solid(drawEye(SMALL_EYE) + FX_BADGE) },
  indicatorsHidden: { viewBox: '0 0 28 28', body: solid(struckEye(SMALL_EYE, 13, 10, 7.85) + FX_BADGE) },
  allShown: { viewBox: '0 0 28 28', body: solid(drawEye(LARGE_EYE)) },
  allHidden: { viewBox: '0 0 28 28', body: solid(struckEye(LARGE_EYE, 14, 14, 7.85)) },
  sync: { viewBox: '0 0 28 28', body: solid(linkHalf([17.85, 9.49], [-Math.SQRT1_2, Math.SQRT1_2], 4, 3.5) + linkHalf([9.49, 17.85], [Math.SQRT1_2, -Math.SQRT1_2], 4, 3.5) + line([10.85, 16.49], [16.49, 10.85])) },
  ruler: { viewBox: '0 0 28 28', body: `<path fill="currentColor" transform="rotate(-45 14 14)" d="${RULER}"/>` },
  zoomIn: { viewBox: '0 0 28 28', body: solid(ring(12.5, 12.5, 8.5) + line([18, 18], [22, 22]) + box(9, 12, 16, 13) + box(12, 9, 13, 16)) },
  groupGlyphs: { viewBox: '0 0 28 28', body: solid(ring(14, 14, 11, 1.05) + arc(14, 15.5, 3, 20, 160, 1, 'round') + disc(11.5, 12.5, 1) + disc(16.5, 12.5, 1)) },
  // The drawing toolbar's arrow: a filled chevron on a 10 by 16 grid, drawn 4 by 7 in the strip.
  chevronRight16: { viewBox: '0 0 10 16', aspect: 4 / 7, size: 7, body: solid(polyline([[1.3, 0.7], [8.6, 8], [1.3, 15.3]], 1.98)) },
  // Six dots on an 8 by 12 grid, each PAINTED in currentColor: the svg the glyph is wrapped in
  // carries `fill="none"`, so a rect with no fill of its own is a grip nobody can see.
  grip: {
    viewBox: '0 0 8 12',
    aspect: 8 / 12,
    body: '<rect fill="currentColor" width="2" height="2" rx="1"/><rect fill="currentColor" width="2" height="2" rx="1" y="5"/><rect fill="currentColor" width="2" height="2" rx="1" y="10"/><rect fill="currentColor" width="2" height="2" rx="1" x="6"/><rect fill="currentColor" width="2" height="2" rx="1" x="6" y="5"/><rect fill="currentColor" width="2" height="2" rx="1" x="6" y="10"/>',
  },
  // Three rounded tiles, and a plus where the fourth would stand.
  template: { viewBox: '0 0 28 28', body: solid(frame(6, 6, 13, 13, 2) + frame(15, 6, 22, 13, 2) + frame(6, 15, 13, 22, 2) + line([15.5, 18.5], [21.5, 18.5], 1, 'round') + line([18.5, 15.5], [18.5, 21.5], 1, 'round')) },
  layers: { viewBox: '0 0 28 28', body: solid(roundedPolygon(inset(LAYER, -1), 1) + polygon(LAYER, true) + polyline([[3.25, 16.92], [14, 23.43], [24.75, 16.8]])) },
  eyeCrossed: { viewBox: '0 0 28 28', body: solid(struckEye(SMALL_EYE_CENTRED, 14, 14, 7.85)) },
  pencil16: { size: 16, viewBox: '0 0 16 16', body: solid(pencil([0, 16], 20.8, 3.29, 2.47)) },
  bucket: { size: 16, viewBox: '0 0 20 20', body: `<path stroke="currentColor" d="${roundedPolygon([[10.5, 3.5], [19.5, 12.5], [12.5, 19.5], [3.5, 10.5]], [0, 2, 2, 0])}M13.5 6.5V2.5A2 2 0 0 0 9.5 2.5V8.5"/>` + solid('M2.5 12C1 14 0 15.4 0 16.5A2.5 2.5 0 0 0 5 16.5C5 15.4 4 14 2.5 12Z' + disc(9.5, 9.5, 1.5)) },
  textTee: { size: 15, aspect: 13 / 15, viewBox: '0 0 13 15', body: '<path stroke="currentColor" d="M0.5 4V1.5A1 1 0 0 1 1.5 0.5H11.5A1 1 0 0 1 12.5 1.5V4M6.5 0.5V14.5M4 14.5H9"/>' },
  // A tool's star in a flyout: an outline at rest and a filled star once saved, on an 18 grid.
  star: { viewBox: '0 0 18 18', body: `<path stroke="currentColor" d="${polygon(starPoints(9, 9, 6.87, 3.5))}"/>` },
  // The favorites bar's toggle on the drawing toolbar: one outlined star in either state, the state
  // carried by the button's fill.
  favoritesBar: { viewBox: '0 0 28 28', body: solid(polygon(starPoints(14, 14, 11, 5.3)) + polygon(starPoints(14, 14, 8.63, 4.13), true)) },
  starFilled: { viewBox: '0 0 18 18', body: solid(polygon(starPoints(9, 9, 8, 4))) },
  trash28: { viewBox: '0 0 28 28', body: solid(bin([5, 23, 7], [10, 18, 4, 2], [[6.92, 7], [21.08, 7], [19.537, 24], [8.463, 24]])) },
  // The settings bar's nut: the settings mark's own two shapes, the nut drawn first.
  gear: { viewBox: '0 0 28 28', body: solid(NUT_PATH, 'evenodd') + solid(NUT_RING_PATH, 'evenodd') },
  // The More control: three ringed dots in a row.
  kebab: { viewBox: '0 0 28 28', body: solid(ring(7.5, 14.5, 2.5) + ring(14.5, 14.5, 2.5) + ring(21.5, 14.5, 2.5)) },
  // The line styles as the settings bar draws them: a stroked line for solid, and FILLED rect runs
  // for dashed and dotted, which stay crisp at one pixel where a dasharray'd stroke blurs.
  lineSolid: { viewBox: '0 0 28 28', body: '<path stroke="currentColor" d="M4 13.5h20"/>' },
  lineDashed: { viewBox: '0 0 28 28', body: solid([4, 12, 20].map((x) => box(x, 13, x + 5, 14)).join('')) },
  lineDotted: { viewBox: '0 0 28 28', body: solid([3, 8, 13, 18, 23].map((x) => box(x, 13, x + 2, 15)).join('')) },
  // The line thicknesses as the settings bar draws them: an eighteen-pixel bar as tall as the line,
  // with fully rounded ends.
  lineThickness1: { viewBox: '0 0 18 1', size: 1, aspect: 18, body: '<rect width="18" height="1" rx="0.5" fill="currentColor"/>' },
  lineThickness2: { viewBox: '0 0 18 2', size: 2, aspect: 9, body: '<rect width="18" height="2" rx="1" fill="currentColor"/>' },
  lineThickness3: { viewBox: '0 0 18 3', size: 3, aspect: 6, body: '<rect width="18" height="3" rx="1.5" fill="currentColor"/>' },
  lineThickness4: { viewBox: '0 0 18 4', size: 4, aspect: 4.5, body: '<rect width="18" height="4" rx="2" fill="currentColor"/>' },
  // A line's two end styles, drawn for its left end with a one-pixel line on the 13.5 axis that runs
  // to 24: the plain end is a 2px ring the line leaves from, and the arrow's two barbs open from
  // its tip at 4.5 to 3.5px back and up and down. The right end wears the same glyph mirrored.
  lineEndNormal: { viewBox: '0 0 28 28', body: '<circle cx="6.5" cy="13.5" r="2" fill="none" stroke="currentColor"/><line x1="8.5" y1="13.5" x2="24" y2="13.5" stroke="currentColor"/>' },
  lineEndArrow: { viewBox: '0 0 28 28', body: '<g stroke="currentColor"><line x1="24" y1="13.5" x2="4.5" y2="13.5"/><line x1="4.5" y1="13.5" x2="8" y2="10"/><line x1="4.5" y1="13.5" x2="8" y2="17"/></g>' },
  // A menu row that opens a submenu points at where it will appear.
  submenuArrow: { viewBox: '0 0 24 24', body: '<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  close18: { viewBox: '0 0 18 18', body: '<path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' },
  chevronDown18: { viewBox: '0 0 18 18', body: solid(polyline([[4.4, 7.25], [9, 11.3], [13.6, 7.25]], 1.5)) },
  // The indicator picker's marks, on the grids its rows were drawn for.
  pickerStar: { viewBox: '0 0 18 18', body: '<path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M9 2.13L11.057 6.168L15.534 6.877L12.329 10.082L13.038 14.558L9 12.5L4.962 14.558L5.671 10.082L2.466 6.877L6.943 6.168z"/>' },
  pickerStarFilled: { viewBox: '0 0 18 18', body: '<path fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M9 2.13L11.057 6.168L15.534 6.877L12.329 10.082L13.038 14.558L9 12.5L4.962 14.558L5.671 10.082L2.466 6.877L6.943 6.168z"/>' },
  plus24: { viewBox: '0 0 24 24', body: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  search24: { viewBox: '0 0 24 24', body: '<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' },
  // The note beside a switch that needs a sentence.
  info: { viewBox: '0 0 18 18', body: solid(disc(9, 9, 8) + disc(9, 5, 1, true) + polygon([[7, 8], [10, 8], [10, 14], [8.5, 14], [8.5, 9.5], [7, 9.5]], true)) },
} as const satisfies Record<string, Glyph>

export type IconName = keyof typeof ICONS

/** The compare list's empty mark, on its own 120 grid: a magnifier inside a dashed ring with a plus
 *  badge on its shoulder. An illustration rather than a control glyph, which is why it is the one mark
 *  in this file that names its own inks: the drawing, the badge and the plus on it each wear an
 *  illustration role, so a viewer's eye lands on the thing the words are asking them to do. */
export const COMPARE_EMPTY_MARK: Glyph = {
  viewBox: '0 0 121 120',
  body:
    // Twelve dashes round the ring, each a fifteenth of a turn with rounded ends, and the glint on the
    // lens's upper right.
    `<path fill="var(--qc-illustration-ink)" d="${Array.from({ length: 12 }, (_, i) => arc(59.5, 61, 44, -97.5 + 30 * i, -82.5 + 30 * i, 2, 'round')).join('') + arc(59.5, 61, 7.5, -67, -22.5, 2, 'round')}"/>` +
    `<path fill="var(--qc-illustration-ink)" d="${ring(59.5, 61, 14, 2) + line([68.69, 70.19], [77.18, 78.68], 2, 'round')}"/>` +
    '<circle fill="var(--qc-illustration-accent)" cx="97.5" cy="39" r="13"/>' +
    `<path fill="var(--qc-illustration-accentInk)" d="${line([97.5, 34], [97.5, 44], 2, 'round') + line([92.5, 39], [102.5, 39], 2, 'round')}"/>`,
}

/** A point of the calf, drawn standing and facing right about the middle of its body, set in the
 *  beam: scaled, tilted head up a quarter of a right angle and more, and moved under the saucer. */
function inBeam([x, y]: Point): Point {
  const turn = (-25 * Math.PI) / 180
  return [58 + 1.15 * (x * Math.cos(turn) - y * Math.sin(turn)), 82 + 1.15 * (x * Math.sin(turn) + y * Math.cos(turn))]
}

/** The calf in the beam: the outline of its body, head and legs, an ear, a horn and a tail, as path
 *  data for a line along its middle. */
function calf(): string {
  const run = (points: readonly Point[], closed = false): string =>
    `M${points.map(inBeam).map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join('L')}${closed ? 'Z' : ''}`
  return (
    run([[-16, -7], [7, -8], [10, -12], [13, -15], [19, -15], [23, -11], [23, -7], [19, -5], [14, -5], [11, 1], [10, 8], [10, 15], [6, 15], [6, 9], [-10, 9], [-10, 15], [-14, 15], [-14, 8], [-16, 2]], true) +
    run([[12, -13], [8, -16], [13, -15.5]]) +
    run([[17, -15], [17.5, -18.5]]) +
    run([[-16, -5], [-19.5, -2], [-20, 6]])
  )
}

/** The saucer scene as path data for a line along its middle: the rim, broken where the dome stands
 *  in front of it, the dome and its base, the two edges of the beam, and the calf. */
const SAUCER_SCENE = 'M73.6 16.7A31.7 15 0 1 1 46.4 16.7' + 'M45.4 22A14.6 14 0 0 1 74.6 22A14.6 6.5 0 0 1 45.4 22Z' + 'M39.5 42 6.8 113.3M80.5 42 113.2 113.3' + calf()

/** The scene's dots: the saucer's three lights and the calf's eye. */
const SAUCER_DOTS = (r: number): string => disc(38.3, 30.2, r) + disc(60, 36.6, r) + disc(81.7, 30.2, r) + disc(...inBeam([18.5, -11]), r * 0.8)

/** One drawing of the scene in a line `width` wide, shown in the mode its class names. */
const saucer = (mode: string, width: number): string =>
  `<path class="qc-only-${mode}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" d="${SAUCER_SCENE}"/>` +
  `<path class="qc-only-${mode}" fill="currentColor" d="${SAUCER_DOTS(width / 2)}"/>`

/** The symbol search's empty result, on its own 120 grid: a saucer beaming up a calf in the ink of
 *  the words beneath it. Each mode has its own drawing, the light one heavier so it holds on white,
 *  and the stylesheet shows the one for the mode in effect. */
export const SEARCH_EMPTY_MARK: Glyph = {
  viewBox: '0 0 120 120',
  body: saucer('dark', 3.3) + saucer('light', 4),
}

/** One operator's strokes: a one-unit line with square ends. */
const operator = (d: string): string => `<path fill="none" stroke="currentColor" stroke-linecap="square" stroke-linejoin="round" d="${d}"/>`

/** The spread operators' glyphs on a 13 grid, by operator id. The operators themselves, their order
 *  and their names are the search module's. */
export const OPERATOR_GLYPHS = {
  division: { viewBox: '0 0 13 13', body: operator('M2.5 6.5H11.5') + solid(disc(7, 3, 1) + disc(7, 10, 1)) },
  subtraction: { viewBox: '0 0 13 13', body: operator('M2.5 6.5H10.5') },
  addition: { viewBox: '0 0 13 13', body: operator('M2.5 6.5H10.5M6.5 2.5V10.5') },
  multiplication: { viewBox: '0 0 13 13', body: operator('M3 10 10 3M3 3 10 10') },
  exponentiation: { viewBox: '0 0 13 13', body: operator('M3 7 6.5 3.5 10 7') },
  // A one with its flag and its foot, and a slash leaning after it.
  reciprocal: { viewBox: '0 0 13 13', body: operator('M1 5 3.5 2.5V10M1.5 10.5H5.5') + '<path fill="none" stroke="currentColor" d="M8 12 11 1"/>' },
} as const satisfies Record<string, Glyph>
