// The indicator pipeline: instance, then the host-supplied compute, then the shared manifest
// walker, then the shared renderer. Identical to what a richer host runs over the same seams, so a
// definition renders the same everywhere: panes, histograms, areas, markers, levels, band fills,
// volume-scale plots.
//
// Two rules shape everything here. A compute that throws is skipped for that round rather than
// sinking the chart. And a hidden instance renders nothing (its series come down) but keeps its
// legend row, so the eye can bring it back.
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartMessageKey, ChartTranslate } from '../i18n'
import type { LegendChip } from '../chartLegend'
import type { PriceFormatter } from '../priceFormatter'
import { applyPlotOverrides, buildManifestPlots, indicatorHidden, latestPlotValue, manifestInputDefaults, overriddenManifest } from '../indicatorModel'
import { attachIndicators, type IndicatorsRenderer } from '../indicatorRenderer'
import { isCollapsed } from '../panePlan'
import type { CanvasTheme } from '../theme/renderer'
import type { AccessPolicy, IndicatorInstance } from './options'
import type { IndicatorEvent } from './events'

/** The title a mounted indicator wears: the host's own, else the manifest's name, else the chart
 *  catalog's name for a definition carrying a `nameKey` (every built-in does), else the instance
 *  id. Exported for tests. */
export function indicatorTitleOf(inst: IndicatorInstance, t: ChartTranslate): string {
  if (inst.title) return inst.title
  if (inst.definition.manifest.name) return inst.definition.manifest.name
  const key = (inst.definition as { nameKey?: unknown }).nameKey
  return typeof key === 'string' ? t(key as ChartMessageKey) : inst.id
}

/** How many consecutive readings at the floor height confirm a collapse nobody commanded.
 *
 *  A pane is BORN at the floor: the renderer allocates it there and rebalances it on a later
 *  layout pass. So "short right now" and "collapsed" are different facts, and only time separates
 *  them. A pane on its way from the floor to its real height passes through one or two readings; a
 *  pane that is actually collapsed stays. */
export const FLOOR_CONFIRM_READINGS = 4

/** What each legend row should say about its pane, given one reading of the heights.
 *
 *  Collapse is something a VIEWER does, so the widget's own record of who collapsed what is the
 *  authority: `commanded` holds the pane indices its collapse and maximize commands put at the
 *  floor, and a row in it reads collapsed immediately and settles immediately. Geometry is only
 *  corroboration, for a host that sets pane heights itself, and it may confirm a collapse only
 *  after the height has stayed at the floor for FLOOR_CONFIRM_READINGS consecutive looks.
 *
 *  `measured` answers whether this reading can be trusted as final, which is what tells the caller
 *  to stop looking. A height of 0 is a pane not yet laid out, and a height at the floor is a pane
 *  that may still be mid-rebalance; neither is final. Pure, so the whole settle behavior is pinned
 *  frame by frame without a renderer. Exported for tests. */
export function collapsedReadings(
  rows: readonly { id: string; pane?: boolean }[],
  paneOf: Readonly<Record<string, number>>,
  heights: readonly number[],
  commanded: ReadonlySet<number>,
  streaks: Readonly<Record<string, number>> = {},
): { collapsed: Record<string, boolean>; measured: boolean; streaks: Record<string, number> } {
  const collapsed: Record<string, boolean> = {}
  const nextStreaks: Record<string, number> = {}
  let measured = true
  for (const row of rows) {
    if (!row.pane) continue
    const index = paneOf[row.id]
    // No pane index, or the main pane: the row is not pane-placed after all and never reads
    // collapsed. That is a settled answer, not a missing one.
    if (index === undefined || index <= 0) {
      collapsed[row.id] = false
      continue
    }
    // The viewer's own doing. Nothing about the geometry can overrule it, and there is nothing to
    // wait for.
    if (commanded.has(index)) {
      collapsed[row.id] = true
      continue
    }
    const height = heights[index]
    if (height === undefined || height === 0) {
      // Not laid out yet. Say the honest thing meanwhile and look again.
      collapsed[row.id] = false
      measured = false
      continue
    }
    if (!isCollapsed(height)) {
      collapsed[row.id] = false
      continue
    }
    const streak = (streaks[row.id] ?? 0) + 1
    nextStreaks[row.id] = streak
    const confirmed = streak >= FLOOR_CONFIRM_READINGS
    collapsed[row.id] = confirmed
    // Still short, but not yet for long enough to call it: a pane rebalancing away from the floor
    // must not be latched as collapsed on the way past.
    if (!confirmed) measured = false
  }
  return { collapsed, measured, streaks: nextStreaks }
}

