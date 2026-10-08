# @trdrs/quickcharts

## Unreleased

Every text field, select, number field and color well in the chart's dialogs and settings is one box: 34px tall with an 8px corner and a 1px edge in the `control.fieldEdge` role, which steps to `control.fieldEdgeHover` under the pointer, a 2px focus ring in `state.focusRing` drawn over the edge, an edge and ring in `control.fieldInvalid` for a value the field refuses, and a `control.fieldFill` ground when the field is read-only or disabled; a select ends in an 18px chevron, and both built-in palettes carry the four new roles.

The built-in palettes retune their dialog and status colors: the veil behind a light modal is `rgba(156, 156, 156, 0.5)`, a select's chevron and a flyout's arrow read in `chrome.caret` (`#707070` light, `#8c8c8c` dark), the muted ink is `#6a6a6a` light and `#9b9b9b` dark, the status inks are `#078671`, `#df323f` and `#ac6600` in light and `#089981`, `#f34452` and `#ff9800` in dark, and `drawing.line` and `drawing.selected` are `#2962ff` in both modes. Every ink reads at the WCAG 2.2 AA ratio on each ground it is drawn over.

## 2.4.0

Bar replay that starts where the viewer chose, and a chart a host can hold in place, show without its price scale, give a crosshair of chosen parts, and morph between bar and close styles. No public name changes.

Bar replay starts where the viewer chose: a bar picked in view keeps its place as the bars after it leave the plot, and after a beat the view glides it to the replay's edge. A bar chosen out of view, from a date, comes to the edge at once.

`features.navigation` holds the view where the chart frames it. Off, no drag, flick, pinch or wheel moves the view, a scale takes no drag or double-tap, the zoom and scroll commands and their keys are unavailable, and the navigation cluster is not drawn, while `goLive`, `reset` and the crosshair still work. It is on unless the host turns it off.

`ui.priceScale` shows the price scale at the plot's right. Hidden, the bars span the chart's whole width, and the last price draws no line across the plot and no label. It is shown unless the host hides it.

`ui.crosshair` chooses what the crosshair draws: `false` draws neither its lines nor its labels, and a `CrosshairUi` object hides the horizontal line (`horizontal: false`) or the time and the price on the scales (`labels: false`), or draws the lines solid (`solid: true`). The crosshair still follows the pointer, and `sync.onCrosshair` still reports it.

`transitions.style` morphs a change between a style drawn from whole bars and one drawn from closes over half a second: each bar's open, high and low slide into its close as the line comes in through the closes, and back out of it as the line goes. It is off unless the host turns it on, and under a reduced-motion preference the change is made at once.

## 2.3.0

The symbol naming rule for hosts that name markets in views of their own. No public name changes.

`@trdrs/quickcharts/symbols` carries the symbol naming rule on its own, free of any DOM name: `symbolNames`, with its `SymbolNames` type, and `bareTicker`, so a view of the host's own with no DOM names a market as the chart's pill, legend and search rows do.

## 2.2.0

The way back to the live edge and the plot a host control floats over, touch that follows the hand, and the formatter, the glyph lists and the icon artwork for hosts that draw their own. No public name changes.

The return to the live edge glides: `goLive`, its command and `Alt+L` ease the view home sideways over about half a second, keeping the zoom and the price scale as they are. From far back the view steps in to a width and a half first, and a touch, a drag, a wheel or any other navigation stops it where it stands. Under a reduced-motion preference it goes in one step.

A chart reads whether its view sits back from the live edge: `awayFromLiveEdge()` and the `liveEdge` event, reported once per change, with a glide under way and bar replay reading as returned. `plotArea()` and the `plotArea` event give the main pane's plot in the pixels of the host's element, so a control floating over the bars stays beside the price scale as it widens.

Two fingers zoom proportionally: the bars spread exactly as far as the fingers do, and the point under the fingers stays under them as they travel. A pan one finger began before the second landed stays a pan, and a drawing that holds the pointer holds the pinch off.

`@trdrs/quickcharts/format` carries the price formatter and its types alone, with nothing that names a window, a document or a DOM type, so a native view or a server writes a price exactly as the chart's axis does.

A finger held on the plot scrubs the crosshair for as long as it stays down: the crosshair follows the finger, and lifting it takes the crosshair away, so the next one-finger drag pans the chart.

A flick of one finger coasts the chart calmly: the throw leaves the finger at no more than two pixels a millisecond and slows smoothly to rest within about a second, and a touch or any other navigation stops it where it stands.

