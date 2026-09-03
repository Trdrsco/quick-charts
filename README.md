# quickcharts

The charting library's public surface. Build a platform on the chart by supplying a **datafeed** — the
single seam the whole design turns on. The chart consumes the `ChartDatafeed` interface and never a
concrete backend, so your feed drives it with zero changes to the chart.

## Install

```bash
npm install quickcharts lightweight-charts
```

`lightweight-charts` (^5.0.0) is a **peer dependency**: your app owns the renderer version and the
chart layers on top of it. Both packages ship **ESM-only** — lightweight-charts v5 itself exports no
`require` entry, so a `require`-able build here would advertise a path that breaks the moment the
renderer loads. From a CommonJS host, load via dynamic `import()`.

Licensing: see `LICENSE`. Because the renderer is *your* dependency, its Apache-2.0 NOTICE
obligations attach to **your** bundle: `THIRD-PARTY-NOTICES.md` in this package spells out exactly
what to carry and how. The chart includes no trading, accounts or executions; an application that
trades composes those outside the chart, through the extension seam below.

Quickstart — the smallest working chart (see [The widget](#the-widget) for the full options). The
stylesheet import is not optional: it carries the chart's layout as well as its look, and without it
the chart has no size and paints nothing.

```ts
import 'quickcharts/styles.css'
import { createChart, createUdfDatafeed } from 'quickcharts'

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
symbol metadata, bars and bar updates and nothing else: a quote board (last, change, volume) or a
top-of-book is not a chart concern, and your host fans quotes to its own consumers from its own
source.

`resolve` answers with `SymbolInfo`, the symbology contract ([Symbology](#symbology)): the
symbol's identity (`ticker`, `name`, `description`), venue and type (`exchange`,
`listedExchange`, `type`), `supportedResolutions` (chart timeframe tokens; an empty list declares
no restriction), the exchange session triple (`timezone`, `session`, `sessionHolidays`),
`dataStatus`, `currencyCode` or `unitId`, `volumePrecision`, and the price-format facts in
`format`. Null means the symbol is unknown to your catalogs.

```ts
import type { SymbolInfo } from 'quickcharts'

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
import type { ChartDatafeed, FeedBar } from 'quickcharts'

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
7. **Never synthesize prices.** A bar carries what the market printed; a symbol with no data has no
   bars, never invented ones.

### Capability declaration (`config`, optional)

A feed with a **fixed** capability set may declare it; the widget reads the declaration once at mount
and constrains itself — in particular, its opening timeframe must be servable: a sticky/default tf the
feed did not declare falls to your **first** declared resolution instead of dead-ending the first paint
on a refusal. The viewer's stored preference is *not* overwritten (capability is the feed's property,
preference is the viewer's — a later feed that serves the preferred tf gets it back).

```ts
import type { ChartDatafeed, DatafeedConfig } from 'quickcharts'

declare const baseFeed: ChartDatafeed // your feed from the section above

export const feed: ChartDatafeed = {
  ...baseFeed,
  async config(): Promise<DatafeedConfig> {
    return { resolutions: ['1m', '5m', '1h', '1d'] }
  },
}
```

Declare only what is **true**. Absent method / absent field / empty list = unconstrained — a feed that
serves any interval must not declare a finite `resolutions` list, because the widget then enforces it.
The UDF adapter declares automatically from the server's own `/config` (and only ever declares
timeframes it would actually serve).

## The UDF on-ramp

Already serving bars over the UDF wire protocol? Skip implementing the interface and point the
adapter at your server:

```ts
import { createUdfDatafeed } from 'quickcharts'

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

## Symbology

Symbology is the set of display facts that decide how a market's prices are written. Your datafeed
owns them (`resolve` answers with `SymbolInfo`), and one package formatter uses them everywhere a
price appears: the price scale, the crosshair and last-price labels, the legend, the level menu,
every drawing label, study scales, and the extension seam. Precision comes from the symbol, never
from the size of the price, so the same market reads at the same width on every surface. A study
that declares its own precision keeps it; every other value writes through the symbol formatter.

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
import { createPriceFormatter, type PriceFormat } from 'quickcharts'

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
import { createPriceFormatter } from 'quickcharts'

const formatter = createPriceFormatter({ pricescale: 32, minmov: 1, fractional: true })
formatter.parse("110'16") // 110.5
formatter.parse('110.5') // null, because that symbol does not write decimals
formatter.precision() // 0, because a fractional format writes no decimal digits
```

A ladder changes width by band, because the symbol declared those bands:

```ts
import { createPriceFormatter, parseTickBands, tickBandFor } from 'quickcharts'

const laddered = createPriceFormatter({ pricescale: 10000, minmov: 1, variableTickSize: '0.0001 1 0.001 10 0.01' })
laddered.format(0.5432) // '0.5432'
laddered.format(54.32) // '54.32'

const bands = parseTickBands('0.0001 1 0.001 10 0.01')
tickBandFor(bands, 5)?.size // 0.001
```

The formatter writes a `.` decimal sign and no thousands separator. Pass a locale to take that
locale's decimal sign, or set the punctuation yourself:

```ts
import { createPriceFormatter } from 'quickcharts'

createPriceFormatter({ pricescale: 100, minmov: 1 }, { locale: 'de-DE' }).format(1234.5) // '1234,50'
createPriceFormatter({ pricescale: 100, minmov: 1 }, { numericPunctuation: { groupSign: ',' } }).format(1234.5) // '1,234.50'
```

Symbology is display truth, not trading truth. It carries no order quantity, price step, lot size,
or pip value. Your broker integration owns those, and a broker's execution grid can differ from a
chart's display grid.

If your data comes from a UDF server, map its `/symbols` answer without collapsing the facts:

```ts
import { createPriceFormatter, udfPriceFormat, udfSymbolInfo } from 'quickcharts'

const raw = { name: 'ZBZ2026', pricescale: 128, minmov: 1, minmove2: 4, fractional: true }
const info = udfSymbolInfo(raw, 'ZBZ2026')
createPriceFormatter(udfPriceFormat(raw)).format(110.515625) // "110'16'2"
info?.dataStatus // 'streaming'
```

## Saved resources

Saved charts, layouts, symbol-scoped drawings, and templates are shared, mutable state. They use one
revisioned contract, so a second tab or a slow save cannot quietly destroy newer work.

Every read returns a `ResourceRef`: a stable id plus an opaque revision token. Every write quotes the
revision it believes it is replacing. A write against a revision the store has moved past returns a
typed `conflict` carrying the current ref, which you resolve rather than overwrite.

```ts
import { memorySaveLoadAdapter } from 'quickcharts'

const adapter = memorySaveLoadAdapter()

const created = await adapter.charts.create({ name: 'Morning', symbol: 'ESZ2026', timeframe: '5m', content: '{}' })
if (created.kind === 'ok') {
  const accepted = await adapter.charts.update(created.ref, { name: 'Morning', symbol: 'ESZ2026', timeframe: '15m', content: '{}' })
  const stale = await adapter.charts.update(created.ref, { name: 'Morning', symbol: 'ESZ2026', timeframe: '1h', content: '{}' })
  accepted.kind // 'ok', and it carries the revision the store now holds
  stale.kind // 'conflict', and it carries the ref that won
}
```

The widget drives the charts family for you. `createChart({ saveLoad })` takes your adapter, and
`widget.saveLoad` holds the OPEN saved chart: `save(name)` updates it at the revision it was
opened at (or creates, when nothing is open or you pass `asNew`), `load(id)` applies a saved
chart and opens it, `remove()` deletes the open one at its held revision, and `current()` reports
the ref and name on screen. A refusal is a typed outcome carrying a sentence from the chart
catalog, so you show one line and offer a reload; the widget never writes over a newer revision.
The drawing layer persists each symbol's drawings through the adapter's drawings family the same
way, and reports a refused write through the widget's `saveConflict` event. A layout does the same
for itself through `widget.layout.saveLoad` over the layouts family.

```ts
import { createChart, createUdfDatafeed, memorySaveLoadAdapter } from 'quickcharts'

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
```

Each family is a `ResourceStore` with the same five calls, and every call takes an `AbortSignal` so
abandoned work stops cleanly:

```ts
import { memorySaveLoadAdapter, type ResourceRef } from 'quickcharts'

const adapter = memorySaveLoadAdapter()
const controller = new AbortController()

await adapter.layouts.list(controller.signal)
await adapter.drawings({ symbol: 'ESZ2026' }).create({ content: '{}' })
await adapter.templates('study').list()

const ghost: ResourceRef = { id: 'gone', revision: 'rev-1' }
const outcome = await adapter.charts.remove(ghost)
outcome.kind // 'not-found'
```

An aborted call rejects with an error named `AbortError` and changes nothing. Treat the revision as
opaque: mint it however your backend prefers, as an ETag, a counter, or a content hash, and compare
it only for equality.

`memorySaveLoadAdapter` persists nothing. Use it for tests, server rendering, and an intentionally
ephemeral embed, and implement the same contract over your own backend for durable storage.

## Viewer preferences

**The widget** keeps the viewer's flat preferences (the last symbol and timeframe, the scale mode,
hidden studies, the replay speed) in a `ChartStorage`. The default is an in-memory store that
lasts the page; supply your own to keep them per device or per account. A browser store is a few
lines a host writes; it is not part of the package, because a device-local default is not a
persistence architecture:

