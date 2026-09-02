// The indicator RENDERER: owns every lightweight-charts object an indicator instance needs — one
// series per plot (overlays on the main pane, pane-placed groups on their own bottom pane), marker
// plugins for event glyphs, price lines for static levels, canvas painters for fills/shading, and
// per-bar candle recoloring. Framework-free and compute-free: a host builds an IndicatorPlots spec
// (the walker in indicatorModel) however it likes and hands it here; re-rendering an id re-feeds
// the existing series (style edits apply without teardown, so no flicker and no pane loss), and a
// STRUCTURAL change (a different plot count/kind sequence) tears the entry down and rebuilds —
// feeding a reshaped spec into mismatched series would silently drop or misstyle plots.
import {
  BaselineSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type LineWidth,
  type SeriesMarker,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { IndicatorPlot, IndicatorPlots } from './indicatorModel'
import { FillBetweenPrimitive, ShadePrimitive } from './indicatorPrimitives'
import { DARK_THEME } from './theme/palettes'

type Series = ISeriesApi<SeriesType>

/** Track an instance's live chart objects so a recompute re-feeds and a removal tears down.
 *  `markers[i]` is the marker-plugin handle for a marker-kind plot (null for other kinds);
 *  `paintedTimes` are the candle timestamps this entry recolored (stripped again on teardown).
 *  The fingerprints (`styleKeys`/`levelsKey`/`precisionKey`/`shapeKey`) make style re-application
 *  idempotent per recompute and detect structural reshapes. */
interface Entry {
  series: Series[]
  markers: (ISeriesMarkersPluginApi<UTCTimestamp> | null)[]
  fills: Map<string, FillBetweenPrimitive>
  shade: ShadePrimitive | null
  paintedTimes: Set<number>
  styleKeys: (string | null)[]
  levelsKey: string | null
  priceLines: IPriceLine[]
  /** The applied price format's identity: a manifest precision, or the symbol format's key. */
  precisionKey: string | null
  shapeKey: string
}

/** The symbol's price format, as a study scale falls back to it when the manifest declares no
 *  precision: the formatter writes the scale labels, `minMove` is the symbol's smallest move, and
 *  `key` changes whenever either does so the scale re-applies. */
export interface SymbolPriceFormat {
  key: string
  formatter: (price: number) => string
  minMove: number
}

/** The running renderer a host drives. */
export interface IndicatorsRenderer {
  /** Render (or re-render) one instance's built spec. A spec carrying `unavailable` removes the
   *  instance's chart objects (the note is the host's to surface). */
  render(id: string, built: IndicatorPlots): void
  remove(id: string): void
  /** Remove every rendered instance NOT in `keep` (list-sync after removals), sweeping panes. */
  prune(keep: ReadonlySet<string>): void
  has(id: string): boolean
  /** Live pane index per rendered instance — derived fresh on call, because pane indices shift
   *  whenever an emptied pane is swept. */
  paneOf(): Record<string, number>
  /** Clear every plot's data without tearing series down — for a blanked bar buffer during a
   *  symbol/timeframe switch, where stale lines over an empty pane would paint garbage. */
  blank(): void
  destroy(): void
}

export function attachIndicators(
  chart: IChartApi,
  options?: {
    candles?: () => ISeriesApi<'Candlestick'> | null
    /** The symbol's price format for studies that declare no precision. A host that supplies none
     *  leaves those scales on the library's own default formatting. */
    symbolPriceFormat?: () => SymbolPriceFormat
    /** The undirected ink a level line takes when the manifest declares no color of its own. Read
     *  live, so a theme switch repaints the levels with everything else; the built-in dark palette's
     *  neutral stands in for a host that supplies none. */
    neutral?: () => string
  },
): IndicatorsRenderer {
  const entries = new Map<string, Entry>()
  const candlesOf = options?.candles ?? (() => null)
  const symbolPriceFormat = options?.symbolPriceFormat ?? null
  const neutralOf = options?.neutral ?? (() => DARK_THEME['series.neutral'])

  const removeEntry = (id: string): void => {
    const entry = entries.get(id)
    if (!entry) return
    // Strip any candle recolor this entry applied before its objects go away.
    stripBarColors(entry, candlesOf())
    entry.series.forEach((s) => safeRemove(chart, s))
    entries.delete(id)
  }

  return {
    render(id, built) {
      if (built.unavailable) {
        if (entries.has(id)) {
          removeEntry(id)
          sweepEmptyPanes(chart)
        }
        return
      }
      let entry = entries.get(id)
      // A structural reshape (plot count/kind/placement changed — a re-published script, a
      // definition swap under the same id) rebuilds from scratch: feeding mismatched series would
      // silently drop the new plots or style the wrong ones.
      if (entry && entry.shapeKey !== shapeKeyOf(built)) {
        removeEntry(id)
        sweepEmptyPanes(chart)
        entry = undefined
      }
      if (!entry) {
        entry = makeEntry(chart, built, neutralOf())
        entries.set(id, entry)
      }
      built.plots.forEach((plot, i) => {
        entry.series[i]?.setData(plot.data)
        entry.markers[i]?.setMarkers(plot.visible === false ? [] : markersOf(plot))
      })
      applyEntryStyles(entry, built, symbolPriceFormat?.() ?? null, neutralOf())
      feedChannels(entry, built, candlesOf())
    },
    remove(id) {
      removeEntry(id)
      sweepEmptyPanes(chart)
    },
    prune(keep) {
      for (const id of [...entries.keys()]) if (!keep.has(id)) removeEntry(id)
      sweepEmptyPanes(chart)
    },
    has: (id) => entries.has(id),
    paneOf() {
      const panes = chart.panes()
      const out: Record<string, number> = {}
      for (const [id, entry] of entries) {
        const first = entry.series[0]
        if (!first) continue
        const idx = panes.findIndex((pane) => pane.getSeries().includes(first))
        out[id] = idx >= 0 ? idx : 0 // unresolved → the main pane
      }
      return out
    },
    blank() {
      for (const entry of entries.values()) {
        entry.series.forEach((s) => s.setData([]))
        entry.markers.forEach((m) => m?.setMarkers([]))
      }
    },
    destroy() {
      for (const id of [...entries.keys()]) removeEntry(id)
      entries.clear()
    },
  }
}

const MARKER_SHAPE: Record<NonNullable<IndicatorPlot['shape']>, SeriesMarker<UTCTimestamp>['shape']> = {
  circle: 'circle',
  square: 'square',
  'arrow-up': 'arrowUp',
  'arrow-down': 'arrowDown',
  // Triangles and cross approximate to the nearest native glyph until a custom primitive lands.
  'triangle-up': 'arrowUp',
  'triangle-down': 'arrowDown',
  cross: 'circle',
}

const LEVEL_STYLE: Record<string, LineStyle> = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted }

