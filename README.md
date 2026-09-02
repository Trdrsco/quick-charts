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

Quickstart — the smallest working chart (see [The widget](#the-widget) for the full options):

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
})
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

Already have a [UDF](https://www.tradingview.com/charting-library-docs/latest/connecting_data/UDF) server?
Skip implementing the interface — point the adapter at it:

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
way, and reports a refused write through `events.onSaveConflict`. A layout does the same for
itself through `layout.saveLoad` over the layouts family.

```ts
import { createChart, createUdfDatafeed, memorySaveLoadAdapter } from 'quickcharts'

declare const container: HTMLElement
const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  saveLoad: memorySaveLoadAdapter(),
  events: { onSaveConflict: (info) => console.warn(info.message) },
})
const saved = await widget.saveLoad.save('Morning')
if (saved.kind === 'conflict') console.warn(saved.message) // saved elsewhere since it was opened
widget.saveLoad.current()?.name // 'Morning'
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

`createChart(options)` mounts a complete datafeed-driven chart into a DOM element — no framework required:

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

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
(drawings UI, replay) and layers those on top.

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
- **An interface language** (`locale`, English by default), one of the 21 the package ships.
  `BUILT_IN_LOCALES` lists them for a picker: each carries its stable code, its canonical BCP 47
  `tag`, its reading direction (`ar` and `he_IL` are `rtl`), and its endonym. The widget's own
  chrome reads the language, and the chart's axis and crosshair dates are formatted in it. English
  is in the bundle; every other dictionary is its own chunk, fetched the first time it is chosen
  and shared by every widget on the page. `setLocale(code)` switches at runtime and resolves after
  the dictionary settles; `locale()` reports the current one. Plural forms follow the language's
  CLDR rules through `Intl.PluralRules`, and a number in a message is written with the language's
  digits and grouping. The runtime is the package's own, framework-free and DOM-free, so a server
  render can import it.
  A host with a language the package does not ship registers it through `createChartI18n(code,
  { locales })`: a `ChartCustomLocale` names the code, tag, direction and endonym and supplies the
  dictionary chunk, a `ChartDictionary` typed against the English catalog so it cannot miss a key
  or flatten a plural. A code or tag the built-in inventory already holds is refused. A
  dictionary that arrives from data and misses a key reads English for that key and reports it to
  the `onMissing` option. A host can also supply `i18n: ChartI18n` of its own to own its codes,
  tags, dictionaries, loading, and fallback outright.
  Every piece of the widget's own chrome speaks the language; symbols, prices and anything the
  datafeed says are data and pass through untranslated. A host composing the chrome modules itself
  hands them a `ChartI18n` from `createChartI18n(code)` (an optional trailing parameter or `strings`
  option on each) and reads the widget's words for drawing tools and arrangements through
  `toolName` and `arrangementName`.

```ts
import { createChart, createUdfDatafeed, SCALE_MODES } from 'quickcharts'

const w = createChart({ container, datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }), locale: 'de' })
w.setScaleMode(SCALE_MODES.includes('log') ? 'log' : 'normal')
w.setIndicators([{ id: 'sma-20', definition: smaDefinition }])
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
2. constructor overrides;
3. restored user appearance;
4. runtime `applyOverrides` patches.

Resetting custom palettes returns the chart to the built-in mode and leaves saved chart appearance
alone.

## Compare

Every chart can draw OTHER symbols beside its own, the reference model: a compare is study-like —
legend-managed, three placements, persisted in the chart content blob. `same-percent` shares the
main price scale and flips it to percent while any such compare lives (the prior scale mode comes
back when the last one leaves); `new-scale` binds the LEFT scale with absolute prices (the left
axis exists only while such a compare does); `new-pane` takes a pane of its own. Compared bars
clip to the main series window — a compare never extends the time axis. `compareSymbols` supplies
a curated quick-add list for a compare dialog; `compare.symbols()` reads it back.

The widget ships its own compare chrome: the legend header carries a compare door (`+`) opening a
built-in dialog — search rows add at any of the three placements, curated `compareSymbols` rows sit
above results, and the ADDED section removes. Each compare takes a legend chip whose title reopens
the dialog in change-symbol mode (the pick re-keys the compare in place), with an eye and a remove
beside the value (% under `same-percent`, the last close otherwise). In a layout, compares belong
to each pane's own chart (`layout.panes()[layout.activePane()].compare`) and ride the layout blob
with the rest of that pane's content.

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

const wc = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  compareSymbols: [{ symbol: 'ES', title: 'S&P 500 futures' }],
})
wc.compare.add('NQ', { placement: 'same-percent' }) // shares the scale; the axis flips to %
wc.compare.add('CL', { placement: 'new-pane' })
wc.compare.setVisible('CL', false)
const active = wc.compare.list() // [{ symbol, placement, color, visible }]
note(`NQ last: ${wc.compare.latest('NQ') ?? '-'}`)
wc.compare.remove('NQ') // the scale mode the trader held comes back
```

## Multi-chart layouts

`createChartLayout(options)` tiles N widget panes over one container by an arrangement code and
keeps them in step. The catalog (`ARRANGEMENTS`, grouped for a picker as `LAYOUT_MENU_ROWS`) carries
55 arrangements from a single full-bleed chart to an 8×2 grid; `setArrangement` re-tiles live —
surviving panes keep their charts, new panes clone the active pane's symbol and timeframe. One pane
is ACTIVE (it follows pointerdown; `onActivePane` reports it) — point your own toolbar at it. A
surface of yours that follows the layout asks it which market it is pointed at: `activeSymbol()`
is the active pane's symbol, and `onActiveSymbol` reports it every time it moves — another pane
activated, the active pane's symbol changed, a re-tile, a restore. Pointing such a surface at a
chart moves no chart's symbol, so the two concepts stay separate: each chart keeps charting what
it charts, and one of them is the one you are looking at. Five sync toggles fan changes across
the panes: `symbol`, `interval`, and `dateRange`
replay a change onto every pane, `crosshair` mirrors continuously by time, and `time` centers every
pane on a clicked moment. The whole layout serializes as ONE opaque content blob (arrangement, sync
flags, active pane, every pane's own content), so a saved multi-chart layout is one row in the same
save/load backend a single chart uses.

```ts
import { createChartLayout, createUdfDatafeed, LAYOUT_MENU_ROWS } from 'quickcharts'

const layout = createChartLayout({
  container: document.getElementById('charts')!,
  base: { datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }) },
  arrangement: '2h',
  panes: [{ symbol: 'ES', timeframe: '1m' }, { symbol: 'NQ', timeframe: '5m' }],
  sync: { crosshair: true },
  events: { onActiveSymbol: (symbol) => header.setSymbol(symbol) },
})
header.setSymbol(layout.activeSymbol() ?? 'ES') // the value on mount; the event carries changes
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
anchor-resize, per-symbol persistence through the adapter's drawings family, and a small built-in
tool rail. Turn the layer off with `drawings: false`, or keep it and hide the rail to drive it
from your own UI:

```ts
import { createChart, createUdfDatafeed } from 'quickcharts'

const widget = createChart({
  container,
  datafeed: createUdfDatafeed({ baseUrl: 'https://feed.example.com/udf' }),
  drawings: { rail: false },
})
widget.drawings?.armTool('trend_line')
const saved = widget.drawings?.export() // the persistence wire format (SerializedDrawing[])
```

The layer is also mountable on its own lightweight-charts pair, without the widget:

```ts
import { attachDrawings } from 'quickcharts'

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
- **Layouts attach per pane.** `createChartLayout` hands its shared options to every pane, so each
  pane gets its own attachment, its own context and its own state slot.

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
