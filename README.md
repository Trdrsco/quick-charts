# @trdrs/chart

The charting library's public surface. Build a platform on the chart by supplying a **datafeed** — the
single seam the whole design turns on. The chart consumes the `ChartDatafeed` interface and never a
concrete backend, so your feed drives it with zero changes to the chart.

## Install

```bash
npm install @trdrs/chart lightweight-charts
```

`lightweight-charts` (^5.0.0) is a **peer dependency**: your app owns the renderer version and the
chart layers on top of it. Both packages ship **ESM-only** — lightweight-charts v5 itself exports no
`require` entry, so a `require`-able build here would advertise a path that breaks the moment the
renderer loads. From a CommonJS host, load via dynamic `import()`.

Licensing: this package requires a commercial license (see `LICENSE`). Licensing is TIERED as a
matter of license terms, not packaging: the charting tier covers the datafeed-driven widget
(drawings, indicators, panes, sessions), and the trading tier additionally covers the trading
plane (trade lines, the order ticket, the account panel, the `TradingAdapter` seam). One artifact
serves both — an unlicensed tier is simply unused code your bundler drops. Because the renderer is
*your* dependency, its Apache-2.0 NOTICE obligations attach to **your** bundle —
`THIRD-PARTY-NOTICES.md` in this package spells out exactly what to carry and how.

