# @trdrs/chart

The charting library's public surface. Build a platform on the chart by supplying a **datafeed** — the
single seam the whole design turns on. The chart consumes the `ChartDatafeed` interface and never a
concrete backend, so your feed drives it with zero changes to the chart.

## The datafeed contract

Implement `ChartDatafeed` (see `datafeed.ts`). Required methods: `search`, `resolve`, `history`,
`subscribeBars`. Optional: `serverTime` (countdown skew correction) and `getQuotes` (a quote board).

```ts
import type { ChartDatafeed, FeedBar } from '@trdrs/chart'

export const myFeed: ChartDatafeed = {
  async search(query, opts) {
    const rows = await myBackend.search(query, opts?.cls, opts?.limit ?? 50, opts?.offset ?? 0)
    return { hits: rows.hits, hasMore: rows.hasMore } // hasMore is EXACT, never a page-boundary guess
  },
  async resolve(symbol) {
    return (await myBackend.symbolInfo(symbol)) ?? null // null = unknown symbol (a data answer)
  },
  async history(symbol, tf, range) {
    const page = await myBackend.bars(symbol, tf, range?.from, range?.to, range?.countBack)
    return { bars: page.bars, noData: page.endOfHistory } // noData ONLY on a countBack ask
  },
  subscribeBars(symbol, tf, handlers) {
    const stream = myBackend.stream(symbol, tf)
    stream.onSnapshot((bars: FeedBar[]) => handlers.onBars({ kind: 'snapshot', bars })) // on connect AND every reconnect
    stream.onBar((bar: FeedBar) => handlers.onBars({ kind: 'bar', bar }))
    return () => stream.close()
  },
}
```

### The bar rules (non-negotiable — the chart relies on them)

1. **Ascending, unique, inclusive.** Bars are sorted by time, one bar per timestamp. A `history`
   window is INCLUSIVE of both ends — a bar exactly at `from` or at `to` belongs to the answer.
   The chart never re-requests a bar it holds: it pages with `to = oldest − 1`, so you never
   re-send one either. (The engine reference implementation serves exactly this contract.)
2. **`countBack` outranks `from` — and the count is an obligation.** When `history` is called with
   `countBack: N`, return the last N bars at/before `to` even if that reaches back past `from`
   (a weekend or holiday week between `to` and the data is YOUR problem to reach across, not the
   chart's). The widget asks once per scroll approach and does not loop to compensate — a short
   answer is a visibly short chart. The engine reference implementation fills outward in widening
   rounds until the count is met or history is exhausted; do the same.
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

What the adapter honors of the protocol:

- **`/config` is fetched once and drives the rest.** `supported_resolutions` is validated against —
  asking for a resolution the server didn't declare is `FeedUnavailableError`, not a silent guess. A
  server without `/config` gets the protocol's defaults (search on, no groups).
- **Group-catalog symbol search.** When `/config` declares `supports_group_request`, search is served
  from the columnar `/symbol_info?group=` catalog instead of `/search`.
- **`no_data` + `nextTime` is a gap, not the end.** The chart re-asks once at `nextTime` (a session
  gap hop); only `no_data` *without* the hint ends scroll-back. `nextTime` in ms or s both work.
- **The seam's inclusive `[from, to]` is bridged** to UDF's exclusive `to` inside the adapter — your
  server sees standard UDF ranges; implement nothing special.

## Viewer state storage

**The widget** persists its sticky state (the last symbol + timeframe) through `ChartStorage`. The
default is the browser's `localStorage`; supply your own adapter to key it to a user account:

```ts
import { localStorageChartStorage, memoryChartStorage, type ChartStorage } from '@trdrs/chart'
```

Scope honestly stated: `ChartStorage` redirects the persistence of **this package's widget** — the
trdrs app's own richer chart panel manages its drawings/indicators/appearance persistence outside
this seam.

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

The interface is four required methods + two optional ones (`broker.ts` is the authority):

```ts
import type { ChartBroker } from '@trdrs/chart'

export const broker: ChartBroker = {
  // Reprice a working order IN PLACE — atomic on YOUR backend, never client cancel+place.
  // For a stop_limit, `price` is the trigger and `stopLimitPrice` the conversion limit (both
  // always sent, one atomic modify). `currentBracket` carries the entry's pre-arm TP/SL legs so
  // a cancel+re-place backend can recreate them; `current` carries the pre-move prices for a
  // faithful restore on rejection. Reject (throw) for anything but a live amend/replace.
  async moveOrder(args) {
    await myBackend.replaceOrder(args.brokerOrderId, args.price, args.stopLimitPrice, args.intentKey)
  },
  // The protective PAIR is the primitive — the two levels are cancel-linked siblings at the
  // venue. THREE-STATE per leg: a number SETS it, `null` REMOVES it, and OMITTING the field
  // leaves the resting leg untouched ("move the stop, don't touch the target" is expressible).
  async setExits(args) {
    await myBackend.setProtectivePair(args.instrument, args.takeProfit, args.stopLoss, args.intentKey)
  },
  // Close the position at market.
  async flatten(instrument) {
    await myBackend.flatten(instrument)
  },
  // Cancel one working order.
  async cancelOrder(brokerOrderId) {
    await myBackend.cancel(brokerOrderId)
  },
  // OPTIONAL — omit it and the ⇄ affordance never renders. ONE backend operation (clear the
  // instrument's working orders + a qty×2 opposite market order); a client-side cancel+place
  // pair can crash in between.
  async reversePosition(args) {
    const receipt = await myBackend.reverse(args.instrument, args.intentKey)
    return { cancelledOrders: receipt.cancelled }
  },
  // OPTIONAL — omit it and resting entry lines draw no bracket handles. Sets/edits/removes the
  // TP/SL bracket on an UNFILLED entry: the legs are PRE-ARM (OCO-pending, arming when the entry
  // fills), so they are not working orders yet and cannot be moved through setExits. Same
  // three-state legs as setExits; `currentBracket` carries the untouched leg through for
  // cancel+re-place backends.
  async setOrderBracket(args) {
    await myBackend.setPreArmBracket(args.brokerOrderId, args.takeProfit, args.stopLoss, args.intentKey)
  },
}
```

```ts
import { attachTradeLines, type PricePolicy } from '@trdrs/chart'

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
8. **Exit legs are THREE-STATE — and the pair is the primitive.** In `setExits` (and
   `setOrderBracket`'s legs) a number SETS a level, `null` REMOVES it, and an ABSENT field leaves
   the resting leg untouched. Never treat absent as remove: the levels are cancel-linked siblings
   at the venue, and "move the stop, don't touch the target" must stay expressible. Capability is
   presence-driven throughout: an omitted optional method hides its affordance (no `reversePosition`
   ⇒ no ⇄; no `setOrderBracket` ⇒ no bracket handles on resting entries) — never a dead button.

### Preview lines (pre-money decoration)

A host can draw its own **preview** levels (an order ticket's pending entry/stop/target) through
`update({ preview })`. Preview gestures are structurally money-free: a drag or ✕ on a preview line
only ever calls your `onPreviewEdit` / `onPreviewCancel` callbacks — no `ChartBroker` method is in
scope on that path.