`touch.freePan` makes the chart a canvas under the finger: a one-finger drag on the plot releases the main price scale's framing, as a drag on the price scale does, so the price follows the finger as freely as the time and nothing re-frames while the viewer pans, flicks or pinches, and a pinch zooms the time and leaves the price where it stands. A double-tap on the price scale, a new symbol or timeframe, and `goLive` frame the bars again. It is off unless the host turns it on.

`chartIconArtwork(id)` answers the chart's own drawings of an icon as standalone svg markup on `currentColor`, each on its own grid, so a host draws the same icons the chart does in a toolbar of its own or a native view. It answers the chart's artwork whatever `icons` draws instead; an illustration drawn in the theme's roles answers none.

`@trdrs/quickcharts/glyphs` carries the glyph picker's lists on their own, free of any DOM name: `EMOJI_CATEGORIES` and `ICON_CATEGORIES`, each category with the catalog key of its `heading`, and `isEmojiGlyph`, so a picker of the host's own offers the same glyphs and arms a glyph tool through `chart.drawings.arm` with `{ tool, props: { glyph } }`.

## 2.1.0

Long press for the crosshair, and emoji artwork that loads the first time the chart draws an emoji. No public name changes.

A finger held still on the plot is the crosshair's: the crosshair stands at the finger and follows it until the next tap, and the chart does not pan meanwhile. Held on a price scale or the time scale, it raises the chart's context menu, as a right-click does.

The bundled emoji artwork is a chunk of its own, which the chart imports the first time it draws an emoji, so a chart that never shows one never loads it, and the main bundle does not carry it. Until it arrives an emoji draws as text, then takes its artwork in place, in the glyph picker and on the chart. A chart given an `assets.glyphSource` never loads it.

## 2.0.1

Drawing by touch, and handles that stay on their drawings. No public name changes.

A finger draws, selects and moves drawings as surely as a pointer does. A touch takes a drawing it lands within a thumb's reach of and grabs a handle from a thumb's width away; a tap that wobbles stays a tap; a drawing a touch presses moves once the finger clearly sets off; the second touch of a placement brings its live point to the finger at once; and the crosshair stands on the point a finger places or drags, its lines and scale labels clear of the finger. A touch the drawing layer takes is claimed from the page's scroll as it begins, and a gesture the browser takes away ends where it stands. A mouse and a pen keep their behavior.

Every handle stands where its drawing paints what the handle moves, so none stays behind as the drawing's other handles move it: a long or short position's stop on the box's far edge beside the target, a flat top/bottom's flat side at that side's end, a fib wedge's third handle at the end of its second ray, and an ellipse's third handle on the ellipse at its centre.

## 2.0.0

A major version may rename or remove public names, and its upgrading guide lists each one, old to new, with how saved state carries over. 2.0 names everything a host writes against in the chart's own words: the stylesheet's cascade layers, the data source a symbol search row names, timeframe for every timeframe, indicator for every indicator, the drawing toolbar's models and the context menu's row builder. Saved state is read under the 2.0 names alone, and the guide lists what 1.x saved that opens at its default.

Every modal dialog opens and closes with the modal motion, as the symbol search and chart settings do: the indicator browser, the indicator settings, the saved-layouts browser, the name and confirm prompts, go to date, and every drawing dialog (drawing settings, the image picker and the template prompts) fade their backdrop in and fade and scale their box from `motion.scaleEnter` over `motion.durationBase`. A closing dialog stops taking input and returns focus at once, and under a reduced-motion preference it closes at once.

### Upgrading to 2.0

Declare the cascade layers under their 2.0 names in your first stylesheet, before any product stylesheet loads. Layers of your own product go between `quickcharts.chart` and `host`:

```css
@layer reset, quickcharts.tokens, quickcharts.chart, host;
```

Then replace each 1.x name with its 2.0 name:

