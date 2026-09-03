# quickcharts

## Unreleased

- **The complete drawing product ships in the widget.** The drawing toolbar is the rail down the
  chart's leading edge: the cursor with its cross, dot and arrow modes and the eraser; seven tool
  groups whose flyouts list every one of the 90 tools by section, each row with a star for the
  favorites bar; Measure and Zoom; the magnet with its weak and strong strengths; stay in drawing
  mode; lock all; the eye that hides drawings, indicators, or both; drawing sync in a layout; the
  remove menu that names what each row takes and carries the locked-item policy; and the favorites
  star. Every tool places: fixed-anchor tools by press-drag-release or click then click, the
  position tools whole from one press, the multipoint tools point by point until a double-click,
  the brushes as a stroke, and the text-bearing tools with the inline editor opening as they land.
  Shift constrains, Ctrl-drag duplicates, and the magnet pulls placed and dragged anchors onto the
  bar's own values.
  Every control on the toolbar, the settings bar and the dialog is a command through the registry
  and renders disabled, never hidden, while the registry would not run it; every flyout, palette
  and dialog sits inside the chart root and closes with it.
- **The selected drawing has a settings bar and a settings dialog.** The bar floats over the chart
  with templates, the stroke color and opacity, the background, the text color and font size,
  thickness and line style, the settings gear, lock, delete, and a More menu with the stacking
  moves, the per-interval visibility presets, clone, copy and hide. The dialog has Inputs, Style,
  Text, Table, Coordinates and Visibility pages as the tool has them; edits apply live, Cancel
  restores the drawing, Ok commits the session as one edit. Every edit becomes the tool's
  remembered default, and named templates save and apply from either surface. Both persist
  through `ChartSaveLoadAdapter.templates('drawing')`.
- **`FeatureConfig` names the drawing surfaces.** `drawingsToolbar` shows the toolbar and
  `drawingsFavorites` the favorites bar; both are on by default and absent with `drawings` off.
- **`ChartDrawingsApi` is the whole selection surface.** `armTool(type, props)` arms any registered
  tool or one of `measure`, `zoom` and `eraser`, seeding a placement with `props`; `select`,
  `deselect`, `selected`, `selectedDrawing` and `hovered` read the selection; `updateStyle`,
  `updateProps`, `setLocked`, `commitEdit`, `clone`, `copy`, `paste`, `canPaste`, the four
  stacking moves, `stackPosition`, `hideSelected`, `setVisibilityPreset` and `placeImage` edit it;
  `counts`, `setAllHidden`, `allHidden`, `setAllLocked` and `allLocked` are the layer's own
  switches; `textEdit`, `editSelectedText`, `commitText` and `cancelText` drive the inline editor;
  and `presets` reads and writes tool defaults and named templates. `placeableByWidget` answers
  true for every registered tool and the three transient tools. The root also exports the
  `DrawingPresets`, `PlacedImage`, `SelectedDrawing` and `TextEditSession` types.
- **`attachDrawings` takes `templates`, `chartId` and `execute`.** `templates` is the adapter's
  drawing-template store; `chartId` binds a drawing made while sync is off to one chart through the
  resource contract's chart-bound scope; `execute` is the door the layer's keyboard verbs run
  through, which a widget points at its command registry. `DrawingsWorkflow.allLocked` is optional
  and `syncAcrossPanes` joins it. A refused document write merges the stored document over the
  layer's own rows and writes once more at the ref that stands.
- **The `chart.drawings.*` commands cover the whole toolbar and selection.** `cursor`, `magnet`,
  `stayInMode`, `lockAll`, `hide`, `sync`, `removeLockedPolicy`, `favorite` and `favoritesBar` for
  the toolbar; `style`, `props`, `lock`, `clone`, `copy` (Ctrl+C), `paste` (Ctrl+V),
  `bringToFront`, `sendToBack`, `bringForward`, `sendBackward`, `hideSelected`, `visibility`,
  `settings`, `commitEdit`, `template.apply`, `template.save`, `template.remove`, `tableAddRow`
  and `tableAddColumn` for the selection. `removeAll` takes the locked-item policy as its argument
  and `arm` takes a tool id or `{ tool, props }`. The layer's Delete, Backspace, Escape, copy and
  paste keys run through the registry, so the access policy gates them like every other door.
