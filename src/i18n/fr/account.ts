import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Positions',
  'account.orders': 'Orders',
  'account.positionsCount': 'Positions ({count})',
  'account.ordersCount': 'Orders ({count})',
  'account.noPositions': 'No open positions',
  'account.noOrders': 'No working orders',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Close',
  'account.closeTitle': 'Close {instrument} at market',
  'account.reverse': 'Reverse',
  'account.reverseTitle': 'Reverse {instrument}',
  'account.reversed': { one: 'Reversed {instrument} ({count} order cancelled)', many: 'Reversed {instrument} ({count} orders cancelled)', other: 'Reversed {instrument} ({count} orders cancelled)' },
  'account.buy': 'Buy {qty} {type}',
  'account.sell': 'Sell {qty} {type}',
  'account.cancel': 'Cancel',
  'account.cancelTitle': 'Cancel {id}',
}
