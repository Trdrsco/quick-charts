# quickcharts

## Unreleased

- **Timeframes, timezones, sessions, ranges and search as chart models.** The timeframe grammar is
  root API: `parseTimeframe`, `formatTimeframe`, `timeframeSeconds`, `isIntradayTimeframe`,
  `compareTimeframes` and `timeframeOrder` over the seven units, with `TIMEFRAME_MAX` and
  `TIMEFRAME_UNIT_SECONDS` per unit. **`TIMEFRAME_PRESETS`** lists the 26 preset tokens in five
  picker groups; `timeframeLabel` writes a token in the chart's language; `allowedTimeframes` and
  `timeframeAllowed` filter tokens by a symbol's `supportedResolutions` and a feed's
  `resolutions`, where an empty list is no restriction. **`TIMEZONES`** lists the 60 display
  zones, `EXCHANGE_TIMEZONE` follows the charted symbol's own zone through
  `resolveDisplayTimezone`, and `formatClock`, `makeTickMarkFormatter` and
  `makeCrosshairTimeFormatter` take the host's BCP 47 tag beside the zone; `tzOffsetMinutes`,
  `tzOffsetLabel`, `timezoneLabel`, `zoneClock` and `timezoneListing` complete the picker model.
  **`parseSessionModel`** reads a symbol's `session`, `sessionHolidays`, `corrections` and
  subsessions in the reference grammar, and `sessionStateAt`, `marketStatus`, `marketStatusFor`,
  `marketStatusTitle`, `marketStatusText`, `formatDuration` and `exchangeTimezoneText` answer the
  session state and the market status over it, with the feed's `dataStatus` an explicit part of
  the status; `nextSessionChange` and `sessionTimeline` answer the next transition and the
  exchange-local day. `SymbolInfo` carries `corrections` and `subsessions` (`Subsession`,
  `SubsessionId`), the UDF and engine mappings copy them, and `createSessionBands` shades over the
  same model. Which named session a chart displays is the `ActiveSubsession` (`regular` by
  default, `DEFAULT_SUBSESSION`); `hasExtendedHours` and `subsessionBarFilter` apply it. The
  session vocabulary is one set of five states (`SessionState`), `extended` among them, keyed
  through `SESSION_DOT`, `SESSION_LABEL` and the catalog's `session.*`. **`RANGE_PRESETS`** lists the nine range presets; `rangeAvailable`, `rangeSpanSeconds`,
  `rangePresetTip` and `frameRange` apply them, and `zoomedBarSpacing` and `scrolledPosition` apply
  the navigation steps `ZOOM_FACTOR`, `MIN_BAR_SPACING` and `SCROLL_STEP_BARS`.
  **`createSearchController`** drives a symbol search over the datafeed with a debounce, a cache
  per query and class, background revalidation, paging and cancellation; `RecentsPort`,
  `memoryRecents`, `promoteRecent`, `matchSegments`, `SPREAD_OPERATORS`, `looksLikeSpread`,
  `isSymbolPair`, `spreadExpression` and `spreadSearchQuery` are the list rules beside it, and
  the compare dialog runs on the controller. The chart catalog carries every word these need
  under `timeframe.*`, `timezone.*`, `status.*`, `range.*` and `search.*` in every built-in
  locale.
- **The drawing API is its own entrypoint.** **`quickcharts/drawings`** publishes the drawing
  catalog as a read-only view (`drawingTools`, `TOOL_CATEGORIES`: 90 tools in 14 categories), the
  persistence codec (`parseDrawingsStore`, `serializeDrawingsStore`, `restoreDrawings`), the
  per-interval visibility rules, the magnet, and the models a drawing toolbar is built from. The
  rail's structure is data (`buildRailGroups`, `RAIL_PLAN`, `railFaceOf`, `rememberRailTool`); so
  are what the eye blanks (`HideMode`, which reaches chart-owned drawings and indicators and
  nothing else, with `blanks`, `toggleHide`, `chooseHideMode`), the cursor modes and the two
  transient tools, the magnet policy, the lock policy and the remove menu (`editRefused`,
  `removableDrawings`, `removeRows`), favorites over a `FavoritesPort`, the clone and text-edit
  rules, and each tool's settings capabilities. `DrawingPreferences` is the one record of standing
  choices, persisted through the chart's storage port; `DrawingTemplates` puts per-tool defaults
  and named templates on the revisioned `templates('drawing')` resource store. `DrawingAssetPort`
  is how image-backed and glyph tools reach a host: the library owns the rules (JPG or PNG, 2 MB, a
  2000 px longest edge, downscaled rather than refused) and names each refusal with a catalog code,
  and the host owns the bytes. The drawing classes, the model store and the mutable registry are
  not on the subpath, and a host-authored tool has no registration door.
