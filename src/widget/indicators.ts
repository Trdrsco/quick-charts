// The indicator pipeline: instance, then the host-supplied compute, then the shared manifest
// walker, then the shared renderer. Identical to what a richer host runs over the same seams, so a
// definition renders the same everywhere: panes, histograms, areas, markers, levels, band fills,
// volume-scale plots.
//
// Two rules shape everything here. A compute that throws is skipped for that round rather than
// sinking the chart. And a hidden instance renders nothing (its series come down) but keeps its
// legend row, so the eye can bring it back. Hidden is part of the instance override record, which
// is also what the saved chart carries.
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { FeedBar } from '../datafeed'
import type { ChartI18n, ChartMessageKey, ChartTranslate } from '../i18n'
import type { LegendChip } from '../chartLegend'
import { createPriceFormatter, type PriceFormatter } from '../priceFormatter'
import { BUILT_IN_INDICATORS, INDICATOR_PALETTE } from '../builtInIndicators'
import { applyPlotOverrides, buildManifestPlots, effectivePlotColor, indicatorHidden, latestPlotValue, manifestInputDefaults, overriddenManifest, plotValueAt } from '../indicatorModel'
import { attachIndicators, type IndicatorsRenderer } from '../indicatorRenderer'
import { isCollapsed } from '../panePlan'
import type { CanvasTheme } from '../theme/renderer'
import type { AccessPolicy, IndicatorDefinition, IndicatorInstance } from './options'
import { indicatorPermitted } from './access'
import { indicatorOffered, type OfferedIndicators } from './offeredIndicators'
import type { IndicatorEvent } from './events'
import { restoreIndicatorInstance, type SavedIndicator } from './saveLoad'

/** The title a mounted indicator wears: the host's own, else the manifest's name, else the chart
 *  catalog's name for a definition carrying a `nameKey` (every built-in does), else the instance
 *  id. Exported for tests. */
export function indicatorTitleOf(inst: IndicatorInstance, t: ChartTranslate): string {
  if (inst.title) return inst.title
  if (inst.definition.manifest.name) return inst.definition.manifest.name
  const key = (inst.definition as { nameKey?: unknown }).nameKey
  return typeof key === 'string' ? t(key as ChartMessageKey) : inst.id
}

/** The short mark a legend row wears: the definition's own locale-neutral tag ("SMA", "%R") when it
 *  declares one, else the full title. The period and the source live in the input readout beside it,
 *  so the mark never repeats them. A settings surface keeps the full title. */
export function indicatorMarkOf(inst: IndicatorInstance, t: ChartTranslate): string {
  if (inst.title) return inst.title
  const tag = (inst.definition as { tag?: unknown }).tag
  return typeof tag === 'string' && tag ? tag : indicatorTitleOf(inst, t)
}

/** The compact input readout that follows the mark, e.g. "(2, Close)". An enum resolves its index to
 *  its own option, title-cased; a number prints as it stands. Empty when the indicator takes no
 *  input. */
export function indicatorInputsOf(inst: IndicatorInstance): string {
  const inputs = inst.definition.manifest.inputs
  if (!inputs) return ''
  const parts = Object.entries(inputs).map(([key, spec]) => {
    const value = inst.inputs?.[key] ?? spec.default
    if (spec.kind === 'enum' && spec.options) {
      const label = spec.options[value] ?? String(value)
      return label.charAt(0).toUpperCase() + label.slice(1)
    }
    return String(value)
  })
  return parts.length ? `(${parts.join(', ')})` : ''
}

/** The color a saved per-type default pinned on the primary plot, if it pinned one. A pinned color
 *  is the viewer's own standing choice for that indicator, so it wins and consumes no palette
 *  slot. */
function pinnedColor(instance: IndicatorInstance): string | undefined {
  const primary = Object.keys(instance.definition.manifest.plots)[0]
  return primary ? instance.overrides?.plots?.[primary]?.color : undefined
}

