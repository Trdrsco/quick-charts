// The pane operations a viewer runs on a chart's panes: collapse a pane to its floor, maximize it
// over the others, restore it, and move it one place up or down. The plans are `panePlan`'s; this
// module applies them and keeps what a restore needs, so the panes' own buttons and the commands
// run one set of operations over one memory.
//
// What a pane remembers is keyed by what lives in it (the main series, an indicator, a comparison),
// not by its index, because indices shift as panes come, go and move. A collapsed pane stands as a
// strip that shows its legend and its buttons and paints nothing else. A maximized pane, the main
// one included, takes the chart's whole height: every other pane gives up its share and stands
// hidden, and the restore gives every pane back the share it held, a collapsed one its strip.
//
// The ORDER of the panes is held the same way: a list of keys, top to bottom, that a move rewrites
// and saved content restores. A pane is drawn only while what lives in it is (an indicator's pane
// waits for its first bars), so the list keeps a place for a pane that is not drawn right now, and
// the panes are stood in its order again whenever one comes or goes. A pane the list does not name yet joins it at the bottom, where the renderer adds it.
import type { IChartApi } from 'lightweight-charts'
import { isCollapsed, planPaneOp } from '../panePlan'
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
  /** Whether the pane at an index reads collapsed, whether it stands maximized, and whether a
   *  maximized pane stands over it. */
  collapsed(pane: number): boolean
  maximized(pane: number): boolean
  hidden(pane: number): boolean
  /** Paint nothing in a collapsed pane and in a pane a maximize stands over, and everything again in
   *  the others. */
  conceal(): void
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
  /** Hears that a maximize began or ended: the dividers between panes stand hidden while one pane
   *  takes the chart. */
  maximizing?(on: boolean): void
}

export function attachPaneOps(deps: PaneOpsDeps): PaneOps {
  const remembered = new Map<string, number>()
  /** The pane a maximize stands over the chart, by key, and every pane's share of the chart's height
   *  before it, by key, which the restore gives back. */
  let maximizedKey: string | null = null
  let sharesBefore = new Map<string, number>()
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
    }
  }

  const canMove = (pane: number, direction: PaneMove): boolean => {
    // A renderer without its own reordering moves nothing: a pane is never rebuilt to fake a move.
    if (typeof deps.chart.swapPanes !== 'function') return false
    const count = deps.chart.panes().length
    if (!Number.isInteger(pane) || pane < 0 || pane >= count) return false
    return direction === 'up' ? pane > 0 : pane < count - 1
  }

  /** The key every pane is known by, a pane nothing is known to live in by its index. */
  const keyAt = (byIndex: Record<number, string>, index: number): string => byIndex[index] ?? `#${index}`

  /** Stand one pane over the whole chart: every pane's share is held, the pane takes all of it, and
   *  the others stand at the renderer's floor, hidden. */
  const maximize = (pane: number): void => {
    const panes = deps.chart.panes()
    if (panes.length < 2 || typeof panes[0]?.setStretchFactor !== 'function') return
    const byIndex = keys()
    sharesBefore = new Map(panes.map((p, index) => [keyAt(byIndex, index), p.getStretchFactor()]))
    const total = [...sharesBefore.values()].reduce((sum, share) => sum + share, 0)
    maximizedKey = keyAt(byIndex, pane)
    panes.forEach((p, index) => p.setStretchFactor(index === pane ? total : 0))
    deps.maximizing?.(true)
  }

  /** Give every pane back the share it held before the maximize. A pane that came since keeps its
   *  own. */
  const endMaximize = (): void => {
    if (maximizedKey === null) return
    const byIndex = keys()
    deps.chart.panes().forEach((p, index) => {
      const share = sharesBefore.get(keyAt(byIndex, index))
      if (share !== undefined) p.setStretchFactor(share)
    })
    maximizedKey = null
    sharesBefore = new Map()
    deps.maximizing?.(false)
  }

  const hidden = (pane: number): boolean => maximizedKey !== null && keyAt(keys(), pane) !== maximizedKey

  const conceal = (): void => {
    deps.chart.panes().forEach((p, index) => {
      const element = p.getHTMLElement?.()
      if (element) element.style.visibility = hidden(index) || ops.collapsed(index) ? 'hidden' : ''
    })
  }

  const ops: PaneOps = {
    run(pane, op) {
      const maximizedHere = maximizedKey !== null && keyAt(keys(), pane) === maximizedKey
      // A maximized pane's restore ends the maximize; every other operation begins from the panes'
      // own shares.
      if (op === 'restore' && maximizedHere) endMaximize()
      else {
        endMaximize()
        if (op === 'maximize') maximize(pane)
        else if (pane !== deps.mainPane()) apply(pane, op)
      }
      conceal()
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
      conceal()
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
    collapsed: (pane) => pane !== deps.mainPane() && !hidden(pane) && isCollapsed(heightOf(pane)),
    maximized: (pane) => maximizedKey !== null && keyAt(keys(), pane) === maximizedKey,
    hidden,
    conceal,
    prune() {
      const byIndex = keys()
      const alive = new Set(Object.values(byIndex))
      for (const key of remembered.keys()) if (!alive.has(key)) remembered.delete(key)
      // A maximize ends when its pane leaves the chart or a pane joins it.
      if (maximizedKey !== null) {
        const drawnKeys = deps.chart.panes().map((_, index) => keyAt(byIndex, index))
        if (!drawnKeys.includes(maximizedKey) || drawnKeys.some((key) => !sharesBefore.has(key))) {
          endMaximize()
          conceal()
        }
      }
      // The held order forgets only what left the chart: a hidden indicator keeps its place.
      const owned = new Set(owners())
      wanted = wanted.filter((key) => owned.has(key))
    },
  }
  return ops
}