- **Light and dark modes over a semantic theme.** `THEME_ROLES` publishes the semantic role
  inventory the chart is painted from, and both built-in palettes give every role a value.
  **`createThemeController`** owns one chart's mode and its custom palettes: `setMode`,
  `applyCustom`, `resetCustom`, `get`, `diagnostics` and an `onChange` subscription that returns its
  own unsubscribe. A change resolves a complete theme and reaches subscribers once, and the chart
  keeps its symbol, timeframe, range, drawings and studies across a mode switch. `CustomThemes`
  carries a partial palette for either mode, so a role you do not name keeps its built-in value; a
  value that is not valid for its role is reported through `diagnostics()` and the built-in value
  stands. **`quickcharts/styles.css`** is the one stylesheet a consumer imports. It is scoped to the
  chart's own root element, applies no reset to the host document, downloads no font, and fetches
  nothing at runtime, so two charts on one page can run different modes. Chart appearance in
  `ChartOverrides.appearance` remains the separate, more specific ladder and wins where both could
  reach the same pixel.
- **The built-in indicators.** **`BUILT_IN_INDICATORS`** lists the 23 built-in definitions in
  picker order: SMA, EMA, HMA, VWMA, Bollinger Bands, Donchian Channels, Keltner Channels,
  Supertrend, Parabolic SAR, RSI, MACD, Stochastic, Stochastic RSI, ADX, ATR, CCI, Williams %R,
  Rate of Change, Momentum, Volume, VWAP, On-Balance Volume, and Money Flow Index. Each is a plain
  `IndicatorDefinition` (the `BuiltInIndicator` type) with its `id`, `tag`, `category`, `nameKey`
  and `descriptionKey`, and its `plotTitles` and `inputTitles`; the names and descriptions are
  part of the package catalog in every built-in locale. A manifest plot can declare
  `scale: 'volume'` to ride the chart's volume band, and a fill whose `between` names two levels
  shades between those limit lines. The package bundles its drawing and indicator source into the
  one artifact: `lightweight-charts` is its only peer and it declares no dependencies.
- **Symbology and one price formatter.** `ChartDatafeed.resolve` answers with **`SymbolInfo`**:
  identity, venue and type, `supportedResolutions` (an empty list declares no restriction), the
  exchange session triple, `dataStatus`, currency or unit, `volumePrecision`, and the
  price-format facts in `format`. `PriceFormat` carries the five facts that decide how a
  market's prices are written (`pricescale`, `minmov`, `minmove2`, `fractional`,
  `variableTickSize`), and **`createPriceFormatter`** turns them into a `PriceFormatter` whose
  `format` and `parse` are exact inverses. It covers decimal, pip, fractional,
  fraction-of-a-fraction and variable-tick markets, and takes precision from the symbol rather than
  from the size of the price. The widget writes every price through it: the price scale, the
  crosshair and last-price labels, legend chips, the level menu, drawing labels, study scales, and
  the extension seam's `formatter()`. Punctuation is a `.` decimal sign and no grouping unless a
  `locale` or an explicit `numericPunctuation` says otherwise. New exports **`parseTickBands`**,
  **`tickBandFor`**, and the `DataStatus` and `TickBand` types. **`udfSymbolInfo`** and
  **`udfPriceFormat`** map a UDF `/symbols` answer to those facts without collapsing them to one
  floating tick; `createUdfDatafeed` resolves through them.
- **The datafeed serves the chart and nothing else.** `ChartDatafeed` is search, resolve, history,
  live bars, the server clock and the capability declaration. It carries no quote board and no
  top-of-book: a host fans quotes to its own consumers from its own source.