/** Return the same instance with the persisted hidden flag changed. Clearing the only display
 *  override removes the empty records too, so a never-styled instance keeps its original shape. */
export function withHidden(instance: IndicatorInstance, hidden: boolean): IndicatorInstance {
  if (indicatorHidden(instance.overrides) === hidden) return instance
  const { hidden: _hidden, ...display } = instance.overrides?.display ?? {}
  const nextDisplay = hidden ? { ...display, hidden: true } : display
  const { display: _display, ...rest } = instance.overrides ?? {}
  const overrides = Object.keys(nextDisplay).length > 0 ? { ...rest, display: nextDisplay } : rest
  const { overrides: _overrides, ...bare } = instance
  return Object.keys(overrides).length > 0 ? { ...bare, overrides } : bare
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
 *  at one recompute per this many milliseconds, with a trailing run so the final tick of a burst
 *  still lands. */
const TICK_CAP_MS = 1000

/** The indicator plane over one chart. */
export interface IndicatorsPlane {
  renderer: IndicatorsRenderer
  /** The configured instances. */
  list(): readonly IndicatorInstance[]
  /** Replace the list. Removed ids tear down and panes sweep. An instance the chart does not hold
   *  whose built-in the host's list leaves out, or whose definition the access policy refuses, is
   *  not added; one it holds stays editable. */
  set(next: readonly IndicatorInstance[]): void
  /** Add one, unless the host's list leaves its built-in out or the access policy refuses it.
   *  Answers whether it was added. */
  add(instance: IndicatorInstance): boolean
  remove(id: string): void
  /** Patch one instance's inputs. */
  patchInputs(id: string, patch: Record<string, number>): void
  /** The ids whose instance records say hidden. */
  hidden(): readonly string[]
  /** Apply the stored opening eye state to the named mount-time instances. An instance already
   *  hidden in its own record remains hidden. */
  setHidden(ids: readonly string[]): void
  toggleHidden(id: string): void
  isHidden(id: string): boolean
  /** Replace the list from saved records. A restore puts back content, it never adds, so an
   *  instance whose definition the access policy refuses is restored like any other. A record whose
   *  definition the chart cannot resolve is omitted and counted so the caller can report partial
   *  application and withhold recovery certification. */
  restore(saved: readonly SavedIndicator[]): { dropped: number }
  /** Restore the exact live list after a failed load, including anonymous host definitions. */
  restoreHeld(instances: readonly IndicatorInstance[]): void
  /** Record what a pane command did, which is what makes a row read collapsed. The widget calls
   *  this as it applies a collapse, restore or maximize; heights alone never decide. */
  setPaneCollapsed(paneIndex: number, collapsed: boolean): void
  /** The drawing toolbar's eye: blank every indicator for the session without touching the hidden
   *  set the save blob carries. */
  setAllHidden(hidden: boolean): void
  allHidden(): boolean
  /** Recompute now and rebuild the legend rows. */
  recompute(): void
  /** Recompute under the tick cap: for the mid-bar live path only. */
  recomputeThrottled(): void
  /** The legend rows from the last recompute. */
  chips(): readonly LegendChip[]
  /** The same rows read AT a moment: every value taken at the last plot point at or before
   *  `time`, which is what a legend row shows while the crosshair stands on a bar. `null` is the
   *  resting reading and answers `chips()` itself. */
  chipsAt(time: number | null): readonly LegendChip[]
  destroy(): void
}

export interface IndicatorsDeps {
  chart: IChartApi
  /** The main series when it is candle-shaped, so an indicator that recolors bar bodies can reach
   *  it. Null under a bar, line, area, baseline or step-line style: those have no body to recolor,
   *  and answering with a series that cannot take the paint would be worse than answering with
   *  none. */
  candleSeries(): ISeriesApi<'Candlestick'> | null
  bars(): readonly FeedBar[]
  i18n: ChartI18n
  formatter(): PriceFormatter
  volumePrecision?(): number
  /** The symbol's price-format identity plus the language, for the renderer's fingerprint. */
  formatKey(): string
  /** The smallest move the symbol's format declares. */
  minMove(): number
  /** The theme in effect: an indicator with no declared color takes the neutral series ink. */
  canvas(): CanvasTheme
  access?: AccessPolicy
  /** The built-in indicators the host offers, or null (or absent) for every built-in. */
  offered?: OfferedIndicators
  /** True once the chart is down. */
  disposed(): boolean
  /** The rows changed: the legend and the compare rows are pushed together by the chart. */
  onChips(): void
  /** A structural change a host would want to save, and the event that reports it. */
  onEvent(event: IndicatorEvent): void
  /** The definition catalog shared by every chart in this widget. */
  catalog: IndicatorCatalog
}

/** Definitions that a saved record may resolve against. Built-ins are always available; host
 *  definitions remain available for the lifetime of the widget once any chart carries them. */
export interface IndicatorCatalog {
  carry(instances: readonly IndicatorInstance[]): void
  resolve(definitionId: string): IndicatorDefinition | undefined
}

export function createIndicatorCatalog(): IndicatorCatalog {
  const carried = new Map<string, IndicatorDefinition>()
  return {
    carry(instances) {
      for (const instance of instances) {
        const id = instance.definition.manifest.id
        if (id) carried.set(id, instance.definition)
      }
    },
    resolve: (id) => carried.get(id) ?? BUILT_IN_INDICATORS.find((definition) => definition.id === id),
  }
}

export function attachIndicatorsPlane(deps: IndicatorsDeps): IndicatorsPlane {
  let instances: IndicatorInstance[] = []
  /** The eye's blanket over every indicator: view state, never persisted. */
  let allHidden = false
  let chips: LegendChip[] = []
  /** Each drawn instance's first plot, kept so a hovered reading is a lookup rather than a second
   *  compute pass over the bars. */
  let readings = new Map<string, { data: readonly unknown[]; precision?: number }>()
  let lastRecompute = 0
  let trailer: ReturnType<typeof setTimeout> | null = null
  /** The indicator identities this widget's own collapse and maximize commands put at the floor.
   *  This is the authority on what is collapsed; heights only corroborate. Per chart and in memory:
   *  a collapsed pane is a viewing posture, and nothing in the save blob carries it. */
  const commandedIds = new Set<string>()
  /** Consecutive readings at the floor, per row, for a collapse nobody commanded. */
  let floorStreaks: Record<string, number> = {}
  /** Where the palette stands for THIS chart. Per plane, never global: two charts each deal from
   *  the top, so a second widget on the page does not open on the seventh color. */
  let paletteCursor = 0

  /** The color a newly MINTED instance opens with. Minting is the only moment a color is dealt: a
   *  restore, a hide, a theme change and a recompute all carry the colors the instances already
   *  hold, so nothing on screen is ever repainted behind the viewer. An explicit instance color and
   *  a pinned saved default both win outright and take no palette slot. */
  const withMintedColor = (instance: IndicatorInstance): IndicatorInstance => {
    if (instance.color !== undefined || pinnedColor(instance) !== undefined) return instance
    // A re-add of an id the chart already holds is an edit, not a mint: it keeps its color.
    const held = instances.find((i) => i.id === instance.id)?.color
    if (held !== undefined) return { ...instance, color: held }
    return { ...instance, color: INDICATOR_PALETTE[paletteCursor++ % INDICATOR_PALETTE.length]! }
  }

  const renderer = attachIndicators(deps.chart, {
    candles: deps.candleSeries,
    // An indicator that declares no precision writes its scale through the symbol formatter, so a
    // moving average on a Treasury reads in thirty-seconds like the bars beside it.
    symbolPriceFormat: () => ({ key: deps.formatKey(), formatter: (price) => deps.formatter().format(price), minMove: deps.minMove() }),
    neutral: () => deps.canvas().neutral,
  })

  /** Re-read the heights, correct any row whose reading changed, and answer whether the readings
   *  are final. */
  const syncCollapsedReadings = (rows: LegendChip[]): boolean => {
    const heights = deps.chart.panes().map((p) => p.getHeight())
    const paneOf = renderer.paneOf()
    const commandedPanes = new Set([...commandedIds].map(id => paneOf[id]).filter((pane): pane is number => pane !== undefined))
    const { collapsed, measured, streaks } = collapsedReadings(rows, paneOf, heights, commandedPanes, floorStreaks)
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

  const permitted = (inst: IndicatorInstance): boolean => indicatorPermitted(deps.access, inst.definition)
  /** Whether the host's list offers an instance's definition for adding. */
  const offered = (inst: IndicatorInstance): boolean => indicatorOffered(deps.offered ?? null, inst.definition)

  /** What a replacement list keeps under the host's list and the access policy. An instance whose
   *  definition is offered and permitted is kept. One the list leaves out or the policy refuses is
   *  an add when the chart does not hold its id, and is left out; when the chart holds it, it is an
   *  edit and kept, unless the edit would move it onto that definition from another, in which case
   *  the instance stays as it stands. Nothing already on the chart is dropped by a restriction. */
  const admitted = (next: readonly IndicatorInstance[]): IndicatorInstance[] =>
    next.flatMap((instance) => {
      if (offered(instance) && permitted(instance)) return [instance]
      const held = instances.find((i) => i.id === instance.id)
      if (!held) return []
      return [held.definition.manifest.id === instance.definition.manifest.id ? instance : held]
    })

  /** Replace and report structural differences. Restore/rollback arrivals are changes, not viewer
   *  adds. The caller decides what the list holds: `set` admits it first, a restore keeps every
   *  record it resolves, and a rollback puts back exactly what the chart held. */
  const replace = (next: readonly IndicatorInstance[], arrival: 'added' | 'changed'): void => {
    const before = instances
    // Carry what the host supplied even when today's policy refuses it, so a saved record naming
    // that definition resolves when it is restored.
    deps.catalog.carry(next)
    instances = [...next]
    renderer.prune(new Set(instances.map((instance) => instance.id)))
    recompute()
    const afterIds = new Set(instances.map((instance) => instance.id))
    for (const instance of before) if (!afterIds.has(instance.id)) deps.onEvent({ kind: 'removed', id: instance.id })
    const beforeById = new Map(before.map((instance) => [instance.id, instance]))
    for (const instance of instances) {
      const previous = beforeById.get(instance.id)
      if (!previous) deps.onEvent({ kind: arrival, id: instance.id })
      else if (previous !== instance) deps.onEvent({ kind: 'changed', id: instance.id })
    }
  }

  function recompute(): void {
    for (const id of commandedIds) if (!instances.some(inst => inst.id === id)) commandedIds.delete(id)
    lastRecompute = Date.now() // every direct (structural) run resets the tick cap
    const bars = deps.bars()
    const next: LegendChip[] = []
    const nextReadings = new Map<string, { data: readonly unknown[]; precision?: number }>()
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
        title: indicatorMarkOf(inst, deps.i18n.t),
        inputs: inst.overrides?.display?.inputsInStatusLine === false ? undefined : indicatorInputsOf(inst),
        color: effectivePlotColor(def.manifest, Object.keys(def.manifest.plots)[0] ?? '', inst.overrides, inst.color ?? ''),
        hasInputs: Object.keys(def.manifest.inputs ?? {}).length > 0,
        // Removable from the row itself: the settings dialog is the other door, and a host that
        // turns the picker off (its own library adds) would otherwise leave no way back out.
        removable: true,
        removeLabel: deps.i18n.t('legend.removeIndicator'),
        pane: placement === 'pane',
        // What the widget was told, not what the layout momentarily looks like. A pane is born at
        // the floor height and rebalanced a frame or two later, so geometry cannot be trusted here;
        // the settle loop below corroborates it afterwards.
        collapsed: paneIdx !== undefined && paneIdx > 0 && commandedIds.has(inst.id),
      }
      if (allHidden || indicatorHidden(inst.overrides)) {
        commandedIds.delete(inst.id)
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
      const volume = def.manifest.id === 'volume'
      const data = volume ? bars.map(bar => ({ time: bar.t, value: bar.v })) : built.plots[0]?.data ?? []
      const precision = volume ? deps.volumePrecision?.() ?? 0 : built.precision
      const statusLine = built.display?.valuesInStatusLine !== false
      nextReadings.set(inst.id, { data: statusLine ? data : [], ...(precision != null ? { precision } : {}) })
      const value = statusLine ? latestPlotValue(data) : null
      // An indicator that declares its precision writes its row at that precision; one that does
      // not is a value on the symbol's own price grid and writes through the symbol formatter.
      next.push({ ...base, value: value == null ? null : precision != null ? createPriceFormatter({ pricescale: 10 ** precision, minmov: 1 }, { locale: deps.i18n.tag() }).format(value) : formatter.format(value), hidden: false })
    }
    chips = next
    readings = nextReadings
    deps.onChips()
    scheduleCollapsedSync(next)
  }

  return {
    renderer,
    list: () => instances,
    set: (next) => {
      deps.catalog.carry(next)
      replace(admitted(next), 'added')
    },
    add(instance) {
      deps.catalog.carry([instance])
      if (!offered(instance) || !permitted(instance)) return false
      // The ONE add path: the package picker, a host's `indicators.add` and an automation adapter
      // all land here, so all three deal from the same palette in the same order.
      const minted = withMintedColor(instance)
      instances = [...instances.filter((i) => i.id !== minted.id), minted]
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
    hidden: () => instances.filter((instance) => indicatorHidden(instance.overrides)).map((instance) => instance.id),
    setHidden(ids) {
      const hidden = new Set(ids)
      instances = instances.map((instance) => (hidden.has(instance.id) ? withHidden(instance, true) : instance))
      recompute()
    },
    toggleHidden(id) {
      const current = instances.find((instance) => instance.id === id)
      if (!current) return
      const nowHidden = !indicatorHidden(current.overrides)
      instances = instances.map((instance) => (instance.id === id ? withHidden(instance, nowHidden) : instance))
      recompute()
      deps.onEvent({ kind: nowHidden ? 'hidden' : 'shown', id })
    },
    isHidden: (id) => instances.some((instance) => instance.id === id && indicatorHidden(instance.overrides)),
    restore(saved) {
      const restored: IndicatorInstance[] = []
      let dropped = 0
      for (const record of saved) {
        const instance = restoreIndicatorInstance(record, deps.catalog.resolve)
        if (!instance) {
          dropped++
          continue
        }
        restored.push(instance)
      }
      replace(restored, 'changed')
      return { dropped }
    },
    restoreHeld: (held) => replace(held, 'changed'),
    setPaneCollapsed(paneIndex, collapsed) {
      if (paneIndex <= 0) return // the price pane never collapses
      for (const [id, pane] of Object.entries(renderer.paneOf())) if (pane === paneIndex) {
        if (collapsed) commandedIds.add(id)
        else commandedIds.delete(id)
      }
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
    chipsAt(time) {
      if (time === null) return chips
      const formatter = deps.formatter()
      return chips.map((chip) => {
        const reading = readings.get(chip.id)
        if (!reading || chip.hidden || chip.note !== undefined) return chip
        const value = plotValueAt(reading.data, time)
        return { ...chip, value: value == null ? null : reading.precision != null ? createPriceFormatter({ pricescale: 10 ** reading.precision, minmov: 1 }, { locale: deps.i18n.tag() }).format(value) : formatter.format(value) }
      })
    },
    destroy() {
      if (trailer) clearTimeout(trailer)
      trailer = null
      readings.clear()
      renderer.destroy()
    },
  }
}
