// The pane operations a viewer runs on a chart's panes: collapse a pane to its floor, maximize it
// over the others, restore it, and move it one place up or down. The plans are `panePlan`'s; this
// module applies them and keeps what a restore needs, so the legend's row controls and the panes'
// own buttons run one set of operations over one memory.
//
// What a pane remembers is keyed by what lives in it (the main series, an indicator, a comparison),
// not by its index, because indices shift as panes come, go and move. The main pane maximizes by
// collapsing every other pane that stands open, and restores exactly the panes that maximize
// collapsed.
//
// The ORDER of the panes is held the same way: a list of keys, top to bottom, that a move rewrites
// and saved content restores. A pane is drawn only while what lives in it is (a hidden indicator's
// pane comes down, and an indicator's pane waits for its first bars), so the list keeps a place for
// a pane that is not drawn right now, and the panes are stood in its order again whenever one comes
// or goes. A pane the list does not name yet joins it at the bottom, where the renderer adds it.
import type { IChartApi } from 'lightweight-charts'
import { COLLAPSED_H, isCollapsed, planPaneOp } from '../panePlan'
import type { ComparePlane } from './compare'
import type { IndicatorsPlane } from './indicators'

export type PaneOp = 'collapse' | 'maximize' | 'restore'

/** Which way a pane moves: one place up, or one place down. */
export type PaneMove = 'up' | 'down'

/** The key of the main series' pane. */
export const MAIN_PANE_KEY = 'main'
/** The key of a pane-placed indicator's pane. */
export const indicatorPaneKey = (id: string): string => `indicator:${id}`
/** The key of a comparison's own pane. */
export const comparePaneKey = (symbol: string): string => `compare:${symbol}`

/** The command that moves a pane each way. Its argument is the pane's index, the top pane 0. */
export const PANE_MOVE_COMMAND: Readonly<Record<PaneMove, string>> = { up: 'chart.panes.moveUp', down: 'chart.panes.moveDown' }

export interface PaneOps {
  /** Run one operation on the pane at an index. */
  run(pane: number, op: PaneOp): void
  /** Whether the pane at an index can move one place that way: never above the top or below the
   *  bottom. */
  canMove(pane: number, direction: PaneMove): boolean
  /** Swap the pane at an index with its neighbour above or below. Answers whether it moved. */
  move(pane: number, direction: PaneMove): boolean
  /** Every pane the chart holds a place for, top to bottom, by key: the drawn ones and those waiting
   *  to be drawn. */
  order(): string[]
  /** Hold an order and stand the panes in it. A key that names nothing on the chart is passed over,
   *  and a pane the order leaves out goes below the ones it names. */
  arrange(order: readonly string[]): void
  /** Stand the panes in the held order again, after a pane came or went. Answers whether any pane
   *  moved. */
  settle(): boolean
  /** The index of the pane the main series stands in. */
  main(): number
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
  /** The index of the pane the main series stands in. */
  mainPane(): number
  /** Hears that panes moved, so what is laid over them can follow. */
  moved?(): void
}

