// When a legend row may say "collapsed".
//
// Collapse is something a VIEWER does, and for a while this was inferred from the pane's height
// instead. Two facts defeat that. A pane the renderer has not laid out yet reports 0. And a pane is
// BORN at the floor height: the renderer allocates it there and rebalances it to its real height on
// a later layout pass. So a brand new pane reads 0, then 30, then 80, and any reading taken before
// the end of that sequence says "collapsed" about a pane nobody touched. Nothing errors, the row
// simply offers to restore a pane that is already open, and with an idle feed nothing ever
// recomputes to correct it.
//
// So the widget's own record of what its commands did is the authority, and geometry may only
// corroborate: it confirms a collapse after the height has held at the floor for several
// consecutive looks, which a pane on its way up from the floor never does.
import { describe, expect, it } from 'vitest'
import { collapsedReadings, FLOOR_CONFIRM_READINGS } from '../../src/widget/indicators'
import { COLLAPSED_H, isCollapsed } from '../../src/panePlan'

const rows = [
  { id: 'sma-20' }, // overlay-placed: shares the price pane, never pane-placed
  { id: 'osc-1', pane: true },
]
const paneOf = { 'sma-20': 0, 'osc-1': 1 }
const none: ReadonlySet<number> = new Set()

/** Replay a pane's height frame by frame, carrying the streaks the way the widget does. */
function replay(heights: readonly number[], commanded: ReadonlySet<number> = none) {
  let streaks: Record<string, number> = {}
  const seen: { collapsed: boolean; measured: boolean }[] = []
  for (const h of heights) {
    const r = collapsedReadings(rows, paneOf, [159, h], commanded, streaks)
    streaks = r.streaks
    seen.push({ collapsed: r.collapsed['osc-1']!, measured: r.measured })
  }
  return { seen, last: seen[seen.length - 1]! }
}

describe('a pane on its way up from the floor is not a collapsed pane', () => {
  it('0, 30, 30, 80 is not collapsed, and is only final at the end', () => {
    // The exact life of a new pane: unmeasured, allocated at the floor, still there, rebalanced.
    const { seen, last } = replay([0, COLLAPSED_H, COLLAPSED_H, 80])
    expect(seen.map((s) => s.collapsed)).toEqual([false, false, false, false])
    // Every reading before the rebalance is provisional, so the loop keeps looking and the row is
    // never left on a guess.
    expect(seen.map((s) => s.measured)).toEqual([false, false, false, true])
    expect(last.collapsed).toBe(false)
  })

  it('0, 30, 30, 30, 30 after a collapse command is collapsed, and final at once', () => {
    const commanded = new Set([1])
    const { seen, last } = replay([0, COLLAPSED_H, COLLAPSED_H, COLLAPSED_H, COLLAPSED_H], commanded)
    expect(seen.every((s) => s.collapsed)).toBe(true)
    // The viewer's own doing: there is nothing to wait for, even on the very first look, before
    // any height has been read at all.
    expect(seen.every((s) => s.measured)).toBe(true)
    expect(last.collapsed).toBe(true)
  })

  it('a restore command clears it, whatever the height says next', () => {
    // Restore hands the pane its remembered height back. Even if the reading lags a frame behind
    // the command, the row must not keep offering restore on a pane that is already open.
    const { last } = replay([COLLAPSED_H, COLLAPSED_H], none)
    expect(last.collapsed).toBe(false)
  })

  it('a height nobody commanded still confirms a collapse once it holds', () => {
    // Corroboration, for a host that sets pane heights itself rather than through the commands.
    const held = Array.from({ length: FLOOR_CONFIRM_READINGS }, () => COLLAPSED_H)
    const { last } = replay([0, ...held])
    expect(last.collapsed).toBe(true)
    expect(last.measured).toBe(true)
  })

  it('and a streak broken by a rebalance does not carry over', () => {
    // Two looks at the floor, then up, then short again for one look: that is not a collapse.
    const { last } = replay([COLLAPSED_H, COLLAPSED_H, 80, COLLAPSED_H])
    expect(last.collapsed).toBe(false)
  })

  it('an overlay row is final without a pane height at all', () => {
    // Not pane-placed, so there is nothing to wait for and no reading to publish.
    const r = collapsedReadings([{ id: 'sma-20' }], { 'sma-20': 0 }, [159], none, {})
    expect(r.measured).toBe(true)
    expect(r.collapsed['sma-20']).toBeUndefined()
  })

  it('the floor rule at its source: zero is unknown, the floor is short', () => {
    expect(isCollapsed(0)).toBe(false)
    expect(isCollapsed(COLLAPSED_H)).toBe(true)
    expect(isCollapsed(COLLAPSED_H + 1)).toBe(false)
    expect(isCollapsed(undefined)).toBe(false)
  })
})
