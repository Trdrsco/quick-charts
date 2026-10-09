// The geometry the chart's own glyphs are drawn from: closed outlines on a glyph's grid, one unit a
// CSS pixel at the size the glyph is drawn. A line is an outline a width across, a ring is a disc
// with a hole, a frame is a rounded box with a hole. Every outline turns clockwise on screen, so
// pieces that overlap fill as one shape under the nonzero rule, and an outline turned the other way
// cuts a hole through whatever it lies over.
//
// Every function answers path data and nothing else, so a glyph is a string built once when the
// module loads and the markup around it stays the glyph table's own.

export type Point = readonly [number, number]

/** A coordinate as path data: at most three decimals and no trailing zeros. */
const num = (value: number): string => {
  const rounded = Math.round(value * 1000) / 1000
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

const at = ([x, y]: Point): string => `${num(x)} ${num(y)}`

/** Twice the signed area of an outline: positive when it turns clockwise on screen. */
function turning(points: readonly Point[]): number {
  let sum = 0
  points.forEach(([x, y], index) => {
    const [u, v] = points[(index + 1) % points.length]!
    sum += x * v - u * y
  })
  return sum
}

/** A closed outline through the points: clockwise, or the other way round to cut a hole. */
export function polygon(points: readonly Point[], hole = false): string {
  const clockwise = turning(points) > 0
  const ordered = clockwise === !hole ? points : [...points].reverse()
  return `M${ordered.map(at).join('L')}Z`
}

/** An upright box from its two corners. */
export const box = (x0: number, y0: number, x1: number, y1: number, hole = false): string =>
  polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], hole)

/** A closed outline through the points with each corner rounded to its own radius, 0 keeping it
 *  sharp: clockwise, or the other way round to cut a hole. */
export function roundedPolygon(points: readonly Point[], radii: number | readonly number[], hole = false): string {
  const radiusOf = (index: number): number => (typeof radii === 'number' ? radii : radii[index] ?? 0)
  const clockwise = turning(points) > 0
  const flip = clockwise === hole
  const order = points.map((_, index) => (flip ? points.length - 1 - index : index))
  const corners = order.map((index) => ({ p: points[index]!, r: radiusOf(index) }))
  const parts = corners.map(({ p, r }, index) => {
    if (r <= 0) return { start: p, arc: '' }
    const before = corners[(index - 1 + corners.length) % corners.length]!.p
    const after = corners[(index + 1) % corners.length]!.p
    const toBefore: Point = [before[0] - p[0], before[1] - p[1]]
    const toAfter: Point = [after[0] - p[0], after[1] - p[1]]
    const lb = Math.hypot(...toBefore)
    const la = Math.hypot(...toAfter)
    const cos = (toBefore[0] * toAfter[0] + toBefore[1] * toAfter[1]) / (lb * la)
    // The arc meets each side as far from the corner as the radius and the corner's angle allow.
    const reach = r / Math.tan(Math.acos(Math.max(-1, Math.min(1, cos))) / 2)
    const start: Point = [p[0] + (toBefore[0] / lb) * reach, p[1] + (toBefore[1] / lb) * reach]
    const end: Point = [p[0] + (toAfter[0] / la) * reach, p[1] + (toAfter[1] / la) * reach]
    const sweep = (p[0] - before[0]) * (after[1] - p[1]) - (p[1] - before[1]) * (after[0] - p[0]) > 0 ? 1 : 0
    return { start, arc: `A${num(r)} ${num(r)} 0 0 ${sweep} ${at(end)}` }
  })
  return `M${parts.map((part) => at(part.start) + part.arc).join('L')}Z`
}

/** The outline whose every side runs `distance` inside the given one's, its corners where the moved
 *  sides meet: the inner edge of a wall that thick. */
