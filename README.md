# @trdrs/quickcharts

Quick Charts is a datafeed-driven charting library with drawings, indicators, layouts and replay.
It draws over the datafeed and the storage you supply: the chart consumes the `ChartDatafeed`
interface, so your feed drives it without a change to the chart.

## Install

```bash
npm install @trdrs/quickcharts
```

Supported npm versions automatically install the required renderer. You do not need to name
another package in the install command. Quick Charts ships ESM and TypeScript declarations.
From a CommonJS host, load it through dynamic `import()`.

The renderer remains a required `lightweight-charts` 5 peer so compatible consumers share one
runtime. Use default peer resolution; do not suppress peer checks.

Quick Charts is licensed under the Apache License 2.0: see `LICENSE` and `NOTICE`. Because the
renderer is *your* dependency, its own Apache-2.0 NOTICE
obligations attach to **your** bundle: `THIRD-PARTY-NOTICES.md` in this package spells out exactly
what to carry and how. An application composes its own features on the chart through the extension
seam below.

Quickstart, the smallest working chart (see [The widget](#the-widget) for the full options). The
stylesheet import is not optional: it carries the chart's layout as well as its look, and without it
the chart has no size and paints nothing.

```ts
import '@trdrs/quickcharts/styles.css'
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
})
await widget.ready()
```

## The datafeed contract

Implement `ChartDatafeed` (see `datafeed.ts`). Required methods: `search`, `resolve`, `history`,
`subscribeBars`. Optional: `serverTime` (countdown skew correction) and `config` (a feed-level
capability declaration, described [below](#capability-declaration-config-optional)). The datafeed serves
symbol metadata, bars and bar updates; your host serves quotes (last, change, volume, the top of
book) to its own consumers from its own source.

When `appearance.countdown` is enabled, a live streaming time bar replaces the native last-value
label with one price-and-time label. The price uses the resolved symbol formatter. Replay, stale,
delayed or end-of-day data, tick bars, closed declared sessions and missing bars retain the native
price label. `serverTime` corrects clock skew when available; absence or failure uses the client
clock. Bar opens define fixed and calendar alignment, and declared session facts shorten only a
bar they actually close.

`resolve` answers with `SymbolInfo`, the symbology contract ([Symbology](#symbology)): the
symbol's identity (`ticker`, `name`, `description`), venue and type (`exchange`,
`listedExchange`, `type`), `supportedResolutions` (chart timeframe tokens; an empty list declares
no restriction), the exchange session triple (`timezone`, `session`, `sessionHolidays`),
`dataStatus`, `currencyCode` or `unitId`, `volumePrecision`, and the price-format facts in
`format`. Null means the symbol is unknown to your catalogs.

```ts
import type { SymbolInfo } from '@trdrs/quickcharts'

const treasury: SymbolInfo = {
  ticker: 'ZBZ2026',
  name: 'ZBZ2026',
  description: '30-year T-bond Dec 2026',
  exchange: 'CBOT',
  listedExchange: 'CBOT',
  type: 'futures',
  supportedResolutions: [], // no restriction: any timeframe token
  timezone: 'America/Chicago',
  session: '1700-1600:23456',
  dataStatus: 'streaming',
  currencyCode: 'USD',
  volumePrecision: 0,
  format: { pricescale: 32, minmov: 1, fractional: true },
}
void treasury
```

```ts
import type { ChartDatafeed, FeedBar } from '@trdrs/quickcharts'

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

### The bar rules (the chart relies on them)

1. **Ascending, unique, inclusive.** Bars are sorted by time, one bar per timestamp. A `history`
   window is INCLUSIVE of both ends: a bar exactly at `from` or at `to` belongs to the answer.
   The chart never re-requests a bar it holds: it pages with `to = oldest − 1`, so you never
   re-send one either.
2. **`countBack` outranks `from`, and the count is an obligation.** When `history` is called with
   `countBack: N`, return the last N bars at/before `to` even if that reaches back past `from`
   (a weekend or holiday week between `to` and the data is YOUR problem to reach across, not the
   chart's). The widget asks once per scroll approach and does not loop to compensate: a short
   answer is a visibly short chart. Fill outward in widening rounds until the count is met or
   history is exhausted.
3. **`noData` ends scroll-back.** When a `countBack` request finds nothing, return `{ bars: [], noData: true }`.
   A plain `from/to` request with an empty window must **not** set `noData` (an empty window can be a
   mid-history gap, not the end of history).
4. **Live updates mutate the last bar or append.** `subscribeBars` emits `{ kind: 'snapshot', bars }` on
   connect and after every reconnect (the self-healing re-sync), then `{ kind: 'bar', bar }` per update.
   A bar's `t` is its **bucket-open** epoch-seconds time, never the update's wall-clock time.
5. **Bar time is epoch SECONDS.** Not milliseconds.
6. **No feed for a symbol is terminal.** Throw `FeedUnavailableError` from `history` when no feed serves
   the symbol; the chart shows "market data unavailable" and stops. A transient fetch failure should
   throw a normal error (the chart retries).
7. **Never synthesize prices.** A bar carries what the market printed; a symbol with no data has no
   bars, never invented ones.

### Coarser grains than the feed serves (`withFoldedHistory`, optional)

A venue that keeps 15-minute bars keeps every 45-minute bar too, just not under that name. Wrap a
feed to answer those:

```ts
import { withFoldedHistory, type ChartDatafeed } from '@trdrs/quickcharts'

declare const venueFeed: ChartDatafeed // your feed from the section above

const feed = withFoldedHistory(venueFeed, { serves: ['1m', '15m', '1h', '1d', '1mo'] })
```

`serves` names the grains the feed answers natively. Every other request is folded from the coarsest
of them that divides it, so a 45-minute ask fetches 15-minute bars three at a time: first open,
extremes across the run, last close, summed volume. Month multiples fold by calendar month, so a
quarter is a quarter rather than ninety days, and weeks start on Monday.

Folding only works downward. A finer bar cannot be recovered from a coarser one, because the path
the price took inside it was never written down, so a request below everything the feed serves passes
through untouched and the feed answers for itself. This is rule 7 in wrapper form.

### Capability declaration (`config`, optional)

A feed with a **fixed** capability set may declare it; the widget reads the declaration once at mount
and constrains itself. In particular, its opening timeframe must be servable: a sticky/default tf the
feed did not declare falls to your **first** declared resolution instead of dead-ending the first paint
on a refusal. The viewer's stored preference is *not* overwritten (capability is the feed's property,
preference is the viewer's, so a later feed that serves the preferred tf gets it back).

```ts
import type { ChartDatafeed, DatafeedConfig } from '@trdrs/quickcharts'

declare const baseFeed: ChartDatafeed // your feed from the section above

export const feed: ChartDatafeed = {
  ...baseFeed,
  async config(): Promise<DatafeedConfig> {
    return { resolutions: ['1m', '5m', '1h', '1d'] }
  },
}
```

Declare only what is **true**. Absent method / absent field / empty list = unconstrained, so a feed that
serves any timeframe must not declare a finite `resolutions` list, because the widget then enforces
it. The UDF adapter declares automatically from the server's own `/config` (and only ever declares
timeframes it would actually serve).

## The UDF on-ramp

Already serving bars over the UDF wire protocol? Skip implementing the interface and point the
adapter at your server:

```ts
import { createUdfDatafeed } from '@trdrs/quickcharts'

const datafeed = createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' })
```

UDF is REST and **poll-based** (no push): `subscribeBars` polls `/history` for the newest bar. For true
real-time, implement `ChartDatafeed` directly over your own stream. UDF is the low-effort on-ramp,
not the endpoint.

What the adapter honors of the protocol:

- **`/config` is fetched once and drives the rest.** `supported_resolutions` is validated against:
  asking for a resolution the server didn't declare is `FeedUnavailableError`, not a silent guess
  (`'D'` and `'1D'` are recognized as the same declaration). A server without `/config` gets the
  protocol's defaults (search on, no groups). The adapter also republishes the declaration through
  the seam's `config()`, so the widget opens on a timeframe the server actually serves.
- **Group-catalog symbol search.** When `/config` declares `supports_group_request`, search is served
  from the columnar `/symbol_info?group=` catalog instead of `/search`.
- **`no_data` + `nextTime` is a gap, not the end.** The chart re-asks once at `nextTime` (a session
  gap hop); only `no_data` *without* the hint ends scroll-back. `nextTime` in ms or s both work.
- **The seam's inclusive `[from, to]` is bridged** to UDF's exclusive `to` inside the adapter, so your
  server sees standard UDF ranges; implement nothing special.

## Symbology

Symbology is the set of display facts that decide how a market's prices are written. Your datafeed
owns them (`resolve` answers with `SymbolInfo`), and one package formatter uses them everywhere a
price appears: the price scale, the crosshair and last-price labels, the legend, the context menu,
every drawing label, indicator scales, and the extension seam. Precision comes from the symbol,
never from the size of the price, so the same market reads at the same width on every surface. An
indicator that declares its own precision keeps it; every other value writes through the symbol
formatter.

`PriceFormat` expresses every supported form in five facts:

| Fact | What it says |
|---|---|
| `pricescale` | Price units per whole unit. `100` writes cents, `100000` writes FX pipettes, `32` writes thirty-seconds. |
| `minmov` | The smallest move, in those units. It declares the grid, not the column width. |
| `minmove2` | The further division of one `minmov` step. `4` means quarters of a thirty-second. |
| `fractional` | Write the sub-unit part as a counted fraction rather than as decimals. |
| `variableTickSize` | An ordered ladder of tick sizes by price band, as a space-separated string. |

Build a formatter once per symbol and keep it:

```ts
import { createPriceFormatter, type PriceFormat } from '@trdrs/quickcharts'

const equity: PriceFormat = { pricescale: 100, minmov: 1 }
createPriceFormatter(equity).format(123.4) // '123.40'

const emini: PriceFormat = { pricescale: 100, minmov: 25 }
createPriceFormatter(emini).format(4500.25) // '4500.25'

const treasury: PriceFormat = { pricescale: 32, minmov: 1, fractional: true }
createPriceFormatter(treasury).format(110.5) // "110'16"

const bonds: PriceFormat = { pricescale: 128, minmov: 1, minmove2: 4, fractional: true }
createPriceFormatter(bonds).format(110.515625) // "110'16'2"
```

`format` and `parse` are exact inverses, so a formatter reads back what it wrote:

```ts
import { createPriceFormatter } from '@trdrs/quickcharts'

const formatter = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true })
formatter.parse("110'16") // 110.5
formatter.parse('110.5') // null, because that symbol does not write decimals
formatter.precision() // 0, because a fractional format writes no decimal digits
```

A surface with no DOM at all, a native view or a server, imports the same formatter from
`@trdrs/quickcharts/format`. The entry carries the formatter and its types and nothing that names a
window, a document or a DOM type, so it loads anywhere JavaScript runs and writes a price exactly as
the chart's axis does:

```ts
import { createPriceFormatter, type PriceFormat } from '@trdrs/quickcharts/format'

const bonds: PriceFormat = { pricescale: 128, minmov: 1, minmove2: 4, fractional: true }
createPriceFormatter(bonds).format(110.515625) // "110'16'2"
```

A ladder changes width by band, because the symbol declared those bands:

```ts
import { createPriceFormatter, parseTickBands, tickBandFor } from '@trdrs/quickcharts'

const laddered = createPriceFormatter({ pricescale: 10000, minmov: 1, variableTickSize: '0.0001 1 0.001 10 0.01' })
laddered.format(0.5432) // '0.5432'
laddered.format(54.32) // '54.32'

const bands = parseTickBands('0.0001 1 0.001 10 0.01')
tickBandFor(bands, 5)?.size // 0.001
```

The formatter writes a `.` decimal sign and no thousands separator. Pass a locale to take that
locale's decimal sign, or set the punctuation yourself:

```ts
import { createPriceFormatter } from '@trdrs/quickcharts'

createPriceFormatter({ pricescale: 100, minmov: 1 }, { locale: 'de-DE' }).format(1234.5) // '1234,50'
createPriceFormatter({ pricescale: 100, minmov: 1 }, { numericPunctuation: { groupSign: ',' } }).format(1234.5) // '1,234.50'
```

### Naming

The same facts name the market on screen, through one rule with three faces. `symbolNames` reads a
resolved `SymbolInfo`, a search row, or the feed symbol alone before either has landed, and answers
the compact mark a label wears, the title a reading wears, and the description beside a mark. A
pair market reads in the codes it trades in, never a spelled-out currency; a market that is not a
pair keeps the feed's own words; the venue prefix never reaches the screen. The chart's pill, legend
and picker read these faces, so anything you name beside the chart reads the same:

```ts
import { symbolNames, type SymbolNames, type SymbolRow } from '@trdrs/quickcharts'

const row: SymbolRow = { symbol: 'HYPERLIQUID:ETH', name: 'Ethereum perpetual', exchange: 'Hyperliquid', type: 'crypto', currencyCode: 'USDC' }
const perp: SymbolNames = symbolNames(row)
perp.mark // 'ETHUSDC'
perp.title // 'ETH / USDC'
perp.description // 'ETH / USDC'

symbolNames({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc', exchange: 'NASDAQ', type: 'stock', currencyCode: 'USD' }).mark // 'AAPL'
symbolNames({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc', exchange: 'NASDAQ', type: 'stock', currencyCode: 'USD' }).description // 'Apple Inc'
symbolNames('HYPERLIQUID:ETH').mark // 'ETH', before the symbol resolves
```

`@trdrs/quickcharts/symbols` carries the same rule on its own, `symbolNames` and `bareTicker`, with
nothing that names a window, a document or a DOM type, so a view of your own with no DOM, a native
search list among them, names a market exactly as the chart does. `bareTicker` is the ticker inside
a feed symbol, its venue prefix shed:

```ts
import { bareTicker, symbolNames } from '@trdrs/quickcharts/symbols'

symbolNames({ symbol: 'HYPERLIQUID:BTC', name: 'Bitcoin perpetual', exchange: 'Hyperliquid', type: 'crypto', currencyCode: 'USDC' }).title // 'BTC / USDC'
bareTicker('CME:ES1!') // 'ES1!'
```

Symbology is display truth: how the chart writes a market's prices. Execution facts, such as lot
size and pip value, stay with your trading integration, and its execution grid can differ from the
chart's display grid.

If your data comes from a UDF server, map its `/symbols` answer without collapsing the facts:

```ts
import { createPriceFormatter, udfPriceFormat, udfSymbolInfo } from '@trdrs/quickcharts'

const raw = { name: 'ZBZ2026', pricescale: 128, minmov: 1, minmove2: 4, fractional: true }
const info = udfSymbolInfo(raw, 'ZBZ2026')
createPriceFormatter(udfPriceFormat(raw)).format(110.515625) // "110'16'2"
info?.dataStatus // 'streaming'
```

## Save and load

Quick Charts persists two different kinds of thing, and the difference decides where each one lives.

Saved charts, layouts, drawing documents and templates are **entities**: a viewer names them, opens
them in two tabs, and can lose them. They have identity and versions, and they live on the
save/load adapter you supply. Viewer preferences (the last symbol and timeframe, the scale mode, the
replay speed) are **flat settings**: they need no identity, and they live on the small `ChartStorage`
port beside it.

The chart never writes on its own. It tells you when a save would be worth making, through the
`saveNeeded` event, and it runs a write only when a viewer asks for one through the built-in UI or
when you call a save method yourself.

### What a saved entity carries

Every family works the same way. A read returns a `ResourceRef`: a stable id plus an opaque revision
token. A write quotes the revision it believes it is replacing. A write against a revision the store
has moved past returns a typed `conflict` carrying the current ref, which you resolve rather than
overwrite.

```ts
import { memorySaveLoadAdapter } from '@trdrs/quickcharts'

const adapter = memorySaveLoadAdapter()

const created = await adapter.charts.create({ name: 'Morning', symbol: 'ESZ2026', timeframe: '5m', content: '{}' })
if (created.kind === 'ok') {
  const accepted = await adapter.charts.update(created.ref, { name: 'Morning', symbol: 'ESZ2026', timeframe: '15m', content: '{}' })
  const stale = await adapter.charts.update(created.ref, { name: 'Morning', symbol: 'ESZ2026', timeframe: '1h', content: '{}' })
  accepted.kind // 'ok', and it carries the revision the store now holds
  stale.kind // 'conflict', and it carries the ref that won
}
```

A chart's, a layout's and a template's `content` is opaque to your store: pass it through, and the
chart's formats stay the chart's own. A drawing document is the one structured body, because two
surfaces showing the same drawings have to merge rather than overwrite.

Treat the revision as opaque. Mint it however your backend prefers, as an ETag, a counter or a
content hash, and compare it only for equality.

### The built-in Save/Load UI

With the `layouts` feature on, the top bar carries the open layout's name, a marker for unsaved
changes, and a menu with Save, an Autosave switch, Make a copy, Rename, Download chart data, Create
new layout, the layouts used most recently, and Open layout: the Layouts dialog, with search, a sort
by name or by date modified, a star that keeps a layout at the top, and delete behind a
confirmation. The sort and the stars are the viewer's, kept in the widget's `ChartStorage`. Each
saved layout is listed by the market and timeframe its active chart showed when
it was saved, or by its age where the store kept neither.

Every row runs a command (`widget.layout.save`, `rename`, `load`, `open`, `delete`, `create`, `autosave`,
and `chart.data.download` for the export), so an access policy that refuses layout writes disables
the rows and refuses the same verb from every other door. Ctrl+S, and Cmd+S on a Mac keyboard, run
the save command from the chart's own root, under that same policy: an open layout saves, and a
never-saved one is asked for a name first. The period key opens the Layouts dialog through
`widget.layout.open`, under the same policy. Download chart data writes the active chart's loaded bars
as CSV with time, open, high, low, close and volume columns in UTC, and is unavailable on a chart
holding no bars. The menu hears what a verb did through the widget's `layout` event and
what it refused through `saveConflict`.

Save and Rename commands are unavailable while a layout load is pending. Hosts performing
background initialization should recheck `commands.available('widget.layout.save')` after any
awaited discovery, before creating an initial layout. Direct API calls retain caller-controlled
ordering; this command readiness is distinct from the unsafe-content `notSaving()` state.

Direct `widget.layout.saveLoad` calls publish the same events once at the committed binding,
so a host-created or reopened layout immediately updates the package toolbar. Cancelled loads
and stale write results publish no success. A rescue copy or partial load can update the name
without clearing `notSaving()` or the toolbar's existing dirty state. Removing an already absent
open row reports its removal and a `saveConflict` refusal; the absent binding is detached.

```ts
import { createChart, createUdfDatafeed, memorySaveLoadAdapter } from '@trdrs/quickcharts'

declare const uiContainer: HTMLElement
const uiWidget = createChart({
  container: uiContainer,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  saveLoad: memorySaveLoadAdapter(),
})
uiWidget.on('saveNeeded', () => note('the viewer changed something a save would keep'))
uiWidget.on('layout', (event) => note(`${event.kind} ${event.name ?? ''}`))
uiWidget.commands.execute('widget.layout.save', { name: 'Desk', asNew: true })
```

### The transport-neutral adapter

`ChartSaveLoadAdapter` is four families over one contract. Each family is a `ResourceStore` with the
same five calls, and every call takes an `AbortSignal` so abandoned work stops cleanly:

```ts
import { emptyDrawingDocument, memorySaveLoadAdapter, type ResourceRef } from '@trdrs/quickcharts'

const adapter = memorySaveLoadAdapter()
const controller = new AbortController()

await adapter.layouts.list(controller.signal)
await adapter.templates('indicator').list()
const context = { version: 1, kind: 'symbol-global', symbol: 'ESZ2026' } as const
await adapter.drawings(context).create(emptyDrawingDocument(context))

const ghost: ResourceRef = { id: 'gone', revision: 'rev-1' }
const outcome = await adapter.charts.remove(ghost)
outcome.kind // 'not-found'
```

An aborted call rejects with an error named `AbortError` and changes nothing.

`memorySaveLoadAdapter` keeps everything in memory for the life of the page. Use it for tests,
server rendering and an intentionally ephemeral embed, and implement the same contract over your
own backend for durable storage.

### The REST adapter and its wire contract

If your saved resources live behind HTTP, `@trdrs/quickcharts/adapters/rest` implements the same contract
over a published wire contract, and you implement the service.

```ts
import { createRestSaveLoadAdapter } from '@trdrs/quickcharts/adapters/rest'

const restSaves = createRestSaveLoadAdapter({
  baseUrl: 'https://api.example.com/chart-storage',
  // Your transport. `fetch` fits as it is; wrap it to add what your product needs.
  request: (url, init) => fetch(url, { ...init, credentials: 'include' }),
})
await restSaves.layouts.list()
```

You supply two values. `baseUrl` is where you mounted the routes, and `request` is how a request is
made. Authorization, cookies, CORS, retries, timeouts and tenancy stay in your request function,
because their consequences are yours: the adapter builds each request from `baseUrl` and hands it to
your function, which adds the credentials and headers your service needs, and it makes a request
only when you call a verb.

Your service serves four collections under that base URL. Every path below is relative to it.

| Path | Verbs | Body |
| --- | --- | --- |
| `/charts` | `GET` lists, `POST` creates | `{ name, symbol, timeframe, content }` |
| `/charts/{id}` | `GET` reads, `PUT` replaces, `DELETE` removes | the same |
| `/layouts`, `/layouts/{id}` | the same five | `{ name, symbol?, timeframe?, content }` |
| `/drawings?symbol=&context=`, `/drawings/{id}` | the same five | `{ content }` |
| `/templates/{kind}`, `/templates/{kind}/{id}` | the same five | `{ name, tool?, content }` |

A layout's `symbol` and `timeframe` are listing text: the active chart's market as the chart writes it
(`BTCUSDC`) and its timeframe token, as they stood at the save. Keep them and return them in the
listing, or leave them out and the chart lists the layout by its age.

A listing answers `{ "items": [...] }` of metadata. A read answers `{ "id", "revision", "body" }`. A
create, update or delete answers `{ "id", "revision", "meta"? }`. Every update and delete sends the
revision it is replacing in `If-Match`, and your service must compare it before it writes.

Three statuses carry meaning, and the adapter turns each into the same outcome the in-memory adapter
gives you:

- `404` is `not-found` from a write, and `null` from a load.
- `409` is `conflict`, and its body states the ref that stands now: `{ "error": "conflict",
  "current": { "id", "revision" } }`. A create quotes no revision, so it can conflict only on
  identity: a drawings context that already holds a document, or a name a sibling already has.
- `428` states that a conditional route was reached with no `If-Match`. The adapter always sends
  one, so a `428` means the request did not arrive as it was sent.

Any other status, and any body that is not the shape the route promises, raises a
`RestSaveLoadError` carrying the status, the method and the URL. Decide what it means: an outage is
not an empty listing, and answering one as an empty listing is a lie the next save acts on.

```ts
import { createRestSaveLoadAdapter, RestSaveLoadError } from '@trdrs/quickcharts/adapters/rest'

const saves = createRestSaveLoadAdapter({ baseUrl: 'https://api.example.com/chart-storage', request: fetch })
try {
  const rows = await saves.layouts.list()
  note(`${rows.length} saved layouts`)
} catch (e) {
  if (e instanceof RestSaveLoadError) note(`${e.method} ${e.url} answered ${e.status}`)
  else throw e
}
```

The drawings collection is scoped by two query parameters: `symbol`, and an opaque `context` token
for the drawing-resource context. Store rows under the pair and return them under the pair; the
token is not for reading.

The full schema ships with the package as `dist/rest-openapi.json`, an OpenAPI document generated
from the same contract the adapter implements. Read it, lint it, or generate a server stub from it.

The adapter is a separate entrypoint, so a project that never imports it carries none of it.

### Charts, layouts and their low-level APIs

The widget drives the charts family for you. `createChart({ saveLoad })` takes your adapter, and
`chart.saveLoad` holds the open saved chart: `save(name)` updates it at the revision it was opened
at (or creates, when nothing is open or you pass `asNew`), `load(id)` applies a saved chart and
opens it, `remove()` deletes the open one at its held revision, `detach()` forgets the binding so
the next save creates, and `current()` reports the ref and name on screen. `serialize()` hands you
the same opaque content the save writes, and `restore(content)` applies one. A layout does the same
for itself through `widget.layout.saveLoad` over the layouts family.

A load is one transaction. The content is read and applied first, and the resource's id, name and
revision become the open resource only after that succeeds. A saved layout is read whole, its
version, arrangement, normalized custom pane geometry, sync flags, active tile and every chart
inside it included, before a single tile moves. The current layout reader accepts only this v2
shape. Divider drags preserve the selected arrangement's topology and save normalized geometry;
tile maximize is transient and preserves every chart instance. If a chart
callback synchronously detaches or starts another load while that content is applying, the later
operation owns the binding. The superseded load answers `cancelled` and cannot restore its id after
the callback returns.

The built-in layout setup control follows committed layout state, including direct API changes and
restores. Its arrangement glyph, accessible name, selected tile, and five synchronization switches
remain in step while the menu is open; transient tile maximize does not change the arrangement it
names.

Growing a layout keeps every existing chart instance and initializes each new tile from pane 0's
safe presentation: symbol, timeframe, style, indicators and comparisons. Mutable indicator
configuration is copied per tile; replay, session state and saved-chart identity are not copied.

`load` answers rather than rejecting. Five kinds, told apart without reading a message:

| `kind` | What happened |
|---|---|
| `ok` | The content is on screen and the resource is open. Carries its `ref` and `body`. |
| `not-found` | The store answered, and holds no resource under that id. |
| `invalid` | The content could not be read, or could not be applied. |
| `unavailable` | The store could not be reached. Carries `cause`, the error it failed with. |
| `cancelled` | The load was abandoned: a later load took its place, your signal aborted, or the widget went down. |

Only `ok` binds. A refusal before application leaves the screen and its former binding untouched.
If a synchronous callback supersedes a load during application, the applied screen is left unbound
unless the newer operation has already committed its own binding, so it can never autosave through
the resource that was on screen before the load. An `AbortSignal` of your own ends the load as
`cancelled` too, so nothing in this family rejects for a load that was abandoned. A widget built
with no `saveLoad` adapter is the one case that is not an outcome: every verb of the family rejects,
because nothing was wired for them to reach.

```ts
import { createChart, createUdfDatafeed, memorySaveLoadAdapter } from '@trdrs/quickcharts'

declare const container: HTMLElement
const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  saveLoad: memorySaveLoadAdapter(),
})
widget.on('saveConflict', (info) => console.warn(info.message))
const saveLoad = widget.activeChart().saveLoad
const saved = await saveLoad.save('Morning')
if (saved.kind === 'conflict') console.warn(saved.message) // saved elsewhere since it was opened
saveLoad.current()?.name // 'Morning'

const opened = await saveLoad.load('chart-42')
switch (opened.kind) {
  case 'ok':
    break
  case 'cancelled':
    break // a later load is landing instead, so there is nothing to say
  case 'unavailable':
    console.warn(opened.message, opened.cause) // your store, not the content
    break
  case 'invalid':
  case 'not-found':
    console.warn(opened.message) // still bound to what you had
    break
}
```

A load that a later load supersedes is `cancelled`, with no signal of your own involved, and only
the later load binds. This includes a later load begun synchronously by a chart callback during
application. A widget disposed while the store is still answering answers the same way. That is
what keeps a slow answer for the chart a viewer has left from landing on the chart they are looking
at.

Where a body fails after part of it has been applied, the chart puts back the content it held. If
that fails too the chart is holding neither, and it stops saving: `saveLoad.notSaving()` reports it,
`save` answers `not-saving` and writes nothing, the built-in layouts menu says so on the toolbar and
stands its Save and its autosave down, and the sentence for the viewer arrives on `saveConflict`.

Saving starts again when a load lands, and only then: a whole content out of the store, applied in
full, under the resource it came from. `save(name, { asNew: true })` stays available throughout, and
it is worth offering, because a copy creates a resource of its own and writes over nothing, so the
work on screen is kept and the last version that was whole is left standing. It is a rescue rather
than a repair: a store accepting a write says nothing about the content of what it took, so the
chart goes on saving nowhere else until a load puts a whole content back.

A layout also refuses writes while any child chart is not saving. A complete layout load recovers
its children only after the whole content and layout binding commit, and detaches their previous
standalone chart bindings. Partial content and copy saves do not establish recovery.

A saved chart carries its symbol, timeframe, style, scale, appearance, comparisons, extension
state, combined-mode drawings, and every indicator instance. Indicator definitions remain code in
your widget. The blob names each definition by `manifest.id` and carries the instance id, explicit
inputs, color, title, overrides and hidden state. Loading replaces the full instance list, so the
constructor's `indicators` are seeds only for a chart with no saved content. Definitions resolve
against the widget's built-ins and the host definitions that widget has carried. An unknown or
access-denied definition is left out with one counted notice while the remaining content lands. A
definition of your own survives a save only when its manifest declares an `id`.

The opaque version-4 reader validates the whole indicator list before changing a chart or layout.
Missing lists, duplicate instance ids and malformed inputs, titles, colors or overrides refuse the
body as `invalid`; values are not silently filtered or normalized. A load that omits a definition
because it is unavailable is partial and cannot clear an earlier `notSaving()` state.
Complete recovery requires every typed appearance leaf with a valid concrete color value and,
in combined mode, a drawings array. Separate-mode chart content does not need that array.

Hydration and rollback do not emit `saveNeeded` for their own storage writes. An event already
queued by a viewer's edit is preserved. A late save result does not replace a newer load's binding;
the built-in commands announce a saved layout only while that result is still current.

### Drawings: combined or separate

Drawings have two storage modes, and you pick one when you construct the widget. **Combined** is the
default: the drawings ride the chart's own saved content, so saving a chart or a layout saves the
drawings on it. **Separate** keeps them out of that content entirely and stores them as their own
documents in the adapter's drawings family, one document per drawing-resource context:

```ts
import { createChart, createUdfDatafeed, memorySaveLoadAdapter } from '@trdrs/quickcharts'

declare const separateContainer: HTMLElement
const separate = createChart({
  container: separateContainer,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  saveLoad: memorySaveLoadAdapter(),
  // chart-local: one document per chart, per symbol. `layout-shared` gives the layout's charts one
  // document per symbol, and `symbol-global` gives every chart one.
  drawingPersistence: { mode: 'separate', scope: 'chart-local', layoutId: 'desk-1' },
})
const documents = separate.activeChart().drawingResources
const read = await documents?.get()
if (read?.kind === 'ok') {
  // The ref the read stood at rides the apply, so the chart's next write is an update at that
  // revision rather than a create that learns the ref from the refusal it gets back.
  const applied = documents?.apply(read.document, read.ref)
  // 'ok' with the drawings it attached, and every one it would not: an entry whose source or pane
  // is not on this chart is named rather than moved onto whatever is nearest.
  applied?.kind
}
await documents?.reload()
```

A document carries each drawing's stable id, the source and pane that own it, its type and its own
opaque state, plus ordered groups and deletion tombstones. The tombstones are why a drawing you
delete stays deleted: another chart showing the same document still holds it, and the merge that
follows a refused write drops it instead of taking it back. A refused write reaches you through the
widget's `saveConflict` event.

`layoutId` is yours to choose and must be stable across reloads; `chart-local` and `layout-shared`
require it, because a document keyed by an id the next page load mints again could never be read
back. There is no reader, fallback or mirrored write between the two modes.

A `chart-local` document is keyed by the chart's tile in the layout, which is what survives a
reload. It is a position, so it follows the position: changing the arrangement, or closing a chart
with charts after it, renumbers those tiles, and each of them then opens the document of the tile it
now occupies. Choose `layout-shared` when the drawings belong to the layout rather than to one
tile.

### Templates

`adapter.templates(kind)` is a store per kind: `'indicator'` for indicator settings, `'drawing'` for
a drawing tool's look, and `'palette'` for chart appearance. A drawing template carries the `tool`
it belongs to, because a trend-line template means nothing on a rectangle. Their content is opaque,
like a chart's.

### Viewer settings

The widget keeps the viewer's flat preferences in a `ChartStorage`. Every key is an opaque string in
the `quickcharts.` namespace, and every value is an opaque string; a store routes or scopes them and
treats both as opaque. The default is an in-memory store that lasts the page; supply your own to
keep them per device or per viewer. A browser store is a few lines you write and own, so where
preferences live stays your decision:

```ts
import { memoryChartStorage, type ChartStorage } from '@trdrs/quickcharts'

const perDevice: ChartStorage = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
  keys: () => Object.keys(localStorage),
}
void perDevice
void memoryChartStorage()
```

Preferences need no identity or revision. Saved charts, layouts, drawings and templates do, and they
live on the saved-resource adapter above, never here.

### Conflicts

A conflict means someone else wrote the same entity after the copy on screen was read. The chart
never resolves that by overwriting. It reports the case with a sentence from its own catalog and the
ref that stands now, and leaves the decision to you: reload and lose the local edit, save a copy
under a new name, or show the viewer both.

Reach the report in two places. A verb you called answers a typed `conflict` outcome. A write the
widget made for the viewer, through the built-in UI or its own drawing sync, arrives on the
`saveConflict` event with the family it came from.

### Common issues

**Nothing saves and no error appears.** The widget has no adapter. `createChart({ saveLoad })` is
what enables the family, and `widget.capabilities().saveLoad` reports which families it sees.

**Every save creates another row.** Something detached the open resource, or each save passes
`asNew`. `current()` reports what the next save will update.

**A saved layout opens with the wrong drawings.** In separate mode the document is keyed by
`layoutId` and the chart's tile. An id that changes between reloads, or a re-tile that moves a
chart, points the chart at another document.

**A conflict on the first save of the day.** Two tabs are open on the same entity. Both hold a
revision, and the second write is refused; reload the newer one before saving it again.

**A REST call raises instead of answering.** The status is one the contract gives no meaning to.
Read `error.status` and `error.url`: a `401` is a session your request function has to renew, and a
`5xx` is your service.


## Indicators

Indicators are **definitions**: a declarative manifest (typed inputs + declared plots/levels/fills,
placement, volume needs) paired with a pure compute over the chart's bars. The package owns the
whole rendering pipeline (overlay and per-indicator panes, lines/areas/histograms/markers, static
levels, band fills, per-instance style overrides) and treats every definition alike, so a
definition renders identically in this widget and in any richer host built on the same pipeline.

### The built-in indicators

The package ships 23 built-in definitions as `BUILT_IN_INDICATORS`, in picker order: SMA, EMA,
HMA, VWMA, Bollinger Bands, Donchian Channels, Keltner Channels, Supertrend, Parabolic SAR, RSI,
MACD, Stochastic, Stochastic RSI, ADX, ATR, CCI, Williams %R, Rate of Change, Momentum, Volume,
VWAP, On-Balance Volume, and Money Flow Index. Each is a plain `IndicatorDefinition` with its
catalog identity beside it: `id` (the stable key you persist), `tag` (the short mark a legend chip
shows), `category`, and `nameKey` and `descriptionKey`, which resolve through the chart's own
language object in every built-in locale.

```ts
import { BUILT_IN_INDICATORS, createChart, createChartI18n, createUdfDatafeed } from '@trdrs/quickcharts'

const i18n = createChartI18n('en')
const rsi = BUILT_IN_INDICATORS.find((definition) => definition.id === 'rsi')!
const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  i18n,
  indicators: [{ id: 'rsi-14', definition: rsi, title: i18n.t(rsi.nameKey), color: '#f5a623' }],
})

const picker = BUILT_IN_INDICATORS.map((definition) => ({
  id: definition.id,
  name: i18n.t(definition.nameKey),
  description: i18n.t(definition.descriptionKey),
}))
```

An instance's `inputs` override the manifest defaults by key (`{ period: 21, source: 5 }` for an
RSI over HLC3). A built-in's `plotTitles` and `inputTitles` label its plots and inputs in a
settings surface.

### Your own definitions

A host definition is the same shape. The math is yours; the manifest declares what to draw.

```ts
import type { IndicatorDefinition } from '@trdrs/quickcharts'

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
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

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
- **A plot can ride the volume band.** `scale: 'volume'` on a plot pins it to the chart's volume
  histogram instead of the pane's price scale.
- **A fill can shade between levels.** A fill whose `between` names two levels rather than two
  plots shades between those limit lines wherever the bars are.
- **`needsVolume` is honest.** On a feed whose bars carry no volume, the instance draws nothing
  and reports "No volume from this feed" instead of painting a flat lie.
- **Overrides layer, never fork.** Per-instance styling (`IndicatorOverrides`) folds into the
  manifest before the walk and gates visibility after, the same layering every host applies.
- **Instances save by definition id.** Saved charts and layouts retain each instance's explicit
  inputs, look and hidden state. Give a host definition a stable `manifest.id` so the widget can
  resolve it when content loads.

The lower-level pieces are exported for hosts that orchestrate their own compute:
`buildManifestPlots` (the walker), `attachIndicators` (the renderer), `overriddenManifest` /
`applyPlotOverrides` (the override fold), and the fill/shade canvas painters.

## The widget

`createChart(options)` mounts a complete datafeed-driven chart into a DOM element, with no framework
required. It answers a `ChartWidget`: one or many charts under one root, one theme, one language,
one command registry.

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const widget = createChart({
  container: document.getElementById('chart')!,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  symbol: 'ES',
  timeframe: '1m',
  style: 'candles',
  theme: { mode: 'dark' },
})
await widget.ready() // the first data has painted
widget.activeChart().setSymbol('NQ')
widget.dispose() // teardown; every handle and subscription is inert afterwards
```

The widget paints the main series and volume, applies live updates by the bar rules above, pages
older history in as the viewer scrolls left (stopping at the feed's `noData`), persists the viewer's
preferences through `ChartStorage`, runs configured indicator instances through the manifest
pipeline, and mounts the drawing layer, the legend and the context menu.

When older main or comparison history extends the renderer's shared timeline, the chart retains
the latest fractional logical window, spacing and permitted off-data padding. Its compensating
range write is not a viewer event and does not fan through layout date-range synchronization. The
write owns the renderer's deferred reports only while the current symbol generation and navigation
epoch still match. A coalesced mouse, touch or wheel pan/zoom remains observable and
takes priority, including when a mouse drag continues outside the chart or renderer bounds retain
the maintenance span or either endpoint. Public range methods and built-in navigation commands
enter that same epoch, so every supported navigation door has the same precedence.

`toolbarContainer` optionally supplies a separate element for the top toolbar, such as a space
between a host's navigation and its other controls. The widget appends one package-owned, themed
child there; it never clears or styles the supplied element. The toolbar follows the widget's
theme, language and active chart, and its child is removed at disposal. The toolbar's menus and
dialogs open in the widget's layer on the document body, at viewport coordinates, so each menu
drops from its control wherever you place the toolbar and stands over your own elements. Supply a
`fullscreen.target` containing both elements to keep the
toolbar available in fullscreen. Without `toolbarContainer`, the toolbar sits above the chart as
part of the default composition. When horizontal space is limited, the toolbar scrolls without
dropping controls from the keyboard order.

`drawingToolbarContainer` supplies separate host space for a single drawing toolbar. The package
fills that space's height with its own themed child, follows the active chart when a layout
changes, and removes the child on disposal. An external drawing toolbar leaves the full chart width
for the canvas; without the option, each chart keeps its internal drawing toolbar and reserved
leading column. Drawing flyouts stay beside the external drawing toolbar within the widget's bounds
regardless of the active pane. Switching charts closes an open flyout before the drawing toolbar
targets the newly active chart.
Include this container in the custom fullscreen target alongside the chart and top toolbar.

### Widget and chart

Two scopes, because two things are true at once: what the widget as a whole is doing, and what one
chart is doing. `widget.charts()` lists every chart; `widget.activeChart()` is the one the viewer
last pointed at; `widget.chart(id)` finds one by its stable id.

```ts
import { CHART_STYLES, type ChartHandle, type ChartWidget } from '@trdrs/quickcharts'

function drive(widget: ChartWidget): void {
  const chart: ChartHandle = widget.activeChart()
  chart.setTimeframe('5m')
  chart.setStyle(CHART_STYLES[3]!) // 'line'
  chart.setScaleMode('log')
  chart.scroll(-50) // fifty bars back
  chart.zoom(0.8) // show fewer bars
  chart.reset() // fit the loaded data
  chart.goLive() // back to the live edge, same span
  chart.indicators.set([])
  void chart.visibleRange()
  void chart.rangePreset() // selected bottom-bar range, or null after other navigation
  void chart.logicalRange()
}
```

### The live edge and the plot

`goLive()` glides the view back to the live edge on an easing curve, moving it sideways only: the
zoom and the price scale stay as they are. From far back it steps in to a width and a half first, so
the return reads the same from any distance, and a touch, a drag, a wheel or any other navigation
stops it where it stands. Under a reduced-motion preference it goes in one step. `Alt+L` and the
`chart.view.goLive` command run the same glide.

`awayFromLiveEdge()` says whether the view sits back from the live edge, and the `liveEdge` event
reports each change, so a control offering the way back shows exactly while there is somewhere to go
back from. A glide under way reads as returned from its first frame, and bar replay, which has its
own way back, reads as returned throughout. `plotArea()` and the `plotArea` event give the main
pane's plot in the pixels of the element you handed the widget, as the four distances an absolutely
positioned element takes, so a control floating over the bars stays beside the price scale as it
widens:

```ts
import { type ChartHandle } from '@trdrs/quickcharts'

function backToLive(chart: ChartHandle, button: HTMLButtonElement): () => void {
  const place = (): void => {
    const plot = chart.plotArea()
    if (!plot) return
    button.style.right = `${plot.right + 8}px`
    button.style.bottom = `${plot.bottom + 8}px`
  }
  button.onclick = () => chart.goLive()
  button.hidden = !chart.awayFromLiveEdge()
  place()
  const offEdge = chart.on('liveEdge', (away) => {
    button.hidden = !away
  })
  const offPlot = chart.on('plotArea', place)
  return () => {
    offEdge()
    offPlot()
  }
}
```

On a touch screen two fingers zoom proportionally: the bars spread exactly as far as the fingers
do, and the point under the fingers stays under them as they travel. A finger held on the plot
scrubs the crosshair while it stays down, and a flick coasts the chart calmly to rest.

With `touch: { freePan: true }` the chart is a canvas under the finger: a one-finger drag on the plot
releases the main price scale's framing, as a drag on the price scale does, so the price follows the
finger as freely as the time and nothing re-frames while the viewer pans, flicks or pinches. A pinch
zooms the time and leaves the price where it stands. A double-tap on the price scale, a new symbol or
timeframe, and `goLive()` frame the bars again; `goLive()` frames them from the tap, and the price
follows the window home as the time glides. It is off unless you turn it on.

With `features: { navigation: false }` the chart holds its view: no drag, flick, pinch or wheel moves
it, a scale takes no drag or double-tap, and the zoom and scroll commands and their keys are
unavailable, so the navigation cluster is not drawn whatever `ui.navigation` says. The view stays
where the chart frames it: on the live edge, at a range preset or at a window you set. `goLive()`
and `reset()` still frame it, and the crosshair still follows a pointer or a held finger. It is on
unless you turn it off.

### Chart styles

`candles`, `hollow`, `bars`, `line`, `area`, `baseline`, `stepline`, listed as `CHART_STYLES`. A
style switch is presentation: nothing refetches, and the loaded bars, indicators, drawings,
comparisons, scale and visible range all survive it. Four of the seven are value-shaped
(`valueShaped(style)`), which is the one predicate a host branches on when it renders open, high and
low values of its own.

By default a chart offers all seven styles, and the style picker groups them by family. `styles`
names the styles you offer, in the order the picker lists them, and `style` must be one of them:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// Candles, line and area, in this order, opening on the line.
createChart({ container, datafeed, styles: ['candles', 'line', 'area'], style: 'line' })

// Every style and no picker: a control of your own runs the chart.style.<id> commands.
createChart({ container, datafeed, ui: { topBar: { styles: false } } })

// Candles and line, with no picker.
createChart({ container, datafeed, styles: ['candles', 'line'], ui: { topBar: { styles: false } } })
```

A style you leave out has no `chart.style.<id>` command, so no menu, shortcut or host control
reaches it, and `setStyle` ignores it. With one style offered the picker is not shown, since there
is nothing to choose. `ui.topBar.styles: false` hides the picker on its own terms, so you can
restrict the set, hide the picker, do both, or do neither. A saved layout, saved chart or stored
preference that names a style you left out opens on the first style in `styles`, and the rest of it
restores. An empty list, an id outside `CHART_STYLES`, a repeated id and a `style` outside the list
are setup errors that `createChart` throws.

With `transitions: { style: true }` a change between a style drawn from whole bars (candles, hollow
candles, bars) and one drawn from closes (line, area, baseline, step line) morphs over half a second,
easing in and out: each bar's open, high and low slide into its close as the line comes in through
the closes, and back out of it as the line goes. A change within either family is made at once, and
so is every change under a reduced-motion preference. It is off unless you turn it on.

```ts
import { createChart, type ChartDatafeed, type TransitionOptions } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

const transitions: TransitionOptions = { style: true }
createChart({ container, datafeed, transitions })
```

### Offered timeframes

By default a chart offers the 26 presets (`TIMEFRAME_PRESETS`) and lets the viewer compose custom
timeframes. `timeframes` names the timeframe tokens you offer, presets or any other token the
grammar reads, and `timeframe` must be one of them. The order you give does not matter: the picker
lists each unit's group smallest first. `customTimeframes: false` keeps the presets and removes
custom timeframes:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// Four timeframes, one of them beyond the presets, opening on five minutes.
createChart({ container, datafeed, timeframes: ['2m', '5m', '1h', '1d'], timeframe: '5m' })

// Every preset and no custom timeframes.
createChart({ container, datafeed, customTimeframes: false })

// Two timeframes and no picker: a control of your own runs the chart.timeframe.<token> commands.
createChart({ container, datafeed, timeframes: ['1m', '5m'], ui: { topBar: { timeframes: false } } })
```

A preset you leave out has no `chart.timeframe.<token>` command, and `chart.timeframe.set` and
`setTimeframe` ignore any token you leave out. The picker shows only what you list: a group with
no listed token is not drawn, a listed token beyond the presets sits in its unit's group without a
delete, and there is no custom-timeframe composer. The viewer's saved chips show where you list
them. When you list none of them, the chips are your five smallest timeframes, and the viewer's
stored chips stay stored for a chart that offers them. With one timeframe offered the picker is not
shown. `ui.topBar.timeframes: false` hides the picker on its own terms. A range preset whose
timeframe you leave out reads its span at your nearest coarser timeframe, or at your largest when
none is coarser. Within what you offer, the feed's `resolutions` and the symbol's
`supportedResolutions` still apply: a chip the feed or the symbol does not serve is disabled, and
the picker's list leaves its row out.

A saved layout, saved chart or stored preference that names a timeframe you left out opens on your
smallest timeframe, and the rest of it restores. With `customTimeframes: false` a stored custom
token opens on `1m`. An empty list, a token the grammar cannot read, a repeated token, a
`timeframe` or `layout.charts[].timeframe` outside what you offer, and `customTimeframes: true`
beside a list are setup errors that `createChart` throws. `customTimeframes` is the switch, and
`preferences.customTimeframes` is the list of custom tokens a first-run viewer starts with.

### Offered layouts

By default a chart offers all 55 arrangements (`ARRANGEMENTS`) and lets the viewer change every
sync switch. `layouts` names the arrangement codes you offer, and the layout opens on
`layout.arrangement` or else on the first code you list. `layoutSync` names the sync switches the
viewer may change:

```ts
import { createChart, type ChartDatafeed, type ChartSaveLoadAdapter } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed
declare const saveLoad: ChartSaveLoadAdapter

// A single chart: no layout setup menu, and no re-tile from any door.
createChart({ container, datafeed, layouts: ['s'] })

// One chart, two side by side or a 2x2 grid, with the crosshair always synced and symbol sync the
// only switch the viewer changes.
createChart({ container, datafeed, layouts: ['s', '2h', '4'], layoutSync: ['symbol'], layout: { sync: { crosshair: true } } })

// Every arrangement, with the layout setup menu kept and the saved-layouts menu hidden.
createChart({ container, datafeed, saveLoad, ui: { topBar: { savedLayouts: false } } })
```

The layout setup menu shows only the arrangements you list, in its own rows by chart count, and
leaves out a row with none of them. An arrangement you leave out has no tile, and
`widget.layout.setArrangement` and its command ignore it. With one arrangement offered there is
nothing to choose, so the menu is not shown, unless that arrangement holds several charts and a
sync switch is offered, in which case the menu holds the switches alone. A switch you leave out holds
the value `layout.sync` gives it, or off: the menu does not show it, `widget.layout.setSync` and its
command leave it as it is, and a saved layout cannot change it. An empty `layoutSync` fixes every
switch.

A saved layout whose arrangement you left out opens on the offered arrangement with the most charts
not above the saved count, the first one listed winning a tie. When every offered arrangement holds
more charts, it opens on the one with the fewest, and the extra panes clone the first chart as a
re-tile does. The saved charts past the ones shown are not dropped. The layout carries them with the
saved arrangement and its divider positions, and a save writes them back unchanged beside the shown
charts as they are now: a host offering only `['s']` opens a saved 4-chart layout as one chart, and
after it saves, a host offering every arrangement still opens all four. A re-tile is a new
arrangement and ends the carry, as it tears down the charts it has no pane for. A saved active chart
among the hidden ones leaves the first chart active, and the sync switches restore as saved, apart
from those `layoutSync` leaves out. An empty `layouts`, an unknown or repeated code, a
`layout.arrangement` outside the list, and an unknown or repeated sync switch are setup errors that
`createChart` throws.

`ui.topBar.layouts: false` hides the layout setup menu and the saved-layouts menu together;
`ui.topBar.layoutSetup: false` and `ui.topBar.savedLayouts: false` hide one of them, and neither
shows a menu `layouts: false` hid. The saved-layouts menu saves, opens and lists layouts, so it is
shown only with a layouts store (`saveLoad.layouts`). Without one, its Download chart data row joins
the image menu beside Download image and Copy image, the way an export menu offers a chart as a
picture or as data.

### Offered drawing tools

By default a chart offers every drawing tool. `drawingTools` names the tools you offer, by the type
`access.drawingTool` and the `tool.<type>` icon ids use: a type `drawingTools.all()` lists (from
`@trdrs/quickcharts/drawings`), `zoom` or `eraser`. The order you give does not matter, because the
drawing toolbar keeps its own groups and sections:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// Lines, levels and a ruler: no shapes, patterns, notes or glyphs.
createChart({ container, datafeed, drawingTools: ['trend_line', 'horizontal_line', 'fib_retracement', 'measure'] })

// A chart whose viewers keep and remove the drawings on it and make nothing new.
createChart({ container, datafeed, drawingTools: ['eraser'] })
```

A tool you leave out is not drawn anywhere a tool is chosen: not in its group's flyout, not as a
group's face, which wears the first tool the group offers, not on the favorites bar, and not on the
drawing toolbar for `measure` and `zoom`. A section or group it empties goes with it. The glyph
picker's kinds are the `emoji`, `sticker` and `icon` tools, so a kind you leave out has no tab, and
leaving out all three removes the glyph group. Every door that would arm it refuses:
`chart.drawings.arm` answers `denied`, and `armTool`, `placeImage` and an image pasted over the
chart place nothing. A copy is a new drawing, so a drawing of a tool you leave out is not copied
into another: `chart.drawings.clone` and `chart.drawings.paste` are unavailable for it, `clone` and
`paste` make nothing, and a Control- or Command-drag moves the drawing instead of duplicating it.
Copying it to the clipboard is not refused, so it pastes on a chart that offers its tool.

Drawings of a tool you leave out that are already on the chart, from a saved chart or layout, a
drawings document or another host, render and stay fully editable. They select, restyle through the
selection's settings bar and the settings dialog, lock, hide and delete exactly as any drawing does:
from the settings bar, the eraser, the remove menu and the Delete key. The eraser is always offered,
listed or not, because it removes drawings rather than making them, which is why `['eraser']` is the
way to offer no tool that creates one.

The list composes with your access policy: a tool is offered when you list it and the policy permits
it, and a listed tool the policy refuses is drawn as `access.refused` says (see Refused controls).
Nothing stored is rewritten: a starred tool you leave out keeps its star and returns to the favorites
bar on a chart that offers it, and a group's remembered face is kept the same way.
`features.drawings: false` removes drawing altogether, whatever the list says. An empty list, a type
that names no tool and a repeated type are setup errors that `createChart` throws.

### Offered indicators

By default a chart offers every built-in indicator. `builtInIndicators` names the built-ins you
offer, by the definition id `access.indicator` receives: an id `BUILT_IN_INDICATORS` lists, such as
`sma`. The order you give does not matter, because the indicator picker keeps its own:

```ts
import { BUILT_IN_INDICATORS, createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// Moving averages and RSI only.
createChart({ container, datafeed, builtInIndicators: ['sma', 'ema', 'rsi'] })

// A chart that opens with an indicator it offers.
const sma = BUILT_IN_INDICATORS.find((definition) => definition.id === 'sma')!
createChart({ container, datafeed, builtInIndicators: ['sma'], indicators: [{ id: 'sma-1', definition: sma }] })
```

A built-in you leave out is not listed in the indicator picker: not among the built-ins, not
among the favorites, and not in search results. Every door that would add one refuses:
`chart.indicators.add` (from the picker, the keyboard or your own control) answers `denied`,
`indicators.add` adds nothing, `indicators.set` leaves out an instance of it the chart does not
already hold, and a new pane that a re-tile adds copies the first chart's indicators without it. The
chart has no verb that duplicates an indicator, so a second instance is an add like any other.

Instances of a built-in you leave out that are already on the chart, from a saved chart or layout,
an undo step or another host sharing the store, render and stay fully editable and removable. The
settings dialog, `chart.indicators.update`, the legend's eye and remove control, remove all and
`indicators.remove` work on them exactly as on any instance, and an edit that would move one onto
another built-in you leave out keeps it as it stands. Nothing saved is rewritten because of the
list: a starred built-in you leave out keeps its star and returns to the favorites on a chart that
offers it.

The list filters the built-ins alone. A definition of your own, whose `manifest.id` names no
built-in, is never filtered, and neither is what your `indicatorPicker` source lists: its
collections and rows are your content. The source is handed only the offered ids as `builtInIds`.
The list composes with your access policy: a built-in is offered when you list it and the policy
permits it, and a listed one the policy refuses is drawn as `access.refused` says (see Refused
controls). A non-list, an empty list, an id that names no built-in, a repeated id and an
`indicators` instance whose built-in you do not list are setup errors that `createChart` throws.

### Offered ranges

By default the bottom bar offers every range preset in `RANGE_PRESETS`, from `1D` to `All`.
`ranges` names the presets you offer by their keys, in the order the bottom bar draws them:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// A day, a week's worth of sessions and a year, in this order.
createChart({ container, datafeed, ranges: ['1D', '5D', '1Y'] })

// No range buttons: the bottom bar keeps its clock, timezone picker and session view.
createChart({ container, datafeed, ranges: [] })
```

A preset you leave out has no `chart.range.<key>` command, so no menu, shortcut or host control
reaches it, `chart.range.set` ignores its key, and the bottom bar draws no button for it. An empty
list offers none, which is how you keep the rest of the bottom bar without range buttons;
`ui.bottomBar: false` removes the whole bar. `chart.range.set` still takes an explicit
`{ from, to }` window either way. A preset whose timeframe your `timeframes` leave out reads its
span at your nearest coarser timeframe, as it does without a list. A non-list, a key that names no
preset and a repeated key are setup errors that `createChart` throws.

### Offered timezones

By default the timezone picker offers every zone in `TIMEZONES` and the exchange choice.
`timezones` names the choices you offer: zone ids, and `exchange` (`EXCHANGE_TIMEZONE`) for the
charted symbol's own zone. The picker keeps its own order (UTC, the exchange choice, then every
zone by its current offset); the order you give decides only which choice comes first:

```ts
import { createChart, EXCHANGE_TIMEZONE, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// The exchange's own time, New York or London, opening on the exchange's time for a first-run viewer.
createChart({ container, datafeed, timezones: [EXCHANGE_TIMEZONE, 'America/New_York', 'Europe/London'] })

// Always Tokyo time: no picker, and the clock reads Tokyo.
createChart({ container, datafeed, timezones: ['Asia/Tokyo'] })
```

A choice you leave out has no `chart.timezone.<id>` command (`chart.timezone.exchange` for the
exchange choice), `chart.timezone.set` and `setTimezone` ignore it, and the picker lists no row for
it. With one choice offered the picker is not shown, since there is nothing to choose, and the
bottom bar's clock still reads the time in that zone.

A chart opens on the viewer's stored choice, else on `preferences.timezone`, when you list it, and
otherwise on the first choice you list. A stored choice you leave out is not rewritten: it stays
stored until the viewer picks another zone, so a chart that offers it again opens on it. The
exported registry is not filtered: `TIMEZONES`, `isTimezoneChoice` and `timezoneListing` answer
the full set for code of your own. A non-list, an empty list, an id that names no zone and a
repeated id are setup errors that `createChart` throws.

### Events

Typed maps, one per scope. Every subscription returns its unsubscribe and is inert after
`dispose()`.

```ts
import { type ChartWidget } from '@trdrs/quickcharts'

function watch(widget: ChartWidget): () => void {
  const offTheme = widget.on('theme', (_theme, mode) => document.body.setAttribute('data-mode', mode))
  const offSave = widget.on('saveNeeded', () => void persist())
  const offSymbol = widget.activeChart().on('symbol', (symbol) => header.setSymbol(symbol))
  const offStatus = widget.activeChart().on('feedStatus', (status) => banner.set(status))
  return () => {
    offTheme()
    offSave()
    offSymbol()
    offStatus()
  }
}
```

Widget events: `ready`, `activeChart`, `theme`, `locale`, `saveNeeded`, `saveConflict`,
`fullscreen`, `dispose`. Chart events: `symbol`, `timeframe`, `style`, `visibleRange`,
`logicalRange`, `liveEdge`, `plotArea`, `dataLoaded`, `feedStatus`, `scaleMode`, `timezone`, `indicator`,
`drawing`, `replay`, `compare`, `history`.

### Commands

One registry is the only place a chart verb exists. The chart's own menu, your toolbar, a keyboard
binding and an automation adapter all read this list and run through this `execute`, so a command
your feature configuration hides or your access policy refuses cannot be reached from any of them.

```ts
import { type ChartWidget, type CommandResult } from '@trdrs/quickcharts'

function toolbar(widget: ChartWidget): void {
  for (const spec of widget.commands.list()) {
    button(spec.labelText ?? translate(spec.label), {
      enabled: widget.commands.available(spec.id),
      shortcut: spec.shortcut,
      run: () => {
        const outcome: CommandResult = widget.commands.execute(spec.id)
        if (outcome.kind === 'denied') note('not permitted here')
      },
    })
  }
  widget.commands.setShortcut('chart.view.reset', 'Alt+KeyR')
  const off = widget.commands.onChange(() => rebuild())
  void off
}
```

A command whose one id spans many subjects declares `refuses(arg)` beside `available()`: an
argument your access policy turns away answers `denied` before availability is asked, which is how
`chart.drawings.arm` refuses a tool. `onChange` fires when the registered set or a shortcut changes,
and when `widget.refreshAccess()` says your policy may answer differently. A refusal is a value,
never a throw: `ok`, `unavailable`,
`denied`, `unknown`, or `failed` with the
error. Your own commands register through the same door: a chart extension's `contributeCommands`
puts them in this list with `scope: 'chart'` and its own label text.

### Configuration planes

Five planes configure a widget, and each answers one question.

| Plane | What it answers | Who decides |
|---|---|---|
| `capabilities()` | what the ports, the resolved symbol and the browser can do | derived, never set |
| `features` | which chart behaviors exist | you |
| `ui` | which of the chart's own controls render | you |
| `access` | which commands, drawing tools and indicators are permitted | you |
| `preferences` | the viewer's own values, persisted through `storage` | the viewer, seeded by you |

A behavior you turn off in `features` is gone: its commands report `unavailable`, and every control
over it is absent. A control you hide in `ui` is the only thing that changes. The commands behind it stay available, so a control of your own can run them through
`widget.commands`.

Two presentation flags also close the one command whose only job is opening their dialog.
`ui.symbolSearch: false` removes the search dialog and `chart.symbol.search`, while
`chart.symbol.set` still changes the symbol. `ui.indicatorPicker: false` removes the indicator
picker and `chart.indicators.open`, while `chart.indicators.add` still adds an indicator.

Authorization belongs to `access`: a hidden control's command still answers to it, and a flag
reaches only what the datafeed can do, so a feed with no search keeps every search door closed.

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const gated = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  features: { replay: false },
  ui: { drawingToolbar: false, topBar: { layouts: false } },
  access: { command: (id) => !id.startsWith('chart.drawings.'), drawingTool: (tool) => tool !== 'brush' },
  preferences: { scaleMode: 'log', style: 'bars' },
})
if (gated.capabilities().search) mountSymbolPicker()
```

The library reads `features` and `ui` once, when the widget is created. A key or a value either
plane does not take throws a `TypeError` naming its path before anything mounts. The package's
`dist/feature-manifest.json` lists every flag in its `features` and `ui` blocks.

### Refused controls

By default the chart's own controls draw what your access policy refuses disabled, which suits an
offer the viewer can unlock. `access.refused: 'hide'` leaves it out instead, for a chart that simply
does not offer it:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed
declare const session: { may(feature: string): boolean }

createChart({
  container,
  datafeed,
  access: {
    refused: 'hide',
    command: (id) => id !== 'chart.replay.start' || session.may('replay'),
    drawingTool: (tool) => tool !== 'brush' && tool !== 'highlighter',
    indicator: (id) => id !== 'vwap',
  },
})
```

With `'hide'`, a refused drawing tool is not in its group's flyout, on the favorites bar or in the
glyph picker; a section, a group or a favorites bar it leaves empty goes with it, and a group's face
that would wear a refused tool wears the first one the group still offers. A refused indicator is
not in the indicator picker. A control or menu row whose command the policy refuses is not drawn
(top bar, bottom bar, menus, the drawing toolbar and the selection's bar, the navigation cluster,
the replay transport, legend row controls and the context menu), and a rule left with nothing beside
it goes too. A picker always keeps its current choice: the chosen style, timeframe, timezone or
scale is listed even when its command is refused.

Only a refusal hides. A permitted command that cannot run now (nothing to undo, no bars loaded,
nothing selected) is drawn disabled as before. The policy is asked whenever the chrome syncs (a
change on the active chart, a change to the command registry) and whenever a menu or flyout opens,
and `widget.refreshAccess()` asks it again at any moment (see A policy that changes), so a policy
that follows your session moves the controls with it. Nothing stored is rewritten: a
viewer's favorite keeps its star and returns to the favorites bar once you permit the tool again,
and drawings and indicators already on the chart render exactly as they do under a refusal by
default. The keyboard, `widget.commands` and the chart handles refuse exactly as they do with
`'disable'`. A value other than `'disable'` or `'hide'` is a setup error that `createChart` throws.

Under either value the policy refuses creating content, never what is already on the chart or in
saved content: it refuses adding, never restoring. A saved chart, a layout load, an undo or a redo,
a drawings document and shared drawing storage put back every indicator and drawing they carry,
those the policy refuses included, so a load followed by a save never rewrites a viewer's content
without them. An indicator whose definition `access.indicator` refuses, once on the chart (added
before the policy changed, or put back by a restore), renders and stays fully editable and
removable:
`indicators.set`, `chart.indicators.update` and the settings dialog edit it, an edit of any other
indicator keeps it, and an edit that would move it, or another indicator, onto a refused definition
leaves that indicator as it stands. A new instance of a refused definition is still left out by
every door. A drawing whose tool `access.drawingTool` refuses selects, restyles, locks, hides and
deletes as any drawing does; a copy is a new drawing, so it is not cloned, pasted or duplicated by a
Control- or Command-drag, while copying it to the clipboard is not refused.

### A policy that changes

The predicates are asked live: every door that runs a command, arms a tool or adds an indicator asks
at that moment, so a refusal holds from the instant your policy answers it. The chart's own controls
read the policy when they sync and when a menu opens. When its answers change and nothing on the
chart does (a viewer's plan changed mid-session), call `widget.refreshAccess()`:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed
declare const session: { may(feature: string): boolean; onChange(listener: () => void): void }

const widget = createChart({
  container,
  datafeed,
  access: {
    refused: 'hide',
    command: (id) => id !== 'chart.replay.start' || session.may('replay'),
    indicator: (id) => id !== 'vwap' || session.may('vwap'),
  },
})
session.onChange(() => widget.refreshAccess())
```

Every surface that reads the policy reads it again at once: the top and bottom bars and their
controls, the drawing toolbar's tools and groups, the favorites bar, the selection's bar, the
navigation cluster, the replay transport and the legend's row controls, shown or left out as
`access.refused` says and enabled or disabled. A menu, flyout or dialog that is open reads it too:
the bars' menus, the context menu, the indicator picker and the saved layouts dialog rebuild their
rows in place, and a drawing toolbar flyout (the glyph picker among them) or a selection bar panel
opens again from its control, or closes when that control is now left out or disabled. Listeners of `widget.commands.onChange`
hear it as well, so a control of your own can read `commands.available` again. Nothing stored
changes, nothing on the chart changes, and no `saveNeeded` is raised: a refresh is a reading, never
a write.

### Your own interface

The widget supports three ways to present a chart, over the same behavior and the same commands.

- The default interface: pass no `ui`, and every control renders.
- The branded default: keep the controls, and draw their glyphs with `icons` and their colors with
  the theme.
- Your own controls: hide the chart's controls in `ui` and build yours over `widget.commands`, the
  chart handles and their events. Your control reaches what the built-in one reached and answers to
  the same access policy.

Every built-in control runs a command, so a control of yours needs nothing beyond the registry and
the handles. `commands.available` says whether a verb would run now, and the widget and chart
events tell you when to ask again.

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const custom = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  ui: { topBar: false, drawingToolbar: false },
})

const undo = document.createElement('button')
undo.textContent = 'Undo'
const paint = (): void => {
  undo.disabled = !custom.commands.available('chart.history.undo')
}
undo.addEventListener('click', () => custom.commands.execute('chart.history.undo'))
custom.activeChart().on('history', paint)
paint()

const search = document.createElement('button')
search.textContent = 'Search'
search.addEventListener('click', () => custom.commands.execute('chart.symbol.search'))
container.before(undo, search)
```

The chart's own dialogs still open from their commands while its bars are hidden.
`chart.symbol.search`, `chart.indicators.open`, `chart.compare.open` and `widget.layout.open` raise
them in the widget's layer on the document, and `widget.layout.save` asks a layout that was never
saved for its name. Hide a dialog in `ui` when your interface provides its own.

The library draws its own controls over its own renderer and keeps its internal components to
itself. The class names under the widget's root are private, apart from the styling hooks listed
under Theme.

### Fullscreen and image

Chart-root fullscreen fills the screen with the widget's own element, or with the
`fullscreen.target` you name; your application shell and any fit-to-container layout stay in your
CSS.

```ts
import { type ChartWidget } from '@trdrs/quickcharts'

async function shareable(widget: ChartWidget): Promise<void> {
  await widget.fullscreen.toggle()
  const off = widget.on('fullscreen', (active) => chrome.setCompact(active))
  if (!(await widget.image.copy())) await widget.image.download('desk.png')
  const blob: Blob = await widget.image.capture()
  void blob
  off()
}
```

`capture()` composes the chart, or every chart of a layout, into one PNG under a header carrying the
identity and the attribution you configured through `image`. Nothing is uploaded, shared or stored:
you receive a blob and decide.

### Indicator picker content

The Indicators button and `commands.execute('chart.indicators.open')` open the same picker.
Pass `{ collection: 'saved' }` as the command argument to open a declared host collection directly.
An unknown collection falls back to the shipped catalog. Reopening an already open picker keeps its current selection and query.
It lists the 23 shipped definitions, with search and Favorites. Add creates a new instance on the
currently active chart and keeps the picker open. Favorites use your `ChartStorage` port.

Supply `ChartWidgetOptions.indicatorPicker` to include additional localized collections and rows
in that picker. You supply data and opaque actions, not DOM, indicator definitions, or a renderer.
Built-in annotations can add favorite state, counts and actions; they cannot replace a definition,
its name, or Add. Without a source, the picker has only shipped built-ins and Favorites.

```ts
import type { IndicatorPickerSource } from '@trdrs/quickcharts'

const indicatorPicker: IndicatorPickerSource = {
  collections: [{ id: 'saved', label: 'Saved indicators' }],
  async list({ collection, query, builtInIds }, signal) {
    if (signal.aborted) return { kind: 'unavailable', message: 'Content unavailable.' }
    return {
      kind: 'ok',
      items: collection === 'saved' && 'Example'.toLowerCase().includes(query.toLowerCase())
        ? [{ id: 'example', title: 'Example', primaryAction: 'inspect', actions: [{ id: 'inspect', label: 'Inspect' }] }]
        : [],
      builtIns: builtInIds.map((id) => ({ id })),
    }
  },
  async act({ target, action }, signal) {
    if (signal.aborted) return { kind: 'refused', message: 'Action cancelled.' }
    if (target.kind !== 'item' || action !== 'inspect') return { kind: 'refused', message: 'Action unavailable.' }
    return { kind: 'ok' }
  },
}
```

The source receives the collection, query and the shipped definition ids the picker lists (only
those `builtInIndicators` offers, when you name a list). Its own collections and rows are never
filtered by that list. It owns filtering, paging and any
service limits; the picker lists what it answers.
Collection ids `builtin` and `favorites`, and action ids `add` and `favorite`, are reserved.
Item ids cannot collide with shipped definition ids or these reserved ids. Duplicate ids,
malformed rows and missing primary actions refuse the response; the shipped catalog remains usable.
An item has up to two actions; a built-in annotation has at most one beside Add. Collections can
name a localized navigation group and use `layout: 'list'` for name/secondary-action rows.
An absent count stays blank. Omit `favorite` to omit that action on a contributed item.

A favorite action receives the requested next boolean. Successful actions refresh the current
collection unless they return `close: true`. Refusals and exceptions keep the picker open with
plain text, never rendered markup. Icons reuse `ChartExtensionIcon`; invalid icons draw no glyph.
The host localizes contributed labels and messages; the chart localizes its own controls.

Changing query or collection aborts pending work. Closing or disposing the widget aborts it too.
Late responses are ignored even when the source ignores cancellation. Your action must check its
signal before late UI effects; cancellation cannot undo a service mutation already accepted.

### Default chrome

The widget mounts its complete chrome around the charts. Import `@trdrs/quickcharts/styles.css` once; the
chrome is painted from it and renders nothing without it.

- **The top bar.** The symbol pill opens the symbol search for the active chart; the compare door
  opens it in compare mode. The timeframe picker shows the saved timeframes as chips and a list of
  the timeframes the chart offers (by default the 26 presets in five groups), each row savable as a
  chip, with a composer for a custom timeframe under the unit's ceiling while custom timeframes are
  offered. The style picker lists the styles the chart offers. Indicators opens the picker
  over the 23 built-in definitions, and the legend's gear opens the settings dialog for an instance
  (inputs, style, visibility). Bar replay enters and leaves replay for the active chart; entering
  asks where to begin rather than choosing a starting bar. Its starting-point menu answers with a
  bar picked on the plot, a date, the first available date, or a random bar. The first available
  date runs `chart.replay.startFirst`: the chart pages the feed's history back to its oldest bar,
  within the 20,000 bars one session holds, and starts there. Undo and
  redo step back and forward through the active chart's own content, and each names the change it
  would move. Layout setup offers the arrangements and sync switches the chart offers (by default
  the 55 arrangements and the five sync switches); the saved-layouts menu, shown with a layouts
  store, saves, copies, renames, opens and deletes layouts through `saveLoad.layouts` and marks
  unsaved changes, with an autosave switch and Download chart data.
  Chart settings edits appearance, grid and session shading, the price-scale mode and the theme
  mode, and its Reset defaults row runs `chart.appearance.reset`, which drops the viewer's own
  appearance edits and returns the price scale to normal so the chart reads as the theme and your
  constructor options paint it. `ui: { topBar: { settings: { theme: false } } }` removes its Theme
  section and leaves the rest of the menu, for a host that offers the theme choice in its own
  settings; the widget's theme API and theme commands are untouched. Fullscreen and the image menu (Download image, Copy image where the browser can, and
  Download chart data when there is no layouts store) close the bar.
- **The bottom bar.** The range presets the chart offers, the clock in the display zone with the
  list of the timezones it offers (UTC and the exchange choice first), and the session view for a
  symbol that trades outside regular hours.
- **Around the charts.** A navigation cluster (zoom, scroll, reset) sits at the bottom of each
  pane, and past one tile it carries a sixth control that fills the layout with the active tile or
  gives the layout back, over `widget.layout.toggleMaximize`, the same verb the Alt press on a tile
  and the `Alt+Enter` chord run. It wears the mark and the name for what the next press does. The market-status popup opens behind the legend's dot. From the moment replay is
  entered, one reserved
  transport row spans the widget below the chart grid and above the bottom bar. The first chart to
  enter replay owns that row until it exits or is removed; activating or starting another chart
  does not retarget it. Concurrent charts keep their independent `ChartReplayApi` and active-chart
  top-bar command. An already-running non-owner is not promoted when the owner leaves, but its next
  replay entry can claim the row. Chart notices report a feed that cannot serve the symbol, an
  image that could not be copied, or a save the store refused.

Undo and redo step through the chart's own content: the symbol, the timeframe, the style, the price
scale and whether it frames itself, the appearance a viewer authored, the comparisons, the
indicators and the drawings. A step is one reading of that content, so a step back puts the whole
reading back rather than reversing a single verb, and the two controls name the change they would
move. Each chart keeps its own last 100 steps for as long as it is mounted. `chart.history.undo`
and `chart.history.redo` are the verbs, `chart.history` on the handle reads the two stacks, the
`history` event reports every move of either one. `features: { history: false }` removes the history
and both controls, and `ui: { topBar: { history: false } }` removes only the controls.

#### Your own controls in the top bar

A service the chart does not implement can still stand in its toolbar. `widget.chrome.topBar(slot)`
answers the element at one of nine named boundaries. Append your control to it, and remove your own
node when you are done with it. The slot belongs to the chart and is never removed.

| Slot | Where it stands |
| --- | --- |
| `start` | Before the symbol pill |
| `afterSymbol` | After the symbol pill and the compare door |
| `afterTimeframe` | After the timeframe picker |
| `afterStyle` | After the style picker |
| `afterIndicators` | Between Indicators and Bar replay |
| `afterReplay` | After Bar replay |
| `afterHistory` | After Undo and Redo |
| `afterLayouts` | After the layout menus |
| `end` | After Fullscreen and the image menu |

Each name says which group the slot follows, so a control placed there leads the group after it.
`TOP_BAR_SLOTS` lists them in reading order. Every slot exists whichever controls `ui` leaves
standing, and an empty slot has no width and no ink.

`widget.chrome.toolbarButton(options)` makes a control that reads as one of the bar's own. It keeps
the bar's height, spacing, hover, pressed and open states, and when the row runs short it gives up
its words before the bar's own last label does. You supply the accessible name, optional words, an
optional glyph drawn by an icon factory, and what a press does. `pressed` makes it a toggle, and
`popup` announces a menu or dialog of your own whose open state you report through `update`.

```ts
import { createChart, createUdfDatafeed, TOP_BAR_SLOTS, type ChartIconFactory } from '@trdrs/quickcharts'

const bell: ChartIconFactory = ({ document }) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 28 28')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M14 6a5 5 0 0 0-5 5v5l-2 3h14l-2-3v-5a5 5 0 0 0-5-5Zm-2 15a2 2 0 0 0 4 0')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  svg.append(path)
  return svg
}

