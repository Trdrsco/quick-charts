// The multi-chart arrangement catalog — 55 codes in 13 picker rows, decoded from
// its own menu icons into unit-square pane rectangles.
// Geometry only: no DOM, no chart. The widget's layout turns a code into positioned chart elements;
// a menu turns the rows into its picker. Splits are EVEN fractions — the picker icons draw
// stylized proportions, but its product opens every arrangement at equal splits.
//
// Code grammar (verified against the captured icon paths, not inferred):
//   `s` one pane · `Nh` N columns · `Nv` N rows · bare/`NcK` even grids (rows × columns)
//   `Ns` one large left pane + N-1 stacked right (`Ns-l` mirrors: stack left, large right;
//   `3r` is the same mirror at three) · `A-B` A panes across the top half, B across the bottom
//   (`2-2` is the exception its icon draws: two panes atop two FULL-WIDTH rows) · `A-B-l/-r`
//   are column forms: A full-height columns with a B-stack on the right (-l) or left (-r).
// Pane order is deterministic for serialization: primaries left-to-right, stacks top-to-bottom.
//
// Each arrangement also carries its NAME in English, read from the widget's own catalog so the
// fallback and the translated source are one text: `arrangementName(t, code, label)` says it in the
// widget's language, and this says it without one.
import { layouts } from './i18n/en/layouts'

export interface PaneRect {
  x: number
  y: number
  w: number
  h: number
}

export interface Arrangement {
  code: string
  count: number
  /** The arrangement's name in English — what a picker shows when it names one, and the fallback
   *  `arrangementName` reads when the widget's catalog has not met the code. */
  label: string
  rects: readonly PaneRect[]
}

const cols = (n: number): PaneRect[] => Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0, w: 1 / n, h: 1 }))

const rows = (n: number): PaneRect[] => Array.from({ length: n }, (_, i) => ({ x: 0, y: i / n, w: 1, h: 1 / n }))

const grid = (c: number, r: number): PaneRect[] => {
  const out: PaneRect[] = []
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) out.push({ x: x / c, y: y / r, w: 1 / c, h: 1 / r })
  return out
}

/** One large pane on the left half, `n` stacked on the right half. */
const bigLeft = (n: number): PaneRect[] => [
  { x: 0, y: 0, w: 0.5, h: 1 },
  ...Array.from({ length: n }, (_, i) => ({ x: 0.5, y: i / n, w: 0.5, h: 1 / n })),
]

/** `n` stacked on the left half, one large pane on the right half. */
const bigRight = (n: number): PaneRect[] => [
  ...Array.from({ length: n }, (_, i) => ({ x: 0, y: i / n, w: 0.5, h: 1 / n })),
  { x: 0.5, y: 0, w: 0.5, h: 1 },
]

/** `a` panes across the top half, `b` across the bottom half. */
const topBottom = (a: number, b: number): PaneRect[] => [
  ...Array.from({ length: a }, (_, i) => ({ x: i / a, y: 0, w: 1 / a, h: 0.5 })),
  ...Array.from({ length: b }, (_, i) => ({ x: i / b, y: 0.5, w: 1 / b, h: 0.5 })),
]

/** `nCols` full-height columns plus one column holding an `nStack` stack, all equal widths. */
const columnsWithStack = (nCols: number, nStack: number, stackSide: 'left' | 'right'): PaneRect[] => {
  const w = 1 / (nCols + 1)
  const columns = Array.from({ length: nCols }, (_, i) => ({
    x: (stackSide === 'right' ? i : i + 1) * w,
    y: 0,
    w,
    h: 1,
  }))
  const stackX = stackSide === 'right' ? nCols * w : 0
  const stack = Array.from({ length: nStack }, (_, i) => ({ x: stackX, y: i / nStack, w, h: 1 / nStack }))
  return stackSide === 'right' ? [...columns, ...stack] : [...stack, ...columns]
}

/** The catalog key an arrangement code carries its name under: a key separates its parts with
 *  underscores where a code uses hyphens. `arrangementName` does the same conversion. */
const nameOf = (code: string): string => (layouts as Record<string, string>)[`layout.${code.replace(/-/g, '_')}`] ?? code

const A = (code: string, rects: PaneRect[]): Arrangement => ({ code, count: rects.length, label: nameOf(code), rects })