- **The level menu is chart-only.** `chartContextMenu` offers reset, copy price, paste, the remove
  rows and settings; a host contributes an alert or order row for the level through the extension
  seam.
- **A revisioned contract for saved resources.** `ChartSaveLoadAdapter` is four `ResourceStore`
  families (`charts`, `layouts`, `drawings(scope)`, `templates(kind)`) over one shape: stable
  ids, opaque revision tokens in `ResourceRef` (every listing row carries its ref), conditional
  `update` and `remove`, and typed `conflict` and `not-found` outcomes in `WriteOutcome`. A
  successful write returns the revision the store now holds. Every call accepts an `AbortSignal`
  and rejects with an error named `AbortError` when that signal is already aborted.
  **`memorySaveLoadAdapter`** is the in-memory implementation of the whole adapter, for tests,
  server rendering and ephemeral embeds. The widget runs over it: `ChartWidgetOptions.saveLoad`
  takes the adapter, **`widget.saveLoad`** holds the open saved chart (`current`, `save`,
  `load`, `remove`, `detach`; `serialize` and `restore` stay), a save updates at the revision
  the chart was opened at or creates for a copy, and a refusal is a `ResourceSaveOutcome` carrying
  the catalog's sentence. The drawing layer persists each symbol's drawings through the drawings
  family and reports a refused write through **`events.onSaveConflict`**. A layout saves itself
  through **`layout.saveLoad`** over the layouts family. `ChartStorage` is the separate flat
  preferences port, in memory by default; a host that wants a device-local store writes one.
- **The extension seam.** `ChartWidgetOptions.extensions` attaches host code that draws on the
  chart through capability handles (price lines, a primitive mount, coordinate conversions, the
  pan and zoom lock), hears symbol, timeframe, bar, replay, theme and pane changes, reads the
  feed status, contributes level-menu rows and commands, and stores viewer state under its own id
  in the chart's save blob. The chart takes back everything an extension drew at detach.
- **The layout names its active symbol.** `ChartLayoutApi.activeSymbol()` and the
  `onActiveSymbol` event report the active pane's symbol every time it moves.
- **Interface language.** New **`locale`** option on `createChart` and on a layout's `base`, one
  of the 21 codes in the package's own `BUILT_IN_LOCALES` inventory, English by
  default. The widget's own chrome reads it and the chart's axis and crosshair dates are formatted
  in it. **`setLocale(code)`** on a widget and on a layout switches at runtime; **`locale()`**
  reports the current code. Every chrome module speaks it: the legend, the drawing rail (the 90
  tool names by registry `type`), the context menu (an open menu relabels in place), the replay
  bar, the inputs editor, and the session status words. What the datafeed says, and every symbol,
  price and id, passes through untranslated. The catalog ships a directory for every built-in
  language; a key without a translation reads English.
  Hosts composing the chrome modules themselves pass a `ChartI18n` (from `createChartI18n(code)`)
  as a new OPTIONAL trailing parameter or option — `mountDrawingsRail`, `mountReplayBar`,
  `mountContextMenu`, `openInputsEditor`; `t` on `ChartMenuContext`; a BCP 47 `tag` on
  `sessionTimeline` — every existing call compiles unchanged and reads English. New exports `toolName(t, type, fallback)` and
  `arrangementName(t, code, fallback)` give a host the widget's word for a drawing tool or a
  multi-chart arrangement; `Arrangement` gains `label` (the English fallback). Exports
  `createChartI18n` and `chartDictionaries`.

## 0.2.0 — 2026-08-14

- **Fix:** `createChart` no longer crashes at mount when the datafeed declares no `config()` (the
  synchronous first load reached a replay helper before its initializer ran).

## 0.1.0 — 2026-08-06

Initial release. The datafeed-driven chart widget: candles + volume, the indicator
pipeline (manifest + injected compute; panes, histograms, areas, markers, levels, band fills),
drawings with per-symbol persistence and a built-in rail, bar replay with sub-bar forming,
session bands, scale modes, and the legend chrome (scale chips, per-chip settings gear, pane
collapse/maximize/restore, eyes). ESM-only; `createUdfDatafeed` on-ramp included.
