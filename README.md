# @trdrs/chart

The charting library's public surface. Build a platform on the chart by supplying a **datafeed** — the
single seam the whole design turns on. The chart consumes the `ChartDatafeed` interface and never a
concrete backend, so your feed drives it with zero changes to the chart.

## The datafeed contract

Implement `ChartDatafeed` (see `datafeed.ts`). Required methods: `search`, `resolve`, `history`,
`subscribeBars`. Optional: `serverTime` (countdown skew correction) and `getQuotes` (a quote board).

```ts
import type { ChartDatafeed } from '@trdrs/chart'

const myFeed: ChartDatafeed = {
  async search(query, opts) { /* → { hits, hasMore } */ },
  async resolve(symbol) { /* → SymbolInfo | null (null = unknown symbol) */ },
  async history(symbol, tf, range) { /* → { bars, noData } */ },
  subscribeBars(symbol, tf, handlers) { /* → unsubscribe fn */ },
}
```

### The bar rules (non-negotiable — the chart relies on them)

1. **Ascending, unique, right-exclusive.** Bars are sorted by time, one bar per timestamp. A `[from, to]`
   history window is treated as `[from, to)` — never re-send the `to` bar.
2. **`countBack` outranks `from`.** When `history` is called with `countBack: N`, return the last N bars
   at/before `to` even if that reaches back past `from`. Returning fewer makes the chart loop.
3. **`noData` ends scroll-back.** When a `countBack` request finds nothing, return `{ bars: [], noData: true }`.
   A plain `from/to` request with an empty window must **not** set `noData` (an empty window can be a
   mid-history gap, not the end of history).
4. **Live updates mutate the last bar or append.** `subscribeBars` emits `{ kind: 'snapshot', bars }` on
   connect and after every reconnect (the self-healing re-sync), then `{ kind: 'bar', bar }` per update.
   A bar's `t` is its **bucket-open** epoch-seconds time, never the update's wall-clock time.
5. **Bar time is epoch SECONDS.** Not milliseconds.
6. **No feed for a symbol is terminal.** Throw `FeedUnavailableError` from `history` when no feed serves
   the symbol — the chart shows "market data unavailable" and stops. A transient fetch failure should
   throw a normal error (the chart retries).
7. **Never synthesize prices.** `onQuote` carries real top-of-book bid/ask only; a feed with no L1 for a
   symbol simply never calls it (the UI shows '—').

## The UDF on-ramp

Already have a [UDF](https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF) server?
Skip implementing the interface — point the adapter at it:

```ts
import { createUdfDatafeed } from '@trdrs/chart'

const datafeed = createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' })
```

UDF is REST and **poll-based** (no push): `subscribeBars` polls `/history` for the newest bar. For true
real-time, implement `ChartDatafeed` directly over your own stream (as the engine reference implementation
does over SSE). UDF is the low-effort on-ramp, not the endpoint.

## Viewer state storage

The chart persists a viewer's drawings, indicators, and appearance through `ChartStorage`. The default is
the browser's `localStorage`; supply your own to sync state to a user account:

```ts
import { localStorageChartStorage, memoryChartStorage, type ChartStorage } from '@trdrs/chart'
```

## Indicator plugins

Register third-party indicators through `ChartWidgetOptions.indicators` — each `IndicatorPlugin` computes
plot lines from the bar series with no access to chart internals.

## Status

The datafeed contract, the UDF adapter, the storage seam, and the widget/indicator-plugin type surface are
published here. The host component that mounts `ChartWidgetOptions` is provided by the trdrs app today and
is the remaining extraction step before a fully standalone `createChart(options)` ships from this package.
