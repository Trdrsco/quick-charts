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
} as const