const hosted = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
})

const alerts = hosted.chrome.toolbarButton({
  label: 'Price alerts',
  text: 'Alerts',
  icon: bell,
  popup: 'dialog',
  onClick: () => {
    note(`alerts for ${hosted.activeChart().symbol()}`)
    alerts.update({ expanded: true })
  },
})
hosted.chrome.topBar('afterIndicators')?.appendChild(alerts.element)
note(`${TOP_BAR_SLOTS.length} slots`)
```

The chart's class names stay private: style what you render inside your own popup. A glyph factory
that fails leaves the control without a glyph and records a `toolbarButton` diagnostic, as the
Icons section describes.

The chart still owns the bar's composition: which of its controls are present, the order they stand
in, and where the rules fall between them. You choose what stands at a boundary. `topBar` answers
null when `ui: { topBar: false }` removes the bar, which is what to check before composing a control
you would have nowhere to put.

Every control acts through the command registry and reflects `commands.available`, so a command
your access policy refuses renders disabled and does nothing, or is not drawn with
`access.refused: 'hide'`. The saved-layouts menu runs the
layout verbs `widget.layout.save`, `rename`, `load`, `open`, `delete`, `create` and `autosave`; what a
verb did reports through the `layout` event and what it refused through `saveConflict`. Copy image
reports through the `image` event (a refused copy falls back to a download). Each control has a flag
in `ui`; hiding one removes the control and leaves its commands.

```ts
import { createChart, createUdfDatafeed, type ChartDatafeed } from '@trdrs/quickcharts'

