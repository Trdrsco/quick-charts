// The legend's wiring: what each control means, and where its intent goes.
//
// The legend itself owns no chart state. It reports an intent, this module turns that intent into a
// call on the plane that owns the state, and the resulting recompute pushes fresh rows back. The
// row list is ONE list — indicator rows followed by compare rows — so a compare row and a study row
// cannot end up rendered by two different passes and disagree.
import type { IChartApi } from 'lightweight-charts'
import { mountChartLegend, type ChartLegend, type LegendChip } from '../chartLegend'
import type { ChartI18n } from '../i18n'
import { openInputsEditor } from '../inputsEditor'
import { manifestInputDefaults } from '../indicatorModel'
import { planPaneOp } from '../panePlan'
import type { ScaleMode } from '../scaleMode'
import type { MarketSession } from '../sessions'
import type { IndicatorsPlane } from './indicators'
import type { ComparePlane } from './compare'

/** The compare-row id prefix. A compare row and a study row share one list, so the prefix is what
 *  tells the two apart without a second lookup. */
export const COMPARE_ROW_PREFIX = 'cmp:'

export interface LegendPlane {
  /** Push the current rows: indicator rows, then compare rows. */
  push(): void
  setHeader(symbol: string, tf: string): void
  setDot(session: MarketSession | null): void
  syncScale(mode: ScaleMode): void
  destroy(): void
}

export interface LegendDeps {
  chart: IChartApi
  /** The chrome subtree the legend mounts into. */
  chrome: HTMLElement
  i18n: ChartI18n
  enabled: boolean
  indicators: IndicatorsPlane
  compare: ComparePlane | null
  scaleMode(): ScaleMode
  applyScaleMode(mode: ScaleMode): void
}

export function attachLegendPlane(deps: LegendDeps): LegendPlane {
  if (!deps.enabled) {
    return {
      push: () => undefined,
      setHeader: () => undefined,
      setDot: () => undefined,
      syncScale: () => undefined,
      destroy: () => undefined,
    }
  }

  /** Remembered pane heights for collapse, maximize and restore. */
  let paneRemembered: Record<number, number> = {}
  let legend: ChartLegend | null = null

  legend = mountChartLegend(deps.chrome, deps.i18n, {
    onToggleEye: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) {
        const symbol = id.slice(COMPARE_ROW_PREFIX.length)
        const entry = deps.compare?.api.list().find((e) => e.symbol === symbol)
        if (entry) deps.compare?.api.setVisible(symbol, !entry.visible)
        return
      }
      deps.indicators.toggleHidden(id)
    },
    onTitle: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.compare?.openDialog('change-symbol', id.slice(COMPARE_ROW_PREFIX.length))
    },
    onRemove: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.compare?.api.remove(id.slice(COMPARE_ROW_PREFIX.length))
    },
    ...(deps.compare ? { onCompare: () => deps.compare?.openDialog('compare') } : {}),
    onScaleMode: (mode) => deps.applyScaleMode(mode),
    onSettings: (id, rect) => {
      const inst = deps.indicators.list().find((i) => i.id === id)
      if (!inst) return
      openInputsEditor(
        deps.chrome,
        rect,
        inst.definition.manifest.inputs ?? {},
        { ...manifestInputDefaults(inst.definition.manifest), ...inst.inputs },
        (patch) => deps.indicators.patchInputs(id, patch),
        deps.i18n,
      )
    },
    onPaneOp: (id, op) => {
      const paneIdx = deps.indicators.renderer.paneOf()[id]
      if (paneIdx === undefined || paneIdx === 0) return
      const panes = deps.chart.panes()
      const heights: Record<number, number> = {}
      panes.forEach((p, i) => (heights[i] = p.getHeight()))
      const plan = planPaneOp({ heights, remembered: paneRemembered }, { kind: op, pane: paneIdx })
      paneRemembered = plan.remembered
      for (const [i, h] of Object.entries(plan.apply)) panes[Number(i)]?.setHeight(h)
      deps.indicators.recompute() // the row's collapsed state follows the new heights
    },
  })
  legend.syncScale(deps.scaleMode())

  return {
    push() {
      const rows: LegendChip[] = [...deps.indicators.chips(), ...(deps.compare?.chips() ?? [])]
      legend?.setChips(rows)
      // The strip anchors past the LEFT axis while a new-scale compare holds it up.
      try {
        legend?.setLeftInset(deps.chart.priceScale('left').width())
      } catch {
        /* chart mid-teardown */
      }
    },
    setHeader: (symbol, tf) => legend?.setHeader(symbol, tf),
    setDot: (session) => legend?.setDot(session),
    syncScale: (mode) => legend?.syncScale(mode),
    destroy() {
      legend?.destroy()
      legend = null
    },
  }
}
