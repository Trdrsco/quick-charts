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

## The widget

`createChart(options)` mounts a complete datafeed-driven chart into a DOM element — no framework required:

```ts
import { createChart, createUdfDatafeed } from '@trdrs/chart'

const widget = createChart({
  container: document.getElementById('chart')!,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  symbol: 'ES',
  timeframe: '1m',
  theme: { mode: 'dark', upColor: '#4c98fb' },
  events: { onReady: () => console.log('painted') },
})
widget.setSymbol('NQ') // later
widget.remove() // teardown
```

The widget paints candles + volume, applies live updates by the bar rules above, pages older history in as
the viewer scrolls left (stopping at the feed's `noData`), persists the sticky symbol/timeframe through
`ChartStorage`, and runs registered `IndicatorPlugin`s over the live series. The trdrs app's own chart
panel is a richer host over the same seams (trading, drawings UI, replay) and layers those on top.

## The broker contract (chart trading)

Chart trading is the second seam, the exact analog of the datafeed: the package owns the types, the
renderer, the gestures, and the pure decision layer; **you** supply the account data (pushed in), the
actions (a `ChartBroker`), and your own price rules (an injected `PricePolicy`).

```ts
import { attachTradeLines, type ChartBroker, type PricePolicy } from '@trdrs/chart'

const broker: ChartBroker = {
  async moveOrder({ brokerOrderId, price, intentKey }) { /* atomic amend on YOUR backend */ },
  async setProtectiveStop({ instrument, price, intentKey }) { /* the managed protective stop */ },
  async flatten(instrument) { /* close at market */ },
  async cancelOrder(brokerOrderId) { /* cancel one working order */ },
  async reversePosition({ instrument, intentKey }) { /* optional: ONE backend flip op */ return { cancelledOrders: 0 } },
}

const lines = attachTradeLines({ chart, series, container }, broker, {
  symbol: 'ES',
  snapshot: { positions: [], orders: [] }, // you push updates via lines.update(...)
  scope: 'my-broker|ACC-1',                // the selection identity (null = display-only)
  tick: 0.25,
  mark: () => lastTradePrice,              // null when your feed is not live
  policy: myPricePolicy,                   // the SAME rules your backend enforces
  onAction: (text, undo) => toast(text, undo),
  onError: (msg) => note(msg),
})
lines.update({ snapshot: nextSnapshot })   // on every account update
lines.detach()                             // teardown
```

### The broker rules (non-negotiable — the surface relies on them)

1. **Snapshots are FULL and CONSISTENT.** Every `update({ snapshot })` carries the account's complete
   positions + working orders as one atomic read — never a partial patch. The renderer reconciles by
   identity (`instrument` for positions, `brokerOrderId` for orders); a row that disappears from the
   snapshot is a closed/cancelled row, so a partial push would erase live lines.
2. **Identity is stable.** `brokerOrderId` names the SAME order across updates. If your backend
   replaces-under-the-hood on amend (a new id per move), report the new id in the next snapshot and
   resolve `moveOrder` only once the new order is live — the package re-keys from the snapshot.
3. **`moveOrder` is atomic or honest.** Resolve only when the order rests at the new price; reject
   with a human-readable message for ANY other outcome (filled meanwhile, replaced-but-lost,
   unconfirmed transport). The message is shown verbatim — never resolve on a maybe.
4. **Money numbers are real or null.** `unrealizedPnl` is your backend's own figure or `null` — the
   line then simply omits the P&L suffix. Never synthesize one client-side.
5. **Your policy is your server's policy.** The injected `PricePolicy` should run the same band /
   tick-alignment / protective-side rules your backend enforces, so a drag the chart accepts is
   never rejected server-side (and vice versa). Omitted ⇒ the package only tick-snaps.
6. **`intentKey` is the retry key.** It is stable across retries of one gesture and changes when the
   intent changes (the price is baked in). Map it to your backend's idempotency claim so a dropped
   response + retry cannot double-execute.
7. **Reverse is ONE backend operation.** Implement `reversePosition` only if your backend clears the
   instrument's working orders and flips in one call (a client-side cancel+place pair can crash in
   between). Omit it and the ⇄ affordance never renders.

### Preview lines (pre-money decoration)

A host can draw its own **preview** levels (an order ticket's pending entry/stop/target) through
`update({ preview })`. Preview gestures are structurally money-free: a drag or ✕ on a preview line
only ever calls your `onPreviewEdit` / `onPreviewCancel` callbacks — no `ChartBroker` method is in
scope on that path.
