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

  // The Risk page (the manager's own English, mirrored so every language can carry it).
  'account.risk': 'Risk',
  'account.riskDailyLoss': 'Daily loss limit',
  'account.riskDailyLossBlurb': 'Close out and lock trading for the day when the session is down this much',
  'account.riskDailyProfit': 'Daily profit target',
  'account.riskDailyProfitBlurb': 'Close out and lock trading for the day when the session is up this much',
  'account.riskWeeklyLoss': 'Weekly loss limit',
  'account.riskWeeklyLossBlurb': 'Close out and lock trading for the week when the week is down this much',
  'account.riskWeeklyProfit': 'Weekly profit target',
  'account.riskWeeklyProfitBlurb': 'Close out and lock trading for the week when the week is up this much',
  'account.riskEodClose': 'End-of-day close',
  'account.riskEodCloseBlurb': 'Close every position and lock trading this many minutes before the session close',
  'account.riskMinutes': 'min',
  'account.riskLockSettings': 'Prevent changes while trading is locked',
  'account.riskLockSettingsBlurb': 'When a control locks trading, also lock these settings until the period resets',
  'account.riskLockSettingsDisabled': 'Enable a control above to use this',
  'account.riskSave': 'Save',
  'account.riskSaving': 'Saving…',
  'account.riskSaved': 'Saved',
  'account.riskUnlock': 'Unlock',
  'account.riskUnlockRequested': 'Unlock requested',
  'account.riskTradingLocked': 'Trading locked',
  'account.riskLockUntil': 'until {when}',
  'account.riskClosingPositions': 'closing positions…',
  'account.riskSettingsLocked': 'Settings are locked until the period resets',
  'account.riskMonitoringPaused': 'Monitoring paused: the P&L feed is unavailable. Existing locks stay in force.',
  'account.riskNeedsValue': '{control} needs a positive value',
  'account.riskUnavailable': 'Risk controls are unavailable right now',
} as const
