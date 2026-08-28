// COMPARE — other symbols beside the charted one, the reference's own model (its compare is a
// STUDY: legend-managed, three placements, removable from the legend or the dialog). This organ
// owns the data half the indicator pipeline never had: an indicator computes from the chart's own
// bars, a compare fetches ANOTHER symbol's bars through the same ChartDatafeed and follows its
// stream. Corpus: docs/corpus/chart-compare/.
//
// The three placements are the dialog's own verbs, captured verbatim off the reference:
//   'same-percent'  — a line on the MAIN pane's shared (right) scale. The renderer's Percentage
//                     scale mode does the % math (base = each series' first visible bar), so the
//                     host flips the scale mode rather than this organ computing percent series —
//                     one axis, every series on it in %, the observed reference behaviour.
//   'new-scale'     — a line on the main pane bound to the LEFT scale, absolute prices. The organ
//                     shows the left scale while any such compare lives and hides it again after.
//   'new-pane'      — a line on its own pane with its own scale, the non-price-study placement.
//
// ALIGNMENT: the time scale unions every series' timepoints, so a compare with bars outside the
// main series' window would EXTEND the axis — the reference's "Allow extend time scale", which is
// deliberately out of scope. Bars are therefore CLIPPED to the main window the host reports, and
// re-clipped as that window grows (scroll-back). Missing buckets stay missing — gaps are truth,
// never interpolated.
import type { IChartApi, ISeriesApi, LineData, UTCTimestamp } from 'lightweight-charts'
import { LineSeries } from 'lightweight-charts'
import type { ChartDatafeed, FeedBar } from './datafeed'

export type ComparePlacement = 'same-percent' | 'new-scale' | 'new-pane'

/** One curated quick-add row for the compare dialog (the reference's own widget option shape). */
export interface CompareSymbol {
  symbol: string
  title: string
}

/** One active compare, as hosts read it (legend rows, dialogs, serialization). */
export interface CompareEntry {
  symbol: string
  placement: ComparePlacement
  color: string
  visible: boolean
}

/** The serialized form carried inside the chart content blob — identical to CompareEntry today,
 *  named separately so the blob's shape is a declared contract rather than a coincidence. */
export type CompareSnapshot = CompareEntry

/** The reference's compare line palette order (first compare is its blue). Assigned by first
 *  unused slot, so removing a compare frees its color for the next one. */
export const COMPARE_COLORS: readonly string[] = ['#2962ff', '#f23645', '#089981', '#ff9800', '#9c27b0', '#00bcd4']

/** First palette color not already worn; wraps past the palette by reuse (better a repeat than an
 *  invented hue the theme never approved). */
export function pickCompareColor(used: readonly string[], palette: readonly string[] = COMPARE_COLORS): string {
  return palette.find((c) => !used.includes(c)) ?? palette[used.length % palette.length]!
}

/** Clip bars to the main series' window (inclusive). Null window ⇒ nothing renders yet — the main
 *  series has no bars, and a compare must never be the thing that gives the axis its range. */
export function clipToWindow(bars: readonly FeedBar[], window: { from: number; to: number } | null): FeedBar[] {
  if (!window) return []
  return bars.filter((b) => b.t >= window.from && b.t <= window.to)
}

/** Placement → where the series goes. Pane index for 'new-pane' is resolved at add time (the
 *  chart's CURRENT pane count), matching the indicator renderer's rule. */
export function seriesTargetOf(placement: ComparePlacement, paneCount: number): { paneIndex: number; priceScaleId?: string } {
  if (placement === 'new-pane') return { paneIndex: paneCount }
  if (placement === 'new-scale') return { paneIndex: 0, priceScaleId: 'left' }
  return { paneIndex: 0 } // same-percent: the main pane's default (right) scale
}

export interface CompareDeps {
  datafeed: ChartDatafeed
  /** The chart's CURRENT timeframe — read per fetch, never captured. */
  tf(): string
  /** The MAIN series' loaded bar window (epoch seconds, inclusive), or null before first paint.
   *  The organ clips every compare to it; the host calls `sync()` whenever it changes shape. */
  mainWindow(): { from: number; to: number } | null
  /** How many bars a fresh compare asks for when the main window is not yet known. */
  seedCountBack?: number
  /** Entries changed (add/remove/visibility/color) or a compare's latest value moved — hosts
   *  re-render their legend from `list()` / `latest()`. */
  onChange?(): void
}

