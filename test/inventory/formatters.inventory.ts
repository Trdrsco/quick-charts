// The symbology and quote-display inventory (public-chart-library-boundary-plan.md PCL-1:
// "Inventory every old chart and Watchlist tick, precision, axis, legend, drawing-label, quote,
// and image formatter before the first move. Inventory broker, ticket, and account value
// formatters separately so the sprint removes heuristics without conflating display symbology
// with execution or ledger values."; clean-seams-entry-packets.md section 4.10).
//
// Every price-bearing formatter site in the repository today, with the file it lives in, the
// symbols that carry it, and the VALUE KIND the site formats:
//
//   symbology  a chart display value: axis, legend, crosshair, drawing label, mark, study plot,
//              image text, and the facts they format from. Target: one package-owned
//              createPriceFormatter over SymbolInfo, and the Watchlist structural port for Last
//              and Chg.
//   execution  an executable price or quantity: broker tick math, ticket inputs, trade lines,
//              execution marks. Target: @trdrs/broker instrument facts, consumed by chart-trading
//              and the ticket (Plan 5).
//   ledger     an account value: money, P&L, balances, account columns. Target: Account Manager
//              column value kinds (Plan 6).
//   quote      a quote-board value: Last, Chg, Chg%, Volume. The free chart exposes no quote API;
//              the first-party source is chart-engine's engineQuoteSource, and the Trading
//              Platform quote hub (Plan 8) fans one subscription into the Watchlist port.
//
// This is data. formatters.inventory.test.ts proves every file and symbol still exists, so the
// inventory cannot rot silently, and the stream that moves a site edits this row in the same
// commit. Paths are root-relative.

export type ValueKind = 'symbology' | 'execution' | 'ledger' | 'quote'

export interface FormatterSite {
  file: string
  /** Text that must appear in the file: the formatter's name, or the expression when it is inline. */
  symbols: readonly string[]
  kind: ValueKind
  /** The surface the site formats for. */
  surface: string
  /** The behavior the sprint replaces, when the site carries one. */
  finding?: string
}