/** The above/below marker set for a marker-kind plot's current data (finite points = event bars). */
function markersOf(plot: IndicatorPlot): SeriesMarker<UTCTimestamp>[] {
  const position = plot.location === 'below' ? ('belowBar' as const) : ('aboveBar' as const)
  const out: SeriesMarker<UTCTimestamp>[] = []
  for (const p of plot.data) {
    const v = (p as { value?: unknown }).value
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ time: p.time, position, shape: MARKER_SHAPE[plot.shape ?? 'circle'], color: plot.color, ...(plot.text ? { text: plot.text } : {}) })
    }
  }
  return out
}

/** The structural identity of a built spec: what must match for series reuse to be sound. */
function shapeKeyOf(built: IndicatorPlots): string {
  return JSON.stringify([built.placement, built.plots.map((p) => [p.key, p.type, p.location === 'absolute', p.scale ?? null])])
}

/** Create one series per plot (plus marker plugins), attach the group's static levels to its first
 *  series, and wire the fill/shade painters. Overlays use the main pane (0); a pane-placed group
 *  gets a fresh pane appended at the bottom (every plot in the group shares it). */
function makeEntry(chart: IChartApi, built: IndicatorPlots, neutral: string): Entry {
  const paneIndex = built.placement === 'pane' ? chart.panes().length : 0
  // "Labels on price scale" (the standard output toggle, default ON): each visible value-carrying
  // plot shows its last value on the scale. Marker anchors never label.
  const labels = built.display?.labelsOnPriceScale !== false
  const series: Series[] = []
  const markers: (ISeriesMarkersPluginApi<UTCTimestamp> | null)[] = []
  for (const plot of built.plots) {
    const labeled = labels && plot.visible !== false
    if (plot.type === 'histogram') {
      series.push(chart.addSeries(HistogramSeries, { color: plot.color, priceLineVisible: false, lastValueVisible: labeled, visible: plot.visible !== false }, paneIndex))
      markers.push(null)
      continue
    }
    if (plot.type === 'area') {
      series.push(
        chart.addSeries(
          BaselineSeries,
          {
            baseValue: { type: 'price', price: plot.base ?? 0 },
            topLineColor: plot.color,
            bottomLineColor: plot.color,
            lineWidth: (plot.lineWidth ?? 2) as LineWidth,
            priceLineVisible: false,
            lastValueVisible: labeled,
            visible: plot.visible !== false,
          },
          paneIndex,
        ),
      )
      markers.push(null)
      continue
    }
    if (plot.type === 'marker' && plot.location !== 'absolute') {
      // An invisible anchor series carries the event glyphs above/below their bars.
      const anchor = chart.addSeries(
        LineSeries,
        { color: plot.color, lineVisible: false, pointMarkersVisible: false, crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false },
        paneIndex,
      )
      series.push(anchor)
      markers.push(createSeriesMarkers(anchor, []) as unknown as ISeriesMarkersPluginApi<UTCTimestamp>)
      continue
    }
    // Lines, dot-lines, and absolute-location markers (rendered as value-anchored points).
    const asDots = !!plot.dots || plot.type === 'marker'
    series.push(
      chart.addSeries(
        LineSeries,
        {
          color: plot.color,
          lineWidth: (plot.lineWidth ?? 2) as LineWidth,
          lineStyle: LEVEL_STYLE[plot.lineStyle ?? 'solid'] ?? LineStyle.Solid,
          lineVisible: !asDots,
          pointMarkersVisible: asDots,
          pointMarkersRadius: asDots ? (plot.type === 'marker' ? 2.4 : 1.6) : undefined,
          crosshairMarkerVisible: !asDots,
          priceLineVisible: false,
          lastValueVisible: plot.type === 'marker' ? false : labeled,
          visible: plot.visible !== false,
          // A volume-scale plot rides the chart's own volume band, not the price axis.
          ...(plot.scale === 'volume' ? { priceScaleId: 'volume', lastValueVisible: false } : {}),
        },
        paneIndex,
      ),
    )
    markers.push(null)
  }
  const first = series[0]
  const priceLines = first ? createLevels(first, built.levels ?? [], neutral) : []
  const fills = new Map<string, FillBetweenPrimitive>()
  for (const f of built.fills ?? []) {
    // The painter attaches to the band's UPPER edge series — its pane and price scale.
    const upperIdx = built.plots.findIndex((p) => p.key === f.upper)
    const host = series[upperIdx >= 0 ? upperIdx : 0]
    if (!host) continue
    const prim = new FillBetweenPrimitive()
    host.attachPrimitive(prim)
    fills.set(f.key, prim)
  }
  let shade: ShadePrimitive | null = null
  if (built.shade && first) {
    shade = new ShadePrimitive()
    first.attachPrimitive(shade)
  }
  return {
    series,
    markers,
    fills,
    shade,
    paintedTimes: new Set(),
    // Fingerprints start at the CREATED state so the first applyEntryStyles pass is a no-op.
    styleKeys: built.plots.map((p) => styleKeyOf(p, labels)),
    levelsKey: JSON.stringify(built.levels ?? []),
    priceLines,
    precisionKey: null,
    shapeKey: shapeKeyOf(built),
  }
}

