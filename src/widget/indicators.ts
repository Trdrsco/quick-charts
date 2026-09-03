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

/** The collapsed reading for a set of legend rows against one freshly read height table, plus
 *  whether every pane-placed row now HAS a height. The renderer reports 0 for a pane it has not
 *  laid out yet, which is not the same fact as a short pane, so a 0 leaves the answer unmeasured
 *  and the caller looks again rather than publishing a guess. Pure, so the settle behavior is
 *  pinned without a renderer. Exported for tests. */
export function collapsedReadings(
  rows: readonly { id: string; pane?: boolean }[],
  paneOf: Readonly<Record<string, number>>,
  heights: readonly number[],
): { collapsed: Record<string, boolean>; measured: boolean } {
  const collapsed: Record<string, boolean> = {}
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
    const height = heights[index]
    if (height === undefined || height === 0) measured = false
    collapsed[row.id] = isCollapsed(height)
  }
  return { collapsed, measured }
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
  let chips: LegendChip[] = []
  let lastRecompute = 0
  let trailer: ReturnType<typeof setTimeout> | null = null

  const renderer = attachIndicators(deps.chart, {
    candles: deps.candleSeries,
    // A study that declares no precision writes its scale through the symbol formatter, so a
    // moving average on a Treasury reads in thirty-seconds like the bars beside it.
    symbolPriceFormat: () => ({ key: deps.formatKey(), formatter: (price) => deps.formatter().format(price), minMove: deps.minMove() }),
    neutral: () => deps.canvas().neutral,
  })

  /** A pane is laid out AFTER the frame that creates it, so rows built in the same frame read a
   *  height of 0. Re-read and correct any row whose reading changed; answer whether the readings
   *  are settled. */
  const syncCollapsedReadings = (rows: LegendChip[]): boolean => {
    const { collapsed, measured } = collapsedReadings(rows, renderer.paneOf(), deps.chart.panes().map((p) => p.getHeight()))
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
   *  the renderer is slow to lay out, short enough that a chart which never lays one out is not
   *  left with a frame loop running behind it. */
  const SETTLE_FRAMES = 30

  /** Look again each frame until the readings are measured, rather than betting the layout settles
   *  in exactly one. It does not when the feed goes idle right after mount: nothing else would ever
   *  recompute, and a row stuck on the 0 reading offers restore on a pane nobody collapsed. A newer
   *  recompute replaces `chips`, which ends the older loop. */
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
    const paneHeights = deps.chart.panes().map((p) => p.getHeight())
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
        collapsed: paneIdx !== undefined && paneIdx > 0 ? isCollapsed(paneHeights[paneIdx]) : false,
      }
      if (hiddenIds.has(inst.id) || indicatorHidden(inst.overrides)) {
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