export interface CompareHandle {
  /** Add a symbol (or re-place an existing one — adding a present symbol updates its placement
   *  rather than duplicating). No-op if the symbol equals the chart's own. */
  add(symbol: string, opts: { placement: ComparePlacement; color?: string; visible?: boolean }): void
  remove(symbol: string): void
  setVisible(symbol: string, visible: boolean): void
  list(): CompareEntry[]
  /** The latest clipped close for one compare, or null (no bars in window / unknown symbol). */
  latest(symbol: string): number | null
  /** The pane the compare's series currently lives on (0 = the main pane), or null for an unknown
   *  symbol — how a host places the compare's legend row in the right pane's group. Read live from
   *  the series, because 'new-pane' indices shift as other panes come and go. */
  paneIndexOf(symbol: string): number | null
  /** Percent change across the clipped window (last close vs the window's FIRST in-window close —
   *  the loaded-window approximation of the percent scale's first-visible-bar base), or null with
   *  fewer than one bar in window. What a same-percent legend row displays. */
  changePct(symbol: string): number | null
  /** True while any 'same-percent' compare lives — the host's cue to hold the percent scale. */
  hasSamePercent(): boolean
  /** The main window moved (older history paged in, live bars appended): re-clip, and fetch older
   *  compare history where the window now starts earlier than what is cached. */
  sync(): void
  /** The chart's timeframe changed: every compare refetches at the new bucket size. */
  setTimeframe(): void
  serialize(): CompareSnapshot[]
  /** Replace the whole set from a snapshot (restore path). Unknown placements are dropped. */
  restore(snapshot: readonly unknown[]): void
  destroy(): void
}

interface Slot {
  entry: CompareEntry
  series: ISeriesApi<'Line'>
  /** Full fetched history (unclipped) — the clip re-runs cheaply as the main window grows. */
  bars: FeedBar[]
  /** Earliest time already fetched, so a window growing older knows what to page in. */
  oldest: number | null
  unsubscribe: (() => void) | null
  /** Monotonic fetch stamp: a slow response landing after a re-key must not paint. */
  fetchSeq: number
}

const toLine = (b: FeedBar): LineData<UTCTimestamp> => ({ time: b.t as UTCTimestamp, value: b.c })

const PLACEMENTS: readonly ComparePlacement[] = ['same-percent', 'new-scale', 'new-pane']

