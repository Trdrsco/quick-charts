import { describe, expect, it } from 'vitest'
import { CLICK_SLOP, createPendingHolds, tapReleaseVerdict } from '../src/gestureRules'

// The gesture surface's money-safety rules. The DOM loop that applies them cannot run outside a
// real browser (the control overlay needs a 2d canvas), so the DECISIONS are pinned here instead:
// what makes a pressed ✕/⇄ commit, and when an optimistically-held level stops being shown.

describe('tapReleaseVerdict — a pressed money control commits only as a clean tap (AF-15)', () => {
  const tap = { downX: 100, downY: 100, upX: 100, upY: 100 }
  const same = { scope: 'rithmic|A1', symbol: 'ESU6' }

  it('commits: same spot, same control, same selection', () => {
    expect(tapReleaseVerdict({ ...tap, onSameControl: () => true, scopes: { captured: same, current: same } })).toBe('commit')
  })

  it('a press that strays beyond CLICK_SLOP never commits — and never pays for a hit test', () => {
    let hitTested = false
    const v = tapReleaseVerdict({
      ...tap,
      upX: 100 + CLICK_SLOP + 1,
      onSameControl: () => {
        hitTested = true
        return true
      },
      scopes: { captured: same, current: same },
    })
    expect(v).toBe('strayed')
    expect(hitTested).toBe(false)
  })

  it('the slop is inclusive: a release exactly CLICK_SLOP away is still a tap', () => {
    expect(tapReleaseVerdict({ ...tap, upX: 100 + CLICK_SLOP, upY: 100 - CLICK_SLOP, onSameControl: () => true })).toBe('commit')
  })

  it('gives a FINGER the wander a finger actually has', () => {
    // A thumb lands on a soft contact patch and rolls as it presses: 8px between down and up is a
    // tap the person experienced as still. Judged by the mouse's 4 it reads as an abandoned drag,
    // and the control it gets dropped on is the send button.
    const drifted = { ...tap, upX: 108, upY: 106, onSameControl: () => true }
    expect(tapReleaseVerdict(drifted)).toBe('strayed')
    expect(tapReleaseVerdict({ ...drifted, pointerType: 'touch' })).toBe('commit')
  })

  it('holds every other pointer to the strict number, and an unstated one reads as a mouse', () => {
    const past = { ...tap, upX: 100 + CLICK_SLOP + 1, onSameControl: () => true }
    expect(tapReleaseVerdict({ ...past, pointerType: 'mouse' })).toBe('strayed')
    expect(tapReleaseVerdict({ ...past, pointerType: 'pen' })).toBe('strayed')
    expect(tapReleaseVerdict(past)).toBe('strayed')
  })

  it('a finger still has a limit — a real drag is not a tap on any pointer', () => {
    expect(tapReleaseVerdict({ ...tap, upY: 160, pointerType: 'touch', onSameControl: () => true })).toBe('strayed')
  })

  it('a release no longer resting on the pressed control never commits (the line moved or reconciled away)', () => {
    expect(tapReleaseVerdict({ ...tap, onSameControl: () => false, scopes: { captured: same, current: same } })).toBe('missed')
  })

  it('a mid-gesture account switch aborts as scope_changed — the one verdict the caller surfaces', () => {
    const v = tapReleaseVerdict({ ...tap, onSameControl: () => true, scopes: { captured: same, current: { ...same, scope: 'rithmic|A2' } } })
    expect(v).toBe('scope_changed')
  })

  it('a mid-gesture symbol switch is a scope change too', () => {
    const v = tapReleaseVerdict({ ...tap, onSameControl: () => true, scopes: { captured: same, current: { ...same, symbol: 'NQU6' } } })
    expect(v).toBe('scope_changed')
  })

  it('pre-money controls (no scopes) carry no selection guard', () => {
    expect(tapReleaseVerdict({ ...tap, onSameControl: () => true })).toBe('commit')
  })
})

describe('createPendingHolds — the optimistic level hold (P-10)', () => {
  it('holds the sent price over a stale report, releases on agreement within tol, then passes reports through', () => {
    const holds = createPendingHolds(() => 1000)
    holds.hold('k', 105, 8000)
    expect(holds.shown('k', 100, 0.125)).toBe(105) // the pre-mutation re-read — held
    expect(holds.shown('k', 105.1, 0.125)).toBe(105.1) // within half a tick — agreement releases
    expect(holds.shown('k', 100, 0.125)).toBe(100) // released: later reports rule
  })

  it('expiry releases: a lost answer can never pin a lie past its window', () => {
    let t = 1000
    const holds = createPendingHolds(() => t)
    holds.hold('k', 105, 8000)
    expect(holds.shown('k', 100, 0.125)).toBe(105)
    t = 9001 // past until = 1000 + 8000
    expect(holds.shown('k', 100, 0.125)).toBe(100)
  })

  it('a rejected mutation clears every hold immediately — a refused price must stop being shown', () => {
    const holds = createPendingHolds(() => 1000)
    holds.hold('a', 105, 8000)
    holds.hold('b', 205, 8000)
    holds.clear()
    expect(holds.shown('a', 100, 0.125)).toBe(100)
    expect(holds.shown('b', 200, 0.125)).toBe(200)
  })

  it('unheld keys pass reports through untouched', () => {
    expect(createPendingHolds(() => 0).shown('nope', 42, 0.5)).toBe(42)
  })
})
