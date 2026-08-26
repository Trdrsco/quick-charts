import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Positions',
  'account.orders': 'Ordres',
  'account.positionsCount': 'Positions ({count})',
  'account.ordersCount': 'Ordres ({count})',
  'account.noPositions': 'Aucune position ouverte',
  'account.noOrders': 'Aucun ordre actif',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Clôturer',
  'account.closeTitle': 'Clôturer {instrument} au marché',
  'account.reverse': 'Inverser',
  'account.reverseTitle': 'Inverser {instrument}',
  'account.reversed': { one: '{instrument} inversé ({count} ordre annulé)', many: '{instrument} inversé ({count} ordres annulés)', other: '{instrument} inversé ({count} ordres annulés)' },
  'account.buy': 'Achat {qty} {type}',
  'account.sell': 'Vente {qty} {type}',
  'account.cancel': 'Annuler',
  'account.cancelTitle': 'Annuler {id}',
}