declare const portfolio: { name: string; search: ChartDatafeed['search'] } | null

const trimmed = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  ui: { navigation: false, topBar: { layouts: false, image: false } },
  search: {
    classNames: { future: 'Futures', crypto: 'Crypto' },
    scope: () => (portfolio ? { label: portfolio.name, search: portfolio.search } : null),
  },
  preferences: { savedTimeframes: ['1m', '15m', '1h', '1d'], layoutAutosave: true },
})
trimmed.on('saveNeeded', () => note('the layout has unsaved changes'))
```

The search dialog's class chips come from your datafeed's `config().classes`, named through
`search.classNames`; a class you do not name wears its token. `search.spreads`,
`search.allClasses` and `search.classSelection` choose how the classes and the spread operators are
offered, as "Classes and spread operators" under Search describes. `search.scope` offers a part of
the catalog the viewer can limit the search to, as a chip at the far edge of that strip, as "A
search scope" under Search describes. The range presets read your
datafeed's optional `earliestBar(symbol)`: a preset deeper than the history you serve is disabled.

```ts
import { type ChartDatafeed } from '@trdrs/quickcharts'

const withDepth: Pick<ChartDatafeed, 'earliestBar'> = {
  async earliestBar(symbol): Promise<number | null> {
    return myBackend.firstBarTime(symbol)
  },
}
void withDepth
```

Keyboard and screen readers: every menu is one tab stop (arrow keys, Home and End move among rows,
Escape closes and returns focus to the control that opened it); every dialog is modal, traps Tab and
restores focus; every control carries an accessible name and its state; the root carries the
language's reading direction, so the chrome mirrors for Arabic and Hebrew; motion flattens under
`prefers-reduced-motion`.

### Icons

`icons` draws the glyphs of the chart's own controls. Each key is a published icon id and each value
is a factory that returns a fresh `<svg>` element. An id you leave out keeps the chart's own glyph.
`CHART_ICON_IDS` lists every id, and the feature manifest's `icons` block lists them too. The
`ChartIconId` type is exactly that list, so an id the chart does not draw is a type error as well
as a `TypeError` when the widget is created.

An id names what a glyph means, not one control. `settings` is the top bar's settings button, a
indicator's gear in the legend and the drawing settings bar's gear, so one drawing stands in all
three. Drawing tools take `tool.<type>`, chart styles `style.<style>` and layout arrangements
`layout.<code>`, from the registries the rest of the API uses.

```ts
import { CHART_ICON_IDS, createChart, createUdfDatafeed, type ChartIconFactory, type ChartIcons } from '@trdrs/quickcharts'

