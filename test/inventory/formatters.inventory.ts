// The symbology and quote-display inventory: every chart and Watchlist tick, precision, axis,
// legend, drawing-label, quote, and image formatter, with broker, ticket, and account value
// formatters inventoried separately so heuristics are removed without conflating display symbology
// with execution or ledger values.
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
//              and the ticket.
//   ledger     an account value: money, P&L, balances, account columns. Target: Account Manager
//              column value kinds.
//   quote      a quote-board value: Last, Chg, Chg%, Volume. The free chart exposes no quote API;
//              the first-party source is chart-engine's engineQuoteSource, and the Trading
//              Platform quote hub fans one subscription into the Watchlist port.
//
// This is data. formatters.inventory.test.ts proves every file and symbol still exists, so the
// inventory cannot rot silently, and whoever moves a site edits this row in the same commit.
// Paths are root-relative.

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
    file: 'packages/chart/src/widget/compare.ts',
    symbols: ['pct.toFixed(2)', 'formatterFor(entry.symbol)?.format(last)'],
    kind: 'symbology',
    surface: 'legend compare rows: percent change (its own two decimals) or the compared symbol\'s last value in that symbol\'s own resolved price format',
  },
  {
    file: 'packages/chart/src/widget/indicators.ts',
    symbols: ['latestPlotValue', 'value.toFixed(built.precision)', 'formatter.format(value)'],
    kind: 'symbology',
    surface: 'legend indicator rows: a manifest precision when the study declares one, else the symbol formatter',
  },
  {
    file: 'packages/chart/src/widget/chart.ts',
    symbols: ["const priceFormat = { type: 'custom' as const, formatter: (price: number) => symbolFormatter.format(price), minMove: minMoveOf(format) }"],
    kind: 'symbology',
    surface: 'the main series price scale, crosshair label and last-price label, through the symbol formatter',
  },
  {
    file: 'packages/chart/src/widget/menu.ts',
    symbols: ['const priceText = deps.formatter().format(price)'],
    kind: 'symbology',
    surface: 'the level menu rows, through the symbol formatter, at a level snapped to the symbol grid',
  },
  {
    file: 'packages/chart/src/widget/chartCommands.ts',
    symbols: ['writeText(deps.formatter().format(level))'],
    kind: 'symbology',
    surface: 'the copy-price command, through the symbol formatter, at the level the menu was raised at',
  },
  {
    file: 'packages/chart/src/widget/chart.ts',
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
    symbols: ['this.formatPrice', 'moneyText', 'qtyText'],
    kind: 'symbology',
    surface: 'long and short position entry, stop, and target level labels through the price port; position forecast pills',
    finding: "the position's P&L and amounts at target and stop are money and write through the drawings package's declared two-decimal money stand-in (core/money.ts) until a money formatter port exists; the quantity keeps its own text.",
  },
  {
    file: 'packages/chart-drawings/src/tools/measurement.ts',
    symbols: ['this.formatPrice', 'volumeText'],
    kind: 'symbology',
    surface: 'price range, date range, and date-and-price range readouts; compact volume',
    finding: 'volume compacts by magnitude with no volume precision from the symbol.',
  },
  // ── symbology: the app around the chart ───────────────────────────────────────────────────────────
  {
    file: 'apps/web/src/integrations/quickcharts/priceFormat.ts',
    symbols: ['priceFormatterOf', 'UNRESOLVED_PRICE_FORMAT', 'minMoveOf'],
    kind: 'symbology',
    surface: "the app's one price formatter: createPriceFormatter over the symbol's resolved format in the interface language, with the declared unresolved policy",
  },
  {
    file: 'packages/chart/src/widget/image.ts',
    symbols: ['imageHeaderRuns', 'imageTileRuns'],
    kind: 'symbology',
    surface: 'captured image text: the header and per-chart runs (symbol, timeframe, host note); price text arrives pre-formatted from the chart',
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
    file: 'packages/chart/src/widget/chart.ts',
    symbols: ['formatter: () => ({ format: (price) => symbolFormatter.format(price)'],
    kind: 'symbology',
    surface: 'the extension formatter: the one symbol formatter, read live through the extension seam',
  },
  {
    file: 'packages/order-ticket/src/Panel.tsx',
    symbols: ['priceStr', 'capDisplayDecimals', 'decimalsOfTick', 'fmtQty'],
    kind: 'execution',
    surface: 'ticket price and quantity inputs',
    finding: 'when the tick is unknown, precision is read off the live quote; the read cap applies to an input.',
  },
  { file: 'packages/order-ticket/src/submitCore.ts', symbols: ['snapPrice'], kind: 'execution', surface: 'submit-time entry snap' },
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
    symbols: ['formatter: WatchlistValueFormatter', 'formatter.last(', 'formatter.change(', 'formatter.changePct(', 'formatter.volume('],
    kind: 'quote',
    surface: 'the React Watchlist rows: Last, Chg, Chg%, Volume',
  },
  {
    file: 'apps/web/src/integrations/quickcharts/watchlistFormatter.ts',
    symbols: ['cachedSymbolMeta(symbol).format', 'createWatchlistValueFormatter', 'formatVolume', 'UNRESOLVED_PRICE_FORMAT'],
    kind: 'quote',
    surface: "this app's implementation of the Watchlist value-formatter port, handed to the widget by the composition root",
    finding:
      "Last and Chg run through one createPriceFormatter over the symbol's resolved price format; Chg% and Volume keep their own value kinds. A symbol whose format has not landed takes one declared cents policy.",
  },
]