/** Create the group's static levels on its first series, returning the handles so a settings
 *  change can remove + recreate them (price lines have no applyOptions surface worth diffing). */
function createLevels(host: Series, levels: NonNullable<IndicatorPlots['levels']>, neutral: string): IPriceLine[] {
  return levels.map((l) =>
    host.createPriceLine({
      price: l.price,
      color: l.color ?? neutral,
      lineWidth: 1,
      lineStyle: LEVEL_STYLE[l.lineStyle ?? 'dashed'] ?? LineStyle.Dashed,
      axisLabelVisible: false,
      title: '',
    }),
  )
}

/** A plot's visual fingerprint — the settings an instance can change on a live series. */
function styleKeyOf(plot: IndicatorPlot, labels: boolean): string {
  return JSON.stringify([plot.color, plot.lineWidth, plot.lineStyle, plot.visible !== false, plot.base, labels])
}

/** Re-apply per-plot styling, levels, and precision when (and only when) their fingerprints moved —
 *  a style edit lands on the live series without teardown (teardown would flicker and lose the
 *  pane). */
function applyEntryStyles(entry: Entry, built: IndicatorPlots, symbolFormat: SymbolPriceFormat | null, neutral: string): void {
  const labels = built.display?.labelsOnPriceScale !== false
  built.plots.forEach((plot, i) => {
    const key = styleKeyOf(plot, labels)
    if (entry.styleKeys[i] === key) return
    entry.styleKeys[i] = key
    const s = entry.series[i]
    if (!s) return
    const visible = plot.visible !== false
    const labeled = labels && visible && plot.type !== 'marker'
    if (plot.type === 'histogram') {
      s.applyOptions({ color: plot.color, visible, lastValueVisible: labeled })
      return
    }
    if (plot.type === 'area') {
      s.applyOptions({ topLineColor: plot.color, bottomLineColor: plot.color, lineWidth: (plot.lineWidth ?? 2) as LineWidth, visible, lastValueVisible: labeled } as never)
      return
    }
    // Lines, dot-lines, and marker anchors (marker glyph color travels with the marker data).
    s.applyOptions({
      color: plot.color,
      lineWidth: (plot.lineWidth ?? 2) as LineWidth,
      lineStyle: LEVEL_STYLE[plot.lineStyle ?? 'solid'] ?? LineStyle.Solid,
      visible,
      lastValueVisible: labeled,
    } as never)
  })
  const levelsKey = JSON.stringify(built.levels ?? [])
  const host = entry.series[0]
  if (host && entry.levelsKey !== levelsKey) {
    entry.levelsKey = levelsKey
    for (const line of entry.priceLines) {
      try {
        host.removePriceLine(line)
      } catch {
        /* series mid-teardown */
      }
    }
    entry.priceLines = createLevels(host, built.levels ?? [], neutral)
  }
  // A manifest precision is the study's own declaration; without one the plots are values on the
  // symbol's price grid and take the symbol formatter, never a fixed decimal count.
  const precision = built.precision ?? null
  const precisionKey = precision !== null ? `manifest:${precision}` : symbolFormat ? `symbol:${symbolFormat.key}` : null
  if (precisionKey !== entry.precisionKey) {
    entry.precisionKey = precisionKey
    const priceFormat =
      precision !== null
        ? { type: 'price' as const, precision, minMove: Number((10 ** -precision).toFixed(precision)) || 0.01 }
        : symbolFormat
          ? { type: 'custom' as const, formatter: symbolFormat.formatter, minMove: symbolFormat.minMove }
          : null
    if (priceFormat) for (const s of entry.series) s.applyOptions({ priceFormat })
  }
}

