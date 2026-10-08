# @trdrs/quickcharts

## Unreleased

Every text field, select, number field and color well in the chart's dialogs and settings is one box: 34px tall with an 8px corner and a 1px edge in the `control.fieldEdge` role, which steps to `control.fieldEdgeHover` under the pointer, a 2px focus ring in `state.focusRing` drawn over the edge, an edge and ring in `control.fieldInvalid` for a value the field refuses, and a `control.fieldFill` ground when the field is read-only or disabled; a select ends in an 18px chevron, and both built-in palettes carry the four new roles.

The built-in palettes retune their dialog and status colors: the veil behind a light modal is `rgba(156, 156, 156, 0.5)`, a select's chevron and a flyout's arrow read in `chrome.caret` (`#707070` light, `#8c8c8c` dark), the muted ink is `#6a6a6a` light and `#9b9b9b` dark, the status inks are `#078671`, `#df323f` and `#ac6600` in light and `#089981`, `#f34452` and `#ff9800` in dark, and `drawing.line` and `drawing.selected` are `#2962ff` in both modes. Every ink reads at the WCAG 2.2 AA ratio on each ground it is drawn over.

The drawing settings dialog is a card at least 380px wide under a 68px header that carries the drawing's name at 20px, a pencil that renames it in place, and the close; a page strip of 16px tabs over a 4px track, the shown page carried by a bar that slides to the next; a two-column page whose labels share one column and whose rows stand 50px; list buttons that open their choices under them, several at once where a row takes several; and a footer with the Template list button, Cancel and Ok. `DrawingOptions.name` holds the name a viewer gives a drawing, saved with it, and a drawing without one is called by its tool's name.

A color in the drawing settings dialog opens one popover directly under its button, past the dialog's edge where it needs to: the offered colors on a ten-wide grid (the greys and ten hues, then six ramps of them), the colors the viewer added after a rule with the plus that adds one, the opacity as a track and a percent field, and for a stroke the Thickness and Line style rows as joined segments. Every choice applies to the drawing at once and the popover stays up for the next one, while Cancel still puts back everything from before the dialog opened. The plus opens a custom color editor with a hex field that takes three or six digits, a saturation and brightness area and a hue strip; a color added there joins the viewer's own colors, kept with the drawing preferences in `ChartStorage`, and is chosen. The arrows move over the grid and the rows, Enter or Space chooses, Tab stays in the popover, and Escape returns to the button. The line-end list is as wide as its rows, and both line-end marks are the chart's own drawing.

A drawing's settings dialog follows the pointer while its header is held, over the dialog as well as beside it, and lets go on the release wherever it lands, on a cancelled press, or when the window loses focus.

The line, shape and curve tools open with their factory looks: the line tools in `#2962ff` at 2px with 14px words (12px for a trend angle and the horizontal lines), and each shape and curve in its own hue at 2px with a background of that hue at a fifth, switched off on a curve. Their settings pages carry the rows their kinds offer: a line's ends, extensions, middle point, price labels and stats under Info, with `showPipsChange` counting the change in the symbol's smallest price move, `statsPosition` taking `auto`, and `alwaysShowStats` keeping them on screen when the line is not selected, since they otherwise show only while it is; a level's price label and a time line's time label; a rectangle's middle line in a stroke of its own; a shape's background switched by `fillBackground`; a curve's ends and its extensions along its end tangents; and a Text page whose words stand where `textVAlign` and `textHAlign` put them, with `textOrientation` turning a vertical line's words to run up it. `NO_COORDINATES_TAB` and `PRICE_ONLY_COORDS` join the settings capabilities, and the `bold` and `italic` icons draw the Text page's weight and slant toggles.

A Fibonacci retracement, a trend-based extension and a fib channel open on twenty-four levels, the eleven classic ratios shown and thirteen more to switch on, each in its own color, drawn at 2px with 12px labels over bands at a fifth; a retracement and an extension draw their trend line dashed in grey. Their Style pages carry the trend line, the levels' thickness and style, the extensions, the level grid two to a line, one color for every level, the bands' switch and opacity, Reverse, Prices, the labels' reading and place, the levels' own words and their place, the labels' size, and log price levels: `trendLine`, `trendLineColor`, `trendLineWidth`, `trendLineStyle`, `fillBackground`, `backgroundOpacity`, `coeffsAsPercents`, `labelsHAlign`, `labelsVAlign`, `showText`, `textHAlign`, `textVAlign` and `levelsOnLogScale`, with `Viewport.logScale` saying whether the price scale is logarithmic. A fib saved with its earlier `background` switch keeps its setting as `fillBackground`. A number field's stepper keeps every digit the value carries.