/** Live ticks arrive many times a second, and a full recompute per tick multiplies by every
 *  configured instance. Structural paints recompute immediately; the MID-BAR tick path is capped
 *  at this interval, with a trailing run so the final tick of a burst still lands. */
const TICK_CAP_MS = 1000

/** The indicator plane over one chart. */
export interface IndicatorsPlane {
  renderer: IndicatorsRenderer
  /** The configured instances. */
  list(): readonly IndicatorInstance[]
  /** Replace the list. Removed ids tear down and panes sweep. */
  set(next: readonly IndicatorInstance[]): void
  /** Add one, unless the access policy refuses it. Answers whether it was added. */
  add(instance: IndicatorInstance): boolean
  remove(id: string): void
  /** Patch one instance's inputs. */
  patchInputs(id: string, patch: Record<string, number>): void
  /** The hidden set, as the save blob carries it. */
  hidden(): readonly string[]
  setHidden(ids: readonly string[]): void
  toggleHidden(id: string): void
  isHidden(id: string): boolean
  /** Record what a pane command did, which is what makes a row read collapsed. The widget calls
   *  this as it applies a collapse, restore or maximize; heights alone never decide. */
  setPaneCollapsed(paneIndex: number, collapsed: boolean): void
  /** The drawing toolbar's eye: blank every study for the session without touching the hidden
   *  set the save blob carries. */
  setAllHidden(hidden: boolean): void
  allHidden(): boolean
  /** Recompute now and rebuild the legend rows. */
  recompute(): void
  /** Recompute under the tick cap: for the mid-bar live path only. */
  recomputeThrottled(): void
  /** The legend rows from the last recompute. */
  chips(): readonly LegendChip[]
  destroy(): void
}

export interface IndicatorsDeps {
  chart: IChartApi
  /** The main series when it is candle-shaped, so a study that recolors bar bodies can reach it.
   *  Null under a bar, line, area, baseline or step-line style: those have no body to recolor, and
   *  answering with a series that cannot take the paint would be worse than answering with none. */
  candleSeries(): ISeriesApi<'Candlestick'> | null
  bars(): readonly FeedBar[]
  i18n: ChartI18n
  formatter(): PriceFormatter
  /** The symbol's price-format identity plus the language, for the renderer's fingerprint. */
  formatKey(): string
  /** The smallest move the symbol's format declares. */
  minMove(): number
  /** The theme in effect: a study with no declared color takes the neutral series ink. */
  canvas(): CanvasTheme
  access?: AccessPolicy
  /** True once the chart is down. */
  disposed(): boolean
  /** The rows changed: the legend and the compare rows are pushed together by the chart. */
  onChips(): void
  /** A structural change a host would want to save, and the event that reports it. */
  onEvent(event: IndicatorEvent): void
}