```ts
import { memoryChartStorage, type ChartStorage } from 'quickcharts'

const perDevice: ChartStorage = {
  get: (key) => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: (key) => localStorage.removeItem(key),
  keys: () => Object.keys(localStorage),
}
void perDevice
void memoryChartStorage()
```

Preferences need no identity or revision. Saved charts, layouts, drawings and templates do, and
they live on the saved-resource adapter above, never here.

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
import { BUILT_IN_INDICATORS, createChart, createChartI18n, createUdfDatafeed } from 'quickcharts'

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
import type { IndicatorDefinition } from 'quickcharts'

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
import { createChart, createUdfDatafeed } from 'quickcharts'

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
  manifest before the walk and gates visibility after — the same layering every host applies.

The lower-level pieces are exported for hosts that orchestrate their own compute:
`buildManifestPlots` (the walker), `attachIndicators` (the renderer), `overriddenManifest` /
`applyPlotOverrides` (the override fold), and the fill/shade canvas painters.

## The widget

`createChart(options)` mounts a complete datafeed-driven chart into a DOM element, with no framework
required. It answers a `ChartWidget`: one or many charts under one root, one theme, one language,
one command registry.

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

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
pipeline, and mounts the drawing layer, the legend and the level menu.

### Widget and chart

Two scopes, because two things are true at once: what the widget as a whole is doing, and what one
chart is doing. `widget.charts()` lists every chart; `widget.activeChart()` is the one the viewer
last pointed at; `widget.chart(id)` finds one by its stable id.