const outline = (d: string): ChartIconFactory => ({ document }) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 28 28')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  svg.append(path)
  return svg
}

const icons: ChartIcons = {
  settings: outline('M14 9a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z'),
  'tool.trend_line': outline('M6 22 22 6'),
  'style.candles': outline('M9 7v14M19 7v14'),
}

const branded = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), icons })
note(`${CHART_ICON_IDS.length} icons, ${branded.chrome.iconDiagnostics().length} not drawn`)
```

A factory receives the document to create nodes in, the box it fills in CSS pixels, and the reading
direction. The chart sizes your element to the box and hides it from assistive technology. The
control keeps its accessible name, hit area, focus, and pressed and disabled states, so artwork
changes how a control looks and never what it does. Draw in `currentColor` to take the control's ink
in every theme and state.

The direction is the widget's when the glyph is drawn. When a language change turns it around, the
chart asks each factory again for every glyph it drew, a `toolbarButton` glyph included, and puts
the new drawing in place of the old one. A factory that refuses the new direction leaves the
previous drawing standing and records the failure.

`chartIconArtwork(id)` answers the chart's own drawings of an icon as markup, for a host that draws
the chart's icons outside it: a toolbar of its own, or a native view. Each drawing carries its grid,
its body with every ink on `currentColor`, and the whole drawing as one standalone `<svg>`. An icon
the chart draws at more than one size answers each, on its own grid, so you pick the one that suits
your box; the drawing toolbar's are on a 28 grid. It answers the chart's own artwork whatever `icons`
draws instead. An illustration drawn in the theme's roles answers none.

```ts
import { chartIconArtwork } from '@trdrs/quickcharts'