/** Every arrangement, in picker order. */
export const ARRANGEMENTS: readonly Arrangement[] = [
  A('s', [{ x: 0, y: 0, w: 1, h: 1 }]),
  A('2h', cols(2)),
  A('2v', rows(2)),
  A('3h', cols(3)),
  A('3v', rows(3)),
  A('3s', bigLeft(2)),
  A('3r', bigRight(2)),
  A('2-1', topBottom(2, 1)),
  A('1-2', topBottom(1, 2)),
  A('4', grid(2, 2)),
  A('4v', rows(4)),
  A('4h', cols(4)),
  A('4s', bigLeft(3)),
  A('4s-l', bigRight(3)),
  A('1-3', topBottom(1, 3)),
  A('3-1', topBottom(3, 1)),
  A('2-2-l', columnsWithStack(2, 2, 'right')),
  A('2-2-r', columnsWithStack(2, 2, 'left')),
  // The one A-B exception: its icon splits the BOTTOM half into two full-width rows.
  A('2-2', [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 1, h: 0.25 },
    { x: 0, y: 0.75, w: 1, h: 0.25 },
  ]),
  A('1-4', topBottom(1, 4)),
  A('5h', cols(5)),
  A('5v', rows(5)),
  A('5s', bigLeft(4)),
  A('5s-l', bigRight(4)),
  A('2-3', topBottom(2, 3)),
  A('3-2', topBottom(3, 2)),
  A('4-1', topBottom(4, 1)),
  A('2-3-l', columnsWithStack(2, 3, 'right')),
  A('2-3-r', columnsWithStack(2, 3, 'left')),
  A('6', grid(3, 2)),
  A('6h', cols(6)),
  A('6v', rows(6)),
  A('6c', grid(2, 3)),
  A('2-4', topBottom(2, 4)),
  A('4-2', topBottom(4, 2)),
  A('4-3', topBottom(4, 3)),
  A('7h', cols(7)),
  A('7s', bigLeft(6)),
  A('8', grid(4, 2)),
  A('8c', grid(2, 4)),
  A('8h', cols(8)),
  A('8v', rows(8)),
  A('9s', grid(3, 3)),
  A('5-4', topBottom(5, 4)),
  A('9h', cols(9)),
  A('9v', rows(9)),
  A('10c5', grid(5, 2)),
  A('10h', cols(10)),
  A('10v', rows(10)),
  A('12c6', grid(6, 2)),
  A('12c4', grid(4, 3)),
  A('12h', cols(12)),
  A('14c7', grid(7, 2)),
  A('16c8', grid(8, 2)),
  A('16c4', grid(4, 4)),
]

const BY_CODE = new Map(ARRANGEMENTS.map((a) => [a.code, a]))

/** Look an arrangement up by code; unknown codes return null so a stale saved layout degrades. */
export function arrangementOf(code: string): Arrangement | null {
  return BY_CODE.get(code) ?? null
}

/** The picker's row structure: rows labeled by chart count, codes in menu order. */
export const LAYOUT_MENU_ROWS: readonly { label: string; codes: readonly string[] }[] = [
  { label: '1', codes: ['s'] },
  { label: '2', codes: ['2h', '2v'] },
  { label: '3', codes: ['3h', '3v', '3s', '3r', '2-1', '1-2'] },
  { label: '4', codes: ['4', '4v', '4h', '4s', '4s-l', '1-3', '3-1', '2-2-l', '2-2-r', '2-2'] },
  { label: '5', codes: ['1-4', '5h', '5v', '5s', '5s-l', '2-3', '3-2', '4-1', '2-3-l', '2-3-r'] },
  { label: '6', codes: ['6', '6h', '6v', '6c', '2-4', '4-2'] },
  { label: '7', codes: ['4-3', '7h', '7s'] },
  { label: '8', codes: ['8', '8c', '8h', '8v'] },
  { label: '9', codes: ['9s', '5-4', '9h', '9v'] },
  { label: '10', codes: ['10c5', '10h', '10v'] },
  { label: '12', codes: ['12c6', '12c4', '12h'] },
  { label: '14', codes: ['14c7'] },
  { label: '16', codes: ['16c8', '16c4'] },
]