| 1.x | 2.0 |
| --- | --- |
| cascade layer `trdrs.tokens` | `quickcharts.tokens` |
| cascade layer `trdrs.chart` | `quickcharts.chart` |
| `SymbolRow.provider` | `SymbolRow.dataSource` |
| `providerMark` on `ChartWidgetOptions` and `SymbolSearchOptions` | `dataSourceMark` |
| `ProviderMarkPainter`, called with `{ provider, host, size }` | `DataSourceMarkPainter`, called with `{ dataSource, host, size }` |
| `MarkPainters.provider`, which an extension reads as `ctx.painters.provider` | `MarkPainters.dataSource`, read as `ctx.painters.dataSource` |
| `LayoutSyncFlags.interval`, in `layout.sync`, `layoutSync`, `widget.layout.sync()`, `widget.layout.setSync` and the `widget.layout.setSync` command | `LayoutSyncFlags.timeframe` |
| `ChartReplayApi.interval()` | `ChartReplayApi.timeframe()` |
| `ChartReplayApi.setInterval(token)` | `ChartReplayApi.setTimeframe(token)` |
| `ChartReplayApi.resolvedInterval()` | `ChartReplayApi.resolvedTimeframe()` |
| `ChartReplayApi.subIntervals()` | `ChartReplayApi.subTimeframes()` |
| command `chart.replay.setInterval` | `chart.replay.setTimeframe` |
| `ChartPreferences.replayInterval` | `ChartPreferences.replayTimeframe` |
| `autoIntervalFor` | `autoTimeframeFor` |
| `subIntervalsFor` | `subTimeframesFor` |
| `IntervalVisibility` | `TimeframeVisibility` |
| `IntervalBucket` | `TimeframeBucket` |
| `IntervalContext` | `TimeframeContext` |
| `parseIntervalContext` | `parseTimeframeContext` |
| `IDrawing.setIntervalContext(context)` | `IDrawing.setTimeframeContext(context)` |
| `TemplateKind` `'study'` | `'indicator'` |
| `RestTemplateKind` `'study'` | `'indicator'` |
| REST paths `/templates/study` and `/templates/study/{id}` | `/templates/indicator` and `/templates/indicator/{id}` |
| `info.version` `1` in `dist/rest-openapi.json` | `2` |
| `data-role="legend-study-value"` on an indicator row's value | `data-role="legend-indicator-value"` |
| `RAIL_PLAN` | `DRAWING_TOOLBAR_PLAN` |
| `buildRailGroups` | `buildDrawingToolbarGroups` |
| `RailGroup` | `DrawingToolbarGroup` |
| `RailSection` | `DrawingToolbarSection` |
| `railFaceOf` | `drawingToolbarFaceOf` |
| `rememberRailTool` | `rememberDrawingToolbarTool` |
| `DrawingPreferences.railTools` | `DrawingPreferences.drawingToolbarTools` |
| `ChartExtensionMenuProvider`, which `contributeContextMenu` takes | `ChartExtensionMenuBuilder` |

A dictionary of your own (`ChartCustomLocale`, `ChartDictionary`) uses the 2.0 catalog keys and placeholders:

| 1.x | 2.0 |
| --- | --- |
| `layouts.syncInterval` | `layouts.syncTimeframe` |
| `layouts.syncIntervalTip` | `layouts.syncTimeframeTip` |
| `layouts.syncIntervalToggle` | `layouts.syncTimeframeToggle` |
| `replay.interval` | `replay.timeframe` |
| `replay.intervalHelp` | `replay.timeframeHelp` |
| `replay.intervalNone` | `replay.timeframeNone` |
| `replay.autoSelectInterval` | `replay.autoSelectTimeframe` |
| `command.replayInterval` | `command.replayTimeframe` |
| `drawing.visibilityOnIntervals` | `drawing.visibilityOnTimeframes` |
| `drawing.intervalPinnedNote` | `drawing.timeframePinnedNote` |
| `{interval}` in `range.tip` and `layouts.listingFacts` | `{timeframe}` |

Every English string about a timeframe says timeframe, and each language writes its own word for timeframe in the layout sync switch. `legend.showRows` and `legend.hideRows` read Show indicator rows and Hide indicator rows in every language, and the remove control on a comparison's legend row is named Remove comparison.

Delete `via` from the rows your feed's `search` returns. A row names the venue its market lists on in `exchange` and where its data comes from in `dataSource`, and its source cell shows the venue, or the data source for a row with no venue, each with the host's mark from `venueMark` or `dataSourceMark`.

A `layoutSync` list that names `interval` is a setup error from `createChart`; name `timeframe`.

Saved state is read under the 2.0 names alone. What 1.x saved under these names opens at its default:

- a saved layout's timeframe sync switch, saved as `sync.interval`: the value `layout.sync` gives it, else off;
- each drawing toolbar group's remembered tool, stored as `railTools` in the drawing preference record `quickcharts.drawingPrefs.v1`: the group's first tool;
- the replay update timeframe, stored under `quickcharts.replayIv.v1`: `preferences.replayTimeframe`, else `auto`.

2.0 stores the replay update timeframe under `quickcharts.replayTf.v1`. A `ChartStorage` that routes keys by name, to keep some per device for example, routes `quickcharts.replayTf.v1` where it routed `quickcharts.replayIv.v1`.