A fib time zone, a trend-based fib time, fib circles, speed resistance arcs, a fib wedge and a pitchfan open on their own levels, each in its own color and stroke, and their Style pages stand the levels one to a line, each level's switch, value and stroke (`FibLevel.width` and `FibLevel.style`), under the trend line or the median and over the one color, the bands' switch and opacity, and the rows of their own: a time zone's and a trend-based time's Labels and where they stand, a circle fib's Levels and Coeffs as percents, an arc fib's Levels and Full circles, and a wedge's Levels. A wedge has no Coordinates page. A speed resistance fan and a gann box divide their box on seven price and seven time divisions, `priceLevels` and `timeLevels`, each side under its section with its labels' switches; a fan adds its bands, a grid in a stroke of its own and Reverse, and a gann box its price and time bands on their own switches and opacities, its angles in a color of their own, and Reverse. A fan saved with one set of levels reads them as its price divisions and a gann box as both its price and its time divisions, and the settings bar's stroke color recolors every set of levels a tool holds.

The four pitchforks open on nine line pairs, the half in `#089981` and the tines in `#2962ff` shown and seven more to switch on, each pair in its own color at 2px, with a red median and bands at a fifth. Their Style pages carry Extend lines, the median's stroke (`medianColor`, `medianWidth`, `medianStyle`), the pairs one to a line with each pair's switch, value and stroke, the one color, the bands' switch and opacity (`fillBackground`, `backgroundOpacity`) and the construction in a Style list that switches it in place. A fork saved with its earlier `background` switch keeps its setting as `fillBackground`.

A fib spiral opens in `#00bcd4` at 2px, and its Style page carries its line and Counterclockwise, `counterclockwise` winding it the other way about its first point.

A gann square and a gann square fixed open on six grid lines, eleven fan lines (2x1, 1x1 and 1x2 shown) and eleven arcs, each in its own color at 2px over bands at a fifth, and their Style pages set the Levels, Fans and Arcs two to a line, each its switch with its place or its ratio and its stroke, then the one color, the bands' switch and opacity, and Reverse: `levels`, `fans` and `arcs` hold the lines, with `fillBackground`, `backgroundOpacity` and `reverse`. A gann square holds its second corner at `scaleRatio` price per bar, taken from the pane when it is first drawn, which its Price/bar ratio field shows and sets, and reads its ranges and ratio under it while `showLabels` is on, in the size, weight and slant its Ranges and ratio row sets. A gann fan opens on nine rays, 1/8 to 8/1, each in its own color and stroke over bands at a fifth, its page a line for each ray named by its ratio, the one color, the bands and Labels. A square or a fan saved with its earlier `background` switch keeps its setting as `fillBackground`, a square saved with its earlier levels opens on its factory lines, and the settings bar's stroke color recolors a square's fans and arcs with its grid.

