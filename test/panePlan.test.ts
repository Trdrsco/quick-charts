import { describe, expect, it } from 'vitest'
import { COLLAPSED_H, isCollapsed, MAIN_MIN_H, planPaneOp, type PaneState } from '../src/panePlan'

// The chart's height is fixed by its container, so every plan must CONSERVE the total: a plan that
// hands the renderer a different sum makes it redistribute on its own, which is how pane sizing
// drifts a few px per op until a study pane silently vanishes.
const sum = (h: Record<number, number>) => Object.values(h).reduce((s, v) => s + v, 0)
const applied = (state: PaneState, apply: Record<number, number>) => ({ ...state.heights, ...apply })

const three = (): PaneState => ({ heights: { 0: 300, 1: 100, 2: 80 }, remembered: {} })

describe('planPaneOp — collapse', () => {
  it('collapses to the floor and gives the space to the main pane, conserving the total', () => {
    const state = three()
    const plan = planPaneOp(state, { kind: 'collapse', pane: 1 })
    expect(plan.apply[1]).toBe(COLLAPSED_H)
    expect(sum(applied(state, plan.apply))).toBe(480)
    expect(plan.remembered[1]).toBe(100) // so restore is exact
  })

  it('is idempotent on an already-collapsed pane', () => {
    const state: PaneState = { heights: { 0: 374, 1: COLLAPSED_H, 2: 80 }, remembered: { 1: 100 } }
    expect(planPaneOp(state, { kind: 'collapse', pane: 1 }).apply).toEqual({})
  })

  it('never collapses to zero (the legend row must stay reachable)', () => {
    const plan = planPaneOp(three(), { kind: 'collapse', pane: 2 })
    expect(plan.apply[2]).toBeGreaterThan(0)
  })
})

describe('planPaneOp — maximize', () => {
  it('takes every spare pixel from sibling panes and the main pane, keeping the main floor', () => {
    const state = three()
    const plan = planPaneOp(state, { kind: 'maximize', pane: 1 })
    const after = applied(state, plan.apply)
    expect(after[2]).toBe(COLLAPSED_H) // the sibling gives way
    expect(after[0]).toBe(MAIN_MIN_H) // main keeps exactly its floor
    expect(after[1]).toBe(480 - COLLAPSED_H - MAIN_MIN_H)
    expect(sum(after)).toBe(480) // conserved
  })

  it('remembers the pre-maximize heights of every pane it shrank, so each restores exactly', () => {
    const plan = planPaneOp(three(), { kind: 'maximize', pane: 1 })
    expect(plan.remembered[1]).toBe(100)
    expect(plan.remembered[2]).toBe(80)
  })
})

describe('planPaneOp — restore', () => {
  it('returns the pane to its remembered height and gives the difference back to main', () => {
    const state: PaneState = { heights: { 0: 374, 1: COLLAPSED_H, 2: 80 }, remembered: { 1: 100 } }
    const plan = planPaneOp(state, { kind: 'restore', pane: 1 })
    const after = applied(state, plan.apply)
    expect(after[1]).toBe(100)
    expect(sum(after)).toBe(480)
    expect(plan.remembered[1]).toBeUndefined() // the memory is spent
  })

  it('a pane with nothing remembered is a no-op', () => {
    expect(planPaneOp(three(), { kind: 'restore', pane: 1 }).apply).toEqual({})
  })
})

describe('planPaneOp — guards', () => {
  it('the main pane and unknown panes have no operations', () => {
    expect(planPaneOp(three(), { kind: 'collapse', pane: 0 }).apply).toEqual({})
    expect(planPaneOp(three(), { kind: 'maximize', pane: 9 }).apply).toEqual({})
  })

  it('isCollapsed reads the floor, not a magic number', () => {
    expect(isCollapsed(COLLAPSED_H)).toBe(true)
    expect(isCollapsed(COLLAPSED_H + 1)).toBe(false)
    expect(isCollapsed(undefined)).toBe(false)
  })
})