const [trendLine] = chartIconArtwork('tool.trend_line')
const toolButton = document.createElement('button')
toolButton.innerHTML = trendLine!.svg // the chart's own trend line, in the button's ink
```

The chart mirrors the glyphs in `MIRRORED_ICONS` for a right-to-left language whatever artwork they
wear, so draw their left-to-right form. The line-end icons are drawn for a line's left end, and the
right end's picker wears the same drawing mirrored.

The library reads `icons` once, when the widget is created. An id the chart does not draw, or a value
that is not a function, throws a `TypeError` before anything mounts. A factory that throws, answers
something other than an `<svg>` element, or answers an element already in the document or answered
before costs that one glyph its artwork. The control draws the chart's own glyph, and
`widget.chrome.iconDiagnostics()` records the icon's first failure.

`icons` covers the chart's own controls. The emoji, sticker and icon glyphs a drawing places come
through the asset port, and a chart extension draws its rows and layers from the
`ChartExtensionIcon` descriptors it contributes. The product's mark in the plot's corner is the
chart's own artwork, outside `icons`. `mountContextMenu`, `openSymbolSearch`, `mountSymbolSearch`,
`openTimeframePicker` and `mountTimeframePicker` take the same `icons` for a menu, search or picker
you mount without a widget.

### Neutral marks

Serve `marks` and `timescaleMarks` from your datafeed and the chart draws them. A mark is a note
about a moment: its color is a semantic theme role rather than a literal, its words are yours, and
the chart draws it as given.

```ts
import { type BarMark, type ChartDatafeed } from '@trdrs/quickcharts'

const withMarks: Pick<ChartDatafeed, 'marks'> = {
  async marks(symbol, from, to): Promise<readonly BarMark[]> {
    const rows = await myBackend.events(symbol, from, to)
    return rows.map((row: { id: string; at: number; headline: string }) => ({
      id: row.id,
      time: row.at,
      color: 'info',
      text: 'E',
      label: row.headline,
    }))
  },
}
void withMarks
```

`marks: false` draws none, even from a feed that serves them.

### The rest of the widget

- **Scale modes.** `chart.setScaleMode('log' | 'percent' | 'indexed' | 'normal')`, persisted
  through `ChartStorage`, and reachable as commands.
- **The price scale** (shown by default; `ui: { priceScale: false }` hides it). Without it the bars
  span the chart's whole width, and the last price draws no line across the plot and no label, since
  nothing on screen points at one.
- **Session bands** (on by default; `features.sessions: false` opts out). Every stretch outside
  regular hours shades under the bars, driven by the session model built from the symbol's own
  `session`, `sessionHolidays`, `corrections` and `subsessions` in `resolve()`'s answer (see
  Timezones and sessions). A continuous market never bands; intraday only; an UNRESOLVED symbol
  never bands, which is the honest default rather than a coerced one, and it is enforced: the
  primitive's `model` getter admits `null` and a null draws nothing. A host that changes the model
  outside a `resolve()`, or supplies its own, calls the primitive's `refresh()` when it does; the
  chart does not invalidate the pane on a getter's value changing.
- **A legend** (on by default; `ui: { legend: false }` removes it). The header shows the resolved
  display name, venue, timeframe, OHLC and change against the previous painted close. Prices use
  the symbol's formatter. Hover selects a bar; leaving restores the latest painted reading. Replay
  does not expose bars beyond its cursor. Missing metadata leaves the supplied symbol unchanged.
  Legend and search rows wear your `symbolMark`, or a decorative monogram without one.
  Indicator and separate-pane comparison rows follow their renderer panes. Stable row controls
  retain focus during value updates. Indicator values read the first plot, using declared precision
  or the symbol formatter; Volume reads bar volume using resolved volume precision. The row-list
  toggle, indicator eye and pane collapse are independent controls. Pane restore remembers indicator
  identity across pane removal. The status control opens session details, retains an unknown-session
  state and is hidden during replay. Price-scale chips use the same commands as `setScaleMode`.
- **An interface language** (`locale`, English by default), one of the 21 the package ships.
  `BUILT_IN_LOCALES` lists them for a picker: each carries its stable code, its canonical BCP 47
  `tag`, its reading direction (`ar` and `he_IL` are `rtl`), and its endonym. The chart's own chrome
  reads the language, and its axis and crosshair dates are formatted in it. English is in the
  bundle; every other dictionary is its own chunk, fetched the first time it is chosen and shared by
  every widget on the page. `widget.setLocale(code)` switches at runtime and resolves after the
  dictionary settles; `widget.locale()` reports the current one. Plural forms follow the language's
  CLDR rules through `Intl.PluralRules`, and a number in a message is written with the language's
  digits and grouping. The runtime is the package's own, framework-free and DOM-free, so a server
  render can import it.
  A host with a language the package does not ship registers it through `createChartI18n(code,
  { locales })`: a `ChartCustomLocale` names the code, tag, direction and endonym and supplies the
  dictionary chunk, a `ChartDictionary` typed against the English catalog so it cannot miss a key or
  flatten a plural. A code or tag the built-in inventory already holds is refused. A dictionary that
  arrives from data and misses a key reads English for that key and reports it to the `onMissing`
  option. A host can also supply `i18n: ChartI18n` of its own to own its codes, tags, dictionaries,
  loading, and fallback outright.
  Every piece of the chart's own chrome speaks the language; symbols, prices and anything the
  datafeed says are data and pass through untranslated. A host composing the chrome modules itself
  hands them a `ChartI18n` from `createChartI18n(code)` and reads the chart's words for drawing
  tools and arrangements through `toolName` and `arrangementName`.

```ts
import { createChart, createUdfDatafeed, SCALE_MODES } from '@trdrs/quickcharts'

const w = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), locale: 'de' })
w.activeChart().setScaleMode(SCALE_MODES.includes('log') ? 'log' : 'normal')
w.activeChart().indicators.set([{ id: 'sma-20', definition: smaDefinition }])
await w.setLocale('ja')
```

```ts
import { BUILT_IN_LOCALES, createChart, createChartI18n, createUdfDatafeed, type ChartCustomLocale } from '@trdrs/quickcharts'

// A language the package does not ship, with the dictionary served by the host.
const frCA: ChartCustomLocale = {
  code: 'fr-CA',
  endonym: 'Français (Canada)',
  tag: 'fr-CA',
  dir: 'ltr',
  dictionary: () => myBackend.chartDictionary('fr-CA'),
}
const i18n = createChartI18n('fr-CA', {
  locales: [frCA],
  onMissing: (key, locale) => note(`${locale} has no text for ${key}`),
})
const picker = [...BUILT_IN_LOCALES, frCA].map(({ code, endonym, dir }) => ({ code, endonym, dir }))
const w = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), i18n })
await w.setLocale(picker[0]!.code)
```

## Theme

Quick Charts ships complete light and dark modes. Import the stylesheet once, choose a mode, and
the chart canvas, toolbars, legend, scales, menus, dialogs and fields all render from it.

```js
import '@trdrs/quickcharts/styles.css'
```

**The stylesheet is required, and it is not only about color.** It carries the chart's LAYOUT: the
root fills your container, the charts tile inside it, and the plot area sizes itself from that.
Without it the root has no height, so the renderer measures zero and the chart paints nothing at
all. If you mount a widget and see an empty box, this import is the first thing to check.

The stylesheet is scoped to the chart's own root element. It applies no reset to your document, it
downloads no font, and it fetches nothing at runtime. Two charts on one page can run different
modes.

### Switch modes and customize the palette

`createThemeController` owns one chart's mode and its custom palettes. Every method resolves a
complete theme and publishes it to subscribers once, so a switch never leaves a surface behind.

```ts
import { createThemeController, type CustomThemes } from '@trdrs/quickcharts'

const brand: CustomThemes = {
  light: { 'state.accent': '#1f6feb', 'canvas.background': '#fbfbfd' },
  dark: { 'state.accent': '#58a6ff' },
}

const theme = createThemeController({ mode: 'light', custom: brand })
const stop = theme.onChange((palette, mode) => note(`${mode} accent is ${palette['state.accent']}`))

theme.setMode('dark')
theme.applyCustom({ dark: { 'state.accent': '#7ee787' } })
theme.resetCustom()
stop()
```

Switching modes keeps the symbol, timeframe, visible range, drawings and indicators the chart
already has. A palette you supply is a tint rather than a replacement: a role you do not name keeps
its built-in value for that mode.

### Roles

A role is a purpose, such as `text.muted` or `overlay.scrim`. `THEME_ROLES` is the published
inventory, and the built-in palettes and the generated stylesheet are built from it. The custom
property names are private, so a color, a size or a radius is always set through a role. The
class names inside the stylesheet are private too, except the supported hooks below.

### Fields

Every text field, select, number field and color well the chart draws in its dialogs and settings
is one box: 34px tall, a 1px edge with an 8px corner around a clear ground, and its words at 14 on
18, 8px in from the edge. A select ends in an 18px chevron. Four roles in the `control` family
paint the box, and the focus ring is `state.focusRing`:

| Role | Light | Dark | What it paints |
|---|---|---|---|
| `control.fieldEdge` | `#dbdbdb` | `#575757` | The edge of a field at rest. |
| `control.fieldEdgeHover` | `#a8a8a8` | `#707070` | The edge of a field under the pointer. |
| `control.fieldInvalid` | `#f23645` | `#f23645` | The edge and the focus ring of a field holding a value it refuses. |
| `control.fieldFill` | `#f2f2f2` | `#2e2e2e` | The ground of a field that is read-only or disabled. |

Focus draws a 2px ring over the edge, the edge itself and the pixel inside it, so the ring follows
the corner and a dialog that scrolls never clips it. A number past its bounds or off its step turns
the edge `control.fieldInvalid` once the viewer leaves the field, so a number on its way to a valid
one never turns red while it is typed. The symbol search field draws its own outline in
`chrome.fieldBorder`.

