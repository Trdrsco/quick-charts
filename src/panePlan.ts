// Pane sizing plans (CAP-14/C5): the user-facing pane operations the renderer already supports
// (IPaneApi.getHeight/setHeight) but nothing exposed. The DECISIONS are pure here — what height
// every pane should get for a collapse / maximize / restore — so the DOM applier stays a loop over
// a computed map and the invariants (heights are conserved, nothing collapses to zero, restore is
// exact) are testable without a chart.

/** The collapsed height in px — a pane keeps its legend row visible so it can be restored from the
 *  same place it collapsed from. Zero would make the pane unreachable. This MUST equal the chart
 *  renderer's own minimum pane height (it clamps every setHeight to 30): a smaller target would be
 *  silently clamped upward, the applied height would read above the collapsed threshold, and
 *  isCollapsed would deny the restore affordance forever. */
export const COLLAPSED_H = 30

/** The main pane never shrinks below this, whatever a maximize asks for: an unreadable price pane
 *  is worse than an unmaximized study. */
export const MAIN_MIN_H = 80

export type PaneOp = { kind: 'collapse'; pane: number } | { kind: 'maximize'; pane: number } | { kind: 'restore'; pane: number }

export interface PaneState {
  /** Current heights by pane index, as the renderer reports them. */
  heights: Readonly<Record<number, number>>
  /** Heights remembered from BEFORE the pane's current collapse/maximize, by pane index. */
  remembered: Readonly<Record<number, number>>
}

export interface PanePlan {
  /** Heights to apply, by pane index (only entries that change). */
  apply: Record<number, number>
  /** The remembered-height map after the op (what a later restore reads). */
  remembered: Record<number, number>
}

const total = (h: Readonly<Record<number, number>>): number => Object.values(h).reduce((s, v) => s + v, 0)

/** Plan one pane operation. The TOTAL height is conserved exactly — the space a pane gives up goes
 *  to the main pane (0) and vice versa, because the chart's own height is fixed by its container;
 *  handing back a different sum would make the renderer redistribute unpredictably. */
export function planPaneOp(state: PaneState, op: PaneOp): PanePlan {
  const heights = { ...state.heights }
  const remembered = { ...state.remembered }
  const target = op.pane
  if (target === 0 || heights[target] === undefined) return { apply: {}, remembered } // main pane and unknown panes have no ops
  const sum = total(heights)
  const main = heights[0] ?? 0

  if (op.kind === 'collapse') {
    const cur = heights[target]!
    if (cur <= COLLAPSED_H) return { apply: {}, remembered } // already collapsed — idempotent
    remembered[target] = cur
    return { apply: { [target]: COLLAPSED_H, 0: main + (cur - COLLAPSED_H) }, remembered }
  }

  if (op.kind === 'maximize') {
    const cur = heights[target]!
    // Give the target every pixel the OTHER study panes are not using at their collapsed floor,
    // plus whatever the main pane can spare above its own floor.
    const others = Object.entries(heights).filter(([i]) => Number(i) !== 0 && Number(i) !== target)
    const apply: Record<number, number> = {}
    let freed = 0
    for (const [i, h] of others) {
      if (h > COLLAPSED_H) {
        remembered[Number(i)] = h
        apply[Number(i)] = COLLAPSED_H
        freed += h - COLLAPSED_H
      }
    }
    const mainGives = Math.max(0, main - MAIN_MIN_H)
    if (mainGives > 0) apply[0] = main - mainGives
    const grown = cur + freed + mainGives
    if (grown === cur && Object.keys(apply).length === 0) return { apply: {}, remembered } // nothing to gain
    remembered[target] = remembered[target] ?? cur
    apply[target] = grown
    void sum
    return { apply, remembered }
  }

  // restore: back to the remembered height, taking the difference from (or giving it to) main.
  const want = remembered[target]
  const cur = heights[target]!
  if (want === undefined || want === cur) return { apply: {}, remembered }
  const delta = want - cur
  const nextRemembered = { ...remembered }
  delete nextRemembered[target]
  return { apply: { [target]: want, 0: Math.max(MAIN_MIN_H, main - delta) }, remembered: nextRemembered }
}

/** Whether a pane currently reads as collapsed (drives which control the legend shows). */
export function isCollapsed(height: number | undefined): boolean {
  return height !== undefined && height <= COLLAPSED_H
}
