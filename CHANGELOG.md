# @trdrs/chart

## Unreleased

- **The account panel is the account-manager package.** `mountAccountPanel` and
  `AccountPanelHandle` are REMOVED (major): the surface below the chart is now
  `@trdrs/account-manager`'s `mountAccountManager` (a new dependency of this package), which the
  widget composes internally — handing it the widget's full `TradingAdapter`, theme and strings,
  so the manager's presence-driven pages (Order history via `ordersHistory`, Accounts via
  `accounts()`, the summary strip via `summary`) light up under the chart as an adapter provides
  them. The manager owns its own account subscription. A host that mounted the panel standalone
  imports the manager package instead.
- **Interface language.** New **`locale`** option on `createChart` and on a layout's `base`, one
  of the 21 codes in the `@trdrs/i18n` registry (a new dependency of this package), English by
  default. The widget's own chrome reads it and the chart's axis and crosshair dates are formatted
  in it. **`setLocale(code)`** on a widget and on a layout switches at runtime; **`locale()`**
  reports the current code. Every chrome module speaks it: the legend, the drawing rail (the 90
  tool names by registry `type`), the order ticket and its type menu, the account panel, the
  context menu (an open menu relabels in place), the replay bar, trade-line pills and their
  actions, the inputs editor, execution-mark cards, the broker's own confirmation and refusal
  lines, and the session status words. What the datafeed or broker says, and every symbol, price
  and id, passes through untranslated. The catalog ships a directory for every registry language;
  a key without a translation reads English.
  Hosts composing the chrome modules themselves pass a `ChartI18n` (from `createChartI18n(code)`)
  as a new OPTIONAL trailing parameter or option — `mountDrawingsRail`, `mountReplayBar`,
  `mountContextMenu`, `openTypeMenu`, `openInputsEditor`; `strings` on
  `TradeLineOptions`, `OrderTicketDeps` and `ExecutionMarksOptions`; `t` on `ChartMenuContext`
  and the trade-line part builders; a BCP 47 `tag` on `sessionTimeline` — every existing call
  compiles unchanged and reads English. New exports `toolName(t, type, fallback)` and
  `arrangementName(t, code, fallback)` give a host the widget's word for a drawing tool or a
  multi-chart arrangement; `Arrangement` gains `label` (the English fallback). Exports
  `createChartI18n` and `chartDictionaries`.

## 0.2.0 — 2026-08-14

- **Execution marks.** New **`attachExecutionMarks(chart, series, chrome, opts)`**, reproducing
  the reference platform's rendering, reproduced literally from its measured raster: one arrow
  PER EXECUTION anchored at the fill price and clamped clear of its bar (a buy hangs below the
  low pointing up at its price, a sell sits above the high pointing down),
  overlapping same-bar same-side barb pairs stacked at a 4px pitch sharing one shaft, and an
  optional "qty @ price" label beyond the shaft (total qty @ volume-weighted average for a stack;
  OFF by default — `labels()` on the attachment, `{ labels: true }` on the widget). Clicking a
  mark opens the card that aggregates the bar's side group — the reference's anatomy (4px side
  stripe, circle count chip, Buy/Sell title, "N @ avg price" subtitle when grouped, the individual
  trades) in the HOST's card tokens via the `card()` palette getter. Hovering a mark tints its
  box with the side's own color at low alpha (the quiet-highlight treatment, never neutral grey)
  and shows the pointer cursor. Fill-to-bar
  placement is by CONTAINING BAR read from the series itself — correct on every interval; a fill
  whose bar is not loaded draws nothing. **Live and replay fills are ISOLATED scopes** — only the
  active one draws, and the live scope is per armed account. The widget wires it end to end:
  `TradingAdapter` gains optional **`executions(symbol)`** (fetched on symbol change, on account
  switch — which first CLEARS the old account's fills — and when a snapshot's position quantities
  move), `ChartWidgetApi` gains **`executions`** (`set`/`setScope`/`scope`), bar replay flips the
  scope to `'replay'` on start and back on exit, and `ChartWidgetOptions.executionMarks: false`
  opts out. `groupExecutionsByBar` is exported for hosts that need the grouping alone.
- **Fix:** `createChart` no longer crashes at mount when the datafeed declares no `config()` (the
  synchronous first load reached a replay helper before its initializer ran).

- **Holiday calendars are SERVED, never bundled.** `SymbolInfo` gains optional
  **`sessionCalendar`** (exchange-local `'YYYY-MM-DD'` → that day's trading segments; empty = a
  full closure; absent dates follow the weekday rules) and the package exports
  **`setHolidayCalendar(kind, calendar | null)`** — the widget registers a served calendar per
  session class automatically on `resolve()`. The previously bundled NYSE/CME tables are REMOVED:
  holiday truth churns annually and belongs to the datafeed (the reference platform serves the
  same knowledge as `session_holidays`/`corrections`); a feed that serves none gets weekday rules,
  honestly uncorrected. Session math still runs entirely in the exchange timezone — the viewer's
  display timezone never enters it.

- **`knownMarketKind(catalogType, served?)`** added — the honest sibling of `marketKindOf`: returns
  `null` (new exported alias `MaybeMarketKind`) when the session model is not actually known,
  including the case a served `'futures'` rides an unrecognized display type (indistinguishable
  from the wire mapping's catch-all default). `marketKindOf` is unchanged.
- **`createSessionBands`** — the `kind` getter is widened to `MarketKind | null`
  (source-compatible: a narrower getter still satisfies it); a null draws nothing. The primitive
  now returns **`SessionBandsPrimitive`**, adding `refresh()` — hosts must call it when the model
  changes outside a chart repaint, or the new bands appear only on the next incidental paint.
- Session math (`sessionOf`, `sessionTimeline`, `exchangeZoneOf`, `nextSessionChange`) now
  tolerates a kind from outside the union (decoded storage, a newer wire): classifies `closed`
  instead of throwing mid-paint.

## 0.1.0 — 2026-08-06

Initial release. The datafeed-driven trading chart widget: candles + volume, the indicator
pipeline (manifest + injected compute; panes, histograms, areas, markers, levels, band fills),
drawings with per-symbol persistence and a built-in rail, bar replay with sub-bar forming,
session bands, scale modes, the legend chrome (scale chips, per-chip settings gear, pane
collapse/maximize/restore, eyes), and the presence-driven trading plane (`TradingAdapter` /
`ChartBroker` seams: trade lines, order ticket with per-intent idempotency and the confirm gate,
account panel). ESM-only; `createUdfDatafeed` on-ramp included.
