// The legend's wiring: what each control means, and where its intent goes.
//
// The legend itself owns no chart state. It reports an intent, this module turns that intent into a
// call on the plane that owns the state, and the resulting recompute pushes fresh rows back. The
// row list is ONE list, indicator rows followed by compare rows, so a compare row and a study row
// cannot end up rendered by two different passes and disagree.
import type { IChartApi } from 'lightweight-charts'
import { mountChartLegend, type ChartLegend, type LegendChip } from '../chartLegend'
import type { ChartI18n } from '../i18n'
import { openInputsEditor } from '../inputsEditor'
import { manifestInputDefaults } from '../indicatorModel'
import { COLLAPSED_H, planPaneOp } from '../panePlan'
import type { ScaleMode } from '../scaleMode'
import type { MarketStatus, SessionModel, SessionState } from '../sessionModel'
import { openMarketStatus } from '../ui/chrome/marketStatus'
import type { MenuHandle } from '../ui/chrome/menu'
import type { IndicatorsPlane } from './indicators'
import type { ComparePlane } from './compare'
import type { CommandRegistry } from './commands'

/** The compare-row id prefix. A compare row and a study row share one list, so the prefix is what
 *  tells the two apart without a second lookup. */
export const COMPARE_ROW_PREFIX = 'cmp:'

export interface LegendPlane {
  /** Push the current rows: indicator rows, then compare rows. */
  push(): void
  setHeader(symbol: string, tf: string): void
  setDot(state: SessionState | null): void
  syncScale(mode: ScaleMode): void
  destroy(): void
}

export interface LegendDeps {
  /** The chart's ONE command registry. Every control below runs through it, so the legend cannot
   *  reach a verb the access policy refuses or a feature flag has switched off. */
  commands: CommandRegistry
  chart: IChartApi
  /** The chrome subtree the legend mounts into. */
  chrome: HTMLElement
  i18n: ChartI18n
  enabled: boolean
  /** Whether the dot opens the market-status popup. */
  marketStatus: boolean
  indicators: IndicatorsPlane
  compare: ComparePlane | null
  scaleMode(): ScaleMode
  /** The symbol's session model and status, for the popup. */
  sessionModel(): SessionModel | null
  status(nowSecs: number): MarketStatus | null
  /** The chrome's indicator settings door. False when no dialog took the request, in which case
   *  the inputs-only editor opens at the gear. */
  openIndicatorSettings(instanceId: string): boolean
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
  /** The market-status popup while it is open, so teardown closes it. */
  let status: MenuHandle | null = null

  legend = mountChartLegend(deps.chrome, deps.i18n, {
    // Every row control is a COMMAND. The legend states an intent by id and the registry decides
    // whether it may run, so a verb the host forbade cannot be reached by clicking either.
    onToggleEye: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) {
        const symbol = id.slice(COMPARE_ROW_PREFIX.length)
        const entry = deps.compare?.api.list().find((e) => e.symbol === symbol)
        if (entry) deps.commands.execute('chart.compare.setVisible', { symbol, visible: !entry.visible })
        return
      }
      deps.commands.execute(deps.indicators.isHidden(id) ? 'chart.indicators.show' : 'chart.indicators.hide', id)
    },
    onTitle: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.commands.execute('chart.compare.changeSymbol', id.slice(COMPARE_ROW_PREFIX.length))
    },
    onRemove: (id) => {
      if (id.startsWith(COMPARE_ROW_PREFIX)) deps.commands.execute('chart.compare.remove', id.slice(COMPARE_ROW_PREFIX.length))
    },
    ...(deps.compare ? { onCompare: () => deps.commands.execute('chart.compare.open') } : {}),
    ...(deps.marketStatus
      ? {
          onStatus: (anchor: HTMLElement) => {
            status?.close()
            status = openMarketStatus(anchor, {
              host: deps.chrome,
              i18n: deps.i18n,
              model: deps.sessionModel,
              status: deps.status,
              onClose: () => {
                status = null
              },
            })
          },
        }
      : {}),
    onScaleMode: (mode) => deps.commands.execute(`chart.scale.${mode}`),
    onSettings: (id, rect) => {
      // The settings dialog takes the gear when the chrome serves one; otherwise the inputs-only
      // editor opens at the gear, as the smallest surface that still edits the declaration.
      if (deps.openIndicatorSettings(id)) return
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
      for (const [i, h] of Object.entries(plan.apply)) {
        const index = Number(i)
        panes[index]?.setHeight(h)
        // The plan is the record of what the viewer asked for, so it is what the row reports. A
        // maximize collapses every OTHER pane, which is why this reads the whole plan rather than
        // just the pane the command named. Reading the heights back instead would be guesswork:
        // a pane is born at the floor and rebalanced later, so short and collapsed look identical
        // for the first frames of a pane's life.
        if (index > 0) deps.indicators.setPaneCollapsed(index, h <= COLLAPSED_H)
      }
      deps.indicators.recompute()
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
    setDot: (state) => legend?.setDot(state),
    syncScale: (mode) => legend?.syncScale(mode),
    destroy() {
      status?.close()
      status = null
      legend?.destroy()
      legend = null
    },
  }
}