A regression trend fits through any of nine sources (`BAR_PRICE_SOURCES`: open, high, low, close, volume, `hl2`, `hlc3`, `ohlc4`, `hlcc4`), opens with its line dashed red at 1px and its bands blue at 2px two deviations either side, and its pages carry Upper Deviation, Lower Deviation (counted down from the line, so a saved trend's lower deviation reads as its negative), their switches and the source on Inputs, and the line's and bands' switches and strokes, Extend lines and Pearson's R on Style: `baseLine`, `baseColor`, `baseWidth`, `baseStyle`, the same for `up` and `down`, `extendLines` and `showPearsons`. A parallel channel opens on seven levels, 0 and 1 shown at 2px and the half dashed at 1px, each in its own stroke, its page carrying them one to a line with the extensions and the background, and its Coordinates page its parallel's Price offset. A flat top/bottom and a disjoint channel open in `#ff9800` and `#089981` with no Coordinates page, their pages carrying the line and its ends, the extensions, the sides' prices in a text style of their own (`showPrices`, `pricesColor`, `pricesFontSize`, `pricesBold`, `pricesItalic`) and the background. Every channel opens with its body at a fifth and 14px words, and stands them above, inside or below it.

The six chart patterns open in their factory looks: an XABCD and a cypher pattern in `#2962ff`, an ABCD and a head and shoulders in `#089981`, a three drives and a triangle pattern in `#673ab7`, each at 2px with white 12px letters, the shaded ones shading their legs in their hue at fifteen percent. Their Style pages carry a Label row (the letters' color, size, weight and slant), the border, and for the shaded ones the background, switched by `fillBackground`; a pattern carries no words of its own and has no Text page, and a pill grows with its letters. A three drives pattern stands on seven points, the reversal after its third drive the last, and one saved on six completes with it.

The five Elliott wave counts open in their colors at 2px (an impulse and a correction in `#3d85c6`, a triangle in `#ff9800`, the combos in `#6aa84f`), and their Style pages carry the wave's color, the wave's switch and thickness (`showWave`) and the count's degree (`degree`, one of fifteen from supermillennium to minuscule), which writes each label ringed, in parentheses or bare, in roman numerals or figures, and in capitals or small letters. The labels take the wave's color, and `LABELED_PATTERNS` lists the six chart patterns alone.

Cyclic lines open in `#80ccdb` and the sine line and time cycles in `#159980`, each at 2px, the cyclic lines' and the sine line's Style pages naming their stroke Lines; a time cycle shades its humps in `#6aa84f` at half, switched by `fillBackground` on its Background row.

A forecast opens in `#2962ff` at 2px, its source a tenth see-through and its verdicts green and red, and its Style page sets the line and each of its ten colors on a row of its own. A sector shades the two halves of its slice in `color1` and `color2`, blue and purple at a fifth, inside a grey 2px border, with `fillBackground` switching them, and has no Coordinates page. A bars pattern paints its bars as their high-low or open-close ranges or as a line through one price of each (`mode`: `hl`, `oc`, `close`, `open`, `high`, `low`, `hl2`, `BARS_PATTERN_MODES`), a pattern saved painting candle sticks reading as its high-low ranges, and has no Coordinates page. A ghost feed's page writes its candles' average span in the symbol's minimum ticks, its borders and wick on switches of their own, and its transparency on a track. `FILLABLE` leaves out the sector, whose backgrounds are its own.

A long and a short position open with grey 1px lines, white 12px words and a leverage of 10000, so the risk sets their quantity, and have no Coordinates page: their Inputs page carries the account size, the lot size, the risk as a percent or an amount in the symbol's currency, the entry price, the leverage, the target and the stop each as ticks from the entry and as a price, and how the quantity is written (`qtyPrecision`); their Style page the lines, the stop and target colors, the words' color and size, Price labels, the stats the tags read (`stats`, thirteen to choose from, all but the two levels' P&L at first), Compact stats mode and Always show stats (`alwaysShowStats`): the tags read while the position is hovered or selected, and at rest only while their stats always show. A drawing layer's `setCurrency` tells its drawings the currency the symbol is quoted in, and the widget passes it from the symbol's `currencyCode`.

`THEME_ROLES` gains five roles, each in both built-in palettes: `control.outline` outlines a dialog's Cancel at rest (`#2e2e2e` light, `#ffffff` dark), `control.onInk` inks a mark cut from the emphasis fill, such as a chosen thickness, line style or line end (`#ffffff` light, `#000000` dark), `control.selectEdgeHover` is a list button's edge under the pointer (`#a8a8a8` light, `#808080` dark), and `motion.durationGlide` (`100ms`) and `motion.easingInOut` (`ease-in-out`) time the drawing settings dialog's tab bar sliding to the page shown, the opacity knob gliding on `motion.durationGlide` too.

The drawing settings dialog opens in place over an undimmed chart: it appears and leaves at once, and a press beside it still closes it. Its lists hang under the controls that open them, past the dialog's edge where they need to, the Template menu sized to its words with the button ringed while it is open; a select's chevron turns on the standard timing. Apply defaults puts the tool's own look and setup on the drawing at once and keeps its words, and "Save as…" reads with an ellipsis.

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