### Motion

Every duration, timing function and motion scale the chart uses is a role in the `motion` family,
so you retune the chart's motion the way you retune its colors. Both built-in palettes carry the
same values:

| Role | Default | What it times |
|---|---|---|
| `motion.durationFast` | `90ms` | A state change under the pointer, such as a hover fill. |
| `motion.durationBase` | `150ms` | A modal dialog and its backdrop opening and closing, and the replay row entering and leaving. |
| `motion.durationModerate` | `250ms` | A control moving to its new state, such as a switch knob sliding. |
| `motion.durationSlow` | `350ms` | A small mark settling, such as a disclosure caret turning or a checkbox filling. |
| `motion.durationSlower` | `500ms` | A larger mark turning, such as the drawing toolbar's chevron. |
| `motion.easingStandard` | `ease` | A modal dialog box, the replay row, a caret dip, a checkbox fill. |
| `motion.easingOut` | `ease-out` | A modal backdrop fading, a switch knob sliding. |
| `motion.easingLinear` | `linear` | A color or opacity change under the pointer. |
| `motion.easingSpring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | A caret or chevron turning with a slight overshoot. |
| `motion.scaleEnter` | `0.97` | The scale a modal dialog box grows from as it opens. |

Every modal dialog the chart opens (the symbol search, chart settings, the indicator browser and
indicator settings, the saved-layouts browser, the name and confirm prompts, go to date, and the
drawing settings, image picker and template prompts) opens with its backdrop fading in over
`motion.durationBase` on `motion.easingOut`, and its box fading in and growing from
`motion.scaleEnter` to full size over `motion.durationBase` on `motion.easingStandard`. It closes
with the same motion reversed. A closing dialog stops taking input and returns focus at once, and the
chart removes it when the same `motion.durationBase` has elapsed, so a duration you set times both
the transition and the removal. A dialog opened over another moves on its own and closes first, and
a dialog the chart replaces or tears down goes at once.

A duration takes a CSS duration such as `200ms` or `0.2s`; an easing takes any CSS timing function,
such as `ease-in-out`, `steps(4)` or `cubic-bezier(0.2, 0, 0, 1)`; a scale takes a unitless factor
such as `0.95`.

```ts
import { createThemeController, type CustomThemes } from '@trdrs/quickcharts'

const calm: CustomThemes = {
  light: { 'motion.durationBase': '200ms', 'motion.scaleEnter': '0.95' },
  dark: { 'motion.durationBase': '200ms', 'motion.scaleEnter': '0.95' },
}
const theme = createThemeController({ mode: 'dark', custom: calm })
note(theme.get()['motion.durationBase'])
```

When the reader's system asks for reduced motion (`prefers-reduced-motion: reduce`), the
stylesheet resolves every duration role to `0ms` and marks those declarations `!important`, so a
palette you supply cannot bring motion back: dialogs, menus and the replay row open and close at
once.

### Cascade layers

The stylesheet declares two cascade layers and puts everything it contains in them: the built-in
palettes in `quickcharts.tokens`, every recipe in `quickcharts.chart`. Nothing in it is unlayered.
It marks a declaration `!important` only where a later layer or an inline palette must not undo it:
an element's `hidden` attribute, the zero motion durations under a reduced-motion preference, and
the focus outline a field leaves off, because a field shows its focus on its own box: the ring over
its edge, or the caret in a search field. Your first stylesheet
must declare the complete order before any product stylesheet loads, because a layer's position is
fixed by the first statement that names it:

```css
@layer reset, quickcharts.tokens, quickcharts.chart, host;
```

Put your reset in `reset`. A reset left unlayered outranks every layered rule and strips the
chart's controls of their borders and grounds. Put an intentional override of a supported hook in
`host`, or leave it unlayered; either wins over the chart's recipe. Layers of your own product go
between `quickcharts.chart` and `host`. Inline styles the chart writes for measured geometry
outrank any stylesheet rule, and a rule marked `!important` reverses layer order, so neither is a
way to restyle the chart.

### Supported styling hooks

A hook is a block-level surface you may write a rule against. Each announces its state through an
attribute, never a modifier class, and each names the presentation a rule may change. A rule that
changes anything else, or that targets a class not listed here, is unsupported and may stop
applying in any release. Removing a hook, a state or a customization is a breaking change.

| Hook | Purpose | States | Customization |
|---|---|---|---|
| `.qc-topbar` | The top toolbar: symbol search, timeframe, chart style, indicators, layouts, replay and the widget menus. | | background-color, border, padding, gap, box-shadow |
| `.qc-drawing-toolbar` | The drawing toolbar beside the plot. | `aria-orientation`: vertical beside the plot, horizontal in a host row. | background-color, border, padding, gap, box-shadow |
| `.qc-bottombar` | The bottom bar: range shortcuts, the session clock and the timezone. | | background-color, border, padding, gap, box-shadow |
| `.qc-legend` | The legend over the plot: the symbol, its reading and each indicator row. | | background-color, border, border-radius, padding, box-shadow, inset |
| `.qc-menu-panel` | A floating menu opened from a toolbar control. | `hidden`: present while the menu is closed. | background-color, border, border-radius, padding, box-shadow |
| `.qc-dialog` | A modal dialog: settings, search, layouts and the drawing editors. | `data-role`: which dialog this is, in the chart's own vocabulary. | background-color, border, border-radius, padding, box-shadow, max-width |

Scope a rule to your own chart container so it cannot reach a chart elsewhere on the page. The
hooks, their states and their customization are published in `dist/theme-manifest.json` under
`hooks`, beside the layer names under `layers`.

```css
@layer host {
  #my-chart .qc-topbar {
    background-color: #101828;
    border-bottom: 1px solid #1d2939;
  }
}
```

```ts
import { THEME_ROLES, type ThemeRoleFamily } from '@trdrs/quickcharts'

const family: ThemeRoleFamily = 'text'
const inkRoles = THEME_ROLES.filter((role) => role.family === family).map((role) => role.id)
note(inkRoles.join(', '))
```

If a value you supply is not valid for the role it is written for, the chart keeps the built-in
value and reports it. Read `theme.diagnostics()` for the role, the code and a sentence naming the
problem. Configuration errors never reach a render.

### Theme and appearance are two ladders

The theme palette is the broad brand surface. Chart appearance is the specific one: series colors,
candle anatomy, grid visibility and indicator visuals in `ChartOverrides.appearance`. Where both
could affect the same pixel, appearance wins.

Theme palette precedence, lowest first:

1. the built-in palette for the selected mode;
2. your custom palette for that mode.

Chart appearance precedence, lowest first:

1. the built-in appearance for the selected mode;
2. the constructor's `appearance` partial;
3. restored viewer appearance;
4. runtime `chart.applyAppearance` patches.

Resetting custom palettes returns the chart to the built-in mode and leaves saved chart appearance
alone.

A saved chart carries the appearance leaves a viewer chose and no others, so a chart nobody restyled
follows whatever theme the host gives it on the next load, and one whose owner picked candle colors
opens in those colors on any theme.

## Compare

Compare draws OTHER symbols beside a chart's own. Each comparison is managed like an indicator:
from the legend, at one of three placements, persisted in the chart content blob. `same-percent`
shares the main price scale and flips it to percent while any such comparison lives (the prior
scale mode comes back when the last one leaves); `new-scale` binds the LEFT scale with absolute
prices (the left axis exists only while such a comparison does); `new-pane` takes a pane of its
own. Compared bars clip to the main series window, so a comparison never extends the time axis.
`features.compareSymbols` supplies a curated quick-add list for the compare dialog;
`compare.symbols()` reads it back.

The widget's standard Compare door lives in the top bar, and `ui: { topBar: { compare: false } }`
hides it. The legend header does not duplicate that door. Commands and comparison-row actions remain
available when the top-bar door is hidden, and `features: { compare: false }` removes compare
altogether. The built-in dialog's search rows add at any of the three placements, curated
`compareSymbols` rows sit above results, and the ADDED section removes. Each comparison takes a
legend row whose title reopens the dialog in change-symbol mode (the pick re-keys the comparison in
place), with an eye and a remove beside the value (% under `same-percent`, the last close
otherwise). In a layout, each chart holds its own comparisons (`widget.activeChart().compare`), and
they ride the layout blob with the rest of that chart's content.

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const wc = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  features: { compareSymbols: [{ symbol: 'ES', title: 'S&P 500 futures' }] },
})
const compare = wc.activeChart().compare
compare.add('NQ', { placement: 'same-percent' }) // shares the scale; the axis flips to %
compare.add('CL', { placement: 'new-pane' })
compare.setVisible('CL', false)
const active = compare.list() // [{ symbol, placement, color, visible }]
note(`NQ last: ${compare.latest('NQ') ?? '-'}`)
compare.remove('NQ') // the scale mode the viewer held comes back
```

## Timeframes

A timeframe token names how much one bar spans: a count and a unit, `1m`, `4h`, `1d`, `3mo`, `500t`.
The units are ticks (`t`), seconds (`s`), minutes (`m`), hours (`h`), days (`d`), weeks (`w`) and
months (`mo`), and each unit has a ceiling (`TIMEFRAME_MAX`). A token outside the grammar parses as
null, and the chart never asks a feed for it.

```ts
import { formatTimeframe, isIntradayTimeframe, parseTimeframe, timeframeSeconds } from '@trdrs/quickcharts'

parseTimeframe('4h') // { count: 4, unit: 'h' }
parseTimeframe('3mo') // { count: 3, unit: 'mo' }
parseTimeframe('1441m') // null: past the minute ceiling
formatTimeframe({ count: 15, unit: 'm' }) // '15m'
timeframeSeconds({ count: 4, unit: 'h' }) // 14400
isIntradayTimeframe('1d') // false
```

`TIMEFRAME_PRESETS` lists the 26 preset tokens in five picker groups, weeks and months in the
Days group. `timeframeLabel` writes a token in the chart's language, and `timeframeOrder` sorts
tokens smallest first. A picker offers only what the symbol and the feed serve: pass the symbol's
`supportedResolutions` and the feed's `resolutions` to `allowedTimeframes`. An empty list is no
restriction.

```ts
import { allowedTimeframes, createChartI18n, timeframeLabel, TIMEFRAME_PRESETS } from '@trdrs/quickcharts'

const { t } = createChartI18n()
const tokens = TIMEFRAME_PRESETS.flatMap((group) => group.tokens) // 26 tokens
timeframeLabel(t, '5t') // '5 Ticks'
allowedTimeframes(tokens, { supportedResolutions: ['1m', '1h', '1d'] }) // ['1m', '1h', '1d']
allowedTimeframes(tokens, { supportedResolutions: [] }).length // 26
```

## Timezones and sessions

Bar times are UTC epoch seconds. A display timezone changes how the time axis, the crosshair and
a clock write them, never the bars. `TIMEZONES` lists the 60 selectable zones as IANA ids with a
display city, and `EXCHANGE_TIMEZONE` is the choice that follows the charted symbol's own
`timezone`. Every formatter takes the host's BCP 47 tag, so a month or a weekday reads in the
chart's language.

```ts
import { EXCHANGE_TIMEZONE, formatClock, makeCrosshairTimeFormatter, makeTickMarkFormatter, resolveDisplayTimezone, TIMEZONES, tzOffsetLabel } from '@trdrs/quickcharts'

TIMEZONES.length // 60
tzOffsetLabel('Asia/Kolkata') // 'UTC+5:30'
const zone = resolveDisplayTimezone(EXCHANGE_TIMEZONE, { timezone: 'America/Chicago' }) // 'America/Chicago'
if (zone) {
  note(formatClock('en', zone))
  chart.applyOptions({
    localization: { timeFormatter: makeCrosshairTimeFormatter('en', zone, true) },
    timeScale: { tickMarkFormatter: makeTickMarkFormatter('en', zone) },
  })
}
```

`timezoneListing` returns the picker rows: UTC, then the exchange choice, then every zone by its
current offset, so daylight-saving changes reorder the list on their own.

A symbol's session facts build a session model: `session` in the session grammar (`0930-1600`,
`1700-1600:23456` with `1` as Sunday, `24x7`, several stretches per day, previous-day markers),
`sessionHolidays` as `YYYYMMDD` full closures, and `corrections` as `SESSION:YYYYMMDD` overrides
that outrank a holiday. `subsessions` (`regular`, `extended`, `premarket`, `postmarket`, each
with its own session string and `sessionCorrections`) split extended hours into pre-market,
regular and after-hours; a symbol without them has one continuous session. The model answers the
session state at an instant, the next change and the exchange-local day's timeline, and the
market status combines the state with the feed's `dataStatus`: an end-of-day feed is its own
state, never an open market.

```ts
import { createChartI18n, marketStatus, marketStatusText, marketStatusTitle, parseSessionModel, sessionStateAt } from '@trdrs/quickcharts'

const { t } = createChartI18n()
const model = parseSessionModel({ timezone: 'America/Chicago', session: '1700-1600:23456', sessionHolidays: '20260101' })
if (model) {
  const now = Date.UTC(2026, 6, 13, 15) / 1000 // a Monday, 10:00 in Chicago
  sessionStateAt(model, now) // 'open'
  const status = marketStatus(model, 'streaming', now)
  marketStatusTitle(t, status) // 'Market open'
  marketStatusText(t, status, now) // 'Market is open for regular trading. Closes in 6 hours.'
}
parseSessionModel({ timezone: 'Etc/UTC', session: 'later' }) // null: the chart claims no session it cannot read
```

Which named session a chart displays is its subsession, a per-chart preference
with `regular` as the default. On a symbol with extended hours, `regular` filters intraday bars to
regular hours and `extended` shows every bar; a symbol with one continuous session has nothing to
filter.

```ts
import { DEFAULT_SUBSESSION, hasExtendedHours, parseSessionModel, subsessionBarFilter } from '@trdrs/quickcharts'

const equity = parseSessionModel({
  timezone: 'America/New_York',
  session: '0930-1600',
  subsessions: [
    { id: 'regular', session: '0930-1600' },
    { id: 'extended', session: '0400-2000' },
    { id: 'premarket', session: '0400-0930' },
    { id: 'postmarket', session: '1600-2000' },
  ],
})
if (equity) {
  hasExtendedHours(equity) // true
  const keep = subsessionBarFilter(equity, DEFAULT_SUBSESSION) // a function: regular hours only
  keep?.(Date.UTC(2026, 6, 13, 14) / 1000) // true, 10:00 in New York
  subsessionBarFilter(equity, 'extended') // null: nothing to filter
}
```

## Ranges

`RANGE_PRESETS` lists the nine range presets, each a visible span and the timeframe it reads best
at: `1D` over one-minute bars through `All` over monthly bars. `rangeAvailable` withholds a preset
deeper than the history a symbol has, and `frameRange` sets a pane's visible window for a span,
anchored on the last real bar so a future whitespace horizon never frames as empty space. The
navigation cluster's steps are constants: `ZOOM_FACTOR`, `MIN_BAR_SPACING` and
`SCROLL_STEP_BARS`, applied by `zoomedBarSpacing` and `scrolledPosition`.

```ts
import { frameRange, RANGE_PRESETS, rangeAvailable, scrolledPosition, zoomedBarSpacing } from '@trdrs/quickcharts'

const oneYearAgo = Date.now() / 1000 - 365 * 86_400
RANGE_PRESETS.filter((preset) => rangeAvailable(preset, oneYearAgo)).map((preset) => preset.key) // every preset but '5Y'
frameRange(chart, series, RANGE_PRESETS[0]!.span, '1m')
zoomedBarSpacing(8, 'in') // 10
scrolledPosition(0, 'right') // 10
```

## Search

`createSearchController` drives a symbol search over your datafeed's `search`: a debounce after
the last keystroke, a bounded cache per query and class for the controller's lifetime, a cached answer
shown at once and revalidated in the background, paging through `loadMore` with no repeated row,
and a newer query cancelling an older one's result. The chart's compare dialog runs on it, and a
host's own search surface subscribes to the same state.

The widget prefetches the default catalog and reuses completed pages across search, compare and
change-symbol dialogs. Each opening owns its query, class filter and pending work. Closing it
discards late results without clearing completed pages. Locale changes and widget disposal clear
the widget cache. A replacement widget starts with a cache of its own.

Completed reuse holds at most 32 queries and 5,000 rows, evicting least-recent entries. Retained
multi-page results reopen without a first-page refetch. Eviction does not truncate an active
list or change its next paging offset; an oversized list is not retained after close.
Cancellation ignores obsolete responses; it does not abort your datafeed's transport.

```ts
import { createSearchController, createUdfDatafeed } from '@trdrs/quickcharts'

const datafeed = createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' })
const search = createSearchController(datafeed, { pageSize: 50, debounceMs: 200 })
const stop = search.subscribe((state) => note(`${state.hits.length} rows${state.hasMore ? ', more' : ''}`))
search.prefetch('') // warm the default list
search.search('es', 'future') // one page after the debounce
search.loadMore() // the next page, once
stop()
search.dispose()
```

Recent picks go through a `RecentsPort`. `memoryRecents` keeps them for the page; back the port
with your own storage to keep them longer. `matchSegments` splits a symbol around the query for a
highlight, and `looksLikeSpread`, `isSymbolPair`, `spreadExpression` and `spreadSearchQuery` apply
the spread-expression rules: an operator over a symbol leg offers the expression as a row, a plain
`BTC/USD` pair is catalog identity, and your feed evaluates the expression.

```ts
import { looksLikeSpread, isSymbolPair, matchSegments, memoryRecents, spreadExpression } from '@trdrs/quickcharts'

const recents = memoryRecents()
recents.promote({ symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' })
recents.list().length // 1
matchSegments('BTCUSDT', 'usd') // [{ text: 'BTC', hit: false }, { text: 'USD', hit: true }, { text: 'T', hit: false }]
looksLikeSpread('ES-NQ') // true
isSymbolPair('BTC/USD') // true
spreadExpression(' es - nq ') // 'ES-NQ'
```

### Classes and spread operators

The dialog offers your datafeed's `config().classes` as a strip of chips, an All chip first, one
class selected at a time and sent to your feed as `cls`. Its field offers six spread operators
behind a toggle, and a query that reads as an expression leads the list with the expression row.
Three `search` options change that, and a chart that sets none of them searches exactly as above.

