// The divisions a speed resistance fan and a gann box share: a box between their two points, price
// divisions across it and time divisions down it, each with its label on either side.
import type { DrawingStyle, Point } from '../core/types'
import { paintLabel } from '../render/canvas'
import type { FibLevel } from './fibonacci'

/** A box's price levels and time levels, and which of their labels show. */
export type BoxLevelsProps = {
  priceLevels: FibLevel[]
  timeLevels: FibLevel[]
  showLeftLabels: boolean
  showRightLabels: boolean
  showTopLabels: boolean
  showBottomLabels: boolean
  /** Turn the divisions about the box, the first point's corner taking the second's. */
  reverse: boolean
}

/** The seven divisions offered on each side, each in its own color. */
const BOX_DIVISIONS: readonly [number, string][] = [
  [0, '#808080'],
  [0.25, '#ff9800'],
  [0.382, '#00bcd4'],
  [0.5, '#4caf50'],
  [0.618, '#089981'],
  [0.75, '#2962ff'],
  [1, '#808080'],
]

/** A fresh set of the seven divisions, every one shown. */
export const boxDivisions = (): FibLevel[] => BOX_DIVISIONS.map(([value, color]) => ({ value, visible: true, color }))

/** A box between two points, with the corners the divisions count from: every division stands at
 *  `far` at zero and at `origin` at one. */
export type LevelBox = { origin: Point; far: Point; left: number; right: number; top: number; bottom: number }

export function levelBox(a: Point, b: Point, reverse: boolean): LevelBox {
  const [origin, far] = reverse ? [b, a] : [a, b]
  return { origin, far, left: Math.min(a.x, b.x), right: Math.max(a.x, b.x), top: Math.min(a.y, b.y), bottom: Math.max(a.y, b.y) }
}

/** The y of a price division and the x of a time division. */
export const priceY = (box: LevelBox, value: number): number => box.far.y + (box.origin.y - box.far.y) * value
export const timeX = (box: LevelBox, value: number): number => box.far.x + (box.origin.x - box.far.x) * value

/** The labels of a box's divisions: a price division's value beside the box's left and right edges,
 *  a time division's above its top and below its bottom, each where its switch shows it, in the
 *  division's color. */
export function paintBoxLabels(ctx: CanvasRenderingContext2D, style: Readonly<DrawingStyle>, props: Readonly<BoxLevelsProps>, box: LevelBox, color: (level: FibLevel, index: number) => string): void {
  props.priceLevels.forEach((level, i) => {
    if (!level.visible) return
    const y = priceY(box, level.value)
    const ink = { ...style, textColor: color(level, i) }
    if (props.showLeftLabels) paintLabel(ctx, String(level.value), { x: box.left - 4, y }, ink, { align: 'right' })
    if (props.showRightLabels) paintLabel(ctx, String(level.value), { x: box.right + 4, y }, ink, { align: 'left' })
  })
  props.timeLevels.forEach((level, i) => {
    if (!level.visible) return
    const x = timeX(box, level.value)
    const ink = { ...style, textColor: color(level, i) }
    if (props.showTopLabels) paintLabel(ctx, String(level.value), { x, y: box.top - 4 }, ink, { align: 'center', baseline: 'bottom' })
    if (props.showBottomLabels) paintLabel(ctx, String(level.value), { x, y: box.bottom + 4 }, ink, { align: 'center', baseline: 'top' })
  })
}

/** A box tool saved with one set of levels reads them as its price divisions. */
export function upgradeBoxLevels<P extends BoxLevelsProps>(props: Partial<P>): Partial<P> {
  const saved = props as Partial<P> & { levels?: unknown }
  if (!Array.isArray(saved.levels) || 'priceLevels' in saved) return props
  const { levels, ...rest } = saved
  return { ...rest, priceLevels: levels } as Partial<P>
}