export function attachIndicatorsPlane(deps: IndicatorsDeps): IndicatorsPlane {
  let instances: IndicatorInstance[] = []
  const hiddenIds = new Set<string>()
  /** The eye's blanket over every study: view state, never persisted. */
  let allHidden = false
  let chips: LegendChip[] = []
  let lastRecompute = 0
  let trailer: ReturnType<typeof setTimeout> | null = null
  /** The pane indices this widget's own collapse and maximize commands put at the floor. This is
   *  the authority on what is collapsed; heights only corroborate. Per chart and in memory: a
   *  collapsed pane is a viewing posture, and nothing in the save blob carries it. */
  const commandedPanes = new Set<number>()
  /** Consecutive readings at the floor, per row, for a collapse nobody commanded. */
  let floorStreaks: Record<string, number> = {}

  const renderer = attachIndicators(deps.chart, {
    candles: deps.candleSeries,
    // A study that declares no precision writes its scale through the symbol formatter, so a
    // moving average on a Treasury reads in thirty-seconds like the bars beside it.
    symbolPriceFormat: () => ({ key: deps.formatKey(), formatter: (price) => deps.formatter().format(price), minMove: deps.minMove() }),
    neutral: () => deps.canvas().neutral,
  })

  /** Re-read the heights, correct any row whose reading changed, and answer whether the readings
   *  are final. */
  const syncCollapsedReadings = (rows: LegendChip[]): boolean => {
    const heights = deps.chart.panes().map((p) => p.getHeight())
    const { collapsed, measured, streaks } = collapsedReadings(rows, renderer.paneOf(), heights, commandedPanes, floorStreaks)
    floorStreaks = streaks
    let changed = false
    for (const row of rows) {
      if (!row.pane) continue
      const next = collapsed[row.id] ?? false
      if (next !== row.collapsed) {
        row.collapsed = next
        changed = true
      }
    }
    if (changed) deps.onChips()
    return measured
  }

  /** How many frames to keep looking for a layout. Half a second at 60Hz: long enough for a pane
   *  the renderer is slow to lay out and rebalance, short enough that a chart which never lays one
   *  out is not left with a frame loop running behind it. */
  const SETTLE_FRAMES = 30

  /** Look again each frame until the readings are final, rather than betting the layout settles in
   *  any fixed number of frames. It does not settle on its own when the feed goes idle right after
   *  mount: nothing else would ever recompute, so whatever the last look saw is what the viewer is
   *  left with. A newer recompute replaces `chips`, which ends the older loop. */
  const scheduleCollapsedSync = (rows: LegendChip[]): void => {
    if (typeof requestAnimationFrame !== 'function' || !rows.some((c) => c.pane)) return
    let left = SETTLE_FRAMES
    const look = (): void => {
      if (deps.disposed() || chips !== rows || left <= 0) return
      left -= 1
      if (syncCollapsedReadings(rows)) return
      requestAnimationFrame(look)
    }
    requestAnimationFrame(look)
  }

  const permitted = (id: string): boolean => {
    if (!deps.access?.indicator) return true
    try {
      return deps.access.indicator(id) !== false
    } catch {
      return false
    }
  }

  function recompute(): void {
    lastRecompute = Date.now() // every direct (structural) run resets the tick cap
    const bars = deps.bars()
    const next: LegendChip[] = []
    const times = bars.map((b) => b.t as UTCTimestamp)
    const hasVolume = bars.some((b) => b.v > 0)
    // A blanked buffer (mid symbol or timeframe switch): clear plot data without teardown, or the
    // previous window's lines paint stale marks over the empty chart.
    if (bars.length === 0 && instances.length > 0) renderer.blank()
    const paneOfMap = renderer.paneOf()
    const formatter = deps.formatter()
    for (const inst of instances) {
      const def = inst.definition
      const title = indicatorTitleOf(inst, deps.i18n.t)
      const placement = def.manifest.pane === 'pane' ? ('pane' as const) : ('overlay' as const)
      const paneIdx = placement === 'pane' ? paneOfMap[inst.id] : undefined
      const base = {
        id: inst.id,
        title,
        hasInputs: Object.keys(def.manifest.inputs ?? {}).length > 0,
        pane: placement === 'pane',
        // What the widget was told, not what the layout momentarily looks like. A pane is born at
        // the floor height and rebalanced a frame or two later, so geometry cannot be trusted here;
        // the settle loop below corroborates it afterwards.
        collapsed: paneIdx !== undefined && paneIdx > 0 && commandedPanes.has(paneIdx),
      }
      if (allHidden || hiddenIds.has(inst.id) || indicatorHidden(inst.overrides)) {
        renderer.remove(inst.id)
        next.push({ ...base, value: null, hidden: true })
        continue
      }
      if (bars.length === 0) {
        next.push({ ...base, value: null, hidden: false })
        continue
      }
      // Honest gate: a volume-based definition on a feed that carries no volume draws nothing (an
      // all-zero flat line would be a lie), and the unavailable note says why.
      if (def.manifest.needsVolume && !hasVolume) {
        const note = deps.i18n.t('host.noVolume')
        renderer.render(inst.id, { placement, title, plots: [], unavailable: note })
        next.push({ ...base, value: null, note, hidden: false })
        continue
      }
      let channels: Readonly<Record<string, readonly (number | null)[]>>
      try {
        channels = def.compute(bars, { ...manifestInputDefaults(def.manifest), ...(inst.inputs ?? {}) })
      } catch {
        next.push({ ...base, value: null, hidden: false })
        continue
      }
      const manifest = overriddenManifest(def.manifest, inst.overrides)
      const built = applyPlotOverrides(buildManifestPlots({ manifest, plots: channels }, times, title, inst.color ?? deps.canvas().neutral), inst.overrides)
      renderer.render(inst.id, built)
      const value = latestPlotValue(built.plots[0]?.data)
      // A study that declares its precision writes its row at that precision; one that does not is
      // a value on the symbol's own price grid and writes through the symbol formatter.
      next.push({ ...base, value: value == null ? null : built.precision != null ? value.toFixed(built.precision) : formatter.format(value), hidden: false })
    }
    chips = next
    deps.onChips()
    scheduleCollapsedSync(next)
  }

  return {
    renderer,
    list: () => instances,
    set(next) {
      instances = next.filter((inst) => permitted(inst.id))
      renderer.prune(new Set(instances.map((i) => i.id)))
      recompute()
    },
    add(instance) {
      if (!permitted(instance.id)) return false
      instances = [...instances.filter((i) => i.id !== instance.id), instance]
      recompute()
      deps.onEvent({ kind: 'added', id: instance.id })
      return true
    },
    remove(id) {
      if (!instances.some((i) => i.id === id)) return
      instances = instances.filter((i) => i.id !== id)
      renderer.prune(new Set(instances.map((i) => i.id)))
      recompute()
      deps.onEvent({ kind: 'removed', id })
    },
    patchInputs(id, patch) {
      instances = instances.map((i) => (i.id === id ? { ...i, inputs: { ...i.inputs, ...patch } } : i))
      recompute()
      deps.onEvent({ kind: 'changed', id })
    },
    hidden: () => [...hiddenIds],
    setHidden(ids) {
      hiddenIds.clear()
      for (const id of ids) hiddenIds.add(id)
      recompute()
    },
    toggleHidden(id) {
      const nowHidden = !hiddenIds.has(id)
      if (nowHidden) hiddenIds.add(id)
      else hiddenIds.delete(id)
      recompute()
      deps.onEvent({ kind: nowHidden ? 'hidden' : 'shown', id })
    },
    isHidden: (id) => hiddenIds.has(id),
    setPaneCollapsed(paneIndex, collapsed) {
      if (paneIndex <= 0) return // the price pane never collapses
      if (collapsed) commandedPanes.add(paneIndex)
      else commandedPanes.delete(paneIndex)
      // The command is the fact; drop any half-built geometry streak so a later look starts clean.
      floorStreaks = {}
    },
    setAllHidden(hidden) {
      if (allHidden === hidden) return
      allHidden = hidden
      recompute()
    },
    allHidden: () => allHidden,
    recompute,
    recomputeThrottled() {
      const since = Date.now() - lastRecompute
      if (since >= TICK_CAP_MS) {
        recompute()
        return
      }
      if (trailer) return // a trailing run is already scheduled, so this burst is covered
      trailer = setTimeout(() => {
        trailer = null
        if (!deps.disposed()) recompute()
      }, TICK_CAP_MS - since)
    },
    chips: () => chips,
    destroy() {
      if (trailer) clearTimeout(trailer)
      trailer = null
      renderer.destroy()
    },
  }
}
