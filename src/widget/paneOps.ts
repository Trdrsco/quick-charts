// The pane operations a viewer runs on a chart's panes: collapse a pane to its floor, maximize it
// over the others, and restore it. The plans are `panePlan`'s; this module applies them and keeps
// what a restore needs, so the legend's row controls and the panes' own buttons run one set of
// operations over one memory.
//
// What a pane remembers is keyed by what lives in it (an indicator, a comparison), not by its index,
// because indices shift as panes come and go. The main pane maximizes by collapsing every other
// pane that stands open, and restores exactly the panes that maximize collapsed.
import type { IChartApi } from 'lightweight-charts'
import { COLLAPSED_H, isCollapsed, planPaneOp } from '../panePlan'
import type { ComparePlane } from './compare'
import type { IndicatorsPlane } from './indicators'

export type PaneOp = 'collapse' | 'maximize' | 'restore'

export interface PaneOps {
  /** Run one operation on the pane at an index. */
  run(pane: number, op: PaneOp): void
  /** The height a pane remembers from before its collapse or maximize, by what lives in it. */
  remembered(key: string): number | undefined
  /** The key of what lives in the pane at an index: `main`, `indicator:<id>` or `compare:<symbol>`. */
  keyOf(pane: number): string | undefined
  /** Whether the pane at an index reads collapsed, and whether it stands maximized. */
  collapsed(pane: number): boolean
  maximized(pane: number): boolean
  /** Forget what panes that no longer exist remembered. */
  prune(): void
}

export interface PaneOpsDeps {
  chart: IChartApi
  indicators: IndicatorsPlane
  compare: ComparePlane | null
}

export function attachPaneOps(deps: PaneOpsDeps): PaneOps {
  const remembered = new Map<string, number>()
  /** The panes the main pane's maximize collapsed, by key, which its restore opens again. */
  const collapsedForMain = new Set<string>()

  const keys = (): Record<number, string> => {
    const out: Record<number, string> = { 0: 'main' }
    for (const [id, pane] of Object.entries(deps.indicators.renderer.paneOf())) if (pane > 0) out[pane] = `indicator:${id}`
    for (const entry of deps.compare?.api.list() ?? []) {
      const pane = deps.compare!.handle.paneIndexOf(entry.symbol)
      if (pane !== null && pane > 0) out[pane] = `compare:${entry.symbol}`
    }
    return out
  }

  const heightOf = (pane: number): number => deps.chart.panes()[pane]?.getHeight() ?? 0

  /** Apply one plan for a pane other than the main one. */
  const apply = (pane: number, op: PaneOp): void => {
    const panes = deps.chart.panes()
    const heights: Record<number, number> = {}
    panes.forEach((p, i) => (heights[i] = p.getHeight()))
    const byIndex = keys()
    const held: Record<number, number> = {}
    for (const [index, key] of Object.entries(byIndex)) {
      const height = remembered.get(key)
      if (height !== undefined) held[Number(index)] = height
    }
    const plan = planPaneOp({ heights, remembered: held }, { kind: op, pane })
    remembered.clear()
    for (const [index, height] of Object.entries(plan.remembered)) {
      const key = byIndex[Number(index)]
      if (key) remembered.set(key, height)
    }
    for (const [i, h] of Object.entries(plan.apply)) {
      const index = Number(i)
      panes[index]?.setHeight(h)
      // The plan is the record of what the viewer asked for, so it is what a row reports: a
      // maximize collapses every OTHER pane, which is why the whole plan is read rather than just
      // the pane the operation named.
      if (index > 0) deps.indicators.setPaneCollapsed(index, h <= COLLAPSED_H)
    }
  }

  const ops: PaneOps = {
    run(pane, op) {
      if (pane === 0) {
        const byIndex = keys()
        if (op === 'maximize') {
          for (const [index, key] of Object.entries(byIndex)) {
            const at = Number(index)
            if (at === 0 || isCollapsed(heightOf(at))) continue
            apply(at, 'collapse')
            collapsedForMain.add(key)
          }
        } else if (op === 'restore') {
          for (const [index, key] of Object.entries(byIndex)) {
            if (!collapsedForMain.has(key)) continue
            apply(Number(index), 'restore')
          }
          collapsedForMain.clear()
        }
      } else {
        // A pane the viewer works on by itself is no longer the main pane's to give back.
        const key = keys()[pane]
        if (key) collapsedForMain.delete(key)
        apply(pane, op)
      }
      deps.indicators.recompute()
    },
    remembered: (key) => remembered.get(key),
    keyOf: (pane) => keys()[pane],
    collapsed: (pane) => pane > 0 && isCollapsed(heightOf(pane)),
    maximized(pane) {
      if (pane === 0) {
        const byIndex = keys()
        return Object.entries(byIndex).some(([index, key]) => collapsedForMain.has(key) && isCollapsed(heightOf(Number(index))))
      }
      const key = keys()[pane]
      const height = key ? remembered.get(key) : undefined
      return height !== undefined && !isCollapsed(heightOf(pane)) && heightOf(pane) > height
    },
    prune() {
      const alive = new Set(Object.values(keys()))
      for (const key of remembered.keys()) if (!alive.has(key)) remembered.delete(key)
      for (const key of collapsedForMain) if (!alive.has(key)) collapsedForMain.delete(key)
    },
  }
  return ops
}