Hosts that keep templates by kind file them under `indicator`: the chart asks `templates('indicator')`, and the REST adapter asks `/templates/indicator`.

A `RecentsPort` of yours that stores rows stores `dataSource`, the field the source cell reads.

## 1.3.0

Hosts choose which chart styles, timeframes, layouts, drawing tools, built-in indicators, range presets and display timezones a chart offers, how the chart presents what the access policy refuses, and can open the timeframe list away from a chart. Every motion value is a theme role. Content already on a chart, or restored to it, stays when the access policy refuses creating it.

Every duration, timing function and motion scale is a theme role in the `motion` family, which a host's palette retunes and a reduced-motion preference resolves to no motion: `motion.durationModerate`, `motion.durationSlow`, `motion.durationSlower`, `motion.easingStandard`, `motion.easingOut`, `motion.easingLinear`, `motion.easingSpring` and `motion.scaleEnter` join `motion.durationFast` and `motion.durationBase`, and `ThemeRoleKind` includes `easing` and `scale`. A modal dialog fades its backdrop in and fades and scales its box from `motion.scaleEnter`, over `motion.durationBase`.

The symbol search offers its classes and spread operators as the host configures them: `search.spreads` switches spreads off or offers only the listed operators (`SpreadOperatorId`), `search.allClasses` hides or renames the All chip, and `search.classSelection: 'multiple'` lets the viewer select several classes, which the feed receives as `classes` (`DatafeedSearchOptions`). A feed's `config().classes` may declare a class with narrower classes (`SearchClassNode`), which the search offers in a second row of chips. `openSymbolSearch` and `mountSymbolSearch` take the same options.

Hosts choose which chart styles a chart offers with `styles`, in the order the style picker lists them; a style left out has no command, the picker is not shown for a single style, and a saved layout naming a style left out opens on the first offered one.

Hosts choose which timeframes a chart offers with `timeframes`, presets or other tokens, and can switch custom timeframes off with `customTimeframes: false`; a timeframe left out has no command and no chip or row in the picker, `setTimeframe` ignores it, the picker is not shown for a single timeframe, and a saved layout naming a timeframe left out opens on the smallest offered one.

Hosts choose which layouts a chart offers with `layouts`, a list of arrangement codes, and which sync switches the viewer may change with `layoutSync`; an arrangement left out has no tile and the setter ignores it, the layout setup menu is not shown when there is nothing to choose, a switch left out holds the host's `layout.sync` value, and a saved layout naming an arrangement left out opens on the offered one with the most charts not above its count while carrying the charts it does not show, so a re-save keeps them. `ui.topBar.layoutSetup` and `ui.topBar.savedLayouts` hide one of the two layout menus. Without a layouts store the saved-layouts menu is not shown, and Download chart data sits in the image menu.

A menu that has no rows to show (nothing to remove, no saved layouts, loading) states it at the rows' own size and inset, in the muted ink.

Hosts choose how the chart's own controls present what the access policy refuses with `access.refused`: `'disable'` (the default) draws it disabled as before, and `'hide'` leaves it out, so a refused drawing tool is not in the rail's flyouts, on the favorites bar or in the glyph picker, a refused indicator is not in the indicator browser, and a control or menu row whose command is refused is not drawn, with an emptied section, group or rule going too. A permitted command that cannot run now stays drawn and disabled, the controls follow a policy that changes, nothing stored (favorites, drawings, indicators) is rewritten, and every other door refuses as before. Any other value is a setup error from `createChart`.

Hosts choose which drawing tools a chart offers with `drawingTools`, a list of tool types; a tool left out is not in the rail's flyouts, on a group's face, on the favorites bar, on the rail (measure, zoom) or among the glyph picker's kinds, with an emptied section or group going too, and arming it or copying a drawing of it (clone, paste, a modifier-drag duplicate) is refused from every door. Drawings of it already on the chart render and stay fully editable and deletable, the eraser is always offered, a listed tool the access policy refuses follows `access.refused`, and nothing stored (favorites, a group's remembered face) is rewritten. An empty list, an unknown type and a repeated type are setup errors from `createChart`. The drawing layer takes `copies` to refuse a copy by type.

Hosts tell a chart that the access policy answers differently with `widget.refreshAccess()`: every control, rail tool and group, the favorites bar, the glyph picker, the legend's row controls and every open menu, flyout and dialog (the indicator browser among them) read the policy again at once, `commands.onChange` listeners hear it, and nothing stored or on the chart changes.

The public `placeImage` on a chart's drawings asks the access policy for the `image` tool, as arming it and `chart.drawings.placeImage` do; it placed an image the policy refused.