/** Push the recomputed channel data into an entry's painters, and merge/strip per-bar candle
 *  colors on the main candle series. */
function feedChannels(entry: Entry, built: IndicatorPlots, candleSeries: ISeriesApi<'Candlestick'> | null): void {
  const fedFills = new Set<string>()
  for (const f of built.fills ?? []) {
    const prim = entry.fills.get(f.key)
    if (!prim) continue
    fedFills.add(f.key)
    const upper = f.upperData ?? built.plots.find((p) => p.key === f.upper)?.data ?? []
    const lower = f.lowerData ?? built.plots.find((p) => p.key === f.lower)?.data ?? []
    prim.setData(upper, lower, f.color, f.colors)
  }
  // A fill hidden via settings drops out of `built.fills` — its painter must be emptied, or it
  // keeps drawing its last data forever.
  for (const [key, prim] of entry.fills) if (!fedFills.has(key)) prim.setData([], [], 'transparent')
  entry.shade?.setData(built.shade ?? [])
  if (!candleSeries) return
  const wanted = new Map<number, string>((built.barColors ?? []).map((p) => [p.time as number, p.color]))
  if (wanted.size === 0 && entry.paintedTimes.size === 0) return
  const data = candleSeries.data() as readonly (CandlestickData<UTCTimestamp> | { time: UTCTimestamp })[]
  let changed = false
  const next = data.map((c) => {
    if (!('open' in c)) return c
    const t = c.time as number
    const color = wanted.get(t)
    if (color) {
      changed = true
      return { ...c, color, borderColor: color, wickColor: color }
    }
    if (entry.paintedTimes.has(t) && 'color' in c) {
      changed = true
      const { color: _c, borderColor: _b, wickColor: _w, ...rest } = c as CandlestickData<UTCTimestamp> & { color?: string; borderColor?: string; wickColor?: string }
      return rest
    }
    return c
  })
  if (changed) candleSeries.setData(next as CandlestickData<UTCTimestamp>[])
  entry.paintedTimes = new Set(wanted.keys())
}

/** Strip every candle recolor an entry applied (its teardown must leave the candles clean). */
function stripBarColors(entry: Entry, candleSeries: ISeriesApi<'Candlestick'> | null): void {
  if (!candleSeries || entry.paintedTimes.size === 0) return
  feedChannels({ ...entry, fills: new Map(), shade: null }, { placement: 'overlay', title: '', plots: [] }, candleSeries)
}

/** Remove a series, ignoring the case where the chart was already disposed during teardown. */
function safeRemove(chart: IChartApi, series: Series): void {
  try {
    chart.removeSeries(series)
  } catch {
    /* chart already disposed */
  }
}

/** Drop any non-main pane left with no series after a removal (descending so indices stay valid as
 *  panes below shift up). */
function sweepEmptyPanes(chart: IChartApi): void {
  const empties: number[] = []
  chart.panes().forEach((pane, i) => {
    if (i > 0 && pane.getSeries().length === 0) empties.push(i)
  })
  for (let k = empties.length - 1; k >= 0; k--) chart.removePane(empties[k]!)
}