export function inset(points: readonly Point[], distance: number): Point[] {
  const sign = turning(points) > 0 ? 1 : -1
  const sides = points.map((from, index) => {
    const to = points[(index + 1) % points.length]!
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    // The inward normal of a side of a clockwise outline points to its right on screen.
    const nx = (-(to[1] - from[1]) / length) * sign * distance
    const ny = ((to[0] - from[0]) / length) * sign * distance
    return { a: [from[0] + nx, from[1] + ny] as Point, b: [to[0] + nx, to[1] + ny] as Point }
  })
  return sides.map((side, index) => {
    const prev = sides[(index - 1 + sides.length) % sides.length]!
    const [x1, y1] = prev.a
    const [x2, y2] = prev.b
    const [x3, y3] = side.a
    const [x4, y4] = side.b
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if (Math.abs(denominator) < 1e-9) return side.a
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator
    return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)] as Point
  })
}

/** A wall `width` wide inside the edge of an outline, its outer corners rounded to their radii and
 *  its inner corners to theirs. */
export const wall = (points: readonly Point[], outer: number | readonly number[], inner: number | readonly number[], width = 1): string =>
  roundedPolygon(points, outer) + roundedPolygon(inset(points, width), inner, true)

/** An upright box with its corners rounded, one radius for all four or one each from the top left
 *  round. */
export const roundedBox = (x0: number, y0: number, x1: number, y1: number, r: number | readonly number[], hole = false): string =>
  roundedPolygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], r, hole)

/** A wall `width` wide inside the edge of a rounded box, its inner corners rounded to follow. */
export function frame(x0: number, y0: number, x1: number, y1: number, r: number | readonly number[], width = 1): string {
  const inner = typeof r === 'number' ? Math.max(0, r - width) : r.map((v) => Math.max(0, v - width))
  return roundedBox(x0, y0, x1, y1, r) + roundedBox(x0 + width, y0 + width, x1 - width, y1 - width, inner, true)
}

/** A round dot. */
export function disc(cx: number, cy: number, r: number, hole = false): string {
  const half = `A${num(r)} ${num(r)} 0 1 ${hole ? 0 : 1}`
  return `M${at([cx - r, cy])}${half} ${at([cx + r, cy])}${half} ${at([cx - r, cy])}Z`
}

/** A ring: a disc of radius `r` with the middle cut away, leaving a wall `width` wide. */
export const ring = (cx: number, cy: number, r: number, width = 1): string => disc(cx, cy, r) + disc(cx, cy, r - width, true)

/** A line from a to b, `width` across, its ends cut square across it (or carried half the width on
 *  past each end, `square`, or rounded, `round`). */
export function line(a: Point, b: Point, width = 1, cap: 'butt' | 'square' | 'round' = 'butt'): string {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (length < 1e-6) return ''
  const ux = (b[0] - a[0]) / length
  const uy = (b[1] - a[1]) / length
  const half = width / 2
  const reach = cap === 'square' ? half : 0
  const s: Point = [a[0] - ux * reach, a[1] - uy * reach]
  const e: Point = [b[0] + ux * reach, b[1] + uy * reach]
  const nx = -uy * half
  const ny = ux * half
  const body = polygon([[s[0] + nx, s[1] + ny], [e[0] + nx, e[1] + ny], [e[0] - nx, e[1] - ny], [s[0] - nx, s[1] - ny]])
  return cap === 'round' ? body + disc(a[0], a[1], half) + disc(b[0], b[1], half) : body
}

/** A line through the points, `width` across. Its corners are mitred, or rounded with `round`;
 *  its ends are cut square across it unless `cap` says otherwise. */
