import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posicions',
  'account.orders': 'Ordres',
  'account.positionsCount': 'Posicions ({count})',
  'account.ordersCount': 'Ordres ({count})',
  'account.noPositions': 'Cap posició oberta',
  'account.noOrders': 'Cap ordre activa',
  'account.long': 'Llarg {qty}',
  'account.short': 'Curt {qty}',
  'account.close': 'Tanca',
  'account.closeTitle': 'Tanca {instrument} a mercat',
  'account.reverse': 'Inverteix',
  'account.reverseTitle': 'Inverteix {instrument}',
  'account.reversed': { one: '{instrument} invertit ({count} ordre cancel·lada)', many: '{instrument} invertit ({count} ordres cancel·lades)', other: '{instrument} invertit ({count} ordres cancel·lades)' },
  'account.buy': 'Compra {qty} {type}',
  'account.sell': 'Venda {qty} {type}',
  'account.cancel': 'Cancel·la',
  'account.cancelTitle': 'Cancel·la {id}',
}
