// The standalone chart host — createChart(options) mounts a complete datafeed-driven chart into a DOM
// element with no framework dependency: lightweight-charts underneath, the ChartDatafeed seam for data,
// ChartStorage for the viewer's sticky symbol/timeframe, theme overrides, event hooks, and indicator
// plugins computed over the live bar series. This is the widget a third party embeds; the trdrs app's own
// ChartPanel is a richer host over the same seams (trading, drawings UI, replay) and does not use this.
import {
  CandlestickSeries,
  ColorType,
  createChart as createLwChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { FeedUnavailableError, type ChartDatafeed, type FeedBar } from './datafeed'
import { localStorageChartStorage, type ChartStorage } from './storage'
import type { ChartTheme, ChartWidgetOptions, IndicatorPlugin } from './widget'
import { BRAND_DOWN, BRAND_UP } from './overrides'

/** The running widget a host holds — change what's displayed, or tear it down. */
export interface ChartWidgetApi {
  symbol(): string
  timeframe(): string
  setSymbol(symbol: string): void
  setTimeframe(tf: string): void
  /** Tear down the chart, the live subscription, and every DOM/timer resource. Idempotent. */
  remove(): void
}

/** A fully-resolved palette: every field concrete. Exported for tests. */
export interface ResolvedTheme {
  background: string
  gridColor: string
  textColor: string
  upColor: string
  downColor: string
  fontSize: number
}

/** Resolve theme overrides over the mode's defaults — a partial theme tints only what it names. */
export function resolveTheme(theme?: ChartTheme): ResolvedTheme {
  const dark = (theme?.mode ?? 'dark') === 'dark'
  return {
    background: theme?.background ?? (dark ? '#141414' : '#ffffff'),
    gridColor: theme?.gridColor ?? (dark ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'),
    textColor: theme?.textColor ?? (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.55)'),
    upColor: theme?.upColor ?? BRAND_UP,
    downColor: theme?.downColor ?? BRAND_DOWN,
    fontSize: theme?.fontSize ?? 13,
  }
}

/** Apply a live bar event to an ascending series: mutate the last bar (same bucket time), append (newer),
 *  or drop a stale update (older than the last bar — never splice history). Returns the new array only
 *  when something changed. Exported for tests. */
export function applyBar(bars: FeedBar[], bar: FeedBar): FeedBar[] | null {
  const last = bars[bars.length - 1]
  if (!last || bar.t > last.t) return [...bars, bar]
  if (bar.t === last.t) return [...bars.slice(0, -1), bar]
  return null
}

const SYMBOL_KEY = 'trdrs.chart.widget.symbol.v1'
const TF_KEY = 'trdrs.chart.widget.tf.v1'
const SNAPSHOT_BARS = 300
const PAGE_BARS = 500
/** How close to the left edge (in bars) the visible range must get before the next page is fetched. */
const PAGE_TRIGGER_BARS = 60

export function createChart(options: ChartWidgetOptions): ChartWidgetApi {
  const datafeed: ChartDatafeed = options.datafeed
  const storage: ChartStorage = options.storage ?? localStorageChartStorage
  const theme = resolveTheme(options.theme)
  const events = options.events ?? {}
  const plugins: IndicatorPlugin[] = options.indicators ?? []

  let symbol = options.symbol ?? storage.get(SYMBOL_KEY) ?? ''
  let tf = options.timeframe ?? storage.get(TF_KEY) ?? '1m'
  let removed = false
  let ready = false
  /** Increments on every symbol/timeframe switch and on remove() — stale async work checks it and bails. */
  let epoch = 0

  const chart: IChartApi = createLwChart(options.container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: theme.background },
      textColor: theme.textColor,
      // From the shared scale — canvas text is outside Tailwind and would otherwise drift alone.
      fontSize: theme.fontSize,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.gridColor },
      horzLines: { color: theme.gridColor },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 4, barSpacing: 8, minBarSpacing: 0.5 },
  })
  const candles: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
    upColor: theme.upColor,
    downColor: theme.downColor,
    borderVisible: false,
    wickUpColor: theme.upColor,
    wickDownColor: theme.downColor,
  })
  const volume: ISeriesApi<'Histogram'> = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
  })
  chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })

  /** The full ascending bar series currently painted (snapshot + prepended pages + live updates). */
  let bars: FeedBar[] = []
  let unsubscribe: (() => void) | null = null
  let noMoreHistory = false
  let paging = false

  const plotSeries: Array<ISeriesApi<'Line'>> = []

  function paintAll(): void {
    candles.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c })))
    volume.setData(bars.map((b) => ({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? theme.upColor : theme.downColor })))
    recomputePlugins()
  }

  function paintLast(b: FeedBar): void {
    candles.update({ time: b.t as UTCTimestamp, open: b.o, high: b.h, low: b.l, close: b.c })
    volume.update({ time: b.t as UTCTimestamp, value: b.v, color: b.c >= b.o ? theme.upColor : theme.downColor })
    recomputePlugins()
  }

  /** Recompute every registered plugin over the current bars and repaint its plot lines. Plugins are
   *  pure; a plugin that throws is skipped this round (its stale plots clear) rather than sinking the
   *  chart. Series are created once per plot slot and reused across recomputes. */
  function recomputePlugins(): void {
    if (plugins.length === 0) return
    const plots = plugins.flatMap((p) => {
      try {
        return p.compute(bars, { ...p.inputs })
      } catch {
        return []
      }
    })
    while (plotSeries.length < plots.length) plotSeries.push(chart.addSeries(LineSeries, { lineWidth: 1, priceLineVisible: false, lastValueVisible: false }))
    plotSeries.forEach((series, i) => {
      const plot = plots[i]
      if (!plot) {
        series.setData([])
        return
      }
      series.applyOptions({ color: plot.color ?? theme.textColor, title: plot.label })
      series.setData(plot.points.map((pt) => ({ time: pt.time as UTCTimestamp, value: pt.value })))
    })
  }

  /** Fetch the page of bars older than the current left edge; prepend while HOLDING the visible window
   *  in place (the standard scroll-back experience). Stops for good at the feed's noData. */
  function maybePageBack(): void {
    if (paging || noMoreHistory || bars.length === 0) return
    const range = chart.timeScale().getVisibleLogicalRange()
    if (!range || range.from > PAGE_TRIGGER_BARS) return
    paging = true
    const myEpoch = epoch
    const oldest = bars[0]!.t
    void datafeed
      .history(symbol, tf, { to: oldest - 1, countBack: PAGE_BARS })
      .then((page) => {
        if (removed || myEpoch !== epoch) return
        if (page.noData) noMoreHistory = true
        const older = page.bars.filter((b) => b.t < oldest)
        if (older.length === 0) return
        const keep = chart.timeScale().getVisibleRange()
        bars = [...older, ...bars]
        paintAll()
        if (keep) chart.timeScale().setVisibleRange(keep)
      })
      .catch(() => {
        /* transient — the next left-edge approach retries */
      })
      .finally(() => {
        paging = false
      })
  }
  chart.timeScale().subscribeVisibleLogicalRangeChange(maybePageBack)

  /** (Re)load the active (symbol, timeframe): initial history paints first, then the live subscription's
   *  snapshot replaces it and bar events mutate/append. A FeedUnavailableError is terminal for this
   *  symbol (status surfaces to the host); any other history failure leaves the subscription to seed the
   *  chart through its own snapshot. */
  function load(): void {
    const myEpoch = ++epoch
    unsubscribe?.()
    unsubscribe = null
    bars = []
    noMoreHistory = false
    paintAll()
    if (!symbol) return
    void datafeed
      .history(symbol, tf, { countBack: SNAPSHOT_BARS })
      .then((page) => {
        if (removed || myEpoch !== epoch) return
        bars = [...page.bars]
        paintAll()
        chart.timeScale().fitContent()
        if (!ready) {
          ready = true
          events.onReady?.()
        }
      })
      .catch((e) => {
        if (removed || myEpoch !== epoch) return
        if (e instanceof FeedUnavailableError) {
          events.onFeedStatus?.('feed_unavailable')
          return // terminal — don't open a live subscription for a symbol nothing serves
        }
        // Transient history failure: fall through, the subscription snapshot below still seeds the chart.
        openSubscription(myEpoch)
      })
      .then(() => {
        if (!removed && myEpoch === epoch && unsubscribe === null) openSubscription(myEpoch)
      })
  }

  function openSubscription(myEpoch: number): void {
    if (removed || myEpoch !== epoch) return
    unsubscribe = datafeed.subscribeBars(symbol, tf, {
      onBars: (e) => {
        if (removed || myEpoch !== epoch) return
        if (e.kind === 'snapshot') {
          // The transport's self-healing re-sync: the snapshot replaces the RECENT window; bars we paged
          // in further back stay (they're older than the snapshot's first bar).
          const first = e.bars[0]?.t
          bars = first === undefined ? [...e.bars] : [...bars.filter((b) => b.t < first), ...e.bars]
          paintAll()
        } else {
          const next = applyBar(bars, e.bar)
          if (next) {
            bars = next
            paintLast(e.bar)
          }
        }
      },
      onStatus: (status) => {
        if (!removed && myEpoch === epoch) events.onFeedStatus?.(status)
      },
    })
  }

  load()

  return {
    symbol: () => symbol,
    timeframe: () => tf,
    setSymbol(next: string) {
      if (removed || next === symbol) return
      symbol = next
      storage.set(SYMBOL_KEY, next)
      events.onSymbolChange?.(next)
      load()
    },
    setTimeframe(next: string) {
      if (removed || next === tf) return
      tf = next
      storage.set(TF_KEY, next)
      events.onTimeframeChange?.(next)
      load()
    },
    remove() {
      if (removed) return
      removed = true
      epoch++
      unsubscribe?.()
      unsubscribe = null
      chart.remove()
    },
  }
}