- `spreads`: `false` offers no operator toggle, no operator and no expression row, and your feed
  receives the query exactly as typed. `{ operators }` keeps spreads on and offers only the listed
  operators (`SpreadOperatorId`: `division`, `subtraction`, `addition`, `multiplication`,
  `exponentiation`, `reciprocal`), in the listed order. Default `true`. The compare dialog never
  offers the operators.
- `allClasses`: `false` offers no All chip. With one class at a time, the first class you declare
  starts selected; with several, no selection means every class. `{ label }` writes the All chip
  with your label. Default: the chip, with the catalog's label.
- `classSelection`: `'multiple'` makes every chip a toggle, and the All chip clears the selection.
  Your feed receives `classes` with every selected class in declared order, and `cls` too while
  exactly one is selected, so a feed that reads only `cls` still narrows a single chip. Default
  `'single'`.

A `classes` entry is a class token, or a `SearchClassNode`, `{ id, children }`, whose children are
narrower classes. Selecting such a class opens a second row of chips beneath the strip: its own
all chip, written like the All chip, and one chip per child, named through `search.classNames`.
Your feed always receives the most specific class selected: the child when one is picked, the
class when none is. The dialog renders two levels; a child's own `children` are not offered, and
the child narrows by its `id`. The second row is a labelled group of pressed buttons, reached by
Tab after the strip, as the strip is.

```ts
import { createChart, type ChartDatafeed, type DatafeedConfig } from '@trdrs/quickcharts'

declare const cryptoBase: ChartDatafeed

// Spot markets by quote currency, beside perpetuals.
const cryptoFeed: ChartDatafeed = {
  ...cryptoBase,
  async config(): Promise<DatafeedConfig> {
    return { classes: [{ id: 'spot', children: ['usdc', 'usdt'] }, 'perp'] }
  },
  // `cls` is 'spot' while the whole class is selected, and 'usdc' once USDC is picked under it.
  search: (query, options) => cryptoBase.search(query, options),
}

const crypto = createChart({
  container,
  datafeed: cryptoFeed,
  search: {
    classNames: { spot: 'Spot', usdc: 'USDC', usdt: 'USDT', perp: 'Perpetuals' },
    allClasses: { label: 'Every market' },
    spreads: { operators: ['division', 'subtraction'] },
  },
})
void crypto
```

With several classes at once, read `classes` and fall back to `cls`:

```ts
import { createChart, type ChartDatafeed } from '@trdrs/quickcharts'

declare const catalogFeed: ChartDatafeed

const multiFeed: ChartDatafeed = {
  ...catalogFeed,
  async search(query, options = {}) {
    // ['future', 'option'] with two chips selected; absent with none, which is every class.
    const classes = options.classes ?? (options.cls ? [options.cls] : [])
    return myBackend.search(query, classes, options.limit, options.offset)
  },
}

const multi = createChart({
  container,
  datafeed: multiFeed,
  search: { classSelection: 'multiple', allClasses: false, spreads: false },
})
void multi
```

`openSymbolSearch` and `mountSymbolSearch` take the same three options beside their `classes`.

### A search scope

`search.scope` offers a part of the catalog the viewer can limit the search to: a portfolio, a
watchlist, or any other set of symbols you can search within. The symbol search shows it as a chip
at the far edge of the class strip, wearing the scope's mark and label, and the chip is on each time
the dialog opens unless the scope says `on: false`. `scope` is read each time the dialog opens, so
it follows what your page has selected; null offers no chip.

While the chip is on, the dialog searches with the scope's `search`, which the chart's search
controller asks exactly as it asks your datafeed's: the query after the debounce, the selected
classes as `cls` or `classes`, a page at a time through `limit` and `offset`, and a newer question
retiring an older one's answer. Answer with a page, as your datafeed does. A dialog that opens with
the chip on asks the scope at once, and the scope's completed pages are reused while the dialog is
open and go when it closes: the widget's catalog cache holds your datafeed's pages alone. The list
leads with the scope's `recents`, or with none when the scope keeps none. While the chip is off,
the dialog searches your datafeed and leads with the chart's recents.

Pressing the chip asks the other source the query and classes the dialog holds, and an answer that
arrives for the state the viewer left is dropped. A pick is recorded in `search.recents` either way,
and in the scope's `recents` too while the chip is on. The compare dialog, adding a comparison or
changing one, offers no scope and searches your datafeed.

| Field | What it is |
|---|---|
| `label` | The scope's name, written on the chip. |
| `mark` | Paints the scope's mark into the chart's 18px box at the chip's leading edge, and returns what takes it down. Absent, the chip wears the label's initial. |
| `search` | Searches within the scope, called as your datafeed's `search` is. Required. |
| `recents` | The recent picks the list leads with while the chip is on, and where a pick made then is recorded too. Absent, the list leads with none. |
| `on` | Whether the chip is on when the dialog opens. Default `true`. |

The chip is a toggle button in the strip's tab order, after the class chips. `aria-pressed` says
whether the search is limited, and its accessible name says what a press does: "Limit search to"
and the scope's label, in the viewer's language.

```ts
import { createChart, createUdfDatafeed, memoryRecents, type SearchScope } from '@trdrs/quickcharts'

declare const watchlist: { id: string; name: string; logo: string } | null

const watchlistRecents = memoryRecents()

const scoped = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  search: {
    scope: (): SearchScope | null => {
      if (!watchlist) return null
      const { id, name, logo } = watchlist
      return {
        label: name,
        mark: ({ host, size }) => {
          const image = document.createElement('img')
          image.src = logo
          image.alt = ''
          image.width = size
          image.height = size
          host.append(image)
          return () => image.remove()
        },
        // Asked as your datafeed is: the query, `cls` or `classes`, `limit` and `offset`.
        search: (query, options) => myBackend.searchWatchlist(id, query, options),
        recents: watchlistRecents,
      }
    },
  },
})
void scoped
```

### The picker, away from a chart

A page that picks a market where no chart is mounted opens the same dialog the chart's symbol pill
opens, over the same controller, grammar, recents rule and symbol names. `openSymbolSearch` stands
it over the page; `mountSymbolSearch` builds it bare into a box you own and position. Both take what
you already give a chart: the feed, the mode, the language, the classes and their names, the marks,
and where recents are kept. Picking hands the symbol back and closes, because there is no chart here
to set.

`createSymbolSearchCache` keeps one feed's catalog warm between opens, so the next picker a page
opens stands on pages the viewer already saw rather than on a loading line.

```ts
import { createSymbolSearchCache, createUdfDatafeed, mountSymbolSearch, openSymbolSearch } from '@trdrs/quickcharts'

declare const pickerBox: HTMLElement
declare const form: { setInstrument(symbol: string): void }

const searchFeed = createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' })
const catalog = createSymbolSearchCache({ datafeed: searchFeed, pageSize: 50 })
catalog.prefetch() // warm the list a picker opens on

const picker = openSymbolSearch({
  datafeed: searchFeed,
  cache: catalog,
  theme: { mode: 'light' },
  classes: ['future', 'crypto'],
  classNames: { future: 'Futures', crypto: 'Crypto' },
  query: 'ES', // opens holding it, selected
  onPick: (symbol) => form.setInstrument(symbol),
})
picker.close() // or the viewer closes it: the X, the scrim, Escape

const card = mountSymbolSearch({ container: pickerBox, datafeed: searchFeed, cache: catalog, onPick: (symbol) => form.setInstrument(symbol) })
card.focus()
card.dispose()
catalog.dispose()
```

### The timeframe picker, away from a chart

A page that asks for a timeframe where no chart is mounted (a backtest's timeframe, an alert's
timeframe) opens the list the chart's timeframe caret drops: the same unit groups, rows, labels and
custom composer, built by the same code, so a timeframe reads there exactly as it reads on a chart.
`openTimeframePicker` drops it from a control you own, which gets `aria-expanded` while it is open
and focus back when it closes; `mountTimeframePicker` builds it bare into a box you own and
position, as a card on a phone. Picking a row, or composing a custom timeframe, hands the token to
`onPick`, because there is no chart here to set. The drop-down then closes; the card calls
`onClose`, your cue to close its box.

It takes what you already give a chart. `timeframe` is the value it opens on, checked and focused,
and a custom value sits in its unit's group. `timeframes` and `customTimeframes` offer exactly what
they offer a chart (see Offered timeframes), with the same setup errors, thrown before anything
mounts, plus one for a `timeframe` the grammar cannot read. `resolutions` and
`supportedResolutions` say what your feed and the symbol serve: as in the chart's list, a row they
do not serve is left out, and the composer does not offer one. `theme`, `locale` (or a prepared
`i18n`) and `icons` paint it as they paint a chart, on a theme root of its own, so the stylesheet
reaches it outside any chart in either mode.

It carries no saved chips and no stars, and keeps nothing: the chips are a chart's quick-select row,
stored with the chart's preferences, and a field that asks for one timeframe has no row to put them
in. A composed timeframe is handed back and not added to any list. The drop-down takes the keyboard
as the chart's does (arrow keys, Home and End rove the rows; Escape and a press outside close
it) and moves as every menu does.

```ts
import { mountTimeframePicker, openTimeframePicker } from '@trdrs/quickcharts'

declare const timeframeField: HTMLButtonElement
declare const timeframeBox: HTMLElement
declare const backtest: { timeframe: string; setTimeframe(timeframe: string): void }

timeframeField.addEventListener('click', () => {
  const picker = openTimeframePicker({
    anchor: timeframeField,
    timeframe: backtest.timeframe,
    resolutions: ['1m', '5m', '15m', '1h', '4h', '1d'], // what the feed serves
    theme: { mode: 'light' },
    onPick: (timeframe) => backtest.setTimeframe(timeframe),
  })
  void picker // picker.close() closes it from outside; Escape and a press outside close it too
})

const card = mountTimeframePicker({
  container: timeframeBox,
  timeframes: ['5m', '15m', '1h', '4h', '1d'],
  timeframe: '1h',
  onPick: (timeframe) => backtest.setTimeframe(timeframe),
  onClose: () => timeframeBox.remove(),
})
card.focus()
```

### The legend

Every chart carries its own legend over its plot: an identity row naming the market, the timeframe
and the venue, and a values row carrying the hovered bar's O H L C and its move against the previous
close. The numbers are written through that chart's own formatter, so a level in the legend is the
level its price axis writes, and they follow the pointer while the crosshair is on the plot and the
latest bar when it is not. In a split layout each chart carries its own, for the market it shows.

`symbolMark` paints a market's mark, and the chart calls it **wherever it names one**: each chart's
legend identity, the compare rows beneath it, and every row of the symbol-search and compare
dialogs. It receives the symbol, the element to paint into and the size of the box, and returns a
disposer that takes the mark down again. One hook rather than one per surface, so a market wears the
same face across the product and you implement it once.

The `size` is the chart's, not a suggestion: the box is already laid out, and painting at the size
you were given is what lines the marks up down a list. The chart ships no artwork and fetches none,
so without this every mark is the neutral monogram it draws itself.

`venueMark` and `dataSourceMark` paint the source at the end of every symbol search and compare
row the same way: the venue a market lists on, or the data source where a row names no venue. Each
receives the name the row writes (`exchange` or `dataSource`), the element and the size, and
returns a disposer. Without them a source wears its initial on a neutral disc.

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const widget = createChart({
  container: document.getElementById('chart')!,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  symbolMark: ({ symbol, host, size }) => {
    const img = document.createElement('img')
    img.src = `/logos/${symbol.toLowerCase()}.svg`
    img.width = size
    img.height = size
    host.replaceChildren(img)
    return () => host.replaceChildren()
  },
  // A touch surface has no pointer to hover with, so the reading is the last bar either way.
  features: { crosshair: false },
  ui: { legend: { values: false } },
})
```

The market's name opens the chart's own search dialog where the feed serves one and
`ui.symbolSearch` is on, and is a plain mark where it is not, since a control that opens nothing is
a lie. `ui: { legend: { values: false } }` takes the reading off the legend and
`features: { crosshair: false }` draws no crosshair, for a surface read by looking rather than by
pointing; the crosshair SYNC lane is untouched either way. The reading also gives way on its own as a pane narrows: it wraps whole under
the identity first, then holds the close and the change alone rather than covering the candles it
describes.

`ui.crosshair` chooses what the crosshair draws while it follows the pointer. `false` draws neither
its lines nor its labels. A `CrosshairUi` object hides some of its parts: `horizontal: false` leaves
one vertical line through the bar under the pointer, the way a finger reads a small chart, and
`labels: false` writes neither the time nor the price on the scales. `solid: true` draws the lines
solid; they are dashed unless you name it. `sync.onCrosshair` reports the crosshair whatever it
draws.

```ts
import { createChart, type ChartDatafeed, type CrosshairUi } from '@trdrs/quickcharts'

declare const datafeed: ChartDatafeed

// One solid vertical line through the bar under the pointer, with nothing written on the scales.
const crosshair: CrosshairUi = { horizontal: false, labels: false, solid: true }
createChart({ container, datafeed, ui: { crosshair } })
```

## Multi-chart layouts

A widget always has a layout, reached as `widget.layout`, and it tiles N charts over the widget root
by an arrangement code. The catalog (`ARRANGEMENTS`, grouped for a picker as `LAYOUT_MENU_ROWS`)
carries 55 arrangements from a single full-bleed chart to an 8x2 grid; `setArrangement` re-tiles
live, surviving charts keep their state and new charts clone the active chart's symbol and
timeframe.

One chart is ACTIVE: it follows pointerdown, `widget.activeChart()` is it, and the `activeChart`
event reports it every time it moves: another chart activated, the active chart's symbol changed, a
re-tile, a restore. Pointing your own surface at a chart moves no chart's symbol, so the two
concepts stay separate: each chart keeps charting what it charts, and one of them is the one you are
looking at.

Five sync toggles fan changes across the charts: `symbol`, `timeframe` and `dateRange` replay a
change onto every chart, `crosshair` mirrors continuously by time, and `time` centers every chart on
a clicked moment. The whole layout serializes as ONE opaque content blob (arrangement, sync flags,
durable chart-entity identities, active chart, every chart's own content), so a saved multi-chart
layout is one row in the same
save/load backend a single chart uses.

```ts
import { createChart, createUdfDatafeed, LAYOUT_MENU_ROWS } from '@trdrs/quickcharts'

const widget = createChart({
  container: document.getElementById('charts')!,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  layout: {
    arrangement: '2h',
    charts: [{ symbol: 'ES', timeframe: '1m' }, { symbol: 'NQ', timeframe: '5m' }],
    sync: { crosshair: true },
  },
})
widget.on('activeChart', (chart) => header.setSymbol(chart.symbol()))
header.setSymbol(widget.activeChart().symbol()) // the value on mount; the event carries changes
widget.layout.setSync({ symbol: true })
widget.layout.setArrangement(LAYOUT_MENU_ROWS[3]!.codes[0]!) // '4', the 2x2 grid
const saved = widget.layout.serialize().content // ONE blob for the whole layout
widget.layout.restore(saved)
widget.dispose()
```

A split is RESIZABLE. Every boundary between two charts carries a grab strip, and dragging one
resizes each chart that sits on it, clamped so no chart is squeezed under a minimum share of the
square. The sizes ride the layout blob and belong to the arrangement they were dragged on, so
re-tiling opens at the catalog's own splits rather than inheriting numbers that describe a
different shape.

One chart can also stand ALONE: `widget.layout.setMaximized(index)` fills the square with it and
steps its siblings out of the flow, and `setMaximized(null)` puts them all back exactly where they
were, still charting what they charted. `widget.layout.maximized()` reads which one stands, or
`null` while every chart is tiled. Maximizing is a way of looking at a layout, not a shape it was
saved in, so it is not carried by the blob and a re-tile restores it.

Three keys drive a split, all of them ordinary commands a host can rebind or turn off:
`widget.layout.activateNext` on `Tab`, `widget.layout.activatePrevious` on `Shift+Tab`, and
`widget.layout.toggleMaximize` on `Alt+Enter`. Tab is claimed only when nothing focusable inside
the chart has focus, so tabbing along the toolbar still reaches the next button. Alt+click on a
chart maximizes it, and alt+click again restores the split.

Each chart's handle stays reachable through `widget.charts()`, including the `sync`
pane-composition primitives (`onCrosshair` and `setCrosshair`, `onTimeClick`, `onVisibleRange`) the
layout itself is built on, so a host can compose charts its own way. `locale` sets every chart's
interface language and `widget.setLocale(code)` switches them together; a chart created by a later
re-tile opens in the current one.

## Drawings

The widget ships with a complete drawing product, on by default: every one of the 89 tools places
from the toolbar, the selected drawing gets a floating settings bar and a settings dialog, tool
defaults and named templates ride the adapter's template family, and a symbol's drawings persist
through the adapter's drawings family. Turn the whole layer off with `features.drawings: false`,
or keep the layer and hide its toolbar or favorites bar to drive it from your own UI:

```ts
import { createChart, createUdfDatafeed } from '@trdrs/quickcharts'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  ui: { drawingToolbar: false, drawingFavorites: false },
})
const drawings = widget.activeChart().drawings
drawings?.armTool('trend_line')
drawings?.armTool('emoji', { glyph: '🚀' }) // props seed the next placement
const selected = drawings?.selected() // the selection's style channels and flags, or null
drawings?.updateStyle({ lineWidth: 3 }) // the edit becomes the tool's remembered default
const saved = drawings?.export() // the persistence wire format (SerializedDrawing[])
note(`${selected?.type ?? 'nothing'} selected, ${saved?.length ?? 0} drawings`)
```

`@trdrs/quickcharts/glyphs` carries the glyph picker's lists on their own, with nothing that names a
window, a document or a DOM type, so a picker of your own, a native view among them, offers the same
glyphs the chart's picker does: `EMOJI_CATEGORIES` and `ICON_CATEGORIES`, each category with its
`id`, the catalog key of its `heading` and its `glyphs`, and `isEmojiGlyph`. The command arms a glyph
tool with the glyph its next placement draws:

```ts
import { createChartI18n, type ChartWidget } from '@trdrs/quickcharts'
import { EMOJI_CATEGORIES } from '@trdrs/quickcharts/glyphs'

const { t } = createChartI18n()
for (const category of EMOJI_CATEGORIES) note(`${t(category.heading)}: ${category.glyphs.length} emoji`)

