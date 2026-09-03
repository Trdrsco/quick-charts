// When a legend row may say "collapsed".
//
// The bug this pins was invisible in every screenshot: the oscillator's row showed a restore arrow
// on a pane nobody had collapsed, because the row was built in the same frame as the pane and the
// renderer reports a height of 0 until it lays one out. Zero satisfied "at or below the collapsed
// height", the row published that reading, the feed went idle, and nothing ever recomputed to
// correct it. The fix is to treat 0 as a fact not yet known rather than as a short pane.
import { describe, expect, it } from 'vitest'
import { collapsedReadings } from '../../src/widget/indicators'
import { COLLAPSED_H, isCollapsed } from '../../src/panePlan'

const rows = [
  { id: 'sma-20' }, // overlay-placed: shares the price pane, never pane-placed
  { id: 'osc-1', pane: true },
]
const paneOf = { 'sma-20': 0, 'osc-1': 1 }

describe('an unmeasured pane is not a collapsed pane', () => {
  it('reads unsettled while the fresh pane still reports 0', () => {
    const first = collapsedReadings(rows, paneOf, [159, 0])
    expect(first.measured).toBe(false) // so the caller looks again
    expect(first.collapsed['osc-1']).toBe(false) // and publishes the honest reading meanwhile
  })

  it('reads settled and open once the same pane reports its height', () => {
    const second = collapsedReadings(rows, paneOf, [159, 80])
    expect(second.measured).toBe(true)
    expect(second.collapsed['osc-1']).toBe(false)
  })

  it('still reports a pane the viewer really collapsed', () => {
    // The renderer clamps every applied height to COLLAPSED_H, so a real collapse never reads 0 and
    // treating 0 as unknown costs nothing.
    const collapsed = collapsedReadings(rows, paneOf, [209, COLLAPSED_H])
    expect(collapsed.measured).toBe(true)
    expect(collapsed.collapsed['osc-1']).toBe(true)
  })

  it('an overlay row is settled without a pane height at all', () => {
    // It is not pane-placed, so there is nothing to wait for and nothing to collapse.
    const overlay = collapsedReadings([{ id: 'sma-20' }], { 'sma-20': 0 }, [159])
    expect(overlay.measured).toBe(true)
    expect(overlay.collapsed['sma-20']).toBeUndefined()
  })

  it('the same rule at the source: zero is unknown, the clamp floor is collapsed', () => {
    expect(isCollapsed(0)).toBe(false)
    expect(isCollapsed(COLLAPSED_H)).toBe(true)
    expect(isCollapsed(COLLAPSED_H + 1)).toBe(false)
    expect(isCollapsed(undefined)).toBe(false)
  })
})
