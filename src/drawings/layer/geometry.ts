// The pure geometry behind the placement gestures: the shift constraint, where a copy lands, where
// an instant tool opens, and where a dropped picture sits. Every function takes numbers and answers
// numbers, so the gestures test against these without a chart.
import type { Anchor, Viewport } from '@trdrs/chart-drawings'
import { CLONE_OFFSET_PX } from '../editModel'

export interface Px {
  x: number
  y: number
}

/** Snap a pixel to the nearest 45 degree ray from a reference point: the Shift constraint on a
 *  two-point placement or an anchor drag. A zero-length move stays where it is. */
export function constrain45(ref: Px, p: Px): Px {
  const dx = p.x - ref.x
  const dy = p.y - ref.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return p
  const step = Math.PI / 4
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  return { x: ref.x + Math.cos(angle) * length, y: ref.y + Math.sin(angle) * length }
}

/** Every anchor moved right by the clone offset, in the chart's own time. An anchor the viewport
 *  cannot place (outside the loaded range) keeps its time, so a copy never loses a point. */
export function shiftedAnchors(anchors: readonly Anchor[], viewport: Viewport | null, offsetPx = CLONE_OFFSET_PX): Anchor[] {
  return anchors.map((a) => {
    if (!viewport) return { ...a }
    const x = viewport.xOf(a.time)
    const shifted = x === null ? null : viewport.timeAt(x + offsetPx)
    return shifted === null ? { ...a } : { ...a, time: shifted }
  })
}

/** The three anchors an instant position tool opens with from one press: the entry at the press,
 *  and the target and stop at equal distances (a 1:1 plan) with a default rightward extent. Null
 *  when the pane cannot answer a price or time for the defaults. A short position mirrors the two
 *  zones. */
export function instantPositionAnchors(
  entry: Anchor,
  press: Px,
  pane: { width: number; height: number },
  viewport: Viewport,
  short: boolean,
): [Anchor, Anchor, Anchor] | null {
  const upY = Math.max(4, press.y - pane.height * 0.2)
  const dnY = Math.min(pane.height - 4, press.y + pane.height * 0.2)
  const rightX = Math.min(pane.width - 8, press.x + pane.width * 0.25)
  const upPrice = viewport.priceAt(upY)
  const dnPrice = viewport.priceAt(dnY)
  const rightTime = viewport.timeAt(rightX)
  if (upPrice == null || dnPrice == null || rightTime == null) return null
  const target: Anchor = { time: rightTime, price: short ? dnPrice : upPrice }
  const stop: Anchor = { time: rightTime, price: short ? upPrice : dnPrice }
  return [{ ...entry }, target, stop]
}

/** Where a dropped picture opens: centred in the pane at a readable width, since the anchor is the
 *  picture's TOP-LEFT and a full-size photo would blanket the chart. Answers the anchor and the
 *  painted width, or null when the pane cannot place it. */
export function imagePlacement(
  image: { width: number; height: number },
  pane: { width: number; height: number },
  viewport: Viewport,
): { anchor: Anchor; width: number } | null {
  const w = Math.min(360, image.width || 360)
  const h = image.height > 0 && image.width > 0 ? w * (image.height / image.width) : w * 0.66
  const price = viewport.priceAt(Math.max(0, pane.height / 2 - h / 2))
  const time = viewport.timeAt(Math.max(0, pane.width / 2 - w / 2))
  if (price == null || time == null) return null
  return { anchor: { time, price }, width: w }
}

/** The whole-bar shift a move drag applies: the drag distance in bars, rounded, so every anchor
 *  translates by the same count and the handles never wobble apart on independent rounding. */
export function barsShifted(dx: number, spacing: number | null): number {
  return spacing ? Math.round(dx / spacing) : 0
}
