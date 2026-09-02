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
//   quote      a quote-board value: Last, Chg, Chg%, Volume. Target: the Trading Platform quote
//              hub feeding the Watchlist port; the free chart exposes no quote API.
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
    file: 'packages/chart/src/datafeed.ts',
    symbols: ['tick: number | null', 'pricePrecision: number | null'],
    kind: 'symbology',
    surface: 'SymbolInfo, the facts every chart price is formatted from',
    finding: 'a floating tick plus a precision; null means "derive from magnitude". SymbolInfo price-format fields replace both.',
  },
  {
    file: 'packages/chart/src/udfDatafeed.ts',
    symbols: ['decimalsOfPriceScale'],
    kind: 'symbology',
    surface: 'UDF resolve, pricescale and minmov collapsed to tick and precision',
    finding: 'pricescale, minmov, minmove2, fractional, and variable_tick_size must map without collapsing to a float.',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['compareChips', 'pct.toFixed(2)', 'last.toFixed(2)'],
    kind: 'symbology',
    surface: 'legend compare chips: percent change or last value',
    finding: 'fixed two decimals for a compared symbol regardless of its price format.',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['latestPlotValue', 'built.precision ?? 2'],
    kind: 'symbology',
    surface: 'legend indicator chips: the latest plot value',
    finding: 'a manifest precision, else two decimals.',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ["priceFormat: { type: 'volume' }"],
    kind: 'symbology',
    surface: 'the volume histogram price scale',
  },
  {
    file: 'packages/chart/src/indicatorRenderer.ts',
    symbols: ['priceFormat', 'precision'],
    kind: 'symbology',
    surface: 'indicator series price format on the pane scale',
    finding: 'a manifest precision becomes a decimal minMove; price-format symbology is not consulted.',
  },
  {
    file: 'packages/chart/src/contextMenu.ts',
    symbols: ['priceText'],
    kind: 'symbology',
    surface: 'context-menu rows quoting the pointed-at price (copy price, alert, order rows)',
    finding: 'the host formats and hands a string; the package has no formatter of its own here.',
  },
  // ── symbology: the drawings ─────────────────────────────────────────────────────────────────
  {
    file: 'packages/chart-drawings/src/render/canvas.ts',
    symbols: ['formatPrice'],
    kind: 'symbology',
    surface: 'every drawing label',
    finding: 'a magnitude heuristic: 2 decimals at or above 100, 3 at or above 1, else 5. No symbol facts reach the canvas.',
  },
  { file: 'packages/chart-drawings/src/tools/lines.ts', symbols: ['formatPrice'], kind: 'symbology', surface: 'info line, horizontal line and ray axis labels, trend angle' },
  { file: 'packages/chart-drawings/src/tools/fibonacci.ts', symbols: ['formatPrice'], kind: 'symbology', surface: 'fib level prices' },
  { file: 'packages/chart-drawings/src/tools/annotations.ts', symbols: ['formatPrice'], kind: 'symbology', surface: 'price label and price note' },
  {
    file: 'packages/chart-drawings/src/tools/forecasting.ts',
    symbols: ['formatPrice', 'qtyText'],
    kind: 'symbology',
    surface: 'long and short position entry, stop, and target labels; position forecast pills',
    finding: 'the P&L amount and the quantity of an analytical position are formatted with the price formatter.',
  },
  {
    file: 'packages/chart-drawings/src/tools/measurement.ts',
    symbols: ['formatPrice', 'volumeText'],
    kind: 'symbology',
    surface: 'price range, date range, and date-and-price range readouts; compact volume',
    finding: 'volume compacts by magnitude with no volume precision from the symbol.',
  },
  // ── symbology: the app chart body ───────────────────────────────────────────────────────────
  {
    file: 'apps/web/src/chart/chartShared.ts',
    symbols: ['chartDpOf', 'fmtChartPrice', 'axisPriceFormat', 'panePriceAt'],
    kind: 'symbology',
    surface: 'the price axis, the crosshair and last-price labels (series priceFormat), the OHLC legend, and the context-menu price',
    finding: 'decimals come from the broker seam (decimalsOfTick, capped at 8, 2 when unknown); prices at or above 1000 drop every decimal.',
  },
  {
    file: 'apps/web/src/chart/ChartPane.tsx',
    symbols: ['fmtChartPrice', 'change.toFixed(dp)', 'changePct.toFixed(2)', 'value.toFixed(itemDp)', 'value.toFixed(cmpDp)'],
    kind: 'symbology',
    surface: 'the OHLC legend, the change and percent-change legend, indicator legend values, compare legend values',
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
    file: 'packages/chart/src/tradeLines.ts',
    symbols: ['displayDecimals', 'fmtPrice'],
    kind: 'execution',
    surface: 'order and position line price labels, drag toasts',
  },
  {
    file: 'packages/chart/src/tradeLineParts.ts',
    symbols: ['formatPnlMoney', 'formatPnlTicks', 'formatPnlPercent'],
    kind: 'execution',
    surface: 'trade-line P&L in money, ticks, and percent',
  },
  { file: 'packages/chart/src/gesturePlan.ts', symbols: ['fmtPrice'], kind: 'execution', surface: 'broker gesture toasts' },
  {
    file: 'packages/chart/src/executionMarks.ts',
    symbols: ['fmtQty', 'decimalsFor'],
    kind: 'execution',
    surface: 'execution mark cards: quantity and average fill price',
  },
  {
    file: 'packages/chart/src/host.ts',
    symbols: ['decimalsOfTick(symbolTick)'],
    kind: 'execution',
    surface: 'the precision handed to execution marks, live and replay',
  },
  {
    file: 'apps/web/src/chart/useChartTradeLayer.ts',
    symbols: ['chartDpOf'],
    kind: 'execution',
    surface: 'the trade layer takes the chart display precision for its lines',
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
    file: 'packages/chart/src/datafeed.ts',
    symbols: ['QuoteSnapshot', 'getQuotes', 'subscribeQuotes'],
    kind: 'quote',
    surface: 'the quote board data the two Watchlist renderers format (data, not a formatter)',
    finding: 'quote surfaces on the free datafeed; they move to the Trading Platform quote hub.',
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
    symbols: ['priceFormatOfTick', 'createWatchlistValueFormatter', 'formatVolume', 'UNRESOLVED_PRICE_FORMAT'],
    kind: 'quote',
    surface: "this app's implementation of the Watchlist value-formatter port",
    finding:
      'Last and Chg run through one createPriceFormatter over the symbol tick converted exactly to price-format facts; Chg% and Volume keep their own value kinds. A symbol with no resolved tick takes one declared cents policy.',
  },
]