export function polyline(points: readonly Point[], width = 1, options: { join?: 'miter' | 'round'; cap?: 'butt' | 'square' | 'round' } = {}): string {
  const cap = options.cap ?? 'butt'
  if (options.join === 'round') {
    const pieces = points.slice(1).map((to, index) => line(points[index]!, to, width))
    const joints = points.slice(1, -1).map(([x, y]) => disc(x, y, width / 2))
    const ends = cap === 'round' ? [disc(...points[0]!, width / 2), disc(...points[points.length - 1]!, width / 2)] : []
    return [...pieces, ...joints, ...ends].join('')
  }
  const half = width / 2
  const normals = points.slice(1).map((to, index) => {
    const from = points[index]!
    const length = Math.hypot(to[0] - from[0], to[1] - from[1])
    return [-(to[1] - from[1]) / length, (to[0] - from[0]) / length] as const
  })
  const left: Point[] = []
  const right: Point[] = []
  points.forEach(([x, y], index) => {
    const before = normals[Math.max(0, index - 1)]!
    const after = normals[Math.min(normals.length - 1, index)]!
    const mx = before[0] + after[0]
    const my = before[1] + after[1]
    const length = Math.hypot(mx, my)
    // The mitre lies along the corner's bisector, as far out as both sides' edges reach.
    const reach = half / ((mx / length) * after[0] + (my / length) * after[1])
    let px = x
    let py = y
    // A square end runs on past its point by half the width.
    if (cap === 'square' && (index === 0 || index === points.length - 1)) {
      const [nx, ny] = index === 0 ? normals[0]! : normals[normals.length - 1]!
      const sign = index === 0 ? -1 : 1
      px += ny * half * sign
      py += -nx * half * sign
    }
    left.push([px + (mx / length) * reach, py + (my / length) * reach])
    right.push([px - (mx / length) * reach, py - (my / length) * reach])
  })
  const body = polygon([...left, ...right.reverse()])
  if (cap !== 'round') return body
  return body + disc(...points[0]!, half) + disc(...points[points.length - 1]!, half)
}

/** A point on a circle, at an angle in degrees measured clockwise on screen from the right. */
export const onCircle = (cx: number, cy: number, r: number, degrees: number): Point => {
  const t = (degrees * Math.PI) / 180
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)]
}

/** A band `width` wide along a circle of radius `r`, from one angle to another clockwise on screen
 *  (degrees from the right), its ends cut along the radius, or rounded with `round`. */
export function arc(cx: number, cy: number, r: number, from: number, to: number, width = 1, cap: 'butt' | 'round' = 'butt'): string {
  // A band swept the other way is the same band from its far end, so it is drawn clockwise too and
  // unions with its neighbours.
  if (to < from) return arc(cx, cy, r, to, from, width, cap)
  const large = to - from > 180 ? 1 : 0
  const outer = r + width / 2
  const inner = r - width / 2
  const band =
    `M${at(onCircle(cx, cy, outer, from))}A${num(outer)} ${num(outer)} 0 ${large} 1 ${at(onCircle(cx, cy, outer, to))}` +
    `L${at(onCircle(cx, cy, inner, to))}A${num(inner)} ${num(inner)} 0 ${large} 0 ${at(onCircle(cx, cy, inner, from))}Z`
  if (cap !== 'round') return band
  return band + disc(...onCircle(cx, cy, r, from), width / 2) + disc(...onCircle(cx, cy, r, to), width / 2)
}

/** A line through the points, `width` across, each corner bent round an arc of `radius` along the
 *  line's middle, its ends cut square across it. */
export function bend(points: readonly Point[], radius: number, width = 1): string {
  const unitOf = (a: Point, b: Point): Point => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
  }
  const degrees = (c: Point, p: Point): number => (Math.atan2(p[1] - c[1], p[0] - c[0]) * 180) / Math.PI
  let from: Point = points[0]!
  let out = ''
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!
    const u = unitOf(points[i - 1]!, p)
    const v = unitOf(p, points[i + 1]!)
    const turn = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1])))
    const reach = radius * Math.tan(turn / 2)
    const t1: Point = [p[0] - u[0] * reach, p[1] - u[1] * reach]
    const t2: Point = [p[0] + v[0] * reach, p[1] + v[1] * reach]
    // The centre lies on the inside of the turn: right of the travel for a clockwise turn on screen.
    const clockwise = u[0] * v[1] - u[1] * v[0] > 0
    const centre: Point = clockwise ? [t1[0] - u[1] * radius, t1[1] + u[0] * radius] : [t1[0] + u[1] * radius, t1[1] - u[0] * radius]
    out += line(from, t1, width)
    let a = degrees(centre, t1)
    let b = degrees(centre, t2)
    if (!clockwise) [a, b] = [b, a]
    if (b < a) b += 360
    out += arc(centre[0], centre[1], radius, a, b, width)
    from = t2
  }
  return out + line(from, points[points.length - 1]!, width)
}

/** The inner markup of a filled glyph: one path in the control's ink. */
export const solid = (d: string, rule?: 'evenodd'): string => `<path fill="currentColor"${rule ? ` fill-rule="${rule}"` : ''} d="${d}"/>`