function armEmoji(widget: ChartWidget, glyph: string): void {
  widget.commands.execute('chart.drawings.arm', { tool: 'emoji', props: { glyph } })
}
```

### The drawing toolbar

The drawing toolbar runs down the chart's leading edge. Its buttons are the cursor with its three
pointer modes and the eraser; seven tool groups, each opening a flyout of the group's sections
with a star on every row that lands the tool on the favorites bar; Measure and Zoom; the magnet
with its weak and strong strengths; stay in drawing mode; lock all; the eye that hides drawings,
indicators, or both; drawing sync, shown only in a layout of more than one chart; the remove menu,
which names what each row takes and carries the locked-item policy; and the favorites star. Each
group button wears the tool it last armed, and every action is a `chart.drawings.*` command
through the registry: a control renders disabled while the registry would not run its command (a
tool or verb your access policy refuses, a selection verb with nothing selected, the Image tool
without an asset port), and with `access.refused: 'hide'` a tool or verb the policy refuses is left
out instead (see Refused controls), and a command the policy refuses answers `denied` from the
toolbar as from anywhere else, including `chart.drawings.arm` for a refused tool. A tool your
`drawingTools` list leaves out is not on the toolbar at all (see Offered drawing tools). An image is
placed through `chart.drawings.placeImage`, from the picker or a system-clipboard paste over the
chart. Every flyout, palette and dialog a surface opens sits inside the chart root and closes with
it, and the eye and lock all announce their state through a live region. Lock all also makes Paste
unavailable, so a control never reports success for a drawing the layer refused.

Arm the transient tools by name: `measure` draws a readout the next gesture clears, `zoom` sets
the visible range to the dragged box, and `eraser` removes what it presses until Escape or the
cursor releases it. Measure disarms when it completes, while Cancel and Escape remain available to
clear its standing readout. The `image` tool opens the picker, which places the picture once it is
chosen.

### The selected drawing

Selecting a drawing shows the settings bar: templates, the stroke color with its opacity, the
background for tools that have one, the text color and font size for text tools, thickness and
line style, the settings gear, lock, delete, and a More menu with the stacking moves, the
per-timeframe visibility presets, clone, copy and hide. Every edit persists at once and becomes the
tool's default for the next drawing of that type. The settings dialog opens from the gear with
Inputs, Style, Text, Table, Coordinates and Visibility pages as the tool has them; its edits apply
live, Cancel restores the drawing, and Ok commits the session as one edit.

Text-bearing tools open an inline editor where the text sits, in the drawing's own type. A fresh
placement committed empty is removed; an existing note committed empty is blanked. Ctrl or Cmd
with Enter commits, Escape cancels, and a press on the chart commits.

Templates are named setups a viewer saves from either surface and applies on demand. They and
the remembered defaults ride `ChartSaveLoadAdapter.templates('drawing')`, so a host that keeps
saved charts on a server keeps these there too. Same-tool default changes are written in issue
order, and a delayed read or failed write does not replace the newest local choice. Store work is
admitted before subscribers hear an optimistic clear, save or removal, so a subscriber that
replaces the last chart cannot reopen from stale data between the local change and its write. A
subscriber exception still rejects the operation and releases its cache lifetime. Without an
adapter they last the page.

### The asset port

The image and glyph tools reach your host through `ChartWidgetOptions.assets`. `intakeImage`
turns a picked file into a payload within the caps and answers a refusal as a code the chart
resolves through its own catalog; `glyphSource` answers the artwork URL an emoji or sticker draws
with, or null to draw the glyph as text. Emoji artwork from Twemoji is bundled and works without
an asset port or external requests. Omit `glyphSource` to use it. It is a chunk of its own, which
the chart imports the first time it draws an emoji, so a chart that never shows one never loads
it; until it arrives an emoji draws as text, then takes its artwork in place. A chart given a
`glyphSource` never loads it. Without the port the image tool does not open. Keep the Twemoji credit in `THIRD-PARTY-NOTICES.md` accessible in your product.

The layer is also mountable on its own lightweight-charts pair, without the widget:

```ts
import { attachDrawings } from '@trdrs/quickcharts'

const layer = attachDrawings({ chart, series, container, symbol: 'ES' })
layer.armTool('rectangle')
layer.destroy()
```

A layer you mount yourself arms whatever you arm. Its `copies` option answers whether a new drawing
may be made as a copy of a drawing of a type: return false for a tool you do not offer, and clone,
paste and a Control- or Command-drag duplicate make nothing for its drawings, `canPaste` answers
false, and the drag moves the drawing itself.

### `@trdrs/quickcharts/drawings`

Everything about drawings a host builds its own UI from is one subpath. A host that never draws
never imports any of it.

```ts
import { buildDrawingToolbarGroups, drawingTools, parseDrawingsStore, restoreDrawings, serializeDrawingsStore } from '@trdrs/quickcharts/drawings'

// The catalog: 89 tools in 14 categories, read-only.
const trendLine = drawingTools.get('trend_line')
const fibs = drawingTools.byCategory('fibonacci')

// The drawing toolbar as data: seven groups, their sections, and a catalog key per heading.
for (const group of buildDrawingToolbarGroups()) {
  for (const section of group.sections) note(`${group.id}/${section.label}: ${section.tools.length}`)
}

// Persistence: the store document, and live drawings back out of one symbol's bucket.
const store = parseDrawingsStore(localStorage.getItem('acme.chart.drawings'))
const drawings = restoreDrawings(store['ES'] ?? [])
localStorage.setItem('acme.chart.drawings', serializeDrawingsStore(store))
```

The subpath carries the workflow models too: what the drawing toolbar's eye blanks (`HideMode`,
which reaches chart-owned drawings and indicators and nothing else), the cursor modes and the two
transient tools, the magnet policy over `magnetSnap`, the remove menu, favorites over a
`FavoritesPort`, the standing preference record, and per-tool defaults and named templates over
`ChartSaveLoadAdapter.templates('drawing')`. Each is a pure function or a plain record, so a host
builds its own controls without reimplementing the decisions behind them.

What a lock refuses is the library's own. A host locks and unlocks through the drawing commands and
reads what they answer: `chart.drawings.lock` holds one drawing where it stands,
`chart.drawings.lockAll` suspends the whole chart, and every editing command answers `ok` or
`unavailable` for the state the chart is actually in, so a control built on those outcomes says
exactly what the chart will accept. The gesture list below is what a viewer meets.

```ts
import { blanks, chooseHideMode, DEFAULT_HIDE_STATE, DrawingTemplates } from '@trdrs/quickcharts/drawings'

const eye = chooseHideMode(DEFAULT_HIDE_STATE, 'all') // points at All and blanks it in one gesture
if (blanks(eye, 'indicators')) note('indicators are blanked')

const templates = new DrawingTemplates(myBackend.templates('drawing'))
await templates.save('trend_line', 'Thick red', { style: { lineWidth: 4, lineColor: '#ff3b30' } })
const preset = await templates.defaultFor('trend_line')
```

Image-backed and glyph tools reach the host through one explicit asset port. The library owns the
rules (JPG or PNG, 2 MB, a 2000 px longest edge, downscaled rather than refused) and names each
refusal with a code that resolves through the chart's own catalog; the host owns the bytes.

```ts
import { checkImageFile, fittedSize, IMAGE_ACCEPT, type DrawingAssetPort } from '@trdrs/quickcharts/drawings'

const assets: DrawingAssetPort = {
  async intakeImage(file) {
    const bad = checkImageFile(file)
    if (bad) return { ok: false, ...bad }
    const { width, height } = fittedSize(1200, 900)
    return { ok: true, asset: { dataUrl: await myBackend.read(file), width, height, downscaled: false } }
  },
  // Optional: glyphSource replaces the bundled emoji artwork.
  // glyphSource: (glyph) => myBackend.emojiUrl(glyph),
}
note(IMAGE_ACCEPT)
```

What to know:

- **The subpath is a deliberate subset.** The drawing classes, the model store and the
  mutable registry stay inside the library. A host chooses among the catalog's tools through
  `drawingTools` and the access policy.
- **Every tool places.** Fixed-anchor tools place by press-drag-release or click then click; an
  instant tool (the position tools) lands whole from one press; a multipoint tool adds a point per
  click until a double-click ends the run; a freehand tool captures the drag as a stroke; a
  text-bearing tool opens the inline editor as it lands. `armTool` **throws** only for a name the
  catalog does not know, and `placeableByWidget(type)` answers in advance.
- **Persistence speaks a shared codec.** The store document (`{ [symbol]: SerializedDrawing[] }`,
  via `parseDrawingsStore`/`serializeDrawingsStore`) is the SAME document every host of the codec
  reads and writes, so drawings survive moving between hosts. A drawing bound to one chart (sync
  off) lives in the adapter's chart-bound scope for the symbol; a shared drawing lives in the
  symbol's scope, and a refused write merges the stored document over the layer's own before it
  writes again.
- **Keys run through the registry.** Delete and Backspace remove the selection, Escape cancels a
  placement, disarms, or closes the inline editor, and Ctrl (or Cmd) with C and V copy and paste a
  drawing. Each resolves to a `chart.drawings.*` command, so your access policy gates the keyboard
  as it gates the toolbar; the keys bind to the chart element and never the page, so an embedded
  chart cannot swallow the host page's keys.
- **Gestures follow the standard grammar.** Drag a drawing to move it (rigid whole-bar translation,
  so anchors never drift apart); grab an anchor handle to reshape; hold Shift to constrain a
  two-point placement or an anchor drag to 45 degree rays; Ctrl-drag duplicates; the magnet pulls
  a placed or dragged anchor onto the bar's own open, high, low or close; a locked drawing
  selects, takes the Delete and Clone a viewer asks for by name, and refuses a move, a resize, a
  text edit, the eraser and a Ctrl-drag copy; lock all suspends every edit, Delete and Clone
  included, until it is released.

## Extensions

An extension is host code that draws on the chart, adds rows to its context menu, offers commands,
and stores viewer state in the chart's own save blob. The chart attaches it at mount, pushes its
changes at it, and takes it down at teardown, along with everything it drew.

```ts
import { createChart, createUdfDatafeed, type ChartExtension } from '@trdrs/quickcharts'

const alertLines: ChartExtension = {
  id: 'acme.alerts',
  attach(ctx) {
    let levels: number[] = []
    const lines = levels.map((price) => ctx.series.createPriceLine({ price, color: '#f5a623' }))
    ctx.contributeContextMenu((menu) => [
      {
        id: 'add',
        label: `Add alert at ${menu.priceText}`,
        icon: { paths: [{ d: 'M14 6 L22 20 H6 Z' }] },
        run: () => levels.push(menu.price),
      },
    ])
    ctx.contributeCommands([{ id: 'acme.alerts.clear', label: 'Clear alerts', execute: () => (levels = []) }])
    ctx.onSymbolChange(() => (levels = []))
    return {
      serialize: () => levels,
      restore: (state) => {
        levels = Array.isArray(state) ? state.filter((p): p is number => typeof p === 'number') : []
      },
      detach: () => lines.forEach((line) => line.remove()),
    }
  },
}

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  extensions: [alertLines],
})
widget.commands.execute('acme.alerts.clear')
```

What to know:

- **The context is the whole surface.** `ChartExtensionContext` carries the chart's symbol,
  timeframe, bars, replay state, feed status, palette, pane geometry and whether the chart is the
  widget's active chart (`active()`, a sole chart being active), a subscription for each of
  the changing ones, the
  gesture box and the chrome overlay to mount DOM in, the chart's price formatter, and the series
  capabilities: `createPriceLine`, `attachPrimitive`, `priceToY` / `yToPrice`, `timeToX` /
  `xToTime`, `plotWidth`, and `lockPanZoom` for the length of a drag. Every `on…` returns its own
  unsubscribe.
- **A popover that must stand over everything mounts on the layer.** `ctx.layer` is the widget's
  layer on the document body, painted with the widget's theme: a menu or an editor mounted there at
  viewport coordinates stands over every pane and over whatever the page stacks around the widget,
  which the pane's own overlay cannot promise. `ctx.symbolTitle()` is the name symbology gives the
  charted market, the name the legend and the context menu print; `ctx.chart.symbol()` stays the
  ticker an action is sent for. `ctx.painters` carries the mark painters you supplied as `.symbol`,
  `.venue` and `.dataSource`, so a surface that names a market paints it with the same mark the
  legend and the search rows wear rather than shipping artwork of its own; a painter you did not
  supply is `null`, and the surface writes the name alone.
- **A contributed row may bring its own glyph.** `ChartExtensionMenuItem.icon` is a
  `ChartExtensionIcon`: shapes on the menu's 28-unit grid, each one SVG path data plus a closed set
  of paint values (`solid` or `outline` in the current text colour, a stroke width, a winding rule).
  The chart's own menu glyphs are described the same way and built by the same code, so there is one
  icon contract rather than two and a contributed row reads exactly like a built-in one. The chart
  creates elements and writes only the attributes the contract names, so a glyph has nowhere to
  carry a script, an event handler, a colour or a remote reference. It takes the ink of the row it
  sits in and is hidden from assistive technology; the row's label is its accessible name either way.
- **A contributed row sits in one of two groups.** `ChartExtensionMenuItem.group` is `level` (the
  default), an action on the price the pointer landed on, placed under Copy price and Paste; or
  `view`, a switch over what the chart shows, placed under the remove rows. Rows keep the order
  they were contributed in within their group.
- **A drawn layer can join the drawing toolbar's eye.**
  `ctx.contributeHideLayer({ id, label, icon, apply })` lists the layer in the eye's menu after the
  chart's own drawings and indicators and before "Hide all", which blanks it with them. `label`
  carries the row's wording in both states, `icon` the two marks the eye wears while the layer is
  its subject, and `apply(hidden)` is called with the current state at contribution and on every
  change. The handle reads `hidden()`, flips `setHidden()` through the same eye the drawing toolbar
  drives, and `remove()` withdraws the layer.
- **A printed chord is a real binding.** `ChartExtensionMenuItem.shortcut` prints on the row and
  answers to the key. The chart's dispatcher offers a press no built-in verb claims to the rows your
  `contributeContextMenu` callback returns for the level under the pointer and runs that row's own
  `run`, the same call the click makes. The press acts on the tile the pointer is inside, active or
  not; outside every tile, on a point with no readable level, while the viewer is typing, or while
  a modal holds the keyboard, the key is left to your page. A row your callback withholds claims no
  key, and a row carries one chord.
- **A glyph is bounded, and a refusal is free.** Up to 8 shapes, each up to 2048 characters of path
  data with every number in it finite, and an `outline` stroke width above 0 and up to 8. A shape
  outside that is dropped and the rest of the glyph still draws; a descriptor outside it draws
  nothing at all. A row with no icon, or with one the chart will not draw, keeps the gutter and the
  label alignment it has, raises nothing and logs nothing. A checkable row shows the check instead.
  The chart names no glyph vocabulary for contributed rows: what a row means is the host's business.
- **The chart owns the renderer.** Extensions receive capabilities, not the chart or series
  objects. A primitive mounted through `attachPrimitive` still meets the renderer's own
  `attached` callback, which is lightweight-charts' contract for primitives; the chart detaches
  that primitive for the extension when the extension comes down.
- **Teardown is complete.** Detaching removes every price line and primitive the extension created
  and releases any pan/zoom lock it still holds, whether or not the extension took them down
  itself. Subscriptions stop, and the context becomes inert: afterwards every method is a no-op
  returning a neutral value rather than a throw into work already in flight.
- **State is namespaced.** `serialize()` is stored under the extension's `id` inside the chart's
  content blob, and `restore(state)` receives only that slot, after the saved symbol, timeframe,
  scale and comparisons are on screen. One `id`, one attachment: a duplicate is refused.
- **Scope is a declaration.** By default an extension stays attached for the chart's life and hears
  symbol switches through `onSymbolChange`. Declare `scope: 'symbol'` and the chart detaches and
  re-attaches it on every switch, so a market-scoped overlay cannot carry one market's drawing onto
  another's bars.
- **A failing extension is its own problem.** A throw in `attach` drops that extension and the
  chart still mounts; a throw in a subscriber, a menu builder, a command or a teardown is
  contained.
- **Layouts attach per chart.** A widget hands its shared options to every chart it tiles, so each
  chart gets its own attachment, its own context and its own state slot.

## What is verified

Every claim in this document maps to a test or a generated artifact in the package:

- The feature inventory (commands, drawing tools, arrangements, indicators, locales, the `features`
  and `ui` flags and the icon ids) is `dist/feature-manifest.json`, generated from the source on
  every build; the inventory tests hold the built manifest to the source registries.
- Hiding any control in `ui` leaves every command exactly as available as before, apart from the
  two dialog doors named under Configuration planes, across every flag the plane takes.
- With a drawing for every icon, every glyph on each surface of the default interface is the host's,
  and nothing in the package draws a control's glyph except through the one resolver.
- The theme roles, both built-in palettes and the stylesheet are `dist/theme-manifest.json` and
  `@trdrs/quickcharts/styles.css`, generated from the token schema; the theme vectors under `test/theme` pin
  the resolved values.
- The REST wire contract is `dist/rest-openapi.json`, rendered from the typed contract the adapter
  implements; the adapter tests compare the committed schema with the rendering.
- The exported names and their runtime kinds are pinned by the API-surface test, the declarations
  compile in a clean-room project with `skipLibCheck` off, and every `ts` block in this document
  type-checks against the real exports.
- The dependency closure, the absence of private packages, hosts and credentials from the source
  and the tarball, and the third-party notices are held by the boundary tests and
  `THIRD-PARTY-NOTICES.md`.

## Versioning

- **SemVer, enforced at the gate.** The public surface is pinned by an API-surface test (every
  exported name and its runtime kind), the shipped type declarations are compiled against by a
  clean-room consumer with `skipLibCheck: false`, and this README's own `ts` examples type-check
  against the real exports. A change that trips any of those is decided as a version event: a
  removed/renamed export or a changed contract is **major**; new surface is **minor**; fixes are
  **patch**. None ships as silent drift.
- **Optionality is the compatibility mechanism.** New seam capabilities arrive as *optional* methods
  and fields (`config` and `serverTime` are the pattern): an existing
  implementation keeps compiling, and the widget treats absence as "unconstrained / not supported".
  Your integration never breaks by standing still within a major.
- **A major version may rename or remove public names.** Its upgrading guide in
  [CHANGELOG.md](CHANGELOG.md) lists each one, old to new, with how saved state carries over: what
  the previous major saved still opens, and the next save writes the current names.
- **The wire timeframe grammar is stable vocabulary.** `<N><unit>` with units `t s m h d w mo`.
  Extensions may add units; an existing token never changes meaning.
