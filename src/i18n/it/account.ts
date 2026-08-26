import type { Translation } from '@trdrs/i18n'
import type { account as source } from '../en/account'

export const account: Translation<typeof source> = {
  'account.positions': 'Posizioni',
  'account.orders': 'Ordini',
  'account.positionsCount': 'Posizioni ({count})',
  'account.ordersCount': 'Ordini ({count})',
  'account.noPositions': 'Nessuna posizione aperta',
  'account.noOrders': 'Nessun ordine attivo',
  'account.long': 'Long {qty}',
  'account.short': 'Short {qty}',
  'account.close': 'Chiudi',
  'account.closeTitle': 'Chiudi {instrument} a mercato',
  'account.reverse': 'Inverti',
  'account.reverseTitle': 'Inverti {instrument}',
  'account.reversed': { one: '{instrument} invertito ({count} ordine annullato)', many: '{instrument} invertito ({count} ordini annullati)', other: '{instrument} invertito ({count} ordini annullati)' },
  'account.buy': 'Compra {qty} {type}',
  'account.sell': 'Vendi {qty} {type}',
  'account.cancel': 'Annulla',
  'account.cancelTitle': 'Annulla {id}',
}