Hosts choose which built-in indicators a chart offers with `builtInIndicators`, a list of built-in definition ids; one left out is not in the indicator browser (built-ins, favorites, search results), the host's picker listing is handed only the offered ids, and adding one is refused from every door (`chart.indicators.add` answers `denied`, `indicators.add` and `indicators.set` add none, a re-tiled pane copies the first chart's studies without it). Instances of it already on the chart render and stay fully editable and removable, a host's own definitions and picker content are never filtered, a listed built-in the access policy refuses follows `access.refused`, and nothing saved is rewritten. A non-list, an empty list, an unknown id, a repeated id and an `indicators` instance whose built-in is not listed are setup errors from `createChart`.

Content already on a chart is never dropped by the access policy, which refuses only creating new content: an indicator whose definition `access.indicator` refuses stays when `indicators.set` or `chart.indicators.update` edits it or any other study (an edit that would move one onto a refused definition leaves it as it stands, and a new instance is still left out), where both dropped it. A drawing whose tool `access.drawingTool` refuses is not cloned, pasted or duplicated by a modifier-drag, as a tool `drawingTools` leaves out is not, and it still selects, edits and deletes as before.

A restore keeps the studies the access policy refuses: loading a saved chart or a layout, an undo and a redo put back an indicator whose definition `access.indicator` refuses like any other, where they left it out (so a load followed by a save rewrote the viewer's content without it). The policy refuses adding, never restoring, and the restored study renders and stays editable and removable. Drawings of a tool `access.drawingTool` refuses or `drawingTools` leaves out, and built-ins `builtInIndicators` leaves out, already restored whole.

Hosts choose which range presets the bottom bar offers with `ranges`, a list of preset keys in the order the bar draws them; a preset left out has no command and no button and `chart.range.set` ignores its key, and an empty list offers no range buttons while the clock, timezone picker and session view stay. A non-list, an unknown key and a repeated key are setup errors from `createChart`.

Hosts choose which display timezones a chart offers with `timezones`, zone ids and `exchange`; a choice left out has no command and no row in the timezone picker, `chart.timezone.set` and `setTimezone` ignore it, the picker is not shown for a single choice (the clock still reads that zone), and a stored or preferred choice left out opens on the first listed one without being rewritten. The exported `TIMEZONES`, `isTimezoneChoice` and `timezoneListing` are not filtered. A non-list, an empty list, an unknown id and a repeated id are setup errors from `createChart`.

Hosts open the chart's own timeframe list away from a chart with `openTimeframePicker`, a drop-down under a control the page owns, and `mountTimeframePicker`, a card in a box the page owns (`TimeframePickerOptions`, `TimeframePickerHandle`, `MountedTimeframePicker`). Both draw the same unit groups, rows and custom composer as the chart's picker, take `timeframe`, `timeframes` and `customTimeframes` with the setup errors `createChart` throws, leave out a row `resolutions` or `supportedResolutions` does not serve, paint their own theme root from `theme`, `locale` and `icons`, and hand the chosen token to `onPick`. They carry no saved chips or stars and keep nothing.

## 1.2.0

Hosts can supply scoped legend rows and open a named indicator collection. Chart dialogs and replay controls animate their opening and closing.

## 1.1.0

The symbol search can name what it is limited to, with a host-painted mark, beside the asset-class filters (`search.scope`, `SearchScope`).

## 1.0.1

Emoji drawings and the picker use bundled Twemoji artwork without a host asset server.
Hosts may supply an image intake port while keeping the bundled emoji artwork.

## 1.0.0

- A complete browser chart over host-supplied market data and storage, with seven chart styles,
  23 built-in indicators, 90 drawings, comparison series, 55 layouts and data replay.
- Typed chart, drawing and persistence APIs with TypeScript declarations and ESM exports.
- Default chart controls, independent control visibility, custom icon factories, toolbar slots
  and themed host controls over the same chart commands.
- Root-scoped styling with light and dark palettes, typed themes and documented styling hooks.
- Multi-asset price formatting, sessions, timezones, symbol search and 21 interface languages.
- Chart image export, fullscreen, keyboard commands and saved layouts.
- Public entries: `@trdrs/quickcharts`, `@trdrs/quickcharts/drawings`, `@trdrs/quickcharts/adapters/rest` and
  `@trdrs/quickcharts/styles.css`. The required renderer is resolved automatically by supported npm
  versions when installing `@trdrs/quickcharts` with default peer resolution.
- Apache-2.0 license and third-party notices accompany the package.