```ts
import { CHART_STYLES, type ChartHandle, type ChartWidget } from 'quickcharts'

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
  void chart.logicalRange()
}
```

### The seven chart styles

`candles`, `hollow`, `bars`, `line`, `area`, `baseline`, `stepline`, listed in picker order as
`CHART_STYLES`. A style switch is presentation: nothing refetches, and the loaded bars, indicators,
drawings, comparisons, scale and visible range all survive it. Four of the seven are value-shaped
(`valueShaped(style)`), which is the one predicate a host branches on when it renders open, high and
low values of its own.

### Events

Typed maps, one per scope. Every subscription returns its unsubscribe and is inert after
`dispose()`.

```ts
import { type ChartWidget } from 'quickcharts'

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
`logicalRange`, `dataLoaded`, `feedStatus`, `scaleMode`, `timezone`, `indicator`, `drawing`,
`replay`, `compare`.

### Commands

One registry is the only place a chart verb exists. The chart's own menu, your toolbar, a keyboard
binding and an automation adapter all read this list and run through this `execute`, so a command
your feature configuration hides or your access policy refuses cannot be reached from any of them.

```ts
import { type ChartWidget, type CommandResult } from 'quickcharts'

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

A refusal is a value, never a throw: `ok`, `unavailable`, `denied`, `unknown`, or `failed` with the
error. Your own commands register through the same door: a chart extension's `contributeCommands`
puts them in this list with `scope: 'chart'` and its own label text.