Quickstart — the smallest working chart (see [The widget](#the-widget) for the full options):

```ts
import { createChart, createUdfDatafeed } from '@trdrs/chart'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
})
```

## The datafeed contract

Implement `ChartDatafeed` (see `datafeed.ts`). Required methods: `search`, `resolve`, `history`,
`subscribeBars`. Optional: `serverTime` (countdown skew correction), `getQuotes` (a quote board), and
`config` (a feed-level capability declaration — [below](#capability-declaration-config-optional)).

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

### Capability declaration (`config`, optional)

A feed with a **fixed** capability set may declare it; the widget reads the declaration once at mount
and constrains itself — in particular, its opening timeframe must be servable: a sticky/default tf the
feed did not declare falls to your **first** declared resolution instead of dead-ending the first paint
on a refusal. The viewer's stored preference is *not* overwritten (capability is the feed's property,
preference is the viewer's — a later feed that serves the preferred tf gets it back).

```ts
import type { ChartDatafeed, DatafeedConfig } from '@trdrs/chart'

declare const baseFeed: ChartDatafeed // your feed from the section above

export const feed: ChartDatafeed = {
  ...baseFeed,
  async config(): Promise<DatafeedConfig> {
    return { resolutions: ['1m', '5m', '1h', '1d'], quotes: false }
  },
}
```

Declare only what is **true**. Absent method / absent field / empty list = unconstrained — a feed that
serves any interval must not declare a finite `resolutions` list, because the widget then enforces it.
The UDF adapter declares automatically from the server's own `/config` (and only ever declares
timeframes it would actually serve).

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
  asking for a resolution the server didn't declare is `FeedUnavailableError`, not a silent guess
  (`'D'` and `'1D'` are recognized as the same declaration). A server without `/config` gets the
  protocol's defaults (search on, no groups). The adapter also republishes the declaration through
  the seam's `config()`, so the widget opens on a timeframe the server actually serves.
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
sticky symbol/timeframe and the drawing layer's store document both live behind it. The trdrs
app's own richer chart panel manages its persistence outside this seam (its drawings speak the
same store *codec*, so the documents stay interchangeable).

## Indicators

Indicators are **definitions**: a declarative manifest (typed inputs + declared plots/levels/fills,
placement, volume needs) paired with a pure compute the host supplies — the package owns the whole
rendering pipeline (overlay and per-indicator panes, lines/areas/histograms/markers, static levels,
band fills, per-instance style overrides), never the math. One definition renders identically in
this widget and in any richer host built on the same pipeline.

```ts
import type { IndicatorDefinition } from '@trdrs/chart'

export const smaDefinition: IndicatorDefinition = {
  manifest: {
    name: 'SMA',
    pane: 'overlay',
    inputs: { period: { kind: 'int', default: 20, min: 1 } },
    plots: { sma: { kind: 'line', lineWidth: 2 } },
  },
  compute(bars, inputs) {
    const period = inputs.period ?? 20
    const out: (number | null)[] = bars.map((_, i) => {
      if (i + 1 < period) return null // warmup → whitespace, never a fake value
      let sum = 0
      for (let k = i + 1 - period; k <= i; k++) sum += bars[k]!.c
      return sum / period
    })
    return { sma: out }
  },
}
```

Wire instances through `ChartWidgetOptions.indicators`:

```ts
import { createChart, createUdfDatafeed } from '@trdrs/chart'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  indicators: [{ id: 'sma-20', definition: smaDefinition, color: '#4c98fb' }],
})
```

Rules the pipeline enforces:

- **Channels align 1:1 to bars.** `compute` returns one value array per declared plot key;
  null/NaN entries become clean whitespace gaps (warmups break, never bridge).
- **Placement is the manifest's.** `pane: 'pane'` gives the instance its own bottom pane
  (created and swept automatically); `'overlay'` rides the main price scale.
- **`needsVolume` is honest.** On a feed whose bars carry no volume, the instance draws nothing
  and reports "No volume from this feed" instead of painting a flat lie.
- **Overrides layer, never fork.** Per-instance styling (`IndicatorOverrides`) folds into the
  manifest before the walk and gates visibility after — the same layering every host applies.

The lower-level pieces are exported for hosts that orchestrate their own compute:
`buildManifestPlots` (the walker), `attachIndicators` (the renderer), `overriddenManifest` /
`applyPlotOverrides` (the override fold), and the fill/shade canvas painters.

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

The widget paints candles + volume, applies live updates by the bar rules above, pages older history in
as the viewer scrolls left (stopping at the feed's `noData`), persists its sticky state through
`ChartStorage`, runs configured indicator instances through the manifest pipeline, and mounts the
drawing layer and legend below. The trdrs app's own chart panel is a richer host over the same seams
(trading, drawings UI, replay) and layers those on top.

Beyond the basics, the widget carries:

- **Scale modes** — `setScaleMode('log' | 'percent' | 'indexed' | 'normal')` on the price scale,
  persisted through `ChartStorage`.
- **Session bands** (on by default; `sessions: false` opts out) — non-regular-hours stretches shade
  under the candles, driven by the session model the feed serves via `resolve()`'s `sessionClass`
  (exchange-timezone session tables live in the package; crypto never bands; intraday only; an
  UNRESOLVED symbol never bands — the honest default, enforced: the primitive's `kind` getter
  admits `null` and a null draws nothing). A host that changes the model outside a `resolve()` —
  or supplies its own — must call the primitive's `refresh()` when it does: the chart does not
  invalidate the pane on a getter's value changing.
- **A legend** (on by default; `legend: false` removes it) — the symbol/timeframe header with a
  market-status dot and four price-scale chips (normal / log / percent / indexed — the SAME
  application path as `setScaleMode`, so the api and the chips can never disagree), plus one chip
  per indicator instance: title, latest value, and per-chip controls that render by presence — a
  settings gear only when the definition declares inputs (it opens the package's inputs editor;
  Apply patches the instance and recomputes in place), pane collapse / maximize / restore buttons
  only on pane-placed instances, and the eye whose hidden state persists.
  `setIndicators(instances)` swaps the configured list at runtime (removed ids tear down, panes
  sweep, the legend follows).
- **An interface language** (`locale`, English by default) drawn from the 21-language registry in
  `@trdrs/i18n`: the widget's own chrome reads it, and the chart's axis and crosshair dates are
  formatted in it. `setLocale(code)` switches at runtime; `locale()` reports the current one.
  Every piece of the widget's own chrome speaks it; symbols, prices and anything the datafeed or
  broker says are data and pass through untranslated. A host composing the chrome modules itself
  hands them a `ChartI18n` from `createChartI18n(code)` (an optional trailing parameter or `strings`
  option on each) and reads the widget's words for drawing tools and arrangements through
  `toolName` and `arrangementName`.

```ts
import { createChart, createUdfDatafeed, SCALE_MODES } from '@trdrs/chart'

const w = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), locale: 'de' })
w.setScaleMode(SCALE_MODES.includes('log') ? 'log' : 'normal')
w.setIndicators([{ id: 'sma-20', definition: smaDefinition }])
w.setLocale('ja')
```

## Multi-chart layouts

`createChartLayout(options)` tiles N widget panes over one container by an arrangement code and
keeps them in step. The catalog (`ARRANGEMENTS`, grouped for a picker as `LAYOUT_MENU_ROWS`) carries
55 arrangements from a single full-bleed chart to an 8×2 grid; `setArrangement` re-tiles live —
surviving panes keep their charts, new panes clone the active pane's symbol and timeframe. One pane
is ACTIVE (it follows pointerdown; `onActivePane` reports it) — point your own toolbar at it. For
order entry, ask the layout what it trades: `tradingSymbol()` is the active pane's market, and
`onTradingSymbol` reports it every time it moves — another pane activated, the active pane's symbol
changed, a re-tile, a restore. Pointing a ticket at a chart moves no chart's symbol, so the two
concepts stay separate: each chart keeps charting what it charts, and one of them is being traded. Five sync toggles fan changes across the panes: `symbol`, `interval`, and `dateRange`
replay a change onto every pane, `crosshair` mirrors continuously by time, and `time` centers every
pane on a clicked moment. The whole layout serializes as ONE opaque content blob (arrangement, sync
flags, active pane, every pane's own content), so a saved multi-chart layout is one row in the same
save/load backend a single chart uses.

```ts
import { createChartLayout, createUdfDatafeed, LAYOUT_MENU_ROWS } from '@trdrs/chart'

const layout = createChartLayout({
  container: document.getElementById('charts')!,
  base: { datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }) },
  arrangement: '2h',
  panes: [{ symbol: 'ES', timeframe: '1m' }, { symbol: 'NQ', timeframe: '5m' }],
  sync: { crosshair: true },
  events: { onTradingSymbol: (symbol) => ticket.setInstrument(symbol) },
})
ticket.setInstrument(layout.tradingSymbol() ?? 'ES') // the value on mount; the event carries changes
layout.setSync({ symbol: true })
layout.setArrangement(LAYOUT_MENU_ROWS[3]!.codes[0]!) // '4' — the 2×2 grid
const saved = layout.serialize().content // ONE blob for the whole layout
layout.restore(saved)
layout.remove()
```

Per-pane widget apis stay reachable through `layout.panes()` — each is the full `ChartWidgetApi`,
including the `sync` pane-composition primitives (`onCrosshair`/`setCrosshair`, `onTimeClick`/
`centerOn`, `onVisibleRange`/`setVisibleRange`/`visibleRange`) the layout itself is built on, so a
host can compose panes its own way without the layout host. `base.locale` sets every pane's
interface language and `layout.setLocale(code)` switches them together; a pane created by a later
re-tile opens in the current one.

## Drawings

The widget ships with a drawing layer (on by default): placement, selection, drag-to-move and
anchor-resize, per-symbol persistence, and a small built-in tool rail. Turn the layer off with
`drawings: false`, or keep it and hide the rail to drive it from your own UI:

```ts
import { createChart, createUdfDatafeed } from '@trdrs/chart'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  drawings: { rail: false, storageKey: 'acme.chart.drawings' },
})
widget.drawings?.armTool('trend_line')
const saved = widget.drawings?.export() // the persistence wire format (SerializedDrawing[])
```

The layer is also mountable on its own lightweight-charts pair, without the widget:

```ts
import { attachDrawings } from '@trdrs/chart'

const layer = attachDrawings({ chart, series, container, symbol: 'ES' })
layer.armTool('rectangle')
layer.destroy()
```

What to know:

- **Scope is deliberate.** This host places *fixed-anchor tools without text* — trend lines,
  rays, shapes, fibs, patterns, and so on. `armTool` **throws** for tools needing chrome it does
  not have (freehand strokes, multipoint runs, instant position tools, text-bearing tools);
  `placeableByWidget(type)` answers in advance, so a custom rail can filter honestly.
- **Persistence speaks a shared codec.** The store document (`{ [symbol]: SerializedDrawing[] }`,
  via `parseDrawingsStore`/`serializeDrawingsStore` from `@trdrs/chart-drawings`) is the SAME
  document every host of the codec reads and writes — drawings survive moving between hosts, and
  restored documents may contain tools beyond this host's placement scope: they render, select,
  move and persist fine; only their *creation* needs richer chrome.
- **Keys are widget-scoped.** Delete removes the selection, Escape cancels a placement/disarms —
  bound to the chart element (focused on interaction), never the page, so an embedded chart cannot
  swallow the host page's keys.
- **Gestures follow the standard grammar.** Press-drag-release or click…click to place; drag a
  drawing to move it (rigid whole-bar translation — anchors never drift apart); grab an anchor
  handle to reshape; locked drawings select but refuse edits.

## The broker contract (chart trading)

Chart trading is the second seam, the exact analog of the datafeed: the package owns the types, the
renderer, the gestures, and the pure decision layer; **you** supply the account data (pushed in), the
actions (a `ChartBroker`), and your own price rules (an injected `PricePolicy`).

The interface is four required methods + three optional ones (`broker.ts` is the authority) —
capability is presence-driven throughout: an omitted optional hides its affordance, including
`placeOrder`, whose absence means a mutation-only integration where no placement surface renders:

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
  // OPTIONAL — the ticket's submit path. Omit it and no placement affordance renders anywhere.
  // MUST reject (throw) unless the backend reports the order accepted.
  async placeOrder(args) {
    await myBackend.place(args.instrument, args.side, args.qty, args.orderType, args.price, args.bracket, args.intentKey)
  },
}
```

### The widget mounts trading through one adapter

For the widget, the whole trading plane arrives as a single `TradingAdapter`: your `ChartBroker`
(actions), a full-snapshot account subscription (state), an optional capability declaration, and
your price policy. **Snapshots are FULL and consistent by contract** — every push carries the
account's complete positions and working orders, so there is no per-operation update to match and
nothing to time out waiting for; the package holds no trading state of its own.

```ts
import { createChart, createUdfDatafeed, type AccountSnapshot, type TradingAdapter } from '@trdrs/chart'

const trading: TradingAdapter = {
  broker,
  subscribeAccount(handlers) {
    const stream = myBackend.accountStream()
    stream.onSnapshot((s: AccountSnapshot) => handlers.onSnapshot({ ...s, scope: 'my-broker|ACC-1', currency: 'USD' }))
    return () => stream.close()
  },
  async capabilities() {
    return { exits: true } // declare only what is true; capability that IS a method is derived, never declared twice
  },
  policy: myPricePolicy,
}

const tradingWidget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  trading,
  events: { onTradingAction: (text, undo) => toast(text, undo), onTradingError: (msg) => note(msg) },
})
```

The widget contributes what it owns — the live-trusted mark (null while the feed is not live), the
resolved tick, the charted symbol — and the adapter owns everything else.

**The order ticket** exists exactly when the adapter's broker implements `placeOrder`
(presence-driven, like every affordance): the widget then owns the draft's state and renders it as
the chart-native draft line — drag to reprice, tap the qty chip or type cell to edit (the package's
own micro-editors), tap the side chip to send. `widget.ticket` drives it programmatically:

```ts
declare const tradingWidget: import('@trdrs/chart').ChartWidgetApi

tradingWidget.ticket?.open({ side: 'sell', qty: 2, orderType: 'limit' })
tradingWidget.ticket?.setPrice(5001.25)
void tradingWidget.ticket?.submit() // policy-gated, confirm-gated, idempotent via intentKey
```

The money rules the ticket enforces: every edit only recomposes the PREVIEW (nothing on the edit
path can spend); `submit()` refuses without an armed scope, runs your `policy` over the composed
entry exactly like a drag, passes the exact payload to `TradingAdapter.confirmOrder` when declared
(resolve `false` to veto — the draft stays editable), and mints `intentKey` per composed intent —
stable across retries of the same order, fresh the moment any field changes. A rejected placement
surfaces the broker's message verbatim and keeps the draft for editing.

**Bar replay** is always available through `widget.replay`: a cursor over the widget's own loaded
window — `start(atSec?)`, step forward/back, play at the standard speed table, `goLive()`, `exit()`
— with a transport strip appearing while replay is on. Stepping forward FORMS each bar from real
finer bars when the feed can serve them: the strip's interval select (Auto by default, the choice
persists) picks the sub-resolution, each step extends the forming bar by one sub-bar (open
anchored, high/low cumulative, close latest, volume summed), and the fully-formed bar is the
sealed bar verbatim; stepping back rewinds a forming bar to its sealed boundary first. On a feed
with no finer history the step falls back to whole bars — honest, never synthesized. Live updates
keep accumulating off-screen and the exit catches up. The money rule: **live trading from the
chart disarms during replay**
(the trade lines go display-only and the ticket refuses — a money gesture priced off a historical
view is a foot-gun), while the account panel stays live because its actions are table-explicit; a
host that wants replay *trading* swaps in a replay `TradingAdapter` at the seam.

**Execution marks** draw where the account actually traded: one arrow per execution, anchored at
the fill's own price (a buy hangs below its price pointing up at it, a sell sits above pointing
down), overlapping same-bar same-side arrows stacking at a fixed pitch behind one shaft, with an
optional "qty @ price" label beyond the shaft (off by default; `executionMarks: { labels: true }`
on the widget, the `labels()` getter on the attachment). Clicking a mark opens a card that
aggregates the bar's side group — the fill count, the summed quantity at average price, and the
individual trades — styled through the `card()` palette getter so it sits beside the host's own
popovers as one family. Fill-to-bar placement is by
CONTAINING BAR, read from the loaded series itself — correct on every interval, and a fill whose
bar is not loaded draws nothing rather than landing on the wrong bar. The widget feeds the surface
automatically when the adapter declares `executions(symbol)` (refetched on symbol change, on an
account switch — which clears the previous account's fills first, because fills belong to the
account that made them — and whenever a snapshot's position quantities move; a fill is the only
event that changes a quantity); `executionMarks: false` removes it. Live and replay fills are
SEPARATE histories: entering bar replay switches the drawn history to `'replay'` (live marks hide
for the whole session), exiting switches back, and a host that runs replay trading pushes that
session's fills into the replay history through `widget.executions`:

```ts
import { attachExecutionMarks, type ChartExecution } from '@trdrs/chart'

declare const tradingWidget: import('@trdrs/chart').ChartWidgetApi
declare function fillsFor(symbol: string): Promise<readonly ChartExecution[]>

// The widget feeds itself when the adapter declares executions(); a host can also push a history:
tradingWidget.executions?.set('replay', [{ id: 'r-1', side: 'buy', qty: 2, price: 77.23, timeSecs: 1_755_000_000 }])

// A richer host attaches the surface to its own chart (the third argument hosts the click card —
// an overlay element ABOVE the chart's gesture surface, so card clicks are not swallowed):
const marks = attachExecutionMarks(chart, series, container, {
  buyColor: () => '#2962ff',
  sellColor: () => '#f23645',
})
void fillsFor('ES').then((fills) => marks.set('live', fills))
marks.setScope('replay') // entering replay: live fills hide, the replay history draws
marks.destroy()
```

**The account panel** mounts below the chart whenever `trading` is supplied (`accountPanel: false`
opts out, `{ height }` sizes it): Positions and Orders pages rendered from the SAME snapshot the
lines consume, with Close / Cancel / Reverse routing through the SAME broker seam — one data plane,
one write path, two views. Presence rules again: `Reverse` renders only when the broker implements
`reversePosition`, and every money control disables while no account is armed or trading is locked.
Money figures are the venue's own or '—'; the panel computes none.

A richer host can skip the widget and drive `attachTradeLines` directly:

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

## Versioning & deprecation

- **SemVer, enforced at the gate.** The public surface is pinned by an API-surface test (every
  exported name and its runtime kind), the shipped type declarations are compiled against by a
  clean-room consumer with `skipLibCheck: false`, and this README's own `ts` examples type-check
  against the real exports. A change that trips any of those is decided as a version event — a
  removed/renamed export or a changed contract is **major**; new surface is **minor**; fixes are
  **patch** — never shipped as silent drift.
- **Optionality is the compatibility mechanism.** New seam capabilities arrive as *optional* methods
  and fields (`config`, `serverTime`, `getQuotes`, `reversePosition` are the pattern): an existing
  implementation keeps compiling, and the widget treats absence as "unconstrained / not supported".
  Your integration never breaks by standing still within a major.
- **Deprecation runs a full major.** A deprecated export keeps working for the remainder of the
  current major, is marked `@deprecated` in the types with its replacement named in the note (your
  editor flags every call site), and is removed only in the next major — never silently.
- **The wire timeframe grammar is stable vocabulary.** `<N><unit>` with units `t s m h d w mo`.
  Extensions may add units; an existing token never changes meaning.
