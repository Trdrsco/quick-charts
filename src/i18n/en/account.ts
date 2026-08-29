// The account panel below the chart: positions, orders, and their actions. Instruments, prices,
// sizes, order ids, an order's wire type and its wire status are the venue's own values and render
// as they arrive.
export const account = {
  // Tabs. The count rides in the label the moment the page holds rows.
  'account.positions': 'Positions',
  'account.orders': 'Orders',
  'account.positionsCount': 'Positions ({count})',
  'account.ordersCount': 'Orders ({count})',

  // Empty states.
  'account.noPositions': 'No open positions',
  'account.noOrders': 'No working orders',

  // A position row: its direction and size, then the controls.
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Close',
  'account.closeTitle': 'Close {instrument} at market',
  'account.reverse': 'Reverse',
  'account.reverseTitle': 'Reverse {instrument}',
  'account.reversed': {
    one: 'Reversed {instrument} ({count} order cancelled)',
    other: 'Reversed {instrument} ({count} orders cancelled)',
  },

  // A working-order row: its side and size, then the cancel.
  'account.buy': 'Buy {qty} {type}',
  'account.sell': 'Sell {qty} {type}',
  'account.cancel': 'Cancel',
  'account.cancelTitle': 'Cancel {id}',

  // The account manager's further pages (the widget composes @trdrs/account-manager below the
  // chart and passes this catalog through; a key it misses reads the manager's built-in English,
  // so these values match that table word for word).
  'account.history': 'Order history',
  'account.accounts': 'Accounts',
  'account.noHistory': 'No orders in this bucket yet',
  'account.noAccounts': 'No connected accounts',
  'account.historyUnavailable': 'Order history is unavailable right now',
  'account.loading': 'Loading…',
  'account.loadMore': 'Load more',
  'account.bucketAll': 'All',
  'account.bucketFilled': 'Filled',
  'account.bucketCancelled': 'Cancelled',
  'account.bucketRejected': 'Rejected',
  'account.sideBuy': 'Buy',
  'account.sideSell': 'Sell',

  // Column headers.
  'account.colSymbol': 'Symbol',
  'account.colSide': 'Side',
  'account.colType': 'Type',
  'account.colQuantity': 'Quantity',
  'account.colAvgPrice': 'Avg price',
  'account.colFillQty': 'Fill qty',
  'account.colAvgFillPrice': 'Avg fill price',
  'account.colLimitPrice': 'Limit price',
  'account.colStopPrice': 'Stop price',
  'account.colUnrealizedPnl': 'Unrealized PnL',
  'account.colStatus': 'Status',
  'account.colTime': 'Time',
  'account.colActions': 'Actions',
  'account.colAccount': 'Account',
  'account.colName': 'Name',
  'account.colBroker': 'Broker',

  // The money summary strip.
  'account.sumBalance': 'Account balance',
  'account.sumEquity': 'Equity',
  'account.sumRealized': 'Realized PnL',
  'account.sumUnrealized': 'Unrealized PnL',
  'account.sumAvailable': 'Available funds',
} as const