### The four configuration planes

They answer different questions, and only three of them are yours to set.

| Plane | What it answers | Who decides |
|---|---|---|
| `capabilities()` | what the ports, the resolved symbol and the browser can do | derived, never set |
| `features` | which built-in UI and behavior is present | you |
| `access` | which commands, drawing tools and indicators are permitted | you |
| `preferences` | the viewer's own values, persisted through `storage` | the viewer, seeded by you |

A hidden control is not authorization: turning a feature off removes chrome, and the command behind
it still answers to the access policy. An absent port is not a preference: a feed with no search
does not become a viewer who dislikes searching.

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

const gated = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  features: { drawings: true, drawingsToolbar: false, replay: false },
  access: { command: (id) => !id.startsWith('chart.drawings.'), drawingTool: (tool) => tool !== 'brush' },
  preferences: { scaleMode: 'log', style: 'bars' },
})
if (gated.capabilities().search) mountSymbolPicker()
```

### Fullscreen and image

Chart-root fullscreen fills the screen with the widget's own element. It never takes over your
application shell, which is a different thing from a fit-to-container layout your CSS owns.

```ts
import { type ChartWidget } from 'quickcharts'

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

### Neutral marks

Serve `marks` and `timescaleMarks` from your datafeed and the chart draws them. A mark is a note
about a moment: its color is a semantic theme role rather than a literal, its words are yours, and
the chart neither interprets nor acts on it.

```ts
import { type BarMark, type ChartDatafeed } from 'quickcharts'

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
- **Session bands** (on by default; `features.sessions: false` opts out). Every stretch outside
  regular hours shades under the bars, driven by the session model built from the symbol's own
  `session`, `sessionHolidays`, `corrections` and `subsessions` in `resolve()`'s answer (see
  Timezones and sessions). A continuous market never bands; intraday only; an UNRESOLVED symbol
  never bands, which is the honest default rather than a coerced one, and it is enforced: the
  primitive's `model` getter admits `null` and a null draws nothing. A host that changes the model
  outside a `resolve()`, or supplies its own, calls the primitive's `refresh()` when it does; the
  chart does not invalidate the pane on a getter's value changing.
- **A legend** (on by default; `features.legend: false` removes it). It carries the symbol and timeframe
  header with a market-status dot and the four price-scale chips (the SAME application path as
  `setScaleMode`, so the api and the chips can never disagree), plus one row per indicator instance:
  title, latest value, and per-row controls that render by presence. A settings gear appears only
  when the definition declares inputs, pane collapse, maximize and restore only on pane-placed
  instances, and the eye's hidden state persists.
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
import { createChart, createUdfDatafeed, SCALE_MODES } from 'quickcharts'

const w = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), locale: 'de' })
w.activeChart().setScaleMode(SCALE_MODES.includes('log') ? 'log' : 'normal')
w.activeChart().indicators.set([{ id: 'sma-20', definition: smaDefinition }])
await w.setLocale('ja')
```