export function attachPaneOps(deps: PaneOpsDeps): PaneOps {
  const remembered = new Map<string, number>()
  /** The panes the main pane's maximize collapsed, by key, which its restore opens again. */
  const collapsedForMain = new Set<string>()
  /** The order the viewer asked for, top to bottom, by key. */
  let wanted: string[] = []

  const keys = (): Record<number, string> => {
    const main = deps.mainPane()
    const out: Record<number, string> = { [main]: MAIN_PANE_KEY }
    for (const [id, pane] of Object.entries(deps.indicators.renderer.paneOf())) if (pane !== main) out[pane] = indicatorPaneKey(id)
    for (const entry of deps.compare?.api.list() ?? []) {
      const pane = deps.compare!.handle.paneIndexOf(entry.symbol)
      if (pane !== null && pane !== main) out[pane] = comparePaneKey(entry.symbol)
    }
    return out
  }

  /** The drawn panes top to bottom, by key; a pane nothing is known to live in by its index. */
  const drawn = (): string[] => {
    const byIndex = keys()
    return deps.chart.panes().map((_, index) => byIndex[index] ?? `#${index}`)
  }

  /** Everything that takes a pane of its own, in the order the renderer adds them: the main series,
   *  the pane-placed indicators in the list's order, then the comparisons on panes of their own. A
   *  hidden indicator keeps its place. */
  const owners = (): string[] => [
    MAIN_PANE_KEY,
    ...deps.indicators.list().filter((instance) => instance.definition.manifest.pane === 'pane').map((instance) => indicatorPaneKey(instance.id)),
    ...(deps.compare?.api.list() ?? []).filter((entry) => entry.placement === 'new-pane').map((entry) => comparePaneKey(entry.symbol)),
  ]

  const order = (): string[] => {
    const all = owners()
    const present = new Set(all)
    const out = wanted.filter((key) => present.has(key))
    for (const key of all) if (!out.includes(key)) out.push(key)
    return out
  }

  const settle = (): boolean => {
    const now = drawn()
    const target = order().filter((key) => now.includes(key))
    const final = [...target, ...now.filter((key) => !target.includes(key))]
    if (final.every((key, index) => now[index] === key)) return false
    // A renderer without its own reordering leaves the panes where they stand.
    if (typeof deps.chart.panes()[0]?.moveTo !== 'function') return false
    // One pane at a time from the top, each moved to its place by the renderer's own reordering;
    // the panes below it shift as it leaves, so the order is read again after every move.
    for (let index = 0; index < final.length; index++) {
      const at = drawn().indexOf(final[index]!)
      if (at > index) deps.chart.panes()[at]?.moveTo(index)
    }
    deps.moved?.()
    return true
  }

  const heightOf = (pane: number): number => deps.chart.panes()[pane]?.getHeight() ?? 0

  /** Apply one plan for a pane other than the main one. */
  const apply = (pane: number, op: PaneOp): void => {
    const main = deps.mainPane()
    const panes = deps.chart.panes()
    const heights: Record<number, number> = {}
    panes.forEach((p, i) => (heights[i] = p.getHeight()))
    const byIndex = keys()
    const held: Record<number, number> = {}
    for (const [index, key] of Object.entries(byIndex)) {
      const height = remembered.get(key)
      if (height !== undefined) held[Number(index)] = height
    }
    const plan = planPaneOp({ heights, remembered: held, main }, { kind: op, pane })
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
      if (index !== main) deps.indicators.setPaneCollapsed(index, h <= COLLAPSED_H)
    }
  }

  const canMove = (pane: number, direction: PaneMove): boolean => {
    // A renderer without its own reordering moves nothing: a pane is never rebuilt to fake a move.
    if (typeof deps.chart.swapPanes !== 'function') return false
    const count = deps.chart.panes().length
    if (!Number.isInteger(pane) || pane < 0 || pane >= count) return false
    return direction === 'up' ? pane > 0 : pane < count - 1
  }

  const ops: PaneOps = {
    run(pane, op) {
      const main = deps.mainPane()
      if (pane === main) {
        const byIndex = keys()
        if (op === 'maximize') {
          for (const [index, key] of Object.entries(byIndex)) {
            const at = Number(index)
            if (at === main || isCollapsed(heightOf(at))) continue
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
    canMove,
    move(pane, direction) {
      if (!canMove(pane, direction)) return false
      const neighbour = direction === 'up' ? pane - 1 : pane + 1
      const now = drawn()
      const next = order()
      const from = next.indexOf(now[pane]!)
      const to = next.indexOf(now[neighbour]!)
      // The two keys trade places in the held order, a pane waiting to be drawn between them keeping
      // its own, and the renderer swaps the two panes themselves, series, heights and all.
      if (from >= 0 && to >= 0) {
        next[from] = now[neighbour]!
        next[to] = now[pane]!
      }
      wanted = next
      deps.chart.swapPanes(pane, neighbour)
      if (!settle()) deps.moved?.()
      return true
    },
    order,
    arrange(next) {
      wanted = [...next]
      settle()
    },
    settle,
    main: () => deps.mainPane(),
    remembered: (key) => remembered.get(key),
    keyOf: (pane) => keys()[pane],
    collapsed: (pane) => pane !== deps.mainPane() && isCollapsed(heightOf(pane)),
    maximized(pane) {
      if (pane === deps.mainPane()) {
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
      // The held order forgets only what left the chart: a hidden indicator keeps its place.
      const owned = new Set(owners())
      wanted = wanted.filter((key) => owned.has(key))
    },
  }
  return ops
}