export function attachCompare(chart: IChartApi, deps: CompareDeps): CompareHandle {
  const slots = new Map<string, Slot>()
  let destroyed = false
  const seedCountBack = deps.seedCountBack ?? 500

  const notify = () => deps.onChange?.()

  /** The left scale exists only while a 'new-scale' compare does — an empty left axis is chrome
   *  with nothing to say. */
  const syncLeftScale = () => {
    const wanted = [...slots.values()].some((s) => s.entry.placement === 'new-scale')
    chart.applyOptions({ leftPriceScale: { visible: wanted } })
  }

  const paint = (slot: Slot) => {
    const clipped = clipToWindow(slot.bars, deps.mainWindow())
    slot.series.setData(clipped.map(toLine))
  }

  const fetchInto = async (slot: Slot, range: { from?: number; to?: number; countBack?: number }, mode: 'replace' | 'prepend') => {
    const seq = ++slot.fetchSeq
    try {
      const page = await deps.datafeed.history(slot.entry.symbol, deps.tf(), range)
      if (destroyed || slot.fetchSeq !== seq || !slots.has(slot.entry.symbol)) return
      if (mode === 'replace') slot.bars = [...page.bars]
      else {
        // Prepend strictly-older bars; the seam bar (equal time) defers to what is already held.
        const first = slot.bars[0]?.t ?? Infinity
        slot.bars = [...page.bars.filter((b) => b.t < first), ...slot.bars]
      }
      slot.oldest = slot.bars[0]?.t ?? slot.oldest
      paint(slot)
      notify()
    } catch {
      // A compare that cannot load stays empty rather than tearing the chart down — the legend's
      // null value is the honest signal, matching the indicator pipeline's advisory posture.
    }
  }

  const subscribe = (slot: Slot) => {
    slot.unsubscribe?.()
    slot.unsubscribe = deps.datafeed.subscribeBars(slot.entry.symbol, deps.tf(), {
      onBars: (e) => {
        if (destroyed) return
        if (e.kind === 'snapshot') {
          // The transport's re-sync replaces the RECENT window; older paged-in bars stay — the
          // same seam rule the main series applies to its own snapshots.
          const first = e.bars[0]?.t
          slot.bars = first === undefined ? [...e.bars] : [...slot.bars.filter((b) => b.t < first), ...e.bars]
        } else {
          const bar = e.bar
          const last = slot.bars[slot.bars.length - 1]
          if (last && bar.t < last.t) return // history never rewrites on the live path
          if (last && bar.t === last.t) slot.bars[slot.bars.length - 1] = bar
          else slot.bars.push(bar)
        }
        slot.oldest = slot.bars[0]?.t ?? slot.oldest
        paint(slot)
        notify()
      },
    })
  }

  const seed = (slot: Slot) => {
    const w = deps.mainWindow()
    void fetchInto(slot, w ? { from: w.from, to: w.to } : { countBack: seedCountBack }, 'replace')
    subscribe(slot)
  }

  const dispose = (slot: Slot) => {
    slot.unsubscribe?.()
    slot.unsubscribe = null
    slot.fetchSeq++ // strand any in-flight fetch
    try {
      chart.removeSeries(slot.series)
    } catch {
      /* the chart may already be gone on teardown */
    }
  }

  const makeSeries = (entry: CompareEntry): ISeriesApi<'Line'> => {
    const target = seriesTargetOf(entry.placement, chart.panes().length)
    return chart.addSeries(
      LineSeries,
      {
        color: entry.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: entry.visible,
        visible: entry.visible,
        ...(target.priceScaleId ? { priceScaleId: target.priceScaleId } : {}),
      },
      target.paneIndex,
    )
  }

  const handle: CompareHandle = {
    add(symbol, opts) {
      if (destroyed || !symbol) return
      const existing = slots.get(symbol)
      if (existing) {
        if (existing.entry.placement === opts.placement) return // idempotent
        // Re-place: same data, a different home — the series moves, the bars stay.
        const bars = existing.bars
        dispose(existing)
        const entry: CompareEntry = { ...existing.entry, placement: opts.placement }
        const slot: Slot = { entry, series: makeSeries(entry), bars, oldest: bars[0]?.t ?? null, unsubscribe: null, fetchSeq: 0 }
        slots.set(symbol, slot)
        paint(slot)
        subscribe(slot)
        syncLeftScale()
        notify()
        return
      }
      const color = opts.color ?? pickCompareColor([...slots.values()].map((s) => s.entry.color))
      const entry: CompareEntry = { symbol, placement: opts.placement, color, visible: opts.visible ?? true }
      const slot: Slot = { entry, series: makeSeries(entry), bars: [], oldest: null, unsubscribe: null, fetchSeq: 0 }
      slots.set(symbol, slot)
      seed(slot)
      syncLeftScale()
      notify()
    },
    remove(symbol) {
      const slot = slots.get(symbol)
      if (!slot) return
      dispose(slot)
      slots.delete(symbol)
      syncLeftScale()
      notify()
    },
    setVisible(symbol, visible) {
      const slot = slots.get(symbol)
      if (!slot || slot.entry.visible === visible) return
      slot.entry.visible = visible
      slot.series.applyOptions({ visible, lastValueVisible: visible })
      notify()
    },
    list: () => [...slots.values()].map((s) => ({ ...s.entry })),
    latest(symbol) {
      const slot = slots.get(symbol)
      if (!slot) return null
      const clipped = clipToWindow(slot.bars, deps.mainWindow())
      return clipped[clipped.length - 1]?.c ?? null
    },
    paneIndexOf(symbol) {
      const slot = slots.get(symbol)
      if (!slot) return null
      try {
        return slot.series.getPane().paneIndex()
      } catch {
        return null // chart mid-teardown
      }
    },
    changePct(symbol) {
      const slot = slots.get(symbol)
      if (!slot) return null
      const clipped = clipToWindow(slot.bars, deps.mainWindow())
      const first = clipped[0]?.c
      const last = clipped[clipped.length - 1]?.c
      if (first === undefined || last === undefined || first === 0) return null
      return (last / first - 1) * 100
    },
    hasSamePercent: () => [...slots.values()].some((s) => s.entry.placement === 'same-percent'),
    sync() {
      const w = deps.mainWindow()
      for (const slot of slots.values()) {
        paint(slot)
        // The window now begins before anything fetched: page the older span in once.
        if (w && slot.oldest !== null && w.from < slot.oldest) {
          void fetchInto(slot, { from: w.from, to: slot.oldest }, 'prepend')
        }
      }
    },
    setTimeframe() {
      for (const slot of slots.values()) {
        slot.bars = []
        slot.oldest = null
        slot.series.setData([])
        seed(slot)
      }
    },
    serialize: () => [...slots.values()].map((s) => ({ ...s.entry })),
    restore(snapshot) {
      for (const slot of slots.values()) dispose(slot)
      slots.clear()
      for (const raw of snapshot) {
        const r = raw as Partial<CompareSnapshot> | null
        if (!r || typeof r.symbol !== 'string' || !r.symbol) continue
        if (!PLACEMENTS.includes(r.placement as ComparePlacement)) continue
        handle.add(r.symbol, {
          placement: r.placement as ComparePlacement,
          color: typeof r.color === 'string' ? r.color : undefined,
          visible: r.visible !== false,
        })
      }
      syncLeftScale()
      notify()
    },
    destroy() {
      destroyed = true
      for (const slot of slots.values()) dispose(slot)
      slots.clear()
    },
  }
  return handle
}