```ts
import { BUILT_IN_LOCALES, createChart, createChartI18n, createUdfDatafeed, type ChartCustomLocale } from 'quickcharts'

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
import 'quickcharts/styles.css'
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
import { createThemeController, type CustomThemes } from 'quickcharts'

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

Switching modes keeps the symbol, timeframe, visible range, drawings and studies the chart already
has. A palette you supply is a tint rather than a replacement: a role you do not name keeps its
built-in value for that mode.

### Roles

A role is a purpose, such as `text.muted` or `overlay.scrim`. `THEME_ROLES` is the published
inventory, and the built-in palettes and the generated stylesheet are built from it. The custom
property names and the component selectors inside the stylesheet are private, so style the chart
through roles rather than by targeting them.

```ts
import { THEME_ROLES, type ThemeRoleFamily } from 'quickcharts'

const family: ThemeRoleFamily = 'text'
const inkRoles = THEME_ROLES.filter((role) => role.family === family).map((role) => role.id)
note(inkRoles.join(', '))
```

If a value you supply is not valid for the role it is written for, the chart keeps the built-in
value and reports it. Read `theme.diagnostics()` for the role, the code and a sentence naming the
problem. Configuration errors never reach a render.

### Theme and appearance are two ladders

The theme palette is the broad brand surface. Chart appearance is the specific one: series colors,
candle anatomy, grid visibility and study visuals in `ChartOverrides.appearance`. Where both could
affect the same pixel, appearance wins.

Theme palette precedence, lowest first:

1. the built-in palette for the selected mode;
2. your custom palette for that mode.

Chart appearance precedence, lowest first:

1. the built-in appearance for the selected mode;
2. the constructor's `appearance` partial;
3. restored user appearance;
4. runtime `chart.applyAppearance` patches.

Resetting custom palettes returns the chart to the built-in mode and leaves saved chart appearance
alone.

## Compare

Every chart can draw OTHER symbols beside its own. A compare is study-like: legend-managed, three
placements, persisted in the chart content blob. `same-percent` shares the
main price scale and flips it to percent while any such compare lives (the prior scale mode comes
back when the last one leaves); `new-scale` binds the LEFT scale with absolute prices (the left
axis exists only while such a compare does); `new-pane` takes a pane of its own. Compared bars
clip to the main series window, so a compare never extends the time axis. `features.compareSymbols` supplies
a curated quick-add list for the compare dialog; `compare.symbols()` reads it back.

The widget ships its own compare chrome: the legend header carries a compare door (`+`) opening a
built-in dialog — search rows add at any of the three placements, curated `compareSymbols` rows sit
above results, and the ADDED section removes. Each compare takes a legend row whose title reopens
the dialog in change-symbol mode (the pick re-keys the compare in place), with an eye and a remove
beside the value (% under `same-percent`, the last close otherwise). In a layout, compares belong to
each chart of their own (`widget.activeChart().compare`) and ride the layout blob with the rest of
that chart's content.

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

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
compare.remove('NQ') // the scale mode the trader held comes back
```

## Timeframes

A timeframe token names a bar interval: a count and a unit, `1m`, `4h`, `1d`, `3mo`, `500t`. The
units are ticks (`t`), seconds (`s`), minutes (`m`), hours (`h`), days (`d`), weeks (`w`) and
months (`mo`), and each unit has a ceiling (`TIMEFRAME_MAX`). A token outside the grammar parses
as null, and the chart never asks a feed for it.

```ts
import { formatTimeframe, isIntradayTimeframe, parseTimeframe, timeframeSeconds } from 'quickcharts'

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
import { allowedTimeframes, createChartI18n, timeframeLabel, TIMEFRAME_PRESETS } from 'quickcharts'

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
import { EXCHANGE_TIMEZONE, formatClock, makeCrosshairTimeFormatter, makeTickMarkFormatter, resolveDisplayTimezone, TIMEZONES, tzOffsetLabel } from 'quickcharts'

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
import { createChartI18n, marketStatus, marketStatusText, marketStatusTitle, parseSessionModel, sessionStateAt } from 'quickcharts'

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
import { DEFAULT_SUBSESSION, hasExtendedHours, parseSessionModel, subsessionBarFilter } from 'quickcharts'

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

`RANGE_PRESETS` lists the nine range presets, each a visible span and the interval it reads best
at: `1D` over one-minute bars through `All` over monthly bars. `rangeAvailable` withholds a preset
deeper than the history a symbol has, and `frameRange` sets a pane's visible window for a span,
anchored on the last real bar so a future whitespace horizon never frames as empty space. The
navigation cluster's steps are constants: `ZOOM_FACTOR`, `MIN_BAR_SPACING` and
`SCROLL_STEP_BARS`, applied by `zoomedBarSpacing` and `scrolledPosition`.

```ts
import { frameRange, RANGE_PRESETS, rangeAvailable, scrolledPosition, zoomedBarSpacing } from 'quickcharts'