- **`DrawingPreferences` carries `settingsBarPosition` and `recentGlyphs`.** Where the settings bar
  was dragged to, and the glyph picker's recent picks, both parsed tolerantly.
- **The chart catalog owns the whole drawing vocabulary.** The `drawing.*` namespace names the
  toolbar, the settings bar and dialog with every property row, the color palette, the glyph
  picker, the image picker, the template dialogs and the inline editor; `command.drawing*` names
  the new commands. The `rail.*` namespace is gone with the rail it named.

- **`quickcharts/styles.css` is required for LAYOUT, not only for color.** The chart's structural
  rules — the root filling its container, the charts tiling inside it, the plot area and its chrome
  layer sizing from that — live in the stylesheet with everything else it paints, so a host that
  does not import it gets a root with no height and a chart that paints nothing. Nothing is written
  from JavaScript but calculated geometry.
- **`createChart` answers a `ChartWidget`.** A widget hosts one or many charts under one root, one
  theme, one language and one command registry. `ready()` settles when the first data has painted,
  `activeChart()` is the chart the viewer last pointed at, `charts()` lists them all, `chart(id)`
  finds one, and `dispose()` takes everything down and leaves every handle and subscription inert.
  A widget always HAS a layout, reached as **`widget.layout`** (`arrangement`, `setArrangement`,
  `active`, `setActive`, `sync`, `setSync`, `serialize`, `restore`, `saveLoad`), which is what lets
  `charts()` and `activeChart()` mean the same thing at every arrangement.
- **One chart is a `ChartHandle`.** `symbol`, `timeframe`, `style`, `scaleMode` and `timezone` with
  their setters; `visibleRange`, `logicalRange`, `scroll`, `zoom`, `reset` and `goLive` for where it
  is looking; `indicators` (`get`, `set`, `add`, `remove`, `hide`, `show`, `hidden`), `drawings`,
  `compare`, `replay`, `saveLoad` and `sync`; `appearance()` and `applyAppearance()` for the
  per-chart look; `formatter()` for the one price formatter every surface writes through.
- **Seven main-series styles.** `candles`, `hollow`, `bars`, `line`, `area`, `baseline` and
  `stepline`, listed in picker order as **`CHART_STYLES`**, with **`valueShaped`**, **`isChartStyle`**
  and **`coerceChartStyle`** beside them. A style switch is presentation: nothing refetches, and the
  loaded bars, indicators, drawings, comparisons, scale and visible range all survive it.
- **One command registry.** **`CommandRegistry`** on the widget is the only place a chart verb
  exists: `register`, `list`, `available`, `execute`, `setShortcut`, `onChange`. Every built-in verb
  is registered with a catalog label and a live availability read, and an extension's
  `contributeCommands` registers through the same door with `scope: 'chart'`. A command your feature
  configuration hides or your access policy refuses answers `denied` from every surface, because
  there is no second path to reach it. A refusal is a `CommandResult` value (`ok`, `unavailable`,
  `denied`, `unknown`, `failed`), never a throw.
- **Typed event maps.** **`WidgetEvents`** (`ready`, `activeChart`, `theme`, `locale`, `saveNeeded`,
  `saveConflict`, `fullscreen`, `dispose`) and **`ChartEvents`** (`symbol`, `timeframe`, `style`,
  `visibleRange`, `logicalRange`, `dataLoaded`, `feedStatus`, `scaleMode`, `timezone`, `indicator`,
  `drawing`, `replay`, `compare`), subscribed with `on(name, callback)`. Every subscription answers
  its own unsubscribe and is inert after `dispose()`.
- **Four configuration planes.** **`Capabilities`** is derived from the ports, the resolved symbol
  and the browser and is never set. **`FeatureConfig`** says which built-in UI and behavior is
  present, every flag defaulting on. **`AccessPolicy`** says which commands, drawing tools and
  indicators are permitted, asked live. **`ChartPreferences`** seeds what the storage port persists
  for the viewer. A hidden control is not authorization, and an absent port is not a preference.
