import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Positionen',
  'account.orders': 'Orders',
  'account.positionsCount': 'Positionen ({count})',
  'account.ordersCount': 'Orders ({count})',
  'account.noPositions': 'Keine offenen Positionen',
  'account.noOrders': 'Keine aktiven Orders',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Schließen',
  'account.closeTitle': '{instrument} zum Marktpreis schließen',
  'account.reverse': 'Umkehren',
  'account.reverseTitle': '{instrument} umkehren',
  'account.reversed': { one: '{instrument} umgekehrt ({count} Order storniert)', other: '{instrument} umgekehrt ({count} Orders storniert)' },
  'account.buy': 'Kauf {qty} {type}',
  'account.sell': 'Verkauf {qty} {type}',
  'account.cancel': 'Stornieren',
  'account.cancelTitle': '{id} stornieren',
}