export const FORMATTER_SITES: readonly FormatterSite[] = [
  // ── symbology: the package ──────────────────────────────────────────────────────────────────
  {
    file: 'packages/chart/src/symbology.ts',
    symbols: ['format: PriceFormat', 'volumePrecision: number'],
    kind: 'symbology',
    surface: 'SymbolInfo, the facts every chart price is formatted from: pricescale, minmov, minmove2, fractional, variableTickSize, and the volume precision',
  },
  {
    file: 'packages/chart/src/datafeed.ts',
    symbols: ["import type { SymbolInfo } from './symbology'"],
    kind: 'symbology',
    surface: 'ChartDatafeed.resolve answers with the symbology contract; the datafeed carries no price facts of its own',
  },
  {
    file: 'packages/chart/src/udfDatafeed.ts',
    symbols: ['udfSymbolInfo(raw, symbol)'],
    kind: 'symbology',
    surface: 'UDF resolve: /symbols mapped through udfSymbolInfo, the five price-format facts intact',
  },
  {
    file: 'packages/chart/src/priceFormatter.ts',
    symbols: ['createPriceFormatter'],
    kind: 'symbology',
    surface: 'the one package formatter: axis, crosshair, last-price label, legend chips, level menu, drawing labels, study scales, the extension seam, and a host\'s own surfaces',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['compareChips', 'pct.toFixed(2)', 'compareFormatterFor(e.symbol)?.format(last)'],
    kind: 'symbology',
    surface: 'legend compare chips: percent change (its own two decimals) or the compared symbol\'s last value in that symbol\'s own resolved price format',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['latestPlotValue', 'value.toFixed(built.precision)', 'symbolFormatter.format(value)'],
    kind: 'symbology',
    surface: 'legend indicator chips: a manifest precision when the study declares one, else the symbol formatter',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ["priceFormat: { type: 'custom', formatter: (price: number) => symbolFormatter.format(price), minMove: minMoveOf(format) }"],
    kind: 'symbology',
    surface: 'the candle series price scale, crosshair label and last-price label, through the symbol formatter',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['const priceText = symbolFormatter.format(price)', 'writeText(symbolFormatter.format(at))'],
    kind: 'symbology',
    surface: 'the level menu rows and copy-price, through the symbol formatter, at a level snapped to the symbol grid',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ["priceFormat: { type: 'volume' }"],
    kind: 'symbology',
    surface: 'the volume histogram price scale',
  },
  {
    file: 'packages/chart/src/indicatorRenderer.ts',
    symbols: ['manifest:', 'symbolFormat.formatter'],
    kind: 'symbology',
    surface: 'indicator series price format on the pane scale: a manifest precision when declared, else the symbol formatter',
  },
  {
    file: 'packages/chart/src/contextMenu.ts',
    symbols: ['priceText'],
    kind: 'symbology',
    surface: 'context-menu rows quoting the pointed-at price (copy price); the widget hands the symbol formatter\'s text',
  },
  // ── symbology: the drawings ─────────────────────────────────────────────────────────────────
  {
    file: 'packages/chart-drawings/src/core/drawing.ts',
    symbols: ['setPriceFormatter', 'protected formatPrice'],
    kind: 'symbology',
    surface: 'every drawing label, pill and readout, through the host-injected price-format port',
  },
  {
    file: 'packages/chart-drawings/src/render/canvas.ts',
    symbols: ['paintLabel'],
    kind: 'symbology',
    surface: 'the label painter; price text arrives already formatted by the port',
  },
  { file: 'packages/chart-drawings/src/tools/lines.ts', symbols: ['this.formatPrice'], kind: 'symbology', surface: 'info line, horizontal line and ray axis labels, trend angle' },
  { file: 'packages/chart-drawings/src/tools/fibonacci.ts', symbols: ['this.formatPrice'], kind: 'symbology', surface: 'fib level prices' },
  { file: 'packages/chart-drawings/src/tools/annotations.ts', symbols: ['this.formatPrice'], kind: 'symbology', surface: 'price label and price note' },
  {
    file: 'packages/chart-drawings/src/tools/forecasting.ts',
    symbols: ['this.formatPrice', 'qtyText'],
    kind: 'symbology',
    surface: 'long and short position entry, stop, and target labels; position forecast pills',
    finding: 'the P&L amount of an analytical position is written through the price port; the quantity keeps its own text.',
  },
  {
    file: 'packages/chart-drawings/src/tools/measurement.ts',
    symbols: ['this.formatPrice', 'volumeText'],
    kind: 'symbology',
    surface: 'price range, date range, and date-and-price range readouts; compact volume',
    finding: 'volume compacts by magnitude with no volume precision from the symbol.',
  },
  // ── symbology: the app chart body ───────────────────────────────────────────────────────────
  {
    file: 'apps/web/src/lib/priceFormat.ts',
    symbols: ['priceFormatterOf', 'UNRESOLVED_PRICE_FORMAT', 'minMoveOf'],
    kind: 'symbology',
    surface: "the app's one price formatter: createPriceFormatter over the symbol's resolved format in the interface language, with the declared unresolved policy",
  },
  {
    file: 'apps/web/src/chart/chartShared.ts',
    symbols: ['paneSeriesPriceFormat', 'panePriceAt'],
    kind: 'symbology',
    surface: 'the price axis, the crosshair and last-price labels (series priceFormat over the symbol formatter), and the level a pointer snaps to on the symbol display grid',
  },
  {
    file: 'apps/web/src/chart/ChartPane.tsx',
    symbols: ['formatter.format(ohlc.c)', 'formatter.format(change)', 'changePct.toFixed(2)', 'value.toFixed(itemDp)', 'value.toFixed(cmpDp)'],
    kind: 'symbology',
    surface: 'the OHLC legend and the change legend through the symbol formatter; the percent-change legend, indicator legend values, compare legend values',
  },
  {
    file: 'apps/web/src/chart/ChartPanel.tsx',
    symbols: ['priceFormatterOf(cachedSymbolMeta(tradeMenu.instrument).format, info.tag).format(tradeMenu.price)'],
    kind: 'symbology',
    surface: "the level menu's price text, in the raising pane's own symbol format",
  },
  {
    file: 'apps/web/src/chart/barCountdown.ts',
    symbols: ['priceFormatter().format'],
    kind: 'symbology',
    surface: 'the bar countdown price bubble, through the series price formatter',
  },
  {
    file: 'apps/web/src/chart/exportImage.ts',
    symbols: ['exportHeaderRuns', 'exportTileRuns'],
    kind: 'symbology',
    surface: 'exported image text: header and tile runs (symbol, timeframe, provider); price text arrives pre-formatted from the pane',
  },
  // ── execution ───────────────────────────────────────────────────────────────────────────────
  {
    file: 'packages/broker/src/index.ts',
    symbols: ['snapPrice', 'decimalsOfTick', 'displayDecimals', 'capDisplayDecimals', 'fmtPrice'],
    kind: 'execution',
    surface: 'the seam\'s tick math and read-precision helpers',
    finding: 'displayDecimals and capDisplayDecimals cap read precision at six significant figures by price magnitude; the chart borrows decimalsOfTick for display.',
  },
  {
    file: 'packages/chart-trading/src/tradeLines.ts',
    symbols: ['displayDecimals', 'fmtPrice'],
    kind: 'execution',
    surface: 'order and position line price labels, drag toasts',
  },
  {
    file: 'packages/chart-trading/src/tradeLineParts.ts',
    symbols: ['formatPnlMoney', 'formatPnlTicks', 'formatPnlPercent'],
    kind: 'execution',
    surface: 'trade-line P&L in money, ticks, and percent',
  },
  { file: 'packages/chart-trading/src/gesturePlan.ts', symbols: ['fmtPrice'], kind: 'execution', surface: 'broker gesture toasts' },
  {
    file: 'packages/chart-trading/src/executionMarks.ts',
    symbols: ['fmtQty', 'decimalsFor'],
    kind: 'execution',
    surface: 'execution mark cards: quantity and average fill price',
  },
  {
    file: 'packages/chart-trading/src/extension.ts',
    symbols: ['ctx.formatter().precision()'],
    kind: 'execution',
    surface: 'the precision handed to execution marks, read from the chart formatter through the extension seam',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['const extFormatter = (): ChartPriceFormatter => ({ format: (price) => symbolFormatter.format(price)'],
    kind: 'symbology',
    surface: 'the extension formatter: the one symbol formatter, read live through the extension seam',
  },
  {
    file: 'apps/web/src/chart/useChartTradeLayer.ts',
    symbols: ['priceFormatterOf(priceFormat', '.precision()'],
    kind: 'execution',
    surface: 'the execution marks take the symbol display precision for their price labels; the lines snap to the broker tick',
    finding: 'a display precision feeding an executable surface; chart-trading takes broker facts instead.',
  },
  {
    file: 'packages/order-ticket/src/Panel.tsx',
    symbols: ['priceStr', 'capDisplayDecimals', 'decimalsOfTick', 'fmtQty'],
    kind: 'execution',
    surface: 'ticket price and quantity inputs',
    finding: 'when the tick is unknown, precision is read off the live quote; the read cap applies to an input.',
  },
  { file: 'packages/order-ticket/src/submitCore.ts', symbols: ['snapPrice'], kind: 'execution', surface: 'submit-time entry snap' },
  {
    file: 'apps/web/src/chart/QuantityCalculator.tsx',
    symbols: ['toFixed(decimals)'],
    kind: 'execution',
    surface: 'stepped quantity cleanup',
  },
  // ── ledger ──────────────────────────────────────────────────────────────────────────────────
  {
    file: 'packages/account-manager/src/formatters.ts',
    symbols: ['formatValue'],
    kind: 'ledger',
    surface: "the manager's standard formatters: price and qty pass through at the backend's precision; money is two decimals with the currency",
  },
  {
    file: 'packages/account-manager/src/columns.ts',
    symbols: ["formatter: 'price'", "formatter: 'profit'"],
    kind: 'ledger',
    surface: 'column value kinds on POSITION_COLUMNS and HISTORY_COLUMNS',
  },
  {
    file: 'apps/web/src/widgets/accountManagerColumns.ts',
    symbols: ['ORDER_TABLE', 'POSITION_TABLE'],
    kind: 'ledger',
    surface: 'the dock table structure; the host lastPrice column is spliced in here and formatted in the widget',
  },
  {
    file: 'apps/web/src/widgets/AccountManager.tsx',
    symbols: ['fmtMoney', "style: 'percent'"],
    kind: 'ledger',
    surface: 'account stats and balances in the dock',
  },
  {
    file: 'apps/web/src/lib/format.ts',
    symbols: ['fmtMoney', 'fmtNum'],
    kind: 'ledger',
    surface: 'the app money and number helpers over the catalog number formatter',
  },
  {
    file: 'apps/web/src/marketplace/ScriptCheckoutModal.tsx',
    symbols: ['fmtPrice'],
    kind: 'ledger',
    surface: 'a marketplace price in cents with its currency',
    finding: 'named fmtPrice, formats money; not a market price and not in any chart plan.',
  },
  // ── quote ───────────────────────────────────────────────────────────────────────────────────
  {
    file: 'packages/chart-engine/src/quotes.ts',
    symbols: ['QuoteSnapshot', 'subscribeTopOfBook', 'BOARD_POLL_MS'],
    kind: 'quote',
    surface: 'the first-party quote source: the board data the Watchlist and the dock format, and the top-of-book the ticket reads (data, not a formatter)',
  },
  {
    file: 'packages/watchlist/src/widget.ts',
    symbols: ['options.formatter.last(', 'options.formatter.change(', 'options.formatter.changePct('],
    kind: 'quote',
    surface: 'the framework-free Watchlist rows: Last, Chg, Chg%',
  },
  {
    file: 'apps/web/src/widgets/WatchlistWidget.tsx',
    symbols: ['useWatchlistValueFormatter', 'formatter.last(', 'formatter.change(', 'formatter.changePct(', 'formatter.volume('],
    kind: 'quote',
    surface: 'the React Watchlist rows: Last, Chg, Chg%, Volume',
  },
  {
    file: 'apps/web/src/widgets/watchlistFormat.ts',
    symbols: ['cachedSymbolMeta(symbol).format', 'createWatchlistValueFormatter', 'formatVolume', 'UNRESOLVED_PRICE_FORMAT'],
    kind: 'quote',
    surface: "this app's implementation of the Watchlist value-formatter port",
    finding:
      "Last and Chg run through one createPriceFormatter over the symbol's resolved price format; Chg% and Volume keep their own value kinds. A symbol whose format has not landed takes one declared cents policy.",
  },
]