- **Chart-root fullscreen and client image capture.** `widget.fullscreen` is `enter`, `exit`,
  `toggle` and `active` over the widget's own element, reported by the `fullscreen` event; it never
  takes over the host application's shell. `widget.image` is `capture`, `download` and `copy`,
  composing the chart or every chart of a layout into one PNG under a header carrying the identity
  and the attribution `ChartWidgetOptions.image` configures. **`composeImage`**, **`canvasToBlob`**,
  **`imageFileName`**, **`imageHeaderRuns`**, **`imageLayoutHeaderRuns`**, **`imageTileRuns`** and
  **`IMAGE_HEADER_H`** are exported for a host composing its own bitmaps.
- **Neutral marks.** `ChartDatafeed.marks` and `ChartDatafeed.timescaleMarks` are two optional
  readers over a window. A **`BarMark`** or **`TimescaleMark`** names a moment, a **`MarkColorRole`**
  the mode resolves, and the host's own words; the chart draws it and neither interprets nor acts on
  it. `marks: false` draws none.
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
  subsessions in the session grammar, and `sessionStateAt`, `marketStatus`, `marketStatusFor`,
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
- **Glyph artwork is a port, not a process-wide hook.** `DrawingManager.setGlyphSource` and
  `IDrawing.setGlyphSource` take a `GlyphSourcePort` per instance, beside the price formatter and
  the tick, so two charts in one document can draw different asset sets. `attachDrawings` takes it
  as `glyphSource`.
- **The drawing layer consults a workflow.** `AttachDrawingsOptions.workflow` is a live getter for
  the standing choices the layer acts on: the magnet strength an anchor snaps with, the lock-all
  mode that suspends editing without touching any drawing's own flag, whether a placed tool stays
  armed, and the pointer glyph. The layer holds no copy, and the models on `quickcharts/drawings`
  decide what each control does to them.
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
  takes the adapter, **`chart.saveLoad`** holds the open saved chart (`current`, `save`,
  `load`, `remove`, `detach`; `serialize` and `restore` stay), a save updates at the revision
  the chart was opened at or creates for a copy, and a refusal is a `ResourceSaveOutcome` carrying
  the catalog's sentence. The drawing layer persists each symbol's drawings through the drawings
  family and reports a refused write through the widget's **`saveConflict`** event. A layout saves
  itself through **`widget.layout.saveLoad`** over the layouts family. `ChartStorage` is the separate
  flat preferences port, in memory by default; a host that wants a device-local store writes one.
- **The extension seam.** `ChartWidgetOptions.extensions` attaches host code that draws on the
  chart through capability handles (price lines, a primitive mount, coordinate conversions, the
  pan and zoom lock), hears symbol, timeframe, bar, replay, theme and pane changes, reads the
  feed status, contributes level-menu rows and commands, and stores viewer state under its own id
  in the chart's save blob. Its `theme()` answers a **`CanvasTheme`**, the projection of the
  resolved semantic theme onto the values a canvas draws with; **`canvasTheme`** is exported for a
  host that composes the same projection itself. The chart takes back everything an extension drew
  at detach.
- **The layout names the chart it is pointed at.** The `activeChart` event reports the active
  chart every time it moves: another chart activated, the active chart's symbol changed, a re-tile,
  a restore.
- **Interface language.** New **`locale`** option on `createChart` and on a layout's `base`, one
  of the 21 codes in the package's own `BUILT_IN_LOCALES` inventory, English by
  default. The widget's own chrome reads it and the chart's axis and crosshair dates are formatted
  in it. **`setLocale(code)`** on a widget and on a layout switches at runtime; **`locale()`**
  reports the current code. Every chrome module speaks it: the legend, the drawing toolbar (the 90
  tool names by registry `type`), the context menu (an open menu relabels in place), the replay
  bar, the inputs editor, and the session status words. What the datafeed says, and every symbol,
  price and id, passes through untranslated. The catalog ships a directory for every built-in
  language; a key without a translation reads English.
  Hosts composing the chrome modules themselves pass a `ChartI18n` (from `createChartI18n(code)`)
  as a new OPTIONAL trailing parameter or option — `mountReplayBar`,
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
drawings with per-symbol persistence and a built-in toolbar, bar replay with sub-bar forming,
session bands, scale modes, and the legend chrome (scale chips, per-chip settings gear, pane
collapse/maximize/restore, eyes). ESM-only; `createUdfDatafeed` on-ramp included.