const oneYearAgo = Date.now() / 1000 - 365 * 86_400
RANGE_PRESETS.filter((preset) => rangeAvailable(preset, oneYearAgo)).map((preset) => preset.key) // every preset but '5Y'
frameRange(chart, series, RANGE_PRESETS[0]!.span, '1m')
zoomedBarSpacing(8, 'in') // 10
scrolledPosition(0, 'right') // 10
```

## Search

`createSearchController` drives a symbol search over your datafeed's `search`: a debounce after
the last keystroke, a cache per query and class for the controller's lifetime, a cached answer
shown at once and revalidated in the background, paging through `loadMore` with no repeated row,
and a newer query cancelling an older one's result. The chart's compare dialog runs on it, and a
host's own search surface subscribes to the same state.

```ts
import { createSearchController, createUdfDatafeed } from 'quickcharts'

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
import { looksLikeSpread, isSymbolPair, matchSegments, memoryRecents, spreadExpression } from 'quickcharts'

const recents = memoryRecents()
recents.promote({ symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', type: 'future' })
recents.list().length // 1
matchSegments('BTCUSDT', 'usd') // [{ text: 'BTC', hit: false }, { text: 'USD', hit: true }, { text: 'T', hit: false }]
looksLikeSpread('ES-NQ') // true
isSymbolPair('BTC/USD') // true
spreadExpression(' es - nq ') // 'ES-NQ'
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

Five sync toggles fan changes across the charts: `symbol`, `interval` and `dateRange` replay a
change onto every chart, `crosshair` mirrors continuously by time, and `time` centers every chart on
a clicked moment. The whole layout serializes as ONE opaque content blob (arrangement, sync flags,
active chart, every chart's own content), so a saved multi-chart layout is one row in the same
save/load backend a single chart uses.

```ts
import { createChart, createUdfDatafeed, LAYOUT_MENU_ROWS } from 'quickcharts'

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

Each chart's handle stays reachable through `widget.charts()`, including the `sync`
pane-composition primitives (`onCrosshair` and `setCrosshair`, `onTimeClick`, `onVisibleRange`) the
layout itself is built on, so a host can compose charts its own way. `locale` sets every chart's
interface language and `widget.setLocale(code)` switches them together; a chart created by a later
re-tile opens in the current one.

## Drawings

The widget ships with a complete drawing product, on by default: every one of the 90 tools places
from the toolbar, the selected drawing gets a floating settings bar and a settings dialog, tool
defaults and named templates ride the adapter's template family, and a symbol's drawings persist
through the adapter's drawings family. Turn the whole layer off with `features.drawings: false`,
or keep the layer and hide its toolbar or favorites bar to drive it from your own UI:

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  features: { drawingsToolbar: false, drawingsFavorites: false },
})
const drawings = widget.activeChart().drawings
drawings?.armTool('trend_line')
drawings?.armTool('emoji', { glyph: '🚀' }) // props seed the next placement
const selected = drawings?.selected() // the selection's style channels and flags, or null
drawings?.updateStyle({ lineWidth: 3 }) // the edit becomes the tool's remembered default
const saved = drawings?.export() // the persistence wire format (SerializedDrawing[])
note(`${selected?.type ?? 'nothing'} selected, ${saved?.length ?? 0} drawings`)
```

### The toolbar

The toolbar is the rail down the chart's leading edge. Its buttons are the cursor with its three
pointer modes and the eraser; seven tool groups, each opening a flyout of the group's sections
with a star on every row that lands the tool on the favorites bar; Measure and Zoom; the magnet
with its weak and strong strengths; stay in drawing mode; lock all; the eye that hides drawings,
indicators, or both; drawing sync, shown only in a layout of more than one chart; the remove menu,
which names what each row takes and carries the locked-item policy; and the favorites star. Each
group button wears the tool it last armed, and every action is a `chart.drawings.*` command
through the registry: a control renders disabled, never hidden, while the registry would not run
its command (a tool or verb your access policy refuses, a selection verb with nothing selected),
and a command the policy refuses answers `denied` from the toolbar as from anywhere else. Every
flyout, palette and dialog a surface opens sits inside the chart root and closes with it.

Arm the transient tools by name: `measure` draws a readout the next gesture clears, `zoom` sets
the visible range to the dragged box, and `eraser` removes what it presses until Escape or the
cursor releases it. The `image` tool opens the picker, which places the picture once it is chosen.

### The selected drawing

Selecting a drawing shows the settings bar: templates, the stroke color with its opacity, the
background for tools that have one, the text color and font size for text tools, thickness and
line style, the settings gear, lock, delete, and a More menu with the stacking moves, the
per-interval visibility presets, clone, copy and hide. Every edit persists at once and becomes the
tool's default for the next drawing of that type. The settings dialog opens from the gear with
Inputs, Style, Text, Table, Coordinates and Visibility pages as the tool has them; its edits apply
live, Cancel restores the drawing, and Ok commits the session as one edit.

Text-bearing tools open an inline editor where the text sits, in the drawing's own type. A fresh
placement committed empty is removed; an existing note committed empty is blanked. Ctrl or Cmd
with Enter commits, Escape cancels, and a press on the chart commits.

Templates are named setups a trader saves from either surface and applies on demand. They and
the remembered defaults ride `ChartSaveLoadAdapter.templates('drawing')`, so a host that keeps
saved charts on a server keeps these there too; without an adapter they last the page.

### The asset port

The image and glyph tools reach your host through `ChartWidgetOptions.assets`. `intakeImage`
turns a picked file into a payload within the caps and answers a refusal as a code the chart
resolves through its own catalog; `glyphSource` answers the artwork URL an emoji or sticker draws
with, or null to draw the glyph as text. Without the port the image tool does not open and glyphs
draw as text.

The layer is also mountable on its own lightweight-charts pair, without the widget:

```ts
import { attachDrawings } from 'quickcharts'

const layer = attachDrawings({ chart, series, container, symbol: 'ES' })
layer.armTool('rectangle')
layer.destroy()
```

### `quickcharts/drawings`

Everything about drawings a host builds its own UI from is one subpath. A host that never draws
never imports any of it.

```ts
import { buildRailGroups, drawingTools, parseDrawingsStore, restoreDrawings, serializeDrawingsStore } from 'quickcharts/drawings'

// The catalog: 90 tools in 14 categories, read-only.
const trendLine = drawingTools.get('trend_line')
const fibs = drawingTools.byCategory('fibonacci')

// The rail's own structure, as data: seven groups, their sections, and a catalog key per heading.
for (const group of buildRailGroups()) {
  for (const section of group.sections) note(`${group.id}/${section.label}: ${section.tools.length}`)
}

// Persistence: the store document, and live drawings back out of one symbol's bucket.
const store = parseDrawingsStore(localStorage.getItem('acme.chart.drawings'))
const drawings = restoreDrawings(store['ES'] ?? [])
localStorage.setItem('acme.chart.drawings', serializeDrawingsStore(store))
```

The subpath carries the workflow models too: what the rail's eye blanks (`HideMode`, which reaches
chart-owned drawings and indicators and nothing else), the cursor modes and the two transient
tools, the magnet policy over `magnetSnap`, the lock policy, the remove menu, favorites over a
`FavoritesPort`, the standing preference record, and per-tool defaults and named templates over
`ChartSaveLoadAdapter.templates('drawing')`. Each is a pure function or a plain record, so a host
builds its own controls without reimplementing the decisions behind them.

```ts
import { blanks, chooseHideMode, DEFAULT_HIDE_STATE, DrawingTemplates } from 'quickcharts/drawings'

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
import { checkImageFile, fittedSize, IMAGE_ACCEPT, type DrawingAssetPort } from 'quickcharts/drawings'

const assets: DrawingAssetPort = {
  async intakeImage(file) {
    const bad = checkImageFile(file)
    if (bad) return { ok: false, ...bad }
    const { width, height } = fittedSize(1200, 900)
    return { ok: true, asset: { dataUrl: await myBackend.read(file), width, height, downscaled: false } }
  },
  glyphSource: (glyph) => myBackend.emojiUrl(glyph),
}
note(IMAGE_ACCEPT)
```

What to know:

- **The subpath is a subset, not a re-export.** The drawing classes, the model store and the
  mutable registry stay inside the library. There is no door for a host-authored tool: tool
  contribution belongs to the access-policy plane, not to a bare registration call.
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
  a placed or dragged anchor onto the bar's own open, high, low or close; locked drawings select
  but refuse edits, and lock all suspends every edit until it is released.

## Extensions

An extension is host code that draws on the chart, adds rows to its level menu, offers commands,
and stores viewer state in the chart's own save blob. The chart attaches it at mount, pushes its
changes at it, and takes it down at teardown, along with everything it drew.

```ts
import { createChart, createUdfDatafeed, type ChartExtension } from 'quickcharts'

const alertLines: ChartExtension = {
  id: 'acme.alerts',
  attach(ctx) {
    let levels: number[] = []
    const lines = levels.map((price) => ctx.series.createPriceLine({ price, color: '#f5a623' }))
    ctx.contributeContextMenu((menu) => [
      { id: 'add', label: `Add alert at ${menu.priceText}`, run: () => levels.push(menu.price) },
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
  timeframe, bars, replay state, feed status, palette and pane geometry, a subscription for each of
  the changing ones, the
  gesture box and the chrome overlay to mount DOM in, the chart's price formatter, and the series
  capabilities: `createPriceLine`, `attachPrimitive`, `priceToY` / `yToPrice`, `timeToX` /
  `xToTime`, `plotWidth`, and `lockPanZoom` for the length of a drag. Every `on…` returns its own
  unsubscribe.
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
  chart still mounts; a throw in a subscriber, a menu provider, a command or a teardown is
  contained.
- **Layouts attach per chart.** A widget hands its shared options to every chart it tiles, so each
  chart gets its own attachment, its own context and its own state slot.

## Versioning & deprecation

- **SemVer, enforced at the gate.** The public surface is pinned by an API-surface test (every
  exported name and its runtime kind), the shipped type declarations are compiled against by a
  clean-room consumer with `skipLibCheck: false`, and this README's own `ts` examples type-check
  against the real exports. A change that trips any of those is decided as a version event — a
  removed/renamed export or a changed contract is **major**; new surface is **minor**; fixes are
  **patch** — never shipped as silent drift.
- **Optionality is the compatibility mechanism.** New seam capabilities arrive as *optional* methods
  and fields (`config` and `serverTime` are the pattern): an existing
  implementation keeps compiling, and the widget treats absence as "unconstrained / not supported".
  Your integration never breaks by standing still within a major.
- **Deprecation runs a full major.** A deprecated export keeps working for the remainder of the
  current major, is marked `@deprecated` in the types with its replacement named in the note (your
  editor flags every call site), and is removed only in the next major — never silently.
- **The wire timeframe grammar is stable vocabulary.** `<N><unit>` with units `t s m h d w mo`.
  Extensions may add units; an existing token never changes meaning.
